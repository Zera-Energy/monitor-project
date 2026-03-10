/* =========================
   🔔 Top Notification
========================= */

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
  badge.textContent = alerts.length;

  meta.textContent = `Critical ${critical} · Warning ${warning}`;

  if (!alerts.length) {
    list.innerHTML = `<div class="topNotiEmpty">No active alerts</div>`;
    return;
  }

  const rows = alerts.slice(0, 7);

  list.innerHTML = rows.map(a => {
    const cls = a.level === "danger" ? "danger" : "warn";

    return `
      <div class="topNotiItem" data-id="${a.id}">
        <div class="topNotiCode ${cls}">${a.code}</div>
        <div class="topNotiDevice">${a.label || a.key}</div>
        <div class="topNotiMsg">${a.message}</div>
      </div>
    `;
  }).join("");
}

function bindTopNotifications() {

  const btn = document.getElementById("btnTopNoti");
  const dropdown = document.getElementById("topNotiDropdown");

  if (!btn || !dropdown) return;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.hidden = !dropdown.hidden;
    renderTopNotifications();
  });

  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
      dropdown.hidden = true;
    }
  });

  setInterval(renderTopNotifications, 1000);
}

export function initTopbar() {
  bindTopNotifications();
}