# app/routers/auth.py
from fastapi import APIRouter, Depends
from app.core.security import LoginRequest, authenticate, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/login")
def login(body: LoginRequest):
    user = authenticate(body.email, body.password)
    token = create_access_token({"sub": str(user["id"]), "email": user["email"], "role": user["role"]})
    return {"access_token": token, "token_type": "bearer", "role": user["role"]}

@router.get("/me")
def me(user=Depends(get_current_user)):
    return {"ok": True, "user": user}