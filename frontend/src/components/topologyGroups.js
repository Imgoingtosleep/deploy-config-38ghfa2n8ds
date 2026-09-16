// Split one LLDP topology into pictures: devices in the same subnet share a picture,
// and devices joined by an LLDP link are merged into the same picture even when
// their subnets differ. Anything left unconnected in another subnet is its own picture.

const ipToInt = (ip) => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec((ip || '').trim());
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
};

const intToIp = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');

const maskOf = (prefix) => (prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0);

/** CIDR scan targets ("10.1.1.0/24") as { net, prefix, label } */
function parseCidrs(targets) {
  return (targets || [])
    .map((t) => /^\s*(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})\s*$/.exec(t || ''))
    .filter(Boolean)
    .map((m) => {
      const prefix = Math.min(32, Number(m[2]));
      const ip = ipToInt(m[1]);
      if (ip == null) return null;
      const net = (ip & maskOf(prefix)) >>> 0;
      return { net, prefix, label: `${intToIp(net)}/${prefix}` };
    })
    .filter(Boolean)
    .sort((a, b) => b.prefix - a.prefix);
}

/** Subnet of an IP: the most specific CIDR target containing it, otherwise its /24 */
function subnetOf(ip, cidrs) {
  const n = ipToInt(ip);
  if (n == null) return null;
  const hit = cidrs.find((c) => ((n & maskOf(c.prefix)) >>> 0) === c.net);
  if (hit) return { label: hit.label, sort: hit.net };
  const net = (n & maskOf(24)) >>> 0;
  return { label: `${intToIp(net)}/24`, sort: net };
}

/**
 * Returns [{ id, label, subnets, topology: { nodes, links }, neighbors }], largest picture first.
 * A single group is returned as-is when nothing needs splitting.
 */
export function splitTopology(topology, neighbors = [], targets = []) {
  const nodes = topology?.nodes || [];
  const links = topology?.links || [];
  if (nodes.length === 0) return [];

  const cidrs = parseCidrs(targets);
  const parent = new Map(nodes.map((n) => [n.id, n.id]));
  const find = (id) => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(id) !== root) {
      const next = parent.get(id);
      parent.set(id, root);
      id = next;
    }
    return root;
  };
  const union = (a, b) => {
    if (!parent.has(a) || !parent.has(b)) return;
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  // Same subnet -> same picture
  const subnetByNode = new Map();
  const firstInSubnet = new Map();
  nodes.forEach((n) => {
    const s = subnetOf(n.ip, cidrs);
    if (!s) return;
    subnetByNode.set(n.id, s);
    if (firstInSubnet.has(s.label)) union(n.id, firstInSubnet.get(s.label));
    else firstInSubnet.set(s.label, n.id);
  });

  // Connected by LLDP -> same picture, even across subnets
  links.forEach((l) => union(l.source, l.target));

  const groups = new Map();
  nodes.forEach((n) => {
    const root = find(n.id);
    if (!groups.has(root)) groups.set(root, { nodes: [], subnets: new Map() });
    const g = groups.get(root);
    g.nodes.push(n);
    const s = subnetByNode.get(n.id);
    if (s) g.subnets.set(s.label, s.sort);
  });

  const result = [...groups.values()].map((g) => {
    const ids = new Set(g.nodes.map((n) => n.id));
    const subnets = [...g.subnets.entries()].sort((a, b) => a[1] - b[1]).map(([label]) => label);
    return {
      subnets,
      sortKey: subnets.length ? g.subnets.get(subnets[0]) : Infinity,
      topology: { nodes: g.nodes, links: links.filter((l) => ids.has(l.source) && ids.has(l.target)) },
      neighbors: neighbors.filter((r) => ids.has((r['Local Device'] || '').trim())),
    };
  });

  result.sort((a, b) => b.topology.nodes.length - a.topology.nodes.length || a.sortKey - b.sortKey);
  return result.map((g, i) => {
    const label = g.subnets.length
      ? g.subnets.length > 3
        ? `${g.subnets.slice(0, 3).join(', ')} +${g.subnets.length - 3}`
        : g.subnets.join(', ')
      : 'No IP';
    return { id: `${i}:${g.subnets.join(',')}`, label, subnets: g.subnets, topology: g.topology, neighbors: g.neighbors };
  });
}
