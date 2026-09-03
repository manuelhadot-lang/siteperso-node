/** Scènes 3D — bibliothèque locale + enregistrement sur disque (API Fichiers). */
import * as THREE from "three";
import { normalizeArchLayout } from "./lab-architecture.js";

const SCENE_VERSION = 1;
const DEFAULT_FILENAME = "scene-lab-3d.json";
const DB_NAME = "lab3d-scenes";
const DB_STORE = "scenes";

const FILE_TYPES = [
    {
        description: "Scène laboratoire 3D",
        accept: { "application/json": [".json"] },
    },
];

/**
 * Champs d’apparence partagés (évite d’oublier un champ dans un type d’objet).
 * @param {object} snapshot
 * @param {{ defaultColor?: string, colorOptional?: boolean, includeTextures?: boolean }} [opts]
 */
function serializeObjectAppearance(snapshot, opts = {}) {
    const includeTextures = opts.includeTextures !== false;
    const colorOptional = !!opts.colorOptional;
    const defaultColor = opts.defaultColor ?? "#00d1ff";
    /** @type {Record<string, unknown>} */
    const out = {
        shadowEnabled: !!snapshot.shadowEnabled,
        shadowOpacity:
            typeof snapshot.shadowOpacity === "number" ? snapshot.shadowOpacity : undefined,
        color: colorOptional ? snapshot.color || undefined : snapshot.color || defaultColor,
        roughness: typeof snapshot.roughness === "number" ? snapshot.roughness : undefined,
        metalness: typeof snapshot.metalness === "number" ? snapshot.metalness : undefined,
        opacity: typeof snapshot.opacity === "number" ? snapshot.opacity : undefined,
        glass: !!snapshot.glass,
        smooth: snapshot.smooth !== false,
        glassRestore: snapshot.glassRestore || undefined,
        physicsEnabled: !!snapshot.physicsEnabled,
        physicsMass:
            typeof snapshot.physicsMass === "number" ? snapshot.physicsMass : undefined,
        physicsBounce:
            typeof snapshot.physicsBounce === "number" ? snapshot.physicsBounce : undefined,
    };
    if (includeTextures) {
        out.textureDataUrl = snapshot.textureDataUrl || null;
        out.normalTextureDataUrl = snapshot.normalTextureDataUrl || null;
        out.specularTextureDataUrl = snapshot.specularTextureDataUrl || null;
        out.textureTile = typeof snapshot.textureTile === "number" ? snapshot.textureTile : undefined;
        out.normalScale = typeof snapshot.normalScale === "number" ? snapshot.normalScale : undefined;
    }
    return out;
}

/**
 * @param {object} raw
 */
function deserializeGlassRestore(raw) {
    if (!raw?.glassRestore || typeof raw.glassRestore !== "object") return undefined;
    const g = raw.glassRestore;
    return {
        opacity: typeof g.opacity === "number" ? g.opacity : undefined,
        roughness: typeof g.roughness === "number" ? g.roughness : undefined,
        metalness: typeof g.metalness === "number" ? g.metalness : undefined,
    };
}

/**
 * @param {object} raw
 * @param {{ defaultColor?: string, colorOptional?: boolean, includeTextures?: boolean }} [opts]
 */
function deserializeObjectAppearance(raw, opts = {}) {
    const includeTextures = opts.includeTextures !== false;
    const colorOptional = !!opts.colorOptional;
    const defaultColor = opts.defaultColor ?? "#00d1ff";
    const legacy = /** @type {{ texture?: string | null }} */ (raw);
    /** @type {Record<string, unknown>} */
    const out = {
        shadowEnabled: !!raw.shadowEnabled,
        shadowOpacity: typeof raw.shadowOpacity === "number" ? raw.shadowOpacity : undefined,
        color: colorOptional ? raw.color || undefined : raw.color || defaultColor,
        roughness: typeof raw.roughness === "number" ? raw.roughness : undefined,
        metalness: typeof raw.metalness === "number" ? raw.metalness : undefined,
        opacity: typeof raw.opacity === "number" ? raw.opacity : undefined,
        glass: !!raw.glass,
        smooth: raw.smooth !== false,
        glassRestore: deserializeGlassRestore(raw),
        physicsEnabled: !!raw.physicsEnabled,
        physicsMass: typeof raw.physicsMass === "number" ? raw.physicsMass : undefined,
        physicsBounce: typeof raw.physicsBounce === "number" ? raw.physicsBounce : undefined,
    };
    if (includeTextures) {
        out.textureDataUrl = raw.textureDataUrl ?? legacy.texture ?? null;
        out.normalTextureDataUrl = raw.normalTextureDataUrl || null;
        out.specularTextureDataUrl = raw.specularTextureDataUrl || null;
        out.textureTile = typeof raw.textureTile === "number" ? raw.textureTile : undefined;
        out.normalScale = typeof raw.normalScale === "number" ? raw.normalScale : undefined;
    }
    return out;
}

/** @type {string | null} */
let currentFileName = null;
/** @type {FileSystemFileHandle | null} */
let diskFileHandle = null;

/**
 * @param {ReturnType<import("./lab-history.js").captureObjectState> & { kind?: string }} snapshot
 */
export function serializeObjectSnapshot(snapshot) {
    const out = serializeObjectSnapshotBody(snapshot);
    if (out && Array.isArray(snapshot?.triangleTextures) && snapshot.triangleTextures.length) {
        out.triangleTextures = snapshot.triangleTextures;
    }
    if (out && snapshot?.facePbr && typeof snapshot.facePbr === "object") {
        out.facePbr = snapshot.facePbr;
    }
    if (out && snapshot?.importAppearance && typeof snapshot.importAppearance === "object") {
        out.importAppearance = snapshot.importAppearance;
    }
    if (out && Array.isArray(snapshot?.meshSolidify) && snapshot.meshSolidify.length) {
        out.meshSolidify = snapshot.meshSolidify;
    }
    if (out && snapshot?.facePaint && typeof snapshot.facePaint === "object") {
        out.facePaint = snapshot.facePaint;
    }
    if (out && typeof snapshot?.sceneItemLabel === "string" && snapshot.sceneItemLabel.trim()) {
        out.sceneItemLabel = snapshot.sceneItemLabel.trim();
    }
    return out;
}

/**
 * @param {ReturnType<import("./lab-history.js").captureObjectState> & { kind?: string }} snapshot
 */
function serializeObjectSnapshotBody(snapshot) {
    if (!snapshot?.position || !snapshot?.rotation || !snapshot?.scale) {
        throw new Error("Snapshot incomplet (position / rotation / échelle manquantes).");
    }
    const base = {
        kind: snapshot.kind || "cube",
        position: {
            x: Number(snapshot.position.x) || 0,
            y: Number(snapshot.position.y) || 0,
            z: Number(snapshot.position.z) || 0,
        },
        rotation: {
            x: Number(snapshot.rotation.x) || 0,
            y: Number(snapshot.rotation.y) || 0,
            z: Number(snapshot.rotation.z) || 0,
        },
        scale: {
            x: Number(snapshot.scale.x) || 1,
            y: Number(snapshot.scale.y) || 1,
            z: Number(snapshot.scale.z) || 1,
        },
    };
    if (snapshot.quaternion) {
        base.quaternion = {
            x: snapshot.quaternion.x,
            y: snapshot.quaternion.y,
            z: snapshot.quaternion.z,
            w: snapshot.quaternion.w,
        };
    }

    if (snapshot.kind === "light") {
        return {
            ...base,
            lightType: snapshot.lightType || "point",
            lightAim: snapshot.lightAim === "negY" ? "negY" : "negZ",
            markerVisible: snapshot.markerVisible !== false,
            intensity: typeof snapshot.intensity === "number" ? snapshot.intensity : 1,
            spotAngle: typeof snapshot.spotAngle === "number" ? snapshot.spotAngle : undefined,
            spotPenumbra: typeof snapshot.spotPenumbra === "number" ? snapshot.spotPenumbra : undefined,
            shadowEnabled: !!snapshot.shadowEnabled,
            shadowOpacity:
                typeof snapshot.shadowOpacity === "number" ? snapshot.shadowOpacity : undefined,
        };
    }

    if (snapshot.kind === "stair") {
        return {
            ...base,
            kind: "stair",
            stairStepCount:
                typeof snapshot.stairStepCount === "number" ? snapshot.stairStepCount : undefined,
            stairThickness:
                typeof snapshot.stairThickness === "number" ? snapshot.stairThickness : undefined,
            stairShape: snapshot.stairShape === "circular" ? "circular" : "straight",
            stairRadius:
                typeof snapshot.stairRadius === "number" ? snapshot.stairRadius : undefined,
            stairArcDeg:
                typeof snapshot.stairArcDeg === "number" ? snapshot.stairArcDeg : undefined,
            collisionEnabled: !!snapshot.collisionEnabled,
            ...serializeObjectAppearance(snapshot, { defaultColor: "#8b9cb3" }),
        };
    }

    if (snapshot.kind === "landing") {
        return {
            ...base,
            kind: "landing",
            stairThickness:
                typeof snapshot.stairThickness === "number" ? snapshot.stairThickness : undefined,
            landingSize:
                typeof snapshot.landingSize === "number" ? snapshot.landingSize : undefined,
            landingWidth:
                typeof snapshot.landingWidth === "number" ? snapshot.landingWidth : undefined,
            landingDepth:
                typeof snapshot.landingDepth === "number" ? snapshot.landingDepth : undefined,
            collisionEnabled: !!snapshot.collisionEnabled,
            ...serializeObjectAppearance(snapshot, { defaultColor: "#8b9cb3" }),
        };
    }

    if (snapshot.kind === "tube") {
        return {
            ...base,
            kind: "tube",
            tubeLength:
                typeof snapshot.tubeLength === "number" ? snapshot.tubeLength : undefined,
            tubeRadius:
                typeof snapshot.tubeRadius === "number" ? snapshot.tubeRadius : undefined,
            tubeWall: typeof snapshot.tubeWall === "number" ? snapshot.tubeWall : undefined,
            tubeBendAngle:
                typeof snapshot.tubeBendAngle === "number" ? snapshot.tubeBendAngle : undefined,
            tubeBendRadius:
                typeof snapshot.tubeBendRadius === "number" ? snapshot.tubeBendRadius : undefined,
            tubeEntranceOrigin: !!snapshot.tubeEntranceOrigin,
            tubeCaps:
                snapshot.tubeCaps && typeof snapshot.tubeCaps === "object"
                    ? snapshot.tubeCaps
                    : undefined,
            collisionEnabled: !!snapshot.collisionEnabled,
            ...serializeObjectAppearance(snapshot),
        };
    }

    if (snapshot.kind === "architecture") {
        return {
            ...base,
            kind: "architecture",
            archLayout: normalizeArchLayout(snapshot.archLayout),
            archLength: typeof snapshot.archLength === "number" ? snapshot.archLength : undefined,
            archWidth: typeof snapshot.archWidth === "number" ? snapshot.archWidth : undefined,
            archHeight: typeof snapshot.archHeight === "number" ? snapshot.archHeight : undefined,
            archWall: typeof snapshot.archWall === "number" ? snapshot.archWall : undefined,
            archWingA: typeof snapshot.archWingA === "number" ? snapshot.archWingA : undefined,
            archWingB: typeof snapshot.archWingB === "number" ? snapshot.archWingB : undefined,
            archFloors: typeof snapshot.archFloors === "number" ? snapshot.archFloors : undefined,
            archCeiling: snapshot.archCeiling !== false,
            archPlinth: !!snapshot.archPlinth,
            archPlinthFloors: Array.isArray(snapshot.archPlinthFloors)
                ? snapshot.archPlinthFloors
                : snapshot.archPlinth
                  ? [0]
                  : [],
            archOpenings: Array.isArray(snapshot.archOpenings) ? snapshot.archOpenings : [],
            collisionEnabled: !!snapshot.collisionEnabled,
            ...serializeObjectAppearance(snapshot, { defaultColor: "#c8c2b4" }),
            archFaceTextures:
                snapshot.archFaceTextures && typeof snapshot.archFaceTextures === "object"
                    ? snapshot.archFaceTextures
                    : undefined,
        };
    }

    if (snapshot.kind === "boat") {
        return {
            ...base,
            kind: "boat",
            boatLength: typeof snapshot.boatLength === "number" ? snapshot.boatLength : undefined,
            boatWidth: typeof snapshot.boatWidth === "number" ? snapshot.boatWidth : undefined,
            boatFloat: snapshot.boatFloat !== false,
            boatDensity:
                typeof snapshot.boatDensity === "number" ? snapshot.boatDensity : undefined,
            boatShell:
                snapshot.boatShell === "imported" || snapshot.boatShell === "native"
                    ? snapshot.boatShell
                    : "procedural",
            boatBaseKind:
                typeof snapshot.boatBaseKind === "string" ? snapshot.boatBaseKind : undefined,
            importFormat:
                typeof snapshot.importFormat === "string" ? snapshot.importFormat : undefined,
            importName: typeof snapshot.importName === "string" ? snapshot.importName : undefined,
            importDataUrl: snapshot.importDataUrl || null,
            collisionEnabled: !!snapshot.collisionEnabled,
            ...serializeObjectAppearance(snapshot, { defaultColor: "#ffffff" }),
        };
    }

    if (snapshot.kind === "vegetation") {
        return {
            ...base,
            kind: "vegetation",
            vegetationType: snapshot.vegetationType || "tree",
            vegetationSeed:
                typeof snapshot.vegetationSeed === "number" ? snapshot.vegetationSeed : undefined,
            vegetationHeight:
                typeof snapshot.vegetationHeight === "number"
                    ? snapshot.vegetationHeight
                    : undefined,
            vegetationAssetId:
                typeof snapshot.vegetationAssetId === "string"
                    ? snapshot.vegetationAssetId
                    : undefined,
            vegetationBrightness:
                typeof snapshot.vegetationBrightness === "number"
                    ? snapshot.vegetationBrightness
                    : undefined,
            collisionEnabled: !!snapshot.collisionEnabled,
            shadowEnabled: !!snapshot.shadowEnabled,
            shadowOpacity:
                typeof snapshot.shadowOpacity === "number" ? snapshot.shadowOpacity : undefined,
            physicsEnabled: !!snapshot.physicsEnabled,
            physicsMass:
                typeof snapshot.physicsMass === "number" ? snapshot.physicsMass : undefined,
            physicsBounce:
                typeof snapshot.physicsBounce === "number" ? snapshot.physicsBounce : undefined,
        };
    }

    if (snapshot.kind === "csg") {
        return {
            ...base,
            kind: "csg",
            csgGeometry: snapshot.csgGeometry || null,
            collisionEnabled: !!snapshot.collisionEnabled,
            ...serializeObjectAppearance(snapshot),
        };
    }

    if (snapshot.kind === "imported") {
        return {
            ...base,
            kind: "imported",
            importFormat: snapshot.importFormat || "glb",
            importName: snapshot.importName || "Import",
            importDataUrl: snapshot.importDataUrl || null,
            collisionEnabled: !!snapshot.collisionEnabled,
            ...serializeObjectAppearance(snapshot, { colorOptional: true, includeTextures: false }),
            facePaint:
                snapshot.facePaint && typeof snapshot.facePaint === "object"
                    ? snapshot.facePaint
                    : undefined,
            facePbr:
                snapshot.facePbr && typeof snapshot.facePbr === "object"
                    ? snapshot.facePbr
                    : undefined,
            importAppearance:
                snapshot.importAppearance && typeof snapshot.importAppearance === "object"
                    ? snapshot.importAppearance
                    : undefined,
            meshSolidify: Array.isArray(snapshot.meshSolidify) ? snapshot.meshSolidify : undefined,
        };
    }

    return {
        ...base,
        kind:
            snapshot.kind === "sphere" ||
            snapshot.kind === "pyramid" ||
            snapshot.kind === "cylinder" ||
            snapshot.kind === "cone" ||
            snapshot.kind === "torus" ||
            snapshot.kind === "panel"
                ? snapshot.kind
                : base.kind,
        collisionEnabled: !!snapshot.collisionEnabled,
        ...serializeObjectAppearance(snapshot),
        facePaint:
            snapshot.facePaint && typeof snapshot.facePaint === "object"
                ? snapshot.facePaint
                : undefined,
        facePbr:
            snapshot.facePbr && typeof snapshot.facePbr === "object"
                ? snapshot.facePbr
                : undefined,
    };
}

/**
 * @param {unknown} raw
 * @param {number} [fallback]
 */
function readVec3(raw, fallback = 0) {
    if (Array.isArray(raw)) {
        return new THREE.Vector3(
            Number(raw[0]) || fallback,
            Number(raw[1]) || fallback,
            Number(raw[2]) || fallback
        );
    }
    if (raw && typeof raw === "object") {
        const vec = /** @type {{ x?: number, y?: number, z?: number }} */ (raw);
        return new THREE.Vector3(
            Number(vec.x) || fallback,
            Number(vec.y) || fallback,
            Number(vec.z) || fallback
        );
    }
    return new THREE.Vector3(fallback, fallback, fallback);
}

/**
 * @param {unknown} raw
 */
function readEuler(raw) {
    if (Array.isArray(raw)) {
        return new THREE.Euler(
            Number(raw[0]) || 0,
            Number(raw[1]) || 0,
            Number(raw[2]) || 0
        );
    }
    if (raw && typeof raw === "object") {
        const rot = /** @type {{ x?: number, y?: number, z?: number }} */ (raw);
        return new THREE.Euler(
            Number(rot.x) || 0,
            Number(rot.y) || 0,
            Number(rot.z) || 0
        );
    }
    return new THREE.Euler();
}

/**
 * @param {unknown} raw
 * @returns {import("three").Quaternion | null}
 */
function readQuaternion(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (Array.isArray(raw) && raw.length >= 4) {
        return new THREE.Quaternion(
            Number(raw[0]) || 0,
            Number(raw[1]) || 0,
            Number(raw[2]) || 0,
            Number(raw[3]) || 1
        );
    }
    const q = /** @type {{ x?: number, y?: number, z?: number, w?: number }} */ (raw);
    if (q.w === undefined && q.x === undefined) return null;
    return new THREE.Quaternion(
        Number(q.x) || 0,
        Number(q.y) || 0,
        Number(q.z) || 0,
        Number(q.w) || 1
    );
}

/**
 * @param {ReturnType<typeof serializeObjectSnapshot>} raw
 */
export function deserializeObjectSnapshot(raw) {
    const out = deserializeObjectSnapshotBody(raw);
    if (out && Array.isArray(raw?.triangleTextures) && raw.triangleTextures.length) {
        out.triangleTextures = raw.triangleTextures;
    }
    if (out && raw?.facePbr && typeof raw.facePbr === "object") {
        out.facePbr = raw.facePbr;
    }
    if (out && raw?.importAppearance && typeof raw.importAppearance === "object") {
        out.importAppearance = raw.importAppearance;
    }
    if (out && Array.isArray(raw?.meshSolidify) && raw.meshSolidify.length) {
        out.meshSolidify = raw.meshSolidify;
    }
    if (out && raw?.facePaint && typeof raw.facePaint === "object") {
        out.facePaint = raw.facePaint;
    }
    if (out && typeof raw?.sceneItemLabel === "string" && raw.sceneItemLabel.trim()) {
        out.sceneItemLabel = raw.sceneItemLabel.trim();
    }
    return out;
}

/**
 * @param {ReturnType<typeof serializeObjectSnapshot>} raw
 */
function deserializeObjectSnapshotBody(raw) {
    const kind =
        raw.kind === "light"
            ? "light"
            : raw.kind === "stair"
              ? "stair"
              : raw.kind === "landing"
                ? "landing"
              : raw.kind === "tube"
                ? "tube"
              : raw.kind === "architecture"
                ? "architecture"
              : raw.kind === "boat"
                ? "boat"
              : raw.kind === "vegetation"
                ? "vegetation"
                : raw.kind === "csg"
                  ? "csg"
                  : raw.kind === "imported"
                    ? "imported"
                    : raw.kind === "sphere"
                    ? "sphere"
                    : raw.kind === "pyramid"
                      ? "pyramid"
                      : raw.kind === "cylinder"
                        ? "cylinder"
                        : raw.kind === "cone"
                          ? "cone"
                          : raw.kind === "torus"
                            ? "torus"
                            : raw.kind === "panel"
                              ? "panel"
                              : "cube";
    const base = {
        kind,
        position: readVec3(raw.position),
        rotation: readEuler(raw.rotation),
        scale: readVec3(raw.scale, 1),
    };
    const quaternion = readQuaternion(raw.quaternion);
    if (quaternion) base.quaternion = quaternion;

    if (kind === "light") {
        const legacy = /** @type {{ type?: string, lightType?: string, lightAim?: string }} */ (raw);
        return {
            ...base,
            lightType: legacy.lightType || legacy.type || "point",
            // Absent = ancienne scène (cible sous le pivot).
            lightAim: legacy.lightAim === "negZ" ? "negZ" : "negY",
            markerVisible: raw.markerVisible !== false,
            intensity: typeof raw.intensity === "number" ? raw.intensity : 1,
            spotAngle: typeof raw.spotAngle === "number" ? raw.spotAngle : undefined,
            spotPenumbra: typeof raw.spotPenumbra === "number" ? raw.spotPenumbra : undefined,
            shadowEnabled: !!raw.shadowEnabled,
            shadowOpacity: typeof raw.shadowOpacity === "number" ? raw.shadowOpacity : undefined,
        };
    }

    if (kind === "stair") {
        const legacy = /** @type {{ collision?: boolean, texture?: string | null }} */ (raw);
        return {
            ...base,
            stairStepCount:
                typeof raw.stairStepCount === "number" ? raw.stairStepCount : undefined,
            stairThickness:
                typeof raw.stairThickness === "number" ? raw.stairThickness : undefined,
            stairShape: raw.stairShape === "circular" ? "circular" : "straight",
            stairRadius: typeof raw.stairRadius === "number" ? raw.stairRadius : undefined,
            stairArcDeg: typeof raw.stairArcDeg === "number" ? raw.stairArcDeg : undefined,
            collisionEnabled: !!(raw.collisionEnabled ?? legacy.collision ?? true),
            ...deserializeObjectAppearance(raw, { defaultColor: "#8b9cb3" }),
        };
    }

    if (kind === "landing") {
        const legacy = /** @type {{ collision?: boolean, texture?: string | null }} */ (raw);
        return {
            ...base,
            stairThickness:
                typeof raw.stairThickness === "number" ? raw.stairThickness : undefined,
            landingSize: typeof raw.landingSize === "number" ? raw.landingSize : undefined,
            landingWidth: typeof raw.landingWidth === "number" ? raw.landingWidth : undefined,
            landingDepth: typeof raw.landingDepth === "number" ? raw.landingDepth : undefined,
            collisionEnabled: !!(raw.collisionEnabled ?? legacy.collision ?? true),
            ...deserializeObjectAppearance(raw, { defaultColor: "#8b9cb3" }),
        };
    }

    if (kind === "tube") {
        const legacy = /** @type {{ collision?: boolean, texture?: string | null }} */ (raw);
        return {
            ...base,
            tubeLength: typeof raw.tubeLength === "number" ? raw.tubeLength : undefined,
            tubeRadius: typeof raw.tubeRadius === "number" ? raw.tubeRadius : undefined,
            tubeWall: typeof raw.tubeWall === "number" ? raw.tubeWall : undefined,
            tubeBendAngle: typeof raw.tubeBendAngle === "number" ? raw.tubeBendAngle : undefined,
            tubeBendRadius: typeof raw.tubeBendRadius === "number" ? raw.tubeBendRadius : undefined,
            tubeEntranceOrigin: !!raw.tubeEntranceOrigin,
            tubeCaps:
                raw.tubeCaps && typeof raw.tubeCaps === "object" ? raw.tubeCaps : undefined,
            collisionEnabled: !!(raw.collisionEnabled ?? legacy.collision ?? true),
            ...deserializeObjectAppearance(raw),
        };
    }

    if (kind === "architecture") {
        const legacy = /** @type {{ collision?: boolean, texture?: string | null }} */ (raw);
        return {
            ...base,
            kind: "architecture",
            archLayout: normalizeArchLayout(raw.archLayout),
            archLength: typeof raw.archLength === "number" ? raw.archLength : undefined,
            archWidth: typeof raw.archWidth === "number" ? raw.archWidth : undefined,
            archHeight: typeof raw.archHeight === "number" ? raw.archHeight : undefined,
            archWall: typeof raw.archWall === "number" ? raw.archWall : undefined,
            archWingA: typeof raw.archWingA === "number" ? raw.archWingA : undefined,
            archWingB: typeof raw.archWingB === "number" ? raw.archWingB : undefined,
            archFloors: typeof raw.archFloors === "number" ? raw.archFloors : undefined,
            archCeiling: raw.archCeiling !== false,
            archPlinth: !!raw.archPlinth,
            archPlinthFloors: Array.isArray(raw.archPlinthFloors)
                ? raw.archPlinthFloors
                : raw.archPlinth
                  ? [0]
                  : [],
            archOpenings: Array.isArray(raw.archOpenings) ? raw.archOpenings : [],
            collisionEnabled: !!(raw.collisionEnabled ?? legacy.collision ?? true),
            ...deserializeObjectAppearance(raw, { defaultColor: "#c8c2b4" }),
            archFaceTextures:
                raw.archFaceTextures && typeof raw.archFaceTextures === "object"
                    ? /** @type {Record<string, unknown>} */ (raw.archFaceTextures)
                    : undefined,
        };
    }

    if (kind === "boat") {
        return {
            ...base,
            boatLength: typeof raw.boatLength === "number" ? raw.boatLength : undefined,
            boatWidth: typeof raw.boatWidth === "number" ? raw.boatWidth : undefined,
            boatFloat: raw.boatFloat !== false,
            boatDensity: typeof raw.boatDensity === "number" ? raw.boatDensity : undefined,
            boatShell:
                raw.boatShell === "imported" || raw.boatShell === "native"
                    ? raw.boatShell
                    : "procedural",
            boatBaseKind: typeof raw.boatBaseKind === "string" ? raw.boatBaseKind : undefined,
            importFormat: typeof raw.importFormat === "string" ? raw.importFormat : undefined,
            importName: typeof raw.importName === "string" ? raw.importName : undefined,
            importDataUrl: raw.importDataUrl || null,
            collisionEnabled: !!(raw.collisionEnabled ?? true),
            ...deserializeObjectAppearance(raw, { defaultColor: "#ffffff" }),
        };
    }

    if (kind === "vegetation") {
        const legacy = /** @type {{ collision?: boolean }} */ (raw);
        return {
            ...base,
            vegetationType: raw.vegetationType || "tree",
            vegetationSeed:
                typeof raw.vegetationSeed === "number" ? raw.vegetationSeed : undefined,
            vegetationHeight:
                typeof raw.vegetationHeight === "number" ? raw.vegetationHeight : undefined,
            vegetationAssetId:
                typeof raw.vegetationAssetId === "string" ? raw.vegetationAssetId : undefined,
            vegetationBrightness:
                typeof raw.vegetationBrightness === "number" ? raw.vegetationBrightness : undefined,
            collisionEnabled: !!(raw.collisionEnabled ?? legacy.collision ?? false),
            shadowEnabled: !!raw.shadowEnabled,
            shadowOpacity: typeof raw.shadowOpacity === "number" ? raw.shadowOpacity : undefined,
            physicsEnabled: !!raw.physicsEnabled,
            physicsMass: typeof raw.physicsMass === "number" ? raw.physicsMass : undefined,
            physicsBounce: typeof raw.physicsBounce === "number" ? raw.physicsBounce : undefined,
        };
    }

    if (kind === "csg") {
        return {
            ...base,
            csgGeometry: raw.csgGeometry && typeof raw.csgGeometry === "object" ? raw.csgGeometry : null,
            collisionEnabled: !!raw.collisionEnabled,
            ...deserializeObjectAppearance(raw),
        };
    }

    if (kind === "imported") {
        return {
            ...base,
            importFormat: typeof raw.importFormat === "string" ? raw.importFormat : "glb",
            importName: typeof raw.importName === "string" ? raw.importName : "Import",
            importDataUrl: typeof raw.importDataUrl === "string" ? raw.importDataUrl : null,
            collisionEnabled: !!raw.collisionEnabled,
            ...deserializeObjectAppearance(raw, { colorOptional: true, includeTextures: false }),
            facePaint:
                raw.facePaint && typeof raw.facePaint === "object" ? raw.facePaint : undefined,
            facePbr:
                raw.facePbr && typeof raw.facePbr === "object"
                    ? /** @type {Record<string, object>} */ (raw.facePbr)
                    : undefined,
            importAppearance:
                raw.importAppearance && typeof raw.importAppearance === "object"
                    ? raw.importAppearance
                    : undefined,
            meshSolidify: Array.isArray(raw.meshSolidify) ? raw.meshSolidify : undefined,
        };
    }

    const legacy = /** @type {{ collision?: boolean, texture?: string | null }} */ (raw);
    return {
        ...base,
        collisionEnabled: !!(raw.collisionEnabled ?? legacy.collision),
        ...deserializeObjectAppearance(raw),
        facePaint:
            raw.facePaint && typeof raw.facePaint === "object"
                ? /** @type {Record<string, string>} */ (raw.facePaint)
                : undefined,
        facePbr:
            raw.facePbr && typeof raw.facePbr === "object"
                ? /** @type {Record<string, object>} */ (raw.facePbr)
                : undefined,
    };
}

/**
 * @param {ReturnType<typeof serializeObjectSnapshot>[]} objects
 * @param {{ name?: string, terrain?: object | null, ocean?: object | null, river?: object | null, skybox?: object | null, vegetationAssets?: object | null, view?: object | null }} [options]
 */
export function buildSceneDocument(
    objects,
    { name = "", terrain = null, ocean = null, river = null, skybox = null, vegetationAssets = null, view = null } = {}
) {
    return {
        version: SCENE_VERSION,
        name,
        objects,
        terrain,
        ocean,
        river,
        skybox,
        vegetationAssets,
        view,
    };
}

/**
 * @param {unknown} data
 * @returns {ReturnType<typeof deserializeObjectSnapshot>[]}
 */
export function parseSceneDocument(data) {
    /** @type {unknown[]} */
    let entries;
    if (Array.isArray(data)) {
        entries = data;
    } else if (data && typeof data === "object") {
        const doc = /** @type {{ objects?: unknown[] }} */ (data);
        if (!Array.isArray(doc.objects)) {
            throw new Error("Format de scène invalide (liste d'objets manquante).");
        }
        entries = doc.objects;
    } else {
        throw new Error("Fichier de scène invalide.");
    }

    return entries.map((entry, index) => {
        const raw = /** @type {ReturnType<typeof serializeObjectSnapshot>} */ (entry);
        if (!raw?.position || !raw?.rotation || !raw?.scale) {
            throw new Error(`Objet incomplet dans le fichier (index ${index}).`);
        }
        return deserializeObjectSnapshot(raw);
    });
}

export function getCurrentSceneFileName() {
    return currentFileName;
}

export function setCurrentSceneFileName(name) {
    currentFileName = name ? normalizeFilename(name) : null;
}

export function clearSceneFileSession() {
    currentFileName = null;
    diskFileHandle = null;
}

export function supportsDiskFilePicker() {
    return typeof window.showSaveFilePicker === "function"
        && typeof window.showOpenFilePicker === "function";
}

export function hasDiskFileHandle() {
    return diskFileHandle !== null;
}

function normalizeFilename(name) {
    const trimmed = (name || DEFAULT_FILENAME).trim() || DEFAULT_FILENAME;
    return trimmed.endsWith(".json") ? trimmed : `${trimmed}.json`;
}

function serializeDocument(data) {
    return JSON.stringify(data, null, 2);
}

/**
 * @returns {Promise<IDBDatabase>}
 */
function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(DB_STORE)) {
                db.createObjectStore(DB_STORE, { keyPath: "name" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB indisponible"));
    });
}

/**
 * @returns {Promise<{ name: string, data: object, updatedAt: number }[]>}
 */
export async function listSavedScenes() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const store = tx.objectStore(DB_STORE);
        const request = store.getAll();
        request.onsuccess = () => {
            const rows = /** @type {{ name: string, data: object, updatedAt: number }[]} */ (request.result || []);
            rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            resolve(rows);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * @param {string} name
 * @param {object} data
 */
export async function saveSceneToLibrary(name, data) {
    const filename = normalizeFilename(name);
    /** Clone JSON strict — IndexedDB refuse certains objets non structurés. */
    let payload;
    try {
        payload = JSON.parse(serializeDocument(data));
    } catch (error) {
        throw new Error(
            error instanceof Error
                ? `Scène non enregistrable : ${error.message}`
                : "Scène non sérialisable en JSON."
        );
    }
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).put({
            name: filename,
            data: payload,
            updatedAt: Date.now(),
        });
        tx.oncomplete = () => resolve(filename);
        tx.onerror = () =>
            reject(tx.error ?? new Error("Échec d'écriture IndexedDB (quota ou navigateur)."));
    });
}

/**
 * @param {string} name
 * @returns {Promise<object | null>}
 */
export async function loadSceneFromLibrary(name) {
    const filename = normalizeFilename(name);
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const request = tx.objectStore(DB_STORE).get(filename);
        request.onsuccess = () => {
            const row = /** @type {{ data?: object } | undefined} */ (request.result);
            resolve(row?.data ?? null);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Export silencieux vers le dossier Téléchargements (sans boîte de dialogue).
 * @param {object} data
 * @param {string} filename
 */
export function downloadSceneJson(data, filename = DEFAULT_FILENAME) {
    const blob = new Blob([serializeDocument(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = normalizeFilename(filename);
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

/**
 * @param {FileSystemFileHandle} handle
 * @param {object} data
 */
async function writeToDiskHandle(handle, data) {
    const writable = await handle.createWritable();
    await writable.write(serializeDocument(data));
    await writable.close();
}

/**
 * Enregistre sur le disque dur (explorateur de fichiers).
 * @param {object} data
 * @param {{ saveAs?: boolean, suggestedName?: string | null }} [opts]
 */
export async function saveSceneToDiskLocation(data, { saveAs = false, suggestedName = null } = {}) {
    const suggested = normalizeFilename(suggestedName || currentFileName || DEFAULT_FILENAME);

    if (supportsDiskFilePicker()) {
        try {
            if (!saveAs && diskFileHandle) {
                await writeToDiskHandle(diskFileHandle, data);
                currentFileName = diskFileHandle.name;
                await saveSceneToLibrary(currentFileName, data);
                return { name: currentFileName, onDisk: true };
            }

            const handle = await window.showSaveFilePicker({
                suggestedName: suggested,
                types: FILE_TYPES,
            });
            await writeToDiskHandle(handle, data);
            diskFileHandle = handle;
            currentFileName = handle.name;
            await saveSceneToLibrary(currentFileName, data);
            return { name: handle.name, onDisk: true };
        } catch (error) {
            if (/** @type {DOMException} */ (error).name === "AbortError") throw error;
        }
    }

    downloadSceneJson(data, suggested);
    currentFileName = suggested;
    diskFileHandle = null;
    await saveSceneToLibrary(currentFileName, data);
    return { name: currentFileName, onDisk: false };
}

/**
 * Ouvre une scène depuis le disque dur (explorateur de fichiers).
 * @returns {Promise<{ name: string, data: object } | null>}
 */
export async function openSceneFromDiskLocation() {
    if (supportsDiskFilePicker()) {
        try {
            const [handle] = await window.showOpenFilePicker({
                types: FILE_TYPES,
                multiple: false,
            });
            const file = await handle.getFile();
            let data;
            try {
                data = JSON.parse(await file.text());
            } catch {
                throw new Error("Fichier JSON illisible ou invalide.");
            }
            diskFileHandle = handle;
            currentFileName = handle.name;
            return { name: handle.name, data };
        } catch (error) {
            if (/** @type {DOMException} */ (error).name === "AbortError") return null;
            throw error;
        }
    }

    return pickSceneJsonFileLegacy();
}

/**
 * @returns {Promise<{ name: string, data: unknown } | null>}
 */
function pickSceneJsonFileLegacy() {
    return new Promise((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";
        input.style.display = "none";
        document.body.appendChild(input);

        let settled = false;
        const cleanup = () => {
            input.remove();
            window.removeEventListener("focus", onWindowFocus);
        };
        const settle = (fn) => {
            if (settled) return;
            settled = true;
            cleanup();
            fn();
        };
        // Certains navigateurs n’émettent jamais « cancel » : au retour du
        // focus, si « change » n’arrive pas, on résout null (sinon l’await
        // appelant resterait bloqué pour toujours).
        const onWindowFocus = () => {
            setTimeout(() => settle(() => resolve(null)), 800);
        };

        input.addEventListener("change", () => {
            const file = input.files?.[0];
            if (!file) {
                settle(() => resolve(null));
                return;
            }
            if (settled) return;
            settled = true;
            window.removeEventListener("focus", onWindowFocus);

            const reader = new FileReader();
            reader.onload = () => {
                input.remove();
                try {
                    diskFileHandle = null;
                    currentFileName = file.name;
                    resolve({
                        name: file.name,
                        data: JSON.parse(String(reader.result)),
                    });
                } catch {
                    reject(new Error("Fichier JSON illisible ou invalide."));
                }
            };
            reader.onerror = () => {
                input.remove();
                reject(new Error("Impossible de lire le fichier."));
            };
            reader.readAsText(file);
        });

        input.addEventListener("cancel", () => {
            settle(() => resolve(null));
        });

        window.addEventListener("focus", onWindowFocus, { once: true });
        input.click();
    });
}

/**
 * @param {object} data
 * @param {{ saveAs?: boolean, suggestedName?: string | null, askName: (suggested: string) => Promise<string | null> }} opts
 */
export async function writeSceneToLibrary(data, { saveAs = false, suggestedName = null, askName }) {
    const suggested = normalizeFilename(suggestedName || currentFileName || DEFAULT_FILENAME);
    let filename = suggested;

    if (saveAs || !currentFileName) {
        const input = await askName(suggested);
        if (input === null) {
            throw new DOMException("Annulé", "AbortError");
        }
        filename = normalizeFilename(input);
    }

    await saveSceneToLibrary(filename, data);
    currentFileName = filename;
    // Téléchargement = copie de secours (peut être bloqué par le navigateur).
    try {
        downloadSceneJson(data, filename);
    } catch (error) {
        console.warn("[lab] téléchargement scène bloqué :", error);
    }
    return { name: filename };
}

/**
 * @param {(scenes: { name: string, updatedAt?: number }[]) => Promise<string | null>} pickScene
 * @returns {Promise<{ name: string, data: object } | null>}
 */
export async function readSceneFromLibrary(pickScene) {
    const scenes = await listSavedScenes();
    const pickedName = await pickScene(scenes.map(({ name, updatedAt }) => ({ name, updatedAt })));
    if (!pickedName) return null;

    const data = await loadSceneFromLibrary(pickedName);
    if (!data) {
        throw new Error("Scène introuvable dans la bibliothèque.");
    }

    currentFileName = normalizeFilename(pickedName);
    return { name: currentFileName, data };
}

export { DEFAULT_FILENAME };
