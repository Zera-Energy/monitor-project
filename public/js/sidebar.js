// /js/sidebar.js

// ✅ 1) 사이드바 접기/펼치기 (Topbar의 ☰ 버튼)
(function setupSidebarCollapse() {
  const btnSidebar = document.getElementById("btnSidebar");
  if (!btnSidebar) return;

  // ✅ (추가) 접힘 상태 복원
  const saved = localStorage.getItem("sidebar_collapsed");
  if (saved === "1") document.body.classList.add("sidebar-collapsed");

  btnSidebar.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-collapsed");

    // ✅ (추가) 접힘 상태 저장
    const isCollapsed = document.body.classList.contains("sidebar-collapsed");
    localStorage.setItem("sidebar_collapsed", isCollapsed ? "1" : "0");
  });
})();

// ✅ 2) 그룹 접기/펼치기 (CONFIGURATIONS / DEVELOPER / USER SUPPORTS)
(function setupGroupToggle() {
  const LS_KEY = "sidebar_group_state";

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state || {}));
    } catch {}
  }

  const state = loadState();

  // ✅ (추가) 초기 상태 복원
  document.querySelectorAll(".groupHeader").forEach((btn) => {
    const id = btn.dataset.toggle;
    const group = document.getElementById(id);
    if (!id || !group) return;

    const shouldCollapse = state[id] === true; // true면 접힘
    if (shouldCollapse) group.classList.add("is-collapsed");

    const chev = btn.querySelector(".chev");
    if (chev) chev.textContent = group.classList.contains("is-collapsed") ? "▸" : "▾";
  });

  // ✅ 클릭 시 토글 + 저장
  document.querySelectorAll(".groupHeader").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.toggle;
      const group = document.getElementById(id);
      if (!group) return;

      const collapsed = group.classList.toggle("is-collapsed");

      // 화살표(chev) 방향 표시
      const chev = btn.querySelector(".chev");
      if (chev) chev.textContent = collapsed ? "▸" : "▾";

      // ✅ (추가) 상태 저장
      state[id] = collapsed;
      saveState(state);
    });
  });
})();

// ✅ 3) 메뉴 active 표시만 처리
// - 라우팅(fetch view 로딩)은 /js/app.js에서 담당
(function setupActiveByHash() {
  function setActive(route) {
    document.querySelectorAll(".menu .item").forEach((a) => a.classList.remove("active"));
    const target = document.querySelector(`.menu .item[data-route="${route}"]`);
    if (target) target.classList.add("active");
  }

  function routeFromHash() {
    const r = (location.hash || "#overview").replace("#", "").trim() || "overview";
    setActive(r);
  }

  window.addEventListener("hashchange", routeFromHash);
  routeFromHash();
})();

// ✅ 4) (추가) 접힌 상태에서 마우스 올리면 메뉴 이름 툴팁 뜨게 (data-tip 자동 세팅)
(function setupCollapsedTooltips() {
  document.querySelectorAll(".menu .item").forEach((a) => {
    const label = a.querySelector(".label")?.textContent?.trim() || "";
    if (label) {
      a.setAttribute("data-tip", label);
      // 브라우저 기본 title도 같이(백업)
      a.setAttribute("title", label);
    }
  });
})();
