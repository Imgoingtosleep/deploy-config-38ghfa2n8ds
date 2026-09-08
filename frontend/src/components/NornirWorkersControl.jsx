import React, { useState, useEffect } from 'react';
import { Sliders } from 'lucide-react';
import './NornirWorkersControl.css';

const MIN_WORKERS = 1;
const MAX_WORKERS = 100;

export default function NornirWorkersControl({
  workers = 10,
  onChange,
}) {
  const [inputValue, setInputValue] = useState(String(workers));

  useEffect(() => {
    setInputValue(String(workers));
  }, [workers]);

  const commitValue = (val) => {
    let num = parseInt(val, 10);
    if (isNaN(num)) {
      num = MIN_WORKERS;
    }
    const clamped = Math.max(MIN_WORKERS, Math.min(MAX_WORKERS, num));
    setInputValue(String(clamped));
    if (onChange && clamped !== workers) {
      onChange(clamped);
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputValue(val);
    const num = parseInt(val, 10);
    if (!isNaN(num) && num >= MIN_WORKERS && num <= MAX_WORKERS) {
      if (onChange && num !== workers) {
        onChange(num);
      }
    }
  };

  const handleInputBlur = () => {
    commitValue(inputValue);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      commitValue(inputValue);
      e.target.blur();
    }
  };

  const handleSliderChange = (e) => {
    const num = parseInt(e.target.value, 10);
    if (!isNaN(num)) {
      const clamped = Math.max(MIN_WORKERS, Math.min(MAX_WORKERS, num));
      setInputValue(String(clamped));
      if (onChange) {
        onChange(clamped);
      }
    }
  };

  return (
    <div className="nornir-control-wrapper" title="Nornir concurrency settings (min 1, max 100)">
      <div className="nornir-control-label">
        <Sliders className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
        <span className="nornir-control-title">Nornir Workers:</span>
      </div>

      <input
        type="number"
        min={MIN_WORKERS}
        max={MAX_WORKERS}
        step="1"
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        onKeyDown={handleKeyDown}
        className="nornir-control-input"
        title="Directly enter number of workers (1 - 100)"
        aria-label="Nornir Workers"
      />

      <div className="nornir-control-slider-box" title={`Slide to adjust concurrency: ${workers} workers`}>
        <input
          type="range"
          min={MIN_WORKERS}
          max={MAX_WORKERS}
          step="1"
          value={workers}
          onChange={handleSliderChange}
          className="nornir-control-slider"
          aria-label="Nornir Workers Range"
        />
      </div>

      <span className="nornir-control-hint">(1-100)</span>
    </div>
  );
}
