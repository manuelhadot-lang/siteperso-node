/** Textures PBR légères : couleur, normales (JPEG/PNG), roughness. */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import {
    getPlaceholderWhiteTexture,
    syncPaintUvChannel,
    restoreFaceAlbedoMapUvs,
    FACE_ALBEDO_MAP_KEY,
    FACE_NORMAL_MAP_KEY,
    FACE_SPECULAR_MAP_KEY,
    FACE_ROUGHNESS_MAP_KEY,
} from "./lab-face-draw.js";
import {
    applyArchMeshPlanarUvs,
    ARCH_SURFACE_TEXTURED_KEY,
} from "./lab-architecture.js";
import { createPrimitiveGeometry, isLabPrimitiveShape } from "./lab-primitives.js";
import { CUBE_SIZE } from "./grid-constants.js";

export const OBJECT_TEXTURE_KEY = "textureDataUrl";
export const OBJECT_NORMAL_TEXTURE_KEY = "normalTextureDataUrl";
export const OBJECT_SPECULAR_TEXTURE_KEY = "specularTextureDataUrl";
export const OBJECT_ROUGHNESS_TEXTURE_KEY = "roughnessTextureDataUrl";
export const OBJECT_NORMAL_SCALE_KEY = "normalScale";
export const OBJECT_TEXTURE_TILE_KEY = "textureTile";
export const OBJECT_TEXTURE_TILE_X_KEY = "textureTileX";
export const OBJECT_TEXTURE_TILE_Y_KEY = "textureTileY";
export const OBJECT_TEXTURE_TILE_Z_KEY = "textureTileZ";
export const OBJECT_TEXTURE_OFFSET_X_KEY = "textureOffsetX";
export const OBJECT_TEXTURE_OFFSET_Y_KEY = "textureOffsetY";
export const OBJECT_TEXTURE_OFFSET_Z_KEY = "textureOffsetZ";
const UV_BACKUP_KEY = "_labUvBackup";
const UV_XYZ_ACTIVE_KEY = "_labUvXyzActive";
export const OBJECT_ROUGHNESS_KEY = "roughness";
export const OBJECT_OPACITY_KEY = "opacity";
export const OBJECT_METALNESS_KEY = "metalness";
export const OBJECT_GLASS_KEY = "glass";
export const OBJECT_SMOOTH_KEY = "smoothShading";

export const DEFAULT_ROUGHNESS = 0.65;
export const DEFAULT_METALNESS = 0.05;
export const DEFAULT_OPACITY = 1;
export const DEFAULT_SMOOTH = true;
export const GLASS_PRESET_OPACITY = 0.2;
export const GLASS_PRESET_ROUGHNESS = 0.05;
export const GLASS_PRESET_METALNESS = 0;
export const DEFAULT_NORMAL_SCALE = 1;
export const DEFAULT_TEXTURE_TILE = 1;
export const DEFAULT_TEXTURE_OFFSET = 0;
export const ROUGHNESS_MIN = 0;
export const ROUGHNESS_MAX = 1;
export const ROUGHNESS_STEP = 0.05;
export const METALNESS_MIN = 0;
export const METALNESS_MAX = 1;
export const METALNESS_STEP = 0.05;
export const OPACITY_MIN = 0;
export const OPACITY_MAX = 1;
export const OPACITY_STEP = 0.05;
export const NORMAL_SCALE_MIN = 0;
export const NORMAL_SCALE_MAX = 3;
export const NORMAL_SCALE_STEP = 0.05;
export const TEXTURE_TILE_MIN = 0.1;
export const TEXTURE_TILE_MAX = 100;
export const TERRAIN_TEXTURE_TILE_MAX = 1000;
/** Tile pinceau terrain : plus bas = tuile plus grande (min 0,05 ≈ 1000 m). */
export const TERRAIN_PAINT_TEXTURE_TILE_MIN = 0.05;
export const TERRAIN_PAINT_TEXTURE_TILE_MAX = 1000;
export const TEXTURE_TILE_STEP = 0.25;
export const TEXTURE_OFFSET_MIN = -10;
export const TEXTURE_OFFSET_MAX = 10;
export const TEXTURE_OFFSET_STEP = 0.05;

const RUNTIME_TEXTURE_KEY = "_labTexture";
const RUNTIME_NORMAL_TEXTURE_KEY = "_labNormalTexture";
const RUNTIME_SPECULAR_TEXTURE_KEY = "_labSpecularTexture";
const RUNTIME_ROUGHNESS_TEXTURE_KEY = "_labRoughnessTexture";
const GLASS_RESTORE_KEY = "_glassRestore";

function isContentMesh(child) {
    const name = String(child.name || "");
    return (
        child instanceof THREE.Mesh &&
        child.name !== "shadow-overlay" &&
        !child.userData?.skipObjectPbr &&
        !child.userData?.labVegetationMesh &&
        !child.userData?.archOpeningFill &&
        !name.startsWith("arch-opening-")
    );
}

/**
 * Meshes dont on peut régler rugosité / métal / opacité / verre.
 * Inclut les imports (skipObjectPbr) : on préserve leurs textures, pas leurs scalaires.
 * @param {THREE.Object3D} child
 */
function isMaterialEditableMesh(child) {
    const name = String(child.name || "");
    return (
        child instanceof THREE.Mesh &&
        child.name !== "shadow-overlay" &&
        !child.userData?.labVegetationMesh &&
        !child.userData?.archOpeningFill &&
        !name.startsWith("arch-opening-") &&
        !child.userData?.archOpeningFill &&
        !name.startsWith("arch-opening-") &&
        !(typeof child.name === "string" && child.name.startsWith("lab-triangle-texture-overlay")) &&
        !(typeof child.name === "string" && child.name === "lab-triangle-selection-overlay") &&
        !(typeof child.name === "string" && child.name === "lab-face-selection-overlay") &&
        !(typeof child.name === "string" && child.name.startsWith("lab-mirror-face-"))
    );
}

/**
 * @param {THREE.Object3D} object
 * @param {(child: THREE.Mesh) => void} fn
 */
/**
 * Matériau texturé en mode Face — ne pas l’écraser par une map / un scalaire objet.
 * @param {THREE.Material | null | undefined} material
 */
function isFaceMappedMaterial(material) {
    const ud = material?.userData;
    if (!ud) return false;
    return !!(
        ud[FACE_ALBEDO_MAP_KEY] ||
        ud[FACE_NORMAL_MAP_KEY] ||
        ud[FACE_SPECULAR_MAP_KEY] ||
        ud[FACE_ROUGHNESS_MAP_KEY]
    );
}

function forEachAppearanceMesh(object, fn) {
    const fillRoot = !!object?.userData?.labArchOpeningFill;
    object?.traverse((child) => {
        if (fillRoot) {
            if (!(child instanceof THREE.Mesh) || child.name === "shadow-overlay") return;
            const mat = Array.isArray(child.material) ? child.material[0] : child.material;
            if (mat?.transparent && Number(mat.opacity) < 0.45) return;
            fn(child);
            return;
        }
        if (!isMaterialEditableMesh(child)) return;
        fn(child);
    });
}

/**
 * @param {THREE.Mesh} mesh
 * @returns {boolean}
 */
function hasPaintedFaceMaterials(mesh) {
    // 6 slots face (Standard ou Physical verre) — ne pas se baser sur instanceof seul
    // car un Physical verre doit rester multi-matériaux pour le métal poli.
    return Array.isArray(mesh.material) && mesh.material.length > 1;
}

/**
 * Vrai dessin sur faces (calque), pas seulement un tableau de 6 matériaux.
 * @param {THREE.Mesh} mesh
 */
function hasActiveFacePaint(mesh) {
    if (!Array.isArray(mesh.material)) return false;
    return mesh.material.some(
        (material) =>
            material?.userData?._labFacePaint || material?.userData?._labPaintShaderAttached
    );
}

/**
 * Repasse un mesh multi-matériaux (sans peinture) en matériau unique
 * pour pouvoir changer la géométrie (RoundedBox, etc.).
 * @param {THREE.Mesh} mesh
 */
function collapseToSingleMaterial(mesh) {
    if (!Array.isArray(mesh.material) || !mesh.material.length) return;
    const materials = mesh.material;
    const keep = materials[0].clone();
    materials.forEach((material) => material?.dispose?.());
    mesh.material = keep;
}

/**
 * @param {THREE.Mesh} mesh
 * @returns {THREE.MeshStandardMaterial}
 */
export function ensureObjectMaterial(mesh) {
    if (mesh.material instanceof THREE.MeshStandardMaterial) {
        return mesh.material;
    }

    // Objet avec dessin sur les faces (tableau de 6 matériaux) : on ne doit
    // JAMAIS l'écraser par un matériau unique, sous peine de perdre le dessin
    // et la texture/le carrelage en cours. On retourne le premier comme
    // référence de lecture ; utiliser ensureObjectMaterials() pour l'écriture.
    if (hasPaintedFaceMaterials(mesh)) {
        return mesh.material[0];
    }

    const prev = mesh.material;
    const color = prev?.color?.getHex?.() ?? 0x00d1ff;
    const map = prev?.map ?? null;

    mesh.material = new THREE.MeshStandardMaterial({
        color,
        map,
        roughness: DEFAULT_ROUGHNESS,
        metalness: DEFAULT_METALNESS,
        flatShading: false,
        envMapIntensity: 1.15,
    });
    prev?.dispose?.();
    return mesh.material;
}

/**
 * Comme ensureObjectMaterial(), mais retourne TOUS les matériaux à mettre à
 * jour (les 6 par face si l'objet a été peint, sinon le matériau unique).
 * À utiliser pour toute écriture de propriété PBR (roughness, metalness,
 * opacity, map, normalMap…) afin de ne pas perdre le dessin des faces.
 * @param {THREE.Mesh} mesh
 * @returns {THREE.MeshStandardMaterial[]}
 */
export function ensureObjectMaterials(mesh) {
    if (hasPaintedFaceMaterials(mesh)) {
        return mesh.material;
    }
    return [ensureObjectMaterial(mesh)];
}

/**
 * @param {string} dataUrl
 * @param {"srgb"|"linear"} colorSpace
 * @returns {Promise<THREE.Texture>}
 */
function loadTextureFromDataUrl(dataUrl, colorSpace = "srgb") {
    return new Promise((resolve, reject) => {
        const loader = new THREE.TextureLoader();
        loader.load(
            dataUrl,
            (texture) => {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                if (colorSpace === "srgb") {
                    if ("colorSpace" in texture) texture.colorSpace = THREE.SRGBColorSpace;
                    else texture.encoding = THREE.sRGBEncoding;
                } else if ("colorSpace" in texture) {
                    texture.colorSpace = THREE.NoColorSpace;
                } else {
                    texture.encoding = THREE.LinearEncoding;
                }
                texture.needsUpdate = true;
                resolve(texture);
            },
            undefined,
            (error) => reject(error ?? new Error("Impossible de charger l'image"))
        );
    });
}

/**
 * @param {THREE.Object3D} object
 */
export function getObjectTextureDataUrl(object) {
    return object?.userData?.[OBJECT_TEXTURE_KEY] || null;
}

/**
 * @param {THREE.Object3D} object
 */
export function getObjectNormalTextureDataUrl(object) {
    return object?.userData?.[OBJECT_NORMAL_TEXTURE_KEY] || null;
}

/**
 * @param {THREE.Texture | null | undefined} texture
 * @param {number} tileX
 * @param {number} tileY
 * @param {number} offsetX
 * @param {number} offsetY
 */
function applyUvTransformToTexture(texture, tileX, tileY, offsetX, offsetY) {
    if (!texture) return;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(tileX, tileY);
    texture.offset.set(offsetX, offsetY);
    // Three r132 : la matrice UV n’est pas toujours rafraîchie sans appel explicite.
    if (typeof texture.updateMatrix === "function") {
        texture.updateMatrix();
    }
    texture.needsUpdate = true;
}

/**
 * @param {THREE.Texture | null | undefined} texture
 * @param {number} tile
 */
function applyRepeatToTexture(texture, tile) {
    if (!texture) return;
    const objectTileX = tile;
    const objectTileY = tile;
    texture.repeat.set(objectTileX, objectTileY);
    texture.needsUpdate = true;
}

/**
 * @param {THREE.Object3D} object
 */
export function getObjectTextureTile(object) {
    const stored = object?.userData?.[OBJECT_TEXTURE_TILE_KEY];
    if (typeof stored === "number") return stored;
    return DEFAULT_TEXTURE_TILE;
}

/**
 * @param {THREE.Object3D} object
 */
export function getObjectTextureTileX(object) {
    const stored = object?.userData?.[OBJECT_TEXTURE_TILE_X_KEY];
    if (typeof stored === "number") return stored;
    return getObjectTextureTile(object);
}

/**
 * @param {THREE.Object3D} object
 */
export function getObjectTextureTileY(object) {
    const stored = object?.userData?.[OBJECT_TEXTURE_TILE_Y_KEY];
    if (typeof stored === "number") return stored;
    return getObjectTextureTile(object);
}

/**
 * @param {THREE.Object3D} object
 */
export function getObjectTextureTileZ(object) {
    const stored = object?.userData?.[OBJECT_TEXTURE_TILE_Z_KEY];
    if (typeof stored === "number") return stored;
    return DEFAULT_TEXTURE_TILE;
}

/**
 * @param {THREE.Object3D} object
 */
export function getObjectTextureOffsetX(object) {
    const stored = object?.userData?.[OBJECT_TEXTURE_OFFSET_X_KEY];
    return typeof stored === "number" ? stored : DEFAULT_TEXTURE_OFFSET;
}

/**
 * @param {THREE.Object3D} object
 */
export function getObjectTextureOffsetY(object) {
    const stored = object?.userData?.[OBJECT_TEXTURE_OFFSET_Y_KEY];
    return typeof stored === "number" ? stored : DEFAULT_TEXTURE_OFFSET;
}

/**
 * @param {THREE.Object3D} object
 */
export function getObjectTextureOffsetZ(object) {
    const stored = object?.userData?.[OBJECT_TEXTURE_OFFSET_Z_KEY];
    return typeof stored === "number" ? stored : DEFAULT_TEXTURE_OFFSET;
}

function wantsBoxUvXyz(object) {
    const tileZ = getObjectTextureTileZ(object);
    const offsetZ = getObjectTextureOffsetZ(object);
    return Math.abs(tileZ - 1) > 1e-4 || Math.abs(offsetZ) > 1e-4;
}

/**
 * Sauvegarde les UV d’origine d’un mesh (une seule fois).
 * @param {THREE.Mesh} mesh
 */
function backupMeshUv(mesh) {
    const geo = mesh.geometry;
    if (!geo?.attributes?.position) return;
    if (!geo.attributes.uv) ensureGeometryPlanarUv(geo);
    if (mesh.userData[UV_BACKUP_KEY]) return;
    const uv = geo.attributes.uv;
    mesh.userData[UV_BACKUP_KEY] = {
        array: Float32Array.from(uv.array),
        itemSize: uv.itemSize,
        count: uv.count,
    };
}

/**
 * Restaure les UV d’origine si une projection XYZ avait été appliquée.
 * @param {THREE.Mesh} mesh
 */
function restoreMeshUvBackup(mesh) {
    const backup = mesh.userData[UV_BACKUP_KEY];
    const geo = mesh.geometry;
    if (!backup || !geo) return;
    let uv = geo.attributes.uv;
    if (!uv || uv.count !== backup.count) {
        uv = new THREE.BufferAttribute(new Float32Array(backup.array), backup.itemSize);
        geo.setAttribute("uv", uv);
    } else {
        uv.array.set(backup.array);
        uv.needsUpdate = true;
    }
    delete mesh.userData[UV_XYZ_ACTIVE_KEY];
}

/**
 * Copie uv → uv2 une fois, pour que la peinture reste en 0–1 face
 * même si uv est réécrit en projection XYZ.
 * @param {THREE.Mesh} mesh
 */
function ensurePaintUv2Channel(mesh) {
    const geo = mesh.geometry;
    if (!geo?.attributes?.uv) return;
    if (geo.attributes.uv2) return;
    geo.setAttribute("uv2", geo.attributes.uv.clone());
}

/**
 * Projection boîte locale → UV (axes XYZ → U/V selon la normale dominante).
 * U/V = coordonnée normalisée 0–1 sur la boîte × tile + offset (comme texture.repeat).
 * @param {THREE.Mesh} mesh
 * @param {number} tileX
 * @param {number} tileY
 * @param {number} tileZ
 * @param {number} offsetX
 * @param {number} offsetY
 * @param {number} offsetZ
 */
function applyBoxUvXyzToMesh(mesh, tileX, tileY, tileZ, offsetX, offsetY, offsetZ) {
    const geo = mesh.geometry;
    if (!geo?.attributes?.position) return;
    ensurePaintUv2Channel(mesh);
    backupMeshUv(mesh);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    let uv = geo.attributes.uv;
    if (!uv || uv.count !== pos.count) {
        uv = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
        geo.setAttribute("uv", uv);
    }

    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const dx = Math.max(1e-6, bb.max.x - bb.min.x);
    const dy = Math.max(1e-6, bb.max.y - bb.min.y);
    const dz = Math.max(1e-6, bb.max.z - bb.min.z);

    for (let i = 0; i < pos.count; i++) {
        const nx01 = (pos.getX(i) - bb.min.x) / dx;
        const ny01 = (pos.getY(i) - bb.min.y) / dy;
        const nz01 = (pos.getZ(i) - bb.min.z) / dz;
        const anx = Math.abs(nor.getX(i));
        const any = Math.abs(nor.getY(i));
        const anz = Math.abs(nor.getZ(i));
        let u;
        let v;
        if (anx >= any && anx >= anz) {
            // Face ±X : plan ZY — Tile Z sur U, Tile Y sur V
            u = nz01 * tileZ + offsetZ;
            v = ny01 * tileY + offsetY;
        } else if (any >= anx && any >= anz) {
            // Face ±Y : plan XZ — Tile X sur U, Tile Z sur V
            u = nx01 * tileX + offsetX;
            v = nz01 * tileZ + offsetZ;
        } else {
            // Face ±Z : plan XY — Tile X / Tile Y
            u = nx01 * tileX + offsetX;
            v = ny01 * tileY + offsetY;
        }
        uv.setXY(i, u, v);
    }
    uv.needsUpdate = true;
    mesh.userData[UV_XYZ_ACTIVE_KEY] = true;
}

/**
 * @param {THREE.Object3D} object
 */
export function syncObjectUvTransforms(object) {
    const tileX = getObjectTextureTileX(object);
    const tileY = getObjectTextureTileY(object);
    const tileZ = getObjectTextureTileZ(object);
    const offsetX = getObjectTextureOffsetX(object);
    const offsetY = getObjectTextureOffsetY(object);
    const offsetZ = getObjectTextureOffsetZ(object);
    const useXyz = wantsBoxUvXyz(object);

    object.traverse((child) => {
        if (!isContentMesh(child)) return;
        if (child.geometry && !child.geometry.attributes?.uv) {
            ensureGeometryPlanarUv(child.geometry);
        }
        // Mur Architecture texturé en mode Face : UV planaires en mètres
        // (tous les panneaux autour d’une porte). Ne pas appliquer XYZ / UV 0–1.
        const archSurface = child.userData?.[ARCH_SURFACE_TEXTURED_KEY];
        if (typeof archSurface === "string" && archSurface) {
            applyArchMeshPlanarUvs(child, archSurface);
            return;
        }
        if (useXyz) {
            applyBoxUvXyzToMesh(child, tileX, tileY, tileZ, offsetX, offsetY, offsetZ);
        } else if (child.userData[UV_XYZ_ACTIVE_KEY]) {
            restoreMeshUvBackup(child);
        }
        // La peinture doit rester sur son propre canal UV, sans suivre le tile.
        syncPaintUvChannel(child);
        // Les faces texturées en mode Face gardent des UV 0–1 (sinon la
        // normale objet réécrit les UV planaires et l’albedo Face disparaît
        // visuellement — on ne voit plus que la normal map).
        restoreFaceAlbedoMapUvs(child);
    });

    // En mode XYZ les tuiles sont déjà dans les UV → repeat/offset texture = identité.
    const texTileX = useXyz ? 1 : tileX;
    const texTileY = useXyz ? 1 : tileY;
    const texOffX = useXyz ? 0 : offsetX;
    const texOffY = useXyz ? 0 : offsetY;

    const runtimeColor = object.userData[RUNTIME_TEXTURE_KEY];
    const runtimeNormal = object.userData[RUNTIME_NORMAL_TEXTURE_KEY];
    const runtimeSpecular = object.userData[RUNTIME_SPECULAR_TEXTURE_KEY];
    const runtimeRoughness = object.userData[RUNTIME_ROUGHNESS_TEXTURE_KEY];
    applyUvTransformToTexture(runtimeColor, texTileX, texTileY, texOffX, texOffY);
    applyUvTransformToTexture(runtimeNormal, texTileX, texTileY, texOffX, texOffY);
    applyUvTransformToTexture(runtimeSpecular, texTileX, texTileY, texOffX, texOffY);
    applyUvTransformToTexture(runtimeRoughness, texTileX, texTileY, texOffX, texOffY);

    object.traverse((child) => {
        if (!isContentMesh(child)) return;
        // Tile Face Architecture géré à part (textures partagées de surface).
        if (typeof child.userData?.[ARCH_SURFACE_TEXTURED_KEY] === "string") return;
        ensureObjectMaterials(child).forEach((material) => {
            if (
                material.map &&
                material.map !== runtimeColor &&
                !material.userData?._labFacePaint_placeholderMap &&
                !material.userData?._labFaceAlbedoMap
            ) {
                applyUvTransformToTexture(material.map, texTileX, texTileY, texOffX, texOffY);
            }
            if (
                material.normalMap &&
                material.normalMap !== runtimeNormal &&
                !material.userData?._labFaceNormalMap
            ) {
                applyUvTransformToTexture(material.normalMap, texTileX, texTileY, texOffX, texOffY);
            }
            if (
                material.metalnessMap &&
                material.metalnessMap !== runtimeSpecular &&
                !material.userData?._labFaceSpecularMap
            ) {
                applyUvTransformToTexture(material.metalnessMap, texTileX, texTileY, texOffX, texOffY);
            }
            if (
                material.roughnessMap &&
                material.roughnessMap !== runtimeRoughness &&
                !material.userData?._labFaceRoughnessMap
            ) {
                applyUvTransformToTexture(material.roughnessMap, texTileX, texTileY, texOffX, texOffY);
            }
        });
    });
}

/**
 * @param {THREE.Object3D} object
 * @param {number} tile
 */
export function applyObjectTextureTile(object, tile) {
    const value = THREE.MathUtils.clamp(tile, TEXTURE_TILE_MIN, TEXTURE_TILE_MAX);
    object.userData[OBJECT_TEXTURE_TILE_KEY] = value;
    object.userData[OBJECT_TEXTURE_TILE_X_KEY] = value;
    object.userData[OBJECT_TEXTURE_TILE_Y_KEY] = value;
    object.userData[OBJECT_TEXTURE_TILE_Z_KEY] = value;
    syncObjectUvTransforms(object);
}

/**
 * @param {THREE.Object3D} object
 * @param {{ tileX?: number, tileY?: number, tileZ?: number, offsetX?: number, offsetY?: number, offsetZ?: number }} transform
 */
export function applyObjectTextureTransform(object, transform) {
    if (typeof transform.tileX === "number") {
        const tileX = THREE.MathUtils.clamp(transform.tileX, TEXTURE_TILE_MIN, TEXTURE_TILE_MAX);
        object.userData[OBJECT_TEXTURE_TILE_X_KEY] = tileX;
        object.userData[OBJECT_TEXTURE_TILE_KEY] = tileX;
    }
    if (typeof transform.tileY === "number") {
        const tileY = THREE.MathUtils.clamp(transform.tileY, TEXTURE_TILE_MIN, TEXTURE_TILE_MAX);
        object.userData[OBJECT_TEXTURE_TILE_Y_KEY] = tileY;
    }
    if (typeof transform.tileZ === "number") {
        const tileZ = THREE.MathUtils.clamp(transform.tileZ, TEXTURE_TILE_MIN, TEXTURE_TILE_MAX);
        object.userData[OBJECT_TEXTURE_TILE_Z_KEY] = tileZ;
    }
    if (typeof transform.offsetX === "number") {
        object.userData[OBJECT_TEXTURE_OFFSET_X_KEY] = THREE.MathUtils.clamp(
            transform.offsetX,
            TEXTURE_OFFSET_MIN,
            TEXTURE_OFFSET_MAX
        );
    }
    if (typeof transform.offsetY === "number") {
        object.userData[OBJECT_TEXTURE_OFFSET_Y_KEY] = THREE.MathUtils.clamp(
            transform.offsetY,
            TEXTURE_OFFSET_MIN,
            TEXTURE_OFFSET_MAX
        );
    }
    if (typeof transform.offsetZ === "number") {
        object.userData[OBJECT_TEXTURE_OFFSET_Z_KEY] = THREE.MathUtils.clamp(
            transform.offsetZ,
            TEXTURE_OFFSET_MIN,
            TEXTURE_OFFSET_MAX
        );
    }
    syncObjectUvTransforms(object);
}

/**
 * @param {THREE.MeshStandardMaterial} material
 * @param {number} opacity
 */
function syncMaterialOpacity(material, opacity) {
    if (isFaceMappedMaterial(material)) return;
    const value = THREE.MathUtils.clamp(opacity, OPACITY_MIN, OPACITY_MAX);
    const glass = !!material.userData?._labGlass;
    if (glass && material.isMeshPhysicalMaterial) {
        material.transmission = THREE.MathUtils.clamp(1 - value * 0.92, 0.08, 1);
        material.transparent = true;
        material.opacity = 1;
        material.depthWrite = false;
        material.needsUpdate = true;
        return;
    }
    const translucent = value < 0.995 || glass;
    material.opacity = value;
    material.transparent = translucent;
    material.depthWrite = !translucent;
    if (!translucent) material.side = THREE.FrontSide;
    material.needsUpdate = true;
}

/**
 * Verre objet : MeshPhysicalMaterial + transmission quand possible.
 * @param {THREE.Material} material
 * @param {boolean} enabled
 * @returns {THREE.Material}
 */
function polishObjectGlassMaterial(material, enabled) {
    if (!material) return material;

    if (!enabled) {
        const backup = material.userData?._labPreGlassMaterial;
        if (backup && backup.isMaterial) {
            delete material.userData._labGlass;
            try {
                material.dispose?.();
            } catch {
                /* ignore */
            }
            return backup;
        }
        delete material.userData._labGlass;
        if (typeof material.transmission === "number") material.transmission = 0;
        if ("_labGlassMapSaved" in (material.userData || {})) {
            material.map = material.userData._labGlassMapSaved || null;
            delete material.userData._labGlassMapSaved;
        }
        if (typeof material.userData?._labGlassTintSaved === "number" && material.color) {
            material.color.setHex(material.userData._labGlassTintSaved);
            delete material.userData._labGlassTintSaved;
        }
        material.transparent = false;
        material.opacity = 1;
        material.depthWrite = true;
        material.needsUpdate = true;
        return material;
    }

    if (material.isMeshPhysicalMaterial && material.userData?._labGlass) {
        material.transparent = true;
        material.opacity = 1;
        material.depthWrite = false;
        material.needsUpdate = true;
        return material;
    }

    const color = material.color?.clone?.() || new THREE.Color(0xffffff);
    color.lerp(new THREE.Color(0xffffff), 0.55);
    const phys = new THREE.MeshPhysicalMaterial({
        color,
        map: null,
        normalMap: material.normalMap || null,
        roughness: GLASS_PRESET_ROUGHNESS,
        metalness: GLASS_PRESET_METALNESS,
        transmission: THREE.MathUtils.clamp(1 - GLASS_PRESET_OPACITY * 0.92, 0.08, 1),
        thickness: 0.45,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        side: THREE.FrontSide,
        envMapIntensity: 1,
    });
    phys.userData = {
        ...(material.userData || {}),
        _labGlass: true,
        _labPreGlassMaterial: material,
        _labGlassMapSaved: material.map || null,
    };
    return phys;
}

/**
 * @param {THREE.Mesh} mesh
 * @param {number} opacity
 */
function syncMeshOpacity(mesh, opacity) {
    ensureObjectMaterials(mesh).forEach((material) => syncMaterialOpacity(material, opacity));
    mesh.renderOrder = opacity < 0.995 ? 2 : 0;
}

/**
 * @param {THREE.Object3D} object
 */
export function getObjectOpacity(object) {
    const stored = object?.userData?.[OBJECT_OPACITY_KEY];
    if (typeof stored === "number") return stored;

    let opacity = DEFAULT_OPACITY;
    object?.traverse((child) => {
        if (!isMaterialEditableMesh(child)) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
            if (mat && typeof mat.opacity === "number") {
                opacity = mat.opacity;
                break;
            }
        }
    });
    return opacity;
}

/**
 * @param {THREE.Object3D} object
 * @param {number} opacity
 */
export function applyObjectOpacity(object, opacity) {
    const value = THREE.MathUtils.clamp(opacity, OPACITY_MIN, OPACITY_MAX);
    object.userData[OBJECT_OPACITY_KEY] = value;
    forEachAppearanceMesh(object, (child) => {
        syncMeshOpacity(child, value);
    });
}

/**
 * @param {THREE.Object3D} object
 */
export function isObjectGlassEnabled(object) {
    return !!object?.userData?.[OBJECT_GLASS_KEY];
}

/**
 * @param {THREE.Object3D} object
 * @returns {{ opacity: number, roughness: number, metalness: number } | null}
 */
export function getObjectGlassRestore(object) {
    const restore = object?.userData?.[GLASS_RESTORE_KEY];
    if (!restore || typeof restore !== "object") return null;
    return {
        opacity: typeof restore.opacity === "number" ? restore.opacity : DEFAULT_OPACITY,
        roughness: typeof restore.roughness === "number" ? restore.roughness : DEFAULT_ROUGHNESS,
        metalness: typeof restore.metalness === "number" ? restore.metalness : DEFAULT_METALNESS,
    };
}

/**
 * @param {THREE.Object3D} object
 * @param {boolean} enabled
 */
export function applyObjectGlass(object, enabled) {
    if (enabled) {
        const already = !!object.userData[OBJECT_GLASS_KEY];
        if (!already) {
            object.userData[GLASS_RESTORE_KEY] = {
                opacity: getObjectOpacity(object),
                roughness: getObjectRoughness(object),
                metalness: getObjectMetalness(object),
            };
        }
        object.userData[OBJECT_GLASS_KEY] = true;
        object.traverse((child) => {
            if (!isMaterialEditableMesh(child)) return;
            const mats = ensureObjectMaterials(child);
            const next = mats.map((material) =>
                isFaceMappedMaterial(material)
                    ? material
                    : polishObjectGlassMaterial(material, true)
            );
            child.material = Array.isArray(child.material) ? next : next[0];
            child.renderOrder = 2;
        });
        if (!already) {
            object.userData[OBJECT_OPACITY_KEY] = GLASS_PRESET_OPACITY;
            object.userData[OBJECT_ROUGHNESS_KEY] = GLASS_PRESET_ROUGHNESS;
            object.userData[OBJECT_METALNESS_KEY] = GLASS_PRESET_METALNESS;
        }
        return;
    }

    object.userData[OBJECT_GLASS_KEY] = false;
    object.traverse((child) => {
        if (!isMaterialEditableMesh(child)) return;
        const mats = ensureObjectMaterials(child);
        const next = mats.map((material) =>
            isFaceMappedMaterial(material)
                ? material
                : polishObjectGlassMaterial(material, false)
        );
        child.material = Array.isArray(child.material) ? next : next[0];
        child.renderOrder = 0;
    });
    const restore = getObjectGlassRestore(object);
    if (restore) {
        applyObjectOpacity(object, restore.opacity);
        applyObjectRoughness(object, restore.roughness);
        applyObjectMetalness(object, restore.metalness);
        delete object.userData[GLASS_RESTORE_KEY];
        return;
    }

    applyObjectOpacity(object, DEFAULT_OPACITY);
}

/**
 * Quitte le mode verre objet ET retire tout Physical/transmission résiduel
 * (y compris verre appliqué face par face — le flag objet peut être faux).
 * Restaure l’opacité (sinon le preset verre 0.35 reste collé).
 * @param {THREE.Object3D} object
 */
export function clearObjectGlassOnManualEdit(object) {
    if (!object) return;
    const hadObjectGlass = isObjectGlassEnabled(object);
    const restore = getObjectGlassRestore(object);
    object.userData[OBJECT_GLASS_KEY] = false;
    delete object.userData[GLASS_RESTORE_KEY];

    object.traverse((child) => {
        if (!isMaterialEditableMesh(child)) return;
        const list = Array.isArray(child.material)
            ? child.material.slice()
            : child.material
              ? [child.material]
              : [];
        if (!list.length) return;
        let changed = false;
        for (let i = 0; i < list.length; i += 1) {
            const material = list[i];
            if (!material) continue;
            const glassy =
                !!material.userData?._labGlass ||
                (material.isMeshPhysicalMaterial &&
                    typeof material.transmission === "number" &&
                    material.transmission > 0.02);
            if (!glassy && !(material.transparent && material.opacity < 0.98)) continue;
            const next = polishObjectGlassMaterial(material, false);
            if (next !== material) {
                list[i] = next;
                changed = true;
            } else {
                material.opacity = 1;
                material.transparent = false;
                material.depthWrite = true;
                if (typeof material.transmission === "number") material.transmission = 0;
                material.needsUpdate = true;
            }
        }
        if (changed) {
            child.material = Array.isArray(child.material) ? list : list[0];
        }
        child.renderOrder = 0;
    });

    if (hadObjectGlass && restore && typeof restore.opacity === "number") {
        applyObjectOpacity(object, restore.opacity);
    } else if (hadObjectGlass) {
        applyObjectOpacity(object, DEFAULT_OPACITY);
    }
}

/** @deprecated Utiliser applyObjectGlass(object, true) */
export function applyObjectGlassPreset(object) {
    applyObjectGlass(object, true);
}

/**
 * @param {THREE.Object3D} object
 */
export function getObjectMetalness(object) {
    const stored = object?.userData?.[OBJECT_METALNESS_KEY];
    if (typeof stored === "number") return stored;

    let metalness = DEFAULT_METALNESS;
    object?.traverse((child) => {
        if (!isMaterialEditableMesh(child)) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
            if (mat && typeof mat.metalness === "number") {
                metalness = mat.metalness;
                break;
            }
        }
    });
    return metalness;
}

/**
 * @param {THREE.Object3D} object
 * @param {number} metalness
 */
export function applyObjectMetalness(object, metalness) {
    const value = THREE.MathUtils.clamp(metalness, METALNESS_MIN, METALNESS_MAX);
    object.userData[OBJECT_METALNESS_KEY] = value;
    // Mode verre objet actif : ne pas démolir le Physical (restauration / course async).
    if (isObjectGlassEnabled(object)) return;
    object.traverse((child) => {
        if (object?.userData?.labArchOpeningFill) {
            if (!(child instanceof THREE.Mesh) || child.name === "shadow-overlay") return;
        } else if (!isMaterialEditableMesh(child)) return;
        const mats = ensureObjectMaterials(child);
        const next = mats.map((material) => {
            let mat = material;
            // Verre face : conserver le Physical (métal poli UI passe par clearObjectGlass).
            if (
                mat?.userData?._labGlass ||
                (mat?.isMeshPhysicalMaterial &&
                    typeof mat.transmission === "number" &&
                    mat.transmission > 0.02)
            ) {
                return mat;
            }
            if (isFaceMappedMaterial(mat)) return mat;
            mat.metalness = value;
            if (mat.metalnessMap) {
                mat.metalnessMap = null;
            }
            mat.transparent = false;
            mat.opacity = 1;
            mat.depthWrite = true;
            if (typeof mat.transmission === "number") mat.transmission = 0;
            if (!mat.userData?.labSkyboxEnvMap) {
                mat.envMapIntensity = 0.95 + value * 1.05;
            }
            mat.needsUpdate = true;
            return mat;
        });
        child.material = Array.isArray(child.material) ? next : next[0];
        child.renderOrder = 0;
    });
}

/**
 * CSG / meshes non indexés : chaque triangle a ses propres sommets, donc
 * computeVertexNormals() ne peut pas interpoler. On soude d’abord sur la
 * position seule, puis on recalcule les normales.
 * @param {THREE.BufferGeometry} geometry
 * @param {number} [tolerance]
 * @param {{ creaseAngle?: number }} [opts]
 * @returns {THREE.BufferGeometry}
 */
export function weldGeometryForSmoothNormals(geometry, tolerance = 1e-4, opts = {}) {
    const positions = geometry?.attributes?.position;
    if (!positions) return geometry;

    const clean = new THREE.BufferGeometry();
    clean.setAttribute("position", positions.clone());
    // Conserver les UV : sans elles, tile/offset texture ne peut rien faire
    // sur les objets lissés (RoundedBox, cylindre, torus, CSG…).
    if (geometry.attributes.uv) {
        clean.setAttribute("uv", geometry.attributes.uv.clone());
    }
    if (geometry.attributes.uv1) {
        clean.setAttribute("uv1", geometry.attributes.uv1.clone());
    }
    if (geometry.index) {
        clean.setIndex(geometry.index.clone());
    }

    const welded = mergeVertices(clean, tolerance);
    clean.dispose();
    const crease =
        typeof opts.creaseAngle === "number" ? opts.creaseAngle : (48 * Math.PI) / 180;
    computeCreasedNormals(welded, crease);
    if (!welded.attributes.uv) {
        ensureGeometryPlanarUv(welded);
    }
    welded.computeBoundingBox();
    welded.computeBoundingSphere();
    return welded;
}

/**
 * UV planaires de secours (XZ) si la géométrie n'en a plus.
 * @param {THREE.BufferGeometry} geometry
 */
function ensureGeometryPlanarUv(geometry) {
    const pos = geometry.attributes?.position;
    if (!pos) return;
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox;
    if (!bbox) return;
    const sizeX = Math.max(1e-6, bbox.max.x - bbox.min.x);
    const sizeZ = Math.max(1e-6, bbox.max.z - bbox.min.z);
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i += 1) {
        uv[i * 2] = (pos.getX(i) - bbox.min.x) / sizeX;
        uv[i * 2 + 1] = (pos.getZ(i) - bbox.min.z) / sizeZ;
    }
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

/**
 * Normales avec seuil de pli : faces plates nettes, courbes interpolées.
 * Produit une géométrie non indexée (normale propre par coin de triangle).
 * @param {THREE.BufferGeometry} geometry
 * @param {number} [creaseAngle] radians
 */
export function computeCreasedNormals(geometry, creaseAngle = (48 * Math.PI) / 180) {
    const pos = geometry.attributes.position;
    if (!pos) return;

    /** @type {number[]} */
    let index;
    if (geometry.index) {
        index = Array.from(geometry.index.array);
    } else {
        index = [];
        for (let i = 0; i < pos.count; i += 1) index.push(i);
    }

    const triCount = Math.floor(index.length / 3);
    if (triCount <= 0) return;

    const faceNormals = new Array(triCount);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();

    for (let t = 0; t < triCount; t += 1) {
        a.fromBufferAttribute(pos, index[t * 3]);
        b.fromBufferAttribute(pos, index[t * 3 + 1]);
        c.fromBufferAttribute(pos, index[t * 3 + 2]);
        ab.subVectors(b, a);
        ac.subVectors(c, a);
        const n = new THREE.Vector3().crossVectors(ab, ac);
        if (n.lengthSq() > 1e-20) n.normalize();
        faceNormals[t] = n;
    }

    /** @type {number[][]} */
    const vertexFaces = Array.from({ length: pos.count }, () => []);
    for (let t = 0; t < triCount; t += 1) {
        vertexFaces[index[t * 3]].push(t);
        vertexFaces[index[t * 3 + 1]].push(t);
        vertexFaces[index[t * 3 + 2]].push(t);
    }

    const cosCrease = Math.cos(creaseAngle);
    const cornerNormals = new Float32Array(triCount * 9);
    const newPos = new Float32Array(triCount * 9);
    const uvAttr = geometry.attributes.uv;
    const uv1Attr = geometry.attributes.uv1;
    const newUv = uvAttr ? new Float32Array(triCount * 6) : null;
    const newUv1 = uv1Attr ? new Float32Array(triCount * 6) : null;
    const acc = new THREE.Vector3();

    for (let t = 0; t < triCount; t += 1) {
        const fn = faceNormals[t];
        for (let k = 0; k < 3; k += 1) {
            const v = index[t * 3 + k];
            acc.set(0, 0, 0);
            for (const fi of vertexFaces[v]) {
                if (fn.dot(faceNormals[fi]) >= cosCrease) {
                    acc.add(faceNormals[fi]);
                }
            }
            if (acc.lengthSq() < 1e-20) acc.copy(fn);
            else acc.normalize();

            const corner = t * 3 + k;
            const o = corner * 3;
            cornerNormals[o] = acc.x;
            cornerNormals[o + 1] = acc.y;
            cornerNormals[o + 2] = acc.z;
            newPos[o] = pos.getX(v);
            newPos[o + 1] = pos.getY(v);
            newPos[o + 2] = pos.getZ(v);
            if (newUv && uvAttr) {
                const uo = corner * 2;
                newUv[uo] = uvAttr.getX(v);
                newUv[uo + 1] = uvAttr.getY(v);
            }
            if (newUv1 && uv1Attr) {
                const uo = corner * 2;
                newUv1[uo] = uv1Attr.getX(v);
                newUv1[uo + 1] = uv1Attr.getY(v);
            }
        }
    }

    geometry.setIndex(null);
    geometry.setAttribute("position", new THREE.BufferAttribute(newPos, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(cornerNormals, 3));
    if (newUv) {
        geometry.setAttribute("uv", new THREE.BufferAttribute(newUv, 2));
    } else {
        geometry.deleteAttribute("uv");
    }
    if (newUv1) {
        geometry.setAttribute("uv1", new THREE.BufferAttribute(newUv1, 2));
    } else {
        geometry.deleteAttribute("uv1");
    }
}

/**
 * @param {THREE.Mesh} mesh
 * @param {THREE.BufferGeometry} newGeo
 * @param {THREE.BufferGeometry | null | undefined} oldGeo
 */
function replaceMeshGeometry(mesh, newGeo, oldGeo) {
    // Ancien overlay ShadowMaterial : ne plus synchroniser (ombres natives).
    if (mesh.userData?.shadowOverlay) {
        const overlay = mesh.userData.shadowOverlay;
        overlay.geometry = null;
        overlay.material?.dispose?.();
        mesh.remove(overlay);
        delete mesh.userData.shadowOverlay;
    }
    mesh.geometry = newGeo;
    if (oldGeo && oldGeo !== newGeo) {
        oldGeo.dispose();
    }
}

/**
 * @param {THREE.Object3D} object
 * @returns {boolean}
 */
export function getObjectSmooth(object) {
    const stored = object?.userData?.[OBJECT_SMOOTH_KEY];
    if (typeof stored === "boolean") return stored;
    return DEFAULT_SMOOTH;
}

/**
 * @param {THREE.Object3D} object
 * @returns {"box" | "sphere" | "generic"}
 */
function resolveLabShape(object) {
    if (
        object?.userData?.labStair ||
        object?.userData?.labLanding ||
        object?.userData?.labTube ||
        object?.userData?.labArchitecture
    ) {
        return "generic";
    }

    const shape = object?.userData?.labShape;
    if (isLabPrimitiveShape(shape)) return shape;

    /** @type {THREE.Mesh | null} */
    let mesh = null;
    object?.traverse((child) => {
        if (mesh || !isContentMesh(child)) return;
        mesh = child;
    });
    const geo = mesh?.geometry;
    if (!geo) return "generic";
    if (geo.type === "SphereGeometry" || geo instanceof THREE.SphereGeometry) return "sphere";
    if (geo.type === "CylinderGeometry" || geo instanceof THREE.CylinderGeometry) return "cylinder";
    if (geo.type === "ConeGeometry" || geo instanceof THREE.ConeGeometry) return "pyramid";
    if (geo.type === "TorusGeometry" || geo instanceof THREE.TorusGeometry) return "torus";
    if (
        geo.type === "BoxGeometry" ||
        geo.type === "RoundedBoxGeometry" ||
        geo instanceof THREE.BoxGeometry
    ) {
        return "box";
    }
    return "generic";
}

/**
 * Lissage visible :
 * - cube → arêtes arrondies (RoundedBox) vs angles droits
 * - sphère → haute densité vs facettes bas-poly
 * @param {THREE.Object3D} object
 * @param {boolean} smooth
 */
export function applyObjectSmooth(object, smooth) {
    const enabled = !!smooth;
    object.userData[OBJECT_SMOOTH_KEY] = enabled;

    // Escalier / palier / tube / pièce Architecture : ne jamais remplacer la géométrie
    // (sinon chaque panneau de mur devient un RoundedBox CUBE_SIZE — « cubes blancs »).
    if (
        object?.userData?.labStair ||
        object?.userData?.labLanding ||
        object?.userData?.labTube ||
        object?.userData?.labArchitecture
    ) {
        object.traverse((child) => {
            if (!isContentMesh(child)) return;
            ensureObjectMaterials(child).forEach((material) => {
                material.flatShading = !enabled;
                material.needsUpdate = true;
            });
        });
        return;
    }

    const isCsg = !!object.userData?.labCsg;
    const shape = isCsg ? "generic" : resolveLabShape(object);

    object.traverse((child) => {
        if (!isContentMesh(child)) return;

        // Dessin actif sur les faces : on ne remplace pas la géométrie boîte.
        if (hasActiveFacePaint(child) || child.userData?._labFacePaintPrepared) {
            ensureObjectMaterials(child).forEach((material) => {
                material.flatShading = !enabled;
                material.needsUpdate = true;
            });
            return;
        }

        if (hasPaintedFaceMaterials(child)) {
            collapseToSingleMaterial(child);
        }

        const oldGeo = child.geometry;
        /** @type {THREE.BufferGeometry | null} */
        let newGeo = null;

        if (shape === "sphere") {
            newGeo = createPrimitiveGeometry("sphere", enabled);
        } else if (shape === "box") {
            if (enabled) {
                const rounded = new RoundedBoxGeometry(
                    CUBE_SIZE,
                    CUBE_SIZE,
                    CUBE_SIZE,
                    5,
                    CUBE_SIZE * 0.22
                );
                newGeo = weldGeometryForSmoothNormals(rounded);
                if (newGeo !== rounded) {
                    rounded.dispose();
                }
            } else {
                newGeo = createPrimitiveGeometry("box", false);
            }
        } else if (
            shape === "cylinder" ||
            shape === "cone" ||
            shape === "torus" ||
            shape === "pyramid" ||
            shape === "panel"
        ) {
            newGeo = createPrimitiveGeometry(shape, enabled);
            if (enabled && (shape === "cylinder" || shape === "cone" || shape === "torus")) {
                const welded = weldGeometryForSmoothNormals(newGeo);
                if (welded !== newGeo) {
                    newGeo.dispose();
                    newGeo = welded;
                }
            }
        }

        if (newGeo) {
            replaceMeshGeometry(child, newGeo, oldGeo);
        } else if (child.geometry) {
            // Shell épaissi : normales face déjà lisses + flancs à part.
            // Ne pas ressouder (sinon face/flanc fusionnent → rayures au lissage).
            if (enabled && child.userData?._labSolidified) {
                if (child.geometry.attributes?.normal) {
                    child.geometry.attributes.normal.needsUpdate = true;
                }
            } else if (enabled) {
                // Mesh générique / CSG : souder les sommets pour interpoler les normales
                const welded = weldGeometryForSmoothNormals(child.geometry);
                replaceMeshGeometry(child, welded, child.geometry);
            }
            if (child.geometry.attributes?.normal) {
                child.geometry.attributes.normal.needsUpdate = true;
            }
        }

        ensureObjectMaterials(child).forEach((material) => {
            material.flatShading = !enabled;
            material.needsUpdate = true;
        });
    });

    // Après remplacement de géométrie, resynchroniser tile/offset sur les maps
    syncObjectUvTransforms(object);
}

/**
 * @param {THREE.Object3D} object
 */
export function getObjectRoughness(object) {
    const stored = object?.userData?.[OBJECT_ROUGHNESS_KEY];
    if (typeof stored === "number") return stored;

    let roughness = DEFAULT_ROUGHNESS;
    object?.traverse((child) => {
        if (!isMaterialEditableMesh(child)) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
            if (mat && typeof mat.roughness === "number") {
                roughness = mat.roughness;
                break;
            }
        }
    });
    return roughness;
}

/**
 * @param {THREE.Object3D} object
 */
export function getObjectNormalScale(object) {
    const stored = object?.userData?.[OBJECT_NORMAL_SCALE_KEY];
    if (typeof stored === "number") return stored;

    let scale = DEFAULT_NORMAL_SCALE;
    object?.traverse((child) => {
        if (!isContentMesh(child)) return;
        if (child.material instanceof THREE.MeshStandardMaterial) {
            scale = child.material.normalScale.x;
        }
    });
    return scale;
}

/**
 * @param {THREE.Object3D} object
 * @param {number} scale
 */
export function applyObjectNormalScale(object, scale) {
    const value = THREE.MathUtils.clamp(scale, NORMAL_SCALE_MIN, NORMAL_SCALE_MAX);
    object.userData[OBJECT_NORMAL_SCALE_KEY] = value;
    object.traverse((child) => {
        if (!isContentMesh(child)) return;
        ensureObjectMaterials(child).forEach((material) => {
            material.normalScale.set(value, value);
        });
    });
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

    object.traverse((child) => {
        if (!isContentMesh(child)) return;
        if (String(child.name || "").startsWith("arch-plinth-")) return;
        ensureObjectMaterials(child).forEach((material) => {
            if (isFaceMappedMaterial(material)) return;
            // Un matériau de face peint doit garder une map (même un
            // placeholder blanc) pour que le shader du dessin reste valide
            // (USE_MAP / vUv toujours définis) — jamais null.
            if (material.userData?._labFacePaint) {
                material.map = getPlaceholderWhiteTexture();
                material.userData._labFacePaint_placeholderMap = true;
            } else {
                material.map = null;
            }
            material.needsUpdate = true;
        });
    });
}

/**
 * @param {THREE.Object3D} object
 */
export function releaseObjectNormalTexture(object) {
    disposeRuntimeTexture(object.userData[RUNTIME_NORMAL_TEXTURE_KEY]);
    delete object.userData[RUNTIME_NORMAL_TEXTURE_KEY];
    object.userData[OBJECT_NORMAL_TEXTURE_KEY] = null;

    object.traverse((child) => {
        if (!isContentMesh(child)) return;
        ensureObjectMaterials(child).forEach((material) => {
            if (isFaceMappedMaterial(material)) return;
            material.normalMap = null;
            material.needsUpdate = true;
        });
    });
}

/**
 * @param {THREE.Object3D} object
 */
export function releaseObjectSpecularTexture(object) {
    disposeRuntimeTexture(object.userData[RUNTIME_SPECULAR_TEXTURE_KEY]);
    delete object.userData[RUNTIME_SPECULAR_TEXTURE_KEY];
    object.userData[OBJECT_SPECULAR_TEXTURE_KEY] = null;

    object.traverse((child) => {
        if (!isContentMesh(child)) return;
        ensureObjectMaterials(child).forEach((material) => {
            if (isFaceMappedMaterial(material)) return;
            material.metalnessMap = null;
            material.needsUpdate = true;
        });
    });
}

/**
 * @param {THREE.Object3D} object
 */
export function getObjectSpecularTextureDataUrl(object) {
    return object?.userData?.[OBJECT_SPECULAR_TEXTURE_KEY] || null;
}

/**
 * @param {THREE.Object3D} object
 */
export function releaseObjectRoughnessTexture(object) {
    disposeRuntimeTexture(object.userData[RUNTIME_ROUGHNESS_TEXTURE_KEY]);
    delete object.userData[RUNTIME_ROUGHNESS_TEXTURE_KEY];
    object.userData[OBJECT_ROUGHNESS_TEXTURE_KEY] = null;

    object.traverse((child) => {
        if (!isContentMesh(child)) return;
        ensureObjectMaterials(child).forEach((material) => {
            if (isFaceMappedMaterial(material)) return;
            material.roughnessMap = null;
            material.needsUpdate = true;
        });
    });
}

/**
 * @param {THREE.Object3D} object
 */
export function getObjectRoughnessTextureDataUrl(object) {
    return object?.userData?.[OBJECT_ROUGHNESS_TEXTURE_KEY] || null;
}

/**
 * @param {THREE.Object3D} object
 * @param {number} roughness
 */
export function applyObjectRoughness(object, roughness) {
    const value = THREE.MathUtils.clamp(roughness, ROUGHNESS_MIN, ROUGHNESS_MAX);
    object.userData[OBJECT_ROUGHNESS_KEY] = value;
    forEachAppearanceMesh(object, (child) => {
        ensureObjectMaterials(child).forEach((material) => {
            if (isFaceMappedMaterial(material)) return;
            material.roughness = value;
            // Curseur rugosité : ne plus laisser roughnessMap écraser le réglage.
            if (material.roughnessMap) {
                material.roughnessMap = null;
            }
            material.needsUpdate = true;
        });
    });
}

/**
 * @param {THREE.Object3D} object
 * @param {string | null} dataUrl
 * @returns {Promise<void>}
 */
export function applyObjectTexture(object, dataUrl) {
    releaseObjectTexture(object);

    if (!dataUrl) {
        return Promise.resolve();
    }

    return loadTextureFromDataUrl(dataUrl, "srgb").then((texture) => {
        object.userData[OBJECT_TEXTURE_KEY] = dataUrl;
        object.userData[RUNTIME_TEXTURE_KEY] = texture;
        syncObjectUvTransforms(object);

        object.traverse((child) => {
            if (!isContentMesh(child)) return;
            // Plinthes Architecture : texture objet ne les recouvre pas.
            if (String(child.name || "").startsWith("arch-plinth-")) return;
            // Surfaces Face Architecture : ne pas écraser les maps de panneau.
            if (typeof child.userData?.[ARCH_SURFACE_TEXTURED_KEY] === "string") return;
            ensureObjectMaterials(child).forEach((material) => {
                if (isFaceMappedMaterial(material)) return;
                // Une vraie texture remplace le placeholder blanc du dessin :
                // on retire le repère "placeholder" pour ne pas le supprimer
                // par erreur plus tard.
                delete material.userData?._labFacePaint_placeholderMap;
                material.map = texture;
                // Albedo map : teinte matériau neutre (la teinte objet
                // reste en userData pour un éventuel retrait de texture).
                material.color.set(0xffffff);
                material.needsUpdate = true;
            });
        });
    });
}

/**
 * @param {THREE.Object3D} object
 * @param {string | null} dataUrl
 * @returns {Promise<void>}
 */
export function applyObjectNormalTexture(object, dataUrl) {
    releaseObjectNormalTexture(object);

    if (!dataUrl) {
        return Promise.resolve();
    }

    return loadTextureFromDataUrl(dataUrl, "linear").then((texture) => {
        object.userData[OBJECT_NORMAL_TEXTURE_KEY] = dataUrl;
        object.userData[RUNTIME_NORMAL_TEXTURE_KEY] = texture;
        syncObjectUvTransforms(object);
        const normalScale = getObjectNormalScale(object);

        object.traverse((child) => {
            if (!isContentMesh(child)) return;
            if (typeof child.userData?.[ARCH_SURFACE_TEXTURED_KEY] === "string") return;
            ensureObjectMaterials(child).forEach((material) => {
                if (isFaceMappedMaterial(material)) return;
                material.normalMap = texture;
                material.normalScale.set(normalScale, normalScale);
                material.needsUpdate = true;
            });
        });
    });
}

/**
 * Spéculaire ≈ metalnessMap (PBR MeshStandardMaterial).
 * @param {THREE.Object3D} object
 * @param {string | null} dataUrl
 * @returns {Promise<void>}
 */
export function applyObjectSpecularTexture(object, dataUrl) {
    releaseObjectSpecularTexture(object);

    if (!dataUrl) {
        return Promise.resolve();
    }

    return loadTextureFromDataUrl(dataUrl, "linear").then((texture) => {
        object.userData[OBJECT_SPECULAR_TEXTURE_KEY] = dataUrl;
        object.userData[RUNTIME_SPECULAR_TEXTURE_KEY] = texture;
        syncObjectUvTransforms(object);

        object.traverse((child) => {
            if (!isContentMesh(child)) return;
            if (typeof child.userData?.[ARCH_SURFACE_TEXTURED_KEY] === "string") return;
            ensureObjectMaterials(child).forEach((material) => {
                if (isFaceMappedMaterial(material)) return;
                material.metalnessMap = texture;
                if (typeof material.metalness !== "number" || material.metalness < 0.2) {
                    material.metalness = 1;
                }
                material.needsUpdate = true;
            });
        });
    });
}

/**
 * Roughness map PBR (MeshStandardMaterial.roughnessMap).
 * @param {THREE.Object3D} object
 * @param {string | null} dataUrl
 * @returns {Promise<void>}
 */
export function applyObjectRoughnessTexture(object, dataUrl) {
    releaseObjectRoughnessTexture(object);

    if (!dataUrl) {
        return Promise.resolve();
    }

    return loadTextureFromDataUrl(dataUrl, "linear").then((texture) => {
        object.userData[OBJECT_ROUGHNESS_TEXTURE_KEY] = dataUrl;
        object.userData[RUNTIME_ROUGHNESS_TEXTURE_KEY] = texture;
        syncObjectUvTransforms(object);

        object.traverse((child) => {
            if (!isContentMesh(child)) return;
            if (typeof child.userData?.[ARCH_SURFACE_TEXTURED_KEY] === "string") return;
            ensureObjectMaterials(child).forEach((material) => {
                if (isFaceMappedMaterial(material)) return;
                material.roughnessMap = texture;
                // La map module le facteur : 1 = pleine amplitude de la texture.
                if (typeof material.roughness !== "number" || material.roughness < 0.2) {
                    material.roughness = 1;
                }
                material.needsUpdate = true;
            });
        });
    });
}

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readImageFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        if (!/^image\/(jpeg|png|jpg)/i.test(file.type) && !/\.(jpe?g|png)$/i.test(file.name)) {
            reject(new Error("Format accepté : JPEG ou PNG"));
            return;
        }

        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
        reader.readAsDataURL(file);
    });
}
