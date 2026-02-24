// /js/view.location.js
// ✅ app.js가 location 라우트 진입 시 이 파일을 로드함

(function () {
  function loadCssOnce(href, id) {
    return new Promise((resolve) => {
      if (id && document.getElementById(id)) return resolve();
      const l = document.createElement("link");
      if (id) l.id = id;
      l.rel = "stylesheet";
      l.href = href;
      l.onload = () => resolve();
      l.onerror = () => resolve();
      document.head.appendChild(l);
    });
  }

  function loadScriptOnce(src, id) {
    return new Promise((resolve) => {
      if (id && document.getElementById(id)) return resolve();
      const s = document.createElement("script");
      if (id) s.id = id;
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => resolve();
      document.body.appendChild(s);
    });
  }

  async function ensureLeaflet() {
    await loadCssOnce("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css", "leaflet-css");
    await loadScriptOnce("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js", "leaflet-js");
  }

  window.initLocationView = async function initLocationView() {
    const mapEl = document.getElementById("map");
    if (!mapEl) return;

    await ensureLeaflet();

    if (!window.L) {
      console.warn("Leaflet not ready (window.L missing)");
      return;
    }

    // ✅ 중복 생성 방지 (라우팅 재진입)
    if (window.__leafletMap__) {
      try { window.__leafletMap__.remove(); } catch {}
      window.__leafletMap__ = null;
    }

    // ✅ 지도 생성
    const map = window.L.map("map", { zoomControl: true }).setView([13.5, 101.0], 5);

    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    // ✅ 샘플 마커
    const sample = [
      { name: "Device A", lat: 13.7563, lng: 100.5018, status: "online" },
      { name: "Device B", lat: 10.8231, lng: 106.6297, status: "offline" },
    ];

    const markers = [];
    sample.forEach((d) => {
      const color = d.status === "online" ? "#22c55e" : "#9ca3af";
      const icon = window.L.divIcon({
        className: "devMarker",
        html: `<div style="
          width:12px;height:12px;border-radius:999px;
          background:${color};
          box-shadow:0 0 0 3px rgba(255,255,255,.95), 0 6px 14px rgba(0,0,0,.25);
        "></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });

      const m = window.L.marker([d.lat, d.lng], { icon }).addTo(map);
      m.bindPopup(`<b>${d.name}</b><br>Status: ${d.status}`);
      markers.push(m);
    });

    // 카운트 표시
    const elWith = document.getElementById("locWith");
    const elWithout = document.getElementById("locWithout");
    if (elWith) elWith.textContent = String(sample.length);
    if (elWithout) elWithout.textContent = "0";

    // Fit All
    document.getElementById("btnFitAll")?.addEventListener("click", () => {
      if (!markers.length) return;
      const group = window.L.featureGroup(markers);
      map.fitBounds(group.getBounds().pad(0.2));
    });

    // Dropdown
    const btnSetLoc = document.getElementById("btnSetLoc");
    const menu = document.getElementById("locMenu");
    function closeMenu() { if (menu) menu.hidden = true; }

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

    // Search (lat,lng)
    const inp = document.getElementById("locSearchInput");
    const btnS = document.getElementById("locSearchBtn");

    function doSearch() {
      const q = (inp?.value || "").trim();
      if (!q) return;
      const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (m) {
        map.setView([parseFloat(m[1]), parseFloat(m[2])], 12);
        return;
      }
      alert('Search는 지금 "lat,lng" 형식만 지원해. 예: 37.5665,126.9780');
    }

    btnS?.addEventListener("click", doSearch);
    inp?.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });

    window.__leafletMap__ = map;

    // ✅ cleanup
    const prev = window.__viewCleanup__;
    window.__viewCleanup__ = () => {
      try { closeMenu(); } catch {}
      try { map.remove(); } catch {}
      window.__leafletMap__ = null;
      try { if (typeof prev === "function") prev(); } catch {}
    };
  };

  // ✅ location.html이 로드된 직후 실행
  // (app.js가 이 파일을 붙인 시점엔 DOM이 이미 들어와 있음)
  window.initLocationView();
})();