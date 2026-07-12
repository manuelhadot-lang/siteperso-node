/** Plein écran — reste actif ; aucune boîte de dialogue navigateur. */
import { isLabDialogOpen } from "./lab-dialog.js";

/** @type {HTMLElement | null} */
let targetContainer = null;
/** @type {HTMLButtonElement | null} */
let buttonRef = null;
/** Mode plein écran demandé par l'utilisateur (indépendant des dialogues système). */
let fullscreenIntent = false;

function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function requestFullscreen(el) {
    const fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!fn) return Promise.reject(new Error("Plein écran non supporté"));
    return fn.call(el);
}

function exitFullscreen() {
    const fn = document.exitFullscreen || document.webkitExitFullscreen;
    if (!fn) return Promise.reject(new Error("Plein écran non supporté"));
    return fn.call(document);
}

function syncUi() {
    if (!targetContainer || !buttonRef) return;

    targetContainer.classList.toggle("lab-workspace--fullscreen", fullscreenIntent);
    buttonRef.setAttribute("aria-pressed", fullscreenIntent ? "true" : "false");
    buttonRef.title = fullscreenIntent ? "Quitter le plein écran (Échap)" : "Afficher en plein écran";
    buttonRef.textContent = fullscreenIntent ? "⤡ Fenêtré" : "⛶ Plein écran";
    window.dispatchEvent(new Event("resize"));
}

async function restoreNativeFullscreen() {
    if (!targetContainer || !fullscreenIntent) return;
    targetContainer.classList.add("lab-workspace--fullscreen");
    if (fullscreenElement() !== targetContainer) {
        try {
            await requestFullscreen(targetContainer);
        } catch {
            /* Mode CSS seul si le navigateur refuse */
        }
    }
    syncUi();
}

/**
 * Exécute une action (menu Fichier, dialogue…) sans quitter le plein écran visuel.
 * @template T
 * @param {() => T | Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function preserveFullscreenDuring(fn) {
    const wanted = fullscreenIntent;
    try {
        return await fn();
    } finally {
        if (wanted) {
            await restoreNativeFullscreen();
        }
    }
}

/**
 * @param {HTMLElement} container
 * @param {HTMLButtonElement} button
 */
export function initFullscreenToggle(container, button) {
    if (!container || !button) return;

    targetContainer = container;
    buttonRef = button;

    const supported = !!(container.requestFullscreen || container.webkitRequestFullscreen);
    if (!supported) {
        button.hidden = true;
    }

    button.addEventListener("click", () => {
        if (fullscreenIntent) {
            fullscreenIntent = false;
            container.classList.remove("lab-workspace--fullscreen");
            if (fullscreenElement() === container) {
                exitFullscreen().catch(() => {});
            }
        } else {
            fullscreenIntent = true;
            container.classList.add("lab-workspace--fullscreen");
            if (supported) {
                requestFullscreen(container).catch(() => {});
            }
        }
        syncUi();
    });

    const onFullscreenChange = () => {
        if (fullscreenIntent && targetContainer) {
            targetContainer.classList.add("lab-workspace--fullscreen");
        }
        syncUi();
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !fullscreenIntent || isLabDialogOpen()) return;
        if (fullscreenElement() !== container) return;
        requestAnimationFrame(() => {
            if (fullscreenElement() !== container) {
                fullscreenIntent = false;
                container.classList.remove("lab-workspace--fullscreen");
                syncUi();
            }
        });
    });

    syncUi();
}
