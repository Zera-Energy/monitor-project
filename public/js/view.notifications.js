// /js/view.notifications.js
(() => {
  const $ = (id) => document.getElementById(id);

  const tbody = $("notiTbody");
  const sevSel = $("notiSeverity");
  const typeSel = $("notiType");
  const searchEl = $("notiSearch");

  const statTotal = $("notiStatTotal");
  const statInfo  = $("notiStatInfo");
  const statWarn  = $("notiStatWarn");
  const statCrit  = $("notiStatCrit");
  const lastUpdateEl = $("notiLastUpdate");

  const btnAskPerm = $("btnNotiAskPermission");
  const btnClearAck = $("btnNotiClearAck");
  const btnClearAll = $("btnNotiClearAll");

  const prevCleanup = window.__viewCleanup__;

  // ====== settings (튜닝값) ======
  const OFFLINE_SEC = 60;      // age_sec > 60 이면 offline alert
  const THD_WARN = 8.0;        // %
  const THD_CRIT = 12.0;       // %
  const PF_WARN  = 0.85;       // pf < 0.85
  const PF_CRIT  = 0.75;       // pf < 0.75

  // ====== storage ======
  const LS_KEY = "noti_events_v1";
  const LS_ACK = "noti_ack_v1";

  /** @type {{id:string, ts:number, timeText:string, severity:"info"|"warning"|"critical", type:string, deviceKey:string, deviceLabel:string, message:string, ack:boolean}[]} */
  let events = [];
  /** @type {Record<string, boolean>} */
  let ackMap = {};

  function loadPersist() {
    try { events = JSON.parse(localStorage.getItem(LS_KEY) || "[]") || []; } catch { events = []; }
    try { ackMap = JSON.parse(localStorage.getItem(LS_ACK) || "{}") || {}; } catch { ackMap = {}; }
    // ack 반영
    for (const e of events) e.ack = !!ackMap[e.id];
  }

  function savePersist() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(events.slice(0, 500))); } catch {}
    try { localStorage.setItem(LS_ACK, JSON.stringify(ackMap)); } catch {}
  }

  function nowTime() {
    return new Date().toLocaleString("en-GB");
  }

  function esc(s) {
    return String(s ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
  }

  function deviceKey(d){
    if (!d) return "";
    if (d.device_topic) return String(d.device_topic);
    if (d.topic) return String(d.topic);
    if (d._raw_topic) return String(d._raw_topic);
    if (d.country || d.site_id || d.model || d.device_id) return `${d.country}/${d.site_id}/${d.model}/${d.device_id}`;
    return String(d.id ?? "");
  }
  function deviceLabel(d){
    return String(d?.device_display ?? d?.device_short ?? deviceKey(d));
  }

  function pushEvent(ev) {
    // 중복 방지: 같은 type+deviceKey에 대해 최근 30초 안에 같은 메시지면 스킵
    const recently = events.find(x =>
      x.type === ev.type &&
      x.deviceKey === ev.deviceKey &&
      x.message === ev.message &&
      (ev.ts - x.ts) < 30_000
    );
    if (recently) return;

    events.unshift(ev);
    if (events.length > 500) events.length = 500;

    // 브라우저 알림(권한 있을 때만)
    try {
      if (Notification?.permission === "granted") {
        new Notification(`[${ev.severity.toUpperCase()}] ${ev.type}`, {
          body: `${ev.deviceLabel}\n${ev.message}`,
        });
      }
    } catch {}

    savePersist();
  }

  function severityDot(sev){
    const cls = sev === "critical" ? "critical" : sev === "warning" ? "warning" : "info";
    return `<span class="sev ${cls}"><span class="sevDot ${cls}"></span>${sev}</span>`;
  }

  function typeBadge(t){
    const cls =
      t === "offline" ? "offline" :
      t === "thd" ? "thd" :
      t === "pf" ? "pf" :
      t === "kw" ? "kw" : "";
    return `<span class="badgeType ${cls}">${esc(t)}</span>`;
  }

  function applyFilters(list){
    const sev = sevSel?.value || "all";
    const typ = typeSel?.value || "all";
    const q = (searchEl?.value || "").trim().toLowerCase();

    return list.filter(e => {
      if (sev !== "all" && e.severity !== sev) return false;
      if (typ !== "all" && e.type !== typ) return false;
      if (q) {
        const hay = `${e.deviceLabel} ${e.deviceKey} ${e.message} ${e.type} ${e.severity}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function render(){
    if (!tbody) return;

    const filtered = applyFilters(events);

    let info=0, warn=0, crit=0;
    for (const e of events) {
      if (e.severity === "critical") crit++;
      else if (e.severity === "warning") warn++;
      else info++;
    }

    if (statTotal) statTotal.textContent = `Total: ${events.length}`;
    if (statInfo)  statInfo.textContent  = `Info: ${info}`;
    if (statWarn)  statWarn.textContent  = `Warning: ${warn}`;
    if (statCrit)  statCrit.textContent  = `Critical: ${crit}`;

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty">No notifications</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(e => {
      const rowCls = e.ack ? "rowAck" : "";
      return `
        <tr class="${rowCls}" data-id="${esc(e.id)}">
          <td>${esc(e.timeText)}</td>
          <td>${severityDot(e.severity)}</td>
          <td>${typeBadge(e.type)}</td>
          <td>
            <div style="font-weight:900;">${esc(e.deviceLabel)}</div>
            <div class="muted" style="font-size:12px;">${esc(e.deviceKey)}</div>
          </td>
          <td>${esc(e.message)}</td>
          <td>${e.ack ? "✅ ACK" : "—"}</td>
          <td>
            <button class="btn" data-act="ack">${e.ack ? "Unack" : "Ack"}</button>
            <button class="btn" data-act="del">Delete</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  function mkId(deviceKey, type){
    // deviceKey가 길어도 안정적으로
    return `${type}|${deviceKey}|${Date.now()}|${Math.floor(Math.random()*1e6)}`;
  }

  function getNum(v){
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  }

  // ====== 규칙 감지 ======
  function evaluateDevice(d){
    const key = deviceKey(d);
    if (!key) return;

    const label = deviceLabel(d);
    const age = getNum(d.age_sec);

    // 1) Offline
    if (age !== null && age > OFFLINE_SEC) {
      pushEvent({
        id: mkId(key, "offline"),
        ts: Date.now(),
        timeText: nowTime(),
        severity: age > OFFLINE_SEC * 3 ? "critical" : "warning",
        type: "offline",
        deviceKey: key,
        deviceLabel: label,
        message: `No telemetry for ${Math.floor(age)} seconds`,
        ack: false,
      });
    }

    // 2) THD (summary에서 thd_before/thd_after 등을 쓰는 경우)
    const thd =
      getNum(d.thd_after ?? d.thdAfter ?? d.thd_a ?? d.thd) ??
      getNum(d.thd_before ?? d.thdBefore ?? d.thd_b) ??
      null;

    if (thd !== null) {
      const sev = thd >= THD_CRIT ? "critical" : thd >= THD_WARN ? "warning" : null;
      if (sev) {
        pushEvent({
          id: mkId(key, "thd"),
          ts: Date.now(),
          timeText: nowTime(),
          severity: sev,
          type: "thd",
          deviceKey: key,
          deviceLabel: label,
          message: `THD high: ${thd.toFixed(2)}%`,
          ack: false,
        });
      }
    }

    // 3) PF
    const pf = getNum(d.pf ?? d.power_factor);
    if (pf !== null) {
      const sev = pf <= PF_CRIT ? "critical" : pf <= PF_WARN ? "warning" : null;
      if (sev) {
        pushEvent({
          id: mkId(key, "pf"),
          ts: Date.now(),
          timeText: nowTime(),
          severity: sev,
          type: "pf",
          deviceKey: key,
          deviceLabel: label,
          message: `Power factor low: ${pf.toFixed(3)}`,
          ack: false,
        });
      }
    }

    // 4) kW (옵션: 너무 큰 부하 등)
    const kw = getNum(d.kw ?? d.kw_total ?? d.total_kw);
    if (kw !== null && kw >= 500) { // 임시 기준(원하는 값으로 조정)
      pushEvent({
        id: mkId(key, "kw"),
        ts: Date.now(),
        timeText: nowTime(),
        severity: "info",
        type: "kw",
        deviceKey: key,
        deviceLabel: label,
        message: `High power usage: ${kw.toFixed(2)} kW`,
        ack: false,
      });
    }
  }

  // ====== app.js에서 호출될 엔트리 ======
  window.__notificationsOnDevices__ = (items) => {
    if (lastUpdateEl) lastUpdateEl.textContent = `Last update: ${nowTime()}`;

    // items는 normalize된 장비 목록
    for (const d of (items || [])) {
      try { evaluateDevice(d); } catch {}
    }
    render();
  };

  // ====== UI handlers ======
  sevSel?.addEventListener("change", render);
  typeSel?.addEventListener("change", render);
  searchEl?.addEventListener("input", render);

  btnAskPerm?.addEventListener("click", async () => {
    try {
      if (!("Notification" in window)) return alert("This browser does not support notifications.");
      const p = await Notification.requestPermission();
      if (p === "granted") alert("Enabled!");
      else alert("Permission denied.");
    } catch {
      alert("Failed to request permission.");
    }
  });

  btnClearAck?.addEventListener("click", () => {
    // ACK 된 것만 제거
    events = events.filter(e => !e.ack);
    ackMap = {};
    savePersist();
    render();
  });

  btnClearAll?.addEventListener("click", () => {
    if (!confirm("Clear all notifications?")) return;
    events = [];
    ackMap = {};
    savePersist();
    render();
  });

  document.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button[data-act]");
    if (!btn) return;
    const tr = btn.closest("tr[data-id]");
    const id = tr?.getAttribute("data-id");
    if (!id) return;

    const act = btn.getAttribute("data-act");
    if (act === "ack") {
      const ev = events.find(x => x.id === id);
      if (!ev) return;
      ev.ack = !ev.ack;
      if (ev.ack) ackMap[id] = true;
      else delete ackMap[id];
      savePersist();
      render();
      return;
    }

    if (act === "del") {
      events = events.filter(x => x.id !== id);
      delete ackMap[id];
      savePersist();
      render();
      return;
    }
  });

  // init
  loadPersist();
  render();

  window.__viewCleanup__ = () => {
    try { if (window.__notificationsOnDevices__) delete window.__notificationsOnDevices__; } catch {}
    try { if (typeof prevCleanup === "function") prevCleanup(); } catch {}
  };
})();