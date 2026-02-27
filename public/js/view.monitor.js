// /js/view.monitor.js
(() => {
  const $ = (id) => document.getElementById(id);

  const btnOpen = $("btnDevicesOverview");
  const back = $("devOvBack");
  const modal = $("devOvModal");

  const logEl = $("mqttLog");
  const apiStatusEl = $("mqttWsStatus");
  const lastAtEl = $("mqttLastAt");
  const updateCountEl = $("mqttMsgCount");
  const btnPauseLog = $("btnPauseLog");
  const btnClearLog = $("btnClearLog");
  const autoGrid = $("mqttAutoGrid");

  const devOvFilterSel = $("devOvFilterSel");
  const devOvCount = $("devOvCount");
  const devOvContent = $("devOvContent");

  const selDevice = $("selDevice");
  const deviceTbody = $("deviceTbody");

  const prevCleanup = window.__viewCleanup__;

  const API_BASE = window.API_BASE || "http://127.0.0.1:8000";
  const ONLINE_SEC = 60;

  function safe(v){ return (v === undefined || v === null || v === "") ? "-" : String(v); }
  function n(v){ const x = Number(v); return Number.isFinite(x) ? x : null; }

  function deviceKey(d){
    if (!d) return "";
    if (d.device_topic) return String(d.device_topic);
    if (d.topic) return String(d.topic);
    if (d._raw_topic) return String(d._raw_topic);
    if (d.country || d.site_id || d.model || d.device_id)
      return `${d.country}/${d.site_id}/${d.model}/${d.device_id}`;
    return String(d.id ?? "");
  }

  function deviceLabel(d){
    return String(d?.device_display ?? d?.device_short ?? deviceKey(d));
  }

  // =========================
  // Devices cache
  // =========================
  const devices = [];
  let __devicesCache = devices;

  function setApiStatus(v){
    if (apiStatusEl) apiStatusEl.textContent = v;
  }

  function renderAutoCards(items){
    if (!autoGrid) return;

    autoGrid.innerHTML = "";

    for (const d of items) {
      const key = deviceKey(d);
      const online = d.online ?? (d.age_sec < ONLINE_SEC);

      const card = document.createElement("div");
      card.className = "contentCard";
      card.innerHTML = `
        <div style="font-weight:900">${deviceLabel(d)}</div>
        <div>${online ? "🟢 ONLINE" : "🔴 OFFLINE"}</div>
        <div class="muted">${safe(d.last_topic)}</div>
      `;
      autoGrid.appendChild(card);
    }
  }

  function renderDeviceTable(items){
    if (!deviceTbody) return;
    deviceTbody.innerHTML = "";

    if (!items.length) {
      deviceTbody.innerHTML = `<tr><td colspan="6">No data</td></tr>`;
      return;
    }

    items.forEach((d, idx) => {
      const online = d.online ?? (d.age_sec < ONLINE_SEC);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${idx+1}</td>
        <td>${deviceLabel(d)}</td>
        <td>${safe(d.last_topic)}</td>
        <td>${safe(d.age_sec)}s</td>
        <td>${online ? "🟢" : "🔴"}</td>
      `;
      deviceTbody.appendChild(tr);
    });
  }

  window.__monitorOnDevices__ = (items) => {
    devices.length = 0;
    for (const x of (items || [])) devices.push(x);
    __devicesCache = devices;

    renderAutoCards(devices);
    renderDeviceTable(devices);
  };

  // =========================
  // ✅ WebSocket (안정화 + 자동 재연결)
  // =========================
  let __ws = null;
  let __wsClosedByUser = false;

  (function initWebSocket(){

    const WS_BASE =
      (window.WS_BASE) ||
      (API_BASE.startsWith("https")
        ? API_BASE.replace("https", "wss")
        : API_BASE.replace("http", "ws"));

    const wsUrl = `${WS_BASE}/ws/telemetry`;

    let retry = 1000;

    function connect(){
      __wsClosedByUser = false;

      try { __ws && __ws.close(); } catch {}

      __ws = new WebSocket(wsUrl);

      __ws.onopen = () => {
        setApiStatus("WS connected");
        retry = 1000;
      };

      __ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.type !== "telemetry") return;

        const key = msg.key;
        if (!key) return;

        const idx = devices.findIndex(d => deviceKey(d) === key);
        if (idx === -1) return;

        const d = devices[idx];

        d.payload = msg.payload || {};
        d.channels = msg.channels || [];
        d.channel_count = msg.channel_count || 0;

        if (msg.summary) Object.assign(d, msg.summary);

        d.age_sec = 0;
        d.online = true;

        renderAutoCards(devices);
        renderDeviceTable(devices);

        if (updateCountEl)
          updateCountEl.textContent = String(Number(updateCountEl.textContent||0)+1);
        if (lastAtEl)
          lastAtEl.textContent = new Date().toLocaleTimeString();
      };

      __ws.onclose = () => {
        if (__wsClosedByUser) return;

        setApiStatus("WS reconnecting...");
        setTimeout(connect, retry);
        retry = Math.min(10000, retry * 2);
      };

      __ws.onerror = () => {
        setApiStatus("WS error");
      };
    }

    connect();
  })();

  // =========================
  // Cleanup
  // =========================
  window.__viewCleanup__ = () => {
    try {
      __wsClosedByUser = true;
      __ws && __ws.close();
    } catch {}
    __ws = null;

    try { if (typeof prevCleanup === "function") prevCleanup(); } catch {}
  };

})();