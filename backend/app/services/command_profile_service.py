"""
Command profiles for LLDP collection: which CLI commands to run on a device,
independent of the SSH username / password (those live in credential profiles).

The LLDP collector walks the profiles in priority order on the already open SSH
session: Huawei commands first, and when the device rejects them it retries the
same session with the next profile (Cisco), so mixed-vendor subnets need one
login per host only.
"""
import os
import json
import uuid
import threading
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

DATA_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "command_profiles.json")
file_lock = threading.Lock()

COMMAND_KEYS = ["pager_disable", "sysname", "version", "lldp_brief", "lldp_detail", "lldp_full"]
# Commands whose output can carry a user regex; 'pager_disable' prints nothing worth reading
REGEX_KEYS = ["sysname", "version", "lldp_brief", "lldp_detail", "lldp_full"]
VALID_PARSERS = ["huawei", "cisco"]

DEFAULT_PROFILES = [
    {
        "id": "cmdprof-huawei",
        "name": "Huawei VRP",
        "description": "display-style commands for Huawei VRP (S / CE / AR / NE series)",
        "parser": "huawei",
        "priority": 1,
        "enabled": True,
        "commands": {
            "pager_disable": "screen-length 0 temporary",
            "sysname": "display current-configuration | include sysname",
            "version": "display version",
            "lldp_brief": "display lldp neighbor brief",
            "lldp_detail": "display lldp neighbor interface {intf}",
            "lldp_full": "display lldp neighbor",
        },
        "created_at": "2026-09-16T00:00:00Z",
        "updated_at": "2026-09-16T00:00:00Z",
    },
    {
        "id": "cmdprof-cisco",
        "name": "Cisco IOS / IOS-XE",
        "description": "show-style commands for Cisco IOS, IOS-XE and NX-OS",
        "parser": "cisco",
        "priority": 2,
        "enabled": True,
        "commands": {
            "pager_disable": "terminal length 0",
            "sysname": "show running-config | include hostname",
            "version": "show version",
            "lldp_brief": "show lldp neighbors",
            "lldp_detail": "show lldp neighbors {intf} detail",
            "lldp_full": "show lldp neighbors detail",
        },
        "created_at": "2026-09-16T00:00:00Z",
        "updated_at": "2026-09-16T00:00:00Z",
    },
]


class CommandProfileService:
    @classmethod
    def _now_iso(cls) -> str:
        return datetime.now(timezone.utc).isoformat()

    @classmethod
    def _default_commands_for(cls, parser: str) -> Dict[str, str]:
        for d in DEFAULT_PROFILES:
            if d["parser"] == parser:
                return dict(d["commands"])
        return {k: "" for k in COMMAND_KEYS}

    @classmethod
    def _normalize(cls, p: Dict[str, Any], fallback_priority: int = 1) -> Dict[str, Any]:
        parser = (p.get("parser") or "huawei").strip().lower()
        if parser not in VALID_PARSERS:
            parser = "huawei"
        p["parser"] = parser
        p["name"] = (p.get("name") or "Unnamed Command Profile").strip()
        p["description"] = (p.get("description") or "").strip()
        p["enabled"] = bool(p.get("enabled", True))
        try:
            p["priority"] = int(p.get("priority") or fallback_priority)
        except (TypeError, ValueError):
            p["priority"] = fallback_priority

        # Missing commands fall back to the built-in set for that parser, so a
        # half-filled profile still collects instead of sending empty commands
        defaults = cls._default_commands_for(parser)
        raw = p.get("commands") or {}
        if not isinstance(raw, dict):
            raw = {}
        p["commands"] = {k: (str(raw.get(k) or "").strip() or defaults.get(k, "")) for k in COMMAND_KEYS}

        # Regexes are optional throughout: an empty pattern means "let the parser do it"
        raw_rx = p.get("regexes") or {}
        if not isinstance(raw_rx, dict):
            raw_rx = {}
        p["regexes"] = {k: str(raw_rx.get(k) or "").strip() for k in REGEX_KEYS}
        return p

    @classmethod
    def _load(cls) -> List[Dict[str, Any]]:
        with file_lock:
            if not os.path.exists(DATA_FILE):
                os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
                normalized = [cls._normalize(dict(p), i) for i, p in enumerate(DEFAULT_PROFILES, 1)]
                with open(DATA_FILE, "w", encoding="utf-8") as f:
                    json.dump(normalized, f, indent=2, ensure_ascii=False)
                return normalized
            try:
                with open(DATA_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, list) and data:
                    return [cls._normalize(p, i) for i, p in enumerate(data, 1)]
            except Exception:
                pass
            return [cls._normalize(dict(p), i) for i, p in enumerate(DEFAULT_PROFILES, 1)]

    @classmethod
    def _save(cls, profiles: List[Dict[str, Any]]) -> None:
        with file_lock:
            os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
            normalized = [cls._normalize(p, i) for i, p in enumerate(profiles, 1)]
            temp_file = f"{DATA_FILE}.tmp"
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(normalized, f, indent=2, ensure_ascii=False)
            os.replace(temp_file, DATA_FILE)

    @classmethod
    def get_profiles(cls) -> List[Dict[str, Any]]:
        """All command profiles, lowest priority number first"""
        return sorted(cls._load(), key=lambda p: (int(p.get("priority", 999)), p.get("name", "")))

    @classmethod
    def get_profile_by_id(cls, profile_id: str) -> Optional[Dict[str, Any]]:
        return next((p for p in cls._load() if p.get("id") == profile_id), None)

    @classmethod
    def resolve_ordered(cls, profile_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """
        The profiles to try, in order. Explicit IDs keep the caller's order
        (unknown IDs ignored); without IDs every enabled profile is used by
        priority. Never returns an empty list, so collection always has commands.
        """
        all_profiles = cls.get_profiles()
        if profile_ids:
            by_id = {p["id"]: p for p in all_profiles}
            picked = []
            for pid in profile_ids:
                prof = by_id.get(pid)
                if prof and prof["id"] not in {p["id"] for p in picked}:
                    picked.append(prof)
            if picked:
                return picked
        enabled = [p for p in all_profiles if p.get("enabled", True)]
        return enabled or all_profiles[:1] or [cls._normalize(dict(DEFAULT_PROFILES[0]))]

    @classmethod
    def create_profile(cls, data: Dict[str, Any]) -> Dict[str, Any]:
        profiles = cls._load()
        now = cls._now_iso()
        priority = data.get("priority")
        if priority is None:
            priority = max([int(p.get("priority", 0)) for p in profiles] or [0]) + 1
        new_profile = cls._normalize({
            "id": f"cmdprof-{uuid.uuid4().hex[:8]}",
            "name": data.get("name"),
            "description": data.get("description"),
            "parser": data.get("parser"),
            "priority": priority,
            "enabled": data.get("enabled", True),
            "commands": data.get("commands"),
            "regexes": data.get("regexes"),
            "created_at": now,
            "updated_at": now,
        })
        profiles.append(new_profile)
        cls._save(profiles)
        return new_profile

    @classmethod
    def update_profile(cls, profile_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        profiles = cls._load()
        target = next((p for p in profiles if p.get("id") == profile_id), None)
        if not target:
            return None
        for field in ["name", "description", "parser", "priority", "enabled"]:
            if field in data and data[field] is not None:
                target[field] = data[field]
        if data.get("commands") is not None:
            target["commands"] = data["commands"]
        if data.get("regexes") is not None:
            target["regexes"] = data["regexes"]
        target["updated_at"] = cls._now_iso()
        cls._save(profiles)
        return cls._normalize(target)

    @classmethod
    def delete_profile(cls, profile_id: str) -> bool:
        profiles = cls._load()
        remaining = [p for p in profiles if p.get("id") != profile_id]
        if len(remaining) == len(profiles):
            return False
        if not remaining:
            # Never leave the collector without a command set
            return False
        cls._save(remaining)
        return True

    @classmethod
    def reorder(cls, ordered_ids: List[str]) -> List[Dict[str, Any]]:
        """Renumber priorities from the given order; profiles left out keep following it"""
        profiles = cls._load()
        by_id = {p["id"]: p for p in profiles}
        rank = 1
        for pid in ordered_ids:
            if pid in by_id:
                by_id[pid]["priority"] = rank
                by_id[pid]["updated_at"] = cls._now_iso()
                rank += 1
        for p in sorted(profiles, key=lambda x: int(x.get("priority", 999))):
            if p["id"] not in ordered_ids:
                p["priority"] = rank
                rank += 1
        cls._save(profiles)
        return cls.get_profiles()
