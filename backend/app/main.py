from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.endpoints import devices, healthcheck, troubleshoot, deploy

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
app.include_router(healthcheck.router, prefix=f"{settings.API_V1_STR}/healthcheck", tags=["Health Check"])
app.include_router(troubleshoot.router, prefix=f"{settings.API_V1_STR}/troubleshoot", tags=["Troubleshoot"])
app.include_router(deploy.router, prefix=f"{settings.API_V1_STR}/deploy", tags=["Deploy Config"])

@app.get("/")
def root():
    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs_url": "/docs",
    }
