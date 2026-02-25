// /js/ui/toast.js
let __toastEl = null;
let __toastTimer = null;

export function showToast(msg, ms = 3000) {
  if (!__toastEl) {
    __toastEl = document.createElement("div");
    __toastEl.id = "__toast";
    __toastEl.style.position = "fixed";
    __toastEl.style.right = "16px";
    __toastEl.style.bottom = "16px";
    __toastEl.style.padding = "10px 12px";
    __toastEl.style.borderRadius = "12px";
    __toastEl.style.boxShadow = "0 10px 30px rgba(0,0,0,.18)";
    __toastEl.style.background = "#111";
    __toastEl.style.color = "#fff";
    __toastEl.style.fontSize = "13px";
    __toastEl.style.zIndex = "99999";
    __toastEl.style.maxWidth = "320px";
    __toastEl.style.display = "none";
    document.body.appendChild(__toastEl);
  }

  __toastEl.textContent = msg;
  __toastEl.style.display = "block";

  if (__toastTimer) clearTimeout(__toastTimer);
  __toastTimer = setTimeout(() => {
    if (__toastEl) __toastEl.style.display = "none";
  }, ms);
}