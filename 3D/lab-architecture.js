/** Architecture — pièce intérieure paramétrique (murs / sol / plafond + portes & fenêtres). */
import * as THREE from "three";

export const LAB_ARCHITECTURE_KEY = "labArchitecture";
export const LAB_ARCH_OPENING_FILL_KEY = "labArchOpeningFill";
export const ARCH_LENGTH_KEY = "archLength";
export const ARCH_WIDTH_KEY = "archWidth";
export const ARCH_HEIGHT_KEY = "archHeight";
export const ARCH_WALL_KEY = "archWall";
export const ARCH_CEILING_KEY = "archCeiling";
export const ARCH_PLINTH_KEY = "archPlinth";
/** Étages (0-based) qui ont des plinthes. */
export const ARCH_PLINTH_FLOORS_KEY = "archPlinthFloors";
export const ARCH_OPENINGS_KEY = "archOpenings";
export const ARCH_LAYOUT_KEY = "archLayout";
/** Profondeur aile sud (L/U) ou taille cour X (patio). */
export const ARCH_WING_A_KEY = "archWingA";
/** Largeur aile ouest (L), ailes latérales (U) ou taille cour Z (patio). */
export const ARCH_WING_B_KEY = "archWingB";
/** Nombre d’étages (toutes les pièces architecture). */
export const ARCH_FLOORS_KEY = "archFloors";

/** @typedef {"rect" | "L" | "U" | "patio"} ArchLayout */

export const ARCH_LAYOUT_LABELS = {
    rect: "Pièce unique",
    L: "Pièce en L",
    U: "Pièce en U",
    patio: "Patio",
};

export const ARCH_DEFAULT_LENGTH = 4;
export const ARCH_DEFAULT_WIDTH = 3;
export const ARCH_DEFAULT_HEIGHT = 2.5;
export const ARCH_DEFAULT_WALL = 0.15;
export const ARCH_MIN_LENGTH = 1.5;
export const ARCH_MAX_LENGTH = 40;
export const ARCH_MIN_WIDTH = 1.5;
export const ARCH_MAX_WIDTH = 40;
export const ARCH_MIN_HEIGHT = 1.8;
export const ARCH_MAX_HEIGHT = 8;
export const ARCH_MIN_WALL = 0.08;
export const ARCH_MAX_WALL = 0.6;
export const ARCH_MIN_WING = 1.2;
export const ARCH_DEFAULT_WING_A = 2.4;
export const ARCH_DEFAULT_WING_B = 2.4;
export const ARCH_MIN_FLOORS = 1;
export const ARCH_MAX_FLOORS = 100;
export const ARCH_DEFAULT_FLOORS = 1;

/**
 * Identifiants de mur perforables (façades + segments L/U/Patio).
 * @typedef {"north"|"south"|"east"|"west"|"north-west"|"north-east"|"east-notch"|"north-notch"|"court-north"|"court-south"|"court-east"|"court-west"} ArchWallId
 */

export const ARCH_WALL_IDS = /** @type {const} */ ([
    "north",
    "south",
    "east",
    "west",
    "north-west",
    "north-east",
    "east-notch",
    "north-notch",
    "court-north",
    "court-south",
    "court-east",
    "court-west",
]);

/** Libellés FR pour menu / statut. */
export const ARCH_WALL_LABELS = {
    north: "Nord",
    south: "Sud",
    east: "Est",
    west: "Ouest",
    "north-west": "Nord — aile ouest",
    "north-east": "Nord — aile est",
    "east-notch": "Est — encoche",
    "north-notch": "Nord — encoche",
    "court-north": "Cour — nord",
    "court-south": "Cour — sud",
    "court-east": "Cour — est",
    "court-west": "Cour — ouest",
    floor: "Sol",
    ceiling: "Plafond",
};

/** Regex mesh : plus longs IDs d’abord. */
const ARCH_WALL_NAME_RE =
    /^arch-wall-(north-west|north-east|north-notch|east-notch|court-north|court-south|court-east|court-west|north|south|east|west)/;

/** Surface logique pour textures continues (murs / sol / plafond). */
export const ARCH_SURFACE_KEY = "archSurface";
/** Étage (0 = RDC) associé à un mesh mur / dalle. */
export const ARCH_STORY_KEY = "archStory";
/** Maps Face posées par surface (couleur/normal/spéculaire partagés entre panneaux). */
export const ARCH_SURFACE_TEX_KEY = "_labArchSurfaceTextures";
/** Mesh marqué comme texturé en mode Face surface (évite XYZ / multi-matériaux peinture). */
export const ARCH_SURFACE_TEXTURED_KEY = "_labArchSurfaceTextured";

/** Marge minimale aux bords du mur (m). */
export const ARCH_OPENING_EDGE = 0.08;
/** Espace solide minimal entre deux ouvertures (m). */
export const ARCH_OPENING_GAP = 0.15;

/** Épaisseur plancher entre étages (m). */
export const ARCH_FLOOR_THICKNESS = 0.12;
const FLOOR_THICKNESS = ARCH_FLOOR_THICKNESS;
const CEILING_THICKNESS = 0.1;
/** Hauteur de plinthe (m) — bande visible en bas du mur. */
const PLINTH_HEIGHT = 0.1;
/** Épaisseur / saillie intérieure de plinthe (m) = 1 cm. */
const PLINTH_DEPTH = 0.01;
const DEFAULT_COLOR = "#c8c2b4";
const DEFAULT_ROUGHNESS = 0.78;
const DEFAULT_METALNESS = 0.02;
const PLINTH_COLOR = "#5c5348";

/**
 * @typedef {{
 *   id: string,
 *   type: "door" | "window" | "hole",
 *   wall: ArchWallId | "floor" | "ceiling",
 *   offset: number,
 *   offsetZ: number,
 *   width: number,
 *   height: number,
 *   sill: number,
 *   floor: number,
 *   fill?: "simple" | "imported" | "none",
 *   importDataUrl?: string,
 *   importFormat?: string,
 *   importName?: string,
 *   fillTx?: {
 *     x: number, y: number, z: number,
 *     qx: number, qy: number, qz: number, qw: number,
 *     sx: number, sy: number, sz: number,
 *   },
 *   fillColor?: string,
 * }} ArchOpening
 */

/** @type {Map<string, THREE.Object3D>} */
const archOpeningImportCache = new Map();

/**
 * @param {string} dataUrl
 * @param {string} [format]
 */
export function archOpeningImportKey(dataUrl, format = "glb") {
    const url = String(dataUrl || "");
    return `${format}:${url.length}:${url.slice(0, 48)}:${url.slice(-24)}`;
}

/**
 * @param {string} dataUrl
 * @param {string} format
 * @param {THREE.Object3D} root
 */
export function setArchOpeningImportTemplate(dataUrl, format, root) {
    if (!dataUrl || !root) return;
    archOpeningImportCache.set(archOpeningImportKey(dataUrl, format || "glb"), root);
}

/**
 * @param {string} dataUrl
 * @param {string} [format]
 * @returns {THREE.Object3D | null}
 */
export function getArchOpeningImportTemplate(dataUrl, format = "glb") {
    if (!dataUrl) return null;
    return archOpeningImportCache.get(archOpeningImportKey(dataUrl, format)) || null;
}

/**
 * Comparaison légère (évite de stringify un GLB base64 à chaque slider).
 * @param {unknown} openings
 */
export function archOpeningsSignature(openings) {
    if (!Array.isArray(openings)) return "[]";
    return JSON.stringify(
        openings.map((raw) => {
            const o = /** @type {Record<string, unknown>} */ (raw || {});
            const url = typeof o.importDataUrl === "string" ? o.importDataUrl : "";
            return {
                id: o.id,
                type: o.type,
                wall: o.wall,
                offset: o.offset,
                offsetZ: o.offsetZ,
                width: o.width,
                height: o.height,
                sill: o.sill,
                floor: o.floor,
                fill: o.fill || "simple",
                importFormat: o.importFormat || "",
                importName: o.importName || "",
                importLen: url.length,
                importHead: url.slice(0, 24),
                importTail: url.slice(-16),
                fillTx: o.fillTx || null,
                fillColor: o.fillColor || "",
            };
        })
    );
}

/**
 * @param {THREE.Object3D | null | undefined} object
 */
export function isLabArchitecture(object) {
    return !!object?.userData?.[LAB_ARCHITECTURE_KEY];
}

/**
 * Porte / fenêtre (remplissage) sélectionnable indépendamment du mur.
 * @param {THREE.Object3D | null | undefined} object
 */
export function isLabArchOpeningFill(object) {
    return !!object?.userData?.[LAB_ARCH_OPENING_FILL_KEY];
}

/**
 * @param {THREE.Object3D | null | undefined} node
 * @returns {THREE.Object3D | null}
 */
export function findArchOpeningFillAncestor(node) {
    let current = node || null;
    while (current) {
        if (isLabArchOpeningFill(current)) return current;
        current = current.parent;
    }
    return null;
}

/**
 * @param {THREE.Object3D | null | undefined} fill
 * @returns {THREE.Object3D | null}
 */
export function getArchHostFromFill(fill) {
    let current = fill || null;
    while (current) {
        if (isLabArchitecture(current)) return current;
        current = current.parent;
    }
    return null;
}

/**
 * @param {THREE.Object3D} room
 * @param {string} openingId
 * @returns {THREE.Object3D | null}
 */
export function findArchOpeningFill(room, openingId) {
    if (!room || !openingId) return null;
    /** @type {THREE.Object3D | null} */
    let found = null;
    room.traverse((node) => {
        if (found) return;
        if (isLabArchOpeningFill(node) && node.userData?.archOpeningId === openingId) {
            found = node;
        }
    });
    return found;
}

/**
 * @param {THREE.Object3D} pivot
 */
export function readArchOpeningFillTx(pivot) {
    return {
        x: pivot.position.x,
        y: pivot.position.y,
        z: pivot.position.z,
        qx: pivot.quaternion.x,
        qy: pivot.quaternion.y,
        qz: pivot.quaternion.z,
        qw: pivot.quaternion.w,
        sx: pivot.scale.x,
        sy: pivot.scale.y,
        sz: pivot.scale.z,
    };
}

/**
 * @param {unknown} raw
 */
function normalizeFillTx(raw) {
    if (!raw || typeof raw !== "object") return undefined;
    const o = /** @type {Record<string, unknown>} */ (raw);
    const x = Number(o.x) || 0;
    const y = Number(o.y) || 0;
    const z = Number(o.z) || 0;
    const qx = Number(o.qx) || 0;
    const qy = Number(o.qy) || 0;
    const qz = Number(o.qz) || 0;
    const qw = Number.isFinite(Number(o.qw)) ? Number(o.qw) : 1;
    const sx = Number.isFinite(Number(o.sx)) ? Number(o.sx) : 1;
    const sy = Number.isFinite(Number(o.sy)) ? Number(o.sy) : 1;
    const sz = Number.isFinite(Number(o.sz)) ? Number(o.sz) : 1;
    const identity =
        Math.abs(x) < 1e-6 &&
        Math.abs(y) < 1e-6 &&
        Math.abs(z) < 1e-6 &&
        Math.abs(qx) < 1e-6 &&
        Math.abs(qy) < 1e-6 &&
        Math.abs(qz) < 1e-6 &&
        Math.abs(qw - 1) < 1e-6 &&
        Math.abs(sx - 1) < 1e-6 &&
        Math.abs(sy - 1) < 1e-6 &&
        Math.abs(sz - 1) < 1e-6;
    if (identity) return undefined;
    return { x, y, z, qx, qy, qz, qw, sx, sy, sz };
}

/**
 * @param {THREE.Object3D} pivot
 * @param {ArchOpening["fillTx"]} tx
 */
function applyArchOpeningFillTx(pivot, tx) {
    const n = normalizeFillTx(tx);
    if (!n) {
        pivot.position.set(0, 0, 0);
        pivot.quaternion.identity();
        pivot.scale.set(1, 1, 1);
        return;
    }
    pivot.position.set(n.x, n.y, n.z);
    pivot.quaternion.set(n.qx, n.qy, n.qz, n.qw);
    pivot.scale.set(n.sx, n.sy, n.sz);
}

/**
 * @param {number} value
 */
export function clampArchLength(value) {
    const v = Number(value);
    if (!Number.isFinite(v)) return ARCH_DEFAULT_LENGTH;
    return THREE.MathUtils.clamp(v, ARCH_MIN_LENGTH, ARCH_MAX_LENGTH);
}

/**
 * @param {number} value
 */
export function clampArchWidth(value) {
    const v = Number(value);
    if (!Number.isFinite(v)) return ARCH_DEFAULT_WIDTH;
    return THREE.MathUtils.clamp(v, ARCH_MIN_WIDTH, ARCH_MAX_WIDTH);
}

/**
 * @param {number} value
 */
export function clampArchHeight(value) {
    const v = Number(value);
    if (!Number.isFinite(v)) return ARCH_DEFAULT_HEIGHT;
    return THREE.MathUtils.clamp(v, ARCH_MIN_HEIGHT, ARCH_MAX_HEIGHT);
}

/**
 * @param {number} value
 */
export function clampArchWall(value) {
    const v = Number(value);
    if (!Number.isFinite(v)) return ARCH_DEFAULT_WALL;
    return THREE.MathUtils.clamp(v, ARCH_MIN_WALL, ARCH_MAX_WALL);
}

/**
 * @param {unknown} wall
 * @returns {ArchWallId}
 */
export function normalizeArchWall(wall) {
    if (typeof wall === "string" && ARCH_WALL_IDS.includes(/** @type {any} */ (wall))) {
        return /** @type {ArchWallId} */ (wall);
    }
    return "south";
}

/**
 * @param {unknown} surface
 * @returns {boolean}
 */
export function isArchSlabSurface(surface) {
    return surface === "floor" || surface === "ceiling";
}

/**
 * Mur orienté selon Z (façade Est/Ouest) → UV le long de Z.
 * @param {string | null | undefined} surfaceId
 */
export function isArchWallAlongZ(surfaceId) {
    const id = String(surfaceId || "").replace(/^plinth-/, "");
    return (
        id === "east" ||
        id === "west" ||
        id === "east-notch" ||
        id === "court-east" ||
        id === "court-west"
    );
}

/**
 * Mur ou dalle (sol / plafond) pour une ouverture.
 * @param {unknown} surface
 * @returns {ArchWallId | "floor" | "ceiling"}
 */
export function normalizeArchSurface(surface) {
    if (surface === "floor" || surface === "ceiling") return surface;
    return normalizeArchWall(surface);
}

/**
 * Options de cible d’ouverture selon le plan.
 * @param {unknown} layout
 * @returns {{ value: string, label: string }[]}
 */
export function getArchTargetWallOptions(layout) {
    const kind = normalizeArchLayout(layout);
    /** @type {string[]} */
    let walls = ["south", "north", "east", "west"];
    if (kind === "L") {
        walls = ["south", "west", "east", "north", "east-notch", "north-notch"];
    } else if (kind === "U") {
        walls = [
            "south",
            "west",
            "east",
            "north-west",
            "north-east",
            "court-east",
            "court-west",
            "court-south",
        ];
    } else if (kind === "patio") {
        walls = [
            "south",
            "north",
            "east",
            "west",
            "court-south",
            "court-north",
            "court-east",
            "court-west",
        ];
    }
    return [
        ...walls.map((value) => ({
            value,
            label: ARCH_WALL_LABELS[value] || value,
        })),
        { value: "floor", label: ARCH_WALL_LABELS.floor },
        { value: "ceiling", label: ARCH_WALL_LABELS.ceiling },
    ];
}

/**
 * @param {THREE.Object3D} object
 */
export function getArchLength(object) {
    return clampArchLength(object?.userData?.[ARCH_LENGTH_KEY] ?? ARCH_DEFAULT_LENGTH);
}

/**
 * @param {THREE.Object3D} object
 */
export function getArchWidth(object) {
    return clampArchWidth(object?.userData?.[ARCH_WIDTH_KEY] ?? ARCH_DEFAULT_WIDTH);
}

/**
 * @param {THREE.Object3D} object
 */
export function getArchHeight(object) {
    return clampArchHeight(object?.userData?.[ARCH_HEIGHT_KEY] ?? ARCH_DEFAULT_HEIGHT);
}

/**
 * @param {THREE.Object3D} object
 */
export function getArchWall(object) {
    return clampArchWall(object?.userData?.[ARCH_WALL_KEY] ?? ARCH_DEFAULT_WALL);
}

/**
 * @param {THREE.Object3D} object
 */
export function getArchHasCeiling(object) {
    return object?.userData?.[ARCH_CEILING_KEY] !== false;
}

/**
 * Liste d’étages (0-based) avec plinthes.
 * @param {unknown} raw
 * @param {number} [floorCount]
 * @returns {number[]}
 */
export function normalizeArchPlinthFloors(raw, floorCount = ARCH_MAX_FLOORS) {
    const maxStory = Math.max(0, (Number(floorCount) || ARCH_MAX_FLOORS) - 1);
    if (!Array.isArray(raw)) return [];
    /** @type {Set<number>} */
    const set = new Set();
    for (const item of raw) {
        const n = Number(item);
        if (!Number.isFinite(n)) continue;
        const story = n | 0;
        if (story >= 0 && story <= maxStory) set.add(story);
    }
    return [...set].sort((a, b) => a - b);
}

/**
 * @param {THREE.Object3D} object
 * @returns {number[]}
 */
export function getArchPlinthFloors(object) {
    const floors = getArchFloors(object);
    const raw = object?.userData?.[ARCH_PLINTH_FLOORS_KEY];
    if (Array.isArray(raw)) return normalizeArchPlinthFloors(raw, floors);
    // Ancien booléen : plinthes au RDC uniquement.
    if (object?.userData?.[ARCH_PLINTH_KEY]) return [0];
    return [];
}

/**
 * @param {THREE.Object3D} object
 * @param {number} floor
 */
export function hasArchPlinthOnFloor(object, floor) {
    const story = Math.max(0, Number(floor) | 0);
    return getArchPlinthFloors(object).includes(story);
}

/**
 * @param {THREE.Object3D} object
 */
export function getArchHasPlinth(object) {
    return getArchPlinthFloors(object).length > 0;
}

/**
 * @param {number} value
 * @param {number} [maxSpan]
 */
export function clampArchWingA(value, maxSpan = ARCH_MAX_WIDTH) {
    const v = Number(value);
    const max = Math.max(ARCH_MIN_WING, Number(maxSpan) - ARCH_MIN_WING);
    if (!Number.isFinite(v)) return Math.min(ARCH_DEFAULT_WING_A, max);
    return THREE.MathUtils.clamp(v, ARCH_MIN_WING, max);
}

/**
 * @param {number} value
 * @param {number} [maxSpan]
 */
export function clampArchWingB(value, maxSpan = ARCH_MAX_LENGTH) {
    const v = Number(value);
    const max = Math.max(ARCH_MIN_WING, Number(maxSpan) - ARCH_MIN_WING);
    if (!Number.isFinite(v)) return Math.min(ARCH_DEFAULT_WING_B, max);
    return THREE.MathUtils.clamp(v, ARCH_MIN_WING, max);
}

/**
 * @param {number} value
 */
export function clampArchFloors(value) {
    const v = Math.round(Number(value));
    if (!Number.isFinite(v)) return ARCH_DEFAULT_FLOORS;
    return THREE.MathUtils.clamp(v, ARCH_MIN_FLOORS, ARCH_MAX_FLOORS);
}

/**
 * @param {THREE.Object3D} object
 */
export function getArchWingA(object) {
    const width = getArchWidth(object);
    const layout = getArchLayout(object);
    const fallback =
        layout === "patio" ? Math.min(3.2, width * 0.4) : Math.min(ARCH_DEFAULT_WING_A, width * 0.5);
    return clampArchWingA(object?.userData?.[ARCH_WING_A_KEY] ?? fallback, width);
}

/**
 * @param {THREE.Object3D} object
 */
export function getArchWingB(object) {
    const length = getArchLength(object);
    const layout = getArchLayout(object);
    const fallback =
        layout === "patio" ? Math.min(3.2, length * 0.4) : Math.min(ARCH_DEFAULT_WING_B, length * 0.5);
    return clampArchWingB(object?.userData?.[ARCH_WING_B_KEY] ?? fallback, length);
}

/**
 * @param {THREE.Object3D} object
 */
export function getArchFloors(object) {
    return clampArchFloors(object?.userData?.[ARCH_FLOORS_KEY] ?? ARCH_DEFAULT_FLOORS);
}

/**
 * Pas vertical entre niveaux (hauteur sous plafond + épaisseur plancher).
 * @param {THREE.Object3D} room
 */
export function getArchStoryPitch(room) {
    return getArchHeight(room) + FLOOR_THICKNESS;
}

/**
 * Étage 0-based depuis un mesh (userData ou nom).
 * @param {THREE.Object3D | null | undefined} mesh
 * @returns {number | null}
 */
export function getArchStoryFromMesh(mesh) {
    if (!mesh) return null;
    const tagged = mesh.userData?.[ARCH_STORY_KEY];
    if (Number.isFinite(Number(tagged))) return Math.max(0, Number(tagged) | 0);
    const name = String(mesh.name || "");
    const floorM = /^arch-floor-(\d+)/.exec(name);
    if (floorM) return Math.max(0, Number(floorM[1]) | 0);
    const wallM =
        /^arch-wall-(?:north-west|north-east|north-notch|east-notch|court-north|court-south|court-east|court-west|north|south|east|west)-(\d+)(?:-|$)/.exec(
            name
        );
    if (wallM) return Math.max(0, Number(wallM[1]) | 0);
    return null;
}

/**
 * Estime l’étage depuis Y local pièce (repère marche).
 * @param {THREE.Object3D} room
 * @param {number} localY
 */
export function estimateArchStoryFromLocalY(room, localY) {
    const pitch = getArchStoryPitch(room);
    const maxStory = Math.max(0, getArchFloors(room) - 1);
    if (!(pitch > 0.01)) return 0;
    const y = Number(localY);
    if (!Number.isFinite(y)) return 0;
    return THREE.MathUtils.clamp(Math.floor(Math.max(0, y) / pitch), 0, maxStory);
}

/**
 * Centre + axe d’un mur (offset = coord − center).
 * @param {THREE.Object3D} room
 * @param {unknown} wall
 * @returns {{ along: "x" | "z", center: number }}
 */
export function getArchWallFrame(room, wall) {
    const w = normalizeArchWall(wall);
    const layout = getArchLayout(room);
    const length = getArchLength(room);
    const width = getArchWidth(room);
    const halfL = length / 2;
    const halfW = width / 2;
    const wingA = getArchWingA(room);
    const wingB = getArchWingB(room);

    if (layout === "L") {
        const southD = clampArchWingA(wingA, width);
        const westW = clampArchWingB(wingB, length);
        const notchL = Math.max(ARCH_MIN_WING, length - westW);
        const notchW = Math.max(ARCH_MIN_WING, width - southD);
        if (w === "east") return { along: "z", center: -halfW + southD / 2 };
        if (w === "east-notch") return { along: "z", center: halfW - notchW / 2 };
        if (w === "north") return { along: "x", center: -halfL + westW / 2 };
        if (w === "north-notch") return { along: "x", center: -halfL + westW + notchL / 2 };
        if (w === "west") return { along: "z", center: 0 };
        return { along: "x", center: 0 };
    }

    if (layout === "U") {
        const southD = clampArchWingA(wingA, width);
        const maxWing = Math.max(ARCH_MIN_WING, (length - ARCH_MIN_WING) / 2);
        const wingClamped = Math.min(clampArchWingB(wingB, length), maxWing);
        const notchW = Math.max(ARCH_MIN_WING, width - southD);
        if (w === "north-west") return { along: "x", center: -halfL + wingClamped / 2 };
        if (w === "north-east") return { along: "x", center: halfL - wingClamped / 2 };
        if (w === "court-east" || w === "court-west") {
            return { along: "z", center: halfW - notchW / 2 };
        }
        if (w === "court-south") return { along: "x", center: 0 };
        if (w === "west" || w === "east") return { along: "z", center: 0 };
        return { along: "x", center: 0 };
    }

    if (layout === "patio") {
        if (w === "east" || w === "west" || w === "court-east" || w === "court-west") {
            return { along: "z", center: 0 };
        }
        return { along: "x", center: 0 };
    }

    if (w === "east" || w === "west") return { along: "z", center: 0 };
    return { along: "x", center: 0 };
}

/**
 * Offset le long du mur depuis un point local pièce.
 * @param {THREE.Object3D} room
 * @param {unknown} wall
 * @param {{ x: number, y?: number, z: number } | THREE.Vector3} localPoint
 */
export function getArchWallOffsetFromLocalPoint(room, wall, localPoint) {
    const frame = getArchWallFrame(room, wall);
    const coord = frame.along === "x" ? Number(localPoint.x) : Number(localPoint.z);
    if (!Number.isFinite(coord)) return 0;
    return coord - frame.center;
}

/**
 * @param {ArchOpening | null | undefined} opening
 * @param {number} [story]
 */
export function openingMatchesStory(opening, story = 0) {
    if (!opening) return false;
    const floor = Number.isFinite(opening.floor) ? opening.floor | 0 : 0;
    return floor === (story | 0);
}

/**
 * Ouverture affichée / éditable pour la face cliquée (mur+étage ; plafond = toute la toiture).
 * @param {{ wall?: unknown, floor?: unknown } | null | undefined} opening
 * @param {unknown} targetWall
 * @param {number} [targetFloor]
 */
export function openingBelongsToArchFace(opening, targetWall, targetFloor = 0) {
    if (!opening) return false;
    const wall = normalizeArchSurface(opening.wall);
    if (wall !== normalizeArchSurface(targetWall)) return false;
    if (wall === "ceiling") return true;
    return (Number(opening.floor) | 0) === (targetFloor | 0);
}

/**
 * @param {ArchOpening[]} openings
 * @param {string} wallId
 * @param {number} story
 */
function openingsForWallStory(openings, wallId, story) {
    return openings.filter((o) => o.wall === wallId && openingMatchesStory(o, story));
}

/**
 * @param {unknown} layout
 * @returns {ArchLayout}
 */
export function normalizeArchLayout(layout) {
    // Ancien preset « building » → pièce unique (les étages restent via archFloors).
    if (layout === "building") return "rect";
    if (layout === "L" || layout === "U" || layout === "patio") {
        return layout;
    }
    return "rect";
}

/**
 * @param {THREE.Object3D} object
 * @returns {ArchLayout}
 */
export function getArchLayout(object) {
    return normalizeArchLayout(object?.userData?.[ARCH_LAYOUT_KEY]);
}

/**
 * Présets de spawn par type de pièce.
 * @param {ArchLayout} layout
 * @returns {{
 *   layout: ArchLayout,
 *   length: number,
 *   width: number,
 *   height: number,
 *   ceiling: boolean,
 *   plinth: boolean,
 *   openings: ArchOpening[],
 *   label: string,
 * }}
 */
export function getArchLayoutPreset(layout) {
    const kind = normalizeArchLayout(layout);
    const label = ARCH_LAYOUT_LABELS[kind] || ARCH_LAYOUT_LABELS.rect;
    if (kind === "L") {
        return {
            layout: "L",
            length: 6,
            width: 5,
            height: ARCH_DEFAULT_HEIGHT,
            wingA: 2.4,
            wingB: 2.6,
            floors: 1,
            ceiling: true,
            plinth: false,
            openings: [
                {
                    id: "door-default",
                    type: "door",
                    wall: "south",
                    offset: 0,
                    offsetZ: 0,
                    width: 1.2,
                    height: 2.1,
                    sill: 0,
                },
            ],
            label,
        };
    }
    if (kind === "U") {
        return {
            layout: "U",
            length: 7,
            width: 5,
            height: ARCH_DEFAULT_HEIGHT,
            wingA: 2.2,
            wingB: 1.8,
            floors: 1,
            ceiling: true,
            plinth: false,
            openings: [
                {
                    id: "door-default",
                    type: "door",
                    wall: "south",
                    offset: 0,
                    offsetZ: 0,
                    width: 1.2,
                    height: 2.1,
                    sill: 0,
                },
            ],
            label,
        };
    }
    if (kind === "patio") {
        return {
            layout: "patio",
            length: 8,
            width: 8,
            height: ARCH_DEFAULT_HEIGHT,
            wingA: 3.2,
            wingB: 3.2,
            floors: 1,
            ceiling: true,
            plinth: false,
            openings: [
                {
                    id: "door-default",
                    type: "door",
                    wall: "south",
                    offset: 0,
                    offsetZ: 0,
                    width: 1.4,
                    height: 2.1,
                    sill: 0,
                },
                {
                    id: "door-court",
                    type: "door",
                    wall: "court-south",
                    offset: 0,
                    offsetZ: 0,
                    width: 1.4,
                    height: 2.1,
                    sill: 0,
                },
            ],
            label,
        };
    }
    return {
        layout: "rect",
        length: ARCH_DEFAULT_LENGTH,
        width: ARCH_DEFAULT_WIDTH,
        height: ARCH_DEFAULT_HEIGHT,
        wingA: ARCH_DEFAULT_WING_A,
        wingB: ARCH_DEFAULT_WING_B,
        floors: 1,
        ceiling: true,
        plinth: false,
        openings: defaultDoorOpening(ARCH_DEFAULT_LENGTH, ARCH_DEFAULT_HEIGHT),
        label,
    };
}

/**
 * @param {THREE.Object3D} object
 * @returns {ArchOpening[]}
 */
export function getArchOpenings(object) {
    const raw = object?.userData?.[ARCH_OPENINGS_KEY];
    if (!Array.isArray(raw)) return [];
    return raw.map(normalizeOpening).filter(Boolean);
}

/**
 * @param {unknown} raw
 * @returns {ArchOpening | null}
 */
function normalizeOpening(raw) {
    if (!raw || typeof raw !== "object") return null;
    const o = /** @type {Record<string, unknown>} */ (raw);
    const wall = normalizeArchSurface(o.wall);
    const isSlab = isArchSlabSurface(wall);
    /** @type {"door" | "window" | "hole"} */
    let type = "door";
    if (isSlab || o.type === "hole") type = "hole";
    else if (o.type === "window") type = "window";
    const width = Math.max(0.4, Number(o.width) || (type === "door" ? 1.4 : type === "window" ? 1.2 : 1));
    // Pour un trou sol/plafond, height = profondeur le long de Z.
    const height = Math.max(
        0.4,
        Number(o.height) || (type === "door" ? 2.1 : type === "window" ? 1.2 : 1)
    );
    const sill = type === "door" || type === "hole" ? 0 : Math.max(0, Number(o.sill) || 0.9);
    const offset = Number.isFinite(Number(o.offset)) ? Number(o.offset) : 0;
    const offsetZ = isSlab && Number.isFinite(Number(o.offsetZ)) ? Number(o.offsetZ) : 0;
    const floorRaw = Number(o.floor);
    const floor = Number.isFinite(floorRaw)
        ? THREE.MathUtils.clamp(floorRaw | 0, 0, ARCH_MAX_FLOORS - 1)
        : 0;
    const id = typeof o.id === "string" && o.id ? o.id : `op-${Math.random().toString(36).slice(2, 9)}`;
    /** @type {"simple" | "imported" | "none"} */
    let fill = "none";
    if (type === "door" || type === "window") {
        if (o.fill === "none") fill = "none";
        else if (
            o.fill === "imported" &&
            typeof o.importDataUrl === "string" &&
            o.importDataUrl.startsWith("data:")
        ) {
            fill = "imported";
        } else {
            fill = "simple";
        }
    }
    /** @type {ArchOpening} */
    const next = { id, type, wall, offset, offsetZ, width, height, sill, floor, fill };
    if (fill === "imported") {
        next.importDataUrl = String(o.importDataUrl);
        next.importFormat = typeof o.importFormat === "string" && o.importFormat ? o.importFormat : "glb";
        next.importName = typeof o.importName === "string" ? o.importName : "";
    }
    const fillTx = normalizeFillTx(o.fillTx);
    if (fillTx) next.fillTx = fillTx;
    if (typeof o.fillColor === "string" && /^#[0-9a-f]{6}$/i.test(o.fillColor)) {
        next.fillColor = o.fillColor.toLowerCase();
    }
    return next;
}

/**
 * Murs uniquement pour le repoussement horizontal (sol / plafond = surfaces, pas de push).
 * @param {THREE.Object3D} object
 * @returns {THREE.Mesh[]}
 */
export function getArchCollisionMeshes(object) {
    if (!isLabArchitecture(object)) return [];
    /** @type {THREE.Mesh[]} */
    const meshes = [];
    object.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        if (node.name === "shadow-overlay") return;
        if (node.userData?.archNoCollision) return;
        // Sol / plafond : marchables via raycast, jamais poussés en XZ
        // (sinon l’AABB du sol éjecte le joueur en boucle).
        const n = String(node.name || "");
        if (n === "arch-floor" || n.startsWith("arch-floor-")) return;
        if (n === "arch-ceiling" || n.startsWith("arch-ceiling-")) return;
        if (n.startsWith("arch-opening-frame-")) {
            meshes.push(node);
            return;
        }
        if (!n.startsWith("arch-wall-")) return;
        meshes.push(node);
    });
    return meshes;
}

/**
 * @param {{
 *   length?: number,
 *   width?: number,
 *   height?: number,
 *   wall?: number,
 *   ceiling?: boolean,
 *   plinth?: boolean,
 *   openings?: ArchOpening[],
 *   layout?: ArchLayout,
 *   color?: string,
 *   roughness?: number,
 *   metalness?: number,
 * }} [options]
 */
export function buildArchitectureGroup(options = {}) {
    const group = new THREE.Group();
    group.name = "lab-architecture";
    populateArchitecture(group, options);
    return group;
}

/**
 * @param {THREE.Group} group
 * @param {{
 *   length?: number,
 *   width?: number,
 *   height?: number,
 *   wall?: number,
 *   ceiling?: boolean,
 *   plinth?: boolean,
 *   openings?: ArchOpening[],
 *   layout?: ArchLayout,
 *   color?: string,
 *   roughness?: number,
 *   metalness?: number,
 * }} [overrides]
 */
export function rebuildArchitectureGroup(group, overrides = {}) {
    // Préférer la teinte objet (userData) : après texture Face les mats sont blancs.
    const storedColor =
        typeof group.userData?.objectColor === "string" ? group.userData.objectColor : null;
    let color = storedColor || overrides.color || DEFAULT_COLOR;
    let roughness =
        typeof group.userData?.roughness === "number"
            ? group.userData.roughness
            : DEFAULT_ROUGHNESS;
    let metalness =
        typeof group.userData?.metalness === "number"
            ? group.userData.metalness
            : DEFAULT_METALNESS;
    for (const child of [...group.children]) {
        child.traverse((node) => {
            if (!(node instanceof THREE.Mesh)) return;
            const mats = Array.isArray(node.material) ? node.material : [node.material];
            for (const mat of mats) {
                if (
                    !storedColor &&
                    node === child &&
                    mat?.color &&
                    !String(node.name || "").startsWith("arch-plinth-") &&
                    !String(node.name || "").startsWith("arch-opening-")
                ) {
                    const hex = `#${mat.color.getHexString()}`;
                    // Ignorer le blanc « neutre texture Face ».
                    if (hex.toLowerCase() !== "#ffffff") color = hex;
                }
                if (
                    node === child &&
                    !String(node.name || "").startsWith("arch-opening-") &&
                    typeof mat?.roughness === "number"
                ) {
                    roughness = mat.roughness;
                }
                if (
                    node === child &&
                    !String(node.name || "").startsWith("arch-opening-") &&
                    typeof mat?.metalness === "number"
                ) {
                    metalness = mat.metalness;
                }
                try {
                    mat?.dispose?.();
                } catch {
                    /* ignore */
                }
            }
            if (!node.userData?.archSharedGeometry) {
                node.geometry?.dispose();
            }
        });
        group.remove(child);
    }
    populateArchitecture(group, {
        length: overrides.length ?? getArchLength(group),
        width: overrides.width ?? getArchWidth(group),
        height: overrides.height ?? getArchHeight(group),
        wall: overrides.wall ?? getArchWall(group),
        ceiling: overrides.ceiling ?? getArchHasCeiling(group),
        plinthFloors:
            overrides.plinthFloors ??
            (overrides.plinth !== undefined
                ? overrides.plinth
                    ? [0]
                    : []
                : getArchPlinthFloors(group)),
        openings: overrides.openings ?? getArchOpenings(group),
        layout: overrides.layout ?? getArchLayout(group),
        wingA: overrides.wingA ?? getArchWingA(group),
        wingB: overrides.wingB ?? getArchWingB(group),
        floors: overrides.floors ?? getArchFloors(group),
        color,
        roughness,
        metalness,
    });
}

/**
 * Portée utile d’un mur (données brutes — menu + géométrie).
 * @param {{
 *   layout?: unknown,
 *   length?: number,
 *   width?: number,
 *   wallT?: number,
 *   wingA?: number,
 *   wingB?: number,
 * }} dims
 * @param {unknown} wall
 */
export function computeArchWallSpan(dims, wall) {
    const w = normalizeArchWall(wall);
    const layout = normalizeArchLayout(dims?.layout);
    const length = clampArchLength(dims?.length ?? ARCH_DEFAULT_LENGTH);
    const width = clampArchWidth(dims?.width ?? ARCH_DEFAULT_WIDTH);
    const wallT = clampArchWall(dims?.wallT ?? ARCH_DEFAULT_WALL);
    const wingA = Number(dims?.wingA);
    const wingB = Number(dims?.wingB);

    if (layout === "L") {
        const southD = clampArchWingA(Number.isFinite(wingA) ? wingA : ARCH_DEFAULT_WING_A, width);
        const westW = clampArchWingB(Number.isFinite(wingB) ? wingB : ARCH_DEFAULT_WING_B, length);
        if (w === "south") return length;
        if (w === "west") return width;
        if (w === "east") return southD;
        if (w === "north") return westW;
        if (w === "east-notch") return Math.max(ARCH_MIN_WING, width - southD);
        if (w === "north-notch") return Math.max(ARCH_MIN_WING, length - westW);
    }

    if (layout === "U") {
        const southD = clampArchWingA(Number.isFinite(wingA) ? wingA : ARCH_DEFAULT_WING_A, width);
        const maxWing = Math.max(ARCH_MIN_WING, (length - ARCH_MIN_WING) / 2);
        const wingClamped = Math.min(
            clampArchWingB(Number.isFinite(wingB) ? wingB : ARCH_DEFAULT_WING_B, length),
            maxWing
        );
        if (w === "south") return length;
        if (w === "west" || w === "east") return width;
        if (w === "north-west" || w === "north-east") return wingClamped;
        if (w === "court-east" || w === "court-west") return Math.max(ARCH_MIN_WING, width - southD);
        if (w === "court-south") return Math.max(ARCH_MIN_WING, length - 2 * wingClamped);
    }

    if (layout === "patio") {
        const maxCourtX = Math.max(ARCH_MIN_WING, length - 2.4);
        const maxCourtZ = Math.max(ARCH_MIN_WING, width - 2.4);
        const courtX = clampArchWingB(
            Number.isFinite(wingB) ? wingB : ARCH_DEFAULT_WING_B,
            maxCourtX
        );
        const courtZ = clampArchWingA(
            Number.isFinite(wingA) ? wingA : ARCH_DEFAULT_WING_A,
            maxCourtZ
        );
        if (w === "north" || w === "south") return length;
        if (w === "east" || w === "west") return Math.max(0.2, width - 2 * wallT);
        // Chevauchement d’angle : +2×wallT pour joindre N/S ↔ E/W.
        if (w === "court-north" || w === "court-south") return Math.max(0.2, courtX + 2 * wallT);
        if (w === "court-east" || w === "court-west") return Math.max(0.2, courtZ + 2 * wallT);
    }

    // rect
    if (
        w === "north" ||
        w === "south" ||
        w === "north-west" ||
        w === "north-east" ||
        w === "north-notch" ||
        w === "court-north" ||
        w === "court-south"
    ) {
        return length;
    }
    return width;
}

/**
 * Portée utile d’un mur (pour portes / fenêtres), selon le plan.
 * @param {THREE.Object3D} object
 * @param {unknown} wall
 */
export function getArchWallSpan(object, wall) {
    return computeArchWallSpan(
        {
            layout: getArchLayout(object),
            length: getArchLength(object),
            width: getArchWidth(object),
            wallT: getArchWall(object),
            wingA: getArchWingA(object),
            wingB: getArchWingB(object),
        },
        wall
    );
}

/**
 * Emprise XZ d’une dalle (sol / toit = empreinte extérieure de la pièce).
 * @param {THREE.Object3D} room
 * @param {"floor" | "ceiling"} [_surface]
 * @returns {{ sizeX: number, sizeZ: number }}
 */
export function getArchSlabSize(room, _surface) {
    return { sizeX: getArchLength(room), sizeZ: getArchWidth(room) };
}

/**
 * @param {ArchOpening} opening
 * @returns {{ left: number, right: number }}
 */
export function getOpeningFootprint(opening) {
    const half = Math.max(0.2, Number(opening.width) || 0.4) / 2;
    const offset = Number.isFinite(opening.offset) ? opening.offset : 0;
    return { left: offset - half, right: offset + half };
}

/**
 * Rectangle XZ d’un trou sol/plafond.
 * @param {ArchOpening} opening
 * @returns {{ minX: number, maxX: number, minZ: number, maxZ: number }}
 */
export function getSlabHoleRect(opening) {
    const halfW = Math.max(0.2, Number(opening.width) || 0.4) / 2;
    const halfD = Math.max(0.2, Number(opening.height) || 0.4) / 2;
    const ox = Number.isFinite(opening.offset) ? opening.offset : 0;
    const oz = Number.isFinite(opening.offsetZ) ? opening.offsetZ : 0;
    return {
        minX: ox - halfW,
        maxX: ox + halfW,
        minZ: oz - halfD,
        maxZ: oz + halfD,
    };
}

/**
 * Cherche un offset (depuis le centre du mur) où placer une ouverture sans chevauchement.
 * @param {THREE.Object3D} room
 * @param {"door" | "window"} type
 * @param {ArchWallId | string} wall
 * @param {number} [width]
 * @param {number} [floor]
 * @returns {number | null}
 */
export function findFreeOpeningOffset(room, type, wall, width, floor = 0) {
    const wallId = normalizeArchWall(wall);
    const span = getArchWallSpan(room, wallId);
    const desired = Math.max(0.4, width ?? (type === "door" ? 1.4 : 1.2));
    const openingWidth = Math.min(desired, Math.max(0.4, span - 2 * ARCH_OPENING_EDGE));
    if (openingWidth > span - 2 * ARCH_OPENING_EDGE + 1e-6) return null;

    const half = span / 2;
    const halfW = openingWidth / 2;
    const story = Math.max(0, floor | 0);
    const existing = getArchOpenings(room).filter(
        (o) => o.wall === wallId && openingMatchesStory(o, story)
    );

    /** @type {[number, number][]} */
    const blocked = existing
        .map((o) => {
            const fp = getOpeningFootprint(o);
            return /** @type {[number, number]} */ ([
                fp.left - ARCH_OPENING_GAP,
                fp.right + ARCH_OPENING_GAP,
            ]);
        })
        .sort((a, b) => a[0] - b[0]);

    /** @type {[number, number][]} */
    const free = [];
    let cursor = -half + ARCH_OPENING_EDGE;
    const wallEnd = half - ARCH_OPENING_EDGE;
    for (const [L, R] of blocked) {
        if (L > cursor) free.push([cursor, Math.min(L, wallEnd)]);
        cursor = Math.max(cursor, R);
    }
    if (cursor < wallEnd) free.push([cursor, wallEnd]);

    for (const [a, b] of free) {
        if (b - a + 1e-9 < openingWidth) continue;
        const minC = a + halfW;
        const maxC = b - halfW;
        if (0 >= minC - 1e-9 && 0 <= maxC + 1e-9) return 0;
        return (minC + maxC) * 0.5;
    }
    return null;
}

/**
 * Centre libre pour un trou rectangulaire sur sol / plafond.
 * @param {THREE.Object3D} room
 * @param {"floor" | "ceiling"} surface
 * @param {number} holeW
 * @param {number} holeD
 * @param {number} [floor]
 * @returns {{ offset: number, offsetZ: number } | null}
 */
export function findFreeSlabHoleCenter(room, surface, holeW, holeD, floor = 0) {
    if (surface === "ceiling" && !getArchHasCeiling(room)) return null;
    const { sizeX, sizeZ } = getArchSlabSize(room, surface);
    const w = Math.min(Math.max(0.4, holeW), Math.max(0.4, sizeX - 2 * ARCH_OPENING_EDGE));
    const d = Math.min(Math.max(0.4, holeD), Math.max(0.4, sizeZ - 2 * ARCH_OPENING_EDGE));
    if (w > sizeX - 2 * ARCH_OPENING_EDGE + 1e-6) return null;
    if (d > sizeZ - 2 * ARCH_OPENING_EDGE + 1e-6) return null;

    const halfX = sizeX / 2;
    const halfZ = sizeZ / 2;
    const halfW = w / 2;
    const halfD = d / 2;
    const minX = -halfX + ARCH_OPENING_EDGE + halfW;
    const maxX = halfX - ARCH_OPENING_EDGE - halfW;
    const minZ = -halfZ + ARCH_OPENING_EDGE + halfD;
    const maxZ = halfZ - ARCH_OPENING_EDGE - halfD;
    if (minX > maxX || minZ > maxZ) return null;

    const story = Math.max(0, floor | 0);
    const others = getArchOpenings(room).filter(
        (o) => o.wall === surface && openingMatchesStory(o, story)
    );
    /** @param {number} ox @param {number} oz */
    const fits = (ox, oz) => {
        const cand = {
            minX: ox - halfW - ARCH_OPENING_GAP,
            maxX: ox + halfW + ARCH_OPENING_GAP,
            minZ: oz - halfD - ARCH_OPENING_GAP,
            maxZ: oz + halfD + ARCH_OPENING_GAP,
        };
        for (const other of others) {
            const r = getSlabHoleRect(other);
            if (
                !(
                    cand.maxX <= r.minX ||
                    r.maxX <= cand.minX ||
                    cand.maxZ <= r.minZ ||
                    r.maxZ <= cand.minZ
                )
            ) {
                return false;
            }
        }
        return true;
    };

    /** @type {[number, number][]} */
    const candidates = [[0, 0]];
    const steps = 5;
    for (let ix = 0; ix <= steps; ix += 1) {
        for (let iz = 0; iz <= steps; iz += 1) {
            const ox = minX + ((maxX - minX) * ix) / steps;
            const oz = minZ + ((maxZ - minZ) * iz) / steps;
            if (Math.abs(ox) < 1e-6 && Math.abs(oz) < 1e-6) continue;
            candidates.push([ox, oz]);
        }
    }
    for (const [ox, oz] of candidates) {
        if (fits(ox, oz)) return { offset: ox, offsetZ: oz };
    }
    return null;
}

/**
 * Largeur max / min pour une ouverture (mur = le long du mur ; dalle = axe X).
 * @param {THREE.Object3D} room
 * @param {ArchOpening} opening
 */
export function clampOpeningWidth(room, opening) {
    if (isArchSlabSurface(opening.wall)) {
        const { sizeX } = getArchSlabSize(room, /** @type {"floor"|"ceiling"} */ (opening.wall));
        const maxW = Math.max(0.4, sizeX - 2 * ARCH_OPENING_EDGE);
        const w = Number(opening.width);
        return THREE.MathUtils.clamp(Number.isFinite(w) ? w : 0.4, 0.4, maxW);
    }
    const wall = normalizeArchWall(opening.wall);
    const span = getArchWallSpan(room, wall);
    const maxW = Math.max(0.4, span - 2 * ARCH_OPENING_EDGE);
    const w = Number(opening.width);
    return THREE.MathUtils.clamp(Number.isFinite(w) ? w : 0.4, 0.4, maxW);
}

/**
 * Hauteur mur, ou profondeur Z pour un trou sol/plafond.
 * @param {THREE.Object3D} room
 * @param {ArchOpening} opening
 */
export function clampOpeningHeight(room, opening) {
    if (isArchSlabSurface(opening.wall)) {
        const { sizeZ } = getArchSlabSize(room, /** @type {"floor"|"ceiling"} */ (opening.wall));
        const maxD = Math.max(0.4, sizeZ - 2 * ARCH_OPENING_EDGE);
        const h = Number(opening.height);
        return THREE.MathUtils.clamp(Number.isFinite(h) ? h : 0.4, 0.4, maxD);
    }
    const roomH = getArchHeight(room);
    const sill = opening.type === "door" ? 0 : Math.max(0, Number(opening.sill) || 0);
    const maxH = Math.max(0.4, roomH - sill - 0.05);
    const h = Number(opening.height);
    return THREE.MathUtils.clamp(Number.isFinite(h) ? h : 0.4, 0.4, maxH);
}

/**
 * Offset le long du mur, ou offset X pour une dalle.
 * @param {THREE.Object3D} room
 * @param {ArchOpening} opening
 * @param {ArchOpening[]} [allOpenings]
 */
export function clampOpeningOffset(room, opening, allOpenings) {
    if (isArchSlabSurface(opening.wall)) {
        const surface = /** @type {"floor"|"ceiling"} */ (opening.wall);
        const { sizeX } = getArchSlabSize(room, surface);
        const half = sizeX / 2;
        const halfW = Math.max(0.2, Number(opening.width) || 0.4) / 2;
        const minC = -half + ARCH_OPENING_EDGE + halfW;
        const maxC = half - ARCH_OPENING_EDGE - halfW;
        if (minC > maxC) return (minC + maxC) * 0.5;
        let offset = Number.isFinite(opening.offset) ? opening.offset : 0;
        offset = THREE.MathUtils.clamp(offset, minC, maxC);
        const story = Number.isFinite(opening.floor) ? opening.floor | 0 : 0;
        const others = (allOpenings ?? getArchOpenings(room)).filter(
            (o) => o.wall === surface && o.id !== opening.id && openingMatchesStory(o, story)
        );
        const halfD = Math.max(0.2, Number(opening.height) || 0.4) / 2;
        const oz = Number.isFinite(opening.offsetZ) ? opening.offsetZ : 0;
        for (let pass = 0; pass < 8; pass += 1) {
            let moved = false;
            for (const other of others) {
                const r = getSlabHoleRect(other);
                const left = r.minX - ARCH_OPENING_GAP - halfW;
                const right = r.maxX + ARCH_OPENING_GAP + halfW;
                const zOverlap =
                    oz + halfD + ARCH_OPENING_GAP > r.minZ && oz - halfD - ARCH_OPENING_GAP < r.maxZ;
                if (zOverlap && offset > left && offset < right) {
                    const toLeft = offset - left;
                    const toRight = right - offset;
                    offset = toLeft <= toRight ? left : right;
                    offset = THREE.MathUtils.clamp(offset, minC, maxC);
                    moved = true;
                }
            }
            if (!moved) break;
        }
        return offset;
    }

    const wall = normalizeArchWall(opening.wall);
    const span = getArchWallSpan(room, wall);
    const half = span / 2;
    const halfW = Math.max(0.2, Number(opening.width) || 0.4) / 2;
    let minC = -half + ARCH_OPENING_EDGE + halfW;
    let maxC = half - ARCH_OPENING_EDGE - halfW;
    if (minC > maxC) return (minC + maxC) * 0.5;

    const story = Number.isFinite(opening.floor) ? opening.floor | 0 : 0;
    const others = (allOpenings ?? getArchOpenings(room)).filter(
        (o) => o.wall === wall && o.id !== opening.id && openingMatchesStory(o, story)
    );
    let offset = Number.isFinite(opening.offset) ? opening.offset : 0;
    offset = THREE.MathUtils.clamp(offset, minC, maxC);

    for (let pass = 0; pass < 8; pass += 1) {
        let moved = false;
        for (const other of others) {
            const fp = getOpeningFootprint(other);
            const left = fp.left - ARCH_OPENING_GAP - halfW;
            const right = fp.right + ARCH_OPENING_GAP + halfW;
            if (offset > left && offset < right) {
                const toLeft = offset - left;
                const toRight = right - offset;
                offset = toLeft <= toRight ? left : right;
                offset = THREE.MathUtils.clamp(offset, minC, maxC);
                moved = true;
            }
        }
        if (!moved) break;
    }
    return offset;
}

/**
 * Offset Z pour un trou sol/plafond.
 * @param {THREE.Object3D} room
 * @param {ArchOpening} opening
 * @param {ArchOpening[]} [allOpenings]
 */
export function clampOpeningOffsetZ(room, opening, allOpenings) {
    if (!isArchSlabSurface(opening.wall)) return 0;
    const surface = /** @type {"floor"|"ceiling"} */ (opening.wall);
    const { sizeZ } = getArchSlabSize(room, surface);
    const half = sizeZ / 2;
    const halfD = Math.max(0.2, Number(opening.height) || 0.4) / 2;
    const minC = -half + ARCH_OPENING_EDGE + halfD;
    const maxC = half - ARCH_OPENING_EDGE - halfD;
    if (minC > maxC) return (minC + maxC) * 0.5;
    let offsetZ = Number.isFinite(opening.offsetZ) ? opening.offsetZ : 0;
    offsetZ = THREE.MathUtils.clamp(offsetZ, minC, maxC);
    const story = Number.isFinite(opening.floor) ? opening.floor | 0 : 0;
    const others = (allOpenings ?? getArchOpenings(room)).filter(
        (o) => o.wall === surface && o.id !== opening.id && openingMatchesStory(o, story)
    );
    const halfW = Math.max(0.2, Number(opening.width) || 0.4) / 2;
    const ox = Number.isFinite(opening.offset) ? opening.offset : 0;
    for (let pass = 0; pass < 8; pass += 1) {
        let moved = false;
        for (const other of others) {
            const r = getSlabHoleRect(other);
            const bottom = r.minZ - ARCH_OPENING_GAP - halfD;
            const top = r.maxZ + ARCH_OPENING_GAP + halfD;
            const xOverlap =
                ox + halfW + ARCH_OPENING_GAP > r.minX && ox - halfW - ARCH_OPENING_GAP < r.maxX;
            if (xOverlap && offsetZ > bottom && offsetZ < top) {
                const toBottom = offsetZ - bottom;
                const toTop = top - offsetZ;
                offsetZ = toBottom <= toTop ? bottom : top;
                offsetZ = THREE.MathUtils.clamp(offsetZ, minC, maxC);
                moved = true;
            }
        }
        if (!moved) break;
    }
    return offsetZ;
}

/**
 * @param {THREE.Object3D} room
 * @param {"door" | "window"} type
 * @param {ArchWallId | "floor" | "ceiling" | string} [wall]
 * @param {{ floor?: number, offset?: number, sill?: number }} [options]
 * @returns {ArchOpening | null}
 */
export function createDefaultOpening(room, type, wall = "south", options = {}) {
    const surface = normalizeArchSurface(wall);
    if (isArchSlabSurface(surface)) {
        return createDefaultSlabHole(room, /** @type {"floor"|"ceiling"} */ (surface), options);
    }
    const height = getArchHeight(room);
    const wallName = normalizeArchWall(surface);
    const span = getArchWallSpan(room, wallName);
    const openingWidth = Math.min(type === "door" ? 1.4 : 1.2, Math.max(0.4, span - 2 * ARCH_OPENING_EDGE));
    const maxStory = Math.max(0, getArchFloors(room) - 1);
    const floor = THREE.MathUtils.clamp(
        Number.isFinite(Number(options.floor)) ? Number(options.floor) | 0 : 0,
        0,
        maxStory
    );
    const openingHeight = type === "door" ? Math.min(2.1, height - 0.15) : Math.min(1.2, height - 0.4);
    let sill =
        type === "door"
            ? 0
            : Number.isFinite(Number(options.sill))
              ? Math.max(0, Number(options.sill))
              : Math.min(0.9, height - openingHeight - 0.15);
    sill = type === "door" ? 0 : Math.min(sill, Math.max(0, height - openingHeight - 0.05));

    /** @type {ArchOpening} */
    const draft = {
        id: `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        type,
        wall: wallName,
        offset: 0,
        offsetZ: 0,
        width: openingWidth,
        height: openingHeight,
        sill,
        floor,
        fill: "simple",
    };

    if (Number.isFinite(Number(options.offset))) {
        draft.offset = Number(options.offset);
        draft.offset = clampOpeningOffset(room, draft, getArchOpenings(room));
        return draft;
    }

    const offset = findFreeOpeningOffset(room, type, wallName, openingWidth, floor);
    if (offset === null) return null;
    draft.offset = offset;
    return draft;
}

/**
 * @param {THREE.Object3D} room
 * @param {"floor" | "ceiling"} surface
 * @param {{ floor?: number, offset?: number, offsetZ?: number }} [options]
 * @returns {ArchOpening | null}
 */
export function createDefaultSlabHole(room, surface, options = {}) {
    if (surface === "ceiling" && !getArchHasCeiling(room)) return null;
    const maxStory = Math.max(0, getArchFloors(room) - 1);
    const floor =
        surface === "ceiling"
            ? maxStory
            : THREE.MathUtils.clamp(
                  Number.isFinite(Number(options.floor)) ? Number(options.floor) | 0 : 0,
                  0,
                  maxStory
              );
    const { sizeX, sizeZ } = getArchSlabSize(room, surface);
    const holeW = Math.min(1, Math.max(0.4, sizeX - 2 * ARCH_OPENING_EDGE));
    const holeD = Math.min(1, Math.max(0.4, sizeZ - 2 * ARCH_OPENING_EDGE));

    /** @type {ArchOpening} */
    const draft = {
        id: `hole-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        type: "hole",
        wall: surface,
        offset: 0,
        offsetZ: 0,
        width: holeW,
        height: holeD,
        sill: 0,
        floor,
    };

    if (Number.isFinite(Number(options.offset)) || Number.isFinite(Number(options.offsetZ))) {
        draft.offset = Number.isFinite(Number(options.offset)) ? Number(options.offset) : 0;
        draft.offsetZ = Number.isFinite(Number(options.offsetZ)) ? Number(options.offsetZ) : 0;
        const all = getArchOpenings(room);
        draft.offset = clampOpeningOffset(room, draft, all);
        draft.offsetZ = clampOpeningOffsetZ(room, draft, all);
        return draft;
    }

    const center = findFreeSlabHoleCenter(room, surface, holeW, holeD, floor);
    if (!center) return null;
    draft.offset = center.offset;
    draft.offsetZ = center.offsetZ;
    return draft;
}

/**
 * @param {THREE.Group} group
 * @param {{
 *   length?: number,
 *   width?: number,
 *   height?: number,
 *   wall?: number,
 *   ceiling?: boolean,
 *   plinth?: boolean,
 *   openings?: ArchOpening[],
 *   layout?: ArchLayout,
 *   color?: string,
 *   roughness?: number,
 *   metalness?: number,
 * }} options
 */
function populateArchitecture(group, options) {
    const length = clampArchLength(options.length ?? ARCH_DEFAULT_LENGTH);
    const width = clampArchWidth(options.width ?? ARCH_DEFAULT_WIDTH);
    const height = clampArchHeight(options.height ?? ARCH_DEFAULT_HEIGHT);
    const wallT = clampArchWall(options.wall ?? ARCH_DEFAULT_WALL);
    const hasCeiling = options.ceiling !== false;
    const layout = normalizeArchLayout(options.layout ?? group.userData?.[ARCH_LAYOUT_KEY]);
    const wingA = clampArchWingA(
        options.wingA ?? group.userData?.[ARCH_WING_A_KEY] ?? ARCH_DEFAULT_WING_A,
        layout === "patio" ? width - 2.4 : width
    );
    const wingB = clampArchWingB(
        options.wingB ?? group.userData?.[ARCH_WING_B_KEY] ?? ARCH_DEFAULT_WING_B,
        layout === "patio" ? length - 2.4 : layout === "U" ? (length - ARCH_MIN_WING) / 2 : length
    );
    const floors = clampArchFloors(
        options.floors ?? group.userData?.[ARCH_FLOORS_KEY] ?? ARCH_DEFAULT_FLOORS
    );
    /** @type {number[]} */
    let plinthFloors;
    if (Array.isArray(options.plinthFloors)) {
        plinthFloors = normalizeArchPlinthFloors(options.plinthFloors, floors);
    } else if (options.plinth === true) {
        plinthFloors = [0];
    } else if (options.plinth === false) {
        plinthFloors = [];
    } else {
        plinthFloors = normalizeArchPlinthFloors(
            group.userData?.[ARCH_PLINTH_FLOORS_KEY] ??
                (group.userData?.[ARCH_PLINTH_KEY] ? [0] : []),
            floors
        );
    }
    const color = options.color || DEFAULT_COLOR;
    const roughness = typeof options.roughness === "number" ? options.roughness : DEFAULT_ROUGHNESS;
    const metalness = typeof options.metalness === "number" ? options.metalness : DEFAULT_METALNESS;

    group.userData[LAB_ARCHITECTURE_KEY] = true;
    group.userData[ARCH_LENGTH_KEY] = length;
    group.userData[ARCH_WIDTH_KEY] = width;
    group.userData[ARCH_HEIGHT_KEY] = height;
    group.userData[ARCH_WALL_KEY] = wallT;
    group.userData[ARCH_CEILING_KEY] = hasCeiling;
    group.userData[ARCH_PLINTH_FLOORS_KEY] = plinthFloors;
    group.userData[ARCH_PLINTH_KEY] = plinthFloors.length > 0;
    group.userData[ARCH_LAYOUT_KEY] = layout;
    group.userData[ARCH_WING_A_KEY] = wingA;
    group.userData[ARCH_WING_B_KEY] = wingB;
    group.userData[ARCH_FLOORS_KEY] = floors;

    // Normaliser + clamper contre la pièce courante (évite trous hors murs après resize).
    let openings = (options.openings ?? defaultDoorOpening(length, height))
        .map(normalizeOpening)
        .filter(Boolean);
    if (!hasCeiling) openings = openings.filter((o) => o.wall !== "ceiling");
    // Patio RDC : sol plein (cour fermée) — trous sol uniquement aux étages > 0.
    if (layout === "patio") {
        openings = openings.filter((o) => o.wall !== "floor" || (o.floor | 0) > 0);
    }
    const maxStory = Math.max(0, floors - 1);
    openings = openings.map((op) => ({
        ...op,
        floor: THREE.MathUtils.clamp(op.floor | 0, 0, maxStory),
    }));
    group.userData[ARCH_OPENINGS_KEY] = openings;
    openings = openings.map((op) => {
        const next = { ...op };
        next.width = clampOpeningWidth(group, next);
        next.height = clampOpeningHeight(group, next);
        next.offset = clampOpeningOffset(group, next, openings);
        if (isArchSlabSurface(next.wall)) {
            next.offsetZ = clampOpeningOffsetZ(group, next, openings);
        } else {
            next.offsetZ = 0;
        }
        return next;
    });
    group.userData[ARCH_OPENINGS_KEY] = openings;

    const matOpts = { color, roughness, metalness };
    const plinthMat = { color: PLINTH_COLOR, roughness, metalness };

    if (layout === "L") {
        buildLLayout(
            group,
            length,
            width,
            height,
            wallT,
            wingA,
            wingB,
            hasCeiling,
            openings,
            matOpts,
            plinthFloors,
            plinthMat,
            floors
        );
        return;
    }
    if (layout === "U") {
        buildULayout(
            group,
            length,
            width,
            height,
            wallT,
            wingA,
            wingB,
            hasCeiling,
            openings,
            matOpts,
            plinthFloors,
            plinthMat,
            floors
        );
        return;
    }
    if (layout === "patio") {
        buildPatioLayout(
            group,
            length,
            width,
            height,
            wallT,
            wingA,
            wingB,
            hasCeiling,
            openings,
            matOpts,
            plinthFloors,
            plinthMat,
            floors
        );
        return;
    }

    buildRectStories(
        group,
        length,
        width,
        height,
        wallT,
        floors,
        hasCeiling,
        plinthFloors,
        openings,
        matOpts,
        plinthMat
    );
}

/**
 * Rectangle multi-étages (pièce unique).
 * @param {THREE.Group} group
 * @param {number} length
 * @param {number} width
 * @param {number} height
 * @param {number} wallT
 * @param {number} floors
 * @param {boolean} hasCeiling
 * @param {number[]} plinthFloors
 * @param {ArchOpening[]} openings
 * @param {{ color: string, roughness: number, metalness: number }} matOpts
 * @param {{ color: string, roughness: number, metalness: number }} plinthMat
 */
function buildRectStories(
    group,
    length,
    width,
    height,
    wallT,
    floors,
    hasCeiling,
    plinthFloors,
    openings,
    matOpts,
    plinthMat
) {
    const plinthSet = new Set(Array.isArray(plinthFloors) ? plinthFloors : []);
    const storyCount = Math.max(1, floors | 0);
    const ceilingHoles = openings.filter((o) => o.wall === "ceiling");
    const byWall = {
        north: openings.filter((o) => o.wall === "north"),
        south: openings.filter((o) => o.wall === "south"),
        east: openings.filter((o) => o.wall === "east"),
        west: openings.filter((o) => o.wall === "west"),
    };
    const ewSpan = Math.max(0.2, width - 2 * wallT);
    const storyPitch = height + FLOOR_THICKNESS;

    for (let story = 0; story < storyCount; story += 1) {
        const yWalk = story * storyPitch;
        const floorHoles = openingsForWallStory(openings, "floor", story);

        // Sol / plancher : même emprise que les murs (sinon trou entre étages).
        buildSlabPanels(
            group,
            "floor",
            length,
            width,
            FLOOR_THICKNESS,
            yWalk - FLOOR_THICKNESS / 2,
            floorHoles,
            matOpts,
            story
        );

        const southOps = openingsForWallStory(byWall.south, "south", story);
        const northOps = openingsForWallStory(byWall.north, "north", story);
        const eastOps = openingsForWallStory(byWall.east, "east", story);
        const westOps = openingsForWallStory(byWall.west, "west", story);
        const seg = story;

        buildWallPanels(group, "north", length, height, wallT, northOps, (u, y, h, d) => ({
            x: u,
            y: yWalk + y + h / 2,
            z: width / 2 - wallT / 2,
            sx: d,
            sy: h,
            sz: wallT,
        }), matOpts, seg);

        buildWallPanels(group, "south", length, height, wallT, southOps, (u, y, h, d) => ({
            x: u,
            y: yWalk + y + h / 2,
            z: -width / 2 + wallT / 2,
            sx: d,
            sy: h,
            sz: wallT,
        }), matOpts, seg);

        buildWallPanels(group, "east", ewSpan, height, wallT, eastOps, (u, y, h, d) => ({
            x: length / 2 - wallT / 2,
            y: yWalk + y + h / 2,
            z: u,
            sx: wallT,
            sy: h,
            sz: d,
        }), matOpts, seg);

        buildWallPanels(group, "west", ewSpan, height, wallT, westOps, (u, y, h, d) => ({
            x: -length / 2 + wallT / 2,
            y: yWalk + y + h / 2,
            z: u,
            sx: wallT,
            sy: h,
            sz: d,
        }), matOpts, seg);

        // Poteaux d’angle : comble la fente au joint N/S ↔ E/W.
        addArchCornerPost(
            group, "east",
            -length / 2 + wallT / 2, -width / 2 + wallT / 2,
            wallT, height, matOpts, 0, yWalk, story
        );
        addArchCornerPost(
            group, "east",
            length / 2 - wallT / 2, -width / 2 + wallT / 2,
            wallT, height, matOpts, 1, yWalk, story
        );
        addArchCornerPost(
            group, "east",
            -length / 2 + wallT / 2, width / 2 - wallT / 2,
            wallT, height, matOpts, 2, yWalk, story
        );
        addArchCornerPost(
            group, "east",
            length / 2 - wallT / 2, width / 2 - wallT / 2,
            wallT, height, matOpts, 3, yWalk, story
        );

        if (plinthSet.has(story)) {
            // Plinthes intérieures uniquement (contour utile du sol).
            const xW = -length / 2 + wallT;
            const xE = length / 2 - wallT;
            const zS = -width / 2 + wallT;
            const zN = width / 2 - wallT;
            buildArchPlinthEdge(group, "south", xW, zS, xE, zS, 0, 1, southOps, plinthMat, yWalk);
            buildArchPlinthEdge(group, "north", xW, zN, xE, zN, 0, -1, northOps, plinthMat, yWalk);
            buildArchPlinthEdge(group, "east", xE, zS, xE, zN, -1, 0, eastOps, plinthMat, yWalk);
            buildArchPlinthEdge(group, "west", xW, zS, xW, zN, 1, 0, westOps, plinthMat, yWalk);
            addArchPlinthCorner(group, "south", xW, zS, 1, 1, plinthMat, 0, yWalk);
            addArchPlinthCorner(group, "south", xE, zS, -1, 1, plinthMat, 1, yWalk);
            addArchPlinthCorner(group, "north", xW, zN, 1, -1, plinthMat, 2, yWalk);
            addArchPlinthCorner(group, "north", xE, zN, -1, -1, plinthMat, 3, yWalk);
        }
    }

    if (hasCeiling) {
        const topY = (storyCount - 1) * storyPitch + height;
        // Toit aligné sur l’emprise extérieure des murs.
        buildSlabPanels(
            group,
            "ceiling",
            length,
            width,
            CEILING_THICKNESS,
            topY + CEILING_THICKNESS / 2,
            ceilingHoles,
            matOpts,
            storyCount - 1
        );
    }
}

/**
 * Poteau d’angle plein (comble le trou quand deux murs ne se croisent que sur une arête).
 * @param {THREE.Group} group
 * @param {string} surfaceId
 * @param {number} x
 * @param {number} z
 * @param {number} wallT
 * @param {number} height
 * @param {{ color: string, roughness: number, metalness: number }} matOpts
 * @param {number} [idx]
 * @param {number} [yBase]
 * @param {number} [story]
 */
function addArchCornerPost(group, surfaceId, x, z, wallT, height, matOpts, idx = 0, yBase = 0, story = 0) {
    addBox(
        group,
        `arch-wall-${surfaceId}-${story}-corner-${idx}`,
        wallT,
        height,
        wallT,
        x,
        yBase + height / 2,
        z,
        matOpts,
        story
    );
}

/**
 * Cube de plinthe au coin intérieur (1×1 cm) — pas de L extérieur.
 * @param {THREE.Group} group
 * @param {string} surfaceId
 * @param {number} xWall
 * @param {number} zWall
 * @param {1|-1} signX vers l’intérieur pièce
 * @param {1|-1} signZ vers l’intérieur pièce
 * @param {{ color: string, roughness: number, metalness: number }} matOpts
 * @param {number} [idx]
 */
function addArchPlinthCorner(group, surfaceId, xWall, zWall, signX, signZ, matOpts, idx = 0, yBase = 0) {
    const d = PLINTH_DEPTH;
    addBox(
        group,
        `arch-plinth-${surfaceId}-corner-${idx}`,
        d,
        PLINTH_HEIGHT,
        d,
        xWall + signX * (d / 2),
        yBase + PLINTH_HEIGHT / 2,
        zWall + signZ * (d / 2),
        matOpts
    );
}

/**
 * Bande de plinthe le long d’une arête, prolongée aux deux bouts pour chevaucher les coins.
 * @param {THREE.Group} group
 * @param {string} wallName
 * @param {number} x0
 * @param {number} z0
 * @param {number} x1
 * @param {number} z1
 * @param {number} inX direction vers le côté plinthe (intérieur pièce / galerie)
 * @param {number} inZ
 * @param {ArchOpening[]} openings
 * @param {{ color: string, roughness: number, metalness: number }} matOpts
 * @param {number} [yBase]
 */
function buildArchPlinthEdge(group, wallName, x0, z0, x1, z1, inX, inZ, openings, matOpts, yBase = 0) {
    const d = PLINTH_DEPTH;
    const h = PLINTH_HEIGHT;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) return;
    const ux = dx / len;
    const uz = dz / len;
    const midX = (x0 + x1) / 2;
    const midZ = (z0 + z1) / 2;
    let nx = -uz;
    let nz = ux;
    if (nx * inX + nz * inZ < 0) {
        nx = -nx;
        nz = -nz;
    }
    // Léger chevauchement aux coins (pas de dépassement extérieur).
    const pad = d;
    const span = len + 2 * pad;
    const alongX = Math.abs(dx) >= Math.abs(dz);
    const ops = Array.isArray(openings) ? openings : [];
    buildPlinthSegments(group, wallName, span, ops, (u, depth) => {
        const px = midX + ux * u + nx * (d / 2);
        const pz = midZ + uz * u + nz * (d / 2);
        if (alongX) {
            return { x: px, y: yBase + h / 2, z: pz, sx: depth, sy: h, sz: d };
        }
        return { x: px, y: yBase + h / 2, z: pz, sx: d, sy: h, sz: depth };
    }, matOpts);
}

/**
 * Dalle horizontale polygonale d’un seul tenant (sol / plafond L ou U).
 * @param {THREE.Group} group
 * @param {string} name
 * @param {{ x: number, z: number }[]} ringXZ contour CCW
 * @param {number} thickness
 * @param {number} yCenter
 * @param {{ color: string, roughness: number, metalness: number }} matOpts
 * @param {number} [story]
 * @param {ArchOpening[]} [holes] trous rectangulaires (sol / plafond)
 */
function addArchPolySlab(group, name, ringXZ, thickness, yCenter, matOpts, story = null, holes = []) {
    if (!Array.isArray(ringXZ) || ringXZ.length < 3 || thickness < 0.02) return;
    // Shape XY = (x, −z), extrude +Z, rotateX(−π/2) → XZ monde sans miroir ni décalage.
    const shape = new THREE.Shape();
    shape.moveTo(ringXZ[0].x, -ringXZ[0].z);
    for (let i = 1; i < ringXZ.length; i += 1) {
        shape.lineTo(ringXZ[i].x, -ringXZ[i].z);
    }
    shape.closePath();
    for (const op of Array.isArray(holes) ? holes : []) {
        const r = getSlabHoleRect(op);
        const path = new THREE.Path();
        // Sens inverse du contour pour ExtrudeGeometry.
        path.moveTo(r.minX, -r.minZ);
        path.lineTo(r.maxX, -r.minZ);
        path.lineTo(r.maxX, -r.maxZ);
        path.lineTo(r.minX, -r.maxZ);
        path.closePath();
        shape.holes.push(path);
    }
    const geo = new THREE.ExtrudeGeometry(shape, {
        depth: thickness,
        bevelEnabled: false,
        curveSegments: 1,
    });
    geo.rotateX(-Math.PI / 2);
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (bb) {
        // Recaler uniquement Y — ne pas recentrer XZ (sinon décalage vs murs).
        geo.translate(0, -((bb.min.y + bb.max.y) / 2), 0);
    }
    const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
            color: matOpts.color,
            roughness: matOpts.roughness,
            metalness: matOpts.metalness,
        })
    );
    mesh.name = name;
    mesh.position.y = yCenter;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const surfaceId = getArchSurfaceId(mesh);
    if (surfaceId) {
        mesh.userData[ARCH_SURFACE_KEY] = surfaceId;
        applyArchMeshPlanarUvs(mesh, surfaceId);
    }
    if (story != null && Number.isFinite(Number(story))) {
        mesh.userData[ARCH_STORY_KEY] = Number(story) | 0;
    }
    group.add(mesh);
}

/**
 * Pièce en L : encoche nord-est (multi-étages).
 * wingA = profondeur aile sud (Z), wingB = largeur aile ouest (X).
 */
function buildLLayout(
    group,
    length,
    width,
    height,
    wallT,
    wingA,
    wingB,
    hasCeiling,
    openings,
    matOpts,
    plinthFloors = [],
    plinthMat = matOpts,
    floors = 1
) {
    const plinthSet = new Set(Array.isArray(plinthFloors) ? plinthFloors : []);
    const halfL = length / 2;
    const halfW = width / 2;
    const southD = clampArchWingA(wingA, width);
    const westW = clampArchWingB(wingB, length);
    const notchL = Math.max(ARCH_MIN_WING, length - westW);
    const notchW = Math.max(ARCH_MIN_WING, width - southD);
    const zSouthCenter = -halfW + southD / 2;
    const zNorthCenter = halfW - notchW / 2;
    const xWestCenter = -halfL + westW / 2;
    const xNotchCenter = -halfL + westW + notchL / 2;
    const xJoint = -halfL + westW;
    const zJoint = -halfW + southD;
    const storyCount = Math.max(1, floors | 0);
    const storyPitch = height + FLOOR_THICKNESS;
    const floorRing = [
        { x: -halfL, z: -halfW },
        { x: halfL, z: -halfW },
        { x: halfL, z: zJoint },
        { x: xJoint, z: zJoint },
        { x: xJoint, z: halfW },
        { x: -halfL, z: halfW },
    ];

    for (let story = 0; story < storyCount; story += 1) {
        const yWalk = story * storyPitch;
        const wallOp = (id) => openingsForWallStory(openings, id, story);
        const floorHoles = openingsForWallStory(openings, "floor", story);

        // Même empreinte L à chaque niveau (comble le joint entre murs d’étages).
        addArchPolySlab(
            group,
            `arch-floor-${story}`,
            floorRing,
            FLOOR_THICKNESS,
            yWalk - FLOOR_THICKNESS / 2,
            matOpts,
            story,
            floorHoles
        );

        buildWallPanels(group, "south", length, height, wallT, wallOp("south"), (u, y, h, d) => ({
            x: u, y: yWalk + y + h / 2, z: -halfW + wallT / 2, sx: d, sy: h, sz: wallT,
        }), matOpts, story);
        buildWallPanels(group, "west", width, height, wallT, wallOp("west"), (u, y, h, d) => ({
            x: -halfL + wallT / 2, y: yWalk + y + h / 2, z: u, sx: wallT, sy: h, sz: d,
        }), matOpts, story);
        buildWallPanels(group, "east", southD, height, wallT, wallOp("east"), (u, y, h, d) => ({
            x: halfL - wallT / 2, y: yWalk + y + h / 2, z: zSouthCenter + u, sx: wallT, sy: h, sz: d,
        }), matOpts, story);
        buildWallPanels(group, "east-notch", notchW, height, wallT, wallOp("east-notch"), (u, y, h, d) => ({
            x: xJoint - wallT / 2, y: yWalk + y + h / 2, z: zNorthCenter + u, sx: wallT, sy: h, sz: d,
        }), matOpts, story);
        buildWallPanels(group, "north", westW, height, wallT, wallOp("north"), (u, y, h, d) => ({
            x: xWestCenter + u, y: yWalk + y + h / 2, z: halfW - wallT / 2, sx: d, sy: h, sz: wallT,
        }), matOpts, story);
        buildWallPanels(group, "north-notch", notchL, height, wallT, wallOp("north-notch"), (u, y, h, d) => ({
            x: xNotchCenter + u, y: yWalk + y + h / 2, z: zJoint - wallT / 2, sx: d, sy: h, sz: wallT,
        }), matOpts, story);

        addArchCornerPost(group, "east", -halfL + wallT / 2, -halfW + wallT / 2, wallT, height, matOpts, 0, yWalk, story);
        addArchCornerPost(group, "east", halfL - wallT / 2, -halfW + wallT / 2, wallT, height, matOpts, 1, yWalk, story);
        addArchCornerPost(group, "east", -halfL + wallT / 2, halfW - wallT / 2, wallT, height, matOpts, 2, yWalk, story);
        addArchCornerPost(group, "east", xJoint - wallT / 2, zJoint - wallT / 2, wallT, height, matOpts, 3, yWalk, story);
        addArchCornerPost(group, "east", halfL - wallT / 2, zJoint - wallT / 2, wallT, height, matOpts, 4, yWalk, story);
        addArchCornerPost(group, "east", xJoint - wallT / 2, halfW - wallT / 2, wallT, height, matOpts, 5, yWalk, story);

        if (plinthSet.has(story)) {
            const xW = -halfL + wallT;
            const xE = halfL - wallT;
            const zS = -halfW + wallT;
            const zN = halfW - wallT;
            const xJi = xJoint - wallT;
            const zJi = zJoint - wallT;
            buildArchPlinthEdge(group, "south", xW, zS, xE, zS, 0, 1, wallOp("south"), plinthMat, yWalk);
            buildArchPlinthEdge(group, "west", xW, zS, xW, zN, 1, 0, wallOp("west"), plinthMat, yWalk);
            buildArchPlinthEdge(group, "east", xE, zS, xE, zJi, -1, 0, wallOp("east"), plinthMat, yWalk);
            buildArchPlinthEdge(group, "east-notch", xJi, zJi, xJi, zN, -1, 0, wallOp("east-notch"), plinthMat, yWalk);
            buildArchPlinthEdge(group, "north", xW, zN, xJi, zN, 0, -1, wallOp("north"), plinthMat, yWalk);
            buildArchPlinthEdge(group, "north-notch", xJi, zJi, xE, zJi, 0, -1, wallOp("north-notch"), plinthMat, yWalk);
            addArchPlinthCorner(group, "south", xW, zS, 1, 1, plinthMat, 0, yWalk);
            addArchPlinthCorner(group, "south", xE, zS, -1, 1, plinthMat, 1, yWalk);
            addArchPlinthCorner(group, "north", xW, zN, 1, -1, plinthMat, 2, yWalk);
            addArchPlinthCorner(group, "north-notch", xJi, zJi, -1, -1, plinthMat, 3, yWalk);
            addArchPlinthCorner(group, "east", xE, zJi, -1, -1, plinthMat, 4, yWalk);
            addArchPlinthCorner(group, "north", xJi, zN, -1, -1, plinthMat, 5, yWalk);
        }
    }

    if (hasCeiling) {
        const topY = (storyCount - 1) * storyPitch + height;
        const ceilingHoles = openings.filter((o) => o.wall === "ceiling");
        // Toit = empreinte exacte de la pièce (pas l’inset intérieur).
        addArchPolySlab(
            group,
            "arch-ceiling-0",
            floorRing,
            CEILING_THICKNESS,
            topY + CEILING_THICKNESS / 2,
            matOpts,
            storyCount - 1,
            ceilingHoles
        );
    }
}

/**
 * Pièce en U : cour ouverte au nord (multi-étages).
 * wingA = profondeur bras sud (Z), wingB = largeur de chaque aile (X).
 */
function buildULayout(
    group,
    length,
    width,
    height,
    wallT,
    wingA,
    wingB,
    hasCeiling,
    openings,
    matOpts,
    plinthFloors = [],
    plinthMat = matOpts,
    floors = 1
) {
    const plinthSet = new Set(Array.isArray(plinthFloors) ? plinthFloors : []);
    const halfL = length / 2;
    const halfW = width / 2;
    const southD = clampArchWingA(wingA, width);
    const maxWing = Math.max(ARCH_MIN_WING, (length - ARCH_MIN_WING) / 2);
    const wingW = clampArchWingB(wingB, maxWing * 2 > length ? maxWing : length);
    const wingClamped = Math.min(wingW, maxWing);
    const notchL = Math.max(ARCH_MIN_WING, length - 2 * wingClamped);
    const notchW = Math.max(ARCH_MIN_WING, width - southD);
    const zNorthCenter = halfW - notchW / 2;
    const xWestWing = -halfL + wingClamped / 2;
    const xEastWing = halfL - wingClamped / 2;
    const xWestJoint = -halfL + wingClamped;
    const xEastJoint = halfL - wingClamped;
    const zJoint = -halfW + southD;
    const storyCount = Math.max(1, floors | 0);
    const storyPitch = height + FLOOR_THICKNESS;
    const floorRing = [
        { x: -halfL, z: -halfW },
        { x: halfL, z: -halfW },
        { x: halfL, z: halfW },
        { x: xEastJoint, z: halfW },
        { x: xEastJoint, z: zJoint },
        { x: xWestJoint, z: zJoint },
        { x: xWestJoint, z: halfW },
        { x: -halfL, z: halfW },
    ];

    for (let story = 0; story < storyCount; story += 1) {
        const yWalk = story * storyPitch;
        const wallOp = (id) => openingsForWallStory(openings, id, story);
        const floorHoles = openingsForWallStory(openings, "floor", story);

        // Même empreinte U à chaque niveau (comble le joint entre murs d’étages).
        addArchPolySlab(
            group,
            `arch-floor-${story}`,
            floorRing,
            FLOOR_THICKNESS,
            yWalk - FLOOR_THICKNESS / 2,
            matOpts,
            story,
            floorHoles
        );

        buildWallPanels(group, "south", length, height, wallT, wallOp("south"), (u, y, h, d) => ({
            x: u, y: yWalk + y + h / 2, z: -halfW + wallT / 2, sx: d, sy: h, sz: wallT,
        }), matOpts, story);
        buildWallPanels(group, "west", width, height, wallT, wallOp("west"), (u, y, h, d) => ({
            x: -halfL + wallT / 2, y: yWalk + y + h / 2, z: u, sx: wallT, sy: h, sz: d,
        }), matOpts, story);
        buildWallPanels(group, "east", width, height, wallT, wallOp("east"), (u, y, h, d) => ({
            x: halfL - wallT / 2, y: yWalk + y + h / 2, z: u, sx: wallT, sy: h, sz: d,
        }), matOpts, story);
        buildWallPanels(
            group,
            "north-west",
            wingClamped,
            height,
            wallT,
            [...wallOp("north-west"), ...wallOp("north")],
            (u, y, h, d) => ({
                x: xWestWing + u, y: yWalk + y + h / 2, z: halfW - wallT / 2, sx: d, sy: h, sz: wallT,
            }),
            matOpts,
            story
        );
        buildWallPanels(group, "north-east", wingClamped, height, wallT, wallOp("north-east"), (u, y, h, d) => ({
            x: xEastWing + u, y: yWalk + y + h / 2, z: halfW - wallT / 2, sx: d, sy: h, sz: wallT,
        }), matOpts, story);
        buildWallPanels(group, "court-east", notchW, height, wallT, wallOp("court-east"), (u, y, h, d) => ({
            x: xWestJoint - wallT / 2, y: yWalk + y + h / 2, z: zNorthCenter + u, sx: wallT, sy: h, sz: d,
        }), matOpts, story);
        buildWallPanels(group, "court-west", notchW, height, wallT, wallOp("court-west"), (u, y, h, d) => ({
            x: xEastJoint + wallT / 2, y: yWalk + y + h / 2, z: zNorthCenter + u, sx: wallT, sy: h, sz: d,
        }), matOpts, story);
        buildWallPanels(group, "court-south", notchL, height, wallT, wallOp("court-south"), (u, y, h, d) => ({
            x: u, y: yWalk + y + h / 2, z: zJoint - wallT / 2, sx: d, sy: h, sz: wallT,
        }), matOpts, story);

        addArchCornerPost(group, "east", -halfL + wallT / 2, -halfW + wallT / 2, wallT, height, matOpts, 0, yWalk, story);
        addArchCornerPost(group, "east", halfL - wallT / 2, -halfW + wallT / 2, wallT, height, matOpts, 1, yWalk, story);
        addArchCornerPost(group, "east", -halfL + wallT / 2, halfW - wallT / 2, wallT, height, matOpts, 2, yWalk, story);
        addArchCornerPost(group, "east", halfL - wallT / 2, halfW - wallT / 2, wallT, height, matOpts, 3, yWalk, story);
        addArchCornerPost(group, "east", xWestJoint - wallT / 2, zJoint - wallT / 2, wallT, height, matOpts, 4, yWalk, story);
        addArchCornerPost(group, "east", xEastJoint + wallT / 2, zJoint - wallT / 2, wallT, height, matOpts, 5, yWalk, story);
        addArchCornerPost(group, "east", xWestJoint - wallT / 2, halfW - wallT / 2, wallT, height, matOpts, 6, yWalk, story);
        addArchCornerPost(group, "east", xEastJoint + wallT / 2, halfW - wallT / 2, wallT, height, matOpts, 7, yWalk, story);

        if (plinthSet.has(story)) {
            const northWestOps = [...wallOp("north-west"), ...wallOp("north")];
            const xW = -halfL + wallT;
            const xE = halfL - wallT;
            const zS = -halfW + wallT;
            const zN = halfW - wallT;
            const xWJi = xWestJoint - wallT;
            const xEJi = xEastJoint + wallT;
            const zJi = zJoint - wallT;
            buildArchPlinthEdge(group, "south", xW, zS, xE, zS, 0, 1, wallOp("south"), plinthMat, yWalk);
            buildArchPlinthEdge(group, "west", xW, zS, xW, zN, 1, 0, wallOp("west"), plinthMat, yWalk);
            buildArchPlinthEdge(group, "east", xE, zS, xE, zN, -1, 0, wallOp("east"), plinthMat, yWalk);
            buildArchPlinthEdge(group, "north-west", xW, zN, xWJi, zN, 0, -1, northWestOps, plinthMat, yWalk);
            buildArchPlinthEdge(group, "north-east", xEJi, zN, xE, zN, 0, -1, wallOp("north-east"), plinthMat, yWalk);
            buildArchPlinthEdge(group, "court-east", xWJi, zJi, xWJi, zN, -1, 0, wallOp("court-east"), plinthMat, yWalk);
            buildArchPlinthEdge(group, "court-west", xEJi, zJi, xEJi, zN, 1, 0, wallOp("court-west"), plinthMat, yWalk);
            buildArchPlinthEdge(group, "court-south", xWJi, zJi, xEJi, zJi, 0, -1, wallOp("court-south"), plinthMat, yWalk);
            addArchPlinthCorner(group, "south", xW, zS, 1, 1, plinthMat, 0, yWalk);
            addArchPlinthCorner(group, "south", xE, zS, -1, 1, plinthMat, 1, yWalk);
            addArchPlinthCorner(group, "north-west", xW, zN, 1, -1, plinthMat, 2, yWalk);
            addArchPlinthCorner(group, "north-east", xE, zN, -1, -1, plinthMat, 3, yWalk);
            addArchPlinthCorner(group, "court-south", xWJi, zJi, -1, -1, plinthMat, 4, yWalk);
            addArchPlinthCorner(group, "court-south", xEJi, zJi, 1, -1, plinthMat, 5, yWalk);
            addArchPlinthCorner(group, "north-west", xWJi, zN, -1, -1, plinthMat, 6, yWalk);
            addArchPlinthCorner(group, "north-east", xEJi, zN, 1, -1, plinthMat, 7, yWalk);
        }
    }

    if (hasCeiling) {
        const topY = (storyCount - 1) * storyPitch + height;
        const ceilingHoles = openings.filter((o) => o.wall === "ceiling");
        // Toit = empreinte exacte du U (pas l’inset intérieur).
        addArchPolySlab(
            group,
            "arch-ceiling-0",
            floorRing,
            CEILING_THICKNESS,
            topY + CEILING_THICKNESS / 2,
            matOpts,
            storyCount - 1,
            ceilingHoles
        );
    }
}

/**
 * Patio : sol + murs + cour intérieure (multi-étages, cour ouverte à chaque niveau).
 * wingA / wingB = taille de la cour (X / Z).
 */
function buildPatioLayout(
    group,
    length,
    width,
    height,
    wallT,
    wingA,
    wingB,
    hasCeiling,
    openings,
    matOpts,
    plinthFloors = [],
    plinthMat,
    floors = 1
) {
    const plinthSet = new Set(Array.isArray(plinthFloors) ? plinthFloors : []);
    const halfL = length / 2;
    const halfW = width / 2;
    const maxCourtX = Math.max(ARCH_MIN_WING, length - 2.4);
    const maxCourtZ = Math.max(ARCH_MIN_WING, width - 2.4);
    const courtX = clampArchWingB(wingB, maxCourtX);
    const courtZ = clampArchWingA(wingA, maxCourtZ);
    const ewSpan = Math.max(0.2, width - 2 * wallT);
    const courtNS = Math.max(0.2, courtX + 2 * wallT);
    const courtEW = Math.max(0.2, courtZ + 2 * wallT);
    const storyCount = Math.max(1, floors | 0);
    const storyPitch = height + FLOOR_THICKNESS;
    const courtHole = {
        id: "patio-court",
        type: "hole",
        wall: "floor",
        offset: 0,
        offsetZ: 0,
        width: Math.max(0.4, courtX),
        height: Math.max(0.4, courtZ),
        sill: 0,
    };

    for (let story = 0; story < storyCount; story += 1) {
        const yWalk = story * storyPitch;
        const wallOp = (id) => openingsForWallStory(openings, id, story);

        // Emprise extérieure à chaque niveau (+ trou cour aux étages > 0).
        if (story === 0) {
            addBox(
                group,
                "arch-floor-0",
                length,
                FLOOR_THICKNESS,
                width,
                0,
                yWalk - FLOOR_THICKNESS / 2,
                0,
                matOpts,
                0
            );
        } else {
            buildSlabPanels(
                group,
                "floor",
                length,
                width,
                FLOOR_THICKNESS,
                yWalk - FLOOR_THICKNESS / 2,
                [
                    {
                        ...courtHole,
                        id: `patio-court-${story}`,
                        width: Math.max(0.4, courtX),
                        height: Math.max(0.4, courtZ),
                    },
                    ...openingsForWallStory(openings, "floor", story),
                ],
                matOpts,
                story
            );
        }

        buildWallPanels(group, "north", length, height, wallT, wallOp("north"), (u, y, h, d) => ({
            x: u, y: yWalk + y + h / 2, z: halfW - wallT / 2, sx: d, sy: h, sz: wallT,
        }), matOpts, story);
        buildWallPanels(group, "south", length, height, wallT, wallOp("south"), (u, y, h, d) => ({
            x: u, y: yWalk + y + h / 2, z: -halfW + wallT / 2, sx: d, sy: h, sz: wallT,
        }), matOpts, story);
        buildWallPanels(group, "east", ewSpan, height, wallT, wallOp("east"), (u, y, h, d) => ({
            x: halfL - wallT / 2, y: yWalk + y + h / 2, z: u, sx: wallT, sy: h, sz: d,
        }), matOpts, story);
        buildWallPanels(group, "west", ewSpan, height, wallT, wallOp("west"), (u, y, h, d) => ({
            x: -halfL + wallT / 2, y: yWalk + y + h / 2, z: u, sx: wallT, sy: h, sz: d,
        }), matOpts, story);
        buildWallPanels(group, "court-north", courtNS, height, wallT, wallOp("court-north"), (u, y, h, d) => ({
            x: u, y: yWalk + y + h / 2, z: courtZ / 2 + wallT / 2, sx: d, sy: h, sz: wallT,
        }), matOpts, story);
        buildWallPanels(group, "court-south", courtNS, height, wallT, wallOp("court-south"), (u, y, h, d) => ({
            x: u, y: yWalk + y + h / 2, z: -courtZ / 2 - wallT / 2, sx: d, sy: h, sz: wallT,
        }), matOpts, story);
        buildWallPanels(group, "court-east", courtEW, height, wallT, wallOp("court-east"), (u, y, h, d) => ({
            x: courtX / 2 + wallT / 2, y: yWalk + y + h / 2, z: u, sx: wallT, sy: h, sz: d,
        }), matOpts, story);
        buildWallPanels(group, "court-west", courtEW, height, wallT, wallOp("court-west"), (u, y, h, d) => ({
            x: -courtX / 2 - wallT / 2, y: yWalk + y + h / 2, z: u, sx: wallT, sy: h, sz: d,
        }), matOpts, story);

        addArchCornerPost(group, "court-east", -courtX / 2 - wallT / 2, -courtZ / 2 - wallT / 2, wallT, height, matOpts, 0, yWalk, story);
        addArchCornerPost(group, "court-east", courtX / 2 + wallT / 2, -courtZ / 2 - wallT / 2, wallT, height, matOpts, 1, yWalk, story);
        addArchCornerPost(group, "court-east", -courtX / 2 - wallT / 2, courtZ / 2 + wallT / 2, wallT, height, matOpts, 2, yWalk, story);
        addArchCornerPost(group, "court-east", courtX / 2 + wallT / 2, courtZ / 2 + wallT / 2, wallT, height, matOpts, 3, yWalk, story);
        addArchCornerPost(group, "east", -halfL + wallT / 2, -halfW + wallT / 2, wallT, height, matOpts, 4, yWalk, story);
        addArchCornerPost(group, "east", halfL - wallT / 2, -halfW + wallT / 2, wallT, height, matOpts, 5, yWalk, story);
        addArchCornerPost(group, "east", -halfL + wallT / 2, halfW - wallT / 2, wallT, height, matOpts, 6, yWalk, story);
        addArchCornerPost(group, "east", halfL - wallT / 2, halfW - wallT / 2, wallT, height, matOpts, 7, yWalk, story);

        if (plinthSet.has(story)) {
            const xW = -halfL + wallT;
            const xE = halfL - wallT;
            const zS = -halfW + wallT;
            const zN = halfW - wallT;
            const cXW = -courtX / 2 - wallT;
            const cXE = courtX / 2 + wallT;
            const cZS = -courtZ / 2 - wallT;
            const cZN = courtZ / 2 + wallT;
            buildArchPlinthEdge(group, "south", xW, zS, xE, zS, 0, 1, wallOp("south"), plinthMat, yWalk);
            buildArchPlinthEdge(group, "north", xW, zN, xE, zN, 0, -1, wallOp("north"), plinthMat, yWalk);
            buildArchPlinthEdge(group, "east", xE, zS, xE, zN, -1, 0, wallOp("east"), plinthMat, yWalk);
            buildArchPlinthEdge(group, "west", xW, zS, xW, zN, 1, 0, wallOp("west"), plinthMat, yWalk);
            buildArchPlinthEdge(group, "court-south", cXW, cZS, cXE, cZS, 0, -1, wallOp("court-south"), plinthMat, yWalk);
            buildArchPlinthEdge(group, "court-north", cXW, cZN, cXE, cZN, 0, 1, wallOp("court-north"), plinthMat, yWalk);
            buildArchPlinthEdge(group, "court-east", cXE, cZS, cXE, cZN, 1, 0, wallOp("court-east"), plinthMat, yWalk);
            buildArchPlinthEdge(group, "court-west", cXW, cZS, cXW, cZN, -1, 0, wallOp("court-west"), plinthMat, yWalk);
            addArchPlinthCorner(group, "south", xW, zS, 1, 1, plinthMat, 0, yWalk);
            addArchPlinthCorner(group, "south", xE, zS, -1, 1, plinthMat, 1, yWalk);
            addArchPlinthCorner(group, "north", xW, zN, 1, -1, plinthMat, 2, yWalk);
            addArchPlinthCorner(group, "north", xE, zN, -1, -1, plinthMat, 3, yWalk);
            addArchPlinthCorner(group, "court-south", cXW, cZS, -1, -1, plinthMat, 4, yWalk);
            addArchPlinthCorner(group, "court-south", cXE, cZS, 1, -1, plinthMat, 5, yWalk);
            addArchPlinthCorner(group, "court-north", cXW, cZN, -1, 1, plinthMat, 6, yWalk);
            addArchPlinthCorner(group, "court-north", cXE, cZN, 1, 1, plinthMat, 7, yWalk);
        }
    }

    if (hasCeiling) {
        const topY = (storyCount - 1) * storyPitch + height;
        // Toit = emprise exacte du patio (murs compris) + trou cour.
        buildSlabPanels(
            group,
            "ceiling",
            length,
            width,
            CEILING_THICKNESS,
            topY + CEILING_THICKNESS / 2,
            [
                ...openings.filter((o) => o.wall === "ceiling"),
                {
                    ...courtHole,
                    wall: "ceiling",
                    id: "patio-court",
                    width: Math.max(0.4, courtX),
                    height: Math.max(0.4, courtZ),
                },
            ],
            matOpts,
            storyCount - 1
        );
    }
}

/**
 * @param {number} length
 * @param {number} height
 * @returns {ArchOpening[]}
 */
function defaultDoorOpening(length, height) {
    // Porte ≥ diamètre capsule joueur (1 m) + marge, sinon impossible d’entrer.
    const doorW = Math.min(1.4, Math.max(1.2, length - 0.5));
    return [
        {
            id: "door-default",
            type: "door",
            wall: "south",
            offset: 0,
            offsetZ: 0,
            width: doorW,
            height: Math.min(2.1, height - 0.15),
            sill: 0,
            floor: 0,
            fill: "simple",
        },
    ];
}

/**
 * Découpe une dalle (sol / plafond) autour de trous rectangulaires XZ.
 * @param {THREE.Group} group
 * @param {"floor" | "ceiling"} surfaceId
 * @param {number} sizeX
 * @param {number} sizeZ
 * @param {number} thickness
 * @param {number} yCenter
 * @param {ArchOpening[]} openings
 * @param {{ color: string, roughness: number, metalness: number }} matOpts
 * @param {number} [story]
 */
function buildSlabPanels(group, surfaceId, sizeX, sizeZ, thickness, yCenter, openings, matOpts, story = 0) {
    const halfX = sizeX / 2;
    const halfZ = sizeZ / 2;
    /** @type {{ minX: number, maxX: number, minZ: number, maxZ: number }[]} */
    const holes = [];
    for (const op of openings) {
        const r = getSlabHoleRect(op);
        let minX = THREE.MathUtils.clamp(r.minX, -halfX + 0.05, halfX - 0.35);
        let maxX = THREE.MathUtils.clamp(r.maxX, minX + 0.3, halfX - 0.05);
        let minZ = THREE.MathUtils.clamp(r.minZ, -halfZ + 0.05, halfZ - 0.35);
        let maxZ = THREE.MathUtils.clamp(r.maxZ, minZ + 0.3, halfZ - 0.05);
        holes.push({ minX, maxX, minZ, maxZ });
    }

    /** @param {number[]} arr */
    const uniqSorted = (arr) =>
        [...new Set(arr.map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);

    /** @type {number[]} */
    const xs = [-halfX];
    /** @type {number[]} */
    const zs = [-halfZ];
    for (const h of holes) {
        xs.push(h.minX, h.maxX);
        zs.push(h.minZ, h.maxZ);
    }
    xs.push(halfX);
    zs.push(halfZ);
    const UX = uniqSorted(xs);
    const UZ = uniqSorted(zs);

    let panelIndex = 0;
    for (let i = 0; i < UX.length - 1; i += 1) {
        for (let j = 0; j < UZ.length - 1; j += 1) {
            const a = UX[i];
            const b = UX[i + 1];
            const c = UZ[j];
            const d = UZ[j + 1];
            const sx = b - a;
            const sz = d - c;
            if (sx < 0.04 || sz < 0.04) continue;
            const mx = (a + b) / 2;
            const mz = (c + d) / 2;
            const inHole = holes.some(
                (h) => mx > h.minX + 1e-4 && mx < h.maxX - 1e-4 && mz > h.minZ + 1e-4 && mz < h.maxZ - 1e-4
            );
            if (inHole) continue;
            addBox(
                group,
                `arch-${surfaceId}-${panelIndex++}`,
                sx,
                thickness,
                sz,
                mx,
                yCenter,
                mz,
                matOpts,
                story
            );
        }
    }
}

/**
 * Découpe un mur en panneaux solides autour des ouvertures.
 * @param {THREE.Group} group
 * @param {string} wallName
 * @param {number} span
 * @param {number} height
 * @param {number} wallT
 * @param {ArchOpening[]} openings
 * @param {(u: number, y: number, h: number, depth: number) => { x: number, y: number, z: number, sx: number, sy: number, sz: number }} place
 * @param {{ color: string, roughness: number, metalness: number }} matOpts
 * @param {number} [seg]
 */
function buildWallPanels(group, wallName, span, height, wallT, openings, place, matOpts, seg = 0) {
    const half = span / 2;
    /** @type {{ left: number, right: number, bottom: number, top: number }[]} */
    const holes = [];
    for (const op of openings) {
        const halfW = op.width / 2;
        let left = THREE.MathUtils.clamp(op.offset - halfW, -half + 0.05, half - 0.35);
        let right = THREE.MathUtils.clamp(op.offset + halfW, left + 0.3, half - 0.05);
        const bottom = THREE.MathUtils.clamp(op.sill, 0, height - 0.3);
        const top = THREE.MathUtils.clamp(bottom + op.height, bottom + 0.3, height - 0.05);
        holes.push({ left, right, bottom, top });
    }
    holes.sort((a, b) => a.left - b.left);

    /** @type {number[]} */
    const cuts = [-half];
    for (const h of holes) {
        cuts.push(h.left, h.right);
    }
    cuts.push(half);

    let panelIndex = 0;
    for (let i = 0; i < cuts.length - 1; i += 1) {
        const a = cuts[i];
        const b = cuts[i + 1];
        const depth = b - a;
        if (depth < 0.04) continue;
        const mid = (a + b) / 2;
        // Segment dans un trou si son milieu est à l’intérieur (pas seulement
        // une égalité stricte des bornes — plus robuste aux chevauchements).
        const coveringHole = holes.find((h) => mid > h.left + 1e-4 && mid < h.right - 1e-4);

        if (!coveringHole) {
            const p = place(mid, 0, height, depth);
            addBox(
                group,
                `arch-wall-${wallName}-${seg}-${panelIndex++}`,
                p.sx,
                p.sy,
                p.sz,
                p.x,
                p.y,
                p.z,
                matOpts,
                seg
            );
            continue;
        }

        if (coveringHole.bottom > 0.04) {
            const p = place(mid, 0, coveringHole.bottom, depth);
            addBox(
                group,
                `arch-wall-${wallName}-${seg}-${panelIndex++}`,
                p.sx,
                p.sy,
                p.sz,
                p.x,
                p.y,
                p.z,
                matOpts,
                seg
            );
        }
        const lintelH = height - coveringHole.top;
        if (lintelH > 0.04) {
            const p = place(mid, coveringHole.top, lintelH, depth);
            addBox(
                group,
                `arch-wall-${wallName}-${seg}-${panelIndex++}`,
                p.sx,
                p.sy,
                p.sz,
                p.x,
                p.y,
                p.z,
                matOpts,
                seg
            );
        }
    }

    buildOpeningFills(group, wallName, openings, place, wallT, seg);
}

const OPENING_FRAME_W = 0.075;
const OPENING_FRAME_EXTRA = 0.03;
const OPENING_LEAF_T = 0.042;
const OPENING_MULLION = 0.034;
const OPENING_FRAME_COLOR = "#efe8dc";
const OPENING_DOOR_COLOR = "#6e4a2e";
const OPENING_HANDLE_COLOR = "#c4a35a";
const OPENING_GLASS_COLOR = "#9ec9e6";

/**
 * Murs N/S (et ailes nord) : longueur en X. Murs E/O : longueur en Z.
 * @param {string} wallName
 */
function wallRunsAlongX(wallName) {
    const n = String(wallName || "");
    if (n === "north-east" || n === "north-west") return true;
    if (n.includes("east") || n.includes("west")) return false;
    return true;
}

/**
 * Yaw pour un modèle dont la face avant est +Z (vers l’extérieur de la pièce).
 * @param {string} wallName
 */
function wallOutwardYaw(wallName) {
    const n = String(wallName || "");
    if (!wallRunsAlongX(n)) {
        if (n.includes("west") && !n.includes("east")) return -Math.PI / 2;
        return Math.PI / 2;
    }
    if (n === "south" || n === "court-south" || n === "north-notch") return Math.PI;
    return 0;
}

/**
 * @param {string} wallName
 * @param {{ x: number, y: number, z: number, sx: number, sy: number, sz: number }} hole
 * @param {number} along
 * @param {number} y
 * @param {number} normal
 */
function openingLocalOffset(wallName, along, y, normal) {
    if (wallRunsAlongX(wallName)) {
        return { x: along, y, z: normal };
    }
    return { x: normal, y, z: along };
}

/**
 * @param {THREE.Group} group
 * @param {string} wallName
 * @param {ArchOpening} op
 * @param {{ x: number, y: number, z: number }} hole
 * @param {number} yaw
 * @param {number} seg
 */
function createOpeningFillPivot(group, wallName, op, hole, yaw, seg) {
    const anchor = new THREE.Group();
    anchor.name = `arch-opening-anchor-${wallName}-${seg}-${op.id}`;
    anchor.position.set(hole.x, hole.y, hole.z);
    anchor.rotation.y = yaw;
    anchor.userData.archOpeningAnchor = true;

    const pivot = new THREE.Group();
    pivot.name = `arch-opening-fill-${op.id}`;
    pivot.userData[LAB_ARCH_OPENING_FILL_KEY] = true;
    pivot.userData.archOpeningId = op.id;
    pivot.userData.archOpeningKind = op.type;
    pivot.userData.archOpeningFill = true;
    pivot.userData.snapToFloor = false;
    applyArchOpeningFillTx(pivot, op.fillTx);
    if (op.fillColor) pivot.userData.objectColor = op.fillColor;
    anchor.add(pivot);
    group.add(anchor);
    return pivot;
}

/**
 * @param {string} wallName
 * @param {number} alongSize
 * @param {number} height
 * @param {number} thick
 */
function openingBoxSize(wallName, alongSize, height, thick) {
    if (wallRunsAlongX(wallName)) return { sx: alongSize, sy: height, sz: thick };
    return { sx: thick, sy: height, sz: alongSize };
}

/**
 * @param {THREE.Group} parent
 * @param {string} name
 * @param {number} sx
 * @param {number} sy
 * @param {number} sz
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {THREE.Material} material
 * @param {{ noCollision?: boolean, story?: number }} [opts]
 */
function addOpeningMesh(parent, name, sx, sy, sz, x, y, z, material, opts = {}) {
    if (sx < 0.012 || sy < 0.012 || sz < 0.012) return null;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (opts.noCollision) mesh.userData.archNoCollision = true;
    mesh.userData.archOpeningFill = true;
    if (opts.story != null && Number.isFinite(Number(opts.story))) {
        mesh.userData[ARCH_STORY_KEY] = Number(opts.story) | 0;
    }
    parent.add(mesh);
    return mesh;
}

/**
 * @param {THREE.Group} group
 * @param {string} wallName
 * @param {ArchOpening[]} openings
 * @param {(u: number, y: number, h: number, d: number) => { x: number, y: number, z: number, sx: number, sy: number, sz: number }} place
 * @param {number} wallT
 * @param {number} seg
 */
function buildOpeningFills(group, wallName, openings, place, wallT, seg) {
    for (const op of openings) {
        if (op.type !== "door" && op.type !== "window") continue;
        const fill = op.fill || "simple";
        if (fill === "none") continue;
        const hole = place(op.offset, op.sill, op.height, op.width);
        if (fill === "imported" && op.importDataUrl) {
            const template = getArchOpeningImportTemplate(op.importDataUrl, op.importFormat || "glb");
            if (template) {
                addImportedOpeningFill(group, wallName, op, hole, template, seg);
                continue;
            }
        }
        addSimpleOpeningFill(group, wallName, op, hole, wallT, seg);
    }
}

/**
 * @param {THREE.Group} group
 * @param {string} wallName
 * @param {ArchOpening} op
 * @param {{ x: number, y: number, z: number, sx: number, sy: number, sz: number }} hole
 * @param {number} wallT
 * @param {number} seg
 */
function addSimpleOpeningFill(group, wallName, op, hole, wallT, seg) {
    const alongX = wallRunsAlongX(wallName);
    const openingW = alongX ? hole.sx : hole.sz;
    const openingH = hole.sy;
    const wallThick = Math.max(0.06, alongX ? hole.sz : hole.sx);
    const frameDepth = Math.max(wallThick, wallT) + OPENING_FRAME_EXTRA * 2;
    const frameW = Math.min(OPENING_FRAME_W, openingW * 0.22);
    const isDoor = op.type === "door";
    const innerW = Math.max(0.25, openingW - 2 * frameW);
    const innerH = Math.max(0.25, openingH - frameW - (isDoor ? 0 : frameW));
    const leafY = isDoor ? -frameW / 2 : 0;
    const prefix = `arch-opening-${wallName}-${seg}-${op.id}`;
    const story = Number.isFinite(Number(op.floor)) ? Number(op.floor) | 0 : 0;
    const pivot = createOpeningFillPivot(group, wallName, op, hole, 0, seg);

    const frameMat = new THREE.MeshStandardMaterial({
        color: op.fillColor || OPENING_FRAME_COLOR,
        roughness: 0.55,
        metalness: 0.04,
    });
    const left = openingLocalOffset(wallName, -openingW / 2 + frameW / 2, 0, 0);
    const leftSize = openingBoxSize(wallName, frameW, openingH, frameDepth);
    addOpeningMesh(
        pivot,
        `arch-opening-frame-${prefix}-jamb-l`,
        leftSize.sx,
        leftSize.sy,
        leftSize.sz,
        left.x,
        left.y,
        left.z,
        frameMat,
        { story }
    );
    const right = openingLocalOffset(wallName, openingW / 2 - frameW / 2, 0, 0);
    addOpeningMesh(
        pivot,
        `arch-opening-frame-${prefix}-jamb-r`,
        leftSize.sx,
        leftSize.sy,
        leftSize.sz,
        right.x,
        right.y,
        right.z,
        frameMat,
        { story }
    );
    const header = openingLocalOffset(wallName, 0, openingH / 2 - frameW / 2, 0);
    const headerSize = openingBoxSize(wallName, openingW, frameW, frameDepth);
    addOpeningMesh(
        pivot,
        `arch-opening-frame-${prefix}-lintel`,
        headerSize.sx,
        headerSize.sy,
        headerSize.sz,
        header.x,
        header.y,
        header.z,
        frameMat,
        { story }
    );
    if (!isDoor) {
        const sill = openingLocalOffset(wallName, 0, -openingH / 2 + frameW / 2, 0);
        addOpeningMesh(
            pivot,
            `arch-opening-frame-${prefix}-sill`,
            headerSize.sx,
            headerSize.sy,
            headerSize.sz,
            sill.x,
            sill.y,
            sill.z,
            frameMat,
            { story }
        );
    }

    if (isDoor) {
        const leafMat = new THREE.MeshStandardMaterial({
            color: op.fillColor || OPENING_DOOR_COLOR,
            roughness: 0.72,
            metalness: 0.05,
        });
        const leaf = openingLocalOffset(wallName, 0, leafY, 0);
        const leafSize = openingBoxSize(wallName, innerW, innerH, OPENING_LEAF_T);
        addOpeningMesh(
            pivot,
            `arch-opening-leaf-${prefix}`,
            leafSize.sx,
            leafSize.sy,
            leafSize.sz,
            leaf.x,
            leaf.y,
            leaf.z,
            leafMat,
            { noCollision: true, story }
        );
        const handleMat = new THREE.MeshStandardMaterial({
            color: OPENING_HANDLE_COLOR,
            roughness: 0.28,
            metalness: 0.85,
        });
        const handleAlong = innerW / 2 - 0.1;
        const handle = openingLocalOffset(wallName, handleAlong, leafY, OPENING_LEAF_T / 2 + 0.012);
        const handleSize = openingBoxSize(wallName, 0.028, 0.11, 0.028);
        addOpeningMesh(
            pivot,
            `arch-opening-leaf-${prefix}-handle`,
            handleSize.sx,
            handleSize.sy,
            handleSize.sz,
            handle.x,
            handle.y,
            handle.z,
            handleMat,
            { noCollision: true, story }
        );
        return;
    }

    const glassMat = new THREE.MeshStandardMaterial({
        color: OPENING_GLASS_COLOR,
        roughness: 0.06,
        metalness: 0.12,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
    });
    const glass = openingLocalOffset(wallName, 0, 0, 0);
    const glassSize = openingBoxSize(wallName, innerW, innerH, 0.016);
    addOpeningMesh(
        pivot,
        `arch-opening-glass-${prefix}`,
        glassSize.sx,
        glassSize.sy,
        glassSize.sz,
        glass.x,
        glass.y,
        glass.z,
        glassMat,
        { noCollision: true, story }
    );
    const mullionMat = new THREE.MeshStandardMaterial({
        color: op.fillColor || OPENING_FRAME_COLOR,
        roughness: 0.5,
        metalness: 0.04,
    });
    const vBar = openingLocalOffset(wallName, 0, 0, 0);
    const vSize = openingBoxSize(wallName, OPENING_MULLION, innerH, 0.028);
    addOpeningMesh(
        pivot,
        `arch-opening-frame-${prefix}-mullion-v`,
        vSize.sx,
        vSize.sy,
        vSize.sz,
        vBar.x,
        vBar.y,
        vBar.z,
        mullionMat,
        { noCollision: true, story }
    );
    const hBar = openingLocalOffset(wallName, 0, 0, 0);
    const hSize = openingBoxSize(wallName, innerW, OPENING_MULLION, 0.028);
    addOpeningMesh(
        pivot,
        `arch-opening-frame-${prefix}-mullion-h`,
        hSize.sx,
        hSize.sy,
        hSize.sz,
        hBar.x,
        hBar.y,
        hBar.z,
        mullionMat,
        { noCollision: true, story }
    );
}

/**
 * @param {THREE.Group} group
 * @param {string} wallName
 * @param {ArchOpening} op
 * @param {{ x: number, y: number, z: number, sx: number, sy: number, sz: number }} hole
 * @param {THREE.Object3D} template
 * @param {number} seg
 */
function addImportedOpeningFill(group, wallName, op, hole, template, seg) {
    const alongX = wallRunsAlongX(wallName);
    const openingW = Math.max(0.2, alongX ? hole.sx : hole.sz);
    const openingH = Math.max(0.2, hole.sy);
    const wallThick = Math.max(0.08, alongX ? hole.sz : hole.sx);
    const pivot = createOpeningFillPivot(group, wallName, op, hole, wallOutwardYaw(wallName), seg);

    const clone = template.clone(true);
    clone.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        node.userData.archSharedGeometry = true;
        node.userData.archNoCollision = true;
        node.userData.archOpeningFill = true;
        if (Array.isArray(node.material)) {
            node.material = node.material.map((m) => (m?.clone ? m.clone() : m));
        } else if (node.material?.clone) {
            node.material = node.material.clone();
        }
        node.castShadow = true;
        node.receiveShadow = true;
    });

    const measure = new THREE.Group();
    measure.add(clone);
    measure.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(measure);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    clone.position.sub(center);

    const sx = size.x > 1e-4 ? openingW / size.x : 1;
    const sy = size.y > 1e-4 ? openingH / size.y : 1;
    const sz = size.z > 1e-4 ? Math.max(wallThick, 0.12) / size.z : 1;
    const uniform = Math.min(sx, sy);
    const fit = new THREE.Group();
    measure.remove(clone);
    fit.add(clone);
    fit.scale.set(uniform, uniform, uniform * Math.min(size.z > 1e-4 ? sz / uniform : 1, 1.35));
    pivot.add(fit);
}

/**
 * Plinthes au sol : segments solides, troués aux portes (sill ≈ 0).
 * @param {THREE.Group} group
 * @param {string} wallName
 * @param {number} span
 * @param {ArchOpening[]} openings
 * @param {(u: number, depth: number) => { x: number, y: number, z: number, sx: number, sy: number, sz: number }} place
 * @param {{ color: string, roughness: number, metalness: number }} matOpts
 */
function buildPlinthSegments(group, wallName, span, openings, place, matOpts) {
    const half = span / 2;
    /** @type {{ left: number, right: number }[]} */
    const gaps = [];
    for (const op of openings) {
        // Seules les portes (ou sill au sol) coupent la plinthe.
        if (op.sill > 0.02) continue;
        const halfW = op.width / 2;
        let left = THREE.MathUtils.clamp(op.offset - halfW, -half + 0.02, half - 0.2);
        let right = THREE.MathUtils.clamp(op.offset + halfW, left + 0.2, half - 0.02);
        gaps.push({ left, right });
    }
    gaps.sort((a, b) => a.left - b.left);

    /** @type {number[]} */
    const cuts = [-half];
    for (const g of gaps) {
        cuts.push(g.left, g.right);
    }
    cuts.push(half);

    let idx = 0;
    for (let i = 0; i < cuts.length - 1; i += 1) {
        const a = cuts[i];
        const b = cuts[i + 1];
        const depth = b - a;
        // Seuil bas : les prolongements de coin (~1 cm) doivent passer.
        if (depth < 0.008) continue;
        const mid = (a + b) / 2;
        const isDoorGap = gaps.some(
            (g) => Math.abs(a - g.left) < 0.02 && Math.abs(b - g.right) < 0.02
        );
        if (isDoorGap) continue;
        const p = place(mid, depth);
        addBox(group, `arch-plinth-${wallName}-${idx++}`, p.sx, p.sy, p.sz, p.x, p.y, p.z, matOpts);
    }
}

/**
 * Identifiant de surface (mur / sol / plafond / plinthe) depuis un mesh architecture.
 * @param {THREE.Object3D | null | undefined} mesh
 * @returns {string | null}
 */
export function getArchSurfaceId(mesh) {
    if (!mesh) return null;
    const tagged = mesh.userData?.[ARCH_SURFACE_KEY];
    if (typeof tagged === "string" && tagged) return tagged;
    const name = String(mesh.name || "");
    if (name === "arch-floor" || name.startsWith("arch-floor-")) return "floor";
    if (name === "arch-ceiling" || name.startsWith("arch-ceiling-")) return "ceiling";
    const plinth = ARCH_WALL_NAME_RE.exec(name.replace("arch-plinth-", "arch-wall-"));
    if (name.startsWith("arch-plinth-") && plinth) return `plinth-${plinth[1]}`;
    const m = ARCH_WALL_NAME_RE.exec(name);
    return m ? m[1] : null;
}

/**
 * Tous les meshes d’une même surface (ex. panneaux d’un mur avec ouvertures).
 * @param {THREE.Object3D} room
 * @param {string | null | undefined} surfaceId
 * @returns {THREE.Mesh[]}
 */
export function getArchSurfaceMeshes(room, surfaceId) {
    if (!isLabArchitecture(room) || !surfaceId) return [];
    /** @type {THREE.Mesh[]} */
    const out = [];
    room.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        if (node.name === "shadow-overlay") return;
        if (getArchSurfaceId(node) === surfaceId) out.push(node);
    });
    return out;
}

/**
 * UV planaires en mètres (espace pièce) : tile uniforme sur tout un mur
 * même s’il est découpé en panneaux (porte / fenêtre).
 * @param {THREE.Mesh} mesh
 * @param {string} surfaceId
 */
export function applyArchMeshPlanarUvs(mesh, surfaceId) {
    const geo = mesh.geometry;
    const pos = geo?.attributes?.position;
    if (!pos) return;

    const ox = mesh.position.x;
    const oy = mesh.position.y;
    const oz = mesh.position.z;
    const uvs = new Float32Array(pos.count * 2);

    for (let i = 0; i < pos.count; i += 1) {
        const x = pos.getX(i) + ox;
        const y = pos.getY(i) + oy;
        const z = pos.getZ(i) + oz;
        let u = x;
        let v = y;
        if (isArchWallAlongZ(surfaceId)) {
            u = z;
            v = y;
        } else if (surfaceId === "floor" || surfaceId === "ceiling") {
            u = x;
            v = z;
        } else {
            // north / south / plinth-N/S / défaut : façade X × hauteur Y
            u = x;
            v = y;
        }
        uvs[i * 2] = u;
        uvs[i * 2 + 1] = v;
    }

    geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geo.attributes.uv.needsUpdate = true;
}

/**
 * Marque un panneau architecture pour conserver les UV planaires (sync tile).
 * Les matériaux par face sont gérés côté mode Face (une seule face texturée).
 * @param {THREE.Mesh} mesh
 * @param {string} surfaceId
 */
export function prepareArchSurfaceMeshForTexture(mesh, surfaceId) {
    delete mesh.userData._labUvXyzActive;
    mesh.userData[ARCH_SURFACE_KEY] = surfaceId;
    mesh.userData[ARCH_SURFACE_TEXTURED_KEY] = surfaceId;
    applyArchMeshPlanarUvs(mesh, surfaceId);
}

/**
 * @param {THREE.Group} group
 * @param {string} name
 * @param {number} sx
 * @param {number} sy
 * @param {number} sz
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {{ color: string, roughness: number, metalness: number }} matOpts
 * @param {number | null} [story]
 */
function addBox(group, name, sx, sy, sz, x, y, z, matOpts, story = null) {
    // Plinthes 1 cm : seuil plus bas que les murs (0.02).
    const minDim = String(name || "").startsWith("arch-plinth-") ? 0.008 : 0.02;
    if (sx < minDim || sy < minDim || sz < minDim) return;
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(sx, sy, sz),
        new THREE.MeshStandardMaterial({
            color: matOpts.color,
            roughness: matOpts.roughness,
            metalness: matOpts.metalness,
        })
    );
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const surfaceId = getArchSurfaceId(mesh);
    if (surfaceId) {
        mesh.userData[ARCH_SURFACE_KEY] = surfaceId;
        applyArchMeshPlanarUvs(mesh, surfaceId);
    }
    if (story != null && Number.isFinite(Number(story))) {
        mesh.userData[ARCH_STORY_KEY] = Number(story) | 0;
    }
    group.add(mesh);
}
