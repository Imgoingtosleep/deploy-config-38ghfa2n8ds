from fastapi import APIRouter
from app.core.config import settings
from app.schemas.device import DeviceCredentials, DeviceTestResult
from app.services.netmiko_service import NetmikoService

router = APIRouter()

SUPPORTED_DEVICE_TYPES = [
    {"label": "Auto Detect (Recommended)", "value": "autodetect"},
    {"label": "Huawei VRP (SSH)", "value": "huawei"},
    {"label": "Huawei VRP (Telnet)", "value": "huawei_telnet"},
    {"label": "Cisco IOS / IOS-XE (SSH)", "value": "cisco_ios"},
    {"label": "Cisco IOS (Telnet - No Auth / Simple Pass)", "value": "cisco_ios_telnet"},
    {"label": "Cisco NX-OS", "value": "cisco_nxos"},
    {"label": "Aruba OS-CX / ProCurve", "value": "aruba_os"},
    {"label": "Juniper JunOS", "value": "juniper_junos"},
    {"label": "HP / H3C Comware", "value": "hp_comware"},
    {"label": "MikroTik RouterOS", "value": "mikrotik_routeros"},
    {"label": "Linux / Cumulus", "value": "linux"},
    {"label": "Generic Telnet (No Auth / Lab Switch)", "value": "generic_termserver_telnet"},
    {"label": "Generic SSH / Paramiko", "value": "generic_termserver"},
]


@router.get("/types")
def get_supported_device_types():
    """Return supported Netmiko device drivers"""
    return {"device_types": SUPPORTED_DEVICE_TYPES}

@router.get("/serial-ports")
def get_available_serial_ports():
    """Detect and return available serial ports on host"""
    import re
    import serial.tools.list_ports
    ports = []
    for p in serial.tools.list_ports.comports():
        device_path = p.device
        label = device_path
        # If /dev/ttyS<N>, annotate with (COM<N> on Windows)
        match = re.match(r"^/dev/ttyS(\d+)$", device_path)
        if match:
            com_num = match.group(1)
            label = f"{device_path} (COM{com_num})"
        ports.append({"value": device_path, "label": label, "description": p.description})
    
    return {"serial_ports": ports}

@router.post("/test-connection", response_model=DeviceTestResult)
def test_connection(device: DeviceCredentials):
    """Test SSH connectivity and credentials on the target network device with priority fallback"""
    connected, message, prompt, winning_cred, attempt_logs = NetmikoService.test_connection(device)
    return DeviceTestResult(
        host=device.host,
        status="connected" if connected else "failed",
        connected=connected,
        message=message,
        device_prompt=prompt if connected else None,
        authenticated_credential=winning_cred,
        attempt_logs=attempt_logs,
    )


from concurrent.futures import ThreadPoolExecutor
from typing import List
from app.services.autodetect_service import AutoDetectService

@router.post("/detect-type")
def detect_single_device_type(device: DeviceCredentials):
    """Auto-detect vendor/driver type for a single network device"""
    detected_type, reason = AutoDetectService.detect_device_type(device)
    return {
        "host": device.host,
        "device_type": detected_type,
        "reason": reason,
    }


@router.post("/detect-fleet")
def detect_fleet_types(devices: List[DeviceCredentials]):
    """Auto-detect vendor/driver types concurrently across fleet devices"""
    if not devices:
        return {"results": []}

    results = [None] * len(devices)

    def _probe_dev(dev: DeviceCredentials, index: int):
        d_type, reason = AutoDetectService.detect_device_type(dev)
        dev_id = getattr(dev, "id", None) or f"dev-{index+1}"
        return {
            "id": dev_id,
            "host": dev.host,
            "device_type": d_type,
            "reason": reason,
        }

    workers_val = max(10, min(getattr(settings, "DEFAULT_NUM_WORKERS", 10), 100))
    with ThreadPoolExecutor(max_workers=min(len(devices), workers_val)) as executor:
        future_map = {executor.submit(_probe_dev, dev, idx): idx for idx, dev in enumerate(devices)}
        for future in future_map:
            idx = future_map[future]
            try:
                results[idx] = future.result()
            except Exception as e:
                dev_id = getattr(devices[idx], "id", None) or f"dev-{idx+1}"
                results[idx] = {
                    "id": dev_id,
                    "host": devices[idx].host,
                    "device_type": "huawei",
                    "reason": f"Probe error: {str(e)}",
                }

    return {"results": results}




from fastapi import File, UploadFile, Form, HTTPException
from fastapi.responses import Response
from app.services.inventory_parser import InventoryParser

@router.post("/import")
async def import_devices(
    file: UploadFile = File(...),
    default_device_type: str = Form("huawei"),
    default_username: str = Form(""),
    default_password: str = Form(""),
    default_port: int = Form(22),
    default_secret: str = Form(""),
):
    """
    Import device inventory from CSV, XLSX, JSON, or YAML files.
    Extracts IP/host, port, device_type, username, password, and secret with intelligent column matching.
    """
    filename = file.filename or "unknown"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    content_bytes = await file.read()
    if not content_bytes:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    devices = []
    try:
        if ext in ["csv", "txt"]:
            devices = InventoryParser.parse_csv(
                content_bytes,
                default_device_type=default_device_type,
                default_username=default_username,
                default_password=default_password,
                default_port=default_port,
                default_secret=default_secret,
            )
        elif ext in ["xlsx", "xlsm", "xls"]:
            devices = InventoryParser.parse_xlsx(
                content_bytes,
                default_device_type=default_device_type,
                default_username=default_username,
                default_password=default_password,
                default_port=default_port,
                default_secret=default_secret,
            )
        elif ext == "json":
            devices = InventoryParser.parse_json(
                content_bytes,
                default_device_type=default_device_type,
                default_username=default_username,
                default_password=default_password,
                default_port=default_port,
                default_secret=default_secret,
            )
        elif ext in ["yaml", "yml"]:
            devices = InventoryParser.parse_yaml(
                content_bytes,
                default_device_type=default_device_type,
                default_username=default_username,
                default_password=default_password,
                default_port=default_port,
                default_secret=default_secret,
            )
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file format '{ext}'. Please upload a CSV, XLSX, JSON, or YAML file.",
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to parse {filename}: {str(e)}",
        )

    if not devices:
        raise HTTPException(
            status_code=400,
            detail="No valid IP addresses or host records found in the uploaded file.",
        )

    return {
        "success": True,
        "filename": filename,
        "format": ext,
        "count": len(devices),
        "devices": devices,
    }


@router.get("/templates/{format_name}")
def download_inventory_template(format_name: str):
    """Download ready-to-use sample IP list template (csv, xlsx, json, yaml) containing only IP addresses"""
    fmt = format_name.lower().strip()

    if fmt == "csv":
        csv_data = (
            "ip\n"
            "192.168.1.1\n"
            "192.168.1.2\n"
            "10.0.0.1\n"
            "10.0.0.2\n"
        )
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=fleet_ip_template.csv"},
        )

    elif fmt in ["yaml", "yml"]:
        yaml_data = (
            "# Fleet IP List YAML\n"
            "- 192.168.1.1\n"
            "- 192.168.1.2\n"
            "- 10.0.0.1\n"
            "- 10.0.0.2\n"
        )
        return Response(
            content=yaml_data,
            media_type="application/x-yaml",
            headers={"Content-Disposition": "attachment; filename=fleet_ip_template.yaml"},
        )

    elif fmt == "json":
        json_data = [
            "192.168.1.1",
            "192.168.1.2",
            "10.0.0.1",
            "10.0.0.2",
        ]
        import json as json_lib
        return Response(
            content=json_lib.dumps(json_data, indent=2),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=fleet_ip_template.json"},
        )

    elif fmt == "xlsx":
        import io
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Fleet_IP_List"
        ws.append(["ip"])
        ws.append(["192.168.1.1"])
        ws.append(["192.168.1.2"])
        ws.append(["10.0.0.1"])
        ws.append(["10.0.0.2"])

        stream = io.BytesIO()
        wb.save(stream)
        stream.seek(0)
        return Response(
            content=stream.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=fleet_ip_template.xlsx"},
        )

    else:
        raise HTTPException(status_code=400, detail="Supported template formats: csv, xlsx, json, yaml")


