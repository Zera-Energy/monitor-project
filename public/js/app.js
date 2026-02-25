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
   ✅ 토스트(간단 알림) 유틸
========================================================= */
let __toastEl = null;
let __toastTimer = null;

function showToast(msg, ms = 3000) {
  if (!__toastEl) {
    __toastEl = document.createElement("div");
    __toastEl.id = "__toast";
    __toastEl.style.position = "fixed";
    __toastEl.style.right = "16px";
    __toastEl.style.bottom = "16px";
    __toastEl.style.padding = "10px 12px";
    __toastEl.style.borderRadius = "12px";
    __toastEl.style.boxShadow = "0 10px 30px rgba(0,0,0,.18)";
    __toastEl.style.background = "#111";
    __toastEl.style.color = "#fff";
    __toastEl.style.fontSize = "13px";
    __toastEl.style.zIndex = "99999";
    __toastEl.style.maxWidth = "320px";
    __toastEl.style.display = "none";
    document.body.appendChild(__toastEl);
  }

  __toastEl.textContent = msg;
  __toastEl.style.display = "block";

  if (__toastTimer) clearTimeout(__toastTimer);
  __toastTimer = setTimeout(() => {
    if (__toastEl) __toastEl.style.display = "none";
  }, ms);
}

/* =========================================================
   ✅ API 상태 Topbar 표시
   ✅ (수정) 5초 → 15초로 완화 + 탭 숨김이면 중지
========================================================= */
let __apiStatusTimer = null;

function setApiChip(state, detail = "") {
  const el = document.getElementById("apiStatusChip");
  if (!el) return;

  if (state === "ok") el.textContent = "API: 🟢 OK";
  else if (state === "slow") el.textContent = "API: 🟡 Slow";
  else el.textContent = "API: 🔴 Down";

  el.title = detail || "";
}

async function pingApiOnce() {
  const t0 = performance.now();
  try {
    const token = getToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const res = await fetch(`${API_BASE}/api/auth/me`, { headers, cache: "no-cache" });
    const ms = Math.round(performance.now() - t0);

    if (res.ok) setApiChip(ms > 1200 ? "slow" : "ok", `${ms}ms`);
    else setApiChip("down", `HTTP ${res.status}`);
  } catch (e) {
    setApiChip("down", e?.message || String(e));
  }
}

function stopApiStatus() {
  if (__apiStatusTimer) clearInterval(__apiStatusTimer);
  __apiStatusTimer = null;
}

function startApiStatus() {
  stopApiStatus();
  pingApiOnce();
  __apiStatusTimer = setInterval(() => {
    if (document.hidden) return; // ✅ 백그라운드면 스킵
    pingApiOnce();
  }, 15000); // ✅ 15초
}

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

/* =========================================================
   ✅ MQTT 실시간 캐시 + emit
========================================================= */
const __devicesByTopic = new Map(); // topic -> latest payload item
let __mqttConnected = false;

let __emitTimer = null;

function getCurrentRoute() {
  return (location.hash || "#overview").replace("#", "").trim() || "overview";
}

function emitDevicesToView(route) {
  const rawItems = Array.from(__devicesByTopic.values());
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
}

function scheduleEmit(route) {
  if (__emitTimer) return;
  __emitTimer = setTimeout(() => {
    __emitTimer = null;
    emitDevicesToView(route);
  }, 200);
}

/* =========================================================
   ✅ API 폴링 (백업)
   ✅ (핵심 수정) "같은 (route, interval)"이면 재시작 안 함
========================================================= */
let __pollTimer = null;
let __pollSpec = ""; // ✅ 현재 폴링 스펙 기억 (route|interval)

function stopViewPoll() {
  if (__pollTimer) {
    clearInterval(__pollTimer);
    __pollTimer = null;
  }
  __pollSpec = "";
}

function startViewPoll(route, intervalMs = 3000) {
  const spec = `${route}|${intervalMs}`;
  if (__pollTimer && __pollSpec === spec) {
    return; // ✅ 이미 같은 설정으로 도는 중이면 그대로 둠
  }

  // ✅ 설정이 바뀌면 기존 폴링 정리하고 새로 시작
  stopViewPoll();
  __pollSpec = spec;

  const tick = async () => {
    if (document.hidden) return; // ✅ 백그라운드면 폴링 스킵(요청 폭감)

    try {
      const data = await fetchJson(`${API_BASE}/api/devices`);
      const rawItems = data?.items || [];
      const items = normalizeItems(rawItems);

      // ✅ API 응답도 캐시에 반영(동기화)
      for (const it of rawItems) {
        const t = pickTopic(it);
        if (t) __devicesByTopic.set(String(t), it);
      }

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
  __pollTimer = setInterval(tick, intervalMs);
}

/* =========================================================
   ✅ MQTT 상태에 따라 폴링 전환 (즉시 반영)
========================================================= */
function isLiveRoute(route) {
  return route === "overview" || route === "monitor" || route === "dashboard";
}

function getRouteFromHash() {
  const r = (location.hash || "#overview").replace("#", "").trim();
  return r || "overview";
}

function restartPollForCurrentRoute() {
  const route = getRouteFromHash();
  if (!isLiveRoute(route)) return;

  // ✅ MQTT 연결이면 백업 폴링을 더 느리게(30초)
  // ✅ MQTT 끊기면 3초로 복귀
  const interval = __mqttConnected ? 30000 : 3000;
  startViewPoll(route, interval);
}

/* =========================================================
   ✅ MQTT 연결 상태 Topbar 표시
========================================================= */
let __mqttClient = null;

let __mqttOfflineTimer = null;
let __mqttOfflineNotified = false;

function setMqttChip(state, detail = "") {
  const el = document.getElementById("mqttStatusChip");
  if (!el) return;

  if (state === "connected") el.textContent = "MQTT: 🟢 Connected";
  else if (state === "reconnecting") el.textContent = "MQTT: 🟡 Reconnecting";
  else if (state === "offline") el.textContent = "MQTT: 🔴 Offline";
  else el.textContent = "MQTT: …";

  el.title = detail || "";
}

function scheduleMqttOfflineToast() {
  if (__mqttOfflineTimer) return;
  __mqttOfflineTimer = setTimeout(() => {
    __mqttOfflineTimer = null;
    if (!__mqttOfflineNotified) {
      __mqttOfflineNotified = true;
      showToast("MQTT 연결이 끊겼습니다. (5초 이상 Offline)");
    }
  }, 5000);
}

function clearMqttOfflineToast() {
  if (__mqttOfflineTimer) {
    clearTimeout(__mqttOfflineTimer);
    __mqttOfflineTimer = null;
  }
  __mqttOfflineNotified = false;
}

function startMqttStatus() {
  if (typeof window.mqtt === "undefined") {
    setMqttChip("offline", "mqtt.min.js not loaded");
    return;
  }

  const url = window.MQTT_URL || "";
  const username = window.MQTT_USERNAME || "";
  const password = window.MQTT_PASSWORD || "";

  if (!url) {
    setMqttChip("offline", "MQTT_URL not set in config.js");
    return;
  }

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

  client.on("connect", () => {
    setMqttChip("connected", url);
    clearMqttOfflineToast();
    __mqttConnected = true;

    // ✅ 실시간 구독
    try {
      client.subscribe("th/#", (err) => {
        if (err) console.warn("MQTT subscribe err:", err);
      });
    } catch (e) {
      console.warn("MQTT subscribe fail:", e);
    }

    // ✅ 연결되면 캐시 1번 emit
    scheduleEmit(getCurrentRoute());

    // ✅ 연결되면 폴링을 즉시 30초 백업으로 전환
    restartPollForCurrentRoute();
  });

  client.on("reconnect", () => {
    setMqttChip("reconnecting", url);
  });

  function onMqttDown(detail) {
    setMqttChip("offline", detail);
    __mqttConnected = false;
    scheduleMqttOfflineToast();
    // ✅ 끊기면 폴링을 즉시 3초로 복귀
    restartPollForCurrentRoute();
  }

  client.on("offline", () => onMqttDown(url));
  client.on("close", () => onMqttDown(url));
  client.on("error", (err) => onMqttDown(err?.message ? err.message : String(err)));

  // ✅ 실시간 메시지 수신 → 캐시에 저장 → 화면 갱신
  client.on("message", (topic, payload) => {
    let obj = null;
    try {
      obj = JSON.parse(payload.toString());
    } catch {
      return;
    }
    const item = { topic, ...obj };
    __devicesByTopic.set(topic, item);
    scheduleEmit(getCurrentRoute());
  });
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

    unloadViewJs();

    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to load view: ${url}`);

    viewEl.innerHTML = await res.text();

    if (route === "developer" && typeof window.initDeveloperPage === "function") {
      try { window.initDeveloperPage(); } catch {}
    }

    await loadViewJs(route);

    // ✅ 라이브 화면이면: MQTT 상태에 맞춰 폴링 스펙 "한 번만" 맞춤
    if (isLiveRoute(route)) {
      restartPollForCurrentRoute();

      // ✅ MQTT 연결 상태면 진입 즉시 캐시 1번 반영
      if (__mqttConnected) scheduleEmit(route);

      const prev = window.__viewCleanup__;
      window.__viewCleanup__ = () => {
        try { unloadViewJs(); } catch {}
        try { if (typeof prev === "function") prev(); } catch {}
      };
    } else {
      // ✅ 라이브 화면이 아니면 폴링 중지
      stopViewPoll();
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

/* =========================================================
   ✅ 탭 숨김/복귀 시: 폴링 스펙 재정렬 (요청 절약)
========================================================= */
document.addEventListener("visibilitychange", () => {
  if (!isLoggedIn()) return;
  if (!document.hidden) {
    // 탭 복귀 시 한번 갱신
    restartPollForCurrentRoute();
    pingApiOnce();
  }
});

/* =========================
   ✅ 첫 진입 차단
========================= */
if (!isLoggedIn()) {
  goLoginPage();
} else {
  loadMeAndUpdateTopbar().catch((e) => {
    console.warn("me failed:", e?.message || e);
  });

  // ✅ MQTT 상태 + 실시간 구독 시작
  startMqttStatus();

  // ✅ API 상태칩
  startApiStatus();

  if (!location.hash) location.hash = "#dashboard";
  route();
}