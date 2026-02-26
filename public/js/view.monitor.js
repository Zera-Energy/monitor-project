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

  // ✅ (수정) 배포(Vercel)에서는 window.API_BASE(Render)를 쓰고,
  // 로컬 개발 시엔 127.0.0.1로 fallback
  const API_BASE = window.API_BASE || "http://127.0.0.1:8000";
  const ONLINE_SEC = 60;

  // ✅ (권장) 배포에서 API_BASE 확인 로그 (원하면 지워도 됨)
  try {
    if (!window.API_BASE) console.warn("[monitor] window.API_BASE not set -> fallback to", API_BASE);
    else console.log("[monitor] API_BASE =", API_BASE);
  } catch {}

  function safe(v){ return (v === undefined || v === null || v === "") ? "-" : String(v); }
  function n(v){ const x = Number(v); return Number.isFinite(x) ? x : null; }
  function toFixedMaybe(v, k=2){ const x = n(v); return x===null ? v : x.toFixed(k); }

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
    const panel = ensureDetailPanel();
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
    // 선택 바뀌면 detail panel 업데이트(다음 tick에서 devices 최신으로 렌더되지만, 즉시도 한 번)
    try { renderDetailPanelBySelected(__devicesCache); } catch {}
  });

  // =========================
  // ✅ 1) Period Analysis (Select data 확장 포함)
  // =========================
  const anaStatus = $("anaStatus");
  const anaPreview = $("anaPreview");

  const anaFrom = $("anaFrom");
  const anaTo = $("anaTo");
  const anaGroup = $("anaGroup");
  const anaMetric = $("anaMetric");

  const btnLoadSeries = $("btnLoadSeries");
  const btnDownloadCsv = $("btnDownloadCsv");
  const btnDownloadXlsx = $("btnDownloadXlsx");

  // ✅ (수정) API_BASE 기준으로 변경
  const SERIES_API = `${API_BASE}/api/series`;
  const XLSX_API  = `${API_BASE}/api/report/xlsx`;

  let anaChart = null;

  // ✅ 마지막 결과(동적 series)
  let __last = { labels: [], seriesKeys: [], seriesMap: {}, rows: [] };

  (function initDefaults() {
    const today = new Date();
    const to = today.toISOString().slice(0, 10);
    const fromD = new Date(today.getTime() - 7 * 24 * 3600 * 1000);
    const from = fromD.toISOString().slice(0, 10);

    if (anaFrom && !anaFrom.value) anaFrom.value = from;
    if (anaTo && !anaTo.value) anaTo.value = to;
  })();

  (function initChart(){
    const ctx = $("anaChart")?.getContext("2d");
    if (!ctx || !window.Chart) return;

    anaChart = new Chart(ctx, {
      type: "line",
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        animation: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: true } }
      }
    });
  })();

  // ✅ Select data 팝오버(없으면 만들어줌)
  function ensureSeriesMenu(){
    let menu = document.getElementById("seriesMenu");
    if (menu) return menu;

    menu = document.createElement("div");
    menu.id = "seriesMenu";
    menu.style.position = "absolute";
    menu.style.zIndex = "9999";
    menu.style.minWidth = "240px";
    menu.style.background = "#fff";
    menu.style.border = "1px solid #ddd";
    menu.style.borderRadius = "12px";
    menu.style.boxShadow = "0 10px 30px rgba(0,0,0,.10)";
    menu.style.padding = "10px";
    menu.hidden = true;

    menu.innerHTML = `
      <div style="font-weight:900; margin-bottom:6px;">Select Series</div>

      <div class="muted" style="font-size:12px; margin-bottom:6px;">IN</div>
      <label style="display:block; margin:4px 0;"><input class="anaSeriesChk" type="checkbox" value="in_l1" checked> IN L1</label>
      <label style="display:block; margin:4px 0;"><input class="anaSeriesChk" type="checkbox" value="in_l2"> IN L2</label>
      <label style="display:block; margin:4px 0;"><input class="anaSeriesChk" type="checkbox" value="in_l3"> IN L3</label>

      <div class="muted" style="font-size:12px; margin:10px 0 6px;">OUT</div>
      <label style="display:block; margin:4px 0;"><input class="anaSeriesChk" type="checkbox" value="out_l1"> OUT L1</label>
      <label style="display:block; margin:4px 0;"><input class="anaSeriesChk" type="checkbox" value="out_l2"> OUT L2</label>
      <label style="display:block; margin:4px 0;"><input class="anaSeriesChk" type="checkbox" value="out_l3"> OUT L3</label>

      <div style="display:flex; gap:8px; margin-top:10px;">
        <button type="button" id="seriesAllIn" class="btnSmall gray" style="flex:1;">IN all</button>
        <button type="button" id="seriesAllOut" class="btnSmall gray" style="flex:1;">OUT all</button>
        <button type="button" id="seriesClose" class="btnSmall green" style="flex:1;">Close</button>
      </div>
      <div class="muted" style="font-size:11px; margin-top:8px;">
        * series 값은 서버 /api/series 가 지원해야 그래프가 나와요.
      </div>
    `;

    document.body.appendChild(menu);

    // 버튼 동작
    const setChecks = (pred) => {
      menu.querySelectorAll('input.anaSeriesChk').forEach(el => {
        el.checked = pred(el.value);
      });
    };
    menu.querySelector("#seriesAllIn")?.addEventListener("click", () => setChecks(v => v.startsWith("in_")));
    menu.querySelector("#seriesAllOut")?.addEventListener("click", () => setChecks(v => v.startsWith("out_")));
    menu.querySelector("#seriesClose")?.addEventListener("click", () => { menu.hidden = true; });

    // 바깥 클릭 닫기
    const onDoc = (e) => {
      if (menu.hidden) return;
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest("#seriesMenu")) return;
      if (t.closest("#btnSelectData")) return;
      menu.hidden = true;
    };
    document.addEventListener("click", onDoc);

    // cleanup에 제거
    const prev = window.__viewCleanup__;
    window.__viewCleanup__ = () => {
      try { document.removeEventListener("click", onDoc); } catch {}
      try { menu.remove(); } catch {}
      try { if (typeof prev === "function") prev(); } catch {}
    };

    return menu;
  }

  if (btnSelectData) {
    btnSelectData.addEventListener("click", (e) => {
      const menu = ensureSeriesMenu();
      const r = btnSelectData.getBoundingClientRect();
      menu.style.left = `${Math.max(10, r.left)}px`;
      menu.style.top = `${r.bottom + 8}px`;
      menu.hidden = !menu.hidden;
      e.preventDefault();
    });
  }

  function getSelectedSeries() {
    // ✅ menu 안 체크박스(anaSeriesChk) 읽기
    return Array.from(document.querySelectorAll(".anaSeriesChk:checked"))
      .map(el => (el.value || "").toLowerCase())
      .filter(Boolean);
  }

  async function fetchSeriesOne(meta, series) {
    const qs = new URLSearchParams({
      device: meta.deviceId || "",
      metric: meta.metric || "kwh",
      series: series || "in_l1",
      from: meta.from || "",
      to: meta.to || "",
      group: meta.group || "day",
    });

    const url = `${SERIES_API}?${qs.toString()}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error("series api failed: " + res.status);

      const data = await res.json();
      return {
        labels: data.labels || [],
        values: data.values || [],
        rows: data.rows || [],
      };
    } catch (e) {
      if (e?.name === "AbortError") {
        throw new Error("series api timeout (8s). 서버(uvicorn) 켜져있는지 확인해줘.");
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  function updateMultiChart(payload, meta){
    if (!anaChart) return;

    anaChart.data.labels = payload.labels || [];

    const metricLabel = (meta.metric || "").toUpperCase();
    const datasets = (payload.datasets || []).map(ds => ({
      label: `${metricLabel} / ${ds.series}`,
      data: ds.values || [],
      tension: 0.2
    }));

    anaChart.data.datasets = datasets;
    anaChart.update();
  }

  function rowsToCsvDynamic(labels, seriesKeys, seriesMap){
    const cols = ["t", ...seriesKeys];
    const header = cols.join(",");
    const lines = labels.map((t, i) => {
      const row = [t];
      for (const k of seriesKeys) row.push(seriesMap[k]?.[i] ?? "");
      return row.join(",");
    });
    return [header, ...lines].join("\n");
  }

  function downloadCsv(filename, text){
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadXlsxViaServer({ title, metric, series, labels, values }) {
    const res = await fetch(XLSX_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, metric, series, labels, values })
    });

    if (!res.ok) throw new Error("XLSX export failed: " + res.status);

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "period_report.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  btnLoadSeries?.addEventListener("click", async () => {
    const meta = {
      from: anaFrom?.value || "",
      to: anaTo?.value || "",
      group: anaGroup?.value || "day",
      metric: anaMetric?.value || "kwh",
      deviceId: selDevice?.value || ""
    };

    const seriesList = getSelectedSeries();
    if (!seriesList.length) {
      alert("IN/OUT L1/L2/L3 중 최소 1개 선택하세요.");
      return;
    }

    if (anaStatus) anaStatus.textContent = "Loading...";
    if (anaPreview) anaPreview.textContent = "-";

    try {
      const results = await Promise.all(
        seriesList.map(async (s) => {
          const one = await fetchSeriesOne(meta, s);
          return { s: s.toUpperCase(), labels: one.labels, values: one.values };
        })
      );

      const labels = results[0]?.labels || [];
      const seriesMap = {};
      const datasets = [];
      const seriesKeys = [];

      for (const r of results) {
        seriesMap[r.s] = r.values || [];
        datasets.push({ series: r.s, values: r.values || [] });
        seriesKeys.push(r.s);
      }

      __last = { labels, seriesKeys, seriesMap, rows: [] };

      updateMultiChart({ labels, datasets }, meta);

      const preview = labels.slice(0, 10).map((t, i) => {
        const parts = [`${t}`];
        for (const k of seriesKeys) parts.push(`${k}=${seriesMap[k]?.[i] ?? "-"}`);
        return parts.join("  →  ");
      }).join("\n");

      if (anaPreview) anaPreview.textContent = preview || "(no data)";
      if (anaStatus) anaStatus.textContent = labels.length ? "Loaded" : "No data";

    } catch (e) {
      if (anaStatus) anaStatus.textContent = "Error";
      if (anaPreview) anaPreview.textContent = String(e?.message || e);
    }
  });

  btnDownloadCsv?.addEventListener("click", () => {
    const labels = __last?.labels || [];
    const keys = __last?.seriesKeys || [];
    const map = __last?.seriesMap || {};
    if (!labels.length || !keys.length) {
      alert("No data loaded. Please click Load first.");
      return;
    }
    const csv = rowsToCsvDynamic(labels, keys, map);
    downloadCsv("period_series.csv", csv);
  });

  btnDownloadXlsx?.addEventListener("click", async () => {
    const labels = __last?.labels || [];
    const keys = __last?.seriesKeys || [];
    const map = __last?.seriesMap || {};

    if (!labels.length || !keys.length) {
      alert("No data loaded. Please click Load first.");
      return;
    }

    // XLSX는 서버가 1개 series만 받는 구조면 첫번째만 보냄
    const first = keys[0];
    const values = map[first] || [];
    const metric = anaMetric?.value || "kwh";

    try {
      if (anaStatus) anaStatus.textContent = `Exporting XLSX (${first})...`;
      await downloadXlsxViaServer({
        title: "Period Analysis",
        metric,
        series: first.toLowerCase(),
        labels,
        values
      });
      if (anaStatus) anaStatus.textContent = "XLSX downloaded";
    } catch (e) {
      if (anaStatus) anaStatus.textContent = "XLSX error";
      alert(String(e?.message || e));
    }
  });

  // =========================
  // ✅ 2) 서버(API) 기준 장비 목록 → 화면 렌더 (기존 + detail panel)
  // =========================
  let paused = false;
  let updateCount = 0;

  const devices = [];
  // 선택 변경 시 즉시 반영용
  let __devicesCache = devices;

  function setApiStatus(v){
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
  };

  setApiStatus("waiting...");

  // =========================
  // ✅ 4) WebSocket 실시간 연결 (추가)
  // =========================
  let __ws = null;
  (function initWebSocket(){
    const WS_BASE =
      (window.WS_BASE) ||
      (API_BASE.startsWith("https")
        ? API_BASE.replace("https", "wss")
        : API_BASE.replace("http", "ws"));

    const wsUrl = `${WS_BASE}/ws/telemetry`;

    let retry = 1000;

    function connect(){
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

        // ✅ payload / channels 갱신
        d.payload = msg.payload || {};
        d.channels = msg.channels || [];
        d.channel_count = msg.channel_count || 0;

        // ✅ summary 값(kw/pf/v_avg 등) 반영
        if (msg.summary && typeof msg.summary === "object") {
          Object.assign(d, msg.summary);
        }

        // ✅ online/age 갱신 (실시간 들어온 순간 온라인)
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
      };

      __ws.onclose = () => {
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

    // ✅ (추가) WebSocket 닫기
    try { __ws && __ws.close(); } catch {}
    __ws = null;

    try { if (typeof prevCleanup === "function") prevCleanup(); } catch {}
  };
})();