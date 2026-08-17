/** Skybox HDRI — panorama équirectangulaire (.hdr) ou cubemap 6 faces. */
import * as THREE from "three";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { bindIntensitySliderWheel } from "./lab-lights.js";
import { applyStudioEnvironment } from "./lab-studio-env.js";

const { PMREMGenerator } = THREE;
import {
    ensureLabFullscreenAfterFile,
    pickFilePreservingFullscreen,
    restoreFullscreenNow,
} from "./fullscreen.js";

export const SKYBOX_BRIGHTNESS_MIN = 0;
export const SKYBOX_BRIGHTNESS_MAX = 3;
export const SKYBOX_BRIGHTNESS_STEP = 0.05;
export const SKYBOX_SCENE_ITEM_ID = "env-skybox";

/** Ordre Three.js : +X, -X, +Y, -Y, +Z, -Z */
const CUBE_FACE_RULES = [
    { id: "px", patterns: [/pos[_-]?x\b|\+x\b|\bpx\b|\bright\b/i] },
    { id: "nx", patterns: [/neg[_-]?x\b|-x\b|\bnx\b|\bleft\b/i] },
    { id: "py", patterns: [/pos[_-]?y\b|\+y\b|\bpy\b|\btop\b|\bup\b/i] },
    { id: "ny", patterns: [/neg[_-]?y\b|-y\b|\bny\b|\bbottom\b|\bdown\b/i] },
    { id: "pz", patterns: [/pos[_-]?z\b|\+z\b|\bpz\b|\bfront\b|\bfwd\b/i] },
    { id: "nz", patterns: [/neg[_-]?z\b|-z\b|\bnz\b|\bback\b/i] },
];

const DEFAULT_BACKGROUND = new THREE.Color(0x1a1a1a);
/** near > 0 : évite d’aplatir le contraste / la profondeur en FPS dans une pièce. */
const DEFAULT_FOG = new THREE.Fog(0x1a1a1a, 14, 90);

/** @type {{ kind: "equirect" | "cubemap", texture: THREE.Texture } | null} */
let loadedSkybox = null;
/** @type {THREE.Texture | null} */
let activeEnvTexture = null;
/** @type {PMREMGenerator | null} */
let pmremGenerator = null;
let skyboxVisible = false;
let skyboxBrightness = 1;
/** Source sérialisable (fichiers en data URL) pour enregistrer / recharger la skybox. */
/** @type {{ name: string, type: string, dataUrl: string }[] | null} */
let skyboxSourceFiles = null;

/** @type {(() => THREE.Scene) | null} */
let getSceneRef = null;
/** @type {(() => THREE.WebGLRenderer) | null} */
let getRendererRef = null;
/** @type {(() => void) | null} */
let refreshScenePanelRef = null;
/** @type {(() => void) | null} */
let openFilePickerRef = null;

/**
 * @param {File} file
 */
function isHdrFile(file) {
    return /\.hdr$/i.test(file.name) || /^image\/(vnd\.radiance|x-hdr|hdr)/i.test(file.type);
}

function isSkyboxLoaded() {
    return loadedSkybox !== null;
}

/**
 * @param {File} file
 * @returns {Promise<{ name: string, type: string, dataUrl: string }>}
 */
function fileToSourceEntry(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            resolve({
                name: file.name,
                type: file.type || (isHdrFile(file) ? "image/vnd.radiance" : "application/octet-stream"),
                dataUrl: String(reader.result || ""),
            });
        };
        reader.onerror = () => reject(new Error(`Lecture impossible : ${file.name}`));
        reader.readAsDataURL(file);
    });
}

/**
 * @param {{ name: string, type: string, dataUrl: string }[]} entries
 * @returns {File[]}
 */
function sourceEntriesToFiles(entries) {
    return entries.map((entry) => {
        const dataUrl = entry.dataUrl || "";
        const comma = dataUrl.indexOf(",");
        const meta = comma >= 0 ? dataUrl.slice(0, comma) : "";
        const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
        const mime =
            entry.type ||
            meta.match(/data:([^;]+)/)?.[1] ||
            "application/octet-stream";
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return new File([bytes], entry.name || "skybox.hdr", { type: mime });
    });
}

/**
 * @param {string} name
 * @returns {number}
 */
function detectCubeFaceIndex(name) {
    for (let i = 0; i < CUBE_FACE_RULES.length; i += 1) {
        if (CUBE_FACE_RULES[i].patterns.some((pattern) => pattern.test(name))) return i;
    }
    return -1;
}

/**
 * @param {File[]} files
 * @returns {File[]}
 */
function orderCubeFaceFiles(files) {
    if (files.length !== 6) {
        throw new Error("Sélectionnez exactement 6 images (faces du cube).");
    }

    const slots = /** @type {(File | null)[]} */ ([null, null, null, null, null, null]);
    const unmatched = [];

    for (const file of files) {
        const index = detectCubeFaceIndex(file.name);
        if (index >= 0 && !slots[index]) slots[index] = file;
        else unmatched.push(file);
    }

    for (let i = 0; i < 6; i += 1) {
        if (!slots[i]) {
            if (!unmatched.length) {
                throw new Error("Impossible d’identifier les 6 faces (px, nx, py, ny, pz, nz).");
            }
            slots[i] = unmatched.shift() || null;
        }
    }

    return /** @type {File[]} */ (slots);
}

/**
 * @param {ReturnType<RGBELoader["parse"]>} data
 * @returns {THREE.DataTexture}
 */
function createHdrDataTexture(data) {
    const texture = new THREE.DataTexture(
        data.data,
        data.width,
        data.height,
        data.format,
        data.type
    );
    texture.encoding = THREE.LinearEncoding;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.flipY = true;
    texture.needsUpdate = true;
    return texture;
}

/**
 * @param {File} file
 * @returns {Promise<THREE.DataTexture>}
 */
function loadHdrFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const loader = new RGBELoader();
                const data = loader.parse(reader.result);
                if (!data) {
                    reject(new Error(`HDR illisible : ${file.name}`));
                    return;
                }
                resolve(createHdrDataTexture(data));
            } catch (error) {
                reject(error instanceof Error ? error : new Error(`HDR illisible : ${file.name}`));
            }
        };
        reader.onerror = () => reject(new Error(`Lecture impossible : ${file.name}`));
        reader.readAsArrayBuffer(file);
    });
}

/**
 * @param {File} file
 * @returns {Promise<HTMLImageElement>}
 */
function loadImageFile(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(url);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error(`Image illisible : ${file.name}`));
        };
        image.src = url;
    });
}

/**
 * @param {THREE.DataTexture} texture
 * @returns {{ width: number, height: number, data: ArrayBufferView }}
 */
function cloneHdrFaceImage(texture) {
    const source = texture.image;
    const data = source.data.slice();
    return {
        width: source.width,
        height: source.height,
        data,
    };
}

/**
 * @param {File[]} files
 * @returns {Promise<THREE.CubeTexture>}
 */
async function buildCubeTextureFromHdrFiles(files) {
    const ordered = orderCubeFaceFiles(files);
    const hdrTextures = await Promise.all(ordered.map((file) => loadHdrFile(file)));

    const cube = new THREE.CubeTexture(hdrTextures.map((tex) => cloneHdrFaceImage(tex)));
    cube.format = THREE.RGBFormat;
    cube.type = THREE.HalfFloatType;
    cube.encoding = THREE.LinearEncoding;
    cube.mapping = THREE.CubeReflectionMapping;
    cube.generateMipmaps = false;
    cube.minFilter = THREE.LinearFilter;
    cube.magFilter = THREE.LinearFilter;
    cube.needsUpdate = true;

    hdrTextures.forEach((tex) => tex.dispose());
    return cube;
}

/**
 * @param {File[]} files
 * @returns {Promise<THREE.CubeTexture>}
 */
async function buildCubeTextureFromImageFiles(files) {
    const ordered = orderCubeFaceFiles(files);
    const images = await Promise.all(ordered.map((file) => loadImageFile(file)));
    const cube = new THREE.CubeTexture(images);
    cube.encoding = THREE.sRGBEncoding;
    cube.mapping = THREE.CubeReflectionMapping;
    cube.needsUpdate = true;
    return cube;
}

/**
 * @param {File[]} files
 * @returns {Promise<{ kind: "equirect", texture: THREE.DataTexture } | { kind: "cubemap", texture: THREE.CubeTexture }>}
 */
async function buildSkyboxFromFiles(files) {
    if (!files.length) {
        throw new Error("Aucun fichier sélectionné.");
    }

    const hdrFiles = files.filter(isHdrFile);
    const imageFiles = files.filter((file) => !isHdrFile(file));

    if (hdrFiles.length === 1 && imageFiles.length === 0) {
        const texture = await loadHdrFile(hdrFiles[0]);
        texture.mapping = THREE.EquirectangularReflectionMapping;
        return { kind: "equirect", texture };
    }

    if (files.length === 6 && hdrFiles.length === 6) {
        return { kind: "cubemap", texture: await buildCubeTextureFromHdrFiles(files) };
    }

    if (files.length === 6 && imageFiles.length === 6) {
        return { kind: "cubemap", texture: await buildCubeTextureFromImageFiles(files) };
    }

    if (hdrFiles.length > 1 && hdrFiles.length !== 6) {
        throw new Error("Pour un HDR cubemap, sélectionnez exactement 6 fichiers .hdr (px, nx, py, ny, pz, nz).");
    }

    throw new Error(
        "Choisissez 1 fichier .hdr (panorama) ou 6 faces (HDR/JPEG/PNG) pour une skybox cubemap."
    );
}

/**
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer} renderer
 */
function applySkyboxBrightness(scene, renderer) {
    if (!loadedSkybox || !skyboxVisible) return;

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = skyboxBrightness;
    renderer.outputEncoding = THREE.sRGBEncoding;

    scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
            if (!(material instanceof THREE.MeshStandardMaterial)) return;
            if (!activeEnvTexture) return;
            material.envMap = activeEnvTexture;
            material.envMapIntensity = skyboxBrightness;
            material.userData.labSkyboxEnvMap = true;
            material.needsUpdate = true;
        });
    });
}

/**
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer} renderer
 */
function applySkyboxMaterials(scene) {
    if (!activeEnvTexture) return;
    scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
            if (!(material instanceof THREE.MeshStandardMaterial)) return;
            material.envMap = activeEnvTexture;
            material.envMapIntensity = skyboxBrightness;
            material.userData.labSkyboxEnvMap = true;
            material.needsUpdate = true;
        });
    });
}

/**
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer} renderer
 */
function showSkyboxOnScene(scene, renderer) {
    if (!loadedSkybox) return;

    if (!pmremGenerator) pmremGenerator = new PMREMGenerator(renderer);

    if (activeEnvTexture) activeEnvTexture.dispose();

    if (loadedSkybox.kind === "equirect") {
        pmremGenerator.compileEquirectangularShader();
        activeEnvTexture = pmremGenerator.fromEquirectangular(loadedSkybox.texture).texture;
    } else {
        pmremGenerator.compileCubemapShader();
        activeEnvTexture = pmremGenerator.fromCubemap(loadedSkybox.texture).texture;
    }

    scene.background = loadedSkybox.texture;
    scene.environment = activeEnvTexture;
    scene.fog = null;
    applySkyboxMaterials(scene);
    applySkyboxBrightness(scene, renderer);
}

/**
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer} renderer
 */
function hideSkyboxFromScene(scene, renderer) {
    if (activeEnvTexture) {
        activeEnvTexture.dispose();
        activeEnvTexture = null;
    }

    scene.background = DEFAULT_BACKGROUND.clone();
    scene.fog = DEFAULT_FOG.clone();

    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.outputEncoding = THREE.sRGBEncoding;

    scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
            if (!(material instanceof THREE.MeshStandardMaterial)) return;
            material.envMap = null;
            delete material.userData.labSkyboxEnvMap;
            material.needsUpdate = true;
        });
    });

    // Restaurer les reflets studio pour le métal PBR
    applyStudioEnvironment(scene, renderer);
}

/**
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer} renderer
 */
function clearSkyboxFromScene(scene, renderer) {
    hideSkyboxFromScene(scene, renderer);

    loadedSkybox?.texture.dispose();
    loadedSkybox = null;
    skyboxVisible = false;
    skyboxBrightness = 1;
    skyboxSourceFiles = null;

    if (pmremGenerator) {
        pmremGenerator.dispose();
        pmremGenerator = null;
    }

    refreshScenePanelRef?.();
}

/** Retire complètement la skybox / HDRI de la scène courante. */
export function clearSkybox() {
    const scene = getSceneRef?.();
    const renderer = getRendererRef?.();
    if (!scene || !renderer) return;
    clearSkyboxFromScene(scene, renderer);
}

/**
 * @param {number} value
 */
function setSkyboxBrightness(value) {
    skyboxBrightness = THREE.MathUtils.clamp(
        value,
        SKYBOX_BRIGHTNESS_MIN,
        SKYBOX_BRIGHTNESS_MAX
    );
    const scene = getSceneRef?.();
    const renderer = getRendererRef?.();
    if (scene && renderer) applySkyboxBrightness(scene, renderer);
}

/**
 * @param {boolean} visible
 */
function setSkyboxVisible(visible) {
    if (!loadedSkybox) return;
    skyboxVisible = visible;

    const scene = getSceneRef?.();
    const renderer = getRendererRef?.();
    if (!scene || !renderer) return;

    if (visible) showSkyboxOnScene(scene, renderer);
    else hideSkyboxFromScene(scene, renderer);

    refreshScenePanelRef?.();
}

/**
 * @param {File[]} files
 * @param {(msg: string) => void} [showStatus]
 */
async function loadSkyboxFiles(files, showStatus) {
    if (!files.length) return;

    const scene = getSceneRef?.();
    const renderer = getRendererRef?.();
    if (!scene || !renderer) return;

    try {
        if (loadedSkybox) {
            hideSkyboxFromScene(scene, renderer);
            loadedSkybox.texture.dispose();
            loadedSkybox = null;
        }

        const sourceEntries = await Promise.all(files.map((file) => fileToSourceEntry(file)));
        const skybox = await buildSkyboxFromFiles(files);
        loadedSkybox = skybox;
        skyboxSourceFiles = sourceEntries;
        skyboxVisible = true;
        showSkyboxOnScene(scene, renderer);
        refreshScenePanelRef?.();
        showStatus?.(
            skybox.kind === "equirect"
                ? "Panorama HDR appliqué"
                : "Skybox HDRI appliquée (6 faces)"
        );
    } catch (error) {
        console.error("[LAB 3D] Skybox :", error);
        skyboxSourceFiles = null;
        showStatus?.(
            error instanceof Error ? error.message : "Impossible de charger la skybox"
        );
    }
}

/**
 * @returns {object | null}
 */
function serializeSkybox() {
    if (!loadedSkybox || !skyboxSourceFiles?.length) return null;
    return {
        version: 1,
        kind: loadedSkybox.kind,
        visible: skyboxVisible,
        brightness: skyboxBrightness,
        files: skyboxSourceFiles,
    };
}

/**
 * @param {unknown} data
 * @param {{ showStatus?: (msg: string) => void }} [opts]
 */
async function deserializeSkybox(data, opts = {}) {
    if (!data || typeof data !== "object") {
        clearSkybox();
        return;
    }
    const raw = /** @type {{ files?: unknown, visible?: boolean, brightness?: number }} */ (data);
    if (!Array.isArray(raw.files) || raw.files.length === 0) {
        clearSkybox();
        return;
    }
    const entries = raw.files
        .filter((entry) => entry && typeof entry === "object" && typeof entry.dataUrl === "string")
        .map((entry) => {
            const e = /** @type {{ name?: string, type?: string, dataUrl: string }} */ (entry);
            return {
                name: typeof e.name === "string" ? e.name : "skybox.hdr",
                type: typeof e.type === "string" ? e.type : "",
                dataUrl: e.dataUrl,
            };
        });
    if (!entries.length) {
        clearSkybox();
        return;
    }
    const files = sourceEntriesToFiles(entries);
    await loadSkyboxFiles(files, opts.showStatus);
    if (!loadedSkybox) return;
    if (typeof raw.brightness === "number") {
        setSkyboxBrightness(raw.brightness);
    }
    if (raw.visible === false) {
        setSkyboxVisible(false);
    }
}

/**
 * @param {ReturnType<import("./lab-scene-registry.js").createSceneRegistry>} registry
 */
function registerSkyboxSceneItem(registry) {
    registry.register({
        id: SKYBOX_SCENE_ITEM_ID,
        label: "Skybox",
        category: "environment",
        icon: "skybox",
        getVisible: () => isSkyboxLoaded() && skyboxVisible,
        setVisible: (visible) => {
            if (!isSkyboxLoaded()) {
                if (visible) openFilePickerRef?.();
                return;
            }
            setSkyboxVisible(visible);
        },
        isVisibleEnabled: () => isSkyboxLoaded(),
        select: () => {
            if (!isSkyboxLoaded()) openFilePickerRef?.();
        },
        getIntensity: () => skyboxBrightness,
        setIntensity: (value) => setSkyboxBrightness(value),
        intensityMin: SKYBOX_BRIGHTNESS_MIN,
        intensityMax: SKYBOX_BRIGHTNESS_MAX,
        intensityStep: SKYBOX_BRIGHTNESS_STEP,
        intensityTitle: "Luminosité skybox",
        isIntensityEnabled: () => isSkyboxLoaded(),
        canDelete: () => isSkyboxLoaded(),
        onDelete: () => {
            const scene = getSceneRef?.();
            const renderer = getRendererRef?.();
            if (!scene || !renderer || !isSkyboxLoaded()) return;
            clearSkyboxFromScene(scene, renderer);
            refreshScenePanelRef?.();
        },
    });
}

/**
 * @param {HTMLInputElement} fileInput
 * @param {(msg: string) => void} [showStatus]
 */
function wireSkyboxFileInput(fileInput, showStatus) {
    fileInput.addEventListener("change", async () => {
        const files = [...(fileInput.files || [])];
        fileInput.value = "";
        void restoreFullscreenNow();

        if (!files.length) {
            void ensureLabFullscreenAfterFile();
            return;
        }

        await loadSkyboxFiles(files, showStatus);
        void ensureLabFullscreenAfterFile();
    });
}

/**
 * @param {{
 *   getScene: () => THREE.Scene,
 *   getRenderer: () => THREE.WebGLRenderer,
 *   showStatus?: (msg: string) => void,
 *   registry?: ReturnType<import("./lab-scene-registry.js").createSceneRegistry> | null,
 * }} options
 */
export function initSkybox({ getScene, getRenderer, showStatus, registry }) {
    getSceneRef = getScene;
    getRendererRef = getRenderer;
    refreshScenePanelRef = registry ? () => registry.refresh() : null;

    const api = {
        clear: clearSkybox,
        isActive: isSkyboxLoaded,
        serialize: serializeSkybox,
        deserialize: (data) => deserializeSkybox(data, { showStatus }),
    };

    const fileInput = /** @type {HTMLInputElement | null} */ (
        document.getElementById("lab-skybox-faces-input")
    );
    if (!fileInput) return api;

    openFilePickerRef = () => {
        void pickFilePreservingFullscreen(fileInput);
    };

    wireSkyboxFileInput(fileInput, showStatus);

    if (registry) {
        registerSkyboxSceneItem(registry);
    }

    const menuRoot = document.querySelector('[data-menu="skybox"]');
    if (!menuRoot) return api;

    const trigger = menuRoot.querySelector(".lab-menu__trigger");
    const panel = menuRoot.querySelector(".lab-menu__panel");
    if (!trigger || !panel) return api;

    function closePanel() {
        panel.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
    }

    trigger.addEventListener("click", (event) => {
        event.stopPropagation();
        const willOpen = panel.hidden;
        panel.hidden = !willOpen;
        trigger.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });

    panel.querySelectorAll("[data-skybox-action]").forEach((item) => {
        item.addEventListener("click", async (event) => {
            event.stopPropagation();
            const action = item.dataset.skyboxAction;
            closePanel();

            if (action === "load") {
                openFilePickerRef();
                return;
            }

            if (action === "clear") {
                clearSkybox();
                showStatus?.("Skybox retirée");
            }
        });
    });

    document.addEventListener("click", () => closePanel());
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closePanel();
    });

    return api;
}

/** @deprecated Utiliser initSkybox */
export function initSkyboxMenu(options) {
    initSkybox(options);
}

export function disposeSkybox() {
    const scene = getSceneRef?.();
    const renderer = getRendererRef?.();
    if (scene && renderer) clearSkyboxFromScene(scene, renderer);
    else {
        loadedSkybox?.texture.dispose();
        activeEnvTexture?.dispose();
        pmremGenerator?.dispose();
        loadedSkybox = null;
        activeEnvTexture = null;
        pmremGenerator = null;
        skyboxVisible = false;
        skyboxBrightness = 1;
        skyboxSourceFiles = null;
    }
}

export function bindSkyboxBrightnessSliderWheel(slider, applyValue) {
    bindIntensitySliderWheel(slider, applyValue);
}

export function applySkyboxToNewMaterial(material) {
    if (!(material instanceof THREE.MeshStandardMaterial)) return;
    if (!loadedSkybox || !skyboxVisible || !activeEnvTexture) return;
    material.envMap = activeEnvTexture;
    material.envMapIntensity = skyboxBrightness;
    material.userData.labSkyboxEnvMap = true;
    material.needsUpdate = true;
}
