// /js/view.products.js
(() => {
  const $ = (id) => document.getElementById(id);

  const modalBack = $("pModalBack");
  const modalClose = $("pModalClose");
  const modalCancel = $("pModalCancel");
  const modalTitle = $("pModalTitle");
  const modalBody = $("pModalBody");

  const btn10 = $("btnProd10");
  const btn30 = $("btnProd30");
  const btnMax = $("btnProdMax");

  const DATA = {
    ksaver10: {
      title: "K-SAVER 10 (Residential Solution)",
      html: `
        <div class="contentCard" style="padding:14px;">
          <div style="font-weight:800; font-size:15px; margin-bottom:8px;">Overview</div>
          <div class="muted">Perfect for homes and small offices. Compact and easy to install.</div>
          <div style="height:10px;"></div>
          <div style="font-weight:800; font-size:15px; margin-bottom:8px;">Key Specs</div>
          <ul style="margin:0; padding-left:18px; color:#3a3f4b;">
            <li>Capacity: up to 10kW</li>
            <li>Installation: wall mounted</li>
            <li>Recommended: residential / small office</li>
          </ul>
        </div>
      `,
    },
    ksaver30: {
      title: "K-SAVER 30 (Commercial Solution)",
      html: `
        <div class="contentCard" style="padding:14px;">
          <div style="font-weight:800; font-size:15px; margin-bottom:8px;">Overview</div>
          <div class="muted">Ideal for commercial spaces. Stable and scalable for medium loads.</div>
          <div style="height:10px;"></div>
          <div style="font-weight:800; font-size:15px; margin-bottom:8px;">Key Specs</div>
          <ul style="margin:0; padding-left:18px; color:#3a3f4b;">
            <li>Capacity: up to 30kW</li>
            <li>Installation: floor standing</li>
            <li>Recommended: stores / buildings</li>
          </ul>
        </div>
      `,
    },
    ksaverMax: {
      title: "K-SAVER Max (Industrial Solution)",
      html: `
        <div class="contentCard" style="padding:14px;">
          <div style="font-weight:800; font-size:15px; margin-bottom:8px;">Overview</div>
          <div class="muted">High-capacity industrial applications with customizable capacity.</div>
          <div style="height:10px;"></div>
          <div style="font-weight:800; font-size:15px; margin-bottom:8px;">Key Specs</div>
          <ul style="margin:0; padding-left:18px; color:#3a3f4b;">
            <li>Capacity: customizable</li>
            <li>Installation: panel / cabinet</li>
            <li>Recommended: factories / plants</li>
          </ul>
        </div>
      `,
    },
  };

  function openModal(key) {
    const d = DATA[key];
    if (!d) return;
    modalTitle.textContent = d.title;
    modalBody.innerHTML = d.html;
    modalBack.style.display = "flex";
  }

  function closeModal() {
    modalBack.style.display = "none";
  }

  btn10?.addEventListener("click", () => openModal("ksaver10"));
  btn30?.addEventListener("click", () => openModal("ksaver30"));
  btnMax?.addEventListener("click", () => openModal("ksaverMax"));

  modalClose?.addEventListener("click", closeModal);
  modalCancel?.addEventListener("click", closeModal);
  modalBack?.addEventListener("click", (e) => {
    if (e.target === modalBack) closeModal();
  });

  // cleanup (SPA 전환 시 이벤트 정리)
  const prev = window.__viewCleanup__;
  window.__viewCleanup__ = () => {
    try { closeModal(); } catch {}
    try { if (typeof prev === "function") prev(); } catch {}
  };
})();