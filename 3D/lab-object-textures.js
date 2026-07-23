/** Textures PBR légères : couleur, normales (JPEG/PNG), roughness. */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { getPlaceholderWhiteTexture } from "./lab-face-draw.js";
import { createPrimitiveGeometry, isLabPrimitiveShape } from "./lab-primitives.js";
import { CUBE_SIZE } from "./grid-constants.js";

export const OBJECT_TEXTURE_KEY = "textureDataUrl";
export const OBJECT_NORMAL_TEXTURE_KEY = "normalTextureDataUrl";
export const OBJECT_NORMAL_SCALE_KEY = "normalScale";
export const OBJECT_TEXTURE_TILE_KEY = "textureTile";
export const OBJECT_ROUGHNESS_KEY = "roughness";
export const OBJECT_OPACITY_KEY = "opacity";
export const OBJECT_METALNESS_KEY = "metalness";
export const OBJECT_GLASS_KEY = "glass";
export const OBJECT_SMOOTH_KEY = "smoothShading";

export const DEFAULT_ROUGHNESS = 0.65;
export const DEFAULT_METALNESS = 0.05;
export const DEFAULT_OPACITY = 1;
export const DEFAULT_SMOOTH = true;
export const GLASS_PRESET_OPACITY = 0.35;
export const GLASS_PRESET_ROUGHNESS = 0.05;
export const GLASS_PRESET_METALNESS = 0;
export const DEFAULT_NORMAL_SCALE = 1;
export const DEFAULT_TEXTURE_TILE = 1;
export const ROUGHNESS_MIN = 0;
export const ROUGHNESS_MAX = 1;
export const ROUGHNESS_STEP = 0.05;
export const METALNESS_MIN = 0;
export const METALNESS_MAX = 1;
export const METALNESS_STEP = 0.05;
export const OPACITY_MIN = 0.05;
export const OPACITY_MAX = 1;
export const OPACITY_STEP = 0.05;
export const NORMAL_SCALE_MIN = 0;
export const NORMAL_SCALE_MAX = 3;
export const NORMAL_SCALE_STEP = 0.05;
export const TEXTURE_TILE_MIN = 0.25;
export const TEXTURE_TILE_MAX = 16;
export const TERRAIN_TEXTURE_TILE_MAX = 1000;
/** Tile pinceau terrain : plus bas = tuile plus grande (min 0,05 ≈ 1000 m). */
export const TERRAIN_PAINT_TEXTURE_TILE_MIN = 0.05;
export const TERRAIN_PAINT_TEXTURE_TILE_MAX = 1000;
export const TEXTURE_TILE_STEP = 0.25;

const RUNTIME_TEXTURE_KEY = "_labTexture";
const RUNTIME_NORMAL_TEXTURE_KEY = "_labNormalTexture";
const GLASS_RESTORE_KEY = "_glassRestore";

function isContentMesh(child) {
    return (
        child instanceof THREE.Mesh &&
        child.name !== "shadow-overlay" &&
        !child.userData?.skipObjectPbr &&
        !child.userData?.labVegetationMesh
    );
}

/**
 * @param {THREE.Mesh} mesh
 * @returns {boolean}
 */
function hasPaintedFaceMaterials(mesh) {
    return (
        Array.isArray(mesh.material) &&
        mesh.material.length > 0 &&
        mesh.material.every((material) => material instanceof THREE.MeshStandardMaterial)
    );
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
 * @param {number} tile
 */
function applyRepeatToTexture(texture, tile) {
    if (!texture) return;
    texture.repeat.set(tile, tile);
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
 * @param {number} tile
 */
export function applyObjectTextureTile(object, tile) {
    const value = THREE.MathUtils.clamp(tile, TEXTURE_TILE_MIN, TEXTURE_TILE_MAX);
    object.userData[OBJECT_TEXTURE_TILE_KEY] = value;
    applyRepeatToTexture(object.userData[RUNTIME_TEXTURE_KEY], value);
    applyRepeatToTexture(object.userData[RUNTIME_NORMAL_TEXTURE_KEY], value);
}

/**
 * @param {THREE.MeshStandardMaterial} material
 * @param {number} opacity
 */
function syncMaterialOpacity(material, opacity) {
    const value = THREE.MathUtils.clamp(opacity, OPACITY_MIN, OPACITY_MAX);
    const translucent = value < 0.995;
    material.opacity = value;
    material.transparent = translucent;
    material.depthWrite = !translucent;
    material.side = translucent ? THREE.DoubleSide : THREE.FrontSide;
    material.needsUpdate = true;
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
        if (!isContentMesh(child)) return;
        if (child.material instanceof THREE.MeshStandardMaterial) {
            opacity = child.material.opacity;
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
    object.traverse((child) => {
        if (!isContentMesh(child)) return;
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
        if (!object.userData[OBJECT_GLASS_KEY]) {
            object.userData[GLASS_RESTORE_KEY] = {
                opacity: getObjectOpacity(object),
                roughness: getObjectRoughness(object),
                metalness: getObjectMetalness(object),
            };
        }
        object.userData[OBJECT_GLASS_KEY] = true;
        applyObjectOpacity(object, GLASS_PRESET_OPACITY);
        applyObjectRoughness(object, GLASS_PRESET_ROUGHNESS);
        applyObjectMetalness(object, GLASS_PRESET_METALNESS);
        return;
    }

    object.userData[OBJECT_GLASS_KEY] = false;
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
 * Désactive le mode verre si l'utilisateur modifie le matériau à la main.
 * @param {THREE.Object3D} object
 */
export function clearObjectGlassOnManualEdit(object) {
    if (!isObjectGlassEnabled(object)) return;
    object.userData[OBJECT_GLASS_KEY] = false;
    delete object.userData[GLASS_RESTORE_KEY];
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
        if (!isContentMesh(child)) return;
        if (child.material instanceof THREE.MeshStandardMaterial) {
            metalness = child.material.metalness;
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
    object.traverse((child) => {
        if (!isContentMesh(child)) return;
        ensureObjectMaterials(child).forEach((material) => {
            material.metalness = value;
            // Plus de métal → reflets plus présents (aspect chrome / acier)
            if (!material.userData?.labSkyboxEnvMap) {
                material.envMapIntensity = 0.95 + value * 1.05;
            }
            material.needsUpdate = true;
        });
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
    if (geometry.index) {
        clean.setIndex(geometry.index.clone());
    }

    const welded = mergeVertices(clean, tolerance);
    clean.dispose();
    const crease =
        typeof opts.creaseAngle === "number" ? opts.creaseAngle : (48 * Math.PI) / 180;
    computeCreasedNormals(welded, crease);
    welded.computeBoundingBox();
    welded.computeBoundingSphere();
    return welded;
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

            const o = (t * 3 + k) * 3;
            cornerNormals[o] = acc.x;
            cornerNormals[o + 1] = acc.y;
            cornerNormals[o + 2] = acc.z;
            newPos[o] = pos.getX(v);
            newPos[o + 1] = pos.getY(v);
            newPos[o + 2] = pos.getZ(v);
        }
    }

    geometry.setIndex(null);
    geometry.setAttribute("position", new THREE.BufferAttribute(newPos, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(cornerNormals, 3));
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
    if (object?.userData?.labStair || object?.userData?.labLanding || object?.userData?.labTube) return "generic";

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

    // Escalier / palier : ne jamais remplacer la géométrie.
    if (object?.userData?.labStair || object?.userData?.labLanding || object?.userData?.labTube) {
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
        if (hasActiveFacePaint(child)) {
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
            // Mesh générique / CSG : souder les sommets pour interpoler les normales
            if (enabled) {
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
}

/**
 * @param {THREE.Object3D} object
 */
export function getObjectRoughness(object) {
    const stored = object?.userData?.[OBJECT_ROUGHNESS_KEY];
    if (typeof stored === "number") return stored;

    let roughness = DEFAULT_ROUGHNESS;
    object?.traverse((child) => {
        if (!isContentMesh(child)) return;
        if (child.material instanceof THREE.MeshStandardMaterial) {
            roughness = child.material.roughness;
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
        ensureObjectMaterials(child).forEach((material) => {
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
            material.normalMap = null;
            material.needsUpdate = true;
        });
    });
}

/**
 * @param {THREE.Object3D} object
 * @param {number} roughness
 */
export function applyObjectRoughness(object, roughness) {
    const value = THREE.MathUtils.clamp(roughness, ROUGHNESS_MIN, ROUGHNESS_MAX);
    object.userData[OBJECT_ROUGHNESS_KEY] = value;
    object.traverse((child) => {
        if (!isContentMesh(child)) return;
        ensureObjectMaterials(child).forEach((material) => {
            material.roughness = value;
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
        applyRepeatToTexture(texture, getObjectTextureTile(object));

        object.traverse((child) => {
            if (!isContentMesh(child)) return;
            ensureObjectMaterials(child).forEach((material) => {
                // Une vraie texture remplace le placeholder blanc du dessin :
                // on retire le repère "placeholder" pour ne pas le supprimer
                // par erreur plus tard.
                delete material.userData?._labFacePaint_placeholderMap;
                material.map = texture;
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
        applyRepeatToTexture(texture, getObjectTextureTile(object));
        const normalScale = getObjectNormalScale(object);

        object.traverse((child) => {
            if (!isContentMesh(child)) return;
            ensureObjectMaterials(child).forEach((material) => {
                material.normalMap = texture;
                material.normalScale.set(normalScale, normalScale);
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
