// /js/view.location.js
// Leaflet이 로드된 다음 initLocationView가 호출됨

window.initLocationView = function initLocationView() {
  const mapEl = document.getElementById("map");
  if (!mapEl || !window.L) {
    console.warn("map element or Leaflet not ready", { mapEl: !!mapEl, L: !!window.L });
    return;
  }

  // 중복 생성 방지 (라우팅 재진입)
  if (window.__leafletMap__) {
    try { window.__leafletMap__.remove(); } catch {}
    window.__leafletMap__ = null;
  }

  // ✅ (추가) 혹시 mapEl이 아직 화면 레이아웃 계산이 안 된 상태면, 다음 tick에 생성
  // (라우팅으로 innerHTML 주입 직후 Leaflet이 width/height를 0으로 보는 경우가 있음)
  const ensureLayoutReady = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // 지도 생성
  const map = L.map(mapEl, { zoomControl: true }).setView([13.5, 101.0], 5);

  // OSM 타일
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  // ✅ (추가 핵심) 라우팅/레이아웃 타이밍 문제 해결: 강제로 사이즈 재계산
  // - 0ms / 200ms / 800ms 3번 정도 해두면 대부분 케이스 해결됨
  // - FitAll 눌러도 다시 잡히도록 같이 걸어둠
  function fixLeafletSize() {
    try { map.invalidateSize(true); } catch {}
  }

  // 만약 처음에 height가 0이면, 조금 기다렸다가 다시 시도
  if (!ensureLayoutReady(mapEl)) {
    setTimeout(fixLeafletSize, 0);
    setTimeout(fixLeafletSize, 200);
    setTimeout(fixLeafletSize, 800);
  } else {
    // 레이아웃이 정상이어도 한 번은 해주는 게 안전
    setTimeout(fixLeafletSize, 0);
  }

  // 샘플 마커 (나중에 실제 디바이스 좌표로 교체)
  const sample = [
    { name: "Device A", lat: 13.7563, lng: 100.5018, status: "online" }, // Bangkok
    { name: "Device B", lat: 10.8231, lng: 106.6297, status: "offline" }, // HCMC
  ];

  const markers = [];
  sample.forEach((d) => {
    const color = d.status === "online" ? "#22c55e" : "#9ca3af";
    const icon = L.divIcon({
      className: "devMarker",
      html: `<div style="
        width:12px;height:12px;border-radius:999px;
        background:${color};
        box-shadow:0 0 0 3px rgba(255,255,255,.95), 0 6px 14px rgba(0,0,0,.25);
      "></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });

    const m = L.marker([d.lat, d.lng], { icon }).addTo(map);
    m.bindPopup(`<b>${d.name}</b><br>Status: ${d.status}`);
    markers.push(m);
  });

  // 카운트 표시
  const withLoc = sample.length;
  const withoutLoc = 0;
  const elWith = document.getElementById("locWith");
  const elWithout = document.getElementById("locWithout");
  if (elWith) elWith.textContent = String(withLoc);
  if (elWithout) elWithout.textContent = String(withoutLoc);

  // Fit All
  const btnFit = document.getElementById("btnFitAll");
  btnFit?.addEventListener("click", () => {
    if (!markers.length) return;
    // ✅ (추가) Fit 전에 한번 사이즈 정리
    fixLeafletSize();
    const group = L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.2));
  });

  // Dropdown
  const btnSetLoc = document.getElementById("btnSetLoc");
  const menu = document.getElementById("locMenu");

  function closeMenu() {
    if (menu) menu.hidden = true;
  }
  btnSetLoc?.addEventListener("click", () => {
    if (!menu) return;
    menu.hidden = !menu.hidden;
  });

  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!t) return;
    if (t.closest(".locDrop")) return;
    closeMenu();
  });

  menu?.addEventListener("click", (e) => {
    const btn = e.target?.closest("[data-action]");
    if (!btn) return;
    const act = btn.dataset.action;
    if (act === "set-mode") alert("Set location mode (TODO)");
    if (act === "clear-mode") alert("Cancel (TODO)");
    closeMenu();
  });

  // Search (간단 버전: lat,lng 입력 지원 / 도시명은 추후 지오코딩)
  const inp = document.getElementById("locSearchInput");
  const btnS = document.getElementById("locSearchBtn");
  function doSearch() {
    const q = (inp?.value || "").trim();
    if (!q) return;

    // "lat,lng" 형식
    const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      map.setView([lat, lng], 12);
      return;
    }

    alert('Search는 지금 "lat,lng" 형식만 지원해. 예: 37.5665,126.9780');
  }
  btnS?.addEventListener("click", doSearch);
  inp?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSearch();
  });

  window.__leafletMap__ = map;

  // 라우트 이동 시 제거되도록 cleanup 제공
  window.__viewCleanup__ = () => {
    try { closeMenu(); } catch {}
    try { map.remove(); } catch {}
    window.__leafletMap__ = null;
  };
};