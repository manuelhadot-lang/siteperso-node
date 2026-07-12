/** Textures JPEG/PNG sur cubes (UV native BoxGeometry). */
import * as THREE from "three";

export const OBJECT_TEXTURE_KEY = "textureDataUrl";
const RUNTIME_TEXTURE_KEY = "_labTexture";

/**
 * @param {THREE.Object3D} object
 */
export function getObjectTextureDataUrl(object) {
    return object?.userData?.[OBJECT_TEXTURE_KEY] || null;
}

/**
 * @param {THREE.Texture | null | undefined} texture
 */
export function disposeRuntimeTexture(texture) {
    texture?.dispose();
}

/**
 * @param {THREE.Object3D} object
 */
export function releaseObjectTexture(object) {
    disposeRuntimeTexture(object.userData[RUNTIME_TEXTURE_KEY]);
    delete object.userData[RUNTIME_TEXTURE_KEY];
    object.userData[OBJECT_TEXTURE_KEY] = null;
}

/**
 * @param {THREE.Object3D} object
 * @param {string | null} dataUrl
 * @returns {Promise<void>}
 */
export function applyObjectTexture(object, dataUrl) {
    releaseObjectTexture(object);

    if (!dataUrl) {
        object.traverse((child) => {
            if (!(child instanceof THREE.Mesh)) return;
            child.material.map = null;
            child.material.needsUpdate = true;
        });
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const loader = new THREE.TextureLoader();
        loader.load(
            dataUrl,
            (texture) => {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                if ("colorSpace" in texture) {
                    texture.colorSpace = THREE.SRGBColorSpace;
                } else {
                    texture.encoding = THREE.sRGBEncoding;
                }
                texture.needsUpdate = true;

                object.userData[OBJECT_TEXTURE_KEY] = dataUrl;
                object.userData[RUNTIME_TEXTURE_KEY] = texture;

                object.traverse((child) => {
                    if (!(child instanceof THREE.Mesh)) return;
                    child.material.map = texture;
                    child.material.color.set(0xffffff);
                    child.material.needsUpdate = true;
                });
                resolve();
            },
            undefined,
            (error) => reject(error ?? new Error("Impossible de charger la texture"))
        );
    });
}

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readImageFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        if (!/^image\/(jpeg|png)$/i.test(file.type)) {
            reject(new Error("Format accepté : JPEG ou PNG"));
            return;
        }

        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
        reader.readAsDataURL(file);
    });
}
