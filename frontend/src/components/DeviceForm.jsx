import React, { useState, useEffect } from 'react';
import {
  Network,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Layers,
  Plus,
  Trash2,
  KeyRound,
} from 'lucide-react';
import { testDeviceConnection, getSupportedDeviceTypes } from '../services/api';
import './DeviceForm.css';

export default function DeviceForm({
  deviceMode = 'multi',
  setDeviceMode,
  device,
  setDevice,
  fleet = [],
  setFleet,
  onConnectionStatusChange,
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [commonType, setCommonType] = useState('huawei');
  const [commonUser, setCommonUser] = useState('');
  const [commonPass, setCommonPass] = useState('');

  const [deviceTypes, setDeviceTypes] = useState([
    { label: 'Huawei VRP (SSH)', value: 'huawei' },
    { label: 'Huawei VRP (Telnet)', value: 'huawei_telnet' },
    { label: 'Cisco IOS / IOS-XE (SSH)', value: 'cisco_ios' },
    { label: 'Cisco IOS (Telnet)', value: 'cisco_ios_telnet' },
    { label: 'HP / H3C Comware', value: 'hp_comware' },
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

  // Single Device Handlers
  const handleSingleChange = (e) => {
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
        [name]: name === 'port' ? parseInt(value, 10) || value : value,
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

  // Fleet Handlers
  const updateFleetDevice = (id, field, value) => {
    setFleet((prev) => prev.map((d) => (d.id === id ? { ...d, [field]: value } : d)));
  };

  const addFleetDevice = () => {
    const newId = `dev-${Date.now()}`;
    setFleet((prev) => [
      ...prev,
      {
        id: newId,
        host: '',
        port: 22,
        device_type: 'huawei',
        username: commonUser,
        password: commonPass,
        secret: '',
      },
    ]);
  };

  const removeFleetDevice = (id) => {
    setFleet((prev) => prev.filter((d) => d.id !== id));
  };

  const applyCredentialsToAll = () => {
    setFleet((prev) =>
      prev.map((d) => ({
        ...d,
        device_type: commonType || d.device_type,
        ...(commonUser !== '' ? { username: commonUser } : {}),
        ...(commonPass !== '' ? { password: commonPass } : {}),
      }))
    );
  };

  return (
    <div className="device-card">
      {/* Header with Mode Switcher */}
      <div className="device-card-header">
        <div className="device-header-title">
          <Network className="device-header-icon" />
          <h2 className="device-header-text">Target Device (Switch / Router)</h2>
        </div>

        {/* Mode Selector Toggle */}
        <div className="mode-toggle-group">
          <button
            type="button"
            className={`btn-mode-toggle ${deviceMode === 'single' ? 'active' : ''}`}
            onClick={() => setDeviceMode && setDeviceMode('single')}
          >
            <Network className="h-3.5 w-3.5" />
            <span>Single Device</span>
          </button>
          <button
            type="button"
            className={`btn-mode-toggle ${deviceMode === 'multi' ? 'active' : ''}`}
            onClick={() => setDeviceMode && setDeviceMode('multi')}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Multi-Device Fleet ({fleet.filter((d) => d.host).length})</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SINGLE DEVICE FORM                                                        */}
      {/* ========================================================================= */}
      {deviceMode === 'single' ? (
        <>
          <form onSubmit={handleTestConnection} className="device-grid">
            {/* Host IP */}
            <div className="form-group col-span-3">
              <label className="form-label">Host / IP Address *</label>
              <input
                type="text"
                name="host"
                value={device.host}
                onChange={handleSingleChange}
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
                onChange={handleSingleChange}
                className="form-select"
              >
                {deviceTypes.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
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
                onChange={handleSingleChange}
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
                onChange={handleSingleChange}
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
                onChange={handleSingleChange}
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
        </>
      ) : (
        /* ========================================================================= */
        /* MULTI-DEVICE FLEET TABLE                                                  */
        /* ========================================================================= */
        <div className="fleet-section" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
          <div className="fleet-header">
            <div className="fleet-header-left">
              <span className="fleet-title">Fleet Device List ({fleet.filter((d) => d.host).length} Devices)</span>
            </div>

            {/* Quick Credentials Filler */}
            <div className="quick-creds-bar">
              <span className="quick-creds-label">Batch Setup:</span>
              <select
                value={commonType}
                onChange={(e) => setCommonType(e.target.value)}
                className="quick-select"
                title="Select device type to apply to all"
              >
                <option value="huawei">Huawei (VRP)</option>
                <option value="cisco_ios">Cisco (IOS/IOS-XE)</option>
                <option value="hp_comware">HP / H3C Comware</option>
                <option value="aruba_os">Aruba OS</option>
                <option value="juniper_junos">Juniper JunOS</option>
              </select>
              <input
                type="text"
                placeholder="User"
                value={commonUser}
                onChange={(e) => setCommonUser(e.target.value)}
                className="quick-input"
              />
              <input
                type="password"
                placeholder="Pass"
                value={commonPass}
                onChange={(e) => setCommonPass(e.target.value)}
                className="quick-input"
              />
              <button
                type="button"
                className="quick-apply-btn"
                onClick={applyCredentialsToAll}
                title="Apply Type, Username, and Password to all devices in list"
              >
                Apply to All
              </button>
              <button
                type="button"
                className="btn-add-device"
                onClick={addFleetDevice}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Device</span>
              </button>
            </div>
          </div>

          <div className="fleet-table-container">
            <table className="fleet-table">
              <thead>
                <tr>
                  <th>IP Address (Host)</th>
                  <th>Type</th>
                  <th>Username</th>
                  <th>Password</th>
                  <th style={{ width: '50px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {fleet.map((dev) => (
                  <tr key={dev.id}>
                    <td>
                      <input
                        type="text"
                        value={dev.host}
                        onChange={(e) => updateFleetDevice(dev.id, 'host', e.target.value)}
                        placeholder="e.g. 192.168.1.1"
                        className="fleet-input font-mono"
                      />
                    </td>
                    <td>
                      <select
                        value={dev.device_type}
                        onChange={(e) => updateFleetDevice(dev.id, 'device_type', e.target.value)}
                        className="fleet-select"
                      >
                        <option value="huawei">Huawei (VRP)</option>
                        <option value="cisco_ios">Cisco (IOS/IOS-XE)</option>
                        <option value="hp_comware">HP / H3C Comware</option>
                        <option value="aruba_os">Aruba OS</option>
                        <option value="juniper_junos">Juniper JunOS</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={dev.username}
                        onChange={(e) => updateFleetDevice(dev.id, 'username', e.target.value)}
                        placeholder="Username"
                        className="fleet-input"
                      />
                    </td>
                    <td>
                      <input
                        type="password"
                        value={dev.password}
                        onChange={(e) => updateFleetDevice(dev.id, 'password', e.target.value)}
                        placeholder="Password"
                        className="fleet-input"
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => removeFleetDevice(dev.id)}
                        className="btn-remove-row"
                        title="Remove device from fleet"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

