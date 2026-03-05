# app/routers/auth.py
from fastapi import APIRouter, Depends
from app.core.security import (
    LoginRequest,
    authenticate,
    create_access_token,
    get_current_user,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
def login(body: LoginRequest):
    user = authenticate(body.email, body.password)

    token = create_access_token(
        {
            "sub": str(user["id"]),
            "email": user["email"],
            "role": user["role"],
        }
    )

    # ✅ 프론트 호환성: access_token + token 둘 다 내려줌
    return {
        "access_token": token,
        "token": token,              # ✅ 추가
        "token_type": "bearer",
        "role": user["role"],
    }


@router.get("/me")
def me(user=Depends(get_current_user)):
    """
    ✅ Topbar 표시용: email/role만 간단히 반환
    - get_current_user()가 dict이든 객체든 둘 다 대응
    """
    if isinstance(user, dict):
        email = user.get("email")
        role = user.get("role")
        uid = user.get("id") or user.get("sub")
    else:
        email = getattr(user, "email", None)
        role = getattr(user, "role", None)
        uid = getattr(user, "id", None)

    return {
        "email": email,
        "role": role,
        "id": uid,
    }