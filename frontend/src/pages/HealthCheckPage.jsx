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
} from 'lucide-react';
import {
  runHealthCheck,
  runBatchHealthCheck,
  submitHealthCheckJob,
  getPlaybooks,
  createPlaybook,
  updatePlaybook,
  deletePlaybook,
} from '../services/api';
import TerminalOutput from '../components/TerminalOutput';
import AsyncJobModal from '../components/AsyncJobModal';
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
    { id: 'std-1', name: 'System Version & Uptime', cisco: 'show version', huawei: 'display version' },
    { id: 'std-2', name: 'IP Interfaces Brief', cisco: 'show ip interface brief', huawei: 'display ip interface brief' },
    { id: 'std-3', name: 'Device Hardware Summary', cisco: 'show inventory', huawei: 'display device' },
    { id: 'std-4', name: 'CPU Utilization', cisco: 'show processes cpu', huawei: 'display cpu-usage' },
    { id: 'std-5', name: 'Neighbor Topology (LLDP/CDP)', cisco: 'show cdp neighbors', huawei: 'display lldp neighbor brief' },
  ],
  interfaces: [
    { id: 'int-1', name: 'Interface Brief Summary', cisco: 'show ip interface brief', huawei: 'display interface brief' },
    { id: 'int-2', name: 'Port Status & Speed/Duplex', cisco: 'show interfaces status', huawei: 'display ip interface brief' },
    { id: 'int-3', name: 'Port Descriptions', cisco: 'show interfaces description', huawei: 'display interface description' },
    { id: 'int-4', name: 'Interface Error & Drop Counters', cisco: 'show interfaces summary', huawei: 'display interface counters' },
  ],
  transceiver: [
    { id: 'sfp-1', name: 'SFP/SFP+ Optical Power (Tx/Rx dBm)', cisco: 'show interfaces transceiver', huawei: 'display transceiver diagnosis interface' },
    { id: 'sfp-2', name: 'Optical Module Details & Alarms', cisco: 'show interfaces transceiver detail', huawei: 'display transceiver verbose' },
    { id: 'sfp-3', name: 'Transceiver Brief Overview', cisco: 'show interfaces status', huawei: 'display transceiver' },
  ],
  environment: [
    { id: 'env-1', name: 'Hardware Environment (Fan, Temp, Power)', cisco: 'show environment all', huawei: 'display temperature all' },
    { id: 'env-2', name: 'CPU Usage Breakdown', cisco: 'show processes cpu sorted', huawei: 'display cpu-usage' },
    { id: 'env-3', name: 'Memory Pool Allocation', cisco: 'show processes memory', huawei: 'display memory-usage' },
    { id: 'env-4', name: 'Power Supply Status', cisco: 'show power', huawei: 'display device' },
  ],
  routing: [
    { id: 'rt-1', name: 'IPv4 Routing Table', cisco: 'show ip route', huawei: 'display ip routing-table' },
    { id: 'rt-2', name: 'ARP Table Cache', cisco: 'show ip arp', huawei: 'display arp all' },
    { id: 'rt-3', name: 'Routing Protocols & Peering', cisco: 'show ip protocols', huawei: 'display ip routing-table verbose' },
  ],
  logs: [
    { id: 'log-1', name: 'Recent Log Buffer (Syslog)', cisco: 'show logging | last 50', huawei: 'display logbuffer' },
    { id: 'log-2', name: 'SNMP Trap Messages', cisco: 'show logging', huawei: 'display trapbuffer' },
  ],
  custom: [
    { id: 'cus-1', name: 'System Version', cisco: 'show version', huawei: 'display version' },
    { id: 'cus-2', name: 'IP Interface Brief', cisco: 'show ip interface brief', huawei: 'display ip interface brief' },
    { id: 'cus-3', name: 'Optical Tx/Rx Power', cisco: 'show interfaces transceiver', huawei: 'display transceiver diagnosis interface' },
  ],
};

export default function HealthCheckPage({
  deviceMode = 'multi',
  device,
  fleet = [],
}) {
  const [selectedCategory, setSelectedCategory] = useState('standard');
  const [running, setRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successToast, setSuccessToast] = useState('');

  // Permanent Playbooks loaded from Backend
  const [playbooks, setPlaybooks] = useState([]);
  const [loadingPlaybooks, setLoadingPlaybooks] = useState(false);
  const [activePlaybookId, setActivePlaybookId] = useState('');

  // Profile Editor Modal State (1. Title, 2. Description, 3. Commands by Manufacturer)
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [editingPlaybookId, setEditingPlaybookId] = useState(null); // null = new, string = edit
  const [editorName, setEditorName] = useState('');
  const [editorDesc, setEditorDesc] = useState('');
  const [editorCiscoText, setEditorCiscoText] = useState('');
  const [editorHuaweiText, setEditorHuaweiText] = useState('');

  // Dynamic Command Checklist State: { [cmdId]: boolean }
  const [activeCommands, setActiveCommands] = useState(COMMAND_CATALOG.standard);
  const [selectedCommandIds, setSelectedCommandIds] = useState(
    new Set(COMMAND_CATALOG.standard.map((c) => c.id))
  );

  // Custom User Commands added via quick inline input
  const [customInput, setCustomInput] = useState('');

  // Single Device State
  const [healthData, setHealthData] = useState(null);
  const [cachedSummary, setCachedSummary] = useState(null);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

  // Multi-Device Fleet State
  const [batchResults, setBatchResults] = useState(null);
  const [inspectDeviceIndex, setInspectDeviceIndex] = useState(null);
  const [inspectCommandIndex, setInspectCommandIndex] = useState(0);
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

  // Select / Deselect All
  const handleSelectAll = () => {
    setSelectedCommandIds(new Set(activeCommands.map((c) => c.id)));
  };

  const handleClearAll = () => {
    setSelectedCommandIds(new Set());
  };

  // Add Custom Command via Quick Input
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
      isCustom: true,
    };

    setActiveCommands((prev) => [...prev, newCmd]);
    setSelectedCommandIds((prev) => new Set([...prev, newId]));
    setCustomInput('');
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

  // Load a Playbook from permanent storage
  const handleLoadPlaybook = (playbook) => {
    setSelectedCategory('custom');
    setActivePlaybookId(playbook.id);
    const cmds = (playbook.commands || []).map((c, i) => {
      const cmdName = typeof c === 'string' ? c : (c.name || c.cisco || c.huawei || `Command ${i + 1}`);
      return {
        id: c.id || `pb-cmd-${i + 1}`,
        name: cmdName,
        cisco: typeof c === 'string' ? c : (c.cisco || cmdName),
        huawei: typeof c === 'string' ? c : (c.huawei || cmdName),
        isCustom: typeof c === 'string' ? false : (c.isCustom || false),
      };
    });
    setActiveCommands(cmds);
    setSelectedCommandIds(new Set(cmds.map((c) => c.id)));
    setSuccessToast(`Loaded Profile: "${playbook.name}"`);
    setTimeout(() => setSuccessToast(''), 3000);
  };

  // Open Editor Modal to Create New Profile (1. Title, 2. Description, 3. Commands by Manufacturer)
  const handleOpenCreateModal = () => {
    setEditingPlaybookId(null);
    setEditorName('');
    setEditorDesc('');
    // Prefill with currently selected commands if any
    const selected = activeCommands.filter((c) => selectedCommandIds.has(c.id));
    if (selected.length > 0) {
      setEditorCiscoText(selected.map((c) => c.cisco || c.name).join('\n'));
      setEditorHuaweiText(selected.map((c) => c.huawei || c.name).join('\n'));
    } else {
      setEditorCiscoText('show version\nshow ip interface brief\nshow ip route\nshow processes cpu');
      setEditorHuaweiText('display version\ndisplay ip interface brief\ndisplay ip routing-table\ndisplay cpu-usage');
    }
    setShowEditorModal(true);
  };

  // Open Editor Modal to Edit Existing Profile
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

  // Save / Update Playbook to Backend
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
        // Update existing
        await updatePlaybook(editingPlaybookId, payload);
        setSuccessToast(`Profile "${name}" updated successfully.`);
      } else {
        // Create new
        const created = await createPlaybook(payload);
        setActivePlaybookId(created.id);
        setSuccessToast(`Profile "${name}" created and saved permanently.`);
      }

      setShowEditorModal(false);
      await fetchPlaybooks();
      setTimeout(() => setSuccessToast(''), 3500);
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || err.message || 'Failed to save profile');
    }
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

  // Get current active command strings
  const getExecutableCommandPayload = () => {
    const selected = activeCommands.filter((c) => selectedCommandIds.has(c.id));
    const ciscoCmds = selected.map((c) => c.cisco || c.name);
    const huaweiCmds = selected.map((c) => c.huawei || c.name);
    const genericCmds = selected.map((c) => c.name);

    return {
      commands: genericCmds,
      vendorCommands: {
        cisco_ios: ciscoCmds,
        huawei: huaweiCmds,
      },
      selectedCount: selected.length,
    };
  };

  // Handle Single Device Run
  const handleRunSingleHealthCheck = async () => {
    if (!device?.host) {
      setErrorMessage('Please fill in Device Host / IP Address in the Target Device section above.');
      return;
    }

    const { commands, vendorCommands, selectedCount } = getExecutableCommandPayload();
    if (selectedCount === 0) {
      setErrorMessage('Please select at least one command from the checklist below.');
      return;
    }

    setRunning(true);
    setErrorMessage('');

    try {
      const data = await runHealthCheck(device, selectedCategory, commands, vendorCommands);
      setHealthData(data);
      setSelectedCommandIndex(0);

      if (data.summary) {
        setCachedSummary((prev) => {
          if (!prev) return data.summary;
          return {
            device_info: data.summary.device_info?.model !== 'Unknown Model' ? data.summary.device_info : prev.device_info,
            performance: data.summary.performance?.cpu_percent ? data.summary.performance : prev.performance,
            ports_summary: data.summary.ports_summary?.total_ports > 0 ? data.summary.ports_summary : prev.ports_summary,
            hardware_health: data.summary.hardware_health?.status ? data.summary.hardware_health : prev.hardware_health,
          };
        });
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || err.message || 'Health check execution failed');
    } finally {
      setRunning(false);
    }
  };

  // Handle Multi-Device Batch Run (Runs all devices in fleet with Background Async Progress Bar)
  const handleRunBatchHealthCheck = async () => {
    const validDevices = fleet.filter((d) => d.host && d.host.trim() !== '');
    if (validDevices.length === 0) {
      setErrorMessage('Please add at least one device IP address in the Target Device fleet list above.');
      return;
    }

    const { commands, vendorCommands, selectedCount } = getExecutableCommandPayload();
    if (selectedCount === 0) {
      setErrorMessage('Please select at least one command from the checklist below.');
      return;
    }

    setRunning(true);
    setErrorMessage('');

    try {
      const devicesPayload = validDevices.map((d) => ({
        host: d.host.trim(),
        port: parseInt(d.port, 10) || 22,
        device_type: d.device_type || 'cisco_ios',
        username: d.username || '',
        password: d.password || '',
        secret: d.secret || '',
        connection_mode: 'network',
      }));

      const catObj = CATEGORIES.find((c) => c.id === selectedCategory);
      const activeProfile = playbooks.find((p) => p.id === activePlaybookId);
      const categoryName = activeProfile ? activeProfile.name : (catObj ? catObj.name : selectedCategory);

      const res = await submitHealthCheckJob(
        devicesPayload,
        selectedCategory,
        commands,
        vendorCommands,
        categoryName
      );

      setActiveAsyncJob({
        id: res.job_id,
        title: `Fleet Health Check: ${categoryName} (${selectedCount} cmds • ${validDevices.length.toLocaleString()} Devices)`,
      });
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || err.message || 'Multi-device batch health check failed');
    } finally {
      setRunning(false);
    }
  };

  const activeResult = healthData?.results?.[selectedCommandIndex];
  const activeInspectDevice = inspectDeviceIndex !== null && batchResults?.results?.[inspectDeviceIndex];
  const activeInspectCommand = activeInspectDevice?.results?.[inspectCommandIndex];

  const validFleetCount = fleet.filter((d) => d.host && d.host.trim() !== '').length;
  const selectedCount = activeCommands.filter((c) => selectedCommandIds.has(c.id)).length;

  return (
    <div className="health-page-container">
      {/* Main Execution Card */}
      <div className="health-card">
        <div className="health-header">
          <div>
            <h2 className="health-title">
              {deviceMode === 'multi' ? (
                <>
                  <Layers className="h-5 w-5" style={{ color: '#818cf8' }} />
                  <span>Fleet Health Check & Custom Diagnostic Profiles</span>
                </>
              ) : (
                <>
                  <Activity className="h-5 w-5" style={{ color: '#818cf8' }} />
                  <span>Single Device Health Check & Diagnostic Profiles</span>
                </>
              )}
            </h2>
            <p className="health-subtitle">
              {deviceMode === 'multi'
                ? `Execute customizable command profiles across all ${validFleetCount} devices in fleet concurrently.`
                : `Execute customizable command profiles on ${device?.host || 'target host'}.`}
            </p>
          </div>

          {/* Action Trigger Button */}
          {deviceMode === 'multi' ? (
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
          ) : (
            <button
              onClick={handleRunSingleHealthCheck}
              disabled={running || !device?.host || selectedCount === 0}
              className="btn-run-health"
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Running Suite...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" style={{ fill: 'currentColor' }} />
                  <span>Run Selected Suite ({selectedCount} Cmds)</span>
                </>
              )}
            </button>
          )}
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
                  <span className="cmd-badge">{pb.commands?.length || 0}</span>

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
                      <span className="syntax-pill cisco">Cisco: {cmd.cisco}</span>
                      <span className="syntax-pill huawei">Huawei: {cmd.huawei}</span>
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

          {/* Add Custom Command Bar */}
          <form onSubmit={handleAddCustomCommand} className="add-custom-command-bar">
            <Terminal className="h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="Add any custom CLI command to this suite (e.g. display lacp verbose, show ip ospf neighbor)..."
              className="custom-cmd-input"
            />
            <button
              type="submit"
              disabled={!customInput.trim()}
              className="btn-add-custom-cmd"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Command</span>
            </button>
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

      {/* ========================================================================= */}
      {/* PROFILE EDITOR MODAL (CREATE / EDIT PERMANENT PROFILE)                     */}
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




      {/* ========================================================================= */}
      {/* SINGLE DEVICE RESULTS BREAKDOWN (CLI)                                     */}
      {/* ========================================================================= */}
      {deviceMode === 'single' && healthData && (
        <div className="health-results-grid">
          {/* Left Column: Command List */}
          <div className="col-span-4 command-list-card">
            <div className="command-list-header">
              <span className="command-list-title">
                <ListChecks className="h-4 w-4" style={{ color: '#818cf8' }} />
                <span>Command Execution List</span>
              </span>
              <span className="total-time">
                Total: {healthData.overall_time_seconds}s
              </span>
            </div>

            <div className="command-items">
              {healthData.results.map((res, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedCommandIndex(idx)}
                  className={`command-item-btn ${selectedCommandIndex === idx ? 'active' : ''}`}
                >
                  <div className="command-item-left">
                    {res.success ? (
                      <CheckCircle2 className="h-4 w-4" style={{ color: '#34d399', flexShrink: 0 }} />
                    ) : (
                      <AlertTriangle className="h-4 w-4" style={{ color: '#f87171', flexShrink: 0 }} />
                    )}
                    <span className="command-item-text">{res.command}</span>
                  </div>
                  <span className="command-item-time">
                    {res.execution_time_seconds}s
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Right Column: Terminal Display */}
          <div className="col-span-8" style={{ height: '500px' }}>
            <TerminalOutput
              title="Health Check Output"
              command={activeResult?.command}
              output={activeResult?.output || activeResult?.error}
              executionTime={activeResult?.execution_time_seconds}
              isError={!activeResult?.success}
            />
          </div>
        </div>
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
