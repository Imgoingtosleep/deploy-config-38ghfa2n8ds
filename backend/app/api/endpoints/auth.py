from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx
import os
import jwt
from datetime import datetime, timedelta

router = APIRouter()

class LoginRequest(BaseModel):
    username: str
    password: str

SECRET_KEY = os.getenv("SECRET_KEY", "supersecret-network-automation-key-change-me")
ALGORITHM = "HS256"

@router.post("/login")
async def login(req: LoginRequest):
    USE_REAL_SSO = os.getenv("USE_REAL_SSO", "false").lower() == "true"
    SINGLE_VIEW_API_URL = os.getenv("SINGLE_VIEW_API_URL", "http://10.1.10.200")
    
    payload_user = {
        "username": req.username,
        "name": req.username,
        "role": "sso_user",
        "allowedTeams": ["nds", "cds"]
    }

    if USE_REAL_SSO:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{SINGLE_VIEW_API_URL}/api/auth/login",
                    json={
                        "username": req.username,
                        "password": req.password,
                        "app_name": "Deploy Config Tool"
                    },
                    timeout=5.0
                )
                if response.status_code != 200:
                    raise HTTPException(status_code=401, detail="SSO Login Failed")
                
                sso_data = response.json()
                user_info = sso_data.get("user_info") or sso_data.get("user") or {}
                payload_user["name"] = user_info.get("name") or user_info.get("fullname") or req.username
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"SSO Connection Error: {str(e)}")
    else:
        # Mock Hardcoded Login for bypassing
        import hashlib
        hashed_password = hashlib.sha256(req.password.encode()).hexdigest()
        HARDCODED_HASH = 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f'
        HARDCODED_PLAIN = 'password123'
        if hashed_password != HARDCODED_HASH and req.password != HARDCODED_PLAIN:
            raise HTTPException(status_code=401, detail="Invalid Username or Password")

    # Generate token
    expire = datetime.utcnow() + timedelta(hours=12)
    to_encode = {"sub": req.username, "user": payload_user, "exp": expire}
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

    return {
        "success": True,
        "token": encoded_jwt,
        "user": payload_user
    }

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/login", auto_error=False)

def get_current_username(token: str = Depends(oauth2_scheme)) -> str:
    """Extract username from JWT token. Returns 'anonymous' if no token is provided."""
    if not token:
        return "anonymous"
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            return "anonymous"
        return username
    except jwt.PyJWTError:
        return "anonymous"
