// Export helpers for the LLDP topology: SVG, PNG (auto size / tiles), draw.io, minimal ZIP

export const EXPORT_PAD = { x: 130, top: 40, bottom: 80 };

// Conservative canvas limits that work in Chrome, Edge and Firefox
const PNG_MAX_SIDE = 16384;
const PNG_MAX_AREA = 120e6;
const PNG_TARGET_SCALE = 2;
const PNG_TILE_PX = 8192;
const OVERVIEW_MAX_PX = 4096;

export function boundsOf(pos) {
  const pts = Object.values(pos);
  if (pts.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return pts.reduce(
    (b, p) => ({
      minX: Math.min(b.minX, p.x),
      minY: Math.min(b.minY, p.y),
      maxX: Math.max(b.maxX, p.x),
      maxY: Math.max(b.maxY, p.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  );
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Clone the on-screen SVG, drop pan/zoom and highlight, size it to the whole graph */
export function prepareSvgClone(svgEl, positions) {
  const b = boundsOf(positions);
  const minX = b.minX - EXPORT_PAD.x;
  const minY = b.minY - EXPORT_PAD.top;
  const w = b.maxX - b.minX + EXPORT_PAD.x * 2;
  const h = b.maxY - b.minY + EXPORT_PAD.top + EXPORT_PAD.bottom;
  const clone = svgEl.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', `${minX} ${minY} ${w} ${h}`);
  clone.setAttribute('width', w);
  clone.setAttribute('height', h);
  clone.querySelector('[data-root]').removeAttribute('transform');
  const bg = clone.querySelector('[data-bg]');
  bg.setAttribute('x', minX);
  bg.setAttribute('y', minY);
  bg.setAttribute('width', w);
  bg.setAttribute('height', h);
  clone.querySelectorAll('[opacity]').forEach((el) => el.setAttribute('opacity', '1'));
  return { clone, minX, minY, w, h };
}

export const serializeSvg = (clone) => new XMLSerializer().serializeToString(clone);

function loadSvgImage(markup) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Browser could not render the topology SVG'));
    };
    img.src = url;
  });
}

/** Rasterize one region of the graph (world coords) at `scale` px per unit */
async function renderRegion(clone, vx, vy, vw, vh, scale) {
  const pxW = Math.ceil(vw * scale);
  const pxH = Math.ceil(vh * scale);
  const region = clone.cloneNode(true);
  region.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
  region.setAttribute('width', pxW);
  region.setAttribute('height', pxH);
  const img = await loadSvgImage(serializeSvg(region));
  const canvas = document.createElement('canvas');
  canvas.width = pxW;
  canvas.height = pxH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`Canvas ${pxW}x${pxH} px is too large for this browser`);
  ctx.drawImage(img, 0, 0, pxW, pxH);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(`Canvas ${pxW}x${pxH} px is too large for this browser`))),
      'image/png'
    )
  );
}

/**
 * One PNG at 2x when it fits the canvas limits (drops towards 1x first).
 * Otherwise a ZIP with 2x tiles + overview.png, so nothing is ever downscaled into blur.
 * Returns a status message.
 */
export async function exportPng(svgEl, positions, baseName, onProgress = () => {}) {
  const { clone, minX, minY, w, h } = prepareSvgClone(svgEl, positions);
  const fits = (s) => w * s <= PNG_MAX_SIDE && h * s <= PNG_MAX_SIDE && w * h * s * s <= PNG_MAX_AREA;

  let scale = PNG_TARGET_SCALE;
  while (scale > 1 && !fits(scale)) scale = Math.max(1, scale - 0.25);
  if (fits(scale)) {
    const blob = await renderRegion(clone, minX, minY, w, h, scale);
    downloadBlob(blob, `${baseName}.png`);
    return `PNG ${Math.ceil(w * scale)} x ${Math.ceil(h * scale)} px (${scale}x)`;
  }

  const tileWorld = PNG_TILE_PX / PNG_TARGET_SCALE;
  const cols = Math.ceil(w / tileWorld);
  const rows = Math.ceil(h / tileWorld);
  const pad = (n) => String(n).padStart(2, '0');
  const files = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      onProgress(`Rendering PNG tile ${r * cols + c + 1} / ${rows * cols}...`);
      const vx = minX + c * tileWorld;
      const vy = minY + r * tileWorld;
      const blob = await renderRegion(
        clone,
        vx,
        vy,
        Math.min(tileWorld, minX + w - vx),
        Math.min(tileWorld, minY + h - vy),
        PNG_TARGET_SCALE
      );
      files.push({ name: `tiles/row${pad(r + 1)}_col${pad(c + 1)}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
    }
  }
  onProgress('Rendering overview...');
  const overviewScale = Math.min(1, OVERVIEW_MAX_PX / Math.max(w, h));
  const overview = await renderRegion(clone, minX, minY, w, h, overviewScale);
  files.unshift({ name: 'overview.png', data: new Uint8Array(await overview.arrayBuffer()) });
  files.push({
    name: 'README.txt',
    data:
      `LLDP topology PNG export\n` +
      `Full size: ${Math.ceil(w * PNG_TARGET_SCALE)} x ${Math.ceil(h * PNG_TARGET_SCALE)} px at ${PNG_TARGET_SCALE}x, too large for one browser canvas.\n` +
      `tiles/rowRR_colCC.png: ${rows} row(s) x ${cols} column(s), ${PNG_TILE_PX} px each, place left-to-right, top-to-bottom.\n` +
      `overview.png: whole diagram scaled to ${Math.round(overviewScale * 100)}%.\n` +
      `For one sharp file use the SVG or draw.io export.\n`,
  });
  onProgress('Building ZIP...');
  downloadBlob(makeZip(files), `${baseName}_png_tiles.zip`);
  return `Too large for one PNG: ${rows} x ${cols} tiles at ${PNG_TARGET_SCALE}x + overview.png (ZIP). SVG / draw.io keep it in one file.`;
}

const xmlEscape = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const DRAWIO_NODE = {
  router: {
    w: 50,
    h: 36,
    style:
      'shape=mxgraph.cisco.routers.router;html=1;pointerEvents=1;dashed=0;fillColor=#0e7490;strokeColor=#ffffff;strokeWidth=2;verticalLabelPosition=bottom;verticalAlign=top;align=center;outlineConnect=0;fontSize=11;',
    modelColor: '#0e7490',
  },
  switch: {
    w: 64,
    h: 32,
    style:
      'shape=mxgraph.cisco.switches.workgroup_switch;html=1;pointerEvents=1;dashed=0;fillColor=#4338ca;strokeColor=#ffffff;strokeWidth=2;verticalLabelPosition=bottom;verticalAlign=top;align=center;outlineConnect=0;fontSize=11;',
    modelColor: '#4338ca',
  },
  unknown: {
    w: 36,
    h: 36,
    style: 'ellipse;html=1;fillColor=#e2e8f0;strokeColor=#64748b;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;',
    modelColor: '#64748b',
  },
};

/**
 * draw.io / diagrams.net file using the current on-screen positions (Cisco router / switch shapes).
 * includePorts: add the connected interface names as labels at both ends of every link.
 */
export function buildDrawioXml(nodes, pairs, positions, { includePorts = true } = {}) {
  const b = boundsOf(positions);
  const offX = -b.minX + EXPORT_PAD.x;
  const offY = -b.minY + EXPORT_PAD.top;
  const cells = [];
  const cellId = {};

  nodes.forEach((node, i) => {
    const p = positions[node.id];
    if (!p) return;
    const s = DRAWIO_NODE[node.role] || DRAWIO_NODE.unknown;
    const id = `n${i}`;
    cellId[node.id] = id;
    const label = [
      `<b>${xmlEscape(node.hostname)}</b>`,
      node.ip ? xmlEscape(node.ip) : '',
      node.model ? `<font color="${s.modelColor}">${xmlEscape(node.model)}</font>` : '',
    ]
      .filter(Boolean)
      .join('<br>');
    cells.push(
      `<mxCell id="${id}" value="${xmlEscape(label)}" style="${s.style}" vertex="1" parent="1">` +
        `<mxGeometry x="${Math.round(p.x + offX - s.w / 2)}" y="${Math.round(p.y + offY - s.h / 2)}" width="${s.w}" height="${s.h}" as="geometry"/></mxCell>`
    );
  });

  pairs.forEach((pair, i) => {
    const source = cellId[pair.source];
    const target = cellId[pair.target];
    if (!source || !target) return;
    const count = pair.ports.length;
    const dashed = pair.ports.some((p) => p.confirmed) ? '' : 'dashed=1;';
    const id = `e${i}`;
    cells.push(
      `<mxCell id="${id}" value="${count > 1 ? `x${count}` : ''}" style="endArrow=none;html=1;rounded=0;strokeColor=#64748b;strokeWidth=${1 + Math.min(count - 1, 4)};${dashed}fontColor=#b45309;fontStyle=1;" edge="1" parent="1" source="${source}" target="${target}">` +
        `<mxGeometry relative="1" as="geometry"/></mxCell>`
    );
    if (!includePorts) return;
    [
      ['s', -0.65, pair.ports.map((p) => p.sp)],
      ['t', 0.65, pair.ports.map((p) => p.tp)],
    ].forEach(([suffix, pos, ports]) => {
      const value = ports.map(xmlEscape).join('<br>');
      cells.push(
        `<mxCell id="${id}${suffix}" value="${xmlEscape(value)}" style="edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];fontSize=9;labelBackgroundColor=#ffffff;" vertex="1" connectable="0" parent="${id}">` +
          `<mxGeometry x="${pos}" relative="1" as="geometry"><mxPoint as="offset"/></mxGeometry></mxCell>`
      );
    });
  });

  const pageW = Math.ceil(b.maxX - b.minX + EXPORT_PAD.x * 2);
  const pageH = Math.ceil(b.maxY - b.minY + EXPORT_PAD.top + EXPORT_PAD.bottom);
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<mxfile host="app.diagrams.net" type="device"><diagram id="lldp-topology" name="LLDP Topology">` +
    `<mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="${pageW}" pageHeight="${pageH}" math="0" shadow="0">` +
    `<root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells.join('')}</root></mxGraphModel></diagram></mxfile>\n`
  );
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Uncompressed (store) ZIP; PNG data is already compressed. files: [{ name, data: Uint8Array | string }] */
export function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const DOS_DATE_1980_01_01 = 0x21;

  files.forEach((f) => {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // store
    local.setUint16(12, DOS_DATE_1980_01_01, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, data);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint16(14, DOS_DATE_1980_01_01, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, data.length, true);
    cen.setUint32(24, data.length, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);

    offset += 30 + name.length + data.length;
  });

  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}
