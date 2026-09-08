import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import DeviceForm from './components/DeviceForm';
import HealthCheckPage from './pages/HealthCheckPage';
import TroubleshootPage from './pages/TroubleshootPage';
import DeployConfigPage from './pages/DeployConfigPage';
import { getNornirWorkers, setNornirWorkers as saveNornirWorkersApi } from './services/api';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('healthcheck');
  const [deviceConnected, setDeviceConnected] = useState(false);
  const [deviceMode, setDeviceMode] = useState('multi'); // 'single' | 'multi'

  // Nornir Concurrent Workers (Default starts at 10, min: 10, max: 100)
  const [nornirWorkers, setNornirWorkers] = useState(() => {
    const saved = localStorage.getItem('netauto_nornir_workers');
    return saved ? Math.max(10, Math.min(100, parseInt(saved, 10))) : 10;
  });

  useEffect(() => {
    getNornirWorkers()
      .then((data) => {
        if (data?.num_workers) {
          const val = Math.max(10, Math.min(100, data.num_workers));
          setNornirWorkers(val);
          localStorage.setItem('netauto_nornir_workers', val);
        }
      })
      .catch((err) => {
        console.warn('Failed to fetch nornir workers setting from server:', err);
      });
  }, []);

  const handleUpdateWorkers = (val) => {
    const clamped = Math.max(10, Math.min(100, parseInt(val, 10) || 10));
    setNornirWorkers(clamped);
    localStorage.setItem('netauto_nornir_workers', clamped);
    saveNornirWorkersApi(clamped).catch((err) => {
      console.warn('Failed to save nornir workers on backend:', err);
    });
  };

  // Single Device State
  const [device, setDevice] = useState({
    host: '192.168.1.1',
    port: 22,
    username: '',
    password: '',
    secret: '',
    device_type: 'autodetect',
    connection_mode: 'network',
  });

  // Multi-Device Fleet State
  const [fleet, setFleet] = useState([
    {
      id: 'dev-1',
      host: '192.168.1.2',
      port: 22,
      device_type: 'autodetect',
      username: '',
      password: '',
      secret: '',
    },
    {
      id: 'dev-2',
      host: '192.168.1.1',
      port: 22,
      device_type: 'autodetect',
      username: '',
      password: '',
      secret: '',
    },

    {
      id: 'dev-3',
      host: '10.0.0.2',
      port: 22,
      device_type: 'cisco_ios',
      username: '',
      password: '',
      secret: '',
    },
  ]);

  const handleConnectionStatusChange = (status, host) => {
    setDeviceConnected(status);
  };

  return (
    <div className="app-container">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        deviceConnected={deviceConnected}
        deviceHost={deviceMode === 'multi' ? `${fleet.filter(d => d.host).length} Devices` : device.host}
      />

      {/* Main Content Area */}
      <main className="main-content">
        {/* Device Credentials / Target Device Component */}
        <DeviceForm
          deviceMode={deviceMode}
          setDeviceMode={setDeviceMode}
          device={device}
          setDevice={setDevice}
          fleet={fleet}
          setFleet={setFleet}
          onConnectionStatusChange={handleConnectionStatusChange}
          nornirWorkers={nornirWorkers}
          onUpdateWorkers={handleUpdateWorkers}
        />

        {/* Dynamic Page Views */}
        <section className="tab-viewport">
          {activeTab === 'healthcheck' && (
            <HealthCheckPage
              deviceMode={deviceMode}
              device={device}
              fleet={fleet}
              nornirWorkers={nornirWorkers}
              onUpdateWorkers={handleUpdateWorkers}
            />
          )}
          {activeTab === 'troubleshoot' && (
            <TroubleshootPage
              deviceMode={deviceMode}
              device={device}
              fleet={fleet}
              nornirWorkers={nornirWorkers}
              onUpdateWorkers={handleUpdateWorkers}
            />
          )}
          {activeTab === 'deploy' && (
            <DeployConfigPage
              deviceMode={deviceMode}
              device={device}
              fleet={fleet}
              nornirWorkers={nornirWorkers}
              onUpdateWorkers={handleUpdateWorkers}
            />
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <p>Network Automation Platform &bull; FastAPI + Netmiko + React &bull; Ports: Frontend 4000 | Backend 4050</p>
      </footer>
    </div>
  );
}
