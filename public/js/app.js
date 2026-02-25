// /js/app.js
const viewEl = document.getElementById("view");

/* =========================
   ✅ 라우트 -> HTML
========================= */
const ROUTES = {
  overview: "./views/overview.html",
  devices: "./views/devices-setting.html",
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
  devices: "./css/view.devices-setting.css",
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
  location: "./js/view.location.js",
  "dashboard-setting": "./js/view.pm.js",
};

let currentCssLink = null;
let currentViewScript = null;

/* =========================================================
   ✅ API BASE
========================================================= */
window.API_BASE =
  window.API_BASE ||
  (location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8000"
    : "https://monitor-project.onrender.com");

const API_BASE = window.API_BASE;

/* =========================================================
   ✅ Auth
========================================================= */
function cleanToken(v) {
  return String(v || "").trim().replace(/^"+|"+$/g, "");
}
function getToken() {
  return cleanToken(localStorage.getItem("token"));
}
function isLoggedIn() {
  const t = getToken();
  return !!t && t.split(".").length >= 3;
}
function goLoginPage() {
  location.replace("/login.html");
}
function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  goLoginPage();
}

/* =========================================================
   ✅ Topbar Logout 버튼 바인딩
========================================================= */
function bindTopLogout() {
  const btn = document.getElementById("btnTopLogout");
  if (!btn) return;
  btn.addEventListener("click", () => logout());
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindTopLogout);
} else {
  bindTopLogout();
}

/* =========================================================
   ✅ Topbar 유저 표시 업데이트 (/api/auth/me)
========================================================= */
function setTopUserUI(user) {
  const avatarEl = document.getElementById("topAvatar");
  const textEl = document.getElementById("topUserText");
  if (!avatarEl || !textEl) return;

  const email = user?.email || "Signed in";
  const role = user?.role ? ` (${user.role})` : "";

  const first = String(email).trim().charAt(0).toUpperCase() || "U";
  avatarEl.textContent = first;
  textEl.textContent = `${email}${role}`;
}

async function loadMeAndUpdateTopbar() {
  // ✅ 서버 응답이 실제로 { email, role, id } 형태임
  // 예: {"email":"admin@local","role":"admin","id":"1"}
  const me = await fetchJson(`${API_BASE}/api/auth/me`);
  setTopUserUI(me);
}

/** 401이면 자동 로그아웃 + login.html로 */
async function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    if (/^bearer\s+/i.test(token)) headers.set("Authorization", token);
    else headers.set("Authorization", `Bearer ${token}`);
  }

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, { ...options, headers, cache: "no-cache" });

  if (res.status === 401) {
    console.warn("[401] url =", url);
    console.warn("[401] raw token =", localStorage.getItem("token"));
    console.warn("[401] clean token =", getToken());
    logout();
  }

  return res;
}

async function fetchJson(url) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return await res.json();
}

/* =========================================================
   ✅ MQTT 연결 상태 Topbar 표시 (추가)
   - config.js에서 window.MQTT_URL / MQTT_USERNAME / MQTT_PASSWORD 사용
========================================================= */
let __mqttClient = null;

function setMqttChip(state, detail = "") {
  const el = document.getElementById("mqttStatusChip");
  if (!el) return;

  if (state === "connected") el.textContent = "MQTT: 🟢 Connected";
  else if (state === "reconnecting") el.textContent = "MQTT: 🟡 Reconnecting";
  else if (state === "offline") el.textContent = "MQTT: 🔴 Offline";
  else el.textContent = "MQTT: …";

  el.title = detail || "";
}

function startMqttStatus() {
  // mqtt 라이브러리 없으면 종료
  if (typeof window.mqtt === "undefined") {
    setMqttChip("offline", "mqtt.min.js not loaded");
    return;
  }

  const url = window.MQTT_URL || ""; // ex) wss://...:8884/mqtt
  const username = window.MQTT_USERNAME || "";
  const password = window.MQTT_PASSWORD || "";

  if (!url) {
    setMqttChip("offline", "MQTT_URL not set in config.js");
    return;
  }

  // 기존 연결 있으면 끊고 재시작
  try { __mqttClient?.end?.(true); } catch {}
  __mqttClient = null;

  setMqttChip("reconnecting", url);

  const clientId = "web_" + Math.random().toString(16).slice(2);

  const client = window.mqtt.connect(url, {
    clientId,
    username: username || undefined,
    password: password || undefined,
    keepalive: 30,
    reconnectPeriod: 2000,
    connectTimeout: 5000,
    clean: true,
  });

  __mqttClient = client;

  client.on("connect", () => setMqttChip("connected", url));
  client.on("reconnect", () => setMqttChip("reconnecting", url));
  client.on("offline", () => setMqttChip("offline", url));
  client.on("close", () => setMqttChip("offline", url));
  client.on("error", (err) => {
    const msg = err?.message ? err.message : String(err);
    setMqttChip("offline", msg);
  });
}

/* =========================================================
   ✅ API 폴링 (overview/monitor/dashboard용)
========================================================= */
let __pollTimer = null;

/* =========================================================
   ✅ (추가) 장비 토픽 + CT(3상) 채널 정규화
========================================================= */
function splitTopicLike(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s.includes("/")) return null;
  const parts = s.split("/").filter(Boolean);
  return parts.length ? parts : null;
}

function pickTopic(item) {
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
  const tail3 = parts.slice(-3);
  if (tail3.length === 3) return `${tail3[0]} / ${tail3[1]} / ${tail3[2]}`;
  return parts[parts.length - 1] || "";
}

function ensureChannels(item) {
  if (Array.isArray(item.channels) && item.channels.length) return item.channels;

  const ch = [];
  const inObj = item?.in ?? item?.input ?? item?.inlet ?? item?.src ?? null;
  const outObj = item?.out ?? item?.output ?? item?.outlet ?? item?.dst ?? null;

  function pushFromObj(term, obj) {
    if (!obj || typeof obj !== "object") return;
    for (const [k, v] of Object.entries(obj)) {
      const phase = pickPhaseKey(k);
      if (!phase) continue;

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

  item.channels = [];
  return item.channels;
}

function normalizeOne(item) {
  const out = { ...item };

  const topic = pickTopic(item);
  const parts = splitTopicLike(topic);

  if (parts) {
    out.device_topic = String(topic);
    out.device_short = parts[parts.length - 1] || "";
    out.device_display = tailDisplayFromParts(parts);
  } else {
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

  out.channels = ensureChannels(out);
  out.channel_count = Array.isArray(out.channels) ? out.channels.length : 0;

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
      const items = normalizeItems(rawItems);

      if (route === "overview" && typeof window.__overviewOnDevices__ === "function") {
        try { window.__overviewOnDevices__(items); } catch {}
      }

      if (route === "monitor" && typeof window.__monitorOnDevices__ === "function") {
        try { window.__monitorOnDevices__(items); } catch {}
      }

      if (route === "dashboard" && typeof window.__dashboardOnDevices__ === "function") {
        try { window.__dashboardOnDevices__(items); } catch {}
      }
    } catch {
      // silent
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
    s.src = src + "?v=" + Date.now();
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
    try {
      if (typeof window.__viewCleanup__ === "function") {
        window.__viewCleanup__();
      }
    } catch {}
    window.__viewCleanup__ = null;

    stopViewPoll();
    unloadViewJs();

    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to load view: ${url}`);

    viewEl.innerHTML = await res.text();

    if (route === "developer" && typeof window.initDeveloperPage === "function") {
      try { window.initDeveloperPage(); } catch {}
    }

    await loadViewJs(route);

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

/* =========================
   ✅ 첫 진입 차단 (토큰 없으면 login.html)
========================= */
if (!isLoggedIn()) {
  goLoginPage();
} else {
  // ✅ 첫 진입 시 유저정보 1회 로드해서 Topbar 갱신
  loadMeAndUpdateTopbar().catch((e) => {
    console.warn("me failed:", e?.message || e);
  });

  // ✅ MQTT 상태 표시 시작 (추가)
  startMqttStatus();

  if (!location.hash) location.hash = "#dashboard";
  route();
}