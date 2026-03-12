// /js/view.notifications.js
(() => {
  const $ = (id) => document.getElementById(id);

  const tbody = $("notiTbody");
  const severityEl = $("notiSeverity");
  const typeEl = $("notiType");
  const searchEl = $("notiSearch");
  const btnSearch = $("btnNotiSearch");
  const lastUpdateEl = $("notiLastUpdate");
  const btnAskPermission = $("btnNotiAskPermission");
  const btnClearAck = $("btnNotiClearAck");
  const btnClearAll = $("btnNotiClearAll");

  const prevCleanup = window.__viewCleanup__;
  const ALERTS_STORAGE_KEY = "monitor_alerts_v1";

  let renderTimer = null;

  function nowMs() {
    return Date.now();
  }

  function toTimeMs(ts) {
    if (ts === undefined || ts === null || ts === "") return null;

    if (typeof ts === "number" && Number.isFinite(ts)) return ts;

    const n = Number(ts);
    if (Number.isFinite(n) && String(ts).trim() !== "") return n;

    const parsed = new Date(ts).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safe(v) {
    return (v === undefined || v === null || v === "") ? "-" : escapeHtml(v);
  }

  function formatDateTime(ts) {
    const ms = toTimeMs(ts);
    if (!ms) return "-";

    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return "-";

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");

    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  }

  function calcAgeText(ts) {
    const ms = toTimeMs(ts);
    if (!ms) return "-";

    const sec = Math.max(0, Math.floor((nowMs() - ms) / 1000));

    if (sec < 60) return `${sec}s ago`;

    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;

    const hour = Math.floor(min / 60);
    if (hour < 24) return `${hour}h ago`;

    const day = Math.floor(hour / 24);
    return `${day}d ago`;
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
      localStorage.setItem(
        ALERTS_STORAGE_KEY,
        JSON.stringify(Array.isArray(list) ? list : [])
      );
    } catch {}
  }

  function getAlerts() {
    const stored = loadAlertsFromStorage();
    window.__monitorAlerts__ = stored;
    return window.__monitorAlerts__;
  }

  function setAlerts(list) {
    const next = Array.isArray(list) ? list : [];
    window.__monitorAlerts__ = next;
    saveAlertsToStorage(next);
  }

  function normalizeAlert(alert, idx) {
    const fallbackId = `alert_${idx}_${toTimeMs(alert.time) || 0}`;
    return {
      id: alert?.id ?? fallbackId,
      level: alert?.level ?? "info",
      key: alert?.key ?? "",
      label: alert?.label ?? "",
      code: alert?.code ?? "",
      message: alert?.message ?? "",
      value: alert?.value,
      time: alert?.time ?? nowMs(),
      ack: !!alert?.ack,
    };
  }

  function getNormalizedAlerts() {
    return getAlerts().map(normalizeAlert);
  }

  function updateAlerts(mutator) {
    const current = getNormalizedAlerts();
    const next = mutator(current) || current;
    setAlerts(next);
  }

  function getSeverityBadge(level) {
    if (level === "danger") return `<span class="badge danger">Critical</span>`;
    if (level === "warn") return `<span class="badge warn">Warning</span>`;
    return `<span class="badge">Info</span>`;
  }

  function detectType(code = "", message = "") {
    const c = String(code).toLowerCase();
    const m = String(message).toLowerCase();

    if (c.includes("offline") || m.includes("offline")) return "offline";
    if (c.includes("thd") || m.includes("thd")) return "thd";
    if (c.includes("pf") || m.includes("power factor")) return "pf";
    if (c.includes("voltage") || m.includes("voltage")) return "voltage";
    if (c.includes("current") || m.includes("current")) return "current";
    if (c.includes("kw") || m.includes("power")) return "kw";

    return "other";
  }

  function getStatusHtml(alert) {
    if (alert.ack) {
      return `<span class="badge ok">ACK</span>`;
    }

    return `
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <span class="badge danger-soft">Active</span>
        <button class="btn xs" type="button" data-action="ack" data-alert-id="${escapeHtml(alert.id)}">ACK</button>
      </div>
    `;
  }

  function matchesSeverity(alert, severity) {
    if (!severity || severity === "all") return true;
    return String(alert.level || "") === severity;
  }

  function matchesType(alert, type) {
    if (!type || type === "all") return true;
    return detectType(alert.code, alert.message) === type;
  }

  function matchesSearch(alert, keyword) {
    const q = String(keyword || "").trim().toLowerCase();
    if (!q) return true;

    const joined = [
      alert.key,
      alert.label,
      alert.code,
      alert.message,
      alert.value,
      detectType(alert.code, alert.message),
      alert.ack ? "ack" : "active",
    ]
      .map((v) => String(v ?? "").toLowerCase())
      .join(" ");

    return joined.includes(q);
  }

  function getFilteredAlerts() {
    const src = getNormalizedAlerts();

    const severity = severityEl?.value || "all";
    const type = typeEl?.value || "all";
    const keyword = searchEl?.value || "";

    return src
      .filter((alert) => {
        return (
          matchesSeverity(alert, severity) &&
          matchesType(alert, type) &&
          matchesSearch(alert, keyword)
        );
      })
      .sort((a, b) => (toTimeMs(b.time) || 0) - (toTimeMs(a.time) || 0));
  }

  function renderEmpty(text) {
    if (!tbody) return;

    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="empty">${safe(text)}</td>
      </tr>
    `;
  }

  function renderTable() {
    if (!tbody) return;

    const rows = getFilteredAlerts();

    if (lastUpdateEl) {
      lastUpdateEl.textContent = `Last update: ${formatDateTime(nowMs())}`;
    }

    if (!rows.length) {
      renderEmpty("No alerts found");
      return;
    }

    tbody.innerHTML = rows.map((a, idx) => {
      const type = detectType(a.code, a.message);

      let valueText = "-";
      if (a.value !== null && a.value !== undefined && a.value !== "") {
        if (typeof a.value === "number" && Number.isFinite(a.value)) {
          valueText = safe(a.value.toFixed(2));
        } else {
          valueText = safe(a.value);
        }
      }

      return `
        <tr data-alert-id="${escapeHtml(a.id)}">
          <td>${idx + 1}</td>
          <td>${getSeverityBadge(a.level)}</td>
          <td style="font-weight:800;">${safe(a.label || a.key)}</td>
          <td>${safe(a.code)}</td>
          <td>${safe(type)}</td>
          <td style="max-width:320px; word-break:break-word;">${safe(a.message)}</td>
          <td>${valueText}</td>
          <td>${formatDateTime(a.time)}</td>
          <td>${calcAgeText(a.time)}</td>
          <td>${getStatusHtml(a)}</td>
        </tr>
      `;
    }).join("");
  }

  function requestBrowserPermission() {
    if (!("Notification" in window)) {
      alert("This browser does not support notifications.");
      return;
    }

    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        alert("Browser alerts enabled.");
      } else {
        alert("Notification permission was not granted.");
      }
    });
  }

  function ackAlertById(id) {
    if (!id) return;

    updateAlerts((list) => {
      return list.map((item) => {
        if (String(item.id) === String(id)) {
          return { ...item, ack: true };
        }
        return item;
      });
    });

    renderTable();
  }

  function clearAck() {
    updateAlerts((list) => list.filter((item) => !item.ack));
    renderTable();
  }

  function clearAllAlerts() {
    const ok = window.confirm("Are you sure you want to clear all alerts?");
    if (!ok) return;

    setAlerts([]);
    renderTable();
  }

  function onTbodyClick(e) {
    const btn = e.target.closest('[data-action="ack"]');
    if (!btn) return;

    const id = btn.getAttribute("data-alert-id");
    if (!id) return;

    ackAlertById(id);
  }

  btnSearch?.addEventListener("click", renderTable);

  searchEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      renderTable();
    }
  });

  severityEl?.addEventListener("change", renderTable);
  typeEl?.addEventListener("change", renderTable);

  btnAskPermission?.addEventListener("click", requestBrowserPermission);
  btnClearAck?.addEventListener("click", clearAck);
  btnClearAll?.addEventListener("click", clearAllAlerts);

  tbody?.addEventListener("click", onTbodyClick);

  function startRenderLoop() {
    if (renderTimer) clearInterval(renderTimer);

    renderTimer = setInterval(() => {
      renderTable();
    }, 1000);
  }

  renderTable();
  startRenderLoop();

  window.__viewCleanup__ = () => {
    try {
      tbody?.removeEventListener("click", onTbodyClick);
    } catch {}

    try {
      if (renderTimer) {
        clearInterval(renderTimer);
        renderTimer = null;
      }
    } catch {}

    try {
      if (typeof prevCleanup === "function") prevCleanup();
    } catch {}
  };
})();