/** Environnement studio (PMREM) — reflets PBR réalistes sans skybox HDRI. */
import * as THREE from "three";

/** @type {THREE.Texture | null} */
let studioEnvTexture = null;
/** @type {THREE.PMREMGenerator | null} */
let pmremGenerator = null;
/** @type {THREE.WebGLRenderer | null} */
let boundRenderer = null;

/**
 * @param {THREE.WebGLRenderer} renderer
 * @returns {THREE.Texture}
 */
function buildStudioEnvTexture(renderer) {
    if (!pmremGenerator || boundRenderer !== renderer) {
        pmremGenerator?.dispose?.();
        pmremGenerator = new THREE.PMREMGenerator(renderer);
        boundRenderer = renderer;
    }

    const envScene = new THREE.Scene();

    const sky = new THREE.Mesh(
        new THREE.SphereGeometry(20, 32, 16),
        new THREE.MeshBasicMaterial({
            color: 0xc8d6e5,
            side: THREE.BackSide,
        })
    );
    envScene.add(sky);

    const ground = new THREE.Mesh(
        new THREE.CircleGeometry(12, 48),
        new THREE.MeshBasicMaterial({ color: 0x3a3a3a })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2.2;
    envScene.add(ground);

    const panelGeo = new THREE.PlaneGeometry(6, 4);
    const left = new THREE.Mesh(panelGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    left.position.set(-5, 2, 0);
    left.rotation.y = Math.PI / 2;
    envScene.add(left);
    const right = new THREE.Mesh(panelGeo, new THREE.MeshBasicMaterial({ color: 0xf0f4ff }));
    right.position.set(5, 2, 0);
    right.rotation.y = -Math.PI / 2;
    envScene.add(right);
    const top = new THREE.Mesh(
        new THREE.PlaneGeometry(8, 6),
        new THREE.MeshBasicMaterial({ color: 0xfff8f0 })
    );
    top.position.set(0, 6, 0);
    top.rotation.x = Math.PI / 2;
    envScene.add(top);

    envScene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xfff5e6, 1.1);
    key.position.set(4, 8, 5);
    envScene.add(key);
    const fill = new THREE.DirectionalLight(0xddeeff, 0.45);
    fill.position.set(-5, 3, -2);
    envScene.add(fill);

    const rt = pmremGenerator.fromScene(envScene, 0.04);
    return rt.texture;
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @returns {THREE.Texture}
 */
export function getStudioEnvironmentTexture(renderer) {
    if (!studioEnvTexture) {
        studioEnvTexture = buildStudioEnvTexture(renderer);
    }
    return studioEnvTexture;
}

/**
 * Applique l’environnement studio (reflets) sans changer le fond de scène.
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer} renderer
 */
export function applyStudioEnvironment(scene, renderer) {
    const env = getStudioEnvironmentTexture(renderer);
    scene.environment = env;
    scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
            if (!(material instanceof THREE.MeshStandardMaterial)) continue;
            if (!material.userData?.labSkyboxEnvMap) {
                material.envMap = null;
                if (typeof material.envMapIntensity !== "number") {
                    material.envMapIntensity = 1.15;
                }
                material.needsUpdate = true;
            }
        }
    });
}

/**
 * @param {THREE.Scene} scene
 */
export function clearStudioEnvironment(scene) {
    if (scene.environment === studioEnvTexture) {
        scene.environment = null;
    }
}
