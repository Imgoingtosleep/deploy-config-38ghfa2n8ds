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
} from 'lucide-react';
import {
  executeTroubleshootCommand,
  executeBatchTroubleshootCommand,
  submitTroubleshootJob,
  submitHealthCheckJob,
  getPlaybooks,
  createPlaybook,
  updatePlaybook,
  deletePlaybook,
} from '../services/api';
import TerminalOutput from '../components/TerminalOutput';
import AsyncJobModal from '../components/AsyncJobModal';
import './TroubleshootPage.css';

export default function TroubleshootPage({
  deviceMode = 'multi',
  device,
  fleet = [],
}) {
  const isHuawei = device?.device_type?.toLowerCase().includes('huawei');
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

  // Profile Editor Modal State (1. Title, 2. Description, 3. Commands by Manufacturer)
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [editingPlaybookId, setEditingPlaybookId] = useState(null);
  const [editorName, setEditorName] = useState('');
  const [editorDesc, setEditorDesc] = useState('');
  const [editorCiscoText, setEditorCiscoText] = useState('');
  const [editorHuaweiText, setEditorHuaweiText] = useState('');

  // Single Device Result State
  const [currentResult, setCurrentResult] = useState(null);

  // Multi Device Batch Result State
  const [batchResults, setBatchResults] = useState(null);
  const [selectedDeviceIndex, setSelectedDeviceIndex] = useState(0);

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

      const res = await submitTroubleshootJob(payloadDevices, trimmed, vendorCommands);
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

  // Run execution for Single or Multi Mode
  const runExecution = async (commandString, vendorCommands = null) => {
    const trimmed = (commandString || '').trim();
    if (!trimmed && (!vendorCommands || Object.keys(vendorCommands).length === 0)) return;

    setExecuting(true);
    setErrorMessage('');

    // Add to history
    if (trimmed) {
      setHistory((prev) => [trimmed, ...prev.filter((c) => c !== trimmed)].slice(0, 5));
    }

    if (deviceMode === 'multi') {
      if (validFleet.length === 0) {
        setErrorMessage('Please add at least one device in the Target Device fleet list above.');
        setExecuting(false);
        return;
      }

      // Launch Background Async Fleet Job with live progress stream & modal
      handleLaunchAsyncFleetTroubleshoot(trimmed, vendorCommands);
    } else {
      // Single Mode
      if (!device?.host) {
        setErrorMessage('Please fill in Target Device Host / IP Address above.');
        setExecuting(false);
        return;
      }

      try {
        const data = await executeTroubleshootCommand(device, trimmed);
        setCurrentResult(data);
      } catch (err) {
        setErrorMessage(err.response?.data?.detail || err.message || 'Command execution failed');
        setCurrentResult(null);
      } finally {
        setExecuting(false);
      }
    }
  };

  // Run an entire Command Profile
  const handleRunProfile = async (playbook) => {
    const ciscoCmds = (playbook.commands || []).map((c) => (typeof c === 'string' ? c : c.cisco || c.name)).filter(Boolean);
    const huaweiCmds = (playbook.commands || []).map((c) => (typeof c === 'string' ? c : c.huawei || c.name)).filter(Boolean);
    const genericCmds = (playbook.commands || []).map((c) => (typeof c === 'string' ? c : c.name)).filter(Boolean);

    if (genericCmds.length === 0) {
      setErrorMessage('This profile contains no commands to execute.');
      return;
    }

    if (deviceMode === 'multi') {
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
            cisco_ios: ciscoCmds,
            huawei: huaweiCmds,
          },
          playbook.name
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
    } else {
      // Single Mode execution of profile
      if (!device?.host) {
        setErrorMessage('Please fill in Target Device Host / IP Address above.');
        return;
      }

      setExecuting(true);
      setErrorMessage('');

      const targetCmds = isHuawei ? huaweiCmds : ciscoCmds;
      const effectiveCmds = targetCmds.length > 0 ? targetCmds : genericCmds;

      try {
        let combinedOutputs = [];
        let isSuccess = true;
        let lastErr = null;

        for (const cmd of effectiveCmds) {
          const res = await executeTroubleshootCommand(device, cmd);
          combinedOutputs.push(`[${cmd}]\n${res.output || res.error || ''}`);
          if (!res.success) {
            isSuccess = false;
            lastErr = res.error;
          }
        }

        setCurrentResult({
          host: device.host,
          command: `Profile: ${playbook.name} (${effectiveCmds.length} commands)`,
          output: combinedOutputs.join('\n\n'),
          success: isSuccess,
          error: lastErr,
          execution_time_seconds: 0.0,
        });
      } catch (err) {
        setErrorMessage(err.response?.data?.detail || err.message || 'Profile execution failed');
      } finally {
        setExecuting(false);
      }
    }
  };

  // Open Create Profile Modal
  const handleOpenCreateModal = () => {
    setEditingPlaybookId(null);
    setEditorName('');
    setEditorDesc('');
    setEditorCiscoText('show version\nshow ip interface brief\nshow ip route\nshow processes cpu');
    setEditorHuaweiText('display version\ndisplay ip interface brief\ndisplay ip routing-table\ndisplay cpu-usage');
    setShowEditorModal(true);
  };

  // Open Edit Profile Modal
  const handleOpenEditModal = (playbook, e) => {
    e.stopPropagation();
    setEditingPlaybookId(playbook.id);
    setEditorName(playbook.name);
    setEditorDesc(playbook.description || '');

    const ciscoLines = (playbook.commands || []).map((c) =>
      typeof c === 'string' ? c : (c.cisco || c.name)
    ).filter(Boolean);

    const huaweiLines = (playbook.commands || []).map((c) =>
      typeof c === 'string' ? c : (c.huawei || c.name)
    ).filter(Boolean);

    setEditorCiscoText(ciscoLines.join('\n'));
    setEditorHuaweiText(huaweiLines.join('\n'));
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

    const ciscoLines = editorCiscoText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const huaweiLines = editorHuaweiText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (ciscoLines.length === 0 && huaweiLines.length === 0) {
      setErrorMessage('Please enter at least one CLI command for Cisco or Huawei.');
      return;
    }

    try {
      const payload = {
        name,
        description: editorDesc.trim(),
        category: 'custom',
        cisco_commands: ciscoLines,
        huawei_commands: huaweiLines,
      };

      if (editingPlaybookId) {
        await updatePlaybook(editingPlaybookId, payload);
        setSuccessToast(`Profile "${name}" updated successfully.`);
      } else {
        await createPlaybook(payload);
        setSuccessToast(`Profile "${name}" created and saved permanently.`);
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

    if (deviceMode === 'multi') {
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
    } else {
      if (connectivityTool === 'traceroute') {
        const cmd = isHuawei ? `tracert ${target}` : `traceroute ${target}`;
        setCustomCommand(cmd);
        runExecution(cmd);
      } else {
        const cmd = `ping ${target}`;
        setCustomCommand(cmd);
        runExecution(cmd);
      }
    }
  };

  const handleLogSearchSubmit = (e) => {
    e.preventDefault();
    if (!logKeyword.trim()) return;
    const kw = logKeyword.trim();

    if (deviceMode === 'multi') {
      setCustomCommand(`log search: ${kw}`);
      runExecution(`log filter ${kw}`, {
        huawei: `display logbuffer | include ${kw}`,
        cisco_ios: `show logging | include ${kw}`,
      });
    } else {
      const cmd = isHuawei ? `display logbuffer | include ${kw}` : `show logging | include ${kw}`;
      setCustomCommand(cmd);
      runExecution(cmd);
    }
  };

  const activeBatchDeviceResult = batchResults?.results?.[selectedDeviceIndex];

  return (
    <div className={`troubleshoot-page-container ${deviceMode === 'multi' ? 'multi-mode' : 'single-mode'}`}>
      {/* Troubleshooting Controls & Profiles */}
      <div className={`troubleshoot-left ${deviceMode === 'multi' ? 'full-width' : ''}`}>


        {/* CLI Execution Card */}
        <div className="troubleshoot-card">
          <div className="card-header-flex">
            <h2 className="card-title">
              {deviceMode === 'multi' ? (
                <>
                  <Layers className="card-icon" style={{ color: '#818cf8' }} />
                  <span>Fleet CLI Execution ({validFleet.length} Devices)</span>
                </>
              ) : (
                <>
                  <Terminal className="card-icon" />
                  <span>Interactive CLI Execution</span>
                </>
              )}
            </h2>
            {deviceMode === 'multi' && (
              <span className="fleet-badge">
                <Server className="h-3 w-3" />
                <span>Multi-Device SSH</span>
              </span>
            )}
          </div>

          <form onSubmit={handleCustomSubmit} className="cli-form">
            <div className="input-with-button">
              <input
                type="text"
                value={customCommand}
                onChange={(e) => setCustomCommand(e.target.value)}
                placeholder={
                  deviceMode === 'multi'
                    ? 'e.g. ping 192.168.1.1 or display ip interface brief or show ip route'
                    : isHuawei
                    ? 'e.g. display transceiver or display vlan'
                    : 'e.g. show version or show ip route'
                }
                className="cli-input"
              />
              <button
                type="submit"
                disabled={executing || !customCommand.trim()}
                className="btn-send-cli"
                title={deviceMode === 'multi' ? 'Execute Across Fleet' : 'Execute Command'}
              >
                {executing ? (
                  <Loader2 className="action-icon animate-spin" />
                ) : deviceMode === 'multi' ? (
                  <Zap className="action-icon" style={{ fill: 'currentColor' }} />
                ) : (
                  <Send className="action-icon" />
                )}
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

      {/* Right Column: Terminal Display only for Single Device Mode */}
      {deviceMode === 'single' && (
        <div className="troubleshoot-right">
          <div style={{ minHeight: '550px' }}>
            <TerminalOutput
              title="CLI Output"
              command={currentResult?.command || customCommand}
              output={currentResult?.output || currentResult?.error}
              executionTime={currentResult?.execution_time_seconds}
              onClear={() => setCurrentResult(null)}
              isError={currentResult && !currentResult.success}
            />
          </div>
        </div>
      )}


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

                {/* 3. Commands by Manufacturer (Cisco & Huawei) */}
                <div className="form-group mb-2">
                  <label className="text-xs text-slate-300 font-semibold block mb-2">
                    3. Full CLI Commands by Manufacturer (ระบุคำสั่งเต็มแยกตามผู้ผลิต) *
                  </label>

                  <div className="manufacturer-commands-grid">
                    {/* Cisco IOS Manufacturer */}
                    <div className="manufacturer-box cisco-box">
                      <div className="manufacturer-box-header">
                        <div className="flex items-center gap-1.5">
                          <span className="vendor-badge-pill cisco">Manufacturer: Cisco</span>
                          <span className="text-xs text-slate-400">IOS / IOS-XE</span>
                        </div>
                        <span className="text-xs text-sky-400 font-mono font-semibold">
                          {editorCiscoText.split('\n').filter((l) => l.trim().length > 0).length} command(s)
                        </span>
                      </div>
                      <textarea
                        value={editorCiscoText}
                        onChange={(e) => setEditorCiscoText(e.target.value)}
                        placeholder="Enter full non-abbreviated Cisco commands, for example:&#10;show version&#10;show ip interface brief&#10;show ip route&#10;show processes cpu&#10;show interfaces status"
                        rows={6}
                        className="editor-textarea-commands cisco-textarea"
                      />
                      <p className="text-xs text-slate-400 mt-1">
                        Use full Cisco syntax (e.g. <code className="text-sky-300">show ip interface brief</code>)
                      </p>
                    </div>

                    {/* Huawei VRP Manufacturer */}
                    <div className="manufacturer-box huawei-box">
                      <div className="manufacturer-box-header">
                        <div className="flex items-center gap-1.5">
                          <span className="vendor-badge-pill huawei">Manufacturer: Huawei</span>
                          <span className="text-xs text-slate-400">VRP (Quidway / CloudEngine)</span>
                        </div>
                        <span className="text-xs text-rose-400 font-mono font-semibold">
                          {editorHuaweiText.split('\n').filter((l) => l.trim().length > 0).length} command(s)
                        </span>
                      </div>
                      <textarea
                        value={editorHuaweiText}
                        onChange={(e) => setEditorHuaweiText(e.target.value)}
                        placeholder="Enter full non-abbreviated Huawei commands, for example:&#10;display version&#10;display ip interface brief&#10;display ip routing-table&#10;display cpu-usage&#10;display interface brief"
                        rows={6}
                        className="editor-textarea-commands huawei-textarea"
                      />
                      <p className="text-xs text-slate-400 mt-1">
                        Use full Huawei syntax (e.g. <code className="text-rose-300">display ip interface brief</code>)
                      </p>
                    </div>
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
