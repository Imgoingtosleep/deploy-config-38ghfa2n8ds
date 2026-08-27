import React, { useState, useEffect } from 'react';
import {
  Layers,
  Play,
  Plus,
  Trash2,
  Edit,
  Save,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ListChecks,
  Lock,
  Unlock,
  Terminal as TerminalIcon,
} from 'lucide-react';
import {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  executeTemplate,
  executeTroubleshootCommand,
} from '../services/api';
import TerminalOutput from '../components/TerminalOutput';
import './TemplateStudioPage.css';

export default function TemplateStudioPage({ device, userRole }) {
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  // Level 2 Command Builder State
  const [currentTestCommand, setCurrentTestCommand] = useState('');
  const [testingSingle, setTestingSingle] = useState(false);
  const [singleTestResult, setSingleTestResult] = useState(null);
  const [commandQueue, setCommandQueue] = useState([]);

  // Save Modal / Form State
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateVendor, setNewTemplateVendor] = useState('huawei');
  const [newTemplateDesc, setNewTemplateDesc] = useState('');
  const [editingTemplateId, setEditingTemplateId] = useState(null);

  // Execution State (Level 1 & Level 2)
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const isLevel2 = userRole === 'level2';

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const data = await getTemplates();
      setTemplates(data || []);
      if (data && data.length > 0 && !selectedTemplate) {
        setSelectedTemplate(data[0]);
      }
    } catch (err) {
      console.error('Failed to load templates', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  // Level 2: Test single command on live device
  const handleTestOnDevice = async () => {
    if (!currentTestCommand.trim()) return;
    if (!device.host) {
      setErrorMessage('Please fill in Device Host above before testing.');
      return;
    }

    setTestingSingle(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const res = await executeTroubleshootCommand(device, currentTestCommand);
      setSingleTestResult(res);
      if (!res.success) {
        setErrorMessage(res.error || 'Command failed on device');
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || err.message || 'Execution failed');
    } finally {
      setTestingSingle(false);
    }
  };

  // Level 2: Add tested command to queue
  const handleAddToQueue = () => {
    if (!currentTestCommand.trim()) return;
    if (!commandQueue.includes(currentTestCommand.trim())) {
      setCommandQueue((prev) => [...prev, currentTestCommand.trim()]);
    }
    setCurrentTestCommand('');
  };

  // Level 2: Remove command from queue
  const handleRemoveFromQueue = (indexToRemove) => {
    setCommandQueue((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Level 2: Save queue as new template
  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    if (!newTemplateName.trim()) {
      setErrorMessage('Please specify a Template Name.');
      return;
    }
    if (commandQueue.length === 0) {
      setErrorMessage('Queue is empty. Add at least one command.');
      return;
    }

    try {
      if (editingTemplateId) {
        await updateTemplate(editingTemplateId, {
          name: newTemplateName,
          vendor: newTemplateVendor,
          description: newTemplateDesc,
          commands: commandQueue,
        });
        setSuccessMessage(`Template "${newTemplateName}" updated successfully.`);
      } else {
        await createTemplate({
          name: newTemplateName,
          vendor: newTemplateVendor,
          description: newTemplateDesc,
          commands: commandQueue,
        });
        setSuccessMessage(`Template "${newTemplateName}" created successfully for Level 1 operators.`);
      }
      setShowSaveForm(false);
      setEditingTemplateId(null);
      setNewTemplateName('');
      setNewTemplateDesc('');
      setCommandQueue([]);
      loadTemplates();
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || err.message || 'Failed to save template');
    }
  };

  // Level 2: Edit an existing template
  const handleStartEditTemplate = (tpl) => {
    setEditingTemplateId(tpl.id);
    setNewTemplateName(tpl.name);
    setNewTemplateVendor(tpl.vendor);
    setNewTemplateDesc(tpl.description || '');
    setCommandQueue([...tpl.commands]);
    setShowSaveForm(true);
  };

  // Level 2: Delete a template
  const handleDeleteTemplate = async (templateId, templateName) => {
    if (!window.confirm(`Delete template "${templateName}"?`)) return;
    try {
      await deleteTemplate(templateId);
      setSuccessMessage(`Template "${templateName}" deleted.`);
      if (selectedTemplate?.id === templateId) {
        setSelectedTemplate(null);
      }
      loadTemplates();
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || err.message || 'Failed to delete template');
    }
  };

  // Level 1 & 2: Execute selected template on device
  const handleRunSelectedTemplate = async () => {
    if (!selectedTemplate) return;
    if (!device.host) {
      setErrorMessage('Please fill in Device Host above before running.');
      return;
    }

    setExecuting(true);
    setErrorMessage('');
    setSuccessMessage('');
    setExecutionResult(null);

    try {
      const data = await executeTemplate(device, selectedTemplate.id, selectedTemplate.commands);
      setExecutionResult(data);
      setSelectedCommandIndex(0);
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || err.message || 'Template execution failed');
    } finally {
      setExecuting(false);
    }
  };

  const activeResult = executionResult?.results?.[selectedCommandIndex];

  return (
    <div className="template-page-container">
      {/* Role Banner */}
      <div className={`role-notice-banner ${isLevel2 ? 'level2' : 'level1'}`}>
        <div className="flex items-center gap-2">
          {isLevel2 ? <Unlock className="h-4 w-4 text-amber-400" /> : <Lock className="h-4 w-4 text-sky-400" />}
          <span className="font-semibold">
            {isLevel2 ? 'Level 2 Mode: Template Creator & Engineer' : 'Level 1 Mode: Template Operator (Read & Run Only)'}
          </span>
        </div>
        <p className="text-xs text-slate-400">
          {isLevel2
            ? 'You can SSH into live devices, test CLI display commands, and save them as verified templates.'
            : 'You can select approved templates created by Level 2 engineers and execute them on target devices.'}
        </p>
      </div>

      {errorMessage && (
        <div className="alert-box">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="alert-box success">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* LEVEL 2 ONLY: Command Builder & Template Studio */}
      {isLevel2 && (
        <div className="template-card">
          <div className="template-card-header">
            <div>
              <h2 className="template-title">
                <TerminalIcon className="h-5 w-5 text-amber-400" />
                <span>Level 2: Live Command Builder & Test Workspace</span>
              </h2>
              <p className="template-subtitle">
                Test show/display commands on the connected switch, queue verified commands, and save as a reusable template.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mt-3">
            {/* Input & Live Test */}
            <div className="md:col-span-7 flex flex-col gap-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={currentTestCommand}
                  onChange={(e) => setCurrentTestCommand(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleTestOnDevice()}
                  placeholder="e.g. display interface brief or show ip route"
                  className="form-input font-mono flex-1 text-sm"
                />
                <button
                  type="button"
                  onClick={handleTestOnDevice}
                  disabled={testingSingle || !currentTestCommand.trim()}
                  className="btn-primary flex items-center gap-1.5 px-3"
                >
                  {testingSingle ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  <span>Test on Switch</span>
                </button>
                <button
                  type="button"
                  onClick={handleAddToQueue}
                  disabled={!currentTestCommand.trim()}
                  className="btn-secondary flex items-center gap-1 px-3"
                  title="Add command to template queue"
                >
                  <Plus className="h-4 w-4" />
                  <span>Queue</span>
                </button>
              </div>

              {/* Single Test Result Preview */}
              <div style={{ height: '220px' }}>
                <TerminalOutput
                  title="Live Switch Test Output"
                  command={singleTestResult?.command}
                  output={singleTestResult?.output || singleTestResult?.error}
                  executionTime={singleTestResult?.execution_time_seconds}
                  isError={!singleTestResult?.success}
                />
              </div>
            </div>

            {/* Current Queue & Save Form */}
            <div className="md:col-span-5 flex flex-col gap-3">
              <div className="queue-panel">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="text-xs font-semibold text-slate-300">
                    Template Queue ({commandQueue.length} commands)
                  </span>
                  {commandQueue.length > 0 && (
                    <button
                      onClick={() => setCommandQueue([])}
                      className="text-xs text-rose-400 hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="queue-list">
                  {commandQueue.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-4">
                      No commands queued. Test a command on the left and click "Queue".
                    </p>
                  ) : (
                    commandQueue.map((cmd, idx) => (
                      <div key={idx} className="queue-item">
                        <span className="font-mono text-xs text-emerald-400 flex-1 truncate">
                          {idx + 1}. {cmd}
                        </span>
                        <button
                          onClick={() => handleRemoveFromQueue(idx)}
                          className="text-slate-400 hover:text-rose-400 p-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <button
                  type="button"
                  disabled={commandQueue.length === 0}
                  onClick={() => setShowSaveForm(true)}
                  className="btn-save-template"
                >
                  <Save className="h-4 w-4" />
                  <span>{editingTemplateId ? 'Update Template' : 'Save Queue as Template for Level 1'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save Template Modal / Dialog (Level 2) */}
      {showSaveForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">
              <Save className="h-4 w-4 text-amber-400" />
              <span>{editingTemplateId ? 'Edit Template' : 'Save New Command Template'}</span>
            </h3>
            <form onSubmit={handleSaveTemplate} className="flex flex-col gap-3 mt-3">
              <div>
                <label className="form-label">Template Name *</label>
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="e.g. Huawei Core Interface Verification"
                  required
                  className="form-input text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="form-label">Vendor Target</label>
                  <select
                    value={newTemplateVendor}
                    onChange={(e) => setNewTemplateVendor(e.target.value)}
                    className="form-select text-sm"
                  >
                    <option value="huawei">Huawei VRP</option>
                    <option value="cisco_ios">Cisco IOS / XE</option>
                    <option value="all">All Vendors</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Total Commands</label>
                  <input
                    type="text"
                    disabled
                    value={`${commandQueue.length} command(s)`}
                    className="form-input text-sm opacity-70"
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Description (Optional)</label>
                <textarea
                  value={newTemplateDesc}
                  onChange={(e) => setNewTemplateDesc(e.target.value)}
                  placeholder="Explain when Level 1 operators should run this template..."
                  rows={2}
                  className="form-input text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowSaveForm(false);
                    setEditingTemplateId(null);
                  }}
                  className="btn-secondary px-3 py-1.5"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary px-4 py-1.5">
                  Save Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TEMPLATE RUNNER SECTION (ACCESSIBLE TO LEVEL 1 & LEVEL 2) */}
      <div className="template-card">
        <div className="template-card-header">
          <div>
            <h2 className="template-title">
              <Layers className="h-5 w-5 text-indigo-400" />
              <span>Available Command Templates</span>
            </h2>
            <p className="template-subtitle">
              Select a verified template created by Level 2 to execute against the target switch.
            </p>
          </div>

          {selectedTemplate && (
            <button
              onClick={handleRunSelectedTemplate}
              disabled={executing || !device.host}
              className="btn-run-health"
            >
              {executing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Executing Template...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  <span>Run Selected Template ({selectedTemplate.commands?.length || 0} cmds)</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Template Catalog Cards */}
        <div className="template-grid">
          {loadingTemplates ? (
            <p className="text-xs text-slate-500 py-4">Loading saved templates...</p>
          ) : templates.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">No templates found. Level 2 can create one above.</p>
          ) : (
            templates.map((tpl) => {
              const isSelected = selectedTemplate?.id === tpl.id;
              return (
                <div
                  key={tpl.id}
                  onClick={() => setSelectedTemplate(tpl)}
                  className={`template-item-card ${isSelected ? 'selected' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="template-vendor-badge">{tpl.vendor?.toUpperCase()}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500 font-mono">
                        {tpl.commands?.length || 0} cmds
                      </span>
                      {isLevel2 && (
                        <div className="flex items-center gap-1 ml-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEditTemplate(tpl);
                            }}
                            title="Edit Template"
                            className="text-slate-400 hover:text-indigo-300 p-0.5"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTemplate(tpl.id, tpl.name);
                            }}
                            title="Delete Template"
                            className="text-slate-400 hover:text-rose-400 p-0.5"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="template-name">{tpl.name}</p>
                  <p className="template-desc">{tpl.description || 'No description provided'}</p>

                  <div className="template-commands-preview">
                    {tpl.commands?.map((cmd, idx) => (
                      <span key={idx} className="cmd-tag font-mono">
                        $ {cmd}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Execution Results View */}
      {executionResult && (
        <div className="health-results-grid">
          {/* Left Column: Command List */}
          <div className="col-span-4 command-list-card">
            <div className="command-list-header">
              <span className="command-list-title">
                <ListChecks className="h-4 w-4 text-indigo-400" />
                <span>Template Execution Steps</span>
              </span>
              <span className="total-time">
                Total: {executionResult.overall_time_seconds}s
              </span>
            </div>

            <div className="command-items">
              {executionResult.results.map((res, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedCommandIndex(idx)}
                  className={`command-item-btn ${selectedCommandIndex === idx ? 'active' : ''}`}
                >
                  <div className="command-item-left">
                    {res.success ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-rose-400 flex-shrink-0" />
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
          <div className="col-span-8" style={{ height: '480px' }}>
            <TerminalOutput
              title="Template Execution Output"
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
