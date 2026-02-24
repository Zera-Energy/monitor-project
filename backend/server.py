# server.py
from fastapi import FastAPI
from app.core.cors import setup_cors
from app.services.influx_service import init_influx, close_influx
from app.services.mqtt_service import start_mqtt
from app.core.config import MQTT_HOST
from app.routers import auth, devices, series, report

app = FastAPI()

# CORS
setup_cors(app)

# Routers
app.include_router(auth.router)
app.include_router(devices.router)
app.include_router(series.router)
app.include_router(report.router)

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