import React, { useState, useEffect } from 'react';
import { Network, CheckCircle2, XCircle, Loader2, RefreshCw, Cable, Globe } from 'lucide-react';
import { testDeviceConnection, getSupportedDeviceTypes } from '../services/api';
import './DeviceForm.css';

export default function DeviceForm({ device, setDevice, onConnectionStatusChange }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [deviceTypes, setDeviceTypes] = useState([
    { label: 'Cisco IOS / IOS-XE', value: 'cisco_ios' },
    { label: 'Cisco IOS (Telnet)', value: 'cisco_ios_telnet' },
    { label: 'Huawei VRP', value: 'huawei' },
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
        [name]: (name === 'port' || name === 'baud_rate') ? parseInt(value) || value : value,
      }));
    }
  };

  const setConnectionMode = (mode) => {
    setDevice((prev) => ({
      ...prev,
      connection_mode: mode,
    }));
  };

  const handleTestConnection = async (e) => {
    e.preventDefault();
    setTesting(true);
    setTestResult(null);

    try {
      const res = await testDeviceConnection(device);
      setTestResult(res);
      if (onConnectionStatusChange) {
        const targetIdentifier = device.connection_mode === 'serial' ? device.serial_port : device.host;
        onConnectionStatusChange(res.connected, targetIdentifier);
      }
    } catch (err) {
      const errMsg = err.response?.data?.detail || err.message || 'Cannot reach backend server';
      const failedResult = {
        connected: false,
        message: errMsg,
      };
      setTestResult(failedResult);
      if (onConnectionStatusChange) {
        const targetIdentifier = device.connection_mode === 'serial' ? device.serial_port : device.host;
        onConnectionStatusChange(false, targetIdentifier);
      }
    } finally {
      setTesting(false);
    }
  };

  const isSerial = device.connection_mode === 'serial';

  return (
    <div className="device-card">
      <div className="device-card-header">
        <div className="device-header-title">
          <Network className="device-header-icon" />
          <h2 className="device-header-text">Target Device (Switch / Router)</h2>
        </div>

        {/* Mode Toggle: Network (SSH/Telnet) vs Serial (Console Cable) */}
        <div className="mode-toggle-group">
          <button
            type="button"
            onClick={() => setConnectionMode('network')}
            className={`btn-mode-toggle ${!isSerial ? 'active' : ''}`}
          >
            <Globe className="h-3.5 w-3.5" />
            <span>Network (SSH / Telnet)</span>
          </button>

          <button
            type="button"
            onClick={() => setConnectionMode('serial')}
            className={`btn-mode-toggle ${isSerial ? 'active' : ''}`}
          >
            <Cable className="h-3.5 w-3.5" />
            <span>Serial / Console Cable</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleTestConnection} className="device-grid">
        {!isSerial ? (
          <>
            {/* Network: Host IP */}
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

            {/* Network: Protocol / Driver */}
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

            {/* Network: Port */}
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
          </>
        ) : (
          <>
            {/* Serial: Port (COM3 or /dev/ttyUSB0) */}
            <div className="form-group col-span-2">
              <label className="form-label">Serial Port (/dev/ttyUSB0 or COM3) *</label>
              <input
                type="text"
                name="serial_port"
                value={device.serial_port || '/dev/ttyUSB0'}
                onChange={handleChange}
                placeholder="/dev/ttyUSB0 or COM3"
                required
                className="form-input font-mono"
              />
            </div>

            {/* Serial: Baudrate */}
            <div className="form-group col-span-2">
              <label className="form-label">Baud Rate *</label>
              <select
                name="baud_rate"
                value={device.baud_rate || 9600}
                onChange={handleChange}
                className="form-select font-mono"
              >
                <option value={9600}>9600 (Standard Cisco/Huawei)</option>
                <option value={19200}>19200</option>
                <option value={38400}>38400</option>
                <option value={57600}>57600</option>
                <option value={115200}>115200 (High Speed)</option>
              </select>
            </div>

            {/* Serial: Driver */}
            <div className="form-group col-span-1">
              <label className="form-label">Vendor OS</label>
              <select
                name="device_type"
                value={device.device_type}
                onChange={handleChange}
                className="form-select"
              >
                <option value="cisco_ios">Cisco IOS</option>
                <option value="huawei">Huawei VRP</option>
                <option value="aruba_os">Aruba / ProCurve</option>
                <option value="generic_termserver">Generic Serial</option>
              </select>
            </div>
          </>
        )}

        {/* Test Button */}
        <div className="form-group col-span-1" style={{ justifyContent: 'flex-end' }}>
          <button
            type="submit"
            disabled={testing || (!isSerial && !device.host) || (isSerial && !device.serial_port)}
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
