# app/services/realtime_service.py
import time
from typing import Any, Dict, Optional

from app.ws.manager import ws_manager
from app.domain.device_store import normalize_payload, build_channels_from_payload

async def push_telemetry(key: str, payload: Dict[str, Any], last_seen: Optional[float] = None):
    snap = normalize_payload(payload)
    channels = build_channels_from_payload(payload)

    event = {
        "type": "telemetry",
        "ts": last_seen or time.time(),
        "key": key,
        "payload": payload,
        "summary": snap,
        "channels": channels,
        "channel_count": len(channels),
    }

    # ✅ (테스트용) 현재 연결 수 확인 로그 (manager에 이런 필드가 없다면 삭제해도 됨)
    try:
        cnt = getattr(ws_manager, "count", None)
        if callable(cnt):
            print("🚀 push_telemetry broadcast -> clients:", cnt())
        else:
            print("🚀 push_telemetry broadcast")
    except Exception:
        pass

    await ws_manager.broadcast(event)