# server.py
from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import io
import xlsxwriter
import time
import json
import os

# ✅ 로컬에서만 .env 로드 (배포(Render)에서는 환경변수 사용)
try:
    from dotenv import load_dotenv
    _ENV_PATH = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(_ENV_PATH):
        # 로컬 편의용: override=False (배포 환경변수 덮어쓰지 않게)
        load_dotenv(dotenv_path=_ENV_PATH, override=False)
        print(f"✅ .env loaded: {_ENV_PATH}")
    else:
        print("ℹ️ .env not found -> using OS env only")
except Exception as e:
    print("⚠️ .env load failed:", e)

# ✅ MQTT
import paho.mqtt.client as mqtt

# ✅ InfluxDB v2 client
try:
    from influxdb_client import InfluxDBClient, Point, WritePrecision
    from influxdb_client.client.write_api import SYNCHRONOUS
except Exception:
    InfluxDBClient = None
    Point = None
    WritePrecision = None
    SYNCHRONOUS = None

app = FastAPI()

# =========================
# ✅ CORS (배포 대응)
# - Render에서 CORS_ORIGINS 환경변수로 Vercel 도메인 넣기
#   예) https://myapp.vercel.app,https://myapp-git-xxx.vercel.app
# =========================
cors_env = os.getenv("CORS_ORIGINS", "").strip()

if cors_env:
    ALLOWED_ORIGINS = [x.strip() for x in cors_env.split(",") if x.strip()]
else:
    # 로컬 개발용 기본값
    ALLOWED_ORIGINS = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================
# ✅ 메모리 저장소
# =========================================================
DEVICES = {}       # key -> device meta
LAST_PAYLOAD = {}  # key -> dict(payload)

ONLINE_SEC = 60

def make_key(country, site_id, model, device_id):
    return f"{country}/{site_id}/{model}/{device_id}"

def parse_topic(topic: str):
    """
    기대 토픽: th/site001/pg46/001/meter
    return: (country, site_id, model, device_id, last_type)
    """
    parts = (topic or "").split("/")
    if len(parts) < 5:
        return None

    country = parts[0]
    site_id  = parts[1]
    model    = parts[2]
    device_id= parts[3]
    last_type= parts[4]
    return (country, site_id, model, device_id, last_type)

# =========================================================
# ✅ Dashboard용 표준 스냅샷 변환
# =========================================================
def _to_float(x):
    try:
        if x is None or x == "":
            return None
        return float(x)
    except Exception:
        return None

def _avg3(x1, x2, x3):
    nums = [n for n in [_to_float(x1), _to_float(x2), _to_float(x3)] if n is not None]
    return round(sum(nums) / len(nums), 3) if nums else None

def normalize_payload(payload: dict):
    p = payload if isinstance(payload, dict) else {}

    # --- V ---
    v_l1 = _to_float(p.get("v_l1") or p.get("v1") or p.get("vl1"))
    v_l2 = _to_float(p.get("v_l2") or p.get("v2") or p.get("vl2"))
    v_l3 = _to_float(p.get("v_l3") or p.get("v3") or p.get("vl3"))
    v_avg = _to_float(p.get("v_avg") or p.get("v"))

    if v_avg is not None and (v_l1 is None and v_l2 is None and v_l3 is None):
        v_l1 = v_l2 = v_l3 = v_avg
    if v_avg is None:
        v_avg = _avg3(v_l1, v_l2, v_l3)

    # --- A ---
    a_l1 = _to_float(p.get("a_l1") or p.get("a1") or p.get("al1"))
    a_l2 = _to_float(p.get("a_l2") or p.get("a2") or p.get("al2"))
    a_l3 = _to_float(p.get("a_l3") or p.get("a3") or p.get("al3"))
    a_avg = _to_float(p.get("a_avg") or p.get("a"))

    if a_avg is not None and (a_l1 is None and a_l2 is None and a_l3 is None):
        a_l1 = a_l2 = a_l3 = a_avg
    if a_avg is None:
        a_avg = _avg3(a_l1, a_l2, a_l3)

    # --- PF ---
    pf_l1 = _to_float(p.get("pf_l1") or p.get("pf1") or p.get("pfl1"))
    pf_l2 = _to_float(p.get("pf_l2") or p.get("pf2") or p.get("pfl2"))
    pf_l3 = _to_float(p.get("pf_l3") or p.get("pf3") or p.get("pfl3"))
    pf_avg = _to_float(p.get("pf_avg") or p.get("pf"))

    if pf_avg is not None and (pf_l1 is None and pf_l2 is None and pf_l3 is None):
        pf_l1 = pf_l2 = pf_l3 = pf_avg
    if pf_avg is None:
        pf_avg = _avg3(pf_l1, pf_l2, pf_l3)

    # --- 합계 ---
    kw  = _to_float(p.get("kw") or p.get("p") or p.get("power_kw"))
    kwh = _to_float(p.get("kwh") or p.get("energy_kwh"))

    # --- DI 1~16 ---
    di_map = {}

    di_obj = p.get("di")
    if isinstance(di_obj, dict):
        for k, v in di_obj.items():
            try:
                i = int(k)
                if 1 <= i <= 16:
                    di_map[i] = 1 if str(v) in ("1","true","True","ON","on") or v == 1 else 0
            except Exception:
                pass

    if not di_map and isinstance(di_obj, list):
        for idx, v in enumerate(di_obj, start=1):
            if idx > 16:
                break
            if v in (0, 1):
                di_map[idx] = v
            else:
                di_map[idx] = None

    for i in range(1, 17):
        k = f"di{i}"
        if k in p:
            v = p.get(k)
            di_map[i] = 1 if str(v) in ("1","true","True","ON","on") or v == 1 else 0

    di_final = {i: di_map.get(i) for i in range(1, 17)} if di_map else None

    return {
        "kw": kw,
        "kwh": kwh,

        "v_l1": v_l1, "v_l2": v_l2, "v_l3": v_l3, "v_avg": v_avg,
        "a_l1": a_l1, "a_l2": a_l2, "a_l3": a_l3, "a_avg": a_avg,
        "pf_l1": pf_l1, "pf_l2": pf_l2, "pf_l3": pf_l3, "pf_avg": pf_avg,

        "di": di_final,
    }

# =========================================================
# ✅ channels 생성
# =========================================================
def build_channels_from_payload(payload: dict):
    if not isinstance(payload, dict):
        return []

    ch = payload.get("channels")
    if isinstance(ch, list) and len(ch) > 0:
        fixed = []
        for c in ch:
            if not isinstance(c, dict):
                continue
            term = c.get("term") or c.get("io") or c.get("side")
            phase = c.get("phase") or c.get("ph")
            if phase in (1, "1"): phase = "L1"
            if phase in (2, "2"): phase = "L2"
            if phase in (3, "3"): phase = "L3"
            fixed.append({
                "term": term or "in",
                "phase": phase or "L1",
                "v": _to_float(c.get("v")),
                "a": _to_float(c.get("a")),
                "kw": _to_float(c.get("kw")),
                "pf": _to_float(c.get("pf")),
            })
        return fixed

    v = _to_float(payload.get("v"))
    a = _to_float(payload.get("a"))
    kw = _to_float(payload.get("kw"))
    pf = _to_float(payload.get("pf"))

    if v is None and a is None and kw is None and pf is None:
        return []

    return [
        {"term": "in", "phase": "L1", "v": v, "a": a, "kw": kw, "pf": pf},
        {"term": "in", "phase": "L2", "v": v, "a": a, "kw": kw, "pf": pf},
        {"term": "in", "phase": "L3", "v": v, "a": a, "kw": kw, "pf": pf},
    ]

# =========================================================
# ✅ InfluxDB 설정/초기화
# =========================================================
INFLUX_URL = os.getenv("INFLUX_URL", "")
INFLUX_TOKEN = os.getenv("INFLUX_TOKEN", "")
INFLUX_ORG = os.getenv("INFLUX_ORG", "")
INFLUX_BUCKET = os.getenv("INFLUX_BUCKET", "")
INFLUX_MEASUREMENT = os.getenv("INFLUX_MEASUREMENT", "power")

_influx_client = None
_influx_write = None

def init_influx():
    global _influx_client, _influx_write
    if not (InfluxDBClient and Point and WritePrecision and SYNCHRONOUS):
        print("⚠️ influxdb-client not available -> skip Influx")
        return
    if not (INFLUX_URL and INFLUX_TOKEN and INFLUX_ORG and INFLUX_BUCKET):
        print("⚠️ Influx env missing -> skip Influx")
        return

    try:
        _influx_client = InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG)

        try:
            ok = _influx_client.ping()
            print("✅ Influx ping:", ok)
        except Exception as e:
            print("⚠️ Influx ping failed:", repr(e))

        _influx_write = _influx_client.write_api(write_options=SYNCHRONOUS)

        print("✅ Influx ready:", {
            "url": INFLUX_URL,
            "org": INFLUX_ORG,
            "bucket": INFLUX_BUCKET,
            "meas": INFLUX_MEASUREMENT,
        })
    except Exception as e:
        print("❌ Influx init failed:", repr(e))
        _influx_client = None
        _influx_write = None

def close_influx():
    global _influx_client, _influx_write
    try:
        if _influx_client:
            _influx_client.close()
    except Exception:
        pass
    _influx_client = None
    _influx_write = None

def write_to_influx(device_meta: dict, payload: dict, now_ts: float):
    if not _influx_write:
        return

    snap = normalize_payload(payload if isinstance(payload, dict) else {})
    channels = build_channels_from_payload(payload if isinstance(payload, dict) else {})

    country = device_meta.get("country")
    site_id = device_meta.get("site_id")
    model = device_meta.get("model")
    device_id = device_meta.get("device_id")
    last_type = device_meta.get("last_type")

    ts_ns = int(now_ts * 1_000_000_000)
    points = []

    # 1) summary point
    p_sum = Point(INFLUX_MEASUREMENT).time(ts_ns, WritePrecision.NS)
    p_sum.tag("country", str(country))
    p_sum.tag("site_id", str(site_id))
    p_sum.tag("model", str(model))
    p_sum.tag("device_id", str(device_id))
    p_sum.tag("type", str(last_type))
    p_sum.tag("scope", "summary")

    for k in ["kw", "kwh", "v_avg", "a_avg", "pf_avg",
              "v_l1", "v_l2", "v_l3",
              "a_l1", "a_l2", "a_l3",
              "pf_l1", "pf_l2", "pf_l3"]:
        v = snap.get(k)
        if v is not None:
            p_sum.field(k, float(v))

    di = snap.get("di")
    if isinstance(di, dict):
        for i, v in di.items():
            if v is None:
                continue
            p_sum.field(f"di{i}", int(v))

    points.append(p_sum)

    # 2) channel points
    for ch in channels:
        term = ch.get("term", "in")
        phase = ch.get("phase", "L1")

        p_ch = Point(INFLUX_MEASUREMENT).time(ts_ns, WritePrecision.NS)
        p_ch.tag("country", str(country))
        p_ch.tag("site_id", str(site_id))
        p_ch.tag("model", str(model))
        p_ch.tag("device_id", str(device_id))
        p_ch.tag("type", str(last_type))
        p_ch.tag("scope", "channel")
        p_ch.tag("term", str(term))
        p_ch.tag("phase", str(phase))

        for k in ["v", "a", "kw", "pf"]:
            v = ch.get(k)
            if v is not None:
                p_ch.field(k, float(v))

        points.append(p_ch)

    try:
        _influx_write.write(bucket=INFLUX_BUCKET, org=INFLUX_ORG, record=points)
    except Exception as e:
        print("❌ Influx write failed:", repr(e))

# =========================================================
# ✅ MQTT 설정 (환경변수 사용)
# =========================================================
MQTT_HOST  = os.getenv("MQTT_HOST", "")
MQTT_PORT  = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USER  = os.getenv("MQTT_USER", "")
MQTT_PASS  = os.getenv("MQTT_PASS", "")
MQTT_TOPIC = os.getenv("MQTT_TOPIC", "th/#")
MQTT_TLS   = os.getenv("MQTT_TLS", "0") == "1"

print("✅ MQTT ENV:", {
    "host": MQTT_HOST,
    "port": MQTT_PORT,
    "user": MQTT_USER,
    "tls": MQTT_TLS,
    "topic": MQTT_TOPIC,
    "pass_set": bool(MQTT_PASS),
})

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

    parsed = parse_topic(topic)
    if not parsed:
        return

    country, site_id, model, device_id, last_type = parsed
    key = make_key(country, site_id, model, device_id)
    now = time.time()

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

    # ✅ Influx 저장
    try:
        write_to_influx(DEVICES[key], LAST_PAYLOAD[key], now)
    except Exception as e:
        print("❌ write_to_influx error:", repr(e))

    print("------------")
    print(f"Topic: {topic}")
    print(f"Message: {payload_raw}")

def start_mqtt():
    global mqtt_client
    if mqtt_client:
        return

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

# =========================================================
# ✅ XLSX Export
# =========================================================
class SeriesReq(BaseModel):
    title: str = "Period Analysis"
    metric: str = "kwh"
    series: str = "total"
    labels: list[str]
    values: list[float]

@app.post("/api/report/xlsx")
def make_xlsx(req: SeriesReq):
    output = io.BytesIO()
    wb = xlsxwriter.Workbook(output, {"in_memory": True})
    ws = wb.add_worksheet("Data")

    ws.write(0, 0, "Date")
    ws.write(0, 1, "Value")

    for i, (t, v) in enumerate(zip(req.labels, req.values), start=1):
        ws.write(i, 0, t)
        try:
            ws.write_number(i, 1, float(v))
        except Exception:
            ws.write(i, 1, v)

    chart = wb.add_chart({"type": "line"})
    last_row = len(req.labels)
    if last_row > 0:
        chart.add_series({
            "name": f"{req.title} ({req.metric}/{req.series})",
            "categories": ["Data", 1, 0, last_row, 0],
            "values":     ["Data", 1, 1, last_row, 1],
        })
    chart.set_title({"name": req.title})
    chart.set_x_axis({"name": "Date"})
    chart.set_y_axis({"name": "Value"})
    ws.insert_chart("D2", chart, {"x_scale": 1.4, "y_scale": 1.2})

    wb.close()
    output.seek(0)

    filename = "period_report.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

# =========================================================
# ✅ 기간조회 API (더미)
# =========================================================
@app.get("/api/series")
def get_series(
    device: str = Query("", description="device id"),
    metric: str = Query("kwh"),
    series: str = Query("total"),
    date_from: str = Query("", alias="from"),
    date_to: str = Query("", alias="to"),
    group: str = Query("day"),
):
    labels = ["2026-01-20", "2026-01-21", "2026-01-22", "2026-01-23", "2026-01-24"]

    base = 10.0
    if metric == "v":
        base = 220.0
    elif metric == "a":
        base = 5.0
    elif metric == "pf":
        base = 0.92
    elif metric == "kw":
        base = 3.0
    elif metric == "kwh":
        base = 12.0

    bump = {"total": 0.0, "l1": 0.3, "l2": 0.6, "l3": 0.9}.get(series, 0.0)
    step = 0.5 if metric in ("kwh", "kw") else 0.2
    values = [base + bump + i * step for i in range(len(labels))]
    rows = [{"t": labels[i], "v": values[i]} for i in range(len(labels))]

    return {
        "meta": {
            "device": device,
            "metric": metric,
            "series": series,
            "from": date_from,
            "to": date_to,
            "group": group,
        },
        "labels": labels,
        "values": values,
        "rows": rows,
    }

# =========================================================
# ✅ 장비 목록 API
# =========================================================
@app.get("/api/devices")
def api_devices():
    now = time.time()
    items = []

    for key, d in DEVICES.items():
        age = now - float(d.get("last_seen", now))
        payload = LAST_PAYLOAD.get(key)
        if not isinstance(payload, dict):
            payload = {}

        snap = normalize_payload(payload)
        channels = build_channels_from_payload(payload)

        kw = snap.get("kw")
        pf = snap.get("pf_avg")

        item = {
            **d,
            "age_sec": round(age, 1),
            "online": age < ONLINE_SEC,

            "last_payload": payload,
            "summary_value": snap,

            "channels": channels,
            "channel_count": len(channels),

            "kw": kw,
            "pf": pf,

            "device_topic": key,
            "device_short": d.get("device_id"),
            "device_display": d.get("device_id"),
        }
        items.append(item)

    items.sort(key=lambda x: x.get("last_seen", 0), reverse=True)
    return {"items": items, "count": len(items)}

# =========================================================
# ✅ 최신값 1대 조회
# =========================================================
@app.get("/api/device/latest")
def api_device_latest(
    country: str = Query(...),
    site_id: str = Query(...),
    model: str = Query(...),
    device_id: str = Query(...),
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