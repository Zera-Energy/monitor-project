// /js/view.overview.js
(() => {
  const ONLINE_SEC = 60;

  let devices = [];

  const $ = (id) => document.getElementById(id);
  const grid = $("deviceGrid");
  const empty = $("emptyState");
  const filterEl = $("filterStatus");
  const countEl = $("deviceCount");

  function safe(v){
    return (v === undefined || v === null || v === "") ? "-" : String(v);
  }

  function toFixedMaybe(v, n=2){
    const num = Number(v);
    if (!isFinite(num)) return v;
    return num.toFixed(n);
  }

  function statusPill(online){
    if (online === true)  return `<span class="pill" style="border-color:#bfe5c8;">Online</span>`;
    if (online === false) return `<span class="pill" style="border-color:#f3c2c2;">Offline</span>`;
    return `<span class="pill">-</span>`;
  }

  // ✅ (수정) 서버 item -> 카드용 모델로 변환 (topic 기반 우선 지원)
  function mapServerItemToCard(item){
    if (!item) return null;

    const hasLegacyFields = item && (item.country || item.site_id || item.model || item.device_id);

    // ✅ id/name 우선순위: device_display → device_topic → legacy country/site/model/device_id
    const id = item.device_topic
      ? String(item.device_topic)
      : hasLegacyFields
        ? `${item.country}/${item.site_id}/${item.model}/${item.device_id}`
        : (item.id ? String(item.id) : "-");

    const name = item.device_display
      ? String(item.device_display)
      : id;

    const online = (item.online !== undefined)
      ? !!item.online
      : ((item.age_sec ?? 999999) < ONLINE_SEC);

    const lastSeenEpoch = Number(item.last_seen || 0);
    const lastSeen = lastSeenEpoch
      ? new Date(lastSeenEpoch * 1000).toLocaleString()
      : "-";

    const kw = (item.kw !== undefined && item.kw !== null) ? toFixedMaybe(item.kw, 2) : "-";
    const pf = (item.pf !== undefined && item.pf !== null) ? toFixedMaybe(item.pf, 2) : "-";

    return { id, name, online, kw, pf, lastSeen };
  }

  function renderCard(d){
    const el = document.createElement("div");
    el.className = "contentCard";
    el.style.cursor = "default";
    el.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <div>
          <div class="k">Device</div>
          <div class="v" style="font-size:18px;">${safe(d.name || d.id)}</div>
        </div>
        ${statusPill(d.online)}
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
        <div>
          <div class="k">kW</div>
          <div class="v" style="font-size:18px;">${safe(d.kw)}</div>
        </div>
        <div>
          <div class="k">PF</div>
          <div class="v" style="font-size:18px;">${safe(d.pf)}</div>
        </div>
        <div style="grid-column:1 / span 2;">
          <div class="k">Last Seen</div>
          <div class="muted">${safe(d.lastSeen)}</div>
        </div>
      </div>
    `;
    return el;
  }

  function applySummary(list){
    const total = list.length;
    const online = list.filter(x => x.online === true).length;
    const offline = list.filter(x => x.online === false).length;

    const sumTotal = $("sumTotal");
    const sumOnline = $("sumOnline");
    const sumOffline = $("sumOffline");
    const sumKw = $("sumKw");
    const sumPf = $("sumPf");

    if (sumTotal) sumTotal.textContent = total ? String(total) : "-";
    if (sumOnline) sumOnline.textContent = total ? String(online) : "-";
    if (sumOffline) sumOffline.textContent = total ? String(offline) : "-";

    const kwNums = list.map(x => Number(x.kw)).filter(n => Number.isFinite(n));
    const pfNums = list.map(x => Number(x.pf)).filter(n => Number.isFinite(n));

    if (sumKw) sumKw.textContent = kwNums.length ? kwNums.reduce((a,b)=>a+b,0).toFixed(2) : "-";
    if (sumPf) sumPf.textContent = pfNums.length ? (pfNums.reduce((a,b)=>a+b,0)/pfNums.length).toFixed(2) : "-";
  }

  function applyCount(n){
    if (countEl) countEl.textContent = `(${n} devices)`;
  }

  function applyLastUpdate(){
    const el = $("lastUpdate");
    if (el) el.textContent = new Date().toLocaleString();
  }

  function applyFilter(list){
    const f = filterEl?.value || "all";
    if (f === "online") return list.filter(x => x.online === true);
    if (f === "offline") return list.filter(x => x.online === false);
    return list;
  }

  function render(){
    if (!grid) return;

    const filtered = applyFilter(devices);

    grid.innerHTML = "";

    if (!devices.length) {
      if (empty) empty.style.display = "block";
    } else {
      if (empty) empty.style.display = "none";
    }

    filtered.forEach(d => grid.appendChild(renderCard(d)));

    applySummary(devices);
    applyCount(filtered.length);
    applyLastUpdate();
  }

  filterEl?.addEventListener("change", render);

  window.__overviewOnDevices__ = (list) => {
    const arr = Array.isArray(list) ? list : [];

    const mapped = arr.map(x => {
      const looksLikeServerItem =
        x && (
          x.device_topic || x.device_display || x.topic || x._raw_topic || // ✅ topic 기반
          x.country || x.site_id || x.model || x.device_id                // legacy
        );

      if (looksLikeServerItem) return mapServerItemToCard(x);
      return x;
    }).filter(Boolean);

    devices = mapped;
    render();
  };

  const prev = window.__viewCleanup__;
  window.__viewCleanup__ = () => {
    try { delete window.__overviewOnDevices__; } catch {}
    try { if (typeof prev === "function") prev(); } catch {}
  };

  render();
})();
