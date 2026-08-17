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
            const colorMap =
                textureToDataUrl(labColor) ||
                (mat.userData?._labUniqueSlot && mat.userData?.[FACE_ALBEDO_MAP_KEY]
                    ? textureToDataUrl(mat.map)
                    : null) ||
                (typeof mat.userData?.colorDataUrl === "string" ? mat.userData.colorDataUrl : null);

            const normalMap =
                textureToDataUrl(mat.userData?.[FACE_NORMAL_MAP_KEY]) ||
                (mat.userData?._labUniqueSlot ? textureToDataUrl(mat.normalMap) : null);
            const specularMap = textureToDataUrl(mat.userData?.[FACE_SPECULAR_MAP_KEY]);
            const roughnessMap = textureToDataUrl(mat.userData?.[FACE_ROUGHNESS_MAP_KEY]);

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

            if (slot.tintHex && !wantGlass) {
                applyMeshSlotColor(
                    object,
                    mesh,
                    index,
                    `#${String(slot.tintHex).replace(/^#/, "")}`
                );
            }

            const hasMaps = !!(slot.colorMap || slot.normalMap || slot.specularMap || slot.roughnessMap);
            if (hasMaps) {
                await applyMeshSlotTextureMaps(
                    object,
                    mesh,
                    index,
                    {
                        color: slot.colorMap || null,
                        normal: slot.normalMap || null,
                        specular: slot.specularMap || null,
                        roughness: slot.roughnessMap || null,
                    },
                    typeof slot.tileX === "number" ? slot.tileX : 1,
                    typeof slot.tileY === "number" ? slot.tileY : 1,
                    typeof slot.offsetX === "number" ? slot.offsetX : 0,
                    typeof slot.offsetY === "number" ? slot.offsetY : 0
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
