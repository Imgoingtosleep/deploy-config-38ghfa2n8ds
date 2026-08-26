from fastapi import APIRouter
from app.schemas.device import DeviceCredentials, DeviceTestResult
from app.services.netmiko_service import NetmikoService

router = APIRouter()

SUPPORTED_DEVICE_TYPES = [
    {"label": "Cisco IOS / IOS-XE (SSH)", "value": "cisco_ios"},
    {"label": "Cisco IOS (Telnet - No Auth / Simple Pass)", "value": "cisco_ios_telnet"},
    {"label": "Cisco NX-OS", "value": "cisco_nxos"},
    {"label": "Huawei VRP (SSH)", "value": "huawei"},
    {"label": "Huawei VRP (Telnet)", "value": "huawei_telnet"},
    {"label": "Aruba OS-CX / ProCurve", "value": "aruba_os"},
    {"label": "Juniper JunOS", "value": "juniper_junos"},
    {"label": "MikroTik RouterOS", "value": "mikrotik_routeros"},
    {"label": "Linux / Cumulus", "value": "linux"},
    {"label": "Generic Telnet (No Auth / Lab Switch)", "value": "generic_termserver_telnet"},
    {"label": "Generic SSH / Paramiko", "value": "generic_termserver"},
]

@router.get("/types")
def get_supported_device_types():
    """Return supported Netmiko device drivers"""
    return {"device_types": SUPPORTED_DEVICE_TYPES}

@router.post("/test-connection", response_model=DeviceTestResult)
def test_connection(device: DeviceCredentials):
    """Test SSH connectivity and credentials on the target network device"""
    connected, message, prompt = NetmikoService.test_connection(device)
    return DeviceTestResult(
        host=device.host,
        status="connected" if connected else "failed",
        connected=connected,
        message=message,
        device_prompt=prompt if connected else None,
    )
