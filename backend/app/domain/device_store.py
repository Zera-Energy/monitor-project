# app/domain/device_store.py
import time
from app.core.config import ONLINE_SEC

DEVICES = {}       # key -> device meta
LAST_PAYLOAD = {}  # key -> dict(payload)

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
    v_avg = _to_float(p.get("v_avg") or p.get("v") or p.get("volt") or p.get("voltage"))

    if v_avg is not None and (v_l1 is None and v_l2 is None and v_l3 is None):
        v_l1 = v_l2 = v_l3 = v_avg
    if v_avg is None:
        v_avg = _avg3(v_l1, v_l2, v_l3)

    # --- A ---
    a_l1 = _to_float(p.get("a_l1") or p.get("a1") or p.get("al1"))
    a_l2 = _to_float(p.get("a_l2") or p.get("a2") or p.get("al2"))
    a_l3 = _to_float(p.get("a_l3") or p.get("a3") or p.get("al3"))
    a_avg = _to_float(p.get("a_avg") or p.get("a") or p.get("amp") or p.get("current"))

    if a_avg is not None and (a_l1 is None and a_l2 is None and a_l3 is None):
        a_l1 = a_l2 = a_l3 = a_avg
    if a_avg is None:
        a_avg = _avg3(a_l1, a_l2, a_l3)

    # --- PF ---
    pf_l1 = _to_float(p.get("pf_l1") or p.get("pf1") or p.get("pfl1"))
    pf_l2 = _to_float(p.get("pf_l2") or p.get("pf2") or p.get("pfl2"))
    pf_l3 = _to_float(p.get("pf_l3") or p.get("pf3") or p.get("pfl3"))
    pf_avg = _to_float(p.get("pf_avg") or p.get("pf") or p.get("power_factor"))

    if pf_avg is not None and (pf_l1 is None and pf_l2 is None and pf_l3 is None):
        pf_l1 = pf_l2 = pf_l3 = pf_avg
    if pf_avg is None:
        pf_avg = _avg3(pf_l1, pf_l2, pf_l3)

    # --- 합계 ---
    kw = _to_float(p.get("kw") or p.get("kW") or p.get("p") or p.get("power_kw"))
    kwh = _to_float(p.get("kwh") or p.get("kWh") or p.get("energy_kwh"))

    # --- DI 1~16 ---
    di_map = {}
    di_obj = p.get("di")

    if isinstance(di_obj, dict):
        for k, v in di_obj.items():
            try:
                i = int(k)
                if 1 <= i <= 16:
                    di_map[i] = 1 if str(v) in ("1", "true", "True", "ON", "on") or v == 1 else 0
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
            di_map[i] = 1 if str(v) in ("1", "true", "True", "ON", "on") or v == 1 else 0

    di_final = {i: di_map.get(i) for i in range(1, 17)} if di_map else None

    return {
        "kw": kw,
        "kwh": kwh,

        "v_l1": v_l1, "v_l2": v_l2, "v_l3": v_l3, "v_avg": v_avg,
        "a_l1": a_l1, "a_l2": a_l2, "a_l3": a_l3, "a_avg": a_avg,
        "pf_l1": pf_l1, "pf_l2": pf_l2, "pf_l3": pf_l3, "pf_avg": pf_avg,

        "di": di_final,
    }

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
                "v": _to_float(c.get("v") or c.get("volt") or c.get("voltage")),
                "a": _to_float(c.get("a") or c.get("amp") or c.get("current")),
                "kw": _to_float(c.get("kw") or c.get("kW") or c.get("p") or c.get("power_kw")),
                "pf": _to_float(c.get("pf") or c.get("power_factor")),
            })
        return fixed

    # ✅ 단일 값 payload fallback
    v = _to_float(payload.get("v") or payload.get("volt") or payload.get("voltage"))
    a = _to_float(payload.get("a") or payload.get("amp") or payload.get("current"))
    kw = _to_float(payload.get("kw") or payload.get("kW") or payload.get("p") or payload.get("power_kw"))
    pf = _to_float(payload.get("pf") or payload.get("power_factor"))

    if v is None and a is None and kw is None and pf is None:
        return []

    return [
        {"term": "in", "phase": "L1", "v": v, "a": a, "kw": kw, "pf": pf},
        {"term": "in", "phase": "L2", "v": v, "a": a, "kw": kw, "pf": pf},
        {"term": "in", "phase": "L3", "v": v, "a": a, "kw": kw, "pf": pf},
    ]

def is_online(last_seen: float) -> bool:
    now = time.time()
    age = now - float(last_seen or now)
    return age < ONLINE_SEC