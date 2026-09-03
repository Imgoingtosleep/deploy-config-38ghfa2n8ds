import os
import json
import uuid
import datetime
from typing import List, Dict, Any, Optional

DATA_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "playbooks.json")

DEFAULT_PLAYBOOKS = [
    {
        "id": "pb-audit",
        "name": "Core Switch Migration Audit",
        "description": "Deep audit before cutting over traffic: routes, arp, port status, and logs",
        "category": "audit",
        "commands": [
            {"id": "pb-1", "name": "System Version", "cisco": "show version", "huawei": "display version"},
            {"id": "pb-2", "name": "IP Interfaces", "cisco": "show ip interface brief", "huawei": "display ip interface brief"},
            {"id": "pb-3", "name": "Routing Table", "cisco": "show ip route", "huawei": "display ip routing-table"},
            {"id": "pb-4", "name": "ARP Table", "cisco": "show ip arp", "huawei": "display arp all"},
            {"id": "pb-5", "name": "LLDP Neighbors", "cisco": "show cdp neighbors", "huawei": "display lldp neighbor brief"},
            {"id": "pb-6", "name": "Recent Syslogs", "cisco": "show logging | last 50", "huawei": "display logbuffer"},
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
            {"id": "pb-opt1", "name": "Transceiver Diagnostics", "cisco": "show interfaces transceiver", "huawei": "display transceiver diagnosis interface"},
            {"id": "pb-opt2", "name": "Transceiver Verbose Info", "cisco": "show interfaces transceiver detail", "huawei": "display transceiver verbose"},
            {"id": "pb-opt3", "name": "Interface Error Counters", "cisco": "show interfaces status", "huawei": "display interface brief"},
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
            {"id": "pb-perf1", "name": "CPU Usage", "cisco": "show processes cpu", "huawei": "display cpu-usage"},
            {"id": "pb-perf2", "name": "Memory Usage", "cisco": "show processes memory", "huawei": "display memory-usage"},
            {"id": "pb-perf3", "name": "Temperature & Fans", "cisco": "show environment", "huawei": "display temperature all"},
            {"id": "pb-perf4", "name": "Power Supply", "cisco": "show power", "huawei": "display device"},
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
    def create(cls, data: Dict[str, Any]) -> Dict[str, Any]:
        playbooks = cls._read_all()
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        new_id = f"pb-{str(uuid.uuid4())[:8]}"

        cisco_list = [c.strip() for c in data.get("cisco_commands") or [] if c.strip()]
        huawei_list = [h.strip() for h in data.get("huawei_commands") or [] if h.strip()]
        commands = data.get("commands", [])

        formatted_cmds = []
        if cisco_list or huawei_list:
            max_len = max(len(cisco_list), len(huawei_list))
            for i in range(max_len):
                c_cmd = cisco_list[i] if i < len(cisco_list) else ""
                h_cmd = huawei_list[i] if i < len(huawei_list) else ""
                disp_name = c_cmd if c_cmd else h_cmd
                if disp_name:
                    formatted_cmds.append({
                        "id": f"cmd-{i+1}",
                        "name": disp_name,
                        "cisco": c_cmd or disp_name,
                        "huawei": h_cmd or disp_name,
                        "isCustom": False,
                    })
        else:
            for idx, cmd in enumerate(commands):
                if isinstance(cmd, dict):
                    cmd_name = (cmd.get("name") or cmd.get("cisco") or cmd.get("huawei") or "").strip()
                    if cmd_name:
                        formatted_cmds.append({
                            "id": cmd.get("id") or f"cmd-{idx+1}",
                            "name": cmd_name,
                            "cisco": (cmd.get("cisco") or cmd_name).strip(),
                            "huawei": (cmd.get("huawei") or cmd_name).strip(),
                            "isCustom": cmd.get("isCustom", False),
                        })
                elif isinstance(cmd, str):
                    cmd_str = cmd.strip()
                    if cmd_str:
                        formatted_cmds.append({
                            "id": f"cmd-{idx+1}",
                            "name": cmd_str,
                            "cisco": cmd_str,
                            "huawei": cmd_str,
                            "isCustom": False,
                        })

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

                cisco_list = [c.strip() for c in data.get("cisco_commands") or [] if c.strip()]
                huawei_list = [h.strip() for h in data.get("huawei_commands") or [] if h.strip()]

                if cisco_list or huawei_list:
                    max_len = max(len(cisco_list), len(huawei_list))
                    formatted_cmds = []
                    for i in range(max_len):
                        c_cmd = cisco_list[i] if i < len(cisco_list) else ""
                        h_cmd = huawei_list[i] if i < len(huawei_list) else ""
                        disp_name = c_cmd if c_cmd else h_cmd
                        if disp_name:
                            formatted_cmds.append({
                                "id": f"cmd-{i+1}",
                                "name": disp_name,
                                "cisco": c_cmd or disp_name,
                                "huawei": h_cmd or disp_name,
                                "isCustom": False,
                            })
                    playbooks[idx]["commands"] = formatted_cmds
                elif "commands" in data and data["commands"] is not None:
                    formatted_cmds = []
                    for c_idx, cmd in enumerate(data["commands"]):
                        if isinstance(cmd, dict):
                            cmd_name = (cmd.get("name") or cmd.get("cisco") or cmd.get("huawei") or "").strip()
                            if cmd_name:
                                formatted_cmds.append({
                                    "id": cmd.get("id") or f"cmd-{c_idx+1}",
                                    "name": cmd_name,
                                    "cisco": (cmd.get("cisco") or cmd_name).strip(),
                                    "huawei": (cmd.get("huawei") or cmd_name).strip(),
                                    "isCustom": cmd.get("isCustom", False),
                                })
                        elif isinstance(cmd, str):
                            cmd_str = cmd.strip()
                            if cmd_str:
                                formatted_cmds.append({
                                    "id": f"cmd-{c_idx+1}",
                                    "name": cmd_str,
                                    "cisco": cmd_str,
                                    "huawei": cmd_str,
                                    "isCustom": False,
                                })
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
