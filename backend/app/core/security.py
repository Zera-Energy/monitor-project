# app/core/security.py
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from jose import jwt, JWTError
from passlib.context import CryptContext
import time

from .config import JWT_SECRET, JWT_ALG, JWT_EXPIRE_MIN

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# ✅ 임시 유저(테스트용) : 나중에 SQLite 붙이면 여기만 DB로 교체
_fake_users = {
    "admin@local": {
        "id": 1,
        "email": "admin@local",
        "password_hash": pwd_context.hash("admin1234"),
        "role": "admin",
        "is_active": True,
    },
    "user@local": {
        "id": 2,
        "email": "user@local",
        "password_hash": pwd_context.hash("user1234"),
        "role": "user",
        "is_active": True,
    },
}

def create_access_token(payload: dict) -> str:
    to_encode = payload.copy()
    exp = int(time.time()) + (JWT_EXPIRE_MIN * 60)
    to_encode.update({"exp": exp})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALG)

def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        sub = payload.get("sub")
        if not sub:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return payload
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

class LoginRequest(BaseModel):
    email: str
    password: str

def authenticate(email: str, password: str) -> dict:
    user = _fake_users.get(email)
    if not user or not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="Invalid email or inactive user")
    if not pwd_context.verify(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid password")
    return user