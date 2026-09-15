import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Share2,
  Play,
  Loader2,
  AlertCircle,
  Download,
  Search,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Server,
  Network,
  Square,
  Archive,
} from 'lucide-react';
import {
  discoverLldp,
  exportLldpExcel,
  getCredentialProfiles,
  previewScanTargets,
  submitLldpSubnetScan,
  getLldpSubnetScan,
  cancelLldpSubnetScan,
  exportLldpScanZip,
} from '../services/api';
import './LldpDiscoveryPage.css';

const NEIGHBOR_COLUMNS = ['Local Device', 'Local IP', 'Local Port', 'Remote Device', 'Remote Port', 'Remote IP'];
const SCAN_STATUSES = [
  { key: 'SUCCESS', label: 'Success', tone: 'ok' },
  { key: 'NO_LLDP', label: 'No LLDP', tone: 'warn' },
  { key: 'DUPLICATE', label: 'Duplicate', tone: 'muted' },
  { key: 'AUTH_FAILED', label: 'Auth Failed', tone: 'fail' },
  { key: 'FAILED', label: 'Failed', tone: 'fail' },
  { key: 'UNREACHABLE', label: 'Unreachable', tone: 'muted' },
];
const POLL_MS = 1500;

const splitList = (text) => text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);

const errMsg = (err, fallback) => {
  const detail = err.response?.data?.detail;
  if (detail) return typeof detail === 'string' ? detail : JSON.stringify(detail);
  return err.message || fallback;
};

export default function LldpDiscoveryPage({ fleet = [], nornirWorkers = 10 }) {
  const [mode, setMode] = useState('seed'); // 'seed' | 'subnet'
  const [recursive, setRecursive] = useState(false);
  const [maxDepth, setMaxDepth] = useState(3);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [report, setReport] = useState(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('neighbors'); // 'neighbors' | 'summary'
  const [expandedHost, setExpandedHost] = useState(null);

  // Subnet scan
  const [targetsText, setTargetsText] = useState('');
  const [excludeText, setExcludeText] = useState('');
  const [preview, setPreview] = useState(null);
  const [profiles, setProfiles] = useState(null);
  const [credChoice, setCredChoice] = useState('default'); // 'default' | 'manual' | <profile id>
  const [manualUser, setManualUser] = useState('');
  const [manualPass, setManualPass] = useState('');
  const [scanWorkers, setScanWorkers] = useState(200);
  const [tcpTimeout, setTcpTimeout] = useState(1.5);
  const [scanJobId, setScanJobId] = useState(null);
  const [scanStatus, setScanStatus] = useState(null);
  const [hideUnreachable, setHideUnreachable] = useState(true);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const pollRef = useRef(null);

  const validFleet = fleet.filter((d) => d.host && d.host.trim() !== '');

  useEffect(() => () => clearTimeout(pollRef.current), []);

  useEffect(() => {
    if (mode !== 'subnet' || profiles !== null) return;
    getCredentialProfiles()
      .then((data) => setProfiles(Array.isArray(data) ? data : []))
      .catch(() => setProfiles([]));
  }, [mode, profiles]);

  useEffect(() => {
    if (mode !== 'subnet') return undefined;
    const targets = splitList(targetsText);
    if (targets.length === 0) {
      setPreview(null);
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        setPreview(await previewScanTargets(targets, splitList(excludeText)));
      } catch (err) {
        setPreview({ error: errMsg(err, 'Invalid target') });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [mode, targetsText, excludeText]);

  const resetRun = () => {
    setRunning(true);
    setErrorMessage('');
    setReport(null);
    setExpandedHost(null);
  };

  const handleRun = async () => {
    if (validFleet.length === 0) {
      setErrorMessage('Please add at least one device in the Target Device fleet list above.');
      return;
    }
    resetRun();
    try {
      const devices = validFleet.map((d) => ({
        name: d.name || '',
        host: d.host.trim(),
        port: parseInt(d.port, 10) || 22,
        device_type: d.device_type || 'huawei',
        username: d.username || '',
        password: d.password || '',
        secret: d.secret || '',
        connection_mode: 'network',
        profile_id: d.profile_id || null,
        credential_pool: d.credential_pool || null,
        fallback_profile_ids: d.fallback_profile_ids || null,
      }));
      const data = await discoverLldp(devices, { recursive, maxDepth, numWorkers: nornirWorkers });
      setReport(data);
    } catch (err) {
      setErrorMessage(errMsg(err, 'LLDP discovery failed'));
    } finally {
      setRunning(false);
    }
  };

  const pollScan = async (jobId) => {
    try {
      const status = await getLldpSubnetScan(jobId, { logLines: 80 });
      setScanStatus(status);
      if (status.is_completed) {
        const full = await getLldpSubnetScan(jobId, { includeReport: true, logLines: 80 });
        setScanStatus(full);
        setReport(full.report);
        setRunning(false);
        return;
      }
    } catch (err) {
      if (err.response?.status === 404) {
        setErrorMessage('Scan job no longer exists on the backend (was it restarted?). Logs on disk are kept.');
        setRunning(false);
        return;
      }
      setErrorMessage(errMsg(err, 'Failed to refresh scan status, retrying...'));
    }
    pollRef.current = setTimeout(() => pollScan(jobId), POLL_MS);
  };

  const handleScan = async () => {
    const targets = splitList(targetsText);
    if (targets.length === 0) {
      setErrorMessage('Enter at least one subnet, range or IP to scan.');
      return;
    }
    resetRun();
    setScanStatus(null);
    try {
      const payload = {
        targets,
        exclude: splitList(excludeText),
        device_type: 'huawei',
        recursive,
        max_depth: maxDepth,
        num_workers: nornirWorkers,
        scan_workers: scanWorkers,
        tcp_timeout: tcpTimeout,
      };
      if (credChoice === 'manual') {
        payload.username = manualUser;
        payload.password = manualPass;
      } else if (credChoice !== 'default') {
        payload.profile_id = credChoice;
      }
      const job = await submitLldpSubnetScan(payload);
      setScanJobId(job.job_id);
      pollScan(job.job_id);
    } catch (err) {
      setErrorMessage(errMsg(err, 'Failed to start subnet scan'));
      setRunning(false);
    }
  };

  const handleCancel = async () => {
    if (!scanJobId) return;
    try {
      await cancelLldpSubnetScan(scanJobId);
    } catch (err) {
      setErrorMessage(errMsg(err, 'Cancel failed'));
    }
  };

  const handleDownloadLogs = async () => {
    if (!scanJobId) return;
    setDownloadingZip(true);
    try {
      await exportLldpScanZip(scanJobId);
    } catch (err) {
      setErrorMessage(errMsg(err, 'Log download failed'));
    } finally {
      setDownloadingZip(false);
    }
  };

  const handleExport = async () => {
    if (!report) return;
    setExporting(true);
    try {
      await exportLldpExcel(report.neighbors, report.hosts);
    } catch (err) {
      setErrorMessage(errMsg(err, 'Excel export failed'));
    } finally {
      setExporting(false);
    }
  };

  const isScanReport = Boolean(report?.stats);

  const filteredNeighbors = useMemo(() => {
    if (!report) return [];
    const q = search.trim().toLowerCase();
    if (!q) return report.neighbors;
    return report.neighbors.filter((n) =>
      NEIGHBOR_COLUMNS.some((c) => String(n[c] || '').toLowerCase().includes(q))
    );
  }, [report, search]);

  const filteredHosts = useMemo(() => {
    if (!report) return [];
    const q = search.trim().toLowerCase();
    return report.hosts.filter(
      (h) =>
        !(isScanReport && hideUnreachable && h.status === 'UNREACHABLE') &&
        (!q || [h.hostname, h.ip, h.status, h.detail].some((v) => String(v || '').toLowerCase().includes(q)))
    );
  }, [report, search, isScanReport, hideUnreachable]);

  const scanRunning = mode === 'subnet' && running;

  return (
    <div className="lldp-page">
      {/* Control Card */}
      <div className="lldp-card">
        <div className="lldp-card-header">
          <h2 className="lldp-card-title">
            <Share2 className="lldp-card-icon" />
            LLDP Neighbor Discovery
          </h2>
          {mode === 'seed' ? (
            <span className="lldp-badge">
              <Server className="h-3 w-3" />
              {validFleet.length} Seed Device{validFleet.length === 1 ? '' : 's'}
            </span>
          ) : (
            <span className="lldp-badge">
              <Network className="h-3 w-3" />
              {preview?.count != null ? `${preview.count} IP${preview.count === 1 ? '' : 's'}` : 'No targets'}
            </span>
          )}
        </div>

        <div className="lldp-tabs lldp-mode-tabs">
          <button className={mode === 'seed' ? 'active' : ''} onClick={() => setMode('seed')} disabled={running}>
            Seed Devices
          </button>
          <button className={mode === 'subnet' ? 'active' : ''} onClick={() => setMode('subnet')} disabled={running}>
            Subnet Scan
          </button>
        </div>

        {mode === 'seed' ? (
          <p className="lldp-desc">
            SSH to each device, read Local Device from <code>display current-configuration | include sysname</code>,
            run <code>display lldp neighbor brief</code>, then loop{' '}
            <code>display lldp neighbor interface &lt;port&gt;</code> for every port with a neighbor to collect
            Local Device / Local Port / Remote Device / Remote Port.
          </p>
        ) : (
          <>
            <p className="lldp-desc">
              Expand subnets / ranges into IPs, check TCP port 22 first, then collect LLDP only on hosts that answer.
              Runs as a background job; every host is logged to disk as soon as it finishes.
            </p>

            <div className="lldp-form-grid">
              <label className="lldp-field">
                <span>Targets (CIDR, range or IP; one per line or comma separated)</span>
                <textarea
                  rows={4}
                  placeholder={'10.10.0.0/24\n10.20.5.10-10.20.5.50\n10.30.1.1-30'}
                  value={targetsText}
                  onChange={(e) => setTargetsText(e.target.value)}
                  disabled={running}
                />
                {preview && (
                  <span className={`lldp-hint ${preview.error ? 'error' : ''}`}>
                    {preview.error
                      ? preview.error
                      : `${preview.count} IP(s) to scan${preview.count ? `: ${preview.first} → ${preview.last}` : ''}`}
                  </span>
                )}
              </label>
              <label className="lldp-field">
                <span>Exclude (optional)</span>
                <textarea
                  rows={4}
                  placeholder={'10.10.0.1\n10.10.0.200-254'}
                  value={excludeText}
                  onChange={(e) => setExcludeText(e.target.value)}
                  disabled={running}
                />
                <span className="lldp-hint">Also honored by recursive discovery.</span>
              </label>
            </div>

            <div className="lldp-options">
              <label className="lldp-field inline">
                <span>Credentials</span>
                <select value={credChoice} onChange={(e) => setCredChoice(e.target.value)} disabled={running}>
                  <option value="default">Default profile</option>
                  {(profiles || []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.is_default ? ' (default)' : ''}
                    </option>
                  ))}
                  <option value="manual">Manual username / password</option>
                </select>
              </label>
              {credChoice === 'manual' && (
                <>
                  <label className="lldp-field inline">
                    <span>Username</span>
                    <input value={manualUser} onChange={(e) => setManualUser(e.target.value)} disabled={running} />
                  </label>
                  <label className="lldp-field inline">
                    <span>Password</span>
                    <input
                      type="password"
                      value={manualPass}
                      onChange={(e) => setManualPass(e.target.value)}
                      disabled={running}
                    />
                  </label>
                </>
              )}
              <label className="lldp-depth">
                <span>TCP workers</span>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={scanWorkers}
                  onChange={(e) => setScanWorkers(Math.max(1, Math.min(1000, parseInt(e.target.value, 10) || 1)))}
                  disabled={running}
                />
              </label>
              <label className="lldp-depth">
                <span>TCP timeout (s)</span>
                <input
                  type="number"
                  min={0.2}
                  max={10}
                  step={0.1}
                  value={tcpTimeout}
                  onChange={(e) => setTcpTimeout(Math.max(0.2, Math.min(10, parseFloat(e.target.value) || 1)))}
                  disabled={running}
                />
              </label>
            </div>
            <p className="lldp-hint warn">
              Every reachable IP tries each credential in the chosen profile. Many failed logins on a TACACS/RADIUS
              account can trigger a lockout, so put the correct credential first.
            </p>
          </>
        )}

        <div className="lldp-options">
          <label className="lldp-toggle">
            <input
              type="checkbox"
              checked={recursive}
              onChange={(e) => setRecursive(e.target.checked)}
              disabled={running}
            />
            <span>
              {mode === 'seed'
                ? 'Recursive discovery (SSH to neighbors via LLDP management IP)'
                : 'Recursive: also SSH to LLDP management IPs outside the targets'}
            </span>
          </label>
          {recursive && (
            <label className="lldp-depth">
              <span>Max depth</span>
              <input
                type="number"
                min={1}
                max={10}
                value={maxDepth}
                onChange={(e) => setMaxDepth(Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)))}
                disabled={running}
              />
            </label>
          )}
          <span className="lldp-workers">SSH workers: {nornirWorkers}</span>
        </div>

        <div className="lldp-actions">
          {mode === 'seed' ? (
            <button className="lldp-btn-primary" onClick={handleRun} disabled={running || validFleet.length === 0}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {running ? 'Collecting LLDP...' : 'Start Discovery'}
            </button>
          ) : (
            <>
              <button
                className="lldp-btn-primary"
                onClick={handleScan}
                disabled={running || !preview?.count || Boolean(preview?.error)}
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {running ? 'Scanning...' : 'Start Subnet Scan'}
              </button>
              {scanRunning && (
                <button className="lldp-btn-danger" onClick={handleCancel}>
                  <Square className="h-4 w-4" />
                  Cancel
                </button>
              )}
              <button className="lldp-btn-secondary" onClick={handleDownloadLogs} disabled={!scanJobId || downloadingZip}>
                {downloadingZip ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                Download Logs (ZIP)
              </button>
            </>
          )}
          <button className="lldp-btn-secondary" onClick={handleExport} disabled={!report || exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export Excel
          </button>
        </div>

        {errorMessage && (
          <div className="lldp-error">
            <AlertCircle className="h-4 w-4" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Subnet scan progress + live log */}
      {mode === 'subnet' && scanStatus && (
        <div className="lldp-card">
          <div className="lldp-card-header">
            <h2 className="lldp-card-title">
              {running ? <Loader2 className="lldp-card-icon animate-spin" /> : <Network className="lldp-card-icon" />}
              {scanStatus.phase}
            </h2>
            <span className="lldp-workers">
              {scanStatus.completed_devices} / {scanStatus.total_devices} IP(s) · {scanStatus.elapsed_seconds}s
            </span>
          </div>
          <div className="lldp-progress">
            <div className="lldp-progress-bar" style={{ width: `${scanStatus.progress_percent}%` }} />
          </div>
          <div className="lldp-chips">
            {SCAN_STATUSES.map((s) => (
              <span key={s.key} className={`lldp-chip ${s.tone}`}>
                {s.label}: <strong>{scanStatus.stats?.[s.key] ?? 0}</strong>
              </span>
            ))}
          </div>
          <div className="lldp-hint">
            Log directory: <code>{scanStatus.log_dir}</code>
          </div>
          <pre className="lldp-raw lldp-log">{(scanStatus.log_tail || []).join('\n') || 'Waiting for log...'}</pre>
        </div>
      )}

      {/* Report */}
      {report && (
        <div className="lldp-card">
          <div className="lldp-stats">
            <div className="lldp-stat">
              <span className="lldp-stat-label">{isScanReport ? 'Scanned IPs' : 'Total Hosts'}</span>
              <span className="lldp-stat-value">{report.total_hosts}</span>
            </div>
            <div className="lldp-stat success">
              <span className="lldp-stat-label">{isScanReport ? 'Logged In' : 'Success Hosts'}</span>
              <span className="lldp-stat-value">{report.success_hosts}</span>
            </div>
            <div className="lldp-stat failed">
              <span className="lldp-stat-label">Failed Hosts</span>
              <span className="lldp-stat-value">{report.failed_hosts}</span>
            </div>
            {isScanReport && (
              <div className="lldp-stat">
                <span className="lldp-stat-label">Unreachable</span>
                <span className="lldp-stat-value">{report.unreachable_hosts}</span>
              </div>
            )}
            <div className="lldp-stat">
              <span className="lldp-stat-label">Total LLDP Rows</span>
              <span className="lldp-stat-value">{report.total_lldp_rows}</span>
            </div>
            <div className="lldp-stat">
              <span className="lldp-stat-label">Time</span>
              <span className="lldp-stat-value">{report.overall_time_seconds}s</span>
            </div>
          </div>

          <div className="lldp-toolbar">
            <div className="lldp-tabs">
              <button className={view === 'neighbors' ? 'active' : ''} onClick={() => setView('neighbors')}>
                LLDP Inventory ({report.neighbors.length})
              </button>
              <button className={view === 'summary' ? 'active' : ''} onClick={() => setView('summary')}>
                Execution Summary ({filteredHosts.length})
              </button>
            </div>
            <div className="lldp-toolbar-right">
              {isScanReport && view === 'summary' && (
                <label className="lldp-toggle">
                  <input
                    type="checkbox"
                    checked={hideUnreachable}
                    onChange={(e) => setHideUnreachable(e.target.checked)}
                  />
                  <span>Hide unreachable</span>
                </label>
              )}
              <div className="lldp-search">
                <Search className="h-4 w-4" />
                <input placeholder="Filter..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
          </div>

          {view === 'neighbors' && (
            <div className="lldp-table-wrap">
              <table className="lldp-table">
                <thead>
                  <tr>
                    <th>#</th>
                    {NEIGHBOR_COLUMNS.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredNeighbors.length === 0 && (
                    <tr>
                      <td colSpan={NEIGHBOR_COLUMNS.length + 1} className="lldp-empty">
                        No LLDP neighbors
                      </td>
                    </tr>
                  )}
                  {filteredNeighbors.map((n, i) => (
                    <tr key={`${n['Local IP']}-${n['Local Port']}-${i}`}>
                      <td className="muted">{i + 1}</td>
                      {NEIGHBOR_COLUMNS.map((c) => (
                        <td key={c} className={c.includes('Port') || c.includes('IP') ? 'mono' : ''}>
                          {n[c] || '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {view === 'summary' && (
            <div className="lldp-table-wrap">
              <table className="lldp-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Hostname</th>
                    <th>IP Address</th>
                    <th>Depth</th>
                    <th>Status</th>
                    <th>Neighbors Found</th>
                    <th>Time (s)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHosts.length === 0 && (
                    <tr>
                      <td colSpan={7} className="lldp-empty">
                        No hosts
                      </td>
                    </tr>
                  )}
                  {filteredHosts.map((h) => {
                    const key = `${h.ip}-${h.depth}`;
                    const open = expandedHost === key;
                    return (
                      <React.Fragment key={key}>
                        <tr className="clickable" onClick={() => setExpandedHost(open ? null : key)}>
                          <td>{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                          <td>{h.hostname}</td>
                          <td className="mono">{h.ip}</td>
                          <td>{h.depth}</td>
                          <td>
                            <span className={`lldp-status ${h.success ? 'ok' : 'fail'}`}>
                              {h.success ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                              {h.status}
                            </span>
                            {h.detail && <div className="lldp-detail">{h.detail}</div>}
                          </td>
                          <td>{h.neighbors_found}</td>
                          <td>{h.execution_time_seconds}</td>
                        </tr>
                        {open && (
                          <tr>
                            <td colSpan={7} className="lldp-raw-cell">
                              <pre className="lldp-raw">
                                {h.credential ? `Credential: ${h.credential}\n` : ''}
                                {h.log || h.detail || ''}
                                {'\n\n' + '='.repeat(50) + '\nRAW TERMINAL OUTPUT:\n' + '='.repeat(50) + '\n'}
                                {h.raw_output || 'No Data'}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
