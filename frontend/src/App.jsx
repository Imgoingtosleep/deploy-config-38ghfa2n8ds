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
  const [device, setDevice] = useState({
    host: '192.168.1.1',
    port: 22,
    username: '',
    password: '',
    secret: '',
    device_type: 'huawei',
    connection_mode: 'network',
  });

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
        deviceHost={device.host}
      />

      {/* Main Content Area */}
      <main className="main-content">
        {/* Device Credentials / Connection Bar Component */}
        <DeviceForm
          device={device}
          setDevice={setDevice}
          onConnectionStatusChange={handleConnectionStatusChange}
        />

        {/* Dynamic Page Views */}
        <section className="tab-viewport">
          {activeTab === 'healthcheck' && <HealthCheckPage device={device} />}
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
