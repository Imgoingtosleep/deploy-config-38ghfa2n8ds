import os
import json
import uuid
import datetime
from typing import List, Dict, Any, Optional

DATA_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "templates.json")

class TemplateService:
    @staticmethod
    def _read_all() -> List[Dict[str, Any]]:
        if not os.path.exists(DATA_FILE):
            return []
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []

    @staticmethod
    def _save_all(templates: List[Dict[str, Any]]) -> bool:
        try:
            with open(DATA_FILE, "w", encoding="utf-8") as f:
                json.dump(templates, f, indent=2, ensure_ascii=False)
            return True
        except Exception:
            return False

    @classmethod
    def get_templates(cls, vendor: Optional[str] = None) -> List[Dict[str, Any]]:
        templates = cls._read_all()
        if vendor:
            return [t for t in templates if t.get("vendor") == vendor or t.get("vendor") == "all"]
        return templates

    @classmethod
    def get_template_by_id(cls, template_id: str) -> Optional[Dict[str, Any]]:
        templates = cls._read_all()
        for t in templates:
            if t.get("id") == template_id:
                return t
        return None

    @classmethod
    def create_template(cls, name: str, commands: List[str], vendor: str = "huawei", description: str = "", author: str = "Level 2 Engineer", regex: Optional[str] = None) -> Dict[str, Any]:
        templates = cls._read_all()
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        new_tpl = {
            "id": f"tpl-{str(uuid.uuid4())[:8]}",
            "name": name.strip(),
            "vendor": vendor.strip().lower(),
            "description": description.strip(),
            "author": author,
            "created_at": now_str,
            "commands": [c.strip() for c in commands if c.strip()],
            "regex": regex.strip() if regex and regex.strip() else None,
        }
        templates.insert(0, new_tpl)
        cls._save_all(templates)
        return new_tpl

    @classmethod
    def update_template(cls, template_id: str, name: str, commands: List[str], vendor: str = "huawei", description: str = "", regex: Optional[str] = None) -> Optional[Dict[str, Any]]:
        templates = cls._read_all()
        for idx, t in enumerate(templates):
            if t.get("id") == template_id:
                templates[idx]["name"] = name.strip()
                templates[idx]["vendor"] = vendor.strip().lower()
                templates[idx]["description"] = description.strip()
                templates[idx]["commands"] = [c.strip() for c in commands if c.strip()]
                templates[idx]["regex"] = regex.strip() if regex and regex.strip() else None
                templates[idx]["updated_at"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                cls._save_all(templates)
                return templates[idx]
        return None

    @classmethod
    def delete_template(cls, template_id: str) -> bool:
        templates = cls._read_all()
        filtered = [t for t in templates if t.get("id") != template_id]
        if len(filtered) < len(templates):
            cls._save_all(filtered)
            return True
        return False
