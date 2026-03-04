// /js/view.monitor.js
(() => {
  const $ = (id) => document.getElementById(id);

  const btnOpen = $("btnDevicesOverview");
  const back = $("devOvBack");
  const modal = $("devOvModal");

  const logEl = $("mqttLog");

  // ✅ mqttWsStatus는 계속 사용 (API/WS 상태 표시)
  const apiStatusEl = $("mqttWsStatus");

  const lastAtEl = $("mqttLastAt");
  const updateCountEl = $("mqttMsgCount");
  const btnPauseLog = $("btnPauseLog");
  const btnClearLog = $("btnClearLog");
  const autoGrid = $("mqttAutoGrid");

  const devOvFilterSel = $("devOvFilterSel");
  const devOvCount = $("devOvCount");
  const devOvContent = $("devOvContent");

  // ✅ selDevice 삭제됨 (HTML에서 제거했으니 JS도 제거)
  const deviceTbody = $("deviceTbody");

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

  // ✅ 선택된 장비 key를 JS에서 관리
  let __selectedKey = "";
  let __selectedLabel = "";

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
     ✅ Selection helper (selDevice 대신)
  ========================================================= */
  function setSelectedDevice(key, label, { scrollToKpi = false } = {}){
    const k = String(key || "");
    if (!k) return;

    const changed = (__selectedKey !== k);
    __selectedKey = k;
    __selectedLabel = String(label || k);

    // 상세 패널 반영 + trend 리셋
    try { renderDetailPanelBySelected(__devicesCache); } catch {}
    if (changed) {
      try { resetTrend(); } catch {}
      setTrendStatus("Ready");
    }

    // UI 강조(선택 표시)
    try { highlightSelected(); } catch {}

    if (scrollToKpi) {
      try { document.getElementById("kpiBoard")?.scrollIntoView({ behavior: "smooth", block: "start" }); } catch {}
    }
  }

  function highlightSelected(){
    // Auto cards highlight
    if (autoGrid) {
      autoGrid.querySelectorAll("[data-device-card]").forEach(el => {
        const k = el.getAttribute("data-device-card") || "";
        if (k && k === __selectedKey) el.classList.add("is-selected");
        else el.classList.remove("is-selected");
      });
    }

    // Table rows highlight
    if (deviceTbody) {
      deviceTbody.querySelectorAll("tr[data-device-row]").forEach(tr => {
        const k = tr.getAttribute("data-device-row") || "";
        if (k && k === __selectedKey) tr.classList.add("is-selected");
        else tr.classList.remove("is-selected");
      });
    }

    // Overview items highlight
    if (devOvContent) {
      devOvContent.querySelectorAll("[data-devov-item]").forEach(el => {
        const k = el.getAttribute("data-devov-item") || "";
        if (k && k === __selectedKey) el.classList.add("is-selected");
        else el.classList.remove("is-selected");
      });
    }
  }

  /* =========================================================
     ✅ KPI BOARD helpers (사진 스타일 타일 채우기)
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

  // voltage line-to-line는 term/phase가 제각각인 경우가 있어서 넓게 탐색
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

    // -------- Voltage (L-L)
    const v12 = pickSummaryNumber(msg, ["v12","v_l1l2","v_ll12"]) ??
                n(findVll(channels, "L1-L2")?.v ?? findVll(channels, "L1-L2")?.volt ?? findVll(channels, "L1-L2")?.voltage);

    const v23 = pickSummaryNumber(msg, ["v23","v_l2l3","v_ll23"]) ??
                n(findVll(channels, "L2-L3")?.v ?? findVll(channels, "L2-L3")?.volt ?? findVll(channels, "L2-L3")?.voltage);

    const v31 = pickSummaryNumber(msg, ["v31","v_l3l1","v_ll31"]) ??
                n(findVll(channels, "L3-L1")?.v ?? findVll(channels, "L3-L1")?.volt ?? findVll(channels, "L3-L1")?.voltage);

    setTile("tileV12", "VOLTAGE L1–L2", v12 !== null ? v12.toFixed(2) : "-", "V", nowText);
    setTile("tileV23", "VOLTAGE L2–L3", v23 !== null ? v23.toFixed(2) : "-", "V", nowText);
    setTile("tileV31", "VOLTAGE L3–L1", v31 !== null ? v31.toFixed(2) : "-", "V", nowText);

    // -------- Current (A)
    const a1 = pickSummaryNumber(msg, ["a1","i1","amp1"]) ??
               n(findChannel(channels, "in", "L1")?.a ?? findChannel(channels, "in", "L1")?.amp ?? findChannel(channels, "in", "L1")?.current);

    const a2 = pickSummaryNumber(msg, ["a2","i2","amp2"]) ??
               n(findChannel(channels, "in", "L2")?.a ?? findChannel(channels, "in", "L2")?.amp ?? findChannel(channels, "in", "L2")?.current);

    const a3 = pickSummaryNumber(msg, ["a3","i3","amp3"]) ??
               n(findChannel(channels, "in", "L3")?.a ?? findChannel(channels, "in", "L3")?.amp ?? findChannel(channels, "in", "L3")?.current);

    setTile("tileA1", "CURRENT PHASE 1", a1 !== null ? a1.toFixed(2) : "-", "A", nowText);
    setTile("tileA2", "CURRENT PHASE 2", a2 !== null ? a2.toFixed(2) : "-", "A", nowText);
    setTile("tileA3", "CURRENT PHASE 3", a3 !== null ? a3.toFixed(2) : "-", "A", nowText);

    // -------- Power (kW / kvar / kva / hz / pf)
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

    // -------- THD / Energy & Savings
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
     ✅ Trend Chart (상단 Trend Chart)
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
      { value: "pf",    label: "Power Factor (PF)" },
      { value: "hz",    label: "Frequency (Hz)" },
      { value: "kwh",   label: "Energy (kWh)" },
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
      setTrendStatus("Select Device");
      if (trendEmptyEl) { trendEmptyEl.hidden = false; trendEmptyEl.textContent = "Select a device by clicking a card/table row"; }
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
      trendChart.data.datasets[0].label = `${metric} (${__selectedLabel || __selectedKey})`;
      trendChart.data.datasets[0].data = trendBuf.values.slice();
      trendChart.update();

      setTrendStatus("Ready");
    } catch (e) {
      setTrendStatus("Error");
      if (trendEmptyEl) { trendEmptyEl.hidden = false; trendEmptyEl.textContent = `Load failed (${String(e?.message || e)})`; }
    }
  }

  btnTrendPlot?.addEventListener("click", () => { loadTrendSeries(); });

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

  // 초기 세팅
  initTrendMetricOptions();
  initTrendChart();
  setTrendStatus("Ready");

  /* =========================================================
     ✅ Selected device detail panel (유지, anchor만 변경)
  ========================================================= */
  function ensureDetailPanel(){
    let el = document.getElementById("monDetailPanel");
    if (el) return el;

    // selDevice 없으니 toolbar 아래에 붙이자
    const toolbar = document.querySelector(".monitorView .toolbar");
    const anchor = toolbar || document.getElementById("kpiBoard") || document.body;

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

    // toolbar 다음에 넣기
    if (anchor === toolbar) toolbar.insertAdjacentElement("afterend", el);
    else anchor.insertAdjacentElement("beforebegin", el);

    return el;
  }

  function renderDetailPanelBySelected(devices){
    ensureDetailPanel();
    const title = document.getElementById("monDetailTitle");
    const tbody = document.getElementById("monDetailTbody");
    const savingMain = document.getElementById("monSavingMain");
    const savingSub = document.getElementById("monSavingSub");

    if (!title || !tbody) return;

    const key = __selectedKey || "";
    const d = devices.find(x => deviceKey(x) === key) || null;

    if (!d) {
      title.textContent = "-";
      tbody.innerHTML = `<tr><td colspan="5" class="muted" style="padding:10px;">Select a device (click a card/table row)</td></tr>`;
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

  /* =========================================================
     ✅ Device list / overview (기존 유지)
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

  function ensureAutoCard(key) {
    if (!autoGrid) return null;
    let card = autoGrid.querySelector(`[data-device-card="${key}"]`);
    if (card) return card;

    card = document.createElement("div");
    card.className = "contentCard";
    card.setAttribute("data-device-card", key);
    card.style.cursor = "pointer";

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

    highlightSelected();
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
      tr.setAttribute("data-device-row", key);
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

    highlightSelected();
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
      const key = deviceKey(d);
      const online = (d.online !== undefined) ? !!d.online : (d.age_sec < ONLINE_SEC);

      const el = document.createElement("div");
      el.className = "contentCard";
      el.style.marginBottom = "10px";
      el.style.cursor = "pointer";
      el.setAttribute("data-devov-item", key);

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

    highlightSelected();
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

    // ✅ 선택된 장비가 없으면 첫 번째 장비 자동 선택
    if (!__selectedKey && devices.length) {
      const d0 = devices[0];
      setSelectedDevice(deviceKey(d0), deviceLabel(d0));
    } else {
      // 선택된 key가 사라졌으면 첫 번째로
      const exists = __selectedKey && devices.some(d => deviceKey(d) === __selectedKey);
      if (!exists && devices.length) {
        const d0 = devices[0];
        setSelectedDevice(deviceKey(d0), deviceLabel(d0));
      }
    }

    renderAutoCards(devices);
    renderDeviceTable(devices);
    renderDevOv();

    try { renderDetailPanelBySelected(devices); } catch {}
  };

  setApiStatus("waiting...");
  setWsStatus("WS connecting...");

  /* =========================================================
     ✅ WebSocket 실시간 연결
     - 선택된 장비의 telemetry면: KPI 타일 업데이트 + TrendChart(실시간) 업데이트
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
        try { renderDetailPanelBySelected(devices); } catch {}

        updateCount += 1;
        if (updateCountEl) updateCountEl.textContent = String(updateCount);
        if (lastAtEl) lastAtEl.textContent = new Date().toLocaleTimeString();

        // ✅ 선택 장비만 KPI/Trend 실시간 반영
        if (__selectedKey && __selectedKey === key) {
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
     ✅ Devices Overview Modal (기존)
  ========================================================= */
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

  /* =========================================================
     ✅ Click handlers (선택 기능 추가)
     - Auto card 클릭 / Device table 행 클릭 / Overview item 클릭
  ========================================================= */
  const onDocClick = (e) => {
    const t = e.target;

    if (t?.closest('[data-action="close-devov"]')) closeDevOv();
    if (t?.id === "devOvBack") closeDevOv();

    // Copy button
    const copyBtn = t?.closest('[data-action="copy"]');
    if (copyBtn) {
      e.preventDefault();
      e.stopPropagation();
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

    // Auto cards click
    const card = t?.closest?.("[data-device-card]");
    if (card) {
      const key = card.getAttribute("data-device-card") || "";
      const d = devices.find(x => deviceKey(x) === key);
      setSelectedDevice(key, deviceLabel(d || { device_topic:key }), { scrollToKpi: true });
      return;
    }

    // Device table row click
    const row = t?.closest?.("tr[data-device-row]");
    if (row) {
      const key = row.getAttribute("data-device-row") || "";
      const d = devices.find(x => deviceKey(x) === key);
      setSelectedDevice(key, deviceLabel(d || { device_topic:key }), { scrollToKpi: true });
      return;
    }

    // Overview item click
    const ov = t?.closest?.("[data-devov-item]");
    if (ov) {
      const key = ov.getAttribute("data-devov-item") || "";
      const d = devices.find(x => deviceKey(x) === key);
      setSelectedDevice(key, deviceLabel(d || { device_topic:key }), { scrollToKpi: true });
      closeDevOv();
      return;
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