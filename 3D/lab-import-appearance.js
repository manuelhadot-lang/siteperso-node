/**
 * Apparence des modèles importés — sérialisation / restauration professionnelle.
 * Capture l’état LIVE des matériaux (pas seulement le store PBR UI).
 */
import * as THREE from "three";
import {
    LAB_IMPORTED_KEY,
    LAB_MESH_PERSIST_ID_KEY,
    ensureImportedMeshPersistIds,
} from "./lab-import.js";
import { LAB_SOLIDIFIED_KEY, clampSolidifyThickness, applyMeshSolidifyData } from "./lab-solidify.js";
import {
    applyMeshSlotColor,
    applyMeshSlotMaterialProps,
    applyMeshSlotTextureMaps,
    applyFacePaintData,
    applyFacePbrStoreData,
    applyTriangleTexturesData,
    FACE_ALBEDO_MAP_KEY,
    FACE_NORMAL_MAP_KEY,
    FACE_SPECULAR_MAP_KEY,
    FACE_ROUGHNESS_MAP_KEY,
} from "./lab-face-draw.js";

/** Store PBR face/slot (même clé que lab-face-draw). */
const FACE_PBR_STORE_KEY = "_labFacePbrStore";

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isValidTextureDataUrl(value) {
    return typeof value === "string" && value.startsWith("data:") && value.length > 48;
}

/**
 * Opacité logique du curseur verre ← transmission Physical.
 * @param {number} transmission
 */
function transmissionToGlassOpacity(transmission) {
    const t = THREE.MathUtils.clamp(transmission, 0, 1);
    return THREE.MathUtils.clamp((1 - t) / 0.92, 0.02, 1);
}

/**
 * @param {THREE.Material} mat
 * @returns {boolean}
 */
function materialIsLabGlass(mat) {
    if (!mat) return false;
    if (mat.userData?._labGlass) return true;
    if (
        mat.isMeshPhysicalMaterial &&
        typeof mat.transmission === "number" &&
        mat.transmission > 0.02
    ) {
        return true;
    }
    return false;
}

/**
 * @param {THREE.Texture | null | undefined} texture
 * @returns {string | null}
 */
function textureToDataUrl(texture) {
    if (!texture?.image) return null;
    try {
        const img = texture.image;
        if (typeof img.toDataURL === "function") return img.toDataURL("image/png");
        if (img instanceof HTMLCanvasElement) return img.toDataURL("image/png");
        if (typeof document !== "undefined" && (img instanceof HTMLImageElement || img instanceof ImageBitmap)) {
            const canvas = document.createElement("canvas");
            const w = img.width || img.videoWidth || 0;
            const h = img.height || img.videoHeight || 0;
            if (!w || !h) return null;
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) return null;
            ctx.drawImage(img, 0, 0);
            return canvas.toDataURL("image/png");
        }
    } catch {
        /* ignore */
    }
    return null;
}

/**
 * @param {THREE.Object3D} root
 * @returns {THREE.Mesh[]}
 */
function listImportMeshes(root) {
    /** @type {THREE.Mesh[]} */
    const meshes = [];
    root.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || !child.geometry) return;
        if (child.userData?._labNoPaintPick) return;
        if (child.name === "shadow-overlay") return;
        if (typeof child.name === "string" && child.name.startsWith("lab-")) return;
        meshes.push(child);
    });
    return meshes;
}

/**
 * Snapshot complet de l’apparence d’un import (couleurs, PBR, verre, maps lab, solidify).
 * @param {THREE.Object3D} object
 * @returns {{
 *   version: number,
 *   objectColor?: string,
 *   objectGlass?: boolean,
 *   objectGlassOpacity?: number,
 *   objectGlassRoughness?: number,
 *   meshes: Array<object>,
 * } | null}
 */
export function serializeImportedAppearance(object) {
    if (!object) return null;
    if (!object.userData?.[LAB_IMPORTED_KEY] && object.userData?.labShape !== "imported") {
        return null;
    }
    ensureImportedMeshPersistIds(object);

    const pbrStore =
        object.userData?.[FACE_PBR_STORE_KEY] && typeof object.userData[FACE_PBR_STORE_KEY] === "object"
            ? object.userData[FACE_PBR_STORE_KEY]
            : {};

    /** @type {Array<object>} */
    const meshesOut = [];
    for (const mesh of listImportMeshes(object)) {
        const meshId =
            typeof mesh.userData?.[LAB_MESH_PERSIST_ID_KEY] === "number"
                ? mesh.userData[LAB_MESH_PERSIST_ID_KEY]
                : null;
        if (typeof meshId !== "number") continue;

        const list = Array.isArray(mesh.material)
            ? mesh.material
            : mesh.material
              ? [mesh.material]
              : [];
        /** @type {Array<object>} */
        const slots = [];
        for (let index = 0; index < list.length; index += 1) {
            const mat = list[index];
            if (!mat) continue;

            const storeKey = `${mesh.uuid}:${index}`;
            const storeEntry = pbrStore[storeKey] || {};
            const glass = !!(storeEntry.glass || materialIsLabGlass(mat));

            const labColor =
                mat.userData?.[FACE_ALBEDO_MAP_KEY] ||
                (mat.userData?._labUniqueSlot && mat.userData?._labFaceAlbedoMap) ||
                null;
            // Priorité au store PBR (souvent déjà en dataURL) — sans ça, importAppearance
            // part sans albedo alors que facePbr l’a, et le coussin devient noir au reload.
            const colorMap =
                (typeof storeEntry.colorDataUrl === "string" ? storeEntry.colorDataUrl : null) ||
                textureToDataUrl(storeEntry.color) ||
                textureToDataUrl(labColor) ||
                (mat.userData?._labUniqueSlot || labColor
                    ? textureToDataUrl(mat.map)
                    : null) ||
                (typeof mat.userData?.colorDataUrl === "string" ? mat.userData.colorDataUrl : null);

            const normalMap =
                (typeof storeEntry.normalDataUrl === "string" ? storeEntry.normalDataUrl : null) ||
                textureToDataUrl(storeEntry.normal) ||
                textureToDataUrl(mat.userData?.[FACE_NORMAL_MAP_KEY]) ||
                (mat.userData?._labUniqueSlot || storeEntry.normal || storeEntry.normalDataUrl
                    ? textureToDataUrl(mat.normalMap)
                    : null);
            const specularMap =
                (typeof storeEntry.specularDataUrl === "string" ? storeEntry.specularDataUrl : null) ||
                textureToDataUrl(storeEntry.specular) ||
                textureToDataUrl(mat.userData?.[FACE_SPECULAR_MAP_KEY]);
            const roughnessMap =
                (typeof storeEntry.roughnessDataUrl === "string" ? storeEntry.roughnessDataUrl : null) ||
                textureToDataUrl(
                    storeEntry.roughnessMap ||
                        (storeEntry.roughness?.isTexture ? storeEntry.roughness : null)
                ) ||
                textureToDataUrl(mat.userData?.[FACE_ROUGHNESS_MAP_KEY]);

            const tintHex = mat.color?.getHexString?.() || null;

            // Verre Physical : opacity matériau = 1 ; la vraie valeur est dans transmission / store.
            let opacity;
            if (glass) {
                if (typeof storeEntry.opacity === "number") {
                    opacity = storeEntry.opacity;
                } else if (
                    mat.isMeshPhysicalMaterial &&
                    typeof mat.transmission === "number" &&
                    mat.transmission > 0.02
                ) {
                    opacity = transmissionToGlassOpacity(mat.transmission);
                } else if (typeof mat.opacity === "number" && mat.opacity < 0.98) {
                    opacity = mat.opacity;
                } else if (typeof object.userData?.opacity === "number") {
                    opacity = object.userData.opacity;
                } else {
                    opacity = 0.2;
                }
            } else if (typeof mat.opacity === "number") {
                opacity = mat.opacity;
            }

            const slot = {
                index,
                tintHex: tintHex || undefined,
                roughness:
                    typeof storeEntry.roughness === "number"
                        ? storeEntry.roughness
                        : typeof mat.roughness === "number"
                          ? mat.roughness
                          : undefined,
                metalness:
                    typeof storeEntry.metalness === "number"
                        ? storeEntry.metalness
                        : typeof mat.metalness === "number"
                          ? mat.metalness
                          : undefined,
                opacity: typeof opacity === "number" ? opacity : undefined,
                glass: glass ? true : undefined,
                transmission:
                    glass && mat.isMeshPhysicalMaterial && typeof mat.transmission === "number"
                        ? mat.transmission
                        : undefined,
                reflection:
                    typeof storeEntry.reflection === "number"
                        ? storeEntry.reflection
                        : typeof mat.userData?._labReflection === "number"
                          ? mat.userData._labReflection
                          : undefined,
                colorMap: colorMap || undefined,
                normalMap: normalMap || undefined,
                specularMap: specularMap || undefined,
                roughnessMap: roughnessMap || undefined,
                tileX: typeof mat.map?.repeat?.x === "number" ? mat.map.repeat.x : undefined,
                tileY: typeof mat.map?.repeat?.y === "number" ? mat.map.repeat.y : undefined,
                offsetX: typeof mat.map?.offset?.x === "number" ? mat.map.offset.x : undefined,
                offsetY: typeof mat.map?.offset?.y === "number" ? mat.map.offset.y : undefined,
            };
            slots.push(slot);
        }

        meshesOut.push({
            meshId,
            name: mesh.name || undefined,
            solidified: !!mesh.userData?.[LAB_SOLIDIFIED_KEY] || undefined,
            thickness: mesh.userData?.[LAB_SOLIDIFIED_KEY]
                ? clampSolidifyThickness(mesh.userData._labSolidifyThickness)
                : undefined,
            slots,
        });
    }

    if (!meshesOut.length) return null;

    const objectGlass = !!object.userData?.glass;
    return {
        version: 2,
        objectColor:
            typeof object.userData?.objectColor === "string" ? object.userData.objectColor : undefined,
        objectGlass: objectGlass || undefined,
        objectGlassOpacity:
            objectGlass && typeof object.userData?.opacity === "number"
                ? object.userData.opacity
                : undefined,
        objectGlassRoughness:
            objectGlass && typeof object.userData?.roughness === "number"
                ? object.userData.roughness
                : undefined,
        meshes: meshesOut,
    };
}

/**
 * Restaure l’apparence après rechargement du GLB brut.
 * @param {THREE.Object3D} object
 * @param {ReturnType<typeof serializeImportedAppearance> | null | undefined} data
 */
export async function applyImportedAppearance(object, data) {
    if (!object || !data || typeof data !== "object") return;
    if (!Array.isArray(data.meshes) || !data.meshes.length) return;

    ensureImportedMeshPersistIds(object);

    /** @type {Map<number, THREE.Mesh>} */
    const byId = new Map();
    /** @type {Map<string, THREE.Mesh>} */
    const byName = new Map();
    for (const mesh of listImportMeshes(object)) {
        if (typeof mesh.userData?.[LAB_MESH_PERSIST_ID_KEY] === "number") {
            byId.set(mesh.userData[LAB_MESH_PERSIST_ID_KEY], mesh);
        }
        if (mesh.name) byName.set(mesh.name, mesh);
    }

    const solidifyList = data.meshes
        .filter((m) => m && m.solidified && typeof m.meshId === "number")
        .map((m) => ({
            meshId: m.meshId,
            thickness: m.thickness,
            meshName: m.name,
        }));
    if (solidifyList.length) {
        applyMeshSolidifyData(object, solidifyList);
    }

    for (const entry of data.meshes) {
        if (!entry || typeof entry !== "object") continue;
        let mesh =
            typeof entry.meshId === "number" ? byId.get(entry.meshId) || null : null;
        if (!mesh && entry.name) mesh = byName.get(entry.name) || null;
        if (!mesh || !Array.isArray(entry.slots)) continue;

        for (const slot of entry.slots) {
            if (!slot || typeof slot !== "object") continue;
            const index = typeof slot.index === "number" ? slot.index : 0;
            const wantGlass = slot.glass === true;

            const hasMaps = !!(
                isValidTextureDataUrl(slot.colorMap) ||
                isValidTextureDataUrl(slot.normalMap) ||
                isValidTextureDataUrl(slot.specularMap) ||
                isValidTextureDataUrl(slot.roughnessMap)
            );
            if (hasMaps) {
                try {
                    await applyMeshSlotTextureMaps(
                        object,
                        mesh,
                        index,
                        {
                            color: isValidTextureDataUrl(slot.colorMap) ? slot.colorMap : null,
                            normal: isValidTextureDataUrl(slot.normalMap) ? slot.normalMap : null,
                            specular: isValidTextureDataUrl(slot.specularMap) ? slot.specularMap : null,
                            roughness: isValidTextureDataUrl(slot.roughnessMap)
                                ? slot.roughnessMap
                                : null,
                        },
                        typeof slot.tileX === "number" ? slot.tileX : 1,
                        typeof slot.tileY === "number" ? slot.tileY : 1,
                        typeof slot.offsetX === "number" ? slot.offsetX : 0,
                        typeof slot.offsetY === "number" ? slot.offsetY : 0
                    );
                } catch (err) {
                    console.warn("[lab-import] maps slot :", err);
                }
            }

            if (slot.tintHex && !wantGlass && !hasMaps) {
                applyMeshSlotColor(
                    object,
                    mesh,
                    index,
                    `#${String(slot.tintHex).replace(/^#/, "")}`
                );
            }

            const hasMat =
                typeof slot.roughness === "number" ||
                typeof slot.metalness === "number" ||
                typeof slot.opacity === "number" ||
                typeof slot.reflection === "number" ||
                wantGlass ||
                slot.glass === false;

            if (hasMat && !wantGlass) {
                applyMeshSlotMaterialProps(object, mesh, index, {
                    roughness: typeof slot.roughness === "number" ? slot.roughness : undefined,
                    metalness: typeof slot.metalness === "number" ? slot.metalness : undefined,
                    opacity: typeof slot.opacity === "number" ? slot.opacity : undefined,
                    glass: slot.glass === false ? false : undefined,
                    reflection: typeof slot.reflection === "number" ? slot.reflection : undefined,
                });
            }

            // Verre en dernier (applyMeshSlotColor le détruirait).
            if (wantGlass) {
                if (!object.userData[FACE_PBR_STORE_KEY]) object.userData[FACE_PBR_STORE_KEY] = {};
                const sk = `${mesh.uuid}:${index}`;
                object.userData[FACE_PBR_STORE_KEY][sk] = {
                    ...(object.userData[FACE_PBR_STORE_KEY][sk] || {}),
                    glass: false,
                };
                if (slot.tintHex) {
                    applyMeshSlotColor(
                        object,
                        mesh,
                        index,
                        `#${String(slot.tintHex).replace(/^#/, "")}`
                    );
                }
                let glassOpacity = typeof slot.opacity === "number" ? slot.opacity : 0.2;
                if (
                    typeof slot.transmission === "number" &&
                    slot.transmission > 0.02 &&
                    typeof slot.opacity !== "number"
                ) {
                    glassOpacity = transmissionToGlassOpacity(slot.transmission);
                }
                applyMeshSlotMaterialProps(object, mesh, index, {
                    glass: true,
                    opacity: glassOpacity,
                    roughness: typeof slot.roughness === "number" ? slot.roughness : undefined,
                    metalness: typeof slot.metalness === "number" ? slot.metalness : undefined,
                });
            }
        }
    }

    if (typeof data.objectColor === "string" && data.objectColor) {
        object.userData.objectColor = data.objectColor;
    }

    if (data.objectGlass) {
        const { applyObjectGlass, applyObjectOpacity, applyObjectRoughness } = await import(
            "./lab-object-textures.js"
        );
        if (typeof data.objectGlassOpacity === "number") {
            object.userData.opacity = data.objectGlassOpacity;
        }
        if (typeof data.objectGlassRoughness === "number") {
            object.userData.roughness = data.objectGlassRoughness;
        }
        applyObjectGlass(object, true);
        if (typeof data.objectGlassOpacity === "number") {
            applyObjectOpacity(object, data.objectGlassOpacity);
        }
        if (typeof data.objectGlassRoughness === "number") {
            applyObjectRoughness(object, data.objectGlassRoughness);
        }
    }
}

/**
 * @param {THREE.Object3D} object
 * @param {string} key
 * @param {object} entry
 * @returns {{ mesh: THREE.Mesh | null, slotIndex: number }}
 */
function resolveImportMeshSlot(object, key, entry) {
    let persistId = typeof entry.meshId === "number" ? entry.meshId : null;
    let slotIndex = typeof entry.slot === "number" ? entry.slot : 0;
    if (String(key).startsWith("m") && String(key).includes("::")) {
        const parts = String(key).split("::");
        persistId = Number(parts[0].slice(1));
        slotIndex = Number(parts[1]);
    }
    const meshes = listImportMeshes(object);
    /** @type {THREE.Mesh | null} */
    let mesh =
        typeof persistId === "number"
            ? meshes.find((m) => m.userData?.[LAB_MESH_PERSIST_ID_KEY] === persistId) || null
            : null;
    if (!mesh && typeof persistId === "number" && persistId >= 0 && persistId < meshes.length) {
        mesh = meshes[persistId];
    }
    return { mesh, slotIndex };
}

/**
 * @param {THREE.Mesh} mesh
 * @param {number} slotIndex
 */
function slotHasWorkingAlbedo(mesh, slotIndex) {
    const list = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    const mat = list[slotIndex];
    if (!mat) return false;
    const tex = mat.map || mat.userData?.[FACE_ALBEDO_MAP_KEY];
    return !!(tex?.image && (tex.image.width > 0 || tex.image.videoWidth > 0));
}

/**
 * @param {THREE.Mesh} mesh
 * @param {number} slotIndex
 * @param {"normal"|"specular"|"roughness"} kind
 */
function slotHasWorkingMap(mesh, slotIndex, kind) {
    const list = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    const mat = list[slotIndex];
    if (!mat) return false;
    let tex = null;
    if (kind === "normal") tex = mat.normalMap || mat.userData?.[FACE_NORMAL_MAP_KEY];
    else if (kind === "specular") tex = mat.metalnessMap || mat.userData?.[FACE_SPECULAR_MAP_KEY];
    else tex = mat.roughnessMap || mat.userData?.[FACE_ROUGHNESS_MAP_KEY];
    return !!(tex?.image && (tex.image.width > 0 || tex.image.videoWidth > 0));
}

/**
 * Réapplique les textures facePbr si le matériau live n’a pas d’albedo valide
 * (coussin noir après importAppearance tronqué ou data URL invalide).
 * @param {THREE.Object3D} object
 * @param {Record<string, object>} facePbr
 */
async function reconcileImportTexturesFromFacePbr(object, facePbr) {
    if (!object || !facePbr || typeof facePbr !== "object") return;

    /** @type {Record<string, object>} */
    const patch = {};
    for (const [key, entry] of Object.entries(facePbr)) {
        if (!entry || typeof entry !== "object") continue;
        const { mesh, slotIndex } = resolveImportMeshSlot(object, key, entry);
        if (!mesh || !Number.isInteger(slotIndex) || slotIndex < 0) continue;

        const needsColor = isValidTextureDataUrl(entry.color) && !slotHasWorkingAlbedo(mesh, slotIndex);
        const needsNormal =
            isValidTextureDataUrl(entry.normal) && !slotHasWorkingMap(mesh, slotIndex, "normal");
        const needsSpecular =
            isValidTextureDataUrl(entry.specular) && !slotHasWorkingMap(mesh, slotIndex, "specular");
        const needsRoughness =
            isValidTextureDataUrl(entry.roughnessMap) &&
            !slotHasWorkingMap(mesh, slotIndex, "roughness");
        if (!needsColor && !needsNormal && !needsSpecular && !needsRoughness) continue;

        patch[key] = {
            ...(needsColor ? { color: entry.color } : {}),
            ...(needsNormal ? { normal: entry.normal } : {}),
            ...(needsSpecular ? { specular: entry.specular } : {}),
            ...(needsRoughness ? { roughnessMap: entry.roughnessMap } : {}),
            tileX: typeof entry.tileX === "number" ? entry.tileX : 1,
            tileY: typeof entry.tileY === "number" ? entry.tileY : 1,
            offsetX: typeof entry.offsetX === "number" ? entry.offsetX : 0,
            offsetY: typeof entry.offsetY === "number" ? entry.offsetY : 0,
            meshId: typeof entry.meshId === "number" ? entry.meshId : undefined,
            slot: typeof entry.slot === "number" ? entry.slot : slotIndex,
        };
    }
    if (!Object.keys(patch).length) return;
    await applyFacePbrStoreData(object, patch);
}

/**
 * facePbr a souvent les textures manquantes dans importAppearance (save incomplet).
 * On ne reprend que les maps absentes, sans écraser teintes / PBR déjà appliqués.
 * @param {object} importAppearance
 * @param {Record<string, object>} facePbr
 * @returns {Record<string, object> | null}
 */
function buildMissingMapsPatchFromFacePbr(importAppearance, facePbr) {
    if (!facePbr || typeof facePbr !== "object") return null;

    /** @type {Map<string, object>} */
    const iaByKey = new Map();
    const meshes = Array.isArray(importAppearance?.meshes) ? importAppearance.meshes : [];
    for (const mesh of meshes) {
        if (!mesh || typeof mesh.meshId !== "number" || !Array.isArray(mesh.slots)) continue;
        for (const slot of mesh.slots) {
            if (!slot || typeof slot !== "object") continue;
            const index = typeof slot.index === "number" ? slot.index : 0;
            iaByKey.set(`m${mesh.meshId}::${index}`, slot);
        }
    }

    /** @type {Record<string, object>} */
    const patch = {};
    for (const [key, entry] of Object.entries(facePbr)) {
        if (!entry || typeof entry !== "object") continue;
        const entryHasMaps = !!(
            isValidTextureDataUrl(entry.color) ||
            isValidTextureDataUrl(entry.normal) ||
            isValidTextureDataUrl(entry.specular) ||
            isValidTextureDataUrl(entry.roughnessMap)
        );
        if (!entryHasMaps) continue;

        const iaSlot = iaByKey.get(key);
        const iaHasMaps = !!(
            iaSlot &&
            (isValidTextureDataUrl(iaSlot.colorMap) ||
                isValidTextureDataUrl(iaSlot.normalMap) ||
                isValidTextureDataUrl(iaSlot.specularMap) ||
                isValidTextureDataUrl(iaSlot.roughnessMap))
        );
        if (iaHasMaps) continue;

        patch[key] = {
            color: entry.color || null,
            normal: entry.normal || null,
            specular: entry.specular || null,
            roughnessMap: entry.roughnessMap || null,
            tileX:
                typeof iaSlot?.tileX === "number"
                    ? iaSlot.tileX
                    : typeof entry.tileX === "number"
                      ? entry.tileX
                      : 1,
            tileY:
                typeof iaSlot?.tileY === "number"
                    ? iaSlot.tileY
                    : typeof entry.tileY === "number"
                      ? entry.tileY
                      : 1,
            offsetX:
                typeof iaSlot?.offsetX === "number"
                    ? iaSlot.offsetX
                    : typeof entry.offsetX === "number"
                      ? entry.offsetX
                      : 0,
            offsetY:
                typeof iaSlot?.offsetY === "number"
                    ? iaSlot.offsetY
                    : typeof entry.offsetY === "number"
                      ? entry.offsetY
                      : 0,
            meshId: typeof entry.meshId === "number" ? entry.meshId : undefined,
            slot: typeof entry.slot === "number" ? entry.slot : undefined,
        };
    }
    return Object.keys(patch).length ? patch : null;
}

/**
 * Réapplique épaississement + couleurs / verre / métal après chargement du GLB brut.
 * @param {THREE.Object3D} object
 * @param {object} snapshot
 * @param {{ applyObjectColor?: (object: THREE.Object3D, hex: string) => void }} [hooks]
 */
export async function restoreImportedAppearance(object, snapshot, hooks = {}) {
    if (!object || !snapshot) return;
    ensureImportedMeshPersistIds(object);

    if (snapshot.importAppearance && typeof snapshot.importAppearance === "object") {
        try {
            await applyImportedAppearance(object, snapshot.importAppearance);
        } catch (err) {
            console.warn("[lab-import] restauration apparence :", err);
        }
        // Compléter les textures absentes via facePbr (ex. coussin noir après reload).
        if (snapshot.facePbr && typeof snapshot.facePbr === "object") {
            const mapPatch = buildMissingMapsPatchFromFacePbr(
                snapshot.importAppearance,
                snapshot.facePbr
            );
            if (mapPatch) {
                try {
                    await applyFacePbrStoreData(object, mapPatch);
                } catch (err) {
                    console.warn("[lab-import] complément maps facePbr :", err);
                }
            }
            try {
                await reconcileImportTexturesFromFacePbr(object, snapshot.facePbr);
            } catch (err) {
                console.warn("[lab-import] réconciliation textures facePbr :", err);
            }
        }
    } else {
        if (Array.isArray(snapshot.meshSolidify) && snapshot.meshSolidify.length) {
            applyMeshSolidifyData(object, snapshot.meshSolidify);
        }
        if (snapshot.facePbr && typeof snapshot.facePbr === "object") {
            try {
                await applyFacePbrStoreData(object, snapshot.facePbr);
            } catch (err) {
                console.warn("[lab-import] restauration PBR :", err);
            }
        }
        if (typeof snapshot.color === "string" && snapshot.color) {
            hooks.applyObjectColor?.(object, snapshot.color);
        }
    }

    if (snapshot.facePaint && typeof snapshot.facePaint === "object") {
        try {
            await applyFacePaintData(object, snapshot.facePaint);
        } catch (err) {
            console.warn("[lab-import] restauration paint :", err);
        }
    }
    if (Array.isArray(snapshot.triangleTextures) && snapshot.triangleTextures.length) {
        try {
            await applyTriangleTexturesData(object, snapshot.triangleTextures);
        } catch (err) {
            console.warn("[lab-import] restauration triangles :", err);
        }
    }

    if (snapshot.glass || snapshot.importAppearance?.objectGlass) {
        const { applyObjectGlass, applyObjectOpacity, applyObjectRoughness } = await import(
            "./lab-object-textures.js"
        );
        applyObjectGlass(object, true);
        const op =
            typeof snapshot.importAppearance?.objectGlassOpacity === "number"
                ? snapshot.importAppearance.objectGlassOpacity
                : typeof snapshot.opacity === "number"
                  ? snapshot.opacity
                  : undefined;
        if (typeof op === "number") applyObjectOpacity(object, op);
        const rough =
            typeof snapshot.importAppearance?.objectGlassRoughness === "number"
                ? snapshot.importAppearance.objectGlassRoughness
                : typeof snapshot.roughness === "number"
                  ? snapshot.roughness
                  : undefined;
        if (typeof rough === "number") applyObjectRoughness(object, rough);
    }
}
