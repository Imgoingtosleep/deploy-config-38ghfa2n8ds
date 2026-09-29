import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from pydantic import BaseModel, Field

# Path to the centralized drivers definition file
DRIVERS_JSON_PATH = Path(__file__).resolve().parent.parent / "data" / "drivers.json"

FAILED_RE = re.compile(
    r"\b(error|failed|failure|invalid|incomplete|unrecognized|aborted|unsuccessful)\b",
    re.IGNORECASE,
)


class DriverDefinition(BaseModel):
    id: str
    name: str
    label: str
    netmiko_ssh: Optional[str] = None
    netmiko_telnet: Optional[str] = None
    family: str = "other"
    is_driver: bool = True
    is_supported_option: bool = True
    ui_order: int = 100

    # Auto-detect signatures and commands
    detect_banner_regex: Optional[str] = None
    detect_version_regex: Optional[str] = None
    detect_order: int = 100
    version_cmd: str = "show version"

    # Save configuration
    save_command: str = "save (driver default)"
    save_confirm: bool = False
    save_confirm_response: str = ""
    save_success_regex: Optional[str] = None

    # Pre/Post verification checks
    default_pre_check: str = "show ip interface brief"
    default_post_check: str = "show ip interface brief"
    pager_disable_cmd: str = "terminal length 0"

    # LLDP and inventory
    lldp_parser: Optional[str] = None
    aliases: List[str] = Field(default_factory=list)


# Built-in fallback registry in case drivers.json cannot be read
_DEFAULT_CATALOG: List[Dict[str, Any]] = [
    {
        "id": "autodetect",
        "name": "autodetect",
        "label": "Auto Detect (Recommended)",
        "is_driver": False,
        "is_supported_option": True,
        "ui_order": 1,
        "aliases": ["auto", "autodetect"],
    },
    {
        "id": "unknown",
        "name": "unknown",
        "label": "Unknown (try every command profile)",
        "is_driver": False,
        "is_supported_option": True,
        "ui_order": 2,
        "aliases": ["unknown"],
    },
    {
        "id": "huawei",
        "name": "huawei",
        "label": "Huawei VRP",
        "netmiko_ssh": "huawei",
        "netmiko_telnet": "huawei_telnet",
        "family": "huawei",
        "is_driver": True,
        "is_supported_option": True,
        "ui_order": 10,
        "save_command": "save",
        "save_confirm": True,
        "save_confirm_response": "y",
        "save_success_regex": "success",
        "default_pre_check": "display interface brief",
        "default_post_check": "display interface brief",
        "pager_disable_cmd": "screen-length 0 temporary",
        "version_cmd": "display version",
        "detect_banner_regex": r"Huawei Versatile Routing Platform|VRP \(R\) Software|Huawei Technologies|Quidway|CloudEngine",
        "detect_version_regex": r"Huawei|VRP \(R\)|CloudEngine|Quidway",
        "detect_order": 10,
        "lldp_parser": "huawei",
        "aliases": ["huawei", "vrp", "quidway", "cloudengine", "huawei_vrp", "huawei_telnet"],
    },
    {
        "id": "cisco_ios",
        "name": "cisco_ios",
        "label": "Cisco IOS / IOS-XE",
        "netmiko_ssh": "cisco_ios",
        "netmiko_telnet": "cisco_ios_telnet",
        "family": "cisco",
        "is_driver": True,
        "is_supported_option": True,
        "ui_order": 20,
        "save_command": "write memory",
        "save_confirm": False,
        "save_confirm_response": "",
        "save_success_regex": r"\[OK\]|copy complete|bytes copied",
        "default_pre_check": "show ip interface brief",
        "default_post_check": "show ip interface brief",
        "pager_disable_cmd": "terminal length 0",
        "version_cmd": "show version",
        "detect_banner_regex": r"Cisco IOS Software|IOS-XE|Cisco Systems",
        "detect_version_regex": (
            r"Cisco IOS Software|Cisco Internetwork Operating System|IOS \(tm\)|IOS-XE|Cisco Systems|"
            r"\bcisco (?:WS-|C\d|ISR|CISCO|Catalyst)"
        ),
        "detect_order": 50,
        "lldp_parser": "cisco",
        "aliases": ["cisco", "cisco_ios", "ios", "ios-xe", "ios_xe", "cisco_xe", "cisco_telnet", "cisco_ios_telnet"],
    },
    {
        "id": "raisecom_roap",
        "name": "raisecom_roap",
        "label": "Raisecom ROS",
        "netmiko_ssh": "raisecom_roap",
        "netmiko_telnet": "raisecom_telnet",
        "family": "raisecom",
        "is_driver": True,
        "is_supported_option": True,
        "ui_order": 30,
        "save_command": "write memory",
        "save_confirm": False,
        "save_confirm_response": "",
        "save_success_regex": r"success|\[OK\]|complete|saved|written",
        "default_pre_check": "show ip interface brief",
        "default_post_check": "show ip interface brief",
        "pager_disable_cmd": "terminal page-break disable",
        "version_cmd": "show version",
        "detect_banner_regex": r"Raisecom|ROS Software",
        "detect_version_regex": r"Raisecom",
        "detect_order": 40,
        "lldp_parser": "raisecom",
        "aliases": ["raisecom", "raisecom_roap", "roap", "raisecom_telnet"],
    },
    {
        "id": "cisco_nxos",
        "name": "cisco_nxos",
        "label": "Cisco NX-OS",
        "netmiko_ssh": "cisco_nxos",
        "netmiko_telnet": "cisco_nxos_telnet",
        "family": "cisco",
        "is_driver": True,
        "is_supported_option": True,
        "ui_order": 40,
        "save_command": "copy running-config startup-config",
        "save_confirm": False,
        "save_confirm_response": "",
        "save_success_regex": r"\[OK\]|copy complete|bytes copied",
        "default_pre_check": "show ip interface brief",
        "default_post_check": "show ip interface brief",
        "pager_disable_cmd": "terminal length 0",
        "version_cmd": "show version",
        "detect_banner_regex": r"Cisco Nexus|NX-OS",
        "detect_version_regex": r"NX-OS|Nexus",
        "detect_order": 30,
        "lldp_parser": "cisco",
        "aliases": ["cisco_nxos", "nxos"],
    },
    {
        "id": "hp_comware",
        "name": "hp_comware",
        "label": "HPE Comware / H3C",
        "netmiko_ssh": "hp_comware",
        "netmiko_telnet": "hp_comware_telnet",
        "family": "hp_comware",
        "is_driver": True,
        "is_supported_option": True,
        "ui_order": 50,
        "save_command": "save force",
        "save_confirm": False,
        "save_confirm_response": "",
        "save_success_regex": r"success|\[OK\]|saved|complete",
        "default_pre_check": "display interface brief",
        "default_post_check": "display interface brief",
        "pager_disable_cmd": "screen-length 0 temporary",
        "version_cmd": "display version",
        "detect_banner_regex": r"H3C Comware|HPE Comware|Comware Software|New H3C Technologies",
        "detect_version_regex": r"H3C|Comware",
        "detect_order": 20,
        "lldp_parser": None,
        "aliases": ["hp", "h3c", "comware", "hp_comware"],
    },
    {
        "id": "aruba_os",
        "name": "aruba_os",
        "label": "ArubaOS / ProCurve",
        "netmiko_ssh": "aruba_os",
        "netmiko_telnet": "aruba_procurve_telnet",
        "family": "aruba",
        "is_driver": True,
        "is_supported_option": True,
        "ui_order": 60,
        "save_command": "write memory",
        "save_confirm": False,
        "save_confirm_response": "",
        "save_success_regex": r"success|\[OK\]",
        "default_pre_check": "show interfaces brief",
        "default_post_check": "show interfaces brief",
        "pager_disable_cmd": "no page",
        "version_cmd": "show version",
        "detect_banner_regex": r"ArubaOS|ProCurve",
        "detect_version_regex": r"ArubaOS|ProCurve",
        "detect_order": 60,
        "lldp_parser": None,
        "aliases": ["aruba", "aruba_os", "procurve"],
    },
    {
        "id": "juniper_junos",
        "name": "juniper_junos",
        "label": "Juniper JunOS",
        "netmiko_ssh": "juniper_junos",
        "netmiko_telnet": "juniper_junos_telnet",
        "family": "juniper",
        "is_driver": True,
        "is_supported_option": True,
        "ui_order": 70,
        "save_command": "commit",
        "save_confirm": False,
        "save_confirm_response": "",
        "save_success_regex": r"commit complete",
        "default_pre_check": "show interfaces terse",
        "default_post_check": "show interfaces terse",
        "pager_disable_cmd": "set cli screen-length 0",
        "version_cmd": "show version",
        "detect_banner_regex": r"JUNOS",
        "detect_version_regex": r"JUNOS",
        "detect_order": 70,
        "lldp_parser": None,
        "aliases": ["juniper", "junos", "juniper_junos"],
    },
    {
        "id": "mikrotik_routeros",
        "name": "mikrotik_routeros",
        "label": "MikroTik RouterOS",
        "netmiko_ssh": "mikrotik_routeros",
        "netmiko_telnet": None,
        "family": "mikrotik",
        "is_driver": True,
        "is_supported_option": True,
        "ui_order": 80,
        "save_command": "save (driver default)",
        "save_confirm": False,
        "save_confirm_response": "",
        "save_success_regex": None,
        "default_pre_check": "/interface print brief",
        "default_post_check": "/interface print brief",
        "pager_disable_cmd": "",
        "version_cmd": "/system resource print",
        "detect_banner_regex": r"MikroTik|RouterOS",
        "detect_version_regex": r"RouterOS|MikroTik",
        "detect_order": 80,
        "lldp_parser": None,
        "aliases": ["mikrotik", "routeros", "mikrotik_routeros"],
    },
    {
        "id": "linux",
        "name": "linux",
        "label": "Linux Host",
        "netmiko_ssh": "linux",
        "netmiko_telnet": None,
        "family": "linux",
        "is_driver": True,
        "is_supported_option": False,
        "ui_order": 90,
        "save_command": "sync",
        "save_confirm": False,
        "save_confirm_response": "",
        "save_success_regex": None,
        "default_pre_check": "ip addr",
        "default_post_check": "ip addr",
        "pager_disable_cmd": "",
        "version_cmd": "uname -a",
        "detect_banner_regex": r"Linux|Ubuntu|Debian|CentOS|Red Hat",
        "detect_version_regex": r"Linux",
        "detect_order": 90,
        "lldp_parser": None,
        "aliases": ["linux"],
    },
]


class DriverRegistry:
    """
    Centralized Driver Registry (Single Source of Truth)
    Manages all network device types, netmiko drivers, auto-detect rules,
    save-config behaviors, default verification commands, and inventory aliases.
    """

    _cache: Optional[Dict[str, DriverDefinition]] = None
    _alias_cache: Optional[Dict[str, str]] = None

    @classmethod
    def reload(cls) -> None:
        """Clear cached driver definitions to force re-reading from disk"""
        cls._cache = None
        cls._alias_cache = None

    @classmethod
    def get_catalog(cls) -> Dict[str, DriverDefinition]:
        """Return dict of id -> DriverDefinition"""
        if cls._cache is not None:
            return cls._cache

        loaded: Dict[str, DriverDefinition] = {}

        if DRIVERS_JSON_PATH.exists():
            try:
                with open(DRIVERS_JSON_PATH, "r", encoding="utf-8") as f:
                    raw_data = json.load(f)
                    for item in raw_data:
                        try:
                            df = DriverDefinition(**item)
                            loaded[df.id.lower()] = df
                        except Exception:
                            continue
            except Exception:
                pass

        if not loaded:
            for item in _DEFAULT_CATALOG:
                df = DriverDefinition(**item)
                loaded[df.id.lower()] = df

        cls._cache = loaded
        return cls._cache

    @classmethod
    def get_driver(cls, name_or_alias: Optional[str]) -> Optional[DriverDefinition]:
        """Lookup driver by ID or alias (case-insensitive)"""
        if not name_or_alias:
            return None
        catalog = cls.get_catalog()
        key = str(name_or_alias).strip().lower()
        if key in catalog:
            return catalog[key]

        # Check aliases
        alias_map = cls.get_alias_map()
        canonical = alias_map.get(key)
        if canonical and canonical in catalog:
            return catalog[canonical]

        return None

    @classmethod
    def get_supported_device_types(cls) -> List[Dict[str, Any]]:
        """
        Returns the options formatted for frontend dropdowns & APIs.
        Includes label, value, save_command, pre_check, and post_check metadata.
        """
        catalog = cls.get_catalog()
        sorted_defs = sorted(
            [d for d in catalog.values() if d.is_supported_option],
            key=lambda x: (x.ui_order, x.label),
        )

        results = []
        for d in sorted_defs:
            results.append({
                "label": d.label,
                "value": d.id,
                "is_driver": d.is_driver,
                "family": d.family,
                "save_command": d.save_command,
                "default_pre_check": d.default_pre_check,
                "default_post_check": d.default_post_check,
                "version_cmd": d.version_cmd,
            })
        return results

    @classmethod
    def get_alias_map(cls) -> Dict[str, str]:
        """Return dict of lowercase alias -> canonical driver name"""
        if cls._alias_cache is not None:
            return cls._alias_cache

        catalog = cls.get_catalog()
        aliases: Dict[str, str] = {}
        for d in catalog.values():
            aliases[d.id.lower()] = d.id
            aliases[d.name.lower()] = d.id
            if d.netmiko_ssh:
                aliases[d.netmiko_ssh.lower()] = d.id
            for a in d.aliases:
                aliases[a.lower().strip()] = d.id

        cls._alias_cache = aliases
        return cls._alias_cache

    @classmethod
    def normalize_driver_alias(cls, raw_type: Optional[str], default_type: str = "huawei") -> str:
        """Map human or vendor alias strings to canonical Netmiko driver name"""
        if not raw_type:
            return default_type
        clean = str(raw_type).strip().lower()
        clean = re.sub(r"[\s_\-]+", "_", clean)

        alias_map = cls.get_alias_map()
        if clean in alias_map:
            return alias_map[clean]

        # Partial substring matching fallback
        for key, canon in alias_map.items():
            if key in clean or clean in key:
                return canon

        return default_type

    @classmethod
    def get_telnet_map(cls) -> Dict[str, str]:
        """Return map of netmiko_ssh -> netmiko_telnet"""
        catalog = cls.get_catalog()
        telnet_map: Dict[str, str] = {}
        for d in catalog.values():
            if d.netmiko_ssh and d.netmiko_telnet:
                telnet_map[d.netmiko_ssh] = d.netmiko_telnet
                # Also map id if different from netmiko_ssh
                telnet_map[d.id] = d.netmiko_telnet
        return telnet_map

    @classmethod
    def get_telnet_driver(cls, driver_name: Optional[str]) -> str:
        """Get the netmiko telnet driver name for an SSH driver"""
        drv = (driver_name or "").strip().lower()
        mapping = cls.get_telnet_map()
        return mapping.get(drv, f"{drv}_telnet")

    @classmethod
    def get_login_banner_signatures(cls) -> List[Tuple[str, str, str]]:
        """Return list of (driver_id, regex, label) for pre-auth banner matching"""
        catalog = cls.get_catalog()
        signatures = []
        for d in sorted(catalog.values(), key=lambda x: x.detect_order):
            if d.detect_banner_regex:
                signatures.append((d.id, d.detect_banner_regex, d.label))
        return signatures

    @classmethod
    def get_version_signatures(cls) -> List[Tuple[str, str]]:
        """Return list of (driver_id, regex) for version command matching in order"""
        catalog = cls.get_catalog()
        signatures = []
        for d in sorted(catalog.values(), key=lambda x: x.detect_order):
            if d.detect_version_regex:
                signatures.append((d.id, d.detect_version_regex))
        return signatures

    @classmethod
    def get_family(cls, driver_name: Optional[str]) -> str:
        """Return the device family name (e.g. 'huawei', 'cisco', 'aruba', ...)"""
        d = cls.get_driver(driver_name)
        if d:
            return d.family
        drv = (driver_name or "").lower()
        if "huawei" in drv:
            return "huawei"
        if "juniper" in drv or "junos" in drv:
            return "juniper"
        if "aruba" in drv:
            return "aruba"
        if "cisco" in drv:
            return "cisco"
        if "raisecom" in drv:
            return "raisecom"
        return "other"

    @classmethod
    def get_save_command(cls, driver_name: Optional[str]) -> str:
        """The CLI command that saves the config on this driver"""
        d = cls.get_driver(driver_name)
        if d:
            return d.save_command
        fam = cls.get_family(driver_name)
        return {
            "huawei": "save",
            "juniper": "commit",
            "cisco": "write memory",
            "aruba": "write memory",
            "raisecom": "write memory",
        }.get(fam, "save (driver default)")

    @classmethod
    def get_save_kwargs(cls, driver_name: Optional[str]) -> Dict[str, Any]:
        """Arguments for Netmiko save_config()"""
        d = cls.get_driver(driver_name)
        if d:
            kwargs: Dict[str, Any] = {}
            if d.save_command and d.save_command != "commit" and d.save_command != "save (driver default)":
                kwargs["cmd"] = d.save_command
            if d.save_confirm:
                kwargs["confirm"] = True
                kwargs["confirm_response"] = d.save_confirm_response
            else:
                kwargs["confirm"] = False
                kwargs["confirm_response"] = ""
            return kwargs

        fam = cls.get_family(driver_name)
        if fam == "huawei":
            return {"cmd": "save", "confirm": True, "confirm_response": "y"}
        if fam in ("cisco", "aruba", "raisecom"):
            return {"cmd": "write memory", "confirm": False, "confirm_response": ""}
        return {}

    @classmethod
    def check_save_output(cls, driver_name: Optional[str], output: str) -> Dict[str, Any]:
        """Validate whether device output confirmed successful save"""
        output = output or ""
        d = cls.get_driver(driver_name)
        if d and d.save_success_regex:
            if re.search(d.save_success_regex, output, re.IGNORECASE):
                return {"success": True, "error": None}
        else:
            fam = cls.get_family(driver_name)
            if fam == "huawei" and re.search(r"success", output, re.IGNORECASE):
                return {"success": True, "error": None}
            if fam == "juniper" and "commit complete" in output.lower():
                return {"success": True, "error": None}
            if fam == "aruba" and re.search(r"success|\[OK\]", output, re.IGNORECASE):
                return {"success": True, "error": None}
            if fam in ("cisco", "raisecom") and re.search(r"\[OK\]|copy complete|bytes copied|success|saved", output, re.IGNORECASE):
                return {"success": True, "error": None}
            if re.search(r"success|\[OK\]|complete|saved", output, re.IGNORECASE):
                return {"success": True, "error": None}

        failed = FAILED_RE.search(output)
        if failed:
            return {"success": False, "error": f"Device refused the save ({failed.group(0)})"}
        return {"success": False, "error": "Device did not confirm the save; startup-config may not be updated"}

    @classmethod
    def get_parser_drivers(cls) -> Dict[str, str]:
        """Map parser name (e.g. 'huawei') -> netmiko driver"""
        mapping = {
            "huawei": "huawei",
            "cisco": "cisco_ios",
            "raisecom": "raisecom_roap",
            "aruba": "aruba_os",
            "hp_comware": "hp_comware",
            "juniper": "juniper_junos",
            "mikrotik": "mikrotik_routeros",
        }
        catalog = cls.get_catalog()
        for d in sorted(catalog.values(), key=lambda x: x.ui_order):
            if d.lldp_parser and d.netmiko_ssh and d.lldp_parser not in mapping:
                mapping[d.lldp_parser] = d.netmiko_ssh
        return mapping

    @classmethod
    def get_driver_parsers(cls) -> Dict[str, str]:
        """Map netmiko driver -> parser name"""
        catalog = cls.get_catalog()
        mapping = {}
        for d in catalog.values():
            if d.lldp_parser and d.netmiko_ssh:
                mapping[d.netmiko_ssh] = d.lldp_parser
        return mapping
