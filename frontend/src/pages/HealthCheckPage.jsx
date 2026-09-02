import React, { useState, useEffect } from 'react';
import {
  Activity,
  Play,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ListChecks,
  Cpu,
  Server,
  Network,
  ShieldCheck,
  Clock,
  RefreshCw,
  Zap,
  Layers,
  Plus,
  Trash2,
  ChevronRight,
  Sliders,
  CheckSquare,
  Square,
} from 'lucide-react';
import { runHealthCheck, runBatchHealthCheck } from '../services/api';
import TerminalOutput from '../components/TerminalOutput';
import './HealthCheckPage.css';

const CATEGORIES = [
  { id: 'standard', name: 'Standard Overall Check', desc: 'version, interface brief, device status, cpu-usage' },
  { id: 'interfaces', name: 'Interface Diagnostics', desc: 'Port status, descriptions, speed/duplex, counters' },
  { id: 'transceiver', name: 'Fiber & Transceiver (SFP/SFP+)', desc: 'optical power (Tx/Rx dBm), transceiver alarms' },
  { id: 'environment', name: 'Hardware & Environment', desc: 'CPU, Memory, Fan, Power Supply & Temperature' },
  { id: 'routing', name: 'Routing & ARP Table', desc: 'Routing table, protocols, ARP cache' },
  { id: 'logs', name: 'System Logs (Syslog)', desc: 'Recent log buffer and error messages' },
];

const DEFAULT_FLEET = [
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
];

export default function HealthCheckPage({
  deviceMode = 'multi',
  device,
  fleet = [],
}) {
  const [selectedCategory, setSelectedCategory] = useState('standard');
  const [running, setRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Single Device State
  const [healthData, setHealthData] = useState(null);
  const [cachedSummary, setCachedSummary] = useState(null);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

  // Multi-Device Fleet State
  const [batchResults, setBatchResults] = useState(null);
  const [inspectDeviceIndex, setInspectDeviceIndex] = useState(null);
  const [inspectCommandIndex, setInspectCommandIndex] = useState(0);

  // Reset cached summary when single target device changes
  useEffect(() => {
    setCachedSummary(null);
    setHealthData(null);
  }, [device?.host]);

  // Handle Single Device Run
  const handleRunSingleHealthCheck = async () => {
    if (!device?.host) {
      setErrorMessage('Please fill in Device Host / IP Address in the Target Device section above.');
      return;
    }

    setRunning(true);
    setErrorMessage('');

    try {
      const data = await runHealthCheck(device, selectedCategory);
      setHealthData(data);
      setSelectedCommandIndex(0);

      if (data.summary) {
        setCachedSummary((prev) => {
          if (!prev) return data.summary;
          return {
            device_info: data.summary.device_info?.model !== 'Unknown Model' ? data.summary.device_info : prev.device_info,
            performance: data.summary.performance?.cpu_percent ? data.summary.performance : prev.performance,
            ports_summary: data.summary.ports_summary?.total_ports > 0 ? data.summary.ports_summary : prev.ports_summary,
            hardware_health: data.summary.hardware_health?.status ? data.summary.hardware_health : prev.hardware_health,
          };
        });
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || err.message || 'Health check execution failed');
    } finally {
      setRunning(false);
    }
  };

  // Handle Multi-Device Batch Run (Runs all devices in fleet)
  const handleRunBatchHealthCheck = async () => {
    const validDevices = fleet.filter((d) => d.host && d.host.trim() !== '');
    if (validDevices.length === 0) {
      setErrorMessage('Please add at least one device IP address in the Target Device fleet list above.');
      return;
    }

    setRunning(true);
    setErrorMessage('');
    setBatchResults(null);
    setInspectDeviceIndex(null);

    try {
      const devicesPayload = validDevices.map((d) => ({
        host: d.host.trim(),
        port: parseInt(d.port, 10) || 22,
        device_type: d.device_type || 'cisco_ios',
        username: d.username || '',
        password: d.password || '',
        secret: d.secret || '',
        connection_mode: 'network',
      }));

      const res = await runBatchHealthCheck(devicesPayload, selectedCategory);
      setBatchResults(res);
      if (res.results && res.results.length > 0) {
        setInspectDeviceIndex(0);
        setInspectCommandIndex(0);
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || err.message || 'Multi-device batch health check failed');
    } finally {
      setRunning(false);
    }
  };

  const activeResult = healthData?.results?.[selectedCommandIndex];
  const activeInspectDevice = inspectDeviceIndex !== null && batchResults?.results?.[inspectDeviceIndex];
  const activeInspectCommand = activeInspectDevice?.results?.[inspectCommandIndex];

  const validFleetCount = fleet.filter((d) => d.host && d.host.trim() !== '').length;

  return (
    <div className="health-page-container">
      {/* Main Execution Card */}
      <div className="health-card">
        <div className="health-header">
          <div>
            <h2 className="health-title">
              {deviceMode === 'multi' ? (
                <>
                  <Layers className="h-5 w-5" style={{ color: '#818cf8' }} />
                  <span>Fleet Health Check (Multi-Device SSH)</span>
                </>
              ) : (
                <>
                  <Activity className="h-5 w-5" style={{ color: '#818cf8' }} />
                  <span>Single Device Health Check</span>
                </>
              )}
            </h2>
            <p className="health-subtitle">
              {deviceMode === 'multi'
                ? `Execute diagnostics across all ${validFleetCount} devices configured in Target Device above.`
                : `Execute standardized diagnostics on ${device?.host || 'target host'}.`}
            </p>
          </div>

          {deviceMode === 'multi' ? (
            <button
              onClick={handleRunBatchHealthCheck}
              disabled={running || validFleetCount === 0}
              className="btn-run-health"
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Scanning {validFleetCount} Devices...</span>
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" style={{ fill: 'currentColor' }} />
                  <span>Run Batch Check ({validFleetCount} Devices)</span>
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleRunSingleHealthCheck}
              disabled={running || !device?.host}
              className="btn-run-health"
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Running Diagnostics...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" style={{ fill: 'currentColor' }} />
                  <span>Run {CATEGORIES.find((c) => c.id === selectedCategory)?.name || 'Check'}</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Category Pills */}
        <div className="categories-grid">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`category-btn ${selectedCategory === cat.id ? 'selected' : ''}`}
            >
              <p className="category-name">{cat.name}</p>
              <p className="category-desc">{cat.desc}</p>
            </button>
          ))}
        </div>

        {errorMessage && (
          <div className="alert-box">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* BATCH HEALTH CHECK RESULTS DASHBOARD                                      */}
      {/* ========================================================================= */}
      {deviceMode === 'multi' && batchResults && (
        <div className="batch-results-container">
          {/* Header Stats Bar */}
          <div className="batch-stats-bar">
            <div className="batch-stat-item">
              <span className="stat-label">Total Devices:</span>
              <span className="stat-value">{batchResults.devices_count}</span>
            </div>
            <div className="batch-stat-item">
              <span className="stat-label">Success:</span>
              <span className="stat-value text-emerald-400">{batchResults.success_count}</span>
            </div>
            <div className="batch-stat-item">
              <span className="stat-label">Failed:</span>
              <span className="stat-value text-rose-400">{batchResults.failed_count}</span>
            </div>
            <div className="batch-stat-item">
              <span className="stat-label">Overall Time:</span>
              <span className="stat-value text-indigo-400">{batchResults.overall_time_seconds}s</span>
            </div>
          </div>

          {/* Device Cards Comparison Grid */}
          <div className="batch-cards-grid">
            {batchResults.results.map((res, idx) => {
              const isSelected = inspectDeviceIndex === idx;
              const hasSummary = res.summary;
              const cpuPercent = hasSummary?.performance?.cpu_percent;
              const memPercent = hasSummary?.performance?.memory_percent;
              const portsUp = hasSummary?.ports_summary?.up_ports;
              const portsTotal = hasSummary?.ports_summary?.total_ports;

              return (
                <div
                  key={idx}
                  className={`batch-device-card ${isSelected ? 'active-inspect' : ''} ${
                    res.success ? 'card-success' : 'card-failed'
                  }`}
                  onClick={() => {
                    setInspectDeviceIndex(idx);
                    setInspectCommandIndex(0);
                  }}
                >
                  <div className="batch-card-header">
                    <div>
                      <h4 className="batch-card-name font-mono">{res.host}</h4>
                    </div>
                    <div>
                      {res.success ? (
                        <span className="badge-pill badge-success">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>{res.overall_time_seconds}s</span>
                        </span>
                      ) : (
                        <span className="badge-pill badge-danger">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <span>Failed</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {res.success ? (
                    <div className="batch-card-metrics">
                      <div className="mini-metric">
                        <span className="mini-label">CPU Usage</span>
                        <span className="mini-val font-mono">{cpuPercent ? `${cpuPercent}%` : 'N/A'}</span>
                      </div>
                      <div className="mini-metric">
                        <span className="mini-label">Memory</span>
                        <span className="mini-val font-mono">{memPercent ? `${memPercent}%` : 'N/A'}</span>
                      </div>
                      <div className="mini-metric">
                        <span className="mini-label">Ports Up</span>
                        <span className="mini-val font-mono">
                          {portsTotal ? `${portsUp}/${portsTotal}` : 'N/A'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="batch-card-error">
                      <p className="error-text">{res.error || 'Connection timed out / Authentication failed'}</p>
                    </div>
                  )}

                  <div className="batch-card-footer">
                    <span className="inspect-link">
                      <span>{isSelected ? 'Viewing CLI Logs' : 'Click to Inspect CLI Output'}</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Drilldown Detailed Terminal Viewer for Selected Device */}
          {activeInspectDevice && (
            <div className="health-results-grid mt-4">
              <div className="col-span-4 command-list-card">
                <div className="command-list-header">
                  <span className="command-list-title">
                    <ListChecks className="h-4 w-4" style={{ color: '#818cf8' }} />
                    <span className="font-mono">{activeInspectDevice.host}</span>
                  </span>
                  <span className="total-time">
                    {activeInspectDevice.overall_time_seconds}s
                  </span>
                </div>

                <div className="command-items">
                  {activeInspectDevice.results && activeInspectDevice.results.length > 0 ? (
                    activeInspectDevice.results.map((res, idx) => (
                      <button
                        key={idx}
                        onClick={() => setInspectCommandIndex(idx)}
                        className={`command-item-btn ${inspectCommandIndex === idx ? 'active' : ''}`}
                      >
                        <div className="command-item-left">
                          {res.success ? (
                            <CheckCircle2 className="h-4 w-4" style={{ color: '#34d399', flexShrink: 0 }} />
                          ) : (
                            <AlertTriangle className="h-4 w-4" style={{ color: '#f87171', flexShrink: 0 }} />
                          )}
                          <span className="command-item-text">{res.command}</span>
                        </div>
                        <span className="command-item-time">
                          {res.execution_time_seconds}s
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="p-4 text-xs text-slate-400">
                      No CLI command outputs returned for this failed device.
                    </div>
                  )}
                </div>
              </div>

              <div className="col-span-8" style={{ height: '500px' }}>
                <TerminalOutput
                  title={`Health Check Output: ${activeInspectDevice.host}`}
                  command={activeInspectCommand?.command}
                  output={activeInspectCommand?.output || activeInspectCommand?.error || activeInspectDevice.error}
                  executionTime={activeInspectCommand?.execution_time_seconds}
                  isError={!activeInspectCommand?.success}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SINGLE DEVICE RESULTS BREAKDOWN (CLI)                                     */}
      {/* ========================================================================= */}
      {deviceMode === 'single' && healthData && (
        <div className="health-results-grid">
          {/* Left Column: Command List */}
          <div className="col-span-4 command-list-card">
            <div className="command-list-header">
              <span className="command-list-title">
                <ListChecks className="h-4 w-4" style={{ color: '#818cf8' }} />
                <span>Command Execution List</span>
              </span>
              <span className="total-time">
                Total: {healthData.overall_time_seconds}s
              </span>
            </div>

            <div className="command-items">
              {healthData.results.map((res, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedCommandIndex(idx)}
                  className={`command-item-btn ${selectedCommandIndex === idx ? 'active' : ''}`}
                >
                  <div className="command-item-left">
                    {res.success ? (
                      <CheckCircle2 className="h-4 w-4" style={{ color: '#34d399', flexShrink: 0 }} />
                    ) : (
                      <AlertTriangle className="h-4 w-4" style={{ color: '#f87171', flexShrink: 0 }} />
                    )}
                    <span className="command-item-text">{res.command}</span>
                  </div>
                  <span className="command-item-time">
                    {res.execution_time_seconds}s
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Right Column: Terminal Display */}
          <div className="col-span-8" style={{ height: '500px' }}>
            <TerminalOutput
              title="Health Check Output"
              command={activeResult?.command}
              output={activeResult?.output || activeResult?.error}
              executionTime={activeResult?.execution_time_seconds}
              isError={!activeResult?.success}
            />
          </div>
        </div>
      )}
    </div>
  );
}

