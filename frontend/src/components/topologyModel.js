// Editable topology document: pure helpers used by the topology editor.
// doc = { nodes, links, flows, zones, notes }; node.id is always the hostname (same as the backend).

export const ROLES = ['router', 'switch', 'firewall', 'server', 'cloud', 'pc', 'wireless', 'unknown'];

export const FLOW_COLORS = ['#f59e0b', '#22c55e', '#ef4444', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6'];
export const ZONE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9', '#a855f7', '#64748b'];

let seq = 0;
export const newId = (prefix) => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;

export const emptyDoc = () => ({ nodes: [], links: [], flows: [], zones: [], notes: [] });

/** Report data -> editable document (annotations are optional) */
export function docFromReport(topology, annotations) {
  return {
    nodes: (topology?.nodes || []).map((n) => ({ ...n })),
    links: (topology?.links || []).map((l) => ({ ...l })),
    flows: (annotations?.flows || []).map((f) => ({ ...f, hops: [...(f.hops || [])] })),
    zones: (annotations?.zones || []).map((z) => ({ ...z })),
    notes: (annotations?.notes || []).map((t) => ({ ...t })),
  };
}

export function uniqueHostname(doc, base = 'NEW-DEVICE') {
  const taken = new Set(doc.nodes.map((n) => n.id));
  for (let i = 1; ; i += 1) {
    const name = `${base}-${i}`;
    if (!taken.has(name)) return name;
  }
}

function withDegree(doc) {
  const degree = {};
  doc.links.forEach((l) => {
    degree[l.source] = (degree[l.source] || 0) + 1;
    degree[l.target] = (degree[l.target] || 0) + 1;
  });
  return { ...doc, nodes: doc.nodes.map((n) => ({ ...n, degree: degree[n.id] || 0 })) };
}

export function addNode(doc, fields) {
  const node = {
    id: fields.hostname,
    hostname: fields.hostname,
    ip: fields.ip || '',
    model: fields.model || '',
    role: fields.role || 'unknown',
    discovered: false,
    manual: true,
    degree: 0,
  };
  return { ...doc, nodes: [...doc.nodes, node] };
}

/** Update fields; a hostname change renames every reference (links, flows, zone / note anchors) */
export function updateNode(doc, id, fields) {
  const newName = (fields.hostname || id).trim();
  const rename = (v) => (v === id ? newName : v);
  return {
    ...doc,
    nodes: doc.nodes.map((n) => (n.id === id ? { ...n, ...fields, id: newName, hostname: newName } : n)),
    links: doc.links.map((l) => ({ ...l, source: rename(l.source), target: rename(l.target) })),
    flows: doc.flows.map((f) => ({ ...f, hops: f.hops.map(rename) })),
    zones: doc.zones.map((z) => ({ ...z, anchor: rename(z.anchor) })),
    notes: doc.notes.map((t) => ({ ...t, anchor: rename(t.anchor) })),
  };
}

export function deleteNode(doc, id) {
  return withDegree({
    ...doc,
    nodes: doc.nodes.filter((n) => n.id !== id),
    links: doc.links.filter((l) => l.source !== id && l.target !== id),
    flows: doc.flows
      .map((f) => ({ ...f, hops: f.hops.filter((h) => h !== id).filter((h, i, arr) => i === 0 || arr[i - 1] !== h) }))
      .filter((f) => f.hops.length >= 2),
  });
}

/** Connections of one node, always seen from that node's side */
export function connectionsOf(doc, id) {
  return doc.links
    .map((l, index) => {
      if (l.source === id) return { index, local: l.source_port || '', peer: l.target, remote: l.target_port || '', link: l };
      if (l.target === id) return { index, local: l.target_port || '', peer: l.source, remote: l.source_port || '', link: l };
      return null;
    })
    .filter(Boolean);
}

/**
 * Replace every link of `id` with `rows` ({ local, peer, remote, index? }).
 * Rows that came from an existing link keep its LLDP 'confirmed' flag when nothing changed.
 */
export function setConnections(doc, id, rows) {
  const kept = doc.links.filter((l) => l.source !== id && l.target !== id);
  const added = rows
    .filter((r) => r.peer && r.peer !== id)
    .map((r) => {
      const old = Number.isInteger(r.index) ? doc.links[r.index] : null;
      const oldView = old && (old.source === id
        ? { local: old.source_port || '', peer: old.target, remote: old.target_port || '' }
        : { local: old.target_port || '', peer: old.source, remote: old.source_port || '' });
      const unchanged = oldView && oldView.local === r.local.trim() && oldView.peer === r.peer && oldView.remote === r.remote.trim();
      return {
        source: id,
        target: r.peer,
        source_port: r.local.trim(),
        target_port: r.remote.trim(),
        confirmed: unchanged ? Boolean(old.confirmed) : false,
        manual: unchanged ? Boolean(old.manual) : true,
      };
    });
  return withDegree({ ...doc, links: [...kept, ...added] });
}

export function deleteLinksBetween(doc, a, b) {
  return withDegree({
    ...doc,
    links: doc.links.filter((l) => !((l.source === a && l.target === b) || (l.source === b && l.target === a))),
  });
}

/** Interfaces already used on a node: { port: 'peer port' } */
export function usedPorts(doc, id) {
  const used = {};
  connectionsOf(doc, id).forEach((c) => {
    if (c.local) used[c.local] = `${c.peer} ${c.remote}`.trim();
  });
  return used;
}

const vendorOf = (node) => {
  const m = `${node?.model || ''}`.toUpperCase();
  if (/^(S\d|CE\d|AR\d|NE\d|USG|AIRENGINE)/.test(m)) return 'huawei';
  if (/^(WS-C|C\d|N\dK|ISR|ASR|CSR|CISCO|IE-)/.test(m)) return 'cisco';
  return '';
};

/**
 * Interface suggestions for a node: ports it already uses, the next free port of each
 * naming pattern it uses (GE0/0/7 -> GE0/0/8), and vendor defaults when it has none.
 */
export function suggestPorts(doc, id) {
  const node = doc.nodes.find((n) => n.id === id);
  const used = usedPorts(doc, id);
  const names = new Set(Object.keys(used));
  const next = [];
  const lastByPrefix = {};
  Object.keys(used).forEach((p) => {
    const m = /^(.*?)(\d+)$/.exec(p);
    if (m) lastByPrefix[m[1]] = Math.max(lastByPrefix[m[1]] || 0, Number(m[2]));
  });
  Object.entries(lastByPrefix).forEach(([prefix, n]) => {
    for (let i = n + 1; next.length < 12 && i <= n + 4; i += 1) if (!names.has(`${prefix}${i}`)) next.push(`${prefix}${i}`);
  });
  if (next.length === 0) {
    const vendor = vendorOf(node);
    const role = node?.role;
    let base;
    if (vendor === 'huawei') base = role === 'router' ? ['GE0/0/0', 'GE0/0/1', 'GE0/0/2', 'GE0/0/3'] : [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `GE0/0/${i}`);
    else if (vendor === 'cisco') base = role === 'router' ? ['Gi0/0/0', 'Gi0/0/1', 'Gi0/0/2'] : [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `Gi1/0/${i}`);
    else if (role === 'server' || role === 'pc') base = ['eth0', 'eth1', 'NIC1', 'NIC2'];
    else if (role === 'firewall') base = ['port1', 'port2', 'port3', 'wan1', 'lan1'];
    else base = ['GE0/0/1', 'GE0/0/2', 'Gi0/1', 'Gi0/2', 'eth0'];
    base.forEach((p) => !names.has(p) && next.push(p));
  }
  return { used, free: next };
}

// ---------------------------------------------------------------- flows / zones / notes

export const upsertById = (list, item) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];

export const removeById = (list, id) => list.filter((x) => x.id !== id);

// ---------------------------------------------------------------- report sync (same rules as the backend import)

export function neighborsFromDoc(doc) {
  const byId = Object.fromEntries(doc.nodes.map((n) => [n.id, n]));
  const row = (local, lp, remote, rp) => ({
    'Local Device': local.hostname,
    'Local Model': local.model || '',
    'Local IP': local.ip || '',
    'Local Port': lp || '',
    'Remote Device': remote.hostname,
    'Remote Model': remote.model || '',
    'Remote Port': rp || '',
    'Remote IP': remote.ip || '',
  });
  const rows = [];
  doc.links.forEach((l) => {
    const s = byId[l.source];
    const t = byId[l.target];
    if (!s || !t) return;
    rows.push(row(s, l.source_port, t, l.target_port));
    if (l.confirmed) rows.push(row(t, l.target_port, s, l.source_port));
  });
  return rows;
}

export function hostsFromDoc(doc, neighbors) {
  const counts = {};
  neighbors.forEach((n) => {
    counts[n['Local Device']] = (counts[n['Local Device']] || 0) + 1;
  });
  return doc.nodes.map((n) => ({
    hostname: n.hostname,
    ip: n.ip || '',
    model: n.model || '',
    depth: 0,
    status: n.manual ? 'MANUAL' : 'IMPORTED',
    success: true,
    error: null,
    detail: n.manual ? 'Added in the topology editor' : n.discovered ? 'SSH collected' : 'Seen via LLDP only',
    neighbors_found: counts[n.hostname] || 0,
    neighbors: [],
    log: '',
    raw_output: '',
    execution_time_seconds: 0,
  }));
}

// ---------------------------------------------------------------- merge an imported file into the open diagram

/** Same rule as the backend intf_key: GE0/0/1 == GigabitEthernet0/0/1 */
export function intfKey(name) {
  const s = String(name || '').replace(/\s+/g, '');
  const m = /^(\d*[A-Za-z])[A-Za-z-]*?(\d+(?:\/\d+)*(?:[:.]\d+)?)$/.exec(s);
  if (!m) return s.toLowerCase();
  return `${m[1].toUpperCase()}${s.toLowerCase().includes('trunk') ? 'TRUNK' : ''}${m[2]}`;
}

const SEP = '|~|';
const linkKey = (l) =>
  [`${l.source}${SEP}${intfKey(l.source_port)}`, `${l.target}${SEP}${intfKey(l.target_port)}`].sort().join(SEP + SEP);

/**
 * Merge an imported report ({ topology, annotations }) into doc.
 * - A device with the same hostname is the same device: its empty IP / model / type are filled in.
 * - Duplicate links (same ends and ports, either direction) are merged.
 * - `importedPositions` are the imported devices' positions; `offset` shifts them, zones and notes
 *   so the file lands beside the existing drawing.
 */
export function mergeImported(doc, imported, importedPositions, offset = { x: 0, y: 0 }) {
  const shift = (p) => ({ x: p.x + offset.x, y: p.y + offset.y });
  const nodes = doc.nodes.map((n) => ({ ...n }));
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const positions = {};
  let added = 0;
  let merged = 0;

  (imported.topology?.nodes || []).forEach((n) => {
    if (index.has(n.id)) {
      const i = index.get(n.id);
      const cur = nodes[i];
      nodes[i] = {
        ...cur,
        ip: cur.ip || n.ip || '',
        model: cur.model || n.model || '',
        role: cur.role && cur.role !== 'unknown' ? cur.role : n.role || 'unknown',
        discovered: cur.discovered || Boolean(n.discovered),
      };
      merged += 1;
      return;
    }
    const { x, y, ...rest } = n;
    index.set(n.id, nodes.length);
    nodes.push({ ...rest, ip: n.ip || '', model: n.model || '', role: n.role || 'unknown' });
    if (importedPositions[n.id]) positions[n.id] = shift(importedPositions[n.id]);
    added += 1;
  });

  const links = doc.links.map((l) => ({ ...l }));
  const seen = new Map(links.map((l, i) => [linkKey(l), i]));
  let newLinks = 0;
  (imported.topology?.links || []).forEach((l) => {
    const key = linkKey(l);
    if (seen.has(key)) {
      const cur = links[seen.get(key)];
      // Seen from the other side in the file -> confirmed from both sides now
      if (l.confirmed || cur.source !== l.source) cur.confirmed = true;
      return;
    }
    seen.set(key, links.length);
    links.push({ ...l, confirmed: Boolean(l.confirmed), manual: Boolean(l.manual) });
    newLinks += 1;
  });

  // Flows / zones / notes keep their id through every export, so an id already here is the same item
  const ann = imported.annotations || {};
  const addNew = (list, items, prefix, map) => {
    const ids = new Set(list.map((x) => x.id));
    const fresh = (items || []).filter((x) => !x.id || !ids.has(x.id)).map((x) => ({ ...map(x), id: x.id || newId(prefix) }));
    return [list.concat(fresh), fresh.length];
  };
  const [flows, flowCount] = addNew(doc.flows, ann.flows, 'f', (f) => ({ ...f, hops: [...f.hops] }));
  const [zones, zoneCount] = addNew(doc.zones, ann.zones, 'z', (z) => ({ ...z, ...shift(z) }));
  const [notes, noteCount] = addNew(doc.notes, ann.notes, 't', (t) => ({ ...t, ...shift(t) }));

  return {
    doc: withDegree({ nodes, links, flows, zones, notes }),
    positions,
    summary: {
      added,
      merged,
      links: newLinks,
      flows: flowCount,
      zones: zoneCount,
      notes: noteCount,
    },
  };
}
