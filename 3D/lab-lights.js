/** Lumières de scène : spot, soleil (directionnelle), lampe (point). */
import * as THREE from "three";
import { bindRangeSliderWheel } from "./wheel-utils.js";

export const LIGHT_INTENSITY_MAX = 20;
export const LIGHT_INTENSITY_STEP = 0.05;
export const LAB_LIGHT_KEY = "labLight";
export const LIGHT_MARKER_VISIBLE_KEY = "lightMarkerVisible";
export const LIGHT_INTENSITY_KEY = "lightIntensity";
export const LIGHT_SPOT_ANGLE_KEY = "lightSpotAngleDeg";
export const LIGHT_SPOT_PENUMBRA_KEY = "lightSpotPenumbra";
export const SCENE_ITEM_ID_KEY = "sceneItemId";

export const DEFAULT_SPOT_ANGLE_DEG = 48;
export const SPOT_ANGLE_MIN = 5;
export const SPOT_ANGLE_MAX = 90;
export const SPOT_ANGLE_STEP = 1;

export const DEFAULT_SPOT_PENUMBRA = 0.45;
export const SPOT_PENUMBRA_MIN = 0;
export const SPOT_PENUMBRA_MAX = 1;
export const SPOT_PENUMBRA_STEP = 0.01;

export const LIGHT_TYPE = {
    SPOT: "spot",
    SUN: "directional",
    LAMP: "point",
};

const DEFAULT_INTENSITY = {
    [LIGHT_TYPE.SPOT]: 6,
    [LIGHT_TYPE.SUN]: 1.2,
    [LIGHT_TYPE.LAMP]: 2,
};

/**
 * @param {THREE.Object3D | null | undefined} object
 */
export function isLabLight(object) {
    return object?.userData?.[LAB_LIGHT_KEY] === true;
}

/**
 * @param {THREE.Group} pivot
 */
export function getLightIntensity(pivot) {
    const stored = pivot?.userData?.[LIGHT_INTENSITY_KEY];
    if (typeof stored === "number") return stored;
    const light = pivot?.userData?.mainLight;
    if (light) return light.intensity;
    return 1;
}

/** @type {null | ((pivot: THREE.Group, intensity: number) => boolean)} */
let lightIntensityHook = null;

/**
 * Hook ombres (split cast / fill) — enregistré par lab-shadows.js.
 * @param {null | ((pivot: THREE.Group, intensity: number) => boolean)} fn
 */
export function registerLightIntensityHook(fn) {
    lightIntensityHook = fn;
}

/**
 * @param {THREE.Group} pivot
 * @param {number} intensity
 */
export function setLightIntensity(pivot, intensity) {
    const value = Math.max(0, intensity);
    pivot.userData[LIGHT_INTENSITY_KEY] = value;
    if (lightIntensityHook?.(pivot, value)) return;
    const light = pivot.userData.mainLight;
    if (light) light.intensity = value;
}

/**
 * @param {THREE.Object3D | null | undefined} pivot
 */
export function isSpotLight(pivot) {
    return pivot?.userData?.lightType === LIGHT_TYPE.SPOT;
}

/**
 * @param {THREE.Group} pivot
 */
export function getLightSpotAngleDeg(pivot) {
    const light = pivot?.userData?.mainLight;
    if (light?.isSpotLight) {
        return THREE.MathUtils.radToDeg(light.angle);
    }
    const stored = pivot?.userData?.[LIGHT_SPOT_ANGLE_KEY];
    return typeof stored === "number" ? stored : DEFAULT_SPOT_ANGLE_DEG;
}

/**
 * @param {THREE.Group} pivot
 * @param {number} degrees
 */
export function setLightSpotAngleDeg(pivot, degrees) {
    const value = THREE.MathUtils.clamp(degrees, SPOT_ANGLE_MIN, SPOT_ANGLE_MAX);
    pivot.userData[LIGHT_SPOT_ANGLE_KEY] = value;
    const light = pivot.userData.mainLight;
    if (!light?.isSpotLight) return;

    light.angle = THREE.MathUtils.degToRad(value);
    if (light.castShadow && light.shadow?.camera) {
        light.shadow.camera.fov = value * 1.05;
        light.shadow.camera.updateProjectionMatrix();
    }
    const fill = pivot.userData._labShadowFillLight;
    if (fill?.isSpotLight) fill.angle = light.angle;
    const helper = pivot.userData.lightHelper;
    if (helper?.visible) helper.update?.();
}

/**
 * @param {THREE.Group} pivot
 * @returns {number} 0 = bord net, 1 = bord très doux
 */
export function getLightSpotPenumbra(pivot) {
    const light = pivot?.userData?.mainLight;
    if (light?.isSpotLight && typeof light.penumbra === "number") {
        return light.penumbra;
    }
    const stored = pivot?.userData?.[LIGHT_SPOT_PENUMBRA_KEY];
    return typeof stored === "number" ? stored : DEFAULT_SPOT_PENUMBRA;
}

/**
 * @param {THREE.Group} pivot
 * @param {number} penumbra
 */
export function setLightSpotPenumbra(pivot, penumbra) {
    const value = THREE.MathUtils.clamp(penumbra, SPOT_PENUMBRA_MIN, SPOT_PENUMBRA_MAX);
    pivot.userData[LIGHT_SPOT_PENUMBRA_KEY] = value;
    const light = pivot.userData.mainLight;
    if (!light?.isSpotLight) return;
    light.penumbra = value;
    const fill = pivot.userData._labShadowFillLight;
    if (fill?.isSpotLight) fill.penumbra = value;
    const helper = pivot.userData.lightHelper;
    if (helper?.visible) helper.update?.();
}

/**
 * @param {THREE.Group} pivot
 */
export function isLightSceneVisible(pivot) {
    const light = pivot.userData.mainLight;
    return light ? light.visible : pivot.visible;
}

/**
 * @param {THREE.Group} pivot
 * @param {boolean} visible
 */
export function setLightSceneVisible(pivot, visible) {
    const light = pivot.userData.mainLight;
    if (light) light.visible = visible;

    const fill = pivot.userData._labShadowFillLight;
    if (fill) fill.visible = visible;

    const marker = pivot.userData.lightMarker;
    if (marker) {
        marker.visible = visible && isLightMarkerVisible(pivot);
    }

    const helper = pivot.userData.lightHelper;
    if (helper) {
        helper.visible = visible && isLightMarkerVisible(pivot);
    }
}

/**
 * @param {"spot"|"directional"|"point"} type
 * @returns {THREE.Group}
 */
export function createLightPivot(type) {
    const pivot = new THREE.Group();
    pivot.userData[LAB_LIGHT_KEY] = true;
    pivot.userData.lightType = type;

    const target = new THREE.Object3D();
    pivot.add(target);

    const intensity = DEFAULT_INTENSITY[type] ?? 1.5;

    /** @type {THREE.Light} */
    let light;
    /** @type {THREE.Object3DHelper | null} */
    let helper = null;

    if (type === LIGHT_TYPE.SPOT) {
        light = new THREE.SpotLight(
            0xfff4e0,
            intensity,
            100,
            THREE.MathUtils.degToRad(48),
            0.45,
            0
        );
        light.position.set(0, 0, 0);
        light.castShadow = true;
        // Axe local -Z : yaw (Y) et pitch (X) orientent le faisceau comme une caméra.
        target.position.set(0, 0, -4);
        light.target = target;

        const marker = new THREE.Mesh(
            new THREE.SphereGeometry(0.14, 14, 14),
            new THREE.MeshLambertMaterial({ color: 0xffcc66, emissive: 0x553300 })
        );
        const nose = new THREE.Mesh(
            new THREE.ConeGeometry(0.07, 0.24, 10),
            new THREE.MeshLambertMaterial({ color: 0xffb347, emissive: 0x553300 })
        );
        nose.rotation.x = Math.PI / 2;
        nose.position.z = -0.24;
        marker.add(nose);
        pivot.add(marker);
        pivot.userData.lightMarker = marker;
        helper = new THREE.SpotLightHelper(light, 0xffcc66);
        // Faisceau vers le bas au spawn (local -Z → monde -Y).
        pivot.rotation.x = -Math.PI / 2;
        pivot.userData.lightAim = "negZ";
    } else if (type === LIGHT_TYPE.SUN) {
        light = new THREE.DirectionalLight(0xfff8e7, intensity);
        light.position.set(0, 0, 0);
        target.position.set(0, 0, -4);
        light.target = target;

        const marker = new THREE.Mesh(
            new THREE.SphereGeometry(0.28, 16, 16),
            new THREE.MeshLambertMaterial({ color: 0xffdd44, emissive: 0x664400 })
        );
        pivot.add(marker);
        pivot.userData.lightMarker = marker;
        helper = new THREE.DirectionalLightHelper(light, 1.2, 0xffdd44);
        pivot.rotation.x = -Math.PI / 2;
        pivot.userData.lightAim = "negZ";
    } else {
        light = new THREE.PointLight(0xffffee, intensity, 28, 1.2);
        light.position.set(0, 0, 0);

        const marker = new THREE.Mesh(
            new THREE.SphereGeometry(0.12, 12, 12),
            new THREE.MeshLambertMaterial({ color: 0xffffcc, emissive: 0x444422 })
        );
        pivot.add(marker);
        pivot.userData.lightMarker = marker;
        helper = new THREE.PointLightHelper(light, 0.22, 0xffffaa);
    }

    pivot.add(light);
    pivot.userData.mainLight = light;
    pivot.userData.lightTarget = target;
    pivot.userData.lightHelper = helper;
    pivot.userData.snapToFloor = false;
    pivot.userData[LIGHT_MARKER_VISIBLE_KEY] = true;
    pivot.userData[LIGHT_INTENSITY_KEY] = intensity;
    pivot.userData.shadowEnabled = true;
    pivot.userData.shadowOpacity = 0.85;
    if (type === LIGHT_TYPE.SPOT) {
        pivot.userData[LIGHT_SPOT_ANGLE_KEY] = DEFAULT_SPOT_ANGLE_DEG;
        pivot.userData[LIGHT_SPOT_PENUMBRA_KEY] = DEFAULT_SPOT_PENUMBRA;
    }
    // Ombres activées par défaut (soleil / spot / lampe) — réglables dans le panneau scène.
    light.castShadow = type === LIGHT_TYPE.SPOT || type === LIGHT_TYPE.SUN || type === LIGHT_TYPE.LAMP;

    return pivot;
}

/**
 * @param {THREE.Group} pivot
 */
export function isLightMarkerVisible(pivot) {
    return pivot?.userData?.[LIGHT_MARKER_VISIBLE_KEY] !== false;
}

/**
 * @param {THREE.Group} pivot
 * @param {boolean} visible
 */
export function setLightMarkerVisible(pivot, visible) {
    pivot.userData[LIGHT_MARKER_VISIBLE_KEY] = visible;
    const sceneVisible = isLightSceneVisible(pivot);
    const marker = pivot.userData.lightMarker;
    if (marker) marker.visible = sceneVisible && visible;
    const helper = pivot.userData.lightHelper;
    if (helper) helper.visible = sceneVisible && visible;
}

/**
 * @param {THREE.Group} pivot
 * @param {THREE.Scene} scene
 */
export function attachLightHelper(pivot, scene) {
    const helper = pivot.userData.lightHelper;
    if (helper && !helper.parent) {
        scene.add(helper);
    }
}

/**
 * @param {THREE.Group} pivot
 * @param {THREE.Scene} scene
 */
export function detachLightHelper(pivot, scene) {
    const helper = pivot.userData.lightHelper;
    if (!helper) return;
    scene.remove(helper);
    if (typeof helper.dispose === "function") {
        helper.dispose();
    }
}

/**
 * @param {THREE.Group} pivot
 * @param {THREE.Scene} scene
 */
export function disposeLightPivot(pivot, scene) {
    detachLightHelper(pivot, scene);
    const fill = pivot.userData?._labShadowFillLight;
    if (fill) {
        pivot.remove(fill);
        try {
            fill.dispose?.();
        } catch {
            /* ignore */
        }
        delete pivot.userData._labShadowFillLight;
    }
    pivot.traverse((child) => {
        if (child instanceof THREE.Mesh) {
            child.geometry?.dispose();
            child.material?.dispose();
        }
        // Libérer la shadow map GPU de la lumière (sinon fuite à chaque suppression).
        if (child instanceof THREE.Light && child.shadow?.map) {
            child.shadow.map.dispose();
            child.shadow.map = null;
        }
    });
}

/**
 * Met à jour la cible / l’helper après un déplacement ou une rotation.
 * @param {THREE.Object3D} pivot
 */
export function syncLightAim(pivot) {
    if (!isLabLight(pivot)) return;
    pivot.updateMatrixWorld(true);
    const target = pivot.userData.lightTarget;
    target?.updateMatrixWorld?.(true);
    const helper = pivot.userData.lightHelper;
    if (helper?.visible) helper.update?.();
}

/**
 * @param {THREE.Object3D[]} objects
 */
export function updateLightHelpers(objects) {
    for (const object of objects) {
        if (!isLabLight(object)) continue;
        syncLightAim(object);
    }
}

/**
 * Oriente le pivot pour que le faisceau (axe local −Z) pointe dans `worldDirection`.
 * @param {THREE.Object3D} pivot
 * @param {THREE.Vector3} worldDirection
 */
export function orientLightPivotToward(pivot, worldDirection) {
    if (!pivot || !worldDirection) return;
    const dir = worldDirection.clone();
    if (dir.lengthSq() < 1e-10) return;
    dir.normalize();
    const localAim = new THREE.Vector3(0, 0, -1);
    pivot.quaternion.setFromUnitVectors(localAim, dir);
    pivot.userData.lightAim = "negZ";
    syncLightAim(pivot);
}

/**
 * @param {"spot"|"directional"|"point"} type
 */
export function getLightLabel(type) {
    switch (type) {
        case LIGHT_TYPE.SPOT:
            return "Spot";
        case LIGHT_TYPE.SUN:
            return "Soleil";
        case LIGHT_TYPE.LAMP:
            return "Lampe";
        default:
            return "Lumière";
    }
}

/**
 * Molette sur un curseur d'intensité — réglage fin sans reconstruire le panneau.
 * @param {HTMLInputElement} slider
 * @param {(value: number) => void} onChange
 */
export function bindIntensitySliderWheel(slider, onChange) {
    bindRangeSliderWheel(slider, onChange, {
        step: LIGHT_INTENSITY_STEP,
        wheelFactor: 0.015,
        shiftMultiplier: 2,
        host: slider.closest("label") ?? slider,
    });
}

/**
 * @param {HTMLInputElement} slider
 * @param {(value: number) => void} onChange
 */
export function bindSpotAngleSliderWheel(slider, onChange) {
    bindRangeSliderWheel(slider, onChange, {
        step: SPOT_ANGLE_STEP,
        wheelFactor: 0.025,
        shiftMultiplier: 2,
        host: slider.closest(".lab-context-menu__intensity") ?? slider.closest("label") ?? slider,
    });
}

/**
 * @param {HTMLInputElement} slider
 * @param {(value: number) => void} onChange
 */
export function bindSpotPenumbraSliderWheel(slider, onChange) {
    bindRangeSliderWheel(slider, onChange, {
        step: SPOT_PENUMBRA_STEP,
        wheelFactor: 0.02,
        shiftMultiplier: 2,
        host: slider.closest(".lab-context-menu__intensity") ?? slider.closest("label") ?? slider,
    });
}
