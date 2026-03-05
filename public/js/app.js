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
  products: "./views/overview.html",

  // ✅ FIX
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

  // ✅ FIX
  profile: "./css/view.profile.css",
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

  // ✅ FIX
  profile: "./js/view.profile.js",
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

/* =========================================================
   ✅ (그대로 유지) 장비 토픽 + 채널 정규화
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

/* =========================================================
   ✅ DeviceStore (단일 소스)
========================================================= */
const store = new DeviceStore({ normalizeItems });

function isLiveRoute(route) {
  return route === "overview" || route === "monitor" || route === "dashboard";
}

function emitToView(route, items) {
  if (route === "overview" && typeof window.__overviewOnDevices__ === "function") {
    try {
      window.__overviewOnDevices__(items);
    } catch {}
  }
  if (route === "monitor" && typeof window.__monitorOnDevices__ === "function") {
    try {
      window.__monitorOnDevices__(items);
    } catch {}
  }
  if (route === "dashboard" && typeof window.__dashboardOnDevices__ === "function") {
    try {
      window.__dashboardOnDevices__(items);
    } catch {}
  }
}

/* =========================
   ✅ 해시 라우트 파싱
========================= */
function getRouteFromHash() {
  const raw = (location.hash || "#overview").replace("#", "").trim();
  const r = (raw || "overview").replace(/^\/+/, "");
  return r || "overview";
}

/* =========================================================
   ✅ API Poll (백업)
========================================================= */
let __pollTimer = null;

function stopViewPoll() {
  if (__pollTimer) clearInterval(__pollTimer);
  __pollTimer = null;
}

function startViewPoll(route, intervalMs = 3000) {
  stopViewPoll();

  const tick = async () => {
    try {
      const data = await fetchJson(`${API_BASE}/api/devices`);
      const rawItems = data?.items || [];
      store.upsertManyFromApi(rawItems, pickTopic);

      if (isLiveRoute(route)) {
        store.scheduleEmit((items) => emitToView(route, items));
      }
    } catch {}
  };

  tick();
  __pollTimer = setInterval(tick, intervalMs);
}

/* =========================================================
   ✅ MQTT (실시간) + 오프라인 감지
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

    onReconnect: () => {
      __mqttConnected = false;
      restartPollForCurrentRoute();
    },

    onOffline: () => {
      __mqttConnected = false;
      restartPollForCurrentRoute();
    },
    onClose: () => {
      __mqttConnected = false;
      restartPollForCurrentRoute();
    },
    onError: () => {
      __mqttConnected = false;
      restartPollForCurrentRoute();
    },

    onMessage: (topic, payload) => {
      let obj = null;
      try {
        obj = JSON.parse(payload.toString());
      } catch {
        return;
      }

      const item = { topic, ...obj };
      store.upsert(topic, item);

      const route = getRouteFromHash();
      if (isLiveRoute(route)) {
        store.scheduleEmit((items) => emitToView(route, items));
      }
    },
  });
}

/* =========================================================
   ✅ View CSS 로드 (핵심 수정: 새 CSS 로드 후 기존 제거)
========================================================= */
function loadViewCss(route) {
  return new Promise((resolve) => {
    const href = VIEW_CSS[route];

    // 새 CSS가 없으면 기존 유지
    if (!href) return resolve();

    // 이미 같은 CSS면 스킵
    if (currentCssLink && currentCssLink.href && currentCssLink.href.includes(href)) {
      return resolve();
    }

    const oldLink = currentCssLink;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href + "?v=" + Date.now(); // 캐시 꼬임 방지
    link.setAttribute("data-view-css", "1");

    link.onload = () => {
      // ✅ 새 CSS 적용된 뒤 이전 CSS 제거 -> 깜빡임 최소화
      if (oldLink) {
        try { oldLink.remove(); } catch {}
      }
      currentCssLink = link;
      resolve();
    };

    link.onerror = () => {
      // 실패하면 기존 CSS 유지
      try { link.remove(); } catch {}
      resolve();
    };

    document.head.appendChild(link);
  });
}

/* =========================================================
   ✅ View JS 로드/언로드
========================================================= */
function unloadViewJs() {
  if (currentViewScript) {
    try {
      currentViewScript.remove();
    } catch {}
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
   ✅ View 로딩 (HTML만)
========================================================= */
async function loadView(route) {
  const url = ROUTES[route] || ROUTES.overview;

  try {
    try {
      if (typeof window.__viewCleanup__ === "function") window.__viewCleanup__();
    } catch {}
    window.__viewCleanup__ = null;

    stopViewPoll();
    unloadViewJs();

    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to load view: ${url}`);

    viewEl.innerHTML = await res.text();

    if (route === "developer" && typeof window.initDeveloperPage === "function") {
      try {
        window.initDeveloperPage();
      } catch {}
    }

    await loadViewJs(route);

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

/* =========================================================
   ✅ 라우팅
========================================================= */
async function route() {
  const r = getRouteFromHash();
  await loadViewCss(r);
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

  fetchJson(`${API_BASE}/api/auth/me`)
    .then((me) => setTopUserUI(me))
    .catch((e) => console.warn("me failed:", e?.message || e));

  startMqtt();

  if (!location.hash) location.hash = "#dashboard";
  route();
}

boot();