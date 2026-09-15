"""
Import an exported LLDP topology back into LLDP inventory rows.

Supported files:
  .drawio / .xml   draw.io diagram (plain or compressed). Device / link data attributes written by our
                   export win; cells without them (older exports or shapes drawn by hand) fall back to the
                   visible label: hostname / IP / model lines and interface labels at the link ends.
  .svg             SVG exported here (<metadata id="lldp-topology">) or a draw.io .drawio.svg
  .png             PNG exported here (iTXt "lldp-topology") or a draw.io .drawio.png
  .zip             PNG tiles ZIP (topology.json) or any ZIP holding one of the files above
  .json            topology.json
"""
import base64
import binascii
import io
import json
import re
import struct
import xml.etree.ElementTree as ET
import zipfile
import zlib
from html import unescape
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import unquote

from app.services.lldp_service import LldpService

PAYLOAD_FORMAT = "lldp-topology"
MAX_IMPORT_BYTES = 50 * 1024 * 1024
_IPV4_RE = re.compile(r"^\d{1,3}(?:\.\d{1,3}){3}$")
_ROLES = ("router", "switch", "unknown")


class TopologyImportError(ValueError):
    pass


def _inflate(data: bytes, wbits: int) -> bytes:
    d = zlib.decompressobj(wbits)
    out = d.decompress(data, MAX_IMPORT_BYTES)
    if d.unconsumed_tail:
        raise TopologyImportError("Embedded data is too large")
    return out


def _parse_xml(text: str) -> ET.Element:
    # Exported files never use DTDs; refusing them avoids entity expansion tricks
    if re.search(r"<!(DOCTYPE|ENTITY)", text[:4096], re.IGNORECASE):
        raise TopologyImportError("XML with DOCTYPE / ENTITY is not accepted")
    return ET.fromstring(text)


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _label_lines(value: str) -> List[str]:
    text = re.sub(r"<br\s*/?>|</div>|</p>", "\n", value or "", flags=re.IGNORECASE)
    text = unescape(re.sub(r"<[^>]+>", "", text))
    return [line.strip() for line in text.splitlines() if line.strip() and not re.fullmatch(r"%\w+%", line.strip())]


def _split(value: Optional[str]) -> List[str]:
    return [p.strip() for p in value.split(";")] if value else []


# ---------------------------------------------------------------- topology helpers


def normalize_topology(nodes: Dict[str, Dict[str, Any]], links: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Fill missing endpoints, merge duplicate / reversed links, recompute role (AR / NE = router) and degree"""
    for link in links:
        for end in ("source", "target"):
            name = link[end]
            nodes.setdefault(name, {"id": name, "hostname": name, "ip": "", "model": "", "discovered": False})

    merged: Dict[Any, Dict[str, Any]] = {}
    for link in links:
        if link["source"] == link["target"]:
            continue
        a = (link["source"], LldpService.intf_key(link.get("source_port", "")))
        b = (link["target"], LldpService.intf_key(link.get("target_port", "")))
        key = tuple(sorted([a, b]))
        if key in merged:
            existing = merged[key]
            if link.get("confirmed") or existing["source"] != link["source"]:
                existing["confirmed"] = True
            continue
        merged[key] = {
            "source": link["source"],
            "target": link["target"],
            "source_port": link.get("source_port", ""),
            "target_port": link.get("target_port", ""),
            "confirmed": bool(link.get("confirmed")),
        }

    degree: Dict[str, int] = {}
    for link in merged.values():
        degree[link["source"]] = degree.get(link["source"], 0) + 1
        degree[link["target"]] = degree.get(link["target"], 0) + 1
    for node in nodes.values():
        hint = node.get("role") if node.get("role") in _ROLES else "unknown"
        node["role"] = LldpService.device_role(node.get("model", "")) if node.get("model") else hint
        node["degree"] = degree.get(node["id"], 0)

    order = {"router": 0, "switch": 1, "unknown": 2}
    return {
        "nodes": sorted(nodes.values(), key=lambda n: (order[n["role"]], -n["degree"], n["hostname"])),
        "links": list(merged.values()),
    }


def neighbors_from_topology(topology: Dict[str, Any]) -> List[Dict[str, str]]:
    """One row per link from the source side, plus the reverse row when both sides saw the link"""
    by_id = {n["id"]: n for n in topology["nodes"]}

    def row(local: Dict[str, Any], local_port: str, remote: Dict[str, Any], remote_port: str) -> Dict[str, str]:
        return {
            "Local Device": local["hostname"],
            "Local Model": local.get("model", ""),
            "Local IP": local.get("ip", ""),
            "Local Port": local_port or "",
            "Remote Device": remote["hostname"],
            "Remote Model": remote.get("model", ""),
            "Remote Port": remote_port or "",
            "Remote IP": remote.get("ip", ""),
        }

    rows = []
    for link in topology["links"]:
        src, dst = by_id[link["source"]], by_id[link["target"]]
        rows.append(row(src, link["source_port"], dst, link["target_port"]))
        if link["confirmed"]:
            rows.append(row(dst, link["target_port"], src, link["source_port"]))
    return rows


def _hosts_from_topology(topology: Dict[str, Any], neighbors: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    counts: Dict[str, int] = {}
    for n in neighbors:
        counts[n.get("Local Device", "")] = counts.get(n.get("Local Device", ""), 0) + 1
    return [
        {
            "hostname": node["hostname"],
            "ip": node.get("ip", ""),
            "model": node.get("model", ""),
            "depth": 0,
            "status": "IMPORTED",
            "success": True,
            "error": None,
            "detail": "SSH collected when exported" if node.get("discovered") else "Seen via LLDP only when exported",
            "neighbors_found": counts.get(node["hostname"], 0),
            "neighbors": [],
            "log": "",
            "raw_output": "",
            "execution_time_seconds": 0,
        }
        for node in topology["nodes"]
    ]


# ---------------------------------------------------------------- draw.io


def _graph_models(text: str) -> List[ET.Element]:
    root = _parse_xml(text)
    if _local(root.tag) == "mxGraphModel":
        return [root]
    models = []
    for diagram in root.iter("diagram"):
        model = diagram.find("mxGraphModel")
        if model is None and (diagram.text or "").strip():
            # Compressed page: base64 -> raw deflate -> URI encoded XML
            inflated = _inflate(base64.b64decode(diagram.text.strip()), -15).decode("utf-8")
            model = _parse_xml(unquote(inflated))
        if model is not None:
            models.append(model)
    if not models:
        raise TopologyImportError("No diagram found in the draw.io file")
    return models


def _float(value: Optional[str], default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def parse_drawio(text: str) -> Tuple[Dict[str, Dict[str, Any]], List[Dict[str, Any]]]:
    nodes: Dict[str, Dict[str, Any]] = {}
    links: List[Dict[str, Any]] = []

    for page, model in enumerate(_graph_models(text)):
        root = model.find("root")
        if root is None:
            continue
        cells: Dict[str, Tuple[Dict[str, str], ET.Element]] = {}
        for el in list(root):
            tag = _local(el.tag)
            if tag == "mxCell":
                attrs = {"label": el.get("value", "")}
                cells[el.get("id")] = (attrs, el)
            elif tag in ("object", "UserObject"):
                cell = el.find("mxCell")
                if cell is not None:
                    cells[el.get("id")] = (dict(el.attrib), cell)

        edge_ids = {cid for cid, (_, cell) in cells.items() if cell.get("edge") == "1"}
        endpoints = {cells[cid][1].get(end) for cid in edge_ids for end in ("source", "target")}

        name_of: Dict[str, str] = {}
        port_labels: Dict[str, Dict[str, List[str]]] = {}
        for cid, (attrs, cell) in cells.items():
            if cell.get("vertex") != "1":
                continue
            parent = cell.get("parent")
            if parent in edge_ids:
                geo = cell.find("mxGeometry")
                side = "source" if _float(geo.get("x") if geo is not None else None) < 0 else "target"
                port_labels.setdefault(parent, {})[side] = _label_lines(attrs.get("label", ""))
                continue
            # Plain text boxes / containers are ignored unless they are devices or something links to them
            if attrs.get("lldp_type") != "device" and "hostname" not in attrs and cid not in endpoints:
                continue

            lines = _label_lines(attrs.get("label", ""))
            hostname = (attrs.get("hostname") or (lines[0] if lines else "")).strip() or f"Device-{page + 1}-{cid}"
            ip = (attrs.get("ip") or next((l for l in lines[1:] if _IPV4_RE.match(l)), "")).strip()
            model_name = (attrs.get("model") or LldpService.extract_model("\n".join(lines[1:]))).strip()
            style = (cell.get("style") or "").lower()
            role_hint = attrs.get("role") or ("router" if "router" in style else "switch" if "switch" in style else "unknown")

            geo = cell.find("mxGeometry")
            node = nodes.setdefault(hostname, {"id": hostname, "hostname": hostname, "ip": "", "model": "", "discovered": False})
            node["ip"] = node["ip"] or ip
            node["model"] = node["model"] or model_name
            node["role"] = role_hint
            node["discovered"] = node["discovered"] or attrs.get("discovered") == "yes"
            if geo is not None and "x" not in node:
                node["x"] = _float(geo.get("x")) + _float(geo.get("width")) / 2
                node["y"] = _float(geo.get("y")) + _float(geo.get("height")) / 2
            name_of[cid] = hostname

        for cid in edge_ids:
            attrs, cell = cells[cid]
            source, target = name_of.get(cell.get("source")), name_of.get(cell.get("target"))
            if not source or not target or source == target:
                continue
            labels = port_labels.get(cid, {})
            source_ports = _split(attrs["source_ports"]) if "source_ports" in attrs else labels.get("source", [])
            target_ports = _split(attrs["target_ports"]) if "target_ports" in attrs else labels.get("target", [])
            confirmed = _split(attrs.get("confirmed"))
            count_label = re.fullmatch(r"\s*x(\d+)\s*", _label_lines(attrs.get("label", ""))[0] if _label_lines(attrs.get("label", "")) else "")
            count = max(len(source_ports), len(target_ports), int(count_label.group(1)) if count_label else 1)
            for i in range(count):
                links.append({
                    "source": source,
                    "target": target,
                    "source_port": source_ports[i] if i < len(source_ports) else "",
                    "target_port": target_ports[i] if i < len(target_ports) else "",
                    "confirmed": i < len(confirmed) and confirmed[i] == "yes",
                })

    if not nodes:
        raise TopologyImportError("No devices found in the draw.io diagram")
    return nodes, links


# ---------------------------------------------------------------- embedded payload (SVG / PNG / JSON)


def parse_payload(data: Any) -> Tuple[Dict[str, Any], Optional[List[Dict[str, Any]]]]:
    if not isinstance(data, dict) or data.get("format") != PAYLOAD_FORMAT:
        raise TopologyImportError("JSON is not an LLDP topology export")
    topo = data.get("topology") or {}
    nodes: Dict[str, Dict[str, Any]] = {}
    for n in topo.get("nodes") or []:
        if not isinstance(n, dict):
            continue
        name = str(n.get("hostname") or n.get("id") or "").strip()
        if not name:
            continue
        node = {
            "id": name,
            "hostname": name,
            "ip": str(n.get("ip") or ""),
            "model": str(n.get("model") or ""),
            "role": n.get("role"),
            "discovered": bool(n.get("discovered")),
        }
        if isinstance(n.get("x"), (int, float)) and isinstance(n.get("y"), (int, float)):
            node["x"], node["y"] = float(n["x"]), float(n["y"])
        nodes[name] = node
    links = [
        {
            "source": str(l.get("source") or ""),
            "target": str(l.get("target") or ""),
            "source_port": str(l.get("source_port") or ""),
            "target_port": str(l.get("target_port") or ""),
            "confirmed": bool(l.get("confirmed")),
        }
        for l in topo.get("links") or []
        if isinstance(l, dict) and l.get("source") and l.get("target")
    ]
    rows = data.get("neighbors")
    neighbors = [r for r in rows if isinstance(r, dict)] if isinstance(rows, list) and rows else None
    return normalize_topology(nodes, links), neighbors


def _png_texts(content: bytes) -> Dict[str, str]:
    texts: Dict[str, str] = {}
    pos = 8
    while pos + 12 <= len(content):
        (length,) = struct.unpack(">I", content[pos:pos + 4])
        ctype = content[pos + 4:pos + 8]
        data = content[pos + 8:pos + 8 + length]
        pos += 12 + length
        if ctype == b"tEXt":
            key, _, value = data.partition(b"\0")
            texts[key.decode("latin-1")] = value.decode("latin-1")
        elif ctype == b"zTXt":
            key, _, rest = data.partition(b"\0")
            texts[key.decode("latin-1")] = _inflate(rest[1:], 15).decode("latin-1")
        elif ctype == b"iTXt":
            key, _, rest = data.partition(b"\0")
            compressed = rest[:1] == b"\x01"
            rest = rest[2:].partition(b"\0")[2].partition(b"\0")[2]
            texts[key.decode("latin-1")] = (_inflate(rest, 15) if compressed else rest).decode("utf-8")
        elif ctype == b"IEND":
            break
    return texts


# ---------------------------------------------------------------- entry point


def _detect(content: bytes, name: str, depth: int = 0) -> Tuple[str, Dict[str, Any], Optional[List[Dict[str, Any]]]]:
    if content[:4] == b"PK\x03\x04":
        if depth:
            raise TopologyImportError("Nested ZIP files are not supported")
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            members = [i for i in zf.infolist() if not i.is_dir()]
            if sum(i.file_size for i in members) > MAX_IMPORT_BYTES * 4:
                raise TopologyImportError("ZIP content is too large")
            priority = (".json", ".drawio", ".xml", ".svg", ".png")
            for ext in priority:
                for info in members:
                    if info.filename.lower().endswith(ext):
                        try:
                            fmt, topology, neighbors = _detect(zf.read(info), info.filename, depth + 1)
                            return f"zip/{fmt}", topology, neighbors
                        except TopologyImportError:
                            continue
        raise TopologyImportError("ZIP has no importable topology (topology.json, .drawio, .svg or .png)")

    if content[:8] == b"\x89PNG\r\n\x1a\n":
        texts = _png_texts(content)
        if PAYLOAD_FORMAT in texts:
            topology, neighbors = parse_payload(json.loads(texts[PAYLOAD_FORMAT]))
            return "png", topology, neighbors
        if "mxfile" in texts:
            return "drawio.png", normalize_topology(*parse_drawio(unquote(texts["mxfile"]))), None
        raise TopologyImportError("PNG has no embedded topology data (only PNGs exported after this feature, or draw.io PNGs with an embedded diagram)")

    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise TopologyImportError("Unsupported file type")
    head = text.lstrip()[:5000]

    if head.startswith("{"):
        topology, neighbors = parse_payload(json.loads(text))
        return "json", topology, neighbors
    if "<mxfile" in head or head.startswith("<mxGraphModel"):
        return "drawio", normalize_topology(*parse_drawio(text)), None
    if "<svg" in head:
        root = _parse_xml(text)
        for el in root.iter():
            if _local(el.tag) == "metadata" and el.get("id") == PAYLOAD_FORMAT and (el.text or "").strip():
                topology, neighbors = parse_payload(json.loads(el.text))
                return "svg", topology, neighbors
        if "mxfile" in (root.get("content") or ""):
            return "drawio.svg", normalize_topology(*parse_drawio(root.get("content"))), None
        raise TopologyImportError("SVG has no embedded topology data (only SVGs exported after this feature, or draw.io SVGs)")
    raise TopologyImportError(f"Unsupported file '{name}': use .drawio, .svg, .png, .zip or .json exported from LLDP Discovery")


def import_topology_file(file_name: str, content: bytes) -> Dict[str, Any]:
    if len(content) > MAX_IMPORT_BYTES:
        raise TopologyImportError(f"File is larger than {MAX_IMPORT_BYTES // (1024 * 1024)} MB")
    try:
        fmt, topology, neighbors = _detect(content, file_name)
    except TopologyImportError:
        raise
    except (ValueError, SyntaxError, KeyError, TypeError, struct.error, zlib.error, binascii.Error, zipfile.BadZipFile) as e:
        # ET.ParseError is a SyntaxError, json / base64 errors are ValueErrors
        raise TopologyImportError(f"File is damaged or not a supported export ({type(e).__name__}: {e})")

    if neighbors is None:
        neighbors = neighbors_from_topology(topology)
    hosts = _hosts_from_topology(topology, neighbors)
    return {
        "imported": True,
        "file_name": file_name,
        "format": fmt,
        "total_hosts": len(hosts),
        "success_hosts": sum(1 for n in topology["nodes"] if n.get("discovered")),
        "failed_hosts": 0,
        "total_lldp_rows": len(neighbors),
        "overall_time_seconds": 0,
        "neighbors": neighbors,
        "hosts": hosts,
        "topology": topology,
    }
