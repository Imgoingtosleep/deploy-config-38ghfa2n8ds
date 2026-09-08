import React, { useState, useEffect } from 'react';
import {
  Terminal,
  Send,
  Loader2,
  AlertCircle,
  Search,
  Activity,
  Radio,
  Network,
  History,
  Layers,
  FileText,
  Zap,
  CheckCircle2,
  ChevronRight,
  Server,
  Bookmark,
  Plus,
  Edit2,
  Trash2,
  Play,
  Save,
  FolderOpen,
  X,
  ListChecks,
  Sparkles,
  Check,
  Sliders,
} from 'lucide-react';
import {
  executeBatchTroubleshootCommand,
  submitTroubleshootJob,
  submitHealthCheckJob,
  getPlaybooks,
  createPlaybook,
  updatePlaybook,
  deletePlaybook,
  autoTranslateCommands,
} from '../services/api';
import AsyncJobModal from '../components/AsyncJobModal';
import './TroubleshootPage.css';

export default function TroubleshootPage({
  fleet = [],
  nornirWorkers = 10,
  onUpdateWorkers,
}) {
  const [customCommand, setCustomCommand] = useState('');
  const [connectivityTool, setConnectivityTool] = useState('ping'); // 'ping' | 'traceroute'
  const [connectTarget, setConnectTarget] = useState('');
  const [logKeyword, setLogKeyword] = useState('');
  const [history, setHistory] = useState([]);
  const [executing, setExecuting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successToast, setSuccessToast] = useState('');
  const [activeAsyncJob, setActiveAsyncJob] = useState(null); // { id, title }

  // Permanent Command Profiles from Backend
  const [playbooks, setPlaybooks] = useState([]);
  const [loadingPlaybooks, setLoadingPlaybooks] = useState(false);

  // Profile Editor Modal State (1. Title, 2. Description, 3. Primary Huawei + Add Vendor Buttons)
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [editingPlaybookId, setEditingPlaybookId] = useState(null);
  const [editorName, setEditorName] = useState('');
  const [editorDesc, setEditorDesc] = useState('');
  const [customVendors, setCustomVendors] = useState([]); // ['cisco', 'juniper', 'aruba', 'mikrotik']
  const [editorHuaweiText, setEditorHuaweiText] = useState('');
  const [editorCiscoText, setEditorCiscoText] = useState('');
  const [editorJuniperText, setEditorJuniperText] = useState('');
  const [editorArubaText, setEditorArubaText] = useState('');
  const [editorMikrotikText, setEditorMikrotikText] = useState('');
  const [translating, setTranslating] = useState(false);

  const validFleet = fleet.filter((d) => d.host && d.host.trim() !== '');

  // Fetch Playbooks from Backend on Mount
  const fetchPlaybooks = async () => {
    setLoadingPlaybooks(true);
    try {
      const data = await getPlaybooks();
      setPlaybooks(data || []);
    } catch (err) {
      console.error('Failed to load playbooks from backend:', err);
    } finally {
      setLoadingPlaybooks(false);
    }
  };

  useEffect(() => {
    fetchPlaybooks();
  }, []);

  // Launch Massive Fleet Background Job (10,000+ Scale with live stream & pagination)
  const handleLaunchAsyncFleetTroubleshoot = async (commandString, vendorCommands = null) => {
    const trimmed = (commandString || '').trim();
    if (!trimmed && (!vendorCommands || Object.keys(vendorCommands).length === 0)) return;

    if (validFleet.length === 0) {
      setErrorMessage('Please add at least one device in the Target Device fleet list above.');
      return;
    }

    try {
      setExecuting(true);
      const payloadDevices = validFleet.map((d) => ({
        host: d.host.trim(),
        port: parseInt(d.port, 10) || 22,
        device_type: d.device_type || 'cisco_ios',
        username: d.username || '',
        password: d.password || '',
        secret: d.secret || '',
        connection_mode: 'network',
      }));

      const res = await submitTroubleshootJob(payloadDevices, trimmed, vendorCommands, null, null, nornirWorkers);
      setActiveAsyncJob({
        id: res.job_id,
        title: `Fleet Diagnostic: ${trimmed || 'Multi-Vendor Task'} (${validFleet.length.toLocaleString()} Devices)`,
      });
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || err.message || 'Failed to submit fleet troubleshoot job');
    } finally {
      setExecuting(false);
    }
  };

  // Run execution for Multi Mode
  const runExecution = async (commandString, vendorCommands = null) => {
    const trimmed = (commandString || '').trim();
    if (!trimmed && (!vendorCommands || Object.keys(vendorCommands).length === 0)) return;

    setExecuting(true);
    setErrorMessage('');

    // Add to history
    if (trimmed) {
      setHistory((prev) => [trimmed, ...prev.filter((c) => c !== trimmed)].slice(0, 5));
    }

    if (validFleet.length === 0) {
      setErrorMessage('Please add at least one device in the Target Device fleet list above.');
      setExecuting(false);
      return;
    }

    // Launch Background Async Fleet Job with live progress stream & modal
    handleLaunchAsyncFleetTroubleshoot(trimmed, vendorCommands);
  };

  // Run an entire Command Profile
  const handleRunProfile = async (playbook) => {
    const huaweiCmds = (playbook.commands || []).map((c) => (typeof c === 'string' ? c : c.huawei || c.name)).filter(Boolean);
    const ciscoCmds = (playbook.commands || []).map((c) => (typeof c === 'string' ? c : c.cisco || c.name)).filter(Boolean);
    const juniperCmds = (playbook.commands || []).map((c) => (typeof c === 'string' ? c : c.juniper || c.name)).filter(Boolean);
    const nxosCmds = (playbook.commands || []).map((c) => (typeof c === 'string' ? c : c.nxos || c.cisco || c.name)).filter(Boolean);
    const arubaCmds = (playbook.commands || []).map((c) => (typeof c === 'string' ? c : c.aruba || c.name)).filter(Boolean);
    const mikrotikCmds = (playbook.commands || []).map((c) => (typeof c === 'string' ? c : c.mikrotik || c.name)).filter(Boolean);
    const genericCmds = (playbook.commands || []).map((c) => (typeof c === 'string' ? c : c.huawei || c.name)).filter(Boolean);

    if (genericCmds.length === 0) {
      setErrorMessage('This profile contains no commands to execute.');
      return;
    }

    if (validFleet.length === 0) {
      setErrorMessage('Please add at least one device in the Target Device fleet list above.');
      return;
    }

    setExecuting(true);
    setErrorMessage('');

    try {
      const devicesPayload = validFleet.map((d) => ({
        host: d.host.trim(),
        port: parseInt(d.port, 10) || 22,
        device_type: d.device_type || 'cisco_ios',
        username: d.username || '',
        password: d.password || '',
        secret: d.secret || '',
        connection_mode: 'network',
      }));

      const res = await submitHealthCheckJob(
        devicesPayload,
        'custom',
        genericCmds,
        {
          huawei: huaweiCmds,
          cisco_ios: ciscoCmds,
          cisco_nxos: nxosCmds,
          juniper_junos: juniperCmds,
          aruba_os: arubaCmds,
          hp_comware: huaweiCmds,
          mikrotik_routeros: mikrotikCmds,
        },
        playbook.name,
        nornirWorkers
      );

      setActiveAsyncJob({
        id: res.job_id,
        title: `Fleet Profile Run: ${playbook.name} (${genericCmds.length} cmds • ${validFleet.length} Devs)`,
      });
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || err.message || 'Failed to submit profile job');
    } finally {
      setExecuting(false);
    }
  };

  // Add a vendor command box
  const handleAddVendor = async (vendorKey) => {
    if (!customVendors.includes(vendorKey)) {
      setCustomVendors((prev) => [...prev, vendorKey]);
      const lines = editorHuaweiText.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length > 0) {
        const vendorKeyMap = {
          cisco: 'cisco_ios',
          juniper: 'juniper_junos',
          aruba: 'aruba_os',
          mikrotik: 'mikrotik_routeros',
        };
        const tgt = vendorKeyMap[vendorKey] || 'cisco_ios';
        try {
          const res = await autoTranslateCommands({
            commands: lines,
            source_vendor: 'huawei',
            target_vendors: [tgt],
          });
          if (res?.translations?.[tgt]) {
            const transStr = res.translations[tgt].join('\n');
            if (vendorKey === 'cisco' && !editorCiscoText.trim()) setEditorCiscoText(transStr);
            if (vendorKey === 'juniper' && !editorJuniperText.trim()) setEditorJuniperText(transStr);
            if (vendorKey === 'aruba' && !editorArubaText.trim()) setEditorArubaText(transStr);
            if (vendorKey === 'mikrotik' && !editorMikrotikText.trim()) setEditorMikrotikText(transStr);
          }
        } catch (err) {
          console.warn('Auto translation warning:', err);
        }
      }
    }
  };

  // Remove a vendor command box
  const handleRemoveVendor = (vendorKey) => {
    setCustomVendors((prev) => prev.filter((v) => v !== vendorKey));
  };

  // Close all vendor command boxes
  const handleCloseAllVendors = () => {
    setCustomVendors([]);
    setSuccessToast('ปิดกล่องคำสั่งทุกยี่ห้อแล้ว (ระบบจะแปลงคำสั่งจาก Huawei ให้อัตโนมัติ)');
    setTimeout(() => setSuccessToast(''), 2500);
  };

  // Auto-translate single vendor
  const handleTranslateSingleVendor = async (vendorKey) => {
    const lines = editorHuaweiText.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    const vendorKeyMap = {
      cisco: 'cisco_ios',
      juniper: 'juniper_junos',
      aruba: 'aruba_os',
      mikrotik: 'mikrotik_routeros',
    };
    const tgt = vendorKeyMap[vendorKey] || 'cisco_ios';
    try {
      const res = await autoTranslateCommands({
        commands: lines,
        source_vendor: 'huawei',
        target_vendors: [tgt],
      });
      if (res?.translations?.[tgt]) {
        const transStr = res.translations[tgt].join('\n');
        if (vendorKey === 'cisco') setEditorCiscoText(transStr);
        if (vendorKey === 'juniper') setEditorJuniperText(transStr);
        if (vendorKey === 'aruba') setEditorArubaText(transStr);
        if (vendorKey === 'mikrotik') setEditorMikrotikText(transStr);
        setSuccessToast(`Auto-filled ${vendorKey.toUpperCase()} commands!`);
        setTimeout(() => setSuccessToast(''), 2000);
      }
    } catch (err) {
      console.warn(err);
    }
  };

  // Auto-translate Huawei commands to all vendors using Backend Translation Engine
  const handleAutoTranslateFromHuawei = async (overrideHuaweiText = null) => {
    const textToTranslate = overrideHuaweiText !== null ? overrideHuaweiText : editorHuaweiText;
    const lines = textToTranslate
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) return;

    setTranslating(true);
    try {
      const res = await autoTranslateCommands({
        commands: lines,
        source_vendor: 'huawei',
      });
      if (res && res.translations) {
        if (res.translations.cisco_ios) {
          setEditorCiscoText(res.translations.cisco_ios.join('\n'));
        }
        if (res.translations.juniper_junos) {
          setEditorJuniperText(res.translations.juniper_junos.join('\n'));
        }
        if (res.translations.aruba_os) {
          setEditorArubaText(res.translations.aruba_os.join('\n'));
        }
        if (res.translations.mikrotik_routeros) {
          setEditorMikrotikText(res.translations.mikrotik_routeros.join('\n'));
        }
        setCustomVendors(['cisco', 'juniper', 'aruba', 'mikrotik']);
        setSuccessToast('Auto-generated and opened commands for all vendors!');
        setTimeout(() => setSuccessToast(''), 2500);
      }
    } catch (err) {
      console.warn('Auto translate warning:', err);
    } finally {
      setTranslating(false);
    }
  };

  // Open Create Profile Modal (Huawei VRP as Primary)
  const handleOpenCreateModal = () => {
    setEditingPlaybookId(null);
    setEditorName('');
    setEditorDesc('');
    setCustomVendors([]); // Default clean: only Huawei box is shown
    const defaultHuawei = 'display version\ndisplay interface brief\ndisplay ip routing-table\ndisplay cpu-usage';
    setEditorHuaweiText(defaultHuawei);
    setEditorCiscoText('');
    setEditorJuniperText('');
    setEditorArubaText('');
    setEditorMikrotikText('');
    setShowEditorModal(true);
  };

  // Open Edit Profile Modal
  const handleOpenEditModal = (playbook, e) => {
    e.stopPropagation();
    setEditingPlaybookId(playbook.id);
    setEditorName(playbook.name);
    setEditorDesc(playbook.description || '');

    const huaweiLines = (playbook.commands || []).map((c) =>
      typeof c === 'string' ? c : (c.huawei || c.name)
    ).filter(Boolean);

    const ciscoLines = (playbook.commands || []).map((c) =>
      typeof c === 'string' ? c : (c.cisco || c.name)
    ).filter(Boolean);

    const juniperLines = (playbook.commands || []).map((c) =>
      typeof c === 'string' ? c : (c.juniper || c.name)
    ).filter(Boolean);

    const arubaLines = (playbook.commands || []).map((c) =>
      typeof c === 'string' ? c : (c.aruba || c.name)
    ).filter(Boolean);

    const mikrotikLines = (playbook.commands || []).map((c) =>
      typeof c === 'string' ? c : (c.mikrotik || c.name)
    ).filter(Boolean);

    setEditorHuaweiText(huaweiLines.join('\n'));
    setEditorCiscoText(ciscoLines.join('\n'));
    setEditorJuniperText(juniperLines.join('\n'));
    setEditorArubaText(arubaLines.join('\n'));
    setEditorMikrotikText(mikrotikLines.join('\n'));

    // If existing playbook had specific commands for other vendors, open those boxes
    const activeV = [];
    if (ciscoLines.length > 0 && ciscoLines.some((c) => !huaweiLines.includes(c))) activeV.push('cisco');
    if (juniperLines.length > 0 && juniperLines.some((c) => !huaweiLines.includes(c))) activeV.push('juniper');
    if (arubaLines.length > 0 && arubaLines.some((c) => !huaweiLines.includes(c))) activeV.push('aruba');
    if (mikrotikLines.length > 0 && mikrotikLines.some((c) => !huaweiLines.includes(c))) activeV.push('mikrotik');
    setCustomVendors(activeV);

    setShowEditorModal(true);
  };

  // Save / Update Profile to Backend
  const handleSaveEditor = async (e) => {
    e.preventDefault();
    const name = editorName.trim();
    if (!name) {
      setErrorMessage('Profile Title is required.');
      return;
    }

    const huaweiLines = editorHuaweiText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const ciscoLines = customVendors.includes('cisco')
      ? editorCiscoText.split('\n').map((l) => l.trim()).filter(Boolean)
      : [];

    const juniperLines = customVendors.includes('juniper')
      ? editorJuniperText.split('\n').map((l) => l.trim()).filter(Boolean)
      : [];

    const arubaLines = customVendors.includes('aruba')
      ? editorArubaText.split('\n').map((l) => l.trim()).filter(Boolean)
      : [];

    const mikrotikLines = customVendors.includes('mikrotik')
      ? editorMikrotikText.split('\n').map((l) => l.trim()).filter(Boolean)
      : [];

    if (huaweiLines.length === 0 && ciscoLines.length === 0) {
      setErrorMessage('Please enter at least one CLI command for Huawei (Primary).');
      return;
    }

    try {
      const payload = {
        name,
        description: editorDesc.trim(),
        category: 'custom',
        primary_vendor: 'huawei',
        huawei_commands: huaweiLines,
        cisco_commands: ciscoLines.length > 0 ? ciscoLines : undefined,
        juniper_commands: juniperLines.length > 0 ? juniperLines : undefined,
        aruba_commands: arubaLines.length > 0 ? arubaLines : undefined,
        mikrotik_commands: mikrotikLines.length > 0 ? mikrotikLines : undefined,
      };

      if (editingPlaybookId) {
        await updatePlaybook(editingPlaybookId, payload);
        setSuccessToast(`Profile "${name}" updated successfully.`);
      } else {
        await createPlaybook(payload);
        setSuccessToast(`Profile "${name}" created with multi-vendor auto-translation.`);
      }

      setShowEditorModal(false);
      await fetchPlaybooks();
      setTimeout(() => setSuccessToast(''), 3500);
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || err.message || 'Failed to save profile');
    }
  };

  // Delete Profile
  const handleDeletePlaybook = async (playbookId, e) => {
    e.stopPropagation();
    const target = playbooks.find((p) => p.id === playbookId);
    const confirmDelete = window.confirm(
      `Are you sure you want to permanently delete the profile "${target?.name || playbookId}"?`
    );
    if (!confirmDelete) return;

    try {
      await deletePlaybook(playbookId);
      setSuccessToast('Profile deleted successfully.');
      await fetchPlaybooks();
      setTimeout(() => setSuccessToast(''), 3000);
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || err.message || 'Failed to delete profile');
    }
  };

  const handleCustomSubmit = (e) => {
    e.preventDefault();
    runExecution(customCommand);
  };

  const handleConnectivitySubmit = (e) => {
    e.preventDefault();
    if (!connectTarget.trim()) return;
    const target = connectTarget.trim();

    if (connectivityTool === 'traceroute') {
      setCustomCommand(`traceroute / tracert ${target}`);
      runExecution(`traceroute ${target}`, {
        huawei: `tracert ${target}`,
        cisco_ios: `traceroute ${target}`,
      });
    } else {
      const cmd = `ping ${target}`;
      setCustomCommand(cmd);
      runExecution(cmd);
    }
  };

  const handleLogSearchSubmit = (e) => {
    e.preventDefault();
    if (!logKeyword.trim()) return;
    const kw = logKeyword.trim();

    setCustomCommand(`log search: ${kw}`);
    runExecution(`log filter ${kw}`, {
      huawei: `display logbuffer | include ${kw}`,
      cisco_ios: `show logging | include ${kw}`,
    });
  };

  return (
    <div className="troubleshoot-page-container multi-mode">
      {/* Troubleshooting Controls & Profiles */}
      <div className="troubleshoot-left full-width">


        {/* CLI Execution Card */}
        <div className="troubleshoot-card">
          <div className="card-header-flex">
            <h2 className="card-title">
              <Layers className="card-icon" style={{ color: '#818cf8' }} />
              <span>Fleet CLI Execution ({validFleet.length} Devices)</span>
            </h2>
            <span className="fleet-badge">
              <Server className="h-3 w-3" />
              <span>Multi-Device SSH</span>
            </span>
          </div>

          <form onSubmit={handleCustomSubmit} className="cli-form">
            <div className="input-with-button">
              <input
                type="text"
                value={customCommand}
                onChange={(e) => setCustomCommand(e.target.value)}
                placeholder="e.g. ping 192.168.1.1 or display ip interface brief or show ip route"
                className="cli-input"
              />
              <button
                type="submit"
                disabled={executing || !customCommand.trim()}
                className="btn-send-cli"
                title="Execute Across Fleet"
              >
                {executing ? (
                  <Loader2 className="action-icon animate-spin" />
                ) : (
                  <Zap className="action-icon" style={{ fill: 'currentColor' }} />
                )}
                <span>Run Across Fleet</span>
              </button>
            </div>
          </form>

          {/* Quick Command History */}
          {history.length > 0 && (
            <div className="history-chips-row">
              <History className="h-3 w-3 text-slate-400 flex-shrink-0" />
              <div className="chips-scroll">
                {history.map((hCmd, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setCustomCommand(hCmd);
                      runExecution(hCmd);
                    }}
                    className="history-chip"
                    title={hCmd}
                  >
                    {hCmd}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Connectivity Tools: Ping & Traceroute */}
          <div className="connectivity-section">
            <div className="section-tab-bar">
              <button
                type="button"
                onClick={() => setConnectivityTool('ping')}
                className={`tool-tab-btn ${connectivityTool === 'ping' ? 'active' : ''}`}
              >
                <Activity className="h-3.5 w-3.5" />
                <span>Ping Test</span>
              </button>
              <button
                type="button"
                onClick={() => setConnectivityTool('traceroute')}
                className={`tool-tab-btn ${connectivityTool === 'traceroute' ? 'active' : ''}`}
              >
                <Radio className="h-3.5 w-3.5" />
                <span>Traceroute</span>
              </button>
            </div>

            <form onSubmit={handleConnectivitySubmit} className="tool-form">
              <input
                type="text"
                value={connectTarget}
                onChange={(e) => setConnectTarget(e.target.value)}
                placeholder="Destination IP / Host (e.g. 192.168.1.1 or 8.8.8.8)"
                className="tool-input"
              />
              <button
                type="submit"
                disabled={executing || !connectTarget.trim()}
                className="btn-tool-action"
              >
                {executing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : connectivityTool === 'ping' ? (
                  'Ping'
                ) : (
                  'Trace'
                )}
              </button>
            </form>
          </div>

          {/* Logbuffer Search Filter Tool */}
          <div className="log-search-section">
            <div className="log-search-label">
              <FileText className="h-3.5 w-3.5 text-indigo-400" />
              <span>Search Log Buffer (Syslog)</span>
            </div>
            <form onSubmit={handleLogSearchSubmit} className="tool-form">
              <input
                type="text"
                value={logKeyword}
                onChange={(e) => setLogKeyword(e.target.value)}
                placeholder="Keyword (e.g. DOWN, ERROR, ALARM, STP)"
                className="tool-input"
              />
              <button
                type="submit"
                disabled={executing || !logKeyword.trim()}
                className="btn-tool-action search"
              >
                {executing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <Search className="h-3.5 w-3.5" />
                    <span>Search</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Notifications */}
          {successToast && (
            <div className="alert-box success-alert" style={{ marginTop: '0.75rem' }}>
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-400" />
              <span>{successToast}</span>
            </div>
          )}

          {errorMessage && (
            <div className="alert-box" style={{ marginTop: '0.75rem' }}>
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* SAVED COMMAND PROFILES (REPLACING DIAGNOSTIC SHORTCUTS)                    */}
        {/* ========================================================================= */}
        <div className="troubleshoot-card">
          <div className="profiles-header-flex">
            <div className="flex items-center gap-2">
              <Bookmark className="h-4 w-4 text-indigo-400 flex-shrink-0" />
              <h3 className="profiles-heading">Saved Command Profiles</h3>
            </div>
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="btn-save-playbook"
              title="Create a new reusable command set profile"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create New Profile</span>
            </button>
          </div>


          {/* Profile Cards List */}
          <div className="profiles-container-ts">
            {loadingPlaybooks ? (
              <div className="py-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading Command Profiles...</span>
              </div>
            ) : playbooks.length === 0 ? (
              <div className="empty-profiles-box">
                <p className="text-xs text-slate-400 mb-2">
                  No command profiles found. Create your first profile to run custom diagnostic command sets across your devices anytime.
                </p>
                <button
                  type="button"
                  onClick={handleOpenCreateModal}
                  className="btn-create-first-profile"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create First Profile</span>
                </button>
              </div>
            ) : (
              <div className="profiles-grid-ts">
                {playbooks.map((pb) => {
                  const cmdCount = pb.commands?.length || 0;
                  return (
                    <div key={pb.id} className="profile-card-ts">
                      <div className="profile-card-header">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <FolderOpen className="h-4 w-4 text-indigo-400 flex-shrink-0" />
                          <h4 className="profile-card-name" title={pb.name}>
                            {pb.name}
                          </h4>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="profile-cmd-count font-mono">
                            {cmdCount} cmd{cmdCount === 1 ? '' : 's'}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleOpenEditModal(pb, e)}
                            className="btn-icon-ts edit"
                            title="Edit profile"
                          >
                            <Edit2 className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeletePlaybook(pb.id, e)}
                            className="btn-icon-ts delete"
                            title="Delete profile"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {/* Profile Description */}
                      <p className="profile-card-desc">
                        {pb.description ? pb.description : <span className="text-slate-500 italic">No description provided</span>}
                      </p>

                      {/* Run Action */}
                      <div className="profile-card-footer">
                        <button
                          type="button"
                          onClick={() => handleRunProfile(pb)}
                          disabled={executing}
                          className="btn-run-profile"
                        >
                          {executing ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              <span>Running...</span>
                            </>
                          ) : (
                            <>
                              <Play className="h-3.5 w-3.5" style={{ fill: 'currentColor' }} />
                              <span>Run Profile ({cmdCount} Cmds)</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        </div>
      </div>




      {/* ========================================================================= */}
      {/* PROFILE EDITOR MODAL (1. Title, 2. Description, 3. Commands by Manufacturer)*/}
      {/* ========================================================================= */}
      {showEditorModal && (
        <div className="modal-backdrop">
          <div className="save-playbook-box profile-editor-modal">
            <div className="save-playbook-header">
              <h3 className="save-playbook-title font-semibold">
                {editingPlaybookId ? 'Edit Command Profile' : 'Create New Command Profile'}
              </h3>
              <button onClick={() => setShowEditorModal(false)} className="modal-close-btn">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEditor}>
              <div className="save-playbook-body">
                {/* 1. Title */}
                <div className="form-group mb-3">
                  <label className="text-xs text-slate-300 font-semibold block mb-1">
                    1. Title (Profile Name) *
                  </label>
                  <input
                    type="text"
                    value={editorName}
                    onChange={(e) => setEditorName(e.target.value)}
                    placeholder="e.g. Daily Core Health Audit, Optical Link Check..."
                    className="save-pb-input"
                    required
                    autoFocus
                  />
                </div>

                {/* 2. Description */}
                <div className="form-group mb-3">
                  <label className="text-xs text-slate-300 font-semibold block mb-1">
                    2. Description (Optional)
                  </label>
                  <input
                    type="text"
                    value={editorDesc}
                    onChange={(e) => setEditorDesc(e.target.value)}
                    placeholder="e.g. Checks interface errors, CPU utilization, and optical power"
                    className="save-pb-input"
                  />
                </div>

                {/* 3. Primary Command (Huawei VRP) + Add Vendor Buttons */}
                <div className="form-group mb-2">
                  <label className="text-xs text-slate-300 font-semibold block mb-2">
                    3. CLI Commands by Manufacturer (ระบุคำสั่งแยกตามผู้ผลิต) *
                  </label>

                  {/* A. Primary Vendor Box: Huawei VRP */}
                  <div className="manufacturer-box huawei-box mb-3">
                    <div className="manufacturer-box-header">
                      <div className="flex items-center gap-1.5">
                        <span className="vendor-badge-pill huawei">ไวยากรณ์หลัก (Primary): Huawei VRP</span>
                        <span className="text-xs text-slate-400">CloudEngine / S-Series / VRP</span>
                      </div>
                      <span className="text-xs text-rose-400 font-mono font-semibold">
                        {editorHuaweiText.split('\n').filter((l) => l.trim().length > 0).length} command(s)
                      </span>
                    </div>
                    <textarea
                      value={editorHuaweiText}
                      onChange={(e) => setEditorHuaweiText(e.target.value)}
                      placeholder="Enter Huawei commands (Primary), for example:&#10;display version&#10;display interface brief&#10;display ip routing-table&#10;display cpu-usage&#10;display device&#10;display logbuffer"
                      rows={6}
                      className="editor-textarea-commands huawei-textarea"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      ป้อนคำสั่งเฉพาะ Huawei ในช่องนี้ช่องเดียวก็เพียงพอ ระบบจะแปลไปรันกับสวิตช์ยี่ห้ออื่นให้อัตโนมัติ หรือกดปุ่มด้านล่างเพื่อใส่คำสั่งเฉพาะแต่ละยี่ห้อเอง
                    </p>
                  </div>

                  {/* B. Add Vendor Buttons Toolbar */}
                  <div className="add-vendor-toolbar mb-3">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                      <span className="text-xs text-slate-300 font-semibold flex items-center gap-1.5">
                        <Sliders className="h-3.5 w-3.5 text-indigo-400" />
                        ปุ่มสำหรับใส่คำสั่งแยกตามแต่ละยี่ห้อเอง (Custom Overrides):
                      </span>
                      <div className="flex items-center gap-2">
                        {customVendors.length > 0 && (
                          <button
                            type="button"
                            onClick={handleCloseAllVendors}
                            className="btn-close-all-vendors"
                            title="ปิดกล่องทุกยี่ห้อและกลับไปใช้การแปลงอัตโนมัติจาก Huawei"
                          >
                            <X className="h-3.5 w-3.5" />
                            <span>ปิดทุกยี่ห้อ (Close All)</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleAutoTranslateFromHuawei()}
                          disabled={translating || !editorHuaweiText.trim()}
                          className="btn-auto-translate"
                          title="เปิดกล่องทุกยี่ห้อพร้อมแปลงคำสั่งจาก Huawei อัตโนมัติ"
                        >
                          {translating ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                          )}
                          <span>เปิดทุกยี่ห้อ (Auto-Fill All)</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {!customVendors.includes('cisco') ? (
                        <button
                          type="button"
                          onClick={() => handleAddVendor('cisco')}
                          className="btn-add-vendor cisco"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>+ ใส่คำสั่ง Cisco IOS/NX-OS</span>
                        </button>
                      ) : (
                        <span className="text-xs text-sky-400 font-medium px-2 py-1 rounded bg-sky-950/60 border border-sky-800/60 flex items-center gap-1">
                          <Check className="h-3 w-3" /> เพิ่มช่อง Cisco แล้ว
                        </span>
                      )}

                      {!customVendors.includes('juniper') ? (
                        <button
                          type="button"
                          onClick={() => handleAddVendor('juniper')}
                          className="btn-add-vendor juniper"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>+ ใส่คำสั่ง Juniper JunOS</span>
                        </button>
                      ) : (
                        <span className="text-xs text-emerald-400 font-medium px-2 py-1 rounded bg-emerald-950/60 border border-emerald-800/60 flex items-center gap-1">
                          <Check className="h-3 w-3" /> เพิ่มช่อง Juniper แล้ว
                        </span>
                      )}

                      {!customVendors.includes('aruba') ? (
                        <button
                          type="button"
                          onClick={() => handleAddVendor('aruba')}
                          className="btn-add-vendor aruba"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>+ ใส่คำสั่ง Aruba OS-CX</span>
                        </button>
                      ) : (
                        <span className="text-xs text-amber-400 font-medium px-2 py-1 rounded bg-amber-950/60 border border-amber-800/60 flex items-center gap-1">
                          <Check className="h-3 w-3" /> เพิ่มช่อง Aruba แล้ว
                        </span>
                      )}

                      {!customVendors.includes('mikrotik') ? (
                        <button
                          type="button"
                          onClick={() => handleAddVendor('mikrotik')}
                          className="btn-add-vendor mikrotik"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>+ ใส่คำสั่ง MikroTik RouterOS</span>
                        </button>
                      ) : (
                        <span className="text-xs text-purple-400 font-medium px-2 py-1 rounded bg-purple-950/60 border border-purple-800/60 flex items-center gap-1">
                          <Check className="h-3 w-3" /> เพิ่มช่อง MikroTik แล้ว
                        </span>
                      )}
                    </div>
                  </div>

                  {/* C. Added Vendor Custom Boxes */}
                  <div className="custom-vendor-boxes space-y-3">
                    {/* Cisco Box */}
                    {customVendors.includes('cisco') && (
                      <div className="manufacturer-box cisco-box">
                        <div className="manufacturer-box-header">
                          <div className="flex items-center gap-1.5">
                            <span className="vendor-badge-pill cisco">Vendor: Cisco</span>
                            <span className="text-xs text-slate-400">IOS / IOS-XE / NX-OS</span>
                            <span className="text-xs text-sky-400 font-mono font-semibold ml-2">
                              {editorCiscoText.split('\n').filter((l) => l.trim().length > 0).length} command(s)
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleTranslateSingleVendor('cisco')}
                              className="btn-remove-vendor hover:text-sky-300"
                              title="แปลงคำสั่งจาก Huawei มาใส่ช่องนี้"
                            >
                              <Sparkles className="h-3 w-3 text-sky-400" />
                              <span>แปลงจาก Huawei</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveVendor('cisco')}
                              className="btn-remove-vendor"
                              title="นำช่องนี้ออก (ระบบจะ Auto-Translate ให้อัตโนมัติ)"
                            >
                              <X className="h-3 w-3" />
                              <span>นำออก</span>
                            </button>
                          </div>
                        </div>
                        <textarea
                          value={editorCiscoText}
                          onChange={(e) => setEditorCiscoText(e.target.value)}
                          placeholder="Enter Cisco commands, for example:&#10;show version&#10;show ip interface brief&#10;show ip route&#10;show processes cpu sorted"
                          rows={5}
                          className="editor-textarea-commands cisco-textarea"
                        />
                      </div>
                    )}

                    {/* Juniper Box */}
                    {customVendors.includes('juniper') && (
                      <div className="manufacturer-box" style={{ borderColor: 'rgba(16, 185, 129, 0.3)', background: 'rgba(6, 78, 59, 0.15)' }}>
                        <div className="manufacturer-box-header">
                          <div className="flex items-center gap-1.5">
                            <span className="vendor-badge-pill" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.4)' }}>Vendor: Juniper</span>
                            <span className="text-xs text-slate-400">JunOS CLI</span>
                            <span className="text-xs text-emerald-400 font-mono font-semibold ml-2">
                              {editorJuniperText.split('\n').filter((l) => l.trim().length > 0).length} command(s)
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleTranslateSingleVendor('juniper')}
                              className="btn-remove-vendor hover:text-emerald-300"
                              title="แปลงคำสั่งจาก Huawei มาใส่ช่องนี้"
                            >
                              <Sparkles className="h-3 w-3 text-emerald-400" />
                              <span>แปลงจาก Huawei</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveVendor('juniper')}
                              className="btn-remove-vendor"
                              title="นำช่องนี้ออก (ระบบจะ Auto-Translate ให้อัตโนมัติ)"
                            >
                              <X className="h-3 w-3" />
                              <span>นำออก</span>
                            </button>
                          </div>
                        </div>
                        <textarea
                          value={editorJuniperText}
                          onChange={(e) => setEditorJuniperText(e.target.value)}
                          placeholder="Enter Juniper commands, for example:&#10;show version&#10;show interfaces terse&#10;show route&#10;show chassis routing-engine"
                          rows={5}
                          className="editor-textarea-commands juniper-textarea"
                        />
                      </div>
                    )}

                    {/* Aruba Box */}
                    {customVendors.includes('aruba') && (
                      <div className="manufacturer-box" style={{ borderColor: 'rgba(245, 158, 11, 0.3)', background: 'rgba(120, 53, 15, 0.15)' }}>
                        <div className="manufacturer-box-header">
                          <div className="flex items-center gap-1.5">
                            <span className="vendor-badge-pill" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.4)' }}>Vendor: Aruba</span>
                            <span className="text-xs text-slate-400">AOS-CX / ProCurve</span>
                            <span className="text-xs text-amber-400 font-mono font-semibold ml-2">
                              {editorArubaText.split('\n').filter((l) => l.trim().length > 0).length} command(s)
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleTranslateSingleVendor('aruba')}
                              className="btn-remove-vendor hover:text-amber-300"
                              title="แปลงคำสั่งจาก Huawei มาใส่ช่องนี้"
                            >
                              <Sparkles className="h-3 w-3 text-amber-400" />
                              <span>แปลงจาก Huawei</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveVendor('aruba')}
                              className="btn-remove-vendor"
                              title="นำช่องนี้ออก (ระบบจะ Auto-Translate ให้อัตโนมัติ)"
                            >
                              <X className="h-3 w-3" />
                              <span>นำออก</span>
                            </button>
                          </div>
                        </div>
                        <textarea
                          value={editorArubaText}
                          onChange={(e) => setEditorArubaText(e.target.value)}
                          placeholder="Enter Aruba commands, for example:&#10;show version&#10;show interface brief&#10;show ip route&#10;show cpu"
                          rows={5}
                          className="editor-textarea-commands aruba-textarea"
                        />
                      </div>
                    )}

                    {/* MikroTik Box */}
                    {customVendors.includes('mikrotik') && (
                      <div className="manufacturer-box" style={{ borderColor: 'rgba(168, 85, 247, 0.3)', background: 'rgba(88, 28, 135, 0.15)' }}>
                        <div className="manufacturer-box-header">
                          <div className="flex items-center gap-1.5">
                            <span className="vendor-badge-pill" style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.4)' }}>Vendor: MikroTik</span>
                            <span className="text-xs text-slate-400">RouterOS</span>
                            <span className="text-xs text-purple-400 font-mono font-semibold ml-2">
                              {editorMikrotikText.split('\n').filter((l) => l.trim().length > 0).length} command(s)
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleTranslateSingleVendor('mikrotik')}
                              className="btn-remove-vendor hover:text-purple-300"
                              title="แปลงคำสั่งจาก Huawei มาใส่ช่องนี้"
                            >
                              <Sparkles className="h-3 w-3 text-purple-400" />
                              <span>แปลงจาก Huawei</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveVendor('mikrotik')}
                              className="btn-remove-vendor"
                              title="นำช่องนี้ออก (ระบบจะ Auto-Translate ให้อัตโนมัติ)"
                            >
                              <X className="h-3 w-3" />
                              <span>นำออก</span>
                            </button>
                          </div>
                        </div>
                        <textarea
                          value={editorMikrotikText}
                          onChange={(e) => setEditorMikrotikText(e.target.value)}
                          placeholder="Enter MikroTik commands, for example:&#10;/system resource print&#10;/interface print brief&#10;/ip route print"
                          rows={5}
                          className="editor-textarea-commands mikrotik-textarea"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="save-playbook-footer">
                <button
                  type="button"
                  onClick={() => setShowEditorModal(false)}
                  className="btn-modal-cancel"
                >
                  <X className="h-4 w-4" />
                  <span>Cancel</span>
                </button>
                <button
                  type="submit"
                  disabled={!editorName.trim() || (!editorCiscoText.trim() && !editorHuaweiText.trim())}
                  className="btn-modal-save"
                >
                  {editingPlaybookId ? (
                    <>
                      <Save className="h-4 w-4" />
                      <span>Save Changes</span>
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      <span>Create Profile</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ASYNC FLEET JOB MODAL (10,000+ Devices Scale) */}
      {activeAsyncJob && (
        <AsyncJobModal
          jobId={activeAsyncJob.id}
          title={activeAsyncJob.title}
          onClose={() => setActiveAsyncJob(null)}
        />
      )}
    </div>
  );
}
