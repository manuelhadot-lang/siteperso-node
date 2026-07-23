/** Plein écran — CSS fiable + API native en complément. */

/** @type {HTMLElement | null} */
let targetContainer = null;
/** @type {HTMLButtonElement | null} */
let buttonRef = null;
/** L'utilisateur veut le mode plein écran (CSS au minimum). */
let fullscreenIntent = false;
/** Le navigateur affiche réellement lab-workspace en plein écran natif. */
let nativeActive = false;
/** Sélecteur de fichier ouvert — le natif est suspendu volontairement. */
let filePickerPending = false;

/** @type {(() => void) | null} */
let focusRestoreHandler = null;
/** @type {HTMLButtonElement | null} */
let recoveryButton = null;

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

function nativeSupported() {
    if (!targetContainer) return false;
    return !!(targetContainer.requestFullscreen || targetContainer.webkitRequestFullscreen);
}

function syncUi() {
    if (!targetContainer || !buttonRef) return;

    targetContainer.classList.toggle("lab-workspace--fullscreen", fullscreenIntent);
    document.documentElement.classList.toggle("lab-fs-active", fullscreenIntent);
    buttonRef.classList.toggle("is-active", fullscreenIntent);
    buttonRef.setAttribute("aria-pressed", fullscreenIntent ? "true" : "false");
    buttonRef.title = fullscreenIntent ? "Quitter le plein écran (Échap)" : "Afficher en plein écran";
    buttonRef.textContent = fullscreenIntent ? "⤡ Fenêtré" : "⛶ Plein écran";
    window.dispatchEvent(new Event("resize"));
}

function hideFullscreenRecovery() {
    recoveryButton?.remove();
    recoveryButton = null;
}

function showFullscreenRecovery() {
    if (!targetContainer || !fullscreenIntent || fullscreenElement() === targetContainer) {
        hideFullscreenRecovery();
        return;
    }
    if (recoveryButton) return;

    recoveryButton = document.createElement("button");
    recoveryButton.type = "button";
    recoveryButton.className = "lab-fullscreen-recovery";
    recoveryButton.textContent = "⛶ Revenir en plein écran";
    recoveryButton.title = "Le navigateur exige un clic pour réactiver le plein écran";
    recoveryButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!targetContainer || !fullscreenIntent) return;
        try {
            await requestFullscreen(targetContainer);
            nativeActive = fullscreenElement() === targetContainer;
            if (nativeActive) hideFullscreenRecovery();
        } catch {
            nativeActive = false;
        }
        syncUi();
    });
    targetContainer.appendChild(recoveryButton);
}

/** Maintient le plein écran CSS (couvre la page même sans API native). */
export function ensureCssFullscreen() {
    if (!targetContainer || !fullscreenIntent) return;
    targetContainer.classList.add("lab-workspace--fullscreen");
    document.documentElement.classList.add("lab-fs-active");
    syncUi();
}

function exitFullscreenMode() {
    if (!targetContainer) return;
    fullscreenIntent = false;
    nativeActive = false;
    filePickerPending = false;
    hideFullscreenRecovery();
    disarmFocusFullscreenRestore();
    targetContainer.classList.remove("lab-workspace--fullscreen");
    document.documentElement.classList.remove("lab-fs-active");
    if (fullscreenElement() === targetContainer) {
        exitFullscreen().catch(() => {});
    }
    syncUi();
}

async function enterFullscreenMode() {
    if (!targetContainer) return;
    fullscreenIntent = true;
    ensureCssFullscreen();

    if (nativeSupported()) {
        try {
            await requestFullscreen(targetContainer);
            nativeActive = fullscreenElement() === targetContainer;
            if (nativeActive) hideFullscreenRecovery();
        } catch {
            nativeActive = false;
        }
    }
    syncUi();
}

async function restoreNativeFullscreenWithRetry(maxAttempts = 10) {
    if (!targetContainer || !fullscreenIntent || filePickerPending) return;
    ensureCssFullscreen();
    if (!nativeSupported()) {
        nativeActive = false;
        syncUi();
        return;
    }

    const delays = [0, 0, 8, 16, 24, 40, 64, 96, 128, 160];

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (fullscreenElement() === targetContainer) {
            nativeActive = true;
            hideFullscreenRecovery();
            syncUi();
            return;
        }
        try {
            await requestFullscreen(targetContainer);
            if (fullscreenElement() === targetContainer) {
                nativeActive = true;
                hideFullscreenRecovery();
                syncUi();
                return;
            }
        } catch {
            /* nouvel essai */
        }
        const delay = delays[Math.min(attempt, delays.length - 1)] ?? 40;
        if (attempt < maxAttempts - 1 && delay > 0) {
            await new Promise((resolve) => window.setTimeout(resolve, delay));
        }
    }

    nativeActive = false;
    syncUi();
    showFullscreenRecovery();
}

/** Tente de rétablir le plein écran natif immédiatement (ex. après choix de fichier). */
export function restoreFullscreenNow() {
    if (!targetContainer || !fullscreenIntent) return Promise.resolve();
    ensureCssFullscreen();
    if (!nativeSupported() || fullscreenElement() === targetContainer) {
        nativeActive = fullscreenElement() === targetContainer;
        syncUi();
        return Promise.resolve();
    }

    // L'appel doit partir immédiatement pendant l'événement `change` :
    // c'est le seul instant où le navigateur peut encore accepter le geste utilisateur.
    let directRequest;
    try {
        directRequest = requestFullscreen(targetContainer);
    } catch {
        return restoreNativeFullscreenWithRetry();
    }

    return Promise.resolve(directRequest)
        .then(() => {
            nativeActive = fullscreenElement() === targetContainer;
            if (nativeActive) hideFullscreenRecovery();
            syncUi();
            if (!nativeActive) return restoreNativeFullscreenWithRetry();
            return undefined;
        })
        .catch(() => restoreNativeFullscreenWithRetry());
}

function onVisibilityRestore() {
    if (document.visibilityState !== "visible") return;
    if (!fullscreenIntent || filePickerPending) return;
    void restoreNativeFullscreenWithRetry();
}

function armFocusFullscreenRestore() {
    if (focusRestoreHandler) return;
    focusRestoreHandler = () => {
        if (!fullscreenIntent || filePickerPending) return;
        void restoreNativeFullscreenWithRetry();
    };
    window.addEventListener("focus", focusRestoreHandler);
    document.addEventListener("visibilitychange", onVisibilityRestore);
}

function disarmFocusFullscreenRestore() {
    if (focusRestoreHandler) {
        window.removeEventListener("focus", focusRestoreHandler);
        focusRestoreHandler = null;
    }
    document.removeEventListener("visibilitychange", onVisibilityRestore);
}

/** Restaure plein écran CSS + natif après un dialogue système. */
export function ensureLabFullscreenAfterFile() {
    if (!fullscreenIntent) return Promise.resolve();
    return restoreFullscreenNow();
}

/**
 * @template T
 * @param {() => T | Promise<T>} fn
 */
export async function preserveFullscreenDuring(fn) {
    const wanted = fullscreenIntent;
    try {
        return await fn();
    } finally {
        if (wanted) {
            await ensureLabFullscreenAfterFile();
        }
    }
}

/**
 * Ouvre un input fichier en conservant le plein écran (CSS + restauration native).
 * @param {HTMLInputElement} input
 */
export function pickFilePreservingFullscreen(input) {
    if (!fullscreenIntent) {
        input.click();
        return Promise.resolve();
    }

    ensureCssFullscreen();
    filePickerPending = true;
    armFocusFullscreenRestore();

    return new Promise((resolve) => {
        const finish = () => {
            input.removeEventListener("change", onChange);
            input.removeEventListener("cancel", finish);
            filePickerPending = false;
            ensureCssFullscreen();
            void restoreFullscreenNow().finally(() => {
                disarmFocusFullscreenRestore();
                resolve(undefined);
            });
        };
        const onChange = () => finish();
        input.addEventListener("change", onChange, { once: true });
        input.addEventListener("cancel", finish, { once: true });
        input.click();
    });
}

/** @returns {boolean} */
export function isFullscreenActive() {
    return fullscreenIntent;
}

let initialized = false;

/**
 * @param {HTMLElement} container
 * @param {HTMLButtonElement} button
 */
export function initFullscreenToggle(container, button) {
    if (!container || !button || initialized) return;
    initialized = true;

    targetContainer = container;
    buttonRef = button;

    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (fullscreenIntent) {
            exitFullscreenMode();
        } else {
            void enterFullscreenMode();
        }
    });

    const onFullscreenChange = () => {
        const isNative = fullscreenElement() === targetContainer;
        if (isNative) {
            nativeActive = true;
            hideFullscreenRecovery();
            return;
        }
        nativeActive = false;
        if (!fullscreenIntent) return;

        ensureCssFullscreen();
        if (!filePickerPending) {
            void restoreNativeFullscreenWithRetry();
        }
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);

    document.addEventListener("keydown", (event) => {
        if (event.code !== "Escape" || !fullscreenIntent) return;
        if (filePickerPending) return;
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
            return;
        }
        if (event.target instanceof HTMLSelectElement) return;
        exitFullscreenMode();
    });

    syncUi();
}
