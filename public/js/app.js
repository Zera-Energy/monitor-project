// /js/app.js
import { isLoggedIn, goLoginPage } from "./lib/auth.js";
import { fetchJson } from "./lib/api.js";
import { bindTopLogout, setTopUserUI } from "./ui/topbar.js";
import { DeviceStore } from "./lib/deviceStore.js";
import { createMqttClient } from "./lib/mqttClient.js";

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
  products: "./views/products.html",
  profile: "./views/profile.html",
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
  profile: "./css/view.profile.css",
  products: "./css/view.products.css",
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
  profile: "./js/view.profile.js",
  products: "./js/view.products.js",
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
   ✅ Route Loading Overlay
========================================================= */
function ensureRouteOverlay() {
  if (document.getElementById("routeOverlay")) return;

  const style = document.createElement("style");
  style.setAttribute("data-route-overlay-style", "1");
  style.textContent = `
    #routeOverlay{
      position: fixed;
      inset: 0;
      background: rgba(255,255,255,.55);
      backdrop-filter: blur(2px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    }
    #routeOverlay.show{ display:flex; }
    .routeSpinner{
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: 4px solid rgba(0,0,0,.12);
      border-top-color: rgba(0,0,0,.55);
      animation: rsSpin 0.85s linear infinite;
    }
    @keyframes rsSpin { to { transform: rotate(360deg); } }
    #view.routeSwapIn{ animation: routeFadeIn .12s ease-out; }
    @keyframes routeFadeIn { from{opacity:.75} to{opacity:1} }
  `;
  document.head.appendChild(style);

  const ov = document.createElement("div");
  ov.id = "routeOverlay";
  ov.innerHTML = `<div class="routeSpinner" aria-label="loading"></div>`;
  document.body.appendChild(ov);
}
ensureRouteOverlay();

function showRouteOverlay() {
  const ov = document.getElementById("routeOverlay");
  if (!ov) return;
  ov.classList.add("show");
}
function hideRouteOverlay() {
  const ov = document.getElementById("routeOverlay");
  if (!ov) return;
  ov.classList.remove("show");
}

/* =========================================================
   ✅ Topbar Chips
========================================================= */
function setMqttChip(state, detail = "") {
  const el = document.getElementById("mqttStatusChip");
  if (!el) return;

  if (state === "connected") el.textContent = "MQTT: 🟢 Connected";
  else if (state === "reconnecting") el.textContent = "MQTT: 🟡 Reconnecting";
  else if (state === "offline") el.textContent = "MQTT: 🔴 Offline";
  else el.textContent = "MQTT: …";

  el.title = detail || "";
}

function setApiChip(state, detail = "") {
  const el = document.getElementById("apiStatusChip");
  if (!el) return;

  if (state === "connected") el.textContent = "API: 🟢";
  else if (state === "checking") el.textContent = "API: …";
  else el.textContent = "API: 🔴";

  el.title = detail || "";
}

function isUnauthorizedError(e) {
  const msg = String(e?.message || e || "");
  return msg.includes("401") || msg.toLowerCase().includes("not authenticated");
}

function handleApiError(e) {
  if (isUnauthorizedError(e)) {
    setApiChip("offline", "401 Unauthorized");
    return true;
  }
  setApiChip("offline", String(e?.message || e));
  return false;
}

/* =========================================================
   ✅ normalize
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
      (inL1 && (inL1.value ?? inL1.current ?? inL1.amp ?? null)) ?? out.value ?? null;
  }

  return out;
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map(normalizeOne);
}

function topicToDeviceKey(topic) {
  if (!topic) return "";
  const parts = String(topic).split("/").filter(Boolean);
  if (parts[0] === "th") parts.shift();
  return parts.length >= 3 ? `${parts[0]}/${parts[1]}/${parts[2]}` : String(topic);
}

/* =========================================================
   ✅ DeviceStore
========================================================= */
const store = new DeviceStore({ normalizeItems });

function isLiveRoute(route) {
  return route === "overview" || route === "monitor" || route === "dashboard";
}

function emitToView(route, items) {
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

function getRouteFromHash() {
  const raw = (location.hash || "#overview").replace("#", "").trim();
  const r = (raw || "overview").replace(/^\/+/, "");
  return r || "overview";
}

/* =========================================================
   ✅ API Poll
========================================================= */
let __pollTimer = null;

function stopViewPoll() {
  if (__pollTimer) clearInterval(__pollTimer);
  __pollTimer = null;
}

function startViewPoll(route, intervalMs = 3000) {
  stopViewPoll();

  const tick = async () => {
    setApiChip("checking", "polling /api/devices");
    try {
      const data = await fetchJson(`${API_BASE}/api/devices`);
      setApiChip("connected", "OK");

      const rawItems = data?.items || [];
      store.upsertManyFromApi(rawItems, pickTopic);

      if (isLiveRoute(route)) {
        store.scheduleEmit((items) => emitToView(route, items));
      }
    } catch (e) {
      handleApiError(e);
    }
  };

  tick();
  __pollTimer = setInterval(tick, intervalMs);
}

/* =========================================================
   ✅ MQTT
========================================================= */
let __mqttConnected = false;

function restartPollForCurrentRoute() {
  const route = getRouteFromHash();
  if (!isLiveRoute(route)) return;

  startViewPoll(route, __mqttConnected ? 30000 : 3000);
  store.scheduleEmit((items) => emitToView(route, items));
}

function startMqtt() {
  const url = window.MQTT_URL || "";
  const username = window.MQTT_USERNAME || "";
  const password = window.MQTT_PASSWORD || "";

  createMqttClient({
    mqttUrl: url,
    username,
    password,
    onChip: setMqttChip,

    onConnect: (client) => {
      __mqttConnected = true;

      try {
        client.subscribe("th/#", (err) => {
          if (err) console.warn("MQTT subscribe err:", err);
        });
      } catch (e) {
        console.warn("MQTT subscribe fail:", e);
      }

      restartPollForCurrentRoute();
    },

    onMessage: (topic, payload) => {
      let obj = null;
      try {
        obj = JSON.parse(payload.toString());
      } catch {
        return;
      }

      const deviceKey = topicToDeviceKey(topic);
      const metric = String(topic).split("/").filter(Boolean).pop() || "meter";

      const item = {
        topic: deviceKey,
        device_topic: deviceKey,
        last_topic: String(topic),
        last_type: metric,
        ...obj,
      };

      store.upsert(deviceKey, item);

      const route = getRouteFromHash();
      if (isLiveRoute(route)) {
        store.scheduleEmit((items) => emitToView(route, items));
      }
    },
  });
}

/* =========================================================
   ✅ View CSS
========================================================= */
function loadViewCss(route) {
  return new Promise((resolve) => {
    const href = VIEW_CSS[route];
    if (!href) return resolve();

    if (currentCssLink && currentCssLink.getAttribute("data-href") === href) {
      return resolve();
    }

    const oldLink = currentCssLink;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href + "?v=" + Date.now();
    link.setAttribute("data-view-css", "1");
    link.setAttribute("data-href", href);

    link.onload = () => {
      if (oldLink) {
        try { oldLink.remove(); } catch {}
      }
      currentCssLink = link;
      resolve();
    };

    link.onerror = () => {
      try { link.remove(); } catch {}
      resolve();
    };

    document.head.appendChild(link);
  });
}

/* =========================================================
   ✅ View JS
========================================================= */
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

/* =========================================================
   ✅ View 로딩
========================================================= */
let __routeSeq = 0;
let __viewFetchAbort = null;

async function loadView(route) {
  const url = ROUTES[route] || ROUTES.overview;
  const seq = ++__routeSeq;

  try { __viewFetchAbort?.abort(); } catch {}
  __viewFetchAbort = new AbortController();

  showRouteOverlay();

  try {
    stopViewPoll();

    const res = await fetch(url + "?v=" + Date.now(), {
      cache: "no-store",
      signal: __viewFetchAbort.signal,
    });
    if (!res.ok) throw new Error(`Failed to load view: ${url}`);
    const htmlText = await res.text();

    if (seq !== __routeSeq) return;

    await loadViewCss(route);
    if (seq !== __routeSeq) return;

    try {
      if (typeof window.__viewCleanup__ === "function") window.__viewCleanup__();
    } catch {}
    window.__viewCleanup__ = null;

    unloadViewJs();
    viewEl.innerHTML = htmlText;

    viewEl.classList.remove("routeSwapIn");
    void viewEl.offsetWidth;
    viewEl.classList.add("routeSwapIn");

    await loadViewJs(route);
    if (seq !== __routeSeq) return;

    if (route === "developer" && typeof window.initDeveloperPage === "function") {
      try { window.initDeveloperPage(); } catch {}
    }

    if (isLiveRoute(route)) {
      startViewPoll(route, __mqttConnected ? 30000 : 3000);
      store.scheduleEmit((items) => emitToView(route, items));

      const prev = window.__viewCleanup__;
      window.__viewCleanup__ = () => {
        try { stopViewPoll(); } catch {}
        try { unloadViewJs(); } catch {}
        try { if (typeof prev === "function") prev(); } catch {}
      };
    }

    try { window.scrollTo(0, 0); } catch {}
  } catch (err) {
    if (String(err?.name || "").toLowerCase().includes("abort")) return;

    console.error(err);
    viewEl.innerHTML = `
      <div class="contentCard">
        <div class="k">Error</div>
        <div class="v">View Load Failed</div>
        <div class="muted" style="margin-top:8px;">${String(err)}</div>
      </div>
    `;
  } finally {
    if (seq === __routeSeq) hideRouteOverlay();
  }
}

/* =========================================================
   ✅ 라우팅
========================================================= */
async function route() {
  const r = getRouteFromHash();
  await loadView(r);
}
window.addEventListener("hashchange", route);

/* =========================================================
   ✅ 부팅
========================================================= */
async function boot() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindTopLogout);
  } else {
    bindTopLogout();
  }

  if (!isLoggedIn()) return goLoginPage();

  // ✅ 부팅 시 API 상태 확인 (401이면 1회 재시도 후 로그인으로)
  setApiChip("checking", "checking /api/auth/me");
  let tried = false;

  const checkMe = async () => {
    try {
      const me = await fetchJson(`${API_BASE}/api/auth/me`);
      setApiChip("connected", "OK");
      setTopUserUI(me);
    } catch (e) {
      const unauth = handleApiError(e);

      if (unauth && !tried) {
        tried = true;
        // 쿠키/세션 준비 지연 대비(짧게 한번만 재시도)
        setTimeout(checkMe, 700);
        return;
      }

      if (unauth) {
        try { goLoginPage(); } catch {}
        return;
      }

      console.warn("me failed:", e?.message || e);
    }
  };

  checkMe();

  startMqtt();

  if (!location.hash) location.hash = "#dashboard";
  route();
}

boot();