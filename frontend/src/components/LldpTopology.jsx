import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, RefreshCw, Download, Image as ImageIcon, FileCode, Loader2 } from 'lucide-react';
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

const HEIGHT = 640;
const NONE = [];

// Inline SVG attributes (not CSS classes) so exported SVG / PNG keep their colors
const ROLE_STYLE = {
  router: { fill: '#0e7490', stroke: '#22d3ee', text: '#67e8f9', label: 'Router (AR / NE)' },
  switch: { fill: '#3730a3', stroke: '#818cf8', text: '#a5b4fc', label: 'Switch' },
  unknown: { fill: '#334155', stroke: '#94a3b8', text: '#94a3b8', label: 'Unknown model' },
};

// Dark outline behind text keeps labels readable where links pass underneath
const HALO = { stroke: '#020617', strokeWidth: 3, strokeLinejoin: 'round', paintOrder: 'stroke' };

function fitView(pos, width) {
  const b = boundsOf(pos);
  const w = b.maxX - b.minX + EXPORT_PAD.x * 2;
  const h = b.maxY - b.minY + EXPORT_PAD.top + EXPORT_PAD.bottom;
  const scale = Math.min(width / w, HEIGHT / h, 1.5);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY - EXPORT_PAD.top + b.maxY + EXPORT_PAD.bottom) / 2;
  return { scale, x: width / 2 - cx * scale, y: HEIGHT / 2 - cy * scale };
}

const shortList = (items) => (items.length > 2 ? `${items.slice(0, 2).join(', ')} +${items.length - 2}` : items.join(', '));
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

function NodeIcon({ role, selected }) {
  const s = ROLE_STYLE[role] || ROLE_STYLE.unknown;
  const stroke = selected ? '#fbbf24' : s.stroke;
  const strokeWidth = selected ? 3 : 2;
  const arrows = { stroke: '#ffffff', strokeWidth: 1.6, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (role === 'router') {
    return (
      <g>
        <circle r={18} fill={s.fill} stroke={stroke} strokeWidth={strokeWidth} />
        <path
          d="M-12,0 L-4,0 M-7,-3 L-4,0 L-7,3 M12,0 L4,0 M7,-3 L4,0 L7,3 M0,-4 L0,-12 M-3,-9 L0,-12 L3,-9 M0,4 L0,12 M-3,9 L0,12 L3,9"
          {...arrows}
        />
      </g>
    );
  }
  if (role === 'switch') {
    return (
      <g>
        <rect x={-22} y={-14} width={44} height={28} rx={5} fill={s.fill} stroke={stroke} strokeWidth={strokeWidth} />
        <path d="M-13,-5 L13,-5 M9,-9 L13,-5 L9,-1 M13,5 L-13,5 M-9,1 L-13,5 L-9,9" {...arrows} />
      </g>
    );
  }
  return (
    <g>
      <circle r={16} fill={s.fill} stroke={stroke} strokeWidth={strokeWidth} />
      <text y={5} textAnchor="middle" fill="#e2e8f0" fontSize={14} fontWeight={700}>
        ?
      </text>
    </g>
  );
}

export default function LldpTopology({ topology: fullTopology, neighbors: allNeighbors = NONE, targets = NONE }) {
  // One picture per subnet; subnets joined by LLDP links share a picture
  const groups = useMemo(() => splitTopology(fullTopology, allNeighbors, targets), [fullTopology, allNeighbors, targets]);
  const [groupIdx, setGroupIdx] = useState(0);
  useEffect(() => setGroupIdx(0), [fullTopology]);
  const group = groups[Math.min(groupIdx, Math.max(groups.length - 1, 0))];
  const topology = group?.topology || fullTopology;
  const neighbors = group?.neighbors || allNeighbors;
  const fileTag = groups.length > 1 && group ? `_${(group.subnets[0] || 'no-ip').replace(/[./]/g, '-')}` : '';

  const nodes = useMemo(() => topology?.nodes || [], [topology]);
  const pairs = useMemo(() => groupLinks(topology?.links || []), [topology]);
  const nodeById = useMemo(() => Object.fromEntries(nodes.map((d) => [d.id, d])), [nodes]);
  const adjacency = useMemo(() => {
    const map = {};
    pairs.forEach(({ source, target }) => {
      (map[source] = map[source] || new Set()).add(target);
      (map[target] = map[target] || new Set()).add(source);
    });
    return map;
  }, [pairs]);

  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const [width, setWidth] = useState(1000);
  const [positions, setPositions] = useState({});
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [selected, setSelected] = useState(null);
  const [showPorts, setShowPorts] = useState(false);
  const [layoutMode, setLayoutMode] = useState('hierarchical');
  const [drawioPorts, setDrawioPorts] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState(null);
  const hasNodes = nodes.length > 0;
  const forceAllowed = nodes.length <= FORCE_MAX_NODES;

  // Imported files carry the positions they were exported / edited with
  const hasFileLayout = useMemo(
    () => nodes.length > 0 && nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)),
    [nodes]
  );

  useEffect(() => {
    setLayoutMode(hasFileLayout ? 'file' : 'hierarchical');
  }, [topology, hasFileLayout]);

  const resetLayout = () => {
    let pos;
    if (layoutMode === 'file' && hasFileLayout) pos = Object.fromEntries(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    else if (layoutMode === 'force' && forceAllowed) pos = computeForceLayout(nodes, pairs);
    else pos = computeHierarchicalLayout(nodes, pairs);
    setPositions(pos);
    setView(fitView(pos, wrapRef.current?.clientWidth || width));
    setSelected(null);
  };

  useEffect(resetLayout, [topology, layoutMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(320, Math.floor(entry.contentRect.width))));
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
  }, [hasNodes]);

  const capture = (e) => {
    try {
      svgRef.current.setPointerCapture(e.pointerId);
    } catch {
      // pointer capture is optional
    }
  };

  const onNodePointerDown = (e, id) => {
    e.stopPropagation();
    capture(e);
    dragRef.current = { type: 'node', id, startX: e.clientX, startY: e.clientY, moved: false };
  };

  const onBackgroundPointerDown = (e) => {
    capture(e);
    dragRef.current = { type: 'pan', startX: e.clientX, startY: e.clientY, vx: view.x, vy: view.y, moved: false };
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 3) d.moved = true;
    if (!d.moved) return;
    if (d.type === 'node') {
      const rect = svgRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - view.x) / view.scale;
      const y = (e.clientY - rect.top - view.y) / view.scale;
      setPositions((p) => ({ ...p, [d.id]: { x, y } }));
    } else {
      setView((v) => ({ ...v, x: d.vx + e.clientX - d.startX, y: d.vy + e.clientY - d.startY }));
    }
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.moved) return;
    setSelected((s) => (d.type === 'node' && s !== d.id ? d.id : null));
  };

  const downloadSvg = () => {
    const { clone, w, h } = prepareSvgClone(svgRef.current, positions);
    addSvgMetadata(clone, buildPayload(nodes, topology?.links || [], neighbors, positions));
    downloadBlob(new Blob([serializeSvg(clone)], { type: 'image/svg+xml' }), `lldp_topology${fileTag}_${stamp()}.svg`);
    setExportMsg({
      type: 'ok',
      text: `SVG ${Math.round(w)} x ${Math.round(h)} (vector, stays sharp at any zoom, can be imported back)`,
    });
  };

  const downloadDrawio = () => {
    const xml = buildDrawioXml(nodes, pairs, positions, { includePorts: drawioPorts });
    downloadBlob(new Blob([xml], { type: 'application/xml' }), `lldp_topology${fileTag}_${stamp()}.drawio`);
    setExportMsg({
      type: 'ok',
      text: `draw.io file saved (${drawioPorts ? 'with' : 'without'} interfaces): open with app.diagrams.net, draw.io desktop or the VS Code draw.io extension`,
    });
  };

  const downloadPng = async () => {
    setExporting(true);
    setExportMsg({ type: 'info', text: 'Rendering PNG...' });
    try {
      const payload = buildPayload(nodes, topology?.links || [], neighbors, positions);
      const text = await exportPng(svgRef.current, positions, `lldp_topology${fileTag}_${stamp()}`, payload, (t) =>
        setExportMsg({ type: 'info', text: t })
      );
      setExportMsg({ type: 'ok', text });
    } catch (err) {
      setExportMsg({ type: 'error', text: `PNG export failed: ${err.message}. Use SVG or draw.io instead.` });
    } finally {
      setExporting(false);
    }
  };

  const roleCounts = useMemo(
    () => nodes.reduce((acc, d) => ({ ...acc, [d.role]: (acc[d.role] || 0) + 1 }), {}),
    [nodes]
  );

  const selectedNode = selected ? nodeById[selected] : null;
  const selectedLinks = useMemo(() => {
    if (!selected) return [];
    return pairs
      .filter((p) => p.source === selected || p.target === selected)
      .flatMap((p) =>
        p.ports.map((pt) =>
          p.source === selected
            ? { peer: p.target, local: pt.sp, remote: pt.tp, confirmed: pt.confirmed }
            : { peer: p.source, local: pt.tp, remote: pt.sp, confirmed: pt.confirmed }
        )
      );
  }, [selected, pairs]);

  const isDim = (id) => selected && id !== selected && !adjacency[selected]?.has(id);

  return (
    <div className="lldp-topo">
      {groups.length > 1 && (
        <div className="lldp-topo-groups">
          <span className="lldp-topo-groups-label">Pictures ({groups.length})</span>
          <div className="lldp-tabs lldp-topo-group-tabs">
            {groups.map((g, i) => (
              <button
                key={g.id}
                className={g === group ? 'active' : ''}
                onClick={() => setGroupIdx(i)}
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
          {Object.entries(ROLE_STYLE).map(([role, s]) => (
            <span key={role}>
              <i style={{ background: s.fill, borderColor: s.stroke }} />
              {s.label}: {roleCounts[role] || 0}
            </span>
          ))}
          <span>Links: {topology?.links?.length || 0}</span>
          <span className="muted">Dashed = seen from one side only · Drag nodes, scroll to zoom, click to highlight</span>
        </div>
        <div className="lldp-topo-actions">
          <label className="lldp-field inline">
            <span>Layout</span>
            <select value={layoutMode} onChange={(e) => setLayoutMode(e.target.value)}>
              {hasFileLayout && <option value="file">From imported file</option>}
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
          <button className="lldp-btn-secondary lldp-btn-sm" onClick={() => setView(fitView(positions, width))} disabled={!hasNodes}>
            <Maximize2 className="h-3.5 w-3.5" />
            Fit
          </button>
          <button className="lldp-btn-secondary lldp-btn-sm" onClick={resetLayout} disabled={!hasNodes}>
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

      {exportMsg && <div className={`lldp-hint ${exportMsg.type}`}>{exportMsg.text}</div>}

      <div className="lldp-topo-canvas" ref={wrapRef}>
        {!hasNodes ? (
          <div className="lldp-empty">No LLDP neighbors to draw</div>
        ) : (
          <svg
            ref={svgRef}
            width={width}
            height={HEIGHT}
            fontFamily="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
            onPointerDown={onBackgroundPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <rect data-bg="" x={0} y={0} width={width} height={HEIGHT} fill="#020617" />
            <g data-root="" transform={`translate(${view.x},${view.y}) scale(${view.scale})`}>
              {pairs.map((pair) => {
                const a = positions[pair.source];
                const b = positions[pair.target];
                if (!a || !b) return null;
                const count = pair.ports.length;
                const confirmed = pair.ports.some((p) => p.confirmed);
                const dim = selected && pair.source !== selected && pair.target !== selected;
                const at = (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
                const mid = at(0.5);
                const nearA = at(0.24);
                const nearB = at(0.76);
                return (
                  <g key={pair.id} opacity={dim ? 0.12 : 1}>
                    <title>
                      {pair.ports.map((p) => `${pair.source} ${p.sp}  <->  ${pair.target} ${p.tp}`).join('\n')}
                    </title>
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={selected && !dim ? '#fbbf24' : '#64748b'}
                      strokeWidth={1.5 + Math.min(count - 1, 4)}
                      strokeDasharray={confirmed ? undefined : '7 5'}
                    />
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

              {nodes.map((node) => {
                const p = positions[node.id];
                if (!p) return null;
                const s = ROLE_STYLE[node.role] || ROLE_STYLE.unknown;
                return (
                  <g
                    key={node.id}
                    transform={`translate(${p.x},${p.y})`}
                    opacity={isDim(node.id) ? 0.2 : 1}
                    onPointerDown={(e) => onNodePointerDown(e, node.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <title>
                      {[node.hostname, node.ip, node.model, s.label, node.discovered ? 'SSH collected' : 'Seen via LLDP only']
                        .filter(Boolean)
                        .join('\n')}
                    </title>
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
            </g>
          </svg>
        )}
      </div>

      {selectedNode && (
        <div className="lldp-topo-panel">
          <div className="lldp-topo-panel-head">
            <strong>{selectedNode.hostname}</strong>
            <span>{selectedNode.ip || 'no IP'}</span>
            <span>{selectedNode.model || 'unknown model'}</span>
            <span>{(ROLE_STYLE[selectedNode.role] || ROLE_STYLE.unknown).label}</span>
            <span className="muted">{selectedNode.discovered ? 'SSH collected' : 'Seen via LLDP only'}</span>
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
                {selectedLinks.map((l, i) => (
                  <tr key={`${l.peer}-${l.local}-${i}`}>
                    <td className="mono">{l.local || '-'}</td>
                    <td>{l.peer}</td>
                    <td className="mono">{l.remote || '-'}</td>
                    <td className="mono">{nodeById[l.peer]?.ip || '-'}</td>
                    <td>{nodeById[l.peer]?.model || '-'}</td>
                    <td>{l.confirmed ? 'Both sides' : 'One side'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
