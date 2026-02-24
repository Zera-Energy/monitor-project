// /js/mqtt-live.js

const HIVEMQ = {
  host: "babc7822e95e4348ad220c1aaf947ed2.s1.eu.hivemq.cloud",
  wsPort: 8884,
  username: "web_reader",      // ✅ 웹용 계정(권장: subscribe만 허용)
  password: "YOUR_PASSWORD",
};

const SUBSCRIBE_TOPIC = "th/#"; // ✅ 현장 확장 핵심: 한 번만 구독

let client = null;
const state = { connected: false, last: new Map() };

function setStatus() {
  const el = document.querySelector('[data-mqtt="status"]');
  if (el) el.textContent = state.connected ? "Connected" : "Disconnected";
}

function ensureCard(topic) {
  const grid = document.getElementById("mqttGrid");
  if (!grid) return null;

  // 이미 카드 있으면 재사용
  let card = grid.querySelector(`[data-card-topic="${topic}"]`);
  if (card) return card;

  // 없으면 새로 생성
  card = document.createElement("div");
  card.className = "contentCard";
  card.setAttribute("data-card-topic", topic);

  card.innerHTML = `
    <div class="k">Topic</div>
    <div style="font-weight:900; margin-top:4px;">${topic}</div>
    <div class="k" style="margin-top:10px;">Last</div>
    <div class="k" data-ts> - </div>
    <pre style="margin-top:8px; white-space:pre-wrap;" data-body>(waiting...)</pre>
  `;

  grid.prepend(card);
  return card;
}

function renderOne(topic, payloadText) {
  const card = ensureCard(topic);
  if (!card) return;

  const tsEl = card.querySelector("[data-ts]");
  const bodyEl = card.querySelector("[data-body]");

  if (tsEl) tsEl.textContent = new Date().toLocaleString();

  // JSON이면 예쁘게, 아니면 그대로
  let pretty = payloadText;
  try { pretty = JSON.stringify(JSON.parse(payloadText), null, 2); } catch (_) {}

  if (bodyEl) bodyEl.textContent = pretty;
}

export function mqttLiveStart() {
  if (!window.mqtt) {
    console.error("mqtt.js not loaded");
    return;
  }
  if (client) return;

  const url = `wss://${HIVEMQ.host}:${HIVEMQ.wsPort}/mqtt`;

  client = window.mqtt.connect(url, {
    username: HIVEMQ.username,
    password: HIVEMQ.password,
    clientId: "web_" + Math.random().toString(16).slice(2),
    clean: true,
    reconnectPeriod: 2000,
  });

  client.on("connect", () => {
    state.connected = true;
    setStatus();

    client.subscribe(SUBSCRIBE_TOPIC, { qos: 0 }, (err) => {
      if (err) console.error("subscribe error:", err);
    });
  });

  client.on("close", () => { state.connected = false; setStatus(); });
  client.on("reconnect", () => { state.connected = false; setStatus(); });
  client.on("error", () => { state.connected = false; setStatus(); });

  client.on("message", (topic, payload) => {
    const text = payload.toString();
    state.last.set(topic, text);
    renderOne(topic, text);
  });

  setStatus();
}

export function mqttLiveStop() {
  if (!client) return;
  try { client.end(true); } catch (_) {}
  client = null;
  state.connected = false;
  setStatus();
}
