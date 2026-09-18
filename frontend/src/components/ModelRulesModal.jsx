import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Edit2,
  FlaskConical,
  Loader2,
  MousePointerClick,
  Plus,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import {
  createModelRule,
  deleteModelRule,
  getModelRules,
  reorderModelRules,
  testModelRules,
  updateModelRule,
} from '../services/api';
import { NodeIcon, ROLE_STYLE } from './topologyIcons';
import { BUILDER_MODES, buildPattern, describeRule, familyOf } from './modelRuleBuilders';

// '' = keep the built-in router / switch guess for the model
const ROLE_CHOICES = ['', 'switch', 'router', 'firewall', 'wireless', 'server', 'cloud', 'pc'];

const blankRule = () => ({
  id: null,
  name: '',
  match: '',
  pattern: '',
  role: '',
  ignore_case: false,
  enabled: true,
  builder_mode: 'example',
  builder_value: '',
});

const errMsg = (err, fallback) => {
  const detail = err.response?.data?.detail;
  if (detail) return typeof detail === 'string' ? detail : JSON.stringify(detail);
  return err.message || fallback;
};

const RoleIcon = ({ role, size = 22 }) => (
  <svg width={size} height={size} viewBox="-22 -22 44 44" className="lldp-role-icon">
    <NodeIcon role={role || 'unknown'} />
  </svg>
);

const roleLabel = (role) => (role ? ROLE_STYLE[role]?.label || role : 'Auto');
// Name given to a rule saved without one
const autoName = (rule) => `${describeRule(rule)} → ${roleLabel(rule.role)}`;

/** The sample text with the rule's matches highlighted */
function Highlighted({ text, matches }) {
  const parts = [];
  let at = 0;
  [...(matches || [])]
    .sort((a, b) => a.start - b.start)
    .forEach((m, i) => {
      if (m.start < at || !m.text) return;
      if (m.start > at) parts.push(text.slice(at, m.start));
      parts.push(<mark key={i}>{m.text}</mark>);
      at = m.start + m.text.length;
    });
  parts.push(text.slice(at));
  return <pre className="lldp-rule-sample">{parts}</pre>;
}

/**
 * "Teach a model": rules that read the model (and device type) of product lines
 * the built-in Huawei / Cisco patterns do not know. Users select the model name
 * in a sample text and pick a device type; the regex is generated for them.
 *
 * samples: texts from the current result [{ device, kind, text, model }]
 * teach:   open straight into a new rule with this sample loaded
 * onApply: re-read the current result with the saved rules (no SSH)
 */
export default function ModelRulesModal({ onClose, samples = [], teach = null, onApply }) {
  const [rules, setRules] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [sample, setSample] = useState('');
  const [test, setTest] = useState(null);
  const [testing, setTesting] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const sampleRef = useRef(null);

  const missing = useMemo(() => samples.filter((s) => !s.model), [samples]);
  // Unique texts sent for the "what this rule changes" preview
  const previewTexts = useMemo(() => [...new Set(samples.map((s) => s.text))].slice(0, 500), [samples]);

  const load = async () => {
    try {
      const data = await getModelRules();
      setRules(Array.isArray(data) ? data : []);
    } catch (err) {
      setRules([]);
      setError(errMsg(err, 'Failed to load model rules'));
    }
  };

  const startNew = (s = null) => {
    setError('');
    setSavedMsg('');
    setShowMore(false);
    setEditing(blankRule());
    setSample(s?.text || '');
  };

  useEffect(() => {
    load();
    if (teach) startNew(teach);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pattern = editing ? buildPattern(editing.builder_mode, editing.builder_value, editing.pattern) : '';

  // Live check through the backend, so it is exactly what a scan would read
  useEffect(() => {
    if (!sample.trim() && !(editing && pattern && previewTexts.length)) {
      setTest(null);
      return undefined;
    }
    const draft =
      editing && pattern
        ? {
            name: editing.name || 'This rule',
            match: editing.match,
            pattern,
            role: editing.role,
            ignore_case: editing.ignore_case,
            enabled: true,
          }
        : null;
    const timer = setTimeout(async () => {
      setTesting(true);
      try {
        setTest(await testModelRules(sample, draft, editing?.id || null, draft ? previewTexts : []));
      } catch (err) {
        setTest({ error: errMsg(err, 'Check failed') });
      } finally {
        setTesting(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [sample, pattern, editing?.match, editing?.role, editing?.ignore_case, editing?.id, previewTexts]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (fields) => setEditing((prev) => ({ ...prev, ...fields }));
  const field = (name) => (e) => patch({ [name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  // Selecting the model name in the sample fills the "Select from text" builder
  const handleSampleSelect = () => {
    const el = sampleRef.current;
    if (!editing || !el) return;
    const picked = el.value.slice(el.selectionStart, el.selectionEnd).trim();
    if (!picked || picked.length > 60 || /\n/.test(picked)) return;
    patch({ builder_mode: 'example', builder_value: picked });
  };

  const switchMode = (mode) => {
    if (mode === editing.builder_mode) return;
    if (mode === 'regex') {
      // Keep what the builder generated so it can be fine-tuned by hand
      patch({ builder_mode: 'regex', pattern: pattern || editing.pattern });
      return;
    }
    const carry = editing.builder_mode === 'example' && mode === 'prefix' ? familyOf(editing.builder_value) : '';
    patch({ builder_mode: mode, builder_value: carry });
  };

  const save = async (apply) => {
    if (!pattern) {
      setError(
        editing.builder_mode === 'example'
          ? 'Select the model name in the sample text first (or type it).'
          : 'Fill in how to find the model first.'
      );
      return;
    }
    if (test?.error) {
      setError(test.error);
      return;
    }
    setSaving(true);
    setError('');
    const rule = { ...editing, pattern };
    const payload = {
      name: editing.name.trim() || autoName(rule),
      match: editing.match.trim(),
      pattern,
      role: editing.role,
      ignore_case: editing.ignore_case,
      enabled: editing.enabled,
      builder_mode: editing.builder_mode,
      builder_value: editing.builder_mode === 'regex' ? '' : editing.builder_value.trim(),
    };
    try {
      if (editing.id) await updateModelRule(editing.id, payload);
      else await createModelRule(payload);
      await load();
      setEditing(null);
      setSample('');
      if (apply && onApply) {
        try {
          const msg = await onApply();
          setSavedMsg(msg ? `Saved and applied. ${msg}` : 'Saved. Press Re-parse to apply it to the current result.');
        } catch (err) {
          setSavedMsg('');
          setError(`Saved, but applying to the result failed: ${errMsg(err, 'Re-parse failed')}`);
        }
      } else {
        setSavedMsg('Saved. New scans read models with this rule.');
      }
    } catch (err) {
      setError(errMsg(err, 'Failed to save rule'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (rule) => {
    setError('');
    try {
      await updateModelRule(rule.id, { enabled: !rule.enabled });
      await load();
    } catch (err) {
      setError(errMsg(err, 'Failed to update rule'));
    }
  };

  const handleMove = async (index, dir) => {
    const ids = rules.map((r) => r.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    try {
      setRules(await reorderModelRules(ids));
    } catch (err) {
      setError(errMsg(err, 'Failed to reorder rules'));
    }
  };

  const handleDelete = async (rule) => {
    if (!window.confirm(`Delete the rule "${rule.name}"?`)) return;
    setError('');
    try {
      await deleteModelRule(rule.id);
      await load();
    } catch (err) {
      setError(errMsg(err, 'Failed to delete rule'));
    }
  };

  // Devices of the current result this rule would give a model / type to
  const affected = useMemo(() => {
    if (!test?.samples?.length) return [];
    const byText = Object.fromEntries(previewTexts.map((t, i) => [t, test.samples[i]]));
    const rows = [];
    const seen = new Set();
    samples.forEach((s) => {
      const r = byText[s.text];
      if (!r?.by_draft || seen.has(s.device)) return;
      seen.add(s.device);
      rows.push({ ...s, next: r });
    });
    return rows;
  }, [test, samples, previewTexts]);

  const stillMissing = useMemo(() => {
    if (!test?.samples?.length) return null;
    const byText = Object.fromEntries(previewTexts.map((t, i) => [t, test.samples[i]]));
    return new Set(samples.filter((s) => !byText[s.text]?.model).map((s) => s.device)).size;
  }, [test, samples, previewTexts]);

  const mode = editing?.builder_mode;
  const builderInput = {
    example: { label: 'Model name as it appears in the text', placeholder: 'Select it in the text above, or type e.g. FortiGate-100F' },
    prefix: { label: 'Model starts with', placeholder: 'e.g. FortiGate-' },
    after: { label: 'Label written before the model', placeholder: 'e.g. Model  (for a line like "Model: NX-9000Z")' },
  }[mode];

  return (
    <div className="lldp-modal-backdrop" onClick={onClose}>
      <div className="lldp-modal lldp-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="lldp-modal-head">
          <h3>
            <Wand2 className="h-4 w-4" />
            {editing ? (editing.id ? 'Edit model rule' : 'Teach a new model') : 'Model Rules'}
          </h3>
          <button className="lldp-modal-close" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="lldp-modal-body">
          {error && (
            <div className="lldp-error">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          {!editing ? (
            <>
              {savedMsg && <span className="lldp-hint ok">{savedMsg}</span>}
              <span className="lldp-hint">
                When a device shows <strong>Unknown model</strong>, teach the model here: pick a sample, select the model
                name and choose the device type. Rules are tried from the top, before the built-in Huawei / Cisco
                patterns.
              </span>

              {missing.length > 0 && (
                <div className="lldp-rule-callout">
                  <AlertCircle className="h-4 w-4" />
                  <span>
                    {new Set(missing.map((s) => s.device)).size} device(s) in the current result have no model:{' '}
                    <strong>{[...new Set(missing.map((s) => s.device))].slice(0, 6).join(', ')}</strong>
                    {new Set(missing.map((s) => s.device)).size > 6 ? ' …' : ''}
                  </span>
                  <button className="lldp-btn-primary lldp-btn-mini" onClick={() => startNew(missing[0])}>
                    <Wand2 className="h-3.5 w-3.5" />
                    Teach
                  </button>
                </div>
              )}

              {rules === null && <Loader2 className="h-4 w-4 animate-spin" />}
              {rules?.length === 0 && <span className="lldp-hint">No rules yet — only the built-in patterns are used.</span>}
              {(rules || []).map((r, i) => (
                <div className={`lldp-cmd-item lldp-rule-item${r.enabled ? '' : ' off'}`} key={r.id}>
                  <div className="lldp-rule-order">
                    <button title="Try earlier" disabled={i === 0} onClick={() => handleMove(i, -1)}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button title="Try later" disabled={i === rules.length - 1} onClick={() => handleMove(i, 1)}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <RoleIcon role={r.role} size={26} />
                  <div className="lldp-rule-text">
                    <span className="lldp-cmd-name">{r.name}</span>
                    {(r.name !== autoName(r) || r.match) && (
                      <span className="lldp-hint">
                        {describeRule(r)} → <strong>{roleLabel(r.role)}</strong>
                        {r.match ? ` · only when the text contains “${r.match}”` : ''}
                      </span>
                    )}
                    <code className="lldp-rule-regex">{r.pattern}</code>
                  </div>
                  <div className="lldp-cmd-actions">
                    <label className="lldp-switch" title={r.enabled ? 'On' : 'Off'}>
                      <input type="checkbox" checked={r.enabled} onChange={() => handleToggle(r)} />
                      <span />
                    </label>
                    <button
                      className="lldp-btn-secondary lldp-btn-mini"
                      onClick={() => {
                        setError('');
                        setSavedMsg('');
                        setShowMore(Boolean(r.match || r.ignore_case));
                        setEditing({ ...r });
                        setSample('');
                      }}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button className="lldp-btn-danger lldp-btn-mini" title="Delete" onClick={() => handleDelete(r)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              <button className="lldp-btn-primary lldp-btn-mini" onClick={() => startNew(missing[0] || null)}>
                <Plus className="h-3.5 w-3.5" />
                Teach a new model
              </button>
            </>
          ) : (
            <div className="lldp-rule-editor">
              {/* Step 1: a sample of what the device prints */}
              <section className="lldp-rule-step">
                <div className="lldp-rule-step-head">
                  <span className="lldp-rule-step-no">1</span>
                  <span>Sample text from the device</span>
                  {samples.length > 0 && (
                    <select
                      className="lldp-rule-sample-pick"
                      value=""
                      onChange={(e) => e.target.value !== '' && setSample(samples[Number(e.target.value)].text)}
                    >
                      <option value="">Load from the current result…</option>
                      {samples.slice(0, 300).map((s, i) => (
                        <option key={i} value={i}>
                          {s.model ? '' : '⚠ '}
                          {s.device} — {s.kind} ({s.model || 'no model'})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <textarea
                  ref={sampleRef}
                  className="lldp-rule-textarea"
                  rows={5}
                  value={sample}
                  onChange={(e) => setSample(e.target.value)}
                  onMouseUp={handleSampleSelect}
                  onKeyUp={handleSampleSelect}
                  spellCheck={false}
                  placeholder={'Paste the output of display version / show version, or an LLDP System description.\ne.g. FortiGate-100F v7.0.12,build0523'}
                />
                <span className="lldp-hint">
                  <MousePointerClick className="h-3.5 w-3.5 lldp-inline-icon" />
                  Select the model name in the text with the mouse (e.g. <code>FortiGate-100F</code>).
                </span>
              </section>

              {/* Step 2: how to find the model */}
              <section className="lldp-rule-step">
                <div className="lldp-rule-step-head">
                  <span className="lldp-rule-step-no">2</span>
                  <span>How to find the model</span>
                </div>
                <div className="lldp-seg">
                  {BUILDER_MODES.map((m) => (
                    <button key={m.key} type="button" className={mode === m.key ? 'active' : ''} onClick={() => switchMode(m.key)}>
                      {m.label}
                      {m.hint && <em>{m.hint}</em>}
                    </button>
                  ))}
                </div>
                {mode !== 'regex' ? (
                  <label className="lldp-field">
                    <span>{builderInput.label}</span>
                    <input
                      className="lldp-cmd-input"
                      value={editing.builder_value}
                      onChange={field('builder_value')}
                      placeholder={builderInput.placeholder}
                      spellCheck={false}
                    />
                  </label>
                ) : (
                  <label className="lldp-field">
                    <span>
                      Python regex — the model is group 1 or <code>(?P&lt;model&gt;...)</code>
                    </span>
                    <input
                      className="lldp-cmd-input"
                      value={editing.pattern}
                      onChange={field('pattern')}
                      placeholder={'(FortiGate-\\d+[A-Z]?)'}
                      spellCheck={false}
                    />
                  </label>
                )}
                {mode === 'example' && editing.builder_value.trim() && (
                  <span className="lldp-hint">
                    {familyOf(editing.builder_value) && familyOf(editing.builder_value) !== editing.builder_value.trim()
                      ? <>Also finds other models of the same family: “{familyOf(editing.builder_value)}” followed by a number.</>
                      : <>Finds exactly “{editing.builder_value.trim()}”.</>}
                    {!familyOf(editing.builder_value) && (
                      <strong className="lldp-warn-text"> It starts with a number — set “Only when the text contains” below to avoid wrong matches.</strong>
                    )}
                  </span>
                )}
                {mode !== 'regex' && pattern && (
                  <span className="lldp-hint">
                    Generated regex: <code>{pattern}</code>
                  </span>
                )}

                {/* Result on the sample */}
                {test?.error && <span className="lldp-hint error">{test.error}</span>}
                {sample.trim() && test && !test.error && (
                  <div className="lldp-rule-found">
                    <RoleIcon role={test.role} size={30} />
                    <div>
                      <div>
                        Model found: <strong>{test.model || '— none —'}</strong>
                        {testing && <Loader2 className="h-3.5 w-3.5 animate-spin lldp-inline-icon" />}
                      </div>
                      <div className="lldp-hint">
                        {test.model
                          ? test.by_draft
                            ? 'Read by this rule.'
                            : `Read by ${test.model_source}${pattern ? ' — this rule is not needed for this text, or another rule wins first.' : '.'}`
                          : pattern
                            ? test.keyword_found
                              ? 'This rule finds nothing in the sample yet.'
                              : `The text does not contain “${editing.match}”, so this rule is skipped.`
                            : 'Nothing found yet.'}
                      </div>
                    </div>
                  </div>
                )}
                {sample.trim() && test?.draft_matches?.length > 0 && <Highlighted text={sample} matches={test.draft_matches} />}
              </section>

              {/* Step 3: device type */}
              <section className="lldp-rule-step">
                <div className="lldp-rule-step-head">
                  <span className="lldp-rule-step-no">3</span>
                  <span>Device type in the topology</span>
                </div>
                <div className="lldp-role-picker">
                  {ROLE_CHOICES.map((r) => (
                    <button
                      key={r || 'auto'}
                      type="button"
                      className={editing.role === r ? 'active' : ''}
                      onClick={() => patch({ role: r })}
                      title={r ? '' : 'Keep the built-in guess (router for AR / NE / ISR ..., otherwise switch)'}
                    >
                      <RoleIcon role={r} />
                      <span>{roleLabel(r)}</span>
                    </button>
                  ))}
                </div>
              </section>

              {/* What changes in the current result */}
              {affected.length > 0 && (
                <section className="lldp-rule-step">
                  <div className="lldp-rule-step-head">
                    <Check className="h-4 w-4" />
                    <span>
                      This rule reads {affected.length} device(s) of the current result
                      {stillMissing ? ` · ${stillMissing} still without a model` : ' · every device has a model'}
                    </span>
                  </div>
                  <div className="lldp-rule-affected">
                    {affected.slice(0, 40).map((a) => (
                      <div key={a.device}>
                        <RoleIcon role={a.next.role} size={18} />
                        <span className="dev">{a.device}</span>
                        <span className="old">{a.model || 'no model'}</span>
                        <span>→</span>
                        <strong>{a.next.model}</strong>
                        <span className="lldp-hint">{roleLabel(a.next.role)}</span>
                      </div>
                    ))}
                    {affected.length > 40 && <span className="lldp-hint">… and {affected.length - 40} more</span>}
                  </div>
                </section>
              )}

              {/* Rarely needed */}
              <button type="button" className="lldp-rule-more" onClick={() => setShowMore((v) => !v)}>
                {showMore ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                More options
              </button>
              {showMore && (
                <div className="topo-form-grid">
                  <label className="lldp-field">
                    <span>Rule name (optional)</span>
                    <input value={editing.name} onChange={field('name')} placeholder="Named automatically" />
                  </label>
                  <label className="lldp-field">
                    <span>Only when the text contains</span>
                    <input value={editing.match} onChange={field('match')} placeholder="e.g. FortiGate" />
                  </label>
                  <div className="lldp-options">
                    <label className="lldp-toggle">
                      <input type="checkbox" checked={editing.ignore_case} onChange={field('ignore_case')} />
                      <span>Ignore upper / lower case</span>
                    </label>
                    <label className="lldp-toggle">
                      <input type="checkbox" checked={editing.enabled} onChange={field('enabled')} />
                      <span>Enabled</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="lldp-actions">
                {onApply && (
                  <button type="button" className="lldp-btn-primary" disabled={saving} onClick={() => save(true)}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Save & apply to result
                  </button>
                )}
                <button
                  type="button"
                  className={onApply ? 'lldp-btn-secondary' : 'lldp-btn-primary'}
                  disabled={saving}
                  onClick={() => save(false)}
                >
                  {!onApply && saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                  Save rule
                </button>
                <button
                  type="button"
                  className="lldp-btn-secondary"
                  onClick={() => {
                    setEditing(null);
                    setError('');
                    setSample('');
                  }}
                >
                  <X className="h-4 w-4" />
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
