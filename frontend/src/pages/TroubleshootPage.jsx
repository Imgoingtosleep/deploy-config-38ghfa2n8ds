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
} from 'lucide-react';
import { executeTroubleshootCommand } from '../services/api';
import TerminalOutput from '../components/TerminalOutput';
import './TroubleshootPage.css';

const SHORTCUT_CATEGORIES = [
  { id: 'all', label: 'All Shortcuts' },
  { id: 'fiber', label: 'Fiber & SFP' },
  { id: 'interface', label: 'Interfaces' },
  { id: 'network', label: 'Routing & L2' },
  { id: 'system', label: 'System & Logs' },
];

const HUAWEI_COMMANDS = [
  // Fiber & Transceiver
  { label: 'Fiber Transceiver', cmd: 'display transceiver', category: 'fiber' },
  { label: 'Transceiver Verbose', cmd: 'display transceiver verbose', category: 'fiber' },
  { label: 'Transceiver Alarm', cmd: 'display transceiver alarm', category: 'fiber' },
  { label: 'Optical Module Brief', cmd: 'display optical-module brief', category: 'fiber' },
  
  // Interface & Ports
  { label: 'IP Interfaces Brief', cmd: 'display ip interface brief', category: 'interface' },
  { label: 'Port Status Brief', cmd: 'display interface brief', category: 'interface' },
  { label: 'Interface Counters', cmd: 'display interface counters', category: 'interface' },
  { label: 'Interface Errors', cmd: 'display interface counters error', category: 'interface' },

  // Routing & ARP / L2
  { label: 'MAC Address Table', cmd: 'display mac-address', category: 'network' },
  { label: 'ARP Table (All)', cmd: 'display arp all', category: 'network' },
  { label: 'IP Routing Table', cmd: 'display ip routing-table', category: 'network' },
  { label: 'LLDP Neighbors', cmd: 'display lldp neighbor brief', category: 'network' },
  { label: 'VLAN Summary', cmd: 'display vlan', category: 'network' },

  // System & Logs
  { label: 'Device Status', cmd: 'display device', category: 'system' },
  { label: 'Recent Logs (Syslog)', cmd: 'display logbuffer', category: 'system' },
  { label: 'Current Configuration', cmd: 'display current-configuration', category: 'system' },
  { label: 'CPU Utilization', cmd: 'display cpu-usage', category: 'system' },
  { label: 'Memory Usage', cmd: 'display memory-usage', category: 'system' },
  { label: 'Temperature Status', cmd: 'display temperature all', category: 'system' },
];

const CISCO_COMMANDS = [
  // Fiber & Transceiver
  { label: 'Fiber Transceiver', cmd: 'show interfaces transceiver', category: 'fiber' },
  { label: 'Transceiver Detail', cmd: 'show interfaces transceiver detail', category: 'fiber' },
  
  // Interface & Ports
  { label: 'IP Interfaces Brief', cmd: 'show ip interface brief', category: 'interface' },
  { label: 'Port Status', cmd: 'show interfaces status', category: 'interface' },
  { label: 'Interface Counters Errors', cmd: 'show interfaces counters errors', category: 'interface' },
  { label: 'Interface Description', cmd: 'show interfaces description', category: 'interface' },

  // Routing & ARP / L2
  { label: 'MAC Address Table', cmd: 'show mac address-table', category: 'network' },
  { label: 'ARP Cache', cmd: 'show ip arp', category: 'network' },
  { label: 'IP Route Table', cmd: 'show ip route', category: 'network' },
  { label: 'CDP Neighbors', cmd: 'show cdp neighbors', category: 'network' },
  { label: 'LLDP Neighbors', cmd: 'show lldp neighbors', category: 'network' },
  { label: 'VLAN Brief', cmd: 'show vlan brief', category: 'network' },

  // System & Logs
  { label: 'System Version', cmd: 'show version', category: 'system' },
  { label: 'Recent Logging', cmd: 'show logging', category: 'system' },
  { label: 'Running Configuration', cmd: 'show running-config', category: 'system' },
  { label: 'CPU Utilization', cmd: 'show processes cpu sorted | head 15', category: 'system' },
  { label: 'Environment All', cmd: 'show environment all', category: 'system' },
];

export default function TroubleshootPage({ device }) {
  const isHuawei = device.device_type?.toLowerCase().includes('huawei');
  const allCommands = isHuawei ? HUAWEI_COMMANDS : CISCO_COMMANDS;

  const [customCommand, setCustomCommand] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [connectivityTool, setConnectivityTool] = useState('ping'); // 'ping' | 'traceroute'
  const [connectTarget, setConnectTarget] = useState('');
  const [logKeyword, setLogKeyword] = useState('');
  const [history, setHistory] = useState([]);
  const [executing, setExecuting] = useState(false);
  const [currentResult, setCurrentResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const filteredShortcuts = activeCategory === 'all'
    ? allCommands
    : allCommands.filter((c) => c.category === activeCategory);

  const runCommand = async (cmdToRun) => {
    if (!cmdToRun || !cmdToRun.trim()) return;
    if (!device.host) {
      setErrorMessage('Please fill in Device Host / IP Address above.');
      return;
    }

    const trimmed = cmdToRun.trim();
    setExecuting(true);
    setErrorMessage('');

    // Add to history (keep top 5 unique)
    setHistory((prev) => [trimmed, ...prev.filter((c) => c !== trimmed)].slice(0, 5));

    try {
      const data = await executeTroubleshootCommand(device, trimmed);
      setCurrentResult(data);
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || err.message || 'Command execution failed');
      setCurrentResult(null);
    } finally {
      setExecuting(false);
    }
  };

  const handleCustomSubmit = (e) => {
    e.preventDefault();
    runCommand(customCommand);
  };

  const handleConnectivitySubmit = (e) => {
    e.preventDefault();
    if (!connectTarget.trim()) return;
    const target = connectTarget.trim();
    if (connectivityTool === 'traceroute') {
      const cmd = isHuawei ? `tracert ${target}` : `traceroute ${target}`;
      setCustomCommand(cmd);
      runCommand(cmd);
    } else {
      const cmd = `ping ${target}`;
      setCustomCommand(cmd);
      runCommand(cmd);
    }
  };

  const handleLogSearchSubmit = (e) => {
    e.preventDefault();
    if (!logKeyword.trim()) return;
    const kw = logKeyword.trim();
    const cmd = isHuawei ? `display logbuffer | include ${kw}` : `show logging | include ${kw}`;
    setCustomCommand(cmd);
    runCommand(cmd);
  };

  return (
    <div className="troubleshoot-page-container">
      {/* Left Column: Troubleshooting Tools */}
      <div className="troubleshoot-left">
        {/* CLI Execution Card */}
        <div className="troubleshoot-card">
          <h2 className="card-title">
            <Terminal className="card-icon" />
            <span>Interactive CLI Execution</span>
          </h2>

          <form onSubmit={handleCustomSubmit} className="cli-form">
            <div className="input-with-button">
              <input
                type="text"
                value={customCommand}
                onChange={(e) => setCustomCommand(e.target.value)}
                placeholder={isHuawei ? 'e.g. display transceiver or display vlan' : 'e.g. show version or show ip route'}
                className="cli-input"
              />
              <button
                type="submit"
                disabled={executing || !customCommand.trim()}
                className="btn-send-cli"
                title="Execute Command"
              >
                {executing ? <Loader2 className="action-icon animate-spin" /> : <Send className="action-icon" />}
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
                      runCommand(hCmd);
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
                placeholder="Destination IP / Host (e.g. 8.8.8.8)"
                className="tool-input"
              />
              <button
                type="submit"
                disabled={executing || !connectTarget.trim()}
                className="btn-tool-action"
              >
                {connectivityTool === 'ping' ? 'Ping' : 'Trace'}
              </button>
            </form>
          </div>

          {/* Logbuffer Search Filter Tool */}
          <div className="log-search-section">
            <div className="log-search-label">
              <FileText className="h-3.5 w-3.5 text-indigo-400" />
              <span>Search Switch Log Buffer</span>
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
                <Search className="h-3.5 w-3.5" />
                <span>Search</span>
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

        {/* Quick Diagnostic Preset Buttons with Categories */}
        <div className="troubleshoot-card">
          <div className="shortcuts-header">
            <h3 className="shortcuts-heading">Diagnostic Shortcuts</h3>
            <span className="device-vendor-badge">{isHuawei ? 'Huawei VRP' : 'Cisco IOS'}</span>
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
                onClick={() => {
                  setCustomCommand(qc.cmd);
                  runCommand(qc.cmd);
                }}
                disabled={executing}
                className="shortcut-btn"
              >
                <span className="shortcut-label">{qc.label}</span>
                <p className="shortcut-cmd">{qc.cmd}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right Column: Terminal Display */}
      <div className="troubleshoot-right" style={{ minHeight: '550px' }}>
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
  );
}
