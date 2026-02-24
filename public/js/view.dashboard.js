// /js/view.dashboard.js
(() => {
  const ONLINE_SEC = 60;
  const DI_COUNT = 16;

  const selDashDevice = document.getElementById("selDashDevice");
  const btnDashAuto = document.getElementById("btnDashAuto");
  const diGrid = document.getElementById("diGrid");

  const LS_KEY = "dash_selected_device_key";

  function setText(id, v){
    const el = document.getElementById(id);
    if (!el) return;
    const s = (v === undefined || v === null || v === "") ? "-" : String(v);
    el.textContent = s;
  }

  function n(v){
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  }
  function toFixedMaybe(v, nDigits=2){
    const x = n(v);
    return x === null ? v : x.toFixed(nDigits);
  }
  function avg3(a,b,c){
    const xs = [a,b,c].map(n).filter(x => x !== null);
    if (!xs.length) return null;
    return xs.reduce((s,x)=>s+x,0) / xs.length;
  }
  function getAny(obj, keys){
    if (!obj) return undefined;
    for (const k of keys){
      if (obj[k] !== undefined && obj[k] !== null) return obj[k];
    }
    return undefined;
  }

  // ✅ topic 우선 key/label
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

  // DI 타일 생성
  function makeDiTile(i){
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.innerHTML = `
      <div class="name">DI${i}</div>
      <div class="state" id="di${i}">-</div>
      <div class="small muted" id="di${i}Hint">-</div>
    `;
    return tile;
  }
  if (diGrid) {
    diGrid.innerHTML = "";
    for (let i=1;i<=DI_COUNT;i++){
      diGrid.appendChild(makeDiTile(i));
    }
  }

  // =========================
  // ✅ payload에서 channels "자동 생성" (last_payload까지 포함)
  // =========================
  function readFlat(payload, term, phase, metric){
    const p = payload || {};
    const ph = phase.toLowerCase(); // l1/l2/l3

    const candidates = [
      `${term}_${metric}_${ph}`, `${term}_${metric}${ph}`,
      `${term}${metric}_${ph}`,  `${term}${metric}${ph}`,
      `${term}_${metric}_${phase}`, `${term}_${metric}${phase}`,
      `${term}_${metric}${phase.toLowerCase()}`,
    ];

    if (metric === "a") candidates.push(`${term}_i_${ph}`, `${term}_current_${ph}`, `${term}_amp_${ph}`);
    if (metric === "v") candidates.push(`${term}_u_${ph}`, `${term}_volt_${ph}`, `${term}_voltage_${ph}`);
    if (metric === "kw") candidates.push(`${term}_p_${ph}`, `${term}_power_${ph}`, `${term}_pkw_${ph}`, `${term}_p_kw_${ph}`);
    if (metric === "pf") candidates.push(`${term}_powerfactor_${ph}`, `${term}_power_factor_${ph}`);

    for (const k of candidates){
      if (p[k] !== undefined && p[k] !== null) return p[k];
    }
    return undefined;
  }

  function readNested(payload, term, phase, metric){
    const p = payload || {};
    const ph = phase.toLowerCase();

    const node =
      p?.[term]?.[ph] ??
      p?.[term]?.[phase] ??
      p?.[term]?.[`L${ph.slice(1)}`] ??
      null;

    if (!node) return undefined;

    const keys =
      metric === "a"  ? ["a","amp","current","i","value"] :
      metric === "v"  ? ["v","volt","voltage","u"] :
      metric === "kw" ? ["kw","p_kw","power_kw","p","power"] :
      metric === "pf" ? ["pf","power_factor","powerfactor"] :
      [];

    return getAny(node, keys);
  }

  function buildChannelsFromPayload(payload){
    const terms = ["in","out"];
    const phases = ["L1","L2","L3"];
    const channels = [];

    for (const term of terms){
      for (const phase of phases){
        const a  = readFlat(payload, term, phase, "a")  ?? readNested(payload, term, phase, "a");
        const v  = readFlat(payload, term, phase, "v")  ?? readNested(payload, term, phase, "v");
        const kw = readFlat(payload, term, phase, "kw") ?? readNested(payload, term, phase, "kw");
        const pf = readFlat(payload, term, phase, "pf") ?? readNested(payload, term, phase, "pf");

        if (a === undefined && v === undefined && kw === undefined && pf === undefined) continue;

        channels.push({ term, phase, a, v, kw, pf });
      }
    }
    return channels;
  }

  // ✅ 여기만 “진짜 해결 포인트”
  function pickChannelsFromAny(payloadOrItem){
    const item = payloadOrItem || {};
    const payload = item.payload || item || {};

    // 1) payload.channels (비어있지 않을 때만)
    if (Array.isArray(payload.channels) && payload.channels.length) return payload.channels;

    // 2) payload.last_payload.channels (여기가 진짜일 확률 큼)
    const lp = payload.last_payload;
    if (lp && Array.isArray(lp.channels) && lp.channels.length) return lp.channels;

    // 3) last_payload 자체에서 생성
    if (lp && typeof lp === "object") {
      const builtLP = buildChannelsFromPayload(lp);
      if (builtLP.length) return builtLP;
    }

    // 4) summary_value에서도 생성 시도
    const sv = payload.summary_value;
    if (sv && typeof sv === "object") {
      const builtSV = buildChannelsFromPayload(sv);
      if (builtSV.length) return builtSV;
    }

    // 5) payload 자체에서 생성
    const built = buildChannelsFromPayload(payload);
    if (built.length) return built;

    return [];
  }

  function pickMetricFromCh(c){
    const A  = c?.a ?? c?.amp ?? c?.current ?? c?.value;
    const kW = c?.kw ?? c?.p_kw ?? c?.power_kw ?? c?.p;
    const V  = c?.v ?? c?.volt ?? c?.voltage;
    return { A:n(A), kW:n(kW), V:n(V) };
  }

  function fmtCell(c){
    if (!c) return "-";
    const m = pickMetricFromCh(c);
    const parts = [];
    if (m.A !== null) parts.push(`${m.A.toFixed(2)}A`);
    if (m.kW !== null) parts.push(`${m.kW.toFixed(2)}kW`);
    if (m.V !== null) parts.push(`${m.V.toFixed(1)}V`);
    return parts.length ? parts.join(" · ") : "-";
  }

  function sumKwByTerm(channels, term){
    const xs = channels
      .filter(c => c?.term === term)
      .map(c => n(c?.kw ?? c?.p_kw ?? c?.power_kw ?? c?.p))
      .filter(x => x !== null);

    return xs.length ? xs.reduce((a,b)=>a+b,0) : null;
  }

  // =========================
  // ✅ IO panel 생성/렌더
  // =========================
  function ensureIoPanel(){
    let host = document.getElementById("dashIoPanel");
    if (host) return host;

    const anchor = selDashDevice?.closest(".contentCard") || selDashDevice?.parentElement || document.body;

    host = document.createElement("section");
    host.id = "dashIoPanel";
    host.className = "contentCard";
    host.style.marginTop = "12px";

    host.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <div>
          <div class="k">IN/OUT (CT)</div>
          <div class="v" id="dashIoTitle" style="font-size:16px;">-</div>
        </div>
        <div style="text-align:right;">
          <div class="k">Saving</div>
          <div class="v" id="dashSavingMain" style="font-size:16px;">-</div>
          <div class="muted" id="dashSavingSub" style="font-size:12px;">-</div>
        </div>
      </div>

      <div style="margin-top:10px; overflow:auto;">
        <table style="width:100%; border-collapse:collapse; min-width:520px;">
          <thead>
            <tr>
              <th style="text-align:left; padding:8px; border-bottom:1px solid #eee;">Term</th>
              <th style="text-align:left; padding:8px; border-bottom:1px solid #eee;">L1</th>
              <th style="text-align:left; padding:8px; border-bottom:1px solid #eee;">L2</th>
              <th style="text-align:left; padding:8px; border-bottom:1px solid #eee;">L3</th>
              <th style="text-align:left; padding:8px; border-bottom:1px solid #eee;">Σ</th>
            </tr>
          </thead>
          <tbody id="dashIoTbody">
            <tr><td colspan="5" class="muted" style="padding:10px;">No channel data</td></tr>
          </tbody>
        </table>
      </div>

      <div class="muted" id="dashIoHint" style="margin-top:8px;">* Values show A / kW / V if available.</div>
    `;

    anchor.insertAdjacentElement("afterend", host);
    return host;
  }

  function renderIoPanel(item){
    ensureIoPanel();

    const title = document.getElementById("dashIoTitle");
    const tbody = document.getElementById("dashIoTbody");
    const savingMain = document.getElementById("dashSavingMain");
    const savingSub = document.getElementById("dashSavingSub");

    if (title) title.textContent = item ? deviceLabel(item) : "-";
    if (!tbody) return;

    if (!item) {
      tbody.innerHTML = `<tr><td colspan="5" class="muted" style="padding:10px;">Select a device</td></tr>`;
      if (savingMain) savingMain.textContent = "-";
      if (savingSub) savingSub.textContent = "-";
      return;
    }

    const payload = item.payload || item;

    // ✅ 변경: 여기서 last_payload까지 포함해서 찾음
    const channels = pickChannelsFromAny(payload);

    const phases = ["L1","L2","L3"];
    const getCh = (term, phase) => channels.find(c => c?.term === term && c?.phase === phase) || null;

    if (!channels.length) {
      // 디버그(한 번만)
      if (!window.__noChannelLogged__) {
        window.__noChannelLogged__ = true;
        console.log("[dash] No channels. payload keys =", Object.keys(payload || {}));
        console.log("[dash] payload.last_payload keys =", Object.keys((payload || {})?.last_payload || {}));
        console.log("[dash] payload.sample =", payload);
      }

      tbody.innerHTML = `<tr><td colspan="5" class="muted" style="padding:10px;">No channel data</td></tr>`;
      if (savingMain) savingMain.textContent = "-";
      if (savingSub) savingSub.textContent = "-";
      return;
    }

    const inRow = phases.map(p => getCh("in", p));
    const outRow = phases.map(p => getCh("out", p));

    const inKw  = sumKwByTerm(channels, "in");
    const outKw = sumKwByTerm(channels, "out");

    let dKw = null, pct = null;
    if (inKw !== null && outKw !== null) {
      dKw = inKw - outKw;
      pct = (inKw !== 0) ? (dKw / inKw) * 100 : null;
    }

    if (savingMain) savingMain.textContent = (dKw !== null) ? `${dKw.toFixed(2)} kW` : "-";
    if (savingSub) savingSub.textContent = (pct !== null) ? `${pct.toFixed(1)} % (IN→OUT)` : "-";

    const makeTr = (label, arr, sumKw) => `
      <tr>
        <td style="padding:8px; border-bottom:1px solid #f3f3f3; font-weight:900;">${label}</td>
        <td style="padding:8px; border-bottom:1px solid #f3f3f3;">${fmtCell(arr[0])}</td>
        <td style="padding:8px; border-bottom:1px solid #f3f3f3;">${fmtCell(arr[1])}</td>
        <td style="padding:8px; border-bottom:1px solid #f3f3f3;">${fmtCell(arr[2])}</td>
        <td style="padding:8px; border-bottom:1px solid #f3f3f3; font-weight:900;">${sumKw !== null ? `${sumKw.toFixed(2)}kW` : "-"}</td>
      </tr>
    `;

    tbody.innerHTML =
      makeTr("IN", inRow, inKw) +
      makeTr("OUT", outRow, outKw);
  }

  // =========================
  // ✅ 기존 카드들 갱신(유지)
  // =========================
  function applySnapshot(snapshot){
    if (!snapshot) return;

    setText("commStatus", snapshot.online ? "ONLINE" : "OFFLINE");
    setText("lastSeen", snapshot.lastSeen ?? "-");

    setText("kwNow", snapshot.kw);
    setText("kwhTotal", snapshot.kwh);

    setText("pfAvg", snapshot.pf_avg);
    setText("pfAvgBadge", snapshot.pf_avg);

    setText("vAvg", snapshot.v_avg);
    setText("aAvg", snapshot.a_avg);

    setText("vL1", snapshot.v_l1); setText("vL2", snapshot.v_l2); setText("vL3", snapshot.v_l3);
    setText("aL1", snapshot.a_l1); setText("aL2", snapshot.a_l2); setText("aL3", snapshot.a_l3);
    setText("pfL1", snapshot.pf_l1); setText("pfL2", snapshot.pf_l2); setText("pfL3", snapshot.pf_l3);

    if (snapshot.di) {
      for (let i=1;i<=DI_COUNT;i++){
        const v = snapshot.di[i];
        setText(`di${i}`, (v === 1) ? "ON" : (v === 0) ? "OFF" : "-");
        setText(`di${i}Hint`, (v === 1) ? "활성" : (v === 0) ? "비활성" : "-");
      }
    }
  }
  window.applySnapshot = applySnapshot;

  // ✅ /api/devices item -> snapshot (last_payload 우선 반영)
  function mapListItemToSnapshot(listItem){
    const d = listItem || {};
    const payload = d.payload || d;
    const lp = (payload && typeof payload.last_payload === "object") ? payload.last_payload : null;

    const online = (d.online !== undefined)
      ? !!d.online
      : ((d.age_sec ?? 999999) < ONLINE_SEC);

    const lastSeenEpoch = Number(d.last_seen ?? 0);
    const lastSeen = lastSeenEpoch
      ? new Date(lastSeenEpoch * 1000).toLocaleString()
      : "-";

    // ✅ 채널 데이터는 last_payload 우선
    const channels = pickChannelsFromAny(payload);
    const findCh = (term, phase) => channels.find(x => x.term === term && x.phase === phase) || null;

    const inL1 = findCh("in","L1");
    const inL2 = findCh("in","L2");
    const inL3 = findCh("in","L3");

    // ✅ kw/pf 같은 대표값도 last_payload에 있으면 우선
    const kw  = getAny(lp, ["kw","p_kw","power_kw","p"]) ?? getAny(payload, ["kw","p_kw","power_kw","p"]) ?? getAny(d, ["kw"]);
    const kwh = getAny(lp, ["kwh","energy_kwh","E_kwh"]) ?? getAny(payload, ["kwh","energy_kwh","E_kwh"]) ?? getAny(d, ["kwh"]);
    const pf_avg = getAny(lp, ["pf_avg","pf","power_factor","PF"]) ?? getAny(payload, ["pf_avg","pf","power_factor","PF"]) ?? getAny(d, ["pf_avg","pf"]);

    const v_l1 = getAny(lp, ["v_l1","v1","vl1","vL1"]) ?? getAny(payload, ["v_l1","v1","vl1","vL1"]) ?? (inL1 ? (inL1.v ?? inL1.volt ?? inL1.voltage) : undefined);
    const v_l2 = getAny(lp, ["v_l2","v2","vl2","vL2"]) ?? getAny(payload, ["v_l2","v2","vl2","vL2"]) ?? (inL2 ? (inL2.v ?? inL2.volt ?? inL2.voltage) : undefined);
    const v_l3 = getAny(lp, ["v_l3","v3","vl3","vL3"]) ?? getAny(payload, ["v_l3","v3","vl3","vL3"]) ?? (inL3 ? (inL3.v ?? inL3.volt ?? inL3.voltage) : undefined);

    const a_l1 = getAny(lp, ["a_l1","a1","al1","aL1"]) ?? getAny(payload, ["a_l1","a1","al1","aL1"]) ?? (inL1 ? (inL1.a ?? inL1.amp ?? inL1.current ?? inL1.value) : undefined);
    const a_l2 = getAny(lp, ["a_l2","a2","al2","aL2"]) ?? getAny(payload, ["a_l2","a2","al2","aL2"]) ?? (inL2 ? (inL2.a ?? inL2.amp ?? inL2.current ?? inL2.value) : undefined);
    const a_l3 = getAny(lp, ["a_l3","a3","al3","aL3"]) ?? getAny(payload, ["a_l3","a3","al3","aL3"]) ?? (inL3 ? (inL3.a ?? inL3.amp ?? inL3.current ?? inL3.value) : undefined);

    const pf_l1 = getAny(lp, ["pf_l1","pf1","pfl1","pfL1"]) ?? getAny(payload, ["pf_l1","pf1","pfl1","pfL1"]) ?? (inL1 ? (inL1.pf ?? inL1.power_factor) : undefined);
    const pf_l2 = getAny(lp, ["pf_l2","pf2","pfl2","pfL2"]) ?? getAny(payload, ["pf_l2","pf2","pfl2","pfL2"]) ?? (inL2 ? (inL2.pf ?? inL2.power_factor) : undefined);
    const pf_l3 = getAny(lp, ["pf_l3","pf3","pfl3","pfL3"]) ?? getAny(payload, ["pf_l3","pf3","pfl3","pfL3"]) ?? (inL3 ? (inL3.pf ?? inL3.power_factor) : undefined);

    const v_avg = getAny(lp, ["v_avg","v"]) ?? getAny(payload, ["v_avg","v"]) ?? avg3(v_l1, v_l2, v_l3);
    const a_avg = getAny(lp, ["a_avg","a"]) ?? getAny(payload, ["a_avg","a"]) ?? avg3(a_l1, a_l2, a_l3);
    const pfAvgFinal = (pf_avg !== undefined && pf_avg !== null) ? pf_avg : avg3(pf_l1, pf_l2, pf_l3);

    const diRaw =
      getAny(lp, ["di","DI","digital_inputs","inputs"]) ??
      getAny(payload, ["di","DI","digital_inputs","inputs"]) ??
      getAny(d, ["di"]);

    const di = {};
    if (Array.isArray(diRaw)) {
      for (let i=1;i<=DI_COUNT;i++){
        di[i] = (diRaw[i] !== undefined) ? diRaw[i] : (diRaw[i-1] !== undefined ? diRaw[i-1] : undefined);
      }
    } else if (diRaw && typeof diRaw === "object") {
      for (let i=1;i<=DI_COUNT;i++){
        di[i] = diRaw[i] ?? diRaw[String(i)] ?? diRaw[`di${i}`] ?? diRaw[`DI${i}`];
      }
    }

    return {
      online,
      lastSeen,
      kw:  kw  !== undefined ? toFixedMaybe(kw, 2)  : "-",
      kwh: kwh !== undefined ? toFixedMaybe(kwh, 2) : "-",
      pf_avg: pfAvgFinal !== undefined ? toFixedMaybe(pfAvgFinal, 3) : "-",
      v_avg:  v_avg  !== undefined ? toFixedMaybe(v_avg, 1)  : "-",
      a_avg:  a_avg  !== undefined ? toFixedMaybe(a_avg, 2)  : "-",
      v_l1: v_l1 !== undefined ? toFixedMaybe(v_l1, 1) : "-",
      v_l2: v_l2 !== undefined ? toFixedMaybe(v_l2, 1) : "-",
      v_l3: v_l3 !== undefined ? toFixedMaybe(v_l3, 1) : "-",
      a_l1: a_l1 !== undefined ? toFixedMaybe(a_l1, 2) : "-",
      a_l2: a_l2 !== undefined ? toFixedMaybe(a_l2, 2) : "-",
      a_l3: a_l3 !== undefined ? toFixedMaybe(a_l3, 2) : "-",
      pf_l1: pf_l1 !== undefined ? toFixedMaybe(pf_l1, 3) : "-",
      pf_l2: pf_l2 !== undefined ? toFixedMaybe(pf_l2, 3) : "-",
      pf_l3: pf_l3 !== undefined ? toFixedMaybe(pf_l3, 3) : "-",
      di
    };
  }

  function setDeviceOptions(items){
    if (!selDashDevice) return;

    const saved = localStorage.getItem(LS_KEY) || "";
    const current = selDashDevice.value || saved || "";

    const opts = [`<option value="">Auto (최근 ONLINE)</option>`];
    for (const d of (items || [])) {
      const key = deviceKey(d);
      opts.push(`<option value="${key}">${deviceLabel(d)}</option>`);
    }

    selDashDevice.innerHTML = opts.join("");

    const candidate = current;
    if (candidate && Array.from(selDashDevice.options).some(o => o.value === candidate)) {
      selDashDevice.value = candidate;
    } else {
      selDashDevice.value = "";
    }
  }

  function pickDeviceAuto(items){
    if (!items || !items.length) return null;
    const online = items.filter(x => (x.online !== undefined ? !!x.online : (x.age_sec ?? 999999) < ONLINE_SEC));
    if (online.length) {
      online.sort((a,b)=>(a.age_sec??999999)-(b.age_sec??999999));
      return online[0];
    }
    const all = [...items];
    all.sort((a,b)=> (a.age_sec??999999)-(b.age_sec??999999));
    return all[0];
  }

  function findByKey(items, key){
    return (items || []).find(d => deviceKey(d) === key) || null;
  }

  selDashDevice?.addEventListener("change", () => {
    const v = selDashDevice.value || "";
    if (!v) localStorage.removeItem(LS_KEY);
    else localStorage.setItem(LS_KEY, v);
  });

  btnDashAuto?.addEventListener("click", () => {
    if (selDashDevice) selDashDevice.value = "";
    localStorage.removeItem(LS_KEY);
  });

  window.__dashboardOnDevices__ = (items) => {
    try {
      setDeviceOptions(items);

      const saved = localStorage.getItem(LS_KEY) || "";
      const selectedKey = (selDashDevice?.value || saved || "").trim();

      let d = null;
      if (selectedKey) d = findByKey(items, selectedKey);
      if (!d) d = pickDeviceAuto(items);

      if (!d) {
        applySnapshot({ online:false, lastSeen:"-", kw:"-", kwh:"-", pf_avg:"-", v_avg:"-", a_avg:"-", di:{} });
        renderIoPanel(null);
        return;
      }

      applySnapshot(mapListItemToSnapshot(d));
      renderIoPanel(d);
    } catch {
      applySnapshot({ online:false, lastSeen:"-", kw:"-", kwh:"-", pf_avg:"-", v_avg:"-", a_avg:"-", di:{} });
      renderIoPanel(null);
    }
  };

  const prev = window.__viewCleanup__;
  window.__viewCleanup__ = () => {
    try { delete window.__dashboardOnDevices__; } catch {}
    try { if (typeof prev === "function") prev(); } catch {}
  };
})();
