// /js/view.login.js
(function () {
  const API_BASE =
    window.API_BASE ||
    (location.hostname === "localhost" || location.hostname === "127.0.0.1"
      ? "http://127.0.0.1:8000"
      : "https://monitor-project.onrender.com");

  const $ = (id) => document.getElementById(id);

  function setToken(token) {
    localStorage.setItem("token", token || "");
  }
  function getToken() {
    return localStorage.getItem("token") || "";
  }
  function setRole(role) {
    localStorage.setItem("role", role || "");
  }
  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
  }

  function showStatus() {
    const t = getToken();
    const el = $("loginStatus");
    if (el) el.textContent = t ? "✅ token saved" : "❌ not logged in";
  }

  async function doLogin() {
    const msg = $("loginMsg");
    if (msg) msg.textContent = "";

    const emailEl = $("loginEmail");
    const passEl = $("loginPass");
    if (!emailEl || !passEl) {
      if (msg) msg.textContent = "login view element not found";
      return;
    }

    const email = emailEl.value.trim();
    const password = passEl.value;

    if (!email || !password) {
      if (msg) msg.textContent = "이메일/비밀번호를 입력해줘.";
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const txt = await res.text();
        if (msg) msg.textContent = `Login failed (${res.status}): ${txt}`;
        return;
      }

      const data = await res.json();
      setToken(data.access_token);
      setRole(data.role);

      showStatus();
      location.hash = "#overview";
    } catch (e) {
      if (msg) msg.textContent = "Error: " + e;
    }
  }

  // ✅ 이벤트 연결
  const btnLogin = $("btnLogin");
  if (btnLogin) btnLogin.addEventListener("click", doLogin);

  const btnLogout = $("btnLogout");
  if (btnLogout)
    btnLogout.addEventListener("click", () => {
      logout();
      showStatus();
      const msg = $("loginMsg");
      if (msg) msg.textContent = "토큰 삭제됨. 다시 로그인해줘.";
      location.hash = "#login";
    });

  const emailEl = $("loginEmail");
  const passEl = $("loginPass");

  if (emailEl) {
    emailEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doLogin();
    });
    if (!emailEl.value) emailEl.value = "admin@local";
  }
  if (passEl) {
    passEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doLogin();
    });
    if (!passEl.value) passEl.value = "admin1234";
  }

  showStatus();
})();