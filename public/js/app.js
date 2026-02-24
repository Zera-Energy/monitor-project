// /js/app.js
const viewEl = document.getElementById("view");

/* =========================
   ✅ 라우트 -> HTML
========================= */
const ROUTES = {
  overview: "./views/overview.html",
  devices: "./views/devices.html",
  monitor: "./views/monitor.html",
  location: "./views/location.html",
  notifications: "./views/notifications.html",
  developer: "./views/developer.html",
  dashboard: "./views/dashboard.html",
  "dashboard-setting": "./views/dashboard-setting.html",
  products: "./views/overview.html",
  profile: "./views/overview.html",
};

/* =========================
   ✅ 라우트 -> 뷰 전용 CSS
========================= */
const VIEW_CSS = {
  overview: "./css/view.overview.css",
  devices: "./css/view.devices.css",
  monitor: "./css/view.monitor.css",
  location: "./css/view.location.css",
  developer: "./css/view.developer.css",
  "dashboard-setting": "./css/view.pm.css",
  dashboard: "./css/view.dashboard.css",
};

/* =========================
   ✅ 라우트 -> 뷰 전용 JS
========================= */
const VIEW_JS = {
  overview: "./js/view.overview.js",
  dashboard: "./js/view.dashboard.js",
  monitor: "./js/view.monitor.js",

  // ✅ (추가) PM(Project Management) 화면 전용 JS
  "dashboard-setting": "./js/view.pm.js",
};

let currentCssLink = null;
let currentViewScript = null;

/* =========================================================
   ✅ API 폴링 (overview/monitor/dashboard용)
========================================================= */
const API_BASE = "http://127.0.0.1:8000";
let __pollTimer = null;

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return await res.json();
}

/* =========================================================
   ✅ (추가) 장비 토픽 + CT(3상) 채널 정규화
   - 원본 item 필드는 그대로 유지
   - item.device_topic / item.device_short / item.device_display 추가
   - item.channels = [{term:'in'|'out', phase:'L1'|'L2'|'L3', ...}] 추가
========================================================= */
function splitTopicLike(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s.includes("/")) return null;
  const parts = s.split("/").filter(Boolean);
  return parts.length ? parts : null;
}

function pickTopic(item) {
  // 장비 식별값 후보(너네 서버 상황에 맞춰 유연하게)
  return (
    item?.topic ??
    item?._topic ??
    item?.device_topic ??
    item?.device ??
    item?.device_id ??
    item?.id ??
    ""
  );
}

function pickPhaseKey(k) {
  const s = String(k).toUpperCase().trim();
  if (s === "L1" || s === "1" || s === "R" || s === "CT1") return "L1";
  if (s === "L2" || s === "2" || s === "S" || s === "CT2") return "L2";
  if (s === "L3" || s === "3" || s === "T" || s === "CT3") return "L3";
  return null;
}

function tailDisplayFromParts(parts) {
  // 예: th/site001/pg46/001 -> site001 / pg46 / 001
  const tail3 = parts.slice(-3);
  if (tail3.length === 3) return `${tail3[0]} / ${tail3[1]} / ${tail3[2]}`;
  return parts[parts.length - 1] || "";
}

function ensureChannels(item) {
  // 이미 channels가 있으면 존중
  if (Array.isArray(item.channels) && item.channels.length) return item.channels;

  const ch = [];

  // 케이스 A: in/out 객체에 L1/L2/L3가 들어있는 경우
  const inObj =
    item?.in ?? item?.input ?? item?.inlet ?? item?.src ?? null;
  const outObj =
    item?.out ?? item?.output ?? item?.outlet ?? item?.dst ?? null;

  function pushFromObj(term, obj) {
    if (!obj || typeof obj !== "object") return;
    for (const [k, v] of Object.entries(obj)) {
      const phase = pickPhaseKey(k);
      if (!phase) continue;

      // v가 number면 current일 가능성이 높고,
      // v가 object면 (current/kw/volt 등) 묶음일 수도 있음
      if (v != null && typeof v === "object" && !Array.isArray(v)) {
        ch.push({ term, phase, ...v });
      } else {
        ch.push({ term, phase, value: v });
      }
    }
  }

  if (inObj || outObj) {
    pushFromObj("in", inObj);
    pushFromObj("out", outObj);
    item.channels = ch;
    return item.channels;
  }

  // 케이스 B: item 자체에 L1/L2/L3 / l1/l2/l3 / ct1/ct2/ct3가 있는 경우(입력만)
  const direct = {
    L1: item?.L1 ?? item?.l1 ?? item?.ct1,
    L2: item?.L2 ?? item?.l2 ?? item?.ct2,
    L3: item?.L3 ?? item?.l3 ?? item?.ct3,
  };
  const hasDirect = Object.values(direct).some((x) => x != null);
  if (hasDirect) {
    pushFromObj("in", direct);
    item.channels = ch;
    return item.channels;
  }

  // 케이스 C: 이미 1채널씩 내려오는 경우(term/phase가 있음)
  // (이 경우엔 channels를 만들기 어렵고, 뷰에서 row 단위로 쓰는 구조일 수도 있음)
  item.channels = [];
  return item.channels;
}

function normalizeOne(item) {
  const out = { ...item };

  // 1) device/topic 정리
  const topic = pickTopic(item);
  const parts = splitTopicLike(topic);

  if (parts) {
    out.device_topic = String(topic);
    out.device_short = parts[parts.length - 1] || "";
    out.device_display = tailDisplayFromParts(parts);
  } else {
    // topic 구조가 아니면 기존에서 최대한
    const base =
      item?.device_display ??
      item?.device_name ??
      item?.name ??
      item?.device ??
      item?.device_id ??
      item?.id ??
      "";
    out.device_topic = String(topic || "");
    out.device_short = String(base || "");
    out.device_display = String(base || "");
  }

  // 2) CT(3상) 채널 배열 만들기 (IN/OUT 포함 가능)
  out.channels = ensureChannels(out);
  out.channel_count = Array.isArray(out.channels) ? out.channels.length : 0;

  // 3) (옵션) 뷰에서 자주 쓰게 “요약값”도 하나 만들어둠
  //    - 기존 뷰가 단일 값만 기대하는 경우를 위해
  //    - 우선순위: in L1 value -> item.value(기존) -> null
  if (out.summary_value == null) {
    const inL1 = out.channels?.find((c) => c.term === "in" && c.phase === "L1");
    out.summary_value =
      (inL1 && (inL1.value ?? inL1.current ?? inL1.amp ?? null)) ??
      out.value ??
      null;
  }

  return out;
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map(normalizeOne);
}

function stopViewPoll() {
  if (__pollTimer) {
    clearInterval(__pollTimer);
    __pollTimer = null;
  }
}

function startViewPoll(route) {
  stopViewPoll();

  const tick = async () => {
    try {
      const data = await fetchJson(`${API_BASE}/api/devices`);
      const rawItems = data?.items || [];

      // ✅ (수정) 여기서 한 번 정규화 후 뷰에 전달
      const items = normalizeItems(rawItems);

      // ✅ overview: 원본 그대로 전달(정규화 추가필드 포함)
      if (route === "overview" && typeof window.__overviewOnDevices__ === "function") {
        try { window.__overviewOnDevices__(items); } catch {}
      }

      // ✅ monitor: 원본 그대로 전달(정규화 추가필드 포함)
      if (route === "monitor" && typeof window.__monitorOnDevices__ === "function") {
        try { window.__monitorOnDevices__(items); } catch {}
      }

      // ✅ dashboard: 원본 그대로 전달(정규화 추가필드 포함)
      if (route === "dashboard" && typeof window.__dashboardOnDevices__ === "function") {
        try { window.__dashboardOnDevices__(items); } catch {}
      }
    } catch {
      // 조용히 실패 (네트워크/서버 다운 시 UI가 멈추지 않게)
    }
  };

  tick();
  __pollTimer = setInterval(tick, 3000);
}

/* =========================
   ✅ CSS 로드
========================= */
function loadViewCss(route) {
  return new Promise((resolve) => {
    const href = VIEW_CSS[route];

    if (currentCssLink) {
      currentCssLink.remove();
      currentCssLink = null;
    }

    if (!href) return resolve();

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute("data-view-css", "1");

    link.onload = () => resolve();
    link.onerror = () => resolve();

    document.head.appendChild(link);
    currentCssLink = link;
  });
}

/* =========================
   ✅ View JS 로드/언로드
========================= */
function unloadViewJs() {
  if (currentViewScript) {
    try { currentViewScript.remove(); } catch {}
    currentViewScript = null;
  }
}

function loadViewJs(route) {
  return new Promise((resolve) => {
    unloadViewJs();

    const src = VIEW_JS[route];
    if (!src) return resolve();

    const s = document.createElement("script");
    s.src = src + "?v=" + Date.now(); // 개발용 캐시 방지
    s.defer = true;
    s.setAttribute("data-view-js", "1");

    s.onload = () => resolve();
    s.onerror = () => resolve();

    document.body.appendChild(s);
    currentViewScript = s;
  });
}

function getRouteFromHash() {
  const r = (location.hash || "#overview").replace("#", "").trim();
  return r || "overview";
}

/* =========================
   ✅ View 로딩 (HTML만)
========================= */
async function loadView(route) {
  const url = ROUTES[route] || ROUTES.overview;

  try {
    // 기존 cleanup
    try {
      if (typeof window.__viewCleanup__ === "function") {
        window.__viewCleanup__();
      }
    } catch {}
    window.__viewCleanup__ = null;

    // 폴링 정리
    stopViewPoll();

    // JS 정리
    unloadViewJs();

    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to load view: ${url}`);

    viewEl.innerHTML = await res.text();

    if (route === "developer" && typeof window.initDeveloperPage === "function") {
      try { window.initDeveloperPage(); } catch {}
    }

    // 분리된 JS 로드
    await loadViewJs(route);

    // ✅ overview/monitor/dashboard면 폴링 시작
    if (route === "overview" || route === "monitor" || route === "dashboard") {
      startViewPoll(route);

      const prev = window.__viewCleanup__;
      window.__viewCleanup__ = () => {
        try { stopViewPoll(); } catch {}
        try { unloadViewJs(); } catch {}
        try { if (typeof prev === "function") prev(); } catch {}
      };
    }
  } catch (err) {
    console.error(err);
    viewEl.innerHTML = `
      <div class="contentCard">
        <div class="k">Error</div>
        <div class="v">View Load Failed</div>
        <div class="muted" style="margin-top:8px;">${String(err)}</div>
      </div>
    `;
  }
}

/* =========================
   ✅ 라우팅
========================= */
async function route() {
  const r = getRouteFromHash();
  await loadViewCss(r);
  await loadView(r);
}

window.addEventListener("hashchange", route);
route();
