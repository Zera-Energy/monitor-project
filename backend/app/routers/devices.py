# app/routers/devices.py
import time
from fastapi import APIRouter, Depends, Query, HTTPException
from app.core.security import get_current_user
from app.domain.topic import make_key
from app.domain.device_store import (
    DEVICES,
    LAST_PAYLOAD,
    normalize_payload,
    build_channels_from_payload,
)

# ✅ ONLINE_SEC가 없거나 잘못돼도 동작하도록 기본값(초) 제공
try:
    from app.core.config import ONLINE_SEC as _ONLINE_SEC
    ONLINE_SEC = float(_ONLINE_SEC) if _ONLINE_SEC else 60.0
except Exception:
    ONLINE_SEC = 60.0

router = APIRouter(prefix="/api", tags=["devices"])


def _safe_float(v, default: float) -> float:
    """None/문자열 등 어떤 값이 와도 float로 안전 변환"""
    try:
        if v is None:
            return float(default)
        return float(v)
    except Exception:
        return float(default)


@router.get("/devices")
def api_devices(user=Depends(get_current_user)):
    now = time.time()
    items = []

    for key, d in DEVICES.items():
        last_seen = _safe_float(d.get("last_seen"), now)
        age = max(0.0, now - last_seen)  # ✅ 음수 방지(시간 역전/오류 대비)

        payload = LAST_PAYLOAD.get(key)
        if not isinstance(payload, dict):
            payload = {}

        snap = normalize_payload(payload)
        channels = build_channels_from_payload(payload)

        item = {
            **d,

            # ✅ 오프라인 감지 핵심
            "age_sec": round(age, 1),
            "online": age < ONLINE_SEC,

            "last_payload": payload,
            "summary_value": snap,

            "channels": channels,
            "channel_count": len(channels),

            "kw": snap.get("kw"),
            "pf": snap.get("pf_avg"),

            # ✅ 프론트가 기대하는 필드들
            "device_topic": key,
            "device_short": d.get("device_id") or key.split("/")[-1],
            "device_display": d.get("device_id") or key,
        }
        items.append(item)

    # ✅ last_seen이 None/문자여도 정렬 안전
    items.sort(key=lambda x: _safe_float(x.get("last_seen"), 0), reverse=True)
    return {"items": items, "count": len(items)}


@router.get("/device/latest")
def api_device_latest(
    country: str = Query(...),
    site_id: str = Query(...),
    model: str = Query(...),
    device_id: str = Query(...),
    user=Depends(get_current_user),
):
    key = make_key(country, site_id, model, device_id)
    d = DEVICES.get(key)
    if not d:
        raise HTTPException(status_code=404, detail="device not found")

    now = time.time()
    last_seen = _safe_float(d.get("last_seen"), now)
    age = max(0.0, now - last_seen)

    payload = LAST_PAYLOAD.get(key)
    if not isinstance(payload, dict):
        payload = {}

    snap = normalize_payload(payload)
    channels = build_channels_from_payload(payload)

    return {
        "ok": True,
        "key": key,

        # ✅ 오프라인 감지 핵심
        "online": age < ONLINE_SEC,
        "age_sec": round(age, 1),

        "last_seen": d.get("last_seen"),
        "last_topic": d.get("last_topic"),

        "payload": payload,

        "channels": channels,
        "channel_count": len(channels),
        "summary_value": snap,

        **snap,
    }