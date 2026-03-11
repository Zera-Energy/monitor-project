// /js/view.pm.js
(() => {
  const root = document.getElementById("pmView");
  if (!root) return;

  const drawer = root.querySelector("#drawer");
  const back = root.querySelector("#drawerBack");
  const meterList = root.querySelector("#meterList");
  const drawerBody = root.querySelector(".drawerBody");

  const tableBody =
    root.querySelector("#pmTableBody") ||
    root.querySelector(".pmTable tbody");

  const footerInfo =
    root.querySelector("#pmFooterInfo") ||
    root.querySelector(".pmFooter > div:first-child");

  const pageSizeEl = root.querySelector("#pmPageSize");
  const tableSearchEl = root.querySelector("#pmTableSearch");
  const tableRefreshEl = root.querySelector("#pmTableRefresh");

  const API_BASE = window.API_BASE || "http://127.0.0.1:8000";
  const STORAGE_KEY = "pm_projects_v1";

  // ===== devices 캐시 =====
  const deviceState = {
    items: [],
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
    ensureDevicesLoadedAndApply();
  }

  function closeDrawer() {
    if (!drawer || !back) return;
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    back.hidden = true;
    resetFormToDefault();
  }

  // =========================
  // ✅ API helpers
  // =========================
  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return await res.json();
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${url}${txt ? ` / ${txt}` : ""}`);
    }

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      return await res.json();
    }
    return null;
  }

  // =========================
  // ✅ localStorage helpers
  // =========================
  function loadProjectsFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveProjectsToStorage(items) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items || []));
    } catch {}
  }

  function addProjectToStorage(project) {
    const items = loadProjectsFromStorage();
    items.unshift(project);
    saveProjectsToStorage(items);
    window.__pmProjects__ = items;
  }

  function deleteProjectById(id) {
    const items = loadProjectsFromStorage().filter(
      (x) => String(x.id) !== String(id)
    );
    saveProjectsToStorage(items);
    window.__pmProjects__ = items;
  }

  // =========================
  // ✅ utils
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

  function formatDateTime(ts) {
    if (!ts) return "-";
    const d = new Date(ts);

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");

    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  }

  function getAllProjects() {
    const items = loadProjectsFromStorage();
    window.__pmProjects__ = items;
    return items;
  }

  function getCurrentPageSize() {
    const raw = Number(pageSizeEl?.value || 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 10;
  }

  function getCurrentSearchText() {
    return String(tableSearchEl?.value || "").trim().toLowerCase();
  }

  function getFilteredProjects() {
    const items = getAllProjects();
    const q = getCurrentSearchText();
    if (!q) return items;

    return items.filter((p) => {
      const joined = [
        p.name,
        p.description,
        p.site,
        p.customer,
        p.owner,
        p.viewer,
        Array.isArray(p.meters) ? p.meters.join(" ") : "",
        p.enabled,
      ]
        .map((v) => String(v ?? "").toLowerCase())
        .join(" ");

      return joined.includes(q);
    });
  }

  function renderProjectTable() {
    if (!tableBody) return;

    const filtered = getFilteredProjects();
    const pageSize = getCurrentPageSize();
    const rows = filtered.slice(0, pageSize);

    if (!rows.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="11" class="pmEmpty">No data available in table</td>
        </tr>
      `;
      if (footerInfo) {
        footerInfo.textContent = "Showing 0 to 0 of 0 entries";
      }
      return;
    }

    tableBody.innerHTML = rows.map((item, idx) => {
      const meters = Array.isArray(item.meters) ? item.meters : [];
      const metersText = meters.length ? meters.join(", ") : "-";
      const owner = item.owner || "-";
      const viewer = item.viewer || "-";
      const folder = item.site || "-";
      const created = formatDateTime(item.createdAt);
      const updated = formatDateTime(item.updatedAt || item.createdAt);
      const enabled = item.enabled || "Disable";

      return `
        <tr data-project-id="${escapeHtmlAttr(item.id)}">
          <td>${idx + 1}</td>
          <td style="font-weight:800;">${escapeHtmlText(item.name || "-")}</td>
          <td>${escapeHtmlText(owner)}</td>
          <td>${escapeHtmlText(viewer)}</td>
          <td>${escapeHtmlText(folder)}</td>
          <td>${escapeHtmlText(created)}</td>
          <td>${escapeHtmlText(updated)}</td>
          <td>${escapeHtmlText(enabled)}</td>
          <td style="max-width:220px; word-break:break-word;">${escapeHtmlText(metersText)}</td>
          <td>${meters.length}</td>
          <td>
            <button
              class="pmMiniBtn"
              type="button"
              data-action="delete-project"
              data-id="${escapeHtmlAttr(item.id)}"
            >
              Delete
            </button>
          </td>
        </tr>
      `;
    }).join("");

    if (footerInfo) {
      footerInfo.textContent = `Showing 1 to ${rows.length} of ${filtered.length} entries`;
    }
  }

  // =========================
  // ✅ 서버 아이템에서 장비 식별값 뽑기
  // =========================
  function pickDeviceValue(item) {
    const v =
      item?.device_topic ??
      item?.topic ??
      item?._raw_topic ??
      item?.device_display ??
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
    const display = item?.device_display;
    if (display) return String(display);

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
    if (deviceState.loading) {
      return `<option value="">Loading devices...</option>`;
    }

    if (deviceState.lastError) {
      return `<option value="">Failed to load devices</option>`;
    }

    const header = `<option value="">Select Meter Device</option>`;
    const opts = deviceState.items
      .map((d) => {
        const sel = d.value === selectedValue ? " selected" : "";
        return `<option value="${escapeHtmlAttr(d.value)}"${sel}>${escapeHtmlText(d.label)}</option>`;
      })
      .join("");

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

  function makeMeterRow(selectedValue = "") {
    const row = document.createElement("div");
    row.className = "meterRow";
    row.innerHTML = `
      <select class="meterSelect">
        ${buildOptionsHtml({ selectedValue })}
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

  function getMeterValues() {
    if (!meterList) return [];
    return Array.from(meterList.querySelectorAll(".meterSelect"))
      .map((sel) => String(sel.value || "").trim())
      .filter(Boolean);
  }

  // =========================
  // ✅ form helpers
  // =========================
  function findFieldValue(selectors) {
    for (const selector of selectors) {
      const el = root.querySelector(selector);
      if (!el) continue;
      if ("value" in el) return String(el.value || "").trim();
      return String(el.textContent || "").trim();
    }
    return "";
  }

  function setFieldValue(selectors, value = "") {
    for (const selector of selectors) {
      const el = root.querySelector(selector);
      if (!el) continue;
      if ("value" in el) {
        el.value = value;
        return;
      }
    }
  }

  function collectFormData() {
    const name = findFieldValue([
      "#projectName",
      "[name='projectName']",
      "#name",
      "[name='name']",
      "#projectTitle",
      "[name='projectTitle']",
    ]);

    const description = findFieldValue([
      "#projectDescription",
      "[name='projectDescription']",
      "#description",
      "[name='description']",
    ]);

    const site = findFieldValue([
      "#projectSite",
      "[name='projectSite']",
      "#site",
      "[name='site']",
      "#locationName",
      "[name='locationName']",
    ]);

    const customer = findFieldValue([
      "#customerName",
      "[name='customerName']",
      "#customer",
      "[name='customer']",
    ]);

    const owner = findFieldValue([
      "#projectOwner",
      "[name='projectOwner']",
      "#owner",
      "[name='owner']",
    ]);

    const viewer = findFieldValue([
      "#projectViewers",
      "[name='projectViewers']",
      "#viewer",
      "[name='viewer']",
    ]);

    const enabled = findFieldValue([
      "#projectEnable",
      "[name='projectEnable']",
    ]) || "Disable";

    const meters = getMeterValues();

    return {
      id: `pm_${Date.now()}`,
      name,
      description,
      site,
      customer,
      owner,
      viewer,
      enabled,
      meters,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  function validateFormData(data) {
    if (!data.name) {
      alert("Project name is required.");
      return false;
    }

    if (!data.meters.length) {
      alert("Please select at least one meter device.");
      return false;
    }

    return true;
  }

  function resetFormToDefault() {
    setFieldValue(
      ["#projectName", "[name='projectName']", "#name", "[name='name']", "#projectTitle", "[name='projectTitle']"],
      ""
    );
    setFieldValue(
      ["#projectDescription", "[name='projectDescription']", "#description", "[name='description']"],
      ""
    );
    setFieldValue(
      ["#projectSite", "[name='projectSite']", "#site", "[name='site']", "#locationName", "[name='locationName']"],
      ""
    );
    setFieldValue(
      ["#customerName", "[name='customerName']", "#customer", "[name='customer']"],
      ""
    );
    setFieldValue(
      ["#projectOwner", "[name='projectOwner']", "#owner", "[name='owner']"],
      ""
    );
    setFieldValue(
      ["#projectViewers", "[name='projectViewers']", "#viewer", "[name='viewer']"],
      ""
    );
    setFieldValue(
      ["#projectEnable", "[name='projectEnable']"],
      "Disable"
    );
    resetMetersToOneRow();
  }

  async function saveProjectData() {
    const payload = collectFormData();
    if (!validateFormData(payload)) return;

    addProjectToStorage(payload);

    try {
      await postJson(`${API_BASE}/api/projects`, payload);
    } catch (err) {
      console.warn("[PM] server save skipped:", err?.message || err);
    }

    try {
      window.dispatchEvent(new CustomEvent("pm:project-added", { detail: payload }));
    } catch {}

    renderProjectTable();
    alert("Project added successfully.");
    closeDrawer();
  }

  function refreshProjectTable() {
    renderProjectTable();
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

    if (
      t.closest("#drawerClose") ||
      t.closest("#drawerCancel") ||
      t.closest("#drawerBack")
    ) {
      closeDrawer();
      return;
    }

    if (
      t.closest("#drawerSave") ||
      t.closest("#btnDrawerSave") ||
      t.closest('[data-action="save-project"]')
    ) {
      saveProjectData();
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

    const deleteBtn = t.closest('[data-action="delete-project"]');
    if (deleteBtn) {
      const id = deleteBtn.getAttribute("data-id");
      if (!id) return;
      if (!confirm("Delete this project?")) return;
      deleteProjectById(id);
      renderProjectTable();
      return;
    }
  };

  const onInput = () => {
    renderProjectTable();
  };

  const onChange = () => {
    renderProjectTable();
  };

  root.addEventListener("click", onClick);
  tableSearchEl?.addEventListener("input", onInput);
  pageSizeEl?.addEventListener("change", onChange);
  tableRefreshEl?.addEventListener("click", refreshProjectTable);

  resetMetersToOneRow();
  closeDrawer();
  renderProjectTable();

  const prevCleanup = window.__viewCleanup__;
  window.__viewCleanup__ = () => {
    try { root.removeEventListener("click", onClick); } catch {}
    try { tableSearchEl?.removeEventListener("input", onInput); } catch {}
    try { pageSizeEl?.removeEventListener("change", onChange); } catch {}
    try { tableRefreshEl?.removeEventListener("click", refreshProjectTable); } catch {}
    try {
      if (drawer && drawer.classList.contains("is-open")) closeDrawer();
      else resetFormToDefault();
    } catch {}
    try { if (typeof prevCleanup === "function") prevCleanup(); } catch {}
  };
})();