// public/js/dev_developer.js
(function () {
  const LS_API_KEY = "monitor_api_key";
  const LS_API_BASE = "monitor_api_base"; // 선택: API 기본 도메인 저장용
  const LS_MQTT = "monitor_mqtt_settings";

  // ✅ 필요하면 여기 기본 API 도메인만 바꿔
  // - "" 로 두면 "현재 사이트 도메인" 기준으로 상대경로로 Open됨
  const DEFAULT_API_BASE = ""; // 예: "https://api.example.com"

  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function setMsg(text) {
    const el = $("#dev_msg");
    if (el) el.textContent = text || "";
  }

  function getApiBase() {
    const saved = (localStorage.getItem(LS_API_BASE) || "").trim();
    if (saved) return saved.replace(/\/+$/, "");
    if (DEFAULT_API_BASE) return DEFAULT_API_BASE.replace(/\/+$/, "");
    return ""; // 상대경로
  }

  function getApiKey() {
    return (localStorage.getItem(LS_API_KEY) || "").trim();
  }

  function saveApiKey(v) {
    const key = (v || "").trim();
    if (!key) localStorage.removeItem(LS_API_KEY);
    else localStorage.setItem(LS_API_KEY, key);
  }

  function formatTemplate(tpl, vars) {
    let out = String(tpl || "");
    out = out.replaceAll("{API_KEY}", encodeURIComponent(vars.apiKey || ""));
    out = out.replaceAll("{MAC_ID}", encodeURIComponent(vars.macId || ""));
    return out;
  }

  async function copyText(text) {
    const v = String(text || "");
    if (!v) return false;
    try {
      await navigator.clipboard.writeText(v);
      return true;
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = v;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand("copy");
        return true;
      } catch {
        return false;
      } finally {
        document.body.removeChild(ta);
      }
    }
  }

  function openUrl(url) {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function renderApiKeyText() {
    const apiKey = getApiKey();
    // 1) My API Keys table
    document.querySelectorAll('[data-bind="apiKey"]').forEach((el) => {
      el.textContent = apiKey || "— (no key)";
    });

    // 2) API rows: data-template -> apiText
    document.querySelectorAll("tr[data-template]").forEach((tr) => {
      const tpl = tr.getAttribute("data-template") || "";
      const macInput = tr.querySelector('[data-bind="macInput"]');
      const macId = macInput ? (macInput.value || "").trim() : "";
      const apiText = formatTemplate(tpl, { apiKey, macId });

      const cell = tr.querySelector('[data-bind="apiText"]');
      if (cell) {
        // 기존 텍스트를 통째로 교체하면 input이 날아가니까,
        // input 있는 줄은 "입력 앞 텍스트"만 유지하는 방식으로 처리
        if (macInput) {
          // input 앞의 텍스트 노드만 업데이트 (간단 버전: 전체를 재구성)
          cell.innerHTML = "";
          const prefix = apiText.split(encodeURIComponent(macId || ""))[0]; // 안전하게 간단 처리
          // prefix는 encoded라 보기 안좋을 수 있어서 원문 템플릿 기반 표시를 사용
          // 보기용 표시는 템플릿의 {API_KEY}만 치환하고 Mac은 input으로 받자:
          const pretty = tpl.replaceAll("{API_KEY}", apiKey || "YOUR_API_KEY").replaceAll("{MAC_ID}", "");
          cell.appendChild(document.createTextNode(pretty));
          cell.appendChild(macInput);
        } else {
          // input 없으면 그냥 text로 표시
          cell.textContent = apiText;
        }
      }
    });
  }

  function ensureKeyOrWarn() {
    const apiKey = getApiKey();
    if (!apiKey) {
      setMsg("API Key가 없습니다. 'New API Key'로 먼저 저장하세요.");
      return null;
    }
    return apiKey;
  }

  function bindTopButtons() {
    const btnDocs = $("#btn_api_docs");
    if (btnDocs) {
      btnDocs.addEventListener("click", () => {
        // ✅ 필요하면 문서 URL 바꿔
        openUrl("https://example.com/docs");
      });
    }

    const btnNew = $("#btn_new_api_key");
    if (btnNew) {
      btnNew.addEventListener("click", async () => {
        const v = prompt("Enter API Key");
        if (v == null) return;
        saveApiKey(v);
        renderApiKeyText();
        setMsg(v.trim() ? "API Key saved." : "API Key cleared.");
      });
    }
  }

  function bindTableActions() {
    // 이벤트 위임
    const root = $("#page-developer");
    if (!root) return;

    root.addEventListener("click", async (e) => {
      const btn = e.target && e.target.closest ? e.target.closest("button") : null;
      if (!btn) return;

      const act = btn.getAttribute("data-action");
      if (!act) return;

      // --- My API Keys: copy/delete
      if (act === "copyApiKey") {
        const apiKey = ensureKeyOrWarn();
        if (!apiKey) return;
        const ok = await copyText(apiKey);
        setMsg(ok ? "API Key copied." : "Copy failed.");
        return;
      }

      if (act === "deleteApiKey") {
        saveApiKey("");
        renderApiKeyText();
        setMsg("API Key deleted (cleared).");
        return;
      }

      // --- API: open/copy
      if (act === "openApi" || act === "copyApi") {
        const tr = btn.closest("tr");
        if (!tr) return;

        const apiKey = ensureKeyOrWarn();
        if (!apiKey) return;

        const tpl = tr.getAttribute("data-template") || "";
        const macInput = tr.querySelector('[data-bind="macInput"]');
        const macId = macInput ? (macInput.value || "").trim() : "";

        if (tpl.includes("{MAC_ID}") && !macId) {
          setMsg("Mac_ID를 입력하세요.");
          macInput && macInput.focus && macInput.focus();
          return;
        }

        const path = formatTemplate(tpl, { apiKey, macId });
        const base = getApiBase();
        const url = base ? base + path : path; // base 없으면 상대경로

        if (act === "openApi") {
          openUrl(url);
          setMsg("Opened.");
        } else {
          const ok = await copyText(url);
          setMsg(ok ? "API copied." : "Copy failed.");
        }
        return;
      }

      // --- MQTT Edit (지금은 저장/토글 구조만 기본 제공)
      if (act === "editMqtt") {
        const box = $("#page-developer");
        const host = box.querySelector('[data-bind="mqttHost"]')?.value?.trim() || "";
        const port = box.querySelector('[data-bind="mqttPort"]')?.value?.trim() || "";
        const interval = box.querySelector('[data-bind="mqttInterval"]')?.value?.trim() || "";
        const user = box.querySelector('[data-bind="mqttUser"]')?.value?.trim() || "";
        const pass = box.querySelector('[data-bind="mqttPass"]')?.value?.trim() || "";
        const topic = box.querySelector('[data-bind="mqttTopic"]')?.value?.trim() || "";

        const data = { host, port, interval, user, pass, topic, savedAt: new Date().toISOString() };
        localStorage.setItem(LS_MQTT, JSON.stringify(data));
        setMsg("MQTT settings saved (local).");
        return;
      }
    });

    // Mac 입력 바뀌면 표시 텍스트 업데이트
    root.addEventListener("input", (e) => {
      const inp = e.target;
      if (inp && inp.matches && inp.matches('[data-bind="macInput"]')) {
        renderApiKeyText();
      }
    });
  }

  function loadMqttSettings() {
    const raw = localStorage.getItem(LS_MQTT);
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      const box = $("#page-developer");
      if (!box) return;

      const set = (sel, v) => {
        const el = box.querySelector(sel);
        if (el) el.value = v ?? "";
      };

      set('[data-bind="mqttHost"]', d.host);
      set('[data-bind="mqttPort"]', d.port);
      set('[data-bind="mqttInterval"]', d.interval);
      set('[data-bind="mqttUser"]', d.user);
      // password는 저장돼도 화면에 그대로 안 보여주고 placeholder로만 처리
      set('[data-bind="mqttPass"]', "");
      set('[data-bind="mqttTopic"]', d.topic);
    } catch {}
  }

  // ✅ 외부에서 호출할 init
  function initDeveloperPage() {
    if (!document.getElementById("page-developer")) return;
    bindTopButtons();
    bindTableActions();
    loadMqttSettings();
    renderApiKeyText();
    setMsg(""); // 초기 메시지 비우기
  }

  // 전역 노출 (뷰 주입 후 호출용)
  window.initDeveloperPage = initDeveloperPage;

  // 혹시 정적 페이지로 직접 열릴 때 대비
  document.addEventListener("DOMContentLoaded", () => {
    initDeveloperPage();
  });
})();
