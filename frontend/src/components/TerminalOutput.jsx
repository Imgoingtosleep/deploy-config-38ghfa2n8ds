import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  Copy,
  Check,
  Download,
  Trash2,
  Filter,
  Plus,
  X,
  Save,
  Loader2,
  ChevronDown,
  FileText,
  Layers,
  Search,
} from 'lucide-react';
import { getTemplates, createTemplate } from '../services/api';
import './TerminalOutput.css';

// Helper to mask passwords in terminal output (AAA, local-user, secret, password)
export function maskSensitiveCli(text) {
  if (!text || typeof text !== 'string') return text;
  
  // Huawei: local-user <user> password (irreversible-cipher|cipher|simple) <password>
  let masked = text.replace(
    /(local-user\s+\S+\s+password\s+(?:irreversible-cipher|cipher|simple)\s+)(\S+)/gi,
    '$1*****'
  );
  
  // Huawei: local-user <user> password <password>
  masked = masked.replace(
    /(local-user\s+\S+\s+password\s+)(?!(?:irreversible-cipher|cipher|simple)\b)(\S+)/gi,
    '$1*****'
  );

  // Cisco: username <user> [privilege <num>] (secret|password) [0-9]? <password>
  masked = masked.replace(
    /(username\s+\S+(?:\s+privilege\s+\d+)?\s+(?:secret|password)(?:\s+\d+)?\s+)(\S+)/gi,
    '$1*****'
  );

  // Enable secret / password: enable (secret|password) [0-9]? <password>
  masked = masked.replace(
    /(enable\s+(?:secret|password)(?:\s+\d+)?\s+)(\S+)/gi,
    '$1*****'
  );

  // Set authentication password / super password
  masked = masked.replace(
    /((?:set\s+authentication\s+password|super\s+password)(?:\s+level\s+\d+)?(?:\s+(?:cipher|simple))?\s+)(\S+)/gi,
    '$1*****'
  );

  // Standalone password line: password (0|7|cipher|simple)? <password>
  masked = masked.replace(
    /(^\s*password(?:\s+(?:0|7|cipher|simple))?\s+)(\S+)/gim,
    '$1*****'
  );

  // SNMP community
  masked = masked.replace(
    /(snmp-server\s+community\s+)(\S+)/gi,
    '$1*****'
  );
  masked = masked.replace(
    /(snmp-agent\s+community\s+(?:read|write)(?:\s+(?:cipher|simple))?\s+)(\S+)/gi,
    '$1*****'
  );

  return masked;
}

export default function TerminalOutput({
  title,
  command,
  output,
  regexOutput,
  executionTime,
  onClear,
  isError,
  templates: propTemplates,
  selectedTemplateId: propSelectedTemplateId,
  onSelectTemplate,
  deviceHost,
  deviceIp,
  host,
  ip,
}) {
  const [copied, setCopied] = useState(false);
  const [templateList, setTemplateList] = useState([]);
  const hasCmdRegex = Boolean(regexOutput && regexOutput.trim() && regexOutput !== output);
  const [activeTemplateId, setActiveTemplateId] = useState(
    propSelectedTemplateId !== undefined ? propSelectedTemplateId : (hasCmdRegex ? '__command_regex__' : '')
  );
  const [showSaveDropdown, setShowSaveDropdown] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState('');
  const saveDropdownRef = useRef(null);

  // Modal to prompt user to select a template if attempting to save regex without selecting one first
  const [showSelectTemplateModal, setShowSelectTemplateModal] = useState(false);

  // Add Template Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateRegex, setNewTemplateRegex] = useState('');
  const [newTemplateDesc, setNewTemplateDesc] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [modalError, setModalError] = useState('');

  // Close Save dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (saveDropdownRef.current && !saveDropdownRef.current.contains(e.target)) {
        setShowSaveDropdown(false);
      }
    };
    if (showSaveDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSaveDropdown]);

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
    } else if (regexOutput && regexOutput.trim() && regexOutput !== output && !activeTemplateId) {
      setActiveTemplateId('__command_regex__');
    }
  }, [propSelectedTemplateId, regexOutput]);

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
  const safeOutput = maskSensitiveCli(output || '');
  const safeRegexOutput = maskSensitiveCli(regexOutput || '');

  // Live filter calculation driven strictly by selected template or command regex
  const filterResult = (() => {
    if (!safeOutput && !safeRegexOutput) {
      return { valid: true, matchedCount: 0, totalCount: 0, lines: [], display: '' };
    }
    const allLines = (safeOutput || '').split('\n');

    if (activeTemplateId === '__command_regex__' && safeRegexOutput) {
      const regexLines = safeRegexOutput.split('\n');
      return {
        valid: true,
        matchedCount: regexLines.length,
        totalCount: allLines.length,
        lines: regexLines,
        display: safeRegexOutput,
      };
    }

    if (!selectedTemplate || !selectedTemplate.regex) {
      return {
        valid: true,
        matchedCount: allLines.length,
        totalCount: allLines.length,
        lines: allLines,
        display: safeOutput,
      };
    }

    try {
      const pattern = new RegExp(selectedTemplate.regex, 'im');
      const matched = allLines.filter((l) => pattern.test(l));
      const headerNote = `[Filtered by Template: ${selectedTemplate.name} (Regex: /${selectedTemplate.regex}/) - Matched ${matched.length} of ${allLines.length} lines]\n\n`;
      return {
        valid: true,
        matchedCount: matched.length,
        totalCount: allLines.length,
        lines: matched,
        display: matched.length > 0
          ? headerNote + matched.join('\n')
          : `[Template Filter: ${selectedTemplate.name}]\n[Regex: /${selectedTemplate.regex}/]\n\n--- No lines matched this template regex filter (Select "Raw Output" to view full data) ---`,
      };
    } catch (err) {
      return {
        valid: false,
        error: err.message,
        matchedCount: 0,
        totalCount: allLines.length,
        lines: [],
        display: `[Regex Syntax Error in Template '${selectedTemplate.name}': ${err.message}]\n\n` + safeOutput,
      };
    }
  })();

  const displayOutput = filterResult.display;
  const displayCommand = maskSensitiveCli(command);

  const handleCopy = () => {
    if (!displayOutput) return;
    navigator.clipboard.writeText(displayOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Extract device IP/Host for naming saved files: [ip]_raw.txt, [ip]_regex_[template name].txt
  const resolveTargetIp = () => {
    // 1. Explicit props
    const explicit = deviceHost || deviceIp || host || ip;
    if (explicit && typeof explicit === 'string' && explicit.trim()) {
      return explicit.trim();
    }

    // 2. From title (e.g. "CLI Output - 192.168.1.1" or "Deployment Console Output - 10.0.0.1")
    if (title && typeof title === 'string') {
      const ipMatch = title.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
      if (ipMatch) return ipMatch[0];

      const dashParts = title.split(/\s*[-–—]\s*/);
      if (dashParts.length > 1) {
        const candidate = dashParts[dashParts.length - 1].trim();
        if (candidate && !/output|console|terminal|health|check/i.test(candidate)) {
          return candidate;
        }
      }
    }

    // 3. From command
    if (command && typeof command === 'string') {
      const ipMatch = command.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
      if (ipMatch) return ipMatch[0];
    }

    // 4. From output prompt/header
    if (output && typeof output === 'string') {
      const ipMatch = output.slice(0, 1000).match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
      if (ipMatch) return ipMatch[0];
    }

    return 'device';
  };

  // Helper to sanitize filename string while preserving dots for IP and alphanumeric/unicode for template names
  const sanitizeFilenamePart = (str, fallback = 'unknown') => {
    if (!str || typeof str !== 'string') return fallback;
    const cleaned = str
      .trim()
      .replace(/[/\\?%*:|"<>]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_');
    return cleaned || fallback;
  };

  // 1. Save Raw File: [ip]_raw.txt
  const saveRawFile = () => {
    if (!output) return;
    const targetIp = sanitizeFilenamePart(resolveTargetIp(), 'device');
    const fileName = `${targetIp}_raw.txt`;
    const fileContent = [
      '# ==============================================================================',
      '# CLI RAW OUTPUT',
      `# Target IP : ${targetIp}`,
      `# Command   : ${command || 'N/A'}`,
      `# Title     : ${title || 'Terminal Console'}`,
      `# Timestamp : ${new Date().toLocaleString()}`,
      '# ==============================================================================',
      '',
      safeOutput,
    ].join('\n');

    const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    setShowSaveDropdown(false);
    setSaveFeedback(`Saved ${fileName}`);
    setTimeout(() => setSaveFeedback(''), 3000);
  };

  // 2. Save Regex File:
  // - If per-command regexOutput exists and no template is selected: save [ip]_regex.txt
  // - If template is selected: save [ip]_regex_[template name].txt
  const saveRegexFile = (templateOverride) => {
    if (!output && !regexOutput) return;
    const tpl = templateOverride || selectedTemplate;

    // If per-command regexOutput is present and either __command_regex__ is active or no template is chosen
    if ((!tpl || !tpl.regex) && safeRegexOutput && safeRegexOutput.trim()) {
      const targetIp = sanitizeFilenamePart(resolveTargetIp(), 'device');
      const fileName = `${targetIp}_regex.txt`;
      const fileContent = [
        '# ==============================================================================',
        '# CLI REGEX FILTERED OUTPUT (PER-COMMAND REGEX)',
        `# Target IP : ${targetIp}`,
        `# Command   : ${command || 'N/A'}`,
        `# Title     : ${title || 'Terminal Console'}`,
        `# Timestamp : ${new Date().toLocaleString()}`,
        '# ==============================================================================',
        '',
        safeRegexOutput,
      ].join('\n');

      const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      setShowSaveDropdown(false);
      setShowSelectTemplateModal(false);
      setSaveFeedback(`Saved ${fileName}`);
      setTimeout(() => setSaveFeedback(''), 3000);
      return;
    }

    // If no template is selected, open the template selector modal
    if (!tpl || !tpl.regex) {
      setShowSelectTemplateModal(true);
      setShowSaveDropdown(false);
      return;
    }

    let regexObj;
    try {
      regexObj = new RegExp(tpl.regex, 'im');
    } catch (err) {
      alert(`Regex Syntax Error in Template '${tpl.name}': ${err.message}`);
      return;
    }

    const allLines = safeOutput.split('\n');
    const matched = allLines.filter((l) => regexObj.test(l));
    const targetIp = sanitizeFilenamePart(resolveTargetIp(), 'device');
    const templateName = sanitizeFilenamePart(tpl.name || 'template', 'template');
    const fileName = `${targetIp}_regex_${templateName}.txt`;

    const fileContent = [
      '# ==============================================================================',
      '# CLI REGEX FILTERED OUTPUT (FROM TEMPLATE)',
      `# Target IP     : ${targetIp}`,
      `# Template Name : ${tpl.name}`,
      `# Regex Pattern : /${tpl.regex}/`,
      `# Command       : ${command || 'N/A'}`,
      `# Matched Lines : ${matched.length} of ${allLines.length} lines`,
      `# Generated     : ${new Date().toLocaleString()}`,
      '# ==============================================================================',
      '',
      matched.length > 0
        ? matched.join('\n')
        : `--- No lines matched regex pattern /${tpl.regex}/ from template '${tpl.name}' ---`,
    ].join('\n');

    const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    setShowSaveDropdown(false);
    setShowSelectTemplateModal(false);

    // Sync template selection
    setActiveTemplateId(tpl.id);
    if (onSelectTemplate) {
      onSelectTemplate(tpl.id);
    }

    setSaveFeedback(`Saved ${fileName}`);
    setTimeout(() => setSaveFeedback(''), 3000);
  };

  // 3. Save Both Files: [ip]_raw.txt and regex file
  const saveBothFiles = () => {
    if (!output && !regexOutput) return;
    if ((!selectedTemplate || !selectedTemplate.regex) && (!safeRegexOutput || !safeRegexOutput.trim())) {
      setShowSelectTemplateModal(true);
      setShowSaveDropdown(false);
      return;
    }
    saveRawFile();
    setTimeout(() => {
      saveRegexFile(selectedTemplate);
    }, 350);
    setShowSaveDropdown(false);
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
            {title || 'Terminal Console'} {displayCommand && `— $ ${displayCommand}`}
          </span>
        </div>

        <div className="terminal-actions">
          {saveFeedback && (
            <span className="save-feedback-badge">
              <Check className="h-3 w-3" />
              <span>{saveFeedback}</span>
            </span>
          )}

          {executionTime !== undefined && executionTime !== null && (
            <span className="execution-time-badge">
              {executionTime}s
            </span>
          )}

          {/* Select Template Dropdown */}
          <div className="terminal-template-selector" title="Template / Output Mode">
            <Filter className="template-select-icon" />
            <select
              value={activeTemplateId}
              onChange={handleTemplateChange}
              className="terminal-template-select"
              aria-label="Select Template"
            >
              <option value="">Raw Output</option>
              {safeRegexOutput && safeRegexOutput !== safeOutput && (
                <option value="__command_regex__">Command Regex Output</option>
              )}
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

          {selectedTemplate && selectedTemplate.regex && filterResult.valid && (
            <span className="terminal-match-badge" title={`Matched lines: ${filterResult.matchedCount} of ${filterResult.totalCount}`}>
              {filterResult.matchedCount}/{filterResult.totalCount} lines
            </span>
          )}
          {activeTemplateId === '__command_regex__' && safeRegexOutput && (
            <span className="terminal-match-badge" title="Per-Command Regex Filter">
              Command Regex
            </span>
          )}

          {/* Copy Output Button */}
          <button
            onClick={handleCopy}
            disabled={!displayOutput}
            title={selectedTemplate?.regex ? `Copy Filtered Output (${selectedTemplate.name})` : "Copy Output"}
            className="btn-terminal-action"
          >
            {copied ? <Check className="action-icon success" /> : <Copy className="action-icon" />}
          </button>

          {/* Save Output Dropdown Menu */}
          <div className="terminal-save-wrapper" ref={saveDropdownRef}>
            <button
              type="button"
              onClick={() => setShowSaveDropdown(!showSaveDropdown)}
              disabled={!output}
              title="Save Output (Raw file / Regex file from Template or Command)"
              className="btn-terminal-save"
            >
              <Download className="h-3.5 w-3.5 text-indigo-400" />
              <span>Save File</span>
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>

            {showSaveDropdown && (
              <div className="terminal-save-menu">
                <div className="save-menu-header">Save File Options</div>

                {/* 1. Save Raw File */}
                <button
                  type="button"
                  onClick={saveRawFile}
                  className="save-menu-item"
                >
                  <FileText className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div className="save-menu-text">
                    <span className="save-menu-title">Save Raw File (.txt)</span>
                    <span className="save-menu-desc font-mono text-[11px]">
                      {`${sanitizeFilenamePart(resolveTargetIp(), 'device')}_raw.txt`}
                    </span>
                  </div>
                </button>

                {/* 2. Save Regex File */}
                <button
                  type="button"
                  onClick={() => saveRegexFile()}
                  className="save-menu-item"
                >
                  <Filter className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="save-menu-text">
                    <span className="save-menu-title">Save Regex File (.txt)</span>
                    <span className="save-menu-desc font-mono text-[11px]">
                      {selectedTemplate?.regex
                        ? `${sanitizeFilenamePart(resolveTargetIp(), 'device')}_regex_${sanitizeFilenamePart(selectedTemplate.name, 'template')}.txt`
                        : (safeRegexOutput && safeRegexOutput.trim())
                          ? `${sanitizeFilenamePart(resolveTargetIp(), 'device')}_regex.txt`
                          : 'Select a Template first to save regex'}
                    </span>
                  </div>
                </button>

                <div className="save-menu-divider" />

                {/* 3. Save Both Files */}
                <button
                  type="button"
                  onClick={saveBothFiles}
                  className="save-menu-item"
                >
                  <Layers className="h-4 w-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                  <div className="save-menu-text">
                    <span className="save-menu-title">Save Both (Raw + Regex)</span>
                    <span className="save-menu-desc font-mono text-[11px]">
                      {selectedTemplate?.regex
                        ? `Save [ip]_raw.txt and [ip]_regex_${sanitizeFilenamePart(selectedTemplate.name, 'template')}.txt`
                        : (safeRegexOutput && safeRegexOutput.trim())
                          ? `Save [ip]_raw.txt and [ip]_regex.txt`
                          : 'Requires selecting a template first'}
                    </span>
                  </div>
                </button>
              </div>
            )}
          </div>

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

      {/* Select Template Modal (when clicking Save Regex File without prior selected template) */}
      {showSelectTemplateModal && (
        <div className="template-modal-overlay" onClick={() => setShowSelectTemplateModal(false)}>
          <div className="template-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="template-modal-header">
              <div className="template-modal-title">
                <Filter className="modal-header-icon" />
                <span>Select Template for Regex Export</span>
              </div>
              <button
                type="button"
                onClick={() => setShowSelectTemplateModal(false)}
                className="template-modal-close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4">
              <p className="text-xs text-slate-300 mb-3">
                การบันทึก Regex File ต้องเลือก Template ก่อน กรุณาเลือก Template ด้านล่างเพื่อใช้ Regex บันทึกไฟล์:
              </p>

              {templateList.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  <p>ยังไม่มี Template ในระบบ</p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSelectTemplateModal(false);
                      setShowAddModal(true);
                    }}
                    className="btn-modal-save mt-3 mx-auto"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Create New Template</span>
                  </button>
                </div>
              ) : (
                <div className="template-picker-list">
                  {templateList.map((tpl) => {
                    let matchCount = 0;
                    if (safeOutput && tpl.regex) {
                      try {
                        const r = new RegExp(tpl.regex, 'im');
                        matchCount = safeOutput.split('\n').filter((l) => r.test(l)).length;
                      } catch (e) {}
                    }
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => saveRegexFile(tpl)}
                        className="template-picker-item"
                      >
                        <div className="template-picker-info">
                          <span className="template-picker-name">{tpl.name}</span>
                          <span className="template-picker-regex">/{tpl.regex}/</span>
                          {tpl.description && (
                            <span className="text-[11px] text-slate-400">{tpl.description}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="template-picker-match">
                            {matchCount} lines
                          </span>
                          <span className="text-xs text-indigo-400 font-semibold whitespace-nowrap">
                            Select & Save
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="template-modal-actions mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowSelectTemplateModal(false);
                    setShowAddModal(true);
                  }}
                  className="btn-modal-cancel"
                  style={{ marginRight: 'auto' }}
                >
                  <Plus className="h-3.5 w-3.5 inline mr-1" />
                  <span>Add New Template</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowSelectTemplateModal(false)}
                  className="btn-modal-cancel"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
