# server.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
from typing import Set

from app.services.influx_service import init_influx, close_influx
from app.services.mqtt_service import start_mqtt, set_main_loop  # ✅ 수정(추가)
from app.core.config import MQTT_HOST
from app.routers import auth, devices, series, report
# from app.routers import ws as ws_router  # ✅ (테스트 중엔 주석 권장: 중복 방지)

app = FastAPI()

# =========================================================
# ✅ CORS 설정 (preflight 최소화 + 안정화)
# =========================================================
ALLOWED_ORIGINS = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "https://ksaver.onrender.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept",
        "Origin",
        "X-Requested-With",
    ],
    expose_headers=["Authorization"],
    max_age=86400,
)

# =========================================================
# Routers
# =========================================================
app.include_router(auth.router)
app.include_router(devices.router)
app.include_router(series.router)
app.include_router(report.router)
# app.include_router(ws_router.router)  # ✅ (테스트 중엔 주석 권장)

# =========================================================
# ✅ WebSocket connections + broadcast
# =========================================================
active_connections: Set[WebSocket] = set()

async def broadcast_json(data: dict):
    """현재 붙어있는 모든 WS 클라이언트에게 JSON 전송"""
    dead = []
    for ws in list(active_connections):
        try:
            await ws.send_json(data)
        except Exception:
            dead.append(ws)
    for ws in dead:
        active_connections.discard(ws)

# =========================================================
# ✅ WebSocket endpoint
# =========================================================
@app.websocket("/ws/telemetry")
async def ws_telemetry(ws: WebSocket):
    await ws.accept()
    active_connections.add(ws)

    # ✅ 연결 직후 확인용 1회 메시지
    try:
        await ws.send_json({"type": "ping", "hello": "connected"})
    except Exception:
        active_connections.discard(ws)
        try:
            await ws.close()
        except Exception:
            pass
        return

    try:
        # ✅ keepalive(선택): 30초마다 ping
        while True:
            await asyncio.sleep(30)
            await ws.send_json({"type": "ping"})
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        active_connections.discard(ws)

# =========================================================
# Lifecycle
# =========================================================
@app.on_event("startup")
async def on_startup():  # ✅ 수정: async로 변경
    # ✅ (핵심) MQTT 콜백 스레드가 WS로 안전하게 던질 수 있도록 메인 루프 등록
    set_main_loop(asyncio.get_running_loop())

    init_influx()
    if MQTT_HOST:
        start_mqtt()
    else:
        print("⚠️ MQTT_HOST empty -> MQTT not started")

@app.on_event("shutdown")
def on_shutdown():
    close_influx()