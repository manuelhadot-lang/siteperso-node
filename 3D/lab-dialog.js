/** Dialogues intégrés (sans alert/confirm/prompt natifs du navigateur). */

/** @type {HTMLElement | null} */
let overlay = null;

function getMount() {
    return document.getElementById("lab-workspace") || document.body;
}

function ensureOverlay() {
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.className = "lab-dialog-overlay";
    overlay.hidden = true;
    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
            overlay.dispatchEvent(new CustomEvent("lab-dialog-cancel", { bubbles: false }));
        }
    });
    getMount().appendChild(overlay);
    return overlay;
}

/**
 * @param {string} html
 * @returns {Promise<"confirm" | "cancel">}
 */
function showDialog(html) {
    const root = ensureOverlay();
    root.innerHTML = html;
    root.hidden = false;

    return new Promise((resolve) => {
        const finish = (result) => {
            root.hidden = true;
            root.innerHTML = "";
            root.removeEventListener("lab-dialog-cancel", onCancel);
            resolve(result);
        };

        const onCancel = () => finish("cancel");

        root.querySelector("[data-dialog-cancel]")?.addEventListener("click", onCancel);
        root.querySelector("[data-dialog-confirm]")?.addEventListener("click", () => finish("confirm"));
        root.addEventListener("lab-dialog-cancel", onCancel);

        root.querySelector("input[data-dialog-input]")?.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                finish("confirm");
            }
        });
    });
}

/**
 * @param {string} message
 * @param {{ title?: string, confirmLabel?: string, cancelLabel?: string }} [opts]
 */
export async function labConfirm(
    message,
    { title = "Confirmation", confirmLabel = "OK", cancelLabel = "Annuler" } = {}
) {
    const result = await showDialog(`
        <div class="lab-dialog" role="dialog" aria-modal="true" aria-labelledby="lab-dialog-title">
            <h2 class="lab-dialog__title" id="lab-dialog-title">${escapeHtml(title)}</h2>
            <p class="lab-dialog__message">${escapeHtml(message)}</p>
            <div class="lab-dialog__actions">
                <button type="button" class="lab-dialog__btn lab-dialog__btn--ghost" data-dialog-cancel>${escapeHtml(cancelLabel)}</button>
                <button type="button" class="lab-dialog__btn lab-dialog__btn--primary" data-dialog-confirm>${escapeHtml(confirmLabel)}</button>
            </div>
        </div>
    `);
    return result === "confirm";
}

/**
 * @param {string} message
 * @param {{ title?: string, defaultValue?: string, confirmLabel?: string, cancelLabel?: string }} [opts]
 * @returns {Promise<string | null>}
 */
export async function labPrompt(
    message,
    {
        title = "Saisie",
        defaultValue = "",
        confirmLabel = "OK",
        cancelLabel = "Annuler",
    } = {}
) {
    const root = ensureOverlay();
    const safeValue = escapeAttr(defaultValue);

    root.innerHTML = `
        <div class="lab-dialog" role="dialog" aria-modal="true" aria-labelledby="lab-dialog-title">
            <h2 class="lab-dialog__title" id="lab-dialog-title">${escapeHtml(title)}</h2>
            <p class="lab-dialog__message">${escapeHtml(message)}</p>
            <input class="lab-dialog__input" type="text" data-dialog-input value="${safeValue}" spellcheck="false">
            <div class="lab-dialog__actions">
                <button type="button" class="lab-dialog__btn lab-dialog__btn--ghost" data-dialog-cancel>${escapeHtml(cancelLabel)}</button>
                <button type="button" class="lab-dialog__btn lab-dialog__btn--primary" data-dialog-confirm>${escapeHtml(confirmLabel)}</button>
            </div>
        </div>
    `;
    root.hidden = false;

    const input = /** @type {HTMLInputElement | null} */ (root.querySelector("[data-dialog-input]"));
    input?.focus();
    input?.select();

    return new Promise((resolve) => {
        const cleanup = () => {
            root.hidden = true;
            root.innerHTML = "";
        };

        root.querySelector("[data-dialog-cancel]")?.addEventListener("click", () => {
            cleanup();
            resolve(null);
        });

        root.querySelector("[data-dialog-confirm]")?.addEventListener("click", () => {
            const value = input?.value.trim() ?? null;
            cleanup();
            resolve(value);
        });

        input?.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                const value = input.value.trim() ?? null;
                cleanup();
                resolve(value);
            }
            if (event.key === "Escape") {
                event.preventDefault();
                cleanup();
                resolve(null);
            }
        });
    });
}

/**
 * @param {{ name: string, updatedAt?: number }[]} scenes
 * @returns {Promise<string | null>} nom de la scène choisie
 */
export async function labPickScene(scenes) {
    const root = ensureOverlay();

    const listHtml = scenes.length
        ? scenes
              .map(
                  (scene) => `
            <button type="button" class="lab-dialog__scene-item" data-scene-name="${escapeAttr(scene.name)}">
                <span class="lab-dialog__scene-name">${escapeHtml(scene.name)}</span>
                ${scene.updatedAt ? `<span class="lab-dialog__scene-date">${formatDate(scene.updatedAt)}</span>` : ""}
            </button>`
              )
              .join("")
        : `<p class="lab-dialog__empty">Aucune scène enregistrée.<br>Utilisez <strong>Enregistrer</strong> pour sauvegarder.</p>`;

    root.innerHTML = `
        <div class="lab-dialog lab-dialog--wide" role="dialog" aria-modal="true" aria-labelledby="lab-dialog-title">
            <h2 class="lab-dialog__title" id="lab-dialog-title">Ouvrir une scène</h2>
            <div class="lab-dialog__scene-list">${listHtml}</div>
            <div class="lab-dialog__actions">
                <button type="button" class="lab-dialog__btn lab-dialog__btn--ghost" data-dialog-cancel>Fermer</button>
            </div>
        </div>
    `;
    root.hidden = false;

    return new Promise((resolve) => {
        const finish = (name) => {
            root.hidden = true;
            root.innerHTML = "";
            resolve(name);
        };

        root.querySelector("[data-dialog-cancel]")?.addEventListener("click", () => finish(null));
        root.querySelectorAll("[data-scene-name]").forEach((btn) => {
            btn.addEventListener("click", () => {
                finish(btn.getAttribute("data-scene-name"));
            });
        });
    });
}

/**
 * @param {string} message
 * @param {{ title?: string }} [opts]
 */
export async function labAlert(message, { title = "Information" } = {}) {
    await showDialog(`
        <div class="lab-dialog" role="alertdialog" aria-modal="true" aria-labelledby="lab-dialog-title">
            <h2 class="lab-dialog__title" id="lab-dialog-title">${escapeHtml(title)}</h2>
            <p class="lab-dialog__message">${escapeHtml(message)}</p>
            <div class="lab-dialog__actions">
                <button type="button" class="lab-dialog__btn lab-dialog__btn--primary" data-dialog-confirm>OK</button>
            </div>
        </div>
    `);
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function escapeAttr(text) {
    return escapeHtml(text).replace(/'/g, "&#39;");
}

function formatDate(timestamp) {
    try {
        return new Date(timestamp).toLocaleString("fr-FR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return "";
    }
}

export function isLabDialogOpen() {
    return !!overlay && !overlay.hidden;
}

export function closeLabDialog() {
    if (overlay) {
        overlay.hidden = true;
        overlay.innerHTML = "";
    }
}
