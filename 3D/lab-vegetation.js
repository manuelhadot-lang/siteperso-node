/** Végétaux procéduraux + modèles importés (.glb / .gltf) + textures sol associées. */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const LAB_VEGETATION_KEY = "labVegetation";
export const VEG_TYPES = /** @type {const} */ (["tree", "bush", "pine", "flower", "model"]);
/** Facteur de luminosité par défaut (les .glb sont souvent trop clairs). */
export const DEFAULT_VEGETATION_BRIGHTNESS = 0.78;

/**
 * @typedef {"tree" | "bush" | "pine" | "flower" | "model"} VegType
 */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   dataUrl: string,
 *   template: THREE.Object3D,
 *   nativeHeight: number,
 *   groundRadius: number,
 * }} VegetationAsset
 */

/** @type {Record<VegType, { label: string, height: number, groundRadius: number, trunk: number, foliage: number }>} */
export const VEG_PRESETS = {
    tree: {
        label: "Arbre",
        height: 4.2,
        groundRadius: 1.8,
        trunk: 0x8b5a2b,
        foliage: 0x2d8f3a,
    },
    bush: {
        label: "Buisson",
        height: 1.15,
        groundRadius: 1.2,
        trunk: 0x6b4423,
        foliage: 0x3a9a48,
    },
    pine: {
        label: "Pin",
        height: 5.5,
        groundRadius: 1.5,
        trunk: 0x5c4033,
        foliage: 0x1a6b3c,
    },
    flower: {
        label: "Fleurs",
        height: 0.55,
        groundRadius: 0.9,
        trunk: 0x556b2f,
        foliage: 0xe891b8,
    },
    model: {
        label: "Modèle",
        height: 5,
        groundRadius: 2,
        trunk: 0x8b5a2b,
        foliage: 0x2d8f3a,
    },
};

const gltfLoader = new GLTFLoader();

/** @type {Map<string, VegetationAsset>} */
const vegetationAssets = new Map();

/** @type {string | null} */
let activeVegetationAssetId = null;

/**
 * @param {unknown} object
 * @returns {object is THREE.Object3D}
 */
export function isLabVegetation(object) {
    return !!(object && /** @type {THREE.Object3D} */ (object).userData?.[LAB_VEGETATION_KEY]);
}

/**
 * @param {THREE.Object3D} object
 * @returns {VegType}
 */
export function getVegetationType(object) {
    const t = object.userData?.vegetationType;
    return VEG_TYPES.includes(t) ? t : "tree";
}

/**
 * @param {THREE.Object3D} object
 * @returns {string | null}
 */
export function getVegetationAssetId(object) {
    const id = object?.userData?.vegetationAssetId;
    return typeof id === "string" && id ? id : null;
}

/**
 * @returns {string | null}
 */
export function getActiveVegetationAssetId() {
    return activeVegetationAssetId;
}

/**
 * @param {string | null} id
 */
export function setActiveVegetationAssetId(id) {
    activeVegetationAssetId = id && vegetationAssets.has(id) ? id : null;
}

/**
 * @param {string} id
 * @returns {VegetationAsset | null}
 */
export function getVegetationAsset(id) {
    return vegetationAssets.get(id) || null;
}

/**
 * @returns {VegetationAsset[]}
 */
export function listVegetationAssets() {
    return [...vegetationAssets.values()];
}

/**
 * @param {string} [dataUrl]
 * @returns {Promise<THREE.Object3D>}
 */
function loadGltfRootFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
        gltfLoader.load(
            dataUrl,
            (gltf) => resolve(gltf.scene || gltf.scenes?.[0] || new THREE.Group()),
            undefined,
            (err) => reject(err instanceof Error ? err : new Error("Chargement GLTF impossible"))
        );
    });
}

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
export function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === "string") resolve(reader.result);
            else reject(new Error("Lecture fichier impossible"));
        };
        reader.onerror = () => reject(new Error("Lecture fichier impossible"));
        reader.readAsDataURL(file);
    });
}

/**
 * Prépare un modèle importé : pied à y=0, ombres, alpha feuilles.
 * @param {THREE.Object3D} root
 * @returns {{ nativeHeight: number, groundRadius: number }}
 */
function prepareVegetationTemplate(root) {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) {
        return { nativeHeight: VEG_PRESETS.model.height, groundRadius: VEG_PRESETS.model.groundRadius };
    }
    const center = new THREE.Vector3();
    box.getCenter(center);
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= box.min.y;
    root.updateMatrixWorld(true);

    const fitted = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    fitted.getSize(size);

    root.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.userData.labVegetationMesh = true;
        child.userData.vegetationSharedResources = true;
        child.userData.skipObjectPbr = true;
        prepareVegetationMeshForShadows(child);
    });

    return {
        nativeHeight: Math.max(size.y, 0.05),
        groundRadius: Math.max(Math.max(size.x, size.z) * 0.45, 0.4),
    };
}

/**
 * Feuillage cutout sans transparent (sinon Three.js n’écrit pas dans la shadow map).
 * @param {THREE.Material} mat
 */
function prepareFoliageMaterialForShadows(mat) {
    if (!mat) return;
    const cutout =
        mat.transparent ||
        mat.alphaTest > 0 ||
        !!mat.alphaMap ||
        !!(mat.map && mat.map.format === THREE.RGBAFormat);
    if (!cutout) return;
    mat.alphaTest = Math.max(Number(mat.alphaTest) || 0, 0.45);
    // transparent=true empêche le cast d’ombres dans la shadow map WebGL
    mat.transparent = false;
    mat.depthWrite = true;
    mat.side = THREE.DoubleSide;
    mat.userData.vegetationFoliageCutout = true;
}

/**
 * @param {THREE.Mesh} mesh
 * @returns {boolean}
 */
function meshLooksLikeFoliage(mesh) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    return materials.some(
        (mat) =>
            mat &&
            (mat.userData?.vegetationFoliageCutout ||
                mat.alphaTest > 0 ||
                !!mat.alphaMap)
    );
}

/**
 * Active cast/receive. Les cartes de feuilles ne castent pas (trop coûteux) :
 * le tronc / branches portent l’ombre au sol.
 * @param {THREE.Mesh} mesh
 */
export function prepareVegetationMeshForShadows(mesh) {
    if (!(mesh instanceof THREE.Mesh) || mesh.name === "shadow-overlay") return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
        prepareFoliageMaterialForShadows(mat);
    }
    const foliage = meshLooksLikeFoliage(mesh);
    mesh.castShadow = !foliage;
    mesh.receiveShadow = true;
    // Pas de customDepthMaterial : trop cher sur des centaines de cartes feuilles
    if (mesh.userData.vegetationOwnsDepthMaterial && mesh.customDepthMaterial) {
        mesh.customDepthMaterial.dispose();
        mesh.customDepthMaterial = null;
        delete mesh.userData.vegetationOwnsDepthMaterial;
    }
}

/**
 * Réactive le cast d’ombres sur un végétal (après setObjectShadowEnabled du lab).
 * @param {THREE.Object3D} object
 */
export function enableVegetationShadowCasting(object) {
    if (!object) return;
    object.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        if (child.name === "shadow-overlay") return;
        if (!child.userData?.labVegetationMesh) return;
        const overlay = child.userData.shadowOverlay;
        if (overlay) {
            overlay.visible = false;
            overlay.receiveShadow = false;
        }
        if (object.userData?.vegetationAssetId) {
            prepareVegetationMeshForShadows(child);
        } else {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
}

/**
 * @param {string} dataUrl
 * @param {{ id?: string, name?: string }} [opts]
 * @returns {Promise<VegetationAsset>}
 */
export async function registerVegetationAssetFromDataUrl(dataUrl, opts = {}) {
    if (!dataUrl || typeof dataUrl !== "string") {
        throw new Error("Données modèle manquantes");
    }
    const root = await loadGltfRootFromDataUrl(dataUrl);
    const { nativeHeight, groundRadius } = prepareVegetationTemplate(root);
    const id =
        typeof opts.id === "string" && opts.id
            ? opts.id
            : `veg-asset-${Math.random().toString(36).slice(2, 10)}`;
    const name = (typeof opts.name === "string" && opts.name.trim()) || "arbre.glb";
    /** @type {VegetationAsset} */
    const asset = {
        id,
        name,
        dataUrl,
        template: root,
        nativeHeight,
        groundRadius,
    };
    vegetationAssets.set(id, asset);
    activeVegetationAssetId = id;
    return asset;
}

/**
 * @param {File} file
 * @returns {Promise<VegetationAsset>}
 */
export async function registerVegetationAssetFromFile(file) {
    const dataUrl = await fileToDataUrl(file);
    return registerVegetationAssetFromDataUrl(dataUrl, { name: file.name || "arbre.glb" });
}

/**
 * @param {string[]} [onlyIds]
 * @returns {Record<string, { name: string, dataUrl: string }>}
 */
export function serializeVegetationAssets(onlyIds) {
    /** @type {Record<string, { name: string, dataUrl: string }>} */
    const out = {};
    const ids = onlyIds?.length ? onlyIds : [...vegetationAssets.keys()];
    for (const id of ids) {
        const asset = vegetationAssets.get(id);
        if (!asset) continue;
        out[id] = { name: asset.name, dataUrl: asset.dataUrl };
    }
    return out;
}

/**
 * @param {unknown} raw
 * @returns {Promise<string[]>} ids chargés
 */
export async function hydrateVegetationAssets(raw) {
    if (!raw || typeof raw !== "object") return [];
    const entries = Object.entries(
        /** @type {Record<string, { name?: string, dataUrl?: string }>} */ (raw)
    );
    /** @type {string[]} */
    const loaded = [];
    for (const [id, entry] of entries) {
        if (!entry?.dataUrl || typeof entry.dataUrl !== "string") continue;
        try {
            await registerVegetationAssetFromDataUrl(entry.dataUrl, {
                id,
                name: entry.name || id,
            });
            loaded.push(id);
        } catch (err) {
            console.warn("[lab-vegetation] asset ignoré:", id, err);
        }
    }
    return loaded;
}

/**
 * @param {number} value
 * @returns {number}
 */
export function clampVegetationBrightness(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULT_VEGETATION_BRIGHTNESS;
    return Math.min(1.5, Math.max(0.15, n));
}

/**
 * Clone les matériaux et applique un facteur de luminosité (couleur + émissif).
 * @param {THREE.Mesh} mesh
 * @param {number} brightness
 * @param {{ cloneMaterials?: boolean }} [opts]
 */
function applyBrightnessToMesh(mesh, brightness, opts = {}) {
    const cloneMaterials = opts.cloneMaterials !== false;
    const factor = clampVegetationBrightness(brightness);
    const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    /** @type {THREE.Material[]} */
    const next = [];
    for (const mat of source) {
        if (!mat) {
            next.push(mat);
            continue;
        }
        const m = cloneMaterials ? mat.clone() : mat;
        if (m.color) {
            if (!m.userData.vegBaseColor) {
                m.userData.vegBaseColor = m.color.clone();
            }
            m.color.copy(m.userData.vegBaseColor).multiplyScalar(factor);
        }
        if (m.emissive) {
            if (!m.userData.vegBaseEmissive) {
                m.userData.vegBaseEmissive = m.emissive.clone();
            }
            m.emissive.copy(m.userData.vegBaseEmissive).multiplyScalar(factor);
        }
        next.push(m);
    }
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
    if (cloneMaterials) {
        mesh.userData.vegetationClonedMaterials = true;
    }
}

/**
 * Met à jour la luminosité d’un végétal modèle (matériaux déjà clonés).
 * @param {THREE.Object3D} object
 * @param {number} brightness
 */
export function setVegetationBrightness(object, brightness) {
    if (!isLabVegetation(object)) return;
    const factor = clampVegetationBrightness(brightness);
    object.userData.vegetationBrightness = factor;
    if (getVegetationType(object) !== "model") return;
    object.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        applyBrightnessToMesh(child, factor, {
            cloneMaterials: !child.userData.vegetationClonedMaterials,
        });
        prepareVegetationMeshForShadows(child);
    });
}

/**
 * @param {VegetationAsset} asset
 * @param {{ seed?: number, height?: number, brightness?: number }} [opts]
 * @returns {THREE.Group}
 */
function createModelVegetationObject(asset, opts = {}) {
    const seed = typeof opts.seed === "number" ? opts.seed : (Math.random() * 1e9) | 0;
    const height =
        typeof opts.height === "number" && opts.height > 0.1
            ? opts.height
            : Math.min(12, Math.max(0.5, asset.nativeHeight));
    const brightness = clampVegetationBrightness(
        typeof opts.brightness === "number" ? opts.brightness : DEFAULT_VEGETATION_BRIGHTNESS
    );
    const rng = makeRng(seed);
    const group = new THREE.Group();
    group.name = `veg-model-${asset.name}`;
    group.userData[LAB_VEGETATION_KEY] = true;
    group.userData.vegetationType = "model";
    group.userData.vegetationAssetId = asset.id;
    group.userData.vegetationAssetName = asset.name;
    group.userData.vegetationSeed = seed;
    group.userData.vegetationHeight = height;
    group.userData.vegetationBrightness = brightness;
    group.userData.vegetationGroundRadius =
        asset.groundRadius * (height / Math.max(asset.nativeHeight, 0.05));
    group.userData.skipObjectPbr = true;

    const clone = asset.template.clone(true);
    const s = height / Math.max(asset.nativeHeight, 0.05);
    clone.scale.setScalar(s);
    clone.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.userData.labVegetationMesh = true;
        child.userData.vegetationSharedResources = true;
        child.userData.skipObjectPbr = true;
        applyBrightnessToMesh(child, brightness, { cloneMaterials: true });
        prepareVegetationMeshForShadows(child);
    });
    group.add(clone);
    group.rotation.y = rng() * Math.PI * 2;
    return group;
}

/**
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
    let s = (seed >>> 0) || 1;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

/**
 * Lambert + beaucoup de segments → silhouette lisse (évite l’aspect « faces plates »).
 * @param {number} hex
 * @returns {THREE.MeshLambertMaterial}
 */
function makeVegMaterial(hex) {
    const color = new THREE.Color(hex);
    const mat = new THREE.MeshLambertMaterial({
        color,
        emissive: color.clone().multiplyScalar(0.08),
        side: THREE.FrontSide,
    });
    mat.userData.labVegetationMaterial = true;
    return mat;
}

/**
 * @param {number} hex
 * @param {() => number} rng
 */
function makeVariedVegMaterial(hex, rng) {
    const mat = makeVegMaterial(hex);
    mat.color.offsetHSL((rng() - 0.5) * 0.035, 0.06, (rng() - 0.5) * 0.07);
    mat.emissive.copy(mat.color).multiplyScalar(0.08);
    return mat;
}

/**
 * Texture sol procédurale adaptée au végétal (pour pinceau texturé).
 * @param {VegType} type
 * @param {number} [size=512]
 * @returns {string} data URL PNG
 */
export function createVegetationGroundDataUrl(type, size = 512) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    const preset = VEG_PRESETS[type] || VEG_PRESETS.tree;
    const rng = makeRng(
        type === "tree" ? 11 : type === "bush" ? 22 : type === "pine" ? 33 : 44
    );

    /** @type {[string, string, string]} */
    const palette =
        type === "pine"
            ? ["#2a4028", "#3a5530", "#1e3220"]
            : type === "bush"
              ? ["#355c2e", "#4a7a3a", "#2a4a28"]
              : type === "flower"
                ? ["#4f7a35", "#6b9440", "#8fad55"]
                : ["#4a7a38", "#5c8f42", "#3d6a30"];

    ctx.fillStyle = palette[0];
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < size * size * 0.08; i += 1) {
        const x = rng() * size;
        const y = rng() * size;
        const r = 0.8 + rng() * 2.8;
        ctx.fillStyle = palette[1 + Math.floor(rng() * 2)];
        ctx.globalAlpha = 0.35 + rng() * 0.45;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (type === "flower") {
        for (let i = 0; i < 80; i += 1) {
            const x = rng() * size;
            const y = rng() * size;
            ctx.fillStyle = rng() > 0.5 ? "#e8a0bf" : "#f0d060";
            ctx.beginPath();
            ctx.arc(x, y, 1.2 + rng() * 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    if (type === "pine") {
        ctx.strokeStyle = "rgba(40, 30, 18, 0.35)";
        ctx.lineWidth = 1;
        for (let i = 0; i < 120; i += 1) {
            const x = rng() * size;
            const y = rng() * size;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + (rng() - 0.5) * 6, y + 4 + rng() * 8);
            ctx.stroke();
        }
    }

    const foliageCss = `#${preset.foliage.toString(16).padStart(6, "0")}`;
    ctx.fillStyle = foliageCss;
    ctx.globalAlpha = 0.12;
    ctx.fillRect(0, 0, size, size);
    ctx.globalAlpha = 1;

    return canvas.toDataURL("image/png");
}

/**
 * @param {THREE.Mesh} mesh
 */
function tagVegMesh(mesh) {
    mesh.userData.labVegetationMesh = true;
    mesh.userData.skipObjectPbr = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
}

/**
 * @param {VegType} type
 * @param {{ seed?: number, height?: number, assetId?: string, brightness?: number }} [opts]
 * @returns {THREE.Group}
 */
export function createVegetationObject(type = "tree", opts = {}) {
    if (type === "model") {
        const assetId = opts.assetId || activeVegetationAssetId;
        const asset = assetId ? vegetationAssets.get(assetId) : null;
        if (asset) return createModelVegetationObject(asset, opts);
        type = "tree";
    }

    const preset = VEG_PRESETS[type] || VEG_PRESETS.tree;
    const seed = typeof opts.seed === "number" ? opts.seed : (Math.random() * 1e9) | 0;
    const height =
        typeof opts.height === "number" && opts.height > 0.1
            ? opts.height
            : preset.height;
    const rng = makeRng(seed);
    const group = new THREE.Group();
    group.name = `veg-${type}`;
    group.userData[LAB_VEGETATION_KEY] = true;
    group.userData.vegetationType = type;
    group.userData.vegetationSeed = seed;
    group.userData.vegetationHeight = height;
    group.userData.vegetationGroundRadius = preset.groundRadius * (height / preset.height);
    group.userData.skipObjectPbr = true;

    if (type === "bush") {
        const baseR = 0.2 * height;
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(baseR * 0.3, baseR * 0.45, height * 0.22, 12),
            makeVegMaterial(preset.trunk)
        );
        trunk.position.y = height * 0.11;
        tagVegMesh(trunk);
        group.add(trunk);

        for (let i = 0; i < 8; i += 1) {
            const s = height * (0.32 + rng() * 0.32);
            const blob = new THREE.Mesh(
                new THREE.SphereGeometry(s * 0.42, 20, 16),
                makeVariedVegMaterial(preset.foliage, rng)
            );
            blob.position.set(
                (rng() - 0.5) * height * 0.5,
                height * (0.32 + rng() * 0.45),
                (rng() - 0.5) * height * 0.5
            );
            blob.scale.set(0.95 + rng() * 0.35, 0.8 + rng() * 0.3, 0.95 + rng() * 0.35);
            tagVegMesh(blob);
            group.add(blob);
        }
    } else if (type === "pine") {
        const trunkH = height * 0.75;
        const trunkR = height * 0.04;
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(trunkR * 0.5, trunkR, trunkH, 12),
            makeVegMaterial(preset.trunk)
        );
        trunk.position.y = trunkH * 0.5;
        tagVegMesh(trunk);
        group.add(trunk);

        const layers = 6;
        for (let i = 0; i < layers; i += 1) {
            const t = i / (layers - 1);
            const y = height * (0.26 + t * 0.66);
            const r = height * (0.36 - t * 0.26) * (0.92 + rng() * 0.1);
            const cone = new THREE.Mesh(
                new THREE.ConeGeometry(r, height * 0.24, 16),
                makeVariedVegMaterial(preset.foliage, rng)
            );
            cone.position.y = y;
            cone.rotation.y = rng() * Math.PI;
            tagVegMesh(cone);
            group.add(cone);
        }
    } else if (type === "flower") {
        for (let i = 0; i < 8; i += 1) {
            const stemH = height * (0.55 + rng() * 0.45);
            const stem = new THREE.Mesh(
                new THREE.CylinderGeometry(0.01, 0.016, stemH, 8),
                makeVegMaterial(preset.trunk)
            );
            const ox = (rng() - 0.5) * height * 0.95;
            const oz = (rng() - 0.5) * height * 0.95;
            stem.position.set(ox, stemH * 0.5, oz);
            tagVegMesh(stem);
            group.add(stem);

            const bloomMat = makeVegMaterial(preset.foliage);
            bloomMat.color.setHSL(0.88 + rng() * 0.14, 0.7 + rng() * 0.2, 0.55 + rng() * 0.15);
            bloomMat.emissive.copy(bloomMat.color).multiplyScalar(0.12);
            const bloom = new THREE.Mesh(
                new THREE.SphereGeometry(0.045 + rng() * 0.035, 12, 10),
                bloomMat
            );
            bloom.position.set(ox, stemH + 0.035, oz);
            tagVegMesh(bloom);
            group.add(bloom);
        }
        const base = new THREE.Mesh(
            new THREE.SphereGeometry(height * 0.32, 16, 12),
            makeVegMaterial(0x3d8a38)
        );
        base.position.y = height * 0.1;
        base.scale.set(1, 0.4, 1);
        tagVegMesh(base);
        group.add(base);
    } else {
        // Arbre feuillu — houppier dense en sphères lisses
        const trunkH = height * 0.52;
        const trunkR = height * 0.05;
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(trunkR * 0.6, trunkR, trunkH, 14),
            makeVegMaterial(preset.trunk)
        );
        trunk.position.y = trunkH * 0.5;
        tagVegMesh(trunk);
        group.add(trunk);

        const canopyY = height * 0.7;
        const canopyR = height * 0.34;
        for (let i = 0; i < 9; i += 1) {
            const blob = new THREE.Mesh(
                new THREE.SphereGeometry(canopyR * (0.42 + rng() * 0.28), 22, 18),
                makeVariedVegMaterial(preset.foliage, rng)
            );
            const ang = (i / 9) * Math.PI * 2 + rng() * 0.4;
            const rad = canopyR * (0.15 + rng() * 0.55);
            blob.position.set(
                Math.cos(ang) * rad,
                canopyY + (rng() - 0.35) * canopyR * 0.55,
                Math.sin(ang) * rad
            );
            tagVegMesh(blob);
            group.add(blob);
        }
    }

    group.rotation.y = rng() * Math.PI * 2;
    return group;
}

/**
 * @param {THREE.Object3D} object
 * @param {VegType} type
 * @param {{ seed?: number, height?: number, assetId?: string, brightness?: number }} [opts]
 */
export function rebuildVegetationObject(object, type, opts = {}) {
    const wasShared = !!object.userData.vegetationAssetId;
    while (object.children.length) {
        const child = object.children[0];
        object.remove(child);
        if (wasShared) {
            child.traverse((n) => {
                if (!(n instanceof THREE.Mesh)) return;
                if (n.userData?.vegetationOwnsDepthMaterial && n.customDepthMaterial) {
                    n.customDepthMaterial.dispose();
                    n.customDepthMaterial = null;
                }
                if (!n.userData?.vegetationClonedMaterials) return;
                const mat = n.material;
                if (Array.isArray(mat)) mat.forEach((m) => m?.dispose?.());
                else mat?.dispose?.();
            });
            continue;
        }
        child.traverse((n) => {
            if (/** @type {THREE.Mesh} */ (n).geometry) {
                /** @type {THREE.Mesh} */ (n).geometry.dispose();
            }
            const mat = /** @type {THREE.Mesh} */ (n).material;
            if (mat) {
                if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
                else mat.dispose();
            }
        });
    }
    const fresh = createVegetationObject(type, {
        seed: opts.seed ?? object.userData.vegetationSeed,
        height: opts.height ?? object.userData.vegetationHeight,
        assetId: opts.assetId ?? object.userData.vegetationAssetId,
        brightness: opts.brightness ?? object.userData.vegetationBrightness,
    });
    while (fresh.children.length) {
        object.add(fresh.children[0]);
    }
    object.userData[LAB_VEGETATION_KEY] = true;
    object.userData.skipObjectPbr = true;
    object.userData.vegetationType = fresh.userData.vegetationType;
    object.userData.vegetationSeed = fresh.userData.vegetationSeed;
    object.userData.vegetationHeight = fresh.userData.vegetationHeight;
    object.userData.vegetationGroundRadius = fresh.userData.vegetationGroundRadius;
    object.userData.vegetationBrightness = fresh.userData.vegetationBrightness;
    object.userData.vegetationAssetId = fresh.userData.vegetationAssetId;
    object.userData.vegetationAssetName = fresh.userData.vegetationAssetName;
    if (!fresh.userData.vegetationAssetId) {
        delete object.userData.vegetationAssetId;
        delete object.userData.vegetationAssetName;
    }
    object.name = fresh.name;
}
