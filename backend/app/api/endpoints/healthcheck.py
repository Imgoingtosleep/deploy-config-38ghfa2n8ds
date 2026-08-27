from fastapi import APIRouter
from app.schemas.command import HealthCheckRequest, MultiCommandResponse
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
        ],
    },
}

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
    device_type = request.device.device_type
    driver_group = "huawei" if "huawei" in device_type else "cisco_ios"
    check_type = request.check_type or "standard"
    
    presets_for_driver = HEALTH_CHECK_PRESETS.get(driver_group, HEALTH_CHECK_PRESETS["cisco_ios"])
    commands = presets_for_driver.get(check_type, presets_for_driver["standard"])
    
    result = NetmikoService.send_multiple_commands(request.device, commands)
    command_results = result.get("results", [])

    # Use RegEx Parser to synthesize clean summary dashboard metrics
    summary = ParserService.parse_health_summary(command_results, device_type)

    return MultiCommandResponse(
        host=result["host"],
        results=command_results,
        success=result.get("success", False),
        overall_time_seconds=result.get("overall_time_seconds"),
        summary=summary,
    )
