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
  autoTranslateCommands,
} from '../services/api';
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

  // Profile Editor Modal State (1. Title, 2. Description, 3. Commands with Huawei as Primary)
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [editingPlaybookId, setEditingPlaybookId] = useState(null); // null = new, string = edit
  const [editorName, setEditorName] = useState('');
  const [editorDesc, setEditorDesc] = useState('');
  const [customVendors, setCustomVendors] = useState([]); // ['cisco', 'juniper', 'aruba', 'mikrotik']
  const [editorHuaweiText, setEditorHuaweiText] = useState('');
  const [editorCiscoText, setEditorCiscoText] = useState('');
  const [editorJuniperText, setEditorJuniperText] = useState('');
  const [editorArubaText, setEditorArubaText] = useState('');
  const [editorMikrotikText, setEditorMikrotikText] = useState('');
  const [translating, setTranslating] = useState(false);

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

  // Load a Playbook from permanent storage
  const handleLoadPlaybook = (playbook) => {
    setSelectedCategory('custom');
    setActivePlaybookId(playbook.id);
    const cmds = (playbook.commands || []).map((c, i) => {
      const cmdName = typeof c === 'string' ? c : (c.name || c.huawei || c.cisco || `Command ${i + 1}`);
      return {
        id: c.id || `pb-cmd-${i + 1}`,
        name: cmdName,
        huawei: typeof c === 'string' ? c : (c.huawei || cmdName),
        cisco: typeof c === 'string' ? c : (c.cisco || cmdName),
        juniper: typeof c === 'string' ? c : (c.juniper || cmdName),
        nxos: typeof c === 'string' ? c : (c.nxos || c.cisco || cmdName),
        aruba: typeof c === 'string' ? c : (c.aruba || cmdName),
        mikrotik: typeof c === 'string' ? c : (c.mikrotik || cmdName),
        regex: typeof c === 'object' ? (c.regex || '') : '',
        isCustom: typeof c === 'string' ? false : (c.isCustom || false),
      };
    });
    setActiveCommands(cmds);
    setSelectedCommandIds(new Set(cmds.map((c) => c.id)));
    setSuccessToast(`Loaded Profile: "${playbook.name}"`);
    setTimeout(() => setSuccessToast(''), 3000);
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

  // Open Editor Modal to Create New Profile (Huawei VRP as Primary)
  const handleOpenCreateModal = () => {
    setEditingPlaybookId(null);
    setEditorName('');
    setEditorDesc('');
    setCustomVendors([]); // Default clean: only Huawei box is shown

    const selected = activeCommands.filter((c) => selectedCommandIds.has(c.id));
    if (selected.length > 0) {
      const hText = selected.map((c) => c.huawei || c.name).join('\n');
      const cText = selected.map((c) => c.cisco || c.name).join('\n');
      const jText = selected.map((c) => c.juniper || c.name).join('\n');
      const aText = selected.map((c) => c.aruba || c.name).join('\n');
      const mText = selected.map((c) => c.mikrotik || c.name).join('\n');

      setEditorHuaweiText(hText);
      setEditorCiscoText(cText);
      setEditorJuniperText(jText);
      setEditorArubaText(aText);
      setEditorMikrotikText(mText);
    } else {
      const defaultHuawei = 'display version\ndisplay interface brief\ndisplay ip routing-table\ndisplay cpu-usage';
      setEditorHuaweiText(defaultHuawei);
      setEditorCiscoText('');
      setEditorJuniperText('');
      setEditorArubaText('');
      setEditorMikrotikText('');
    }
    setShowEditorModal(true);
  };

  // Open Editor Modal to Edit Existing Profile
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

  // Save / Update Playbook to Backend
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
        // Update existing
        await updatePlaybook(editingPlaybookId, payload);
        setSuccessToast(`Profile "${name}" updated successfully.`);
      } else {
        // Create new
        const created = await createPlaybook(payload);
        setActivePlaybookId(created.id);
        setSuccessToast(`Profile "${name}" created with multi-vendor auto-translation.`);
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

  // Get current active command strings across all vendors
  const getExecutableCommandPayload = () => {
    const selected = activeCommands.filter((c) => selectedCommandIds.has(c.id));
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

    const { commands, commandRegexes, vendorCommands, selectedCount } = getExecutableCommandPayload();
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
        commandRegexes
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
