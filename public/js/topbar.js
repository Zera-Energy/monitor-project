// /js/topbar.js
function cleanToken(v){
  return String(v || "").trim().replace(/^"+|"+$/g, "");
}

async function refreshTopbar() {
  const elUserText = document.getElementById("topUserText");
  const elAvatar = document.getElementById("topAvatar");

  // topbar가 없는 페이지면 종료
  if (!elUserText) return;

  const token = cleanToken(localStorage.getItem("token"));
  const looksLikeJwt = token && token.split(".").length >= 3;

  if (!looksLikeJwt) {
    elUserText.textContent = "Guest";
    if (elAvatar) elAvatar.textContent = "G";
    return;
  }

  try {
    const res = await fetch(`${window.API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error(`me ${res.status}`);

    const me = await res.json(); // { email, role, id }

    elUserText.textContent = `${me.email} (${me.role})`;
    if (elAvatar) elAvatar.textContent = (me.email || "U")[0].toUpperCase();
  } catch (e) {
    elUserText.textContent = "Guest";
    if (elAvatar) elAvatar.textContent = "G";
  }
}

// 전역으로 노출 (module/app.js에서도 호출 가능)
window.refreshTopbar = refreshTopbar;