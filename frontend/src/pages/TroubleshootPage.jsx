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
  Filter,
} from 'lucide-react';
import {
  executeBatchTroubleshootCommand,
  submitTroubleshootJob,
  submitHealthCheckJob,
  getPlaybooks,
  createPlaybook,
  updatePlaybook,
  deletePlaybook,
} from '../services/api';
import AsyncJobModal from '../components/AsyncJobModal';
import CommandProfileEditor from '../components/CommandProfileEditor';
import { playbookSets, profileCommandCount } from '../components/commandSets';
import './TroubleshootPage.css';

export default function TroubleshootPage({
  fleet = [],
  nornirWorkers = 10,
  onUpdateWorkers,
}) {
  const [cliCommandList, setCliCommandList] = useState([
    { id: '1', command: '', regex: '' },
  ]);
  const [customCommand, setCustomCommand] = useState('');
  const [connectivityTool, setConnectivityTool] = useState('ping'); // 'ping' | 'traceroute'
  const [connectTarget, setConnectTarget] = useState('');
  const [logKeyword, setLogKeyword] = useState('');
  const [history, setHistory] = useState([]);
  const [executing, setExecuting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successToast, setSuccessToast] = useState('');
  const [activeAsyncJob, setActiveAsyncJob] = useState(null); // { id, title }

  const addCliCommandRow = () => {
    setCliCommandList((prev) => [
      ...prev,
      { id: `cmd-${Date.now()}`, command: '', regex: '' },
    ]);
  };

  const removeCliCommandRow = (id) => {
    setCliCommandList((prev) =>
      prev.length > 1 ? prev.filter((c) => c.id !== id) : [{ id: '1', command: '', regex: '' }]
    );
  };

  const updateCliCommandRow = (id, field, value) => {
    setCliCommandList((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );
  };

  // Permanent Command Profiles from Backend
  const [playbooks, setPlaybooks] = useState([]);
  const [loadingPlaybooks, setLoadingPlaybooks] = useState(false);

  // Command profile editor: undefined = closed, null = new profile, object = profile to edit
  const [editorPlaybook, setEditorPlaybook] = useState(undefined);

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
  const handleLaunchAsyncFleetTroubleshoot = async (
    commandString,
    vendorCommands = null,
    commandsList = null,
    commandRegexes = null
  ) => {
    const trimmed = (commandString || '').trim();
    const cmds = commandsList || (trimmed ? [trimmed] : []);
    if (cmds.length === 0 && (!vendorCommands || Object.keys(vendorCommands).length === 0)) return;

    if (validFleet.length === 0) {
      setErrorMessage('Please add at least one device in the Target Device fleet list above.');
      return;
    }

    try {
      setExecuting(true);
      const payloadDevices = validFleet.map((d) => ({
        name: d.name || '',
        host: d.host.trim(),
        port: parseInt(d.port, 10) || 22,
        device_type: d.device_type || 'cisco_ios',
        username: d.username || '',
        password: d.password || '',
        secret: d.secret || '',
        connection_mode: 'network',
        profile_id: d.profile_id || null,
        credential_pool: d.credential_pool || null,
        fallback_profile_ids: d.fallback_profile_ids || null,
      }));

      const res = await submitTroubleshootJob(
        payloadDevices,
        trimmed,
        vendorCommands,
        null,
        null,
        nornirWorkers,
        cmds,
        commandRegexes || {}
      );
      const titleLabel = cmds.length > 1 ? `${cmds.length} CLI Commands` : (trimmed || 'Multi-Vendor Task');
      setActiveAsyncJob({
        id: res.job_id,
        title: `Fleet Diagnostic: ${titleLabel} (${validFleet.length.toLocaleString()} Devices)`,
        commandRegexes: commandRegexes || {},
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
    // Each device runs the command set of its driver, as written
    const commandSets = playbookSets(playbook);
    const genericCmds = commandSets[0]?.commands || [];
    if (commandSets.length === 0) {
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
        name: d.name || '',
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
        {},
        playbook.name,
        nornirWorkers,
        {},
        commandSets
      );

      setActiveAsyncJob({
        id: res.job_id,
        title: `Fleet Profile Run: ${playbook.name} (${genericCmds.length} cmds • ${validFleet.length} Devs)`,
        commandRegexes: {},
      });
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || err.message || 'Failed to submit profile job');
    } finally {
      setExecuting(false);
    }
  };

  const handleOpenCreateModal = () => setEditorPlaybook(null);

  const handleOpenEditModal = (playbook, e) => {
    e.stopPropagation();
    setEditorPlaybook(playbook);
  };

  const handleEditorSaved = async (saved) => {
    const isNew = !editorPlaybook;
    setEditorPlaybook(undefined);
    await fetchPlaybooks();
    setSuccessToast(`Profile "${saved?.name}" ${isNew ? 'created' : 'saved'}.`);
    setTimeout(() => setSuccessToast(''), 3000);
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
    const validCmds = cliCommandList.filter((c) => c.command && c.command.trim() !== '');
    if (validCmds.length === 0) return;

    const commandStrings = validCmds.map((c) => c.command.trim());
    const commandRegexes = {};
    validCmds.forEach((c, idx) => {
      const reg = (c.regex || '').trim();
      commandRegexes[String(idx)] = reg;
    });

    setHistory((prev) => [commandStrings[0], ...prev.filter((c) => c !== commandStrings[0])].slice(0, 5));

    handleLaunchAsyncFleetTroubleshoot(
      commandStrings[0],
      null,
      commandStrings,
      commandRegexes
    );
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
            <div className="cli-commands-container">
              {cliCommandList.map((cmdItem, idx) => (
                <div key={cmdItem.id || idx} className="cli-command-card">
                  <div className="cli-command-header-row">
                    <span className="cli-cmd-number">#{idx + 1}</span>
                    <input
                      type="text"
                      value={cmdItem.command}
                      onChange={(e) => updateCliCommandRow(cmdItem.id, 'command', e.target.value)}
                      placeholder="CLI Command (e.g. display ip interface brief or show ip route)"
                      className="cli-input"
                    />
                    {cliCommandList.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeCliCommandRow(cmdItem.id)}
                        className="btn-remove-cli-row"
                        title="Remove Command"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="cli-regex-row" style={{ marginTop: '0.45rem' }}>
                    <Filter className="h-3.5 w-3.5 text-indigo-400 flex-shrink-0" />
                    <input
                      type="text"
                      value={cmdItem.regex}
                      onChange={(e) => updateCliCommandRow(cmdItem.id, 'regex', e.target.value)}
                      placeholder="Filter regex for this command (optional, e.g. Up|Down or GigabitEthernet.*)"
                      className="cli-regex-input"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="cli-form-actions-row">
              <button
                type="button"
                onClick={addCliCommandRow}
                className="btn-add-cli-row"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Another Command</span>
              </button>

              <button
                type="submit"
                disabled={executing || !cliCommandList.some((c) => c.command && c.command.trim())}
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
                      setCliCommandList([{ id: '1', command: hCmd, regex: '' }]);
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
                  const cmdCount = profileCommandCount(pb);
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




      {editorPlaybook !== undefined && (
        <CommandProfileEditor
          playbook={editorPlaybook}
          onClose={() => setEditorPlaybook(undefined)}
          onSaved={handleEditorSaved}
        />
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
