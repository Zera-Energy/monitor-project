// /js/ui/topbar.js
import { logout } from "../lib/auth.js";

function safe(v) {
  return (v === undefined || v === null || v === "") ? "-" : String(v);
}

function getAckMap() {
  if (!window.__notiAckMap__) window.__notiAckMap__ = {};
  return window.__notiAckMap__;
}

function getActiveAlerts() {
  const src = Array.isArray(window.__monitorAlerts__) ? window.__monitorAlerts__ : [];
  const ack = getAckMap();
  return src.filter(a => a && !ack[a.id]);
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
    const cls = a.level === "danger" ? "danger" : "warn";
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

  if (!btn || !dropdown) return;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.hidden = !dropdown.hidden;
    renderTopNotifications();
  });

  btnClearAck?.addEventListener("click", (e) => {
    e.stopPropagation();
    window.__notiAckMap__ = {};
    renderTopNotifications();
  });

  btnViewAll?.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.hidden = true;
    window.location.hash = "#notifications";
  });

  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
      dropdown.hidden = true;
    }
  });

  setInterval(renderTopNotifications, 1000);
}

export function bindTopLogout() {
  const btn = document.getElementById("btnTopLogout");
  if (!btn) return;
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