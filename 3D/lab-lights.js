/** Lumières de scène : spot, soleil (directionnelle), lampe (point). */
import * as THREE from "three";
import { SHADOW_KEY } from "./lab-shadows.js";

export const LIGHT_INTENSITY_MAX = 20;
export const LIGHT_INTENSITY_STEP = 0.05;
export const LIGHT_INTENSITY_WHEEL_STEP = 0.08;
export const LAB_LIGHT_KEY = "labLight";
export const LIGHT_MARKER_VISIBLE_KEY = "lightMarkerVisible";
export const LIGHT_INTENSITY_KEY = "lightIntensity";
export const SCENE_ITEM_ID_KEY = "sceneItemId";

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
    const light = pivot?.userData?.mainLight;
    if (light) return light.intensity;
    return pivot?.userData?.[LIGHT_INTENSITY_KEY] ?? 1;
}

/**
 * @param {THREE.Group} pivot
 * @param {number} intensity
 */
export function setLightIntensity(pivot, intensity) {
    const value = Math.max(0, intensity);
    pivot.userData[LIGHT_INTENSITY_KEY] = value;
    const light = pivot.userData.mainLight;
    if (light) light.intensity = value;
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
        light.castShadow = false;
        target.position.set(0, -4, 0);
        light.target = target;

        const marker = new THREE.Mesh(
            new THREE.SphereGeometry(0.14, 14, 14),
            new THREE.MeshLambertMaterial({ color: 0xffcc66, emissive: 0x553300 })
        );
        pivot.add(marker);
        pivot.userData.lightMarker = marker;
        helper = new THREE.SpotLightHelper(light, 0xffcc66);
    } else if (type === LIGHT_TYPE.SUN) {
        light = new THREE.DirectionalLight(0xfff8e7, intensity);
        light.position.set(0, 0, 0);
        target.position.set(0, -4, 0);
        light.target = target;

        const marker = new THREE.Mesh(
            new THREE.SphereGeometry(0.28, 16, 16),
            new THREE.MeshLambertMaterial({ color: 0xffdd44, emissive: 0x664400 })
        );
        pivot.add(marker);
        pivot.userData.lightMarker = marker;
        helper = new THREE.DirectionalLightHelper(light, 1.2, 0xffdd44);
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
    pivot.userData[SHADOW_KEY] = false;
    light.castShadow = false;

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
    pivot.traverse((child) => {
        if (child instanceof THREE.Mesh) {
            child.geometry?.dispose();
            child.material?.dispose();
        }
    });
}

/**
 * @param {THREE.Object3D[]} objects
 */
export function updateLightHelpers(objects) {
    for (const object of objects) {
        if (!isLabLight(object)) continue;
        const helper = object.userData.lightHelper;
        if (helper?.visible) helper.update?.();
    }
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
    slider.addEventListener(
        "wheel",
        (event) => {
            event.preventDefault();
            event.stopPropagation();
            const step = event.shiftKey ? 0.5 : LIGHT_INTENSITY_WHEEL_STEP;
            const delta = -Math.sign(event.deltaY) * step;
            const min = Number(slider.min);
            const max = Number(slider.max);
            const next = Math.max(min, Math.min(max, Number(slider.value) + delta));
            const rounded = Math.round(next / LIGHT_INTENSITY_STEP) * LIGHT_INTENSITY_STEP;
            slider.value = String(rounded);
            onChange(rounded);
        },
        { passive: false }
    );
}
