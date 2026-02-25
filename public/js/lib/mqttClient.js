// /js/lib/mqttClient.js
import { showToast } from "../ui/toast.js";

export function createMqttClient({
  mqttUrl,
  username,
  password,
  onChip,
  onConnect,
  onMessage,
}) {
  if (typeof window.mqtt === "undefined") {
    onChip?.("offline", "mqtt.min.js not loaded");
    return { end() {} };
  }
  if (!mqttUrl) {
    onChip?.("offline", "MQTT_URL not set");
    return { end() {} };
  }

  let offlineTimer = null;
  let offlineNotified = false;

  function scheduleOfflineToast() {
    if (offlineTimer) return;
    offlineTimer = setTimeout(() => {
      offlineTimer = null;
      if (!offlineNotified) {
        offlineNotified = true;
        showToast("MQTT 연결이 끊겼습니다. (5초 이상 Offline)");
      }
    }, 5000);
  }

  function clearOfflineToast() {
    if (offlineTimer) clearTimeout(offlineTimer);
    offlineTimer = null;
    offlineNotified = false;
  }

  onChip?.("reconnecting", mqttUrl);

  const clientId = "web_" + Math.random().toString(16).slice(2);

  const client = window.mqtt.connect(mqttUrl, {
    clientId,
    username: username || undefined,
    password: password || undefined,
    keepalive: 30,
    reconnectPeriod: 2000,
    connectTimeout: 5000,
    clean: true,
  });

  client.on("connect", () => {
    onChip?.("connected", mqttUrl);
    clearOfflineToast();
    onConnect?.(client);
  });

  client.on("reconnect", () => onChip?.("reconnecting", mqttUrl));

  client.on("offline", () => {
    onChip?.("offline", mqttUrl);
    scheduleOfflineToast();
  });

  client.on("close", () => {
    onChip?.("offline", mqttUrl);
    scheduleOfflineToast();
  });

  client.on("error", (err) => {
    const msg = err?.message ? err.message : String(err);
    onChip?.("offline", msg);
    scheduleOfflineToast();
  });

  client.on("message", (topic, payload) => onMessage?.(topic, payload));

  return client;
}