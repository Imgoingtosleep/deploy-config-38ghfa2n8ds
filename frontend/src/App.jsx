import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import DeviceForm from './components/DeviceForm';
import HealthCheckPage from './pages/HealthCheckPage';
import TroubleshootPage from './pages/TroubleshootPage';
import DeployConfigPage from './pages/DeployConfigPage';
import LldpDiscoveryPage from './pages/LldpDiscoveryPage';
import { getNornirWorkers, setNornirWorkers as saveNornirWorkersApi } from './services/api';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('healthcheck');

  // Nornir Concurrent Workers (Default starts at 10, min: 1, max: 100)
  const [nornirWorkers, setNornirWorkers] = useState(() => {
    const saved = localStorage.getItem('netauto_nornir_workers');
    return saved ? Math.max(1, Math.min(100, parseInt(saved, 10))) : 10;
  });

  useEffect(() => {
    getNornirWorkers()
      .then((data) => {
        if (data?.num_workers) {
          const val = Math.max(1, Math.min(100, data.num_workers));
          setNornirWorkers(val);
          localStorage.setItem('netauto_nornir_workers', val);
        }
      })
      .catch((err) => {
        console.warn('Failed to fetch nornir workers setting from server:', err);
      });
  }, []);

  const handleUpdateWorkers = (val) => {
    const clamped = Math.max(1, Math.min(100, parseInt(val, 10) || 10));
    setNornirWorkers(clamped);
    localStorage.setItem('netauto_nornir_workers', clamped);
    saveNornirWorkersApi(clamped).catch((err) => {
      console.warn('Failed to save nornir workers on backend:', err);
    });
  };

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

  const activeFleetCount = fleet.filter((d) => d.host && d.host.trim() !== '').length;

  return (
    <div className="app-container">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        deviceConnected={activeFleetCount > 0}
        deviceHost={`${activeFleetCount} Devices`}
      />

      {/* Main Content Area */}
      <main className="main-content">
        {/* Fleet Device Management Component */}
        <DeviceForm
          fleet={fleet}
          setFleet={setFleet}
          nornirWorkers={nornirWorkers}
          onUpdateWorkers={handleUpdateWorkers}
        />

        {/* Dynamic Page Views */}
        <section className="tab-viewport">
          {activeTab === 'healthcheck' && (
            <HealthCheckPage
              fleet={fleet}
              nornirWorkers={nornirWorkers}
              onUpdateWorkers={handleUpdateWorkers}
            />
          )}
          {activeTab === 'troubleshoot' && (
            <TroubleshootPage
              fleet={fleet}
              nornirWorkers={nornirWorkers}
              onUpdateWorkers={handleUpdateWorkers}
            />
          )}
          {activeTab === 'deploy' && (
            <DeployConfigPage
              fleet={fleet}
              nornirWorkers={nornirWorkers}
              onUpdateWorkers={handleUpdateWorkers}
            />
          )}
          {activeTab === 'lldp' && (
            <LldpDiscoveryPage
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
