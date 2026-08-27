import React, { useState } from 'react';
import { Send, FileCode, CheckSquare, Square, AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import { deployConfiguration } from '../services/api';
import TerminalOutput from '../components/TerminalOutput';
import './DeployConfigPage.css';

const TEMPLATES = [
  {
    title: 'Create VLAN & Name',
    config: `vlan 10\n name USERS_DATA\nvlan 20\n name VOIP_PHONES\nvlan 99\n name MANAGEMENT`,
  },
  {
    title: 'Configure Access Port',
    config: `interface GigabitEthernet0/1\n description User Access Port\n switchport mode access\n switchport access vlan 10\n spanning-tree portfast\n no shutdown`,
  },
  {
    title: 'Configure Trunk Port',
    config: `interface GigabitEthernet0/24\n description Uplink to Core Switch\n switchport trunk encapsulation dot1q\n switchport mode trunk\n switchport trunk allowed vlan 10,20,99\n no shutdown`,
  },
  {
    title: 'NTP & Syslog Server',
    config: `ntp server 192.168.1.50\nlogging host 192.168.1.50\nlogging trap warnings\nservice timestamps log datetime msec`,
  },
  {
    title: 'Banner MOTD',
    config: `banner motd #\n************************************************\n* AUTHORIZED ACCESS ONLY - ALL ACTIVITY LOGGED *\n************************************************\n#`,
  },
];

export default function DeployConfigPage({ device }) {
  const [configText, setConfigText] = useState('');
  const [saveConfig, setSaveConfig] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const handleDeploy = async () => {
    if (!device.host) {
      setErrorMessage('Please fill in Device Host / IP Address above.');
      return;
    }

    const lines = configText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      setErrorMessage('Please enter at least one configuration command.');
      return;
    }

    setDeploying(true);
    setErrorMessage('');

    try {
      const data = await deployConfiguration(device, lines, saveConfig);
      setResult(data);
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || err.message || 'Config deployment failed');
      setResult(null);
    } finally {
      setDeploying(false);
    }
  };

  const lineCount = configText.split('\n').filter((l) => l.trim().length > 0).length;

  return (
    <div className="deploy-page-container">
      {/* Left Column: Config Editor & Template Selectors */}
      <div className="deploy-left">
        <div className="deploy-card">
          <div className="deploy-card-header">
            <h2 className="deploy-card-title">
              <FileCode className="h-4 w-4" style={{ color: '#818cf8' }} />
              <span>Configuration Script Editor</span>
            </h2>
            <span className="command-counter">
              {lineCount} {lineCount === 1 ? 'command' : 'commands'}
            </span>
          </div>

          {/* Quick Snippet Templates */}
          <div className="templates-bar">
            <span className="templates-label">
              <Sparkles className="h-3 w-3" style={{ color: '#818cf8' }} />
              <span>Insert Template Snippet:</span>
            </span>
            <div className="template-pills">
              {TEMPLATES.map((tmpl, idx) => (
                <button
                  key={idx}
                  onClick={() => setConfigText(tmpl.config)}
                  className="btn-template"
                >
                  {tmpl.title}
                </button>
              ))}
            </div>
          </div>

          {/* Textarea for Config */}
          <div className="editor-wrapper">
            <textarea
              value={configText}
              onChange={(e) => setConfigText(e.target.value)}
              placeholder="vlan 100&#10; name SERVERS_VLAN&#10;interface GigabitEthernet0/10&#10; switchport mode access&#10; switchport access vlan 100"
              className="config-textarea"
            />
          </div>

          {/* Options & Action Bar */}
          <div className="deploy-actions-bar">
            <button
              onClick={() => setSaveConfig(!saveConfig)}
              className="save-toggle"
            >
              {saveConfig ? (
                <CheckSquare className="h-4 w-4" style={{ color: '#818cf8' }} />
              ) : (
                <Square className="h-4 w-4" style={{ color: '#475569' }} />
              )}
              <span>Save running-config to startup-config (write mem / save)</span>
            </button>

            <button
              onClick={handleDeploy}
              disabled={deploying || lineCount === 0 || !device.host}
              className="btn-push-config"
            >
              {deploying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Deploying Config...</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span>Push Config</span>
                </>
              )}
            </button>
          </div>

          {errorMessage && (
            <div className="alert-box" style={{ marginTop: '0.75rem' }}>
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Deployment Output Terminal */}
      <div className="deploy-right" style={{ minHeight: '550px' }}>
        <TerminalOutput
          title="Deployment Result Log"
          command={result?.command || 'send_config_set'}
          output={result?.output || result?.error}
          executionTime={result?.execution_time_seconds}
          onClear={() => setResult(null)}
          isError={result && !result.success}
        />
      </div>
    </div>
  );
}
