// /js/ui/topbar.js
import { logout } from "../lib/auth.js";

export function bindTopLogout() {
  const btn = document.getElementById("btnTopLogout");
  if (!btn) return;
  btn.addEventListener("click", () => logout());
}

export function setTopUserUI(user) {
  const avatarEl = document.getElementById("topAvatar");
  const textEl = document.getElementById("topUserText");
  if (!avatarEl || !textEl) return;

  const email = user?.email || "Signed in";
  const role = user?.role ? ` (${user.role})` : "";

  const first = String(email).trim().charAt(0).toUpperCase() || "U";
  avatarEl.textContent = first;
  textEl.textContent = `${email}${role}`;
}