// /js/mock/mock.telemetry.js

import { getMockDevices } from "./mock.devices.js";

let timer = null;
let mockState = [];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 2) {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function vary(value, delta, min, max, digits = 2) {
  const next = value + randomBetween(-delta, delta);
  return round(clamp(next, min, max), digits);
}

function initState() {
  mockState = getMockDevices().map((device, index) => ({
    ...device,
    online: device.online,
    summary: { ...device.summary },
    _tick: 0,
    _offlineChance: index === 4 ? 0.18 : 0.04,
  }));
}

function updateOneDevice(device) {
  device._tick += 1;

  if (Math.random() < device._offlineChance) {
    device.online = !device.online;
  }

  if (!device.online) {
    return {
      type: "telemetry",
      device_key: device.device_key,
      topic: device.topic,
      online: false,
      ts: new Date().toISOString(),
      summary: { ...device.summary },
    };
  }

  const s = device.summary;

  s.v12 = vary(s.v12, 1.8, 385, 420, 1);
  s.v23 = vary(s.v23, 1.8, 385, 420, 1);
  s.v31 = vary(s.v31, 1.8, 385, 420, 1);

  s.a1 = vary(s.a1, 2.5, 5, 120, 1);
  s.a2 = vary(s.a2, 2.5, 5, 120, 1);
  s.a3 = vary(s.a3, 2.5, 5, 120, 1);

  s.kw1 = vary(s.kw1, 0.7, 1, 40, 2);
  s.kw2 = vary(s.kw2, 0.7, 1, 40, 2);
  s.kw3 = vary(s.kw3, 0.7, 1, 40, 2);
  s.kwt = round(s.kw1 + s.kw2 + s.kw3, 2);

  s.kvar = vary(s.kvar, 0.5, 0, 25, 2);
  s.kva = round(Math.max(s.kwt, s.kwt + s.kvar * 0.4), 2);

  s.pf = vary(s.pf, 0.02, 0.7, 0.99, 2);
  s.hz = vary(s.hz, 0.06, 49.7, 50.3, 2);

  s.thdv = vary(s.thdv, 0.4, 1, 15, 1);
  s.thda = vary(s.thda, 0.5, 1, 18, 1);

  s.kwh = round(s.kwh + randomBetween(0.08, 0.6), 3);
  s.saved = round(s.saved + randomBetween(0.01, 0.08), 3);
  s.co2 = round(s.co2 + randomBetween(0.01, 0.06), 3);

  // 일부러 알림 테스트용 스파이크
  if (Math.random() < 0.07) s.v12 = round(randomBetween(251, 260), 1);
  if (Math.random() < 0.07) s.a1 = round(randomBetween(101, 118), 1);
  if (Math.random() < 0.07) s.pf = round(randomBetween(0.72, 0.79), 2);
  if (Math.random() < 0.07) s.thdv = round(randomBetween(10.5, 13.5), 1);

  return {
    type: "telemetry",
    device_key: device.device_key,
    topic: device.topic,
    online: true,
    ts: new Date().toISOString(),
    summary: { ...s },
  };
}

export function startMockTelemetry(onMessage, intervalMs = 2000) {
  stopMockTelemetry();
  initState();

  timer = setInterval(() => {
    mockState.forEach((device) => {
      const msg = updateOneDevice(device);
      onMessage(msg);
    });
  }, intervalMs);
}

export function stopMockTelemetry() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function metricValueFromSummary(summary, metric) {
  switch (metric) {
    case "kwh":
      return Number(summary.kwh || 0);
    case "kwt":
    case "kw":
      return Number(summary.kwt || 0);
    case "pf":
      return Number(summary.pf || 0);
    case "thdv":
      return Number(summary.thdv || 0);
    case "thda":
      return Number(summary.thda || 0);
    case "v12":
      return Number(summary.v12 || 0);
    case "a1":
      return Number(summary.a1 || 0);
    default:
      return Number(summary.kwh || 0);
  }
}

export function buildInitialTrendSeries(deviceKey, metric = "kwh", count = 24) {
  const devices = getMockDevices();
  const device = devices.find((d) => d.device_key === deviceKey || d.key === deviceKey);
  if (!device) return { labels: [], values: [] };

  const labels = [];
  const values = [];
  let base = metricValueFromSummary(device.summary, metric);

  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 60 * 1000);
    labels.push(
      `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    );

    base = vary(base, Math.max(Math.abs(base) * 0.03, 0.3), Math.max(base * 0.5, 0), base * 1.3 + 5, 2);
    values.push(base);
  }

  return { labels, values };
}

export function buildMiniSeries(deviceKey, type = "energyTrend", count = 12) {
  const devices = getMockDevices();
  const device = devices.find((d) => d.device_key === deviceKey || d.key === deviceKey);
  if (!device) return { labels: [], values: [] };

  const labels = [];
  const values = [];

  let baseKwh = Number(device.summary.kwh || 0);
  let rate = 4.2;

  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 60 * 60 * 1000);

    labels.push(
      `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:00`
    );

    if (type === "energyTrend") {
      baseKwh += randomBetween(0.5, 3.5);
      values.push(round(baseKwh, 2));
    } else if (type === "energyCost") {
      baseKwh += randomBetween(0.5, 3.5);
      values.push(round(baseKwh * rate, 2));
    } else if (type === "energyHistorical") {
      values.push(round(randomBetween(10, 55), 2));
    } else {
      values.push(round(randomBetween(1, 20), 2));
    }
  }

  return { labels, values };
}