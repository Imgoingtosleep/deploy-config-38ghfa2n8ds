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
    
    DEFAULT_DEVICE_TYPE: str = os.getenv("DEFAULT_DEVICE_TYPE", "huawei")
    DEFAULT_SSH_PORT: int = int(os.getenv("DEFAULT_SSH_PORT", 22))
    DEFAULT_TELNET_PORT: int = int(os.getenv("DEFAULT_TELNET_PORT", 23))
    DEFAULT_TIMEOUT: int = int(os.getenv("DEFAULT_TIMEOUT", 30))
    DEFAULT_NUM_WORKERS: int = int(os.getenv("DEFAULT_NUM_WORKERS", 10))
    MIN_NUM_WORKERS: int = 1
    MAX_NUM_WORKERS: int = 100
    GLOBAL_DELAY_FACTOR: int = int(os.getenv("GLOBAL_DELAY_FACTOR", 1))

    # LLDP subnet scan
    LLDP_LOG_DIR: str = os.getenv("LLDP_LOG_DIR", "logs/lldp")
    LLDP_SCAN_MAX_IPS: int = int(os.getenv("LLDP_SCAN_MAX_IPS", 16384))

    # Scheduled config deploy
    DEPLOY_LOG_DIR: str = os.getenv("DEPLOY_LOG_DIR", "logs/deploy")
    DEPLOY_SCHEDULE_TICK_SECONDS: int = int(os.getenv("DEPLOY_SCHEDULE_TICK_SECONDS", 15))
    # With no deadline, a schedule that could not start within this many minutes of run_at is marked missed
    DEPLOY_SCHEDULE_GRACE_MINUTES: int = int(os.getenv("DEPLOY_SCHEDULE_GRACE_MINUTES", 15))

    class Config:
        case_sensitive = True
        extra = "allow"

settings = Settings()
