// /js/view.dashboard.js
(() => {
  const ONLINE_SEC = 60;

  // ===== HERO + SUMMARY =====
  const elNow = document.getElementById("dashNowText");
  const heroDevices = document.getElementById("heroDevices");
  const heroOnlinePct = document.getElementById("heroOnlinePct");
  const heroKwhSaved = document.getElementById("heroKwhSaved");
  const btnDashRefresh = document.getElementById("btnDashRefresh");

  const sumTotalDevices = document.getElementById("sumTotalDevices");
  const sumOnlineDevices = document.getElementById("sumOnlineDevices");
  const sumOfflineDevices = document.getElementById("sumOfflineDevices");
  const sumOnlineBar = document.getElementById("sumOnlineBar");
  const sumOnlineText = document.getElementById("sumOnlineText");
  const sumOfflineText = document.getElementById("sumOfflineText");
  const sumKwhSaved = document.getElementById("sumKwhSaved");

  const healthOnlineBar = document.getElementById("healthOnlineBar");
  const healthOnlinePct = document.getElementById("healthOnlinePct");
  const healthOnlineCount = document.getElementById("healthOnlineCount");
  const healthOfflineCount = document.getElementById("healthOfflineCount");

  // ===== RECENT DEVICES =====
  const recentCount = document.getElementById("recentCount");
  const recentDevicesGrid = document.getElementById("recentDevicesGrid");

  function setText(el, v, fallback = "-") {
    if (!el) return;
    el.textContent = (v === undefined || v === null || v === "") ? fallback : String(v);
  }

  function n(v) {
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  }

  function fmtNum(v, digits = 1) {
    const x = n(v);
    return x === null ? "-" : x.toFixed(digits);
  }

  function isOnline(d) {
    if (d?.online !== undefined) return !!d.online;
    const age = Number(d?.age_sec ?? 999999);
    return age < ONLINE_SEC;
  }

  function getPayload(d) {
    const p = d?.payload || d || {};
    const lp = (p && typeof p.last_payload === "object") ? p.last_payload : null;
    return { p, lp };
  }

  function getAny(obj, keys) {
    if (!obj) return undefined;
    for (const k of keys) {
      if (obj[k] !== undefined && obj[k] !== null) return obj[k];
    }
    return undefined;
  }

  // 전압(LL1/LL2/LL3) 후보키를 최대한 넓게 잡아줌
  function pickVoltLL(d) {
    const { p, lp } = getPayload(d);

    const ll1 = getAny(lp, ["v_ll1", "v12", "v_12", "v_l12", "v_l1l2", "v12_v"]) ??
                getAny(p,  ["v_ll1", "v12", "v_12", "v_l12", "v_l1l2", "v12_v"]);
    const ll2 = getAny(lp, ["v_ll2", "v23", "v_23", "v_l23", "v_l2l3", "v23_v"]) ??
                getAny(p,  ["v_ll2", "v23", "v_23", "v_l23", "v_l2l3", "v23_v"]);
    const ll3 = getAny(lp, ["v_ll3", "v31", "v_31", "v_l31", "v_l3l1", "v31_v"]) ??
                getAny(p,  ["v_ll3", "v31", "v_31", "v_l31", "v_l3l1", "v31_v"]);

    return { ll1, ll2, ll3 };
  }

  function deviceName(d) {
    return String(d?.device_display ?? d?.device_short ?? d?.device_id ?? d?.id ?? "UNKNOWN");
  }

  function lastSeenText(d) {
    const t = Number(d?.last_seen ?? 0);
    if (!t) return "-";
    return new Date(t * 1000).toLocaleString();
  }

  function renderHeaderNow() {
    const now = new Date();
    // 너 스샷처럼 “2026년 3월 4일 수요일 · 오후 02:13” 느낌
    const opts = { year: "numeric", month: "long", day: "numeric", weekday: "long" };
    const datePart = now.toLocaleDateString("ko-KR", opts);
    const timePart = now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    setText(elNow, `${datePart} · ${timePart}`);
  }

  function applyAggregates(items) {
    const total = (items || []).length;
    const online = (items || []).filter(isOnline).length;
    const offline = total - online;
    const pct = total ? Math.round((online / total) * 100) : 0;

    setText(heroDevices, total);
    setText(heroOnlinePct, `${pct}%`);
    setText(heroKwhSaved, 0);

    setText(sumTotalDevices, total);
    setText(sumOnlineDevices, online);
    setText(sumOfflineDevices, offline);
    setText(sumKwhSaved, 0);
    setText(sumOnlineText, `${pct}% online`);
    setText(sumOfflineText, `${offline} devices need attention`);

    if (sumOnlineBar) sumOnlineBar.style.width = `${pct}%`;

    setText(healthOnlinePct, `${pct}%`);
    if (healthOnlineBar) healthOnlineBar.style.width = `${pct}%`;
    setText(healthOnlineCount, online);
    setText(healthOfflineCount, offline);
  }

  function makeRecentCard(d) {
    const online = isOnline(d);
    const { ll1, ll2, ll3 } = pickVoltLL(d);

    const name = deviceName(d);
    const lastSeen = lastSeenText(d);

    const card = document.createElement("div");
    card.className = `recentCard ${online ? "on" : "off"}`;

    card.innerHTML = `
      <div class="recentCardTop">
        <div class="recentName">${name}</div>
        <div class="recentStatusIcon">${online ? "📶" : "🚫"}</div>
      </div>

      <div class="recentRows">
        <div class="r">
          <div class="rk">⚡ 전압 LL1</div>
          <div class="rv">${fmtNum(ll1, 1)} <span class="unit">VOLT</span></div>
        </div>
        <div class="r">
          <div class="rk">⚡ 전압 LL2</div>
          <div class="rv">${fmtNum(ll2, 1)} <span class="unit">VOLT</span></div>
        </div>
        <div class="r">
          <div class="rk">⚡ 전압 LL3</div>
          <div class="rv">${fmtNum(ll3, 1)} <span class="unit">VOLT</span></div>
        </div>
      </div>

      <div class="recentFoot">
        <div class="recentLast">lastConnected: ${lastSeen}</div>
        <div class="recentEdit">✎</div>
      </div>
    `;
    return card;
  }

  function renderRecentDevices(items) {
    if (!recentDevicesGrid) return;

    const list = [...(items || [])];
    // last_seen 최신 2개
    list.sort((a, b) => (Number(b?.last_seen ?? 0) - Number(a?.last_seen ?? 0)));
    const top2 = list.slice(0, 2);

    setText(recentCount, `(${top2.length})`, "(0)");

    recentDevicesGrid.innerHTML = "";
    if (!top2.length) {
      recentDevicesGrid.innerHTML = `<div class="muted" style="padding:12px;">최근 기기가 없습니다.</div>`;
      return;
    }
    top2.forEach(d => recentDevicesGrid.appendChild(makeRecentCard(d)));
  }

  // ===== 외부에서 devices 목록이 들어오는 구조 유지 =====
  window.__dashboardOnDevices__ = (items) => {
    try {
      renderHeaderNow();
      applyAggregates(items);
      renderRecentDevices(items);
    } catch (e) {
      console.error("[dashboard] render error:", e);
      renderHeaderNow();
      applyAggregates([]);
      renderRecentDevices([]);
    }
  };

  // refresh 버튼: SPA에서 기존 로딩 로직이 /api/devices를 재호출한다면,
  // 여기서는 단순히 이벤트만 던져두고, app.js에서 받아 처리해도 됨.
  btnDashRefresh?.addEventListener("click", () => {
    // 방법1) 그냥 새로고침
    // location.reload();

    // 방법2) app.js에서 listen 해서 재호출하도록 커스텀 이벤트
    window.dispatchEvent(new CustomEvent("dash:refresh"));
  });

  // cleanup
  const prev = window.__viewCleanup__;
  window.__viewCleanup__ = () => {
    try { delete window.__dashboardOnDevices__; } catch {}
    try { if (typeof prev === "function") prev(); } catch {}
  };

  // 최초 1회 시간 표시
  renderHeaderNow();
})();