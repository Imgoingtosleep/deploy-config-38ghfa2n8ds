import time
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
}

def _execute_device_health_check(device: DeviceCredentials, check_type: str = "standard") -> MultiCommandResponse:
    """Helper function to execute health check on a single device"""
    device_type = (device.device_type or "cisco_ios").lower()
    driver_group = "huawei" if "huawei" in device_type else "cisco_ios"
    
    presets_for_driver = HEALTH_CHECK_PRESETS.get(driver_group, HEALTH_CHECK_PRESETS["cisco_ios"])
    commands = presets_for_driver.get(check_type, presets_for_driver["standard"])
    
    result = NetmikoService.send_multiple_commands(device, commands)
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
    """Return available preset health check categories"""
    return {
        "categories": [
            {"id": "standard", "name": "Standard Health Check (System, Interface, Environment)"},
            {"id": "interfaces", "name": "Interface & Port Status"},
            {"id": "transceiver", "name": "Fiber Optic & Transceiver (SFP/SFP+ Tx/Rx Power)"},
            {"id": "environment", "name": "Hardware, CPU, Memory & Power"},
            {"id": "routing", "name": "Routing Table & ARP"},
            {"id": "logs", "name": "Recent System Logs"},
        ]
    }

@router.post("/run", response_model=MultiCommandResponse)
def run_health_check(request: HealthCheckRequest):
    """Execute a batch of health-check commands on the target device and parse metrics"""
    return _execute_device_health_check(request.device, request.check_type or "standard")

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
    max_workers = min(len(devices), 10)
    
    device_results = [None] * len(devices)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_index = {
            executor.submit(_execute_device_health_check, dev, check_type): i
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
