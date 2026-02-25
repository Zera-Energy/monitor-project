// /js/lib/deviceStore.js
export class DeviceStore {
  constructor({ normalizeItems }) {
    this.devicesByTopic = new Map(); // topic -> payload
    this.lastSeenByTopic = new Map(); // topic -> ms
    this.normalizeItems = normalizeItems || ((x) => x);

    this.OFFLINE_AFTER_MS = 15000; // 필요하면 조정
    this.STALE_AFTER_MS = 8000;

    this.__emitTimer = null;
  }

  touch(topic) {
    if (!topic) return;
    this.lastSeenByTopic.set(String(topic), Date.now());
  }

  upsert(topic, payloadObj) {
    if (!topic) return;
    this.devicesByTopic.set(String(topic), payloadObj);
    this.touch(topic);
  }

  upsertManyFromApi(rawItems, pickTopicFn) {
    if (!Array.isArray(rawItems)) return;
    for (const it of rawItems) {
      const t = pickTopicFn ? pickTopicFn(it) : (it?.device_topic || it?.topic || "");
      if (t) this.upsert(String(t), it);
    }
  }

  attachOnlineStatus(items) {
    const now = Date.now();
    return items.map((it) => {
      const topic = String(it.device_topic || it.topic || "");
      const last = this.lastSeenByTopic.get(topic) || 0;
      const age = last ? (now - last) : 99999999;

      const is_offline = !last || age >= this.OFFLINE_AFTER_MS;
      const is_stale = !is_offline && age >= this.STALE_AFTER_MS;

      return {
        ...it,
        last_seen_ms: last || null,
        age_ms: age,
        is_offline,
        is_stale,
        status: is_offline ? "offline" : (is_stale ? "stale" : "online"),
      };
    });
  }

  getItems() {
    const raw = Array.from(this.devicesByTopic.values());
    let items = this.normalizeItems(raw);
    items = this.attachOnlineStatus(items);
    return items;
  }

  scheduleEmit(fn, delayMs = 200) {
    if (this.__emitTimer) return;
    this.__emitTimer = setTimeout(() => {
      this.__emitTimer = null;
      fn(this.getItems());
    }, delayMs);
  }
}