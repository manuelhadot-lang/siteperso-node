/** Escalier — droit ou circulaire ; marches compatibles collisions joueur. */
import * as THREE from "three";
import { CUBE_SIZE } from "./grid-constants.js";

export const LAB_STAIR_KEY = "labStair";
export const STAIR_STEP_COUNT_KEY = "stairStepCount";
export const STAIR_THICKNESS_KEY = "stairThickness";
export const STAIR_SHAPE_KEY = "stairShape";
export const STAIR_RADIUS_KEY = "stairRadius";
export const STAIR_ARC_KEY = "stairArcDeg";

export const STAIR_DEFAULT_STEP_COUNT = 6;
export const STAIR_MIN_STEP_COUNT = 2;
export const STAIR_MAX_STEP_COUNT = 24;
export const STAIR_TREAD_DEPTH = 0.32;
export const STAIR_WIDTH = CUBE_SIZE;
/** Hauteur entre deux marches (espacement) — fixe, compatible capsule joueur. */
export const STAIR_AUTO_STEP_RISE = 0.15;

/** Épaisseur du plateau de marche (indépendante de l’espacement). */
export const STAIR_DEFAULT_THICKNESS = STAIR_AUTO_STEP_RISE;
export const STAIR_MIN_THICKNESS = 0.02;
export const STAIR_MAX_THICKNESS = 0.2;
export const STAIR_THICKNESS_STEP = 0.01;

/** @typedef {"straight" | "circular"} StairShape */
export const STAIR_SHAPE_STRAIGHT = "straight";
export const STAIR_SHAPE_CIRCULAR = "circular";

export const STAIR_DEFAULT_RADIUS = 1.2;
export const STAIR_MIN_RADIUS = 0.5;
export const STAIR_MAX_RADIUS = 6;
export const STAIR_RADIUS_STEP = 0.05;

/** Arc total parcouru par l’escalier circulaire (degrés). */
export const STAIR_DEFAULT_ARC_DEG = 90;
export const STAIR_MIN_ARC_DEG = 30;
export const STAIR_MAX_ARC_DEG = 360;
export const STAIR_ARC_STEP = 5;

/** @param {THREE.Object3D} object @returns {THREE.Mesh[]} */
export function getStairStepMeshes(object) {
    /** @type {THREE.Mesh[]} */
    const steps = [];
    if (!isLabStair(object)) return steps;
    object.traverse((child) => {
        if (child instanceof THREE.Mesh && child.name.startsWith("stair-step-")) {
            steps.push(child);
        }
    });
    steps.sort((a, b) => {
        const ai = Number.parseInt(a.name.replace("stair-step-", ""), 10) || 0;
        const bi = Number.parseInt(b.name.replace("stair-step-", ""), 10) || 0;
        return ai - bi;
    });
    return steps;
}

/**
 * @param {number} stepCount
 */
export function clampStairStepCount(stepCount) {
    return THREE.MathUtils.clamp(
        Math.round(Number(stepCount) || STAIR_DEFAULT_STEP_COUNT),
        STAIR_MIN_STEP_COUNT,
        STAIR_MAX_STEP_COUNT
    );
}

/**
 * @param {number} thickness
 */
export function clampStairThickness(thickness) {
    const value = Number(thickness);
    if (!Number.isFinite(value)) return STAIR_DEFAULT_THICKNESS;
    return THREE.MathUtils.clamp(
        Math.round(value / STAIR_THICKNESS_STEP) * STAIR_THICKNESS_STEP,
        STAIR_MIN_THICKNESS,
        STAIR_MAX_THICKNESS
    );
}

/**
 * @param {unknown} shape
 * @returns {StairShape}
 */
export function normalizeStairShape(shape) {
    return shape === STAIR_SHAPE_CIRCULAR ? STAIR_SHAPE_CIRCULAR : STAIR_SHAPE_STRAIGHT;
}

/**
 * @param {number} radius
 */
export function clampStairRadius(radius) {
    const value = Number(radius);
    if (!Number.isFinite(value)) return STAIR_DEFAULT_RADIUS;
    return THREE.MathUtils.clamp(
        Math.round(value / STAIR_RADIUS_STEP) * STAIR_RADIUS_STEP,
        STAIR_MIN_RADIUS,
        STAIR_MAX_RADIUS
    );
}

/**
 * @param {number} arcDeg
 */
export function clampStairArcDeg(arcDeg) {
    const value = Number(arcDeg);
    if (!Number.isFinite(value)) return STAIR_DEFAULT_ARC_DEG;
    return THREE.MathUtils.clamp(
        Math.round(value / STAIR_ARC_STEP) * STAIR_ARC_STEP,
        STAIR_MIN_ARC_DEG,
        STAIR_MAX_ARC_DEG
    );
}

/**
 * Hauteur du dessus de la dernière marche.
 * @param {number} stepCount
 * @param {number} [thickness]
 */
export function getStairTotalHeight(stepCount, thickness = STAIR_DEFAULT_THICKNESS) {
    const steps = clampStairStepCount(stepCount);
    const thick = clampStairThickness(thickness);
    return (steps - 1) * STAIR_AUTO_STEP_RISE + thick;
}

/**
 * @param {number} stepCount
 */
export function getStairRunLength(stepCount) {
    return clampStairStepCount(stepCount) * STAIR_TREAD_DEPTH;
}

/**
 * @param {THREE.Object3D} object
 */
export function isLabStair(object) {
    return !!object?.userData?.[LAB_STAIR_KEY];
}

/**
 * @param {THREE.Object3D} object
 */
export function getStairStepCount(object) {
    return clampStairStepCount(object?.userData?.[STAIR_STEP_COUNT_KEY]);
}

/**
 * @param {THREE.Object3D} object
 */
export function getStairThickness(object) {
    return clampStairThickness(
        object?.userData?.[STAIR_THICKNESS_KEY] ?? STAIR_DEFAULT_THICKNESS
    );
}

/**
 * @param {THREE.Object3D} object
 * @returns {StairShape}
 */
export function getStairShape(object) {
    return normalizeStairShape(object?.userData?.[STAIR_SHAPE_KEY]);
}

/**
 * @param {THREE.Object3D} object
 */
export function getStairRadius(object) {
    return clampStairRadius(object?.userData?.[STAIR_RADIUS_KEY] ?? STAIR_DEFAULT_RADIUS);
}

/**
 * @param {THREE.Object3D} object
 */
export function getStairArcDeg(object) {
    return clampStairArcDeg(object?.userData?.[STAIR_ARC_KEY] ?? STAIR_DEFAULT_ARC_DEG);
}

/**
 * @param {number} meters
 */
export function formatStairMeters(meters) {
    return `${meters.toFixed(2).replace(".", ",")} m`;
}

/**
 * @param {number} stepCount
 * @param {{ thickness?: number }} [opts]
 */
export function formatStairHeightSummary(stepCount, opts = {}) {
    const steps = clampStairStepCount(stepCount);
    const thickness = clampStairThickness(opts.thickness ?? STAIR_DEFAULT_THICKNESS);
    return {
        stepRiseLabel: formatStairMeters(STAIR_AUTO_STEP_RISE),
        totalHeightLabel: formatStairMeters(getStairTotalHeight(steps, thickness)),
        stepCount: steps,
        thickness,
        thicknessLabel: formatStairMeters(thickness),
    };
}

/**
 * @param {THREE.Group} group
 * @param {{
 *   stepCount?: number,
 *   thickness?: number,
 *   shape?: StairShape,
 *   radius?: number,
 *   arcDeg?: number,
 *   color?: string,
 *   roughness?: number,
 *   metalness?: number,
 * }} [options]
 */
function populateStairSteps(group, options = {}) {
    const steps = clampStairStepCount(
        options.stepCount ?? group.userData?.[STAIR_STEP_COUNT_KEY] ?? STAIR_DEFAULT_STEP_COUNT
    );
    const thickness = clampStairThickness(
        options.thickness ?? group.userData?.[STAIR_THICKNESS_KEY] ?? STAIR_DEFAULT_THICKNESS
    );
    const shape = normalizeStairShape(
        options.shape ?? group.userData?.[STAIR_SHAPE_KEY] ?? STAIR_SHAPE_STRAIGHT
    );
    const radius = clampStairRadius(
        options.radius ?? group.userData?.[STAIR_RADIUS_KEY] ?? STAIR_DEFAULT_RADIUS
    );
    const arcDeg = clampStairArcDeg(
        options.arcDeg ?? group.userData?.[STAIR_ARC_KEY] ?? STAIR_DEFAULT_ARC_DEG
    );
    const rise = STAIR_AUTO_STEP_RISE;
    const tread = STAIR_TREAD_DEPTH;
    const width = STAIR_WIDTH;
    const color = options.color || "#8b9cb3";
    const roughness = options.roughness ?? 0.72;
    const metalness = options.metalness ?? 0.04;

    if (shape === STAIR_SHAPE_CIRCULAR) {
        const arcRad = THREE.MathUtils.degToRad(arcDeg);
        const angleStep = arcRad / steps;
        for (let i = 0; i < steps; i += 1) {
            const angle = i * angleStep;
            // Couvrir l’arc pour éviter les trous entre marches (collision / marche).
            const tangentialDepth = Math.max(tread, radius * angleStep * 1.2);
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(tangentialDepth, thickness, width),
                new THREE.MeshStandardMaterial({ color, roughness, metalness })
            );
            mesh.name = `stair-step-${i + 1}`;
            // rotation.y = angle → local +X = tangente, local +Z = radial
            // Centrer la marche sur le secteur angulaire
            const midAngle = angle + angleStep * 0.5;
            mesh.position.set(
                Math.sin(midAngle) * radius,
                i * rise + thickness * 0.5,
                Math.cos(midAngle) * radius
            );
            mesh.rotation.y = midAngle;
            group.add(mesh);
        }
    } else {
        for (let i = 0; i < steps; i += 1) {
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(width, thickness, tread),
                new THREE.MeshStandardMaterial({ color, roughness, metalness })
            );
            mesh.name = `stair-step-${i + 1}`;
            mesh.position.set(0, i * rise + thickness * 0.5, i * tread + tread * 0.5);
            group.add(mesh);
        }
    }

    group.userData[LAB_STAIR_KEY] = true;
    group.userData[STAIR_STEP_COUNT_KEY] = steps;
    group.userData[STAIR_THICKNESS_KEY] = thickness;
    group.userData[STAIR_SHAPE_KEY] = shape;
    group.userData[STAIR_RADIUS_KEY] = radius;
    group.userData[STAIR_ARC_KEY] = arcDeg;
}

/**
 * @param {number} stepCount
 * @param {{
 *   color?: string,
 *   roughness?: number,
 *   metalness?: number,
 *   thickness?: number,
 *   shape?: StairShape,
 *   radius?: number,
 *   arcDeg?: number,
 * }} [options]
 */
export function buildStairGroup(stepCount, options = {}) {
    const group = new THREE.Group();
    group.name = "lab-stair";
    populateStairSteps(group, { ...options, stepCount });
    return group;
}

/**
 * Reconstruit les marches en conservant couleur / matériau / paramètres.
 * @param {THREE.Group} stairGroup
 * @param {number} [stepCount]
 * @param {{
 *   thickness?: number,
 *   shape?: StairShape,
 *   radius?: number,
 *   arcDeg?: number,
 * }} [overrides]
 */
export function rebuildStairGroup(stairGroup, stepCount, overrides = {}) {
    const steps = clampStairStepCount(
        stepCount ?? stairGroup.userData?.[STAIR_STEP_COUNT_KEY] ?? STAIR_DEFAULT_STEP_COUNT
    );
    let color = "#8b9cb3";
    let roughness = 0.72;
    let metalness = 0.04;

    for (const child of [...stairGroup.children]) {
        if (child instanceof THREE.Mesh) {
            const mat = Array.isArray(child.material) ? child.material[0] : child.material;
            if (mat?.color) {
                color = `#${mat.color.getHexString()}`;
            }
            if (typeof mat?.roughness === "number") roughness = mat.roughness;
            if (typeof mat?.metalness === "number") metalness = mat.metalness;
            child.geometry?.dispose();
            if (mat?.dispose) mat.dispose();
        }
        stairGroup.remove(child);
    }

    populateStairSteps(stairGroup, {
        stepCount: steps,
        thickness: overrides.thickness ?? getStairThickness(stairGroup),
        shape: overrides.shape ?? getStairShape(stairGroup),
        radius: overrides.radius ?? getStairRadius(stairGroup),
        arcDeg: overrides.arcDeg ?? getStairArcDeg(stairGroup),
        color,
        roughness,
        metalness,
    });
}

/* ——— Paliers & enchaînement de volées ——— */

export const LAB_LANDING_KEY = "labLanding";
export const LANDING_SIZE_KEY = "landingSize";
export const LANDING_WIDTH_KEY = "landingWidth";
export const LANDING_DEPTH_KEY = "landingDepth";
export const STAIR_DEFAULT_LANDING_SIZE = STAIR_WIDTH;
/** Palier demi-tournant : 2 largeurs de marche côte à côte. */
export const STAIR_SWITCHBACK_LANDING_WIDTH = STAIR_WIDTH * 2;

const _stairWorldQuat = new THREE.Quaternion();
const _stairLocalPos = new THREE.Vector3();
const _stairForward = new THREE.Vector3();
const _stairRight = new THREE.Vector3();
const _stairEuler = new THREE.Euler(0, 0, 0, "YXZ");

/**
 * @param {THREE.Object3D} object
 */
export function isLabLanding(object) {
    return !!object?.userData?.[LAB_LANDING_KEY];
}

/**
 * Escalier ou palier (surface marchable paramétrique).
 * @param {THREE.Object3D} object
 */
export function isLabStairOrLanding(object) {
    return isLabStair(object) || isLabLanding(object);
}

/**
 * @param {number} value
 */
function clampLandingDim(value) {
    if (!Number.isFinite(value)) return STAIR_DEFAULT_LANDING_SIZE;
    return THREE.MathUtils.clamp(value, 0.5, 6);
}

/**
 * Taille « carrée » legacy (max largeur / profondeur).
 * @param {THREE.Object3D} object
 */
export function getLandingSize(object) {
    return Math.max(getLandingWidth(object), getLandingDepth(object));
}

/**
 * Largeur du palier (axe X local, perpendiculaire à l’arrivée).
 * @param {THREE.Object3D} object
 */
export function getLandingWidth(object) {
    const width = Number(object?.userData?.[LANDING_WIDTH_KEY]);
    if (Number.isFinite(width)) return clampLandingDim(width);
    const legacy = Number(object?.userData?.[LANDING_SIZE_KEY]);
    return clampLandingDim(legacy);
}

/**
 * Profondeur du palier (axe Z local, sens de l’arrivée).
 * @param {THREE.Object3D} object
 */
export function getLandingDepth(object) {
    const depth = Number(object?.userData?.[LANDING_DEPTH_KEY]);
    if (Number.isFinite(depth)) return clampLandingDim(depth);
    const legacy = Number(object?.userData?.[LANDING_SIZE_KEY]);
    return clampLandingDim(legacy);
}

/**
 * @param {THREE.Object3D} object
 */
export function getLandingThickness(object) {
    return clampStairThickness(
        object?.userData?.[STAIR_THICKNESS_KEY] ?? STAIR_DEFAULT_THICKNESS
    );
}

/**
 * @param {THREE.Object3D} landing
 * @param {number} width
 * @param {number} depth
 * @param {number} thickness
 */
function applyLandingDeckGeometry(landing, width, depth, thickness) {
    landing.userData[LANDING_WIDTH_KEY] = width;
    landing.userData[LANDING_DEPTH_KEY] = depth;
    landing.userData[LANDING_SIZE_KEY] = Math.max(width, depth);
    landing.userData[STAIR_THICKNESS_KEY] = thickness;
    const deck = landing.children.find((c) => c.name === "landing-deck");
    if (deck instanceof THREE.Mesh) {
        deck.geometry?.dispose?.();
        deck.geometry = new THREE.BoxGeometry(width, thickness, depth);
    }
}

/**
 * Cadre local en haut de la dernière marche (repère escalier).
 * @param {THREE.Object3D} stair
 */
export function getStairTopLocalFrame(stair) {
    const thickness = getStairThickness(stair);
    const width = STAIR_WIDTH;
    const steps = getStairStepCount(stair);
    const shape = getStairShape(stair);
    const rise = STAIR_AUTO_STEP_RISE;
    const topY = (steps - 1) * rise + thickness;

    if (shape === STAIR_SHAPE_CIRCULAR) {
        const radius = getStairRadius(stair);
        const arcRad = THREE.MathUtils.degToRad(getStairArcDeg(stair));
        const angleStep = arcRad / steps;
        const midAngle = (steps - 1) * angleStep + angleStep * 0.5;
        return {
            localPos: new THREE.Vector3(
                Math.sin(midAngle) * radius,
                topY - thickness * 0.5,
                Math.cos(midAngle) * radius
            ),
            topY,
            thickness,
            width,
            forwardLocal: new THREE.Vector3(Math.cos(midAngle), 0, -Math.sin(midAngle)),
        };
    }

    return {
        localPos: new THREE.Vector3(
            0,
            topY - thickness * 0.5,
            steps * STAIR_TREAD_DEPTH
        ),
        topY,
        thickness,
        width,
        forwardLocal: new THREE.Vector3(0, 0, 1),
    };
}

/**
 * @param {{
 *   thickness?: number,
 *   size?: number,
 *   width?: number,
 *   depth?: number,
 *   color?: string,
 *   roughness?: number,
 *   metalness?: number,
 * }} [options]
 */
export function buildLandingGroup(options = {}) {
    const thickness = clampStairThickness(options.thickness ?? STAIR_DEFAULT_THICKNESS);
    const fallback = clampLandingDim(Number(options.size) || STAIR_DEFAULT_LANDING_SIZE);
    const width = clampLandingDim(Number(options.width) || fallback);
    const depth = clampLandingDim(Number(options.depth) || fallback);
    const color = options.color || "#8b9cb3";
    const roughness = options.roughness ?? 0.72;
    const metalness = options.metalness ?? 0.04;

    const group = new THREE.Group();
    group.name = "lab-landing";
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, thickness, depth),
        new THREE.MeshStandardMaterial({ color, roughness, metalness })
    );
    mesh.name = "landing-deck";
    group.add(mesh);

    group.userData[LAB_LANDING_KEY] = true;
    group.userData[STAIR_THICKNESS_KEY] = thickness;
    group.userData[LANDING_WIDTH_KEY] = width;
    group.userData[LANDING_DEPTH_KEY] = depth;
    group.userData[LANDING_SIZE_KEY] = Math.max(width, depth);
    return group;
}

/**
 * Place un palier juste après la dernière marche de l’escalier.
 * @param {THREE.Object3D} stair
 * @param {THREE.Object3D} landing
 */
export function placeLandingAfterStair(stair, landing) {
    stair.updateMatrixWorld(true);
    const frame = getStairTopLocalFrame(stair);
    const width = getLandingWidth(landing);
    const depth = getLandingDepth(landing);
    const thickness = getLandingThickness(landing) || frame.thickness;

    applyLandingDeckGeometry(landing, width, depth, thickness);

    stair.getWorldQuaternion(_stairWorldQuat);

    if (getStairShape(stair) === STAIR_SHAPE_CIRCULAR) {
        const yaw = Math.atan2(frame.forwardLocal.x, frame.forwardLocal.z);
        _stairEuler.set(0, stair.rotation.y + yaw, 0);
        landing.quaternion.setFromEuler(_stairEuler);
        _stairLocalPos.copy(frame.localPos).addScaledVector(frame.forwardLocal, depth * 0.5);
    } else {
        landing.quaternion.copy(_stairWorldQuat);
        _stairLocalPos.set(
            0,
            frame.topY - thickness * 0.5,
            getStairStepCount(stair) * STAIR_TREAD_DEPTH + depth * 0.5
        );
    }
    _stairLocalPos.applyMatrix4(stair.matrixWorld);
    landing.position.copy(_stairLocalPos);
    landing.updateMatrixWorld(true);
}

/**
 * Élargit le palier à 2× la largeur de marche (bord gauche fixe) pour un demi-tournant.
 * @param {THREE.Object3D} landing
 */
export function ensureSwitchbackLanding(landing) {
    if (!isLabLanding(landing)) return;
    const width = getLandingWidth(landing);
    const depth = getLandingDepth(landing);
    const thickness = getLandingThickness(landing);
    const targetWidth = STAIR_SWITCHBACK_LANDING_WIDTH;
    if (width >= targetWidth - 1e-4) return;

    const expand = targetWidth - width;
    landing.updateMatrixWorld(true);
    // Décaler le centre en +X local pour garder le bord côté arrivée / gauche fixe.
    _stairRight.set(1, 0, 0).applyQuaternion(landing.quaternion);
    landing.position.addScaledVector(_stairRight, expand * 0.5);
    applyLandingDeckGeometry(landing, targetWidth, depth, thickness);
    landing.updateMatrixWorld(true);
}

/**
 * Ancre de départ d’une nouvelle volée depuis un palier.
 * @param {THREE.Object3D} landing
 * @param {90 | -90 | 180} turnDeg
 */
export function getLandingExitPose(landing, turnDeg) {
    landing.updateMatrixWorld(true);
    const width = getLandingWidth(landing);
    const depth = getLandingDepth(landing);
    const thickness = getLandingThickness(landing);
    // Dessus du plateau (= pied de la 1ʳᵉ marche suivante).
    const topYLocal = thickness * 0.5;

    const exitLocal = new THREE.Vector3();
    let yawOffset = 0;
    const turn = turnDeg === -90 || turnDeg === 180 || turnDeg === 90 ? turnDeg : 90;

    // Dos de la 1ʳᵉ marche sur le bord du palier (origine escalier = plan arrière marche).
    // ±90° : centrer sur la face. 180° : moitié opposée déjà calculée.
    if (turn === 90) {
        exitLocal.set(width * 0.5, topYLocal, 0);
        yawOffset = Math.PI / 2;
    } else if (turn === -90) {
        exitLocal.set(-width * 0.5, topYLocal, 0);
        yawOffset = -Math.PI / 2;
    } else {
        // 180° : moitié opposée (centre de la demi-bande +X), bord d’arrivée (−Z).
        exitLocal.set(STAIR_WIDTH * 0.5, topYLocal, -depth * 0.5);
        yawOffset = Math.PI;
    }

    landing.getWorldQuaternion(_stairWorldQuat);
    _stairEuler.setFromQuaternion(_stairWorldQuat, "YXZ");
    _stairEuler.y += yawOffset;
    const quat = new THREE.Quaternion().setFromEuler(_stairEuler);

    _stairLocalPos.copy(exitLocal);
    landing.localToWorld(_stairLocalPos);

    return { position: _stairLocalPos.clone(), quaternion: quat };
}

/**
 * Place un nouvel escalier au bord du palier (virage 90 / -90 / 180°).
 * @param {THREE.Object3D} landing
 * @param {THREE.Object3D} stair
 * @param {90 | -90 | 180} turnDeg
 */
export function placeStairAfterLanding(landing, stair, turnDeg) {
    if (turnDeg === 180) {
        ensureSwitchbackLanding(landing);
    }
    const pose = getLandingExitPose(landing, turnDeg);
    stair.quaternion.copy(pose.quaternion);
    stair.position.copy(pose.position);
    // Petit jeu vers l’extérieur : évite que les OBB marches pénètrent le palier
    // (sinon collisions croisées → joueur coincé / caméra hors scène).
    _stairForward.set(0, 0, 1).applyQuaternion(stair.quaternion);
    stair.position.addScaledVector(_stairForward, 0.01);
    stair.updateMatrixWorld(true);
}
