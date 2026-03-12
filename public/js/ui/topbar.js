// /js/ui/topbar.js
import { logout } from "../lib/auth.js";

const ALERTS_STORAGE_KEY = "monitor_alerts_v1";

function safe(v) {
  return (v === undefined || v === null || v === "") ? "-" : String(v);
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
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(Array.isArray(list) ? list : []));
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

function getActiveAlerts() {
  const src = getAlerts();
  return src.filter(a => a && a.ack !== true);
}

function ackAlertById(id) {
  if (!id) return;

  const next = getAlerts().map((item) => {
    if (String(item?.id) === String(id)) {
      return { ...item, ack: true };
    }
    return item;
  });

  setAlerts(next);
}

function clearAckAlerts() {
  const next = getAlerts().filter((item) => !item?.ack);
  setAlerts(next);
}

function renderTopNotifications() {
  const badge = document.getElementById("topNotiBadge");
  const list = document.getElementById("topNotiList");
  const meta = document.getElementById("topNotiMeta");

  if (!badge || !list || !meta) return;

  const alerts = getActiveAlerts();
  const critical = alerts.filter(a => a.level === "danger").length;
  const warning = alerts.filter(a => a.level === "warn").length;

  badge.hidden = alerts.length === 0;
  badge.textContent = alerts.length > 99 ? "99+" : String(alerts.length);

  meta.textContent = `Critical ${critical} · Warning ${warning}`;

  if (!alerts.length) {
    list.innerHTML = `<div class="topNotiEmpty">No active alerts</div>`;
    return;
  }

  const rows = alerts.slice(0, 7);

  list.innerHTML = rows.map(a => {
    const cls = a.level === "danger" ? "danger" : a.level === "warn" ? "warn" : "info";
    return `
      <div class="topNotiItem" data-id="${safe(a.id)}">
        <div class="topNotiCode ${cls}">${safe(a.code)}</div>
        <div class="topNotiDevice">${safe(a.label || a.key)}</div>
        <div class="topNotiMsg">${safe(a.message)}</div>
      </div>
    `;
  }).join("");
}

function bindTopNotifications() {
  const btn = document.getElementById("btnTopNoti");
  const dropdown = document.getElementById("topNotiDropdown");
  const btnClearAck = document.getElementById("btnTopNotiClearAck");
  const btnViewAll = document.getElementById("btnTopNotiViewAll");
  const list = document.getElementById("topNotiList");

  if (!btn || !dropdown) return;

  if (window.__topNotiBound__) return;
  window.__topNotiBound__ = true;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.hidden = !dropdown.hidden;
    renderTopNotifications();
  });

  btnClearAck?.addEventListener("click", (e) => {
    e.stopPropagation();
    clearAckAlerts();
    renderTopNotifications();
  });

  btnViewAll?.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.hidden = true;
    window.location.hash = "#notifications";
  });

  list?.addEventListener("click", (e) => {
    const item = e.target.closest(".topNotiItem[data-id]");
    if (!item) return;

    const id = item.getAttribute("data-id");
    if (!id) return;

    ackAlertById(id);
    renderTopNotifications();
  });

  const onDocClick = (e) => {
    if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
      dropdown.hidden = true;
    }
  };
  document.addEventListener("click", onDocClick);

  renderTopNotifications();

  if (window.__topNotiTimer__) {
    clearInterval(window.__topNotiTimer__);
  }
  window.__topNotiTimer__ = setInterval(renderTopNotifications, 1000);

  window.__topNotiCleanup__ = () => {
    try { document.removeEventListener("click", onDocClick); } catch {}
    try {
      if (window.__topNotiTimer__) {
        clearInterval(window.__topNotiTimer__);
        window.__topNotiTimer__ = null;
      }
    } catch {}
    window.__topNotiBound__ = false;
  };
}

export function bindTopLogout() {
  const btn = document.getElementById("btnTopLogout");
  if (!btn) return;

  if (btn.__logoutBound__) return;
  btn.__logoutBound__ = true;

  btn.addEventListener("click", () => logout());
}

export function setTopUserUI(user) {
  const avatarEl = document.getElementById("topAvatar");
  const textEl = document.getElementById("topUserText");
  if (!avatarEl || !textEl) return;

  const email = user?.email || "Signed in";
  const role = user?.role ? ` (${user.role})` : "";

  const first = String(email).trim().charAt(0).toUpperCase() || "U";
  avatarEl.textContent = first;
  textEl.textContent = `${email}${role}`;
}

export function initTopbar() {
  bindTopNotifications();
}