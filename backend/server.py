# server.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio

from app.services.influx_service import init_influx, close_influx
from app.services.mqtt_service import start_mqtt
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
# ✅ WebSocket (직접 엔드포인트 - 연결 확인용)
# =========================================================
@app.websocket("/ws/telemetry")
async def ws_telemetry(ws: WebSocket):
    await ws.accept()
    # ✅ 연결 직후 바로 1번 보내서 성공 여부 즉시 확인
    await ws.send_text('{"type":"ping","hello":"connected"}')

    try:
        while True:
            await asyncio.sleep(30)
            await ws.send_text('{"type":"ping"}')
    except WebSocketDisconnect:
        pass
    except Exception:
        pass

# =========================================================
# Lifecycle
# =========================================================
@app.on_event("startup")
def on_startup():
    init_influx()
    if MQTT_HOST:
        start_mqtt()
    else:
        print("⚠️ MQTT_HOST empty -> MQTT not started")


@app.on_event("shutdown")
def on_shutdown():
    close_influx()