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

  let renderTimer = null;

  const ALERTS_STORAGE_KEY = "monitor_alerts_v1";

  function nowMs() {
    return Date.now();
  }

  function safe(v) {
    return (v === undefined || v === null || v === "") ? "-" : String(v);
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

  function calcAgeText(ts) {
    if (!ts) return "-";

    const sec = Math.max(0, Math.floor((nowMs() - Number(ts)) / 1000));

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
      localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(list || []));
    } catch {}
  }

  function getAlerts() {
    if (Array.isArray(window.__monitorAlerts__)) {
      return window.__monitorAlerts__;
    }

    const stored = loadAlertsFromStorage();
    window.__monitorAlerts__ = stored;
    return window.__monitorAlerts__;
  }

  function getAckMap() {
    if (!window.__notiAckMap__) {
      window.__notiAckMap__ = {};
    }
    return window.__notiAckMap__;
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

  function getStatusText(alert) {
    const ackMap = getAckMap();
    return ackMap[alert.id] ? "ACK" : "Active";
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
    ].map(v => String(v ?? "").toLowerCase()).join(" ");

    return joined.includes(q);
  }

  function getFilteredAlerts() {
    const src = getAlerts().slice();

    const severity = severityEl?.value || "all";
    const type = typeEl?.value || "all";
    const keyword = searchEl?.value || "";

    return src.filter(alert => {
      return (
        matchesSeverity(alert, severity) &&
        matchesType(alert, type) &&
        matchesSearch(alert, keyword)
      );
    });
  }

  function renderTable() {
    if (!tbody) return;

    const rows = getFilteredAlerts();

    if (lastUpdateEl) {
      lastUpdateEl.textContent = `Last update: ${formatDateTime(nowMs())}`;
    }

    if (!rows.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" class="empty">No alerts found</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = rows.map((a, idx) => {
      const type = detectType(a.code, a.message);
      const status = getStatusText(a);
      const valueText = a.value === null || a.value === undefined ? "-" : safe(
        typeof a.value === "number" ? a.value.toFixed(2) : a.value
      );

      return `
        <tr data-alert-id="${safe(a.id)}">
          <td>${idx + 1}</td>
          <td>${getSeverityBadge(a.level)}</td>
          <td style="font-weight:800;">${safe(a.label || a.key)}</td>
          <td>${safe(a.code)}</td>
          <td>${safe(type)}</td>
          <td style="max-width:320px; word-break:break-word;">${safe(a.message)}</td>
          <td>${valueText}</td>
          <td>${formatDateTime(a.time)}</td>
          <td>${calcAgeText(a.time)}</td>
          <td>${safe(status)}</td>
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

  function clearAck() {
    window.__notiAckMap__ = {};
    renderTable();
  }

  function clearAllAlerts() {
    if (!Array.isArray(window.__monitorAlerts__)) {
      window.__monitorAlerts__ = [];
    } else {
      window.__monitorAlerts__.length = 0;
    }

    saveAlertsToStorage([]);
    renderTable();
  }

  function ackAlertByRow(target) {
    const row = target?.closest?.("tr[data-alert-id]");
    if (!row) return false;

    const id = row.getAttribute("data-alert-id");
    if (!id) return false;

    const ackMap = getAckMap();
    ackMap[id] = true;
    renderTable();
    return true;
  }

  btnSearch?.addEventListener("click", () => {
    renderTable();
  });

  searchEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") renderTable();
  });

  severityEl?.addEventListener("change", () => {
    renderTable();
  });

  typeEl?.addEventListener("change", () => {
    renderTable();
  });

  btnAskPermission?.addEventListener("click", () => {
    requestBrowserPermission();
  });

  btnClearAck?.addEventListener("click", () => {
    clearAck();
  });

  btnClearAll?.addEventListener("click", () => {
    clearAllAlerts();
  });

  const onDocClick = (e) => {
    const ok = ackAlertByRow(e.target);
    if (ok) return;
  };
  document.addEventListener("click", onDocClick);

  function startRenderLoop() {
    if (renderTimer) clearInterval(renderTimer);

    renderTimer = setInterval(() => {
      renderTable();
    }, 1000);
  }

  renderTable();
  startRenderLoop();

  window.__viewCleanup__ = () => {
    try { document.removeEventListener("click", onDocClick); } catch {}

    try {
      if (renderTimer) {
        clearInterval(renderTimer);
        renderTimer = null;
      }
    } catch {}

    try { if (typeof prevCleanup === "function") prevCleanup(); } catch {}
  };
})();