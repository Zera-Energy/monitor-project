// /js/mock/mock.devices.js

function makeSummary(seed = 0) {
  return {
    v12: 398 + (seed % 5),
    v23: 401 + (seed % 4),
    v31: 400 + (seed % 3),

    a1: 22 + seed,
    a2: 20 + seed,
    a3: 24 + seed,

    kw1: 8 + seed * 0.5,
    kw2: 7 + seed * 0.4,
    kw3: 9 + seed * 0.3,
    kwt: 24 + seed,

    kvar: 4 + seed * 0.3,
    kva: 26 + seed * 0.8,
    pf: 0.94,
    hz: 50.0,

    thdv: 3.2 + seed * 0.2,
    thda: 4.1 + seed * 0.3,

    kwh: 1200 + seed * 120,
    saved: 120 + seed * 10,
    co2: 80 + seed * 8,
  };
}

const MOCK_DEVICES = [
  {
    id: "mock-1",
    key: "site001/pg46/001",
    device_key: "site001/pg46/001",
    label: "Site 001 - PG46 - Meter 001",
    name: "Meter 001",
    site: "Site 001",
    area: "Bangkok A",
    customer: "Demo Customer A",
    topic: "th/site001/pg46/001/meter",
    device_topic: "th/site001/pg46/001/meter",
    online: true,
    last_seen: new Date().toISOString(),
    summary: makeSummary(1),
  },
  {
    id: "mock-2",
    key: "site001/pg46/002",
    device_key: "site001/pg46/002",
    label: "Site 001 - PG46 - Meter 002",
    name: "Meter 002",
    site: "Site 001",
    area: "Bangkok B",
    customer: "Demo Customer A",
    topic: "th/site001/pg46/002/meter",
    device_topic: "th/site001/pg46/002/meter",
    online: true,
    last_seen: new Date().toISOString(),
    summary: makeSummary(2),
  },
  {
    id: "mock-3",
    key: "site001/pg46/003",
    device_key: "site001/pg46/003",
    label: "Site 001 - PG46 - Meter 003",
    name: "Meter 003",
    site: "Site 001",
    area: "Bangkok C",
    customer: "Demo Customer A",
    topic: "th/site001/pg46/003/meter",
    device_topic: "th/site001/pg46/003/meter",
    online: true,
    last_seen: new Date().toISOString(),
    summary: makeSummary(3),
  },
  {
    id: "mock-4",
    key: "site002/pg46/001",
    device_key: "site002/pg46/001",
    label: "Site 002 - PG46 - Meter 001",
    name: "Meter 001",
    site: "Site 002",
    area: "Chiang Mai A",
    customer: "Demo Customer B",
    topic: "th/site002/pg46/001/meter",
    device_topic: "th/site002/pg46/001/meter",
    online: true,
    last_seen: new Date().toISOString(),
    summary: makeSummary(4),
  },
  {
    id: "mock-5",
    key: "site002/pg46/002",
    device_key: "site002/pg46/002",
    label: "Site 002 - PG46 - Meter 002",
    name: "Meter 002",
    site: "Site 002",
    area: "Chiang Mai B",
    customer: "Demo Customer B",
    topic: "th/site002/pg46/002/meter",
    device_topic: "th/site002/pg46/002/meter",
    online: false,
    last_seen: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    summary: makeSummary(5),
  },
];

export function getMockDevices() {
  return MOCK_DEVICES.map((item) => ({
    ...item,
    summary: { ...item.summary },
  }));
}

export function getMockDeviceByKey(key) {
  const found = MOCK_DEVICES.find((item) => item.key === key || item.device_key === key);
  if (!found) return null;

  return {
    ...found,
    summary: { ...found.summary },
  };
}