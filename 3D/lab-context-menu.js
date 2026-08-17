/**
 * Menu contextuel objet — propriétés (collisions, couleur, texture UV…).
 * @param {HTMLElement} viewport
 */
import { readImageFileAsDataUrl, METALNESS_MAX, METALNESS_STEP, NORMAL_SCALE_MAX, NORMAL_SCALE_STEP, OPACITY_MAX, OPACITY_MIN, OPACITY_STEP, ROUGHNESS_MAX, ROUGHNESS_STEP, TEXTURE_TILE_MAX, TEXTURE_TILE_MIN, TEXTURE_TILE_STEP } from "./lab-object-textures.js";
import { pickFilePreservingFullscreen, ensureLabFullscreenAfterFile, restoreFullscreenNow } from "./fullscreen.js";
import {
    bindIntensitySliderWheel,
    bindSpotAngleSliderWheel,
    bindSpotPenumbraSliderWheel,
    LIGHT_INTENSITY_MAX,
    LIGHT_INTENSITY_STEP,
    SPOT_ANGLE_MAX,
    SPOT_ANGLE_MIN,
    SPOT_ANGLE_STEP,
    SPOT_PENUMBRA_MAX,
    SPOT_PENUMBRA_MIN,
    SPOT_PENUMBRA_STEP,
} from "./lab-lights.js";
import { REFLECTION_MAX, REFLECTION_MIN, REFLECTION_STEP } from "./lab-mirror.js";
import {
    bindShadowOpacitySliderWheel,
} from "./lab-shadows.js";
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
import {
    clampArchLength,
    clampArchWidth,
    clampArchHeight,
    clampArchWall,
    clampArchWingA,
    clampArchWingB,
    clampArchFloors,
    normalizeArchSurface,
    normalizeArchLayout,
    isArchSlabSurface,
    getArchTargetWallOptions,
    computeArchWallSpan,
    openingBelongsToArchFace,
    ARCH_WALL_LABELS,
    ARCH_DEFAULT_LENGTH,
    ARCH_DEFAULT_WIDTH,
    ARCH_DEFAULT_HEIGHT,
    ARCH_DEFAULT_WALL,
    ARCH_DEFAULT_WING_A,
    ARCH_DEFAULT_WING_B,
    ARCH_DEFAULT_FLOORS,
    ARCH_OPENING_EDGE,
} from "./lab-architecture.js";

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
        '<ul class="lab-context-menu__list">' +
        "<li>" +
        '<button type="button" class="lab-context-menu__action" data-action="rename" title="Change le nom affiché dans le panneau Scène (Ctrl+S pour mémoriser)">Renommer…</button>' +
        "</li>" +
        "</ul>" +
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
        '<div class="lab-context-menu__light-only lab-context-menu__intensity">' +
        '<label class="lab-context-menu__item lab-context-menu__item--range" title="0 = ombre douce / claire, 1 = ombre bien marquée">' +
        "<span>Densité d’ombre</span>" +
        '<input type="range" data-prop="light-shadow-opacity" min="0" max="1" step="0.05" value="0.85">' +
        '<output data-light-shadow-opacity-value>0,85</output>' +
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
        '<div class="lab-context-menu__spot-only lab-context-menu__intensity">' +
        '<label class="lab-context-menu__item lab-context-menu__item--range" title="0 = bord net, 1 = bord très doux">' +
        "<span>Pénombre</span>" +
        '<input type="range" data-prop="spot-penumbra" min="' +
        SPOT_PENUMBRA_MIN +
        '" max="' +
        SPOT_PENUMBRA_MAX +
        '" step="' +
        SPOT_PENUMBRA_STEP +
        '" value="0.45">' +
        '<output data-spot-penumbra-value>0,45</output>' +
        "</label>" +
        "</div>" +
        '<ul class="lab-context-menu__list lab-context-menu__object-only">' +
        "<li>" +
        '<label class="lab-context-menu__item">' +
        '<input type="checkbox" data-prop="collision">' +
        "<span>Collisions</span>" +
        "</label>" +
        "</li>" +
        "<li class=\"lab-context-menu__hide-on-architecture\">" +
        '<label class="lab-context-menu__item">' +
        '<input type="checkbox" data-prop="smooth" checked>' +
        "<span>Lissage (smooth)</span>" +
        "</label>" +
        "</li>" +
        "<li>" +
        '<button type="button" class="lab-context-menu__action" data-action="place-avatar">Placer l’avatar ici</button>' +
        "</li>" +
        "<li>" +
        '<button type="button" class="lab-context-menu__action" data-action="export-glb" title="Télécharge un fichier .glb de cet objet (apparence actuelle)">Exporter en GLB</button>' +
        "</li>" +
        "</ul>" +
        '<details class="lab-context-menu__section lab-context-menu__object-only" data-section="mesh-tools">' +
        '<summary class="lab-context-menu__section-title">Outils mesh</summary>' +
        '<button type="button" class="lab-context-menu__action" data-action="csg-subtract">Perforer (soustraire un objet)…</button>' +
        '<button type="button" class="lab-context-menu__action lab-context-menu__imported-only" data-action="mesh-solidify-piece" title="Épaissit uniquement le mesh sous le curseur (ex. portes)">Épaissir cette pièce…</button>' +
        '<button type="button" class="lab-context-menu__action lab-context-menu__imported-only" data-action="mesh-solidify-all" title="Épaissit tous les meshes du modèle importé">Épaissir tout le modèle…</button>' +
        '<button type="button" class="lab-context-menu__action lab-context-menu__imported-only" data-action="mesh-split-islands" title="Découpe le mesh en pièces non soudées (ex. coussin / pieds d’un fauteuil)">Séparer les pièces disjointes</button>' +
        '<button type="button" class="lab-context-menu__action lab-context-menu__tri-sel-only" data-action="mesh-select-island" title="Étend la sélection à toute la pièce cliquée (îlot)">Sélectionner toute la pièce</button>' +
        '<button type="button" class="lab-context-menu__action lab-context-menu__tri-sel-only" data-action="mesh-extract-selection" title="Retire les triangles sélectionnés et en fait un nouvel objet">Extraire la sélection en objet</button>' +
        "</details>" +
        '<details class="lab-context-menu__section lab-context-menu__boat-only" data-section="boat" open>' +
        '<summary class="lab-context-menu__section-title">Barque</summary>' +
        '<label class="lab-context-menu__item">' +
        '<input type="checkbox" data-prop="boat-float" checked>' +
        "<span>Flotter sur l’océan</span>" +
        "</label>" +
        '<label class="lab-context-menu__item lab-context-menu__item--range">' +
        "<span>Densité (eau = 1)</span>" +
        '<input type="range" data-prop="boat-density" min="0.05" max="1.5" step="0.01" value="0.32">' +
        '<output data-boat-density-value>0,32</output>' +
        "</label>" +
        '<button type="button" class="lab-context-menu__action" data-action="boat-replace-import">Remplacer l’apparence (importer)…</button>' +
        '<button type="button" class="lab-context-menu__action lab-context-menu__boat-procedural-only" data-action="boat-restore-procedural">Restaurer la coque procédurale</button>' +
        "</details>" +
        '<ul class="lab-context-menu__list lab-context-menu__make-boat-only">' +
        "<li>" +
        '<button type="button" class="lab-context-menu__action" data-action="make-boat">Faire flotter comme une barque</button>' +
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
        '<details class="lab-context-menu__section lab-context-menu__architecture-only" data-section="architecture" open>' +
        '<summary class="lab-context-menu__section-title">Pièce</summary>' +
        '<label class="lab-context-menu__item">' +
        "<span>Longueur X (m)</span>" +
        '<input type="number" data-prop="arch-length" min="1.5" max="40" step="0.1" value="4">' +
        "</label>" +
        '<label class="lab-context-menu__item">' +
        "<span>Largeur Z (m)</span>" +
        '<input type="number" data-prop="arch-width" min="1.5" max="40" step="0.1" value="3">' +
        "</label>" +
        '<label class="lab-context-menu__item">' +
        "<span>Hauteur (m)</span>" +
        '<input type="number" data-prop="arch-height" min="1.8" max="8" step="0.05" value="2.5">' +
        "</label>" +
        '<label class="lab-context-menu__item">' +
        "<span>Épaisseur mur (m)</span>" +
        '<input type="number" data-prop="arch-wall" min="0.08" max="0.6" step="0.01" value="0.15">' +
        "</label>" +
        '<label class="lab-context-menu__item lab-context-menu__arch-wing-a" hidden>' +
        '<span data-arch-wing-a-label>Aile sud (m)</span>' +
        '<input type="number" data-prop="arch-wing-a" min="1.2" max="38" step="0.1" value="2.4">' +
        "</label>" +
        '<label class="lab-context-menu__item lab-context-menu__arch-wing-b" hidden>' +
        '<span data-arch-wing-b-label>Aile ouest (m)</span>' +
        '<input type="number" data-prop="arch-wing-b" min="1.2" max="38" step="0.1" value="2.4">' +
        "</label>" +
        '<label class="lab-context-menu__item lab-context-menu__arch-floors" hidden>' +
        "<span>Étages</span>" +
        '<input type="number" data-prop="arch-floors" min="1" max="100" step="1" value="1">' +
        "</label>" +
        '<label class="lab-context-menu__item">' +
        '<input type="checkbox" data-prop="arch-ceiling" checked>' +
        "<span>Plafond</span>" +
        "</label>" +
        '<label class="lab-context-menu__item">' +
        '<input type="checkbox" data-prop="arch-plinth-floor">' +
        '<span data-arch-plinth-floor-label>Plinthes (étage 1)</span>' +
        "</label>" +
        '<label class="lab-context-menu__item">' +
        "<span>Surface</span>" +
        '<select data-prop="arch-target-wall">' +
        '<option value="south">Sud (−Z)</option>' +
        '<option value="north">Nord (+Z)</option>' +
        '<option value="east">Est (+X)</option>' +
        '<option value="west">Ouest (−X)</option>' +
        '<option value="floor">Sol</option>' +
        '<option value="ceiling">Plafond</option>' +
        "</select>" +
        "</label>" +
        '<p class="lab-context-menu__stair-meta" data-arch-face-label>Sud · ét. 1</p>' +
        '<p class="lab-context-menu__stair-meta" data-arch-openings-label>0 ouverture(s)</p>' +
        '<div class="lab-context-menu__arch-openings" data-arch-openings-list></div>' +
        '<button type="button" class="lab-context-menu__action" data-action="arch-add-door" data-arch-wall-action>Ajouter une porte</button>' +
        '<button type="button" class="lab-context-menu__action" data-action="arch-add-window" data-arch-wall-action>Ajouter une fenêtre</button>' +
        '<button type="button" class="lab-context-menu__action" data-action="arch-add-hole" data-arch-slab-action hidden>Ajouter un trou</button>' +
        '<button type="button" class="lab-context-menu__action" data-action="arch-clear-openings">Supprimer les ouvertures de cette face</button>' +
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
        '<div class="lab-context-menu__texture">' +
        '<span class="lab-context-menu__color-label">Spéculaire</span>' +
        '<div class="lab-context-menu__texture-actions">' +
        '<input type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" hidden data-specular-texture-input>' +
        '<button type="button" class="lab-context-menu__texture-btn" data-specular-texture-pick>Spéculaire</button>' +
        '<button type="button" class="lab-context-menu__texture-btn lab-context-menu__texture-btn--ghost" data-specular-texture-clear hidden title="Retirer">×</button>' +
        "</div>" +
        '<img class="lab-context-menu__texture-preview" data-specular-texture-preview alt="" hidden>' +
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
        '<label class="lab-context-menu__item lab-context-menu__item--range" title="0 = mat, 1 = miroir (reflet de la scène)">' +
        "<span>Réflexion</span>" +
        '<input type="range" data-prop="reflection" min="' +
        REFLECTION_MIN +
        '" max="' +
        REFLECTION_MAX +
        '" step="' +
        REFLECTION_STEP +
        '" value="0">' +
        '<output data-reflection-value>0.00</output>' +
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
        '<div class="lab-context-menu__actions">' +
        '<button type="button" class="lab-context-menu__action" data-action="metal-preset">Métal poli</button>' +
        '<button type="button" class="lab-context-menu__action" data-action="mirror-preset" title="Miroir maximal (reflet de la pièce)">Miroir</button>' +
        "</div>" +
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
    const boatFloatInput = /** @type {HTMLInputElement | null} */ (
        menuEl.querySelector('[data-prop="boat-float"]')
    );
    const boatDensityInput = /** @type {HTMLInputElement | null} */ (
        menuEl.querySelector('[data-prop="boat-density"]')
    );
    const boatDensityValue = menuEl.querySelector("[data-boat-density-value]");
    /** @param {number} value */
    const formatBoatDensity = (value) =>
        value >= 1 ? `${value.toFixed(2).replace(".", ",")} (coule)` : value.toFixed(2).replace(".", ",");
    const markerVisibleInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="light-marker-visible"]')
    );
    const intensityInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="light-intensity"]')
    );
    const intensityValue = menuEl.querySelector("[data-light-intensity-value]");
    const shadowOpacityInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="light-shadow-opacity"]')
    );
    const shadowOpacityValue = menuEl.querySelector("[data-light-shadow-opacity-value]");
    /** @param {number} value */
    const formatShadowOpacity = (value) => value.toFixed(2).replace(".", ",");
    const spotAngleInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="spot-angle"]')
    );
    const spotAngleValue = menuEl.querySelector("[data-spot-angle-value]");
    const spotPenumbraInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="spot-penumbra"]')
    );
    const spotPenumbraValue = menuEl.querySelector("[data-spot-penumbra-value]");
    /** @param {number} value */
    const formatPenumbra = (value) => value.toFixed(2).replace(".", ",");
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
    const specularTextureInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector("[data-specular-texture-input]")
    );
    const specularTexturePickBtn = menuEl.querySelector("[data-specular-texture-pick]");
    const specularTextureClearBtn = /** @type {HTMLButtonElement} */ (
        menuEl.querySelector("[data-specular-texture-clear]")
    );
    const specularTexturePreview = /** @type {HTMLImageElement} */ (
        menuEl.querySelector("[data-specular-texture-preview]")
    );
    const roughnessInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="roughness"]')
    );
    const roughnessValue = menuEl.querySelector("[data-roughness-value]");
    const metalnessInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="metalness"]')
    );
    const metalnessValue = menuEl.querySelector("[data-metalness-value]");
    const reflectionInput = /** @type {HTMLInputElement} */ (
        menuEl.querySelector('[data-prop="reflection"]')
    );
    const reflectionValue = menuEl.querySelector("[data-reflection-value]");
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
    const mirrorPresetBtn = /** @type {HTMLButtonElement | null} */ (
        menuEl.querySelector('[data-action="mirror-preset"]')
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
    const archLengthInput = /** @type {HTMLInputElement | null} */ (
        menuEl.querySelector('[data-prop="arch-length"]')
    );
    const archWidthInput = /** @type {HTMLInputElement | null} */ (
        menuEl.querySelector('[data-prop="arch-width"]')
    );
    const archHeightInput = /** @type {HTMLInputElement | null} */ (
        menuEl.querySelector('[data-prop="arch-height"]')
    );
    const archWallInput = /** @type {HTMLInputElement | null} */ (
        menuEl.querySelector('[data-prop="arch-wall"]')
    );
    const archWingAInput = /** @type {HTMLInputElement | null} */ (
        menuEl.querySelector('[data-prop="arch-wing-a"]')
    );
    const archWingBInput = /** @type {HTMLInputElement | null} */ (
        menuEl.querySelector('[data-prop="arch-wing-b"]')
    );
    const archFloorsInput = /** @type {HTMLInputElement | null} */ (
        menuEl.querySelector('[data-prop="arch-floors"]')
    );
    const archWingARow = /** @type {HTMLElement | null} */ (
        menuEl.querySelector(".lab-context-menu__arch-wing-a")
    );
    const archWingBRow = /** @type {HTMLElement | null} */ (
        menuEl.querySelector(".lab-context-menu__arch-wing-b")
    );
    const archFloorsRow = /** @type {HTMLElement | null} */ (
        menuEl.querySelector(".lab-context-menu__arch-floors")
    );
    const archWingALabel = menuEl.querySelector("[data-arch-wing-a-label]");
    const archWingBLabel = menuEl.querySelector("[data-arch-wing-b-label]");
    const archCeilingInput = /** @type {HTMLInputElement | null} */ (
        menuEl.querySelector('[data-prop="arch-ceiling"]')
    );
    const archPlinthFloorInput = /** @type {HTMLInputElement | null} */ (
        menuEl.querySelector('[data-prop="arch-plinth-floor"]')
    );
    const archPlinthFloorLabel = menuEl.querySelector("[data-arch-plinth-floor-label]");
    const archTargetWallSelect = /** @type {HTMLSelectElement | null} */ (
        menuEl.querySelector('[data-prop="arch-target-wall"]')
    );
    const archOpeningsLabel = menuEl.querySelector("[data-arch-openings-label]");
    const archFaceLabel = menuEl.querySelector("[data-arch-face-label]");
    const archOpeningsList = /** @type {HTMLElement | null} */ (
        menuEl.querySelector("[data-arch-openings-list]")
    );
    const archWallActions = menuEl.querySelectorAll("[data-arch-wall-action]");
    const archSlabActions = menuEl.querySelectorAll("[data-arch-slab-action]");

    /**
     * @param {string} [wall]
     * @param {number} [floor]
     */
    function syncArchFaceChrome(wall = "south", floor = 0) {
        const surface = normalizeArchSurface(wall);
        const floorN = Math.max(0, Number(floor) | 0) + 1;
        const wallLabel = ARCH_WALL_LABELS[surface] || surface;
        if (archFaceLabel) {
            archFaceLabel.textContent = isArchSlabSurface(surface)
                ? wallLabel
                : `${wallLabel} · ét. ${floorN}`;
        }
        if (archPlinthFloorLabel) {
            archPlinthFloorLabel.textContent = `Plinthes (étage ${floorN})`;
        }
        const isSlab = isArchSlabSurface(surface);
        archWallActions.forEach((el) => {
            if (el instanceof HTMLElement) el.hidden = isSlab;
        });
        archSlabActions.forEach((el) => {
            if (el instanceof HTMLElement) el.hidden = !isSlab;
        });
        if (archPlinthFloorInput?.closest("label")) {
            /** @type {HTMLElement} */ (archPlinthFloorInput.closest("label")).hidden = isSlab;
        }
    }

    /**
     * @param {unknown} layout
     */
    function refreshArchTargetWallSelect(layout, selected) {
        if (!archTargetWallSelect) return;
        const opts = getArchTargetWallOptions(layout);
        const current = normalizeArchSurface(selected ?? archTargetWallSelect.value);
        archTargetWallSelect.innerHTML = opts
            .map(
                (o) =>
                    `<option value="${o.value}"${o.value === current ? " selected" : ""}>${o.label}</option>`
            )
            .join("");
        if (![...archTargetWallSelect.options].some((o) => o.value === current)) {
            archTargetWallSelect.value = opts[0]?.value || "south";
        } else {
            archTargetWallSelect.value = current;
        }
    }

    /**
     * @param {{
     *   archOpenings?: unknown[],
     *   archLength?: number,
     *   archWidth?: number,
     *   archLayout?: string,
     *   archWingA?: number,
     *   archWingB?: number,
     *   archTargetWall?: string,
     *   archTargetFloor?: number,
     * }} [state]
     */
    function renderArchOpeningsList(state = {}) {
        if (!archOpeningsList) return;
        const allOpenings = Array.isArray(state.archOpenings) ? state.archOpenings : [];
        const targetWall = normalizeArchSurface(state.archTargetWall || "south");
        const targetFloor = Math.max(0, Number(state.archTargetFloor) | 0);
        const openings = allOpenings.filter((raw) =>
            openingBelongsToArchFace(/** @type {Record<string, unknown>} */ (raw || {}), targetWall, targetFloor)
        );
        const length = Number(state.archLength) || ARCH_DEFAULT_LENGTH;
        const width = Number(state.archWidth) || ARCH_DEFAULT_WIDTH;
        const wallT = Number(state.archWall) || ARCH_DEFAULT_WALL;
        const wingA = Number(state.archWingA) || ARCH_DEFAULT_WING_A;
        const wingB = Number(state.archWingB) || ARCH_DEFAULT_WING_B;
        const layout = normalizeArchLayout(state.archLayout);
        const wallDims = { layout, length, width, wallT, wingA, wingB };
        syncArchFaceChrome(targetWall, targetFloor);
        if (archOpeningsLabel) {
            archOpeningsLabel.textContent = `${openings.length} ouverture(s) sur cette face`;
        }

        if (!openings.length) {
            archOpeningsList.innerHTML =
                '<p class="lab-context-menu__arch-openings-empty">Aucune ouverture sur cette face</p>';
            return;
        }

        archOpeningsList.innerHTML = openings
            .map((raw, index) => {
                const o = /** @type {Record<string, unknown>} */ (raw || {});
                const id = typeof o.id === "string" ? o.id : `idx-${index}`;
                const surface = normalizeArchSurface(o.wall);
                const isSlab = isArchSlabSurface(surface);
                const type =
                    isSlab || o.type === "hole" ? "hole" : o.type === "window" ? "window" : "door";
                // Sol / plafond = empreinte extérieure (length × width), comme getArchSlabSize.
                const spanX = isSlab ? length : computeArchWallSpan(wallDims, surface);
                const spanZ = isSlab ? width : spanX;
                const halfW = Math.max(0.2, Number(o.width) || 0.4) / 2;
                const halfD = Math.max(0.2, Number(o.height) || 0.4) / 2;
                const minOff = -(spanX / 2) + ARCH_OPENING_EDGE + halfW;
                const maxOff = spanX / 2 - ARCH_OPENING_EDGE - halfW;
                const minOffZ = -(spanZ / 2) + ARCH_OPENING_EDGE + halfD;
                const maxOffZ = spanZ / 2 - ARCH_OPENING_EDGE - halfD;
                const offset = Number.isFinite(Number(o.offset)) ? Number(o.offset) : 0;
                const offsetZ = Number.isFinite(Number(o.offsetZ)) ? Number(o.offsetZ) : 0;
                const label =
                    type === "hole" ? "Trou" : type === "door" ? "Porte" : "Fenêtre";
                const opWidth = Math.max(0.4, Number(o.width) || (type === "door" ? 1.4 : 1));
                const opHeight = Math.max(0.4, Number(o.height) || (type === "door" ? 2.1 : 1));
                const maxWidth = Math.max(0.4, spanX - 2 * ARCH_OPENING_EDGE);
                const maxDepth = Math.max(0.4, spanZ - 2 * ARCH_OPENING_EDGE);
                let html =
                    `<div class="lab-context-menu__arch-opening" data-opening-id="${id}">` +
                    `<div class="lab-context-menu__arch-opening-head">` +
                    `<span>${label}</span>` +
                    `<button type="button" class="lab-context-menu__arch-opening-remove" data-action="arch-remove-opening" data-opening-id="${id}" title="Supprimer">×</button>` +
                    `</div>` +
                    `<label class="lab-context-menu__item">` +
                    `<span>${isSlab ? "Largeur X (m)" : "Largeur (m)"}</span>` +
                    `<input type="number" data-arch-opening-width="${id}" min="0.4" max="${maxWidth.toFixed(2)}" step="0.05" value="${opWidth.toFixed(2)}">` +
                    `</label>` +
                    `<label class="lab-context-menu__item">` +
                    `<span>${isSlab ? "Profondeur Z (m)" : "Hauteur (m)"}</span>` +
                    `<input type="number" data-arch-opening-height="${id}" min="0.4" max="${(isSlab ? maxDepth : 7.5).toFixed(2)}" step="0.05" value="${opHeight.toFixed(2)}">` +
                    `</label>` +
                    `<label class="lab-context-menu__item lab-context-menu__item--range">` +
                    `<span>${isSlab ? "Offset X (m)" : "Offset (m)"}</span>` +
                    `<input type="range" data-arch-opening-offset="${id}" min="${minOff.toFixed(2)}" max="${maxOff.toFixed(2)}" step="0.05" value="${offset}">` +
                    `<output data-arch-opening-offset-value="${id}">${offset.toFixed(2)}</output>` +
                    `</label>`;
                if (isSlab) {
                    html +=
                        `<label class="lab-context-menu__item lab-context-menu__item--range">` +
                        `<span>Offset Z (m)</span>` +
                        `<input type="range" data-arch-opening-offset-z="${id}" min="${minOffZ.toFixed(2)}" max="${maxOffZ.toFixed(2)}" step="0.05" value="${offsetZ}">` +
                        `<output data-arch-opening-offset-z-value="${id}">${offsetZ.toFixed(2)}</output>` +
                        `</label>`;
                }
                html += `</div>`;
                return html;
            })
            .join("");
    }

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
    /** @type {boolean} */
    let hasSpecularTexture = false;

    function syncTextureTileUi() {
        if (textureTileInput) {
            textureTileInput.disabled = !(hasColorTexture || hasNormalTexture || hasSpecularTexture);
        }
    }

    function canPreviewTextureDataUrl(textureDataUrl) {
        return !!textureDataUrl && textureDataUrl.length <= MAX_TEXTURE_PREVIEW_CHARS;
    }

    function updateTextureUi(textureDataUrl) {
        hasColorTexture = !!textureDataUrl;
        if (!textureClearBtn || !texturePreview) {
            syncTextureTileUi();
            return;
        }
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
        if (!normalTextureClearBtn || !normalTexturePreview) {
            if (normalScaleInput) normalScaleInput.disabled = !hasNormalTexture;
            syncTextureTileUi();
            return;
        }
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
        if (normalScaleInput) normalScaleInput.disabled = !hasNormalTexture;
        syncTextureTileUi();
    }

    function updateSpecularTextureUi(textureDataUrl) {
        hasSpecularTexture = !!textureDataUrl;
        if (!specularTextureClearBtn || !specularTexturePreview) {
            syncTextureTileUi();
            return;
        }
        const hasTexture = hasSpecularTexture;
        specularTextureClearBtn.hidden = !hasTexture;
        specularTexturePreview.hidden = !hasTexture;
        if (hasTexture) {
            if (canPreviewTextureDataUrl(textureDataUrl)) {
                specularTexturePreview.src = textureDataUrl;
                specularTexturePreview.alt = "Aperçu spéculaire";
            } else {
                specularTexturePreview.removeAttribute("src");
                specularTexturePreview.alt = "Spéculaire lourd — aperçu désactivé";
            }
        } else {
            specularTexturePreview.removeAttribute("src");
        }
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
     * @param {{ collision?: boolean, color?: string, texture?: string | null, normalTexture?: string | null, specularTexture?: string | null, textureTile?: number, normalScale?: number, roughness?: number, metalness?: number, reflection?: number, opacity?: number, glass?: boolean, smooth?: boolean, kind?: "object" | "light" | "stair" | "landing" | "tube" | "boat" | "architecture", lightType?: string, markerVisible?: boolean, intensity?: number, shadowOpacity?: number, spotAngle?: number, spotPenumbra?: number, stairStepCount?: number, stairStepRiseLabel?: string, stairTotalHeightLabel?: string, stairThickness?: number, stairShape?: string, stairRadius?: number, stairArcDeg?: number, tubeLength?: number, tubeRadius?: number, tubeWall?: number, archLength?: number, archWidth?: number, archHeight?: number, archWall?: number, archCeiling?: boolean, archOpenings?: unknown[], archTargetWall?: string, boatFloat?: boolean, boatDensity?: number, boatShell?: string, canMakeBoat?: boolean }} state
     */
    function show(clientX, clientY, object, state = {}) {
        targetObject = object;
        const isLight = state.kind === "light";
        const isStair = state.kind === "stair" || state.kind === "landing";
        const isLanding = state.kind === "landing";
        const isTube = state.kind === "tube";
        const isArchitecture = state.kind === "architecture";
        const isBoat = state.kind === "boat";
        const canMakeBoat = !isLight && !isBoat && !isArchitecture && state.canMakeBoat !== false;
        menuEl.classList.toggle("lab-context-menu--light", isLight);
        menuEl.classList.toggle("lab-context-menu--spot", isLight && state.lightType === "spot");
        menuEl.classList.toggle("lab-context-menu--stair", isStair);
        menuEl.classList.toggle("lab-context-menu--landing", isLanding);
        menuEl.classList.toggle("lab-context-menu--tube", isTube);
        menuEl.classList.toggle("lab-context-menu--architecture", isArchitecture);
        menuEl.classList.toggle("lab-context-menu--boat", isBoat);
        menuEl.classList.toggle("lab-context-menu--boat-procedural", isBoat && state.boatShell !== "imported" && state.boatShell !== "native");
        menuEl.classList.toggle("lab-context-menu--make-boat", canMakeBoat);
        menuEl.classList.toggle("lab-context-menu--imported", !!state.isImported);
        menuEl.classList.toggle("lab-context-menu--has-tris", !!state.hasTriangleSelection);
        const meshTools = menuEl.querySelector('[data-section="mesh-tools"]');
        if (meshTools instanceof HTMLDetailsElement) {
            meshTools.open = !!state.isImported || !!state.hasTriangleSelection;
        }
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
            const shadowOpacity = typeof state.shadowOpacity === "number" ? state.shadowOpacity : 0.85;
            if (shadowOpacityInput) shadowOpacityInput.value = String(shadowOpacity);
            if (shadowOpacityValue) shadowOpacityValue.textContent = formatShadowOpacity(shadowOpacity);
            const spotAngle = typeof state.spotAngle === "number" ? state.spotAngle : 48;
            spotAngleInput.value = String(spotAngle);
            if (spotAngleValue) spotAngleValue.textContent = `${Math.round(spotAngle)}°`;
            const spotPenumbra = typeof state.spotPenumbra === "number" ? state.spotPenumbra : 0.45;
            spotPenumbraInput.value = String(spotPenumbra);
            if (spotPenumbraValue) spotPenumbraValue.textContent = formatPenumbra(spotPenumbra);
        } else {
            collisionInput.checked = !!state.collision;
            if (boatFloatInput) boatFloatInput.checked = state.boatFloat !== false;
            const boatDensity = typeof state.boatDensity === "number" ? state.boatDensity : 0.32;
            if (boatDensityInput) boatDensityInput.value = String(boatDensity);
            if (boatDensityValue) boatDensityValue.textContent = formatBoatDensity(boatDensity);
            colorInput.value = state.color || "#00d1ff";
            const textureTile = typeof state.textureTile === "number" ? state.textureTile : 1;
            if (textureTileInput) textureTileInput.value = String(textureTile);
            if (textureTileValue) textureTileValue.textContent = textureTile.toFixed(2);
            const normalScale = typeof state.normalScale === "number" ? state.normalScale : 1;
            if (normalScaleInput) {
                normalScaleInput.value = String(normalScale);
                normalScaleInput.disabled = !state.normalTexture;
            }
            if (normalScaleValue) normalScaleValue.textContent = normalScale.toFixed(2);
            syncTextureTileUi();
            const roughness = typeof state.roughness === "number" ? state.roughness : 0.65;
            if (roughnessInput) roughnessInput.value = String(roughness);
            if (roughnessValue) roughnessValue.textContent = roughness.toFixed(2);
            const metalness = typeof state.metalness === "number" ? state.metalness : 0.05;
            if (metalnessInput) metalnessInput.value = String(metalness);
            if (metalnessValue) metalnessValue.textContent = metalness.toFixed(2);
            const reflection = typeof state.reflection === "number" ? state.reflection : metalness;
            if (reflectionInput) reflectionInput.value = String(reflection);
            if (reflectionValue) reflectionValue.textContent = reflection.toFixed(2);
            const opacity = typeof state.opacity === "number" ? state.opacity : 1;
            if (opacityInput) opacityInput.value = String(opacity);
            if (opacityValue) opacityValue.textContent = opacity.toFixed(2);
            if (glassInput) glassInput.checked = !!state.glass;
            if (smoothInput) smoothInput.checked = state.smooth !== false;
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
            if (isArchitecture) {
                const layout = normalizeArchLayout(state.archLayout);
                const showWings = layout === "L" || layout === "U" || layout === "patio";
                if (archWingARow) archWingARow.hidden = !showWings;
                if (archWingBRow) archWingBRow.hidden = !showWings;
                if (archFloorsRow) archFloorsRow.hidden = false;
                if (archWingALabel) {
                    archWingALabel.textContent =
                        layout === "patio"
                            ? "Cour Z (m)"
                            : layout === "U"
                              ? "Bras sud (m)"
                              : "Aile sud (m)";
                }
                if (archWingBLabel) {
                    archWingBLabel.textContent =
                        layout === "patio"
                            ? "Cour X (m)"
                            : layout === "U"
                              ? "Ailes latérales (m)"
                              : "Aile ouest (m)";
                }
                if (archLengthInput) archLengthInput.value = String(state.archLength ?? ARCH_DEFAULT_LENGTH);
                if (archWidthInput) archWidthInput.value = String(state.archWidth ?? ARCH_DEFAULT_WIDTH);
                if (archHeightInput) archHeightInput.value = String(state.archHeight ?? ARCH_DEFAULT_HEIGHT);
                if (archWallInput) archWallInput.value = String(state.archWall ?? ARCH_DEFAULT_WALL);
                if (archWingAInput) archWingAInput.value = String(state.archWingA ?? ARCH_DEFAULT_WING_A);
                if (archWingBInput) archWingBInput.value = String(state.archWingB ?? ARCH_DEFAULT_WING_B);
                if (archFloorsInput) archFloorsInput.value = String(state.archFloors ?? ARCH_DEFAULT_FLOORS);
                if (archCeilingInput) archCeilingInput.checked = state.archCeiling !== false;
                const targetFloor = Math.max(0, Number(state.archTargetFloor) | 0);
                const plinthFloors = Array.isArray(state.archPlinthFloors)
                    ? state.archPlinthFloors
                    : state.archPlinth
                      ? [0]
                      : [];
                if (archPlinthFloorInput) {
                    archPlinthFloorInput.checked = plinthFloors.includes(targetFloor);
                }
                refreshArchTargetWallSelect(layout, state.archTargetWall);
                renderArchOpeningsList({
                    ...state,
                    archTargetWall: state.archTargetWall || "south",
                    archTargetFloor: targetFloor,
                });
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
            const specularUrl = state.specularTexture || null;
            const texturesSection = menuEl.querySelector('[data-section="textures"]');
            if (texturesSection instanceof HTMLDetailsElement) {
                texturesSection.open = !!(textureUrl || normalUrl || specularUrl);
            }
            requestAnimationFrame(() => {
                if (targetObject !== object) return;
                updateTextureUi(textureUrl);
                updateNormalTextureUi(normalUrl);
                updateSpecularTextureUi(specularUrl);
            });
        }
    }

    function hide() {
        menuEl.hidden = true;
        menuEl.classList.remove("is-open");
        targetObject = null;
        if (textureInput) textureInput.value = "";
        if (normalTextureInput) normalTextureInput.value = "";
        if (specularTextureInput) specularTextureInput.value = "";
    }

    function syncProperty(prop, value) {
        if (prop === "collision" && collisionInput.checked !== value) {
            collisionInput.checked = !!value;
        }
        if (prop === "boat-float" && boatFloatInput && boatFloatInput.checked !== value) {
            boatFloatInput.checked = !!value;
        }
        if (prop === "boat-density" && typeof value === "number" && boatDensityInput) {
            boatDensityInput.value = String(value);
            if (boatDensityValue) boatDensityValue.textContent = formatBoatDensity(value);
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
            if (normalScaleInput) normalScaleInput.disabled = !url;
        }
        if (prop === "specular-texture") {
            updateSpecularTextureUi(typeof value === "string" ? value : null);
        }
        if (prop === "normal-scale" && typeof value === "number" && normalScaleInput) {
            normalScaleInput.value = String(value);
            if (normalScaleValue) normalScaleValue.textContent = value.toFixed(2);
        }
        if (prop === "texture-tile" && typeof value === "number" && textureTileInput) {
            textureTileInput.value = String(value);
            if (textureTileValue) textureTileValue.textContent = value.toFixed(2);
        }
        if (prop === "roughness" && typeof value === "number" && roughnessInput) {
            roughnessInput.value = String(value);
            if (roughnessValue) roughnessValue.textContent = value.toFixed(2);
        }
        if (prop === "metalness" && typeof value === "number" && metalnessInput) {
            metalnessInput.value = String(value);
            if (metalnessValue) metalnessValue.textContent = value.toFixed(2);
        }
        if (prop === "reflection" && typeof value === "number" && reflectionInput) {
            reflectionInput.value = String(value);
            if (reflectionValue) reflectionValue.textContent = value.toFixed(2);
        }
        if (prop === "opacity" && typeof value === "number" && opacityInput) {
            opacityInput.value = String(value);
            if (opacityValue) opacityValue.textContent = value.toFixed(2);
        }
        if (prop === "glass" && glassInput && glassInput.checked !== value) {
            glassInput.checked = !!value;
        }
        if (prop === "smooth" && smoothInput && smoothInput.checked !== value) {
            smoothInput.checked = !!value;
        }
        if (prop === "light-marker-visible" && markerVisibleInput.checked !== value) {
            markerVisibleInput.checked = !!value;
        }
        if (prop === "light-intensity" && typeof value === "number") {
            intensityInput.value = String(value);
            if (intensityValue) intensityValue.textContent = value.toFixed(2);
        }
        if (prop === "light-shadow-opacity" && typeof value === "number") {
            if (shadowOpacityInput) shadowOpacityInput.value = String(value);
            if (shadowOpacityValue) shadowOpacityValue.textContent = formatShadowOpacity(value);
        }
        if (prop === "spot-angle" && typeof value === "number") {
            spotAngleInput.value = String(value);
            if (spotAngleValue) spotAngleValue.textContent = `${Math.round(value)}°`;
        }
        if (prop === "spot-penumbra" && typeof value === "number") {
            spotPenumbraInput.value = String(value);
            if (spotPenumbraValue) spotPenumbraValue.textContent = formatPenumbra(value);
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
        if (prop === "arch-length" && typeof value === "number" && archLengthInput) {
            archLengthInput.value = String(value);
        }
        if (prop === "arch-width" && typeof value === "number" && archWidthInput) {
            archWidthInput.value = String(value);
        }
        if (prop === "arch-height" && typeof value === "number" && archHeightInput) {
            archHeightInput.value = String(value);
        }
        if (prop === "arch-wall" && typeof value === "number" && archWallInput) {
            archWallInput.value = String(value);
        }
        if (prop === "arch-wing-a" && typeof value === "number" && archWingAInput) {
            archWingAInput.value = String(value);
        }
        if (prop === "arch-wing-b" && typeof value === "number" && archWingBInput) {
            archWingBInput.value = String(value);
        }
        if (prop === "arch-floors" && typeof value === "number" && archFloorsInput) {
            archFloorsInput.value = String(value);
        }
        if (prop === "arch-layout-ui" && value && typeof value === "object") {
            const payload = /** @type {{ archLayout?: unknown, archTargetWall?: unknown, archTargetFloor?: unknown }} */ (
                value
            );
            const layout = normalizeArchLayout(payload.archLayout);
            const showWings = layout === "L" || layout === "U" || layout === "patio";
            if (archWingARow) archWingARow.hidden = !showWings;
            if (archWingBRow) archWingBRow.hidden = !showWings;
            if (archFloorsRow) archFloorsRow.hidden = false;
            if (archWingALabel) {
                archWingALabel.textContent =
                    layout === "patio"
                        ? "Cour Z (m)"
                        : layout === "U"
                          ? "Bras sud (m)"
                          : "Aile sud (m)";
            }
            if (archWingBLabel) {
                archWingBLabel.textContent =
                    layout === "patio"
                        ? "Cour X (m)"
                        : layout === "U"
                          ? "Ailes latérales (m)"
                          : "Aile ouest (m)";
            }
            refreshArchTargetWallSelect(layout, payload.archTargetWall);
            if (payload.archTargetWall != null || payload.archTargetFloor != null) {
                syncArchFaceChrome(
                    /** @type {string} */ (payload.archTargetWall || archTargetWallSelect?.value || "south"),
                    Number(payload.archTargetFloor) || 0
                );
            }
        }
        if (prop === "arch-target-floor" && (typeof value === "number" || typeof value === "string")) {
            syncArchFaceChrome(archTargetWallSelect?.value || "south", Number(value) || 0);
        }
        if (prop === "arch-ceiling" && archCeilingInput) {
            archCeilingInput.checked = !!value;
        }
        if (prop === "arch-plinth-floor" && archPlinthFloorInput) {
            archPlinthFloorInput.checked = !!value;
        }
        if (prop === "arch-target-wall" && typeof value === "string" && archTargetWallSelect) {
            archTargetWallSelect.value = normalizeArchSurface(value);
        }
        if (prop === "arch-openings-label" && typeof value === "string" && archOpeningsLabel) {
            archOpeningsLabel.textContent = value;
        }
        if (prop === "arch-openings" && value && typeof value === "object") {
            renderArchOpeningsList(/** @type {Record<string, unknown>} */ (value));
        }
        if (prop === "arch-opening-offset-value" && value && typeof value === "object") {
            const id = /** @type {{ id?: string, offset?: number }} */ (value).id;
            const offset = Number(/** @type {{ offset?: number }} */ (value).offset);
            if (!id || !Number.isFinite(offset)) return;
            const input = /** @type {HTMLInputElement | null} */ (
                archOpeningsList?.querySelector(`[data-arch-opening-offset="${id}"]`)
            );
            const out = archOpeningsList?.querySelector(`[data-arch-opening-offset-value="${id}"]`);
            if (input && Math.abs(Number(input.value) - offset) > 1e-4) {
                input.value = String(offset);
            }
            if (out) out.textContent = offset.toFixed(2);
        }
        if (prop === "arch-opening-offset-z-value" && value && typeof value === "object") {
            const id = /** @type {{ id?: string, offsetZ?: number }} */ (value).id;
            const offsetZ = Number(/** @type {{ offsetZ?: number }} */ (value).offsetZ);
            if (!id || !Number.isFinite(offsetZ)) return;
            const input = /** @type {HTMLInputElement | null} */ (
                archOpeningsList?.querySelector(`[data-arch-opening-offset-z="${id}"]`)
            );
            const out = archOpeningsList?.querySelector(`[data-arch-opening-offset-z-value="${id}"]`);
            if (input && Math.abs(Number(input.value) - offsetZ) > 1e-4) {
                input.value = String(offsetZ);
            }
            if (out) out.textContent = offsetZ.toFixed(2);
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

    shadowOpacityInput?.addEventListener("input", () => {
        if (!targetObject || !shadowOpacityInput) return;
        const value = Number(shadowOpacityInput.value);
        if (shadowOpacityValue) shadowOpacityValue.textContent = formatShadowOpacity(value);
        propertyChangeHandler?.("light-shadow-opacity", targetObject, value);
    });

    if (shadowOpacityInput) {
        bindShadowOpacitySliderWheel(shadowOpacityInput, (value) => {
            if (!targetObject) return;
            if (shadowOpacityValue) shadowOpacityValue.textContent = formatShadowOpacity(value);
            propertyChangeHandler?.("light-shadow-opacity", targetObject, value);
        });
    }

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

    spotPenumbraInput.addEventListener("input", () => {
        if (!targetObject) return;
        const value = Number(spotPenumbraInput.value);
        if (spotPenumbraValue) spotPenumbraValue.textContent = formatPenumbra(value);
        propertyChangeHandler?.("spot-penumbra", targetObject, value);
    });

    bindSpotPenumbraSliderWheel(spotPenumbraInput, (value) => {
        if (!targetObject) return;
        if (spotPenumbraValue) spotPenumbraValue.textContent = formatPenumbra(value);
        propertyChangeHandler?.("spot-penumbra", targetObject, value);
    });

    collisionInput.addEventListener("change", () => {
        if (!targetObject) return;
        propertyChangeHandler?.("collision", targetObject, collisionInput.checked);
    });
    boatFloatInput?.addEventListener("change", () => {
        if (!targetObject || !boatFloatInput) return;
        propertyChangeHandler?.("boat-float", targetObject, boatFloatInput.checked);
    });
    boatDensityInput?.addEventListener("input", () => {
        if (!targetObject || !boatDensityInput) return;
        const value = Number(boatDensityInput.value);
        if (boatDensityValue) boatDensityValue.textContent = formatBoatDensity(value);
        propertyChangeHandler?.("boat-density", targetObject, value);
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

    /**
     * @param {HTMLInputElement | null} input
     * @param {string} prop
     * @param {(v: unknown) => number} clampFn
     */
    function bindArchNumber(input, prop, clampFn) {
        if (!input) return;
        const apply = () => {
            if (!targetObject) return;
            const value = clampFn(input.value);
            input.value = String(value);
            propertyChangeHandler?.(prop, targetObject, value);
        };
        input.addEventListener("change", apply);
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                apply();
            }
        });
    }
    bindArchNumber(archLengthInput, "arch-length", clampArchLength);
    bindArchNumber(archWidthInput, "arch-width", clampArchWidth);
    bindArchNumber(archHeightInput, "arch-height", clampArchHeight);
    bindArchNumber(archWallInput, "arch-wall", clampArchWall);
    bindArchNumber(archWingAInput, "arch-wing-a", (v) => clampArchWingA(v));
    bindArchNumber(archWingBInput, "arch-wing-b", (v) => clampArchWingB(v));
    bindArchNumber(archFloorsInput, "arch-floors", clampArchFloors);
    archCeilingInput?.addEventListener("change", () => {
        if (!targetObject || !archCeilingInput) return;
        propertyChangeHandler?.("arch-ceiling", targetObject, archCeilingInput.checked);
    });
    archPlinthFloorInput?.addEventListener("change", () => {
        if (!targetObject || !archPlinthFloorInput) return;
        propertyChangeHandler?.("arch-plinth-floor", targetObject, archPlinthFloorInput.checked);
    });
    archTargetWallSelect?.addEventListener("change", () => {
        if (!targetObject || !archTargetWallSelect) return;
        propertyChangeHandler?.(
            "arch-target-wall",
            targetObject,
            normalizeArchSurface(archTargetWallSelect.value)
        );
    });

    archOpeningsList?.addEventListener("input", (event) => {
        const target = /** @type {HTMLElement} */ (event.target);
        const offsetInput = target.closest?.("[data-arch-opening-offset]");
        if (offsetInput instanceof HTMLInputElement && targetObject) {
            const id = offsetInput.getAttribute("data-arch-opening-offset");
            if (!id) return;
            const value = Number(offsetInput.value);
            const out = archOpeningsList.querySelector(`[data-arch-opening-offset-value="${id}"]`);
            if (out) out.textContent = value.toFixed(2);
            propertyChangeHandler?.("arch-opening-offset", targetObject, { id, offset: value });
            return;
        }
        const offsetZInput = target.closest?.("[data-arch-opening-offset-z]");
        if (offsetZInput instanceof HTMLInputElement && targetObject) {
            const id = offsetZInput.getAttribute("data-arch-opening-offset-z");
            if (!id) return;
            const value = Number(offsetZInput.value);
            const out = archOpeningsList.querySelector(`[data-arch-opening-offset-z-value="${id}"]`);
            if (out) out.textContent = value.toFixed(2);
            propertyChangeHandler?.("arch-opening-offset-z", targetObject, { id, offsetZ: value });
            return;
        }
    });
    archOpeningsList?.addEventListener("change", (event) => {
        const target = /** @type {HTMLElement} */ (event.target);
        if (!(target instanceof HTMLInputElement) || !targetObject) return;

        const offsetInput = target.closest?.("[data-arch-opening-offset]");
        if (offsetInput instanceof HTMLInputElement) {
            const id = offsetInput.getAttribute("data-arch-opening-offset");
            if (!id) return;
            propertyChangeHandler?.("arch-opening-offset", targetObject, {
                id,
                offset: Number(offsetInput.value),
                commit: true,
            });
            return;
        }

        const offsetZInput = target.closest?.("[data-arch-opening-offset-z]");
        if (offsetZInput instanceof HTMLInputElement) {
            const id = offsetZInput.getAttribute("data-arch-opening-offset-z");
            if (!id) return;
            propertyChangeHandler?.("arch-opening-offset-z", targetObject, {
                id,
                offsetZ: Number(offsetZInput.value),
                commit: true,
            });
            return;
        }

        const widthInput = target.closest?.("[data-arch-opening-width]");
        if (widthInput instanceof HTMLInputElement) {
            const id = widthInput.getAttribute("data-arch-opening-width");
            if (!id) return;
            propertyChangeHandler?.("arch-opening-size", targetObject, {
                id,
                width: Number(widthInput.value),
                commit: true,
            });
            return;
        }

        const heightInput = target.closest?.("[data-arch-opening-height]");
        if (heightInput instanceof HTMLInputElement) {
            const id = heightInput.getAttribute("data-arch-opening-height");
            if (!id) return;
            propertyChangeHandler?.("arch-opening-size", targetObject, {
                id,
                height: Number(heightInput.value),
                commit: true,
            });
        }
    });

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

    specularTexturePickBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!specularTextureInput) return;
        void pickFilePreservingFullscreen(specularTextureInput);
    });

    specularTextureClearBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!targetObject) return;
        propertyChangeHandler?.("specular-texture-clear", targetObject, null);
    });

    specularTextureInput?.addEventListener("change", async () => {
        if (!targetObject) return;
        const file = specularTextureInput.files?.[0];
        specularTextureInput.value = "";
        if (!file) return;

        void restoreFullscreenNow();
        try {
            const dataUrl = await readImageFileAsDataUrl(file);
            propertyChangeHandler?.("specular-texture", targetObject, dataUrl);
        } catch (error) {
            propertyChangeHandler?.("specular-texture-error", targetObject, error);
        } finally {
            void ensureLabFullscreenAfterFile();
        }
    });

    textureTileInput?.addEventListener("input", () => {
        if (!targetObject || !textureTileInput) return;
        const value = Number(textureTileInput.value);
        if (textureTileValue) textureTileValue.textContent = value.toFixed(2);
        propertyChangeHandler?.("texture-tile", targetObject, value);
    });

    bindMenuSliderWheel(textureTileInput, (value) => {
        if (!targetObject) return;
        if (textureTileValue) textureTileValue.textContent = value.toFixed(2);
        propertyChangeHandler?.("texture-tile", targetObject, value);
    }, { step: TEXTURE_TILE_STEP });

    opacityInput?.addEventListener("input", () => {
        if (!targetObject || !opacityInput) return;
        const value = Number(opacityInput.value);
        if (opacityValue) opacityValue.textContent = value.toFixed(2);
        propertyChangeHandler?.("opacity", targetObject, value);
    });

    bindMenuSliderWheel(opacityInput, (value) => {
        if (!targetObject) return;
        if (opacityValue) opacityValue.textContent = value.toFixed(2);
        propertyChangeHandler?.("opacity", targetObject, value);
    }, { step: OPACITY_STEP });

    glassInput?.addEventListener("change", () => {
        if (!targetObject || !glassInput) return;
        propertyChangeHandler?.("glass", targetObject, glassInput.checked);
    });

    smoothInput?.addEventListener("change", () => {
        if (!targetObject || !smoothInput) return;
        propertyChangeHandler?.("smooth", targetObject, smoothInput.checked);
    });

    metalPresetBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!targetObject) return;
        propertyChangeHandler?.("metal-preset", targetObject, true);
    });

    mirrorPresetBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!targetObject) return;
        propertyChangeHandler?.("mirror-preset", targetObject, true);
    });

    reflectionInput?.addEventListener("input", () => {
        if (!targetObject || !reflectionInput) return;
        const value = Number(reflectionInput.value);
        if (reflectionValue) reflectionValue.textContent = value.toFixed(2);
        propertyChangeHandler?.("reflection", targetObject, value);
    });

    bindMenuSliderWheel(reflectionInput, (value) => {
        if (!targetObject) return;
        if (reflectionValue) reflectionValue.textContent = value.toFixed(2);
        propertyChangeHandler?.("reflection", targetObject, value);
    }, { step: REFLECTION_STEP });

    metalnessInput?.addEventListener("input", () => {
        if (!targetObject || !metalnessInput) return;
        const value = Number(metalnessInput.value);
        if (metalnessValue) metalnessValue.textContent = value.toFixed(2);
        propertyChangeHandler?.("metalness", targetObject, value);
    });

    bindMenuSliderWheel(metalnessInput, (value) => {
        if (!targetObject) return;
        if (metalnessValue) metalnessValue.textContent = value.toFixed(2);
        propertyChangeHandler?.("metalness", targetObject, value);
    }, { step: METALNESS_STEP });

    normalScaleInput?.addEventListener("input", () => {
        if (!targetObject || !normalScaleInput) return;
        const value = Number(normalScaleInput.value);
        if (normalScaleValue) normalScaleValue.textContent = value.toFixed(2);
        propertyChangeHandler?.("normal-scale", targetObject, value);
    });

    bindMenuSliderWheel(normalScaleInput, (value) => {
        if (!targetObject) return;
        if (normalScaleValue) normalScaleValue.textContent = value.toFixed(2);
        propertyChangeHandler?.("normal-scale", targetObject, value);
    }, { step: NORMAL_SCALE_STEP });

    roughnessInput?.addEventListener("input", () => {
        if (!targetObject || !roughnessInput) return;
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
        /** @type {Record<string, number | string> | undefined} */
        let detail;
        if (action === "arch-remove-opening") {
            const openingId = btn.getAttribute("data-opening-id") || "";
            detail = { openingId };
            actionHandler?.(action, targetObject, detail);
            return;
        }
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
