import React, { useMemo, useState } from 'react';
import { X, Check, Plus, Trash2, Cable, Waypoints, Square, StickyNote, ArrowRight, ArrowLeftRight } from 'lucide-react';
import { ROLE_STYLE } from './topologyIcons';
import { ROLES, FLOW_COLORS, ZONE_COLORS, connectionsOf, suggestPorts } from './topologyModel';

const IPV4_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

function Modal({ title, icon: Icon, wide, onClose, children }) {
  return (
    <div className="lldp-modal-backdrop" onPointerDown={onClose}>
      <div
        className={`lldp-modal${wide ? ' lldp-modal-wide' : ''}`}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          e.stopPropagation();
        }}
      >
        <div className="lldp-modal-head">
          <h3>
            <Icon className="h-4 w-4" />
            {title}
          </h3>
          <button type="button" className="lldp-modal-close" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="lldp-modal-body">{children}</div>
      </div>
    </div>
  );
}

function ColorPicker({ colors, value, onChange }) {
  return (
    <div className="topo-colors">
      {colors.map((c) => (
        <button
          type="button"
          key={c}
          className={`topo-color${c === value ? ' active' : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
          aria-label={c}
        />
      ))}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} title="Custom color" />
    </div>
  );
}

function Errors({ items }) {
  if (!items.length) return null;
  return (
    <div className="lldp-error topo-errors">
      <ul>
        {items.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </div>
  );
}

const linkStatus = (row) => {
  if (!row.link) return { text: 'New', tone: 'new' };
  if (row.link.manual) return { text: 'Manual', tone: 'manual' };
  return row.link.confirmed ? { text: 'LLDP both sides', tone: 'ok' } : { text: 'LLDP one side', tone: 'warn' };
};

/**
 * Device properties + its interface connections.
 * nodeId null = new device (initial carries the proposed hostname).
 * presetPeer adds an empty connection row to that device (from the Connect tool).
 */
export function NodeDialog({ doc, nodeId, initial, presetPeer, onSave, onDelete, onClose }) {
  const node = nodeId ? doc.nodes.find((n) => n.id === nodeId) : null;
  const [fields, setFields] = useState(() => ({
    hostname: node?.hostname || initial?.hostname || '',
    ip: node?.ip || '',
    model: node?.model || '',
    role: node?.role || initial?.role || 'switch',
  }));
  const [rows, setRows] = useState(() => {
    const existing = nodeId
      ? connectionsOf(doc, nodeId).map((c, i) => ({ key: `e${i}`, index: c.index, local: c.local, peer: c.peer, remote: c.remote, link: c.link }))
      : [];
    return presetPeer ? [...existing, { key: 'preset', local: '', peer: presetPeer, remote: '' }] : existing;
  });
  const [tried, setTried] = useState(false);

  const others = useMemo(
    () => doc.nodes.filter((n) => n.id !== nodeId).sort((a, b) => a.hostname.localeCompare(b.hostname)),
    [doc, nodeId]
  );
  const localSuggest = useMemo(() => (nodeId ? suggestPorts(doc, nodeId) : { used: {}, free: [] }), [doc, nodeId]);
  const peerSuggest = useMemo(() => {
    const out = {};
    rows.forEach((r) => {
      if (r.peer && !out[r.peer]) out[r.peer] = suggestPorts(doc, r.peer);
    });
    return out;
  }, [doc, rows]);

  const setRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const errors = [];
  const warnings = [];
  const name = fields.hostname.trim();
  if (!name) errors.push('Hostname is required.');
  else if (others.some((n) => n.id === name)) errors.push(`Hostname "${name}" is already used by another device.`);
  if (fields.ip.trim() && !IPV4_RE.test(fields.ip.trim())) errors.push(`IP "${fields.ip}" is not a valid IPv4 address.`);
  const seenLocal = {};
  rows.forEach((r, i) => {
    if (!r.peer) errors.push(`Connection ${i + 1}: choose the device it connects to.`);
    const lp = r.local.trim();
    if (lp) {
      if (seenLocal[lp]) errors.push(`Interface ${lp} is used by more than one connection.`);
      seenLocal[lp] = true;
    }
    if (r.peer && r.remote.trim()) {
      // Remote port already cabled to a third device?
      const clash = connectionsOf(doc, r.peer).find(
        (c) => c.local === r.remote.trim() && c.peer !== nodeId && c.peer !== name
      );
      if (clash) warnings.push(`${r.peer} ${r.remote.trim()} is already connected to ${clash.peer} ${clash.remote}.`);
    }
    if (!lp || !r.remote.trim()) warnings.push(`Connection ${i + 1}: interface name is empty (the link is kept without a port).`);
  });

  const submit = (e) => {
    e.preventDefault();
    setTried(true);
    if (errors.length) return;
    onSave({
      fields: { hostname: name, ip: fields.ip.trim(), model: fields.model.trim(), role: fields.role },
      rows: rows.map(({ index, local, peer, remote }) => ({ index, local, peer, remote })),
    });
  };

  return (
    <Modal title={node ? `Device: ${node.hostname}` : 'New device'} icon={Cable} wide onClose={onClose}>
      <form className="lldp-cmd-form" onSubmit={submit}>
        <div className="topo-form-grid">
          <label className="lldp-field">
            <span>Hostname</span>
            <input autoFocus={!presetPeer} value={fields.hostname} onChange={(e) => setFields({ ...fields, hostname: e.target.value })} />
          </label>
          <label className="lldp-field">
            <span>Management IP</span>
            <input value={fields.ip} placeholder="e.g. 10.0.0.1" onChange={(e) => setFields({ ...fields, ip: e.target.value })} />
          </label>
          <label className="lldp-field">
            <span>Model</span>
            <input value={fields.model} placeholder="e.g. S5720-28X-SI-AC" onChange={(e) => setFields({ ...fields, model: e.target.value })} />
          </label>
          <label className="lldp-field">
            <span>Device type</span>
            <select value={fields.role} onChange={(e) => setFields({ ...fields, role: e.target.value })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_STYLE[r].label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="topo-conn-head">
          <strong>Interface connections ({rows.length})</strong>
          <span className="lldp-hint">Pick the local interface, the device it connects to and that device's interface.</span>
        </div>

        <div className="topo-conn-table">
          {rows.length === 0 && <div className="lldp-hint topo-conn-empty">No connections yet.</div>}
          {rows.map((r, i) => {
            const status = linkStatus(r);
            const peerPorts = peerSuggest[r.peer] || { used: {}, free: [] };
            return (
              <div className="topo-conn-row" key={r.key}>
                <span className="topo-conn-no">{i + 1}</span>
                <label className="lldp-field">
                  <span>Local interface</span>
                  <input
                    className="lldp-cmd-input"
                    list={`topo-local-${r.key}`}
                    value={r.local}
                    placeholder="GE0/0/1"
                    onChange={(e) => setRow(r.key, { local: e.target.value })}
                  />
                  <datalist id={`topo-local-${r.key}`}>
                    {localSuggest.free.map((p) => (
                      <option key={p} value={p}>free</option>
                    ))}
                    {Object.entries(localSuggest.used).map(([p, to]) => (
                      <option key={p} value={p}>{`in use -> ${to}`}</option>
                    ))}
                  </datalist>
                </label>
                <ArrowLeftRight className="topo-conn-arrow h-4 w-4" />
                <label className="lldp-field">
                  <span>Remote device</span>
                  <select autoFocus={r.key === 'preset' && !r.peer} value={r.peer} onChange={(e) => setRow(r.key, { peer: e.target.value })}>
                    <option value="">— choose —</option>
                    {others.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.hostname}
                        {n.ip ? ` (${n.ip})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="lldp-field">
                  <span>Remote interface</span>
                  <input
                    className="lldp-cmd-input"
                    autoFocus={r.key === 'preset' && Boolean(r.peer)}
                    list={`topo-remote-${r.key}`}
                    value={r.remote}
                    placeholder="Gi0/1"
                    disabled={!r.peer}
                    onChange={(e) => setRow(r.key, { remote: e.target.value })}
                  />
                  <datalist id={`topo-remote-${r.key}`}>
                    {peerPorts.free.map((p) => (
                      <option key={p} value={p}>free</option>
                    ))}
                    {Object.entries(peerPorts.used).map(([p, to]) => (
                      <option key={p} value={p}>{`in use -> ${to}`}</option>
                    ))}
                  </datalist>
                </label>
                <span className={`topo-conn-status ${status.tone}`}>{status.text}</span>
                <button
                  type="button"
                  className="lldp-btn-danger lldp-btn-mini topo-conn-del"
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  title="Remove this connection"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className="lldp-btn-secondary lldp-btn-mini"
          onClick={() =>
            setRows((rs) => [
              ...rs,
              { key: `n${Date.now()}`, local: localSuggest.free.find((p) => !rs.some((r) => r.local.trim() === p)) || '', peer: '', remote: '' },
            ])
          }
          disabled={others.length === 0}
        >
          <Plus className="h-3.5 w-3.5" />
          Add connection
        </button>

        {tried && <Errors items={errors} />}
        {warnings.length > 0 && (
          <ul className="topo-warnings">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}

        <div className="lldp-actions">
          <button type="submit" className="lldp-btn-primary">
            <Check className="h-4 w-4" />
            {node ? 'Save' : 'Add device'}
          </button>
          <button type="button" className="lldp-btn-secondary" onClick={onClose}>
            <X className="h-4 w-4" />
            Cancel
          </button>
          {node && onDelete && (
            <button type="button" className="lldp-btn-danger topo-push-right" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
              Delete device
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

/** Traffic flow: an ordered path of devices with a color, direction and label */
export function FlowDialog({ doc, flow, onSave, onDelete, onClose }) {
  const [draft, setDraft] = useState(() => ({ ...flow, hops: [...flow.hops] }));
  const byId = Object.fromEntries(doc.nodes.map((n) => [n.id, n]));
  const errors = [];
  if (!draft.name.trim()) errors.push('Flow name is required.');
  if (draft.hops.length < 2) errors.push('A flow needs at least 2 devices.');
  const [tried, setTried] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    setTried(true);
    if (!errors.length) onSave({ ...draft, name: draft.name.trim(), label: draft.label.trim() });
  };

  return (
    <Modal title={flow.isNew ? 'New traffic flow' : `Traffic flow: ${flow.name}`} icon={Waypoints} onClose={onClose}>
      <form className="lldp-cmd-form" onSubmit={submit}>
        <div className="topo-form-grid">
          <label className="lldp-field">
            <span>Name</span>
            <input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Internet, VoIP, Backup" />
          </label>
          <label className="lldp-field">
            <span>Label (shown on the path)</span>
            <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. 500 Mbps, VLAN 20, TCP/443" />
          </label>
        </div>
        <div className="lldp-field">
          <span>Color</span>
          <ColorPicker colors={FLOW_COLORS} value={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
        </div>
        <div className="lldp-field">
          <span>Direction</span>
          <div className="lldp-tabs topo-inline-tabs">
            {[
              ['forward', 'One way', ArrowRight],
              ['both', 'Both ways', ArrowLeftRight],
            ].map(([value, label, Icon]) => (
              <button type="button" key={value} className={draft.direction === value ? 'active' : ''} onClick={() => setDraft({ ...draft, direction: value })}>
                <Icon className="h-3.5 w-3.5" style={{ display: 'inline', marginRight: 4 }} />
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="lldp-toggle">
          <input type="checkbox" checked={draft.animated !== false} onChange={(e) => setDraft({ ...draft, animated: e.target.checked })} />
          <span>Animate the flow on screen</span>
        </label>
        <div className="lldp-field">
          <span>Path ({draft.hops.length} devices)</span>
          <div className="topo-path">
            {draft.hops.map((h, i) => (
              <span key={`${h}-${i}`} className="topo-path-hop">
                {i > 0 && <ArrowRight className="h-3 w-3" />}
                <code>{byId[h]?.hostname || h}</code>
                <button
                  type="button"
                  title="Remove from the path"
                  onClick={() => setDraft({ ...draft, hops: draft.hops.filter((_, j) => j !== i) })}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <span className="lldp-hint">To change the path, delete this flow and draw it again with the Traffic flow tool.</span>
        </div>
        {tried && <Errors items={errors} />}
        <div className="lldp-actions">
          <button type="submit" className="lldp-btn-primary">
            <Check className="h-4 w-4" />
            Save
          </button>
          <button type="button" className="lldp-btn-secondary" onClick={onClose}>
            <X className="h-4 w-4" />
            Cancel
          </button>
          {!flow.isNew && (
            <button type="button" className="lldp-btn-danger topo-push-right" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
              Delete flow
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

/** Zone (area box) or note (free text) */
export function ShapeDialog({ kind, item, onSave, onDelete, onClose }) {
  const [draft, setDraft] = useState(() => ({ ...item }));
  const isZone = kind === 'zone';
  const submit = (e) => {
    e.preventDefault();
    if (!draft.text.trim()) return;
    onSave({ ...draft, text: draft.text.trim() });
  };
  return (
    <Modal
      title={item.isNew ? (isZone ? 'New zone' : 'New note') : isZone ? `Zone: ${item.text}` : 'Note'}
      icon={isZone ? Square : StickyNote}
      onClose={onClose}
    >
      <form className="lldp-cmd-form" onSubmit={submit}>
        <label className="lldp-field">
          <span>{isZone ? 'Zone name' : 'Text'}</span>
          {isZone ? (
            <input autoFocus value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} placeholder="e.g. DMZ, Server Farm, Site A" />
          ) : (
            <textarea autoFocus rows={3} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
          )}
        </label>
        <div className="lldp-field">
          <span>Color</span>
          <ColorPicker colors={isZone ? ZONE_COLORS : ['#e2e8f0', ...FLOW_COLORS]} value={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
        </div>
        {!isZone && (
          <label className="lldp-field">
            <span>Font size</span>
            <select value={draft.size} onChange={(e) => setDraft({ ...draft, size: Number(e.target.value) })}>
              {[11, 13, 16, 20, 28].map((s) => (
                <option key={s} value={s}>
                  {s}px
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="lldp-actions">
          <button type="submit" className="lldp-btn-primary" disabled={!draft.text.trim()}>
            <Check className="h-4 w-4" />
            Save
          </button>
          <button type="button" className="lldp-btn-secondary" onClick={onClose}>
            <X className="h-4 w-4" />
            Cancel
          </button>
          {!item.isNew && (
            <button type="button" className="lldp-btn-danger topo-push-right" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
