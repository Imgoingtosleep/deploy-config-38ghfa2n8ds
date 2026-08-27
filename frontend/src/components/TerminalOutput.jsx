import React, { useState, useEffect } from 'react';
import { Terminal, Copy, Check, Download, Trash2, Filter, Plus, X, Save, Loader2 } from 'lucide-react';
import { getTemplates, createTemplate } from '../services/api';
import './TerminalOutput.css';

export default function TerminalOutput({
  title,
  command,
  output,
  executionTime,
  onClear,
  isError,
  templates: propTemplates,
  selectedTemplateId: propSelectedTemplateId,
  onSelectTemplate,
}) {
  const [copied, setCopied] = useState(false);
  const [templateList, setTemplateList] = useState([]);
  const [activeTemplateId, setActiveTemplateId] = useState(propSelectedTemplateId || '');

  // Add Template Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateRegex, setNewTemplateRegex] = useState('');
  const [newTemplateDesc, setNewTemplateDesc] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [modalError, setModalError] = useState('');

  // Load templates if not passed as prop
  useEffect(() => {
    if (propTemplates && Array.isArray(propTemplates)) {
      setTemplateList(propTemplates);
    } else {
      getTemplates()
        .then((data) => {
          if (data && Array.isArray(data)) {
            setTemplateList(data);
          }
        })
        .catch(() => {});
    }
  }, [propTemplates]);

  useEffect(() => {
    if (propSelectedTemplateId !== undefined) {
      setActiveTemplateId(propSelectedTemplateId);
    }
  }, [propSelectedTemplateId]);

  const handleTemplateChange = (e) => {
    const val = e.target.value;
    if (val === '__add_new__') {
      setShowAddModal(true);
      setModalError('');
      return;
    }
    setActiveTemplateId(val);
    if (onSelectTemplate) {
      onSelectTemplate(val);
    }
  };

  const previewMatch = (() => {
    if (!output || !newTemplateRegex.trim()) return null;
    try {
      const pattern = new RegExp(newTemplateRegex.trim(), 'im');
      const lines = output.split('\n');
      const matched = lines.filter((line) => pattern.test(line));
      return {
        matchedCount: matched.length,
        totalCount: lines.length,
        sample: matched.slice(0, 4).join('\n'),
        valid: true,
      };
    } catch (err) {
      return {
        matchedCount: 0,
        totalCount: 0,
        sample: '',
        valid: false,
        error: err.message,
      };
    }
  })();

  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    if (!newTemplateRegex.trim()) {
      setModalError('กรุณาระบุ Regex Pattern สำหรับกรองข้อความ');
      return;
    }

    const tplName = newTemplateName.trim() || `Regex: ${newTemplateRegex.trim()}`;

    setSavingTemplate(true);
    setModalError('');

    try {
      const created = await createTemplate({
        name: tplName,
        regex: newTemplateRegex.trim(),
        description: newTemplateDesc.trim() || '',
        vendor: 'all',
        commands: [],
      });
      setTemplateList((prev) => [created, ...prev]);
      setActiveTemplateId(created.id);
      if (onSelectTemplate) {
        onSelectTemplate(created.id);
      }
      setShowAddModal(false);
      setNewTemplateName('');
      setNewTemplateRegex('');
      setNewTemplateDesc('');
    } catch (err) {
      const fallbackId = `tpl-${Date.now()}`;
      const fallbackTpl = {
        id: fallbackId,
        name: tplName,
        regex: newTemplateRegex.trim(),
        description: newTemplateDesc.trim() || '',
      };
      setTemplateList((prev) => [fallbackTpl, ...prev]);
      setActiveTemplateId(fallbackId);
      if (onSelectTemplate) {
        onSelectTemplate(fallbackId);
      }
      setShowAddModal(false);
      setNewTemplateName('');
      setNewTemplateRegex('');
      setNewTemplateDesc('');
    } finally {
      setSavingTemplate(false);
    }
  };

  const selectedTemplate = templateList.find((t) => t.id === activeTemplateId);

  const getFilteredOutput = () => {
    if (!output) return '';
    if (!selectedTemplate || !selectedTemplate.regex) return output;

    try {
      const pattern = new RegExp(selectedTemplate.regex, 'im');
      const lines = output.split('\n');
      const matched = lines.filter((line) => pattern.test(line));
      if (matched.length === 0) {
        return `[Template Filter: ${selectedTemplate.name}]\n[Regex: /${selectedTemplate.regex}/]\n\n--- No lines matched this regex filter (Select "Raw Output" to view full data) ---`;
      }
      return `[Filtered by Template: ${selectedTemplate.name} (Regex: /${selectedTemplate.regex}/)]\n\n` + matched.join('\n');
    } catch (e) {
      return output;
    }
  };

  const displayOutput = getFilteredOutput();

  const handleCopy = () => {
    if (!displayOutput) return;
    navigator.clipboard.writeText(displayOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!displayOutput) return;
    const blob = new Blob([`# Command: ${command || 'N/A'}\n# Output:\n\n${displayOutput}`], {
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

          {/* Select Template Dropdown (Positioned directly to the left of Copy Output) */}
          <div className="terminal-template-selector" title="Template / Output Mode">
            <Filter className="template-select-icon" />
            <select
              value={activeTemplateId}
              onChange={handleTemplateChange}
              className="terminal-template-select"
              aria-label="Select Template"
            >
              <option value="">Raw Output</option>
              {templateList.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
              <option value="__add_new__" className="opt-add-template">
                + Add Template...
              </option>
            </select>
          </div>

          {/* Copy Output Button */}
          <button
            onClick={handleCopy}
            disabled={!displayOutput}
            title={activeTemplateId && selectedTemplate?.regex ? "Copy Filtered Output" : "Copy Output"}
            className="btn-terminal-action"
          >
            {copied ? <Check className="action-icon success" /> : <Copy className="action-icon" />}
          </button>

          <button
            onClick={handleDownload}
            disabled={!displayOutput}
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
        {displayOutput ? (
          <pre className={`terminal-pre ${isError ? 'error' : 'normal'}`}>
            {displayOutput}
          </pre>
        ) : (
          <div className="terminal-empty">
            <Terminal className="empty-icon" />
            <p>Ready. Select or run a command to display output here.</p>
          </div>
        )}
      </div>

      {/* Add New Regex Template Modal */}
      {showAddModal && (
        <div className="template-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="template-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="template-modal-header">
              <div className="template-modal-title">
                <Filter className="modal-header-icon" />
                <span>Add Regex Filter Template</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="template-modal-close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} className="template-modal-form">
              {/* Regex Input (Primary) */}
              <div className="modal-field">
                <label className="modal-label">
                  Regex Pattern (สำหรับกรอง Raw Output) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={newTemplateRegex}
                  onChange={(e) => setNewTemplateRegex(e.target.value)}
                  placeholder="e.g. (down|fail|error|drop|alarm) หรือ GE0/0/\d+"
                  className="modal-input regex-input"
                  required
                  autoFocus
                />
                
                {/* Quick Regex Helper Chips */}
                <div className="quick-regex-chips">
                  <span className="chips-label">Quick Presets:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setNewTemplateRegex('(down|err-disabled|fail|fault|drop)');
                      if (!newTemplateName) setNewTemplateName('Down & Faults');
                    }}
                    className="chip-btn"
                  >
                    Down / Faults
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewTemplateRegex('\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\b');
                      if (!newTemplateName) setNewTemplateName('IP Addresses');
                    }}
                    className="chip-btn"
                  >
                    IP Addresses
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewTemplateRegex('(warn|alarm|alert|critical|high)');
                      if (!newTemplateName) setNewTemplateName('Alarms & Warnings');
                    }}
                    className="chip-btn"
                  >
                    Warnings / Alarms
                  </button>
                </div>
              </div>

              {/* Live Preview Box */}
              {previewMatch && (
                <div className={`modal-preview-box ${previewMatch.valid ? 'valid' : 'invalid'}`}>
                  <div className="preview-header">
                    <span>
                      {previewMatch.valid
                        ? `Live Match: ${previewMatch.matchedCount} / ${previewMatch.totalCount} lines matched`
                        : `Regex Syntax Error: ${previewMatch.error}`}
                    </span>
                  </div>
                  {previewMatch.valid && previewMatch.sample && (
                    <pre className="preview-snippet">{previewMatch.sample}</pre>
                  )}
                </div>
              )}

              {/* Template Name (Optional/Descriptive) */}
              <div className="modal-field">
                <label className="modal-label">Template Name (ชื่อแสดงใน Dropdown)</label>
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="e.g. Filter Down Ports (ปล่อยว่างจะใช้ Regex แทน)"
                  className="modal-input"
                />
              </div>

              <div className="modal-field">
                <label className="modal-label">Description (คำอธิบายเพิ่มเติม - ทางเลือก)</label>
                <input
                  type="text"
                  value={newTemplateDesc}
                  onChange={(e) => setNewTemplateDesc(e.target.value)}
                  placeholder="e.g. กรองเฉพาะบรรทัดที่มีข้อผิดพลาดหรือพอร์ต Down"
                  className="modal-input"
                />
              </div>

              {modalError && (
                <div className="modal-error-box">
                  <span>{modalError}</span>
                </div>
              )}

              <div className="template-modal-actions">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn-modal-cancel"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingTemplate || !newTemplateRegex.trim()}
                  className="btn-modal-save"
                >
                  {savingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  <span>Save & Apply Filter</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
