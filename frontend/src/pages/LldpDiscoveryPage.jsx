import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Upload,
  Terminal,
  Settings,
  Plus,
  Trash2,
  Edit2,
  X,
  Check,
  FilePlus2,
  FlaskConical,
  RefreshCw,
  FileSpreadsheet,
} from 'lucide-react';
import {
  discoverLldp,
  exportLldpExcel,
  getCredentialProfiles,
  getCommandProfiles,
  createCommandProfile,
  updateCommandProfile,
  deleteCommandProfile,
  previewScanTargets,
  submitLldpSubnetScan,
  getLldpSubnetScan,
  cancelLldpSubnetScan,
  exportLldpScanZip,
  importLldpTopology,
  reparseLldp,
  downloadLldpTableTemplate,
} from '../services/api';
import LldpTopology from '../components/LldpTopology';
import ModelIconLegend from '../components/ModelIconLegend';
import ModelRulesModal from '../components/ModelRulesModal';
import { neighborsFromDoc, hostsFromDoc } from '../components/topologyModel';
import TcpWorkersControl from '../components/TcpWorkersControl';
import './LldpDiscoveryPage.css';

const NEIGHBOR_COLUMNS = [
  'Local Device',
  'Local Model',
  'Local IP',
  'Local Port',
  'Remote Device',
  'Remote Model',
  'Remote Port',
  'Remote IP',
];
const SCAN_STATUSES = [
  { key: 'SUCCESS', label: 'Success', tone: 'ok' },
  { key: 'NO_LLDP', label: 'No LLDP', tone: 'warn' },
  { key: 'DUPLICATE', label: 'Duplicate', tone: 'muted' },
  { key: 'AUTH_FAILED', label: 'Auth Failed', tone: 'fail' },
  { key: 'FAILED', label: 'Failed', tone: 'fail' },
  { key: 'UNREACHABLE', label: 'Unreachable', tone: 'muted' },
];
const POLL_MS = 1500;
// Editable command set of a command profile: [field, label, placeholder]
const COMMAND_FIELDS = [
  ['pager_disable', 'Disable paging', 'screen-length 0 temporary'],
  ['sysname', 'Sysname / hostname', 'display current-configuration | include sysname'],
  ['version', 'Version (used for the model)', 'display version'],
  ['lldp_brief', 'LLDP neighbor list', 'display lldp neighbor brief'],
  ['lldp_detail', 'LLDP detail per port — {intf} = local port', 'display lldp neighbor interface {intf}'],
  ['lldp_full', 'LLDP detail, all ports', 'display lldp neighbor'],
];
const blankCommandProfile = () => ({
  id: null,
  name: '',
  description: '',
  parser: 'huawei',
  enabled: true,
  commands: Object.fromEntries(COMMAND_FIELDS.map(([f]) => [f, ''])),
});

const splitList = (text) => text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);

const errMsg = (err, fallback) => {
  const detail = err.response?.data?.detail;
  if (detail) return typeof detail === 'string' ? detail : JSON.stringify(detail);
  return err.message || fallback;
};

export default function LldpDiscoveryPage({ fleet = [], nornirWorkers = 10, onUpdateWorkers }) {
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

  // Subnet scan & TCP pre-scan controls
  const [targetsText, setTargetsText] = useState('');
  const [excludeText, setExcludeText] = useState('');
  const [preview, setPreview] = useState(null);
  // SSH credentials come from the Credential Profile selected above the fleet list
  const [profiles, setProfiles] = useState(null);

  // Command profiles: which CLI commands to run (independent of the SSH login)
  const [cmdProfiles, setCmdProfiles] = useState(null);
  const [cmdPool, setCmdPool] = useState(['', '']);
  const [showCmdModal, setShowCmdModal] = useState(false);
  const [editingCmd, setEditingCmd] = useState(null);
  const [cmdError, setCmdError] = useState('');
  const [cmdSaving, setCmdSaving] = useState(false);

  // Model rules: custom regex for the model / device type, and re-reading a result with them
  const [showRulesModal, setShowRulesModal] = useState(false); // false | true | { teach: sample }
  const [reparsing, setReparsing] = useState(false);
  const [reparseMsg, setReparseMsg] = useState('');

  // TCP workers & timeout state (persisted)
  const [enableTcpScan, setEnableTcpScan] = useState(() => {
    const saved = localStorage.getItem('netauto_lldp_tcp_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [enableTcpScanSeed, setEnableTcpScanSeed] = useState(() => {
    const saved = localStorage.getItem('netauto_lldp_tcp_seed_enabled');
    return saved === 'true';
  });
  const [scanWorkers, setScanWorkers] = useState(() => {
    const saved = localStorage.getItem('netauto_lldp_tcp_workers');
    return saved ? Math.max(1, Math.min(1000, parseInt(saved, 10))) : 200;
  });
  const [tcpTimeout, setTcpTimeout] = useState(() => {
    const saved = localStorage.getItem('netauto_lldp_tcp_timeout');
    return saved ? Math.max(0.2, Math.min(10, parseFloat(saved))) : 1.5;
  });

  const handleToggleTcp = (val) => {
    setEnableTcpScan(val);
    localStorage.setItem('netauto_lldp_tcp_enabled', String(val));
  };

  const handleToggleTcpSeed = (val) => {
    setEnableTcpScanSeed(val);
    localStorage.setItem('netauto_lldp_tcp_seed_enabled', String(val));
  };

  const handleUpdateScanWorkers = (val) => {
    const clamped = Math.max(1, Math.min(1000, parseInt(val, 10) || 200));
    setScanWorkers(clamped);
    localStorage.setItem('netauto_lldp_tcp_workers', String(clamped));
  };

  const handleUpdateTcpTimeout = (val) => {
    const clamped = Math.round(Math.max(0.2, Math.min(10, parseFloat(val) || 1.5)) * 10) / 10;
    setTcpTimeout(clamped);
    localStorage.setItem('netauto_lldp_tcp_timeout', String(clamped));
  };
  const [scanJobId, setScanJobId] = useState(null);
  const [scanStatus, setScanStatus] = useState(null);
  const [hideUnreachable, setHideUnreachable] = useState(true);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [importing, setImporting] = useState(false);
  const pollRef = useRef(null);
  const importInputRef = useRef(null);
  const tableInputRef = useRef(null);

  const validFleet = fleet.filter((d) => d.host && d.host.trim() !== '');

  useEffect(() => () => clearTimeout(pollRef.current), []);

  useEffect(() => {
    getCredentialProfiles()
      .then((data) => setProfiles(Array.isArray(data) ? data : []))
      .catch(() => setProfiles([]));
  }, []);

  useEffect(() => {
    getCommandProfiles()
      .then((data) => setCmdProfiles(Array.isArray(data) ? data : []))
      .catch(() => setCmdProfiles([]));
  }, []);

  // Seed the command order once from the saved priorities (Huawei, then Cisco)
  useEffect(() => {
    if (!cmdProfiles || cmdProfiles.length === 0) return;
    setCmdPool((prev) => {
      if (prev.some(Boolean)) return prev;
      const enabled = cmdProfiles.filter((p) => p.enabled !== false);
      return [enabled[0]?.id || '', enabled[1]?.id || ''];
    });
  }, [cmdProfiles]);

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

  // Credentials for the subnet scan follow the fleet, which the SSH Credential
  // Profile selector above applies to every row
  const credentialSource = validFleet.find((d) => d.profile_id) || fleet.find((d) => d.profile_id) || null;
  const credentialProfile = (profiles || []).find((p) => p.id === credentialSource?.profile_id) || null;

  const cmdProfileById = (id) => (cmdProfiles || []).find((p) => p.id === id);
  const cmdPoolIds = [...new Set(cmdPool.filter(Boolean))];
  const cmdPoolProfiles = cmdPoolIds.map(cmdProfileById).filter(Boolean);
  const setCmdPrio = (index, value) =>
    setCmdPool((prev) => prev.map((id, i) => (i === index ? value : id)));
  // One priority slot per command profile at most: more would only repeat a profile
  const maxCmdPrio = Math.max(2, (cmdProfiles || []).length);
  const addCmdPrio = () => setCmdPool((prev) => (prev.length >= maxCmdPrio ? prev : [...prev, '']));
  const removeCmdPrio = (index) =>
    setCmdPool((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== index)));

  const loadCmdProfiles = async () => {
    const data = await getCommandProfiles();
    const list = Array.isArray(data) ? data : [];
    setCmdProfiles(list);
    return list;
  };

  const handleSaveCmdProfile = async (e) => {
    e.preventDefault();
    if (!editingCmd?.name?.trim()) {
      setCmdError('Profile name is required.');
      return;
    }
    setCmdSaving(true);
    setCmdError('');
    try {
      const payload = {
        name: editingCmd.name.trim(),
        description: editingCmd.description || '',
        parser: editingCmd.parser || 'huawei',
        enabled: editingCmd.enabled !== false,
        commands: editingCmd.commands,
      };
      const saved = editingCmd.id
        ? await updateCommandProfile(editingCmd.id, payload)
        : await createCommandProfile(payload);
      await loadCmdProfiles();
      // A brand new profile is not in the order yet: put it in the first free slot
      setCmdPool((prev) => (prev.includes(saved.id) ? prev : prev.map((id, i) => (!id && !prev.slice(0, i).some((x) => !x) ? saved.id : id))));
      setEditingCmd(null);
    } catch (err) {
      setCmdError(errMsg(err, 'Failed to save command profile'));
    } finally {
      setCmdSaving(false);
    }
  };

  const handleDeleteCmdProfile = async (prof) => {
    if (!window.confirm(`Delete command profile "${prof.name}"?`)) return;
    setCmdError('');
    try {
      await deleteCommandProfile(prof.id);
      await loadCmdProfiles();
      setCmdPool((prev) => prev.map((id) => (id === prof.id ? '' : id)));
    } catch (err) {
      setCmdError(errMsg(err, 'Failed to delete command profile'));
    }
  };

  const resetRun = () => {
    setRunning(true);
    setErrorMessage('');
    setReparseMsg('');
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
      const data = await discoverLldp(devices, {
        recursive,
        maxDepth,
        numWorkers: nornirWorkers,
        enableTcpScan: enableTcpScanSeed,
        scanWorkers,
        tcpTimeout,
        commandProfileIds: cmdPoolIds,
      });
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
        enable_tcp_scan: enableTcpScan,
        scan_workers: scanWorkers,
        tcp_timeout: tcpTimeout,
      };
      if (cmdPoolIds.length) payload.command_profile_ids = cmdPoolIds;
      if (credentialSource) {
        // Same SSH credentials as the fleet: whatever the Credential Profile
        // selector above applied. Without one the backend uses its default profile.
        payload.profile_id = credentialSource.profile_id;
        if (credentialSource.fallback_profile_ids?.length) {
          payload.fallback_profile_ids = credentialSource.fallback_profile_ids;
        }
        payload.device_type = credentialProfile?.device_type || credentialSource.device_type || 'autodetect';
        payload.port = parseInt(credentialSource.port, 10) || credentialProfile?.port || 22;
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

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    setErrorMessage('');
    setReparseMsg('');
    try {
      const data = await importLldpTopology(file);
      setReport(data);
      setExpandedHost(null);
      setSearch('');
      setView('topology');
    } catch (err) {
      setErrorMessage(errMsg(err, 'Topology import failed'));
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      await downloadLldpTableTemplate();
    } catch (err) {
      setErrorMessage(errMsg(err, 'Template download failed'));
    }
  };

  // Start an empty diagram in the topology editor
  const handleNewDiagram = () => {
    if (report && !window.confirm('Replace the current result with a new empty diagram? Export it first if you need it.')) return;
    setReport({
      imported: true,
      file_name: 'New diagram',
      format: 'editor',
      total_hosts: 0,
      success_hosts: 0,
      failed_hosts: 0,
      total_lldp_rows: 0,
      overall_time_seconds: 0,
      neighbors: [],
      hosts: [],
      topology: { nodes: [], links: [] },
      annotations: { flows: [], zones: [], notes: [] },
    });
    setExpandedHost(null);
    setSearch('');
    setView('topology');
    setErrorMessage('');
    setReparseMsg('');
  };

  // Edits from the topology editor: devices / links rebuild the LLDP rows so the table and Excel follow
  const handleTopologyChange = useCallback(({ topology, annotations, structural }) => {
    setReport((prev) => {
      if (!prev) return prev;
      const next = { ...prev, topology, annotations };
      if (!structural) return next;
      const neighbors = neighborsFromDoc(topology);
      next.edited = true;
      next.neighbors = neighbors;
      next.total_lldp_rows = neighbors.length;
      if (prev.imported) {
        next.hosts = hostsFromDoc(topology, neighbors);
        next.total_hosts = next.hosts.length;
      }
      return next;
    });
  }, []);

  // Collected results only: an imported / drawn diagram has no version output to re-read
  const canReparse = Boolean(report && !report.imported && report.hosts?.length);

  // Returns the summary line (also shown under the buttons), or null when nothing was done
  const handleReparse = async () => {
    if (!canReparse) return null;
    if (report.edited && !window.confirm('Re-parse rebuilds the topology from the LLDP rows; edits made in the topology editor are replaced. Continue?')) return null;
    setReparsing(true);
    setErrorMessage('');
    setReparseMsg('');
    try {
      const data = await reparseLldp(report.neighbors, report.hosts);
      // Keep the device positions the diagram already had
      const placed = Object.fromEntries((report.topology?.nodes || []).filter((n) => n.x != null).map((n) => [n.id, n]));
      const nodes = data.topology.nodes.map((n) => (placed[n.id] ? { ...n, x: placed[n.id].x, y: placed[n.id].y } : n));
      setReport((prev) => ({
        ...prev,
        neighbors: data.neighbors,
        hosts: data.hosts,
        topology: { ...data.topology, nodes },
        edited: false,
      }));
      const msg = `Re-parsed with the current model rules: ${data.changed_hosts} host(s) and ${data.changed_rows} LLDP row(s) changed.`;
      setReparseMsg(msg);
      return msg;
    } catch (err) {
      setErrorMessage(errMsg(err, 'Re-parse failed'));
      throw err;
    } finally {
      setReparsing(false);
    }
  };

  // Texts from the current result to teach models on; devices without a model first
  const ruleSamples = useMemo(() => {
    if (!report || report.imported) return [];
    const out = [];
    (report.hosts || []).forEach((h) => {
      if (h.version_output) out.push({ device: h.hostname, kind: 'version', text: h.version_output, model: h.model || '' });
    });
    const seen = new Set();
    (report.neighbors || []).forEach((n) => {
      const text = n['Remote Description'] || '';
      const key = `${n['Remote Device']}\n${text}`;
      if (!text || seen.has(key)) return;
      seen.add(key);
      out.push({ device: n['Remote Device'], kind: 'LLDP description', text, model: n['Remote Model'] || '' });
    });
    return out.sort((a, b) => Number(Boolean(a.model)) - Number(Boolean(b.model)));
  }, [report]);

  // Legend row -> Model Rules: an existing rule is edited in the list, a model
  // without one opens straight into "Teach a new model" on that device's text
  const handleTeachModel = useCallback(
    (row) => {
      if (row?.source === 'rule') {
        setShowRulesModal(true);
        return;
      }
      const devices = new Set(row?.devices || []);
      const sample =
        ruleSamples.find((s) => devices.has(s.device)) ||
        (row?.model ? ruleSamples.find((s) => s.model === row.model) : null) ||
        ruleSamples.find((s) => !s.model);
      setShowRulesModal(sample ? { teach: sample } : true);
    },
    [ruleSamples]
  );

  // Devices the topology will show as "Unknown model"
  const unknownDevices = useMemo(
    () => (report && !report.imported ? (report.topology?.nodes || []).filter((n) => !n.model).map((n) => n.hostname) : []),
    [report]
  );

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
          <>
            <p className="lldp-desc">
              SSH to each device, read Local Device from <code>display current-configuration | include sysname</code>,
              run <code>display lldp neighbor brief</code>, then loop{' '}
              <code>display lldp neighbor interface &lt;port&gt;</code> for every port with a neighbor to collect
              Local Device / Local Port / Remote Device / Remote Port.
            </p>

            <div className="lldp-options" style={{ marginTop: '0.5rem', marginBottom: '0.75rem' }}>
              <label className="lldp-toggle" title="Perform fast TCP port 22 check before SSH connection to skip unreachable devices rapidly">
                <input
                  type="checkbox"
                  checked={enableTcpScanSeed}
                  onChange={(e) => handleToggleTcpSeed(e.target.checked)}
                  disabled={running}
                />
                <span>Fast TCP Pre-Check (probe port 22 before SSH to skip dead devices in ~{tcpTimeout}s)</span>
              </label>
            </div>

            {enableTcpScanSeed && (
              <TcpWorkersControl
                enabled={enableTcpScanSeed}
                onToggle={handleToggleTcpSeed}
                workers={scanWorkers}
                onWorkersChange={handleUpdateScanWorkers}
                timeout={tcpTimeout}
                onTimeoutChange={handleUpdateTcpTimeout}
                disabled={running}
                title="Seed Devices TCP Pre-Check & Concurrency"
                compact={true}
              />
            )}
          </>
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

            {/* Dedicated TCP Workers & Pre-Scan Controller */}
            <TcpWorkersControl
              enabled={enableTcpScan}
              onToggle={handleToggleTcp}
              workers={scanWorkers}
              onWorkersChange={handleUpdateScanWorkers}
              timeout={tcpTimeout}
              onTimeoutChange={handleUpdateTcpTimeout}
              disabled={running}
              title="TCP Port Pre-Scan & Workers Concurrency"
            />

            <p className="lldp-hint">
              SSH login uses the <strong>{credentialProfile?.name || 'default'}</strong> credential profile — the one
              picked in the SSH Credential Profile selector above the fleet list.
            </p>
            <p className="lldp-hint warn">
              Every reachable IP tries each credential in that profile. Many failed logins on a TACACS/RADIUS account
              can trigger a lockout, so put the correct credential first in the profile.
            </p>
          </>
        )}

        {/* Which CLI commands to run: P1 first, next profile when the device rejects them */}
        <div className="lldp-prio-pool">
          <div className="lldp-prio-head">
            <span>
              <Terminal className="h-3.5 w-3.5" style={{ display: 'inline', marginRight: '0.35rem' }} />
              Command Profile Priority
              {cmdPoolProfiles.length ? ` (${cmdPoolProfiles.map((p) => p.name).join(' → ')})` : ''}
            </span>
            <div className="lldp-prio-head-actions">
              <button
                className="lldp-btn-secondary lldp-btn-mini"
                onClick={() => setShowRulesModal(true)}
                title="Custom regex that reads the model and device type of new product lines"
              >
                <FlaskConical className="h-3.5 w-3.5" />
                Model Rules
              </button>
              <button
                className="lldp-btn-secondary lldp-btn-mini"
                onClick={() => {
                  setCmdError('');
                  setEditingCmd(null);
                  setShowCmdModal(true);
                }}
              >
                <Settings className="h-3.5 w-3.5" />
                Manage ({(cmdProfiles || []).length})
              </button>
            </div>
          </div>

          <div className="lldp-prio-rows">
            {cmdPool.map((id, i) => {
              const prof = cmdProfileById(id);
              return (
                <label className="lldp-prio-row" key={i}>
                  <span className={`lldp-prio-badge p${i + 1}`}>C{i + 1}</span>
                  <select value={id} onChange={(e) => setCmdPrio(i, e.target.value)} disabled={running}>
                    <option value="">{i === 0 ? '— All enabled profiles —' : '— None —'}</option>
                    {(cmdProfiles || []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.enabled === false ? ' (disabled)' : ''}
                      </option>
                    ))}
                  </select>
                  <span className="lldp-prio-driver">
                    {prof ? `${prof.parser} · ${prof.commands?.lldp_brief || '-'}` : '-'}
                  </span>
                  {cmdPool.length > 2 && (
                    <button
                      type="button"
                      className="lldp-prio-remove"
                      onClick={() => removeCmdPrio(i)}
                      disabled={running}
                      title="Remove this priority slot"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </label>
              );
            })}
          </div>

          {cmdPool.length < maxCmdPrio && (
            <button
              type="button"
              className="lldp-btn-secondary lldp-btn-mini lldp-prio-add"
              onClick={addCmdPrio}
              disabled={running}
            >
              <Plus className="h-3.5 w-3.5" />
              Add priority (C{cmdPool.length + 1})
            </button>
          )}
          <span className="lldp-hint">
            Commands only — the SSH login comes from the credential profile above. C1's commands run first on the open
            session; if the device rejects them (Huawei <code>display</code> on a Cisco), C2's commands are run on the
            same session instead, with no second login. Devices found by recursive discovery have no device type of
            their own, so they are logged in with C1's SSH driver first and tried again with C2's when the commands
            are rejected.
          </span>
        </div>

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
          <button
            className="lldp-btn-secondary"
            onClick={() => handleReparse().catch(() => {})}
            disabled={!canReparse || running || reparsing}
            title="Read the models / device types of this result again with the current Model Rules (no SSH)"
          >
            {reparsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Re-parse
          </button>
          <span className="lldp-btn-group">
            <button
              className="lldp-btn-secondary"
              onClick={() => tableInputRef.current?.click()}
              disabled={running || importing}
              title="Build the topology from an LLDP table in Excel (.xlsx) or CSV: one row per neighbor"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              Import LLDP Table
            </button>
            <button
              className="lldp-btn-secondary lldp-btn-addon"
              onClick={handleDownloadTemplate}
              title="Download an Excel template with the columns Import LLDP Table understands"
            >
              <Download className="h-3.5 w-3.5" />
              Template
            </button>
          </span>
          <button
            className="lldp-btn-secondary"
            onClick={() => importInputRef.current?.click()}
            disabled={running || importing}
            title="Load a topology exported from here (.drawio, .svg, .png, .zip) back into the LLDP table"
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Import Topology
          </button>
          <button
            className="lldp-btn-secondary"
            onClick={handleNewDiagram}
            disabled={running || importing}
            title="Draw a topology from scratch: add devices, interface links, traffic flows, zones and notes"
          >
            <FilePlus2 className="h-4 w-4" />
            New Diagram
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".drawio,.xml,.svg,.png,.zip,.json,.xlsx,.xlsm,.csv"
            hidden
            onChange={handleImportFile}
          />
          <input ref={tableInputRef} type="file" accept=".xlsx,.xlsm,.csv" hidden onChange={handleImportFile} />
        </div>

        {errorMessage && (
          <div className="lldp-error">
            <AlertCircle className="h-4 w-4" />
            <span>{errorMessage}</span>
          </div>
        )}
        {reparseMsg && <span className="lldp-hint ok">{reparseMsg}</span>}
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
          {report.imported && (
            <div className="lldp-import-banner">
              <Upload className="h-4 w-4" />
              <span>
                {report.format === 'editor'
                  ? 'Drawn in the editor'
                  : report.format === 'xlsx' || report.format === 'csv'
                    ? <>LLDP table <code>{report.file_name}</code> ({report.format === 'xlsx' ? 'Excel' : 'CSV'})</>
                    : <>Imported from <code>{report.file_name}</code> ({report.format})</>} ·{' '}
                {report.topology?.nodes?.length || 0} devices · {report.topology?.links?.length || 0} links · {report.total_lldp_rows} LLDP rows
                {report.edited ? ' · edited' : ''}
              </span>
            </div>
          )}
          {report.imported && report.import_warnings?.length > 0 && (
            <ul className="lldp-import-warnings">
              {report.import_warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          {!report.imported && (
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
          )}

          {unknownDevices.length > 0 && (
            <div className="lldp-rule-callout">
              <AlertCircle className="h-4 w-4" />
              <span>
                <strong>{unknownDevices.length}</strong> device(s) have no model and show as <em>Unknown</em> in the
                topology: {unknownDevices.slice(0, 5).join(', ')}
                {unknownDevices.length > 5 ? ' …' : ''}
                {ruleSamples.some((s) => !s.model) ? '' : ' (no version / LLDP description text was collected for them)'}
              </span>
              {ruleSamples.some((s) => !s.model) && (
                <button
                  className="lldp-btn-primary lldp-btn-mini"
                  onClick={() => setShowRulesModal({ teach: ruleSamples.find((s) => !s.model) })}
                >
                  <FlaskConical className="h-3.5 w-3.5" />
                  Teach model
                </button>
              )}
            </div>
          )}

          <div className="lldp-toolbar">
            <div className="lldp-tabs">
              <button className={view === 'neighbors' ? 'active' : ''} onClick={() => setView('neighbors')}>
                LLDP Inventory ({report.neighbors.length})
              </button>
              <button className={view === 'summary' ? 'active' : ''} onClick={() => setView('summary')}>
                Execution Summary ({filteredHosts.length})
              </button>
              <button className={view === 'topology' ? 'active' : ''} onClick={() => setView('topology')}>
                Topology ({report.topology?.nodes?.length || 0})
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
              {view !== 'topology' && (
                <div className="lldp-search">
                  <Search className="h-4 w-4" />
                  <input placeholder="Filter..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
              )}
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

          {view === 'topology' && (
            <>
              <LldpTopology
                topology={report.topology}
                annotations={report.annotations}
                neighbors={report.neighbors}
                targets={report.targets}
                onChange={handleTopologyChange}
                onImportFile={importLldpTopology}
                startEditing={report.format === 'editor'}
              />
              <ModelIconLegend nodes={report.topology?.nodes || []} onTeach={handleTeachModel} />
            </>
          )}

          {view === 'summary' && (
            <div className="lldp-table-wrap">
              <table className="lldp-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Hostname</th>
                    <th>IP Address</th>
                    <th>Model</th>
                    <th>Commands</th>
                    <th>Depth</th>
                    <th>Status</th>
                    <th>Neighbors Found</th>
                    <th>Time (s)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHosts.length === 0 && (
                    <tr>
                      <td colSpan={9} className="lldp-empty">
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
                          <td>{h.model || '-'}</td>
                          <td>{h.command_profile || '-'}</td>
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
                            <td colSpan={9} className="lldp-raw-cell">
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

      {showRulesModal && (
        <ModelRulesModal
          onClose={() => setShowRulesModal(false)}
          samples={ruleSamples}
          teach={showRulesModal.teach || null}
          onApply={canReparse ? handleReparse : null}
        />
      )}

      {/* Manage command profiles: the CLI commands used to collect LLDP */}
      {showCmdModal && (
        <div className="lldp-modal-backdrop" onClick={() => setShowCmdModal(false)}>
          <div className="lldp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lldp-modal-head">
              <h3>
                <Terminal className="h-4 w-4" />
                {editingCmd ? (editingCmd.id ? 'Edit Command Profile' : 'New Command Profile') : 'LLDP Command Profiles'}
              </h3>
              <button className="lldp-modal-close" onClick={() => setShowCmdModal(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="lldp-modal-body">
              {cmdError && (
                <div className="lldp-error">
                  <AlertCircle className="h-4 w-4" />
                  <span>{cmdError}</span>
                </div>
              )}

              {!editingCmd ? (
                <>
                  {(cmdProfiles || []).map((p) => (
                    <div className="lldp-cmd-item" key={p.id}>
                      <div className="lldp-cmd-item-main">
                        <span className="lldp-cmd-name">{p.name}</span>
                        <span className="lldp-prio-badge">{p.parser}</span>
                        {p.enabled === false && <span className="lldp-prio-badge">disabled</span>}
                        <code className="lldp-cmd-preview">{p.commands?.lldp_brief || '-'}</code>
                      </div>
                      <div className="lldp-cmd-actions">
                        <button
                          className="lldp-btn-secondary lldp-btn-mini"
                          onClick={() => {
                            setCmdError('');
                            setEditingCmd({ ...p, commands: { ...p.commands } });
                          }}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button className="lldp-btn-danger lldp-btn-mini" onClick={() => handleDeleteCmdProfile(p)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    className="lldp-btn-primary lldp-btn-mini"
                    onClick={() => {
                      setCmdError('');
                      setEditingCmd(blankCommandProfile());
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New Command Profile
                  </button>
                </>
              ) : (
                <form className="lldp-cmd-form" onSubmit={handleSaveCmdProfile}>
                  <label className="lldp-field">
                    <span>Profile name</span>
                    <input
                      value={editingCmd.name}
                      onChange={(e) => setEditingCmd((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. Aruba OS-CX"
                    />
                  </label>
                  <label className="lldp-field">
                    <span>Description</span>
                    <input
                      value={editingCmd.description || ''}
                      onChange={(e) => setEditingCmd((prev) => ({ ...prev, description: e.target.value }))}
                      placeholder="Optional remarks"
                    />
                  </label>
                  <label className="lldp-field">
                    <span>Output parser (how the LLDP output is read)</span>
                    <select
                      value={editingCmd.parser}
                      onChange={(e) => setEditingCmd((prev) => ({ ...prev, parser: e.target.value }))}
                    >
                      <option value="huawei">huawei — display lldp neighbor style</option>
                      <option value="cisco">cisco — show lldp neighbors style</option>
                    </select>
                  </label>
                  <label className="lldp-toggle">
                    <input
                      type="checkbox"
                      checked={editingCmd.enabled !== false}
                      onChange={(e) => setEditingCmd((prev) => ({ ...prev, enabled: e.target.checked }))}
                    />
                    <span>Enabled</span>
                  </label>

                  {COMMAND_FIELDS.map(([field, label, placeholder]) => (
                    <label className="lldp-field" key={field}>
                      <span>{label}</span>
                      <input
                        className="lldp-cmd-input"
                        value={editingCmd.commands?.[field] || ''}
                        onChange={(e) =>
                          setEditingCmd((prev) => ({
                            ...prev,
                            commands: { ...prev.commands, [field]: e.target.value },
                          }))
                        }
                        placeholder={placeholder}
                      />
                    </label>
                  ))}
                  <span className="lldp-hint">
                    Leave a command empty to use the built-in default for the selected parser.
                  </span>

                  <div className="lldp-actions">
                    <button type="submit" className="lldp-btn-primary" disabled={cmdSaving}>
                      {cmdSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      {editingCmd.id ? 'Update' : 'Create'}
                    </button>
                    <button type="button" className="lldp-btn-secondary" onClick={() => setEditingCmd(null)}>
                      <X className="h-4 w-4" />
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
