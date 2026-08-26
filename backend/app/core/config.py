import os
from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Network Automation & Diagnostics Web API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    BACKEND_PORT: int = int(os.getenv("BACKEND_PORT", 4050))
    BACKEND_HOST: str = os.getenv("BACKEND_HOST", "0.0.0.0")
    
    ALLOWED_ORIGINS: Union[List[str], str] = [
        "http://localhost:4000",
        "http://127.0.0.1:4000",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            if v.startswith("[") and v.endswith("]"):
                import json
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, list):
            return v
        return ["*"]
    
    DEFAULT_DEVICE_TYPE: str = os.getenv("DEFAULT_DEVICE_TYPE", "cisco_ios")
    DEFAULT_TIMEOUT: int = int(os.getenv("DEFAULT_TIMEOUT", 30))
    GLOBAL_DELAY_FACTOR: int = int(os.getenv("GLOBAL_DELAY_FACTOR", 1))

    class Config:
        case_sensitive = True
        extra = "allow"

settings = Settings()
