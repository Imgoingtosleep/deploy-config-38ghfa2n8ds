import React, { useState } from 'react';
import { Terminal, Copy, Check, Download, Trash2 } from 'lucide-react';
import './TerminalOutput.css';

export default function TerminalOutput({ title, command, output, executionTime, onClear, isError }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!output) return;
    const blob = new Blob([`# Command: ${command || 'N/A'}\n# Output:\n\n${output}`], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cli-output-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="terminal-wrapper">
      {/* Terminal Title Bar */}
      <div className="terminal-header">
        <div className="terminal-title-area">
          <div className="traffic-dots">
            <span className="dot red"></span>
            <span className="dot yellow"></span>
            <span className="dot green"></span>
          </div>
          <Terminal className="terminal-icon" />
          <span className="terminal-title-text">
            {title || 'Terminal Console'} {command && `— $ ${command}`}
          </span>
        </div>

        <div className="terminal-actions">
          {executionTime !== undefined && executionTime !== null && (
            <span className="execution-time-badge">
              {executionTime}s
            </span>
          )}

          <button
            onClick={handleCopy}
            disabled={!output}
            title="Copy Output"
            className="btn-terminal-action"
          >
            {copied ? <Check className="action-icon success" /> : <Copy className="action-icon" />}
          </button>

          <button
            onClick={handleDownload}
            disabled={!output}
            title="Download Log"
            className="btn-terminal-action"
          >
            <Download className="action-icon" />
          </button>

          {onClear && (
            <button
              onClick={onClear}
              title="Clear Output"
              className="btn-terminal-action danger"
            >
              <Trash2 className="action-icon" />
            </button>
          )}
        </div>
      </div>

      {/* Terminal Body */}
      <div className="terminal-content">
        {output ? (
          <pre className={`terminal-pre ${isError ? 'error' : 'normal'}`}>
            {output}
          </pre>
        ) : (
          <div className="terminal-empty">
            <Terminal className="empty-icon" />
            <p>Ready. Select or run a command to display output here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
