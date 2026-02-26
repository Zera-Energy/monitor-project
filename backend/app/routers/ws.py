# app/routers/ws.py
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.ws.manager import ws_manager

router = APIRouter(tags=["ws"])

@router.websocket("/ws/telemetry")
async def ws_telemetry(ws: WebSocket):
    # (선택) 여기서 토큰 인증도 가능. 일단은 연결만.
    await ws_manager.connect(ws)
    try:
        while True:
            # 클라이언트 메시지 받을 필요 없으면, keepalive만
            await asyncio.sleep(30)
            try:
                await ws.send_text('{"type":"ping"}')
            except Exception:
                break
    except WebSocketDisconnect:
        pass
    finally:
        await ws_manager.disconnect(ws)