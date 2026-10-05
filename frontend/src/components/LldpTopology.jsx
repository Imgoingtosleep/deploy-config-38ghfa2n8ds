import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Maximize2,
  RefreshCw,
  Download,
  Image as ImageIcon,
  FileCode,
  Loader2,
  Pencil,
  MousePointer2,
  PlusSquare,
  Cable,
  Waypoints,
  Square,
  Type,
  Eraser,
  Undo2,
  Redo2,
  Grid3x3,
  Check,
  X,
  Upload,
  Search,
  ZoomIn,
  ZoomOut,
  Copy,
  CopyPlus,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  LayoutGrid,
  Eye,
  EyeOff,
  Expand,
  Shrink,
} from 'lucide-react';
import { splitTopology } from './topologyGroups';
import { groupLinks, computeForceLayout, computeHierarchicalLayout, FORCE_MAX_NODES } from './topologyLayout';
import {
  boundsOf,
  EXPORT_PAD,
  downloadBlob,
  prepareSvgClone,
  serializeSvg,
  exportPng,
  buildDrawioXml,
  buildPayload,
  addSvgMetadata,
} from './topologyExport';
import { ROLE_STYLE, NodeIcon } from './topologyIcons';
import {
  FLOW_COLORS,
  ZONE_COLORS,
  docFromReport,
  uniqueHostname,
  addNode,
  updateNode,
  deleteNode,
  setConnections,
  addLinks,
  deleteLinksBetween,
  upsertById,
  removeById,
  newId,
  mergeImported,
} from './topologyModel';
import { NodeDialog, FlowDialog, ShapeDialog } from './TopologyDialogs';

const HEIGHT = 640;
const NONE = [];
const GRID = 20;
const HIT_RADIUS = 36;
const DOUBLE_CLICK_MS = 350;
const HISTORY_LIMIT = 100;
const MANUAL_LINK = '#2dd4bf';

const TOOLS = [
  { id: 'select', key: 'v', icon: MousePointer2, label: 'Select / move', hint: 'Drag to move, double-click to edit.' },
  { id: 'device', key: 'n', icon: PlusSquare, label: 'Add device', hint: 'Click an empty spot on the canvas to add a device.' },
  { id: 'connect', key: 'c', icon: Cable, label: 'Connect', hint: 'Drag from one device to another, then choose which interfaces are connected.' },
  { id: 'flow', key: 't', icon: Waypoints, label: 'Traffic flow', hint: 'Click devices in the order the traffic passes. Enter or double-click the last device to finish, Backspace removes the last hop.' },
  { id: 'zone', key: 'z', icon: Square, label: 'Zone', hint: 'Drag a box around an area (site, DMZ, VLAN, rack).' },
  { id: 'note', key: 'a', icon: Type, label: 'Note', hint: 'Click where the text should go.' },
  { id: 'delete', key: 'x', icon: Eraser, label: 'Delete', hint: 'Click a device, link, flow, zone or note to delete it (Ctrl+Z to undo).' },
];

// Dark outline behind text keeps labels readable where links pass underneath
const HALO = { stroke: '#020617', strokeWidth: 3, strokeLinejoin: 'round', paintOrder: 'stroke' };

const shortList = (items) => (items.length > 2 ? `${items.slice(0, 2).join(', ')} +${items.length - 2}` : items.join(', '));
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const round1 = (v) => Math.round(v * 10) / 10;

function positionsFrom(topology) {
  const pos = {};
  (topology?.nodes || []).forEach((n) => {
    if (Number.isFinite(n.x) && Number.isFinite(n.y)) pos[n.id] = { x: n.x, y: n.y };
  });
  return pos;
}

const hasSavedLayout = (topology) => {
  const nodes = topology?.nodes || [];
  return nodes.length > 0 && nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y));
};

function noteBox(note) {
  const lines = String(note.text || '').split('\n');
  const size = note.size || 13;
  return { w: Math.max(...lines.map((l) => l.length)) * size * 0.6, h: lines.length * size * 1.3 };
}

function fitView(extent, width, height = HEIGHT) {
  const b = boundsOf(extent);
  const w = b.maxX - b.minX + EXPORT_PAD.x * 2;
  const h = b.maxY - b.minY + EXPORT_PAD.top + EXPORT_PAD.bottom;
  const scale = Math.min(width / w, height / h, 1.5);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY - EXPORT_PAD.top + b.maxY + EXPORT_PAD.bottom) / 2;
  return { scale, x: width / 2 - cx * scale, y: height / 2 - cy * scale };
}

/** Flow segments between consecutive hops, shifted sideways so parallel flows stay visible */
function flowSegments(flows, positions, visible) {
  const usage = {};
  flows.forEach((f) =>
    f.hops.slice(1).forEach((h, i) => {
      const key = [f.hops[i], h].sort().join('\u0000');
      (usage[key] = usage[key] || []).includes(f.id) || usage[key].push(f.id);
    })
  );
  return flows.map((f) => {
    const segs = [];
    f.hops.slice(1).forEach((h, i) => {
      const from = f.hops[i];
      const a = positions[from];
      const b = positions[h];
      if (!a || !b || !visible(from) || !visible(h)) return;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1) return;
      const key = [from, h].sort().join('\u0000');
      const users = usage[key];
      // Normal of the sorted pair, so both directions of one link shift the same way
      const [p, q] = from < h ? [a, b] : [b, a];
      const nx = -(q.y - p.y) / len;
      const ny = (q.x - p.x) / len;
      const off = (users.indexOf(f.id) - (users.length - 1) / 2) * 8 + (users.length === 1 ? 6 : 0);
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      const trim = Math.min(26, len / 3);
      segs.push({
        x1: a.x + nx * off + ux * trim,
        y1: a.y + ny * off + uy * trim,
        x2: b.x + nx * off - ux * trim,
        y2: b.y + ny * off - uy * trim,
        ux,
        uy,
        nx,
        ny,
      });
    });
    return { flow: f, segs };
  });
}

function Arrow({ x, y, ux, uy, color }) {
  const s = 7;
  const px = -uy;
  const py = ux;
  return (
    <polygon
      points={`${x + ux * s},${y + uy * s} ${x - ux * s + px * s * 0.75},${y - uy * s + py * s * 0.75} ${x - ux * s - px * s * 0.75},${y - uy * s - py * s * 0.75}`}
      fill={color}
      stroke="#020617"
      strokeWidth={1}
    />
  );
}

export default function LldpTopology({
  topology: fullTopology,
  annotations,
  neighbors: allNeighbors = NONE,
  targets = NONE,
  onChange,
  onImportFile,
  startEditing = false,
}) {
  // ------------------------------------------------------------ document + history
  const [doc, setDoc] = useState(() => docFromReport(fullTopology, annotations));
  const [positions, setPositions] = useState(() => positionsFrom(fullTopology));
  const [history, setHistory] = useState({ past: [], future: [] });
  const [reinit, setReinit] = useState(0);
  const lastPropRef = useRef(fullTopology);
  const fileLayoutRef = useRef(positionsFrom(fullTopology));

  const [layoutMode, setLayoutMode] = useState(() => (hasSavedLayout(fullTopology) ? 'file' : 'hierarchical'));
  const [hasFileLayout, setHasFileLayout] = useState(() => hasSavedLayout(fullTopology));

  const [anchorId, setAnchorId] = useState(null);
  const [pinned, setPinned] = useState([]);

  const [editing, setEditing] = useState(startEditing);
  const [tool, setTool] = useState('select');
  const [snapOn, setSnapOn] = useState(true);
  const [flowDraft, setFlowDraft] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [dialog, setDialog] = useState(null);

  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const lastClickRef = useRef(null);
  const [width, setWidth] = useState(1000);
  // Full screen: the editor covers the whole window and the canvas takes every pixel left
  const rootRef = useRef(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [canvasH, setCanvasH] = useState(HEIGHT);
  const height = fullscreen ? canvasH : HEIGHT;
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [selected, setSelected] = useState(null);
  // Every device selected together; `selected` is the single one the panel describes
  const [multi, setMulti] = useState(NONE);
  const [marquee, setMarquee] = useState(null);
  // Device types hidden from this picture (drawing and export), never from the document
  const [hiddenRoles, setHiddenRoles] = useState(NONE);
  const [guides, setGuides] = useState(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [focusId, setFocusId] = useState(null);
  const clipboardRef = useRef({ items: [], links: [] });
  const searchRef = useRef(null);
  const [selItem, setSelItem] = useState(null);
  const [showPorts, setShowPorts] = useState(false);
  const [showFlows, setShowFlows] = useState(true);
  const [drawioPorts, setDrawioPorts] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState(null);
  const [importingFile, setImportingFile] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const importInputRef = useRef(null);
  const fitAfterEditRef = useRef(false);

  // A new report (scan / import) replaces the document; our own edits coming back as props do not
  useEffect(() => {
    if (fullTopology === lastPropRef.current) return;
    lastPropRef.current = fullTopology;
    const pos = positionsFrom(fullTopology);
    setDoc(docFromReport(fullTopology, annotations));
    setPositions(pos);
    fileLayoutRef.current = pos;
    setHasFileLayout(hasSavedLayout(fullTopology));
    setLayoutMode(hasSavedLayout(fullTopology) ? 'file' : 'hierarchical');
    setHistory({ past: [], future: [] });
    setAnchorId(null);
    setPinned([]);
    setSelected(null);
    setMulti(NONE);
    setSelItem(null);
    setFlowDraft(null);
    setReinit((r) => r + 1);
  }, [fullTopology]); // eslint-disable-line react-hooks/exhaustive-deps

  const emit = (nextDoc, nextPos, structural) => {
    if (!onChange) return;
    const topology = {
      nodes: nextDoc.nodes.map((n) => {
        const p = nextPos[n.id];
        return p ? { ...n, x: round1(p.x), y: round1(p.y) } : n;
      }),
      links: nextDoc.links,
    };
    lastPropRef.current = topology;
    onChange({ topology, annotations: { flows: nextDoc.flows, zones: nextDoc.zones, notes: nextDoc.notes }, structural });
  };

  /** Apply an edit as one undo step; `base` is the state before a live drag */
  const commit = (nextDoc, nextPos = positions, structural = true, base = { doc, positions }) => {
    setHistory((h) => ({ past: [...h.past.slice(-HISTORY_LIMIT + 1), base], future: [] }));
    setDoc(nextDoc);
    setPositions(nextPos);
    emit(nextDoc, nextPos, structural);
  };

  const undo = () => {
    const prev = history.past[history.past.length - 1];
    if (!prev) return;
    setHistory({ past: history.past.slice(0, -1), future: [{ doc, positions }, ...history.future] });
    setDoc(prev.doc);
    setPositions(prev.positions);
    emit(prev.doc, prev.positions, true);
  };

  const redo = () => {
    const next = history.future[0];
    if (!next) return;
    setHistory({ past: [...history.past, { doc, positions }], future: history.future.slice(1) });
    setDoc(next.doc);
    setPositions(next.positions);
    emit(next.doc, next.positions, true);
  };

  // ------------------------------------------------------------ pictures (one per subnet group)
  const groups = useMemo(
    () => splitTopology({ nodes: doc.nodes, links: doc.links }, allNeighbors, targets),
    [doc.nodes, doc.links, allNeighbors, targets]
  );
  const group = (anchorId && groups.find((g) => g.topology.nodes.some((n) => n.id === anchorId))) || groups[0] || null;
  const docIds = useMemo(() => new Set(doc.nodes.map((n) => n.id)), [doc.nodes]);
  const viewIds = useMemo(() => {
    // Devices added in this picture stay visible here until they are connected
    const base =
      groups.length <= 1
        ? docIds
        : new Set([...(group?.topology.nodes.map((n) => n.id) || []), ...pinned.filter((id) => docIds.has(id))]);
    if (!hiddenRoles.length) return base;
    return new Set(doc.nodes.filter((n) => base.has(n.id) && !hiddenRoles.includes(n.role || 'unknown')).map((n) => n.id));
  }, [groups, group, pinned, docIds, hiddenRoles, doc.nodes]);

  const toggleRole = (role) =>
    setHiddenRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));

  const nodes = useMemo(() => doc.nodes.filter((n) => viewIds.has(n.id)), [doc.nodes, viewIds]);
  const links = useMemo(() => doc.links.filter((l) => viewIds.has(l.source) && viewIds.has(l.target)), [doc.links, viewIds]);
  const pairs = useMemo(() => groupLinks(links), [links]);
  const nodeById = useMemo(() => Object.fromEntries(doc.nodes.map((d) => [d.id, d])), [doc.nodes]);
  const shapeVisible = (s) => groups.length <= 1 || viewIds.has(s.anchor) || (!docIds.has(s.anchor) && group === groups[0]);
  const flows = useMemo(
    () => doc.flows.filter((f) => groups.length <= 1 || f.hops.some((h) => viewIds.has(h))),
    [doc.flows, groups, viewIds]
  );
  const zones = doc.zones.filter(shapeVisible);
  const notes = doc.notes.filter(shapeVisible);
  const neighbors = groups.length > 1 && group ? group.neighbors : allNeighbors;
  const fileTag = groups.length > 1 && group ? `_${(group.subnets[0] || 'no-ip').replace(/[./]/g, '-')}` : '';

  const adjacency = useMemo(() => {
    const map = {};
    pairs.forEach(({ source, target }) => {
      (map[source] = map[source] || new Set()).add(target);
      (map[target] = map[target] || new Set()).add(source);
    });
    return map;
  }, [pairs]);

  /** Everything drawn in this picture: devices, zone corners and note boxes (for fit and export size) */
  const extent = useMemo(() => {
    const e = {};
    nodes.forEach((n) => positions[n.id] && (e[n.id] = positions[n.id]));
    zones.forEach((z) => {
      e[`\u0001z${z.id}a`] = { x: z.x + EXPORT_PAD.x - 20, y: z.y + EXPORT_PAD.top - 10 };
      e[`\u0001z${z.id}b`] = { x: z.x + z.w - EXPORT_PAD.x + 20, y: z.y + z.h - EXPORT_PAD.bottom + 10 };
    });
    notes.forEach((t) => {
      const box = noteBox(t);
      e[`\u0001t${t.id}a`] = { x: t.x + EXPORT_PAD.x - 20, y: t.y + EXPORT_PAD.top - 20 };
      e[`\u0001t${t.id}b`] = { x: t.x + box.w - EXPORT_PAD.x + 20, y: t.y + box.h - EXPORT_PAD.bottom + 10 };
    });
    return e;
  }, [nodes, zones, notes, positions]);

  // ------------------------------------------------------------ layout
  const computeLayout = (mode) => {
    if (mode === 'file') {
      const saved = {};
      nodes.forEach((n) => fileLayoutRef.current[n.id] && (saved[n.id] = fileLayoutRef.current[n.id]));
      if (Object.keys(saved).length === nodes.length) return saved;
    }
    if (mode === 'force' && nodes.length <= FORCE_MAX_NODES) return computeForceLayout(nodes, pairs);
    return computeHierarchicalLayout(nodes, pairs);
  };

  const fitTo = (pos) => {
    const e = { ...extent };
    nodes.forEach((n) => pos[n.id] && (e[n.id] = pos[n.id]));
    setView(fitView(e, wrapRef.current?.clientWidth || width, height));
  };

  // New report or another picture: lay out when the devices have no positions yet, then fit
  const viewKey = `${reinit}|${anchorId || ''}`;
  useEffect(() => {
    const missing = nodes.filter((n) => !positions[n.id]).length;
    let pos = positions;
    if (nodes.length && missing === nodes.length) {
      pos = { ...positions, ...computeLayout(layoutMode) };
      setPositions(pos);
    }
    fitTo(pos);
  }, [viewKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Devices that joined this picture without a position (merged picture, undo) go next to their neighbors
  useEffect(() => {
    if (!nodes.some((n) => !positions[n.id])) return;
    setPositions((prev) => {
      const next = { ...prev };
      const cx = (width / 2 - view.x) / view.scale;
      const cy = (height / 2 - view.y) / view.scale;
      nodes.forEach((n, i) => {
        if (next[n.id]) return;
        const peers = [...(adjacency[n.id] || [])].map((id) => next[id]).filter(Boolean);
        const base = peers.length
          ? { x: peers.reduce((s, p) => s + p.x, 0) / peers.length, y: peers.reduce((s, p) => s + p.y, 0) / peers.length }
          : { x: cx, y: cy };
        next[n.id] = { x: base.x + 90 + (i % 5) * 20, y: base.y + 90 + (i % 3) * 20 };
      });
      return next;
    });
  }, [nodes, positions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fit once the merged import has rendered (positions of the new devices are in state by then)
  useEffect(() => {
    if (!fitAfterEditRef.current) return;
    fitAfterEditRef.current = false;
    fitTo(positions);
  }, [doc]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Bring a .drawio / .svg / .png / .zip / .json export into the open diagram, beside what is already drawn */
  const importIntoDiagram = async (file) => {
    if (!file || !onImportFile) return;
    setImportingFile(true);
    setExportMsg({ type: 'info', text: `Importing ${file.name}...` });
    try {
      const data = await onImportFile(file);
      const inNodes = data.topology?.nodes || [];
      const inPairs = groupLinks(data.topology?.links || []);
      let inPos = positionsFrom(data.topology);
      if (inNodes.some((n) => !inPos[n.id])) inPos = computeHierarchicalLayout(inNodes, inPairs);

      const boxOf = (pos, zs, ts) => {
        const pts = { ...pos };
        zs.forEach((z, i) => {
          pts[`za${i}`] = { x: z.x, y: z.y };
          pts[`zb${i}`] = { x: z.x + z.w, y: z.y + z.h };
        });
        ts.forEach((t, i) => {
          pts[`t${i}`] = { x: t.x, y: t.y };
        });
        return Object.keys(pts).length ? boundsOf(pts) : null;
      };
      const ann = data.annotations || {};
      const current = boxOf(
        Object.fromEntries(doc.nodes.filter((n) => positions[n.id]).map((n) => [n.id, positions[n.id]])),
        doc.zones,
        doc.notes
      );
      const incoming = boxOf(inPos, ann.zones || [], ann.notes || []);
      // New file goes to the right of the current drawing, top-aligned; an empty diagram keeps the file's coordinates
      const offset = current && incoming ? { x: current.maxX + 300 - incoming.minX, y: current.minY - incoming.minY } : { x: 0, y: 0 };

      const { doc: next, positions: newPos, summary } = mergeImported(doc, data, inPos, offset);
      if (!summary.added && !summary.links && !summary.flows && !summary.zones && !summary.notes) {
        setExportMsg({ type: 'info', text: `${file.name}: everything in it is already in this diagram.` });
        return;
      }
      fitAfterEditRef.current = true;
      commit(next, { ...positions, ...newPos }, true);
      setPinned((p) => [...p, ...Object.keys(newPos)]);
      setExportMsg({
        type: 'ok',
        text:
          `Imported ${file.name}: ${summary.added} new device(s)` +
          (summary.merged ? `, ${summary.merged} already here (merged by hostname)` : '') +
          `, ${summary.links} link(s), ${summary.flows} flow(s), ${summary.zones} zone(s), ${summary.notes} note(s). Ctrl+Z to undo.`,
      });
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setExportMsg({ type: 'error', text: `Import failed: ${typeof detail === 'string' ? detail : err.message}` });
    } finally {
      setImportingFile(false);
    }
  };

  const resetLayout = (mode = layoutMode) => {
    const pos = { ...positions, ...computeLayout(mode) };
    commit(doc, pos, false);
    fitTo(pos);
    setSelected(null);
  };

  // ------------------------------------------------------------ canvas size / zoom
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.max(320, Math.floor(entry.contentRect.width)));
      setCanvasH(Math.max(320, Math.floor(entry.contentRect.height)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setView((v) => {
        const scale = Math.min(4, Math.max(0.02, v.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        const ratio = scale / v.scale;
        return { scale, x: mx - (mx - v.x) * ratio, y: my - (my - v.y) * ratio };
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  // ------------------------------------------------------------ full screen
  const toggleFullscreen = () => {
    if (fullscreen) {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      setFullscreen(false);
      return;
    }
    setFullscreen(true);
    // The CSS overlay already fills the window; the browser's full screen also hides its own bars
    rootRef.current?.requestFullscreen?.().catch(() => {});
  };

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // No page scrolling behind the overlay
  useEffect(() => {
    if (!fullscreen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [fullscreen]);

  // Keep what was in the middle of the canvas in the middle when its size changes
  const sizeRef = useRef({ width, height });
  useEffect(() => {
    const prev = sizeRef.current;
    sizeRef.current = { width, height };
    if (prev.width === width && prev.height === height) return;
    setView((v) => ({ ...v, x: v.x + (width - prev.width) / 2, y: v.y + (height - prev.height) / 2 }));
  }, [width, height]);

  // ------------------------------------------------------------ pointer helpers
  const activeTool = editing ? tool : 'select';

  const toWorld = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.x) / view.scale, y: (e.clientY - r.top - view.y) / view.scale };
  };
  const snapV = (v) => (snapOn && editing ? Math.round(v / GRID) * GRID : v);
  const snap = (p) => ({ x: snapV(p.x), y: snapV(p.y) });

  const capture = (e) => {
    try {
      svgRef.current.setPointerCapture(e.pointerId);
    } catch {
      // pointer capture is optional
    }
  };

  const nodeAt = (p, exclude) => {
    let best = null;
    let bestD = HIT_RADIUS;
    nodes.forEach((n) => {
      const q = positions[n.id];
      if (!q || n.id === exclude) return;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bestD) {
        best = n.id;
        bestD = d;
      }
    });
    return best;
  };

  const nearestNode = (p) => {
    let best = null;
    let bestD = Infinity;
    nodes.forEach((n) => {
      const q = positions[n.id];
      if (!q) return;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bestD) {
        best = n.id;
        bestD = d;
      }
    });
    return best;
  };

  /**
   * Lines the dragged device up with the ones already placed: returns the snapped
   * point plus the guide lines to draw, or null coordinates when nothing lines up.
   */
  const alignGuides = (raw, movingIds) => {
    const tol = 8 / view.scale;
    const moving = new Set(movingIds);
    let gx = null;
    let gy = null;
    let bestX = tol;
    let bestY = tol;
    nodes.forEach((n) => {
      if (moving.has(n.id)) return;
      const q = positions[n.id];
      if (!q) return;
      const dx = Math.abs(q.x - raw.x);
      const dy = Math.abs(q.y - raw.y);
      if (dx < bestX) {
        bestX = dx;
        gx = q.x;
      }
      if (dy < bestY) {
        bestY = dy;
        gy = q.y;
      }
    });
    return { x: gx, y: gy };
  };

  const clearSelection = () => {
    setSelected(null);
    setMulti(NONE);
    setSelItem(null);
  };

  /** Select these devices; a single one also fills the details panel */
  const selectNodes = (ids) => {
    setMulti(ids);
    setSelected(ids.length === 1 ? ids[0] : null);
    setSelItem(null);
  };

  const toggleInSelection = (id) => {
    const next = multi.includes(id) ? multi.filter((x) => x !== id) : [...multi, id];
    selectNodes(next);
  };

  const startPan = (e, hit) => {
    capture(e);
    dragRef.current = { type: 'pan', startX: e.clientX, startY: e.clientY, vx: view.x, vy: view.y, moved: false, hit };
  };

  const openNode = (id, presetPeer) => setDialog({ kind: 'node', nodeId: id, presetPeer });

  const finishFlow = (hops = flowDraft?.hops || []) => {
    setFlowDraft(null);
    setCursor(null);
    if (hops.length < 2) {
      setExportMsg({ type: 'error', text: 'A traffic flow needs at least 2 devices.' });
      return;
    }
    setDialog({
      kind: 'flow',
      flow: {
        id: newId('f'),
        name: `Flow ${doc.flows.length + 1}`,
        label: '',
        color: FLOW_COLORS[doc.flows.length % FLOW_COLORS.length],
        direction: 'forward',
        animated: true,
        hops,
        isNew: true,
      },
    });
  };

  const deleteHit = (hit) => {
    if (hit.kind === 'node') commit(deleteNode(doc, hit.id));
    else if (hit.kind === 'link') commit(deleteLinksBetween(doc, hit.source, hit.target));
    else if (hit.kind === 'flow') commit({ ...doc, flows: removeById(doc.flows, hit.id) }, positions, false);
    else if (hit.kind === 'zone') commit({ ...doc, zones: removeById(doc.zones, hit.id) }, positions, false);
    else if (hit.kind === 'note') commit({ ...doc, notes: removeById(doc.notes, hit.id) }, positions, false);
    clearSelection();
  };

  const clickOn = (hit) => {
    const now = Date.now();
    const last = lastClickRef.current;
    const dbl = last && last.kind === hit.kind && last.id === hit.id && now - last.t < DOUBLE_CLICK_MS;
    lastClickRef.current = { kind: hit.kind, id: hit.id, t: now };
    if (hit.kind === 'bg') {
      clearSelection();
      return;
    }
    if (hit.kind === 'node') {
      setSelItem(null);
      if (dbl) {
        selectNodes([hit.id]);
        openNode(hit.id);
      } else if (selected === hit.id && multi.length === 1) {
        clearSelection();
      } else {
        selectNodes([hit.id]);
      }
      return;
    }
    setSelected(null);
    setMulti(NONE);
    setSelItem(hit);
    if (!dbl) return;
    if (hit.kind === 'link') openNode(hit.source);
    else if (hit.kind === 'flow') setDialog({ kind: 'flow', flow: doc.flows.find((f) => f.id === hit.id) });
    else if (hit.kind === 'zone') setDialog({ kind: 'zone', item: doc.zones.find((z) => z.id === hit.id) });
    else if (hit.kind === 'note') setDialog({ kind: 'note', item: doc.notes.find((t) => t.id === hit.id) });
  };

  // ------------------------------------------------------------ pointer handlers
  const onBackgroundPointerDown = (e) => {
    if (e.button !== 0) return;
    const p = snap(toWorld(e));
    if (activeTool === 'device') {
      setDialog({ kind: 'node', nodeId: null, at: p, initial: { hostname: uniqueHostname(doc), role: 'switch' } });
      return;
    }
    if (activeTool === 'note') {
      setDialog({ kind: 'note', item: { id: newId('t'), x: p.x, y: p.y, text: '', color: '#e2e8f0', size: 13, isNew: true } });
      return;
    }
    if (activeTool === 'zone') {
      capture(e);
      dragRef.current = { type: 'zone-draw', x0: p.x, y0: p.y, moved: false, startX: e.clientX, startY: e.clientY };
      setCursor(p);
      return;
    }
    // Shift + drag on empty canvas picks every device inside the box
    if (activeTool === 'select' && e.shiftKey) {
      capture(e);
      const w = toWorld(e);
      dragRef.current = { type: 'marquee', x0: w.x, y0: w.y, add: multi.length > 0, moved: false, startX: e.clientX, startY: e.clientY };
      setMarquee({ x0: w.x, y0: w.y, x1: w.x, y1: w.y });
      return;
    }
    startPan(e, { kind: 'bg' });
  };

  const onNodePointerDown = (e, id) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    if (activeTool === 'delete') {
      deleteHit({ kind: 'node', id });
      return;
    }
    if (activeTool === 'flow') {
      const now = Date.now();
      const hops = flowDraft?.hops || [];
      const last = lastClickRef.current;
      if (hops[hops.length - 1] === id) {
        // Double-click on the last hop finishes the flow
        if (last && last.id === id && now - last.t < DOUBLE_CLICK_MS) finishFlow(hops);
      } else {
        setFlowDraft({ hops: [...hops, id] });
        setCursor(toWorld(e));
      }
      lastClickRef.current = { kind: 'node', id, t: now };
      return;
    }
    if (activeTool === 'select' && e.shiftKey) {
      toggleInSelection(id);
      return;
    }
    capture(e);
    if (activeTool === 'connect') {
      dragRef.current = { type: 'connect', from: id, moved: false, startX: e.clientX, startY: e.clientY };
      setCursor(toWorld(e));
      return;
    }
    const p = positions[id];
    const w = toWorld(e);
    // Dragging a device that is part of a multi-selection moves the whole selection
    const ids = multi.length > 1 && multi.includes(id) ? multi : null;
    dragRef.current = { type: 'node', id, ids, startX: e.clientX, startY: e.clientY, moved: false, dx: w.x - p.x, dy: w.y - p.y, before: positions };
  };

  const onItemPointerDown = (e, hit) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    if (['device', 'note', 'zone'].includes(activeTool)) {
      onBackgroundPointerDown(e);
      return;
    }
    if (activeTool === 'delete') {
      deleteHit(hit);
      return;
    }
    const movable = editing && (hit.kind === 'zone' || hit.kind === 'note');
    if (!movable) {
      startPan(e, hit);
      return;
    }
    capture(e);
    const item = (hit.kind === 'zone' ? doc.zones : doc.notes).find((x) => x.id === hit.id);
    dragRef.current = {
      type: hit.resize ? 'resize' : 'move',
      hit,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      orig: { ...item },
      beforeDoc: doc,
    };
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) {
      if (flowDraft) setCursor(toWorld(e));
      return;
    }
    if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 3) d.moved = true;
    if (d.type === 'connect' || d.type === 'zone-draw') {
      setCursor(d.type === 'zone-draw' ? snap(toWorld(e)) : toWorld(e));
      return;
    }
    if (d.type === 'marquee') {
      const w = toWorld(e);
      setMarquee({ x0: d.x0, y0: d.y0, x1: w.x, y1: w.y });
      return;
    }
    if (!d.moved) return;
    if (d.type === 'node') {
      const w = toWorld(e);
      const raw = { x: w.x - d.dx, y: w.y - d.dy };
      // Guides win over the grid: lining up with a neighbour is what the user aims at
      const g = editing ? alignGuides(raw, d.ids || [d.id]) : { x: null, y: null };
      const np = { x: g.x == null ? snapV(raw.x) : g.x, y: g.y == null ? snapV(raw.y) : g.y };
      setGuides(g.x == null && g.y == null ? null : g);
      if (d.ids) {
        const from = d.before[d.id];
        const ddx = np.x - from.x;
        const ddy = np.y - from.y;
        const next = { ...d.before };
        d.ids.forEach((id) => {
          const o = d.before[id];
          if (o) next[id] = { x: o.x + ddx, y: o.y + ddy };
        });
        setPositions(next);
      } else {
        setPositions((p) => ({ ...p, [d.id]: np }));
      }
    } else if (d.type === 'pan') {
      setView((v) => ({ ...v, x: d.vx + e.clientX - d.startX, y: d.vy + e.clientY - d.startY }));
    } else {
      const ddx = (e.clientX - d.startX) / view.scale;
      const ddy = (e.clientY - d.startY) / view.scale;
      const key = d.hit.kind === 'zone' ? 'zones' : 'notes';
      const patch =
        d.type === 'resize'
          ? { w: Math.max(80, snapV(d.orig.w + ddx)), h: Math.max(60, snapV(d.orig.h + ddy)) }
          : { x: snapV(d.orig.x + ddx), y: snapV(d.orig.y + ddy) };
      setDoc((prev) => ({ ...prev, [key]: prev[key].map((x) => (x.id === d.hit.id ? { ...x, ...patch } : x)) }));
    }
  };

  const onPointerUp = (e) => {
    const d = dragRef.current;
    dragRef.current = null;
    setGuides(null);
    if (!d) return;
    if (d.type === 'node') {
      if (d.moved) commit(doc, positions, false, { doc, positions: d.before });
      else clickOn({ kind: 'node', id: d.id });
    } else if (d.type === 'connect') {
      setCursor(null);
      const target = nodeAt(toWorld(e), d.from);
      if (target) openNode(d.from, target);
      else if (!d.moved) clickOn({ kind: 'node', id: d.from });
    } else if (d.type === 'marquee') {
      const box = marquee;
      setMarquee(null);
      if (!box) return;
      const minX = Math.min(box.x0, box.x1);
      const maxX = Math.max(box.x0, box.x1);
      const minY = Math.min(box.y0, box.y1);
      const maxY = Math.max(box.y0, box.y1);
      const inside = nodes
        .filter((n) => {
          const q = positions[n.id];
          return q && q.x >= minX && q.x <= maxX && q.y >= minY && q.y <= maxY;
        })
        .map((n) => n.id);
      selectNodes(d.add ? [...new Set([...multi, ...inside])] : inside);
    } else if (d.type === 'zone-draw') {
      setCursor(null);
      const p = snap(toWorld(e));
      const w = Math.abs(p.x - d.x0);
      const h = Math.abs(p.y - d.y0);
      if (w < 40 || h < 30) return;
      setDialog({
        kind: 'zone',
        item: {
          id: newId('z'),
          x: Math.min(p.x, d.x0),
          y: Math.min(p.y, d.y0),
          w,
          h,
          text: '',
          color: ZONE_COLORS[doc.zones.length % ZONE_COLORS.length],
          isNew: true,
        },
      });
    } else if (d.type === 'move' || d.type === 'resize') {
      if (d.moved) commit(doc, positions, false, { doc: d.beforeDoc, positions });
      else clickOn(d.hit);
    } else if (!d.moved) {
      clickOn(d.hit);
    }
  };

  // ------------------------------------------------------------ selection actions
  /** Line the selected devices up on one edge or their shared centre */
  const alignNodes = (mode) => {
    const ids = multi.filter((id) => positions[id]);
    if (ids.length < 2) return;
    const xs = ids.map((id) => positions[id].x);
    const ys = ids.map((id) => positions[id].y);
    const target = {
      left: Math.min(...xs),
      right: Math.max(...xs),
      centerX: (Math.min(...xs) + Math.max(...xs)) / 2,
      top: Math.min(...ys),
      bottom: Math.max(...ys),
      centerY: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
    const next = { ...positions };
    ids.forEach((id) => {
      const p = positions[id];
      if (mode === 'left') next[id] = { ...p, x: target.left };
      else if (mode === 'right') next[id] = { ...p, x: target.right };
      else if (mode === 'centerX') next[id] = { ...p, x: target.centerX };
      else if (mode === 'top') next[id] = { ...p, y: target.top };
      else if (mode === 'bottom') next[id] = { ...p, y: target.bottom };
      else if (mode === 'centerY') next[id] = { ...p, y: target.centerY };
    });
    commit(doc, next, false);
  };

  /** Equal gaps between the selected devices along one axis */
  const distributeNodes = (axis) => {
    const ids = multi.filter((id) => positions[id]);
    if (ids.length < 3) return;
    const key = axis === 'x' ? 'x' : 'y';
    const sorted = [...ids].sort((a, b) => positions[a][key] - positions[b][key]);
    const first = positions[sorted[0]][key];
    const last = positions[sorted[sorted.length - 1]][key];
    const step = (last - first) / (sorted.length - 1);
    const next = { ...positions };
    sorted.forEach((id, i) => {
      next[id] = { ...positions[id], [key]: first + step * i };
    });
    commit(doc, next, false);
  };

  /** Links whose both ends are among these devices: safe to copy, no port is shared with anyone else */
  const linksWithin = (ids) => {
    const set = new Set(ids);
    return doc.links.filter((l) => set.has(l.source) && set.has(l.target)).map((l) => ({ ...l }));
  };

  /**
   * Copies of the given devices, offset so they do not sit on the originals.
   * Links inside the group come along on the same ports; links to devices outside
   * it do not, since the outside device's port is already taken by the original.
   */
  const cloneNodes = ({ items, links = [] }, offset = 40) => {
    if (!items.length) return;
    let next = doc;
    const pos = { ...positions };
    const created = [];
    const renamed = {};
    items.forEach(({ node, pos: p }) => {
      const hostname = uniqueHostname(next, node.hostname);
      next = addNode(next, { hostname, ip: '', model: node.model, role: node.role });
      pos[hostname] = { x: (p?.x || 0) + offset, y: (p?.y || 0) + offset };
      renamed[node.id] = hostname;
      created.push(hostname);
    });
    const copies = links
      .filter((l) => renamed[l.source] && renamed[l.target])
      // Drawn, not learned: a copy was never seen by LLDP from either side
      .map((l) => ({ ...l, source: renamed[l.source], target: renamed[l.target], confirmed: false, manual: true }));
    next = addLinks(next, copies);
    setPinned((prev) => [...prev, ...created]);
    commit(next, pos, true);
    selectNodes(created);
  };

  /** Re-run the layout on the selection only, keeping it where it already sits */
  const arrangeSelection = () => {
    const ids = multi.filter((id) => positions[id]);
    if (ids.length < 3) return;
    const set = new Set(ids);
    const subNodes = nodes.filter((n) => set.has(n.id));
    const subPairs = pairs.filter((pr) => set.has(pr.source) && set.has(pr.target));
    const laid =
      layoutMode === 'force' && subNodes.length <= FORCE_MAX_NODES
        ? computeForceLayout(subNodes, subPairs)
        : computeHierarchicalLayout(subNodes, subPairs);
    const avg = (pick) => ids.reduce((sum, id) => sum + pick(id), 0) / ids.length;
    const dx = avg((id) => positions[id].x) - avg((id) => laid[id]?.x || 0);
    const dy = avg((id) => positions[id].y) - avg((id) => laid[id]?.y || 0);
    const next = { ...positions };
    ids.forEach((id) => {
      if (laid[id]) next[id] = { x: laid[id].x + dx, y: laid[id].y + dy };
    });
    commit(doc, next, false);
  };

  const selectedIds = () => (multi.length ? multi : selected ? [selected] : []);

  const duplicateSelection = () => {
    const ids = selectedIds().filter((id) => nodeById[id]);
    cloneNodes({ items: ids.map((id) => ({ node: nodeById[id], pos: positions[id] })), links: linksWithin(ids) });
  };

  // The group's links are taken now: by paste time the originals may have changed or gone
  const copySelection = () => {
    const ids = selectedIds().filter((id) => nodeById[id]);
    clipboardRef.current = {
      items: ids.map((id) => ({ node: { ...nodeById[id] }, pos: { ...(positions[id] || { x: 0, y: 0 }) } })),
      links: linksWithin(ids),
    };
    if (ids.length) {
      const n = clipboardRef.current.links.length;
      setExportMsg({
        type: 'info',
        text: `${ids.length} device(s)${n ? ` and ${n} link(s) between them` : ''} copied - Ctrl+V pastes a copy`,
      });
    }
  };

  const pasteClipboard = () => cloneNodes(clipboardRef.current);

  // ------------------------------------------------------------ zoom / find
  const zoomBy = (factor) =>
    setView((v) => {
      const scale = Math.min(4, Math.max(0.02, v.scale * factor));
      const ratio = scale / v.scale;
      const cx = width / 2;
      const cy = height / 2;
      return { scale, x: cx - (cx - v.x) * ratio, y: cy - (cy - v.y) * ratio };
    });

  const zoomReset = () =>
    setView((v) => {
      const ratio = 1 / v.scale;
      const cx = width / 2;
      const cy = height / 2;
      return { scale: 1, x: cx - (cx - v.x) * ratio, y: cy - (cy - v.y) * ratio };
    });

  /** Fit the whole picture, or only the selected devices when there are several */
  const fitSelection = () => {
    const ids = multi.filter((id) => positions[id]);
    if (ids.length < 2) {
      fitTo(positions);
      return;
    }
    setView(fitView(Object.fromEntries(ids.map((id) => [id, positions[id]])), wrapRef.current?.clientWidth || width, height));
  };

  const searchHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return NONE;
    return doc.nodes
      .filter((n) => `${n.hostname} ${n.ip || ''} ${n.model || ''}`.toLowerCase().includes(q))
      .slice(0, 12);
  }, [query, doc.nodes]);

  /** Select a device and bring it to the middle, switching picture when needed */
  const goToNode = (id) => {
    if (!viewIds.has(id)) setAnchorId(id);
    selectNodes([id]);
    setFocusId(id);
  };

  // Switching picture leaves devices selected that are no longer drawn
  useEffect(() => {
    if (multi.length && multi.some((id) => !viewIds.has(id))) {
      const kept = multi.filter((id) => viewIds.has(id));
      setMulti(kept);
      setSelected((cur) => (cur && viewIds.has(cur) ? cur : kept.length === 1 ? kept[0] : null));
    }
  }, [viewIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Centring waits for the position, which a picture switch only fills in afterwards
  useEffect(() => {
    if (!focusId) return;
    const p = positions[focusId];
    if (!p) return;
    setView((v) => {
      const scale = Math.max(v.scale, 1);
      return { scale, x: width / 2 - p.x * scale, y: height / 2 - p.y * scale };
    });
    setFocusId(null);
  }, [focusId, positions, width]);

  // ------------------------------------------------------------ keyboard
  const deleteSelection = () => {
    if (multi.length > 1) {
      let next = doc;
      multi.forEach((id) => {
        next = deleteNode(next, id);
      });
      commit(next);
      clearSelection();
    } else if (selected) deleteHit({ kind: 'node', id: selected });
    else if (selItem) deleteHit(selItem);
  };

  useEffect(() => {
    if (!editing) return undefined;
    const onKey = (e) => {
      if (dialog) return;
      const tag = (e.target?.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag) || e.target?.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && key === 'f') {
        e.preventDefault();
        toggleSearch();
        return;
      }
      if (mod && key === 'a') {
        e.preventDefault();
        selectNodes(nodes.map((n) => n.id));
        return;
      }
      if (mod && key === 'd') {
        e.preventDefault();
        duplicateSelection();
        return;
      }
      if (mod && key === 'c') {
        e.preventDefault();
        copySelection();
        return;
      }
      if (mod && key === 'v') {
        e.preventDefault();
        pasteClipboard();
        return;
      }
      if (mod || e.altKey) return;
      if (e.key === 'Escape') {
        setFlowDraft(null);
        setCursor(null);
        setMarquee(null);
        setSearchOpen(false);
        clearSelection();
        // The browser leaves its own full screen on Esc; this covers the CSS-only fallback
        if (fullscreen && !document.fullscreenElement) setFullscreen(false);
        return;
      }
      if (key === 'f') {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
      if (e.key === 'Enter' && flowDraft) {
        e.preventDefault();
        finishFlow();
        return;
      }
      if (e.key === 'Backspace' && flowDraft) {
        e.preventDefault();
        const hops = flowDraft.hops.slice(0, -1);
        setFlowDraft(hops.length ? { hops } : null);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelection();
        return;
      }
      const t = TOOLS.find((x) => x.key === key);
      if (t) chooseTool(t.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const openSearch = () => {
    setSearchOpen(true);
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  /** Ctrl+F opens the box, and closes it again when it is already open */
  const toggleSearch = () => {
    if (searchOpen) {
      setSearchOpen(false);
      searchRef.current?.blur();
    } else openSearch();
  };

  // Ctrl+F works while only viewing too, where the editing shortcuts are off
  useEffect(() => {
    if (editing) return undefined;
    const onKey = (e) => {
      if (dialog) return;
      const tag = (e.target?.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag) || e.target?.isContentEditable) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        toggleSearch();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'Escape' && fullscreen && !document.fullscreenElement) {
        setFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const chooseTool = (id) => {
    setTool(id);
    setFlowDraft(null);
    setCursor(null);
  };

  // ------------------------------------------------------------ dialog results
  const saveNode = ({ fields, rows }) => {
    const oldId = dialog.nodeId;
    const id = fields.hostname;
    let next = doc;
    let pos = positions;
    if (!oldId) {
      next = addNode(next, fields);
      pos = { ...pos, [id]: dialog.at };
      setPinned((p) => [...p, id]);
    } else {
      next = updateNode(next, oldId, fields);
      if (oldId !== id) {
        pos = { ...pos, [id]: pos[oldId] };
        delete pos[oldId];
        setPinned((p) => p.map((x) => (x === oldId ? id : x)));
        if (anchorId === oldId) setAnchorId(id);
      }
    }
    next = setConnections(next, id, rows);
    commit(next, pos, true);
    setSelected(id);
    setDialog(null);
  };

  const saveFlow = (flow) => {
    const { isNew, ...clean } = flow;
    commit({ ...doc, flows: upsertById(doc.flows, clean) }, positions, false);
    setDialog(null);
  };

  const saveShape = (kind, item) => {
    const { isNew, ...clean } = item;
    const center = kind === 'zone' ? { x: clean.x + clean.w / 2, y: clean.y + clean.h / 2 } : { x: clean.x, y: clean.y };
    const anchor = clean.anchor && docIds.has(clean.anchor) ? clean.anchor : nearestNode(center);
    const listKey = kind === 'zone' ? 'zones' : 'notes';
    commit({ ...doc, [listKey]: upsertById(doc[listKey], { ...clean, anchor }) }, positions, false);
    setDialog(null);
  };

  // ------------------------------------------------------------ export
  const annotationsView = { flows, zones, notes };

  const downloadSvg = () => {
    const { clone, w, h } = prepareSvgClone(svgRef.current, extent);
    addSvgMetadata(clone, buildPayload(nodes, links, neighbors, positions, annotationsView));
    downloadBlob(new Blob([serializeSvg(clone)], { type: 'image/svg+xml' }), `lldp_topology${fileTag}_${stamp()}.svg`);
    setExportMsg({
      type: 'ok',
      text: `SVG ${Math.round(w)} x ${Math.round(h)} (vector, stays sharp at any zoom, can be imported back)`,
    });
  };

  const downloadDrawio = () => {
    const xml = buildDrawioXml(nodes, pairs, extent, { includePorts: drawioPorts, ...annotationsView });
    downloadBlob(new Blob([xml], { type: 'application/xml' }), `lldp_topology${fileTag}_${stamp()}.drawio`);
    setExportMsg({
      type: 'ok',
      text: `draw.io file saved (${drawioPorts ? 'with' : 'without'} interfaces, with ${flows.length} flow(s), ${zones.length} zone(s), ${notes.length} note(s)): open with app.diagrams.net, draw.io desktop or the VS Code draw.io extension, and import it back here`,
    });
  };

  const downloadPng = async () => {
    setExporting(true);
    setExportMsg({ type: 'info', text: 'Rendering PNG...' });
    try {
      const payload = buildPayload(nodes, links, neighbors, positions, annotationsView);
      const text = await exportPng(svgRef.current, extent, `lldp_topology${fileTag}_${stamp()}`, payload, (t) =>
        setExportMsg({ type: 'info', text: t })
      );
      setExportMsg({ type: 'ok', text });
    } catch (err) {
      setExportMsg({ type: 'error', text: `PNG export failed: ${err.message}. Use SVG or draw.io instead.` });
    } finally {
      setExporting(false);
    }
  };

  // ------------------------------------------------------------ derived render data
  const roleCounts = useMemo(() => nodes.reduce((acc, d) => ({ ...acc, [d.role]: (acc[d.role] || 0) + 1 }), {}), [nodes]);
  const hiddenCounts = useMemo(
    () =>
      hiddenRoles.length
        ? doc.nodes.reduce((acc, d) => (hiddenRoles.includes(d.role) ? { ...acc, [d.role]: (acc[d.role] || 0) + 1 } : acc), {})
        : {},
    [doc.nodes, hiddenRoles]
  );

  const selectedNode = selected ? nodeById[selected] : null;
  const selectedLinks = useMemo(() => {
    if (!selected) return [];
    return pairs
      .filter((p) => p.source === selected || p.target === selected)
      .flatMap((p) =>
        p.ports.map((pt) =>
          p.source === selected
            ? { peer: p.target, local: pt.sp, remote: pt.tp, confirmed: pt.confirmed, manual: pt.manual }
            : { peer: p.source, local: pt.tp, remote: pt.sp, confirmed: pt.confirmed, manual: pt.manual }
        )
      );
  }, [selected, pairs]);

  const flowRender = useMemo(
    () => (showFlows ? flowSegments(flows, positions, (id) => viewIds.has(id)) : []),
    [showFlows, flows, positions, viewIds]
  );

  const isDim = (id) => multi.length <= 1 && selected && id !== selected && !adjacency[selected]?.has(id);
  const isSel = (kind, id) => selItem && selItem.kind === kind && selItem.id === id;
  const hasNodes = nodes.length > 0;
  const forceAllowed = nodes.length <= FORCE_MAX_NODES;
  const toolInfo = TOOLS.find((t) => t.id === activeTool);
  const draftPath = flowDraft ? flowDraft.hops.map((h) => positions[h]).filter(Boolean) : [];

  return (
    <div className={`lldp-topo${fullscreen ? ' is-fullscreen' : ''}`} ref={rootRef}>
      {groups.length > 1 && (
        <div className="lldp-topo-groups">
          <span className="lldp-topo-groups-label">Pictures ({groups.length})</span>
          <div className="lldp-tabs lldp-topo-group-tabs">
            {groups.map((g) => (
              <button
                key={g.id}
                className={g === group ? 'active' : ''}
                onClick={() => {
                  setAnchorId(g.topology.nodes[0].id);
                  setPinned([]);
                  clearSelection();
                  setFlowDraft(null);
                }}
                title={g.subnets.join('\n') || 'Devices without an IP address'}
              >
                {g.label} · {g.topology.nodes.length}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="lldp-topo-toolbar">
        <div className="lldp-topo-legend">
          {Object.entries(ROLE_STYLE)
            .filter(([role]) => roleCounts[role] || hiddenCounts[role] || ['router', 'switch', 'unknown'].includes(role))
            .map(([role, s]) => {
              const off = hiddenRoles.includes(role);
              return (
                <button
                  key={role}
                  type="button"
                  className={`lldp-topo-legend-chip${off ? ' off' : ''}`}
                  onClick={() => toggleRole(role)}
                  title={off ? `Show ${s.label} again` : `Hide ${s.label} from this picture and its export`}
                >
                  <i style={{ background: s.fill, borderColor: s.stroke }} />
                  {s.label}: {off ? hiddenCounts[role] || 0 : roleCounts[role] || 0}
                  {off ? <EyeOff className="h-3 w-3" /> : null}
                </button>
              );
            })}
          {hiddenRoles.length > 0 && (
            <button type="button" className="lldp-topo-legend-chip show-all" onClick={() => setHiddenRoles(NONE)}>
              <Eye className="h-3 w-3" />
              Show all
            </button>
          )}
          <span>Links: {links.length}</span>
          <span>
            <i style={{ background: 'transparent', borderColor: MANUAL_LINK, borderRadius: 0, height: 0, borderWidth: '2px 0 0' }} />
            Manual link
          </span>
          <span className="muted">Dashed = seen from one side only · Double-click a device to edit its interfaces</span>
        </div>
        <div className="lldp-topo-actions">
          <button
            className={`lldp-btn-sm ${editing ? 'lldp-btn-primary' : 'lldp-btn-secondary'}`}
            onClick={() => {
              setEditing((v) => !v);
              chooseTool('select');
            }}
            title="Add devices, connect interfaces, draw traffic flows, zones and notes"
          >
            <Pencil className="h-3.5 w-3.5" />
            {editing ? 'Done editing' : 'Edit'}
          </button>
          <label className="lldp-field inline">
            <span>Layout</span>
            <select
              value={layoutMode}
              onChange={(e) => {
                setLayoutMode(e.target.value);
                resetLayout(e.target.value);
              }}
              disabled={!hasNodes}
            >
              {hasFileLayout && <option value="file">Saved positions</option>}
              <option value="hierarchical">Hierarchical</option>
              <option value="force" disabled={!forceAllowed}>
                Force{forceAllowed ? '' : ` (max ${FORCE_MAX_NODES} nodes)`}
              </option>
            </select>
          </label>
          <label className="lldp-toggle">
            <input type="checkbox" checked={showPorts} onChange={(e) => setShowPorts(e.target.checked)} />
            <span>Show ports</span>
          </label>
          {doc.flows.length > 0 && (
            <label className="lldp-toggle">
              <input type="checkbox" checked={showFlows} onChange={(e) => setShowFlows(e.target.checked)} />
              <span>Flows</span>
            </label>
          )}
          <button
            className={`lldp-btn-sm ${fullscreen ? 'lldp-btn-primary' : 'lldp-btn-secondary'}`}
            onClick={toggleFullscreen}
            title={fullscreen ? 'Leave full screen (F or Esc)' : 'Full screen (F)'}
          >
            {fullscreen ? <Shrink className="h-3.5 w-3.5" /> : <Expand className="h-3.5 w-3.5" />}
            {fullscreen ? 'Exit full screen' : 'Full screen'}
          </button>
          <button className="lldp-btn-secondary lldp-btn-sm" onClick={() => fitTo(positions)} disabled={!hasNodes}>
            <Maximize2 className="h-3.5 w-3.5" />
            Fit
          </button>
          <button className="lldp-btn-secondary lldp-btn-sm" onClick={() => resetLayout()} disabled={!hasNodes}>
            <RefreshCw className="h-3.5 w-3.5" />
            Reset layout
          </button>
          <button className="lldp-btn-secondary lldp-btn-sm" onClick={downloadSvg} disabled={!hasNodes}>
            <Download className="h-3.5 w-3.5" />
            SVG
          </button>
          <div className="lldp-topo-export-group">
            <label className="lldp-toggle" title="Add connected interface names at both ends of every link in the draw.io file">
              <input type="checkbox" checked={drawioPorts} onChange={(e) => setDrawioPorts(e.target.checked)} />
              <span>Interfaces</span>
            </label>
            <button className="lldp-btn-secondary lldp-btn-sm" onClick={downloadDrawio} disabled={!hasNodes}>
              <FileCode className="h-3.5 w-3.5" />
              draw.io
            </button>
          </div>
          <button className="lldp-btn-secondary lldp-btn-sm" onClick={downloadPng} disabled={!hasNodes || exporting}>
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
            PNG
          </button>
        </div>
      </div>

      {showFlows && flows.length > 0 && (
        <div className="topo-flow-legend">
          {flows.map((f) => (
            <button
              key={f.id}
              className={`topo-flow-chip${isSel('flow', f.id) ? ' active' : ''}`}
              onClick={() => setSelItem({ kind: 'flow', id: f.id })}
              onDoubleClick={() => setDialog({ kind: 'flow', flow: f })}
              title="Double-click to edit"
            >
              <i style={{ background: f.color }} />
              {f.name}
              {f.label && <span className="muted">{f.label}</span>}
            </button>
          ))}
        </div>
      )}

      {exportMsg && <div className={`lldp-hint ${exportMsg.type}`}>{exportMsg.text}</div>}

      <input
        ref={importInputRef}
        type="file"
        accept=".drawio,.xml,.svg,.png,.zip,.json,.xlsx,.xlsm,.csv"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          importIntoDiagram(file);
        }}
      />
      <div
        className={`lldp-topo-canvas topo-canvas tool-${activeTool}${dropActive ? ' drop-active' : ''}`}
        ref={wrapRef}
        onDragOver={(e) => {
          if (!onImportFile || !editing || ![...e.dataTransfer.types].includes('Files')) return;
          e.preventDefault();
          setDropActive(true);
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={(e) => {
          if (!onImportFile || !editing) return;
          e.preventDefault();
          setDropActive(false);
          importIntoDiagram(e.dataTransfer.files?.[0]);
        }}
      >
        {dropActive && <div className="topo-drop">Drop to add this file to the diagram</div>}

        {hasNodes && (
          <div className={`topo-search${searchOpen ? ' open' : ''}`}>
            <button onClick={toggleSearch} title="Find a device (Ctrl+F toggles)">
              <Search className="h-4 w-4" />
            </button>
            {searchOpen && (
              <>
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
                      e.preventDefault();
                      setSearchOpen(false);
                      e.target.blur();
                      return;
                    }
                    if (e.key === 'Enter' && searchHits.length) goToNode(searchHits[0].id);
                    if (e.key === 'Escape') setSearchOpen(false);
                  }}
                  placeholder="Hostname, IP or model"
                  spellCheck={false}
                />
                {query.trim() && (
                  <div className="topo-search-hits">
                    {searchHits.length === 0 && <span className="muted">No device matches</span>}
                    {searchHits.map((n) => (
                      <button key={n.id} onClick={() => goToNode(n.id)}>
                        <svg width={18} height={18} viewBox="-22 -22 44 44">
                          <NodeIcon role={n.role} />
                        </svg>
                        <span className="name">{n.hostname}</span>
                        <span className="muted">{n.ip || n.model || ''}</span>
                        {!viewIds.has(n.id) && <span className="other">other picture</span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {hasNodes && (
          <div className="topo-zoombar">
            <button onClick={() => zoomBy(1 / 1.25)} title="Zoom out">
              <ZoomOut className="h-4 w-4" />
            </button>
            <button className="pct" onClick={zoomReset} title="Reset zoom to 100%">
              {Math.round(view.scale * 100)}%
            </button>
            <button onClick={() => zoomBy(1.25)} title="Zoom in">
              <ZoomIn className="h-4 w-4" />
            </button>
            <button onClick={fitSelection} title={multi.length > 1 ? 'Fit the selected devices' : 'Fit the whole picture'}>
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        )}

        {editing && multi.length > 1 && (
          <div className="topo-selbar">
            <span className="topo-selbar-count">{multi.length} selected</span>
            <span className="topo-palette-sep vertical" />
            <button onClick={() => alignNodes('left')} title="Align left edges">
              <AlignStartVertical className="h-4 w-4" />
            </button>
            <button onClick={() => alignNodes('centerX')} title="Align centres vertically">
              <AlignCenterVertical className="h-4 w-4" />
            </button>
            <button onClick={() => alignNodes('right')} title="Align right edges">
              <AlignEndVertical className="h-4 w-4" />
            </button>
            <button onClick={() => alignNodes('top')} title="Align top edges">
              <AlignStartHorizontal className="h-4 w-4" />
            </button>
            <button onClick={() => alignNodes('centerY')} title="Align centres horizontally">
              <AlignCenterHorizontal className="h-4 w-4" />
            </button>
            <button onClick={() => alignNodes('bottom')} title="Align bottom edges">
              <AlignEndHorizontal className="h-4 w-4" />
            </button>
            <span className="topo-palette-sep vertical" />
            <button onClick={() => distributeNodes('x')} disabled={multi.length < 3} title="Equal horizontal gaps (3+ devices)">
              <AlignHorizontalDistributeCenter className="h-4 w-4" />
            </button>
            <button onClick={() => distributeNodes('y')} disabled={multi.length < 3} title="Equal vertical gaps (3+ devices)">
              <AlignVerticalDistributeCenter className="h-4 w-4" />
            </button>
            <span className="topo-palette-sep vertical" />
            <button onClick={arrangeSelection} disabled={multi.length < 3} title="Re-arrange only these devices (3+ devices)">
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button onClick={duplicateSelection} title="Duplicate (Ctrl+D)">
              <CopyPlus className="h-4 w-4" />
            </button>
            <button onClick={copySelection} title="Copy (Ctrl+C), paste with Ctrl+V">
              <Copy className="h-4 w-4" />
            </button>
            <button onClick={deleteSelection} title="Delete the selected devices (Del)">
              <Eraser className="h-4 w-4" />
            </button>
          </div>
        )}
        {editing && (
          <>
            <div className="topo-palette">
              {TOOLS.map((t) => (
                <button
                  key={t.id}
                  className={tool === t.id ? 'active' : ''}
                  onClick={() => chooseTool(t.id)}
                  title={`${t.label} (${t.key.toUpperCase()})`}
                >
                  <t.icon className="h-4 w-4" />
                </button>
              ))}
              <span className="topo-palette-sep" />
              {onImportFile && (
                <button
                  onClick={() => importInputRef.current?.click()}
                  disabled={importingFile}
                  title="Import draw.io / SVG / PNG / JSON into this diagram (or drop the file on the canvas)"
                >
                  {importingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                </button>
              )}
              <button onClick={undo} disabled={!history.past.length} title="Undo (Ctrl+Z)">
                <Undo2 className="h-4 w-4" />
              </button>
              <button onClick={redo} disabled={!history.future.length} title="Redo (Ctrl+Y)">
                <Redo2 className="h-4 w-4" />
              </button>
              <button className={snapOn ? 'active' : ''} onClick={() => setSnapOn((v) => !v)} title="Snap to grid">
                <Grid3x3 className="h-4 w-4" />
              </button>
            </div>
            <div className="topo-hintbar">
              <strong>{toolInfo.label}:</strong> {toolInfo.hint}
              {activeTool === 'select' && (
                <span
                  className="topo-hint-more"
                  title={[
                    'Shift+drag: select a group',
                    'Shift+click: add / remove one device',
                    'Ctrl+A: select all',
                    'Ctrl+D: duplicate, Ctrl+C / Ctrl+V: copy / paste',
                    'Ctrl+F: find a device',
                    'F: full screen',
                    'Del: delete the selection',
                    'Pink guide: snaps to a device in line',
                  ].join('\n')}
                >
                  Shortcuts
                </span>
              )}
              {flowDraft && (
                <span className="topo-hint-actions">
                  <span>{flowDraft.hops.length} device(s)</span>
                  <button className="lldp-btn-primary lldp-btn-mini" onClick={() => finishFlow()} disabled={flowDraft.hops.length < 2}>
                    <Check className="h-3.5 w-3.5" />
                    Finish
                  </button>
                  <button className="lldp-btn-secondary lldp-btn-mini" onClick={() => setFlowDraft(null)}>
                    <X className="h-3.5 w-3.5" />
                    Cancel
                  </button>
                </span>
              )}
            </div>
          </>
        )}
        {!hasNodes && (
          <div className="topo-empty">
            {editing
              ? 'Empty diagram: pick "Add device" and click on the canvas, or import / drop a draw.io file.'
              : 'No devices to draw. Click Edit to start drawing.'}
          </div>
        )}
        <svg
          ref={svgRef}
          width={width}
          height={height}
          fontFamily="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
          onPointerDown={onBackgroundPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <rect data-bg="" x={0} y={0} width={width} height={height} fill="#020617" />
          <g data-root="" transform={`translate(${view.x},${view.y}) scale(${view.scale})`}>
            {zones.map((z) => {
              const sel = isSel('zone', z.id);
              return (
                <g key={z.id} onPointerDown={(e) => onItemPointerDown(e, { kind: 'zone', id: z.id })} style={{ cursor: editing ? 'move' : undefined }}>
                  <rect
                    x={z.x}
                    y={z.y}
                    width={z.w}
                    height={z.h}
                    rx={10}
                    fill={z.color}
                    fillOpacity={0.08}
                    stroke={sel ? '#fbbf24' : z.color}
                    strokeWidth={sel ? 2.5 : 1.5}
                    strokeDasharray="8 5"
                  />
                  <text x={z.x + 12} y={z.y + 20} fill={z.color} fontSize={13} fontWeight={700} {...HALO}>
                    {z.text}
                  </text>
                  {editing && sel && (
                    <rect
                      data-export-hide=""
                      x={z.x + z.w - 7}
                      y={z.y + z.h - 7}
                      width={14}
                      height={14}
                      fill="#fbbf24"
                      style={{ cursor: 'nwse-resize' }}
                      onPointerDown={(e) => onItemPointerDown(e, { kind: 'zone', id: z.id, resize: true })}
                    />
                  )}
                </g>
              );
            })}

            {pairs.map((pair) => {
              const a = positions[pair.source];
              const b = positions[pair.target];
              if (!a || !b) return null;
              const count = pair.ports.length;
              const confirmed = pair.ports.some((p) => p.confirmed);
              const manual = pair.ports.every((p) => p.manual);
              const dim = selected && pair.source !== selected && pair.target !== selected;
              const sel = isSel('link', pair.id);
              const at = (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
              const mid = at(0.5);
              const nearA = at(0.24);
              const nearB = at(0.76);
              const hit = { kind: 'link', id: pair.id, source: pair.source, target: pair.target };
              return (
                <g key={pair.id} opacity={dim ? 0.12 : 1} onPointerDown={(e) => onItemPointerDown(e, hit)}>
                  <title>
                    {pair.ports.map((p) => `${pair.source} ${p.sp}  <->  ${pair.target} ${p.tp}`).join('\n')}
                  </title>
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={sel || (selected && !dim) ? '#fbbf24' : manual ? MANUAL_LINK : '#64748b'}
                    strokeWidth={1.5 + Math.min(count - 1, 4)}
                    strokeDasharray={confirmed || manual ? undefined : '7 5'}
                  />
                  <line data-export-hide="" x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={14} />
                  {count > 1 && (
                    <text x={mid.x} y={mid.y - 5} textAnchor="middle" fill="#fbbf24" fontSize={11} fontWeight={600} {...HALO}>
                      x{count}
                    </text>
                  )}
                  {showPorts && (
                    <>
                      <text x={nearA.x} y={nearA.y - 4} textAnchor="middle" fill="#cbd5e1" fontSize={9.5} {...HALO}>
                        {shortList(pair.ports.map((p) => p.sp))}
                      </text>
                      <text x={nearB.x} y={nearB.y - 4} textAnchor="middle" fill="#cbd5e1" fontSize={9.5} {...HALO}>
                        {shortList(pair.ports.map((p) => p.tp))}
                      </text>
                    </>
                  )}
                </g>
              );
            })}

            {flowRender.map(({ flow: f, segs }) => {
              if (!segs.length) return null;
              const sel = isSel('flow', f.id);
              const first = segs[0];
              const both = f.direction === 'both';
              return (
                <g key={f.id} onPointerDown={(e) => onItemPointerDown(e, { kind: 'flow', id: f.id })}>
                  <title>{`${f.name}${f.label ? ` (${f.label})` : ''}\n${f.hops.join(both ? ' <-> ' : ' -> ')}`}</title>
                  {segs.map((s, i) => {
                    const m = { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
                    return (
                      <g key={i}>
                        {sel && <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#fbbf24" strokeWidth={7} strokeOpacity={0.35} strokeLinecap="round" />}
                        <line
                          x1={s.x1}
                          y1={s.y1}
                          x2={s.x2}
                          y2={s.y2}
                          stroke={f.color}
                          strokeWidth={3}
                          strokeLinecap="round"
                          strokeDasharray="10 6"
                        >
                          {/* Dashes march towards the destination; a two-way flow shows arrows both ways instead */}
                          {f.animated !== false && !both && (
                            <animate attributeName="stroke-dashoffset" from="32" to="0" dur="1s" repeatCount="indefinite" />
                          )}
                        </line>
                        <line data-export-hide="" x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="transparent" strokeWidth={12} />
                        <Arrow x={m.x + s.ux * 8} y={m.y + s.uy * 8} ux={s.ux} uy={s.uy} color={f.color} />
                        {both && <Arrow x={m.x - s.ux * 8} y={m.y - s.uy * 8} ux={-s.ux} uy={-s.uy} color={f.color} />}
                      </g>
                    );
                  })}
                  <text
                    x={(first.x1 + first.x2) / 2 + first.nx * 14}
                    y={(first.y1 + first.y2) / 2 + first.ny * 14 + 4}
                    textAnchor="middle"
                    fill={f.color}
                    fontSize={10.5}
                    fontWeight={700}
                    {...HALO}
                  >
                    {f.label ? `${f.name} · ${f.label}` : f.name}
                  </text>
                </g>
              );
            })}

            {nodes.map((node) => {
              const p = positions[node.id];
              if (!p) return null;
              const s = ROLE_STYLE[node.role] || ROLE_STYLE.unknown;
              const inDraft = flowDraft?.hops.includes(node.id);
              return (
                <g
                  key={node.id}
                  transform={`translate(${p.x},${p.y})`}
                  opacity={isDim(node.id) ? 0.2 : 1}
                  onPointerDown={(e) => onNodePointerDown(e, node.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <title>
                    {[node.hostname, node.ip, node.other_ips?.length ? `also on ${node.other_ips.join(', ')}` : '', node.model, s.label, node.manual ? 'Added manually' : node.discovered ? 'SSH collected' : 'Seen via LLDP only']
                      .filter(Boolean)
                      .join('\n')}
                  </title>
                  {inDraft && <circle data-export-hide="" r={28} fill="none" stroke="#fbbf24" strokeWidth={2} strokeDasharray="4 3" />}
                  {multi.length > 1 && multi.includes(node.id) && (
                    <circle data-export-hide="" r={26} fill="none" stroke="#fbbf24" strokeWidth={2} />
                  )}
                  <NodeIcon role={node.role} selected={node.id === selected} />
                  <text y={34} textAnchor="middle" fill="#e2e8f0" fontSize={12} fontWeight={600} {...HALO}>
                    {node.hostname}
                  </text>
                  {node.ip && (
                    <text y={48} textAnchor="middle" fill="#94a3b8" fontSize={10.5} {...HALO}>
                      {node.ip}
                    </text>
                  )}
                  {node.model && (
                    <text y={node.ip ? 61 : 48} textAnchor="middle" fill={s.text} fontSize={10.5} {...HALO}>
                      {node.model}
                    </text>
                  )}
                </g>
              );
            })}

            {notes.map((t) => {
              const sel = isSel('note', t.id);
              const size = t.size || 13;
              const box = noteBox(t);
              return (
                <g key={t.id} onPointerDown={(e) => onItemPointerDown(e, { kind: 'note', id: t.id })} style={{ cursor: editing ? 'move' : undefined }}>
                  {sel && (
                    <rect data-export-hide="" x={t.x - 6} y={t.y - 4} width={box.w + 12} height={box.h + 8} fill="none" stroke="#fbbf24" strokeDasharray="4 3" />
                  )}
                  <rect data-export-hide="" x={t.x - 6} y={t.y - 4} width={box.w + 12} height={box.h + 8} fill="transparent" />
                  <text x={t.x} y={t.y} fill={t.color} fontSize={size} fontWeight={600} {...HALO}>
                    {String(t.text)
                      .split('\n')
                      .map((line, i) => (
                        <tspan key={i} x={t.x} dy={i === 0 ? size : size * 1.3}>
                          {line}
                        </tspan>
                      ))}
                  </text>
                </g>
              );
            })}

            {/* In-progress drawing, never exported */}
            {cursor && dragRef.current?.type === 'connect' && positions[dragRef.current.from] && (
              <line
                data-export-hide=""
                x1={positions[dragRef.current.from].x}
                y1={positions[dragRef.current.from].y}
                x2={cursor.x}
                y2={cursor.y}
                stroke={MANUAL_LINK}
                strokeWidth={2}
                strokeDasharray="6 4"
                pointerEvents="none"
              />
            )}
            {cursor && dragRef.current?.type === 'zone-draw' && (
              <rect
                data-export-hide=""
                x={Math.min(cursor.x, dragRef.current.x0)}
                y={Math.min(cursor.y, dragRef.current.y0)}
                width={Math.abs(cursor.x - dragRef.current.x0)}
                height={Math.abs(cursor.y - dragRef.current.y0)}
                fill="#6366f1"
                fillOpacity={0.08}
                stroke="#818cf8"
                strokeDasharray="6 4"
                pointerEvents="none"
              />
            )}
            {guides && (
              <g data-export-hide="" pointerEvents="none">
                {guides.x != null && (
                  <line
                    x1={guides.x}
                    y1={(-view.y - 2000) / view.scale}
                    x2={guides.x}
                    y2={(height - view.y + 2000) / view.scale}
                    stroke="#f472b6"
                    strokeWidth={1 / view.scale}
                    strokeDasharray={`${6 / view.scale} ${4 / view.scale}`}
                  />
                )}
                {guides.y != null && (
                  <line
                    x1={(-view.x - 2000) / view.scale}
                    y1={guides.y}
                    x2={(width - view.x + 2000) / view.scale}
                    y2={guides.y}
                    stroke="#f472b6"
                    strokeWidth={1 / view.scale}
                    strokeDasharray={`${6 / view.scale} ${4 / view.scale}`}
                  />
                )}
              </g>
            )}
            {marquee && (
              <rect
                data-export-hide=""
                x={Math.min(marquee.x0, marquee.x1)}
                y={Math.min(marquee.y0, marquee.y1)}
                width={Math.abs(marquee.x1 - marquee.x0)}
                height={Math.abs(marquee.y1 - marquee.y0)}
                fill="#fbbf24"
                fillOpacity={0.08}
                stroke="#fbbf24"
                strokeDasharray="5 4"
                pointerEvents="none"
              />
            )}
            {draftPath.length > 0 && (
              <polyline
                data-export-hide=""
                points={[...draftPath, ...(cursor ? [cursor] : [])].map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="#fbbf24"
                strokeWidth={3}
                strokeDasharray="10 6"
                pointerEvents="none"
              />
            )}
          </g>
        </svg>
      </div>

      {selectedNode && (
        <div className="lldp-topo-panel">
          <div className="lldp-topo-panel-head">
            <strong>{selectedNode.hostname}</strong>
            <span>{selectedNode.ip || 'no IP'}</span>
            <span>{selectedNode.model || 'unknown model'}</span>
            <span>{(ROLE_STYLE[selectedNode.role] || ROLE_STYLE.unknown).label}</span>
            <span className="muted">{selectedNode.manual ? 'Added manually' : selectedNode.discovered ? 'SSH collected' : 'Seen via LLDP only'}</span>
            <button className="lldp-btn-secondary lldp-btn-mini" onClick={() => openNode(selectedNode.id)}>
              <Cable className="h-3.5 w-3.5" />
              Edit interfaces
            </button>
          </div>
          <div className="lldp-table-wrap">
            <table className="lldp-table">
              <thead>
                <tr>
                  <th>Local Port</th>
                  <th>Neighbor</th>
                  <th>Neighbor Port</th>
                  <th>Neighbor IP</th>
                  <th>Neighbor Model</th>
                  <th>Seen From</th>
                </tr>
              </thead>
              <tbody>
                {selectedLinks.length === 0 && (
                  <tr>
                    <td colSpan={6} className="lldp-empty">
                      No connections. Double-click the device or use Edit interfaces.
                    </td>
                  </tr>
                )}
                {selectedLinks.map((l, i) => (
                  <tr key={`${l.peer}-${l.local}-${i}`}>
                    <td className="mono">{l.local || '-'}</td>
                    <td>{l.peer}</td>
                    <td className="mono">{l.remote || '-'}</td>
                    <td className="mono">{nodeById[l.peer]?.ip || '-'}</td>
                    <td>{nodeById[l.peer]?.model || '-'}</td>
                    <td>{l.manual ? 'Manual' : l.confirmed ? 'Both sides' : 'One side'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {dialog?.kind === 'node' && (
        <NodeDialog
          doc={doc}
          nodeId={dialog.nodeId}
          initial={dialog.initial}
          presetPeer={dialog.presetPeer}
          onSave={saveNode}
          onDelete={() => {
            deleteHit({ kind: 'node', id: dialog.nodeId });
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'flow' && (
        <FlowDialog
          doc={doc}
          flow={dialog.flow}
          onSave={saveFlow}
          onDelete={() => {
            deleteHit({ kind: 'flow', id: dialog.flow.id });
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {(dialog?.kind === 'zone' || dialog?.kind === 'note') && (
        <ShapeDialog
          kind={dialog.kind}
          item={dialog.item}
          onSave={(item) => saveShape(dialog.kind, item)}
          onDelete={() => {
            deleteHit({ kind: dialog.kind, id: dialog.item.id });
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
