# app/core/config.py
import os

# ✅ 로컬에서만 .env 로드 (배포(Render)에서는 환경변수 사용)
try:
    from dotenv import load_dotenv
    _ENV_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", ".env")
    _ENV_PATH = os.path.abspath(_ENV_PATH)
    if os.path.exists(_ENV_PATH):
        load_dotenv(dotenv_path=_ENV_PATH, override=False)
        print(f"✅ .env loaded: {_ENV_PATH}")
    else:
        print("ℹ️ .env not found -> using OS env only")
except Exception as e:
    print("⚠️ .env load failed:", e)

# =========================
# CORS
# =========================
ALLOWED_ORIGINS = ["https://ksaver.onrender.com"]

# =========================
# JWT (B: 로그인만 필요)
# =========================
JWT_SECRET = os.getenv("JWT_SECRET", "CHANGE_THIS_TO_LONG_RANDOM_STRING")
JWT_ALG = "HS256"
JWT_EXPIRE_MIN = int(os.getenv("JWT_EXPIRE_MIN", "1440"))  # 24h

# =========================
# MQTT
# =========================
MQTT_HOST = os.getenv("MQTT_HOST", "")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USER = os.getenv("MQTT_USER", "")
MQTT_PASS = os.getenv("MQTT_PASS", "")
MQTT_TOPIC = os.getenv("MQTT_TOPIC", "th/#")
MQTT_TLS = os.getenv("MQTT_TLS", "0") == "1"

# =========================
# Influx
# =========================
INFLUX_URL = os.getenv("INFLUX_URL", "")
INFLUX_TOKEN = os.getenv("INFLUX_TOKEN", "")
INFLUX_ORG = os.getenv("INFLUX_ORG", "")
INFLUX_BUCKET = os.getenv("INFLUX_BUCKET", "")
INFLUX_MEASUREMENT = os.getenv("INFLUX_MEASUREMENT", "power")

# =========================
# Device online window
# =========================
ONLINE_SEC = 60