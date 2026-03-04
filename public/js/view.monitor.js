// /js/view.monitor.js
(() => {
  const $ = (id) => document.getElementById(id);

  // ✅ (삭제) Devices Overview modal 관련 요소들
  // const btnOpen = $("btnDevicesOverview");
  // const back = $("devOvBack");
  // const modal = $("devOvModal");

  const logEl = $("mqttLog");

  // ✅ mqttWsStatus는 계속 사용 (API/WS 상태 표시)
  const apiStatusEl = $("mqttWsStatus");

  const lastAtEl = $("mqttLastAt");
  const updateCountEl = $("mqttMsgCount");
  const btnPauseLog = $("btnPauseLog");
  const btnClearLog = $("btnClearLog");
  const autoGrid = $("mqttAutoGrid");

  // ✅ (삭제) Devices Overview 내부 요소들
  // const devOvFilterSel = $("devOvFilterSel");
  // const devOvCount = $("devOvCount");
  // const devOvContent = $("devOvContent");

  const deviceTbody = $("deviceTbody");

  // ✅ 선택된 장비 (Select Device 드롭다운 삭제 → 카드/테이블 클릭으로 선택)
  let __selectedKey = "";
  let __selectedLabel = "";

  // ✅ Trend 상단 섹션(사진 스타일)
  const trendDeviceSel = $("trendDeviceSel");
  const btnTrendRefresh = $("btnTrendRefresh");
  const trendLocationTextEl = $("trendLocationText");

  function selectDeviceByKey(key, label){
    __selectedKey = String(key || "");
    __selectedLabel = String(label || __selectedKey || "");

    // ✅ Trend 상단 드롭다운도 같이 동기화
    if (trendDeviceSel) {
      trendDeviceSel.value = __selectedKey || "";
    }

    // ✅ 위치 pill 텍스트 갱신
    try {
      const d = devices.find(x => deviceKey(x) === __selectedKey) || null;
      const loc =
        d?.site_name ??
        d?.site ??
        d?.location ??
        d?.place ??
        d?.site_id ??
        d?.country ??
        "-";
      if (trendLocationTextEl) trendLocationTextEl.textContent = String(loc || "-");
    } catch {
      if (trendLocationTextEl) trendLocationTextEl.textContent = "-";
    }

    try {
      setTrendStatus(__selectedKey ? `Selected: ${__selectedLabel}` : "Ready");
    } catch {}
  }

  // ✅ Select data 버튼(있으면 사용)
  const btnSelectData = $("btnSelectData");

  // ✅ KPI BOARD Trend controls
  const trendMetricEl = $("trendMetric");
  const trendIntervalEl = $("trendInterval");
  const trendFromEl = $("trendFrom");
  const trendToEl = $("trendTo");
  const trendShowLimitsEl = $("trendShowLimits");
  const trendStatusEl = $("trendStatus");
  const btnTrendPlot = $("btnTrendPlot");
  const btnTrendExport = $("btnTrendExport");
  const trendEmptyEl = $("trendEmpty");

  // ✅ 기존 cleanup 체인
  const prevCleanup = window.__viewCleanup__;

  const API_BASE = window.API_BASE || "http://127.0.0.1:8000";
  const ONLINE_SEC = 60;

  // ===== utils =====
  function safe(v){ return (v === undefined || v === null || v === "") ? "-" : String(v); }
  function n(v){ const x = Number(v); return Number.isFinite(x) ? x : null; }

  function setTrendStatus(v){
    if (trendStatusEl) trendStatusEl.textContent = v;
  }

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

  /* =========================================================
     ✅ KPI BOARD helpers
  ========================================================= */
  function setTile(id, title, valueText, unit, sub){
    const el = document.getElementById(id);
    if (!el) return;
    const v = (valueText === undefined || valueText === null || valueText === "") ? "-" : String(valueText);
    el.innerHTML = `
      <div class="t">${title}</div>
      <div class="v">${v}${unit ? `<span class="u">${unit}</span>` : ""}</div>
      <div class="s">${sub || ""}</div>
    `;
  }

  function pickSummaryNumber(msg, keys){
    for (const k of keys){
      const v = msg?.summary?.[k] ?? msg?.payload?.[k];
      const x = Number(v);
      if (Number.isFinite(x)) return x;
    }
    return null;
  }

  function findChannel(channels, term, phase){
    if (!Array.isArray(channels)) return null;
    return channels.find(c => {
      const t = String(c?.term ?? "").toLowerCase();
      const p = String(c?.phase ?? c?.ph ?? "").toUpperCase();
      return t === String(term).toLowerCase() && p === String(phase).toUpperCase();
    }) || null;
  }

  function findVll(channels, phase){
    if (!Array.isArray(channels)) return null;
    const want = String(phase).toUpperCase(); // "L1-L2"
    return channels.find(c => {
      const p = String(c?.phase ?? c?.ph ?? "").toUpperCase();
      const name = String(c?.name ?? c?.metric ?? "").toUpperCase();
      const term = String(c?.term ?? "").toUpperCase();
      return p === want || name.includes(want) || term.includes(want);
    }) || null;
  }

  function updateKpiFromTelemetry(msg){
    const nowText = new Date().toLocaleTimeString();
    const channels = msg?.channels || (msg?.payload?.channels || []);

    const v12 = pickSummaryNumber(msg, ["v12","v_l1l2","v_ll12"]) ??
                n(findVll(channels, "L1-L2")?.v ?? findVll(channels, "L1-L2")?.volt ?? findVll(channels, "L1-L2")?.voltage);

    const v23 = pickSummaryNumber(msg, ["v23","v_l2l3","v_ll23"]) ??
                n(findVll(channels, "L2-L3")?.v ?? findVll(channels, "L2-L3")?.volt ?? findVll(channels, "L2-L3")?.voltage);

    const v31 = pickSummaryNumber(msg, ["v31","v_l3l1","v_ll31"]) ??
                n(findVll(channels, "L3-L1")?.v ?? findVll(channels, "L3-L1")?.volt ?? findVll(channels, "L3-L1")?.voltage);

    setTile("tileV12", "VOLTAGE L1–L2", v12 !== null ? v12.toFixed(2) : "-", "V", nowText);
    setTile("tileV23", "VOLTAGE L2–L3", v23 !== null ? v23.toFixed(2) : "-", "V", nowText);
    setTile("tileV31", "VOLTAGE L3–L1", v31 !== null ? v31.toFixed(2) : "-", "V", nowText);

    const a1 = pickSummaryNumber(msg, ["a1","i1","amp1"]) ??
               n(findChannel(channels, "in", "L1")?.a ?? findChannel(channels, "in", "L1")?.amp ?? findChannel(channels, "in", "L1")?.current);

    const a2 = pickSummaryNumber(msg, ["a2","i2","amp2"]) ??
               n(findChannel(channels, "in", "L2")?.a ?? findChannel(channels, "in", "L2")?.amp ?? findChannel(channels, "in", "L2")?.current);

    const a3 = pickSummaryNumber(msg, ["a3","i3","amp3"]) ??
               n(findChannel(channels, "in", "L3")?.a ?? findChannel(channels, "in", "L3")?.amp ?? findChannel(channels, "in", "L3")?.current);

    setTile("tileA1", "CURRENT PHASE 1", a1 !== null ? a1.toFixed(2) : "-", "A", nowText);
    setTile("tileA2", "CURRENT PHASE 2", a2 !== null ? a2.toFixed(2) : "-", "A", nowText);
    setTile("tileA3", "CURRENT PHASE 3", a3 !== null ? a3.toFixed(2) : "-", "A", nowText);

    const kw1 = pickSummaryNumber(msg, ["kw1","p1_kw"]) ??
                n(findChannel(channels, "in", "L1")?.kw ?? findChannel(channels, "in", "L1")?.p_kw ?? findChannel(channels, "in", "L1")?.power_kw ?? findChannel(channels, "in", "L1")?.p);

    const kw2 = pickSummaryNumber(msg, ["kw2","p2_kw"]) ??
                n(findChannel(channels, "in", "L2")?.kw ?? findChannel(channels, "in", "L2")?.p_kw ?? findChannel(channels, "in", "L2")?.power_kw ?? findChannel(channels, "in", "L2")?.p);

    const kw3 = pickSummaryNumber(msg, ["kw3","p3_kw"]) ??
                n(findChannel(channels, "in", "L3")?.kw ?? findChannel(channels, "in", "L3")?.p_kw ?? findChannel(channels, "in", "L3")?.power_kw ?? findChannel(channels, "in", "L3")?.p);

    const kwt = pickSummaryNumber(msg, ["kw","kw_total","p_kw_total","total_kw"]);
    const kvar = pickSummaryNumber(msg, ["kvar","q_kvar","reactive_kvar"]);
    const kva  = pickSummaryNumber(msg, ["kva","s_kva","apparent_kva"]);
    const hz   = pickSummaryNumber(msg, ["hz","freq","frequency"]);
    const pf   = pickSummaryNumber(msg, ["pf","power_factor"]);

    setTile("tileKW1", "POWER PHASE 1", kw1 !== null ? kw1.toFixed(2) : "-", "kW", nowText);
    setTile("tileKW2", "POWER PHASE 2", kw2 !== null ? kw2.toFixed(2) : "-", "kW", nowText);
    setTile("tileKW3", "POWER PHASE 3", kw3 !== null ? kw3.toFixed(2) : "-", "kW", nowText);
    setTile("tileKWt", "TOTAL POWER",   kwt !== null ? kwt.toFixed(2) : "-", "kW", nowText);
    setTile("tileKvar","REACTIVE POWER",kvar !== null ? kvar.toFixed(2) : "-", "kVAr", nowText);

    setTile("tileKva", "APPARENT POWER", kva !== null ? kva.toFixed(2) : "-", "kVA", nowText);
    setTile("tileHz",  "FREQUENCY",      hz  !== null ? hz.toFixed(2) : "-", "Hz", nowText);
    setTile("tilePF",  "POWER FACTOR",   pf  !== null ? pf.toFixed(2) : "-", "PF", nowText);

    const thdb = pickSummaryNumber(msg, ["thd_before","thd_b","thdBefore"]);
    const thda = pickSummaryNumber(msg, ["thd_after","thd_a","thdAfter"]);

    setTile("tileTHDb", "THD BEFORE", thdb !== null ? thdb.toFixed(2) : "-", "%", "Before K-Save");
    setTile("tileTHDa", "THD AFTER",  thda !== null ? thda.toFixed(2) : "-", "%", "With K-Save");

    const kwh   = pickSummaryNumber(msg, ["kwh","energy_kwh"]);
    const saved = pickSummaryNumber(msg, ["kwh_saved","energy_saved_kwh"]);
    const co2   = pickSummaryNumber(msg, ["co2_saved","co2_kg","co2"]);

    setTile("tileKwh",   "ENERGY",       kwh   !== null ? kwh.toFixed(2) : "-", "kWh", nowText);
    setTile("tileSaved", "ENERGY SAVED",  saved !== null ? saved.toFixed(2) : "-", "kWh", nowText);
    setTile("tileCO2",   "CO₂ SAVED",     co2   !== null ? co2.toFixed(2) : "-", "kg",  nowText);
  }

  /* =========================================================
     ✅ Trend Chart
  ========================================================= */
  let trendChart = null;
  const trendBuf = { labels: [], values: [] };
  const TREND_MAX = 240;

  function initTrendMetricOptions(){
    if (!trendMetricEl) return;

    const items = [
      { value: "v_ln1", label: "Voltage LN1 (V)" },
      { value: "v_ln2", label: "Voltage LN2 (V)" },
      { value: "v_ln3", label: "Voltage LN3 (V)" },
      { value: "a_l1",  label: "Current L1 (A)" },
      { value: "a_l2",  label: "Current L2 (A)" },
      { value: "a_l3",  label: "Current L3 (A)" },
      { value: "kw",    label: "Active Power (kW)" },
      { value: "kvar",  label: "Reactive Power (kVAr)" },
      { value: "kva",   label: "Apparent Power (kVA)" },
      { value: "pf",    label: "Power Factor" },
      { value: "hz",    label: "Frequency (Hz)" },
      { value: "kwh",   label: "Energy (kWh)" },
      { value: "kwh_saved", label: "Energy Saved (kWh)" },
    ];

    trendMetricEl.innerHTML = items.map(x => `<option value="${x.value}">${x.label}</option>`).join("");
  }

  function initTrendChart(){
    const canvas = document.getElementById("trendChart");
    if (!canvas) return;
    if (!window.Chart) return;
    if (trendChart) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    trendChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [{
          label: "Trend",
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
        scales: { x: { display: true }, y: { display: true } }
      }
    });
  }

  function resetTrend(){
    trendBuf.labels = [];
    trendBuf.values = [];
    if (trendChart) {
      trendChart.data.labels = [];
      trendChart.data.datasets[0].data = [];
      trendChart.update();
    }
    if (trendEmptyEl) trendEmptyEl.hidden = true;
  }

  function pushTrendPoint(label, value){
    if (value === null || value === undefined) return;

    trendBuf.labels.push(label);
    trendBuf.values.push(value);

    while (trendBuf.labels.length > TREND_MAX) trendBuf.labels.shift();
    while (trendBuf.values.length > TREND_MAX) trendBuf.values.shift();

    if (!trendChart) return;
    trendChart.data.labels = trendBuf.labels.slice();
    trendChart.data.datasets[0].data = trendBuf.values.slice();
    trendChart.update();
  }

  function pickTrendValueFromTelemetry(msg, metricKey){
    const channels = msg?.channels || (msg?.payload?.channels || []);
    const s = msg?.summary || {};
    const p = msg?.payload || {};

    const directMap = {
      kw:   ["kw","kw_total","total_kw","p_kw_total"],
      kvar: ["kvar","q_kvar","reactive_kvar"],
      kva:  ["kva","s_kva","apparent_kva"],
      pf:   ["pf","power_factor"],
      hz:   ["hz","freq","frequency"],
      kwh:  ["kwh","energy_kwh"],
      kwh_saved: ["kwh_saved","energy_saved_kwh"],

      v_ln1:["v1","v_l1","v_ln1","vL1N","v_l1n"],
      v_ln2:["v2","v_l2","v_ln2","vL2N","v_l2n"],
      v_ln3:["v3","v_l3","v_ln3","vL3N","v_l3n"],

      a_l1: ["a1","i1","amp1"],
      a_l2: ["a2","i2","amp2"],
      a_l3: ["a3","i3","amp3"],
    };

    const keys = directMap[metricKey];
    if (keys) {
      for (const k of keys) {
        const x = n(s[k] ?? p[k]);
        if (x !== null) return x;
      }
    }

    if (metricKey === "a_l1") return n(findChannel(channels, "in", "L1")?.a ?? findChannel(channels, "in", "L1")?.amp ?? findChannel(channels, "in", "L1")?.current);
    if (metricKey === "a_l2") return n(findChannel(channels, "in", "L2")?.a ?? findChannel(channels, "in", "L2")?.amp ?? findChannel(channels, "in", "L2")?.current);
    if (metricKey === "a_l3") return n(findChannel(channels, "in", "L3")?.a ?? findChannel(channels, "in", "L3")?.amp ?? findChannel(channels, "in", "L3")?.current);

    if (metricKey === "v_ln1") return n(findChannel(channels, "in", "L1")?.v ?? findChannel(channels, "in", "L1")?.volt ?? findChannel(channels, "in", "L1")?.voltage);
    if (metricKey === "v_ln2") return n(findChannel(channels, "in", "L2")?.v ?? findChannel(channels, "in", "L2")?.volt ?? findChannel(channels, "in", "L2")?.voltage);
    if (metricKey === "v_ln3") return n(findChannel(channels, "in", "L3")?.v ?? findChannel(channels, "in", "L3")?.volt ?? findChannel(channels, "in", "L3")?.voltage);

    return null;
  }

  async function loadTrendSeries(){
    const deviceKeySel = __selectedKey || "";
    if (!deviceKeySel) {
      setTrendStatus("Select Device (click a card/table row)");
      if (trendEmptyEl) { trendEmptyEl.hidden = false; trendEmptyEl.textContent = "Select Device first"; }
      return;
    }

    const metric = trendMetricEl?.value || "kw";
    const interval = trendIntervalEl?.value || "day";
    const from = trendFromEl?.value || "";
    const to = trendToEl?.value || "";
    const showLimits = !!trendShowLimitsEl?.checked;

    setTrendStatus("Loading...");
    if (trendEmptyEl) trendEmptyEl.hidden = true;

    const url =
      `${API_BASE}/api/series` +
      `?device=${encodeURIComponent(deviceKeySel)}` +
      `&metric=${encodeURIComponent(metric)}` +
      `&from=${encodeURIComponent(from)}` +
      `&to=${encodeURIComponent(to)}` +
      `&interval=${encodeURIComponent(interval)}` +
      `&limits=${showLimits ? "1" : "0"}`;

    resetTrend();
    initTrendChart();

    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const pts = Array.isArray(data?.points) ? data.points : [];
      if (!pts.length) {
        setTrendStatus("No data");
        if (trendEmptyEl) { trendEmptyEl.hidden = false; trendEmptyEl.textContent = "No data in selected range"; }
        return;
      }

      const labels = [];
      const values = [];
      for (const p of pts) {
        const v = n(p?.v ?? p?.value);
        if (v === null) continue;
        const t = p?.t ?? p?.time ?? "";
        labels.push(String(t).slice(0, 19).replace("T"," "));
        values.push(v);
      }

      trendBuf.labels = labels.slice(-TREND_MAX);
      trendBuf.values = values.slice(-TREND_MAX);

      trendChart.data.labels = trendBuf.labels.slice();
      trendChart.data.datasets[0].label = metric;
      trendChart.data.datasets[0].data = trendBuf.values.slice();
      trendChart.update();

      setTrendStatus("Ready");
    } catch (e) {
      setTrendStatus("Error");
      if (trendEmptyEl) { trendEmptyEl.hidden = false; trendEmptyEl.textContent = `Load failed (${String(e?.message || e)})`; }
    }
  }

  btnTrendPlot?.addEventListener("click", () => { loadTrendSeries(); });

  // ✅ refresh 버튼도 Plot처럼 동작
  btnTrendRefresh?.addEventListener("click", () => { loadTrendSeries(); });

  btnTrendExport?.addEventListener("click", () => {
    if (!trendBuf.labels.length) return;

    const rows = [["time","value"]];
    for (let i=0;i<trendBuf.labels.length;i++){
      rows.push([trendBuf.labels[i], String(trendBuf.values[i])]);
    }
    const csv = rows.map(r => r.map(x => `"${String(x).replaceAll('"','""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `trend_${(__selectedKey || "device")}_${(trendMetricEl?.value || "metric")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  });

  initTrendMetricOptions();
  initTrendChart();
  setTrendStatus("Ready");

  /* =========================================================
     ✅ Device list
  ========================================================= */
  let paused = false;
  let updateCount = 0;

  const devices = [];
  let __devicesCache = devices;

  function setApiStatus(v){
    if (apiStatusEl) apiStatusEl.textContent = v;
  }
  function setWsStatus(v){
    if (apiStatusEl) apiStatusEl.textContent = v;
  }

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

  // ✅ Trend 상단 Device dropdown 옵션 구성
  function setTrendDeviceOptions(items){
    if (!trendDeviceSel) return;
    const current = trendDeviceSel.value || "";
    const opts = [`<option value="">Select Device</option>`];
    for (const d of items) {
      const key = deviceKey(d);
      const label = deviceLabel(d);
      opts.push(`<option value="${key}">${label}</option>`);
    }
    trendDeviceSel.innerHTML = opts.join("");

    // 현재 선택 유지
    if (__selectedKey) trendDeviceSel.value = __selectedKey;
    else if (current) trendDeviceSel.value = current;
  }

  // ✅ Trend 상단 dropdown으로 선택 가능
  trendDeviceSel?.addEventListener("change", () => {
    const key = trendDeviceSel.value || "";
    if (!key) {
      selectDeviceByKey("", "");
      resetTrend();
      return;
    }
    const d = devices.find(x => deviceKey(x) === key) || null;
    selectDeviceByKey(key, d ? deviceLabel(d) : key);
    resetTrend();
  });

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
      tr.setAttribute("data-key", key);
      tr.style.cursor = "pointer";
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

  window.__monitorOnDevices__ = (items) => {
    setApiStatus("ok");

    updateCount += 1;
    if (updateCountEl) updateCountEl.textContent = String(updateCount);
    if (lastAtEl) lastAtEl.textContent = new Date().toLocaleTimeString();

    devices.length = 0;
    for (const x of (items || [])) devices.push(x);
    __devicesCache = devices;

    // ✅ Trend 드롭다운 옵션 업데이트
    setTrendDeviceOptions(devices);

    if (!__selectedKey && devices.length) {
      const d0 = devices[0];
      selectDeviceByKey(deviceKey(d0), deviceLabel(d0));
    }

    appendLog(`✅ devices updated: ${devices.length} @ ${new Date().toLocaleTimeString()}`);

    renderAutoCards(devices);
    renderDeviceTable(devices);
  };

  setApiStatus("waiting...");
  setWsStatus("WS connecting...");

  /* =========================================================
     ✅ WebSocket 실시간 연결
  ========================================================= */
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
        setWsStatus("WS connected");
        retry = 1000;
      };

      __ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }

        if (msg.type === "ping") return;
        if (msg.type !== "telemetry") return;

        const key = msg.key;
        if (!key) return;

        let selectedKey = __selectedKey || "";
        if (!selectedKey) {
          const dd = devices.find(x => deviceKey(x) === key) || null;
          selectDeviceByKey(key, dd ? deviceLabel(dd) : key);
          selectedKey = key;
        }

        const idx = devices.findIndex(d => deviceKey(d) === key);
        if (idx === -1) return;

        const d = devices[idx];

        d.payload = msg.payload || {};
        d.channels = msg.channels || (msg.payload?.channels || []);
        d.channel_count = msg.channel_count ?? (msg.payload?.channel_count ?? 0);

        if (msg.summary && typeof msg.summary === "object") {
          Object.assign(d, msg.summary);
        }

        d.age_sec = 0;
        d.online = true;

        if (msg.last_topic) d.last_topic = msg.last_topic;

        renderAutoCards(devices);
        renderDeviceTable(devices);

        updateCount += 1;
        if (updateCountEl) updateCountEl.textContent = String(updateCount);
        if (lastAtEl) lastAtEl.textContent = new Date().toLocaleTimeString();

        if (selectedKey && selectedKey === key) {
          try { updateKpiFromTelemetry(msg); } catch {}

          const metric = trendMetricEl?.value || "kw";
          const v = pickTrendValueFromTelemetry(msg, metric);
          const t = new Date().toLocaleTimeString();
          initTrendChart();
          pushTrendPoint(t, v);
        }
      };

      __ws.onclose = () => {
        if (__wsClosedByUser) return;
        setWsStatus("WS reconnecting...");
        setTimeout(connect, retry);
        retry = Math.min(10000, retry * 2);
      };

      __ws.onerror = () => {
        setWsStatus("WS error");
      };
    }

    connect();
  })();

  /* =========================================================
     ✅ Click handlers
  ========================================================= */
  const onDocClick = (e) => {
    const t = e.target;

    const copyBtn = t?.closest?.('[data-action="copy"]');
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
      return;
    }

    // ✅ 장비 선택: 카드/테이블 클릭 (버튼 제외)
    const card = t?.closest?.('[data-device-card]');
    if (card && !t?.closest?.('button')) {
      const key = card.getAttribute("data-device-card") || "";
      if (key) {
        const d = devices.find(x => deviceKey(x) === key) || null;
        selectDeviceByKey(key, d ? deviceLabel(d) : key);
        resetTrend();
      }
    }

    const row = t?.closest?.("tr[data-key]");
    if (row && !t?.closest?.('button')) {
      const key = row.getAttribute("data-key") || "";
      if (key) {
        const d = devices.find(x => deviceKey(x) === key) || null;
        selectDeviceByKey(key, d ? deviceLabel(d) : key);
        resetTrend();
      }
    }
  };
  document.addEventListener("click", onDocClick);

  window.__viewCleanup__ = () => {
    try { document.removeEventListener("click", onDocClick); } catch {}
    try { if (window.__monitorOnDevices__) delete window.__monitorOnDevices__; } catch {}

    try {
      __wsClosedByUser = true;
      __ws && __ws.close();
    } catch {}
    __ws = null;

    try { trendChart && trendChart.destroy && trendChart.destroy(); } catch {}
    trendChart = null;

    try { if (typeof prevCleanup === "function") prevCleanup(); } catch {}
  };
})();