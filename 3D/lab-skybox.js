/** Skybox HDRI — panorama équirectangulaire (.hdr) ou cubemap 6 faces. */
import * as THREE from "three";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { bindIntensitySliderWheel } from "./lab-lights.js";
import { applyStudioEnvironment } from "./lab-studio-env.js";
import { composeEnvMapIntensity } from "./lab-mirror.js";
import { wgs84ToLocalTerrain } from "./lab-terrain-ign.js";

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

/** Rayon bulle Mapillary ≈ 15 % de la map (min/max en m) — pas une skybox à l’infini. */
const MAPILLARY_DOME_FRAC = 0.15;
const MAPILLARY_DOME_MIN_M = 12;
const MAPILLARY_DOME_MAX_M = 55;
const MAPILLARY_EYE_HEIGHT_M = 1.7;

/** Ordre Three.js : +X, -X, +Y, -Y, +Z, -Z */
const CUBE_FACE_RULES = [
    { id: "px", patterns: [/pos[_-]?x\b|\+x\b|\bpx\b|\bright\b/i] },
    { id: "nx", patterns: [/neg[_-]?x\b|-x\b|\bnx\b|\bleft\b/i] },
    { id: "py", patterns: [/pos[_-]?y\b|\+y\b|\bpy\b|\btop\b|\bup\b/i] },
    { id: "ny", patterns: [/neg[_-]?y\b|-y\b|\bny\b|\bbottom\b|\bdown\b/i] },
    { id: "pz", patterns: [/pos[_-]?z\b|\+z\b|\bpz\b|\bfront\b|\bfwd\b/i] },
    { id: "nz", patterns: [/neg[_-]?z\b|-z\b|\bnz\b|\bback\b/i] },
];

/**
 * @param {THREE.Material} material
 */
function skyboxEnvMapIntensityFor(material) {
    const refl = material?.userData?._labReflection;
    if (typeof refl === "number") {
        return composeEnvMapIntensity(refl, skyboxBrightness);
    }
    return skyboxBrightness;
}

/**
 * @param {THREE.Material} material
 */
function applySkyboxEnvToMaterial(material) {
    if (!(material instanceof THREE.MeshStandardMaterial)) return;
    if (!activeEnvTexture) return;
    material.envMap = activeEnvTexture;
    material.envMapIntensity = skyboxEnvMapIntensityFor(material);
    material.userData.labSkyboxEnvMap = true;
    material.userData._labSkyboxBrightness = skyboxBrightness;
    material.needsUpdate = true;
}

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
/** infinite = HDRI classique ; localized = bulle Mapillary à l’échelle map. */
/** @type {"infinite" | "localized"} */
let skyboxDisplayMode = "infinite";
/** @type {{ lat: number, lon: number, compassAngle: number | null } | null} */
let localizedPanoMeta = null;
/** @type {THREE.Mesh | null} */
let localizedDomeMesh = null;

/** @type {(() => THREE.Scene) | null} */
let getSceneRef = null;
/** @type {(() => THREE.WebGLRenderer) | null} */
let getRendererRef = null;
/** @type {(() => void) | null} */
let refreshScenePanelRef = null;
/** @type {(() => void) | null} */
let openFilePickerRef = null;
/** @type {(() => ({ lat: number, lon: number } | null)) | null} */
let getIgnCenterRef = null;
/** @type {(() => number) | null} */
let getTerrainSizeRef = null;
/** @type {((x: number, z: number) => number) | null} */
let sampleTerrainYRef = null;

/**
 * @param {THREE.Scene} scene
 */
function disposeLocalizedDome(scene) {
    if (!localizedDomeMesh) return;
    scene.remove(localizedDomeMesh);
    localizedDomeMesh.geometry?.dispose?.();
    const mat = localizedDomeMesh.material;
    if (mat && !Array.isArray(mat)) {
        if (mat.map && mat.map !== loadedSkybox?.texture) {
            mat.map.dispose();
        }
        mat.map = null;
        mat.dispose();
    }
    localizedDomeMesh = null;
}

/**
 * Rayon de la bulle panorama proportionnel à la taille de map.
 * @param {number} sizeMeters
 */
function mapillaryDomeRadius(sizeMeters) {
    const size = Math.max(40, Number(sizeMeters) || 200);
    return THREE.MathUtils.clamp(size * MAPILLARY_DOME_FRAC, MAPILLARY_DOME_MIN_M, MAPILLARY_DOME_MAX_M);
}

/**
 * Place / recrée la bulle Mapillary au point de capture, échelle map.
 * @param {THREE.Scene} scene
 */
function syncLocalizedDome(scene) {
    disposeLocalizedDome(scene);
    if (!loadedSkybox || loadedSkybox.kind !== "equirect" || skyboxDisplayMode !== "localized") {
        return;
    }
    const center = getIgnCenterRef?.() || null;
    const meta = localizedPanoMeta;
    if (!center || !meta) return;

    const sizeMeters = getTerrainSizeRef?.() ?? 200;
    const radius = mapillaryDomeRadius(sizeMeters);
    const { x, z } = wgs84ToLocalTerrain(center.lat, center.lon, meta.lat, meta.lon);
    const half = sizeMeters * 0.5;
    // Si hors footprint, recentre sur le milieu de map.
    const onMap = Math.abs(x) <= half && Math.abs(z) <= half;
    const px = onMap ? x : 0;
    const pz = onMap ? z : 0;
    const groundY = sampleTerrainYRef?.(px, pz) ?? 0;

    // Texture en UV classique (SphereGeometry) — pas EquirectangularReflectionMapping.
    const domeMap = loadedSkybox.texture.clone();
    domeMap.mapping = THREE.UVMapping;
    domeMap.needsUpdate = true;
    if ("colorSpace" in domeMap && "colorSpace" in loadedSkybox.texture) {
        domeMap.colorSpace = loadedSkybox.texture.colorSpace;
    }

    const geometry = new THREE.SphereGeometry(radius, 64, 32);
    const material = new THREE.MeshBasicMaterial({
        map: domeMap,
        side: THREE.DoubleSide,
        depthWrite: true,
        fog: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "lab-mapillary-dome";
    mesh.userData.labMapillaryDome = true;
    mesh.position.set(px, groundY + MAPILLARY_EYE_HEIGHT_M, pz);
    // Compass Mapillary : 0 = nord. Monde lab : nord = −Z.
    const compass = Number.isFinite(meta.compassAngle) ? Number(meta.compassAngle) : 0;
    mesh.rotation.y = THREE.MathUtils.degToRad(-compass);
    mesh.renderOrder = -1;
    scene.add(mesh);
    localizedDomeMesh = mesh;
}

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

    if (imageFiles.length === 1 && hdrFiles.length === 0) {
        const image = await loadImageFile(imageFiles[0]);
        const texture = new THREE.Texture(image);
        texture.mapping = THREE.EquirectangularReflectionMapping;
        if ("colorSpace" in texture) texture.colorSpace = THREE.SRGBColorSpace;
        else texture.encoding = THREE.sRGBEncoding;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
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
        "Choisissez 1 fichier .hdr / panorama JPEG-PNG, ou 6 faces (HDR/JPEG/PNG) pour une skybox cubemap."
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
            applySkyboxEnvToMaterial(material);
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
            applySkyboxEnvToMaterial(material);
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

    if (skyboxDisplayMode === "localized") {
        // Pas de skybox à l’infini : bulle locale + IBL adoucie.
        scene.background = DEFAULT_BACKGROUND.clone();
        scene.fog = DEFAULT_FOG.clone();
        if ("backgroundBlurriness" in scene) scene.backgroundBlurriness = 0;
        if ("backgroundIntensity" in scene) scene.backgroundIntensity = 1;
        if ("environmentIntensity" in scene) {
            scene.environmentIntensity = 0.55;
        }
        scene.environment = activeEnvTexture;
        syncLocalizedDome(scene);
    } else {
        disposeLocalizedDome(scene);
        scene.background = loadedSkybox.texture;
        scene.environment = activeEnvTexture;
        scene.fog = null;
        if ("environmentIntensity" in scene) scene.environmentIntensity = 1;
    }

    applySkyboxMaterials(scene);
    applySkyboxBrightness(scene, renderer);
}

/**
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer} renderer
 */
function hideSkyboxFromScene(scene, renderer) {
    skyboxVisible = false;
    disposeLocalizedDome(scene);
    if (activeEnvTexture) {
        activeEnvTexture.dispose();
        activeEnvTexture = null;
    }

    scene.background = null;
    scene.environment = null;
    if ("backgroundBlurriness" in scene) scene.backgroundBlurriness = 0;
    if ("backgroundIntensity" in scene) scene.backgroundIntensity = 1;
    if ("environmentIntensity" in scene) scene.environmentIntensity = 1;

    scene.background = DEFAULT_BACKGROUND.clone();
    scene.fog = DEFAULT_FOG.clone();

    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1;
    if ("outputColorSpace" in renderer) {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else {
        renderer.outputEncoding = THREE.sRGBEncoding;
    }

    scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
            if (!(material instanceof THREE.MeshStandardMaterial)) return;
            material.envMap = null;
            delete material.userData.labSkyboxEnvMap;
            delete material.userData._labSkyboxBrightness;
            const refl = material.userData._labReflection;
            if (typeof refl === "number") {
                material.envMapIntensity = composeEnvMapIntensity(refl, 1);
            }
            material.needsUpdate = true;
        });
    });

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
    skyboxDisplayMode = "infinite";
    localizedPanoMeta = null;

    if (pmremGenerator) {
        pmremGenerator.dispose();
        pmremGenerator = null;
    }

    refreshScenePanelRef?.();
}

/** Retire complètement la skybox / HDRI de la scène courante. */
export function clearSkybox(sceneOverride = null, rendererOverride = null) {
    const scene = sceneOverride || getSceneRef?.();
    const renderer = rendererOverride || getRendererRef?.();
    if (scene && renderer) {
        clearSkyboxFromScene(scene, renderer);
        return;
    }
    const sc = getSceneRef?.();
    if (sc) disposeLocalizedDome(sc);
    loadedSkybox?.texture.dispose();
    activeEnvTexture?.dispose();
    pmremGenerator?.dispose();
    loadedSkybox = null;
    activeEnvTexture = null;
    pmremGenerator = null;
    skyboxVisible = false;
    skyboxBrightness = 1;
    skyboxSourceFiles = null;
    skyboxDisplayMode = "infinite";
    localizedPanoMeta = null;
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
 * Charge un panorama équirectangulaire depuis une URL (ex. proxy Mapillary).
 * @param {string} url
 * @param {{ name?: string, showStatus?: (msg: string) => void, displayMode?: "infinite" | "localized", panoMeta?: { lat: number, lon: number, compassAngle: number | null } | null }} [opts]
 */
async function loadSkyboxFromImageUrl(url, opts = {}) {
    const scene = getSceneRef?.();
    const renderer = getRendererRef?.();
    if (!scene || !renderer) return;
    const showStatus = opts.showStatus;
    showStatus?.("Téléchargement du panorama…");
    const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) {
        let msg = `Téléchargement impossible (${res.status})`;
        try {
            const j = await res.json();
            if (j?.error) msg = String(j.error);
        } catch {
            /* ignore */
        }
        throw new Error(msg);
    }
    const blob = await res.blob();
    const file = new File([blob], opts.name || "mapillary-pano.jpg", {
        type: blob.type || "image/jpeg",
    });
    await loadSkyboxFiles([file], showStatus, {
        displayMode: opts.displayMode || "infinite",
        panoMeta: opts.panoMeta ?? null,
    });
}

/**
 * Cherche un panorama Mapillary près d’un point et l’applique en bulle à l’échelle map.
 * @param {{ lat: number, lon: number, preferFar?: boolean, minDistanceM?: number, showStatus?: (msg: string) => void }} opts
 */
async function loadMapillarySkyboxNear(opts) {
    const { lat, lon, preferFar = true, minDistanceM = 0, showStatus } = opts;
    if (![lat, lon].every(Number.isFinite)) {
        throw new Error("Coordonnées invalides");
    }
    showStatus?.("Recherche Mapillary près du point…");
    const q = new URLSearchParams({
        lat: String(lat),
        lon: String(lon),
        preferFar: preferFar ? "1" : "0",
        minDistanceM: String(Math.max(0, minDistanceM || 0)),
    });
    const metaRes = await fetch(`/api/mapillary/nearby-pano?${q}`, {
        credentials: "same-origin",
        cache: "no-store",
    });
    const meta = await metaRes.json().catch(() => ({}));
    if (!metaRes.ok) {
        throw new Error(meta?.error || `Mapillary HTTP ${metaRes.status}`);
    }
    if (!meta.isPano) {
        showStatus?.(
            "Pas de panorama 360° à proximité — image perspective (bulle partielle)"
        );
    } else {
        showStatus?.(
            `Panorama Mapillary à ~${meta.distanceM} m du point — bulle locale…`
        );
    }
    const proxyUrl = meta.proxyUrl || `/api/mapillary/image?id=${encodeURIComponent(meta.id)}`;
    const panoLat = Number.isFinite(meta.lat) ? meta.lat : lat;
    const panoLon = Number.isFinite(meta.lon) ? meta.lon : lon;
    await loadSkyboxFromImageUrl(proxyUrl, {
        name: `mapillary-${meta.id}.jpg`,
        showStatus,
        displayMode: "localized",
        panoMeta: {
            lat: panoLat,
            lon: panoLon,
            compassAngle: Number.isFinite(meta.compassAngle) ? meta.compassAngle : null,
        },
    });
    const sizeMeters = getTerrainSizeRef?.() ?? 200;
    const radius = Math.round(mapillaryDomeRadius(sizeMeters));
    showStatus?.(
        `Bulle Mapillary Ø≈${radius * 2} m (~${meta.distanceM} m du centre) — © Mapillary`
    );
    return meta;
}

/**
 * @param {File[]} files
 * @param {(msg: string) => void} [showStatus]
 * @param {{ displayMode?: "infinite" | "localized", panoMeta?: { lat: number, lon: number, compassAngle: number | null } | null }} [opts]
 */
async function loadSkyboxFiles(files, showStatus, opts = {}) {
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
        skyboxDisplayMode = opts.displayMode === "localized" ? "localized" : "infinite";
        localizedPanoMeta = skyboxDisplayMode === "localized" ? opts.panoMeta || null : null;
        showSkyboxOnScene(scene, renderer);
        refreshScenePanelRef?.();
        showStatus?.(
            skyboxDisplayMode === "localized"
                ? "Bulle panorama Mapillary (échelle map)"
                : skybox.kind === "equirect"
                  ? /\.hdr$/i.test(files[0]?.name || "")
                      ? "Panorama HDR appliqué"
                      : "Panorama appliqué"
                  : "Skybox HDRI appliquée (6 faces)"
        );
    } catch (error) {
        console.error("[LAB 3D] Skybox :", error);
        skyboxSourceFiles = null;
        skyboxDisplayMode = "infinite";
        localizedPanoMeta = null;
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
        displayMode: skyboxDisplayMode,
        panoMeta: localizedPanoMeta,
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
    const raw = /** @type {{ files?: unknown, visible?: boolean, brightness?: number, displayMode?: string, panoMeta?: { lat: number, lon: number, compassAngle: number | null } | null }} */ (
        data
    );
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
    await loadSkyboxFiles(files, opts.showStatus, {
        displayMode: raw.displayMode === "localized" ? "localized" : "infinite",
        panoMeta: raw.panoMeta || null,
    });
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
 *   getIgnCenter?: () => ({ lat: number, lon: number } | null),
 *   getTerrainSizeMeters?: () => number,
 *   sampleTerrainY?: (x: number, z: number) => number,
 * }} options
 */
export function initSkybox({
    getScene,
    getRenderer,
    showStatus,
    registry,
    getIgnCenter = null,
    getTerrainSizeMeters = null,
    sampleTerrainY = null,
}) {
    getSceneRef = getScene;
    getRendererRef = getRenderer;
    refreshScenePanelRef = registry ? () => registry.refresh() : null;
    getIgnCenterRef = getIgnCenter;
    getTerrainSizeRef = getTerrainSizeMeters;
    sampleTerrainYRef = sampleTerrainY;

    const api = {
        clear: clearSkybox,
        isActive: isSkyboxLoaded,
        serialize: serializeSkybox,
        deserialize: (data) => deserializeSkybox(data, { showStatus }),
        loadMapillaryNear: (lat, lon, opts = {}) =>
            loadMapillarySkyboxNear({
                lat,
                lon,
                preferFar: opts.preferFar === true,
                minDistanceM: opts.minDistanceM ?? 0,
                showStatus,
            }),
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

            if (action === "mapillary") {
                const center = getIgnCenter?.() || null;
                if (!center) {
                    showStatus?.(
                        "Importez d’abord un heightmap IGN (centre lat/lon requis)"
                    );
                    return;
                }
                showStatus?.("Mapillary…");
                try {
                    await loadMapillarySkyboxNear({
                        lat: center.lat,
                        lon: center.lon,
                        preferFar: false,
                        minDistanceM: 0,
                        showStatus,
                    });
                } catch (error) {
                    console.warn("[lab-skybox] Mapillary :", error);
                    showStatus?.(
                        error instanceof Error ? error.message : "Mapillary impossible"
                    );
                }
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
    applySkyboxEnvToMaterial(material);
}
