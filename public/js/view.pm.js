// js/view.pm.js
(() => {
  const root = document.getElementById("pmView");
  if (!root) return;

  const drawer = root.querySelector("#drawer");
  const back = root.querySelector("#drawerBack");
  const meterList = root.querySelector("#meterList");
  const drawerBody = root.querySelector(".drawerBody");

  // ✅ app.js에 있는 API_BASE는 스코프 밖이라 여기서도 안전하게 기본값 둠
  const API_BASE = window.API_BASE || "http://127.0.0.1:8000";

  // ===== devices 캐시 =====
  const deviceState = {
    items: [],          // [{ value, label, raw }]
    loaded: false,
    loading: false,
    lastError: null,
    lastFetchAt: 0,
  };

  function openDrawer() {
    if (!drawer || !back) return;
    back.hidden = false;
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");

    // ✅ Drawer 열릴 때 장비 목록 로드 & meterSelect 옵션 적용
    ensureDevicesLoadedAndApply();
  }

  function closeDrawer() {
    if (!drawer || !back) return;
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    back.hidden = true;

    // 다음에 열 때 깔끔하게
    resetMetersToOneRow();
  }

  // ✅ 초기 상태 확정
  resetMetersToOneRow();
  closeDrawer();

  // =========================
  // ✅ API helpers
  // =========================
  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return await res.json();
  }

  // ✅ 서버 아이템에서 "장비 식별값" 뽑기 (topic 기반 우선 지원)
  function pickDeviceValue(item) {
    const v =
      // ✅ (추가) app.js 정규화/서버에서 topic 기반으로 내려올 때
      item?.device_topic ??
      item?.topic ??
      item?._raw_topic ??
      item?.device_display ??

      // 기존 후보들
      item?.mac ??
      item?.mac_id ??
      item?.device_id ??
      item?.id ??
      item?.uid ??
      item?.sn ??
      item?.serial ??
      item?.name ??
      item?.title;

    if (v == null) return "";
    return String(v);
  }

  function pickDeviceLabel(item, value) {
    // ✅ (추가) 보기 좋은 display가 있으면 우선 사용
    const display = item?.device_display;
    if (display) return String(display);

    // 보여줄 이름이 따로 있으면 붙여주기
    const name =
      item?.name ??
      item?.title ??
      item?.model ??
      item?.location ??
      "";

    const nameText = name ? String(name).trim() : "";
    if (nameText && nameText !== value) return `${value} — ${nameText}`;
    return value;
  }

  async function loadDevicesIfNeeded() {
    // 너무 자주 호출될 수 있으니 5초 캐시(원하면 늘려도 됨)
    const now = Date.now();
    if (deviceState.loaded && now - deviceState.lastFetchAt < 5000) return;
    if (deviceState.loading) return;

    deviceState.loading = true;
    deviceState.lastError = null;

    try {
      const data = await fetchJson(`${API_BASE}/api/devices`);
      const items = Array.isArray(data?.items) ? data.items : [];

      const mapped = [];
      for (const it of items) {
        const value = pickDeviceValue(it);
        if (!value) continue;
        mapped.push({
          value,
          label: pickDeviceLabel(it, value),
          raw: it,
        });
      }

      // 중복 제거 + 정렬(보기 좋게)
      const uniq = new Map();
      for (const d of mapped) {
        if (!uniq.has(d.value)) uniq.set(d.value, d);
      }

      deviceState.items = Array.from(uniq.values()).sort((a, b) =>
        a.label.localeCompare(b.label)
      );

      deviceState.loaded = true;
      deviceState.lastFetchAt = now;
    } catch (err) {
      deviceState.lastError = err;
      deviceState.items = [];
      deviceState.loaded = false;
    } finally {
      deviceState.loading = false;
    }
  }

  // =========================
  // ✅ meter row / select options
  // =========================
  function buildOptionsHtml({ selectedValue = "" } = {}) {
    // 로딩/에러 상태 표시
    if (deviceState.loading) {
      return `
        <option value="">Loading devices...</option>
      `;
    }

    if (deviceState.lastError) {
      return `
        <option value="">Failed to load devices</option>
      `;
    }

    // 정상
    const header = `<option value="">Select Meter Device</option>`;
    const opts = deviceState.items
      .map((d) => {
        const sel = d.value === selectedValue ? " selected" : "";
        return `<option value="${escapeHtmlAttr(d.value)}"${sel}>${escapeHtmlText(d.label)}</option>`;
      })
      .join("");

    // 선택값이 있는데 목록에 없으면(예: 예전 장비) 맨 위에 임시로 보여주기
    if (selectedValue && !deviceState.items.some((x) => x.value === selectedValue)) {
      return `
        ${header}
        <option value="${escapeHtmlAttr(selectedValue)}" selected>${escapeHtmlText(selectedValue)} (not found)</option>
        ${opts}
      `;
    }

    return header + opts;
  }

  function applyOptionsToAllMeterSelects() {
    if (!meterList) return;

    const selects = meterList.querySelectorAll(".meterSelect");
    selects.forEach((sel) => {
      const current = sel.value || "";
      sel.innerHTML = buildOptionsHtml({ selectedValue: current });

      if (current) sel.value = current;
    });
  }

  async function ensureDevicesLoadedAndApply() {
    deviceState.loading = true;
    deviceState.lastError = null;
    applyOptionsToAllMeterSelects();

    await loadDevicesIfNeeded();

    applyOptionsToAllMeterSelects();
  }

  function makeMeterRow() {
    const row = document.createElement("div");
    row.className = "meterRow";
    row.innerHTML = `
      <select class="meterSelect">
        ${buildOptionsHtml({ selectedValue: "" })}
      </select>
      <button class="removeMeterBtn" type="button" data-action="remove-meter" aria-label="Remove meter">🗑</button>
    `;
    return row;
  }

  function resetMetersToOneRow() {
    if (!meterList) return;

    const rows = meterList.querySelectorAll(".meterRow");
    if (rows.length === 0) {
      meterList.appendChild(makeMeterRow());
      return;
    }

    rows.forEach((r, idx) => {
      if (idx !== 0) r.remove();
    });

    const firstSel = meterList.querySelector(".meterRow .meterSelect");
    if (firstSel) {
      firstSel.value = "";
      firstSel.innerHTML = buildOptionsHtml({ selectedValue: "" });
    }
  }

  // =========================
  // ✅ utils (XSS 안전)
  // =========================
  function escapeHtmlText(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function escapeHtmlAttr(s) {
    return escapeHtmlText(s);
  }

  // =========================
  // ✅ 이벤트 위임
  // =========================
  const onClick = (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;

    if (t.closest("#btnAddProject")) {
      openDrawer();
      return;
    }

    if (t.closest("#drawerClose") || t.closest("#drawerCancel") || t.closest("#drawerBack")) {
      closeDrawer();
      return;
    }

    const tabBtn = t.closest(".drawerTabs .tab");
    if (tabBtn) {
      const tab = tabBtn.dataset.tab;

      root.querySelectorAll(".drawerTabs .tab").forEach((x) => x.classList.remove("active"));
      tabBtn.classList.add("active");

      root.querySelectorAll(".tabPane").forEach((p) => {
        p.style.display = (p.dataset.pane === tab) ? "" : "none";
      });

      if (drawerBody) drawerBody.scrollTop = 0;

      if (tab === "devices") ensureDevicesLoadedAndApply();

      return;
    }

    const addBtn = t.closest('[data-action="add-meter"]');
    if (addBtn) {
      if (meterList) {
        meterList.appendChild(makeMeterRow());
        applyOptionsToAllMeterSelects();
      }
      return;
    }

    const removeBtn = t.closest('[data-action="remove-meter"]');
    if (removeBtn) {
      const row = removeBtn.closest(".meterRow");
      if (!meterList) return;

      const rows = meterList.querySelectorAll(".meterRow");
      if (rows.length <= 1) {
        const sel = row?.querySelector("select");
        if (sel) sel.value = "";
      } else {
        row?.remove();
      }
      return;
    }
  };

  root.addEventListener("click", onClick);

  const prevCleanup = window.__viewCleanup__;
  window.__viewCleanup__ = () => {
    try { root.removeEventListener("click", onClick); } catch {}
    try {
      if (drawer && drawer.classList.contains("is-open")) closeDrawer();
      else resetMetersToOneRow();
    } catch {}
    try { if (typeof prevCleanup === "function") prevCleanup(); } catch {}
  };
})();
