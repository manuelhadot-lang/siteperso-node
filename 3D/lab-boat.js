/** Barque en bois — coque bordée, plancher, bancs, avirons ; flotte sur la houle. */
import * as THREE from "three";

export const LAB_BOAT_KEY = "labBoat";
export const BOAT_LENGTH_KEY = "boatLength";
export const BOAT_WIDTH_KEY = "boatWidth";
export const BOAT_FLOAT_KEY = "boatFloat";
/** "procedural" | "imported" | "native" — native = l’objet d’origine est la coque. */
export const BOAT_SHELL_KEY = "boatShell";
/** Kind d’origine quand boatShell === "native" (cube, sphere, imported…). */
export const BOAT_BASE_KIND_KEY = "boatBaseKind";
/** Distance origine → bas de la coque (m), pour les modèles importés. */
export const BOAT_KEEL_OFFSET_KEY = "boatKeelOffset";
/** Densité relative à l’eau (1 = affleure, > 1 = coule) — poussée d’Archimède. */
export const BOAT_DENSITY_KEY = "boatDensity";

export const BOAT_DEFAULT_LENGTH = 6.4;
export const BOAT_DEFAULT_WIDTH = 2.8;
export const BOAT_MIN_LENGTH = 3;
export const BOAT_MAX_LENGTH = 24;
export const BOAT_MIN_WIDTH = 1.6;
export const BOAT_MAX_WIDTH = 10;

/** Enfoncement de la quille sous la surface de l’eau (m). */
export const BOAT_DRAFT = 0.3;
/** Densité par défaut (coque de bois creuse : flotte haut sur l’eau). */
export const BOAT_DEFAULT_DENSITY = 0.32;
export const BOAT_MIN_DENSITY = 0.05;
export const BOAT_MAX_DENSITY = 3;
/** Vitesse de descente d’un objet plus dense que l’eau (m/s, à densité 2). */
const BOAT_SINK_SPEED = 1.1;
/** Hauteur du plancher au-dessus du bas de la quille (m). */
export const BOAT_FLOOR_HEIGHT = 0.42;

const _boatBox = new THREE.Box3();
const _boatSize = new THREE.Vector3();
const _boatStand = new THREE.Vector3();

const HULL_STATIONS = 56;
const HULL_GIRTH_STEPS = 9;
const HULL_THICKNESS = 0.055;
const HULL_SECTION_POWER = 0.55;
const FLOOR_THICKNESS = 0.05;
const RAIL_HALF_WIDTH = 0.055;
const RAIL_HALF_HEIGHT = 0.032;
const KEEL_HALF_WIDTH = 0.055;
const KEEL_HALF_HEIGHT = 0.035;
const THWART_THICKNESS = 0.05;
const THWART_DEPTH = 0.3;
const THWART_HEIGHT = 0.78;

/** Une tuile de texture bois = 2,4 m dans le fil, 1,2 m en travers (6 lames). */
const WOOD_U_SCALE = 1 / 2.4;
const WOOD_V_SCALE = 1 / 1.2;

const _up = new THREE.Vector3(0, 1, 0);
const _tangent = new THREE.Vector3();
const _side = new THREE.Vector3();
const _normalUp = new THREE.Vector3();

/**
 * @param {THREE.Object3D} object
 */
export function isLabBoat(object) {
    return !!object?.userData?.[LAB_BOAT_KEY];
}

/**
 * @param {number} length
 */
export function clampBoatLength(length) {
    const value = Number(length);
    if (!Number.isFinite(value)) return BOAT_DEFAULT_LENGTH;
    return THREE.MathUtils.clamp(value, BOAT_MIN_LENGTH, BOAT_MAX_LENGTH);
}

/**
 * @param {number} width
 */
export function clampBoatWidth(width) {
    const value = Number(width);
    if (!Number.isFinite(value)) return BOAT_DEFAULT_WIDTH;
    return THREE.MathUtils.clamp(value, BOAT_MIN_WIDTH, BOAT_MAX_WIDTH);
}

/**
 * @param {THREE.Object3D} object
 */
export function getBoatLength(object) {
    return clampBoatLength(object?.userData?.[BOAT_LENGTH_KEY] ?? BOAT_DEFAULT_LENGTH);
}

/**
 * @param {THREE.Object3D} object
 */
export function getBoatWidth(object) {
    return clampBoatWidth(object?.userData?.[BOAT_WIDTH_KEY] ?? BOAT_DEFAULT_WIDTH);
}

/**
 * @param {THREE.Object3D} object
 */
export function isBoatFloating(object) {
    return object?.userData?.[BOAT_FLOAT_KEY] !== false;
}

/**
 * @param {number} value
 */
export function clampBoatDensity(value) {
    const v = Number(value);
    if (!Number.isFinite(v)) return BOAT_DEFAULT_DENSITY;
    return THREE.MathUtils.clamp(v, BOAT_MIN_DENSITY, BOAT_MAX_DENSITY);
}

/**
 * Densité relative à l’eau (poussée d’Archimède) : 0,3 = bois léger, 1 = affleure, > 1 = coule.
 * @param {THREE.Object3D} object
 */
export function getBoatDensity(object) {
    const raw = object?.userData?.[BOAT_DENSITY_KEY];
    if (typeof raw === "number" && Number.isFinite(raw)) return clampBoatDensity(raw);
    return BOAT_DEFAULT_DENSITY;
}

/**
 * @param {THREE.Object3D} object
 * @param {number} value
 */
export function setBoatDensity(object, value) {
    if (!object?.userData) return;
    object.userData[BOAT_DENSITY_KEY] = clampBoatDensity(value);
}

/**
 * @param {THREE.Object3D} object
 */
export function isBoatSinking(object) {
    return getBoatDensity(object) >= 1;
}

/**
 * @param {THREE.Object3D} object
 * @returns {"procedural" | "imported" | "native"}
 */
export function getBoatShell(object) {
    const shell = object?.userData?.[BOAT_SHELL_KEY];
    if (shell === "imported" || shell === "native") return shell;
    return "procedural";
}

/**
 * Empreinte utile pour la houle (longueur ≈ axe long, largeur ≈ axe court horizontal).
 * @param {THREE.Object3D} object
 */
export function measureBoatFootprint(object) {
    object.updateWorldMatrix(true, true);
    _boatBox.setFromObject(object);
    _boatBox.getSize(_boatSize);
    const sx = Math.max(_boatSize.x, 0.2);
    const sz = Math.max(_boatSize.z, 0.2);
    const length = clampBoatLength(Math.max(sx, sz));
    const width = clampBoatWidth(Math.min(sx, sz));
    return { length, width, height: Math.max(_boatSize.y, 0.1) };
}

/**
 * Active / met à jour les métadonnées de flottaison sur un objet quelconque.
 * @param {THREE.Object3D} object
 * @param {{ length?: number, width?: number, float?: boolean, shell?: string, baseKind?: string, density?: number }} [opts]
 */
export function applyBoatFloatMetadata(object, opts = {}) {
    if (!object?.userData) return object;
    const measured = measureBoatFootprint(object);
    object.userData[LAB_BOAT_KEY] = true;
    object.userData[BOAT_FLOAT_KEY] = opts.float !== false;
    if (typeof opts.density === "number") {
        object.userData[BOAT_DENSITY_KEY] = clampBoatDensity(opts.density);
    }
    object.userData[BOAT_LENGTH_KEY] = clampBoatLength(opts.length ?? measured.length);
    object.userData[BOAT_WIDTH_KEY] = clampBoatWidth(opts.width ?? measured.width);
    if (opts.shell) object.userData[BOAT_SHELL_KEY] = opts.shell;
    else if (!object.userData[BOAT_SHELL_KEY]) object.userData[BOAT_SHELL_KEY] = "procedural";
    if (opts.baseKind) object.userData[BOAT_BASE_KIND_KEY] = opts.baseKind;
    if (object.rotation.order !== "YXZ") {
        object.rotation.setFromQuaternion(object.quaternion, "YXZ");
    }
    refreshBoatKeelOffset(object);
    return object;
}

/**
 * Recalcule la hauteur de l’origine au-dessus de la quille (modèles importés).
 * Mesure à plat (pitch/roll nuls) pour un offset stable pendant le tangage.
 * @param {THREE.Object3D} boat
 * @returns {number}
 */
export function refreshBoatKeelOffset(boat) {
    if (!boat) return 0;
    const rx = boat.rotation.x;
    const rz = boat.rotation.z;
    boat.rotation.x = 0;
    boat.rotation.z = 0;
    boat.updateWorldMatrix(true, true);
    _boatBox.setFromObject(boat);
    let offset = boat.position.y - _boatBox.min.y;
    if (!Number.isFinite(offset) || offset < 0) offset = 0;
    offset = Math.min(offset, 80);
    boat.userData[BOAT_KEEL_OFFSET_KEY] = offset;
    _boatBox.getSize(_boatSize);
    boat.userData.boatHullHeight = Math.max(_boatSize.y, 0.05);
    boat.rotation.x = rx;
    boat.rotation.z = rz;
    boat.updateWorldMatrix(true, true);
    return offset;
}

/**
 * @param {THREE.Object3D} boat
 * @returns {number}
 */
export function getBoatKeelOffset(boat) {
    const cached = boat?.userData?.[BOAT_KEEL_OFFSET_KEY];
    if (typeof cached === "number" && Number.isFinite(cached)) return cached;
    return refreshBoatKeelOffset(boat);
}

/**
 * Décale le contenu pour que le bas du modèle soit à y local ≈ 0 (quille = origine).
 * Sans ça, beaucoup de .glb (pivot au centre / au pont) finissent sous l’eau.
 * @param {THREE.Object3D} boat
 */
export function alignBoatContentKeelToOrigin(boat) {
    if (!boat?.children?.length) return boat;

    const rx = boat.rotation.x;
    const rz = boat.rotation.z;
    const py = boat.position.y;
    boat.rotation.x = 0;
    boat.rotation.z = 0;
    boat.position.y = 0;
    boat.updateWorldMatrix(true, true);

    _boatBox.setFromObject(boat);
    if (!_boatBox.isEmpty()) {
        // Remonter / descendre les enfants pour coller le bas du AABB à y=0 monde.
        const worldLift = -_boatBox.min.y;
        const sy = boat.scale?.y || 1;
        const localLift = worldLift / (Math.abs(sy) > 1e-6 ? sy : 1);
        if (Number.isFinite(localLift) && Math.abs(localLift) > 1e-5) {
            for (const child of boat.children) {
                child.position.y += localLift;
            }
        }
    }

    boat.position.y = py;
    boat.rotation.x = rx;
    boat.rotation.z = rz;
    boat.updateWorldMatrix(true, true);

    boat.userData[BOAT_KEEL_OFFSET_KEY] = 0;
    _boatBox.setFromObject(boat);
    _boatBox.getSize(_boatSize);
    boat.userData.boatHullHeight = Math.max(_boatSize.y, 0.05);
    // Vérifie l’offset résiduel (au cas où scale / nesting reste imparfait).
    refreshBoatKeelOffset(boat);
    boat.userData.boatKeelAligned = true;
    return boat;
}

/**
 * Tirant d’eau adapté à la coque (évite d’immerger tout un petit .glb).
 * @param {THREE.Object3D} boat
 */
export function getBoatDraft(boat) {
    const height =
        typeof boat?.userData?.boatHullHeight === "number" && boat.userData.boatHullHeight > 0
            ? boat.userData.boatHullHeight
            : null;
    // Poussée d’Archimède (approximation boîte homogène) : la fraction immergée
    // d’un corps flottant est égale à sa densité relative à l’eau.
    const fraction = THREE.MathUtils.clamp(getBoatDensity(boat), BOAT_MIN_DENSITY, 1);
    const h = height ?? (getBoatShell(boat) === "procedural" ? 0.94 * (boat.scale?.y || 1) : 1.2);
    return fraction * h;
}

/**
 * Réduit un modèle trop grand et aligne la quille pour une flottaison stable.
 * @param {THREE.Object3D} object
 * @param {{ targetLength?: number, alignKeel?: boolean }} [opts]
 */
export function prepareBoatForFloat(object, opts = {}) {
    if (!object) return object;
    object.updateWorldMatrix(true, true);
    _boatBox.setFromObject(object);
    _boatBox.getSize(_boatSize);
    const maxDim = Math.max(_boatSize.x, _boatSize.y, _boatSize.z, 0.2);
    const target = typeof opts.targetLength === "number" ? opts.targetLength : 8;
    if (maxDim > 14) {
        const factor = target / maxDim;
        object.scale.x *= factor;
        object.scale.y *= factor;
        object.scale.z *= factor;
        object.updateWorldMatrix(true, true);
    }
    if (opts.alignKeel === true || (opts.alignKeel !== false && getBoatShell(object) !== "procedural")) {
        alignBoatContentKeelToOrigin(object);
    } else {
        refreshBoatKeelOffset(object);
    }
    const again = measureBoatFootprint(object);
    object.userData[BOAT_LENGTH_KEY] = clampBoatLength(again.length);
    object.userData[BOAT_WIDTH_KEY] = clampBoatWidth(again.width);
    return object;
}

/**
 * Point d’appui avatar (pieds) sur la barque / l’objet.
 * @param {THREE.Object3D} object
 * @returns {THREE.Vector3}
 */
export function getBoatStandPoint(object) {
    object.updateWorldMatrix(true, true);
    if (isLabBoat(object) && getBoatShell(object) === "procedural") {
        _boatStand.set(0, BOAT_FLOOR_HEIGHT + 0.02, 0);
        object.localToWorld(_boatStand);
        return _boatStand.clone();
    }
    _boatBox.setFromObject(object);
    return new THREE.Vector3(
        (_boatBox.min.x + _boatBox.max.x) * 0.5,
        _boatBox.max.y + 0.02,
        (_boatBox.min.z + _boatBox.max.z) * 0.5
    );
}

/* ---------------------------------------------------------------- formes */

/** Demi-largeur de la coque à la station t ∈ [-1, 1] (t = 1 → étrave). */
function hullHalfBeam(t, width) {
    const s = Math.max(0, 1 - t * t);
    const beam = (width / 2) * Math.pow(s, 0.62) * (1 - 0.09 * t);
    return Math.max(beam, 0.045);
}

/** Ligne de quille (tonture inversée : la quille remonte aux extrémités). */
function hullKeelY(t) {
    return 0.09 + 0.34 * Math.pow(Math.abs(t), 2.3);
}

/** Ligne de livet (bord supérieur), relevée à l’avant et à l’arrière. */
function hullSheerY(t) {
    return 0.86 + 0.3 * Math.pow(Math.abs(t), 2.4);
}

/** Demi-largeur intérieure à la hauteur y, station t. */
function hullInnerHalfWidthAt(t, width, y) {
    const keel = hullKeelY(t) + HULL_THICKNESS;
    const sheer = hullSheerY(t);
    if (y <= keel || sheer <= keel) return 0;
    const beam = Math.max(hullHalfBeam(t, width) - HULL_THICKNESS, 0);
    const v = THREE.MathUtils.clamp((y - keel) / (sheer - keel), 0, 1);
    return beam * Math.pow(v, HULL_SECTION_POWER);
}

/* ------------------------------------------------------------- géométrie */

/**
 * Coque : peau extérieure, doublage intérieur, listel de livet et fermetures.
 * @param {number} length
 * @param {number} width
 */
function buildHullGeometry(length, width) {
    const halfL = length / 2;
    const rings = HULL_STATIONS;
    const cross = HULL_GIRTH_STEPS * 2 + 1;
    const positions = [];
    const uvs = [];
    const indices = [];

    /** @param {boolean} inner */
    function pushSurface(inner) {
        const base = positions.length / 3;
        for (let j = 0; j <= rings; j += 1) {
            const t = -1 + (2 * j) / rings;
            const z = t * halfL;
            const beamOuter = hullHalfBeam(t, width);
            const beam = inner ? Math.max(beamOuter - HULL_THICKNESS, 0.01) : beamOuter;
            const keel = inner ? hullKeelY(t) + HULL_THICKNESS : hullKeelY(t);
            const sheer = hullSheerY(t);
            const xs = [];
            const ys = [];
            for (let i = 0; i < cross; i += 1) {
                const s = (i - HULL_GIRTH_STEPS) / HULL_GIRTH_STEPS;
                const v = Math.abs(s);
                const sign = s < 0 ? -1 : 1;
                xs.push(sign * beam * Math.pow(v, HULL_SECTION_POWER));
                ys.push(keel + Math.max(sheer - keel, 0.01) * v);
            }
            // Développé de la maîtresse-section, signé de part et d’autre de la quille.
            const girths = new Array(cross).fill(0);
            for (let i = HULL_GIRTH_STEPS + 1; i < cross; i += 1) {
                girths[i] = girths[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
            }
            for (let i = HULL_GIRTH_STEPS - 1; i >= 0; i -= 1) {
                girths[i] = girths[i + 1] - Math.hypot(xs[i + 1] - xs[i], ys[i + 1] - ys[i]);
            }
            for (let i = 0; i < cross; i += 1) {
                positions.push(xs[i], ys[i], z);
                uvs.push(z * WOOD_U_SCALE, girths[i] * WOOD_V_SCALE);
            }
        }
        for (let j = 0; j < rings; j += 1) {
            for (let i = 0; i < cross - 1; i += 1) {
                const a = base + j * cross + i;
                const b = a + 1;
                const c = a + cross;
                const d = c + 1;
                if (inner) {
                    indices.push(a, c, b, b, c, d);
                } else {
                    indices.push(a, b, c, b, d, c);
                }
            }
        }
        return base;
    }

    const outerBase = pushSurface(false);
    const innerBase = pushSurface(true);

    // Listel de livet : relie peau et doublage sur les deux bords supérieurs.
    for (const edge of [0, cross - 1]) {
        const flip = edge === 0;
        for (let j = 0; j < rings; j += 1) {
            const o0 = outerBase + j * cross + edge;
            const o1 = outerBase + (j + 1) * cross + edge;
            const i0 = innerBase + j * cross + edge;
            const i1 = innerBase + (j + 1) * cross + edge;
            if (flip) {
                indices.push(o0, o1, i0, i0, o1, i1);
            } else {
                indices.push(o0, i0, o1, o1, i0, i1);
            }
        }
    }

    // Fermeture des pointes avant / arrière.
    for (const ring of [0, rings]) {
        for (let i = 0; i < cross - 1; i += 1) {
            const o0 = outerBase + ring * cross + i;
            const o1 = o0 + 1;
            const i0 = innerBase + ring * cross + i;
            const i1 = i0 + 1;
            if (ring === 0) {
                indices.push(o0, i0, o1, o1, i0, i1);
            } else {
                indices.push(o0, o1, i0, i0, o1, i1);
            }
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}

/**
 * Pièce de bois balayée le long d’un chemin (quille, plat-bord, membrure).
 * @param {THREE.Vector3[]} path
 * @param {number} halfW
 * @param {number} halfH
 * @param {{ refUp?: THREE.Vector3 }} [opts]
 */
function buildSweptBeamGeometry(path, halfW, halfH, opts = {}) {
    const refUp = opts.refUp ?? _up;
    const positions = [];
    const uvs = [];
    const indices = [];
    let travelled = 0;

    for (let j = 0; j < path.length; j += 1) {
        const prev = path[Math.max(j - 1, 0)];
        const next = path[Math.min(j + 1, path.length - 1)];
        _tangent.subVectors(next, prev);
        if (_tangent.lengthSq() < 1e-10) _tangent.set(0, 0, 1);
        _tangent.normalize();
        _side.crossVectors(refUp, _tangent);
        if (_side.lengthSq() < 1e-8) _side.set(1, 0, 0);
        _side.normalize();
        _normalUp.crossVectors(_tangent, _side).normalize();

        if (j > 0) travelled += path[j].distanceTo(path[j - 1]);
        const u = travelled * WOOD_U_SCALE;
        const corners = [
            [1, 1],
            [-1, 1],
            [-1, -1],
            [1, -1],
        ];
        let girth = 0;
        for (let k = 0; k < corners.length; k += 1) {
            const [cs, cu] = corners[k];
            positions.push(
                path[j].x + _side.x * halfW * cs + _normalUp.x * halfH * cu,
                path[j].y + _side.y * halfW * cs + _normalUp.y * halfH * cu,
                path[j].z + _side.z * halfW * cs + _normalUp.z * halfH * cu
            );
            uvs.push(u, girth * WOOD_V_SCALE);
            girth += k % 2 === 0 ? halfW * 2 : halfH * 2;
        }
    }

    for (let j = 0; j < path.length - 1; j += 1) {
        for (let k = 0; k < 4; k += 1) {
            const k1 = (k + 1) % 4;
            const a = j * 4 + k;
            const b = j * 4 + k1;
            const c = (j + 1) * 4 + k1;
            const d = (j + 1) * 4 + k;
            indices.push(a, b, c, a, c, d);
        }
    }

    const last = (path.length - 1) * 4;
    indices.push(0, 3, 2, 0, 2, 1);
    indices.push(last, last + 1, last + 2, last, last + 2, last + 3);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}

/**
 * UV « planche » : le fil du bois suit l’axe long de la pièce.
 * @param {THREE.BufferGeometry} geometry
 * @param {"x" | "y" | "z"} grainAxis
 */
function applyWoodUv(geometry, grainAxis = "z") {
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    if (!position || !normal) return geometry;
    const axes = ["x", "y", "z"];
    const uv = new Float32Array(position.count * 2);
    for (let i = 0; i < position.count; i += 1) {
        const nx = Math.abs(normal.getX(i));
        const ny = Math.abs(normal.getY(i));
        const nz = Math.abs(normal.getZ(i));
        const dominant = nx >= ny && nx >= nz ? "x" : ny >= nz ? "y" : "z";
        const px = position.getX(i);
        const py = position.getY(i);
        const pz = position.getZ(i);
        const coord = { x: px, y: py, z: pz };
        let uAxis = grainAxis;
        if (dominant === grainAxis) {
            uAxis = axes.find((a) => a !== dominant) ?? "x";
        }
        const vAxis = axes.find((a) => a !== dominant && a !== uAxis) ?? "y";
        uv[i * 2] = coord[uAxis] * WOOD_U_SCALE;
        uv[i * 2 + 1] = coord[vAxis] * WOOD_V_SCALE;
    }
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return geometry;
}

/* ------------------------------------------------------------- texture */

/** @param {number} seed */
function makeRandom(seed) {
    let a = seed >>> 0;
    return function random() {
        a += 0x6d2b79f5;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** @type {string | null} */
let woodTextureDataUrl = null;

/** Texture de bordé : 6 lames horizontales, fil, nœuds et joints. */
export function getBoatWoodTextureDataUrl() {
    if (woodTextureDataUrl) return woodTextureDataUrl;
    if (typeof document === "undefined") return null;
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const planks = 6;
    const rowH = size / planks;
    const random = makeRandom(20260801);

    ctx.fillStyle = "#7a5127";
    ctx.fillRect(0, 0, size, size);

    for (let p = 0; p < planks; p += 1) {
        const y0 = p * rowH;
        const shade = 0.82 + random() * 0.34;
        const r = Math.round(138 * shade);
        const g = Math.round(94 * shade);
        const b = Math.round(52 * shade);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(0, y0, size, rowH);

        const grainCount = 30 + Math.floor(random() * 22);
        for (let i = 0; i < grainCount; i += 1) {
            const gy = y0 + random() * rowH;
            const amp = 1 + random() * 3.2;
            const freq = 1 + Math.floor(random() * 3);
            const phase = random() * Math.PI * 2;
            const alpha = 0.05 + random() * 0.14;
            ctx.strokeStyle =
                random() < 0.75
                    ? `rgba(58, 32, 12, ${alpha})`
                    : `rgba(216, 174, 121, ${alpha})`;
            ctx.lineWidth = 0.6 + random() * 1.9;
            ctx.beginPath();
            for (let x = 0; x <= size; x += 8) {
                const y = gy + Math.sin((x / size) * Math.PI * 2 * freq + phase) * amp;
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        if (random() < 0.6) {
            const kx = 40 + random() * (size - 80);
            const ky = y0 + rowH * (0.28 + random() * 0.44);
            const kr = 3 + random() * 4;
            for (let ring = kr * 3.2; ring > 0.6; ring -= 1.5) {
                const fade = 1 - ring / (kr * 3.2);
                ctx.strokeStyle = `rgba(52, 28, 10, ${0.08 + 0.28 * fade})`;
                ctx.lineWidth = 0.9;
                ctx.beginPath();
                ctx.ellipse(kx, ky, ring, ring * 0.55, 0, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        ctx.fillStyle = "rgba(34, 18, 6, 0.55)";
        ctx.fillRect(0, y0, size, 2.2);
        ctx.fillStyle = "rgba(255, 226, 182, 0.09)";
        ctx.fillRect(0, y0 + 2.2, size, 1.4);

        // Clous / rivets alignés sur les couples.
        const nails = 5;
        for (let n = 0; n < nails; n += 1) {
            const nx = ((n + 0.5) / nails) * size;
            const ny = y0 + rowH * 0.5;
            ctx.fillStyle = "rgba(40, 34, 30, 0.45)";
            ctx.beginPath();
            ctx.arc(nx, ny, 1.7, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "rgba(226, 205, 170, 0.22)";
            ctx.beginPath();
            ctx.arc(nx - 0.5, ny - 0.5, 0.9, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    woodTextureDataUrl = canvas.toDataURL("image/jpeg", 0.86);
    return woodTextureDataUrl;
}

/* ---------------------------------------------------------------- barque */

/**
 * @param {{ length?: number, width?: number, color?: string }} [options]
 */
export function buildBoatGroup(options = {}) {
    const length = clampBoatLength(options.length ?? BOAT_DEFAULT_LENGTH);
    const width = clampBoatWidth(options.width ?? BOAT_DEFAULT_WIDTH);
    const halfL = length / 2;
    const tint = options.color || "#a97a45";

    const group = new THREE.Group();
    group.name = "lab-boat";

    const hullMaterial = new THREE.MeshStandardMaterial({
        color: tint,
        roughness: 0.78,
        metalness: 0.03,
        side: THREE.DoubleSide,
    });
    const woodMaterial = new THREE.MeshStandardMaterial({
        color: tint,
        roughness: 0.82,
        metalness: 0.02,
    });

    const hull = new THREE.Mesh(buildHullGeometry(length, width), hullMaterial);
    hull.name = "boat-hull";
    group.add(hull);

    // Quille extérieure.
    const keelPath = [];
    for (let j = 0; j <= 24; j += 1) {
        const t = -0.97 + (1.94 * j) / 24;
        keelPath.push(new THREE.Vector3(0, hullKeelY(t) - KEEL_HALF_HEIGHT, t * halfL));
    }
    const keel = new THREE.Mesh(
        buildSweptBeamGeometry(keelPath, KEEL_HALF_WIDTH, KEEL_HALF_HEIGHT),
        woodMaterial
    );
    keel.name = "boat-keel";
    group.add(keel);

    // Plats-bords bâbord / tribord.
    for (const sign of [-1, 1]) {
        const railPath = [];
        for (let j = 0; j <= 40; j += 1) {
            const t = -0.995 + (1.99 * j) / 40;
            const beam = hullHalfBeam(t, width) - HULL_THICKNESS * 0.5;
            railPath.push(
                new THREE.Vector3(sign * beam, hullSheerY(t) + RAIL_HALF_HEIGHT * 0.6, t * halfL)
            );
        }
        const rail = new THREE.Mesh(
            buildSweptBeamGeometry(railPath, RAIL_HALF_WIDTH, RAIL_HALF_HEIGHT),
            woodMaterial
        );
        rail.name = sign < 0 ? "boat-rail-port" : "boat-rail-starboard";
        group.add(rail);
    }

    // Étrave et étambot.
    for (const sign of [-1, 1]) {
        const t = sign * 0.985;
        const baseY = hullKeelY(t);
        const topY = hullSheerY(t) + 0.16;
        const stemPath = [];
        for (let j = 0; j <= 6; j += 1) {
            const k = j / 6;
            const y = baseY + (topY - baseY) * k;
            const z = sign * halfL * (0.985 + 0.015 * k);
            stemPath.push(new THREE.Vector3(0, y, z));
        }
        const stem = new THREE.Mesh(
            buildSweptBeamGeometry(stemPath, 0.05, 0.11, { refUp: new THREE.Vector3(0, 0, 1) }),
            woodMaterial
        );
        stem.name = sign < 0 ? "boat-stem-stern" : "boat-stem-bow";
        group.add(stem);
    }

    // Plancher : lames longitudinales, longueur limitée par la carène.
    const floorTop = BOAT_FLOOR_HEIGHT;
    const maxHalfWidth = hullInnerHalfWidthAt(0, width, floorTop);
    const plankCount = Math.max(5, Math.round((maxHalfWidth * 2) / 0.24));
    const plankPitch = (maxHalfWidth * 2) / plankCount;
    const plankWidth = plankPitch - 0.015;
    for (let p = 0; p < plankCount; p += 1) {
        const cx = -maxHalfWidth + plankPitch * (p + 0.5);
        const need = Math.abs(cx) + plankWidth * 0.5;
        let tMin = null;
        let tMax = null;
        for (let j = 0; j <= 120; j += 1) {
            const t = -1 + (2 * j) / 120;
            if (hullInnerHalfWidthAt(t, width, floorTop) >= need) {
                if (tMin === null) tMin = t;
                tMax = t;
            }
        }
        if (tMin === null || tMax === null) continue;
        const zMin = tMin * halfL;
        const zMax = tMax * halfL;
        // Les lames trop courtes contre le retour de galbord ne sont pas posées.
        if (zMax - zMin < 1) continue;
        const plank = new THREE.Mesh(
            applyWoodUv(
                new THREE.BoxGeometry(plankWidth, FLOOR_THICKNESS, zMax - zMin),
                "z"
            ),
            woodMaterial
        );
        plank.name = `boat-floor-${p}`;
        plank.position.set(cx, floorTop - FLOOR_THICKNESS / 2, (zMin + zMax) / 2);
        group.add(plank);
    }

    // Bancs de nage.
    for (const tSeat of [-0.52, -0.02, 0.48]) {
        const seatWidth = hullInnerHalfWidthAt(tSeat, width, THWART_HEIGHT) * 2;
        if (seatWidth < 0.6) continue;
        const thwart = new THREE.Mesh(
            applyWoodUv(
                new THREE.BoxGeometry(seatWidth, THWART_THICKNESS, THWART_DEPTH),
                "x"
            ),
            woodMaterial
        );
        thwart.name = `boat-thwart-${tSeat}`;
        thwart.position.set(0, THWART_HEIGHT - THWART_THICKNESS / 2, tSeat * halfL);
        group.add(thwart);
    }

    // Membrures apparentes.
    for (const tRib of [-0.72, -0.38, 0, 0.34, 0.66]) {
        for (const sign of [-1, 1]) {
            const ribPath = [];
            const keelY = hullKeelY(tRib) + HULL_THICKNESS;
            const sheerY = hullSheerY(tRib);
            for (let j = 0; j <= 8; j += 1) {
                const v = 0.28 + (0.72 * j) / 8;
                const beam = Math.max(hullHalfBeam(tRib, width) - HULL_THICKNESS, 0);
                ribPath.push(
                    new THREE.Vector3(
                        sign * beam * Math.pow(v, HULL_SECTION_POWER) - sign * 0.02,
                        keelY + (sheerY - keelY) * v,
                        tRib * halfL
                    )
                );
            }
            const rib = new THREE.Mesh(
                buildSweptBeamGeometry(ribPath, 0.035, 0.025, {
                    refUp: new THREE.Vector3(0, 0, 1),
                }),
                woodMaterial
            );
            rib.name = `boat-rib-${tRib}-${sign}`;
            group.add(rib);
        }
    }

    // Avirons rangés le long du bordé, posés sur les bancs.
    const oarLength = Math.min(length * 0.5, 3);
    const oarX = hullInnerHalfWidthAt(0, width, THWART_HEIGHT) * 0.45;
    const oarY = THWART_HEIGHT + 0.05;
    for (const sign of [-1, 1]) {
        const shaft = new THREE.Mesh(
            applyWoodUv(new THREE.CylinderGeometry(0.032, 0.042, oarLength, 12, 1), "y"),
            woodMaterial
        );
        shaft.name = `boat-oar-shaft-${sign}`;
        shaft.rotation.x = Math.PI / 2;
        shaft.position.set(sign * oarX, oarY, -oarLength * 0.08);
        group.add(shaft);

        const blade = new THREE.Mesh(
            applyWoodUv(new THREE.BoxGeometry(0.16, 0.022, 0.68), "z"),
            woodMaterial
        );
        blade.name = `boat-oar-blade-${sign}`;
        blade.position.set(sign * oarX, oarY, shaft.position.z - oarLength * 0.5 - 0.3);
        group.add(blade);
    }

    group.userData[LAB_BOAT_KEY] = true;
    group.userData[BOAT_LENGTH_KEY] = length;
    group.userData[BOAT_WIDTH_KEY] = width;
    group.userData[BOAT_FLOAT_KEY] = true;
    group.userData[BOAT_SHELL_KEY] = "procedural";
    return group;
}

/**
 * Vide les meshes d’une barque (avant remplacement d’apparence).
 * @param {THREE.Object3D} boat
 */
export function clearBoatVisual(boat) {
    if (!boat) return;
    const doomed = [...boat.children];
    for (const child of doomed) {
        boat.remove(child);
        child.traverse((node) => {
            if (node.geometry) node.geometry.dispose?.();
            const mats = Array.isArray(node.material) ? node.material : [node.material];
            for (const mat of mats) {
                if (!mat) continue;
                // Ne pas disposer les textures partagées runtime du parent.
                mat.dispose?.();
            }
        });
    }
}

/**
 * Remplace le contenu visuel par un Object3D (modèle importé, clone, etc.).
 * @param {THREE.Object3D} boat
 * @param {THREE.Object3D} content
 * @param {{ shell?: string, baseKind?: string, importFormat?: string, importName?: string, importDataUrl?: string | null }} [meta]
 */
export function setBoatVisualContent(boat, content, meta = {}) {
    clearBoatVisual(boat);
    content.name = content.name || "boat-content";
    boat.add(content);
    if (meta.shell) boat.userData[BOAT_SHELL_KEY] = meta.shell;
    prepareBoatForFloat(boat, { alignKeel: true });
    const measured = measureBoatFootprint(boat);
    applyBoatFloatMetadata(boat, {
        length: measured.length,
        width: measured.width,
        float: isBoatFloating(boat),
        shell: meta.shell || "imported",
        baseKind: meta.baseKind,
    });
    if (meta.importFormat) boat.userData.importFormat = meta.importFormat;
    if (meta.importName) boat.userData.importName = meta.importName;
    if (meta.importDataUrl !== undefined) boat.userData.importDataUrl = meta.importDataUrl;
    return boat;
}

/* ----------------------------------------------------------- flottaison */

/**
 * Cale la barque sur la houle : pilonnement + tangage + roulis.
 * Densité ≥ 1 (Archimède) : l’objet coule jusqu’au fond (opts.floorY).
 * @param {THREE.Object3D} boat
 * @param {(x: number, z: number) => number | null} sampleWaveY
 * @param {number} dt
 * @param {{ floorY?: number }} [opts]
 */
export function updateBoatFloat(boat, sampleWaveY, dt, opts = {}) {
    if (!isLabBoat(boat) || !isBoatFloating(boat)) return false;
    if (typeof sampleWaveY !== "function") return false;

    // Auto-réparation : une position/rotation NaN (drag interrompu, échantillon
    // corrompu…) ne se résorbe jamais via lerp — on la remet à une valeur saine.
    if (!Number.isFinite(boat.position.x)) boat.position.x = 0;
    if (!Number.isFinite(boat.position.z)) boat.position.z = 0;
    if (!Number.isFinite(boat.position.y)) boat.position.y = 0;
    if (!Number.isFinite(boat.rotation.x)) boat.rotation.x = 0;
    if (!Number.isFinite(boat.rotation.y)) boat.rotation.y = 0;
    if (!Number.isFinite(boat.rotation.z)) boat.rotation.z = 0;

    if (getBoatShell(boat) !== "procedural" && !boat.userData.boatKeelAligned) {
        alignBoatContentKeelToOrigin(boat);
        boat.userData.boatKeelAligned = true;
    }

    const density = getBoatDensity(boat);
    if (density >= 1) {
        // Plus dense que l’eau : la poussée d’Archimède ne suffit plus, l’objet
        // descend (d’autant plus vite qu’il est dense) et se pose au fond.
        const stepSink = THREE.MathUtils.clamp(dt, 0.001, 0.1);
        const floorY = typeof opts.floorY === "number" ? opts.floorY : 0;
        const keelSink = getBoatKeelOffset(boat);
        const restY = floorY + keelSink;
        if (boat.position.y > restY) {
            const speed = BOAT_SINK_SPEED * Math.min(density - 0.9, 2);
            boat.position.y = Math.max(restY, boat.position.y - speed * stepSink);
        }
        const damp = 1 - Math.exp(-3 * stepSink);
        boat.rotation.x += (0 - boat.rotation.x) * damp;
        boat.rotation.z += (0 - boat.rotation.z) * damp;
        return true;
    }

    const halfL = Math.max(0.4, getBoatLength(boat) * 0.42);
    const halfW = Math.max(0.25, getBoatWidth(boat) * 0.45);
    if (boat.rotation.order !== "YXZ") {
        boat.rotation.setFromQuaternion(boat.quaternion, "YXZ");
    }
    const yaw = boat.rotation.y;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const sx = Math.cos(yaw);
    const sz = -Math.sin(yaw);
    const cx = boat.position.x;
    const cz = boat.position.z;

    const bow = sampleWaveY(cx + fx * halfL, cz + fz * halfL);
    const stern = sampleWaveY(cx - fx * halfL, cz - fz * halfL);
    const starboard = sampleWaveY(cx + sx * halfW, cz + sz * halfW);
    const port = sampleWaveY(cx - sx * halfW, cz - sz * halfW);
    if (
        !Number.isFinite(bow) ||
        !Number.isFinite(stern) ||
        !Number.isFinite(starboard) ||
        !Number.isFinite(port)
    ) {
        return false;
    }

    const draft = getBoatDraft(boat);
    const keel = getBoatKeelOffset(boat);
    const targetY = (bow + stern + starboard + port) * 0.25 - draft + keel;
    const targetPitch = -Math.atan2(bow - stern, halfL * 2);
    const targetRoll = Math.atan2(starboard - port, halfW * 2);

    const step = THREE.MathUtils.clamp(dt, 0.001, 0.1);
    const k = 1 - Math.exp(-7.5 * step);
    boat.position.y += (targetY - boat.position.y) * k;
    boat.rotation.x += (targetPitch - boat.rotation.x) * k;
    boat.rotation.z += (targetRoll - boat.rotation.z) * k;
    return true;
}
