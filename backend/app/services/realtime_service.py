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
    await ws_manager.broadcast(event)