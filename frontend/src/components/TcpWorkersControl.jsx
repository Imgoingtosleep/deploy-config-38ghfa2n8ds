import React, { useState, useEffect } from 'react';
import './TcpWorkersControl.css';

const MIN_WORKERS = 1;
const MAX_WORKERS = 1000;
const MIN_TIMEOUT = 0.2;
const MAX_TIMEOUT = 10;

const WORKER_PRESETS = [50, 100, 200, 500, 1000];
const TIMEOUT_PRESETS = [0.5, 1.0, 1.5, 3.0];

export default function TcpWorkersControl({
  enabled = true,
  onToggle,
  workers = 200,
  onWorkersChange,
  timeout = 1.5,
  onTimeoutChange,
  disabled = false,
  title = 'TCP Port Pre-Scan & Workers',
  compact = false,
}) {
  const [workersInput, setWorkersInput] = useState(String(workers));
  const [timeoutInput, setTimeoutInput] = useState(String(timeout));

  useEffect(() => {
    setWorkersInput(String(workers));
  }, [workers]);

  useEffect(() => {
    setTimeoutInput(String(timeout));
  }, [timeout]);

  const commitWorkers = (val) => {
    let num = parseInt(val, 10);
    if (isNaN(num)) num = 200;
    const clamped = Math.max(MIN_WORKERS, Math.min(MAX_WORKERS, num));
    setWorkersInput(String(clamped));
    if (onWorkersChange && clamped !== workers) {
      onWorkersChange(clamped);
    }
  };

  const commitTimeout = (val) => {
    let num = parseFloat(val);
    if (isNaN(num)) num = 1.5;
    const clamped = Math.round(Math.max(MIN_TIMEOUT, Math.min(MAX_TIMEOUT, num)) * 10) / 10;
    setTimeoutInput(String(clamped));
    if (onTimeoutChange && clamped !== timeout) {
      onTimeoutChange(clamped);
    }
  };

  return (
    <div className={`tcp-control-card ${enabled ? 'is-enabled' : 'is-disabled'} ${compact ? 'is-compact' : ''}`}>
      {/* Header bar: Toggle & Status Badge */}
      <div className="tcp-control-header">
        <div className="tcp-control-title-box">
          <span className="tcp-control-title">{title}</span>
        </div>

        <div className="tcp-control-toggle-wrap">
          <button
            type="button"
            className={`tcp-toggle-btn ${enabled ? 'on' : 'off'}`}
            onClick={() => onToggle && onToggle(!enabled)}
            disabled={disabled}
            title={enabled ? 'Click to turn OFF TCP pre-scan' : 'Click to turn ON TCP pre-scan'}
          >
            <span className="tcp-toggle-track">
              <span className="tcp-toggle-thumb" />
            </span>
            <span className="tcp-toggle-label">{enabled ? 'TCP Workers: ON' : 'TCP Workers: OFF'}</span>
          </button>

          <span className={`tcp-status-pill ${enabled ? 'on' : 'off'}`}>
            {enabled ? `Active (${workers} workers • ${timeout}s)` : 'Bypassed • Direct SSH'}
          </span>
        </div>
      </div>

      {/* Control Body */}
      {enabled ? (
        <div className="tcp-control-body">
          {/* Concurrency Section */}
          <div className="tcp-param-row">
            <div className="tcp-param-label">
              <span>TCP Workers:</span>
            </div>

            <div className="tcp-param-inputs">
              <input
                type="number"
                min={MIN_WORKERS}
                max={MAX_WORKERS}
                step="1"
                value={workersInput}
                onChange={(e) => {
                  setWorkersInput(e.target.value);
                  const num = parseInt(e.target.value, 10);
                  if (!isNaN(num) && num >= MIN_WORKERS && num <= MAX_WORKERS && onWorkersChange) {
                    onWorkersChange(num);
                  }
                }}
                onBlur={() => commitWorkers(workersInput)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    commitWorkers(workersInput);
                    e.target.blur();
                  }
                }}
                disabled={disabled}
                className="tcp-number-input"
                title="Concurrent TCP port-check workers (1 - 1000)"
              />

              <div className="tcp-slider-box" title={`Adjust concurrency: ${workers} workers`}>
                <input
                  type="range"
                  min={MIN_WORKERS}
                  max={MAX_WORKERS}
                  step="5"
                  value={workers}
                  onChange={(e) => {
                    const num = parseInt(e.target.value, 10);
                    if (!isNaN(num)) {
                      const clamped = Math.max(MIN_WORKERS, Math.min(MAX_WORKERS, num));
                      setWorkersInput(String(clamped));
                      if (onWorkersChange) onWorkersChange(clamped);
                    }
                  }}
                  disabled={disabled}
                  className="tcp-range-slider"
                />
              </div>

              <div className="tcp-presets-box">
                {WORKER_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`tcp-preset-btn ${workers === p ? 'active' : ''}`}
                    onClick={() => commitWorkers(p)}
                    disabled={disabled}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Timeout Section */}
          <div className="tcp-param-row">
            <div className="tcp-param-label">
              <span>TCP Timeout:</span>
            </div>

            <div className="tcp-param-inputs">
              <input
                type="number"
                min={MIN_TIMEOUT}
                max={MAX_TIMEOUT}
                step="0.1"
                value={timeoutInput}
                onChange={(e) => {
                  setTimeoutInput(e.target.value);
                  const num = parseFloat(e.target.value);
                  if (!isNaN(num) && num >= MIN_TIMEOUT && num <= MAX_TIMEOUT && onTimeoutChange) {
                    onTimeoutChange(num);
                  }
                }}
                onBlur={() => commitTimeout(timeoutInput)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    commitTimeout(timeoutInput);
                    e.target.blur();
                  }
                }}
                disabled={disabled}
                className="tcp-number-input"
                title="Socket timeout in seconds (0.2s - 10s)"
              />
              <span className="tcp-unit">sec</span>

              <div className="tcp-presets-box">
                {TIMEOUT_PRESETS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`tcp-preset-btn ${timeout === t ? 'active' : ''}`}
                    onClick={() => commitTimeout(t)}
                    disabled={disabled}
                  >
                    {t}s
                  </button>
                ))}
              </div>

              <span className="tcp-hint-text">
                Filters unreachable hosts rapidly (e.g. in ~{timeout}s) before SSH login.
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="tcp-disabled-notice">
          <p>
            <strong>TCP port check is turned OFF.</strong> The scan will bypass TCP port 22 probing and attempt SSH/LLDP
            collection directly on all target addresses. Useful if TCP SYN/connect is blocked by an intermediate firewall or ACL.
          </p>
        </div>
      )}
    </div>
  );
}
