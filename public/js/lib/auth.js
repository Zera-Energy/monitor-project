// /js/lib/auth.js
export function cleanToken(v) {
  return String(v || "").trim().replace(/^"+|"+$/g, "");
}

export function getToken() {
  // ✅ token 우선, 없으면 access_token도 허용
  const t =
    localStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    "";
  return cleanToken(t);
}

export function setToken(token) {
  // ✅ 앞으로는 여기로 저장 통일
  const t = cleanToken(token);
  if (t) {
    localStorage.setItem("token", t);          // 표준 키
    localStorage.setItem("access_token", t);  // 호환 키(있어도 무해)
  }
}

export function isLoggedIn() {
  const t = getToken();
  return !!t && t.split(".").length >= 3;
}

export function goLoginPage() {
  location.replace("/login.html");
}

export function logout() {
  // ✅ 둘 다 제거
  localStorage.removeItem("token");
  localStorage.removeItem("access_token");
  localStorage.removeItem("role");
  goLoginPage();
}