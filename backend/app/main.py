import os
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.core.config import settings
from app.api.endpoints import (
    devices, healthcheck, troubleshoot, deploy, templates, jobs, playbooks, profiles, system, lldp,
    command_profiles, model_rules,
)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Backend API for Network Switch & Router Config Deployment, Health Checks, and Troubleshooting",
)

# CORS Middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins in local network setup
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(devices.router, prefix=f"{settings.API_V1_STR}/devices", tags=["Devices"])
app.include_router(profiles.router, prefix=f"{settings.API_V1_STR}/profiles", tags=["User Profiles & Credentials"])
app.include_router(healthcheck.router, prefix=f"{settings.API_V1_STR}/healthcheck", tags=["Health Check"])
app.include_router(troubleshoot.router, prefix=f"{settings.API_V1_STR}/troubleshoot", tags=["Troubleshoot"])
app.include_router(deploy.router, prefix=f"{settings.API_V1_STR}/deploy", tags=["Deploy Config"])
app.include_router(templates.router, prefix=f"{settings.API_V1_STR}/templates", tags=["Templates"])
app.include_router(jobs.router, prefix=f"{settings.API_V1_STR}/jobs", tags=["Jobs & Async Fleet (10k+)"])
app.include_router(playbooks.router, prefix=f"{settings.API_V1_STR}/playbooks", tags=["Playbooks & Test Profiles"])
app.include_router(system.router, prefix=f"{settings.API_V1_STR}/system", tags=["System Settings"])
app.include_router(lldp.router, prefix=f"{settings.API_V1_STR}/lldp", tags=["LLDP Discovery"])
app.include_router(
    command_profiles.router,
    prefix=f"{settings.API_V1_STR}/command-profiles",
    tags=["LLDP Command Profiles"],
)
app.include_router(
    model_rules.router,
    prefix=f"{settings.API_V1_STR}/model-rules",
    tags=["LLDP Model Rules"],
)


# The Windows .exe serves the built React app itself, on the same port as the API.
# Source and Docker runs have no bundled frontend and keep the JSON status root.
FRONTEND_DIST = os.getenv("NETAUTO_FRONTEND_DIST") or os.path.join(
    getattr(sys, "_MEIPASS", os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "frontend_dist"
)

if os.path.isfile(os.path.join(FRONTEND_DIST, "index.html")):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
else:
    @app.get("/")
    def root():
        return {
            "status": "online",
            "service": settings.PROJECT_NAME,
            "version": settings.VERSION,
            "docs_url": "/docs",
        }
