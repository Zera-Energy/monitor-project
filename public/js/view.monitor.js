// /js/view.monitor.js
(() => {
  const $ = (id) => document.getElementById(id);

  const apiStatusEl = $("mqttWsStatus");
  const lastAtEl = $("mqttLastAt");
  const updateCountEl = $("mqttMsgCount");
  const logEl = $("mqttLog");
  const btnPauseLog = $("btnPauseLog");
  const btnClearLog = $("btnClearLog");
  const autoGrid = $("mqttAutoGrid");

  const deviceTbody = $("deviceTbody");

  const deviceOnlineDotEl = $("deviceOnlineDot");
  const deviceOnlineTextEl = $("deviceOnlineText");
  const deviceLastUpdateTextEl = $("deviceLastUpdateText");

  let __selectedKey = "";
  let __selectedLabel = "";

  const trendDeviceSel = $("trendDeviceSel");
  const btnTrendRefresh = $("btnTrendRefresh");
  const trendLocationTextEl = $("trendLocationText");

  const trendMetricEl = $("trendMetric");
  const trendIntervalEl = $("trendInterval");
  const trendFromEl = $("trendFrom");
  const trendToEl = $("trendTo");
  const trendShowLimitsEl = $("trendShowLimits");
  const trendStatusEl = $("trendStatus");
  const btnTrendPlot = $("btnTrendPlot");
  const btnTrendExport = $("btnTrendExport");
  const trendExportMenu = $("trendExportMenu");
  const trendEmptyEl = $("trendEmpty");

  const energyTrendIntervalEl = $("energyTrendInterval");
  const energyTrendDateEl = $("energyTrendDate");
  const btnEnergyTrendExport = $("btnEnergyTrendExport");
  const energyTrendExportMenu = $("energyTrendExportMenu");

  const energyCostIntervalEl = $("energyCostInterval");
  const energyCostDateEl = $("energyCostDate");
  const btnEnergyCostExport = $("btnEnergyCostExport");
  const energyCostExportMenu = $("energyCostExportMenu");

  const energyHistIntervalEl = $("energyHistInterval");
  const energyHistFromEl = $("energyHistFrom");
  const energyHistToEl = $("energyHistTo");
  const btnEnergyHistExport = $("btnEnergyHistExport");
  const energyHistExportMenu = $("energyHistExportMenu");

  const prevCleanup = window.__viewCleanup__;

  const API_BASE = window.API_BASE || "http://127.0.0.1:8000";
  const OFFLINE_SEC = 30;
  const TREND_MAX = 240;
  const ENERGY_RATE_THB = 4.2;

  const ALERT_LIMITS = {
    voltageHigh: 250,
    currentHigh: 100,
    pfLow: 0.80,
    thdHigh: 10,
  };

  const ALERT_COOLDOWN_MS = 15000;

  const ALERTS_STORAGE_KEY = "monitor_alerts_v1";
  const ACTIVE_PROJECT_KEY = "pm_active_project_v1";

  function safe(v) {
    return (v === undefined || v === null || v === "") ? "-" : String(v);
  }

  function n(v) {
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  }

  function nowTime() {
    return new Date().toLocaleTimeString("en-GB", { hour12: false });
  }

  function nowMs() {
    return Date.now();
  }

  function formatDateTime(ts) {
    if (!ts) return "-";
    const d = new Date(ts);

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");

    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  }

  function calcAgeSec(lastSeenAt) {
    if (!lastSeenAt) return Infinity;
    return Math.max(0, Math.floor((nowMs() - Number(lastSeenAt)) / 1000));
  }

  function refreshDeviceLiveState(d) {
    if (!d) return d;

    const age = calcAgeSec(d.last_seen_at);
    d.age_sec = Number.isFinite(age) ? age : null;
    d.online = age <= OFFLINE_SEC;

    return d;
  }

  function loadAlertsFromStorage() {
    try {
      const raw = localStorage.getItem(ALERTS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveAlertsToStorage(list) {
    try {
      localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(list || []));
    } catch {}
  }

  function getActiveProject() {
    try {
      const raw = localStorage.getItem(ACTIVE_PROJECT_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function showBrowserAlert(alert) {
    try {
      if (!("Notification" in window)) return;
      if (Notification.permission !== "granted") return;

      const title = `🚨 ${alert.code || "Device Alert"}`;
      const body =
        `${alert.label || alert.key || "Device"}\n` +
        `${alert.message || ""}`;

      const notif = new Notification(title, {
        body,
        icon: "/favicon.ico",
        tag: alert.code || "alert",
      });

      setTimeout(() => {
        try { notif.close(); } catch {}
      }, 8000);
    } catch {}
  }

  function safeFileName(v) {
    return String(v || "")
      .trim()
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, "_");
  }

  function closeMenu(menuEl) {
    if (!menuEl) return;
    menuEl.hidden = true;
  }

  function closeAllExportMenus() {
    closeMenu(trendExportMenu);
    closeMenu(energyTrendExportMenu);
    closeMenu(energyCostExportMenu);
    closeMenu(energyHistExportMenu);
  }

  function toggleMenu(menuEl) {
    if (!menuEl) return;
    const willOpen = menuEl.hidden;
    closeAllExportMenus();
    menuEl.hidden = !willOpen;
  }

  function setTrendStatus(v) {
    if (trendStatusEl) trendStatusEl.textContent = v;
  }

  function setApiStatus(v) {
    if (apiStatusEl) apiStatusEl.textContent = v;
  }

  function setWsStatus(v) {
    if (apiStatusEl) apiStatusEl.textContent = v;
  }

  function setDeviceLiveStatus(isOnline, timeText, ageSec) {
    if (deviceOnlineDotEl) {
      deviceOnlineDotEl.style.background = isOnline ? "#22c55e" : "#ef4444";
    }

    if (deviceOnlineTextEl) {
      deviceOnlineTextEl.style.fontWeight = "800";
      deviceOnlineTextEl.style.color = isOnline ? "#16a34a" : "#dc2626";

      if (ageSec === undefined || ageSec === null || !Number.isFinite(ageSec)) {
        deviceOnlineTextEl.textContent = isOnline ? "Online" : "Offline";
      } else {
        deviceOnlineTextEl.textContent = isOnline
          ? `Online (${ageSec}s ago)`
          : `Offline (${ageSec}s ago)`;
      }
    }

    if (deviceLastUpdateTextEl) {
      deviceLastUpdateTextEl.textContent = timeText || "-";
    }
  }

  function renderSelectedDeviceStatus(d) {
    if (!deviceOnlineDotEl || !deviceOnlineTextEl || !deviceLastUpdateTextEl) return;

    if (!d) {
      if (deviceOnlineDotEl) deviceOnlineDotEl.style.background = "#9ca3af";
      if (deviceOnlineTextEl) {
        deviceOnlineTextEl.textContent = "No device selected";
        deviceOnlineTextEl.style.fontWeight = "700";
        deviceOnlineTextEl.style.color = "#6b7280";
      }
      if (deviceLastUpdateTextEl) deviceLastUpdateTextEl.textContent = "-";
      return;
    }

    refreshDeviceLiveState(d);
    setDeviceLiveStatus(
      !!d.online,
      formatDateTime(d.last_seen_at),
      d.age_sec
    );
  }

  function setDefaultMiniDates() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const ymd = `${yyyy}-${mm}-${dd}`;

    if (energyTrendDateEl && !energyTrendDateEl.value) energyTrendDateEl.value = ymd;
    if (energyCostDateEl && !energyCostDateEl.value) energyCostDateEl.value = ymd;
    if (energyHistFromEl && !energyHistFromEl.value) energyHistFromEl.value = ymd;
    if (energyHistToEl && !energyHistToEl.value) energyHistToEl.value = ymd;
  }

  function initKpiPlaceholders() {
    const t = nowTime();

    setTile("tileV12", "VOLTAGE L1–L2", "-", "V", t);
    setTile("tileV23", "VOLTAGE L2–L3", "-", "V", t);
    setTile("tileV31", "VOLTAGE L3–L1", "-", "V", t);

    setTile("tileA1", "CURRENT PHASE 1", "-", "A", t);
    setTile("tileA2", "CURRENT PHASE 2", "-", "A", t);
    setTile("tileA3", "CURRENT PHASE 3", "-", "A", t);

    setTile("tileKW1", "POWER PHASE 1", "-", "kW", t);
    setTile("tileKW2", "POWER PHASE 2", "-", "kW", t);
    setTile("tileKW3", "POWER PHASE 3", "-", "kW", t);
    setTile("tileKWt", "TOTAL POWER", "-", "kW", t);
    setTile("tileKvar", "REACTIVE POWER", "-", "kVAr", t);

    setTile("tileKva", "APPARENT POWER", "-", "kVA", t);
    setTile("tileHz", "FREQUENCY", "-", "Hz", t);
    setTile("tilePF", "POWER FACTOR", "-", "PF", t);

    setTile("tileTHDb", "THD BEFORE", "-", "%", "Before K-Save");
    setTile("tileTHDa", "THD AFTER", "-", "%", "With K-Save");

    setTile("tileKwh", "ENERGY", "-", "kWh", t);
    setTile("tileSaved", "ENERGY SAVED", "-", "kWh", t);
    setTile("tileCO2", "CO₂ SAVED", "-", "kg", t);
  }

  let paused = false;

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
    if (updateCountEl) updateCountEl.textContent = "0";
    if (lastAtEl) lastAtEl.textContent = "-";
  });

  function deviceKey(d) {
    if (!d) return "";
    if (d.device_topic) return String(d.device_topic);
    if (d.topic) return String(d.topic);
    if (d._raw_topic) return String(d._raw_topic);
    if (d.country || d.site_id || d.model || d.device_id) {
      return `${d.country}/${d.site_id}/${d.model}/${d.device_id}`;
    }
    return String(d.id ?? "");
  }

  function deviceLabel(d) {
    return String(d?.device_display ?? d?.device_short ?? deviceKey(d));
  }

  function selectDeviceByKey(key, label) {
    __selectedKey = String(key || "");
    __selectedLabel = String(label || __selectedKey || "");

    if (trendDeviceSel) {
      trendDeviceSel.value = __selectedKey || "";
    }

    try {
      const d = devices.find((x) => deviceKey(x) === __selectedKey) || null;
      const loc =
        d?.site_name ??
        d?.site ??
        d?.location ??
        d?.place ??
        d?.site_id ??
        d?.country ??
        "-";

      if (trendLocationTextEl) trendLocationTextEl.textContent = String(loc || "-");

      renderSelectedDeviceStatus(d);
    } catch {
      if (trendLocationTextEl) trendLocationTextEl.textContent = "-";
      renderSelectedDeviceStatus(null);
    }

    try {
      setTrendStatus(__selectedKey ? `Selected: ${__selectedLabel}` : "Ready");
    } catch {}
  }

  function setTile(id, title, valueText, unit, sub) {
    const el = document.getElementById(id);
    if (!el) return;

    const raw = (valueText === undefined || valueText === null || valueText === "") ? "-" : String(valueText);
    const hasValue = raw !== "-" && raw !== "NaN";

    const vText = hasValue ? raw : "NO DATA";
    const subText = hasValue ? `● LIVE ${sub || "-"}` : "Waiting telemetry...";

    el.innerHTML = `
      <div class="t">${title}</div>
      <div class="v">
        ${vText}${hasValue && unit ? `<span class="u">${unit}</span>` : ""}
      </div>
      <div class="s">${subText}</div>
    `;

    if (!hasValue) el.classList.add("kpiNoData");
    else el.classList.remove("kpiNoData");

    el.classList.remove("kpiUpdated");
    void el.offsetWidth;
    el.classList.add("kpiUpdated");
  }

  function pickSummaryNumber(msg, keys) {
    for (const k of keys) {
      const v = msg?.summary?.[k] ?? msg?.payload?.[k];
      const x = Number(v);
      if (Number.isFinite(x)) return x;
    }
    return null;
  }

  function findChannel(channels, term, phase) {
    if (!Array.isArray(channels)) return null;
    return channels.find((c) => {
      const t = String(c?.term ?? "").toLowerCase();
      const p = String(c?.phase ?? c?.ph ?? "").toUpperCase();
      return t === String(term).toLowerCase() && p === String(phase).toUpperCase();
    }) || null;
  }

  function findVll(channels, phase) {
    if (!Array.isArray(channels)) return null;
    const want = String(phase).toUpperCase();
    return channels.find((c) => {
      const p = String(c?.phase ?? c?.ph ?? "").toUpperCase();
      const name = String(c?.name ?? c?.metric ?? "").toUpperCase();
      const term = String(c?.term ?? "").toUpperCase();
      return p === want || name.includes(want) || term.includes(want);
    }) || null;
  }

  function updateKpiFromTelemetry(msg) {
    const nowText = nowTime();
    const channels = msg?.channels || (msg?.payload?.channels || []);

    const v12 = pickSummaryNumber(msg, ["v12", "v_l1l2", "v_ll12"]) ??
      n(findVll(channels, "L1-L2")?.v ?? findVll(channels, "L1-L2")?.volt ?? findVll(channels, "L1-L2")?.voltage);

    const v23 = pickSummaryNumber(msg, ["v23", "v_l2l3", "v_ll23"]) ??
      n(findVll(channels, "L2-L3")?.v ?? findVll(channels, "L2-L3")?.volt ?? findVll(channels, "L2-L3")?.voltage);

    const v31 = pickSummaryNumber(msg, ["v31", "v_l3l1", "v_ll31"]) ??
      n(findVll(channels, "L3-L1")?.v ?? findVll(channels, "L3-L1")?.volt ?? findVll(channels, "L3-L1")?.voltage);

    setTile("tileV12", "VOLTAGE L1–L2", v12 !== null ? v12.toFixed(2) : "-", "V", nowText);
    setTile("tileV23", "VOLTAGE L2–L3", v23 !== null ? v23.toFixed(2) : "-", "V", nowText);
    setTile("tileV31", "VOLTAGE L3–L1", v31 !== null ? v31.toFixed(2) : "-", "V", nowText);

    const a1 = pickSummaryNumber(msg, ["a1", "i1", "amp1"]) ??
      n(findChannel(channels, "in", "L1")?.a ?? findChannel(channels, "in", "L1")?.amp ?? findChannel(channels, "in", "L1")?.current);

    const a2 = pickSummaryNumber(msg, ["a2", "i2", "amp2"]) ??
      n(findChannel(channels, "in", "L2")?.a ?? findChannel(channels, "in", "L2")?.amp ?? findChannel(channels, "in", "L2")?.current);

    const a3 = pickSummaryNumber(msg, ["a3", "i3", "amp3"]) ??
      n(findChannel(channels, "in", "L3")?.a ?? findChannel(channels, "in", "L3")?.amp ?? findChannel(channels, "in", "L3")?.current);

    setTile("tileA1", "CURRENT PHASE 1", a1 !== null ? a1.toFixed(2) : "-", "A", nowText);
    setTile("tileA2", "CURRENT PHASE 2", a2 !== null ? a2.toFixed(2) : "-", "A", nowText);
    setTile("tileA3", "CURRENT PHASE 3", a3 !== null ? a3.toFixed(2) : "-", "A", nowText);

    const kw1 = pickSummaryNumber(msg, ["kw1", "p1_kw"]) ??
      n(findChannel(channels, "in", "L1")?.kw ?? findChannel(channels, "in", "L1")?.p_kw ?? findChannel(channels, "in", "L1")?.power_kw ?? findChannel(channels, "in", "L1")?.p);

    const kw2 = pickSummaryNumber(msg, ["kw2", "p2_kw"]) ??
      n(findChannel(channels, "in", "L2")?.kw ?? findChannel(channels, "in", "L2")?.p_kw ?? findChannel(channels, "in", "L2")?.power_kw ?? findChannel(channels, "in", "L2")?.p);

    const kw3 = pickSummaryNumber(msg, ["kw3", "p3_kw"]) ??
      n(findChannel(channels, "in", "L3")?.kw ?? findChannel(channels, "in", "L3")?.p_kw ?? findChannel(channels, "in", "L3")?.power_kw ?? findChannel(channels, "in", "L3")?.p);

    const kwt = pickSummaryNumber(msg, ["kw", "kw_total", "p_kw_total", "total_kw"]);
    const kvar = pickSummaryNumber(msg, ["kvar", "q_kvar", "reactive_kvar"]);
    const kva = pickSummaryNumber(msg, ["kva", "s_kva", "apparent_kva"]);
    const hz = pickSummaryNumber(msg, ["hz", "freq", "frequency"]);
    const pf = pickSummaryNumber(msg, ["pf", "power_factor"]);

    setTile("tileKW1", "POWER PHASE 1", kw1 !== null ? kw1.toFixed(2) : "-", "kW", nowText);
    setTile("tileKW2", "POWER PHASE 2", kw2 !== null ? kw2.toFixed(2) : "-", "kW", nowText);
    setTile("tileKW3", "POWER PHASE 3", kw3 !== null ? kw3.toFixed(2) : "-", "kW", nowText);
    setTile("tileKWt", "TOTAL POWER", kwt !== null ? kwt.toFixed(2) : "-", "kW", nowText);
    setTile("tileKvar", "REACTIVE POWER", kvar !== null ? kvar.toFixed(2) : "-", "kVAr", nowText);

    setTile("tileKva", "APPARENT POWER", kva !== null ? kva.toFixed(2) : "-", "kVA", nowText);
    setTile("tileHz", "FREQUENCY", hz !== null ? hz.toFixed(2) : "-", "Hz", nowText);
    setTile("tilePF", "POWER FACTOR", pf !== null ? pf.toFixed(2) : "-", "PF", nowText);

    const thdb = pickSummaryNumber(msg, ["thd_before", "thd_b", "thdBefore"]);
    const thda = pickSummaryNumber(msg, ["thd_after", "thd_a", "thdAfter"]);

    setTile("tileTHDb", "THD BEFORE", thdb !== null ? thdb.toFixed(2) : "-", "%", "Before K-Save");
    setTile("tileTHDa", "THD AFTER", thda !== null ? thda.toFixed(2) : "-", "%", "With K-Save");

    const kwh = pickSummaryNumber(msg, ["kwh", "energy_kwh"]);
    const saved = pickSummaryNumber(msg, ["kwh_saved", "energy_saved_kwh"]);
    const co2 = pickSummaryNumber(msg, ["co2_saved", "co2_kg", "co2"]);

    setTile("tileKwh", "ENERGY", kwh !== null ? kwh.toFixed(2) : "-", "kWh", nowText);
    setTile("tileSaved", "ENERGY SAVED", saved !== null ? saved.toFixed(2) : "-", "kWh", nowText);
    setTile("tileCO2", "CO₂ SAVED", co2 !== null ? co2.toFixed(2) : "-", "kg", nowText);
  }

  let trendChart = null;
  let energyTrendChart = null;
  let energyCostChart = null;
  let energyHistChart = null;

  const trendBuf = { labels: [], values: [] };
  const energyTrendBuf = { labels: [], values: [] };
  const energyCostBuf = { labels: [], values: [] };
  const energyHistBuf = { labels: [], values: [] };

  const alerts = loadAlertsFromStorage();
  const alertCooldownMap = new Map();
  window.__monitorAlerts__ = alerts;

  function pushAlert({ key, label = "", level = "warn", code, message, value = null }) {
    const now = nowMs();
    const keyText = String(key || "").trim();
    const codeText = String(code || "").trim();
    if (!keyText || !codeText) return;

    const dedupeKey = `${keyText}__${codeText}`;
    const last = alertCooldownMap.get(dedupeKey) || 0;

    if (now - last < ALERT_COOLDOWN_MS) return;
    alertCooldownMap.set(dedupeKey, now);

    const item = {
      id: `${dedupeKey}__${now}`,
      time: now,
      key: keyText,
      label: String(label || keyText),
      level,
      code: codeText,
      message: String(message || ""),
      value,
      ack: false,
    };

    alerts.unshift(item);
    if (alerts.length > 200) alerts.length = 200;

    window.__monitorAlerts__ = alerts;
    saveAlertsToStorage(alerts);
    showBrowserAlert(item);

    const icon = level === "danger" ? "🚨" : level === "warn" ? "⚠️" : "ℹ️";
    appendLog(`${icon} ALERT [${codeText}] ${item.label} - ${item.message}`);
  }

  function checkAlertsFromTelemetry(msg, deviceObj) {
    const key = deviceKey(deviceObj) || msg?.key || "";
    if (!key) return;

    const label = deviceLabel(deviceObj) || key;
    const channels = msg?.channels || (msg?.payload?.channels || []);

    const v12 = pickSummaryNumber(msg, ["v12", "v_l1l2", "v_ll12"]) ??
      n(findVll(channels, "L1-L2")?.v ?? findVll(channels, "L1-L2")?.volt ?? findVll(channels, "L1-L2")?.voltage);

    const v23 = pickSummaryNumber(msg, ["v23", "v_l2l3", "v_ll23"]) ??
      n(findVll(channels, "L2-L3")?.v ?? findVll(channels, "L2-L3")?.volt ?? findVll(channels, "L2-L3")?.voltage);

    const v31 = pickSummaryNumber(msg, ["v31", "v_l3l1", "v_ll31"]) ??
      n(findVll(channels, "L3-L1")?.v ?? findVll(channels, "L3-L1")?.volt ?? findVll(channels, "L3-L1")?.voltage);

    const a1 = pickSummaryNumber(msg, ["a1", "i1", "amp1"]) ??
      n(findChannel(channels, "in", "L1")?.a ?? findChannel(channels, "in", "L1")?.amp ?? findChannel(channels, "in", "L1")?.current);

    const a2 = pickSummaryNumber(msg, ["a2", "i2", "amp2"]) ??
      n(findChannel(channels, "in", "L2")?.a ?? findChannel(channels, "in", "L2")?.amp ?? findChannel(channels, "in", "L2")?.current);

    const a3 = pickSummaryNumber(msg, ["a3", "i3", "amp3"]) ??
      n(findChannel(channels, "in", "L3")?.a ?? findChannel(channels, "in", "L3")?.amp ?? findChannel(channels, "in", "L3")?.current);

    const pf = pickSummaryNumber(msg, ["pf", "power_factor"]);

    const thdb = pickSummaryNumber(msg, ["thd_before", "thd_b", "thdBefore"]);
    const thda = pickSummaryNumber(msg, ["thd_after", "thd_a", "thdAfter"]);

    if (v12 !== null && v12 > ALERT_LIMITS.voltageHigh) {
      pushAlert({
        key,
        label,
        level: "danger",
        code: "HIGH_VOLTAGE_L12",
        message: `Voltage L1-L2 is high (${v12.toFixed(2)} V)`,
        value: v12,
      });
    }

    if (v23 !== null && v23 > ALERT_LIMITS.voltageHigh) {
      pushAlert({
        key,
        label,
        level: "danger",
        code: "HIGH_VOLTAGE_L23",
        message: `Voltage L2-L3 is high (${v23.toFixed(2)} V)`,
        value: v23,
      });
    }

    if (v31 !== null && v31 > ALERT_LIMITS.voltageHigh) {
      pushAlert({
        key,
        label,
        level: "danger",
        code: "HIGH_VOLTAGE_L31",
        message: `Voltage L3-L1 is high (${v31.toFixed(2)} V)`,
        value: v31,
      });
    }

    if (a1 !== null && a1 > ALERT_LIMITS.currentHigh) {
      pushAlert({
        key,
        label,
        level: "danger",
        code: "OVER_CURRENT_L1",
        message: `Current L1 is high (${a1.toFixed(2)} A)`,
        value: a1,
      });
    }

    if (a2 !== null && a2 > ALERT_LIMITS.currentHigh) {
      pushAlert({
        key,
        label,
        level: "danger",
        code: "OVER_CURRENT_L2",
        message: `Current L2 is high (${a2.toFixed(2)} A)`,
        value: a2,
      });
    }

    if (a3 !== null && a3 > ALERT_LIMITS.currentHigh) {
      pushAlert({
        key,
        label,
        level: "danger",
        code: "OVER_CURRENT_L3",
        message: `Current L3 is high (${a3.toFixed(2)} A)`,
        value: a3,
      });
    }

    if (pf !== null && pf < ALERT_LIMITS.pfLow) {
      pushAlert({
        key,
        label,
        level: "warn",
        code: "LOW_POWER_FACTOR",
        message: `Power factor is low (${pf.toFixed(2)})`,
        value: pf,
      });
    }

    if (thdb !== null && thdb > ALERT_LIMITS.thdHigh) {
      pushAlert({
        key,
        label,
        level: "warn",
        code: "HIGH_THD_BEFORE",
        message: `THD Before is high (${thdb.toFixed(2)} %)`,
        value: thdb,
      });
    }

    if (thda !== null && thda > ALERT_LIMITS.thdHigh) {
      pushAlert({
        key,
        label,
        level: "warn",
        code: "HIGH_THD_AFTER",
        message: `THD After is high (${thda.toFixed(2)} %)`,
        value: thda,
      });
    }
  }

  function initTrendMetricOptions() {
    if (!trendMetricEl) return;

    const items = [
      { value: "v_ln1", label: "Voltage LN1 (V)" },
      { value: "v_ln2", label: "Voltage LN2 (V)" },
      { value: "v_ln3", label: "Voltage LN3 (V)" },
      { value: "a_l1", label: "Current L1 (A)" },
      { value: "a_l2", label: "Current L2 (A)" },
      { value: "a_l3", label: "Current L3 (A)" },
      { value: "kw", label: "Active Power (kW)" },
      { value: "kvar", label: "Reactive Power (kVAr)" },
      { value: "kva", label: "Apparent Power (kVA)" },
      { value: "pf", label: "Power Factor" },
      { value: "hz", label: "Frequency (Hz)" },
      { value: "kwh", label: "Energy (kWh)" },
      { value: "kwh_saved", label: "Energy Saved (kWh)" },
    ];

    trendMetricEl.innerHTML = items.map((x) => `<option value="${x.value}">${x.label}</option>`).join("");
  }

  function initTrendChart() {
    const canvas = document.getElementById("trendChart");
    if (!canvas || !window.Chart || trendChart) return;

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

  function initEnergyTrendChart() {
    const canvas = document.getElementById("energyTrendChart");
    if (!canvas || !window.Chart || energyTrendChart) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    energyTrendChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [{
          label: "Energy Trend (KWH)",
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

  function initEnergyCostChart() {
    const canvas = document.getElementById("energyCostChart");
    if (!canvas || !window.Chart || energyCostChart) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    energyCostChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [{
          label: "Energy Cost (THB)",
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

  function initEnergyHistChart() {
    const canvas = document.getElementById("energyHistChart");
    if (!canvas || !window.Chart || energyHistChart) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    energyHistChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [{
          label: "Energy Historical (KWH)",
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

  function renderEnergyTrendChart() {
    initEnergyTrendChart();
    if (!energyTrendChart) return;

    energyTrendChart.data.labels = energyTrendBuf.labels.slice();
    energyTrendChart.data.datasets[0].data = energyTrendBuf.values.slice();
    energyTrendChart.update();
  }

  function renderEnergyCostChart() {
    initEnergyCostChart();
    if (!energyCostChart) return;

    energyCostChart.data.labels = energyCostBuf.labels.slice();
    energyCostChart.data.datasets[0].data = energyCostBuf.values.slice();
    energyCostChart.update();
  }

  function renderEnergyHistChart() {
    initEnergyHistChart();
    if (!energyHistChart) return;

    energyHistChart.data.labels = energyHistBuf.labels.slice();
    energyHistChart.data.datasets[0].data = energyHistBuf.values.slice();
    energyHistChart.update();
  }

  function resetTrend() {
    trendBuf.labels = [];
    trendBuf.values = [];
    if (trendChart) {
      trendChart.data.labels = [];
      trendChart.data.datasets[0].data = [];
      trendChart.update();
    }
    if (trendEmptyEl) trendEmptyEl.hidden = true;
  }

  function pushTrendPoint(label, value) {
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

  function pickTrendValueFromTelemetry(msg, metricKey) {
    const channels = msg?.channels || (msg?.payload?.channels || []);
    const s = msg?.summary || {};
    const p = msg?.payload || {};

    const directMap = {
      kw: ["kw", "kw_total", "total_kw", "p_kw_total"],
      kvar: ["kvar", "q_kvar", "reactive_kvar"],
      kva: ["kva", "s_kva", "apparent_kva"],
      pf: ["pf", "power_factor"],
      hz: ["hz", "freq", "frequency"],
      kwh: ["kwh", "energy_kwh"],
      kwh_saved: ["kwh_saved", "energy_saved_kwh"],

      v_ln1: ["v1", "v_l1", "v_ln1", "vL1N", "v_l1n"],
      v_ln2: ["v2", "v_l2", "v_ln2", "vL2N", "v_l2n"],
      v_ln3: ["v3", "v_l3", "v_ln3", "vL3N", "v_l3n"],

      a_l1: ["a1", "i1", "amp1"],
      a_l2: ["a2", "i2", "amp2"],
      a_l3: ["a3", "i3", "amp3"],
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

  async function loadTrendSeries() {
    const deviceKeySel = __selectedKey || "";
    if (!deviceKeySel) {
      setTrendStatus("Select Device (click a table row)");
      if (trendEmptyEl) {
        trendEmptyEl.hidden = false;
        trendEmptyEl.textContent = "Select Device first";
      }
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
        if (trendEmptyEl) {
          trendEmptyEl.hidden = false;
          trendEmptyEl.textContent = "No data in selected range";
        }
        return;
      }

      const labels = [];
      const values = [];
      for (const p of pts) {
        const v = n(p?.v ?? p?.value);
        if (v === null) continue;
        const t = p?.t ?? p?.time ?? "";
        labels.push(String(t).slice(0, 19).replace("T", " "));
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
      if (trendEmptyEl) {
        trendEmptyEl.hidden = false;
        trendEmptyEl.textContent = `Load failed (${String(e?.message || e)})`;
      }
    }
  }

  async function loadEnergyTrendSeries() {
    const deviceKeySel = __selectedKey || "";
    if (!deviceKeySel) return;

    const interval = energyTrendIntervalEl?.value || "day";
    const date = energyTrendDateEl?.value || "";

    energyTrendBuf.labels = [];
    energyTrendBuf.values = [];
    renderEnergyTrendChart();

    try {
      let from = "";
      let to = "";

      if (date) {
        from = `${date}T00:00:00`;
        to = `${date}T23:59:59`;
      }

      const url =
        `${API_BASE}/api/series` +
        `?device=${encodeURIComponent(deviceKeySel)}` +
        `&metric=${encodeURIComponent("kwh")}` +
        `&interval=${encodeURIComponent(interval)}` +
        `&from=${encodeURIComponent(from)}` +
        `&to=${encodeURIComponent(to)}`;

      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const pts = Array.isArray(data?.points) ? data.points : [];

      if (!pts.length) {
        renderEnergyTrendChart();
        return;
      }

      const labels = [];
      const values = [];

      for (const p of pts) {
        const v = n(p?.v ?? p?.value);
        if (v === null) continue;

        const rawTime = String(p?.t ?? p?.time ?? "");
        let label = rawTime;

        if (interval === "hour") {
          label = rawTime.slice(11, 16) || rawTime;
        } else if (interval === "day") {
          label = rawTime.slice(0, 10) || rawTime;
        } else if (interval === "month") {
          label = rawTime.slice(0, 7) || rawTime;
        }

        labels.push(label);
        values.push(v);
      }

      energyTrendBuf.labels = labels.slice(-TREND_MAX);
      energyTrendBuf.values = values.slice(-TREND_MAX);

      renderEnergyTrendChart();
    } catch (e) {
      console.error("loadEnergyTrendSeries failed:", e);
      renderEnergyTrendChart();
    }
  }

  async function loadEnergyCostSeries() {
    const deviceKeySel = __selectedKey || "";
    if (!deviceKeySel) return;

    const interval = energyCostIntervalEl?.value || "day";
    const date = energyCostDateEl?.value || "";

    energyCostBuf.labels = [];
    energyCostBuf.values = [];
    renderEnergyCostChart();

    try {
      let from = "";
      let to = "";

      if (date) {
        from = `${date}T00:00:00`;
        to = `${date}T23:59:59`;
      }

      const url =
        `${API_BASE}/api/series` +
        `?device=${encodeURIComponent(deviceKeySel)}` +
        `&metric=${encodeURIComponent("kwh")}` +
        `&interval=${encodeURIComponent(interval)}` +
        `&from=${encodeURIComponent(from)}` +
        `&to=${encodeURIComponent(to)}`;

      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const pts = Array.isArray(data?.points) ? data.points : [];

      if (!pts.length) {
        renderEnergyCostChart();
        return;
      }

      const labels = [];
      const values = [];

      for (const p of pts) {
        const kwh = n(p?.v ?? p?.value);
        if (kwh === null) continue;

        const rawTime = String(p?.t ?? p?.time ?? "");
        let label = rawTime;

        if (interval === "hour") {
          label = rawTime.slice(11, 16) || rawTime;
        } else if (interval === "day") {
          label = rawTime.slice(0, 10) || rawTime;
        } else if (interval === "month") {
          label = rawTime.slice(0, 7) || rawTime;
        }

        labels.push(label);
        values.push(Number((kwh * ENERGY_RATE_THB).toFixed(2)));
      }

      energyCostBuf.labels = labels.slice(-TREND_MAX);
      energyCostBuf.values = values.slice(-TREND_MAX);

      renderEnergyCostChart();
    } catch (e) {
      console.error("loadEnergyCostSeries failed:", e);
      renderEnergyCostChart();
    }
  }

  async function loadEnergyHistSeries() {
    const deviceKeySel = __selectedKey || "";
    if (!deviceKeySel) return;

    const interval = energyHistIntervalEl?.value || "hour";
    const fromDate = energyHistFromEl?.value || "";
    const toDate = energyHistToEl?.value || "";

    energyHistBuf.labels = [];
    energyHistBuf.values = [];
    renderEnergyHistChart();

    try {
      const from = fromDate ? `${fromDate}T00:00:00` : "";
      const to = toDate ? `${toDate}T23:59:59` : "";

      const url =
        `${API_BASE}/api/series` +
        `?device=${encodeURIComponent(deviceKeySel)}` +
        `&metric=${encodeURIComponent("kwh")}` +
        `&interval=${encodeURIComponent(interval)}` +
        `&from=${encodeURIComponent(from)}` +
        `&to=${encodeURIComponent(to)}`;

      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const pts = Array.isArray(data?.points) ? data.points : [];

      if (!pts.length) {
        renderEnergyHistChart();
        return;
      }

      const labels = [];
      const values = [];

      for (const p of pts) {
        const v = n(p?.v ?? p?.value);
        if (v === null) continue;

        const rawTime = String(p?.t ?? p?.time ?? "");
        let label = rawTime;

        if (interval === "hour") {
          label = rawTime.slice(0, 16).replace("T", " ") || rawTime;
        } else if (interval === "day") {
          label = rawTime.slice(0, 10) || rawTime;
        } else if (interval === "month") {
          label = rawTime.slice(0, 7) || rawTime;
        }

        labels.push(label);
        values.push(v);
      }

      energyHistBuf.labels = labels.slice(-TREND_MAX);
      energyHistBuf.values = values.slice(-TREND_MAX);

      renderEnergyHistChart();
    } catch (e) {
      console.error("loadEnergyHistSeries failed:", e);
      renderEnergyHistChart();
    }
  }

  function buildTrendRows() {
    const metric = trendMetricEl?.value || "metric";
    const interval = trendIntervalEl?.value || "";
    const from = trendFromEl?.value || "";
    const to = trendToEl?.value || "";
    const exportedAt = new Date().toLocaleString("ko-KR");

    const rows = [];
    rows.push(["Device", __selectedKey || ""]);
    rows.push(["Label", __selectedLabel || ""]);
    rows.push(["Metric", metric]);
    rows.push(["Interval", interval]);
    rows.push(["From", from]);
    rows.push(["To", to]);
    rows.push(["Exported At", exportedAt]);
    rows.push([]);
    rows.push(["time", "device", "metric", "value"]);

    for (let i = 0; i < trendBuf.labels.length; i++) {
      rows.push([
        trendBuf.labels[i],
        __selectedKey || "",
        metric,
        trendBuf.values[i],
      ]);
    }

    return rows;
  }

  function buildMiniRows(title, metric, labels, values, extraInfo = []) {
    const rows = [];
    rows.push(["Device", __selectedKey || ""]);
    rows.push(["Label", __selectedLabel || ""]);
    rows.push(["Card", title]);
    rows.push(["Metric", metric || ""]);
    rows.push(["Exported At", new Date().toLocaleString("ko-KR")]);

    for (const row of extraInfo) rows.push(row);

    rows.push([]);
    rows.push(["time", "device", "metric", "value"]);

    for (let i = 0; i < labels.length; i++) {
      rows.push([
        labels[i],
        __selectedKey || "",
        metric || "",
        values[i],
      ]);
    }

    return rows;
  }

  function exportRowsAsCsv(rows, fileBase) {
    const csv = rows
      .map((r) => r.map((x) => `"${String(x ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fileBase}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  function exportRowsAsXlsx(rows, fileBase, sheetName = "Sheet1") {
    if (!window.XLSX) {
      alert("XLSX library not loaded");
      return;
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [
      { wch: 22 },
      { wch: 24 },
      { wch: 18 },
      { wch: 14 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${fileBase}.xlsx`);
  }

  function exportMiniBuffer({
    title,
    metric,
    labels,
    values,
    format,
    fileBase,
    extraInfo = [],
    sheetName = "Sheet1",
  }) {
    if (!labels.length || !values.length) {
      alert("No data to export");
      return;
    }

    const rows = buildMiniRows(title, metric, labels, values, extraInfo);

    if (format === "csv") {
      exportRowsAsCsv(rows, fileBase);
      return;
    }

    exportRowsAsXlsx(rows, fileBase, sheetName);
  }

  function exportTrendAsCsv() {
    if (!trendBuf.labels.length) {
      alert("No data to export");
      return;
    }

    const rows = buildTrendRows();
    const metric = trendMetricEl?.value || "metric";
    const safeDevice = safeFileName(__selectedKey || "device");
    const safeMetric = safeFileName(metric);

    const csv = rows
      .map((r) => r.map((x) => `"${String(x ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `trend_${safeDevice}_${safeMetric}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  function exportTrendAsXlsx() {
    if (!trendBuf.labels.length) {
      alert("No data to export");
      return;
    }

    if (!window.XLSX) {
      alert("XLSX library not loaded");
      return;
    }

    const rows = buildTrendRows();
    const metric = trendMetricEl?.value || "metric";
    const safeDevice = safeFileName(__selectedKey || "device");
    const safeMetric = safeFileName(metric);

    const ws = XLSX.utils.aoa_to_sheet(rows);

    ws["!cols"] = [
      { wch: 22 },
      { wch: 24 },
      { wch: 18 },
      { wch: 14 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Trend");
    XLSX.writeFile(wb, `trend_${safeDevice}_${safeMetric}.xlsx`);
  }

  btnTrendPlot?.addEventListener("click", () => { loadTrendSeries(); });
  btnTrendRefresh?.addEventListener("click", () => { loadTrendSeries(); });

  energyTrendIntervalEl?.addEventListener("change", () => {
    loadEnergyTrendSeries();
  });
  energyTrendDateEl?.addEventListener("change", () => {
    loadEnergyTrendSeries();
  });

  energyCostIntervalEl?.addEventListener("change", () => {
    loadEnergyCostSeries();
  });
  energyCostDateEl?.addEventListener("change", () => {
    loadEnergyCostSeries();
  });

  energyHistIntervalEl?.addEventListener("change", () => {
    loadEnergyHistSeries();
  });
  energyHistFromEl?.addEventListener("change", () => {
    loadEnergyHistSeries();
  });
  energyHistToEl?.addEventListener("change", () => {
    loadEnergyHistSeries();
  });

  btnTrendExport?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu(trendExportMenu);
  });

  trendExportMenu?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-format]");
    if (!btn) return;

    const format = btn.getAttribute("data-format");
    if (format === "csv") exportTrendAsCsv();
    else exportTrendAsXlsx();

    closeMenu(trendExportMenu);
  });

  btnEnergyTrendExport?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu(energyTrendExportMenu);
  });

  energyTrendExportMenu?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-format]");
    if (!btn) return;

    const format = btn.getAttribute("data-format");
    exportMiniBuffer({
      title: "Energy Trend (KWH)",
      metric: "kwh",
      labels: energyTrendBuf.labels,
      values: energyTrendBuf.values,
      format,
      fileBase: `energy_trend_${safeFileName(__selectedKey || "device")}`,
      extraInfo: [
        ["Interval", energyTrendIntervalEl?.value || ""],
        ["Date", energyTrendDateEl?.value || ""],
      ],
      sheetName: "EnergyTrend",
    });

    closeMenu(energyTrendExportMenu);
  });

  btnEnergyCostExport?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu(energyCostExportMenu);
  });

  energyCostExportMenu?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-format]");
    if (!btn) return;

    const format = btn.getAttribute("data-format");
    exportMiniBuffer({
      title: "Energy Cost (THB)",
      metric: "thb",
      labels: energyCostBuf.labels,
      values: energyCostBuf.values,
      format,
      fileBase: `energy_cost_${safeFileName(__selectedKey || "device")}`,
      extraInfo: [
        ["Interval", energyCostIntervalEl?.value || ""],
        ["Date", energyCostDateEl?.value || ""],
        ["Rate THB/kWh", ENERGY_RATE_THB],
      ],
      sheetName: "EnergyCost",
    });

    closeMenu(energyCostExportMenu);
  });

  btnEnergyHistExport?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu(energyHistExportMenu);
  });

  energyHistExportMenu?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-format]");
    if (!btn) return;

    const format = btn.getAttribute("data-format");
    exportMiniBuffer({
      title: "Energy Historical (KWH)",
      metric: "kwh",
      labels: energyHistBuf.labels,
      values: energyHistBuf.values,
      format,
      fileBase: `energy_historical_${safeFileName(__selectedKey || "device")}`,
      extraInfo: [
        ["Interval", energyHistIntervalEl?.value || ""],
        ["From", energyHistFromEl?.value || ""],
        ["To", energyHistToEl?.value || ""],
      ],
      sheetName: "EnergyHistorical",
    });

    closeMenu(energyHistExportMenu);
  });

  initTrendMetricOptions();
  initTrendChart();
  initEnergyTrendChart();
  initEnergyCostChart();
  initEnergyHistChart();
  setTrendStatus("Ready");
  initKpiPlaceholders();
  setDefaultMiniDates();

  let updateCount = 0;

  const devices = [];
  let __devicesCache = devices;
  let liveStateTimer = null;
  let __activeProjectApplied = false;

  function setTrendDeviceOptions(items) {
    if (!trendDeviceSel) return;
    const current = trendDeviceSel.value || "";
    const opts = [`<option value="">Select Device</option>`];
    for (const d of items) {
      const key = deviceKey(d);
      const label = deviceLabel(d);
      opts.push(`<option value="${key}">${label}</option>`);
    }
    trendDeviceSel.innerHTML = opts.join("");

    if (__selectedKey) trendDeviceSel.value = __selectedKey;
    else if (current) trendDeviceSel.value = current;
  }

  function applyActiveProjectSelection() {
    if (__activeProjectApplied) return false;

    const project = getActiveProject();
    if (!project) return false;

    const meters = Array.isArray(project.meters) ? project.meters : [];
    if (!meters.length) return false;

    for (const meter of meters) {
      const target = String(meter || "").trim();
      if (!target) continue;

      const found = devices.find((x) => deviceKey(x) === target) || null;
      if (!found) continue;

      selectDeviceByKey(deviceKey(found), deviceLabel(found));
      resetTrend();
      initKpiPlaceholders();
      loadEnergyTrendSeries();
      loadEnergyCostSeries();
      loadEnergyHistSeries();

      __activeProjectApplied = true;
      return true;
    }

    return false;
  }

  function startLiveStateTicker() {
    if (liveStateTimer) clearInterval(liveStateTimer);

    liveStateTimer = setInterval(() => {
      for (const d of devices) {
        const wasOnline = !!d.online;
        refreshDeviceLiveState(d);

        if (wasOnline && !d.online) {
          pushAlert({
            key: deviceKey(d),
            label: deviceLabel(d),
            level: "danger",
            code: "DEVICE_OFFLINE",
            message: `Device went offline (${safe(deviceLabel(d))})`,
          });
        }
      }

      renderDeviceTable(devices);

      if (__selectedKey) {
        const d = devices.find((x) => deviceKey(x) === __selectedKey) || null;
        renderSelectedDeviceStatus(d);
      }
    }, 1000);
  }

  trendDeviceSel?.addEventListener("change", () => {
    const key = trendDeviceSel.value || "";
    if (!key) {
      __activeProjectApplied = true;
      selectDeviceByKey("", "");
      resetTrend();
      initKpiPlaceholders();
      return;
    }
    const d = devices.find((x) => deviceKey(x) === key) || null;
    __activeProjectApplied = true;
    selectDeviceByKey(key, d ? deviceLabel(d) : key);
    resetTrend();
    initKpiPlaceholders();
    loadEnergyTrendSeries();
    loadEnergyCostSeries();
    loadEnergyHistSeries();
  });

  function renderAutoCards(items) {
    if (!autoGrid) return;
  }

  function renderDeviceTable(items) {
    if (!deviceTbody) return;
    deviceTbody.innerHTML = "";

    if (!items.length) {
      deviceTbody.innerHTML = `<tr><td colspan="6" class="empty">No data available in table</td></tr>`;
      return;
    }

    items.forEach((d, idx) => {
      refreshDeviceLiveState(d);

      const key = deviceKey(d);
      const online = !!d.online;
      const ageText = Number.isFinite(d.age_sec) ? `${d.age_sec}s` : "-";

      const tr = document.createElement("tr");
      tr.setAttribute("data-key", key);
      tr.style.cursor = "pointer";
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td style="font-weight:900;">${safe(deviceLabel(d))}</td>
        <td>${safe(d.last_type || "meter")}</td>
        <td style="max-width:360px; word-break:break-all;">${safe(d.last_topic ?? d.device_topic ?? d.topic)}</td>
        <td>${ageText}</td>
        <td>${online ? "🟢 Online" : "🔴 Offline"}</td>
      `;
      deviceTbody.appendChild(tr);
    });
  }

  window.__monitorOnDevices__ = (items) => {
    setApiStatus("ok");

    updateCount += 1;
    if (updateCountEl) updateCountEl.textContent = String(updateCount);
    if (lastAtEl) lastAtEl.textContent = nowTime();

    devices.length = 0;
    for (const x of (items || [])) {
      const d = { ...x };

      if (!d.last_seen_at) {
        const ageSec = Number(d.age_sec);
        if (Number.isFinite(ageSec) && ageSec >= 0) {
          d.last_seen_at = nowMs() - (ageSec * 1000);
        }
      }

      refreshDeviceLiveState(d);
      devices.push(d);
    }
    __devicesCache = devices;

    setTrendDeviceOptions(devices);

    const applied = applyActiveProjectSelection();

    if (!applied) {
      if (!__selectedKey && devices.length) {
        const d0 = devices[0];
        selectDeviceByKey(deviceKey(d0), deviceLabel(d0));
        initKpiPlaceholders();
        loadEnergyTrendSeries();
        loadEnergyCostSeries();
        loadEnergyHistSeries();
      } else if (__selectedKey) {
        const selected = devices.find((x) => deviceKey(x) === __selectedKey) || null;
        renderSelectedDeviceStatus(selected);
      }
    }

    appendLog(`✅ devices updated: ${devices.length} @ ${nowTime()}`);

    renderAutoCards(devices);
    renderDeviceTable(devices);
  };

  setApiStatus("waiting...");
  setWsStatus("WS connecting...");
  renderSelectedDeviceStatus(null);
  startLiveStateTicker();

  let __ws = null;
  let __wsClosedByUser = false;

  (function initWebSocket() {
    const WS_BASE =
      (window.WS_BASE) ||
      (API_BASE.startsWith("https")
        ? API_BASE.replace("https", "wss")
        : API_BASE.replace("http", "ws"));

    const wsUrl = `${WS_BASE}/ws/telemetry`;

    let retry = 1000;

    function connect() {
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
          const dd = devices.find((x) => deviceKey(x) === key) || null;
          selectDeviceByKey(key, dd ? deviceLabel(dd) : key);
          selectedKey = key;
          initKpiPlaceholders();
          loadEnergyTrendSeries();
          loadEnergyCostSeries();
          loadEnergyHistSeries();
        }

        const idx = devices.findIndex((d) => deviceKey(d) === key);
        if (idx === -1) return;

        const d = devices[idx];

        d.payload = msg.payload || {};
        d.channels = msg.channels || (msg.payload?.channels || []);
        d.channel_count = msg.channel_count ?? (msg.payload?.channel_count ?? 0);

        if (msg.summary && typeof msg.summary === "object") {
          Object.assign(d, msg.summary);
        }

        d.last_seen_at = nowMs();
        d.age_sec = 0;
        d.online = true;

        if (msg.last_topic) d.last_topic = msg.last_topic;

        renderAutoCards(devices);
        renderDeviceTable(devices);

        updateCount += 1;
        if (updateCountEl) updateCountEl.textContent = String(updateCount);
        if (lastAtEl) lastAtEl.textContent = nowTime();

        try { checkAlertsFromTelemetry(msg, d); } catch {}

        if (selectedKey && selectedKey === key) {
          renderSelectedDeviceStatus(d);

          try { updateKpiFromTelemetry(msg); } catch {}

          const metric = trendMetricEl?.value || "kw";
          const v = pickTrendValueFromTelemetry(msg, metric);
          const t = nowTime();
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

  const onDocClick = (e) => {
    const t = e.target;

    if (
      trendExportMenu &&
      !trendExportMenu.hidden &&
      !t.closest("#btnTrendExport") &&
      !t.closest("#trendExportMenu")
    ) {
      closeMenu(trendExportMenu);
    }

    if (
      energyTrendExportMenu &&
      !energyTrendExportMenu.hidden &&
      !t.closest("#btnEnergyTrendExport") &&
      !t.closest("#energyTrendExportMenu")
    ) {
      closeMenu(energyTrendExportMenu);
    }

    if (
      energyCostExportMenu &&
      !energyCostExportMenu.hidden &&
      !t.closest("#btnEnergyCostExport") &&
      !t.closest("#energyCostExportMenu")
    ) {
      closeMenu(energyCostExportMenu);
    }

    if (
      energyHistExportMenu &&
      !energyHistExportMenu.hidden &&
      !t.closest("#btnEnergyHistExport") &&
      !t.closest("#energyHistExportMenu")
    ) {
      closeMenu(energyHistExportMenu);
    }

    const row = t?.closest?.("tr[data-key]");
    if (row && !t?.closest?.("button")) {
      const key = row.getAttribute("data-key") || "";
      if (key) {
        const d = devices.find((x) => deviceKey(x) === key) || null;
        __activeProjectApplied = true;
        selectDeviceByKey(key, d ? deviceLabel(d) : key);
        resetTrend();
        initKpiPlaceholders();
        loadEnergyTrendSeries();
        loadEnergyCostSeries();
        loadEnergyHistSeries();
      }
    }
  };
  document.addEventListener("click", onDocClick);

  window.__viewCleanup__ = () => {
    try { document.removeEventListener("click", onDocClick); } catch {}
    try { if (window.__monitorOnDevices__) delete window.__monitorOnDevices__; } catch {}

    try {
      if (liveStateTimer) {
        clearInterval(liveStateTimer);
        liveStateTimer = null;
      }
    } catch {}

    try {
      __wsClosedByUser = true;
      __ws && __ws.close();
    } catch {}
    __ws = null;

    try { trendChart && trendChart.destroy && trendChart.destroy(); } catch {}
    trendChart = null;

    try { energyTrendChart && energyTrendChart.destroy && energyTrendChart.destroy(); } catch {}
    energyTrendChart = null;

    try { energyCostChart && energyCostChart.destroy && energyCostChart.destroy(); } catch {}
    energyCostChart = null;

    try { energyHistChart && energyHistChart.destroy && energyHistChart.destroy(); } catch {}
    energyHistChart = null;

    try { if (typeof prevCleanup === "function") prevCleanup(); } catch {}
  };
})();