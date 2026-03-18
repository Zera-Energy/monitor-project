// /js/lib/alerts.js

const STORAGE_KEY = "monitor_alerts_v1";

export const ALERT_LIMITS = {
  voltageHigh: 250,
  currentHigh: 100,
  pfLow: 0.8,
  thdHigh: 10,
};

const ALERT_COOLDOWN_MS = 15000;

// =======================
// 기본 저장/불러오기
// =======================

export function loadAlerts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveAlerts(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));

  // 🔥 핵심: 화면 자동 갱신 이벤트
  window.dispatchEvent(new CustomEvent("alerts-changed"));
}

// =======================
// 알림 생성
// =======================

function isDuplicate(list, next) {
  return list.some((a) => {
    if (a.ack) return false;
    if (a.key !== next.key) return false;
    if (a.code !== next.code) return false;

    const diff = Math.abs(a.time - next.time);
    return diff < ALERT_COOLDOWN_MS;
  });
}

export function pushAlert(alert) {
  const list = loadAlerts();

  const next = {
    id: `${Date.now()}_${alert.key}_${alert.code}`,
    level: alert.level,
    type: alert.type,
    code: alert.code,
    key: alert.key,
    label: alert.label,
    message: alert.message,
    value: alert.value,
    threshold: alert.threshold,
    unit: alert.unit,
    time: Date.now(),
    ack: false,
  };

  if (isDuplicate(list, next)) {
    return;
  }

  list.unshift(next);
  saveAlerts(list);

  return next;
}

// =======================
// ACK 처리
// =======================

export function ackAlert(id) {
  const list = loadAlerts().map((a) => {
    if (a.id === id) {
      return { ...a, ack: true };
    }
    return a;
  });

  saveAlerts(list);
}

// =======================
// 삭제
// =======================

export function clearAcked() {
  const list = loadAlerts().filter((a) => !a.ack);
  saveAlerts(list);
}

export function clearAll() {
  saveAlerts([]);
}

// =======================
// 카운트
// =======================

export function getUnackedCount() {
  return loadAlerts().filter((a) => !a.ack).length;
}