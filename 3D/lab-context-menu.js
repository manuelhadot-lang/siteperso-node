/**
 * Menu contextuel objet — propriétés (collisions, couleur, texture UV…).
 * @param {HTMLElement} viewport
 */
import { readImageFileAsDataUrl, METALNESS_MAX, METALNESS_STEP, NORMAL_SCALE_MAX, NORMAL_SCALE_STEP, OPACITY_MAX, OPACITY_MIN, OPACITY_STEP, ROUGHNESS_MAX, ROUGHNESS_STEP, TEXTURE_TILE_MAX, TEXTURE_TILE_MIN, TEXTURE_TILE_STEP } from "./lab-object-textures.js";
import { pickFilePreservingFullscreen, ensureLabFullscreenAfterFile, restoreFullscreenNow } from "./fullscreen.js";
import {
    bindIntensitySliderWheel,
    bindSpotAngleSliderWheel,
    LIGHT_INTENSITY_MAX,
    LIGHT_INTENSITY_STEP,
    SPOT_ANGLE_MAX,
    SPOT_ANGLE_MIN,
    SPOT_ANGLE_STEP,
} from "./lab-lights.js";
import { bindRangeSliderWheel } from "./wheel-utils.js";
import { clampStairStepCount, clampStairThickness, clampStairRadius, clampStairArcDeg, normalizeStairShape } from "./lab-stair.js";
import {
    clampTubeLength,
    clampTubeRadius,
    clampTubeWall,
    TUBE_DEFAULT_LENGTH,
    TUBE_DEFAULT_RADIUS,
    TUBE_DEFAULT_WALL,
} from "./lab-tube.js";

/** Au-delà de cette taille, l’aperçu JPEG dans le menu fige le navigateur. */
const MAX_TEXTURE_PREVIEW_CHARS = 400_000;

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
        '<div class="lab-context-menu__spot-only lab-context-menu__intensity">' +
        '<label class="lab-context-menu__item lab-context-menu__item--range">' +
        "<span>Angle du spot</span>" +
        '<input type="range" data-prop="spot-angle" min="' +
        SPOT_ANGLE_MIN +
        '" max="' +
        SPOT_ANGLE_MAX +
        '" step="' +
        SPOT_ANGLE_STEP +
        '" value="48">' +
        '<output data-spot-angle-value>48°</output>' +
        "</label>" +
        "</div>" +
        '<ul class="lab-context-menu__list lab-context-menu__object-only">' +
        "<li>" +
        '<label class="lab-context-menu__item">' +
        '<input type="checkbox" data-prop="collision">' +
        "<span>Collisions</span>" +
        "</label>" +
        "</li>" +
        "<li>" +
        '<label class="lab-context-menu__item">' +
        '<input type="checkbox" data-prop="smooth" checked>' +
        "<span>Lissage (smooth)</span>" +
        "</label>" +
        "</li>" +
        "<li>" +
        '<button type="button" class="lab-context-menu__action" data-action="csg-subtract">Perforer (soustraire un objet)…</button>' +
        "</li>" +
        "</ul>" +
        '<details class="lab-context-menu__section lab-context-menu__stair-only" data-section="stair" open>' +
        '<summary class="lab-context-menu__section-title">Escalier</summary>' +
        '<label class="lab-context-menu__item lab-context-menu__item--stair-steps lab-context-menu__stair-flight-only">' +
        "<span>Nombre de marches</span>" +
        '<input type="number" data-prop="stair-steps" min="2" max="24" step="1" value="6">' +
        "</label>" +
        '<label class="lab-context-menu__item lab-context-menu__stair-flight-only">' +
        "<span>Épaisseur marche (m)</span>" +
        '<input type="number" data-prop="stair-thickness" min="0.02" max="0.2" step="0.01" value="0.15">' +
        "</label>" +
        '<label class="lab-context-menu__item lab-context-menu__stair-flight-only">' +
        "<span>Forme</span>" +
        '<select data-prop="stair-shape">' +
        '<option value="straight">Droit</option>' +
        '<option value="circular">Circulaire</option>' +
        "</select>" +
        "</label>" +
        '<div class="lab-context-menu__stair-circular-only lab-context-menu__stair-flight-only">' +
        '<label class="lab-context-menu__item">' +
        "<span>Rayon (m)</span>" +
        '<input type="number" data-prop="stair-radius" min="0.5" max="6" step="0.05" value="1.2">' +
        "</label>" +
        '<label class="lab-context-menu__item">' +
        "<span>Arc (°)</span>" +
        '<input type="number" data-prop="stair-arc" min="30" max="360" step="5" value="90">' +
        "</label>" +
        "</div>" +
        '<p class="lab-context-menu__stair-meta lab-context-menu__stair-flight-only">Espacement vertical (fixe) : <strong data-stair-rise>0,15 m</strong></p>' +
        '<p class="lab-context-menu__stair-meta lab-context-menu__stair-flight-only">Hauteur totale : <strong data-stair-total>0,90 m</strong></p>' +
        '<div class="lab-context-menu__stair-chain lab-context-menu__stair-flight-only">' +
        '<button type="button" class="lab-context-menu__action" data-action="stair-add-landing">Ajouter un palier</button>' +
        "</div>" +
        '<div class="lab-context-menu__stair-chain lab-context-menu__stair-landing-only">' +
        '<p class="lab-context-menu__stair-meta">Nouvelle volée depuis ce palier :</p>' +
        '<button type="button" class="lab-context-menu__action" data-action="stair-continue-90">Escalier +90°</button>' +
        '<button type="button" class="lab-context-menu__action" data-action="stair-continue--90">Escalier −90°</button>' +
        '<button type="button" class="lab-context-menu__action" data-action="stair-continue-180">Escalier 180°</button>' +
        "</div>" +
        "</details>" +
        '<details class="lab-context-menu__section lab-context-menu__tube-only" data-section="tube" open>' +
        '<summary class="lab-context-menu__section-title">Tubulure</summary>' +
        '<label class="lab-context-menu__item">' +
        "<span>Longueur (m)</span>" +
        '<input type="number" data-prop="tube-length" min="0.05" max="200" step="0.05" value="2">' +
        "</label>" +
        '<label class="lab-context-menu__item">' +
        "<span>Rayon (m)</span>" +
        '<input type="number" data-prop="tube-radius" min="0.01" max="8" step="0.01" value="0.12">' +
        "</label>" +
        '<label class="lab-context-menu__item">' +
        "<span>Épaisseur paroi (m, 0 = plein)</span>" +
        '<input type="number" data-prop="tube-wall" min="0" max="2" step="0.005" value="0.025">' +
        "</label>" +
        '<div class="lab-context-menu__stair-chain">' +
        '<p class="lab-context-menu__stair-meta">Continuer depuis une extrémité (coude arrondi) :</p>' +
        '<label class="lab-context-menu__item">' +
        "<span>Longueur suite (m)</span>" +
        '<input type="number" data-prop="tube-continue-length" min="0.05" max="200" step="0.05" value="2">' +
        "</label>" +
        '<label class="lab-context-menu__item">' +
        "<span>Angle horizontal (°)</span>" +
        '<input type="number" data-prop="tube-continue-yaw" min="-180" max="180" step="1" value="90">' +
        "</label>" +
        '<label class="lab-context-menu__item">' +
        "<span>Angle vertical (°)</span>" +
        '<input type="number" data-prop="tube-continue-pitch" min="-180" max="180" step="1" value="0">' +
        "</label>" +
        '<label class="lab-context-menu__item">' +
        "<span>Rayon de coude (m)</span>" +
        '<input type="number" data-prop="tube-continue-bend" min="0.05" max="50" step="0.05" value="0.4">' +
        "</label>" +
        '<div class="lab-context-menu__tube-angle-presets" role="group" aria-label="Coudes rapides">' +
        '<button type="button" class="lab-context-menu__action" data-action="tube-continue-pos" data-tube-yaw="90" data-tube-pitch="0">Coude +90° hor. (bout +)</button>' +
        '<button type="button" class="lab-context-menu__action" data-action="tube-continue-pos" data-tube-yaw="-90" data-tube-pitch="0">Coude −90° hor. (bout +)</button>' +
        '<button type="button" class="lab-context-menu__action" data-action="tube-continue-pos" data-tube-yaw="0" data-tube-pitch="90">Coude +90° vert. (bout +)</button>' +
        '<button type="button" class="lab-context-menu__action" data-action="tube-continue-pos" data-tube-yaw="0" data-tube-pitch="-90">Coude −90° vert. (bout +)</button>' +
        '<button type="button" class="lab-context-menu__action" data-action="tube-continue-neg" data-tube-yaw="90" data-tube-pitch="0">Coude +90° hor. (bout −)</button>' +
        '<button type="button" class="lab-context-menu__action" data-action="tube-continue-neg" data-tube-yaw="-90" data-tube-pitch="0">Coude −90° hor. (bout −)</button>' +
        '<button type="button" class="lab-context-menu__action" data-action="tube-continue-neg" data-tube-yaw="0" data-tube-pitch="90">Coude +90° vert. (bout −)</button>' +
        '<button type="button" class="lab-context-menu__action" data-action="tube-continue-neg" data-tube-yaw="0" data-tube-pitch="-90">Coude −90° vert. (bout −)</button>' +
        "</div>" +
        '<button type="button" class="lab-context-menu__action" data-action="tube-continue-pos">Continuer bout +</button>' +
        '<button type="button" class="lab-context-menu__action" data-action="tube-continue-neg">Continuer bout −</button>' +
        "</div>" +
        "</details>" +
        '<details class="lab-context-menu__section lab-context-menu__object-only" data-section="color" open>' +
        '<summary class="lab-context-menu__section-title">Couleur</summary>' +
        '<div class="lab-context-menu__color">' +
        '<label class="lab-context-menu__picker-wrap" title="Nuancier">' +
        '<input type="color" data-prop="color" class="lab-context-menu__picker" aria-label="Nuancier">' +
        "</label>" +
        `<div class="lab-context-menu__swatches" role="list">${presetButtons}</div>` +
        "</div>" +
        "</details>" +
        '<details class="lab-context-menu__section lab-context-menu__object-only" data-section="textures">' +
        '<summary class="lab-context-menu__section-title">Textures</summary>' +
        '<div class="lab-context-menu__texture">' +
        '<span class="lab-context-menu__color-label">Couleur UV</span>' +
        '<div class="lab-context-menu__texture-actions">' +
        '<input type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" hidden data-texture-input>' +
        '<button type="button" class="lab-context-menu__texture-btn" data-texture-pick>JPEG / PNG</button>' +
        '<button type="button" class="lab-context-menu__texture-btn lab-context-menu__texture-btn--ghost" data-texture-clear hidden title="Retirer">×</button>' +
        "</div>" +
        '<img class="lab-context-menu__texture-preview" data-texture-preview alt="" hidden>' +
        "</div>" +
        '<div class="lab-context-menu__texture">' +
        '<span class="lab-context-menu__color-label">Normal map</span>' +
        '<div class="lab-context-menu__texture-actions">' +
        '<input type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" hidden data-normal-texture-input>' +
        '<button type="button" class="lab-context-menu__texture-btn" data-normal-texture-pick>Normal map</button>' +
        '<button type="button" class="lab-context-menu__texture-btn lab-context-menu__texture-btn--ghost" data-normal-texture-clear hidden title="Retirer">×</button>' +
        "</div>" +
        '<img class="lab-context-menu__texture-preview" data-normal-texture-preview alt="" hidden>' +
        "</div>" +
        '<div class="lab-context-menu__intensity lab-context-menu__intensity--compact">' +
        '<label class="lab-context-menu__item lab-context-menu__item--range">' +
        "<span>Tile</span>" +
        '<input type="range" data-prop="texture-tile" min="' +
        TEXTURE_TILE_MIN +
        '" max="' +
        TEXTURE_TILE_MAX +
        '" step="' +
        TEXTURE_TILE_STEP +
        '" value="1">' +
        '<output data-texture-tile-value>1.00</output>' +
        "</label>" +
        "</div>" +
        '<div class="lab-context-menu__intensity lab-context-menu__intensity--compact">' +
        '<label class="lab-context-menu__item lab-context-menu__item--range">' +
        "<span>Intensité normale</span>" +
        '<input type="range" data-prop="normal-scale" min="0" max="' +
        NORMAL_SCALE_MAX +
        '" step="' +
        NORMAL_SCALE_STEP +
        '" value="1">' +
        '<output data-normal-scale-value>1.00</output>' +
        "</label>" +
        "</div>" +
        "</details>" +
        '<details class="lab-context-menu__section lab-context-menu__object-only" data-section="material" open>' +
        '<summary class="lab-context-menu__section-title">Matériau</summary>' +
        '<div class="lab-context-menu__sliders">' +
        '<div class="lab-context-menu__intensity lab-context-menu__intensity--compact">' +
        '<label class="lab-context-menu__item lab-context-menu__item--range">' +
        "<span>Rugosité</span>" +
        '<input type="range" data-prop="roughness" min="0" max="' +
        ROUGHNESS_MAX +
        '" step="' +
        ROUGHNESS_STEP +
        '" value="0.65">' +
        '<output data-roughness-value>0.65</output>' +
        "</label>" +
        "</div>" +
        '<div class="lab-context-menu__intensity lab-context-menu__intensity--compact">' +
        '<label class="lab-context-menu__item lab-context-menu__item--range">' +
        "<span>Métallique</span>" +
        '<input type="range" data-prop="metalness" min="0" max="' +
        METALNESS_MAX +
        '" step="' +
        METALNESS_STEP +
        '" value="0.05">' +
        '<output data-metalness-value>0.05</output>' +
        "</label>" +
        "</div>" +
        '<div class="lab-context-menu__intensity lab-context-menu__intensity--compact">' +
        '<label class="lab-context-menu__item lab-context-menu__item--range">' +
        "<span>Opacité</span>" +
        '<input type="range" data-prop="opacity" min="' +
        OPACITY_MIN +
        '" max="' +
        OPACITY_MAX +
        '" step="' +
        OPACITY_STEP +
        '" value="1">' +
        '<output data-opacity-value>1.00</output>' +
        "</label>" +
        "</div>" +
        "</div>" +
        '<label class="lab-context-menu__item lab-context-menu__item--toggle">' +
        '<input type="checkbox" data-prop="glass">' +
        "<span>Effet verre</span>" +
        "</label>" +
        '<button type="button" class="lab-context-menu__action" data-action="metal-preset">Métal poli</button>' +
        "</details>";
    const menuHost =
        document.getElementById("lab-workspace") || viewport || document.body;
    menuHost.appendChild(menuEl);

    /** @type {number} */
    let suppressOutsideCloseUntil = 0;

    /** @param {HTMLInputElement | null} slider @param {(value: number) => void} onChange @param {object} [opts] */
    function bindMenuSliderWheel(slider, onChange, opts = {}) {
        if (!slider) return;
        bindRangeSliderWheel(slider, onChange, {
            wheelFactor: 0.015,
            shiftMultiplier: 2,
            host: slider.closest(".lab-context-menu__intensity") ?? slider,
            ...opts,
        });
    }

    /** @type {THREE.Object3D | null} */
    let targetObject = null;
    /** @type {((prop: string, object: THREE.Object3D, value: unknown) => void) | null} */
    let propertyChangeHandler = null;
    /** @type {((action: string, object: THREE.Object3D, detail?: Record<string, number>) => void) | null} */
    let actionHandler = null;

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
    const spotAngleInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="spot-angle"]')
    );
    const spotAngleValue = menuEl.querySelector("[data-spot-angle-value]");
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
    const normalTextureInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector("[data-normal-texture-input]")
    );
    const normalTexturePickBtn = menuEl.querySelector("[data-normal-texture-pick]");
    const normalTextureClearBtn = /** @type {HTMLButtonElement} */ (
        menuEl.querySelector("[data-normal-texture-clear]")
    );
    const normalTexturePreview = /** @type {HTMLImageElement} */ (
        menuEl.querySelector("[data-normal-texture-preview]")
    );
    const roughnessInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="roughness"]')
    );
    const roughnessValue = menuEl.querySelector("[data-roughness-value]");
    const metalnessInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="metalness"]')
    );
    const metalnessValue = menuEl.querySelector("[data-metalness-value]");
    const normalScaleInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="normal-scale"]')
    );
    const normalScaleValue = menuEl.querySelector("[data-normal-scale-value]");
    const textureTileInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="texture-tile"]')
    );
    const textureTileValue = menuEl.querySelector("[data-texture-tile-value]");
    const opacityInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="opacity"]')
    );
    const opacityValue = menuEl.querySelector("[data-opacity-value]");
    const glassInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="glass"]')
    );
    const smoothInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="smooth"]')
    );
    const metalPresetBtn = /** @type {HTMLButtonElement | null} */ (
        menuEl.querySelector('[data-action="metal-preset"]')
    );
    const stairStepsInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="stair-steps"]')
    );
    const stairThicknessInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="stair-thickness"]')
    );
    const stairShapeSelect = /** @type {HTMLSelectElement} */ (
        menuEl.querySelector('[data-prop="stair-shape"]')
    );
    const stairRadiusInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="stair-radius"]')
    );
    const stairArcInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="stair-arc"]')
    );
    const stairCircularOnly = menuEl.querySelector(".lab-context-menu__stair-circular-only");
    const stairRiseEl = menuEl.querySelector("[data-stair-rise]");
    const stairTotalEl = menuEl.querySelector("[data-stair-total]");
    const tubeLengthInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="tube-length"]')
    );
    const tubeRadiusInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="tube-radius"]')
    );
    const tubeWallInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="tube-wall"]')
    );
    const tubeContinueLengthInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="tube-continue-length"]')
    );
    const tubeContinueYawInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="tube-continue-yaw"]')
    );
    const tubeContinuePitchInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="tube-continue-pitch"]')
    );
    const tubeContinueBendInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="tube-continue-bend"]')
    );

    function syncStairCircularVisibility(shape) {
        const circular = normalizeStairShape(shape) === "circular";
        if (stairCircularOnly instanceof HTMLElement) {
            stairCircularOnly.hidden = !circular;
        }
    }

    /** @type {boolean} */
    let hasColorTexture = false;
    /** @type {boolean} */
    let hasNormalTexture = false;

    function syncTextureTileUi() {
        const enabled = hasColorTexture || hasNormalTexture;
        textureTileInput.disabled = !enabled;
    }

    function canPreviewTextureDataUrl(textureDataUrl) {
        return !!textureDataUrl && textureDataUrl.length <= MAX_TEXTURE_PREVIEW_CHARS;
    }

    function updateTextureUi(textureDataUrl) {
        hasColorTexture = !!textureDataUrl;
        const hasTexture = hasColorTexture;
        textureClearBtn.hidden = !hasTexture;
        texturePreview.hidden = !hasTexture;
        if (hasTexture) {
            if (canPreviewTextureDataUrl(textureDataUrl)) {
                texturePreview.src = textureDataUrl;
                texturePreview.alt = "Aperçu texture";
            } else {
                texturePreview.removeAttribute("src");
                texturePreview.alt = "Texture lourde — aperçu désactivé";
            }
        } else {
            texturePreview.removeAttribute("src");
        }
        syncTextureTileUi();
    }

    function updateNormalTextureUi(textureDataUrl) {
        hasNormalTexture = !!textureDataUrl;
        const hasTexture = hasNormalTexture;
        normalTextureClearBtn.hidden = !hasTexture;
        normalTexturePreview.hidden = !hasTexture;
        if (hasTexture) {
            if (canPreviewTextureDataUrl(textureDataUrl)) {
                normalTexturePreview.src = textureDataUrl;
                normalTexturePreview.alt = "Aperçu normal map";
            } else {
                normalTexturePreview.removeAttribute("src");
                normalTexturePreview.alt = "Normal map lourde — aperçu désactivé";
            }
        } else {
            normalTexturePreview.removeAttribute("src");
        }
        normalScaleInput.disabled = !hasNormalTexture;
        syncTextureTileUi();
    }

    function clampToViewport() {
        const menuRect = menuEl.getBoundingClientRect();
        let left = parseFloat(menuEl.style.left);
        let top = parseFloat(menuEl.style.top);
        if (left + menuRect.width > window.innerWidth - 8) {
            left = window.innerWidth - menuRect.width - 8;
        }
        if (top + menuRect.height > window.innerHeight - 8) {
            top = window.innerHeight - menuRect.height - 8;
        }
        menuEl.style.left = `${Math.max(8, left)}px`;
        menuEl.style.top = `${Math.max(8, top)}px`;
    }

    /**
     * @param {number} clientX
     * @param {number} clientY
     * @param {THREE.Object3D} object
     * @param {{ collision?: boolean, color?: string, texture?: string | null, normalTexture?: string | null, textureTile?: number, normalScale?: number, roughness?: number, metalness?: number, opacity?: number, glass?: boolean, smooth?: boolean, kind?: "object" | "light" | "stair" | "landing" | "tube", lightType?: string, markerVisible?: boolean, intensity?: number, spotAngle?: number, stairStepCount?: number, stairStepRiseLabel?: string, stairTotalHeightLabel?: string, stairThickness?: number, stairShape?: string, stairRadius?: number, stairArcDeg?: number, tubeLength?: number, tubeRadius?: number, tubeWall?: number }} state
     */
    function show(clientX, clientY, object, state = {}) {
        targetObject = object;
        const isLight = state.kind === "light";
        const isStair = state.kind === "stair" || state.kind === "landing";
        const isLanding = state.kind === "landing";
        const isTube = state.kind === "tube";
        menuEl.classList.toggle("lab-context-menu--light", isLight);
        menuEl.classList.toggle("lab-context-menu--spot", isLight && state.lightType === "spot");
        menuEl.classList.toggle("lab-context-menu--stair", isStair);
        menuEl.classList.toggle("lab-context-menu--landing", isLanding);
        menuEl.classList.toggle("lab-context-menu--tube", isTube);
        const stairSectionTitle = menuEl.querySelector(
            '.lab-context-menu__section[data-section="stair"] > .lab-context-menu__section-title'
        );
        if (stairSectionTitle) {
            stairSectionTitle.textContent = isLanding ? "Palier" : "Escalier";
        }
        if (isLight) {
            markerVisibleInput.checked = state.markerVisible !== false;
            const intensity = typeof state.intensity === "number" ? state.intensity : 1;
            intensityInput.value = String(intensity);
            if (intensityValue) intensityValue.textContent = intensity.toFixed(2);
            const spotAngle = typeof state.spotAngle === "number" ? state.spotAngle : 48;
            spotAngleInput.value = String(spotAngle);
            if (spotAngleValue) spotAngleValue.textContent = `${Math.round(spotAngle)}°`;
        } else {
            collisionInput.checked = !!state.collision;
            colorInput.value = state.color || "#00d1ff";
            const textureTile = typeof state.textureTile === "number" ? state.textureTile : 1;
            textureTileInput.value = String(textureTile);
            if (textureTileValue) textureTileValue.textContent = textureTile.toFixed(2);
            const normalScale = typeof state.normalScale === "number" ? state.normalScale : 1;
            normalScaleInput.value = String(normalScale);
            if (normalScaleValue) normalScaleValue.textContent = normalScale.toFixed(2);
            normalScaleInput.disabled = !state.normalTexture;
            syncTextureTileUi();
            const roughness = typeof state.roughness === "number" ? state.roughness : 0.65;
            roughnessInput.value = String(roughness);
            if (roughnessValue) roughnessValue.textContent = roughness.toFixed(2);
            const metalness = typeof state.metalness === "number" ? state.metalness : 0.05;
            metalnessInput.value = String(metalness);
            if (metalnessValue) metalnessValue.textContent = metalness.toFixed(2);
            const opacity = typeof state.opacity === "number" ? state.opacity : 1;
            opacityInput.value = String(opacity);
            if (opacityValue) opacityValue.textContent = opacity.toFixed(2);
            glassInput.checked = !!state.glass;
            smoothInput.checked = state.smooth !== false;
            if (isStair && stairStepsInput) {
                stairStepsInput.value = String(state.stairStepCount ?? 6);
                if (stairThicknessInput) {
                    stairThicknessInput.value = String(state.stairThickness ?? 0.15);
                }
                if (stairShapeSelect) {
                    stairShapeSelect.value = normalizeStairShape(state.stairShape);
                }
                if (stairRadiusInput) {
                    stairRadiusInput.value = String(state.stairRadius ?? 1.2);
                }
                if (stairArcInput) {
                    stairArcInput.value = String(state.stairArcDeg ?? 90);
                }
                syncStairCircularVisibility(state.stairShape);
                if (stairRiseEl) {
                    stairRiseEl.textContent = state.stairStepRiseLabel || "0,15 m";
                }
                if (stairTotalEl) {
                    stairTotalEl.textContent = state.stairTotalHeightLabel || "0,90 m";
                }
            }
            if (isTube) {
                if (tubeLengthInput) {
                    tubeLengthInput.value = String(state.tubeLength ?? TUBE_DEFAULT_LENGTH);
                }
                if (tubeRadiusInput) {
                    tubeRadiusInput.value = String(state.tubeRadius ?? TUBE_DEFAULT_RADIUS);
                }
                if (tubeWallInput) {
                    tubeWallInput.value = String(state.tubeWall ?? TUBE_DEFAULT_WALL);
                }
                if (tubeContinueLengthInput) {
                    tubeContinueLengthInput.value = String(
                        state.tubeContinueLength ?? state.tubeLength ?? TUBE_DEFAULT_LENGTH
                    );
                }
                if (tubeContinueYawInput) tubeContinueYawInput.value = "90";
                if (tubeContinuePitchInput) tubeContinuePitchInput.value = "0";
                if (tubeContinueBendInput) {
                    const r = Number(state.tubeRadius ?? TUBE_DEFAULT_RADIUS);
                    tubeContinueBendInput.value = String(
                        Math.max(0.15, (Number.isFinite(r) ? r : TUBE_DEFAULT_RADIUS) * 3)
                    );
                }
            }
        }
        menuEl.style.left = `${clientX}px`;
        menuEl.style.top = `${clientY}px`;
        menuEl.hidden = false;
        menuEl.removeAttribute("hidden");
        menuEl.classList.add("is-open");
        suppressOutsideCloseUntil = performance.now() + 500;
        requestAnimationFrame(() => clampToViewport());

        if (!isLight) {
            const textureUrl = state.texture || null;
            const normalUrl = state.normalTexture || null;
            const texturesSection = menuEl.querySelector('[data-section="textures"]');
            if (texturesSection instanceof HTMLDetailsElement) {
                texturesSection.open = !!(textureUrl || normalUrl);
            }
            requestAnimationFrame(() => {
                if (targetObject !== object) return;
                updateTextureUi(textureUrl);
                updateNormalTextureUi(normalUrl);
            });
        }
    }

    function hide() {
        menuEl.hidden = true;
        menuEl.classList.remove("is-open");
        targetObject = null;
        if (textureInput) textureInput.value = "";
        if (normalTextureInput) normalTextureInput.value = "";
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
        if (prop === "normal-texture") {
            const url = typeof value === "string" ? value : null;
            updateNormalTextureUi(url);
            normalScaleInput.disabled = !url;
        }
        if (prop === "normal-scale" && typeof value === "number") {
            normalScaleInput.value = String(value);
            if (normalScaleValue) normalScaleValue.textContent = value.toFixed(2);
        }
        if (prop === "texture-tile" && typeof value === "number") {
            textureTileInput.value = String(value);
            if (textureTileValue) textureTileValue.textContent = value.toFixed(2);
        }
        if (prop === "roughness" && typeof value === "number") {
            roughnessInput.value = String(value);
            if (roughnessValue) roughnessValue.textContent = value.toFixed(2);
        }
        if (prop === "metalness" && typeof value === "number") {
            metalnessInput.value = String(value);
            if (metalnessValue) metalnessValue.textContent = value.toFixed(2);
        }
        if (prop === "opacity" && typeof value === "number") {
            opacityInput.value = String(value);
            if (opacityValue) opacityValue.textContent = value.toFixed(2);
        }
        if (prop === "glass" && glassInput.checked !== value) {
            glassInput.checked = !!value;
        }
        if (prop === "smooth" && smoothInput.checked !== value) {
            smoothInput.checked = !!value;
        }
        if (prop === "light-marker-visible" && markerVisibleInput.checked !== value) {
            markerVisibleInput.checked = !!value;
        }
        if (prop === "light-intensity" && typeof value === "number") {
            intensityInput.value = String(value);
            if (intensityValue) intensityValue.textContent = value.toFixed(2);
        }
        if (prop === "spot-angle" && typeof value === "number") {
            spotAngleInput.value = String(value);
            if (spotAngleValue) spotAngleValue.textContent = `${Math.round(value)}°`;
        }
        if (prop === "stair-steps" && typeof value === "number" && stairStepsInput) {
            stairStepsInput.value = String(value);
        }
        if (prop === "stair-thickness" && typeof value === "number" && stairThicknessInput) {
            stairThicknessInput.value = String(value);
        }
        if (prop === "stair-shape" && typeof value === "string" && stairShapeSelect) {
            stairShapeSelect.value = normalizeStairShape(value);
            syncStairCircularVisibility(value);
        }
        if (prop === "stair-radius" && typeof value === "number" && stairRadiusInput) {
            stairRadiusInput.value = String(value);
        }
        if (prop === "stair-arc" && typeof value === "number" && stairArcInput) {
            stairArcInput.value = String(value);
        }
        if (prop === "stair-rise-label" && typeof value === "string" && stairRiseEl) {
            stairRiseEl.textContent = value;
        }
        if (prop === "stair-total-label" && typeof value === "string" && stairTotalEl) {
            stairTotalEl.textContent = value;
        }
        if (prop === "tube-length" && typeof value === "number" && tubeLengthInput) {
            tubeLengthInput.value = String(value);
        }
        if (prop === "tube-radius" && typeof value === "number" && tubeRadiusInput) {
            tubeRadiusInput.value = String(value);
        }
        if (prop === "tube-wall" && typeof value === "number" && tubeWallInput) {
            tubeWallInput.value = String(value);
        }
    }

    markerVisibleInput.addEventListener("change", () => {
        if (!targetObject) return;
        propertyChangeHandler?.("light-marker-visible", targetObject, markerVisibleInput.checked);
    });

    intensityInput.addEventListener("input", () => {
        if (!targetObject) return;
        const value = Number(intensityInput.value);
        if (intensityValue) intensityValue.textContent = value.toFixed(2);
        propertyChangeHandler?.("light-intensity", targetObject, value);
    });

    bindIntensitySliderWheel(intensityInput, (value) => {
        if (!targetObject) return;
        if (intensityValue) intensityValue.textContent = value.toFixed(2);
        propertyChangeHandler?.("light-intensity", targetObject, value);
    });

    spotAngleInput.addEventListener("input", () => {
        if (!targetObject) return;
        const value = Number(spotAngleInput.value);
        if (spotAngleValue) spotAngleValue.textContent = `${Math.round(value)}°`;
        propertyChangeHandler?.("spot-angle", targetObject, value);
    });

    bindSpotAngleSliderWheel(spotAngleInput, (value) => {
        if (!targetObject) return;
        if (spotAngleValue) spotAngleValue.textContent = `${Math.round(value)}°`;
        propertyChangeHandler?.("spot-angle", targetObject, value);
    });

    collisionInput.addEventListener("change", () => {
        if (!targetObject) return;
        propertyChangeHandler?.("collision", targetObject, collisionInput.checked);
    });

    if (stairStepsInput) {
        const applyStairStepsFromMenu = () => {
            if (!targetObject) return;
            const value = clampStairStepCount(stairStepsInput.value);
            stairStepsInput.value = String(value);
            propertyChangeHandler?.("stair-steps", targetObject, value);
        };
        stairStepsInput.addEventListener("change", applyStairStepsFromMenu);
        stairStepsInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                applyStairStepsFromMenu();
            }
        });
    }

    if (stairThicknessInput) {
        const applyThickness = () => {
            if (!targetObject) return;
            const value = clampStairThickness(stairThicknessInput.value);
            stairThicknessInput.value = String(value);
            propertyChangeHandler?.("stair-thickness", targetObject, value);
        };
        stairThicknessInput.addEventListener("change", applyThickness);
        stairThicknessInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                applyThickness();
            }
        });
    }

    if (stairShapeSelect) {
        stairShapeSelect.addEventListener("change", () => {
            if (!targetObject) return;
            const value = normalizeStairShape(stairShapeSelect.value);
            stairShapeSelect.value = value;
            syncStairCircularVisibility(value);
            propertyChangeHandler?.("stair-shape", targetObject, value);
        });
    }

    if (stairRadiusInput) {
        const applyRadius = () => {
            if (!targetObject) return;
            const value = clampStairRadius(stairRadiusInput.value);
            stairRadiusInput.value = String(value);
            propertyChangeHandler?.("stair-radius", targetObject, value);
        };
        stairRadiusInput.addEventListener("change", applyRadius);
        stairRadiusInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                applyRadius();
            }
        });
    }

    if (stairArcInput) {
        const applyArc = () => {
            if (!targetObject) return;
            const value = clampStairArcDeg(stairArcInput.value);
            stairArcInput.value = String(value);
            propertyChangeHandler?.("stair-arc", targetObject, value);
        };
        stairArcInput.addEventListener("change", applyArc);
        stairArcInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                applyArc();
            }
        });
    }

    if (tubeLengthInput) {
        const applyTubeLength = () => {
            if (!targetObject) return;
            const value = clampTubeLength(tubeLengthInput.value);
            tubeLengthInput.value = String(value);
            propertyChangeHandler?.("tube-length", targetObject, value);
        };
        tubeLengthInput.addEventListener("change", applyTubeLength);
        tubeLengthInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                applyTubeLength();
            }
        });
    }

    if (tubeRadiusInput) {
        const applyTubeRadius = () => {
            if (!targetObject) return;
            const value = clampTubeRadius(tubeRadiusInput.value);
            tubeRadiusInput.value = String(value);
            propertyChangeHandler?.("tube-radius", targetObject, value);
        };
        tubeRadiusInput.addEventListener("change", applyTubeRadius);
        tubeRadiusInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                applyTubeRadius();
            }
        });
    }

    if (tubeWallInput) {
        const applyTubeWall = () => {
            if (!targetObject) return;
            const radius = clampTubeRadius(tubeRadiusInput?.value ?? TUBE_DEFAULT_RADIUS);
            const value = clampTubeWall(tubeWallInput.value, radius);
            tubeWallInput.value = String(value);
            propertyChangeHandler?.("tube-wall", targetObject, value);
        };
        tubeWallInput.addEventListener("change", applyTubeWall);
        tubeWallInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                applyTubeWall();
            }
        });
    }

    colorInput.addEventListener("input", () => {
        if (!targetObject) return;
        propertyChangeHandler?.("color-preview", targetObject, colorInput.value);
    });

    colorInput.addEventListener("change", () => {
        if (!targetObject) return;
        propertyChangeHandler?.("color", targetObject, colorInput.value);
    });

    menuEl.querySelectorAll("[data-color]").forEach((btn) => {
        btn.addEventListener("click", (event) => {
            event.stopPropagation();
            if (!targetObject) return;
            const hex = btn.getAttribute("data-color");
            if (!hex) return;
            colorInput.value = hex;
            propertyChangeHandler?.("color", targetObject, hex);
        });
    });

    texturePickBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!textureInput) return;
        void pickFilePreservingFullscreen(textureInput);
    });

    textureClearBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!targetObject) return;
        propertyChangeHandler?.("texture-clear", targetObject, null);
    });

    textureInput?.addEventListener("change", async () => {
        if (!targetObject) return;
        const file = textureInput.files?.[0];
        textureInput.value = "";
        if (!file) return;

        void restoreFullscreenNow();
        try {
            const dataUrl = await readImageFileAsDataUrl(file);
            propertyChangeHandler?.("texture", targetObject, dataUrl);
        } catch (error) {
            propertyChangeHandler?.("texture-error", targetObject, error);
        } finally {
            void ensureLabFullscreenAfterFile();
        }
    });

    normalTexturePickBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!normalTextureInput) return;
        void pickFilePreservingFullscreen(normalTextureInput);
    });

    normalTextureClearBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!targetObject) return;
        propertyChangeHandler?.("normal-texture-clear", targetObject, null);
    });

    normalTextureInput?.addEventListener("change", async () => {
        if (!targetObject) return;
        const file = normalTextureInput.files?.[0];
        normalTextureInput.value = "";
        if (!file) return;

        void restoreFullscreenNow();
        try {
            const dataUrl = await readImageFileAsDataUrl(file);
            propertyChangeHandler?.("normal-texture", targetObject, dataUrl);
        } catch (error) {
            propertyChangeHandler?.("normal-texture-error", targetObject, error);
        } finally {
            void ensureLabFullscreenAfterFile();
        }
    });

    textureTileInput.addEventListener("input", () => {
        if (!targetObject) return;
        const value = Number(textureTileInput.value);
        if (textureTileValue) textureTileValue.textContent = value.toFixed(2);
        propertyChangeHandler?.("texture-tile", targetObject, value);
    });

    bindMenuSliderWheel(textureTileInput, (value) => {
        if (!targetObject) return;
        if (textureTileValue) textureTileValue.textContent = value.toFixed(2);
        propertyChangeHandler?.("texture-tile", targetObject, value);
    }, { step: TEXTURE_TILE_STEP });

    opacityInput.addEventListener("input", () => {
        if (!targetObject) return;
        const value = Number(opacityInput.value);
        if (opacityValue) opacityValue.textContent = value.toFixed(2);
        propertyChangeHandler?.("opacity", targetObject, value);
    });

    bindMenuSliderWheel(opacityInput, (value) => {
        if (!targetObject) return;
        if (opacityValue) opacityValue.textContent = value.toFixed(2);
        propertyChangeHandler?.("opacity", targetObject, value);
    }, { step: OPACITY_STEP });

    glassInput.addEventListener("change", () => {
        if (!targetObject) return;
        propertyChangeHandler?.("glass", targetObject, glassInput.checked);
    });

    smoothInput.addEventListener("change", () => {
        if (!targetObject) return;
        propertyChangeHandler?.("smooth", targetObject, smoothInput.checked);
    });

    metalPresetBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!targetObject) return;
        propertyChangeHandler?.("metal-preset", targetObject, true);
    });

    metalnessInput.addEventListener("input", () => {
        if (!targetObject) return;
        const value = Number(metalnessInput.value);
        if (metalnessValue) metalnessValue.textContent = value.toFixed(2);
        propertyChangeHandler?.("metalness", targetObject, value);
    });

    bindMenuSliderWheel(metalnessInput, (value) => {
        if (!targetObject) return;
        if (metalnessValue) metalnessValue.textContent = value.toFixed(2);
        propertyChangeHandler?.("metalness", targetObject, value);
    }, { step: METALNESS_STEP });

    normalScaleInput.addEventListener("input", () => {
        if (!targetObject) return;
        const value = Number(normalScaleInput.value);
        if (normalScaleValue) normalScaleValue.textContent = value.toFixed(2);
        propertyChangeHandler?.("normal-scale", targetObject, value);
    });

    bindMenuSliderWheel(normalScaleInput, (value) => {
        if (!targetObject) return;
        if (normalScaleValue) normalScaleValue.textContent = value.toFixed(2);
        propertyChangeHandler?.("normal-scale", targetObject, value);
    }, { step: NORMAL_SCALE_STEP });

    roughnessInput.addEventListener("input", () => {
        if (!targetObject) return;
        const value = Number(roughnessInput.value);
        if (roughnessValue) roughnessValue.textContent = value.toFixed(2);
        propertyChangeHandler?.("roughness", targetObject, value);
    });

    bindMenuSliderWheel(roughnessInput, (value) => {
        if (!targetObject) return;
        if (roughnessValue) roughnessValue.textContent = value.toFixed(2);
        propertyChangeHandler?.("roughness", targetObject, value);
    }, { step: ROUGHNESS_STEP });

    menuEl.addEventListener("mousedown", (e) => e.stopPropagation());
    menuEl.addEventListener("contextmenu", (e) => e.preventDefault());

    menuEl.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-action]");
        if (!btn || !targetObject) return;
        const action = btn.getAttribute("data-action");
        if (!action) return;
        event.stopPropagation();
        /** @type {Record<string, number> | undefined} */
        let detail;
        if (action === "tube-continue-pos" || action === "tube-continue-neg") {
            const parseAngle = (raw) => {
                const n = Number(String(raw ?? "0").replace(",", "."));
                return Number.isFinite(n) ? Math.min(180, Math.max(-180, n)) : 0;
            };
            const yawFromBtn = btn.getAttribute("data-tube-yaw");
            const pitchFromBtn = btn.getAttribute("data-tube-pitch");
            if (yawFromBtn != null && tubeContinueYawInput) {
                tubeContinueYawInput.value = yawFromBtn;
            }
            if (pitchFromBtn != null && tubeContinuePitchInput) {
                tubeContinuePitchInput.value = pitchFromBtn;
            }
            const bendRaw = Number(
                String(tubeContinueBendInput?.value ?? "0.4").replace(",", ".")
            );
            detail = {
                length: clampTubeLength(
                    String(tubeContinueLengthInput?.value ?? TUBE_DEFAULT_LENGTH).replace(",", ".")
                ),
                yaw: parseAngle(yawFromBtn ?? tubeContinueYawInput?.value),
                pitch: parseAngle(pitchFromBtn ?? tubeContinuePitchInput?.value),
                bendRadius: Number.isFinite(bendRaw) && bendRaw > 0 ? bendRaw : 0.4,
            };
        }
        actionHandler?.(action, targetObject, detail);
        hide();
    });

    document.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        if (performance.now() < suppressOutsideCloseUntil) return;
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
            propertyChangeHandler = fn;
        },
        onAction(fn) {
            actionHandler = fn;
        },
    };
}
