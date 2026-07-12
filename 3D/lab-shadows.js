/** Ombres — activation par élément (objets, lumières, sol). */
import * as THREE from "three";
import { LIGHT_TYPE } from "./lab-lights.js";

export const SHADOW_KEY = "shadowEnabled";

/**
 * @param {THREE.WebGLRenderer} renderer
 */
export function configureRendererShadows(renderer) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

/**
 * @param {THREE.Light} light
 */
export function configureLightShadowMap(light) {
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = 0.02;

    if (light.isDirectionalLight) {
        const cam = light.shadow.camera;
        cam.near = 0.5;
        cam.far = 70;
        const extent = 24;
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
}

/**
 * @param {THREE.Object3D} object
 */
export function getObjectShadowEnabled(object) {
    return object?.userData?.[SHADOW_KEY] === true;
}

/**
 * @param {THREE.Object3D} object
 * @param {boolean} enabled
 * @param {{ receiveOnly?: boolean }} [opts]
 */
export function setObjectShadowEnabled(object, enabled, { receiveOnly = false } = {}) {
    object.userData[SHADOW_KEY] = enabled;
    object.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        if (receiveOnly) {
            child.castShadow = false;
            child.receiveShadow = enabled;
        } else {
            child.castShadow = enabled;
            child.receiveShadow = enabled;
        }
    });
}

/**
 * @param {THREE.Group} pivot
 */
export function getLightShadowEnabled(pivot) {
    return pivot?.userData?.[SHADOW_KEY] === true;
}

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
    light.castShadow = enabled && canCast;
    if (light.castShadow) {
        configureLightShadowMap(light);
    }
}

/**
 * @param {THREE.Object3D} object
 */
export function supportsSceneShadow(object) {
    if (object?.userData?.mainLight) return true;
    let hasMesh = false;
    object?.traverse((child) => {
        if (child instanceof THREE.Mesh) hasMesh = true;
    });
    return hasMesh;
}
