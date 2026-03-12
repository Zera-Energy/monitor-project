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

  const btnPrev = $("notiPrev");
  const btnNext = $("notiNext");
  const pageInfoEl = $("notiPageInfo");

  const sumCritical = $("sumCritical");
  const sumWarning = $("sumWarning");
  const sumActive = $("sumActive");
  const sumTotal = $("sumTotal");

  const prevCleanup = window.__viewCleanup__;
  const ALERTS_STORAGE_KEY = "monitor_alerts_v1";

  let renderTimer = null;

  let sortState = {
    key: "time",
    dir: "desc",
  };

  let currentPage = 1;
  const PAGE_SIZE = 20;

  let summaryFilter = "all";

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

  function calcAgeSec(ts) {
    const ms = toTimeMs(ts);
    if (!ms) return Number.MAX_SAFE_INTEGER;
    return Math.max(0, Math.floor((nowMs() - ms) / 1000));
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
    const fallbackId = `alert_${idx}_${toTimeMs(alert?.time) || 0}`;
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

  function matchesSummaryFilter(alert) {
    if (!summaryFilter || summaryFilter === "all") return true;
    if (summaryFilter === "active") return !alert.ack;
    return true;
  }

  function severityRank(level) {
    if (level === "danger") return 3;
    if (level === "warn") return 2;
    return 1;
  }

  function statusRank(alert) {
    return alert.ack ? 2 : 1;
  }

  function compareValues(a, b) {
    if (typeof a === "number" && typeof b === "number") {
      return a - b;
    }
    return String(a).localeCompare(String(b));
  }

  function sortAlerts(list) {
    const dirMul = sortState.dir === "asc" ? 1 : -1;

    return list.slice().sort((a, b) => {
      let va;
      let vb;

      switch (sortState.key) {
        case "severity":
          va = severityRank(a.level);
          vb = severityRank(b.level);
          break;
        case "device":
          va = String(a.label || a.key || "").toLowerCase();
          vb = String(b.label || b.key || "").toLowerCase();
          break;
        case "code":
          va = String(a.code || "").toLowerCase();
          vb = String(b.code || "").toLowerCase();
          break;
        case "type":
          va = detectType(a.code, a.message);
          vb = detectType(b.code, b.message);
          break;
        case "message":
          va = String(a.message || "").toLowerCase();
          vb = String(b.message || "").toLowerCase();
          break;
        case "value":
          va = typeof a.value === "number" ? a.value : Number(a.value);
          vb = typeof b.value === "number" ? b.value : Number(b.value);
          va = Number.isFinite(va) ? va : Number.NEGATIVE_INFINITY;
          vb = Number.isFinite(vb) ? vb : Number.NEGATIVE_INFINITY;
          break;
        case "time":
          va = toTimeMs(a.time) || 0;
          vb = toTimeMs(b.time) || 0;
          break;
        case "age":
          va = calcAgeSec(a.time);
          vb = calcAgeSec(b.time);
          break;
        case "status":
          va = statusRank(a);
          vb = statusRank(b);
          break;
        case "no":
        default:
          va = toTimeMs(a.time) || 0;
          vb = toTimeMs(b.time) || 0;
          break;
      }

      const cmp = compareValues(va, vb);
      if (cmp !== 0) return cmp * dirMul;

      const ta = toTimeMs(a.time) || 0;
      const tb = toTimeMs(b.time) || 0;
      return tb - ta;
    });
  }

  function getFilteredAlerts() {
    const src = getNormalizedAlerts();

    const severity = severityEl?.value || "all";
    const type = typeEl?.value || "all";
    const keyword = searchEl?.value || "";

    const filtered = src.filter((alert) => {
      return (
        matchesSummaryFilter(alert) &&
        matchesSeverity(alert, severity) &&
        matchesType(alert, type) &&
        matchesSearch(alert, keyword)
      );
    });

    return sortAlerts(filtered);
  }

  function updateSummary(alerts) {
    let critical = 0;
    let warning = 0;
    let active = 0;

    alerts.forEach((a) => {
      if (!a.ack) active += 1;

      if (a.level === "danger") critical += 1;
      else if (a.level === "warn") warning += 1;
    });

    if (sumCritical) sumCritical.textContent = String(critical);
    if (sumWarning) sumWarning.textContent = String(warning);
    if (sumActive) sumActive.textContent = String(active);
    if (sumTotal) sumTotal.textContent = String(alerts.length);
  }

  function updateSummarySelection() {
    const cards = document.querySelectorAll(".summaryCard");
    if (!cards.length) return;

    cards.forEach((card) => {
      const filter = card.dataset.filter || "all";
      let selected = false;

      if (filter === "danger") {
        selected = summaryFilter === "all" && (severityEl?.value || "all") === "danger";
      } else if (filter === "warn") {
        selected = summaryFilter === "all" && (severityEl?.value || "all") === "warn";
      } else if (filter === "active") {
        selected = summaryFilter === "active";
      } else if (filter === "all") {
        selected = summaryFilter === "all" && (severityEl?.value || "all") === "all";
      }

      card.classList.toggle("is-selected", selected);
    });
  }

  function renderEmpty(text) {
    if (!tbody) return;

    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="empty">${safe(text)}</td>
      </tr>
    `;
  }

  function renderSortIndicators() {
    const ths = document.querySelectorAll(".table thead th.sortable");
    if (!ths.length) return;

    ths.forEach((th) => {
      const key = th.getAttribute("data-sort");
      if (!key) return;

      const baseText = th.getAttribute("data-label") || th.textContent.trim();
      th.setAttribute("data-label", baseText);

      let mark = "";
      if (sortState.key === key) {
        mark = sortState.dir === "asc" ? " ▲" : " ▼";
      }

      th.textContent = baseText + mark;
    });
  }

  function updatePaginationUi(totalCount, totalPages) {
    if (pageInfoEl) {
      pageInfoEl.textContent = `Page ${currentPage} / ${totalPages}`;
    }

    if (btnPrev) {
      btnPrev.disabled = currentPage <= 1 || totalCount === 0;
    }

    if (btnNext) {
      btnNext.disabled = currentPage >= totalPages || totalCount === 0;
    }
  }

  function renderTable() {
    if (!tbody) return;

    const normalizedAlerts = getNormalizedAlerts();
    updateSummary(normalizedAlerts);
    updateSummarySelection();

    const allRows = getFilteredAlerts();
    const totalCount = allRows.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const start = (currentPage - 1) * PAGE_SIZE;
    const rows = allRows.slice(start, start + PAGE_SIZE);

    if (lastUpdateEl) {
      lastUpdateEl.textContent = `Last update: ${formatDateTime(nowMs())}`;
    }

    renderSortIndicators();
    updatePaginationUi(totalCount, totalPages);

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
        <tr data-alert-id="${escapeHtml(a.id)}" class="${!a.ack ? "is-active-alert" : ""}">
          <td>${start + idx + 1}</td>
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
    currentPage = 1;
    renderTable();
  }

  function clearAllAlerts() {
    const ok = window.confirm("Are you sure you want to clear all alerts?");
    if (!ok) return;

    setAlerts([]);
    currentPage = 1;
    renderTable();
  }

  function onTbodyClick(e) {
    const btn = e.target.closest('[data-action="ack"]');
    if (!btn) return;

    const id = btn.getAttribute("data-alert-id");
    if (!id) return;

    ackAlertById(id);
  }

  function onSearch() {
    currentPage = 1;
    renderTable();
  }

  function toggleSort(nextKey) {
    if (!nextKey) return;

    if (sortState.key === nextKey) {
      sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
    } else {
      sortState.key = nextKey;
      sortState.dir = nextKey === "time" || nextKey === "no" ? "desc" : "asc";
    }

    currentPage = 1;
    renderTable();
  }

  function bindSortableHeaders() {
    const ths = document.querySelectorAll(".table thead th.sortable");
    if (!ths.length) return;

    const keys = ["no", "severity", "device", "code", "type", "message", "value", "time", "age", "status"];

    ths.forEach((th, idx) => {
      if (!th.getAttribute("data-sort")) {
        th.setAttribute("data-sort", keys[idx] || "no");
      }

      const onClick = () => {
        toggleSort(th.getAttribute("data-sort"));
      };

      th.addEventListener("click", onClick);
      th.__sortClickHandler__ = onClick;
      th.style.cursor = "pointer";
      th.title = "Sort";
    });
  }

  function unbindSortableHeaders() {
    const ths = document.querySelectorAll(".table thead th.sortable");
    if (!ths.length) return;

    ths.forEach((th) => {
      if (th.__sortClickHandler__) {
        th.removeEventListener("click", th.__sortClickHandler__);
        th.__sortClickHandler__ = null;
      }
    });
  }

  function bindSummaryFilter() {
    const cards = document.querySelectorAll(".summaryCard");
    if (!cards.length) return;

    cards.forEach((card) => {
      const onClick = () => {
        const filter = card.dataset.filter || "all";

        if (filter === "danger") {
          summaryFilter = "all";
          if (severityEl) severityEl.value = "danger";
        } else if (filter === "warn") {
          summaryFilter = "all";
          if (severityEl) severityEl.value = "warn";
        } else if (filter === "active") {
          summaryFilter = "active";
          if (severityEl) severityEl.value = "all";
        } else {
          summaryFilter = "all";
          if (severityEl) severityEl.value = "all";
        }

        currentPage = 1;
        renderTable();
      };

      card.addEventListener("click", onClick);
      card.__summaryClickHandler__ = onClick;
    });
  }

  function unbindSummaryFilter() {
    const cards = document.querySelectorAll(".summaryCard");
    if (!cards.length) return;

    cards.forEach((card) => {
      if (card.__summaryClickHandler__) {
        card.removeEventListener("click", card.__summaryClickHandler__);
        card.__summaryClickHandler__ = null;
      }
    });
  }

  btnSearch?.addEventListener("click", onSearch);

  searchEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      onSearch();
    }
  });

  severityEl?.addEventListener("change", () => {
    summaryFilter = "all";
    currentPage = 1;
    renderTable();
  });

  typeEl?.addEventListener("change", () => {
    currentPage = 1;
    renderTable();
  });

  btnAskPermission?.addEventListener("click", requestBrowserPermission);
  btnClearAck?.addEventListener("click", clearAck);
  btnClearAll?.addEventListener("click", clearAllAlerts);

  btnPrev?.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage -= 1;
      renderTable();
    }
  });

  btnNext?.addEventListener("click", () => {
    const total = getFilteredAlerts().length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    if (currentPage < totalPages) {
      currentPage += 1;
      renderTable();
    }
  });

  tbody?.addEventListener("click", onTbodyClick);

  bindSortableHeaders();
  bindSummaryFilter();

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
      unbindSortableHeaders();
    } catch {}

    try {
      unbindSummaryFilter();
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