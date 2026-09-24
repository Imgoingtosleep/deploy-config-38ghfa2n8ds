import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { getSupportedDeviceTypes, createPlaybook, updatePlaybook } from '../services/api';
import { DEFAULT_DRIVER, playbookSets, cleanSets } from './commandSets';
import './CommandProfileEditor.css';

// Not drivers: a device set to these is detected (or swept) before it runs a profile
const NOT_DRIVERS = new Set(['autodetect', 'unknown']);
const FALLBACK_DRIVERS = [
  { label: 'Huawei VRP', value: 'huawei' },
  { label: 'Cisco IOS / IOS-XE', value: 'cisco_ios' },
  { label: 'HP / H3C Comware', value: 'hp_comware' },
  { label: 'Raisecom ROS', value: 'raisecom_roap' },
];

const blankSet = () => ({ drivers: [], text: '', regexes: {} });

// Editor state keeps each set's commands as text; regexes are remembered per command so
// editing the text does not lose them
const toEditable = (sets) =>
  sets.map((s) => ({
    drivers: [...s.drivers],
    text: s.commands.join('\n'),
    regexes: Object.fromEntries(s.commands.map((c, i) => [c, s.regexes?.[i] || ''])),
  }));

/**
 * Create / edit a Health Check & Troubleshoot command profile: a name, then command sets -
 * tick the drivers a set is for and write its commands. Each device runs the set of its
 * driver; 'Any other driver' catches the drivers no set ticks.
 *
 * playbook: null to create, the profile to edit. onSaved(profile) after a save.
 */
export default function CommandProfileEditor({ playbook, onClose, onSaved }) {
  const [name, setName] = useState(playbook?.name || '');
  const [description, setDescription] = useState(playbook?.description || '');
  const [sets, setSets] = useState(() => {
    const existing = playbook ? playbookSets(playbook) : [];
    return existing.length ? toEditable(existing) : [blankSet()];
  });
  const [drivers, setDrivers] = useState(FALLBACK_DRIVERS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const nameRef = useRef(null);

  useEffect(() => {
    nameRef.current?.focus();
    getSupportedDeviceTypes()
      .then((data) => {
        const list = (data?.device_types || []).filter((t) => !NOT_DRIVERS.has(t.value));
        if (list.length) setDrivers(list);
      })
      .catch(() => {});
  }, []);

  // A validation message is about the form as it was: drop it once the form changes
  useEffect(() => setError(''), [name, sets]);

  const options = useMemo(() => [...drivers, { label: 'Any other driver', value: DEFAULT_DRIVER }], [drivers]);
  const labelOf = (v) => options.find((o) => o.value === v)?.label || v;
  // Which set already has a driver: a driver belongs to one set only
  const owner = useMemo(() => {
    const map = {};
    sets.forEach((s, i) => s.drivers.forEach((d) => { map[d] = i; }));
    return map;
  }, [sets]);

  const updateSet = (index, patch) => setSets((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const toggleDriver = (index, value) => {
    const s = sets[index];
    updateSet(index, { drivers: s.drivers.includes(value) ? s.drivers.filter((d) => d !== value) : [...s.drivers, value] });
  };
  const addSet = () => setSets((prev) => [...prev, blankSet()]);
  const removeSet = (index) => setSets((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));

  const commandsOf = (s) => s.text.split('\n').map((l) => l.trim()).filter(Boolean);

  const problems = [];
  if (!name.trim()) problems.push('Give the profile a name.');
  sets.forEach((s, i) => {
    const n = commandsOf(s).length;
    if (!s.drivers.length && n) problems.push(`Set ${i + 1}: tick at least one driver.`);
    if (s.drivers.length && !n) problems.push(`Set ${i + 1}: add at least one command.`);
  });
  if (!sets.some((s) => s.drivers.length && commandsOf(s).length)) problems.push('Add at least one command set.');

  const handleSave = async (e) => {
    e.preventDefault();
    if (problems.length) {
      setError(problems[0]);
      return;
    }
    const command_sets = cleanSets(
      sets.map((s) => {
        const commands = commandsOf(s);
        return { drivers: s.drivers, commands, regexes: commands.map((c) => s.regexes[c] || '') };
      })
    );
    const payload = { name: name.trim(), description: description.trim(), category: 'custom', command_sets };
    setSaving(true);
    setError('');
    try {
      const saved = playbook?.id ? await updatePlaybook(playbook.id, payload) : await createPlaybook(payload);
      onSaved?.(saved);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to save the profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cpe-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <form className="cpe-modal" onSubmit={handleSave}>
        <div className="cpe-head">
          <h3>{playbook?.id ? 'Edit command profile' : 'New command profile'}</h3>
          <button type="button" className="cpe-icon-btn" onClick={onClose} title="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="cpe-body">
          <label className="cpe-field">
            <span>Name</span>
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Daily core health"
            />
          </label>
          <label className="cpe-field">
            <span>Description (optional)</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this profile checks" />
          </label>

          <p className="cpe-hint">
            Each device runs the command set of its <b>Device Type / Driver</b>, as written. Tick several drivers to share
            one set (Huawei + HP Comware, Cisco + Raisecom, ...). <b>Any other driver</b> is used by devices whose driver
            no set ticks.
          </p>

          {sets.map((s, i) => (
            <div className="cpe-set" key={i}>
              <div className="cpe-set-head">
                <span className="cpe-set-title">
                  Command set {i + 1}
                  {s.drivers.length > 0 && <em> — {s.drivers.map(labelOf).join(', ')}</em>}
                </span>
                {sets.length > 1 && (
                  <button type="button" className="cpe-icon-btn danger" onClick={() => removeSet(i)} title="Remove this set">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="cpe-drivers">
                {options.map((o) => {
                  const other = owner[o.value] !== undefined && owner[o.value] !== i;
                  return (
                    <label
                      key={o.value}
                      className={`cpe-driver ${s.drivers.includes(o.value) ? 'on' : ''} ${other ? 'taken' : ''} ${
                        o.value === DEFAULT_DRIVER ? 'default' : ''
                      }`}
                      title={other ? `Already in command set ${owner[o.value] + 1}` : ''}
                    >
                      <input
                        type="checkbox"
                        checked={s.drivers.includes(o.value)}
                        disabled={other}
                        onChange={() => toggleDriver(i, o.value)}
                      />
                      <span>{o.label}</span>
                      {other && <small>set {owner[o.value] + 1}</small>}
                    </label>
                  );
                })}
              </div>

              <textarea
                className="cpe-commands"
                value={s.text}
                onChange={(e) => updateSet(i, { text: e.target.value })}
                rows={Math.min(10, Math.max(4, s.text.split('\n').length + 1))}
                placeholder={'One command per line, e.g.\ndisplay version\ndisplay cpu-usage'}
                spellCheck={false}
              />
              <span className="cpe-count">{commandsOf(s).length} command(s)</span>
            </div>
          ))}

          <button type="button" className="cpe-add" onClick={addSet}>
            <Plus className="h-3.5 w-3.5" />
            Add command set
          </button>

          {error && <div className="cpe-error">{error}</div>}
        </div>

        <div className="cpe-foot">
          <button type="button" className="cpe-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="cpe-btn primary" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : playbook?.id ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {playbook?.id ? 'Save changes' : 'Create profile'}
          </button>
        </div>
      </form>
    </div>
  );
}
