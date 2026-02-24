# app/routers/report.py
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import io
import xlsxwriter

from app.core.security import get_current_user

router = APIRouter(prefix="/api/report", tags=["report"])

class SeriesReq(BaseModel):
    title: str = "Period Analysis"
    metric: str = "kwh"
    series: str = "total"
    labels: list[str]
    values: list[float]

@router.post("/xlsx")
def make_xlsx(req: SeriesReq, user=Depends(get_current_user)):
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