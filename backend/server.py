# server.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio

from app.services.influx_service import init_influx, close_influx
from app.services.mqtt_service import start_mqtt, set_main_loop
from app.core.config import MQTT_HOST
from app.routers import auth, devices, series, report

from app.ws.manager import ws_manager  # ✅ 추가: ws_manager 사용

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

# =========================================================
# ✅ WebSocket endpoint (ws_manager 기반으로 통일)
# =========================================================
@app.websocket("/ws/telemetry")
async def ws_telemetry(ws: WebSocket):
    await ws.accept()

    # ✅ 연결을 ws_manager에 등록 (push_telemetry()가 여기로 broadcast함)
    try:
        await ws_manager.connect(ws)  # ✅ 핵심
    except Exception:
        try:
            await ws.close()
        except Exception:
            pass
        return

    # ✅ 연결 직후 확인용 1회 메시지
    try:
        await ws.send_json({"type": "ping", "hello": "connected"})
    except Exception:
        pass

    try:
        # ✅ keepalive(선택)
        while True:
            await asyncio.sleep(30)
            await ws.send_json({"type": "ping"})
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        try:
            await ws_manager.disconnect(ws)  # ✅ 핵심
        except Exception:
            pass

# =========================================================
# Lifecycle
# =========================================================
@app.on_event("startup")
async def on_startup():
    # ✅ MQTT 콜백 스레드가 코루틴을 안전하게 실행하도록 메인 루프 등록
    set_main_loop(asyncio.get_running_loop())

    init_influx()
    if MQTT_HOST:
        start_mqtt()
    else:
        print("⚠️ MQTT_HOST empty -> MQTT not started")

@app.on_event("shutdown")
def on_shutdown():
    close_influx()