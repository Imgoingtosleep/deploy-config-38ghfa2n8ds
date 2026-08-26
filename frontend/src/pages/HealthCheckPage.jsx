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
} from 'lucide-react';
import { runHealthCheck } from '../services/api';
import TerminalOutput from '../components/TerminalOutput';
import './HealthCheckPage.css';

const CATEGORIES = [
  { id: 'standard', name: 'Standard Overall Check', desc: 'show version, ip int brief, interfaces status, cdp/lldp, cpu' },
  { id: 'interfaces', name: 'Interface Diagnostics', desc: 'Port status, descriptions, speed/duplex, counters' },
  { id: 'environment', name: 'Hardware & Environment', desc: 'CPU, Memory, Fan, Power Supply & Temperature' },
  { id: 'routing', name: 'Routing & ARP Table', desc: 'Routing table, protocols, ARP cache' },
  { id: 'logs', name: 'System Logs (Syslog)', desc: 'Recent switch log buffer and error messages' },
];

export default function HealthCheckPage({ device }) {
  const [selectedCategory, setSelectedCategory] = useState('standard');
  const [running, setRunning] = useState(false);
  const [healthData, setHealthData] = useState(null);
  const [cachedSummary, setCachedSummary] = useState(null);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  const deviceIdentifier = device.connection_mode === 'serial' ? device.serial_port : device.host;

  // Reset cached summary when target device changes
  useEffect(() => {
    setCachedSummary(null);
    setHealthData(null);
  }, [deviceIdentifier]);

  const handleRunHealthCheck = async (forceRescanSummary = false) => {
    const isSerial = device.connection_mode === 'serial';
    if (!isSerial && !device.host) {
      setErrorMessage('Please fill in Device Host / IP Address above.');
      return;
    }
    if (isSerial && !device.serial_port) {
      setErrorMessage('Please fill in Serial Port above.');
      return;
    }

    setRunning(true);
    setErrorMessage('');

    // If forcing rescan, target standard category
    const categoryToRun = forceRescanSummary ? 'standard' : selectedCategory;
    if (forceRescanSummary) {
      setSelectedCategory('standard');
    }

    try {
      const data = await runHealthCheck(device, categoryToRun);
      setHealthData(data);
      setSelectedCommandIndex(0);

      // Merge and persist summary cards so they never vanish
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

  const activeResult = healthData?.results?.[selectedCommandIndex];
  const displaySummary = healthData?.summary || cachedSummary;

  const getGaugeColor = (percent) => {
    if (percent < 60) return 'green';
    if (percent < 85) return 'yellow';
    return 'red';
  };

  return (
    <div className="health-page-container">
      {/* Category Selection Card */}
      <div className="health-card">
        <div className="health-header">
          <div>
            <h2 className="health-title">
              <Activity className="h-5 w-5" style={{ color: '#818cf8' }} />
              <span>Automated Switch Health Check</span>
            </h2>
            <p className="health-subtitle">
              Execute standardized diagnostic show commands against target switch and parse clean metrics.
            </p>
          </div>

          <button
            onClick={() => handleRunHealthCheck(false)}
            disabled={running || (device.connection_mode === 'network' ? !device.host : !device.serial_port)}
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

      {/* Health Check Results Breakdown (CLI) */}
      {healthData && (
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
