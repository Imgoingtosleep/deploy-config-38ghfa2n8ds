"""
User-defined model rules: regexes edited from the LLDP page that cut the model
name out of 'display version' / 'show version' output and LLDP System
description, and optionally decide the device role (router / switch /
firewall ...). They run before the built-in Huawei / Cisco regexes in
LldpService, so a new product line is handled without a code change.
"""
import os
import re
import json
import uuid
import threading
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

DATA_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "model_rules.json")
file_lock = threading.Lock()

# Same device types as the topology editor; '' = let the model decide (built-in router / switch guess)
VALID_ROLES = ["", "router", "switch", "firewall", "server", "cloud", "pc", "wireless"]
BUILDER_MODES = ["example", "prefix", "after", "regex"]
MAX_PATTERN_LEN = 500


class ModelRuleError(ValueError):
    pass


def compile_rule(rule: Dict[str, Any]) -> re.Pattern:
    """Compile a rule's pattern, raising ModelRuleError with a readable reason"""
    pattern = str(rule.get("pattern") or "")
    if not pattern.strip():
        raise ModelRuleError("Pattern is required")
    if len(pattern) > MAX_PATTERN_LEN:
        raise ModelRuleError(f"Pattern is longer than {MAX_PATTERN_LEN} characters")
    flags = re.MULTILINE | (re.IGNORECASE if rule.get("ignore_case") else 0)
    try:
        rx = re.compile(pattern, flags)
    except re.error as e:
        raise ModelRuleError(f"Invalid regex: {e}")
    if rx.groups > 1 and "model" not in rx.groupindex:
        raise ModelRuleError("Pattern has several groups: name the model one (?P<model>...) or use (?:...) for the others")
    return rx


def rule_model(rx: re.Pattern, m: re.Match) -> str:
    """The model part of a match: (?P<model>...), else group 1, else the whole match"""
    if "model" in rx.groupindex:
        return (m.group("model") or "").strip()
    return ((m.group(1) if rx.groups else m.group(0)) or "").strip()


class ModelRuleService:
    # (file mtime, compiled enabled rules) so a scan over thousands of hosts compiles once
    _cache: Dict[str, Any] = {"mtime": None, "rules": []}
    # model -> rule id that cut it out of the text, so a pattern written around its
    # context ('Model: (NX-\d+)') still gives the role for the bare model name later
    _extracted_by: Dict[str, str] = {}

    @classmethod
    def _now_iso(cls) -> str:
        return datetime.now(timezone.utc).isoformat()

    @classmethod
    def _normalize(cls, r: Dict[str, Any], fallback_priority: int = 1) -> Dict[str, Any]:
        r["name"] = (r.get("name") or "Unnamed rule").strip()
        r["match"] = (r.get("match") or "").strip()
        r["pattern"] = str(r.get("pattern") or "")
        role = (r.get("role") or "").strip().lower()
        r["role"] = role if role in VALID_ROLES else ""
        r["ignore_case"] = bool(r.get("ignore_case", False))
        r["enabled"] = bool(r.get("enabled", True))
        mode = (r.get("builder_mode") or "regex").strip().lower()
        r["builder_mode"] = mode if mode in BUILDER_MODES else "regex"
        r["builder_value"] = str(r.get("builder_value") or "")
        try:
            r["priority"] = int(r.get("priority") or fallback_priority)
        except (TypeError, ValueError):
            r["priority"] = fallback_priority
        return r

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
        if not isinstance(data, list):
            return []
        return [cls._normalize(r, i) for i, r in enumerate(data, 1) if isinstance(r, dict)]

    @classmethod
    def _save(cls, rules: List[Dict[str, Any]]) -> None:
        with file_lock:
            os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
            temp_file = f"{DATA_FILE}.tmp"
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(rules, f, indent=2, ensure_ascii=False)
            os.replace(temp_file, DATA_FILE)
        cls._cache["mtime"] = None

    @classmethod
    def get_rules(cls) -> List[Dict[str, Any]]:
        """All rules, lowest priority number first"""
        return sorted(cls._load(), key=lambda r: (r["priority"], r["name"]))

    @classmethod
    def compiled_rules(cls) -> List[Dict[str, Any]]:
        """Enabled rules with their compiled regex ('_rx'); a rule that no longer compiles is skipped"""
        try:
            mtime = os.path.getmtime(DATA_FILE)
        except OSError:
            mtime = 0
        if cls._cache["mtime"] == mtime:
            return cls._cache["rules"]
        compiled = []
        for r in cls.get_rules():
            if not r["enabled"]:
                continue
            try:
                compiled.append({**r, "_rx": compile_rule(r)})
            except ModelRuleError:
                continue
        cls._cache = {"mtime": mtime, "rules": compiled}
        cls._extracted_by = {}
        return compiled

    @classmethod
    def _validate(cls, rule: Dict[str, Any]) -> None:
        compile_rule(rule)
        if (rule.get("role") or "") not in VALID_ROLES:
            raise ModelRuleError(f"role must be one of {[r for r in VALID_ROLES if r]} or empty")

    @classmethod
    def create_rule(cls, data: Dict[str, Any]) -> Dict[str, Any]:
        cls._validate(data)
        rules = cls._load()
        now = cls._now_iso()
        priority = data.get("priority")
        if priority is None:
            priority = max([r["priority"] for r in rules] or [0]) + 1
        rule = cls._normalize({
            "id": f"mrule-{uuid.uuid4().hex[:8]}",
            "name": data.get("name"),
            "match": data.get("match"),
            "pattern": data.get("pattern"),
            "role": data.get("role"),
            "ignore_case": data.get("ignore_case", False),
            "enabled": data.get("enabled", True),
            "priority": priority,
            "builder_mode": data.get("builder_mode"),
            "builder_value": data.get("builder_value"),
            "created_at": now,
            "updated_at": now,
        })
        rules.append(rule)
        cls._save(rules)
        return rule

    @classmethod
    def update_rule(cls, rule_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        rules = cls._load()
        target = next((r for r in rules if r.get("id") == rule_id), None)
        if not target:
            return None
        merged = {**target, **{k: v for k, v in data.items() if v is not None}}
        cls._validate(merged)
        target.update(cls._normalize(merged))
        target["updated_at"] = cls._now_iso()
        cls._save(rules)
        return target

    @classmethod
    def delete_rule(cls, rule_id: str) -> bool:
        rules = cls._load()
        remaining = [r for r in rules if r.get("id") != rule_id]
        if len(remaining) == len(rules):
            return False
        cls._save(remaining)
        return True

    @classmethod
    def reorder(cls, ordered_ids: List[str]) -> List[Dict[str, Any]]:
        """Renumber priorities from the given order; rules left out keep following it"""
        rules = sorted(cls._load(), key=lambda r: (r["priority"], r["name"]))
        rank = {rid: i for i, rid in enumerate(ordered_ids)}
        rules.sort(key=lambda r: (0, rank[r["id"]]) if r["id"] in rank else (1, r["priority"]))
        for i, r in enumerate(rules, 1):
            r["priority"] = i
        cls._save(rules)
        return cls.get_rules()

    @classmethod
    def match_model(cls, text: str, rules: Optional[List[Dict[str, Any]]] = None) -> Optional[Dict[str, Any]]:
        """First rule whose keyword is in the text and whose pattern finds a model: {model, rule}"""
        text = text or ""
        lowered = text.lower()
        for r in cls.compiled_rules() if rules is None else rules:
            if r["match"] and r["match"].lower() not in lowered:
                continue
            for m in r["_rx"].finditer(text):
                model = rule_model(r["_rx"], m)
                if model:
                    if rules is None:
                        if len(cls._extracted_by) > 20000:
                            cls._extracted_by.clear()
                        cls._extracted_by[model] = r["id"]
                    return {"model": model, "rule": r}
        return None

    @classmethod
    def match_role(cls, model: str, rules: Optional[List[Dict[str, Any]]] = None) -> Optional[Dict[str, Any]]:
        """
        First rule with a role whose pattern matches the model name, or that cut
        this model out of the version / description text: {role, rule}
        """
        if not model:
            return None
        active = cls.compiled_rules() if rules is None else rules
        for r in active:
            if r["role"] and r["_rx"].search(model):
                return {"role": r["role"], "rule": r}
        source = cls._extracted_by.get(model)
        for r in active:
            if r["role"] and r["id"] == source:
                return {"role": r["role"], "rule": r}
        return None
