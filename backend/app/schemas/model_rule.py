from typing import List, Optional
from pydantic import BaseModel, Field


class ModelRule(BaseModel):
    id: str
    name: str
    match: str = Field("", description="Keyword the text must contain before the pattern is tried, e.g. 'FortiGate'")
    pattern: str = Field(..., description="Python regex; group 1 or (?P<model>...) is the model")
    role: str = Field("", description="Device type for models this pattern matches; empty = built-in guess")
    ignore_case: bool = False
    enabled: bool = True
    priority: int = 1
    builder_mode: str = Field("regex", description="How the page built the pattern: example / prefix / after / regex")
    builder_value: str = Field("", description="What the user typed in that builder, to edit the rule the same way")
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ModelRuleCreate(BaseModel):
    name: str
    match: Optional[str] = ""
    pattern: str
    role: Optional[str] = ""
    ignore_case: Optional[bool] = False
    enabled: Optional[bool] = True
    priority: Optional[int] = None
    builder_mode: Optional[str] = "regex"
    builder_value: Optional[str] = ""


class ModelRuleUpdate(BaseModel):
    name: Optional[str] = None
    match: Optional[str] = None
    pattern: Optional[str] = None
    role: Optional[str] = None
    ignore_case: Optional[bool] = None
    enabled: Optional[bool] = None
    priority: Optional[int] = None
    builder_mode: Optional[str] = None
    builder_value: Optional[str] = None


class ModelRuleTest(BaseModel):
    text: str = Field(..., description="Sample 'display version' output or LLDP System description")
    rule: Optional[ModelRuleCreate] = Field(None, description="Unsaved rule being edited, tried before the saved ones")
    rule_id: Optional[str] = Field(None, description="Saved rule the unsaved one replaces")
    samples: List[str] = Field([], description="More texts (e.g. every device of the current result) to preview the rule on")


class ModelRuleReorder(BaseModel):
    ordered_ids: List[str]
