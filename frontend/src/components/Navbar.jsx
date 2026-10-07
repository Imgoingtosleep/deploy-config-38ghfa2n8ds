import React, { useState, useRef, useEffect } from 'react';
import { Server, Activity, Terminal, Send, Share2, LogOut, User, ChevronDown } from 'lucide-react';
import './Navbar.css';

export default function Navbar({ activeTab, setActiveTab, deviceConnected, deviceHost, userName, onLogout }) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
              <div ref={dropdownRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', paddingLeft: '20px', borderLeft: '1px solid #e5e7eb' }}>
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#4b5563', fontSize: '14px', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 12px', borderRadius: '8px', transition: 'background-color 0.2s' }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', backgroundColor: '#f3f4f6', borderRadius: '50%' }}>
                    <User size={14} color="#4b5563" />
                  </div>
                  <span>{userName}</span>
                  <ChevronDown size={14} color="#9ca3af" style={{ transition: 'transform 0.2s', transform: isDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                </button>

                {isDropdownOpen && (
                  <div style={{ position: 'absolute', top: '100%', right: '0', marginTop: '8px', backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', padding: '6px', minWidth: '150px', zIndex: 50 }}>
                    <button 
                      onClick={() => { setIsDropdownOpen(false); onLogout(); }}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', fontSize: '13px', fontWeight: 500, color: '#ef4444', background: 'none', border: 'none', borderRadius: '6px', cursor: 'pointer', transition: 'background-color 0.2s', textAlign: 'left' }}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <LogOut size={14} />
                      <span>Logout</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
