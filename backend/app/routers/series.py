# app/routers/series.py
from fastapi import APIRouter, Depends, Query
from app.core.security import get_current_user

router = APIRouter(prefix="/api", tags=["series"])

@router.get("/series")
def get_series(
    device: str = Query("", description="device id"),
    metric: str = Query("kwh"),
    series: str = Query("total"),
    date_from: str = Query("", alias="from"),
    date_to: str = Query("", alias="to"),
    group: str = Query("day"),
    user=Depends(get_current_user),
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