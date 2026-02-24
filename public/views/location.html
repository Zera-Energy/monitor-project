<section id="locView">
  <div class="pageHeader">
    <h2 class="pageTitle">Devices Location</h2>
  </div>

  <!-- 상단 상태/검색/버튼 바 -->
  <div class="locTop">
    <div class="locStats">
      <div class="locStat">📍 <b id="locWith">0</b> devices with location</div>
      <div class="locStat">📍 <b id="locWithout">0</b> without location</div>
    </div>

    <div class="locActions">
      <div class="locSearch">
        <input id="locSearchInput" class="locSearchInput" placeholder="Search location..." />
        <button id="locSearchBtn" class="locSearchBtn" type="button">🔍</button>
      </div>

      <button id="btnFitAll" class="locBtn light" type="button">🗺 Fit All</button>

      <div class="locDrop">
        <button id="btnSetLoc" class="locBtn amber" type="button">📍 Set Location ▾</button>
        <div class="locMenu" id="locMenu" hidden>
          <button class="locMenuItem" type="button" data-action="set-mode">Set mode</button>
          <button class="locMenuItem" type="button" data-action="clear-mode">Cancel</button>
        </div>
      </div>
    </div>
  </div>

  <!-- 지도 -->
  <div class="locMapWrap">
    <div id="map" class="locMap"></div>

    <!-- 우측하단 Status 카드 -->
    <div class="locLegend">
      <div class="locLegendTitle">Status</div>
      <div class="locLegendRow"><span class="dot green"></span> Online</div>
      <div class="locLegendRow"><span class="dot gray"></span> Offline</div>
    </div>
  </div>

  <!-- ✅ 이 view에서만 실행 -->
  <script data-view-script>
    // ✅ Leaflet CSS/JS + view.location.js 로드
    // (주의) innerHTML로 주입된 script는 브라우저가 자동 실행 안 하는 경우가 있어서
    // 아래 run()을 "즉시 + 다음 tick"으로 2번 시도해서 확률을 0에 가깝게 만듦.

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
        s.onerror = () => resolve(); // 실패해도 페이지는 살림
        document.body.appendChild(s);
      });
    }

    async function run() {
      // ✅ Leaflet CSS 먼저 (이거 없으면 화면이 깨져 보일 수 있음)
      await loadCssOnce("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css", "leaflet-css");

      // ✅ Leaflet JS
      await loadScriptOnce("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js", "leaflet-js");

      // ✅ 우리 view 전용 JS
      await loadScriptOnce("./js/view.location.js", "view-location-js");

      // ✅ init 실행
      if (typeof window.initLocationView === "function") {
        window.initLocationView();
      } else {
        console.warn("initLocationView not found");
      }
    }

    // ✅ 즉시 1회
    run();

    // ✅ 혹시 innerHTML script 실행 타이밍이 꼬이면 다음 tick에서 1회 더
    setTimeout(run, 0);
  </script>
</section>