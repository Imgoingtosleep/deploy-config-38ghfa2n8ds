import React, { useState, useEffect, useRef } from 'react';
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
  FileUp,
  Download,
  UploadCloud,
  FileSpreadsheet,
  FileCode,
  FileText,
  X,
  AlertCircle,
  Check,
  Compass,
} from 'lucide-react';
import {
  testDeviceConnection,
  getSupportedDeviceTypes,
  importDevicesFromFile,
  downloadInventoryTemplate,
  detectSingleDeviceType,
  detectFleetTypes,
} from '../services/api';
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
  const [commonType, setCommonType] = useState('autodetect');
  const [commonUser, setCommonUser] = useState('');
  const [commonPass, setCommonPass] = useState('');
  const [detectingFleet, setDetectingFleet] = useState(false);

  // Import Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importMode, setImportMode] = useState('replace'); // 'replace' | 'append'
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [parsedPreview, setParsedPreview] = useState(null);

  // Fallback credentials for import if missing in file
  const [fallbackType, setFallbackType] = useState('autodetect');

  const [fallbackUser, setFallbackUser] = useState('');
  const [fallbackPass, setFallbackPass] = useState('');
  const [fallbackPort, setFallbackPort] = useState(22);
  const [fallbackSecret, setFallbackSecret] = useState('');

  const fileInputRef = useRef(null);

  const [deviceTypes, setDeviceTypes] = useState([
    { label: 'Auto Detect (Recommended)', value: 'autodetect' },
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
      if (res.connected && res.message && res.message.includes('Auto-Detected:')) {
        const match = res.message.match(/Auto-Detected:\s*([a-zA-Z0-9_\-]+)/);
        if (match && match[1]) {
          setDevice((prev) => ({ ...prev, device_type: match[1] }));
        }
      }
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
        device_type: commonType || 'autodetect',
        username: commonUser,
        password: commonPass,
        secret: '',
      },
    ]);
  };

  const handleDetectFleet = async () => {
    const validDevices = fleet.filter((d) => d.host && d.host.trim());
    if (validDevices.length === 0) {
      alert('Please enter at least one IP address in the fleet list.');
      return;
    }
    setDetectingFleet(true);
    try {
      const res = await detectFleetTypes(validDevices);
      if (res && res.results) {
        const map = {};
        res.results.forEach((r) => {
          if (r.id) map[r.id] = r.device_type;
          else if (r.host) map[r.host] = r.device_type;
        });
        setFleet((prev) =>
          prev.map((d) => {
            const detected = map[d.id] || map[d.host];
            return detected ? { ...d, device_type: detected } : d;
          })
        );
      }
    } catch (err) {
      console.error('Fleet type detection failed:', err);
    } finally {
      setDetectingFleet(false);
    }
  };


  const removeFleetDevice = (id) => {
    setFleet((prev) => prev.filter((d) => d.id !== id));
  };

  const clearAllFleetDevices = () => {
    if (window.confirm('Are you sure you want to clear all devices from the fleet?')) {
      setFleet([]);
    }
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

  // File Import Logic
  const handleOpenImportModal = () => {
    setImportFile(null);
    setParsedPreview(null);
    setImportError('');
    setImportSuccess('');
    setFallbackType(commonType || 'huawei');
    setFallbackUser(commonUser || '');
    setFallbackPass(commonPass || '');
    setFallbackPort(22);
    setFallbackSecret('');
    setShowImportModal(true);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processSelectedFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    processSelectedFile(file);
  };

  const processSelectedFile = async (file) => {
    setImportFile(file);
    setImportError('');
    setImportSuccess('');
    setImportLoading(true);

    try {
      const data = await importDevicesFromFile(file, {
        default_device_type: fallbackType,
        default_username: fallbackUser,
        default_password: fallbackPass,
        default_port: fallbackPort,
        default_secret: fallbackSecret,
      });

      setParsedPreview(data);
    } catch (err) {
      setImportError(err.response?.data?.detail || err.message || 'Failed to parse file.');
      setParsedPreview(null);
    } finally {
      setImportLoading(false);
    }
  };

  const handleReParseWithFallbacks = async () => {
    if (!importFile) return;
    processSelectedFile(importFile);
  };

  const handleConfirmImport = () => {
    if (!parsedPreview || !parsedPreview.devices || parsedPreview.devices.length === 0) {
      setImportError('No valid devices to import.');
      return;
    }

    const newDevices = parsedPreview.devices;
    if (importMode === 'replace') {
      setFleet(newDevices);
    } else {
      // Append mode, ensure unique IDs
      const timestamp = Date.now();
      const mapped = newDevices.map((d, i) => ({
        ...d,
        id: `dev-${timestamp}-${i}`,
      }));
      setFleet((prev) => [...prev.filter((d) => d.host && d.host.trim()), ...mapped]);
    }

    setShowImportModal(false);
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
                title="Test SSH/Telnet connectivity to this device"
              >
                {testing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Testing...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    <span>Test</span>
                  </>
                )}
              </button>
            </div>

            {/* Port */}
            <div className="form-group col-span-1">
              <label className="form-label">Port</label>
              <input
                type="number"
                name="port"
                value={device.port}
                onChange={handleSingleChange}
                placeholder="22"
                className="form-input font-mono"
              />
            </div>

            {/* Username */}
            <div className="form-group col-span-2">
              <label className="form-label">Username</label>
              <input
                type="text"
                name="username"
                value={device.username}
                onChange={handleSingleChange}
                placeholder="admin"
                className="form-input"
              />
            </div>

            {/* Password */}
            <div className="form-group col-span-2">
              <label className="form-label">Password</label>
              <input
                type="password"
                name="password"
                value={device.password}
                onChange={handleSingleChange}
                placeholder="Password"
                className="form-input"
              />
            </div>

            {/* Secret */}
            <div className="form-group col-span-1">
              <label className="form-label">Secret (Enable)</label>
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

            {/* Quick Credentials Filler & Actions */}
            <div className="quick-creds-bar">
              <span className="quick-creds-label">Batch Setup:</span>
              <select
                value={commonType}
                onChange={(e) => setCommonType(e.target.value)}
                className="quick-select"
                title="Select device type to apply to all"
              >
                <option value="autodetect">Auto Detect (Recommended)</option>
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
                disabled={detectingFleet || fleet.filter((d) => d.host).length === 0}
                className="btn-detect-fleet"
                onClick={handleDetectFleet}
                title="Auto-detect vendor for all devices in list"
              >
                {detectingFleet ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-300" />
                    <span>Detecting...</span>
                  </>
                ) : (
                  <>
                    <Compass className="h-3.5 w-3.5 text-amber-300" />
                    <span>Detect Types</span>
                  </>
                )}
              </button>

              <button
                type="button"
                className="btn-add-device"
                onClick={addFleetDevice}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Row</span>
              </button>

              {/* Import Fleet Button (CSV, XLSX, JSON, YAML) */}
              <button
                type="button"
                className="btn-import-fleet"
                onClick={handleOpenImportModal}
                title="Import devices from CSV, Excel (XLSX), JSON, or YAML"
              >
                <FileUp className="h-3.5 w-3.5" />
                <span>Import Fleet</span>
              </button>

              {fleet.length > 0 && (
                <button
                  type="button"
                  className="btn-clear-fleet"
                  onClick={clearAllFleetDevices}
                  title="Clear all devices from the list"
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                </button>
              )}
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
                        <option value="autodetect">Auto Detect</option>
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

      {/* ========================================================================= */}
      {/* IMPORT FLEET MODAL (CSV, XLSX, JSON, YAML)                                */}
      {/* ========================================================================= */}
      {showImportModal && (
        <div className="modal-backdrop">
          <div className="save-playbook-box import-fleet-modal">
            <div className="save-playbook-header">
              <div className="flex items-center gap-2">
                <FileUp className="h-4 w-4 text-emerald-400" />
                <h3 className="save-playbook-title font-semibold">
                  Import IP List (CSV, Excel, JSON, YAML, TXT)
                </h3>
              </div>
              <button onClick={() => setShowImportModal(false)} className="modal-close-btn">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="save-playbook-body">
              {/* File Dropzone */}
              <div
                className="import-dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xlsm,.xls,.json,.yaml,.yml,.txt"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                <UploadCloud className="h-9 w-9 text-indigo-400 mb-2" />
                <p className="text-sm font-medium text-slate-200">
                  {importFile ? importFile.name : 'Click to browse or drag & drop IP file here'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Requires only IP addresses (1 IP per row). Formats: <strong className="text-indigo-300">CSV</strong>, <strong className="text-emerald-300">Excel (.xlsx)</strong>, <strong className="text-amber-300">JSON</strong>, <strong className="text-sky-300">YAML</strong>, <strong className="text-slate-300">TXT</strong>
                </p>
              </div>

              {/* Sample Templates Bar */}
              <div className="templates-download-bar">
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Download className="h-3 w-3" /> Sample IP Templates:
                </span>
                <button
                  type="button"
                  onClick={() => downloadInventoryTemplate('csv')}
                  className="btn-template-dl"
                  title="Download CSV containing only IP column"
                >
                  <FileText className="h-3 w-3 text-indigo-300" />
                  <span>CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => downloadInventoryTemplate('xlsx')}
                  className="btn-template-dl"
                  title="Download Excel XLSX containing only IP column"
                >
                  <FileSpreadsheet className="h-3 w-3 text-emerald-300" />
                  <span>Excel (XLSX)</span>
                </button>
                <button
                  type="button"
                  onClick={() => downloadInventoryTemplate('json')}
                  className="btn-template-dl"
                  title="Download JSON array of IPs"
                >
                  <FileCode className="h-3 w-3 text-amber-300" />
                  <span>JSON</span>
                </button>
                <button
                  type="button"
                  onClick={() => downloadInventoryTemplate('yaml')}
                  className="btn-template-dl"
                  title="Download YAML list of IPs"
                >
                  <FileCode className="h-3 w-3 text-sky-300" />
                  <span>YAML</span>
                </button>
              </div>

              {/* Inherited Batch Setup Credentials Notice */}
              <div className="import-batch-notice">
                <span className="text-xs text-slate-300 font-semibold block mb-0.5">
                  Applied Batch Setup Credentials:
                </span>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span>Vendor: <strong className="text-indigo-300">{commonType || 'huawei'}</strong></span>
                  <span>User: <strong className="text-slate-200">{commonUser || '(blank)'}</strong></span>
                  <span>Password: <strong className="text-slate-200">{commonPass ? '••••••' : '(blank)'}</strong></span>
                  <span>Port: <strong className="text-slate-200">22</strong></span>
                </div>
              </div>

              {/* Import Mode: Replace vs Append */}
              <div className="import-mode-row">
                <label className="text-xs text-slate-300 font-semibold">Import Mode:</label>
                <div className="flex gap-4">
                  <label className="import-radio-label">
                    <input
                      type="radio"
                      name="importMode"
                      value="replace"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                    />
                    <span>Replace Current Fleet</span>
                  </label>
                  <label className="import-radio-label">
                    <input
                      type="radio"
                      name="importMode"
                      value="append"
                      checked={importMode === 'append'}
                      onChange={() => setImportMode('append')}
                    />
                    <span>Append to Existing Fleet</span>
                  </label>
                </div>
              </div>


              {/* Status and Error Messages */}
              {importLoading && (
                <div className="py-3 text-center text-xs text-indigo-300 flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Parsing file...</span>
                </div>
              )}

              {importError && (
                <div className="alert-box mt-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              {/* Preview Table */}
              {parsedPreview && parsedPreview.devices && (
                <div className="import-preview-section">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Successfully parsed {parsedPreview.count} device(s)
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Showing preview (first {Math.min(parsedPreview.devices.length, 5)} rows)
                    </span>
                  </div>

                  <div className="preview-table-container">
                    <table className="preview-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Host / IP</th>
                          <th>Type</th>
                          <th>Port</th>
                          <th>Username</th>
                          <th>Password</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedPreview.devices.slice(0, 5).map((d, i) => (
                          <tr key={i}>
                            <td className="font-mono text-slate-500">{i + 1}</td>
                            <td className="font-mono font-semibold text-white">{d.host}</td>
                            <td className="text-slate-300">{d.device_type}</td>
                            <td className="font-mono text-slate-400">{d.port}</td>
                            <td className="text-slate-300">{d.username || '-'}</td>
                            <td className="text-slate-400">{d.password ? '••••••' : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="save-playbook-footer">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="btn-modal-cancel"
              >
                <X className="h-4 w-4" />
                <span>Cancel</span>
              </button>
              <button
                type="button"
                disabled={!parsedPreview || !parsedPreview.devices || parsedPreview.devices.length === 0}
                onClick={handleConfirmImport}
                className="btn-modal-save"
              >
                <Check className="h-4 w-4" />
                <span>
                  Confirm Import ({parsedPreview?.count || 0} Devices)
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
