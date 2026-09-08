import os
import json
import uuid
import datetime
from typing import List, Dict, Any, Optional
from app.services.command_translator import CommandTranslator

DATA_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "playbooks.json")

DEFAULT_PLAYBOOKS = [
    {
        "id": "pb-audit",
        "name": "Core Switch Migration Audit",
        "description": "Deep audit before cutting over traffic: routes, arp, port status, and logs",
        "category": "audit",
        "commands": [
            {
                "id": "pb-1",
                "name": "System Version",
                "huawei": "display version",
                "cisco": "show version",
                "juniper": "show version",
                "nxos": "show version",
                "aruba": "show version",
                "comware": "display version",
                "mikrotik": "/system resource print",
            },
            {
                "id": "pb-2",
                "name": "IP Interfaces",
                "huawei": "display ip interface brief",
                "cisco": "show ip interface brief",
                "juniper": "show interfaces terse",
                "nxos": "show ip interface brief",
                "aruba": "show ip interface brief",
                "comware": "display ip interface brief",
                "mikrotik": "/ip address print",
            },
            {
                "id": "pb-3",
                "name": "Routing Table",
                "huawei": "display ip routing-table",
                "cisco": "show ip route",
                "juniper": "show route",
                "nxos": "show ip route",
                "aruba": "show ip route",
                "comware": "display ip routing-table",
                "mikrotik": "/ip route print",
            },
            {
                "id": "pb-4",
                "name": "ARP Table",
                "huawei": "display arp all",
                "cisco": "show ip arp",
                "juniper": "show arp",
                "nxos": "show ip arp",
                "aruba": "show arp",
                "comware": "display arp all",
                "mikrotik": "/ip arp print",
            },
            {
                "id": "pb-5",
                "name": "LLDP Neighbors",
                "huawei": "display lldp neighbor brief",
                "cisco": "show lldp neighbors",
                "juniper": "show lldp neighbors",
                "nxos": "show lldp neighbors",
                "aruba": "show lldp info remote-device",
                "comware": "display lldp neighbor list",
                "mikrotik": "/ip neighbor print",
            },
            {
                "id": "pb-6",
                "name": "Recent Syslogs",
                "huawei": "display logbuffer",
                "cisco": "show logging | last 50",
                "juniper": "show log messages | last 50",
                "nxos": "show logging last 50",
                "aruba": "show logging -r | include 50",
                "comware": "display logbuffer",
                "mikrotik": "/log print",
            },
        ],
        "created_at": "2026-09-03 00:00:00",
        "updated_at": None,
    },
    {
        "id": "pb-optical",
        "name": "Fiber & Transceiver SFP Diagnostic",
        "description": "Check optical power levels (dBm), signal attenuation, and link counters",
        "category": "optical",
        "commands": [
            {
                "id": "pb-opt1",
                "name": "Transceiver Diagnostics",
                "huawei": "display transceiver diagnosis interface",
                "cisco": "show interfaces transceiver",
                "juniper": "show interfaces diagnostics optics",
                "nxos": "show interface transceiver details",
                "aruba": "show interface transceiver",
                "comware": "display transceiver diagnosis interface",
                "mikrotik": "/interface ethernet monitor [find] once",
            },
            {
                "id": "pb-opt2",
                "name": "Transceiver Verbose Info",
                "huawei": "display transceiver verbose",
                "cisco": "show interfaces transceiver detail",
                "juniper": "show interfaces diagnostics optics",
                "nxos": "show interface transceiver details",
                "aruba": "show interface transceiver",
                "comware": "display transceiver verbose",
                "mikrotik": "/interface ethernet monitor [find] once",
            },
            {
                "id": "pb-opt3",
                "name": "Interface Error Counters",
                "huawei": "display interface brief",
                "cisco": "show interfaces status",
                "juniper": "show interfaces extensive",
                "nxos": "show interface status",
                "aruba": "show interface brief",
                "comware": "display interface brief",
                "mikrotik": "/interface print brief",
            },
        ],
        "created_at": "2026-09-03 00:00:00",
        "updated_at": None,
    },
    {
        "id": "pb-perf",
        "name": "Hardware Overheat & Resource Check",
        "description": "Check high CPU spikes, memory leak, temperature, and fan failures",
        "category": "environment",
        "commands": [
            {
                "id": "pb-perf1",
                "name": "CPU Usage",
                "huawei": "display cpu-usage",
                "cisco": "show processes cpu sorted",
                "juniper": "show chassis routing-engine",
                "nxos": "show system resources",
                "aruba": "show cpu",
                "comware": "display cpu-usage",
                "mikrotik": "/system resource print",
            },
            {
                "id": "pb-perf2",
                "name": "Memory Usage",
                "huawei": "display memory-usage",
                "cisco": "show processes memory",
                "juniper": "show system storage",
                "nxos": "show system resources",
                "aruba": "show memory",
                "comware": "display memory",
                "mikrotik": "/system resource print",
            },
            {
                "id": "pb-perf3",
                "name": "Temperature & Fans",
                "huawei": "display temperature all",
                "cisco": "show environment all",
                "juniper": "show chassis environment",
                "nxos": "show environment",
                "aruba": "show system temperature",
                "comware": "display environment",
                "mikrotik": "/system health print",
            },
            {
                "id": "pb-perf4",
                "name": "Power Supply",
                "huawei": "display device",
                "cisco": "show inventory",
                "juniper": "show chassis hardware",
                "nxos": "show module",
                "aruba": "show system",
                "comware": "display device",
                "mikrotik": "/system routerboard print",
            },
        ],
        "created_at": "2026-09-03 00:00:00",
        "updated_at": None,
    },
]

class PlaybookService:
    @classmethod
    def _read_all(cls) -> List[Dict[str, Any]]:
        os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
        if not os.path.exists(DATA_FILE):
            cls._save_all(DEFAULT_PLAYBOOKS)
            return list(DEFAULT_PLAYBOOKS)
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
                return []
        except Exception:
            return []

    @staticmethod
    def _save_all(playbooks: List[Dict[str, Any]]) -> bool:
        try:
            os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
            with open(DATA_FILE, "w", encoding="utf-8") as f:
                json.dump(playbooks, f, indent=2, ensure_ascii=False)
            return True
        except Exception:
            return False

    @classmethod
    def get_all(cls) -> List[Dict[str, Any]]:
        return cls._read_all()

    @classmethod
    def get_by_id(cls, playbook_id: str) -> Optional[Dict[str, Any]]:
        playbooks = cls._read_all()
        for pb in playbooks:
            if pb.get("id") == playbook_id:
                return pb
        return None

    @classmethod
    def _build_formatted_commands(cls, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Build unified multi-vendor command objects.
        Uses Huawei commands as PRIMARY input by default.
        Automatically translates missing vendor commands so user only has to input Huawei.
        """
        huawei_list = [h.strip() for h in (data.get("huawei_commands") or []) if h.strip()]
        cisco_list = [c.strip() for c in (data.get("cisco_commands") or []) if c.strip()]
        juniper_list = [j.strip() for j in (data.get("juniper_commands") or []) if j.strip()]
        aruba_list = [a.strip() for a in (data.get("aruba_commands") or []) if a.strip()]
        mikrotik_list = [m.strip() for m in (data.get("mikrotik_commands") or []) if m.strip()]
        commands = data.get("commands", [])

        # Case 1: Direct lists provided (Huawei as primary)
        if huawei_list or cisco_list:
            primary_list = huawei_list if huawei_list else cisco_list
            source_vendor = "huawei" if huawei_list else "cisco_ios"
            auto_translations = CommandTranslator.translate_batch(primary_list, source_vendor=source_vendor)

            max_len = max(len(huawei_list), len(cisco_list), len(juniper_list), len(aruba_list), len(mikrotik_list))
            formatted_cmds = []
            for i in range(max_len):
                h_cmd = huawei_list[i] if i < len(huawei_list) else ""
                c_cmd = cisco_list[i] if i < len(cisco_list) else ""
                j_cmd = juniper_list[i] if i < len(juniper_list) else ""
                a_cmd = aruba_list[i] if i < len(aruba_list) else ""
                m_cmd = mikrotik_list[i] if i < len(mikrotik_list) else ""

                # Auto-fill from translator if not explicitly provided
                auto_h = auto_translations["huawei"][i] if i < len(auto_translations["huawei"]) else ""
                auto_c = auto_translations["cisco_ios"][i] if i < len(auto_translations["cisco_ios"]) else ""
                auto_j = auto_translations["juniper_junos"][i] if i < len(auto_translations["juniper_junos"]) else ""
                auto_nx = auto_translations["cisco_nxos"][i] if i < len(auto_translations["cisco_nxos"]) else ""
                auto_ar = auto_translations["aruba_os"][i] if i < len(auto_translations["aruba_os"]) else ""
                auto_mk = auto_translations["mikrotik_routeros"][i] if i < len(auto_translations["mikrotik_routeros"]) else ""
                auto_cw = auto_translations["hp_comware"][i] if i < len(auto_translations["hp_comware"]) else ""

                disp_name = h_cmd or c_cmd or auto_h or auto_c or f"Command {i+1}"
                formatted_cmds.append({
                    "id": f"cmd-{i+1}",
                    "name": disp_name,
                    "huawei": h_cmd or auto_h or disp_name,
                    "cisco": c_cmd or auto_c or disp_name,
                    "juniper": j_cmd or auto_j or disp_name,
                    "nxos": auto_nx or disp_name,
                    "aruba": a_cmd or auto_ar or disp_name,
                    "mikrotik": m_cmd or auto_mk or disp_name,
                    "comware": auto_cw or disp_name,
                    "isCustom": False,
                })
            return formatted_cmds

        # Case 2: Object list provided
        formatted_cmds = []
        for idx, cmd in enumerate(commands):
            if isinstance(cmd, dict):
                h_cmd = (cmd.get("huawei") or "").strip()
                c_cmd = (cmd.get("cisco") or "").strip()
                j_cmd = (cmd.get("juniper") or "").strip()
                a_cmd = (cmd.get("aruba") or "").strip()
                m_cmd = (cmd.get("mikrotik") or "").strip()
                base_cmd = h_cmd or c_cmd or (cmd.get("name") or "").strip()

                if base_cmd:
                    src_v = CommandTranslator.detect_source_vendor(base_cmd)
                    auto_c = CommandTranslator.translate_command(base_cmd, source_vendor=src_v, target_vendor="cisco_ios")
                    auto_j = CommandTranslator.translate_command(base_cmd, source_vendor=src_v, target_vendor="juniper_junos")
                    auto_h = CommandTranslator.translate_command(base_cmd, source_vendor=src_v, target_vendor="huawei")
                    auto_nx = CommandTranslator.translate_command(base_cmd, source_vendor=src_v, target_vendor="cisco_nxos")
                    auto_ar = CommandTranslator.translate_command(base_cmd, source_vendor=src_v, target_vendor="aruba_os")
                    auto_mk = CommandTranslator.translate_command(base_cmd, source_vendor=src_v, target_vendor="mikrotik_routeros")
                    auto_cw = CommandTranslator.translate_command(base_cmd, source_vendor=src_v, target_vendor="hp_comware")

                    formatted_cmds.append({
                        "id": cmd.get("id") or f"cmd-{idx+1}",
                        "name": cmd.get("name") or base_cmd,
                        "huawei": h_cmd or auto_h or base_cmd,
                        "cisco": c_cmd or auto_c or base_cmd,
                        "juniper": j_cmd or auto_j or base_cmd,
                        "nxos": cmd.get("nxos") or auto_nx or base_cmd,
                        "aruba": a_cmd or cmd.get("aruba") or auto_ar or base_cmd,
                        "mikrotik": m_cmd or cmd.get("mikrotik") or auto_mk or base_cmd,
                        "comware": cmd.get("comware") or auto_cw or base_cmd,
                        "regex": (cmd.get("regex") or "").strip() or None,
                        "isCustom": cmd.get("isCustom", False),
                    })
            elif isinstance(cmd, str):
                cmd_str = cmd.strip()
                if cmd_str:
                    src_v = CommandTranslator.detect_source_vendor(cmd_str)
                    trans = CommandTranslator.translate_batch([cmd_str], source_vendor=src_v)
                    formatted_cmds.append({
                        "id": f"cmd-{idx+1}",
                        "name": cmd_str,
                        "huawei": trans["huawei"][0],
                        "cisco": trans["cisco_ios"][0],
                        "juniper": trans["juniper_junos"][0],
                        "nxos": trans["cisco_nxos"][0],
                        "aruba": trans["aruba_os"][0],
                        "mikrotik": trans["mikrotik_routeros"][0],
                        "comware": trans["hp_comware"][0],
                        "isCustom": False,
                    })

        return formatted_cmds

    @classmethod
    def create(cls, data: Dict[str, Any]) -> Dict[str, Any]:
        playbooks = cls._read_all()
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        new_id = f"pb-{str(uuid.uuid4())[:8]}"

        formatted_cmds = cls._build_formatted_commands(data)

        new_pb = {
            "id": new_id,
            "name": data.get("name", "New Playbook").strip(),
            "description": data.get("description", "").strip(),
            "category": data.get("category", "custom").strip(),
            "commands": formatted_cmds,
            "created_at": now_str,
            "updated_at": None,
        }
        playbooks.append(new_pb)
        cls._save_all(playbooks)
        return new_pb

    @classmethod
    def update(cls, playbook_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        playbooks = cls._read_all()
        for idx, pb in enumerate(playbooks):
            if pb.get("id") == playbook_id:
                if "name" in data and data["name"] is not None:
                    playbooks[idx]["name"] = data["name"].strip()
                if "description" in data and data["description"] is not None:
                    playbooks[idx]["description"] = data["description"].strip()
                if "category" in data and data["category"] is not None:
                    playbooks[idx]["category"] = data["category"].strip()

                if any(k in data for k in ["huawei_commands", "cisco_commands", "juniper_commands", "aruba_commands", "mikrotik_commands", "commands", "vendor_commands"]):
                    formatted_cmds = cls._build_formatted_commands(data)
                    playbooks[idx]["commands"] = formatted_cmds

                playbooks[idx]["updated_at"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                cls._save_all(playbooks)
                return playbooks[idx]

        return None

    @classmethod
    def delete(cls, playbook_id: str) -> bool:
        playbooks = cls._read_all()
        filtered = [p for p in playbooks if p.get("id") != playbook_id]
        if len(filtered) < len(playbooks):
            cls._save_all(filtered)
            return True
        return False
