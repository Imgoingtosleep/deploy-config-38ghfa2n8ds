import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from fastapi import APIRouter
from app.schemas.command import (
    SingleCommandRequest,
    CommandResponse,
    BatchCommandRequest,
    BatchCommandResponse,
)
from app.schemas.device import DeviceCredentials
from app.services.netmiko_service import NetmikoService

router = APIRouter()

def _execute_device_command(device: DeviceCredentials, cmd: str) -> CommandResponse:
    """Helper function to execute command on a single device"""
    dev_type = (device.device_type or "").lower()
    if not dev_type or dev_type in ["autodetect", "auto"]:
        try:
            from app.services.autodetect_service import AutoDetectService
            detected_type, _ = AutoDetectService.detect_device_type(device)
            device.device_type = detected_type
        except Exception:
            pass
    result = NetmikoService.send_command(device, cmd)
    return CommandResponse(
        host=result.get("host", device.host or "Unknown"),
        command=result.get("command", cmd),
        output=result.get("output", ""),
        success=result.get("success", False),
        error=result.get("error"),
        execution_time_seconds=result.get("execution_time_seconds"),
    )

@router.post("/execute-command", response_model=CommandResponse)
def execute_command(request: SingleCommandRequest):
    """Execute any custom show / exec / ping / traceroute command and return raw output"""
    return _execute_device_command(request.device, request.command)

@router.post("/execute-batch", response_model=BatchCommandResponse)
def execute_batch_command(request: BatchCommandRequest):
    """Execute CLI / troubleshooting command concurrently across multiple devices using Nornir Engine"""
    try:
        from app.services.nornir_service import NornirService
        return NornirService.run_batch_command(
            devices=request.devices,
            command=request.command or "",
            vendor_resolve=True,
            vendor_commands=request.vendor_commands,
            huawei_command=request.huawei_command,
            cisco_command=request.cisco_command,
        )
    except Exception:
        # Fallback to ThreadPoolExecutor
        start_time = time.time()
        devices = request.devices
        if not devices:
            return BatchCommandResponse(
                devices_count=0,
                success_count=0,
                failed_count=0,
                overall_time_seconds=0.0,
                results=[],
            )

        def _resolve_command_for_device(dev: DeviceCredentials) -> str:
            dev_type = (dev.device_type or "").lower()
            if not dev_type or dev_type in ["autodetect", "auto"]:
                try:
                    from app.services.autodetect_service import AutoDetectService
                    detected_type, _ = AutoDetectService.detect_device_type(dev)
                    dev.device_type = detected_type
                    dev_type = detected_type
                except Exception:
                    pass
            vendor = "huawei" if "huawei" in dev_type else "cisco_ios"
            if request.vendor_commands and vendor in request.vendor_commands and request.vendor_commands[vendor]:
                return request.vendor_commands[vendor]
            if request.huawei_command and vendor == "huawei":
                return request.huawei_command
            if request.cisco_command and vendor == "cisco_ios":
                return request.cisco_command
            return request.command or ""


        max_workers = min(max(len(devices), 1), 20)
        device_results = [None] * len(devices)

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_index = {}
            for i, dev in enumerate(devices):
                cmd = _resolve_command_for_device(dev)
                future_to_index[executor.submit(_execute_device_command, dev, cmd)] = i

            for future in as_completed(future_to_index):
                idx = future_to_index[future]
                try:
                    device_results[idx] = future.result()
                except Exception as e:
                    dev = devices[idx]
                    device_results[idx] = CommandResponse(
                        host=dev.host or "Unknown",
                        command=request.command or "",
                        output="",
                        success=False,
                        error=str(e),
                        execution_time_seconds=0.0,
                    )

        success_count = sum(1 for r in device_results if r and r.success)
        failed_count = len(devices) - success_count
        elapsed = round(time.time() - start_time, 2)

        return BatchCommandResponse(
            devices_count=len(devices),
            success_count=success_count,
            failed_count=failed_count,
            overall_time_seconds=elapsed,
            results=device_results,
        )
