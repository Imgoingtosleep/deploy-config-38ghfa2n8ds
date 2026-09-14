import React, { useMemo, useState } from 'react';
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
} from 'lucide-react';
import { discoverLldp, exportLldpExcel } from '../services/api';
import './LldpDiscoveryPage.css';

const NEIGHBOR_COLUMNS = ['Local Device', 'Local IP', 'Local Port', 'Remote Device', 'Remote Port', 'Remote IP'];

export default function LldpDiscoveryPage({ fleet = [], nornirWorkers = 10 }) {
  const [recursive, setRecursive] = useState(false);
  const [maxDepth, setMaxDepth] = useState(3);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [report, setReport] = useState(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('neighbors'); // 'neighbors' | 'summary'
  const [expandedHost, setExpandedHost] = useState(null);

  const validFleet = fleet.filter((d) => d.host && d.host.trim() !== '');

  const handleRun = async () => {
    if (validFleet.length === 0) {
      setErrorMessage('Please add at least one device in the Target Device fleet list above.');
      return;
    }
    setRunning(true);
    setErrorMessage('');
    setReport(null);
    setExpandedHost(null);
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
      setErrorMessage(err.response?.data?.detail || err.message || 'LLDP discovery failed');
    } finally {
      setRunning(false);
    }
  };

  const handleExport = async () => {
    if (!report) return;
    setExporting(true);
    try {
      await exportLldpExcel(report.neighbors, report.hosts);
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || err.message || 'Excel export failed');
    } finally {
      setExporting(false);
    }
  };

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
    if (!q) return report.hosts;
    return report.hosts.filter((h) =>
      [h.hostname, h.ip, h.status].some((v) => String(v || '').toLowerCase().includes(q))
    );
  }, [report, search]);

  return (
    <div className="lldp-page">
      {/* Control Card */}
      <div className="lldp-card">
        <div className="lldp-card-header">
          <h2 className="lldp-card-title">
            <Share2 className="lldp-card-icon" />
            LLDP Neighbor Discovery
          </h2>
          <span className="lldp-badge">
            <Server className="h-3 w-3" />
            {validFleet.length} Seed Device{validFleet.length === 1 ? '' : 's'}
          </span>
        </div>

        <p className="lldp-desc">
          SSH to each device, read Local Device from <code>display current-configuration | include sysname</code>,
          run <code>display lldp neighbor brief</code>, then loop{' '}
          <code>display lldp neighbor interface &lt;port&gt;</code> for every port with a neighbor to collect
          Local Device / Local Port / Remote Device / Remote Port.
        </p>

        <div className="lldp-options">
          <label className="lldp-toggle">
            <input type="checkbox" checked={recursive} onChange={(e) => setRecursive(e.target.checked)} />
            <span>Recursive discovery (SSH to neighbors via LLDP management IP)</span>
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
              />
            </label>
          )}
          <span className="lldp-workers">Workers: {nornirWorkers}</span>
        </div>

        <div className="lldp-actions">
          <button className="lldp-btn-primary" onClick={handleRun} disabled={running || validFleet.length === 0}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? 'Collecting LLDP...' : 'Start Discovery'}
          </button>
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

      {/* Report */}
      {report && (
        <div className="lldp-card">
          <div className="lldp-stats">
            <div className="lldp-stat">
              <span className="lldp-stat-label">Total Hosts</span>
              <span className="lldp-stat-value">{report.total_hosts}</span>
            </div>
            <div className="lldp-stat success">
              <span className="lldp-stat-label">Success Hosts</span>
              <span className="lldp-stat-value">{report.success_hosts}</span>
            </div>
            <div className="lldp-stat failed">
              <span className="lldp-stat-label">Failed Hosts</span>
              <span className="lldp-stat-value">{report.failed_hosts}</span>
            </div>
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
                Execution Summary ({report.hosts.length})
              </button>
            </div>
            <div className="lldp-search">
              <Search className="h-4 w-4" />
              <input placeholder="Filter..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
                          </td>
                          <td>{h.neighbors_found}</td>
                          <td>{h.execution_time_seconds}</td>
                        </tr>
                        {open && (
                          <tr>
                            <td colSpan={7} className="lldp-raw-cell">
                              <pre className="lldp-raw">
                                {h.log}
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
