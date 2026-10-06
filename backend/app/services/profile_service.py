import os
import json
import uuid
import threading
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from cryptography.fernet import Fernet

from app.core.config import settings

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
file_lock = threading.Lock()

def get_fernet() -> Fernet:
    key = getattr(settings, "FERNET_MASTER_KEY", "uO1QeB4n5HwJ9PzvD3tK2mXq8YcR6L0A_7fVcSgTZbI=")
    return Fernet(key.encode())

def encrypt_value(value: str) -> str:
    if not value: return ""
    if value.startswith("gAAAAA"): return value # already encrypted
    f = get_fernet()
    return f.encrypt(value.encode()).decode()

def decrypt_value(value: str) -> str:
    if not value: return ""
    if not value.startswith("gAAAAA"): return value # not encrypted
    f = get_fernet()
    try:
        return f.decrypt(value.encode()).decode()
    except Exception:
        return "" # Ignore failure, return empty

DEFAULT_PROFILES = [
    {
        "id": "prof_system_huawei",
        "name": "Huawei Multi-Tier Admin",
        "description": "Credentials for Huawei VRP switches",
        "port": 22,
        "is_default": True,
        "credentials": [
            {"priority": 1, "username": "admin", "password": "", "secret": "", "label": "SSH ลำดับที่ 1"},
        ],
        "created_at": "2026-09-04T00:00:00Z",
        "updated_at": "2026-09-04T00:00:00Z",
    }
]

class ProfileService:
    @classmethod
    def _now_iso(cls) -> str:
        return datetime.now(timezone.utc).isoformat()

    @classmethod
    def _get_filename(cls, username: str) -> str:
        return os.path.join(DATA_DIR, f"credential_profiles_{username}.json")

    @classmethod
    def _normalize_profile(cls, p: Dict[str, Any], encrypt=False) -> Dict[str, Any]:
        creds = p.get("credentials") or []
        if not creds:
            creds = [{
                "priority": 1, 
                "username": p.get("username", ""), 
                "password": p.get("password", ""), 
                "secret": p.get("secret", ""), 
                "label": "SSH ลำดับที่ 1"
            }]
        
        cleaned = []
        for idx, c in enumerate(sorted(creds, key=lambda x: int(x.get("priority", 999))), start=1):
            pwd = c.get("password") or ""
            sec = c.get("secret") or ""
            
            if encrypt:
                pwd = encrypt_value(pwd) if pwd else ""
                sec = encrypt_value(sec) if sec else ""
            else:
                pwd = decrypt_value(pwd) if pwd else ""
                sec = decrypt_value(sec) if sec else ""

            cleaned.append({
                "priority": idx,
                "username": (c.get("username") or "").strip(),
                "password": pwd,
                "secret": sec,
                "label": (c.get("label") or f"SSH ลำดับที่ {idx}").strip(),
            })
            
        p["credentials"] = cleaned
        if cleaned:
            p["username"] = cleaned[0]["username"]
            p["password"] = cleaned[0]["password"]
            p["secret"] = cleaned[0]["secret"]
            
        p.pop("device_type", None)
        p["port"] = int(p.get("port") or 22)
        return p

    @classmethod
    def _load_profiles(cls, username: str) -> List[Dict[str, Any]]:
        file_path = cls._get_filename(username)
        with file_lock:
            if not os.path.exists(file_path):
                os.makedirs(DATA_DIR, exist_ok=True)
                # Encrypt default profiles before saving
                normalized = [cls._normalize_profile(dict(p), encrypt=True) for p in DEFAULT_PROFILES]
                with open(file_path, "w", encoding="utf-8") as f:
                    json.dump(normalized, f, indent=2, ensure_ascii=False)
                # Return decrypted
                return [cls._normalize_profile(dict(p), encrypt=False) for p in normalized]

            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        return [cls._normalize_profile(p, encrypt=False) for p in data]
                    return []
            except Exception:
                return []

    @classmethod
    def _save_profiles(cls, profiles: List[Dict[str, Any]], username: str) -> None:
        file_path = cls._get_filename(username)
        with file_lock:
            os.makedirs(DATA_DIR, exist_ok=True)
            normalized = [cls._normalize_profile(dict(p), encrypt=True) for p in profiles]
            temp_file = f"{file_path}.tmp"
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(normalized, f, indent=2, ensure_ascii=False)
            os.replace(temp_file, file_path)

    @classmethod
    def get_profiles(cls, username: str) -> List[Dict[str, Any]]:
        return cls._load_profiles(username)

    @classmethod
    def get_profile_by_id(cls, profile_id: str, explicit_username: str = None) -> Optional[Dict[str, Any]]:
        username = explicit_username
        if not username:
            if profile_id.startswith("prof_"):
                parts = profile_id.split("_", 2)
                if len(parts) >= 3:
                    username = parts[1]
            if profile_id.startswith("prof-"):
                username = "system" # Fallback for old ones

        if not username:
            return None

        profiles = cls._load_profiles(username)
        for p in profiles:
            if p.get("id") == profile_id:
                return p
        return None

    @classmethod
    def create_profile(cls, data: Dict[str, Any], username: str) -> Dict[str, Any]:
        profiles = cls._load_profiles(username)
        now = cls._now_iso()
        profile_id = f"prof_{username}_{uuid.uuid4().hex[:8]}"

        is_default = bool(data.get("is_default", False))
        if is_default:
            for p in profiles:
                p["is_default"] = False

        raw_creds = data.get("credentials") or [{
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
            "port": int(data.get("port") or 22),
            "is_default": is_default,
            "credentials": raw_creds,
            "created_at": now,
            "updated_at": now,
        }

        # _normalize_profile will decrypt if encrypt=False, but it's new so nothing to decrypt yet.
        new_profile = cls._normalize_profile(new_profile, encrypt=False)
        if len(profiles) == 0:
            new_profile["is_default"] = True

        profiles.append(new_profile)
        cls._save_profiles(profiles, username)
        return new_profile

    @classmethod
    def update_profile(cls, profile_id: str, data: Dict[str, Any], username: str) -> Optional[Dict[str, Any]]:
        profiles = cls._load_profiles(username)
        now = cls._now_iso()
        target = None
        for p in profiles:
            if p.get("id") == profile_id:
                target = p
                break
        if not target: return None

        if data.get("is_default") is True:
            for p in profiles: p["is_default"] = False
            target["is_default"] = True
        elif data.get("is_default") is False:
            target["is_default"] = False

        if "name" in data: target["name"] = data["name"].strip()
        if "description" in data: target["description"] = data.get("description", "").strip()
        if "port" in data: target["port"] = int(data["port"])
        if "credentials" in data:
            target["credentials"] = data["credentials"]
        elif any(k in data for k in ["username", "password", "secret"]):
            target["credentials"] = [{
                "priority": 1,
                "username": data.get("username", target.get("username", "")),
                "password": data.get("password", target.get("password", "")),
                "secret": data.get("secret", target.get("secret", "")),
                "label": "SSH ลำดับที่ 1",
            }]

        target["updated_at"] = now
        target = cls._normalize_profile(target, encrypt=False)
        cls._save_profiles(profiles, username)
        return target

    @classmethod
    def delete_profile(cls, profile_id: str, username: str) -> bool:
        profiles = cls._load_profiles(username)
        initial_len = len(profiles)
        filtered = [p for p in profiles if p.get("id") != profile_id]
        if len(filtered) == initial_len: return False
        if not any(p.get("is_default") for p in filtered) and filtered:
            filtered[0]["is_default"] = True
        cls._save_profiles(filtered, username)
        return True

    @classmethod
    def set_default_profile(cls, profile_id: str, username: str) -> Optional[Dict[str, Any]]:
        profiles = cls._load_profiles(username)
        target = None
        for p in profiles:
            if p.get("id") == profile_id:
                p["is_default"] = True
                p["updated_at"] = cls._now_iso()
                target = p
            else:
                p["is_default"] = False
        if target:
            cls._save_profiles(profiles, username)
        return target

