import React from 'react';
import { Server, Activity, Terminal, Send } from 'lucide-react';
import './Navbar.css';

export default function Navbar({ activeTab, setActiveTab, deviceConnected, deviceHost }) {
  return (
    <header className="navbar-header">
      <div className="navbar-container">
        <div className="navbar-wrapper">
          {/* Logo & Title */}
          <div className="navbar-brand">
            <div className="brand-icon-wrapper">
              <Server className="brand-icon" />
            </div>
            <div>
              <h1 className="brand-title">NetAuto Hub</h1>
              <p className="brand-subtitle">Switch & Router Config Deployer & Diagnostics</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="navbar-nav">
            <button
              onClick={() => setActiveTab('healthcheck')}
              className={`nav-btn ${activeTab === 'healthcheck' ? 'active' : ''}`}
            >
              <Activity className="nav-icon" />
              <span>Health Check</span>
            </button>

            <button
              onClick={() => setActiveTab('troubleshoot')}
              className={`nav-btn ${activeTab === 'troubleshoot' ? 'active' : ''}`}
            >
              <Terminal className="nav-icon" />
              <span>Troubleshoot & CLI</span>
            </button>

            <button
              onClick={() => setActiveTab('deploy')}
              className={`nav-btn ${activeTab === 'deploy' ? 'active' : ''}`}
            >
              <Send className="nav-icon" />
              <span>Deploy Config</span>
            </button>
          </nav>

          {/* Status Indicator */}
          <div className="navbar-status">
            <div className="status-badge">
              <span className={`status-dot ${deviceConnected ? 'connected' : 'disconnected'}`} />
              <span className="status-text">
                {deviceConnected ? `Connected: ${deviceHost}` : 'Target Device Pending'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
