import React, { useState, useEffect } from 'react';
import { Network, CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react';
import { testDeviceConnection, getSupportedDeviceTypes } from '../services/api';
import './DeviceForm.css';

export default function DeviceForm({ device, setDevice, onConnectionStatusChange }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [deviceTypes, setDeviceTypes] = useState([
    { label: 'Huawei VRP (SSH)', value: 'huawei' },
    { label: 'Huawei VRP (Telnet)', value: 'huawei_telnet' },
    { label: 'Cisco IOS / IOS-XE (SSH)', value: 'cisco_ios' },
    { label: 'Cisco IOS (Telnet)', value: 'cisco_ios_telnet' },
    { label: 'Aruba OS-CX', value: 'aruba_os' },
    { label: 'Juniper JunOS', value: 'juniper_junos' },
  ]);

  useEffect(() => {
    getSupportedDeviceTypes()
      .then((data) => {
        if (data && data.device_types) {
          setDeviceTypes(data.device_types);
        }
      })
      .catch(() => console.log('Using default device types list'));
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'device_type') {
      const isTelnet = value.toLowerCase().includes('telnet');
      setDevice((prev) => ({
        ...prev,
        device_type: value,
        port: isTelnet ? 23 : 22,
      }));
    } else {
      setDevice((prev) => ({
        ...prev,
        [name]: name === 'port' ? parseInt(value) || value : value,
      }));
    }
  };

  const handleTestConnection = async (e) => {
    e.preventDefault();
    setTesting(true);
    setTestResult(null);

    try {
      const res = await testDeviceConnection(device);
      setTestResult(res);
      if (onConnectionStatusChange) {
        onConnectionStatusChange(res.connected, device.host);
      }
    } catch (err) {
      const errMsg = err.response?.data?.detail || err.message || 'Cannot reach backend server';
      const failedResult = {
        connected: false,
        message: errMsg,
      };
      setTestResult(failedResult);
      if (onConnectionStatusChange) {
        onConnectionStatusChange(false, device.host);
      }
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="device-card">
      <div className="device-card-header">
        <div className="device-header-title">
          <Network className="device-header-icon" />
          <h2 className="device-header-text">Target Device (Switch / Router)</h2>
        </div>
      </div>

      <form onSubmit={handleTestConnection} className="device-grid">
        {/* Host IP */}
        <div className="form-group col-span-2">
          <label className="form-label">Host / IP Address *</label>
          <input
            type="text"
            name="host"
            value={device.host}
            onChange={handleChange}
            placeholder="192.168.1.1"
            required
            className="form-input font-mono"
          />
        </div>

        {/* Protocol / Driver */}
        <div className="form-group col-span-2">
          <label className="form-label">Protocol / Driver *</label>
          <select
            name="device_type"
            value={device.device_type}
            onChange={handleChange}
            className="form-select"
          >
            {deviceTypes.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Port */}
        <div className="form-group col-span-1">
          <label className="form-label">Port</label>
          <input
            type="number"
            name="port"
            value={device.port || 22}
            onChange={handleChange}
            className="form-input font-mono"
          />
        </div>

        {/* Test Button */}
        <div className="form-group col-span-1" style={{ justifyContent: 'flex-end' }}>
          <button
            type="submit"
            disabled={testing || !device.host}
            className="btn-test"
          >
            {testing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Testing...</span>
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                <span>Test Connect</span>
              </>
            )}
          </button>
        </div>

        {/* Username */}
        <div className="form-group col-span-2">
          <label className="form-label">Username (Optional)</label>
          <input
            type="text"
            name="username"
            value={device.username}
            onChange={handleChange}
            placeholder="Leave blank if no user"
            className="form-input"
          />
        </div>

        {/* Password */}
        <div className="form-group col-span-2">
          <label className="form-label">Password (Optional)</label>
          <input
            type="password"
            name="password"
            value={device.password}
            onChange={handleChange}
            placeholder="Leave blank if no password"
            className="form-input"
          />
        </div>

        {/* Enable / Secret */}
        <div className="form-group col-span-2">
          <label className="form-label">Enable Secret (Optional)</label>
          <input
            type="password"
            name="secret"
            value={device.secret}
            onChange={handleChange}
            placeholder="Enable secret password (if required)"
            className="form-input"
          />
        </div>
      </form>

      {/* Test Connection Banner */}
      {testResult && (
        <div className={`test-banner ${testResult.connected ? 'success' : 'failed'}`}>
          {testResult.connected ? (
            <CheckCircle2 className="banner-icon" />
          ) : (
            <XCircle className="banner-icon" />
          )}
          <div className="banner-content">
            <p className="banner-message">{testResult.message}</p>
            {testResult.device_prompt && (
              <p className="banner-prompt">Prompt: {testResult.device_prompt}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
