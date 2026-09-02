import React, { useState } from 'react';
import Navbar from './components/Navbar';
import DeviceForm from './components/DeviceForm';
import HealthCheckPage from './pages/HealthCheckPage';
import TroubleshootPage from './pages/TroubleshootPage';
import DeployConfigPage from './pages/DeployConfigPage';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('healthcheck');
  const [deviceConnected, setDeviceConnected] = useState(false);
  const [deviceMode, setDeviceMode] = useState('multi'); // 'single' | 'multi'

  // Single Device State
  const [device, setDevice] = useState({
    host: '192.168.1.1',
    port: 22,
    username: '',
    password: '',
    secret: '',
    device_type: 'huawei',
    connection_mode: 'network',
  });

  // Multi-Device Fleet State
  const [fleet, setFleet] = useState([
    {
      id: 'dev-1',
      host: '192.168.1.2',
      port: 22,
      device_type: 'huawei',
      username: '',
      password: '',
      secret: '',
    },
    {
      id: 'dev-2',
      host: '192.168.1.1',
      port: 22,
      device_type: 'huawei',
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
        />

        {/* Dynamic Page Views */}
        <section className="tab-viewport">
          {activeTab === 'healthcheck' && (
            <HealthCheckPage
              deviceMode={deviceMode}
              device={device}
              fleet={fleet}
            />
          )}
          {activeTab === 'troubleshoot' && <TroubleshootPage device={device} />}
          {activeTab === 'deploy' && <DeployConfigPage device={device} />}
        </section>
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <p>Network Automation Platform &bull; FastAPI + Netmiko + React &bull; Ports: Frontend 4000 | Backend 4050</p>
      </footer>
    </div>
  );
}
