"""
User-made configuration templates for the Deploy Config page: a named block of
CLI config for one vendor, optionally with {{VARIABLE}} placeholders that the
page asks for when the template is inserted. Stored in data/config_templates.json
next to the other editable lists, so every browser on the server sees the same set.
"""
import os
import json
import uuid
import threading
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

DATA_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "config_templates.json")
# Keys ("<vendor>:<title>") of the page's built-in templates the user deleted.
# The built-ins live in the frontend code, so deleting one hides it for good.
HIDDEN_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "config_templates_hidden.json")
file_lock = threading.Lock()

VALID_VENDORS = ["huawei", "cisco_ios", "aruba_os", "juniper_junos"]
DEFAULT_CATEGORY = "My Templates"
MAX_NAME_LEN = 120
MAX_CONFIG_LEN = 200_000


class ConfigTemplateError(ValueError):
    pass


class ConfigTemplateService:
    @classmethod
    def _now_iso(cls) -> str:
        return datetime.now(timezone.utc).isoformat()

    @classmethod
    def _clean(cls, data: Dict[str, Any], base: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Merge `data` over `base` and validate; raises ConfigTemplateError"""
        t = dict(base or {})
        for key in ("name", "vendor", "category", "description", "config"):
            if key in data and data[key] is not None:
                t[key] = data[key]

        name = str(t.get("name") or "").strip()
        if not name:
            raise ConfigTemplateError("Template name is required")
        if len(name) > MAX_NAME_LEN:
            raise ConfigTemplateError(f"Template name is longer than {MAX_NAME_LEN} characters")
        vendor = str(t.get("vendor") or "").strip().lower()
        if vendor not in VALID_VENDORS:
            raise ConfigTemplateError(f"Vendor must be one of: {', '.join(VALID_VENDORS)}")
        # Keep the leading indentation of each line: it is meaningful in CLI config
        config = str(t.get("config") or "").replace("\r\n", "\n").rstrip()
        if not config.strip():
            raise ConfigTemplateError("Template config is empty")
        if len(config) > MAX_CONFIG_LEN:
            raise ConfigTemplateError("Template config is too large")

        t["name"] = name
        t["vendor"] = vendor
        t["category"] = str(t.get("category") or "").strip() or DEFAULT_CATEGORY
        t["description"] = str(t.get("description") or "").strip()
        t["config"] = config
        return t

    @classmethod
    def _load(cls) -> List[Dict[str, Any]]:
        with file_lock:
            if not os.path.exists(DATA_FILE):
                return []
            try:
                with open(DATA_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception:
                return []
        return [t for t in data if isinstance(t, dict) and t.get("id")] if isinstance(data, list) else []

    @classmethod
    def _save(cls, templates: List[Dict[str, Any]], path: str = DATA_FILE) -> None:
        with file_lock:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            temp_file = f"{path}.tmp"
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(templates, f, indent=2, ensure_ascii=False)
            os.replace(temp_file, path)

    @classmethod
    def get_hidden_builtins(cls) -> List[str]:
        with file_lock:
            if not os.path.exists(HIDDEN_FILE):
                return []
            try:
                with open(HIDDEN_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception:
                return []
        return [k for k in data if isinstance(k, str)] if isinstance(data, list) else []

    @classmethod
    def hide_builtin(cls, key: str) -> List[str]:
        key = (key or "").strip()
        if not key:
            raise ConfigTemplateError("Template key is required")
        hidden = cls.get_hidden_builtins()
        if key not in hidden:
            hidden.append(key)
            cls._save(hidden, HIDDEN_FILE)
        return hidden

    @classmethod
    def get_templates(cls, vendor: Optional[str] = None) -> List[Dict[str, Any]]:
        templates = cls._load()
        if vendor:
            templates = [t for t in templates if t.get("vendor") == vendor]
        return templates

    @classmethod
    def create_template(cls, data: Dict[str, Any]) -> Dict[str, Any]:
        t = cls._clean(data)
        now = cls._now_iso()
        t["id"] = f"cfg-{uuid.uuid4().hex[:10]}"
        t["created_at"] = now
        t["updated_at"] = now
        templates = cls._load()
        templates.insert(0, t)
        cls._save(templates)
        return t

    @classmethod
    def update_template(cls, template_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        templates = cls._load()
        for idx, t in enumerate(templates):
            if t.get("id") == template_id:
                updated = cls._clean(data, t)
                updated["id"] = template_id
                updated["updated_at"] = cls._now_iso()
                templates[idx] = updated
                cls._save(templates)
                return updated
        return None

    @classmethod
    def delete_template(cls, template_id: str) -> bool:
        templates = cls._load()
        remaining = [t for t in templates if t.get("id") != template_id]
        if len(remaining) == len(templates):
            return False
        cls._save(remaining)
        return True
