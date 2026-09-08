import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  FileCode,
  CheckSquare,
  Square,
  AlertTriangle,
  Loader2,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  Download,
  Copy,
  Upload,
  RotateCcw,
  History,
  Check,
  Terminal as TerminalIcon,
  Sliders,
  Layers,
  Wrench,
  Undo2,
  FileText,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  EyeOff,
  Database,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  HardDrive,
  RefreshCw,
  Plus,
} from 'lucide-react';
import {
  submitDeployJob,
  submitBackupJob,
} from '../services/api';
import TerminalOutput, { maskSensitiveCli } from '../components/TerminalOutput';
import AsyncJobModal from '../components/AsyncJobModal';
import './DeployConfigPage.css';

// Multi-vendor battle-tested configuration templates
const VENDOR_TEMPLATES = {
  huawei: [
    {
      category: 'VLAN & L2 Switching',
      title: 'Create VLANs & Names',
      desc: 'Define VLANs with meaningful names',
      config: `vlan 10\n description USERS_DATA\nvlan 20\n description VOIP_PHONES\nvlan 99\n description MANAGEMENT`,
    },
    {
      category: 'VLAN & L2 Switching',
      title: 'Access Port (with STP Edged-Port)',
      desc: 'Set access port, assign VLAN and enable fast port state',
      config: `interface GigabitEthernet0/0/1\n description User Workstation Access Port\n port link-type access\n port default vlan 10\n stp edged-port enable\n undo shutdown`,
    },
    {
      category: 'VLAN & L2 Switching',
      title: '802.1Q Trunk Port',
      desc: 'Uplink trunk port allowing specific VLANs',
      config: `interface GigabitEthernet0/0/24\n description Uplink to Core Switch\n port link-type trunk\n port trunk allow-pass vlan 10 20 99\n undo shutdown`,
    },
    {
      category: 'VLAN & L2 Switching',
      title: 'Eth-Trunk (LACP Link Aggregation)',
      desc: 'Create dynamic LACP Eth-Trunk and add physical member ports',
      config: `interface Eth-Trunk 1\n mode lacp-static\n port link-type trunk\n port trunk allow-pass vlan 10 20 99\ninterface GigabitEthernet0/0/23\n eth-trunk 1\ninterface GigabitEthernet0/0/24\n eth-trunk 1`,
    },
    {
      category: 'IP & L3 Routing',
      title: 'VLAN Interface (SVI / Gateway)',
      desc: 'Configure IP address and description on VLANIF',
      config: `interface Vlanif10\n description Users VLAN 10\n ip address 192.168.10.1 255.255.255.0\n undo shutdown`,
    },
    {
      category: 'IP & L3 Routing',
      title: 'Static Default Route',
      desc: 'Configure default gateway static route',
      config: `ip route-static 0.0.0.0 0.0.0.0 192.168.99.1`,
    },
    {
      category: 'IP & L3 Routing',
      title: 'OSPF Single Area Configuration',
      desc: 'Enable OSPF process and advertise local network',
      config: `ospf 1 router-id 1.1.1.1\n area 0.0.0.0\n  network 192.168.10.0 0.0.0.255\n  network 192.168.20.0 0.0.0.255`,
    },
    {
      category: 'System & Services',
      title: 'Sysname & System Header / MOTD',
      desc: 'Set switch hostname and authorization banner',
      config: `sysname SW-CORE-01\nheader login information #\n================================================\n* AUTHORIZED ACCESS ONLY - ALL ACTIVITY LOGGED *\n================================================\n#`,
    },
    {
      category: 'System & Services',
      title: 'NTP Client & Syslog Server',
      desc: 'Synchronize clock and send logs to central syslog',
      config: `ntp-service unicast-server 192.168.1.50\nclock timezone BKK add 07:00:00\ninfo-center enable\ninfo-center loghost 192.168.1.50`,
    },
    {
      category: 'Security & AAA',
      title: 'SSH & Local AAA User Setup',
      desc: 'Enable Stelnet/SSH and create administrator user',
      config: `stelnet server enable\naaa\n local-user admin password irreversible-cipher Admin@2026Secure!\n local-user admin service-type ssh terminal\n local-user admin privilege level 15\nuser-interface vty 0 4\n authentication-mode aaa\n protocol inbound ssh`,
    },
    {
      category: 'Security & AAA',
      title: 'Basic ACL (Permit Specific Subnet)',
      desc: 'Create basic IPv4 ACL rule',
      config: `acl number 2000\n rule 5 permit source 192.168.10.0 0.0.0.255\n rule 10 deny any`,
    },
    {
      category: 'DHCP Services',
      title: 'Local DHCP Pool Configuration',
      desc: 'Enable DHCP service and configure pool parameters',
      config: `dhcp enable\nip pool USERS_POOL\n network 192.168.10.0 mask 255.255.255.0\n gateway-list 192.168.10.1\n dns-list 8.8.8.8 1.1.1.1\n lease day 1`,
    },
  ],
  cisco_ios: [
    {
      category: 'VLAN & L2 Switching',
      title: 'Create VLAN & Name',
      desc: 'Define VLANs with names',
      config: `vlan 10\n name USERS_DATA\nvlan 20\n name VOIP_PHONES\nvlan 99\n name MANAGEMENT`,
    },
    {
      category: 'VLAN & L2 Switching',
      title: 'Configure Access Port',
      desc: 'Assign access port to VLAN with PortFast enabled',
      config: `interface GigabitEthernet0/1\n description User Access Port\n switchport mode access\n switchport access vlan 10\n spanning-tree portfast\n no shutdown`,
    },
    {
      category: 'VLAN & L2 Switching',
      title: 'Configure Trunk Port',
      desc: '802.1Q Trunk uplink to core switch',
      config: `interface GigabitEthernet0/24\n description Uplink to Core Switch\n switchport trunk encapsulation dot1q\n switchport mode trunk\n switchport trunk allowed vlan 10,20,99\n no shutdown`,
    },
    {
      category: 'VLAN & L2 Switching',
      title: 'Port-Channel (LACP Aggregation)',
      desc: 'Create LACP channel group and add member ports',
      config: `interface Port-channel 1\n switchport mode trunk\n switchport trunk allowed vlan 10,20,99\ninterface range GigabitEthernet0/23 - 24\n channel-group 1 mode active\n no shutdown`,
    },
    {
      category: 'IP & L3 Routing',
      title: 'SVI / VLAN Interface IP',
      desc: 'Configure IP address on SVI',
      config: `interface Vlan10\n description Users VLAN 10\n ip address 192.168.10.1 255.255.255.0\n no shutdown`,
    },
    {
      category: 'IP & L3 Routing',
      title: 'Static Default Route',
      desc: 'Configure static default route',
      config: `ip route 0.0.0.0 0.0.0.0 192.168.99.1`,
    },
    {
      category: 'IP & L3 Routing',
      title: 'OSPF Single Area Configuration',
      desc: 'Enable OSPF process and network statements',
      config: `router ospf 1\n router-id 1.1.1.1\n network 192.168.10.0 0.0.0.255 area 0\n network 192.168.20.0 0.0.0.255 area 0`,
    },
    {
      category: 'System & Services',
      title: 'Hostname & Banner MOTD',
      desc: 'Set switch hostname and banner message',
      config: `hostname SW-CORE-01\nbanner motd #\n************************************************\n* AUTHORIZED ACCESS ONLY - ALL ACTIVITY LOGGED *\n************************************************\n#`,
    },
    {
      category: 'System & Services',
      title: 'NTP & Syslog Server',
      desc: 'Time synchronization and remote logging',
      config: `ntp server 192.168.1.50\nlogging host 192.168.1.50\nlogging trap warnings\nservice timestamps log datetime msec`,
    },
    {
      category: 'Security & AAA',
      title: 'SSH & Local Admin User',
      desc: 'Configure crypto key, local user and SSH VTY lines',
      config: `username admin privilege 15 secret Admin@2026Secure!\nip domain-name localnet.internal\ncrypto key generate rsa modulus 2048\nline vty 0 4\n login local\n transport input ssh`,
    },
    {
      category: 'Security & AAA',
      title: 'Standard ACL',
      desc: 'Permit management subnet only',
      config: `ip access-list standard MGMT_ACCESS\n permit 192.168.10.0 0.0.0.255\n deny any log`,
    },
    {
      category: 'DHCP Services',
      title: 'DHCP Pool & Excluded Addresses',
      desc: 'Configure local DHCP server pool',
      config: `ip dhcp excluded-address 192.168.10.1 192.168.10.10\nip dhcp pool USERS_POOL\n network 192.168.10.0 255.255.255.0\n default-router 192.168.10.1\n dns-server 8.8.8.8 1.1.1.1\n lease 1`,
    },
  ],
  aruba_os: [
    {
      category: 'VLAN & L2 Switching',
      title: 'Create VLAN & Tagged Ports',
      desc: 'Define VLAN and assign untagged / tagged interfaces',
      config: `vlan 10\n name "USERS_DATA"\n untagged 1/1/1-1/1/20\n tagged 1/1/24\n no shutdown`,
    },
    {
      category: 'IP & L3 Routing',
      title: 'VLAN Interface IP & Default Gateway',
      desc: 'Assign IP to VLAN interface and set gateway',
      config: `interface vlan 10\n ip address 192.168.10.1/24\n no shutdown\nip route 0.0.0.0/0 192.168.99.1`,
    },
    {
      category: 'System & Services',
      title: 'Hostname, Syslog & NTP',
      desc: 'System settings for Aruba CX',
      config: `hostname SW-ARUBA-01\nntp server 192.168.1.50\nlogging 192.168.1.50`,
    },
  ],
  juniper_junos: [
    {
      category: 'VLAN & L2 Switching',
      title: 'Create VLAN and Access Port',
      desc: 'Define VLAN and bind interface to switching unit',
      config: `set vlans USERS_DATA vlan-id 10\nset interfaces ge-0/0/1 unit 0 family ethernet-switching interface-mode access\nset interfaces ge-0/0/1 unit 0 family ethernet-switching vlan members USERS_DATA`,
    },
    {
      category: 'IP & L3 Routing',
      title: 'IRB Interface & Default Route',
      desc: 'Configure Integrated Routing and Bridging interface',
      config: `set interfaces irb unit 10 family inet address 192.168.10.1/24\nset vlans USERS_DATA l3-interface irb.10\nset routing-options static route 0.0.0.0/0 next-hop 192.168.99.1`,
    },
  ],
};

// Dangerous command detection rules for safety linting
const CRITICAL_KEYWORDS = [
  'reload',
  'reboot',
  'write erase',
  'erase startup-config',
  'format flash',
  'reset saved-configuration',
  'default interface',
  'delete /unreserved',
];

const WARNING_KEYWORDS = [
  'shutdown',
  'undo shutdown',
  'no ip route 0.0.0.0',
  'undo ip route-static 0.0.0.0',
  'no service password-encryption',
];

export default function DeployConfigPage({
  fleet = [],
  nornirWorkers = 10,
  onUpdateWorkers,
}) {
  // Main Script Editor State
  const [configText, setConfigText] = useState('');
  const [activeVendor, setActiveVendor] = useState('huawei');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [templateSearch, setTemplateSearch] = useState('');

  // Deploy Options
  const [saveConfig, setSaveConfig] = useState(true);
  const [enableBackup, setEnableBackup] = useState(false);
  const [enablePreCheck, setEnablePreCheck] = useState(false);
  const [enablePostCheck, setEnablePostCheck] = useState(false);
  const [preCheckCmd, setPreCheckCmd] = useState('');
  const [postCheckCmd, setPostCheckCmd] = useState('');

  // Execution & Progress State
  const [deploying, setDeploying] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [result, setResult] = useState(null);
  const [batchResult, setBatchResult] = useState(null);
  const [selectedBatchDeviceIdx, setSelectedBatchDeviceIdx] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [activeAsyncJob, setActiveAsyncJob] = useState(null); // { id: string, title: string }

  const validFleet = fleet.filter((d) => d.host && d.host.trim() !== '');

  // UI Navigation & View Modes
  const [activeTab, setActiveTab] = useState('editor'); // 'editor', 'builder', 'results', 'history'
  const [resultTab, setResultTab] = useState('terminal'); // 'terminal', 'steps', 'prepost', 'rollback', 'backup'
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedRollback, setCopiedRollback] = useState(false);

  // Variable Replacer State
  const [showVariableModal, setShowVariableModal] = useState(false);
  const [varFind, setVarFind] = useState('{{VLAN_ID}}');
  const [varReplace, setVarReplace] = useState('100');

  // Quick Standalone Backup State
  const [manualBackupResult, setManualBackupResult] = useState(null);
  const [manualBackupBatchResult, setManualBackupBatchResult] = useState(null);
  const [selectedBackupDeviceIdx, setSelectedBackupDeviceIdx] = useState(0);
  const [showBackupModal, setShowBackupModal] = useState(false);

  // Deployment Session History
  const [deployHistory, setDeployHistory] = useState([]);

  // GUI Config Builder State
  const [builderTab, setBuilderTab] = useState('vlan');
  const [builderVlan, setBuilderVlan] = useState({ id: '100', name: 'SERVERS_VLAN', ip: '192.168.100.1', mask: '255.255.255.0' });
  const [builderPort, setBuilderPort] = useState({ port: 'GigabitEthernet0/0/1', mode: 'access', vlan: '10', vlansAllowed: '10,20,99', desc: 'Server Port', portfast: true });
  const [builderRoute, setBuilderRoute] = useState({ dest: '0.0.0.0', mask: '0.0.0.0', nexthop: '192.168.1.254', metric: '60' });
  const [builderServices, setBuilderServices] = useState({ hostname: 'SW-CORE-01', ntp: '192.168.1.50', syslog: '192.168.1.50', banner: 'AUTHORIZED ACCESS ONLY' });
  const [builderUser, setBuilderUser] = useState({ username: '', password: '', priv: '15', ssh: true });
  const [builderShowPassword, setBuilderShowPassword] = useState(false);

  const fileInputRef = useRef(null);

  // Auto-detect vendor based on fleet device types
  useEffect(() => {
    const primaryDevice = fleet?.[0];
    if (primaryDevice?.device_type) {
      const type = primaryDevice.device_type.toLowerCase();
      if (type.includes('huawei')) {
        setActiveVendor('huawei');
        setPreCheckCmd('display interface brief');
        setPostCheckCmd('display interface brief');
      } else if (type.includes('cisco')) {
        setActiveVendor('cisco_ios');
        setPreCheckCmd('show ip interface brief');
        setPostCheckCmd('show ip interface brief');
      } else if (type.includes('aruba') || type.includes('hp')) {
        setActiveVendor('aruba_os');
        setPreCheckCmd('show interfaces brief');
        setPostCheckCmd('show interfaces brief');
      } else if (type.includes('juniper')) {
        setActiveVendor('juniper_junos');
        setPreCheckCmd('show interfaces terse');
        setPostCheckCmd('show interfaces terse');
      }
    }
  }, [fleet]);

  // Clean lines for analysis and execution
  const rawLines = configText.split('\n');
  const validCommands = rawLines
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('!') && !l.startsWith('#'));
  const commentCount = rawLines.filter((l) => {
    const t = l.trim();
    return t.startsWith('!') || t.startsWith('#');
  }).length;
  const emptyCount = rawLines.filter((l) => l.trim().length === 0).length;

  // Linter & Safety Analysis
  const riskAnalysis = (() => {
    const criticals = [];
    const warnings = [];

    rawLines.forEach((line, idx) => {
      const trimmed = line.trim().toLowerCase();
      if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('#')) return;

      for (const kw of CRITICAL_KEYWORDS) {
        if (trimmed.includes(kw)) {
          criticals.push({ line: idx + 1, command: line.trim(), risk: `Critical: "${kw}" command detected` });
          break;
        }
      }

      for (const kw of WARNING_KEYWORDS) {
        if (trimmed.includes(kw)) {
          warnings.push({ line: idx + 1, command: line.trim(), risk: `Warning: "${kw}" command` });
          break;
        }
      }
    });

    return { criticals, warnings, hasHighRisk: criticals.length > 0 };
  })();

  // Filter templates
  const currentTemplates = VENDOR_TEMPLATES[activeVendor] || VENDOR_TEMPLATES['huawei'];
  const templateCategories = ['All', ...new Set(currentTemplates.map((t) => t.category))];
  const filteredTemplates = currentTemplates.filter((t) => {
    const matchCat = selectedCategory === 'All' || t.category === selectedCategory;
    const matchSearch =
      templateSearch === '' ||
      t.title.toLowerCase().includes(templateSearch.toLowerCase()) ||
      t.desc.toLowerCase().includes(templateSearch.toLowerCase()) ||
      t.config.toLowerCase().includes(templateSearch.toLowerCase());
    return matchCat && matchSearch;
  });

  // Handle template insertion
  const handleInsertTemplate = (templateConfig, replace = false) => {
    if (replace || configText.trim() === '') {
      setConfigText(templateConfig);
    } else {
      setConfigText((prev) => `${prev.trim()}\n\n${templateConfig}`);
    }
  };

  // Handle standalone backup of running config
  const handleManualBackup = async () => {
    setBackingUp(true);
    setErrorMessage('');
    setSuccessMessage('');

    if (validFleet.length === 0) {
      setErrorMessage('Please add at least one device IP in Target Device above.');
      setBackingUp(false);
      return;
    }

    setBackingUp(false);
    handleLaunchAsyncFleetBackup();
  };

  // Trigger Advanced Deployment
  const handleConfirmDeploy = async () => {
    setShowConfirmModal(false);

    if (validCommands.length === 0) {
      setErrorMessage('Please enter at least one valid configuration command.');
      return;
    }

    setDeploying(true);
    setErrorMessage('');
    setSuccessMessage('');
    setResult(null);
    setBatchResult(null);

    if (validFleet.length === 0) {
      setErrorMessage('Please add at least one device IP address in Target Device above.');
      setDeploying(false);
      return;
    }

    // Route to Background Async Job with live progress stream & modal
    setDeploying(false);
    handleLaunchAsyncFleetDeploy();
  };

  // Launch Massive Fleet Background Job (10,000+ Scale with live SSE Progress Stream & Pagination)
  const handleLaunchAsyncFleetDeploy = async () => {
    if (validFleet.length === 0) {
      setErrorMessage('Please add at least one device IP address in Target Device above.');
      return;
    }
    if (validCommands.length === 0) {
      setErrorMessage('Please enter configuration commands to deploy.');
      return;
    }

    const preCmds = enablePreCheck && preCheckCmd.trim() ? preCheckCmd.split('\n').map((c) => c.trim()).filter(Boolean) : [];
    const postCmds = enablePostCheck && postCheckCmd.trim() ? postCheckCmd.split('\n').map((c) => c.trim()).filter(Boolean) : [];

    try {
      setDeploying(true);
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

      const res = await submitDeployJob(
        payloadDevices,
        validCommands,
        saveConfig,
        preCmds,
        postCmds,
        enableBackup,
        nornirWorkers
      );
      setShowConfirmModal(false);
      setActiveAsyncJob({
        id: res.job_id,
        title: `Massive Fleet Deploy (${validFleet.length.toLocaleString()} Devices)`,
      });
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || err.message || 'Failed to submit massive fleet job');
    } finally {
      setDeploying(false);
    }
  };

  const handleLaunchAsyncFleetBackup = async () => {
    if (validFleet.length === 0) {
      setErrorMessage('Please add at least one device in Target Device above.');
      return;
    }
    try {
      setBackingUp(true);
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
      const res = await submitBackupJob(payloadDevices, nornirWorkers);
      setShowBackupModal(false);
      setActiveAsyncJob({
        id: res.job_id,
        title: `Massive Fleet Backup (${validFleet.length.toLocaleString()} Devices)`,
      });
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || err.message || 'Failed to submit fleet backup job');
    } finally {
      setBackingUp(false);
    }
  };

  // GUI Builder Syntax Generator
  const generateBuilderConfig = (masked = false) => {
    const isHuawei = activeVendor === 'huawei';
    if (builderTab === 'vlan') {
      if (isHuawei) {
        let out = `vlan ${builderVlan.id}\n description ${builderVlan.name}`;
        if (builderVlan.ip) {
          out += `\ninterface Vlanif${builderVlan.id}\n description ${builderVlan.name}\n ip address ${builderVlan.ip} ${builderVlan.mask}\n undo shutdown`;
        }
        return out;
      } else {
        let out = `vlan ${builderVlan.id}\n name ${builderVlan.name}`;
        if (builderVlan.ip) {
          out += `\ninterface Vlan${builderVlan.id}\n description ${builderVlan.name}\n ip address ${builderVlan.ip} ${builderVlan.mask}\n no shutdown`;
        }
        return out;
      }
    } else if (builderTab === 'port') {
      if (isHuawei) {
        if (builderPort.mode === 'access') {
          return `interface ${builderPort.port}\n description ${builderPort.desc}\n port link-type access\n port default vlan ${builderPort.vlan}${builderPort.portfast ? '\n stp edged-port enable' : ''}\n undo shutdown`;
        } else {
          return `interface ${builderPort.port}\n description ${builderPort.desc}\n port link-type trunk\n port trunk allow-pass vlan ${builderPort.vlansAllowed}\n undo shutdown`;
        }
      } else {
        if (builderPort.mode === 'access') {
          return `interface ${builderPort.port}\n description ${builderPort.desc}\n switchport mode access\n switchport access vlan ${builderPort.vlan}${builderPort.portfast ? '\n spanning-tree portfast' : ''}\n no shutdown`;
        } else {
          return `interface ${builderPort.port}\n description ${builderPort.desc}\n switchport trunk encapsulation dot1q\n switchport mode trunk\n switchport trunk allowed vlan ${builderPort.vlansAllowed}\n no shutdown`;
        }
      }
    } else if (builderTab === 'route') {
      if (isHuawei) {
        return `ip route-static ${builderRoute.dest} ${builderRoute.mask} ${builderRoute.nexthop}${builderRoute.metric ? ` preference ${builderRoute.metric}` : ''}`;
      } else {
        return `ip route ${builderRoute.dest} ${builderRoute.mask} ${builderRoute.nexthop}${builderRoute.metric ? ` ${builderRoute.metric}` : ''}`;
      }
    } else if (builderTab === 'services') {
      if (isHuawei) {
        return `sysname ${builderServices.hostname}\nntp-service unicast-server ${builderServices.ntp}\ninfo-center loghost ${builderServices.syslog}\nheader login information #\n${builderServices.banner}\n#`;
      } else {
        return `hostname ${builderServices.hostname}\nntp server ${builderServices.ntp}\nlogging host ${builderServices.syslog}\nbanner motd #\n${builderServices.banner}\n#`;
      }
    } else if (builderTab === 'user') {
      const pwd = masked ? '*****' : builderUser.password;
      if (isHuawei) {
        return `aaa\n local-user ${builderUser.username} password irreversible-cipher ${pwd}\n local-user ${builderUser.username} privilege level ${builderUser.priv}\n local-user ${builderUser.username} service-type ssh terminal`;
      } else {
        return `username ${builderUser.username} privilege ${builderUser.priv} secret ${pwd}\nline vty 0 4\n login local\n transport input ssh`;
      }
    }
    return '';
  };

  // Quick Format Actions
  const handleCleanScript = () => {
    const cleaned = validCommands.join('\n');
    setConfigText(cleaned);
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(configText);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  const handleDownloadScript = () => {
    const blob = new Blob([configText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `config_deploy_${fleet?.[0]?.host ? `fleet_${fleet[0].host}` : 'fleet'}_${Date.now()}.cfg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setConfigText(ev.target.result);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleApplyVariables = () => {
    if (!varFind) return;
    const replaced = configText.split(varFind).join(varReplace);
    setConfigText(replaced);
    setShowVariableModal(false);
  };

  const handleCopyRollback = () => {
    if (!result?.rollback_commands?.length) return;
    navigator.clipboard.writeText(result.rollback_commands.join('\n'));
    setCopiedRollback(true);
    setTimeout(() => setCopiedRollback(false), 2000);
  };

  const handleLoadRollbackToEditor = () => {
    if (!result?.rollback_commands?.length) return;
    setConfigText(result.rollback_commands.join('\n'));
    setActiveTab('editor');
  };

  return (
    <div className="deploy-page-v2">
      {/* Top Device Header & Quick Actions */}
      <div className="deploy-top-banner">
        <div className="deploy-banner-left">
          <div className="deploy-target-badge fleet-mode">
            <span className="badge-dot" />
            <span className="badge-host">Fleet Deployment ({validFleet.length} Devices)</span>
            <span className="badge-type">Multi-Device SSH</span>
          </div>
          <p className="deploy-banner-hint">
            Direct CLI push across all {validFleet.length} devices configured in Target Device above with automated verification & backups.
          </p>
        </div>

        <div className="deploy-banner-actions">
          <button
            type="button"
            onClick={handleManualBackup}
            disabled={backingUp || validFleet.length === 0}
            className="btn-backup-quick"
            title={`Fetch and preview running configuration from all ${validFleet.length} devices`}
          >
            {backingUp ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                <span>Fetching Fleet Backup ({validFleet.length})...</span>
              </>
            ) : (
              <>
                <HardDrive className="h-4 w-4 text-indigo-400" />
                <span>Backup Fleet Config ({validFleet.length} Devices)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Alert Messages */}
      {errorMessage && (
        <div className="alert-box error">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">{errorMessage}</span>
          <button onClick={() => setErrorMessage('')} className="alert-close">×</button>
        </div>
      )}

      {successMessage && (
        <div className="alert-box success">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">{successMessage}</span>
          <button onClick={() => setSuccessMessage('')} className="alert-close">×</button>
        </div>
      )}

      {/* Main Navigation Sub-Header */}
      <div className="deploy-subnav">
        <div className="deploy-tabs">
          <button
            onClick={() => setActiveTab('editor')}
            className={`deploy-tab-btn ${activeTab === 'editor' ? 'active' : ''}`}
          >
            <FileCode className="h-4 w-4" />
            <span>Script Editor & Templates</span>
            <span className="counter-pill">{validCommands.length} cmds</span>
          </button>

          <button
            onClick={() => setActiveTab('builder')}
            className={`deploy-tab-btn ${activeTab === 'builder' ? 'active' : ''}`}
          >
            <Sliders className="h-4 w-4 text-emerald-400" />
            <span>Interactive GUI Config Builder</span>
          </button>

          <button
            onClick={() => setActiveTab('results')}
            className={`deploy-tab-btn ${activeTab === 'results' ? 'active' : ''}`}
          >
            <TerminalIcon className="h-4 w-4 text-amber-400" />
            <span>Deployment Results & Analytics</span>
            {result && (
              <span className={`status-pill ${result.success ? 'success' : 'failed'}`}>
                {result.success ? 'Success' : 'Failed'}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`deploy-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          >
            <History className="h-4 w-4 text-sky-400" />
            <span>History ({deployHistory.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: SCRIPT EDITOR & TEMPLATES */}
      {activeTab === 'editor' && (
        <div className="deploy-grid-layout">
          {/* Left Column: Script Editor & Linter */}
          <div className="deploy-col-editor">
            <div className="deploy-card">
              {/* Editor Header */}
              <div className="card-header-flex">
                <div className="flex items-center gap-2">
                  <FileCode className="h-4 w-4 text-indigo-400" />
                  <h3 className="card-title">Configuration Commands Script</h3>
                </div>

                {/* Editor Action Buttons */}
                <div className="editor-quick-actions">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="btn-editor-tool"
                    title="Import script from .cfg or .txt file"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>Import</span>
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".cfg,.txt,.conf,.log"
                    style={{ display: 'none' }}
                  />

                  <button
                    type="button"
                    onClick={handleDownloadScript}
                    disabled={validCommands.length === 0}
                    className="btn-editor-tool"
                    title="Save script to file (.cfg)"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Export</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyScript}
                    disabled={validCommands.length === 0}
                    className="btn-editor-tool"
                    title="Copy entire script to clipboard"
                  >
                    {copiedScript ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedScript ? 'Copied' : 'Copy'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowVariableModal(true)}
                    disabled={validCommands.length === 0}
                    className="btn-editor-tool"
                    title="Find and replace parameters (e.g. {{VLAN}})"
                  >
                    <Wrench className="h-3.5 w-3.5 text-amber-400" />
                    <span>Replace Var</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCleanScript}
                    disabled={validCommands.length === 0}
                    className="btn-editor-tool"
                    title="Remove blank lines and comment lines"
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-sky-400" />
                    <span>Strip Comments</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfigText('')}
                    disabled={configText.length === 0}
                    className="btn-editor-tool text-rose-400"
                    title="Clear editor"
                  >
                    <span>Clear</span>
                  </button>
                </div>
              </div>

              {/* Editor Line Stats */}
              <div className="editor-stats-bar">
                <span className="stat-item">
                  <strong>{validCommands.length}</strong> executable commands
                </span>
                <span className="stat-divider">&bull;</span>
                <span className="stat-item">{commentCount} comments</span>
                <span className="stat-divider">&bull;</span>
                <span className="stat-item">{rawLines.length} total lines</span>
                <span className="stat-divider">&bull;</span>
                <span className="stat-item font-mono text-indigo-300">
                  Target: {activeVendor.toUpperCase()}
                </span>
              </div>

              {/* Textarea with Line Numbers Container */}
              <div className="editor-text-wrapper">
                <div className="editor-gutter">
                  {rawLines.map((_, i) => (
                    <div key={i} className="gutter-num">
                      {i + 1}
                    </div>
                  ))}
                </div>
                <textarea
                  value={configText}
                  onChange={(e) => setConfigText(e.target.value)}
                  placeholder={`# Enter CLI configuration commands here...\n# Examples for ${activeVendor}:\nvlan 10\n description USERS_DATA\ninterface GigabitEthernet0/1\n switchport mode access\n switchport access vlan 10\n no shutdown`}
                  className="config-textarea-v2 font-mono"
                  spellCheck="false"
                />
              </div>

              {/* Safety & Risk Lint Warning Box */}
              {riskAnalysis.hasHighRisk && (
                <div className="risk-banner critical">
                  <ShieldAlert className="h-5 w-5 text-rose-400 flex-shrink-0" />
                  <div className="risk-content">
                    <p className="risk-title">Critical Command Warning Detected!</p>
                    <div className="risk-items">
                      {riskAnalysis.criticals.map((c, i) => (
                        <div key={i} className="risk-item">
                          <span className="risk-line">Line {c.line}:</span>
                          <span className="risk-cmd font-mono">{c.command}</span>
                          <span className="risk-desc">({c.risk})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {riskAnalysis.warnings.length > 0 && !riskAnalysis.hasHighRisk && (
                <div className="risk-banner warning">
                  <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0" />
                  <div className="risk-content">
                    <span className="risk-title text-amber-300">Caution:</span>
                    <span className="text-xs text-slate-300 ml-1">
                      {riskAnalysis.warnings.length} warning(s) found (e.g. shutdown / routing change commands).
                    </span>
                  </div>
                </div>
              )}

              {/* Deployment Settings & Checkboxes */}
              <div className="deploy-options-panel">
                <h4 className="options-title">Deployment Options & Safety Checks</h4>
                <div className="options-grid">
                  {/* Save to Startup Checkbox */}
                  <label className="option-checkbox-label">
                    <input
                      type="checkbox"
                      checked={saveConfig}
                      onChange={(e) => setSaveConfig(e.target.checked)}
                      className="form-checkbox"
                    />
                    <div>
                      <span className="option-name">Save to Startup-Config / NVRAM</span>
                      <p className="option-hint">Executes 'write memory' or 'save' after deployment</p>
                    </div>
                  </label>

                  {/* Backup Before Deploy Checkbox */}
                  <label className="option-checkbox-label">
                    <input
                      type="checkbox"
                      checked={enableBackup}
                      onChange={(e) => setEnableBackup(e.target.checked)}
                      className="form-checkbox"
                    />
                    <div>
                      <span className="option-name">Auto-Backup Running Config</span>
                      <p className="option-hint">Captures full running-config snapshot before pushing</p>
                    </div>
                  </label>

                  {/* Pre-Check Verification Checkbox */}
                  <div className="option-verification-block">
                    <label className="option-checkbox-label">
                      <input
                        type="checkbox"
                        checked={enablePreCheck}
                        onChange={(e) => setEnablePreCheck(e.target.checked)}
                        className="form-checkbox"
                      />
                      <div>
                        <span className="option-name">Pre-Check Verification</span>
                        <p className="option-hint">Runs show/display command before pushing config</p>
                      </div>
                    </label>
                    {enablePreCheck && (
                      <input
                        type="text"
                        value={preCheckCmd}
                        onChange={(e) => setPreCheckCmd(e.target.value)}
                        placeholder="e.g. display interface brief or show ip int brief"
                        className="verification-input font-mono"
                      />
                    )}
                  </div>

                  {/* Post-Check Verification Checkbox */}
                  <div className="option-verification-block">
                    <label className="option-checkbox-label">
                      <input
                        type="checkbox"
                        checked={enablePostCheck}
                        onChange={(e) => setEnablePostCheck(e.target.checked)}
                        className="form-checkbox"
                      />
                      <div>
                        <span className="option-name">Post-Check Verification</span>
                        <p className="option-hint">Runs verification command immediately after deploy</p>
                      </div>
                    </label>
                    {enablePostCheck && (
                      <input
                        type="text"
                        value={postCheckCmd}
                        onChange={(e) => setPostCheckCmd(e.target.value)}
                        placeholder="e.g. display interface brief or show ip int brief"
                        className="verification-input font-mono"
                      />
                    )}
                  </div>
                </div>

                {/* Submit Action Bar */}
                <div className="deploy-action-footer">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <span>
                      {validCommands.length === 0
                        ? 'Add commands above to proceed'
                        : `Ready to push ${validCommands.length} command(s) across ${validFleet.length} device(s)`}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowConfirmModal(true)}
                    disabled={
                      deploying ||
                      validCommands.length === 0 ||
                      validFleet.length === 0
                    }
                    className="btn-deploy-main"
                  >
                    {deploying ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Deploying across {validFleet.length} Devices...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        <span>Review & Deploy to Fleet ({validFleet.length} Devices)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Multi-Vendor Template Catalog */}
          <div className="deploy-col-templates">
            <div className="deploy-card">
              <div className="card-header-flex">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-indigo-400" />
                  <h3 className="card-title">Verified Template Snippets</h3>
                </div>
              </div>

              {/* Vendor Switcher */}
              <div className="vendor-tabs">
                <button
                  type="button"
                  onClick={() => setActiveVendor('huawei')}
                  className={`vendor-tab-btn ${activeVendor === 'huawei' ? 'active' : ''}`}
                >
                  Huawei VRP
                </button>
                <button
                  type="button"
                  onClick={() => setActiveVendor('cisco_ios')}
                  className={`vendor-tab-btn ${activeVendor === 'cisco_ios' ? 'active' : ''}`}
                >
                  Cisco IOS / XE
                </button>
                <button
                  type="button"
                  onClick={() => setActiveVendor('aruba_os')}
                  className={`vendor-tab-btn ${activeVendor === 'aruba_os' ? 'active' : ''}`}
                >
                  Aruba CX
                </button>
                <button
                  type="button"
                  onClick={() => setActiveVendor('juniper_junos')}
                  className={`vendor-tab-btn ${activeVendor === 'juniper_junos' ? 'active' : ''}`}
                >
                  Juniper JunOS
                </button>
              </div>

              {/* Search & Category Filter */}
              <div className="template-filter-bar">
                <div className="template-search-wrapper">
                  <Search className="h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                    placeholder="Search templates (e.g. VLAN, OSPF, SSH)..."
                    className="template-search-input"
                  />
                  {templateSearch && (
                    <button onClick={() => setTemplateSearch('')} className="text-xs text-slate-400 hover:text-white">
                      ×
                    </button>
                  )}
                </div>

                <div className="category-pills">
                  {templateCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`cat-pill ${selectedCategory === cat ? 'active' : ''}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Templates List */}
              <div className="templates-scroll-list">
                {filteredTemplates.length === 0 ? (
                  <div className="no-templates">
                    <p className="text-xs text-slate-500">No template snippets found matching your search.</p>
                  </div>
                ) : (
                  filteredTemplates.map((tpl, idx) => (
                    <div key={idx} className="template-snippet-item">
                      <div className="snippet-header">
                        <div>
                          <span className="snippet-category">{tpl.category}</span>
                          <h4 className="snippet-title">{tpl.title}</h4>
                          <p className="snippet-desc">{tpl.desc}</p>
                        </div>
                        <div className="snippet-actions">
                          <button
                            type="button"
                            onClick={() => handleInsertTemplate(tpl.config, false)}
                            className="btn-snippet-append"
                            title="Append to bottom of editor"
                          >
                            <Plus className="h-3 w-3" />
                            <span>Append</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleInsertTemplate(tpl.config, true)}
                            className="btn-snippet-replace"
                            title="Replace editor content"
                          >
                            <span>Replace</span>
                          </button>
                        </div>
                      </div>

                      <pre className="snippet-code font-mono">{tpl.config}</pre>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INTERACTIVE GUI CONFIG BUILDER */}
      {activeTab === 'builder' && (
        <div className="builder-layout">
          <div className="builder-header-banner">
            <div>
              <h3 className="builder-heading">
                <Sliders className="h-5 w-5 text-emerald-400" />
                <span>Visual Network Configuration Generator</span>
              </h3>
              <p className="builder-subheading">
                Fill in parameters to auto-generate vendor-accurate CLI commands without memorizing syntax.
              </p>
            </div>

            {/* Vendor Selector in Builder */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Target Driver:</span>
              <select
                value={activeVendor}
                onChange={(e) => setActiveVendor(e.target.value)}
                className="builder-vendor-select"
              >
                <option value="huawei">Huawei VRP</option>
                <option value="cisco_ios">Cisco IOS / XE</option>
                <option value="aruba_os">Aruba OS-CX</option>
                <option value="juniper_junos">Juniper JunOS</option>
              </select>
            </div>
          </div>

          {/* Builder Wizard Tabs */}
          <div className="builder-tabs-nav">
            <button
              onClick={() => setBuilderTab('vlan')}
              className={`builder-nav-btn ${builderTab === 'vlan' ? 'active' : ''}`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>VLAN & SVI Interface</span>
            </button>
            <button
              onClick={() => setBuilderTab('port')}
              className={`builder-nav-btn ${builderTab === 'port' ? 'active' : ''}`}
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>Access / Trunk Port</span>
            </button>
            <button
              onClick={() => setBuilderTab('route')}
              className={`builder-nav-btn ${builderTab === 'route' ? 'active' : ''}`}
            >
              <ArrowRight className="h-3.5 w-3.5" />
              <span>Static Route</span>
            </button>
            <button
              onClick={() => setBuilderTab('services')}
              className={`builder-nav-btn ${builderTab === 'services' ? 'active' : ''}`}
            >
              <Wrench className="h-3.5 w-3.5" />
              <span>Hostname, NTP & Syslog</span>
            </button>
            <button
              onClick={() => setBuilderTab('user')}
              className={`builder-nav-btn ${builderTab === 'user' ? 'active' : ''}`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>AAA / SSH Local User</span>
            </button>
          </div>

          <div className="builder-content-grid">
            {/* Form Section */}
            <div className="builder-form-card">
              {/* 1. VLAN BUILDER */}
              {builderTab === 'vlan' && (
                <div className="builder-fields-stack">
                  <h4 className="builder-group-title">VLAN & Gateway (SVI) Parameters</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">VLAN ID *</label>
                      <input
                        type="number"
                        value={builderVlan.id}
                        onChange={(e) => setBuilderVlan({ ...builderVlan, id: e.target.value })}
                        placeholder="e.g. 100"
                        className="form-input"
                      />
                    </div>
                    <div>
                      <label className="form-label">VLAN Name / Description *</label>
                      <input
                        type="text"
                        value={builderVlan.name}
                        onChange={(e) => setBuilderVlan({ ...builderVlan, name: e.target.value })}
                        placeholder="e.g. SERVERS_VLAN"
                        className="form-input"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">SVI Gateway IP (Optional)</label>
                      <input
                        type="text"
                        value={builderVlan.ip}
                        onChange={(e) => setBuilderVlan({ ...builderVlan, ip: e.target.value })}
                        placeholder="e.g. 192.168.100.1"
                        className="form-input font-mono"
                      />
                    </div>
                    <div>
                      <label className="form-label">Subnet Mask</label>
                      <input
                        type="text"
                        value={builderVlan.mask}
                        onChange={(e) => setBuilderVlan({ ...builderVlan, mask: e.target.value })}
                        placeholder="e.g. 255.255.255.0"
                        className="form-input font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 2. PORT BUILDER */}
              {builderTab === 'port' && (
                <div className="builder-fields-stack">
                  <h4 className="builder-group-title">Interface & Port Configuration</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">Interface Name *</label>
                      <input
                        type="text"
                        value={builderPort.port}
                        onChange={(e) => setBuilderPort({ ...builderPort, port: e.target.value })}
                        placeholder="e.g. GigabitEthernet0/0/1"
                        className="form-input font-mono"
                      />
                    </div>
                    <div>
                      <label className="form-label">Switchport Mode *</label>
                      <select
                        value={builderPort.mode}
                        onChange={(e) => setBuilderPort({ ...builderPort, mode: e.target.value })}
                        className="form-select"
                      >
                        <option value="access">Access Port (Workstation / Server)</option>
                        <option value="trunk">Trunk Port (Uplink to Switch / Router)</option>
                      </select>
                    </div>
                  </div>

                  {builderPort.mode === 'access' ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="form-label">Access VLAN ID</label>
                        <input
                          type="number"
                          value={builderPort.vlan}
                          onChange={(e) => setBuilderPort({ ...builderPort, vlan: e.target.value })}
                          placeholder="e.g. 10"
                          className="form-input"
                        />
                      </div>
                      <div className="flex items-center mt-6">
                        <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                          <input
                            type="checkbox"
                            checked={builderPort.portfast}
                            onChange={(e) => setBuilderPort({ ...builderPort, portfast: e.target.checked })}
                            className="form-checkbox"
                          />
                          <span>Enable STP PortFast / Edged-Port</span>
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="form-label">Allowed VLANs (Comma separated)</label>
                      <input
                        type="text"
                        value={builderPort.vlansAllowed}
                        onChange={(e) => setBuilderPort({ ...builderPort, vlansAllowed: e.target.value })}
                        placeholder="e.g. 10,20,99,100"
                        className="form-input font-mono"
                      />
                    </div>
                  )}

                  <div>
                    <label className="form-label">Interface Description</label>
                    <input
                      type="text"
                      value={builderPort.desc}
                      onChange={(e) => setBuilderPort({ ...builderPort, desc: e.target.value })}
                      placeholder="e.g. Server Farm Primary Interface"
                      className="form-input"
                    />
                  </div>
                </div>
              )}

              {/* 3. ROUTE BUILDER */}
              {builderTab === 'route' && (
                <div className="builder-fields-stack">
                  <h4 className="builder-group-title">Static Routing Configuration</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">Destination IP Prefix *</label>
                      <input
                        type="text"
                        value={builderRoute.dest}
                        onChange={(e) => setBuilderRoute({ ...builderRoute, dest: e.target.value })}
                        placeholder="0.0.0.0 for default route"
                        className="form-input font-mono"
                      />
                    </div>
                    <div>
                      <label className="form-label">Subnet Mask *</label>
                      <input
                        type="text"
                        value={builderRoute.mask}
                        onChange={(e) => setBuilderRoute({ ...builderRoute, mask: e.target.value })}
                        placeholder="0.0.0.0 or 255.255.255.0"
                        className="form-input font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">Next-Hop Gateway IP *</label>
                      <input
                        type="text"
                        value={builderRoute.nexthop}
                        onChange={(e) => setBuilderRoute({ ...builderRoute, nexthop: e.target.value })}
                        placeholder="e.g. 192.168.1.254"
                        className="form-input font-mono"
                      />
                    </div>
                    <div>
                      <label className="form-label">Preference / Metric (Optional)</label>
                      <input
                        type="number"
                        value={builderRoute.metric}
                        onChange={(e) => setBuilderRoute({ ...builderRoute, metric: e.target.value })}
                        placeholder="e.g. 60"
                        className="form-input font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 4. SERVICES BUILDER */}
              {builderTab === 'services' && (
                <div className="builder-fields-stack">
                  <h4 className="builder-group-title">System & Management Services</h4>
                  <div>
                    <label className="form-label">System Hostname / Sysname</label>
                    <input
                      type="text"
                      value={builderServices.hostname}
                      onChange={(e) => setBuilderServices({ ...builderServices, hostname: e.target.value })}
                      placeholder="e.g. SW-CORE-BLDG1"
                      className="form-input"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">NTP Server IP</label>
                      <input
                        type="text"
                        value={builderServices.ntp}
                        onChange={(e) => setBuilderServices({ ...builderServices, ntp: e.target.value })}
                        placeholder="e.g. 192.168.1.50"
                        className="form-input font-mono"
                      />
                    </div>
                    <div>
                      <label className="form-label">Syslog Server IP</label>
                      <input
                        type="text"
                        value={builderServices.syslog}
                        onChange={(e) => setBuilderServices({ ...builderServices, syslog: e.target.value })}
                        placeholder="e.g. 192.168.1.50"
                        className="form-input font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="form-label">Banner MOTD Warning</label>
                    <input
                      type="text"
                      value={builderServices.banner}
                      onChange={(e) => setBuilderServices({ ...builderServices, banner: e.target.value })}
                      placeholder="AUTHORIZED PERSONNEL ONLY"
                      className="form-input"
                    />
                  </div>
                </div>
              )}

              {/* 5. AAA USER BUILDER */}
              {builderTab === 'user' && (
                <div className="builder-fields-stack">
                  <h4 className="builder-group-title">Local User & AAA SSH Access</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">Username *</label>
                      <input
                        type="text"
                        value={builderUser.username}
                        onChange={(e) => setBuilderUser({ ...builderUser, username: e.target.value })}
                        placeholder="e.g. netadmin"
                        className="form-input"
                      />
                    </div>
                    <div>
                      <label className="form-label">Privilege Level (1 - 15)</label>
                      <input
                        type="number"
                        value={builderUser.priv}
                        onChange={(e) => setBuilderUser({ ...builderUser, priv: e.target.value })}
                        min="1"
                        max="15"
                        className="form-input"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="form-label">Password *</label>
                    <input
                      type="password"
                      value={builderUser.password}
                      onChange={(e) => setBuilderUser({ ...builderUser, password: e.target.value })}
                      placeholder="Enter strong password"
                      className="form-input font-mono"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Live Generated Preview & Insert Bar */}
            <div className="builder-preview-card">
              <div className="preview-header flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCode className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-slate-200">
                    Live Generated Syntax ({activeVendor.toUpperCase()})
                  </span>
                </div>
                {builderTab === 'user' && (
                  <button
                    type="button"
                    onClick={() => setBuilderShowPassword(!builderShowPassword)}
                    className="btn-editor-tool"
                    title={builderShowPassword ? 'Mask password' : 'Show plain password'}
                  >
                    {builderShowPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    <span>{builderShowPassword ? 'Hide Password' : 'Show Password'}</span>
                  </button>
                )}
              </div>

              <div className="builder-code-box">
                <pre className="font-mono text-xs text-emerald-300 leading-relaxed">
                  {generateBuilderConfig(!builderShowPassword)}
                </pre>
              </div>

              <div className="builder-actions-row">
                <button
                  type="button"
                  onClick={() => {
                    handleInsertTemplate(generateBuilderConfig(false), false);
                    setActiveTab('editor');
                  }}
                  className="btn-builder-append"
                >
                  <Plus className="h-4 w-4" />
                  <span>Append to Script Editor</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleInsertTemplate(generateBuilderConfig(false), true);
                    setActiveTab('editor');
                  }}
                  className="btn-builder-replace"
                >
                  <span>Replace Editor Content</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DEPLOYMENT RESULTS & ANALYTICS */}
      {activeTab === 'results' && (() => {
        const activeResult = batchResult
          ? batchResult.results?.[selectedBatchDeviceIdx]
          : result;

        if (!activeResult && !batchResult) {
          return (
            <div className="deploy-results-container">
              <div className="empty-results-box">
                <TerminalIcon className="h-12 w-12 text-slate-600 mb-3" />
                <h4 className="text-base font-semibold text-slate-300">No Deployment Run Yet</h4>
                <p className="text-xs text-slate-500 max-w-md text-center mt-1">
                  Compose your script in the Script Editor and click "Review & Deploy" to see live execution results,
                  step-by-step logs, pre/post diffs, and rollback scripts here.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('editor')}
                  className="btn-primary mt-4"
                >
                  Go to Script Editor
                </button>
              </div>
            </div>
          );
        }

        return (
          <div className="deploy-results-container">
            <div className="results-wrapper">
              {/* Batch Fleet Summary Stats & Device Selector */}
              {batchResult && (
                <div className="batch-deploy-overview-card">
                  <div className="batch-stats-bar">
                    <div className="batch-stat-item">
                      <span className="stat-label">Total Fleet:</span>
                      <span className="stat-value">{batchResult.devices_count} Devices</span>
                    </div>
                    <div className="batch-stat-item">
                      <span className="stat-label">Success:</span>
                      <span className="stat-value text-emerald-400">{batchResult.success_count}</span>
                    </div>
                    <div className="batch-stat-item">
                      <span className="stat-label">Failed:</span>
                      <span className="stat-value text-rose-400">{batchResult.failed_count}</span>
                    </div>
                    <div className="batch-stat-item">
                      <span className="stat-label">Overall Time:</span>
                      <span className="stat-value text-indigo-400">{batchResult.overall_time_seconds}s</span>
                    </div>
                  </div>

                  {/* Device Tabs Selector */}
                  <div className="batch-device-tabs-row">
                    {batchResult.results?.map((devRes, idx) => {
                      const isSelected = selectedBatchDeviceIdx === idx;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedBatchDeviceIdx(idx)}
                          className={`batch-dev-btn ${isSelected ? 'active' : ''} ${
                            devRes.success ? 'success' : 'failed'
                          }`}
                        >
                          <div className="flex flex-col items-start text-left">
                            <span className="font-mono text-xs font-semibold text-white">{devRes.host}</span>
                            <span className="text-[10px] text-slate-400">{devRes.execution_time_seconds}s</span>
                          </div>
                          {devRes.success ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 text-rose-400 flex-shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeResult && (
                <>
                  {/* Executive Summary Card for Active Device */}
                  <div className={`results-summary-card ${activeResult.success ? 'success' : 'failed'}`}>
                    <div className="summary-status-left">
                      {activeResult.success ? (
                        <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                      ) : (
                        <XCircle className="h-8 w-8 text-rose-400" />
                      )}
                      <div>
                        <h3 className="summary-title">
                          {activeResult.success ? 'Deployment Successful' : 'Deployment Failed'}
                        </h3>
                        <p className="summary-subtitle">
                          Target Host: <span className="font-mono text-white">{activeResult.host}</span> &bull; Executed in{' '}
                          <span className="font-mono text-white">{activeResult.execution_time_seconds || 0}s</span>
                        </p>
                      </div>
                    </div>

                    <div className="summary-metrics-right">
                      <div className="metric-box">
                        <span className="metric-label">Commands Deployed</span>
                        <span className="metric-value font-mono">
                          {activeResult.commands_deployed?.length || validCommands.length}
                        </span>
                      </div>
                      <div className="metric-box">
                        <span className="metric-label">NVRAM Save</span>
                        <span className="metric-value font-mono">
                          {saveConfig ? (activeResult.save_output ? 'Saved' : 'OK') : 'Skipped'}
                        </span>
                      </div>
                      <div className="metric-box">
                        <span className="metric-label">Rollback Available</span>
                        <span className="metric-value font-mono text-indigo-400">
                          {activeResult.rollback_commands?.length || 0} cmds
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Result View Mode Tabs */}
                  <div className="result-subtabs-nav">
                    <button
                      onClick={() => setResultTab('terminal')}
                      className={`result-nav-btn ${resultTab === 'terminal' ? 'active' : ''}`}
                    >
                      <TerminalIcon className="h-4 w-4" />
                      <span>Terminal Console Log</span>
                    </button>

                    <button
                      onClick={() => setResultTab('steps')}
                      className={`result-nav-btn ${resultTab === 'steps' ? 'active' : ''}`}
                    >
                      <CheckSquare className="h-4 w-4 text-emerald-400" />
                      <span>Step-by-Step Execution</span>
                      <span className="counter-pill">{activeResult.commands_deployed?.length || 0}</span>
                    </button>

                    {(activeResult.pre_check_results?.length > 0 || activeResult.post_check_results?.length > 0) && (
                      <button
                        onClick={() => setResultTab('prepost')}
                        className={`result-nav-btn ${resultTab === 'prepost' ? 'active' : ''}`}
                      >
                        <Eye className="h-4 w-4 text-sky-400" />
                        <span>Pre vs Post Verification</span>
                      </button>
                    )}

                    {activeResult.rollback_commands?.length > 0 && (
                      <button
                        onClick={() => setResultTab('rollback')}
                        className={`result-nav-btn ${resultTab === 'rollback' ? 'active' : ''}`}
                      >
                        <Undo2 className="h-4 w-4 text-amber-400" />
                        <span>Rollback Script Helper</span>
                        <span className="counter-pill">{activeResult.rollback_commands.length}</span>
                      </button>
                    )}

                    {activeResult.backup_config && (
                      <button
                        onClick={() => setResultTab('backup')}
                        className={`result-nav-btn ${resultTab === 'backup' ? 'active' : ''}`}
                      >
                        <HardDrive className="h-4 w-4 text-indigo-400" />
                        <span>Backup Snapshot</span>
                      </button>
                    )}
                  </div>

                  {/* Sub-Tab 1: Terminal Console */}
                  {resultTab === 'terminal' && (
                    <div style={{ height: '520px' }}>
                      <TerminalOutput
                        title={`Deployment Console Output - ${activeResult.host}`}
                        deviceHost={activeResult.host}
                        command={maskSensitiveCli(activeResult.command || 'send_config_set')}
                        output={maskSensitiveCli(activeResult.output || activeResult.error)}
                        executionTime={activeResult.execution_time_seconds}
                        onClear={() => {
                          setResult(null);
                          setBatchResult(null);
                        }}
                        isError={!activeResult.success}
                      />
                    </div>
                  )}

                  {/* Sub-Tab 2: Step-by-Step Command Table */}
                  {resultTab === 'steps' && (
                    <div className="steps-container-card">
                      <div className="steps-table-header">
                        <span className="w-12">#</span>
                        <span className="flex-1">Command Sent to Switch</span>
                        <span className="w-24 text-right">Status</span>
                      </div>

                      <div className="steps-list">
                        {(activeResult.commands_deployed || validCommands).map((cmd, idx) => (
                          <div key={idx} className="step-row">
                            <span className="step-index font-mono">{idx + 1}</span>
                            <span className="step-command font-mono">{maskSensitiveCli(cmd)}</span>
                            <span className="step-badge success">
                              <Check className="h-3 w-3" />
                              <span>Pushed</span>
                            </span>
                          </div>
                        ))}
                      </div>

                      {activeResult.save_output && (
                        <div className="save-status-box">
                          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 mb-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Startup-Config Save Status:</span>
                          </div>
                          <pre className="font-mono text-xs text-slate-300">{maskSensitiveCli(activeResult.save_output)}</pre>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Sub-Tab 3: Pre vs Post Verification */}
                  {resultTab === 'prepost' && (
                    <div className="prepost-grid">
                      <div className="prepost-col">
                        <div className="prepost-col-header">
                          <Clock className="h-4 w-4 text-sky-400" />
                          <span>Pre-Check State (Before Deploy)</span>
                        </div>
                        <div className="prepost-content font-mono">
                          {activeResult.pre_check_results?.map((res, i) => (
                            <div key={i} className="mb-4">
                              <div className="text-xs text-sky-300 font-semibold mb-1">$ {maskSensitiveCli(res.command)}</div>
                              <pre className="text-xs text-slate-300 bg-slate-950 p-2.5 rounded border border-slate-800 overflow-x-auto">
                                {maskSensitiveCli(res.output || res.error || 'No output')}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="prepost-col">
                        <div className="prepost-col-header">
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          <span>Post-Check State (After Deploy)</span>
                        </div>
                        <div className="prepost-content font-mono">
                          {activeResult.post_check_results?.map((res, i) => (
                            <div key={i} className="mb-4">
                              <div className="text-xs text-emerald-300 font-semibold mb-1">$ {maskSensitiveCli(res.command)}</div>
                              <pre className="text-xs text-slate-300 bg-slate-950 p-2.5 rounded border border-slate-800 overflow-x-auto">
                                {maskSensitiveCli(res.output || res.error || 'No output')}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sub-Tab 4: Rollback Script Helper */}
                  {resultTab === 'rollback' && (
                    <div className="rollback-container-card">
                      <div className="rollback-header">
                        <div>
                          <h4 className="rollback-title">
                            <Undo2 className="h-4 w-4 text-amber-400" />
                            <span>Auto-Generated Rollback Configuration</span>
                          </h4>
                          <p className="rollback-subtitle">
                            Inverse commands to revert the modifications applied during this deployment on {activeResult.host}.
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (!activeResult?.rollback_commands?.length) return;
                              navigator.clipboard.writeText(activeResult.rollback_commands.join('\n'));
                              setCopiedRollback(true);
                              setTimeout(() => setCopiedRollback(false), 2000);
                            }}
                            className="btn-rollback-action"
                          >
                            {copiedRollback ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                            <span>{copiedRollback ? 'Copied' : 'Copy Rollback'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (!activeResult?.rollback_commands?.length) return;
                              setConfigText(activeResult.rollback_commands.join('\n'));
                              setActiveTab('editor');
                            }}
                            className="btn-rollback-action primary"
                          >
                            <FileCode className="h-3.5 w-3.5" />
                            <span>Load into Editor</span>
                          </button>
                        </div>
                      </div>

                      <div className="rollback-code-box font-mono">
                        <pre className="text-xs text-amber-200 leading-relaxed">
                          {activeResult.rollback_commands?.join('\n')}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Sub-Tab 5: Pre-Deployment Backup Snapshot */}
                  {resultTab === 'backup' && (
                    <div className="backup-snapshot-card">
                      <div className="backup-header">
                        <div>
                          <h4 className="backup-title">
                            <HardDrive className="h-4 w-4 text-indigo-400" />
                            <span>Pre-Deployment Running-Config Snapshot</span>
                          </h4>
                          <p className="backup-subtitle">
                            Captured from {activeResult.host} before configuration changes were applied.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const blob = new Blob([activeResult.backup_config], { type: 'text/plain;charset=utf-8' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `backup_before_deploy_${activeResult.host}_${Date.now()}.cfg`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="btn-backup-download"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Download .cfg</span>
                        </button>
                      </div>

                      <pre className="backup-code-box font-mono text-xs text-slate-300">
                        {activeResult.backup_config}
                      </pre>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* TAB 4: SESSION DEPLOYMENT HISTORY */}
      {activeTab === 'history' && (
        <div className="deploy-card">
          <div className="card-header-flex">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-sky-400" />
              <h3 className="card-title">Session Deployment History</h3>
            </div>
            {deployHistory.length > 0 && (
              <button
                type="button"
                onClick={() => setDeployHistory([])}
                className="text-xs text-rose-400 hover:underline cursor-pointer"
              >
                Clear History
              </button>
            )}
          </div>

          {deployHistory.length === 0 ? (
            <div className="no-templates py-8">
              <History className="h-8 w-8 text-slate-600 mb-2" />
              <p className="text-xs text-slate-500">No deployment runs recorded in this session yet.</p>
            </div>
          ) : (
            <div className="history-table-wrapper">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Target Host</th>
                    <th>Driver</th>
                    <th>Commands</th>
                    <th>Duration</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deployHistory.map((item) => (
                    <tr key={item.id}>
                      <td className="font-mono text-xs text-slate-400">
                        {item.date} {item.timestamp}
                      </td>
                      <td className="font-mono text-xs text-white font-semibold">{item.host}</td>
                      <td className="text-xs text-slate-400 font-mono">{item.device_type}</td>
                      <td className="font-mono text-xs text-indigo-300">{item.commandCount} cmds</td>
                      <td className="font-mono text-xs text-slate-400">{item.executionTime}s</td>
                      <td>
                        <span className={`status-pill ${item.success ? 'success' : 'failed'}`}>
                          {item.success ? 'Success' : 'Failed'}
                        </span>
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setResult(item.result);
                            setActiveTab('results');
                          }}
                          className="btn-history-view mr-2"
                        >
                          View Results
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfigText(item.script);
                            setActiveTab('editor');
                          }}
                          className="btn-history-restore"
                        >
                          Restore Script
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      {showConfirmModal && (
        <div className="modal-backdrop">
          <div className="confirm-modal-box">
            <div className="confirm-modal-header">
              <div className="flex items-center gap-2">
                <Send className="h-5 w-5 text-indigo-400" />
                <h3 className="confirm-modal-title">
                  Confirm Fleet Deployment ({validFleet.length} Devices)
                </h3>
              </div>
              <button onClick={() => setShowConfirmModal(false)} className="modal-close-btn">
                ×
              </button>
            </div>

            <div className="confirm-modal-body">
              {/* Summary Stats Grid */}
              <div className="confirm-stats-grid">
                <div className="confirm-stat-card">
                  <span className="confirm-stat-label">Fleet Targets</span>
                  <span className="confirm-stat-val font-mono">
                    {validFleet.length} Devices
                  </span>
                </div>
                <div className="confirm-stat-card">
                  <span className="confirm-stat-label">Mode / Driver</span>
                  <span className="confirm-stat-val font-mono">
                    Multi-Device SSH
                  </span>
                </div>
                <div className="confirm-stat-card">
                  <span className="confirm-stat-label">Commands</span>
                  <span className="confirm-stat-val font-mono text-emerald-400">
                    {validCommands.length} commands
                  </span>
                </div>
                <div className="confirm-stat-card">
                  <span className="confirm-stat-label">NVRAM Save</span>
                  <span className="confirm-stat-val font-mono">
                    {saveConfig ? 'Enabled (write mem)' : 'Disabled'}
                  </span>
                </div>
              </div>

              {/* Risk Warning in Modal if any */}
              {riskAnalysis.hasHighRisk && (
                <div className="risk-banner critical mb-3">
                  <ShieldAlert className="h-4 w-4 text-rose-400 flex-shrink-0" />
                  <div className="risk-content text-xs">
                    <strong>Warning:</strong> Dangerous commands detected. Double check the command list below.
                  </div>
                </div>
              )}

              {/* Command List Preview */}
              <div className="confirm-cmd-preview">
                <div className="text-xs font-semibold text-slate-400 mb-1.5 flex justify-between">
                  <span>Commands to be executed sequentially:</span>
                  <span>{validCommands.length} items</span>
                </div>
                <div className="confirm-cmd-list font-mono">
                  {validCommands.map((cmd, i) => (
                    <div key={i} className="confirm-cmd-row">
                      <span className="text-slate-500 w-6">{i + 1}.</span>
                      <span className="text-emerald-300">{maskSensitiveCli(cmd)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="confirm-modal-footer">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="btn-secondary"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmDeploy}
                className="btn-deploy-confirm"
              >
                <Send className="h-4 w-4" />
                <span>Confirm & Push Configuration</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VARIABLE REPLACER MODAL */}
      {showVariableModal && (
        <div className="modal-backdrop">
          <div className="variable-modal-box">
            <div className="confirm-modal-header">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-amber-400" />
                <h3 className="confirm-modal-title">Parameter / Variable Replacer</h3>
              </div>
              <button onClick={() => setShowVariableModal(false)} className="modal-close-btn">
                ×
              </button>
            </div>

            <div className="p-4 flex flex-col gap-3">
              <p className="text-xs text-slate-400">
                Quickly replace placeholder tokens (e.g. <code>{"{{VLAN_ID}}"}</code> or <code>{"{{IP}}"}</code>) across your entire script.
              </p>

              <div>
                <label className="form-label">Find Placeholder / Text *</label>
                <input
                  type="text"
                  value={varFind}
                  onChange={(e) => setVarFind(e.target.value)}
                  placeholder="e.g. {{VLAN_ID}}"
                  className="form-input font-mono"
                />
              </div>

              <div>
                <label className="form-label">Replace With Value *</label>
                <input
                  type="text"
                  value={varReplace}
                  onChange={(e) => setVarReplace(e.target.value)}
                  placeholder="e.g. 100"
                  className="form-input font-mono"
                />
              </div>
            </div>

            <div className="confirm-modal-footer">
              <button
                type="button"
                onClick={() => setShowVariableModal(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyVariables}
                className="btn-primary"
              >
                Replace All Instances
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STANDALONE BACKUP MODAL */}
      {showBackupModal && (manualBackupBatchResult || manualBackupResult) && (
        <div className="modal-backdrop">
          <div className="backup-modal-box">
            <div className="confirm-modal-header">
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-indigo-400" />
                <h3 className="confirm-modal-title">
                  {manualBackupBatchResult
                    ? `Fleet Running Configuration Backup (${manualBackupBatchResult.success_count}/${manualBackupBatchResult.devices_count} Succeeded)`
                    : 'Fleet Running Configuration Backup'}
                </h3>
              </div>
              <button onClick={() => setShowBackupModal(false)} className="modal-close-btn">
                ×
              </button>
            </div>

            {/* Device tabs */}
            {manualBackupBatchResult && (
              <div className="p-4 pb-0">
                <div className="batch-device-tabs-row mb-1">
                  {manualBackupBatchResult.results?.map((devRes, idx) => {
                    const isSelected = selectedBackupDeviceIdx === idx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedBackupDeviceIdx(idx)}
                        className={`batch-dev-btn ${isSelected ? 'active' : ''} ${
                          devRes.success ? 'success' : 'failed'
                        }`}
                      >
                        <div className="flex flex-col items-start text-left">
                          <span className="font-mono text-xs font-semibold text-white">{devRes.host}</span>
                          <span className="text-[10px] text-slate-400">{devRes.execution_time_seconds}s</span>
                        </div>
                        {devRes.success ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-rose-400 flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="p-4 pt-2">
              {(() => {
                const currentRes = manualBackupBatchResult
                  ? manualBackupBatchResult.results?.[selectedBackupDeviceIdx]
                  : manualBackupResult;

                if (!currentRes) {
                  return <div className="text-xs text-slate-400 p-4">No backup content available.</div>;
                }

                return (
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5 font-mono">
                      <span>Host: <strong className="text-white">{currentRes.host}</strong></span>
                      <span>Execution Time: {currentRes.execution_time_seconds || 0}s</span>
                    </div>
                    <pre className="backup-modal-code font-mono text-xs">
                      {currentRes.output || currentRes.error || 'No content returned'}
                    </pre>
                  </div>
                );
              })()}
            </div>

            <div className="confirm-modal-footer">
              {manualBackupBatchResult && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const currentRes = manualBackupBatchResult.results?.[selectedBackupDeviceIdx];
                      if (!currentRes?.output) return;
                      const blob = new Blob([currentRes.output], { type: 'text/plain;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `running_config_${currentRes.host}_${Date.now()}.cfg`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="btn-secondary"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download Selected ({manualBackupBatchResult.results?.[selectedBackupDeviceIdx]?.host})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const successfulResults = manualBackupBatchResult.results?.filter((r) => r.success && r.output) || [];
                      const timestamp = Date.now();
                      successfulResults.forEach((res, i) => {
                        setTimeout(() => {
                          const blob = new Blob([res.output], { type: 'text/plain;charset=utf-8' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `running_config_${res.host}_${timestamp}.cfg`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }, i * 200);
                      });
                    }}
                    className="btn-primary"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download All ({manualBackupBatchResult.success_count} Files)</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => setShowBackupModal(false)}
                className="btn-secondary"
              >
                Close
              </button>
            </div>
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
