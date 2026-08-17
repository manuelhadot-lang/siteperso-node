/** Ombres Three.js natives — la lumière projette ; chaque objet peut couper les siennes. */
import * as THREE from "three";
import {
    LIGHT_INTENSITY_KEY,
    LIGHT_TYPE,
    registerLightIntensityHook,
} from "./lab-lights.js";
import { bindRangeSliderWheel } from "./wheel-utils.js";

export const SHADOW_KEY = "shadowEnabled";
export const SHADOW_OPACITY_KEY = "shadowOpacity";
export const SHADOW_FILL_LIGHT_KEY = "_labShadowFillLight";
export const SHADOW_OPACITY_MAX = 1;
export const SHADOW_OPACITY_STEP = 0.05;
export const DEFAULT_SHADOW_OPACITY = 0.85;

/** @type {THREE.WebGLRenderer | null} */
let shadowRenderer = null;

/**
 * @param {THREE.WebGLRenderer} renderer
 */
export function configureRendererShadows(renderer) {
    shadowRenderer = renderer;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
}

/** Marque la shadow map à recalculer (placement, gizmo, lumière…). */
export function invalidateLabShadows() {
    if (shadowRenderer) {
        shadowRenderer.shadowMap.needsUpdate = true;
    }
}

/**
 * @param {THREE.Light} light
 */
export function configureLightShadowMap(light) {
    if (!light?.shadow) return;

    if (light.shadow.mapSize?.set) {
        // Directionnelle : un peu plus de résolution pour marches / arêtes fines
        const size = light.isDirectionalLight ? 2048 : 1024;
        light.shadow.mapSize.set(size, size);
    }
    // Bias doux : moins d’acne sur marches fines, sans “peter panning” excessif
    light.shadow.bias = -0.00025;
    if ("normalBias" in light.shadow) {
        light.shadow.normalBias = 0.035;
    }
    if ("radius" in light.shadow) {
        light.shadow.radius = light.isDirectionalLight ? 2.5 : 1.5;
    }

    if (light.isDirectionalLight) {
        const cam = light.shadow.camera;
        cam.near = 0.5;
        cam.far = 140;
        const extent = 48;
        cam.left = -extent;
        cam.right = extent;
        cam.top = extent;
        cam.bottom = -extent;
        cam.updateProjectionMatrix();
    } else if (light.isSpotLight) {
        light.shadow.camera.near = 0.4;
        light.shadow.camera.far = 100;
        light.shadow.camera.fov = THREE.MathUtils.radToDeg(light.angle) * 1.05;
        light.shadow.camera.updateProjectionMatrix();
    } else if (light.isPointLight) {
        light.shadow.camera.near = 0.4;
        light.shadow.camera.far = 30;
        light.shadow.camera.updateProjectionMatrix();
    }
    invalidateLabShadows();
}

/**
 * @param {THREE.Object3D} object
 */
function readShadowOpacity(object) {
    const value = object?.userData?.[SHADOW_OPACITY_KEY];
    return typeof value === "number" ? value : DEFAULT_SHADOW_OPACITY;
}

/**
 * Retire l’ancien overlay ShadowMaterial (doublon avec l’ombre lumière).
 * @param {THREE.Mesh} mesh
 */
export function disposeShadowOverlay(mesh) {
    const overlay = mesh.userData?.shadowOverlay;
    if (!overlay) return;
    overlay.geometry = null;
    overlay.material?.dispose();
    mesh.remove(overlay);
    delete mesh.userData.shadowOverlay;
}

/**
 * @param {THREE.Mesh} mesh
 */
function clearLegacyShadowOverlay(mesh) {
    if (mesh.userData?.shadowOverlay || mesh.name === "shadow-overlay") {
        disposeShadowOverlay(mesh);
    }
}

/**
 * @param {THREE.Mesh} mesh
 * @param {boolean} enabled
 * @param {boolean} receiveOnly
 * @param {THREE.Object3D} root
 */
function syncMeshShadowState(mesh, enabled, receiveOnly, root) {
    clearLegacyShadowOverlay(mesh);

    if (!enabled) {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        return;
    }

    if (receiveOnly) {
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        return;
    }

    // Escalier : projette, mais les marches ne se reçoivent pas entre elles
    // (évite le banding / ombres empilées sur chaque marche).
    if (root?.userData?.labStair) {
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        return;
    }

    // Palier : projette et reçoit (plateau)
    if (root?.userData?.labLanding) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return;
    }

    // Végétaux : cast géré ailleurs (tronc / feuilles)
    if (mesh.userData?.labVegetationMesh) {
        mesh.receiveShadow = true;
        if (mesh.castShadow === undefined) mesh.castShadow = true;
        return;
    }

    mesh.castShadow = true;
    mesh.receiveShadow = true;
}

/**
 * @param {THREE.Object3D} object
 * @param {boolean} receiveOnly
 */
function syncObjectShadowMeshes(object, receiveOnly = false) {
    const enabled = getObjectShadowEnabled(object);
    /** @type {THREE.Mesh[]} */
    const meshes = [];
    object.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        if (child.name === "shadow-overlay") {
            const parent = child.parent;
            if (parent instanceof THREE.Mesh) disposeShadowOverlay(parent);
            else {
                child.material?.dispose?.();
                child.removeFromParent();
            }
            return;
        }
        meshes.push(child);
    });
    for (const mesh of meshes) {
        syncMeshShadowState(mesh, enabled, receiveOnly, object);
    }
}

/**
 * Réapplique cast/receive après rebuild (escalier, etc.).
 * @param {THREE.Object3D} object
 * @param {{ receiveOnly?: boolean }} [opts]
 */
export function refreshObjectShadows(object, opts = {}) {
    if (!object) return;
    syncObjectShadowMeshes(object, !!opts.receiveOnly);
    invalidateLabShadows();
}

/**
 * @param {THREE.Object3D} object
 */
export function getObjectShadowEnabled(object) {
    return object?.userData?.[SHADOW_KEY] === true;
}

/**
 * @param {THREE.Object3D} object
 */
export function getObjectShadowOpacity(object) {
    return readShadowOpacity(object);
}

/**
 * @param {THREE.Object3D} object
 * @param {boolean} enabled
 * @param {{ receiveOnly?: boolean }} [opts]
 */
export function setObjectShadowEnabled(object, enabled, { receiveOnly = false } = {}) {
    object.userData[SHADOW_KEY] = !!enabled;
    if (object.userData[SHADOW_OPACITY_KEY] === undefined) {
        object.userData[SHADOW_OPACITY_KEY] = DEFAULT_SHADOW_OPACITY;
    }
    syncObjectShadowMeshes(object, receiveOnly);
    invalidateLabShadows();
}

/**
 * Opacité : pour les objets natifs, ≤0 coupe la réception ; sinon stockée pour lumières / export.
 * @param {THREE.Object3D} object
 * @param {number} opacity
 * @param {{ receiveOnly?: boolean }} [opts]
 */
export function setObjectShadowOpacity(object, opacity, { receiveOnly = false } = {}) {
    const value = THREE.MathUtils.clamp(opacity, 0, SHADOW_OPACITY_MAX);
    object.userData[SHADOW_OPACITY_KEY] = value;
    // Seuil bas : plus de réception d’ombre (l’objet reste éventuellement projecteur si enabled)
    if (getObjectShadowEnabled(object)) {
        object.traverse((child) => {
            if (!(child instanceof THREE.Mesh) || child.name === "shadow-overlay") return;
            if (receiveOnly || object?.userData?.labStair) {
                child.receiveShadow = !receiveOnly ? false : value > 0.02;
                if (receiveOnly) child.castShadow = false;
                return;
            }
            if (object?.userData?.labLanding) {
                child.receiveShadow = value > 0.02;
                return;
            }
            if (child.userData?.labVegetationMesh) return;
            child.receiveShadow = value > 0.02;
        });
    }
    invalidateLabShadows();
}

/**
 * @param {THREE.Group} pivot
 */
export function getLightShadowEnabled(pivot) {
    return pivot?.userData?.[SHADOW_KEY] === true;
}

/**
 * @param {THREE.Group} pivot
 */
export function getLightShadowOpacity(pivot) {
    return readShadowOpacity(pivot);
}

/**
 * shadow.intensity n’existe dans le shader qu’à partir de r166.
 * Ne pas tester `typeof light.shadow.intensity === "number"` : une ancienne
 * assignation JS rendrait le test vrai alors que r132 ignore la propriété.
 * @param {THREE.Light} light
 * @returns {boolean}
 */
function supportsNativeShadowIntensity(light) {
    if (!light?.shadow) return false;
    const rev = parseInt(String(THREE.REVISION), 10);
    return Number.isFinite(rev) && rev >= 166;
}

/**
 * Ajouter / retirer une lumière change le nombre de slots dans le shader :
 * sans needsUpdate, la fill est ignorée et la densité d’ombre ne fait rien.
 * @param {THREE.Object3D | null | undefined} fromObject
 */
function markMaterialsNeedLightRebuild(fromObject) {
    let root = fromObject;
    while (root?.parent) root = root.parent;
    if (!root) return;
    root.traverse((obj) => {
        const mat = obj.material;
        if (!mat) return;
        const list = Array.isArray(mat) ? mat : [mat];
        for (const m of list) {
            if (m?.isMaterial) m.needsUpdate = true;
        }
    });
}

/**
 * @param {THREE.Light} fill
 * @param {THREE.Light} light
 */
function syncShadowFillFromMain(fill, light) {
    if (!fill || !light) return;
    fill.color.copy(light.color);
    fill.position.copy(light.position);
    fill.visible = light.visible;
    if (fill.isSpotLight && light.isSpotLight) {
        fill.angle = light.angle;
        fill.penumbra = light.penumbra;
        fill.distance = light.distance;
        fill.decay = light.decay;
        fill.target = light.target;
    } else if (fill.isDirectionalLight && light.isDirectionalLight) {
        fill.target = light.target;
    } else if (fill.isPointLight && light.isPointLight) {
        fill.distance = light.distance;
        fill.decay = light.decay;
    }
}

/**
 * @param {THREE.Group} pivot
 * @param {THREE.Light} light
 * @returns {THREE.Light | null}
 */
function ensureShadowFillLight(pivot, light) {
    let fill = /** @type {THREE.Light | undefined} */ (pivot.userData[SHADOW_FILL_LIGHT_KEY]);
    if (fill) {
        syncShadowFillFromMain(fill, light);
        return fill;
    }

    if (light.isSpotLight) {
        fill = new THREE.SpotLight(
            light.color.getHex(),
            0,
            light.distance,
            light.angle,
            light.penumbra,
            light.decay
        );
        fill.target = light.target;
    } else if (light.isDirectionalLight) {
        fill = new THREE.DirectionalLight(light.color.getHex(), 0);
        fill.target = light.target;
    } else if (light.isPointLight) {
        fill = new THREE.PointLight(light.color.getHex(), 0, light.distance, light.decay);
    } else {
        return null;
    }

    fill.castShadow = false;
    fill.position.copy(light.position);
    fill.name = "lab-shadow-fill";
    fill.userData._labShadowFill = true;
    fill.userData._labNoPaintPick = true;
    pivot.add(fill);
    pivot.userData[SHADOW_FILL_LIGHT_KEY] = fill;
    markMaterialsNeedLightRebuild(pivot);
    return fill;
}

/**
 * @param {THREE.Group} pivot
 */
export function removeShadowFillLight(pivot) {
    const fill = pivot?.userData?.[SHADOW_FILL_LIGHT_KEY];
    if (!fill) return;
    pivot.remove(fill);
    try {
        fill.dispose?.();
    } catch {
        /* ignore */
    }
    delete pivot.userData[SHADOW_FILL_LIGHT_KEY];
    markMaterialsNeedLightRebuild(pivot);
}

/**
 * Répartit l’intensité entre lumière qui projette et lumière de remplissage
 * (contournement Three r132 sans shadow.intensity).
 * Zones éclairées ≈ base ; zones d’ombre ≈ base × (1 − densité).
 * @param {THREE.Group} pivot
 * @param {THREE.Light} light
 * @param {number} opacity 0 = ombre invisible, 1 = ombre max
 * @param {number} [baseIntensity]
 */
function redistributeShadowSplit(pivot, light, opacity, baseIntensity) {
    const value = THREE.MathUtils.clamp(opacity, 0, SHADOW_OPACITY_MAX);
    const base =
        typeof baseIntensity === "number"
            ? Math.max(0, baseIntensity)
            : typeof pivot.userData[LIGHT_INTENSITY_KEY] === "number"
              ? pivot.userData[LIGHT_INTENSITY_KEY]
              : light.intensity + (pivot.userData[SHADOW_FILL_LIGHT_KEY]?.intensity || 0);
    pivot.userData[LIGHT_INTENSITY_KEY] = base;
    pivot.userData[SHADOW_OPACITY_KEY] = value;

    if (supportsNativeShadowIntensity(light)) {
        light.shadow.intensity = value;
        removeShadowFillLight(pivot);
        light.intensity = base;
        return;
    }

    // Ne jamais écrire shadow.intensity sur r132 : ça fausse la détection native.
    if (light.shadow && "intensity" in light.shadow) {
        try {
            delete light.shadow.intensity;
        } catch {
            /* ignore */
        }
    }

    if (!light.castShadow) {
        removeShadowFillLight(pivot);
        light.intensity = base;
        return;
    }

    // Garder la fill même à densité ≈ 1 (intensité ~0) pour un nombre de
    // lumières stable dans le shader.
    const fill = ensureShadowFillLight(pivot, light);
    if (!fill) {
        light.intensity = base;
        return;
    }
    syncShadowFillFromMain(fill, light);
    light.intensity = base * value;
    fill.intensity = base * (1 - value);
}

registerLightIntensityHook((pivot, intensity) => {
    const light = pivot?.userData?.mainLight;
    if (!light?.castShadow) return false;
    if (supportsNativeShadowIntensity(light)) {
        light.intensity = intensity;
        return true;
    }
    redistributeShadowSplit(pivot, light, readShadowOpacity(pivot), intensity);
    invalidateLabShadows();
    return true;
});

/**
 * @param {THREE.Group} pivot
 * @param {boolean} enabled
 */
export function setLightShadowEnabled(pivot, enabled) {
    const light = pivot?.userData?.mainLight;
    if (!light) return;

    const type = pivot.userData.lightType;
    const canCast =
        type === LIGHT_TYPE.SUN || type === LIGHT_TYPE.SPOT || type === LIGHT_TYPE.LAMP;

    pivot.userData[SHADOW_KEY] = enabled && canCast;
    if (pivot.userData[SHADOW_OPACITY_KEY] === undefined) {
        pivot.userData[SHADOW_OPACITY_KEY] = DEFAULT_SHADOW_OPACITY;
    }
    light.castShadow = enabled && canCast;
    if (light.castShadow) {
        configureLightShadowMap(light);
        redistributeShadowSplit(pivot, light, readShadowOpacity(pivot));
    } else {
        removeShadowFillLight(pivot);
        const base =
            typeof pivot.userData[LIGHT_INTENSITY_KEY] === "number"
                ? pivot.userData[LIGHT_INTENSITY_KEY]
                : light.intensity;
        light.intensity = base;
    }
    invalidateLabShadows();
}

/**
 * Active automatiquement les ombres sur une lumière fraîchement créée.
 * @param {THREE.Group} pivot
 */
export function enableLightShadowsByDefault(pivot) {
    setLightShadowEnabled(pivot, true);
}

/**
 * Densité / noirceur de l’ombre projetée par la lumière (0 = douce, 1 = max).
 * @param {THREE.Group} pivot
 * @param {number} opacity
 */
export function setLightShadowOpacity(pivot, opacity) {
    const value = THREE.MathUtils.clamp(opacity, 0, SHADOW_OPACITY_MAX);
    pivot.userData[SHADOW_OPACITY_KEY] = value;
    const light = pivot.userData.mainLight;
    if (light?.castShadow) {
        redistributeShadowSplit(pivot, light, value);
        invalidateLabShadows();
    }
}

/**
 * @param {THREE.Object3D} object
 */
export function supportsSceneShadow(object) {
    if (object?.userData?.mainLight) return true;
    let hasMesh = false;
    object?.traverse((child) => {
        if (child instanceof THREE.Mesh && child.name !== "shadow-overlay") hasMesh = true;
    });
    return hasMesh;
}

/**
 * Molette sur le curseur d'opacité d'ombre.
 * @param {HTMLInputElement} slider
 * @param {(value: number) => void} onChange
 */
export function bindShadowOpacitySliderWheel(slider, onChange) {
    bindRangeSliderWheel(slider, onChange, {
        step: SHADOW_OPACITY_STEP,
        wheelFactor: 0.015,
        shiftMultiplier: 2,
        host: slider.closest("label") ?? slider,
    });
}
