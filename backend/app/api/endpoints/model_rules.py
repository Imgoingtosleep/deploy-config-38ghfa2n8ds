from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException
from app.schemas.model_rule import ModelRule, ModelRuleCreate, ModelRuleReorder, ModelRuleTest, ModelRuleUpdate
from app.services.lldp_service import LldpService
from app.services.model_rule_service import ModelRuleError, ModelRuleService, compile_rule, rule_model

router = APIRouter()


@router.get("", response_model=List[ModelRule])
def list_model_rules():
    """Custom model rules in the order they are tried (priority 1 first)"""
    return ModelRuleService.get_rules()


@router.post("", response_model=ModelRule)
def create_model_rule(request: ModelRuleCreate):
    if not request.name.strip():
        raise HTTPException(status_code=400, detail="Rule name is required")
    try:
        return ModelRuleService.create_rule(request.dict())
    except ModelRuleError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{rule_id}", response_model=ModelRule)
def update_model_rule(rule_id: str, request: ModelRuleUpdate):
    try:
        updated = ModelRuleService.update_rule(rule_id, request.dict(exclude_unset=True))
    except ModelRuleError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not updated:
        raise HTTPException(status_code=404, detail="Model rule not found")
    return updated


@router.delete("/{rule_id}")
def delete_model_rule(rule_id: str):
    if not ModelRuleService.delete_rule(rule_id):
        raise HTTPException(status_code=404, detail="Model rule not found")
    return {"message": "Model rule deleted", "id": rule_id}


@router.post("/reorder", response_model=List[ModelRule])
def reorder_model_rules(request: ModelRuleReorder):
    """Set the order rules are tried in: first ID becomes priority 1"""
    return ModelRuleService.reorder(request.ordered_ids)


@router.post("/test")
def test_model_rules(request: ModelRuleTest):
    """
    What a scan would read from this text: the model, the device type and which
    rule gave it. Runs the real Python regex, so the preview matches the scan.
    """
    text = request.text or ""
    draft = None
    if request.rule is not None:
        data = request.rule.dict()
        try:
            draft = {**ModelRuleService._normalize(dict(data)), "id": request.rule_id or "draft", "_rx": compile_rule(data)}
        except ModelRuleError as e:
            raise HTTPException(status_code=400, detail=str(e))

    saved = [r for r in ModelRuleService.compiled_rules() if not draft or r["id"] != draft["id"]]
    ordered = ([draft] if draft and draft["enabled"] else []) + saved

    draft_matches = []
    if draft:
        for m in draft["_rx"].finditer(text):
            draft_matches.append({"text": m.group(0), "model": rule_model(draft["_rx"], m), "start": m.start()})
            if len(draft_matches) >= 20:
                break

    result = _evaluate(text, ordered, draft)
    result.update({
        "keyword_found": (not draft or not draft["match"] or draft["match"].lower() in text.lower()),
        "draft_matches": draft_matches,
        # The same evaluation on every device of the current result, for the "what changes" preview
        "samples": [_evaluate(t or "", ordered, draft) for t in request.samples[:500]],
    })
    return result


def _evaluate(text: str, ordered: List[Dict[str, Any]], draft: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Model / device type a scan would read from the text with these rules, and where each came from"""
    hit = ModelRuleService.match_model(text, ordered)
    if hit:
        model, source = hit["model"], f"rule: {hit['rule']['name']}"
    else:
        # Built-in Huawei / Cisco regexes (custom rules already found nothing)
        model = LldpService.builtin_model(text)
        source = "built-in" if model else ""
    role_hit = ModelRuleService.match_role(model, ordered)
    if not role_hit and hit and hit["rule"]["role"]:
        # The pattern needs its context ('Model: ...'), so it cannot re-match the bare model
        role_hit = {"role": hit["rule"]["role"], "rule": hit["rule"]}
    return {
        "model": model,
        "model_source": source,
        "role": role_hit["role"] if role_hit else LldpService.builtin_role(model),
        "role_source": f"rule: {role_hit['rule']['name']}" if role_hit else ("built-in" if model else ""),
        "by_draft": bool(draft) and any(x and x["rule"]["id"] == draft["id"] for x in (hit, role_hit)),
    }
