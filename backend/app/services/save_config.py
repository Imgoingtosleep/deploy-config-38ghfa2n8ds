"""
Save running-config to startup-config as the last command of a deploy with
Netmiko's save_config() / commit() - what nornir_netmiko's netmiko_save_config and
netmiko_commit tasks run - and make sure the device really did it.

Netmiko must be told to confirm: netmiko_save_config() with no arguments has
confirm=False, so on Huawei 'save' was sent and "Are you sure to continue?[Y/N]"
was never answered - nothing got saved. Netmiko also returns whatever the device
printed, so the output is checked for the vendor's "saved" message here.
"""
import re
from typing import Any, Dict

from nornir.core.task import Task

from app.core.driver_registry import DriverRegistry, FAILED_RE


def _family(device_type: str) -> str:
    return DriverRegistry.get_family(device_type)


def save_command(device_type: str) -> str:
    """The CLI command that saves the config on this driver"""
    return DriverRegistry.get_save_command(device_type)


def save_kwargs(device_type: str) -> Dict[str, Any]:
    """
    Arguments for Netmiko save_config():
    Looked up from the centralized DriverRegistry.
    """
    return DriverRegistry.get_save_kwargs(device_type)


def _saved_ok(device_type: str, output: str) -> bool:
    return DriverRegistry.check_save_output(device_type, output)["success"]


def check_save_output(device_type: str, output: str) -> Dict[str, Any]:
    """{success, error} for what the device printed after the save command"""
    return DriverRegistry.check_save_output(device_type, output)


def _result(device_type: str, output: str) -> Dict[str, Any]:
    return {"command": save_command(device_type), "output": output, **check_save_output(device_type, output)}


def save_with_nornir(task: Task, device_type: str) -> Dict[str, Any]:
    """
    Save inside a Nornir task, on the task's Netmiko connection. This is the call
    nornir_netmiko's netmiko_save_config / netmiko_commit make; it is done directly
    because a failed task.run() subtask marks the whole host failed and the deploy
    output would be lost. Returns {command, output, success, error}; never raises.
    """
    conn = task.host.get_connection("netmiko", task.nornir.config)
    return save_startup_config(conn, device_type)


def save_startup_config(conn: Any, device_type: str) -> Dict[str, Any]:
    """Same as save_with_nornir on a plain Netmiko connection (single-device endpoints)"""
    try:
        if _family(device_type) == "juniper":
            output = conn.commit()
        else:
            output = conn.save_config(**save_kwargs(device_type))
        return _result(device_type, output or "")
    except Exception as e:
        return {"command": save_command(device_type), "output": "", "success": False, "error": f"Save failed: {e}"}
