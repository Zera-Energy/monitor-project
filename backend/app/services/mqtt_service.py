# app/services/mqtt_service.py
import time
import json
import asyncio   # ✅ 추가
import paho.mqtt.client as mqtt

from app.core.config import MQTT_HOST, MQTT_PORT, MQTT_USER, MQTT_PASS, MQTT_TOPIC, MQTT_TLS
from app.domain.topic import parse_topic, make_key
from app.domain.device_store import DEVICES, LAST_PAYLOAD
from app.services.influx_service import write_to_influx
from app.services.realtime_service import push_telemetry  # ✅ 추가

mqtt_client = None
_RC_TEXT = {0: "Success", 4: "Bad username or password", 5: "Not authorized"}


def on_connect(client, userdata, flags, rc, properties=None):
    rc_num = None
    try:
        rc_num = int(rc)
    except Exception:
        rc_num = None

    if rc_num is not None:
        print(f"✅ MQTT Connected rc={rc_num} ({_RC_TEXT.get(rc_num, 'Unknown')})")
        if rc_num != 0:
            print("❌ MQTT connect failed. Check credentials/permissions.")
            return
    else:
        print(f"✅ MQTT Connected rc={rc}")
        if str(rc).lower() not in ("0", "success"):
            print("❌ MQTT connect failed. (rc is not success)")
            return

    try:
        client.subscribe(MQTT_TOPIC)
        print(f"📡 Subscribed: {MQTT_TOPIC}")
    except Exception as e:
        print("❌ subscribe failed:", e)


def on_message(client, userdata, msg):
    topic = msg.topic
    payload_raw = msg.payload.decode("utf-8", errors="ignore")

    print("------------")
    print(f"Topic: {topic}")
    print(f"Message: {payload_raw}")

    parsed = parse_topic(topic)
    if not parsed:
        return

    country, site_id, model, device_id, last_type = parsed
    key = make_key(country, site_id, model, device_id)
    now = time.time()

    # -----------------------------
    # ✅ 캐시 업데이트
    # -----------------------------
    DEVICES[key] = {
        "country": country,
        "site_id": site_id,
        "model": model,
        "device_id": device_id,
        "last_seen": now,
        "last_type": last_type,
        "last_topic": topic,
    }

    try:
        obj = json.loads(payload_raw)
        if isinstance(obj, dict):
            LAST_PAYLOAD[key] = obj
        else:
            LAST_PAYLOAD[key] = {"_raw": payload_raw}
    except Exception:
        LAST_PAYLOAD[key] = {"_raw": payload_raw}

    # -----------------------------
    # ✅ Influx 저장
    # -----------------------------
    try:
        write_to_influx(DEVICES[key], LAST_PAYLOAD[key], now)
    except Exception as e:
        print("❌ write_to_influx error:", repr(e))

    # -----------------------------
    # ✅ WebSocket 브로드캐스트 (핵심 추가 부분)
    # -----------------------------
    try:
        asyncio.create_task(
            push_telemetry(
                key=key,
                payload=LAST_PAYLOAD[key],
                last_seen=now,
            )
        )
    except Exception as e:
        print("❌ WebSocket push error:", repr(e))


def start_mqtt():
    global mqtt_client
    if mqtt_client:
        return

    print("✅ MQTT ENV:", {
        "host": MQTT_HOST,
        "port": MQTT_PORT,
        "user": MQTT_USER,
        "tls": MQTT_TLS,
        "topic": MQTT_TOPIC,
        "pass_set": bool(MQTT_PASS),
    })

    try:
        mqtt_client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id="server_reader_" + str(int(time.time()))
        )
    except Exception:
        mqtt_client = mqtt.Client(client_id="server_reader_" + str(int(time.time())))

    if MQTT_USER:
        mqtt_client.username_pw_set(MQTT_USER, MQTT_PASS)

    if MQTT_TLS:
        mqtt_client.tls_set()

    mqtt_client.on_connect = on_connect
    mqtt_client.on_message = on_message

    mqtt_client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
    mqtt_client.loop_start()