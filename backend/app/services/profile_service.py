import os
import json
import uuid
import threading
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

from app.core.paths import data_file

DATA_FILE = data_file("credential_profiles.json")
file_lock = threading.Lock()

DEFAULT_PROFILES = [
    {
        "id": "prof-huawei-default",
        "name": "Huawei Multi-Tier Admin",
        "description": "Credentials for Huawei VRP switches with sequential fallback priorities",
        "device_type": "huawei",
        "port": 22,
        "is_default": True,
        "credentials": [
            {"priority": 1, "username": "admin", "password": "", "secret": "", "label": "SSH ลำดับที่ 1"},
            {"priority": 2, "username": "huawei", "password": "", "secret": "", "label": "SSH ลำดับที่ 2"}
        ],
        "username": "admin",
        "password": "",
        "secret": "",
        "created_at": "2026-09-04T00:00:00Z",
        "updated_at": "2026-09-04T00:00:00Z",
    },
    {
        "id": "prof-cisco-default",
        "name": "Cisco Multi-Tier Admin",
        "description": "Credentials for Cisco IOS / IOS-XE switches",
        "device_type": "cisco_ios",
        "port": 22,
        "is_default": False,
        "credentials": [
            {"priority": 1, "username": "admin", "password": "", "secret": "", "label": "SSH ลำดับที่ 1"},
            {"priority": 2, "username": "cisco", "password": "", "secret": "", "label": "SSH ลำดับที่ 2"}
        ],
        "username": "admin",
        "password": "",
        "secret": "",
        "created_at": "2026-09-04T00:00:00Z",
        "updated_at": "2026-09-04T00:00:00Z",
    },
    {
        "id": "prof-readonly",
        "name": "NOC Monitor / Audit",
        "description": "Operator account for read-only health checks and audits",
        "device_type": "autodetect",
        "port": 22,
        "is_default": False,
        "credentials": [
            {"priority": 1, "username": "operator", "password": "", "secret": "", "label": "Monitoring User"}
        ],
        "username": "operator",
        "password": "",
        "secret": "",
        "created_at": "2026-09-04T00:00:00Z",
        "updated_at": "2026-09-04T00:00:00Z",
    },
]

class ProfileService:
    @classmethod
    def _now_iso(cls) -> str:
        return datetime.now(timezone.utc).isoformat()

    @classmethod
    def _normalize_profile(cls, p: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize profile to ensure prioritized credentials list exists and is sorted"""
        creds = p.get("credentials")
        if not creds or not isinstance(creds, list):
            # Backward compatibility migration
            top_user = p.get("username") or ""
            top_pass = p.get("password") or ""
            top_secret = p.get("secret") or ""
            creds = [
                {
                    "priority": 1,
                    "username": top_user,
                    "password": top_pass,
                    "secret": top_secret,
                    "label": "SSH ลำดับที่ 1",
                }
            ]
        else:
            # Sort by priority ascending and re-index sequentially if needed
            cleaned_creds = []
            for idx, c in enumerate(sorted(creds, key=lambda x: int(x.get("priority", 999))), start=1):
                cleaned_creds.append({
                    "priority": idx,
                    "username": (c.get("username") or "").strip(),
                    "password": c.get("password") or "",
                    "secret": c.get("secret") or "",
                    "label": (c.get("label") or f"SSH ลำดับที่ {idx}").strip(),
                })
            creds = cleaned_creds if cleaned_creds else [
                {"priority": 1, "username": "", "password": "", "secret": "", "label": "SSH ลำดับที่ 1"}
            ]

        p["credentials"] = creds

        # Sync top-level fields from Priority 1 for legacy callers
        p1 = creds[0]
        p["username"] = p1.get("username", "")
        p["password"] = p1.get("password", "")
        p["secret"] = p1.get("secret", "")
        p["device_type"] = p.get("device_type") or "autodetect"
        p["port"] = int(p.get("port") or 22)
        return p

    @classmethod
    def _load_profiles(cls) -> List[Dict[str, Any]]:
        with file_lock:
            if not os.path.exists(DATA_FILE):
                os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
                normalized = [cls._normalize_profile(p) for p in DEFAULT_PROFILES]
                with open(DATA_FILE, "w", encoding="utf-8") as f:
                    json.dump(normalized, f, indent=2, ensure_ascii=False)
                return normalized

            try:
                with open(DATA_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        return [cls._normalize_profile(p) for p in data]
                    return [cls._normalize_profile(p) for p in DEFAULT_PROFILES]
            except Exception:
                return [cls._normalize_profile(p) for p in DEFAULT_PROFILES]

    @classmethod
    def _save_profiles(cls, profiles: List[Dict[str, Any]]) -> None:
        with file_lock:
            os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
            normalized = [cls._normalize_profile(p) for p in profiles]
            temp_file = f"{DATA_FILE}.tmp"
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(normalized, f, indent=2, ensure_ascii=False)
            os.replace(temp_file, DATA_FILE)

    @classmethod
    def get_profiles(cls) -> List[Dict[str, Any]]:
        """Return all saved credential profiles with prioritized credentials list"""
        return cls._load_profiles()

    @classmethod
    def get_profile_by_id(cls, profile_id: str) -> Optional[Dict[str, Any]]:
        """Find a profile by ID"""
        profiles = cls._load_profiles()
        for p in profiles:
            if p.get("id") == profile_id:
                return p
        return None

    @classmethod
    def create_profile(cls, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create and save a new credential profile with prioritized credentials list"""
        profiles = cls._load_profiles()
        now = cls._now_iso()
        profile_id = f"prof-{uuid.uuid4().hex[:8]}"

        is_default = bool(data.get("is_default", False))
        if is_default:
            for p in profiles:
                p["is_default"] = False

        # Build credentials array
        raw_creds = data.get("credentials")
        if not raw_creds:
            raw_creds = [{
                "priority": 1,
                "username": data.get("username") or "",
                "password": data.get("password") or "",
                "secret": data.get("secret") or "",
                "label": "SSH ลำดับที่ 1",
            }]

        new_profile = {
            "id": profile_id,
            "name": (data.get("name") or "Unnamed Profile").strip(),
            "description": (data.get("description") or "").strip(),
            "device_type": (data.get("device_type") or "autodetect").strip(),
            "port": int(data.get("port") or 22),
            "is_default": is_default,
            "credentials": raw_creds,
            "created_at": now,
            "updated_at": now,
        }

        new_profile = cls._normalize_profile(new_profile)

        # If this is the only profile, make it default
        if len(profiles) == 0:
            new_profile["is_default"] = True

        profiles.append(new_profile)
        cls._save_profiles(profiles)
        return new_profile

    @classmethod
    def update_profile(cls, profile_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update an existing credential profile"""
        profiles = cls._load_profiles()
        now = cls._now_iso()
        target = None

        for p in profiles:
            if p.get("id") == profile_id:
                target = p
                break

        if not target:
            return None

        is_default = data.get("is_default")
        if is_default is True:
            for p in profiles:
                p["is_default"] = False
            target["is_default"] = True
        elif is_default is False:
            target["is_default"] = False

        if "name" in data and data["name"] is not None:
            target["name"] = data["name"].strip()
        if "description" in data and data["description"] is not None:
            target["description"] = data["description"].strip()
        if "device_type" in data and data["device_type"] is not None:
            target["device_type"] = data["device_type"].strip()
        if "port" in data and data["port"] is not None:
            target["port"] = int(data["port"])

        if "credentials" in data and data["credentials"] is not None:
            target["credentials"] = data["credentials"]
        elif "username" in data or "password" in data or "secret" in data:
            # Fallback if updating via legacy single fields
            target["credentials"] = [{
                "priority": 1,
                "username": data.get("username", target.get("username", "")),
                "password": data.get("password", target.get("password", "")),
                "secret": data.get("secret", target.get("secret", "")),
                "label": "SSH ลำดับที่ 1",
            }]

        target["updated_at"] = now
        target = cls._normalize_profile(target)
        cls._save_profiles(profiles)
        return target

    @classmethod
    def delete_profile(cls, profile_id: str) -> bool:
        """Delete a profile by ID"""
        profiles = cls._load_profiles()
        initial_len = len(profiles)
        filtered = [p for p in profiles if p.get("id") != profile_id]

        if len(filtered) == initial_len:
            return False

        # If we deleted the default profile and profiles remain, set the first one as default
        has_default = any(p.get("is_default") for p in filtered)
        if not has_default and filtered:
            filtered[0]["is_default"] = True

        cls._save_profiles(filtered)
        return True

    @classmethod
    def set_default_profile(cls, profile_id: str) -> Optional[Dict[str, Any]]:
        """Set a profile as the default"""
        profiles = cls._load_profiles()
        target = None
        for p in profiles:
            if p.get("id") == profile_id:
                p["is_default"] = True
                p["updated_at"] = cls._now_iso()
                target = p
            else:
                p["is_default"] = False

        if target:
            cls._save_profiles(profiles)
        return target
