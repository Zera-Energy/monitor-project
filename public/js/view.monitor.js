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

  // ✅ Select data 버튼(있으면 사용)
  const btnSelectData = $("btnSelectData");

  // ✅ 기존 cleanup 체인
  const prevCleanup = window.__viewCleanup__;

  const API_BASE = window.API_BASE || "http://127.0.0.1:8000";
  const ONLINE_SEC = 60;

  // ===== utils =====
  function safe(v){ return (v === undefined || v === null || v === "") ? "-" : String(v); }
  function n(v){ const x = Number(v); return Number.isFinite(x) ? x : null; }

  // ✅ topic 우선 key/label
  function deviceKey(d){
    if (!d) return "";
    if (d.device_topic) return String(d.device_topic);
    if (d.topic) return String(d.topic);
    if (d._raw_topic) return String(d._raw_topic);
    if (d.country || d.site_id || d.model || d.device_id) return `${d.country}/${d.site_id}/${d.model}/${d.device_id}`;
    return String(d.id ?? "");
  }
  function deviceLabel(d){
    return String(d?.device_display ?? d?.device_short ?? deviceKey(d));
  }

  function pickChannels(payloadOrItem){
    const ch = payloadOrItem?.channels;
    return Array.isArray(ch) ? ch : [];
  }
  function pickMetricFromCh(c){
    const A  = c?.a ?? c?.amp ?? c?.current ?? c?.value;
    const kW = c?.kw ?? c?.p_kw ?? c?.power_kw ?? c?.p;
    const V  = c?.v ?? c?.volt ?? c?.voltage;
    return { A:n(A), kW:n(kW), V:n(V) };
  }
  function fmtCell(c){
    if (!c) return "-";
    const m = pickMetricFromCh(c);
    const parts = [];
    if (m.A !== null) parts.push(`${m.A.toFixed(2)}A`);
    if (m.kW !== null) parts.push(`${m.kW.toFixed(2)}kW`);
    if (m.V !== null) parts.push(`${m.V.toFixed(1)}V`);
    return parts.length ? parts.join(" · ") : "-";
  }
  function sumKwByTerm(channels, term){
    const xs = channels
      .filter(c => c?.term === term)
      .map(c => n(c?.kw ?? c?.p_kw ?? c?.power_kw ?? c?.p))
      .filter(x => x !== null);
    return xs.length ? xs.reduce((a,b)=>a+b,0) : null;
  }

  // =========================
  // ✅ 0) Selected device detail panel (6채널 + 절감)
  // =========================
  function ensureDetailPanel(){
    let el = document.getElementById("monDetailPanel");
    if (el) return el;

    const anchor = selDevice?.closest(".toolbar") || selDevice?.parentElement || document.body;

    el = document.createElement("section");
    el.id = "monDetailPanel";
    el.className = "contentCard";
    el.style.marginTop = "12px";

    el.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <div>
          <div class="k">Selected Device</div>
          <div class="v" id="monDetailTitle" style="font-size:16px;">-</div>
        </div>
        <div style="text-align:right;">
          <div class="k">Saving</div>
          <div class="v" id="monSavingMain" style="font-size:16px;">-</div>
          <div class="muted" id="monSavingSub" style="font-size:12px;">-</div>
        </div>
      </div>

      <div style="margin-top:10px; overflow:auto;">
        <table style="width:100%; border-collapse:collapse; min-width:520px;">
          <thead>
            <tr>
              <th style="text-align:left; padding:8px; border-bottom:1px solid #eee;">Term</th>
              <th style="text-align:left; padding:8px; border-bottom:1px solid #eee;">L1</th>
              <th style="text-align:left; padding:8px; border-bottom:1px solid #eee;">L2</th>
              <th style="text-align:left; padding:8px; border-bottom:1px solid #eee;">L3</th>
              <th style="text-align:left; padding:8px; border-bottom:1px solid #eee;">Σ</th>
            </tr>
          </thead>
          <tbody id="monDetailTbody">
            <tr><td colspan="5" class="muted" style="padding:10px;">No channel data</td></tr>
          </tbody>
        </table>
      </div>
      <div class="muted" style="margin-top:8px;">* Values show A / kW / V if available.</div>
    `;

    anchor.insertAdjacentElement("afterend", el);
    return el;
  }

  function renderDetailPanelBySelected(devices){
    ensureDetailPanel();
    const title = document.getElementById("monDetailTitle");
    const tbody = document.getElementById("monDetailTbody");
    const savingMain = document.getElementById("monSavingMain");
    const savingSub = document.getElementById("monSavingSub");

    if (!title || !tbody) return;

    const key = selDevice?.value || "";
    const d = devices.find(x => deviceKey(x) === key) || null;

    if (!d) {
      title.textContent = "-";
      tbody.innerHTML = `<tr><td colspan="5" class="muted" style="padding:10px;">Select a device</td></tr>`;
      if (savingMain) savingMain.textContent = "-";
      if (savingSub) savingSub.textContent = "-";
      return;
    }

    title.textContent = deviceLabel(d);

    const payload = d.payload || d;
    const channels = pickChannels(payload);
    const phases = ["L1","L2","L3"];
    const getCh = (term, phase) => channels.find(c => c?.term === term && c?.phase === phase) || null;

    if (!channels.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="muted" style="padding:10px;">No channel data</td></tr>`;
      if (savingMain) savingMain.textContent = "-";
      if (savingSub) savingSub.textContent = "-";
      return;
    }

    const inRow = phases.map(p => getCh("in", p));
    const outRow = phases.map(p => getCh("out", p));

    const inKw  = sumKwByTerm(channels, "in");
    const outKw = sumKwByTerm(channels, "out");

    let dKw = null, pct = null;
    if (inKw !== null && outKw !== null) {
      dKw = inKw - outKw;
      pct = (inKw !== 0) ? (dKw / inKw) * 100 : null;
    }

    if (savingMain) savingMain.textContent = (dKw !== null) ? `${dKw.toFixed(2)} kW` : "-";
    if (savingSub) savingSub.textContent = (pct !== null) ? `${pct.toFixed(1)} % (IN→OUT)` : "-";

    const makeTr = (label, arr, sumKw) => `
      <tr>
        <td style="padding:8px; border-bottom:1px solid #f3f3f3; font-weight:900;">${label}</td>
        <td style="padding:8px; border-bottom:1px solid #f3f3f3;">${fmtCell(arr[0])}</td>
        <td style="padding:8px; border-bottom:1px solid #f3f3f3;">${fmtCell(arr[1])}</td>
        <td style="padding:8px; border-bottom:1px solid #f3f3f3;">${fmtCell(arr[2])}</td>
        <td style="padding:8px; border-bottom:1px solid #f3f3f3; font-weight:900;">${sumKw !== null ? `${sumKw.toFixed(2)}kW` : "-"}</td>
      </tr>
    `;

    tbody.innerHTML =
      makeTr("IN", inRow, inKw) +
      makeTr("OUT", outRow, outKw);
  }

  selDevice?.addEventListener("change", () => {
    try { renderDetailPanelBySelected(__devicesCache); } catch {}
    // ✅ 선택 장비 바뀌면 실시간 차트도 리셋(권장)
    try { resetRealtimeChart(); } catch {}
  });

  // =========================
  // ✅ Realtime Chart (추가)
  // =========================
  let rtChart = null;
  const rtBuf = { labels: [], values: [] };
  const RT_MAX = 120; // 120개 포인트 유지 (약 2분~5분)

  function ensureRealtimeChartUI(){
    // 1) 이미 canvas 있으면 사용
    let canvas = document.getElementById("rtChart");

    // 2) 없으면 detail panel 아래에 자동 생성
    if (!canvas) {
      ensureDetailPanel();
      const panel = document.getElementById("monDetailPanel");
      if (!panel) return null;

      const wrap = document.createElement("section");
      wrap.className = "contentCard";
      wrap.style.marginTop = "12px";

      wrap.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <div>
            <div class="k">Realtime</div>
            <div class="v" style="font-size:14px;">Selected device kW</div>
          </div>
          <button type="button" class="btnSmall gray" id="btnRtReset">Reset</button>
        </div>
        <div style="margin-top:10px;">
          <canvas id="rtChart" height="120"></canvas>
        </div>
        <div class="muted" style="margin-top:6px; font-size:12px;">
          * Updates when telemetry arrives via WebSocket.
        </div>
      `;

      panel.insertAdjacentElement("afterend", wrap);
      canvas = wrap.querySelector("#rtChart");

      wrap.querySelector("#btnRtReset")?.addEventListener("click", () => {
        resetRealtimeChart();
      });
    }

    return canvas;
  }

  function initRealtimeChart(){
    const canvas = ensureRealtimeChartUI();
    if (!canvas) return;

    if (!window.Chart) {
      // Chart.js가 없으면 차트 생성 못함
      return;
    }

    // 이미 만들어져 있으면 스킵
    if (rtChart) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    rtChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [{
          label: "kW",
          data: [],
          tension: 0.2,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        animation: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: true } },
        scales: {
          x: { display: true },
          y: { display: true }
        }
      }
    });
  }

  function resetRealtimeChart(){
    rtBuf.labels = [];
    rtBuf.values = [];
    if (rtChart) {
      rtChart.data.labels = [];
      rtChart.data.datasets[0].data = [];
      rtChart.update();
    }
  }

  function pushRealtimePoint(label, value){
    if (value === null || value === undefined) return;

    rtBuf.labels.push(label);
    rtBuf.values.push(value);

    // 길이 제한
    while (rtBuf.labels.length > RT_MAX) rtBuf.labels.shift();
    while (rtBuf.values.length > RT_MAX) rtBuf.values.shift();

    if (!rtChart) return;

    rtChart.data.labels = rtBuf.labels.slice();
    rtChart.data.datasets[0].data = rtBuf.values.slice();
    rtChart.update();
  }

  // 초기 차트 준비
  initRealtimeChart();

  // =========================
  // ✅ 2) 서버(API) 기준 장비 목록 → 화면 렌더
  // =========================
  let paused = false;
  let updateCount = 0;

  function appendLog(line) {
    if (!logEl || paused) return;
    logEl.textContent += line + "\n";
    logEl.scrollTop = logEl.scrollHeight;
  }

  btnPauseLog?.addEventListener("click", () => {
    paused = !paused;
    if (btnPauseLog) btnPauseLog.textContent = paused ? "Resume" : "Pause";
  });

  btnClearLog?.addEventListener("click", () => {
    if (logEl) logEl.textContent = "";
    updateCount = 0;
    if (updateCountEl) updateCountEl.textContent = "0";
    if (lastAtEl) lastAtEl.textContent = "-";
  });

  function setSelDeviceOptions(items){
    if (!selDevice) return;

    const current = selDevice.value || "";
    const opts = [`<option value="">Select Device</option>`];

    for (const d of items) {
      const key = deviceKey(d);
      const label = deviceLabel(d);
      opts.push(`<option value="${key}">${label}</option>`);
    }

    selDevice.innerHTML = opts.join("");

    if (current) {
      const exists = items.some(x => deviceKey(x) === current);
      if (exists) selDevice.value = current;
    }
  }

  function ensureAutoCard(key) {
    if (!autoGrid) return null;
    let card = autoGrid.querySelector(`[data-device-card="${key}"]`);
    if (card) return card;

    card = document.createElement("div");
    card.className = "contentCard";
    card.setAttribute("data-device-card", key);

    card.innerHTML = `
      <div class="k">Device</div>
      <div style="font-weight:900; margin-top:4px; word-break:break-all;" data-title>${key}</div>
      <div class="k" style="margin-top:10px;">Status</div>
      <div class="muted" data-status>-</div>
      <div class="k" style="margin-top:10px;">Last Topic</div>
      <div class="muted" style="word-break:break-all;" data-topic>-</div>
      <div class="k" style="margin-top:10px;">Age</div>
      <div class="muted" data-age>-</div>
    `;
    autoGrid.prepend(card);
    return card;
  }

  function renderAutoCards(items){
    if (!autoGrid) return;

    for (const d of items) {
      const key = deviceKey(d);
      const card = ensureAutoCard(key);
      if (!card) continue;

      const online = (d.online !== undefined) ? !!d.online : (d.age_sec < ONLINE_SEC);
      const statusEl = card.querySelector("[data-status]");
      const topicEl = card.querySelector("[data-topic]");
      const ageEl = card.querySelector("[data-age]");
      const titleEl = card.querySelector("[data-title]");

      if (titleEl) titleEl.textContent = deviceLabel(d);
      if (statusEl) statusEl.textContent = online ? "🟢 ONLINE" : "🔴 OFFLINE";
      if (topicEl) topicEl.textContent = safe(d.last_topic ?? d.device_topic ?? d.topic);
      if (ageEl) ageEl.textContent = `${safe(d.age_sec)}s`;
    }
  }

  function renderDeviceTable(items){
    if (!deviceTbody) return;
    deviceTbody.innerHTML = "";

    if (!items.length) {
      deviceTbody.innerHTML = `<tr><td colspan="8" class="empty">No data available in table</td></tr>`;
      return;
    }

    items.forEach((d, idx) => {
      const key = deviceKey(d);
      const online = (d.online !== undefined) ? !!d.online : (d.age_sec < ONLINE_SEC);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>
          <button class="btn" type="button" data-action="copy" data-key="${key}">Copy</button>
        </td>
        <td style="font-weight:900;">${safe(deviceLabel(d))}</td>
        <td>${safe(d.last_type || "meter")}</td>
        <td>-</td>
        <td style="max-width:360px; word-break:break-all;">${safe(d.last_topic ?? d.device_topic ?? d.topic)}</td>
        <td>${safe(d.age_sec)}s</td>
        <td>${online ? "🟢 Online" : "🔴 Offline"}</td>
      `;
      deviceTbody.appendChild(tr);
    });
  }

  function renderDevOv(){
    const f = devOvFilterSel ? devOvFilterSel.value : "all";
    const filtered =
      (f === "online") ? devices.filter(x => (x.online !== undefined ? !!x.online : x.age_sec < ONLINE_SEC))
      : (f === "offline") ? devices.filter(x => (x.online !== undefined ? !x.online : x.age_sec >= ONLINE_SEC))
      : devices;

    if (devOvCount) devOvCount.textContent = `(${filtered.length} devices)`;

    if (!devOvContent) return;
    devOvContent.innerHTML = "";

    if (!filtered.length) {
      devOvContent.innerHTML = `<div class="muted">No data</div>`;
      return;
    }

    filtered.forEach((d) => {
      const online = (d.online !== undefined) ? !!d.online : (d.age_sec < ONLINE_SEC);

      const el = document.createElement("div");
      el.className = "contentCard";
      el.style.marginBottom = "10px";
      el.innerHTML = `
        <div style="display:flex; justify-content:space-between; gap:10px;">
          <div>
            <div class="k">Device</div>
            <div class="v" style="font-size:18px;">${safe(deviceLabel(d))}</div>
          </div>
          <div class="muted">${online ? "🟢 Online" : "🔴 Offline"}</div>
        </div>
        <div class="muted" style="margin-top:6px;">
          Topic: ${safe(d.last_topic ?? d.device_topic ?? d.topic)}<br/>
          Age: ${safe(d.age_sec)}s
        </div>
      `;
      devOvContent.appendChild(el);
    });
  }

  devOvFilterSel?.addEventListener("change", renderDevOv);

  window.__monitorOnDevices__ = (items) => {
    setApiStatus("ok");

    updateCount += 1;
    if (updateCountEl) updateCountEl.textContent = String(updateCount);
    if (lastAtEl) lastAtEl.textContent = new Date().toLocaleTimeString();

    devices.length = 0;
    for (const x of (items || [])) devices.push(x);
    __devicesCache = devices;

    appendLog(`✅ devices updated: ${devices.length} @ ${new Date().toLocaleTimeString()}`);

    setSelDeviceOptions(devices);
    renderAutoCards(devices);
    renderDeviceTable(devices);
    renderDevOv();

    // ✅ 선택 장비 6채널 + 절감
    try { renderDetailPanelBySelected(devices); } catch {}

    // ✅ chart 준비 (렌더 이후)
    try { initRealtimeChart(); } catch {}
  };

  setApiStatus("waiting...");

  // =========================
  // ✅ 4) WebSocket 실시간 연결 (추가)
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

        // 선택 장비 key
        const selectedKey = selDevice?.value || "";

        const idx = devices.findIndex(d => deviceKey(d) === key);
        if (idx === -1) return;

        const d = devices[idx];

        // ✅ payload / channels 갱신
        d.payload = msg.payload || {};
        d.channels = msg.channels || (msg.payload?.channels || []);
        d.channel_count = msg.channel_count ?? (msg.payload?.channel_count ?? 0);

        // ✅ summary 값(kw/pf/v_avg 등) 반영
        if (msg.summary && typeof msg.summary === "object") {
          Object.assign(d, msg.summary);
        }

        // ✅ online/age 갱신
        d.age_sec = 0;
        d.online = true;

        // ✅ topic 갱신(있으면)
        if (msg.last_topic) d.last_topic = msg.last_topic;

        // ✅ UI 갱신
        renderAutoCards(devices);
        renderDeviceTable(devices);
        try { renderDetailPanelBySelected(devices); } catch {}

        updateCount += 1;
        if (updateCountEl) updateCountEl.textContent = String(updateCount);
        if (lastAtEl) lastAtEl.textContent = new Date().toLocaleTimeString();

        // ✅ 실시간 차트 업데이트: "선택 장비"만 그리기
        if (selectedKey && selectedKey === key) {
          // 1) kW 값을 우선 summary.kw에서 찾고 없으면 payload.kw
          const kw = n(msg?.summary?.kw ?? msg?.payload?.kw);

          // 2) 라벨은 HH:MM:SS
          const t = new Date().toLocaleTimeString();

          // 3) 차트에 추가
          initRealtimeChart();
          pushRealtimePoint(t, kw);
        }
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
  // ✅ 3) Devices Overview Modal (기존)
  // =========================
  function openDevOv(){
    if (!back || !modal) return;
    back.hidden = false;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("noScroll");
    document.body.classList.add("noScroll");
    renderDevOv();
  }

  function closeDevOv(){
    if (!back || !modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    back.hidden = true;
    document.documentElement.classList.remove("noScroll");
    document.body.classList.remove("noScroll");
  }

  if (btnOpen && back && modal) {
    closeDevOv();
    btnOpen.addEventListener("click", openDevOv);
  }

  const onDocClick = (e) => {
    const t = e.target;

    if (t?.closest('[data-action="close-devov"]')) closeDevOv();
    if (t?.id === "devOvBack") closeDevOv();

    const copyBtn = t?.closest('[data-action="copy"]');
    if (copyBtn) {
      const key = copyBtn.getAttribute("data-key") || "";
      if (!key) return;
      try {
        navigator.clipboard?.writeText(key);
        appendLog(`📋 copied: ${key}`);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = key;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        appendLog(`📋 copied: ${key}`);
      }
    }
  };
  document.addEventListener("click", onDocClick);

  const onKeyDown = (e) => {
    if (e.key === "Escape" && modal?.classList.contains("is-open")) closeDevOv();
  };
  window.addEventListener("keydown", onKeyDown);

  window.__viewCleanup__ = () => {
    try { closeDevOv(); } catch {}
    try { document.removeEventListener("click", onDocClick); } catch {}
    try { window.removeEventListener("keydown", onKeyDown); } catch {}
    try { if (window.__monitorOnDevices__) delete window.__monitorOnDevices__; } catch {}

    // ✅ WebSocket 닫기 (사용자 종료 표시)
    try {
      __wsClosedByUser = true;
      __ws && __ws.close();
    } catch {}
    __ws = null;

    // ✅ realtime chart 정리
    try { rtChart && rtChart.destroy && rtChart.destroy(); } catch {}
    rtChart = null;

    try { if (typeof prevCleanup === "function") prevCleanup(); } catch {}
  };
})();