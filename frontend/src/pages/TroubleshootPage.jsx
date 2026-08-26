import React, { useState } from 'react';
import { Terminal, Send, Loader2, AlertCircle } from 'lucide-react';
import { executeTroubleshootCommand } from '../services/api';
import TerminalOutput from '../components/TerminalOutput';
import './TroubleshootPage.css';

const QUICK_COMMANDS = [
  { label: 'IP Interfaces', cmd: 'show ip interface brief' },
  { label: 'Port Status', cmd: 'show interfaces status' },
  { label: 'MAC Table', cmd: 'show mac address-table' },
  { label: 'ARP Table', cmd: 'show ip arp' },
  { label: 'CDP Neighbors', cmd: 'show cdp neighbors detail' },
  { label: 'LLDP Neighbors', cmd: 'show lldp neighbors' },
  { label: 'VLAN Database', cmd: 'show vlan brief' },
  { label: 'Spanning-Tree', cmd: 'show spanning-tree summary' },
  { label: 'Running Config', cmd: 'show running-config' },
  { label: 'Recent Logs', cmd: 'show logging' },
];

export default function TroubleshootPage({ device }) {
  const [customCommand, setCustomCommand] = useState('');
  const [pingTarget, setPingTarget] = useState('');
  const [executing, setExecuting] = useState(false);
  const [currentResult, setCurrentResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const runCommand = async (cmdToRun) => {
    if (!cmdToRun || !cmdToRun.trim()) return;
    if (!device.host) {
      setErrorMessage('Please fill in Device Host / IP Address above.');
      return;
    }

    setExecuting(true);
    setErrorMessage('');

    try {
      const data = await executeTroubleshootCommand(device, cmdToRun.trim());
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

  const handlePingSubmit = (e) => {
    e.preventDefault();
    if (!pingTarget) return;
    runCommand(`ping ${pingTarget}`);
  };

  return (
    <div className="troubleshoot-page-container">
      {/* Left Column: Command Triggers */}
      <div className="troubleshoot-left">
        {/* CLI Command Box */}
        <div className="troubleshoot-card">
          <h2 className="card-title">
            <Terminal className="card-icon" />
            <span>Interactive CLI Execution</span>
          </h2>

          <form onSubmit={handleCustomSubmit} className="cli-form">
            <div>
              <label className="form-label">Enter Show / Exec Command</label>
              <div className="input-with-button">
                <input
                  type="text"
                  value={customCommand}
                  onChange={(e) => setCustomCommand(e.target.value)}
                  placeholder="e.g. show version or show ip route"
                  className="cli-input"
                />
                <button
                  type="submit"
                  disabled={executing || !customCommand}
                  className="btn-send-cli"
                >
                  {executing ? <Loader2 className="action-icon animate-spin" /> : <Send className="action-icon" />}
                </button>
              </div>
            </div>
          </form>

          {/* Quick Ping from Switch */}
          <div className="ping-section">
            <label className="form-label">Ping from Switch to Destination IP</label>
            <form onSubmit={handlePingSubmit} className="ping-form">
              <input
                type="text"
                value={pingTarget}
                onChange={(e) => setPingTarget(e.target.value)}
                placeholder="8.8.8.8 or gateway IP"
                className="ping-input"
              />
              <button
                type="submit"
                disabled={executing || !pingTarget}
                className="btn-ping"
              >
                Ping
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

        {/* Quick Diagnostic Preset Buttons */}
        <div className="troubleshoot-card">
          <h3 className="shortcuts-heading">Quick Diagnostic Shortcuts</h3>
          <div className="shortcuts-grid">
            {QUICK_COMMANDS.map((qc, idx) => (
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
