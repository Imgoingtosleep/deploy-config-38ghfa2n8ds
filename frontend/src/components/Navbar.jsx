import React from 'react';
import { Server, Activity, Terminal, Send, Share2, LogOut, User } from 'lucide-react';
import './Navbar.css';

export default function Navbar({ activeTab, setActiveTab, deviceConnected, deviceHost, userName, onLogout }) {
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

            <button
              onClick={() => setActiveTab('lldp')}
              className={`nav-btn ${activeTab === 'lldp' ? 'active' : ''}`}
            >
              <Share2 className="nav-icon" />
              <span>LLDP Discovery</span>
            </button>
          </nav>

          {/* Status Indicator & User Menu */}
          <div className="navbar-status" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div className="status-badge">
              <span className={`status-dot ${deviceConnected ? 'connected' : 'disconnected'}`} />
              <span className="status-text">
                {deviceConnected ? `Connected: ${deviceHost}` : 'Target Device Pending'}
              </span>
            </div>
            
            {userName && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingLeft: '20px', borderLeft: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#4b5563', fontSize: '14px', fontWeight: 500 }}>
                  <User size={16} />
                  <span>{userName}</span>
                </div>
                <button 
                  onClick={onLogout}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '13px', fontWeight: 500, color: '#ef4444', backgroundColor: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s' }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fee2e2'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
                >
                  <LogOut size={14} />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
