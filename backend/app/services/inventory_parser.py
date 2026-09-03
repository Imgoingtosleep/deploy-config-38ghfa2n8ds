import csv
import io
import json
import re
from typing import Any, Dict, List, Optional, Tuple
import yaml
import openpyxl

# Normalization maps for device types/vendors
DEVICE_TYPE_MAP = {
    "huawei": "huawei",
    "vrp": "huawei",
    "quidway": "huawei",
    "cloudengine": "huawei",
    "huawei_vrp": "huawei",
    "huawei_telnet": "huawei_telnet",
    "cisco": "cisco_ios",
    "cisco_ios": "cisco_ios",
    "ios": "cisco_ios",
    "ios-xe": "cisco_ios",
    "ios_xe": "cisco_ios",
    "cisco_xe": "cisco_ios",
    "cisco_telnet": "cisco_ios_telnet",
    "cisco_ios_telnet": "cisco_ios_telnet",
    "cisco_nxos": "cisco_nxos",
    "nxos": "cisco_nxos",
    "hp": "hp_comware",
    "h3c": "hp_comware",
    "comware": "hp_comware",
    "hp_comware": "hp_comware",
    "aruba": "aruba_os",
    "aruba_os": "aruba_os",
    "procurve": "aruba_os",
    "juniper": "juniper_junos",
    "junos": "juniper_junos",
    "juniper_junos": "juniper_junos",
    "mikrotik": "mikrotik_routeros",
    "routeros": "mikrotik_routeros",
    "linux": "linux",
}

def normalize_key(k: Any) -> str:
    """Normalize dictionary keys or column headers"""
    if not k:
        return ""
    clean = str(k).strip().lower()
    clean = re.sub(r"[\s_\-]+", "_", clean)
    return clean

def normalize_device_type(raw_type: Optional[str], default_type: str = "huawei") -> str:
    """Map human or vendor strings to Netmiko device_type"""
    if not raw_type:
        return default_type
    val = str(raw_type).strip().lower()
    val_clean = re.sub(r"[\s_\-]+", "_", val)
    return DEVICE_TYPE_MAP.get(val_clean, val)

def clean_host_and_port(raw_host: Any, default_port: int = 22) -> Tuple[str, int]:
    """Extract and sanitize host/IP and port (e.g. 192.168.1.1:2222 -> host: 192.168.1.1, port: 2222)"""
    if not raw_host:
        return "", default_port
    host_str = str(raw_host).strip()
    # Strip protocol prefix if present
    host_str = re.sub(r"^https?://", "", host_str, flags=re.IGNORECASE)
    host_str = re.sub(r"^ssh://", "", host_str, flags=re.IGNORECASE)
    host_str = re.sub(r"^telnet://", "", host_str, flags=re.IGNORECASE)
    host_str = host_str.rstrip("/")

    # Check for IP:Port or host:port format
    if ":" in host_str and not host_str.startswith("[") and host_str.count(":") == 1:
        parts = host_str.split(":")
        if parts[1].isdigit():
            return parts[0].strip(), int(parts[1])

    return host_str, default_port

def parse_record_to_device(
    item: Dict[str, Any],
    idx: int,
    default_device_type: str = "huawei",
    default_username: str = "",
    default_password: str = "",
    default_port: int = 22,
    default_secret: str = "",
) -> Optional[Dict[str, Any]]:
    """Convert any arbitrary dictionary row into a standardized Fleet Device object"""
    norm_dict = {normalize_key(k): v for k, v in item.items() if k is not None}

    # Match Host / IP
    raw_host = (
        norm_dict.get("host")
        or norm_dict.get("ip")
        or norm_dict.get("ip_address")
        or norm_dict.get("device_ip")
        or norm_dict.get("host_ip")
        or norm_dict.get("hostname")
        or norm_dict.get("mgmt_ip")
        or norm_dict.get("address")
        or norm_dict.get("target")
        or norm_dict.get("ipaddress")
    )

    if not raw_host:
        return None

    host, port = clean_host_and_port(raw_host, default_port)
    if not host:
        return None

    # Match Port if specified separately
    raw_port = norm_dict.get("port") or norm_dict.get("ssh_port") or norm_dict.get("port_number")
    if raw_port:
        try:
            port = int(raw_port)
        except (ValueError, TypeError):
            pass

    # Match Device Type / Vendor
    raw_type = (
        norm_dict.get("device_type")
        or norm_dict.get("type")
        or norm_dict.get("vendor")
        or norm_dict.get("platform")
        or norm_dict.get("os")
        or norm_dict.get("driver")
    )
    device_type = normalize_device_type(raw_type, default_device_type)

    # Match Credentials
    username = str(
        norm_dict.get("username")
        or norm_dict.get("user")
        or norm_dict.get("login")
        or norm_dict.get("account")
        or default_username
    ).strip()

    password = str(
        norm_dict.get("password")
        or norm_dict.get("pass")
        or norm_dict.get("pwd")
        or default_password
    ).strip()

    secret = str(
        norm_dict.get("secret")
        or norm_dict.get("enable_password")
        or norm_dict.get("enable_secret")
        or norm_dict.get("super_password")
        or default_secret
    ).strip()

    return {
        "id": f"dev-{idx + 1}",
        "host": host,
        "port": port,
        "device_type": device_type,
        "username": username,
        "password": password,
        "secret": secret,
    }


class InventoryParser:
    @classmethod
    def parse_csv(
        cls,
        content_bytes: bytes,
        default_device_type: str = "huawei",
        default_username: str = "",
        default_password: str = "",
        default_port: int = 22,
        default_secret: str = "",
    ) -> List[Dict[str, Any]]:
        """Parse CSV content supporting comma, semicolon, tab with automatic encoding detection"""
        text = ""
        for encoding in ["utf-8-sig", "utf-8", "latin-1", "cp1252"]:
            try:
                text = content_bytes.decode(encoding)
                break
            except UnicodeDecodeError:
                continue

        if not text:
            return []

        lines = [line for line in text.splitlines() if line.strip()]
        if not lines:
            return []

        # Detect delimiter
        first_line = lines[0]
        dialect_delim = ","
        if "\t" in first_line and first_line.count("\t") > first_line.count(","):
            dialect_delim = "\t"
        elif ";" in first_line and first_line.count(";") > first_line.count(","):
            dialect_delim = ";"

        reader = csv.DictReader(lines, delimiter=dialect_delim)
        devices = []
        
        # If headers exist
        if reader.fieldnames:
            normalized_fields = [normalize_key(f) for f in reader.fieldnames]
            # Check if any IP/host column is present
            has_host_col = any(f in ["host", "ip", "ip_address", "hostname", "mgmt_ip", "address", "target"] for f in normalized_fields)
            if has_host_col:
                for idx, row in enumerate(reader):
                    dev = parse_record_to_device(
                        row,
                        len(devices),
                        default_device_type,
                        default_username,
                        default_password,
                        default_port,
                        default_secret,
                    )
                    if dev:
                        devices.append(dev)
                return devices

        # Fallback for plain list of IPs with no headers (single column or comma separated)
        simple_reader = csv.reader(lines, delimiter=dialect_delim)
        for row in simple_reader:
            if not row:
                continue
            first_val = row[0].strip()
            # Ignore header-like words if no header detected
            if first_val.lower() in ["ip", "host", "hostname", "ip address", "#"]:
                continue
            dev = {
                "id": f"dev-{len(devices) + 1}",
                "host": first_val,
                "port": int(row[1]) if len(row) > 1 and row[1].strip().isdigit() else default_port,
                "device_type": normalize_device_type(row[2] if len(row) > 2 else None, default_device_type),
                "username": row[3].strip() if len(row) > 3 else default_username,
                "password": row[4].strip() if len(row) > 4 else default_password,
                "secret": row[5].strip() if len(row) > 5 else default_secret,
            }
            if dev["host"]:
                devices.append(dev)

        return devices

    @classmethod
    def parse_xlsx(
        cls,
        content_bytes: bytes,
        default_device_type: str = "huawei",
        default_username: str = "",
        default_password: str = "",
        default_port: int = 22,
        default_secret: str = "",
    ) -> List[Dict[str, Any]]:
        """Parse Excel (.xlsx / .xlsm) file using openpyxl"""
        wb = openpyxl.load_workbook(io.BytesIO(content_bytes), data_only=True)
        sheet = wb.active
        if not sheet:
            return []

        rows = list(sheet.iter_rows(values_only=True))
        if not rows:
            return []

        # Find header row
        header_idx = -1
        headers = []
        for r_idx, row in enumerate(rows[:5]):
            row_keys = [normalize_key(cell) for cell in row if cell is not None]
            if any(k in ["host", "ip", "ip_address", "hostname", "mgmt_ip", "address", "device_ip"] for k in row_keys):
                header_idx = r_idx
                headers = [str(c).strip() if c is not None else "" for c in row]
                break

        devices = []
        if header_idx != -1 and headers:
            for row in rows[header_idx + 1:]:
                if not any(cell is not None for cell in row):
                    continue
                row_dict = {}
                for h_idx, val in enumerate(row):
                    if h_idx < len(headers) and headers[h_idx]:
                        row_dict[headers[h_idx]] = val
                dev = parse_record_to_device(
                    row_dict,
                    len(devices),
                    default_device_type,
                    default_username,
                    default_password,
                    default_port,
                    default_secret,
                )
                if dev:
                    devices.append(dev)
        else:
            # Fallback: Column 1 is IP
            for row in rows:
                if not row or row[0] is None:
                    continue
                first_cell = str(row[0]).strip()
                if first_cell.lower() in ["ip", "host", "hostname", "ip address", "#"]:
                    continue
                dev = {
                    "id": f"dev-{len(devices) + 1}",
                    "host": first_cell,
                    "port": int(row[1]) if len(row) > 1 and row[1] is not None and str(row[1]).isdigit() else default_port,
                    "device_type": normalize_device_type(str(row[2]) if len(row) > 2 and row[2] is not None else None, default_device_type),
                    "username": str(row[3]).strip() if len(row) > 3 and row[3] is not None else default_username,
                    "password": str(row[4]).strip() if len(row) > 4 and row[4] is not None else default_password,
                    "secret": str(row[5]).strip() if len(row) > 5 and row[5] is not None else default_secret,
                }
                if dev["host"]:
                    devices.append(dev)

        return devices

    @classmethod
    def parse_json(
        cls,
        content_bytes: bytes,
        default_device_type: str = "huawei",
        default_username: str = "",
        default_password: str = "",
        default_port: int = 22,
        default_secret: str = "",
    ) -> List[Dict[str, Any]]:
        """Parse JSON array or object structure"""
        text = content_bytes.decode("utf-8-sig", errors="ignore")
        data = json.loads(text)
        items = []

        if isinstance(data, list):
            items = data
        elif isinstance(data, dict):
            # Check common root keys
            for key in ["devices", "hosts", "inventory", "nodes", "targets", "fleet"]:
                if key in data and isinstance(data[key], list):
                    items = data[key]
                    break
                elif key in data and isinstance(data[key], dict):
                    # Dict of host objects: { "r1": { "ip": ... } }
                    items = [{"hostname": k, **v} if isinstance(v, dict) else {"host": str(v)} for k, v in data[key].items()]
                    break
            if not items:
                # Top level dict: { "r1": { "ip": ... }, "r2": { "ip": ... } }
                items = [{"hostname": k, **v} if isinstance(v, dict) else {"host": str(v)} for k, v in data.items()]

        devices = []
        for idx, item in enumerate(items):
            if isinstance(item, dict):
                dev = parse_record_to_device(
                    item,
                    len(devices),
                    default_device_type,
                    default_username,
                    default_password,
                    default_port,
                    default_secret,
                )
                if dev:
                    devices.append(dev)
            elif isinstance(item, str):
                # Simple string list of IPs: ["192.168.1.1", "192.168.1.2"]
                host, port = clean_host_and_port(item, default_port)
                if host:
                    devices.append({
                        "id": f"dev-{len(devices) + 1}",
                        "host": host,
                        "port": port,
                        "device_type": default_device_type,
                        "username": default_username,
                        "password": default_password,
                        "secret": default_secret,
                    })

        return devices

    @classmethod
    def parse_yaml(
        cls,
        content_bytes: bytes,
        default_device_type: str = "huawei",
        default_username: str = "",
        default_password: str = "",
        default_port: int = 22,
        default_secret: str = "",
    ) -> List[Dict[str, Any]]:
        """Parse YAML content including Nornir hosts.yaml format"""
        text = content_bytes.decode("utf-8-sig", errors="ignore")
        data = yaml.safe_load(text)
        if not data:
            return []

        items = []
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict):
            # Check if Nornir hosts format: { "host_name": { "hostname": "192.168.1.1", "platform": "huawei", ... } }
            for name, host_spec in data.items():
                if isinstance(host_spec, dict):
                    merged = dict(host_spec)
                    if "hostname" not in merged and "host" not in merged and "ip" not in merged:
                        merged["host"] = name
                    items.append(merged)
                elif isinstance(host_spec, str):
                    items.append({"host": host_spec, "name": name})

        devices = []
        for idx, item in enumerate(items):
            if isinstance(item, dict):
                dev = parse_record_to_device(
                    item,
                    len(devices),
                    default_device_type,
                    default_username,
                    default_password,
                    default_port,
                    default_secret,
                )
                if dev:
                    devices.append(dev)
            elif isinstance(item, str):
                host, port = clean_host_and_port(item, default_port)
                if host:
                    devices.append({
                        "id": f"dev-{len(devices) + 1}",
                        "host": host,
                        "port": port,
                        "device_type": default_device_type,
                        "username": default_username,
                        "password": default_password,
                        "secret": default_secret,
                    })

        return devices
