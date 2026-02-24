# app/services/influx_service.py
from app.core.config import (
    INFLUX_URL, INFLUX_TOKEN, INFLUX_ORG, INFLUX_BUCKET, INFLUX_MEASUREMENT
)
from app.domain.device_store import normalize_payload, build_channels_from_payload

try:
    from influxdb_client import InfluxDBClient, Point, WritePrecision
    from influxdb_client.client.write_api import SYNCHRONOUS
except Exception:
    InfluxDBClient = None
    Point = None
    WritePrecision = None
    SYNCHRONOUS = None

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