import time
from typing import List, Dict, Optional, Any, Union
from concurrent.futures import ThreadPoolExecutor, as_completed
from fastapi import APIRouter
from app.schemas.command import (
    HealthCheckRequest,
    MultiCommandResponse,
    BatchHealthCheckRequest,
    BatchHealthCheckResponse,
)
from app.schemas.device import DeviceCredentials
from app.services.netmiko_service import NetmikoService
from app.services.parser_service import ParserService

router = APIRouter()

HEALTH_CHECK_PRESETS = {
    "cisco_ios": {
        "standard": [
            "show version",
            "show ip interface brief",
            "show interfaces status",
            "show cdp neighbors",
            "show environment",
            "show processes cpu sorted | head 10",
        ],
        "interfaces": [
            "show ip interface brief",
            "show interfaces status",
            "show interfaces description",
            "show interfaces summary",
        ],
        "transceiver": [
            "show interfaces transceiver",
            "show interfaces transceiver detail",
        ],
        "environment": [
            "show environment all",
            "show processes cpu",
            "show processes memory",
            "show power",
            "show inventory",
        ],
        "routing": [
            "show ip route",
            "show ip protocols",
            "show ip arp",
        ],
        "logs": [
            "show logging | last 50",
        ],
    },
    "huawei": {
        "standard": [
            "display version",
            "display interface brief",
            "display lldp neighbor brief",
            "display device",
            "display cpu-usage",
        ],
        "interfaces": [
            "display interface brief",
            "display ip interface brief",
        ],
        "transceiver": [
            "display transceiver",
            "display transceiver diagnosis interface",
            "display transceiver verbose",
        ],
        "environment": [
            "display device",
            "display temperature all",
            "display cpu-usage",
            "display memory-usage",
        ],
        "routing": [
            "display ip routing-table",
            "display arp all",
        ],
        "logs": [
            "display logbuffer",
            "display trapbuffer",
        ],
    },
    "juniper_junos": {
        "standard": [
            "show version",
            "show interfaces terse",
            "show chassis routing-engine",
            "show chassis environment",
            "show lldp neighbors",
            "show system storage",
        ],
        "interfaces": [
            "show interfaces terse",
            "show interfaces descriptions",
            "show interfaces extensive",
        ],
        "transceiver": [
            "show interfaces diagnostics optics",
        ],
        "environment": [
            "show chassis environment",
            "show chassis routing-engine",
            "show chassis hardware",
            "show system storage",
        ],
        "routing": [
            "show route summary",
            "show route",
            "show arp",
            "show bfd session",
        ],
        "logs": [
            "show log messages | last 50",
        ],
    },
    "cisco_nxos": {
        "standard": [
            "show version",
            "show ip interface brief",
            "show interface status",
            "show cdp neighbors",
            "show system resources",
            "show environment",
        ],
        "interfaces": [
            "show ip interface brief",
            "show interface status",
            "show interface description",
        ],
        "transceiver": [
            "show interface transceiver details",
        ],
        "environment": [
            "show environment",
            "show system resources",
            "show module",
        ],
        "routing": [
            "show ip route",
            "show ip arp",
        ],
        "logs": [
            "show logging last 50",
        ],
    },
    "aruba_os": {
        "standard": [
            "show version",
            "show interface brief",
            "show system",
            "show cpu",
            "show lldp info remote-device",
        ],
        "interfaces": [
            "show interface brief",
            "show interface status",
            "show interface custom",
        ],
        "transceiver": [
            "show interface transceiver",
        ],
        "environment": [
            "show system temperature",
            "show system fan",
            "show system power-supply",
        ],
        "routing": [
            "show ip route",
            "show arp",
        ],
        "logs": [
            "show logging -r | include 50",
        ],
    },
    "hp_comware": {
        "standard": [
            "display version",
            "display interface brief",
            "display device",
            "display cpu-usage",
            "display lldp neighbor list",
        ],
        "interfaces": [
            "display interface brief",
            "display ip interface brief",
        ],
        "transceiver": [
            "display transceiver verbose",
            "display transceiver diagnosis interface",
        ],
        "environment": [
            "display device",
            "display environment",
            "display cpu-usage",
            "display memory",
        ],
        "routing": [
            "display ip routing-table",
            "display arp all",
        ],
        "logs": [
            "display logbuffer",
        ],
    },
    "mikrotik_routeros": {
        "standard": [
            "/system resource print",
            "/interface print brief",
            "/system health print",
            "/ip address print",
        ],
        "interfaces": [
            "/interface print",
            "/ip address print",
        ],
        "transceiver": [
            "/interface ethernet monitor [find] once",
        ],
        "environment": [
            "/system health print",
            "/system resource print",
        ],
        "routing": [
            "/ip route print",
            "/ip arp print",
        ],
        "logs": [
            "/log print",
        ],
    },
}

def _execute_device_health_check(
    device: DeviceCredentials,
    check_type: str = "standard",
    custom_commands: List[str] = None,
    vendor_commands: Dict[str, List[str]] = None,
    command_regexes: Optional[Union[Dict[str, Any], List[Optional[str]]]] = None,
) -> MultiCommandResponse:
    device_type = (device.device_type or "").lower()
    if not device_type or device_type in ["autodetect", "auto"]:
        try:
            from app.services.autodetect_service import AutoDetectService
            detected_type, _ = AutoDetectService.detect_device_type(device)
            device.device_type = detected_type
            device_type = detected_type
        except Exception:
            from app.core.config import settings
            device_type = "huawei" if "huawei" in (settings.DEFAULT_DEVICE_TYPE or "").lower() else "cisco_ios"
    
    # Resolve vendor driver group for presets
    from app.services.command_translator import CommandTranslator
    driver_group = CommandTranslator._normalize_driver_group(device_type)

    short_aliases = {
        "cisco_ios": "cisco",
        "cisco_nxos": "nxos",
        "juniper_junos": "juniper",
        "aruba_os": "aruba",
        "hp_comware": "comware",
        "mikrotik_routeros": "mikrotik",
        "huawei": "huawei",
    }
    short = short_aliases.get(driver_group, "")

    v_cmds = None
    if vendor_commands:
        v_cmds = (
            vendor_commands.get(driver_group)
            or vendor_commands.get(device_type)
            or vendor_commands.get(short)
        )

    from app.services.nornir_service import NornirService
    if v_cmds and len(v_cmds) > 0:
        commands = [NornirService.resolve_vendor_command(cmd, device_type) for cmd in v_cmds]
    elif custom_commands and len(custom_commands) > 0:
        # Resolve vendor commands if user supplied generic/Huawei commands
        commands = [NornirService.resolve_vendor_command(cmd, device_type) for cmd in custom_commands]
    else:
        presets_for_driver = HEALTH_CHECK_PRESETS.get(driver_group, HEALTH_CHECK_PRESETS["cisco_ios"])
        commands = presets_for_driver.get(check_type, presets_for_driver["standard"])

    result = NetmikoService.send_multiple_commands(device, commands, command_regexes=command_regexes)
    command_results = result.get("results", [])

    # Use RegEx Parser to synthesize clean summary dashboard metrics
    summary = ParserService.parse_health_summary(command_results, device_type)

    return MultiCommandResponse(
        host=result.get("host", device.host or "Unknown"),
        device_name=device.name,
        results=command_results,
        success=result.get("success", False),
        error=result.get("error"),
        overall_time_seconds=result.get("overall_time_seconds"),
        summary=summary,
    )

@router.get("/presets")
def get_presets():
    """Return available preset health check categories with exact command lists per vendor"""
    return {
        "categories": [
            {
                "id": "standard",
                "name": "Standard Overall Check",
                "desc": "version, interface brief, device status, cpu-usage",
                "commands_cisco": HEALTH_CHECK_PRESETS["cisco_ios"]["standard"],
                "commands_huawei": HEALTH_CHECK_PRESETS["huawei"]["standard"],
            },
            {
                "id": "interfaces",
                "name": "Interface & Port Status",
                "desc": "Port status, descriptions, speed/duplex, counters",
                "commands_cisco": HEALTH_CHECK_PRESETS["cisco_ios"]["interfaces"],
                "commands_huawei": HEALTH_CHECK_PRESETS["huawei"]["interfaces"],
            },
            {
                "id": "transceiver",
                "name": "Fiber & Transceiver (SFP/SFP+)",
                "desc": "Optical Tx/Rx Power (dBm), transceiver alarms",
                "commands_cisco": HEALTH_CHECK_PRESETS["cisco_ios"]["transceiver"],
                "commands_huawei": HEALTH_CHECK_PRESETS["huawei"]["transceiver"],
            },
            {
                "id": "environment",
                "name": "Hardware, CPU, Memory & Power",
                "desc": "CPU, Memory, Fan, Power Supply & Temperature",
                "commands_cisco": HEALTH_CHECK_PRESETS["cisco_ios"]["environment"],
                "commands_huawei": HEALTH_CHECK_PRESETS["huawei"]["environment"],
            },
            {
                "id": "routing",
                "name": "Routing Table & ARP",
                "desc": "Routing table, protocols, ARP cache",
                "commands_cisco": HEALTH_CHECK_PRESETS["cisco_ios"]["routing"],
                "commands_huawei": HEALTH_CHECK_PRESETS["huawei"]["routing"],
            },
            {
                "id": "logs",
                "name": "System Logs (Syslog)",
                "desc": "Recent log buffer and error messages",
                "commands_cisco": HEALTH_CHECK_PRESETS["cisco_ios"]["logs"],
                "commands_huawei": HEALTH_CHECK_PRESETS["huawei"]["logs"],
            },
        ]
    }

@router.post("/run", response_model=MultiCommandResponse)
def run_health_check(request: HealthCheckRequest):
    """Execute a batch of health-check commands on the target device and parse metrics"""
    return _execute_device_health_check(
        device=request.device,
        check_type=request.check_type or "standard",
        custom_commands=request.commands,
        vendor_commands=request.vendor_commands,
    )

@router.post("/run-batch", response_model=BatchHealthCheckResponse)
def run_batch_health_check(request: BatchHealthCheckRequest):
    """Execute health-check concurrently across multiple devices via ThreadPoolExecutor"""
    start_time = time.time()
    devices = request.devices
    if not devices:
        return BatchHealthCheckResponse(
            devices_count=0,
            success_count=0,
            failed_count=0,
            overall_time_seconds=0.0,
            results=[],
        )

    check_type = request.check_type or "standard"
    workers_val = max(10, min(int(request.num_workers or getattr(settings, "DEFAULT_NUM_WORKERS", 10)), 100))
    max_workers = min(len(devices), workers_val)

    device_results = [None] * len(devices)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_index = {
            executor.submit(
                _execute_device_health_check,
                dev,
                check_type,
                request.commands,
                request.vendor_commands,
            ): i
            for i, dev in enumerate(devices)
        }

        for future in as_completed(future_to_index):
            idx = future_to_index[future]
            try:
                device_results[idx] = future.result()
            except Exception as e:
                dev = devices[idx]
                device_results[idx] = MultiCommandResponse(
                    host=dev.host or "Unknown",
                    device_name=dev.name,
                    results=[],
                    success=False,
                    error=str(e),
                    overall_time_seconds=0.0,
                    summary=None,
                )

    success_count = sum(1 for r in device_results if r and r.success)
    failed_count = len(devices) - success_count
    elapsed = round(time.time() - start_time, 2)

    return BatchHealthCheckResponse(
        devices_count=len(devices),
        success_count=success_count,
        failed_count=failed_count,
        overall_time_seconds=elapsed,
        results=device_results,
    )
