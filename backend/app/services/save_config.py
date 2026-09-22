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

FAILED_RE = re.compile(
    r"\b(error|failed|failure|invalid|incomplete|unrecognized|aborted|unsuccessful)\b",
    re.IGNORECASE,
)


def _family(device_type: str) -> str:
    dev = (device_type or "").lower()
    if "huawei" in dev:
        return "huawei"
    if "juniper" in dev or "junos" in dev:
        return "juniper"
    if "aruba" in dev:
        return "aruba"
    if "cisco" in dev:
        return "cisco"
    return "other"


def save_command(device_type: str) -> str:
    """The CLI command that saves the config on this driver"""
    return {"huawei": "save", "juniper": "commit", "cisco": "write memory", "aruba": "write memory"}.get(
        _family(device_type), "save (driver default)"
    )


def save_kwargs(device_type: str) -> Dict[str, Any]:
    """
    Arguments for Netmiko save_config():
    - Huawei 'save' asks "Continue? [Y/N]" -> answered 'y' (Netmiko's Huawei driver waits for it)
    - Cisco / Aruba 'write memory' does not ask; confirm=True there would type a stray 'y'
      on the prompt, so it stays off
    - other drivers (HP Comware 'save force', ...) keep Netmiko's own default
    """
    fam = _family(device_type)
    if fam == "huawei":
        return {"cmd": "save", "confirm": True, "confirm_response": "y"}
    if fam in ("cisco", "aruba"):
        return {"cmd": "write memory", "confirm": False, "confirm_response": ""}
    return {}


def _saved_ok(device_type: str, output: str) -> bool:
    fam = _family(device_type)
    if fam == "huawei":
        # "Info: Save the configuration successfully." / "Configuration file had been saved successfully"
        return bool(re.search(r"success", output, re.IGNORECASE))
    if fam == "juniper":
        return "commit complete" in output.lower()
    if fam == "aruba":
        return bool(re.search(r"success|\[OK\]", output, re.IGNORECASE))
    if fam == "cisco":
        # Cisco IOS / XE / NX-OS: "[OK]", "Copy complete", "N bytes copied"
        return bool(re.search(r"\[OK\]|copy complete|bytes copied", output, re.IGNORECASE))
    # Other drivers: accept any usual "done" wording
    return bool(re.search(r"success|\[OK\]|complete|saved", output, re.IGNORECASE))


def check_save_output(device_type: str, output: str) -> Dict[str, Any]:
    """{success, error} for what the device printed after the save command"""
    output = output or ""
    if _saved_ok(device_type, output):
        return {"success": True, "error": None}
    failed = FAILED_RE.search(output)
    if failed:
        return {"success": False, "error": f"Device refused the save ({failed.group(0)})"}
    return {"success": False, "error": "Device did not confirm the save; startup-config may not be updated"}


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
