// /js/lib/auth.js
export function cleanToken(v) {
  return String(v || "").trim().replace(/^"+|"+$/g, "");
}

export function getToken() {
  return cleanToken(localStorage.getItem("token"));
}

export function isLoggedIn() {
  const t = getToken();
  return !!t && t.split(".").length >= 3;
}

export function goLoginPage() {
  location.replace("/login.html");
}

export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  goLoginPage();
}