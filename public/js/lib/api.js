// /js/lib/api.js
import { getToken, logout } from "./auth.js";

export async function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = new Headers(options.headers || {});

  // ✅ 토큰 방식이면 Authorization 붙임 (세션 쿠키 방식이어도 문제 없음)
  if (token) {
    if (/^bearer\s+/i.test(token)) headers.set("Authorization", token);
    else headers.set("Authorization", `Bearer ${token}`);
  }

  // ✅ body가 있고 Content-Type 없으면 JSON으로
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, {
    ...options,
    headers,
    cache: "no-cache",

    // ✅ 핵심: Render 같은 다른 도메인 API 호출 시 쿠키(세션) 포함
    credentials: "include",
  });

  // ✅ 401 처리: "무조건 logout"은 위험
  // - 토큰 기반이면 logout이 맞고
  // - 쿠키 세션 기반이면 그냥 로그인 페이지로 보내는 쪽(app.js)이 처리하도록 두는 게 맞음
  if (res.status === 401) {
    console.warn("[401] url =", url);
    console.warn("[401] raw token =", localStorage.getItem("token"));
    console.warn("[401] clean token =", token);

    // ✅ 토큰이 실제로 있을 때만 logout (세션 방식이면 토큰이 없을 수 있음)
    if (token) logout();
  }

  return res;
}

// ✅ 옵션 전달 가능하게 확장(POST/PUT에도 재사용)
export async function fetchJson(url, options = {}) {
  const res = await apiFetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return await res.json();
}