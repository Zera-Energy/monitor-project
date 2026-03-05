// /js/view.profile.js
(() => {
  const $ = (id) => document.getElementById(id);

  const form = $("profileForm");
  const statusEl = $("pfStatus");

  const photoInput = $("pfPhotoInput");
  const avatarImg = $("pfAvatarImg");
  const avatarFallback = $("pfAvatarFallback");

  const nameEl = $("pfName");
  const emailEl = $("pfEmail");
  const phoneEl = $("pfPhone");
  const deptEl = $("pfDept");
  const roleEl = $("pfRole");
  const bioEl = $("pfBio");

  const btnCancel = $("btnPfCancel");

  const LS_KEY = "userProfile.v1";
  const LS_AVATAR = "userProfile.avatarDataUrl.v1";

  const MAX_BYTES = 2 * 1024 * 1024;

  function setStatus(msg) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
  }

  function readProfileFromStorage() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeProfileToStorage(profile) {
    localStorage.setItem(LS_KEY, JSON.stringify(profile || {}));
  }

  function readAvatarFromStorage() {
    try {
      return localStorage.getItem(LS_AVATAR) || "";
    } catch {
      return "";
    }
  }

  function writeAvatarToStorage(dataUrl) {
    try {
      if (dataUrl) localStorage.setItem(LS_AVATAR, dataUrl);
      else localStorage.removeItem(LS_AVATAR);
    } catch {}
  }

  function applyAvatar(dataUrl) {
    const has = !!dataUrl;
    if (avatarImg) {
      avatarImg.hidden = !has;
      if (has) avatarImg.src = dataUrl;
    }
    if (avatarFallback) avatarFallback.style.display = has ? "none" : "grid";
  }

  function fillForm(profile) {
    const p = profile || {};
    if (nameEl) nameEl.value = p.name || "";
    if (emailEl) emailEl.value = p.email || "";
    if (phoneEl) phoneEl.value = p.phone || "";
    if (deptEl) deptEl.value = p.dept || "";
    if (roleEl) roleEl.value = p.role || "";
    if (bioEl) bioEl.value = p.bio || "";
  }

  function collectForm() {
    return {
      name: nameEl?.value?.trim() || "",
      email: emailEl?.value?.trim() || "",
      phone: phoneEl?.value?.trim() || "",
      dept: deptEl?.value || "",
      role: roleEl?.value || "",
      bio: bioEl?.value || "",
      updatedAt: new Date().toISOString(),
    };
  }

  // 초기 로드
  const saved = readProfileFromStorage();
  fillForm(saved);

  const savedAvatar = readAvatarFromStorage();
  applyAvatar(savedAvatar);

  setStatus("");

  // 사진 변경
  photoInput?.addEventListener("change", async () => {
    const f = photoInput.files && photoInput.files[0];
    if (!f) return;

    // 타입 체크
    const okType = f.type === "image/jpeg" || f.type === "image/png";
    if (!okType) {
      setStatus("JPG 또는 PNG만 가능합니다.");
      photoInput.value = "";
      return;
    }

    // 용량 체크
    if (f.size > MAX_BYTES) {
      setStatus("최대 2MB까지 가능합니다.");
      photoInput.value = "";
      return;
    }

    // 미리보기(dataURL)
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      applyAvatar(dataUrl);
      writeAvatarToStorage(dataUrl);
      setStatus("사진이 변경되었습니다. 저장 버튼을 눌러 확정하세요.");
    };
    reader.onerror = () => setStatus("이미지 읽기에 실패했습니다.");
    reader.readAsDataURL(f);
  });

  // 취소
  btnCancel?.addEventListener("click", () => {
    const p = readProfileFromStorage();
    fillForm(p);
    applyAvatar(readAvatarFromStorage());
    setStatus("변경사항이 취소되었습니다.");
  });

  // 저장
  form?.addEventListener("submit", (e) => {
    e.preventDefault();

    const p = collectForm();

    // 아주 기본 검증
    if (!p.name) return setStatus("이름을 입력해주세요.");
    if (!p.email) return setStatus("이메일을 입력해주세요.");

    writeProfileToStorage(p);
    setStatus("변경사항이 저장되었습니다.");
  });

  // cleanup (SPA)
  const prevCleanup = window.__viewCleanup__;
  window.__viewCleanup__ = () => {
    try { photoInput && (photoInput.value = ""); } catch {}
    try { if (typeof prevCleanup === "function") prevCleanup(); } catch {}
  };
})();