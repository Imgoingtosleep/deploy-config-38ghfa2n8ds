import React, { useState, useEffect } from 'react';
import {
  Activity,
  Play,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ListChecks,
  Cpu,
  Server,
  Network,
  ShieldCheck,
  Clock,
  RefreshCw,
  Zap,
  Layers,
  Plus,
  Trash2,
  ChevronRight,
  Sliders,
  CheckSquare,
  Square,
  Bookmark,
  Save,
  Check,
  FolderOpen,
  Terminal,
  Edit2,
  X,
  Sparkles,
  Filter,
} from 'lucide-react';
import {
  submitHealthCheckJob,
  getPlaybooks,
  createPlaybook,
  updatePlaybook,
  deletePlaybook,
} from '../services/api';
import AsyncJobModal from '../components/AsyncJobModal';
import CommandProfileEditor from '../components/CommandProfileEditor';
import { playbookSets, setItems, setsFromItems, profileCommandCount, DEFAULT_DRIVER } from '../components/commandSets';

const DRIVER_LABELS = {
  [DEFAULT_DRIVER]: 'any other driver',
  huawei: 'Huawei',
  hp_comware: 'HP/H3C',
  cisco_ios: 'Cisco IOS',
  cisco_nxos: 'Cisco NX-OS',
  juniper_junos: 'Juniper',
  aruba_os: 'Aruba',
  mikrotik_routeros: 'MikroTik',
  raisecom_roap: 'Raisecom',
  linux: 'Linux',
  generic_termserver: 'Generic SSH',
};
const driverLabel = (d) => DRIVER_LABELS[d] || d;
import './HealthCheckPage.css';

const CATEGORIES = [
  { id: 'standard', name: 'Standard Overall Check', desc: 'version, interface brief, device status, cpu-usage' },
  { id: 'interfaces', name: 'Interface Diagnostics', desc: 'Port status, descriptions, speed/duplex, counters' },
  { id: 'transceiver', name: 'Fiber & Transceiver (SFP/SFP+)', desc: 'optical power (Tx/Rx dBm), transceiver alarms' },
  { id: 'environment', name: 'Hardware & Environment', desc: 'CPU, Memory, Fan, Power Supply & Temperature' },
  { id: 'routing', name: 'Routing & ARP Table', desc: 'Routing table, protocols, ARP cache' },
  { id: 'logs', name: 'System Logs (Syslog)', desc: 'Recent log buffer and error messages' },
  { id: 'custom', name: 'Custom Dynamic Playbook', desc: 'Fully customizable command suite & user-defined commands' },
];

const COMMAND_CATALOG = {
  standard: [
    { id: 'std-1', name: 'System Version & Uptime', cisco: 'show version', huawei: 'display version', juniper: 'show version' },
    { id: 'std-2', name: 'IP Interfaces Brief', cisco: 'show ip interface brief', huawei: 'display ip interface brief', juniper: 'show interfaces terse' },
    { id: 'std-3', name: 'Device Hardware Summary', cisco: 'show inventory', huawei: 'display device', juniper: 'show chassis hardware' },
    { id: 'std-4', name: 'CPU & Routing Engine Status', cisco: 'show processes cpu', huawei: 'display cpu-usage', juniper: 'show chassis routing-engine' },
    { id: 'std-5', name: 'Neighbor Topology (LLDP/CDP)', cisco: 'show cdp neighbors', huawei: 'display lldp neighbor brief', juniper: 'show lldp neighbors' },
  ],
  interfaces: [
    { id: 'int-1', name: 'Interface Brief Summary', cisco: 'show ip interface brief', huawei: 'display interface brief', juniper: 'show interfaces terse' },
    { id: 'int-2', name: 'Port Status & Descriptions', cisco: 'show interfaces status', huawei: 'display ip interface brief', juniper: 'show interfaces descriptions' },
    { id: 'int-3', name: 'Port Descriptions Detail', cisco: 'show interfaces description', huawei: 'display interface description', juniper: 'show interfaces descriptions' },
    { id: 'int-4', name: 'Interface Error & Extensive Stats', cisco: 'show interfaces summary', huawei: 'display interface counters', juniper: 'show interfaces extensive' },
  ],
  transceiver: [
    { id: 'sfp-1', name: 'SFP/SFP+ Optical Diagnostics (Tx/Rx dBm)', cisco: 'show interfaces transceiver', huawei: 'display transceiver diagnosis interface', juniper: 'show interfaces diagnostics optics' },
    { id: 'sfp-2', name: 'Optical Module Details & Alarms', cisco: 'show interfaces transceiver detail', huawei: 'display transceiver verbose', juniper: 'show interfaces diagnostics optics' },
    { id: 'sfp-3', name: 'Transceiver Overview', cisco: 'show interfaces status', huawei: 'display transceiver', juniper: 'show interfaces diagnostics optics' },
  ],
  environment: [
    { id: 'env-1', name: 'Chassis Environment (Fan, Temp, Power)', cisco: 'show environment all', huawei: 'display temperature all', juniper: 'show chassis environment' },
    { id: 'env-2', name: 'CPU & Routing Engine Utilization', cisco: 'show processes cpu sorted', huawei: 'display cpu-usage', juniper: 'show chassis routing-engine' },
    { id: 'env-3', name: 'Memory & System Storage', cisco: 'show processes memory', huawei: 'display memory-usage', juniper: 'show system storage' },
    { id: 'env-4', name: 'Chassis Hardware Inventory', cisco: 'show power', huawei: 'display device', juniper: 'show chassis hardware' },
  ],
  routing: [
    { id: 'rt-1', name: 'IPv4 Routing Table', cisco: 'show ip route', huawei: 'display ip routing-table', juniper: 'show route' },
    { id: 'rt-2', name: 'ARP Table Cache', cisco: 'show ip arp', huawei: 'display arp all', juniper: 'show arp' },
    { id: 'rt-3', name: 'Route Summary & Protocols', cisco: 'show ip protocols', huawei: 'display ip routing-table verbose', juniper: 'show route summary' },
  ],
  logs: [
    { id: 'log-1', name: 'Recent Log Buffer (Syslog)', cisco: 'show logging | last 50', huawei: 'display logbuffer', juniper: 'show log messages | last 50' },
    { id: 'log-2', name: 'SNMP Trap / Chassis Messages', cisco: 'show logging', huawei: 'display trapbuffer', juniper: 'show log messages | match SNMP' },
  ],
  custom: [
    { id: 'cus-1', name: 'System Version', cisco: 'show version', huawei: 'display version', juniper: 'show version' },
    { id: 'cus-2', name: 'IP Interface Brief', cisco: 'show ip interface brief', huawei: 'display ip interface brief', juniper: 'show interfaces terse' },
    { id: 'cus-3', name: 'Optical Tx/Rx Power', cisco: 'show interfaces transceiver', huawei: 'display transceiver diagnosis interface', juniper: 'show interfaces diagnostics optics' },
  ],
};

export default function HealthCheckPage({
  fleet = [],
  nornirWorkers = 10,
  onUpdateWorkers,
}) {
  const [selectedCategory, setSelectedCategory] = useState('standard');
  const [running, setRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successToast, setSuccessToast] = useState('');

  // Permanent Playbooks loaded from Backend
  const [playbooks, setPlaybooks] = useState([]);
  const [loadingPlaybooks, setLoadingPlaybooks] = useState(false);
  const [activePlaybookId, setActivePlaybookId] = useState('');

  // Command profile editor: undefined = closed, null = new profile, object = profile to edit
  const [editorPlaybook, setEditorPlaybook] = useState(undefined);
  // Command sets of the loaded profile (null for the built-in categories)
  const [activeSets, setActiveSets] = useState(null);

  // Dynamic Command Checklist State: { [cmdId]: boolean }
  const [activeCommands, setActiveCommands] = useState(COMMAND_CATALOG.standard);
  const [selectedCommandIds, setSelectedCommandIds] = useState(
    new Set(COMMAND_CATALOG.standard.map((c) => c.id))
  );

  // Custom User Commands added via quick inline input
  const [customInput, setCustomInput] = useState('');
  const [customRegex, setCustomRegex] = useState('');

  // Multi-Device Fleet State
  const [activeAsyncJob, setActiveAsyncJob] = useState(null);

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

  // When Category changes, load its default commands catalog
  const handleCategoryChange = (catId) => {
    setSelectedCategory(catId);
    setActivePlaybookId('');
    setActiveSets(null);
    const cmds = COMMAND_CATALOG[catId] || [];
    setActiveCommands(cmds);
    setSelectedCommandIds(new Set(cmds.map((c) => c.id)));
  };

  // Toggle single command in checklist
  const toggleCommand = (cmdId) => {
    setSelectedCommandIds((prev) => {
      const next = new Set(prev);
      if (next.has(cmdId)) {
        next.delete(cmdId);
      } else {
        next.add(cmdId);
      }
      return next;
    });
  };

  // Update regex filter pattern for a specific command
  const handleUpdateCommandRegex = (cmdId, regexVal) => {
    setActiveCommands((prev) =>
      prev.map((c) => (c.id === cmdId ? { ...c, regex: regexVal } : c))
    );
  };

  // Select / Deselect All
  const handleSelectAll = () => {
    setSelectedCommandIds(new Set(activeCommands.map((c) => c.id)));
  };

  const handleClearAll = () => {
    setSelectedCommandIds(new Set());
  };

  // Add Custom Command via Quick Input with regex below
  const handleAddCustomCommand = (e) => {
    e.preventDefault();
    const trimmed = customInput.trim();
    if (!trimmed) return;

    const newId = `custom-cmd-${Date.now()}`;
    const newCmd = {
      id: newId,
      name: trimmed,
      cisco: trimmed,
      huawei: trimmed,
      regex: customRegex.trim() || '',
      isCustom: true,
      // With a profile loaded, a command added here runs in every command set
      ...(activeSets ? { setIndex: 'all' } : {}),
    };

    setActiveCommands((prev) => [...prev, newCmd]);
    setSelectedCommandIds((prev) => new Set([...prev, newId]));
    setCustomInput('');
    setCustomRegex('');
  };

  // Remove Custom Command
  const handleRemoveCustomCommand = (cmdId) => {
    setActiveCommands((prev) => prev.filter((c) => c.id !== cmdId));
    setSelectedCommandIds((prev) => {
      const next = new Set(prev);
      next.delete(cmdId);
      return next;
    });
  };

  // Load a Playbook from permanent storage: its command sets become the checklist
  const handleLoadPlaybook = (playbook) => {
    setSelectedCategory('custom');
    setActivePlaybookId(playbook.id);
    const sets = playbookSets(playbook);
    const cmds = setItems(sets);
    setActiveSets(sets);
    setActiveCommands(cmds);
    setSelectedCommandIds(new Set(cmds.map((c) => c.id)));
    setSuccessToast(`Loaded Profile: "${playbook.name}"`);
    setTimeout(() => setSuccessToast(''), 3000);
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
    if (saved) handleLoadPlaybook(saved);
    setSuccessToast(`Profile "${saved?.name}" ${isNew ? 'created' : 'saved'}.`);
    setTimeout(() => setSuccessToast(''), 3000);
  };

  // Delete Playbook from Backend
  const handleDeletePlaybook = async (playbookId, e) => {
    e.stopPropagation();
    const target = playbooks.find((p) => p.id === playbookId);
    const confirmDelete = window.confirm(
      `Are you sure you want to permanently delete the profile "${target?.name || playbookId}"?`
    );
    if (!confirmDelete) return;

    try {
      await deletePlaybook(playbookId);
      if (activePlaybookId === playbookId) {
        setActivePlaybookId('');
        handleCategoryChange('standard');
      }
      setSuccessToast('Profile deleted successfully.');
      await fetchPlaybooks();
      setTimeout(() => setSuccessToast(''), 3000);
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || err.message || 'Failed to delete profile');
    }
  };

  // Get current active command strings across all vendors
  const getExecutableCommandPayload = () => {
    const selected = activeCommands.filter((c) => selectedCommandIds.has(c.id));
    if (activeSets) {
      const commandSets = setsFromItems(activeSets, selected);
      return {
        commands: commandSets[0]?.commands || [],
        commandRegexes: {},
        vendorCommands: {},
        commandSets,
        selectedCount: selected.length,
      };
    }
    const huaweiCmds = selected.map((c) => c.huawei || c.name);
    const ciscoCmds = selected.map((c) => c.cisco || c.name);
    const juniperCmds = selected.map((c) => c.juniper || c.name);
    const nxosCmds = selected.map((c) => c.nxos || c.cisco || c.name);
    const arubaCmds = selected.map((c) => c.aruba || c.name);
    const mikrotikCmds = selected.map((c) => c.mikrotik || c.name);
    const genericCmds = selected.map((c) => c.huawei || c.name);

    const commandRegexMap = {};
    selected.forEach((c, idx) => {
      const reg = (c.regex || '').trim();
      commandRegexMap[String(idx)] = reg;
      if (reg) {
        if (c.huawei && !commandRegexMap[c.huawei]) commandRegexMap[c.huawei] = reg;
        if (c.cisco && !commandRegexMap[c.cisco]) commandRegexMap[c.cisco] = reg;
        if (c.juniper && !commandRegexMap[c.juniper]) commandRegexMap[c.juniper] = reg;
        if (c.nxos && !commandRegexMap[c.nxos]) commandRegexMap[c.nxos] = reg;
        if (c.aruba && !commandRegexMap[c.aruba]) commandRegexMap[c.aruba] = reg;
        if (c.mikrotik && !commandRegexMap[c.mikrotik]) commandRegexMap[c.mikrotik] = reg;
        if (c.name && !commandRegexMap[c.name]) commandRegexMap[c.name] = reg;
      }
    });

    return {
      commands: genericCmds,
      commandRegexes: commandRegexMap,
      vendorCommands: {
        huawei: huaweiCmds,
        cisco_ios: ciscoCmds,
        cisco_nxos: nxosCmds,
        juniper_junos: juniperCmds,
        aruba_os: arubaCmds,
        hp_comware: huaweiCmds,
        mikrotik_routeros: mikrotikCmds,
      },
      selectedCount: selected.length,
    };
  };

  // Handle Multi-Device Batch Run (Runs all devices in fleet with Background Async Progress Bar)
  const handleRunBatchHealthCheck = async () => {
    const validDevices = fleet.filter((d) => d.host && d.host.trim() !== '');
    if (validDevices.length === 0) {
      setErrorMessage('Please add at least one device IP address in the Target Device fleet list above.');
      return;
    }

    const { commands, commandRegexes, vendorCommands, commandSets, selectedCount } = getExecutableCommandPayload();
    if (selectedCount === 0) {
      setErrorMessage('Please select at least one command from the checklist below.');
      return;
    }

    setRunning(true);
    setErrorMessage('');

    try {
      const devicesPayload = validDevices.map((d) => ({
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

      const catObj = CATEGORIES.find((c) => c.id === selectedCategory);
      const activeProfile = playbooks.find((p) => p.id === activePlaybookId);
      const categoryName = activeProfile ? activeProfile.name : (catObj ? catObj.name : selectedCategory);

      const res = await submitHealthCheckJob(
        devicesPayload,
        selectedCategory,
        commands,
        vendorCommands,
        categoryName,
        nornirWorkers,
        commandRegexes,
        commandSets
      );

      setActiveAsyncJob({
        id: res.job_id,
        title: `Fleet Health Check: ${categoryName} (${selectedCount} cmds • ${validDevices.length.toLocaleString()} Devices)`,
        commandRegexes,
      });
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || err.message || 'Multi-device batch health check failed');
    } finally {
      setRunning(false);
    }
  };

  const validFleetCount = fleet.filter((d) => d.host && d.host.trim() !== '').length;
  const selectedCount = activeCommands.filter((c) => selectedCommandIds.has(c.id)).length;

  return (
    <div className="health-page-container">
      {/* Main Execution Card */}
      <div className="health-card">
        <div className="health-header">
          <div>
            <h2 className="health-title">
              <Layers className="h-5 w-5" style={{ color: '#818cf8' }} />
              <span>Fleet Health Check & Custom Diagnostic Profiles</span>
            </h2>
            <p className="health-subtitle">
              Execute customizable command profiles across all {validFleetCount} devices in fleet concurrently.
            </p>
          </div>

          {/* Action Trigger Button */}
          <button
            onClick={handleRunBatchHealthCheck}
            disabled={running || validFleetCount === 0 || selectedCount === 0}
            className="btn-run-health"
          >
            {running ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Executing Fleet Job...</span>
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" style={{ fill: 'currentColor' }} />
                <span>
                  Run Fleet Suite ({selectedCount} Cmds • {validFleetCount} Devs)
                </span>
              </>
            )}
          </button>
        </div>

        {/* ========================================================================= */}
        {/* PLAYBOOK PROFILE MANAGER BAR (CRUD)                                       */}
        {/* ========================================================================= */}
        <div className="playbook-selector-bar">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
            <span className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
              <Bookmark className="h-3.5 w-3.5 text-indigo-400" />
              <span>Saved Command Profiles:</span>
            </span>

            {/* Create New Profile Button */}
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

          <div className="flex items-center gap-2 flex-wrap">
            {loadingPlaybooks ? (
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading profiles...
              </span>
            ) : playbooks.length === 0 ? (
              <span className="text-xs text-slate-500">No profiles created yet. Click "Create New Profile" to create one.</span>
            ) : (
              playbooks.map((pb) => (
                <div
                  key={pb.id}
                  onClick={() => handleLoadPlaybook(pb)}
                  className={`playbook-pill ${activePlaybookId === pb.id ? 'active' : ''}`}
                  title={pb.description || pb.name}
                >
                  <FolderOpen className="h-3 w-3 text-indigo-400" />
                  <span>{pb.name}</span>
                  <span className="cmd-badge">{profileCommandCount(pb)}</span>

                  {/* Edit Profile Button */}
                  <button
                    type="button"
                    onClick={(e) => handleOpenEditModal(pb, e)}
                    className="edit-pb-btn"
                    title="Edit profile commands"
                  >
                    <Edit2 className="h-3 w-3" />
                  </button>

                  {/* Delete Profile Button */}
                  <button
                    type="button"
                    onClick={(e) => handleDeletePlaybook(pb.id, e)}
                    className="del-pb-btn"
                    title="Delete profile"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Category Pills */}
        <div className="categories-grid mt-3">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategoryChange(cat.id)}
              className={`category-btn ${selectedCategory === cat.id && !activePlaybookId ? 'selected' : ''}`}
            >
              <p className="category-name">{cat.name}</p>
              <p className="category-desc">{cat.desc}</p>
            </button>
          ))}
        </div>

        {/* ========================================================================= */}
        {/* INTERACTIVE COMMAND CHECKLIST & CUSTOM COMMAND INJECTION                  */}
        {/* ========================================================================= */}
        <div className="command-checklist-container mt-4">
          <div className="checklist-header">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-indigo-400" />
              <h3 className="checklist-title">
                Active Test Suite Commands
              </h3>
              <span className="checklist-badge">
                {selectedCount} of {activeCommands.length} Selected
              </span>
            </div>

            <div className="checklist-actions">
              <button
                type="button"
                onClick={handleSelectAll}
                className="btn-checklist-action"
              >
                <CheckSquare className="h-3.5 w-3.5" />
                <span>Select All</span>
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                className="btn-checklist-action"
              >
                <Square className="h-3.5 w-3.5" />
                <span>Clear All</span>
              </button>
            </div>
          </div>

          {/* List of Command Checkboxes */}
          <div className="command-checkbox-list">
            {activeCommands.map((cmd) => {
              const isChecked = selectedCommandIds.has(cmd.id);
              return (
                <div
                  key={cmd.id}
                  className={`command-check-item ${isChecked ? 'checked' : ''}`}
                  onClick={() => toggleCommand(cmd.id)}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleCommand(cmd.id)}
                    className="checkbox-input"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="command-check-label">{cmd.name}</span>
                      {cmd.isCustom && (
                        <span className="custom-tag">User Custom</span>
                      )}
                    </div>
                    <div className="command-syntax-preview">
                      {cmd.drivers ? (
                        <span className="syntax-pill huawei">For: {cmd.drivers.map(driverLabel).join(', ')}</span>
                      ) : cmd.setIndex === 'all' ? (
                        <span className="syntax-pill huawei">For: every command set</span>
                      ) : (
                        <>
                          <span className="syntax-pill cisco">Cisco: {cmd.cisco}</span>
                          <span className="syntax-pill huawei">Huawei: {cmd.huawei}</span>
                        </>
                      )}
                    </div>

                    {/* Dedicated Regex Input Row Underneath Command */}
                    <div
                      className="command-regex-row"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-1.5 mb-1 text-[11px] text-slate-400 font-medium">
                        <Filter className="h-3 w-3 text-indigo-400 flex-shrink-0" />
                        <span>Regex Filter (Optional):</span>
                      </div>
                      <input
                        type="text"
                        value={cmd.regex || ''}
                        onChange={(e) => handleUpdateCommandRegex(cmd.id, e.target.value)}
                        placeholder="e.g. ^.*\\b(up|down|error)\\b.* (Leave empty for no regex)"
                        className="command-regex-input"
                      />
                    </div>
                  </div>

                  {cmd.isCustom && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveCustomCommand(cmd.id);
                      }}
                      className="btn-remove-cmd"
                      title="Remove custom command"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add Custom Command Box with Regex Input Directly Below */}
          <form onSubmit={handleAddCustomCommand} className="add-custom-command-box">
            <div className="custom-cmd-input-row">
              <Terminal className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="CLI Command (e.g. display lacp verbose or show ip ospf neighbor)..."
                className="custom-cmd-input"
              />
              <button
                type="submit"
                disabled={!customInput.trim()}
                className="btn-add-custom-cmd flex-shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Command</span>
              </button>
            </div>
            <div className="custom-regex-input-row">
              <Filter className="h-3.5 w-3.5 text-indigo-400 flex-shrink-0" />
              <input
                type="text"
                value={customRegex}
                onChange={(e) => setCustomRegex(e.target.value)}
                placeholder="Regex filter for this command (Optional - leave empty for no regex)..."
                className="custom-regex-input"
              />
            </div>
          </form>
        </div>

        {/* Notifications */}
        {successToast && (
          <div className="alert-box success-alert mt-3">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-400" />
            <span>{successToast}</span>
          </div>
        )}

        {errorMessage && (
          <div className="alert-box mt-3">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {editorPlaybook !== undefined && (
        <CommandProfileEditor
          playbook={editorPlaybook}
          onClose={() => setEditorPlaybook(undefined)}
          onSaved={handleEditorSaved}
        />
      )}

      {/* ASYNC FLEET HEALTH CHECK MODAL */}
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
