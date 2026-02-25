// /js/lib/api.js
import { getToken, logout } from "./auth.js";

export async function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    if (/^bearer\s+/i.test(token)) headers.set("Authorization", token);
    else headers.set("Authorization", `Bearer ${token}`);
  }

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, { ...options, headers, cache: "no-cache" });

  if (res.status === 401) {
    console.warn("[401] url =", url);
    console.warn("[401] raw token =", localStorage.getItem("token"));
    console.warn("[401] clean token =", token);
    logout();
  }

  return res;
}

export async function fetchJson(url) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return await res.json();
}