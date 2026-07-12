/**
 * Menu contextuel objet — propriétés (collisions, couleur, texture UV…).
 * @param {HTMLElement} viewport
 */
import { readImageFileAsDataUrl } from "./lab-object-textures.js";
import {
    bindIntensitySliderWheel,
    LIGHT_INTENSITY_MAX,
    LIGHT_INTENSITY_STEP,
} from "./lab-lights.js";

const COLOR_PRESETS = [
    "#00d1ff", "#22d3ee", "#38bdf8", "#3b82f6", "#6366f1",
    "#a855f7", "#ec4899", "#f43f5e", "#ef4444", "#f97316",
    "#eab308", "#84cc16", "#22c55e", "#10b981", "#14b8a6",
    "#ffffff", "#94a3b8", "#64748b", "#334155", "#0f172a",
];

export function initObjectContextMenu(viewport) {
    const menuEl = document.createElement("div");
    menuEl.className = "lab-context-menu";
    menuEl.hidden = true;

    const presetButtons = COLOR_PRESETS.map(
        (hex) =>
            `<button type="button" class="lab-context-menu__swatch" data-color="${hex}" ` +
            `style="background:${hex}" title="${hex}" aria-label="Couleur ${hex}"></button>`
    ).join("");

    menuEl.innerHTML =
        '<p class="lab-context-menu__title">Propriétés</p>' +
        '<ul class="lab-context-menu__list lab-context-menu__light-only">' +
        "<li>" +
        '<label class="lab-context-menu__item">' +
        '<input type="checkbox" data-prop="light-marker-visible" checked>' +
        "<span>Afficher le symbole</span>" +
        "</label>" +
        "</li>" +
        "</ul>" +
        '<div class="lab-context-menu__light-only lab-context-menu__intensity">' +
        '<label class="lab-context-menu__item lab-context-menu__item--range">' +
        "<span>Intensité</span>" +
        '<input type="range" data-prop="light-intensity" min="0" max="' +
        LIGHT_INTENSITY_MAX +
        '" step="' +
        LIGHT_INTENSITY_STEP +
        '" value="1">' +
        '<output data-light-intensity-value>1</output>' +
        "</label>" +
        "</div>" +
        '<ul class="lab-context-menu__list lab-context-menu__object-only">' +
        "<li>" +
        '<label class="lab-context-menu__item">' +
        '<input type="checkbox" data-prop="collision">' +
        "<span>Collisions</span>" +
        "</label>" +
        "</li>" +
        "</ul>" +
        '<div class="lab-context-menu__color lab-context-menu__object-only">' +
        '<span class="lab-context-menu__color-label">Couleur</span>' +
        '<label class="lab-context-menu__picker-wrap" title="Nuancier">' +
        '<input type="color" data-prop="color" class="lab-context-menu__picker" aria-label="Nuancier">' +
        "</label>" +
        `<div class="lab-context-menu__swatches" role="list">${presetButtons}</div>` +
        "</div>" +
        '<div class="lab-context-menu__texture lab-context-menu__object-only">' +
        '<span class="lab-context-menu__color-label">Texture (UV)</span>' +
        '<input type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" hidden data-texture-input>' +
        '<button type="button" class="lab-context-menu__texture-btn" data-texture-pick>Choisir JPEG / PNG…</button>' +
        '<button type="button" class="lab-context-menu__texture-btn lab-context-menu__texture-btn--ghost" data-texture-clear hidden>Retirer la texture</button>' +
        '<img class="lab-context-menu__texture-preview" data-texture-preview alt="" hidden>' +
        "</div>";
    viewport.appendChild(menuEl);

    /** @type {THREE.Object3D | null} */
    let targetObject = null;
    /** @type {((prop: string, object: THREE.Object3D, value: unknown) => void) | null} */
    let onPropertyChange = null;

    const collisionInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="collision"]')
    );
    const markerVisibleInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="light-marker-visible"]')
    );
    const intensityInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="light-intensity"]')
    );
    const intensityValue = menuEl.querySelector("[data-light-intensity-value]");
    const colorInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="color"]')
    );
    const textureInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector("[data-texture-input]")
    );
    const texturePickBtn = menuEl.querySelector("[data-texture-pick]");
    const textureClearBtn = /** @type {HTMLButtonElement} */ (
        menuEl.querySelector("[data-texture-clear]")
    );
    const texturePreview = /** @type {HTMLImageElement} */ (
        menuEl.querySelector("[data-texture-preview]")
    );

    function updateTextureUi(textureDataUrl) {
        const hasTexture = !!textureDataUrl;
        textureClearBtn.hidden = !hasTexture;
        texturePreview.hidden = !hasTexture;
        if (hasTexture) {
            texturePreview.src = textureDataUrl;
            texturePreview.alt = "Aperçu texture";
        } else {
            texturePreview.removeAttribute("src");
        }
    }

    function clampToViewport() {
        const vpRect = viewport.getBoundingClientRect();
        const menuRect = menuEl.getBoundingClientRect();
        let left = parseFloat(menuEl.style.left);
        let top = parseFloat(menuEl.style.top);
        if (left + menuRect.width > vpRect.width - 4) {
            left = vpRect.width - menuRect.width - 4;
        }
        if (top + menuRect.height > vpRect.height - 4) {
            top = vpRect.height - menuRect.height - 4;
        }
        menuEl.style.left = `${Math.max(4, left)}px`;
        menuEl.style.top = `${Math.max(4, top)}px`;
    }

    /**
     * @param {number} clientX
     * @param {number} clientY
     * @param {THREE.Object3D} object
     * @param {{ collision?: boolean, color?: string, texture?: string | null, kind?: "object" | "light", markerVisible?: boolean, intensity?: number }} state
     */
    function show(clientX, clientY, object, state = {}) {
        const rect = viewport.getBoundingClientRect();
        targetObject = object;
        const isLight = state.kind === "light";
        menuEl.classList.toggle("lab-context-menu--light", isLight);
        if (isLight) {
            markerVisibleInput.checked = state.markerVisible !== false;
            const intensity = typeof state.intensity === "number" ? state.intensity : 1;
            intensityInput.value = String(intensity);
            if (intensityValue) intensityValue.textContent = intensity.toFixed(2);
        } else {
            collisionInput.checked = !!state.collision;
            colorInput.value = state.color || "#00d1ff";
            updateTextureUi(state.texture || null);
        }
        menuEl.style.left = `${clientX - rect.left}px`;
        menuEl.style.top = `${clientY - rect.top}px`;
        menuEl.hidden = false;
        clampToViewport();
    }

    function hide() {
        menuEl.hidden = true;
        targetObject = null;
        if (textureInput) textureInput.value = "";
    }

    function syncProperty(prop, value) {
        if (prop === "collision" && collisionInput.checked !== value) {
            collisionInput.checked = !!value;
        }
        if (prop === "color" && typeof value === "string" && colorInput.value !== value) {
            colorInput.value = value;
        }
        if (prop === "texture") {
            updateTextureUi(typeof value === "string" ? value : null);
        }
        if (prop === "light-marker-visible" && markerVisibleInput.checked !== value) {
            markerVisibleInput.checked = !!value;
        }
        if (prop === "light-intensity" && typeof value === "number") {
            intensityInput.value = String(value);
            if (intensityValue) intensityValue.textContent = value.toFixed(2);
        }
    }

    markerVisibleInput.addEventListener("change", () => {
        if (!targetObject) return;
        onPropertyChange?.("light-marker-visible", targetObject, markerVisibleInput.checked);
    });

    intensityInput.addEventListener("input", () => {
        if (!targetObject) return;
        const value = Number(intensityInput.value);
        if (intensityValue) intensityValue.textContent = value.toFixed(2);
        onPropertyChange?.("light-intensity", targetObject, value);
    });

    bindIntensitySliderWheel(intensityInput, (value) => {
        if (!targetObject) return;
        if (intensityValue) intensityValue.textContent = value.toFixed(2);
        onPropertyChange?.("light-intensity", targetObject, value);
    });

    collisionInput.addEventListener("change", () => {
        if (!targetObject) return;
        onPropertyChange?.("collision", targetObject, collisionInput.checked);
    });

    colorInput.addEventListener("input", () => {
        if (!targetObject) return;
        onPropertyChange?.("color-preview", targetObject, colorInput.value);
    });

    colorInput.addEventListener("change", () => {
        if (!targetObject) return;
        onPropertyChange?.("color", targetObject, colorInput.value);
    });

    menuEl.querySelectorAll("[data-color]").forEach((btn) => {
        btn.addEventListener("click", (event) => {
            event.stopPropagation();
            if (!targetObject) return;
            const hex = btn.getAttribute("data-color");
            if (!hex) return;
            colorInput.value = hex;
            onPropertyChange?.("color", targetObject, hex);
        });
    });

    texturePickBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        textureInput?.click();
    });

    textureClearBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!targetObject) return;
        onPropertyChange?.("texture-clear", targetObject, null);
    });

    textureInput?.addEventListener("change", async () => {
        if (!targetObject) return;
        const file = textureInput.files?.[0];
        textureInput.value = "";
        if (!file) return;

        try {
            const dataUrl = await readImageFileAsDataUrl(file);
            onPropertyChange?.("texture", targetObject, dataUrl);
        } catch (error) {
            onPropertyChange?.("texture-error", targetObject, error);
        }
    });

    menuEl.addEventListener("mousedown", (e) => e.stopPropagation());
    menuEl.addEventListener("contextmenu", (e) => e.preventDefault());

    document.addEventListener("mousedown", (e) => {
        if (menuEl.hidden || menuEl.contains(/** @type {Node} */ (e.target))) return;
        hide();
    });

    window.addEventListener("keydown", (e) => {
        if (e.code === "Escape") hide();
    });

    return {
        show,
        hide,
        syncProperty,
        onPropertyChange(fn) {
            onPropertyChange = fn;
        },
    };
}
