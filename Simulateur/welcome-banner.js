/** Message d'accueil au lancement du simulateur (fermable, option « ne plus afficher »). */
import { showModal, hideModal } from "./modal-ui.js";

/** Incrémenter pour réafficher après une mise à jour majeure. */
const WELCOME_REVISION = "2026-07";

export const SIM_PRODUCT_META = {
    version: "1.0.0",
    year: 2026,
    school: "LGT Saint-Erembert",
    subtitle: "STI2D — option SIN",
};

function storageKey() {
    return `sim-welcome-hidden-${WELCOME_REVISION}`;
}

export async function initWelcomeBanner(productName) {
    const modal = document.getElementById("welcome-modal");
    if (!modal) return;
    if (localStorage.getItem(storageKey()) === "1") return;

    const titleEl = document.getElementById("welcome-title");
    const metaEl = document.getElementById("welcome-meta");
    const bodyEl = document.getElementById("welcome-body");
    const neverEl = document.getElementById("welcome-never");
    const closeBtn = document.getElementById("welcome-close");

    let uiTag = "";
    try {
        const res = await fetch("/api/version");
        if (res.ok) {
            const v = await res.json();
            uiTag = v.simUiVersion ? ` · UI ${v.simUiVersion}` : "";
        }
    } catch {
        /* hors ligne */
    }

    if (titleEl) titleEl.textContent = productName;
    if (metaEl) {
        metaEl.textContent =
            `Version ${SIM_PRODUCT_META.version}${uiTag} · ${SIM_PRODUCT_META.year} · ${SIM_PRODUCT_META.school}`;
    }
    if (bodyEl) {
        bodyEl.innerHTML =
            `<p>Bienvenue sur <strong>${escapeHtml(productName)}</strong>.</p>` +
            `<p>${escapeHtml(SIM_PRODUCT_META.subtitle)} — simulation SPICE, Arduino / ESP32, capteurs et logique numérique.</p>` +
            `<p class="welcome-hint">Astuce : menu <strong>Fichier → Exemples…</strong> pour ouvrir un montage préparé, puis <strong>Lancer la simulation</strong>.</p>`;
    }

    showModal(modal);

    const close = () => {
        if (neverEl?.checked) localStorage.setItem(storageKey(), "1");
        hideModal(modal);
    };

    closeBtn?.addEventListener("click", close, { once: true });
    window.addEventListener(
        "click",
        (e) => {
            if (e.target === modal) close();
        },
        { once: true }
    );
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
