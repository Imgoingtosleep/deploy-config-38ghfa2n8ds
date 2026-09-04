import re
from typing import List, Dict, Any, Optional

class CommandTranslator:
    """
    Multi-Vendor Network Command Translation Engine.
    Translates commands between Huawei VRP (primary), Cisco IOS/NX-OS,
    Juniper JunOS, HPE Aruba, HP/H3C Comware, and MikroTik RouterOS.
    """

    # Comprehensive Command Equivalents Map
    # Keys can be queried from any vendor to find the canonical entry
    MAPPINGS = [
        {
            "id": "version",
            "aliases": ["display version", "display ver", "show version", "show ver"],
            "huawei": "display version",
            "cisco_ios": "show version",
            "cisco_nxos": "show version",
            "juniper_junos": "show version",
            "aruba_os": "show version",
            "hp_comware": "display version",
            "mikrotik_routeros": "/system resource print",
        },
        {
            "id": "interface_brief",
            "aliases": [
                "display interface brief", "display int brief", "disp int brief",
                "show interface brief", "show int brief", "show interfaces brief",
            ],
            "huawei": "display interface brief",
            "cisco_ios": "show ip interface brief",
            "cisco_nxos": "show interface status",
            "juniper_junos": "show interfaces terse",
            "aruba_os": "show interface brief",
            "hp_comware": "display interface brief",
            "mikrotik_routeros": "/interface print brief",
        },
        {
            "id": "ip_interface_brief",
            "aliases": [
                "display ip interface brief", "display ip int brief", "disp ip int brief",
                "show ip interface brief", "show ip int brief", "show interfaces terse",
            ],
            "huawei": "display ip interface brief",
            "cisco_ios": "show ip interface brief",
            "cisco_nxos": "show ip interface brief",
            "juniper_junos": "show interfaces terse",
            "aruba_os": "show ip interface brief",
            "hp_comware": "display ip interface brief",
            "mikrotik_routeros": "/ip address print",
        },
        {
            "id": "interface_desc",
            "aliases": [
                "display interface description", "display int desc", "disp int desc",
                "show interfaces description", "show interface description", "show int desc",
            ],
            "huawei": "display interface description",
            "cisco_ios": "show interfaces description",
            "cisco_nxos": "show interface description",
            "juniper_junos": "show interfaces descriptions",
            "aruba_os": "show interface custom",
            "hp_comware": "display interface description",
            "mikrotik_routeros": "/interface print",
        },
        {
            "id": "running_config",
            "aliases": [
                "display current-configuration", "display current", "display cur", "disp cur",
                "show running-config", "show run", "show configuration", "show config",
            ],
            "huawei": "display current-configuration",
            "cisco_ios": "show running-config",
            "cisco_nxos": "show running-config",
            "juniper_junos": "show configuration",
            "aruba_os": "show running-config",
            "hp_comware": "display current-configuration",
            "mikrotik_routeros": "/export",
        },
        {
            "id": "routing_table",
            "aliases": [
                "display ip routing-table", "disp ip routing-table", "display ip route",
                "show ip route", "show route",
            ],
            "huawei": "display ip routing-table",
            "cisco_ios": "show ip route",
            "cisco_nxos": "show ip route",
            "juniper_junos": "show route",
            "aruba_os": "show ip route",
            "hp_comware": "display ip routing-table",
            "mikrotik_routeros": "/ip route print",
        },
        {
            "id": "arp",
            "aliases": [
                "display arp all", "display arp", "disp arp",
                "show ip arp", "show arp",
            ],
            "huawei": "display arp all",
            "cisco_ios": "show ip arp",
            "cisco_nxos": "show ip arp",
            "juniper_junos": "show arp",
            "aruba_os": "show arp",
            "hp_comware": "display arp all",
            "mikrotik_routeros": "/ip arp print",
        },
        {
            "id": "cpu",
            "aliases": [
                "display cpu-usage", "display cpu", "disp cpu",
                "show processes cpu", "show processes cpu sorted", "show cpu",
            ],
            "huawei": "display cpu-usage",
            "cisco_ios": "show processes cpu sorted",
            "cisco_nxos": "show system resources",
            "juniper_junos": "show chassis routing-engine",
            "aruba_os": "show cpu",
            "hp_comware": "display cpu-usage",
            "mikrotik_routeros": "/system resource print",
        },
        {
            "id": "memory",
            "aliases": [
                "display memory-usage", "display memory", "disp mem",
                "show processes memory", "show memory", "show system resources",
            ],
            "huawei": "display memory-usage",
            "cisco_ios": "show processes memory",
            "cisco_nxos": "show system resources",
            "juniper_junos": "show system storage",
            "aruba_os": "show memory",
            "hp_comware": "display memory",
            "mikrotik_routeros": "/system resource print",
        },
        {
            "id": "device",
            "aliases": [
                "display device", "display device manuinfo", "disp dev",
                "show inventory", "show module", "show chassis hardware",
            ],
            "huawei": "display device",
            "cisco_ios": "show inventory",
            "cisco_nxos": "show module",
            "juniper_junos": "show chassis hardware",
            "aruba_os": "show system",
            "hp_comware": "display device",
            "mikrotik_routeros": "/system routerboard print",
        },
        {
            "id": "environment",
            "aliases": [
                "display temperature all", "display temperature", "display environment",
                "show environment all", "show environment", "show chassis environment",
            ],
            "huawei": "display temperature all",
            "cisco_ios": "show environment all",
            "cisco_nxos": "show environment",
            "juniper_junos": "show chassis environment",
            "aruba_os": "show system temperature",
            "hp_comware": "display environment",
            "mikrotik_routeros": "/system health print",
        },
        {
            "id": "power",
            "aliases": [
                "display power", "show power", "show environment power",
            ],
            "huawei": "display power",
            "cisco_ios": "show power",
            "cisco_nxos": "show environment power",
            "juniper_junos": "show chassis environment",
            "aruba_os": "show system power-supply",
            "hp_comware": "display environment",
            "mikrotik_routeros": "/system health print",
        },
        {
            "id": "fan",
            "aliases": [
                "display fan", "show fan", "show environment fan",
            ],
            "huawei": "display fan",
            "cisco_ios": "show environment fan",
            "cisco_nxos": "show environment fan",
            "juniper_junos": "show chassis environment",
            "aruba_os": "show system fan",
            "hp_comware": "display environment",
            "mikrotik_routeros": "/system health print",
        },
        {
            "id": "lldp",
            "aliases": [
                "display lldp neighbor brief", "display lldp neighbor", "display lldp neighbor list",
                "show lldp neighbors", "show cdp neighbors", "show lldp",
            ],
            "huawei": "display lldp neighbor brief",
            "cisco_ios": "show lldp neighbors",
            "cisco_nxos": "show lldp neighbors",
            "juniper_junos": "show lldp neighbors",
            "aruba_os": "show lldp info remote-device",
            "hp_comware": "display lldp neighbor list",
            "mikrotik_routeros": "/ip neighbor print",
        },
        {
            "id": "transceiver",
            "aliases": [
                "display transceiver diagnosis interface", "display transceiver verbose", "display transceiver",
                "show interfaces transceiver", "show interfaces transceiver detail",
            ],
            "huawei": "display transceiver diagnosis interface",
            "cisco_ios": "show interfaces transceiver detail",
            "cisco_nxos": "show interface transceiver details",
            "juniper_junos": "show interfaces diagnostics optics",
            "aruba_os": "show interface transceiver",
            "hp_comware": "display transceiver diagnosis interface",
            "mikrotik_routeros": "/interface ethernet monitor [find] once",
        },
        {
            "id": "logs",
            "aliases": [
                "display logbuffer", "display trapbuffer",
                "show logging", "show logging | last 50", "show log messages",
            ],
            "huawei": "display logbuffer",
            "cisco_ios": "show logging | last 50",
            "cisco_nxos": "show logging last 50",
            "juniper_junos": "show log messages | last 50",
            "aruba_os": "show logging -r | include 50",
            "hp_comware": "display logbuffer",
            "mikrotik_routeros": "/log print",
        },
        {
            "id": "vlan",
            "aliases": [
                "display vlan", "display vlan summary", "show vlan brief", "show vlan", "show vlans",
            ],
            "huawei": "display vlan",
            "cisco_ios": "show vlan brief",
            "cisco_nxos": "show vlan",
            "juniper_junos": "show vlans",
            "aruba_os": "show vlan",
            "hp_comware": "display vlan",
            "mikrotik_routeros": "/interface vlan print",
        },
        {
            "id": "mac",
            "aliases": [
                "display mac-address", "display mac-address all",
                "show mac address-table", "show mac-address-table",
            ],
            "huawei": "display mac-address",
            "cisco_ios": "show mac address-table",
            "cisco_nxos": "show mac address-table",
            "juniper_junos": "show ethernet-switching table",
            "aruba_os": "show mac-address",
            "hp_comware": "display mac-address",
            "mikrotik_routeros": "/interface bridge host print",
        },
        {
            "id": "clock",
            "aliases": [
                "display clock", "show clock", "show system uptime",
            ],
            "huawei": "display clock",
            "cisco_ios": "show clock",
            "cisco_nxos": "show clock",
            "juniper_junos": "show system uptime",
            "aruba_os": "show time",
            "hp_comware": "display clock",
            "mikrotik_routeros": "/system clock print",
        },
        {
            "id": "ospf",
            "aliases": [
                "display ospf peer", "display ospf peer brief",
                "show ip ospf neighbor", "show ospf neighbor",
            ],
            "huawei": "display ospf peer",
            "cisco_ios": "show ip ospf neighbor",
            "cisco_nxos": "show ip ospf neighbor",
            "juniper_junos": "show ospf neighbor",
            "aruba_os": "show ip ospf neighbor",
            "hp_comware": "display ospf peer",
            "mikrotik_routeros": "/routing ospf neighbor print",
        },
        {
            "id": "bgp",
            "aliases": [
                "display bgp peer", "show ip bgp summary", "show bgp summary",
            ],
            "huawei": "display bgp peer",
            "cisco_ios": "show ip bgp summary",
            "cisco_nxos": "show ip bgp summary",
            "juniper_junos": "show bgp summary",
            "aruba_os": "show ip bgp summary",
            "hp_comware": "display bgp peer",
            "mikrotik_routeros": "/routing bgp peer print",
        },
        {
            "id": "vrrp",
            "aliases": [
                "display vrrp brief", "display vrrp", "show vrrp brief", "show vrrp",
            ],
            "huawei": "display vrrp brief",
            "cisco_ios": "show vrrp brief",
            "cisco_nxos": "show vrrp brief",
            "juniper_junos": "show vrrp",
            "aruba_os": "show vrrp",
            "hp_comware": "display vrrp brief",
            "mikrotik_routeros": "/interface vrrp print",
        },
        {
            "id": "stp",
            "aliases": [
                "display stp brief", "display stp", "show spanning-tree summary", "show spanning-tree brief",
            ],
            "huawei": "display stp brief",
            "cisco_ios": "show spanning-tree summary",
            "cisco_nxos": "show spanning-tree summary",
            "juniper_junos": "show spanning-tree bridge",
            "aruba_os": "show spanning-tree",
            "hp_comware": "display stp brief",
            "mikrotik_routeros": "/interface bridge print",
        },
        {
            "id": "eth_trunk",
            "aliases": [
                "display eth-trunk", "display link-aggregation verbose", "display link-aggregation summary",
                "show etherchannel summary", "show etherchannel", "show port-channel summary",
                "show lacp interfaces", "show lacp",
            ],
            "huawei": "display eth-trunk",
            "cisco_ios": "show etherchannel summary",
            "cisco_nxos": "show port-channel summary",
            "juniper_junos": "show lacp interfaces",
            "aruba_os": "show lacp",
            "hp_comware": "display link-aggregation verbose",
            "mikrotik_routeros": "/interface bonding print",
        },
        {
            "id": "bfd",
            "aliases": [
                "display bfd session all", "display bfd session", "display bfd",
                "show bfd neighbors", "show bfd session", "show bfd",
            ],
            "huawei": "display bfd session all",
            "cisco_ios": "show bfd neighbors",
            "cisco_nxos": "show bfd neighbors",
            "juniper_junos": "show bfd session",
            "aruba_os": "show bfd",
            "hp_comware": "display bfd session all",
            "mikrotik_routeros": "/routing bfd session print",
        },
        {
            "id": "ntp",
            "aliases": [
                "display ntp status", "display ntp-service status", "display ntp sessions",
                "show ntp status", "show ntp associations",
            ],
            "huawei": "display ntp status",
            "cisco_ios": "show ntp status",
            "cisco_nxos": "show ntp peer-status",
            "juniper_junos": "show ntp status",
            "aruba_os": "show ntp status",
            "hp_comware": "display ntp status",
            "mikrotik_routeros": "/system ntp client print",
        },
        {
            "id": "startup_config",
            "aliases": [
                "display saved-configuration", "display startup", "show startup-config", "show start",
            ],
            "huawei": "display saved-configuration",
            "cisco_ios": "show startup-config",
            "cisco_nxos": "show startup-config",
            "juniper_junos": "show configuration",
            "aruba_os": "show config status",
            "hp_comware": "display saved-configuration",
            "mikrotik_routeros": "/export file=backup",
        },
        {
            "id": "dhcp_pool",
            "aliases": [
                "display ip pool", "show ip dhcp pool", "show dhcp pool",
            ],
            "huawei": "display ip pool",
            "cisco_ios": "show ip dhcp pool",
            "cisco_nxos": "show ip dhcp pool",
            "juniper_junos": "show dhcp server binding",
            "aruba_os": "show dhcp-server",
            "hp_comware": "display ip pool",
            "mikrotik_routeros": "/ip pool print",
        },
        {
            "id": "counters",
            "aliases": [
                "display interface counters", "display counters", "show interfaces counters", "show interface statistics",
            ],
            "huawei": "display interface counters",
            "cisco_ios": "show interfaces counters",
            "cisco_nxos": "show interface counters",
            "juniper_junos": "show interfaces statistics",
            "aruba_os": "show interface statistics",
            "hp_comware": "display interface counters",
            "mikrotik_routeros": "/interface print stats",
        },
    ]

    @classmethod
    def _normalize_driver_group(cls, vendor: str) -> str:
        v = (vendor or "").lower().strip()
        if "huawei" in v:
            return "huawei"
        if "juniper" in v or "junos" in v:
            return "juniper_junos"
        if "nxos" in v:
            return "cisco_nxos"
        if "aruba" in v or "procurve" in v:
            return "aruba_os"
        if "comware" in v or "h3c" in v:
            return "hp_comware"
        if "mikrotik" in v or "routeros" in v:
            return "mikrotik_routeros"
        return "cisco_ios"

    @classmethod
    def _normalize_shorthand(cls, cmd: str) -> str:
        """Expand common network engineer abbreviations into full command syntax"""
        c = cmd.strip()
        c = re.sub(r"^(dis|disp)\s+", "display ", c, flags=re.I)
        c = re.sub(r"^sh\s+", "show ", c, flags=re.I)
        c = re.sub(r"\bint\b", "interface", c, flags=re.I)
        c = re.sub(r"\b(br|bri)\b", "brief", c, flags=re.I)
        c = re.sub(r"\b(ver|vers)\b", "version", c, flags=re.I)
        c = re.sub(r"\b(cur|curr)\b", "current-configuration", c, flags=re.I)
        c = re.sub(r"\brun\b", "running-config", c, flags=re.I)
        c = re.sub(r"\bstart\b", "startup-config", c, flags=re.I)
        return c

    @classmethod
    def detect_source_vendor(cls, command: str) -> str:
        """Detect source vendor dialect from command prefix and syntax"""
        c = (command or "").strip()
        c_norm = cls._normalize_shorthand(c)
        if c.startswith("/"):
            return "mikrotik_routeros"
        if re.match(r"^display\b", c_norm, flags=re.I):
            return "huawei"
        if re.match(r"^show\b", c_norm, flags=re.I):
            return "cisco_ios"
        return "huawei"

    @classmethod
    def translate_command(cls, command: str, source_vendor: str = "auto", target_vendor: str = "cisco_ios") -> str:
        """
        Translate a single command from source vendor syntax to target vendor syntax.
        Defaults source_vendor to 'auto' (falls back to Huawei VRP as primary).
        """
        cmd_clean = command.strip()
        if not cmd_clean:
            return ""

        if source_vendor == "auto":
            src_grp = cls.detect_source_vendor(cmd_clean)
        else:
            src_grp = cls._normalize_driver_group(source_vendor)
        tgt_grp = cls._normalize_driver_group(target_vendor)

        if src_grp == tgt_grp:
            return cmd_clean

        # Normalize abbreviations (e.g. disp ver -> display version, sh ip int br -> show ip interface brief)
        cmd_norm = cls._normalize_shorthand(cmd_clean)
        cmd_lower = cmd_norm.lower()

        # 1. Exact or alias match from mapping dictionary
        for entry in cls.MAPPINGS:
            aliases = [a.lower() for a in entry.get("aliases", [])]
            src_cmd = entry.get(src_grp, "").lower()
            if cmd_lower == src_cmd or cmd_lower in aliases:
                return entry.get(tgt_grp, entry.get("cisco_ios", cmd_norm))

        # 2. Heuristic Pattern Translation (Handles parameters, interface names, IP args, etc.)
        if src_grp == "huawei":
            # If target is Comware, keep Huawei/VRP syntax except Eth-Trunk -> Bridge-Aggregation
            if tgt_grp == "hp_comware":
                cw_cmd = cmd_norm
                cw_cmd = re.sub(r"\binterface\s+eth-trunk\s*(\d+)\b", r"interface Bridge-Aggregation \1", cw_cmd, flags=re.I)
                cw_cmd = re.sub(r"\beth-trunk\b", "link-aggregation", cw_cmd, flags=re.I)
                return cw_cmd

            # Ping and Tracert translation
            if cmd_lower.startswith("tracert"):
                target_ip = re.sub(r"^tracert\s*", "", cmd_norm, flags=re.I).strip()
                if tgt_grp == "mikrotik_routeros":
                    return f"/tool traceroute {target_ip}" if target_ip else "/tool traceroute"
                return f"traceroute {target_ip}" if target_ip else "traceroute"

            if cmd_lower.startswith("ping") and tgt_grp == "mikrotik_routeros":
                target_ip = re.sub(r"^ping\s*", "", cmd_norm, flags=re.I).strip()
                return f"/ping count=4 {target_ip}" if target_ip else "/ping"

            # Target is Cisco IOS / NX-OS / Aruba
            if tgt_grp in ["cisco_ios", "cisco_nxos", "aruba_os"]:
                c_cmd = cmd_norm
                if c_cmd.lower().startswith("display "):
                    c_cmd = "show " + c_cmd[8:]

                # Interface commands with arguments: display interface GigabitEthernet 0/0/1
                c_cmd = re.sub(r"\binterface brief\b", "ip interface brief" if tgt_grp != "cisco_nxos" else "interface status", c_cmd, flags=re.I)
                c_cmd = re.sub(r"\bip interface brief\b", "ip interface brief", c_cmd, flags=re.I)
                c_cmd = re.sub(r"\binterface description\b", "interfaces description", c_cmd, flags=re.I)
                c_cmd = re.sub(r"\binterface\s+eth-trunk\s*(\d+)\b", r"interface Port-channel \1", c_cmd, flags=re.I)
                c_cmd = re.sub(r"\bcurrent-configuration\b", "running-config", c_cmd, flags=re.I)
                c_cmd = re.sub(r"\bsaved-configuration\b", "startup-config", c_cmd, flags=re.I)
                c_cmd = re.sub(r"\bip routing-table\b", "ip route", c_cmd, flags=re.I)
                c_cmd = re.sub(r"\bmac-address\b", "mac address-table", c_cmd, flags=re.I)
                c_cmd = re.sub(r"\barp all\b", "ip arp", c_cmd, flags=re.I)
                c_cmd = re.sub(r"\barp\b", "ip arp", c_cmd, flags=re.I)
                c_cmd = re.sub(r"\bcpu-usage\b", "processes cpu sorted" if tgt_grp == "cisco_ios" else "system resources", c_cmd, flags=re.I)
                c_cmd = re.sub(r"\bmemory-usage\b", "processes memory" if tgt_grp == "cisco_ios" else "system resources", c_cmd, flags=re.I)
                c_cmd = re.sub(r"\beth-trunk\b", "etherchannel summary" if tgt_grp == "cisco_ios" else "port-channel summary", c_cmd, flags=re.I)
                c_cmd = re.sub(r"\blink-aggregation\b", "etherchannel summary" if tgt_grp == "cisco_ios" else "port-channel summary", c_cmd, flags=re.I)
                c_cmd = re.sub(r"\bbfd session\b", "bfd neighbors", c_cmd, flags=re.I)
                c_cmd = re.sub(r"\btransceiver diagnosis interface\b", "interfaces transceiver detail", c_cmd, flags=re.I)
                c_cmd = re.sub(r"\btransceiver\b", "interfaces transceiver", c_cmd, flags=re.I)
                c_cmd = re.sub(r"\bip pool\b", "ip dhcp pool", c_cmd, flags=re.I)
                c_cmd = re.sub(r"\binterface counters\b", "interfaces counters", c_cmd, flags=re.I)
                return c_cmd

            # Target is Juniper JunOS
            if tgt_grp == "juniper_junos":
                j_cmd = cmd_norm
                if j_cmd.lower().startswith("display "):
                    j_cmd = "show " + j_cmd[8:]

                j_cmd = re.sub(r"\binterface brief\b", "interfaces terse", j_cmd, flags=re.I)
                j_cmd = re.sub(r"\bip interface brief\b", "interfaces terse", j_cmd, flags=re.I)
                j_cmd = re.sub(r"\binterface description\b", "interfaces descriptions", j_cmd, flags=re.I)
                j_cmd = re.sub(r"\binterface\s+eth-trunk\s*(\d+)\b", r"interfaces ae\1", j_cmd, flags=re.I)
                # JunOS always uses plural "interfaces" for single interface queries too (e.g. show interfaces ge-0/0/0)
                j_cmd = re.sub(r"\binterface\b", "interfaces", j_cmd, flags=re.I)
                j_cmd = re.sub(r"\binterfaces terse\b", "interfaces terse", j_cmd, flags=re.I)
                j_cmd = re.sub(r"\bcurrent-configuration\b", "configuration", j_cmd, flags=re.I)
                j_cmd = re.sub(r"\bsaved-configuration\b", "configuration", j_cmd, flags=re.I)
                j_cmd = re.sub(r"\bip routing-table\b", "route", j_cmd, flags=re.I)
                j_cmd = re.sub(r"\bmac-address\b", "ethernet-switching table", j_cmd, flags=re.I)
                j_cmd = re.sub(r"\barp all\b", "arp", j_cmd, flags=re.I)
                j_cmd = re.sub(r"\bcpu-usage\b", "chassis routing-engine", j_cmd, flags=re.I)
                j_cmd = re.sub(r"\bmemory-usage\b", "system storage", j_cmd, flags=re.I)
                j_cmd = re.sub(r"\bdevice\b", "chassis hardware", j_cmd, flags=re.I)
                j_cmd = re.sub(r"^show vlan\b", "show vlans", j_cmd, flags=re.I)
                j_cmd = re.sub(r"\beth-trunk\b", "lacp interfaces", j_cmd, flags=re.I)
                j_cmd = re.sub(r"\blink-aggregation\b", "lacp interfaces", j_cmd, flags=re.I)
                j_cmd = re.sub(r"\bbfd session\b", "bfd session", j_cmd, flags=re.I)
                j_cmd = re.sub(r"\btransceiver diagnosis interface\b", "interfaces diagnostics optics", j_cmd, flags=re.I)
                j_cmd = re.sub(r"\btransceiver\b", "interfaces diagnostics optics", j_cmd, flags=re.I)
                j_cmd = re.sub(r"\bip pool\b", "dhcp server binding", j_cmd, flags=re.I)
                j_cmd = re.sub(r"\binterface counters\b", "interfaces statistics", j_cmd, flags=re.I)
                return j_cmd

            # Target is MikroTik RouterOS
            if tgt_grp == "mikrotik_routeros":
                cmd_l = cmd_norm.lower()
                if "interface brief" in cmd_l:
                    return "/interface print brief"
                if "ip interface" in cmd_l or "ip int brief" in cmd_l:
                    return "/ip address print"
                if "interface description" in cmd_l or "interface" in cmd_l:
                    return "/interface print"
                if "routing-table" in cmd_l or "ip route" in cmd_l:
                    return "/ip route print"
                if "arp" in cmd_l:
                    return "/ip arp print"
                if "mac-address" in cmd_l or "mac address" in cmd_l:
                    return "/interface bridge host print"
                if "vlan" in cmd_l:
                    return "/interface vlan print"
                if "log" in cmd_l:
                    return "/log print"
                if "cpu" in cmd_l or "memory" in cmd_l or "version" in cmd_l or "device" in cmd_l:
                    return "/system resource print"
                if "clock" in cmd_l:
                    return "/system clock print"
                if "current-configuration" in cmd_l or "saved-configuration" in cmd_l:
                    return "/export"
                if "vrrp" in cmd_l:
                    return "/interface vrrp print"
                if "ospf" in cmd_l:
                    return "/routing ospf neighbor print"
                if "bgp" in cmd_l:
                    return "/routing bgp peer print"
                if "stp" in cmd_l:
                    return "/interface bridge print"
                if "lldp" in cmd_l:
                    return "/ip neighbor print"
                if "eth-trunk" in cmd_l or "link-aggregation" in cmd_l:
                    return "/interface bonding print"
                if "bfd" in cmd_l:
                    return "/routing bfd session print"
                if "ntp" in cmd_l:
                    return "/system ntp client print"
                if "ip pool" in cmd_l:
                    return "/ip pool print"
                return cmd_clean

        elif src_grp in ["cisco_ios", "cisco_nxos"]:
            h_cmd = cmd_norm
            if h_cmd.lower().startswith("show "):
                h_cmd = "display " + h_cmd[5:]
            h_cmd = re.sub(r"\brunning-config\b", "current-configuration", h_cmd, flags=re.I)
            h_cmd = re.sub(r"\bstartup-config\b", "saved-configuration", h_cmd, flags=re.I)
            h_cmd = re.sub(r"\bip route\b", "ip routing-table", h_cmd, flags=re.I)
            h_cmd = re.sub(r"\bip interface brief\b", "interface brief", h_cmd, flags=re.I)
            h_cmd = re.sub(r"\bmac address-table\b", "mac-address", h_cmd, flags=re.I)
            h_cmd = re.sub(r"\bprocesses cpu sorted\b", "cpu-usage", h_cmd, flags=re.I)
            h_cmd = re.sub(r"\bprocesses cpu\b", "cpu-usage", h_cmd, flags=re.I)
            h_cmd = re.sub(r"\bprocesses memory\b", "memory-usage", h_cmd, flags=re.I)
            h_cmd = re.sub(r"\betherchannel summary\b", "eth-trunk", h_cmd, flags=re.I)
            h_cmd = re.sub(r"\bport-channel summary\b", "eth-trunk", h_cmd, flags=re.I)
            h_cmd = re.sub(r"\btraceroute\b", "tracert", h_cmd, flags=re.I)

            if tgt_grp in ["huawei", "hp_comware"]:
                return h_cmd

            return cls.translate_command(h_cmd, source_vendor="huawei", target_vendor=tgt_grp)

        return cmd_clean

    @classmethod
    def translate_batch(
        cls,
        commands: List[str],
        source_vendor: str = "huawei",
        target_vendors: Optional[List[str]] = None
    ) -> Dict[str, List[str]]:
        """
        Translate a list of commands from source vendor to multiple target vendors.
        Default target_vendors includes all 7 supported platforms.
        """
        if target_vendors is None:
            target_vendors = [
                "huawei",
                "cisco_ios",
                "juniper_junos",
                "cisco_nxos",
                "aruba_os",
                "hp_comware",
                "mikrotik_routeros",
            ]

        results = {tgt: [] for tgt in target_vendors}
        for cmd in commands:
            cmd_s = cmd.strip()
            if not cmd_s:
                continue
            for tgt in target_vendors:
                translated = cls.translate_command(cmd_s, source_vendor=source_vendor, target_vendor=tgt)
                results[tgt].append(translated)

        return results
