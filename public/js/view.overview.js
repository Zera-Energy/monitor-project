// /js/view.overview.js
(() => {
  const ONLINE_SEC = 60;

  let devices = [];

  const $ = (id) => document.getElementById(id);
  const grid = $("deviceGrid");
  const empty = $("emptyState");
  const filterEl = $("filterStatus");
  const countEl = $("deviceCount");

  // (선택) 버튼이 있으면 동작만 걸어둠 (실제 addDevice 모달/페이지는 너 프로젝트 방식대로 연결)
  $("btnOvRefresh")?.addEventListener("click", () => {
    // app.js 쪽에서 주기적으로 fetch하고 있으면 그냥 화면만 다시 렌더
    render();
  });
  $("btnAddDevice")?.addEventListener("click", () => {
    alert("addDevice action (TODO: connect to your add device flow)");
  });

  function safe(v){
    return (v === undefined || v === null || v === "") ? "--.--" : String(v);
  }

  function toFixedMaybe(v, n=1){
    const num = Number(v);
    if (!isFinite(num)) return null;
    return num.toFixed(n);
  }

  // ✅ 서버 item -> 화면 카드 모델
  function mapServerItemToCard(item){
    if (!item) return null;

    const hasLegacy = item && (item.country || item.site_id || item.model || item.device_id);

    const id = item.device_topic
      ? String(item.device_topic)
      : hasLegacy
        ? `${item.country}/${item.site_id}/${item.model}/${item.device_id}`
        : (item.id ? String(item.id) : "-");

    const name = item.device_display ? String(item.device_display) : id;

    const online = (item.online !== undefined)
      ? !!item.online
      : ((item.age_sec ?? 999999) < ONLINE_SEC);

    const lastSeenEpoch = Number(item.last_seen || 0);
    const lastSeen = lastSeenEpoch
      ? new Date(lastSeenEpoch * 1000).toLocaleString()
      : "-";

    // ✅ 전압 LL1~LL3 (데이터 없을 때는 null)
    // 장비 payload 포맷이 확정되면 여기 키만 맞춰주면 됨
    const v1 = toFixedMaybe(item.v_ll1 ?? item.v_ll_1 ?? item.v_ln1 ?? item.v1 ?? item.v);
    const v2 = toFixedMaybe(item.v_ll2 ?? item.v_ll_2 ?? item.v_ln2 ?? item.v2);
    const v3 = toFixedMaybe(item.v_ll3 ?? item.v_ll_3 ?? item.v_ln3 ?? item.v3);

    return { id, name, online, lastSeen, v1, v2, v3 };
  }

  function renderCard(d){
    const el = document.createElement("div");
    el.className = "ovDevCard" + (d.online ? "" : " offline");

    const stateIcon = d.online ? "📶" : "📡";
    const xBadge = d.online ? "" : `<span class="ovDevBadgeX">×</span>`;

    el.innerHTML = `
      <div class="ovDevHead">
        <div>
          <div class="ovDevNameRow">
            <div class="ovDevName">${d.name}</div>
            ${xBadge}
          </div>
        </div>
        <div class="ovDevStateIcon" title="${d.online ? "Online" : "Offline"}">${stateIcon}</div>
      </div>

      <div class="ovRows">
        <div class="ovRow">
          <div class="ovRowLeft">
            <span class="ovBolt">⚡</span>
            <span class="ovRowLabel">전압 LL1</span>
          </div>
          <div class="ovVal">${safe(d.v1)} <span class="ovUnit">VOLT</span></div>
        </div>

        <div class="ovRow">
          <div class="ovRowLeft">
            <span class="ovBolt">⚡</span>
            <span class="ovRowLabel">전압 LL2</span>
          </div>
          <div class="ovVal">${safe(d.v2)} <span class="ovUnit">VOLT</span></div>
        </div>

        <div class="ovRow">
          <div class="ovRowLeft">
            <span class="ovBolt">⚡</span>
            <span class="ovRowLabel">전압 LL3</span>
          </div>
          <div class="ovVal">${safe(d.v3)} <span class="ovUnit">VOLT</span></div>
        </div>
      </div>

      <div class="ovDevFoot">
        <div class="ovLast">lastConnected: ${d.lastSeen}</div>
        <div class="ovEdit">✎</div>
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

    if (sumTotal) sumTotal.textContent = total ? String(total) : "-";
    if (sumOnline) sumOnline.textContent = total ? String(online) : "-";
    if (sumOffline) sumOffline.textContent = total ? String(offline) : "-";
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

  // ✅ app.js(라우터)에서 devices 데이터를 받으면 여기로 주입되는 구조 유지
  window.__overviewOnDevices__ = (list) => {
    const arr = Array.isArray(list) ? list : [];

    const mapped = arr.map(x => {
      const looksServer =
        x && (
          x.device_topic || x.device_display ||
          x.country || x.site_id || x.model || x.device_id ||
          x.last_seen || x.age_sec
        );

      return looksServer ? mapServerItemToCard(x) : x;
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