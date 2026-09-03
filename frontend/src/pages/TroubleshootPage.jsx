import React, { useState } from 'react';
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
} from 'lucide-react';
import {
  executeTroubleshootCommand,
  executeBatchTroubleshootCommand,
  submitTroubleshootJob,
} from '../services/api';
import TerminalOutput from '../components/TerminalOutput';
import AsyncJobModal from '../components/AsyncJobModal';
import './TroubleshootPage.css';

const SHORTCUT_CATEGORIES = [
  { id: 'all', label: 'All Shortcuts' },
  { id: 'interface', label: 'Interfaces' },
  { id: 'network', label: 'Routing & L2' },
  { id: 'system', label: 'System & Logs' },
  { id: 'fiber', label: 'Fiber & SFP' },
];

const MULTI_SHORTCUTS = [
  // Interface
  {
    label: 'IP Interfaces Brief',
    category: 'interface',
    huawei_cmd: 'display ip interface brief',
    cisco_cmd: 'show ip interface brief',
  },
  {
    label: 'Port Status Brief',
    category: 'interface',
    huawei_cmd: 'display interface brief',
    cisco_cmd: 'show interfaces status',
  },
  {
    label: 'Interface Errors / Counters',
    category: 'interface',
    huawei_cmd: 'display interface counters error',
    cisco_cmd: 'show interfaces counters errors',
  },
  {
    label: 'Interface Descriptions',
    category: 'interface',
    huawei_cmd: 'display interface description',
    cisco_cmd: 'show interfaces description',
  },

  // Routing & L2
  {
    label: 'IP Routing Table',
    category: 'network',
    huawei_cmd: 'display ip routing-table',
    cisco_cmd: 'show ip route',
  },
  {
    label: 'ARP Table / Cache',
    category: 'network',
    huawei_cmd: 'display arp all',
    cisco_cmd: 'show ip arp',
  },
  {
    label: 'MAC Address Table',
    category: 'network',
    huawei_cmd: 'display mac-address',
    cisco_cmd: 'show mac address-table',
  },
  {
    label: 'LLDP / CDP Neighbors',
    category: 'network',
    huawei_cmd: 'display lldp neighbor brief',
    cisco_cmd: 'show cdp neighbors',
  },
  {
    label: 'VLAN Brief / Summary',
    category: 'network',
    huawei_cmd: 'display vlan',
    cisco_cmd: 'show vlan brief',
  },

  // System & Logs
  {
    label: 'Device Status / Version',
    category: 'system',
    huawei_cmd: 'display device',
    cisco_cmd: 'show version',
  },
  {
    label: 'Recent Syslog / Logs',
    category: 'system',
    huawei_cmd: 'display logbuffer',
    cisco_cmd: 'show logging',
  },
  {
    label: 'CPU Utilization',
    category: 'system',
    huawei_cmd: 'display cpu-usage',
    cisco_cmd: 'show processes cpu sorted | head 15',
  },
  {
    label: 'Memory Usage',
    category: 'system',
    huawei_cmd: 'display memory-usage',
    cisco_cmd: 'show processes memory',
  },
  {
    label: 'Running / Current Config',
    category: 'system',
    huawei_cmd: 'display current-configuration',
    cisco_cmd: 'show running-config',
  },
  {
    label: 'Environment / Temp',
    category: 'system',
    huawei_cmd: 'display temperature all',
    cisco_cmd: 'show environment all',
  },

  // Fiber & Transceiver
  {
    label: 'Fiber Transceiver Info',
    category: 'fiber',
    huawei_cmd: 'display transceiver',
    cisco_cmd: 'show interfaces transceiver',
  },
  {
    label: 'Transceiver Detail / Verbose',
    category: 'fiber',
    huawei_cmd: 'display transceiver verbose',
    cisco_cmd: 'show interfaces transceiver detail',
  },
  {
    label: 'Transceiver Alarm',
    category: 'fiber',
    huawei_cmd: 'display transceiver alarm',
    cisco_cmd: 'show interfaces transceiver detail',
  },
];

const SINGLE_HUAWEI_COMMANDS = [
  { label: 'Fiber Transceiver', cmd: 'display transceiver', category: 'fiber' },
  { label: 'Transceiver Verbose', cmd: 'display transceiver verbose', category: 'fiber' },
  { label: 'Transceiver Alarm', cmd: 'display transceiver alarm', category: 'fiber' },
  { label: 'IP Interfaces Brief', cmd: 'display ip interface brief', category: 'interface' },
  { label: 'Port Status Brief', cmd: 'display interface brief', category: 'interface' },
  { label: 'Interface Counters', cmd: 'display interface counters', category: 'interface' },
  { label: 'Interface Errors', cmd: 'display interface counters error', category: 'interface' },
  { label: 'MAC Address Table', cmd: 'display mac-address', category: 'network' },
  { label: 'ARP Table (All)', cmd: 'display arp all', category: 'network' },
  { label: 'IP Routing Table', cmd: 'display ip routing-table', category: 'network' },
  { label: 'LLDP Neighbors', cmd: 'display lldp neighbor brief', category: 'network' },
  { label: 'VLAN Summary', cmd: 'display vlan', category: 'network' },
  { label: 'Device Status', cmd: 'display device', category: 'system' },
  { label: 'Recent Logs (Syslog)', cmd: 'display logbuffer', category: 'system' },
  { label: 'Current Configuration', cmd: 'display current-configuration', category: 'system' },
  { label: 'CPU Utilization', cmd: 'display cpu-usage', category: 'system' },
  { label: 'Memory Usage', cmd: 'display memory-usage', category: 'system' },
  { label: 'Temperature Status', cmd: 'display temperature all', category: 'system' },
];

const SINGLE_CISCO_COMMANDS = [
  { label: 'Fiber Transceiver', cmd: 'show interfaces transceiver', category: 'fiber' },
  { label: 'Transceiver Detail', cmd: 'show interfaces transceiver detail', category: 'fiber' },
  { label: 'IP Interfaces Brief', cmd: 'show ip interface brief', category: 'interface' },
  { label: 'Port Status', cmd: 'show interfaces status', category: 'interface' },
  { label: 'Interface Counters Errors', cmd: 'show interfaces counters errors', category: 'interface' },
  { label: 'Interface Description', cmd: 'show interfaces description', category: 'interface' },
  { label: 'MAC Address Table', cmd: 'show mac address-table', category: 'network' },
  { label: 'ARP Cache', cmd: 'show ip arp', category: 'network' },
  { label: 'IP Route Table', cmd: 'show ip route', category: 'network' },
  { label: 'CDP Neighbors', cmd: 'show cdp neighbors', category: 'network' },
  { label: 'LLDP Neighbors', cmd: 'show lldp neighbors', category: 'network' },
  { label: 'VLAN Brief', cmd: 'show vlan brief', category: 'network' },
  { label: 'System Version', cmd: 'show version', category: 'system' },
  { label: 'Recent Logging', cmd: 'show logging', category: 'system' },
  { label: 'Running Configuration', cmd: 'show running-config', category: 'system' },
  { label: 'CPU Utilization', cmd: 'show processes cpu sorted | head 15', category: 'system' },
  { label: 'Environment All', cmd: 'show environment all', category: 'system' },
];

export default function TroubleshootPage({
  deviceMode = 'multi',
  device,
  fleet = [],
}) {
  const isHuawei = device?.device_type?.toLowerCase().includes('huawei');
  const [customCommand, setCustomCommand] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [connectivityTool, setConnectivityTool] = useState('ping'); // 'ping' | 'traceroute'
  const [connectTarget, setConnectTarget] = useState('');
  const [logKeyword, setLogKeyword] = useState('');
  const [history, setHistory] = useState([]);
  const [executing, setExecuting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [activeAsyncJob, setActiveAsyncJob] = useState(null); // { id, title }

  // Single Device Result State
  const [currentResult, setCurrentResult] = useState(null);

  // Multi Device Batch Result State
  const [batchResults, setBatchResults] = useState(null);
  const [selectedDeviceIndex, setSelectedDeviceIndex] = useState(0);

  const validFleet = fleet.filter((d) => d.host && d.host.trim() !== '');

  // Shortcuts Filtering
  const shortcutsList = deviceMode === 'multi'
    ? MULTI_SHORTCUTS
    : (isHuawei ? SINGLE_HUAWEI_COMMANDS : SINGLE_CISCO_COMMANDS);

  const filteredShortcuts = activeCategory === 'all'
    ? shortcutsList
    : shortcutsList.filter((c) => c.category === activeCategory);

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

      try {
        const payloadDevices = validFleet.map((d) => ({
          host: d.host.trim(),
          port: parseInt(d.port, 10) || 22,
          device_type: d.device_type || 'cisco_ios',
          username: d.username || '',
          password: d.password || '',
          secret: d.secret || '',
          connection_mode: 'network',
        }));

        const res = await executeBatchTroubleshootCommand(payloadDevices, trimmed, vendorCommands);
        setBatchResults(res);
        setSelectedDeviceIndex(0);
      } catch (err) {
        setErrorMessage(err.response?.data?.detail || err.message || 'Fleet troubleshoot execution failed');
        setBatchResults(null);
      } finally {
        setExecuting(false);
      }
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

  const handleCustomSubmit = (e) => {
    e.preventDefault();
    runExecution(customCommand);
  };

  const handleShortcutClick = (shortcut) => {
    if (deviceMode === 'multi') {
      setCustomCommand(shortcut.label);
      runExecution(shortcut.label, {
        huawei: shortcut.huawei_cmd,
        cisco_ios: shortcut.cisco_cmd,
      });
    } else {
      setCustomCommand(shortcut.cmd);
      runExecution(shortcut.cmd);
    }
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
    <div className="troubleshoot-page-container">
      {/* Left Column: Troubleshooting Controls & Shortcuts */}
      <div className="troubleshoot-left">
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
                    ? 'e.g. ping 192.168.1.1 or display ip int brief or show ip route'
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

              {deviceMode === 'multi' && (
                <button
                  type="button"
                  disabled={executing || !customCommand.trim()}
                  onClick={() => handleLaunchAsyncFleetTroubleshoot(customCommand)}
                  className="btn-send-cli"
                  style={{ background: 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)', borderColor: '#818cf8', width: 'auto', padding: '0 0.85rem', gap: '0.35rem' }}
                  title="Launch 10,000+ Devices Background Job with Live Progress Stream"
                >
                  <Zap className="h-3.5 w-3.5 text-amber-300" />
                  <span className="text-xs font-bold font-mono">10k+ Fleet Job</span>
                </button>
              )}
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

          {errorMessage && (
            <div className="alert-box" style={{ marginTop: '0.75rem' }}>
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Diagnostic Shortcuts with Vendor / Fleet Awareness */}
        <div className="troubleshoot-card">
          <div className="shortcuts-header">
            <h3 className="shortcuts-heading">Diagnostic Shortcuts</h3>
            <span className="device-vendor-badge">
              {deviceMode === 'multi' ? 'Multi-Vendor Fleet (Huawei / Cisco)' : isHuawei ? 'Huawei VRP' : 'Cisco IOS'}
            </span>
          </div>

          {/* Category Tabs */}
          <div className="category-tabs-bar">
            {SHORTCUT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`cat-pill-btn ${activeCategory === cat.id ? 'active' : ''}`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Shortcuts Grid */}
          <div className="shortcuts-grid">
            {filteredShortcuts.map((qc, idx) => (
              <button
                key={idx}
                onClick={() => handleShortcutClick(qc)}
                disabled={executing}
                className="shortcut-btn"
                title={
                  deviceMode === 'multi'
                    ? `${qc.label}\nHuawei: ${qc.huawei_cmd}\nCisco: ${qc.cisco_cmd}`
                    : `${qc.label}\n${qc.cmd}`
                }
              >
                <span className="shortcut-label">{qc.label}</span>
                {deviceMode === 'multi' ? (
                  <div className="shortcut-multi-cmds">
                    <div className="cmd-tag-row font-mono">
                      <span className="cmd-tag-badge hw">HW</span>
                      <span className="cmd-tag-text">{qc.huawei_cmd}</span>
                    </div>
                    <div className="cmd-tag-row font-mono">
                      <span className="cmd-tag-badge cs">CS</span>
                      <span className="cmd-tag-text">{qc.cisco_cmd}</span>
                    </div>
                  </div>
                ) : (
                  <p className="shortcut-cmd font-mono">{qc.cmd}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right Column: Terminal Display / Fleet Drilldown */}
      <div className="troubleshoot-right">
        {deviceMode === 'multi' ? (
          <div className="multi-troubleshoot-container">
            {/* Batch Stats Bar */}
            {batchResults && (
              <div className="batch-troubleshoot-stats">
                <div className="stat-pill">
                  <span className="stat-k">Fleet:</span>
                  <span className="stat-v">{batchResults.devices_count} Devices</span>
                </div>
                <div className="stat-pill">
                  <span className="stat-k">Success:</span>
                  <span className="stat-v text-emerald-400">{batchResults.success_count}</span>
                </div>
                <div className="stat-pill">
                  <span className="stat-k">Failed:</span>
                  <span className="stat-v text-rose-400">{batchResults.failed_count}</span>
                </div>
                <div className="stat-pill">
                  <span className="stat-k">Elapsed:</span>
                  <span className="stat-v text-indigo-400">{batchResults.overall_time_seconds}s</span>
                </div>
              </div>
            )}

            {/* Device Selector Tabs Bar */}
            {batchResults && batchResults.results && batchResults.results.length > 0 && (
              <div className="device-tabs-row">
                {batchResults.results.map((r, idx) => {
                  const isSelected = selectedDeviceIndex === idx;
                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedDeviceIndex(idx)}
                      className={`device-tab-btn ${isSelected ? 'active' : ''} ${
                        r.success ? 'device-success' : 'device-failed'
                      }`}
                    >
                      <div className="device-tab-info">
                        <span className="device-tab-host font-mono">{r.host}</span>
                        <span className="device-tab-time">{r.execution_time_seconds}s</span>
                      </div>
                      {r.success ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 text-rose-400 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Terminal Output for Active Device */}
            <div style={{ minHeight: '520px', display: 'flex', flexDirection: 'column' }}>
              <TerminalOutput
                title={
                  activeBatchDeviceResult
                    ? `CLI Output: ${activeBatchDeviceResult.host}`
                    : 'Fleet CLI Output'
                }
                command={activeBatchDeviceResult?.command || customCommand}
                output={activeBatchDeviceResult?.output || activeBatchDeviceResult?.error || (batchResults ? '' : 'Execute a command or shortcut from the left panel to see fleet results.')}
                executionTime={activeBatchDeviceResult?.execution_time_seconds}
                onClear={() => setBatchResults(null)}
                isError={activeBatchDeviceResult && !activeBatchDeviceResult.success}
              />
            </div>
          </div>
        ) : (
          /* Single Device Terminal Display */
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
        )}
      </div>

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
