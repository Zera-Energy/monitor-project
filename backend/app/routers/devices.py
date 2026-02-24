# app/routers/devices.py
import time
from fastapi import APIRouter, Depends, Query, HTTPException
from app.core.security import get_current_user
from app.domain.topic import make_key
from app.domain.device_store import DEVICES, LAST_PAYLOAD, normalize_payload, build_channels_from_payload
from app.core.config import ONLINE_SEC

router = APIRouter(prefix="/api", tags=["devices"])

@router.get("/devices")
def api_devices(user=Depends(get_current_user)):
    now = time.time()
    items = []

    for key, d in DEVICES.items():
        age = now - float(d.get("last_seen", now))
        payload = LAST_PAYLOAD.get(key)
        if not isinstance(payload, dict):
            payload = {}

        snap = normalize_payload(payload)
        channels = build_channels_from_payload(payload)

        item = {
            **d,
            "age_sec": round(age, 1),
            "online": age < ONLINE_SEC,

            "last_payload": payload,
            "summary_value": snap,

            "channels": channels,
            "channel_count": len(channels),

            "kw": snap.get("kw"),
            "pf": snap.get("pf_avg"),

            "device_topic": key,
            "device_short": d.get("device_id"),
            "device_display": d.get("device_id"),
        }
        items.append(item)

    items.sort(key=lambda x: x.get("last_seen", 0), reverse=True)
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
    age = now - float(d.get("last_seen", now))
    payload = LAST_PAYLOAD.get(key) if isinstance(LAST_PAYLOAD.get(key), dict) else {}

    snap = normalize_payload(payload)
    channels = build_channels_from_payload(payload)

    return {
        "ok": True,
        "key": key,
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