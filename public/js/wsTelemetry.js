// /js/wsTelemetry.js
export function connectTelemetryWS({ baseWsUrl, onTelemetry, onStatus }) {
  // baseWsUrl 예: "wss://<백엔드도메인>" 또는 로컬 "ws://localhost:10000"
  const url = `${baseWsUrl}/ws/telemetry`;

  let ws = null;
  let retryMs = 1000;
  let closedByUser = false;

  function logStatus(type, detail) {
    if (onStatus) onStatus({ type, detail });
  }

  function connect() {
    if (closedByUser) return;

    ws = new WebSocket(url);

    ws.onopen = () => {
      retryMs = 1000;
      logStatus("open", "connected");
    };

    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }

      if (msg.type === "ping") return;

      if (msg.type === "telemetry") {
        // msg = {type, ts, key, payload, summary, channels, channel_count}
        if (onTelemetry) onTelemetry(msg);
      }
    };

    ws.onclose = () => {
      logStatus("close", "disconnected");

      if (closedByUser) return;

      // 재연결 (최대 10초까지 점점 늘림)
      const wait = retryMs;
      retryMs = Math.min(10000, retryMs * 2);

      setTimeout(connect, wait);
    };

    ws.onerror = (e) => {
      logStatus("error", e?.message || "ws error");
      // onerror 뒤에 onclose가 이어지는 경우가 많아서 여기서 close는 안 해도 됨
    };
  }

  connect();

  return {
    close() {
      closedByUser = true;
      try { ws && ws.close(); } catch {}
    }
  };
}