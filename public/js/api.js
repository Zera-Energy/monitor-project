// /js/api.js
export function setToken(token){ localStorage.setItem("token", token || ""); }
export function getToken(){ return localStorage.getItem("token") || ""; }
export function isLoggedIn(){ return !!getToken(); }
export function logout(){
  localStorage.removeItem("token");
  localStorage.removeItem("role");
}

export async function apiFetch(url, options = {}){
  const token = getToken();
  const headers = new Headers(options.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);

  // JSON 보내는 요청일 때 기본 Content-Type
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, { ...options, headers });

  // 토큰 없거나 만료 → 로그인 화면으로
  if (res.status === 401) {
    logout();
    // 네 라우팅 방식에 맞춰 login으로 이동
    location.hash = "#/login";
  }
  return res;
}