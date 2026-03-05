// /js/lib/deviceStore.js
export class DeviceStore {
  constructor({ normalizeItems }) {
    this.devicesByKey = new Map();   // ✅ deviceKey -> payload
    this.lastSeenByKey = new Map();  // ✅ deviceKey -> ms
    this.normalizeItems = normalizeItems || ((x) => x);

    this.OFFLINE_AFTER_MS = 15000;
    this.STALE_AFTER_MS = 8000;
    this.__emitTimer = null;
  }

  // ✅ th/site001/pg46/001/meter -> site001/pg46/001
  // ✅ site001/pg46/001          -> site001/pg46/001
  topicToDeviceKey(topic) {
    if (!topic) return "";
    const parts = String(topic).split("/").filter(Boolean);
    if (parts[0] === "th") parts.shift(); // remove prefix

    if (parts.length >= 3) return `${parts[0]}/${parts[1]}/${parts[2]}`;
    return String(topic);
  }

  touch(topicOrKey) {
    const key = this.topicToDeviceKey(topicOrKey);
    if (!key) return;
    this.lastSeenByKey.set(key, Date.now());
  }

  upsert(topicOrKey, payloadObj) {
    const key = this.topicToDeviceKey(topicOrKey);
    if (!key) return;

    // ✅ UI가 쓰기 편하게 "통일된 키"를 넣어줌
    const merged = {
      ...payloadObj,
      device_topic: key,
      topic: key,
    };

    this.devicesByKey.set(key, merged);
    this.touch(key);
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
      const key = this.topicToDeviceKey(it.device_topic || it.topic || "");
      const last = this.lastSeenByKey.get(key) || 0;
      const age = last ? (now - last) : 99999999;

      const is_offline = !last || age >= this.OFFLINE_AFTER_MS;
      const is_stale = !is_offline && age >= this.STALE_AFTER_MS;

      return {
        ...it,
        device_topic: key,
        topic: key,
        last_seen_ms: last || null,
        age_ms: age,
        is_offline,
        is_stale,
        status: is_offline ? "offline" : (is_stale ? "stale" : "online"),
      };
    });
  }

  getItems() {
    const raw = Array.from(this.devicesByKey.values());
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