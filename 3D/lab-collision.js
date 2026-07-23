/** Collisions joueur ↔ objets (capsule FPS, objets avec collisionEnabled). */
import * as THREE from "three";
import { GRID_SIZE } from "./grid-constants.js";
import { getStairStepMeshes, isLabStair, isLabLanding, isLabStairOrLanding, STAIR_AUTO_STEP_RISE } from "./lab-stair.js";

export const COLLISION_KEY = "collisionEnabled";
/** Rayon horizontal de la capsule (m). */
export const PLAYER_RADIUS = 0.35;
/** Hauteur yeux au-dessus des pieds (position.y = yeux). */
export const PLAYER_HEIGHT = 1.5;
/** Espace tête au-dessus des yeux (m). */
export const PLAYER_HEAD_CLEARANCE = 0.25;
/** Hauteur totale pieds → sommet de tête (m). */
export const PLAYER_CAPSULE_HEIGHT = PLAYER_HEIGHT + PLAYER_HEAD_CLEARANCE;
export const COLLISION_MAX_ITER = 8;
/** Gravité (m/s²) — proche du réel pour un vrai ressenti de chute libre. */
export const GRAVITY = -9.81;
export const JUMP_VELOCITY = 4.6;
/** Vitesse terminale de chute (m/s, valeur négative). */
export const MAX_FALL_SPEED = -22;
/** Hauteur max de marche / seuil de « petit » décrochage (m). */
export const MAX_STEP_HEIGHT = 0.55;
export const GROUND_EPSILON = 0.08;
/** Déplacement vertical max par sous-pas (anti-tunneling marches fines). */
export const VERTICAL_SUBSTEP = 0.12;
/** Pente max marchable (rampe) — au-delà, il faut sauter ou contourner. */
export const MAX_WALK_SLOPE_RAD = THREE.MathUtils.degToRad(42);
/** Lissage marches / rampes (plus bas = montée plus douce). */
export const VERTICAL_SMOOTH_RATE = 1.6;
/** Lissage atterrissage après chute ou gros écart de hauteur. */
export const LANDING_SMOOTH_RATE = 0.9;

export let moveSpeed = 5;

const collidableObjects = [];
let playerRoot = null;
let verticalVelocity = 0;
let collisionDelta = 1 / 60;
/** Quand false, seul le terrain (sol) bloque encore le joueur. */
let objectCollisionEnabled = true;
/** Quand false, pas de gravité ni d’accrochage au sol / terrain. */
let groundCollisionEnabled = true;

const boxB = new THREE.Box3();
const centerA = new THREE.Vector3();
const centerB = new THREE.Vector3();
const playerBox = new THREE.Box3();
const clippedObjectBox = new THREE.Box3();
const playerCapsuleBox = new THREE.Box3();

const rayOrigin = new THREE.Vector3();
const downDirection = new THREE.Vector3(0, -1, 0);
const raycaster = new THREE.Raycaster();
const lastMoveDirXZ = new THREE.Vector2();
const stairLocalPoint = new THREE.Vector3();
const stairWorldPos = new THREE.Vector3();
const stairPushLocal = new THREE.Vector3();
const stairPushWorld = new THREE.Vector3();
let lastMoveHorizDist = 0;
const terrainSampleLocal = new THREE.Vector3();
const terrainSampleWorld = new THREE.Vector3();

/**
 * @param {THREE.Object3D} yaw
 */
export function initCollisionSystem(yaw) {
    playerRoot = yaw;
}

export function setMoveSpeed(speed) {
    moveSpeed = THREE.MathUtils.clamp(speed, 1, 24);
}

export function setObjectCollisionEnabled(enabled) {
    objectCollisionEnabled = !!enabled;
}

export function isObjectCollisionEnabled() {
    return objectCollisionEnabled;
}

export function setGroundCollisionEnabled(enabled) {
    groundCollisionEnabled = !!enabled;
}

export function isGroundCollisionEnabled() {
    return groundCollisionEnabled;
}

export function resetPlayerVerticalMotion() {
    verticalVelocity = 0;
}

function isLabTerrain(object) {
    return !!object?.userData?.labTerrain;
}

/** @param {number} deltaTime secondes écoulées depuis la dernière frame */
export function setCollisionDeltaTime(deltaTime) {
    collisionDelta = THREE.MathUtils.clamp(deltaTime, 0.001, 0.05);
}

/**
 * @param {number} targetEyeY
 * @param {{ instant?: boolean, rate?: number }} [opts]
 */
function moveEyeToward(targetEyeY, opts = {}) {
    if (!playerRoot) return;
    const instant = !!opts.instant;
    const current = playerRoot.position.y;
    const diff = targetEyeY - current;

    if (instant || Math.abs(diff) < 0.002) {
        playerRoot.position.y = targetEyeY;
        return;
    }

    const baseRate = opts.rate ?? VERTICAL_SMOOTH_RATE;
    const absDiff = Math.abs(diff);
    let rate = baseRate;
    // Ralentir uniquement les atterrissages (montée vers la cible), pas la descente en cuvette.
    if (diff > 0 && absDiff > 0.45) {
        rate = Math.min(baseRate, LANDING_SMOOTH_RATE + 1.2 / Math.max(absDiff, 0.5));
    } else if (diff < 0 && absDiff > MAX_STEP_HEIGHT) {
        rate = Math.max(baseRate, VERTICAL_SMOOTH_RATE * 3.5);
    } else if (diff < 0) {
        rate = Math.max(baseRate, VERTICAL_SMOOTH_RATE * 2);
    }
    const factor = 1 - Math.exp(-rate * collisionDelta);
    playerRoot.position.y = current + diff * factor;
}

function syncPlayerEyeToGround({ instant = false } = {}) {
    if (!playerRoot) return;
    const feetY = getFeetY();
    const { x, z } = playerRoot.position;
    const feetDropHint = feetY - (getGroundEyeY(x, z, feetY) - PLAYER_HEIGHT);

    // Chute / grand écart : viser la vraie surface sous les pieds (pas le filtre marche).
    if (!instant && (verticalVelocity < -0.4 || feetDropHint > MAX_STEP_HEIGHT + GROUND_EPSILON)) {
        const landY = getFallLandingSurfaceY(x, z, feetY);
        const targetEyeY = landY + PLAYER_HEIGHT;
        const feetDrop = feetY - landY;

        if (feetDrop > MAX_STEP_HEIGHT + GROUND_EPSILON) {
            // Laisser updatePlayerVertical gérer la chute libre (évite double intégration).
            return;
        }

        moveEyeToward(targetEyeY, { instant, rate: LANDING_SMOOTH_RATE });
        if (Math.abs(playerRoot.position.y - targetEyeY) < GROUND_EPSILON * 2) {
            verticalVelocity = 0;
        }
        return;
    }

    const targetEyeY = getGroundEyeY(x, z, feetY);
    moveEyeToward(targetEyeY, { instant });

    if (verticalVelocity <= 0 && Math.abs(playerRoot.position.y - targetEyeY) < GROUND_EPSILON * 2) {
        verticalVelocity = 0;
    }
}

export function registerCollidable(object) {
    if (!collidableObjects.includes(object)) {
        collidableObjects.push(object);
    }
}

export function unregisterCollidable(object) {
    const index = collidableObjects.indexOf(object);
    if (index !== -1) collidableObjects.splice(index, 1);
}

export function getCollidableObjects() {
    return collidableObjects;
}

export function hasCollisionEnabled(object) {
    return !!object?.userData?.[COLLISION_KEY];
}

function getCollisionTargets() {
    return collidableObjects.filter((obj) => {
        if (!hasCollisionEnabled(obj)) return false;
        if (isLabTerrain(obj) && !groundCollisionEnabled) return false;
        if (!objectCollisionEnabled && !isLabTerrain(obj)) return false;
        return true;
    });
}

function updateObjectBox(object, target = boxB) {
    object.updateWorldMatrix(true, true);
    return target.setFromObject(object);
}

function getFeetY() {
    return playerRoot.position.y - PLAYER_HEIGHT;
}

function overlapsFootprint(x, z, box) {
    return (
        x + PLAYER_RADIUS >= box.min.x &&
        x - PLAYER_RADIUS <= box.max.x &&
        z + PLAYER_RADIUS >= box.min.z &&
        z - PLAYER_RADIUS <= box.max.z
    );
}

/** Boîte englobante de la capsule joueur (pieds → sommet de tête). */
export function getPlayerBox(target = playerBox) {
    if (!playerRoot) return target.makeEmpty();
    const feetY = getFeetY();
    const { x, z } = playerRoot.position;
    target.min.set(x - PLAYER_RADIUS, feetY, z - PLAYER_RADIUS);
    target.max.set(x + PLAYER_RADIUS, feetY + PLAYER_CAPSULE_HEIGHT, z + PLAYER_RADIUS);
    return target;
}

/**
 * @param {number} feetY
 * @param {THREE.Box3} target
 */
function clipPlayerCapsule(feetY, target = playerCapsuleBox) {
    if (!playerRoot) return false;
    const { x, z } = playerRoot.position;
    target.min.set(x - PLAYER_RADIUS, feetY, z - PLAYER_RADIUS);
    target.max.set(x + PLAYER_RADIUS, feetY + PLAYER_CAPSULE_HEIGHT, z + PLAYER_RADIUS);
    return true;
}

/**
 * @param {THREE.Box3} objBox
 * @param {number} feetY
 * @param {THREE.Box3} target
 */
function clipObjectToCapsuleVertical(objBox, feetY, target = clippedObjectBox) {
    const capTop = feetY + PLAYER_CAPSULE_HEIGHT;
    target.min.copy(objBox.min);
    target.max.copy(objBox.max);
    target.min.y = Math.max(target.min.y, feetY);
    target.max.y = Math.min(target.max.y, capTop);
    return target.min.y < target.max.y;
}

function overlapsCapsuleVertical(objBox, feetY) {
    const capTop = feetY + PLAYER_CAPSULE_HEIGHT;
    return objBox.min.y < capTop && objBox.max.y > feetY;
}

/**
 * Hauteur du terrain par interpolation bilinéaire du maillage (fiable en cuvette).
 * @param {THREE.Object3D} object
 * @param {number} worldX
 * @param {number} worldZ
 * @returns {number | null}
 */
function sampleTerrainHeightFromGeometry(object, worldX, worldZ) {
    const geometry = object?.geometry;
    const positions = geometry?.attributes?.position;
    if (!positions) return null;

    object.updateWorldMatrix(true, false);

    const box = updateObjectBox(object);
    if (worldX < box.min.x || worldX > box.max.x || worldZ < box.min.z || worldZ > box.max.z) {
        return null;
    }

    rayOrigin.set(worldX, box.max.y + 100, worldZ);
    raycaster.set(rayOrigin, downDirection);
    const hits = raycaster.intersectObject(object, false);
    if (hits.length > 0) return hits[0].point.y;

    const segments =
        typeof object.userData?.terrainSegments === "number"
            ? object.userData.terrainSegments
            : 100;

    terrainSampleWorld.set(worldX, 0, worldZ);
    object.worldToLocal(terrainSampleWorld);
    const lx = terrainSampleWorld.x;
    const lz = terrainSampleWorld.z;
    const terrainSize =
        typeof object.userData?.terrainSize === "number" ? object.userData.terrainSize : GRID_SIZE;
    const half = terrainSize * 0.5;
    if (lx < -half || lx > half || lz < -half || lz > half) return null;

    const fx = ((lx + half) / terrainSize) * segments;
    const fz = ((lz + half) / terrainSize) * segments;
    const i0 = THREE.MathUtils.clamp(Math.floor(fx), 0, segments - 1);
    const j0 = THREE.MathUtils.clamp(Math.floor(fz), 0, segments - 1);
    const i1 = Math.min(i0 + 1, segments);
    const j1 = Math.min(j0 + 1, segments);
    const tx = fx - i0;
    const tz = fz - j0;
    const stride = segments + 1;

    function vertexY(i, j) {
        return positions.getY(j * stride + i);
    }

    const y00 = vertexY(i0, j0);
    const y10 = vertexY(i1, j0);
    const y01 = vertexY(i0, j1);
    const y11 = vertexY(i1, j1);
    const y0 = THREE.MathUtils.lerp(y00, y10, tx);
    const y1 = THREE.MathUtils.lerp(y01, y11, tx);
    const localY = THREE.MathUtils.lerp(y0, y1, tz);

    terrainSampleLocal.set(lx, localY, lz);
    object.localToWorld(terrainSampleLocal);
    return terrainSampleLocal.y;
}

/**
 * @param {THREE.Object3D} object
 * @param {number} x
 * @param {number} z
 * @param {number | null} [_feetY]
 * @returns {number | null}
 */
function getTerrainSurfaceYAt(object, x, z, _feetY = null) {
    return sampleTerrainHeightFromGeometry(object, x, z);
}

/**
 * Empreinte XZ d’une marche en espace local (OBB) — fiable pour marches tournées.
 * @param {THREE.Mesh} stepMesh
 * @param {number} x
 * @param {number} z
 * @param {number} [pad]
 */
function pointInStepFootprint(stepMesh, x, z, pad = PLAYER_RADIUS * 0.75) {
    if (!(stepMesh instanceof THREE.Mesh) || !stepMesh.geometry) return false;
    stepMesh.updateWorldMatrix(true, false);
    stepMesh.getWorldPosition(stairWorldPos);
    stairLocalPoint.set(x, stairWorldPos.y, z);
    stepMesh.worldToLocal(stairLocalPoint);
    if (!stepMesh.geometry.boundingBox) {
        stepMesh.geometry.computeBoundingBox();
    }
    const bb = stepMesh.geometry.boundingBox;
    if (!bb) return false;
    return (
        stairLocalPoint.x >= bb.min.x - pad &&
        stairLocalPoint.x <= bb.max.x + pad &&
        stairLocalPoint.z >= bb.min.z - pad &&
        stairLocalPoint.z <= bb.max.z + pad
    );
}

/**
 * Surface marchable d’un escalier / palier (par marche OBB, pas l’AABB globale).
 * Empreinte serrée pour éviter qu’une volée à 90° « aspire » le joueur depuis le palier.
 * @param {THREE.Object3D} stair
 * @param {number} x
 * @param {number} z
 * @param {number | null} [feetY]
 * @param {{ mode?: "walk" | "fall", ceilingY?: number }} [opts]
 *   - walk : ignore surfaces > MAX_STEP_HEIGHT au-dessus des pieds
 *   - fall : plus haute surface ≤ ceilingY (atterrissage depuis n’importe quelle hauteur)
 */
function getStairSurfaceYAt(stair, x, z, feetY = null, opts = {}) {
    const mode = opts.mode === "fall" ? "fall" : "walk";
    const currentFeet = feetY ?? (playerRoot ? getFeetY() : 0);
    const ceilingY =
        typeof opts.ceilingY === "number" ? opts.ceilingY : currentFeet + (mode === "fall" ? GROUND_EPSILON : MAX_STEP_HEIGHT + GROUND_EPSILON);
    const parts = isLabLanding(stair)
        ? getCollisionParts(stair)
        : getStairStepMeshes(stair);
    let bestY = null;
    /** Pad serré : le rayon joueur élargi faisait chevaucher palier ↔ volée suivante. */
    const surfacePad = mode === "fall" ? 0.08 : 0.04;

    for (const step of parts) {
        if (!(step instanceof THREE.Mesh)) continue;
        if (!pointInStepFootprint(step, x, z, surfacePad)) continue;
        const box = updateObjectBox(step);
        const y = box.max.y;
        if (y > ceilingY + 1e-4) continue;
        if (bestY === null || y > bestY) bestY = y;
    }

    if (bestY !== null) return bestY;

    // Filet : raycast vertical (bords / chevauchements), uniquement si l’AABB globale couvre le point
    const box = updateObjectBox(stair);
    if (!overlapsFootprint(x, z, box)) return null;
    rayOrigin.set(x, Math.max(box.max.y, ceilingY) + 2, z);
    raycaster.set(rayOrigin, downDirection);
    const hits = raycaster.intersectObject(stair, true);
    const minNormalY = 0.45;
    for (const hit of hits) {
        if (hit.face) {
            const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
            if (normal.y < minNormalY) continue;
        }
        const y = hit.point.y;
        if (y > ceilingY + 1e-4) continue;
        if (bestY === null || y > bestY) bestY = y;
    }
    return bestY;
}

/**
 * Surface qui porte déjà le joueur (escalier / palier / terrain), empreinte serrée.
 * @param {number} x
 * @param {number} z
 * @param {number} feetY
 * @returns {number | null}
 */
function getCarryingSurfaceY(x, z, feetY) {
    let best = null;
    for (const obj of getCollisionTargets()) {
        let y = null;
        if (isLabTerrain(obj)) {
            y = getTerrainSurfaceYAt(obj, x, z, feetY);
        } else if (isLabStair(obj) || isLabLanding(obj)) {
            y = getStairSurfaceYAt(obj, x, z, feetY);
        } else {
            y = getSurfaceYAt(obj, x, z, feetY);
        }
        if (y === null) continue;
        if (Math.abs(feetY - y) > GROUND_EPSILON * 2.5) continue;
        if (best === null || y > best) best = y;
    }
    return best;
}

/**
 * Pousse le joueur hors de l’OBB d’une marche (XZ local).
 * @param {THREE.Mesh} stepMesh
 */
function separatePlayerFromStepObb(stepMesh) {
    if (!playerRoot || !(stepMesh instanceof THREE.Mesh) || !stepMesh.geometry) return false;
    stepMesh.updateWorldMatrix(true, false);
    stepMesh.getWorldPosition(stairWorldPos);
    const { x, z } = playerRoot.position;
    stairLocalPoint.set(x, stairWorldPos.y, z);
    stepMesh.worldToLocal(stairLocalPoint);
    if (!stepMesh.geometry.boundingBox) {
        stepMesh.geometry.computeBoundingBox();
    }
    const bb = stepMesh.geometry.boundingBox;
    if (!bb) return false;

    const pad = PLAYER_RADIUS;
    const minX = bb.min.x - pad;
    const maxX = bb.max.x + pad;
    const minZ = bb.min.z - pad;
    const maxZ = bb.max.z + pad;

    if (
        stairLocalPoint.x < minX ||
        stairLocalPoint.x > maxX ||
        stairLocalPoint.z < minZ ||
        stairLocalPoint.z > maxZ
    ) {
        return false;
    }

    const penLeft = stairLocalPoint.x - minX;
    const penRight = maxX - stairLocalPoint.x;
    const penNear = stairLocalPoint.z - minZ;
    const penFar = maxZ - stairLocalPoint.z;
    const minPen = Math.min(penLeft, penRight, penNear, penFar);
    if (minPen <= 0) return false;

    if (minPen === penLeft) stairPushLocal.set(-penLeft, 0, 0);
    else if (minPen === penRight) stairPushLocal.set(penRight, 0, 0);
    else if (minPen === penNear) stairPushLocal.set(0, 0, -penNear);
    else stairPushLocal.set(0, 0, penFar);

    stairPushWorld.copy(stairPushLocal).transformDirection(stepMesh.matrixWorld);
    playerRoot.position.x += stairPushWorld.x;
    playerRoot.position.z += stairPushWorld.z;
    return true;
}

/**
 * @param {THREE.Object3D} object
 * @param {number} x
 * @param {number} z
 * @param {number | null} [feetY]
 * @param {{ mode?: "walk" | "fall", ceilingY?: number }} [opts]
 * @returns {number | null}
 */
function getSurfaceYAt(object, x, z, feetY = null, opts = {}) {
    if (isLabStair(object) || isLabLanding(object)) {
        return getStairSurfaceYAt(object, x, z, feetY, opts);
    }

    const box = updateObjectBox(object);
    if (!overlapsFootprint(x, z, box)) return null;

    if (isLabTerrain(object)) {
        return getTerrainSurfaceYAt(object, x, z, feetY);
    }

    const mode = opts.mode === "fall" ? "fall" : "walk";
    const currentFeet = feetY ?? (playerRoot ? getFeetY() : 0);
    const ceilingY =
        typeof opts.ceilingY === "number"
            ? opts.ceilingY
            : currentFeet + (mode === "fall" ? GROUND_EPSILON : MAX_STEP_HEIGHT + GROUND_EPSILON);

    rayOrigin.set(x, Math.max(box.max.y, ceilingY) + 2, z);
    raycaster.set(rayOrigin, downDirection);
    const hits = raycaster.intersectObject(object, true);
    const minNormalY = 0.45;

    let bestY = null;
    for (const hit of hits) {
        if (hit.face) {
            const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
            if (normal.y < minNormalY) continue;
        }
        const y = hit.point.y;
        if (y > ceilingY + 1e-4) continue;
        if (bestY === null || y > bestY) bestY = y;
    }

    return bestY;
}

/**
 * Plus haute surface sous un plafond (chute / anti-tunneling).
 * @param {number} x
 * @param {number} z
 * @param {number} ceilingFeetY - pieds au début du sous-pas (ignore tout au-dessus)
 * @returns {number | null}
 */
function getFallLandingSurfaceY(x, z, ceilingFeetY) {
    const ceiling = ceilingFeetY + GROUND_EPSILON;
    let bestY = null;
    const fallOpts = { mode: /** @type {"fall"} */ ("fall"), ceilingY: ceiling };

    for (const obj of getCollisionTargets()) {
        let y = null;
        if (isLabTerrain(obj)) {
            y = sampleTerrainHeightFromGeometry(obj, x, z);
        } else {
            y = getSurfaceYAt(obj, x, z, ceilingFeetY, fallOpts);
        }
        if (y === null || y > ceiling + 1e-4) continue;
        if (bestY === null || y > bestY) bestY = y;
    }

    if (bestY === null) bestY = 0;
    return bestY;
}

/** Montée ou descente autorisée selon la distance horizontale (marche, rampe, cuvette). */
function isWalkableRise(rise, horizontalDist) {
    if (Math.abs(rise) <= GROUND_EPSILON) return true;

    const maxStep =
        horizontalDist < 1e-4
            ? MAX_STEP_HEIGHT
            : Math.min(
                  MAX_STEP_HEIGHT,
                  horizontalDist * Math.tan(MAX_WALK_SLOPE_RAD) + GROUND_EPSILON
              );

    return Math.abs(rise) <= maxStep;
}

/**
 * Meilleure surface sous le joueur (centre + points devant, pour entrer sur une rampe).
 * @param {number} x
 * @param {number} z
 * @param {number} feetY
 */
function getBestWalkableSurfaceY(x, z, feetY) {
    let bestY = null;

    const samples = [{ sx: x, sz: z, dist: 0 }];
    if (lastMoveDirXZ.lengthSq() > 1e-6) {
        for (const mul of [1, 2, 3, 4]) {
            samples.push({
                sx: x + lastMoveDirXZ.x * PLAYER_RADIUS * mul,
                sz: z + lastMoveDirXZ.y * PLAYER_RADIUS * mul,
                dist: PLAYER_RADIUS * mul,
            });
        }
    }

    for (const { sx, sz, dist } of samples) {
        for (const obj of getCollisionTargets()) {
            let surfaceY;
            if (isLabTerrain(obj)) {
                surfaceY = getTerrainSurfaceYAt(obj, sx, sz, feetY);
            } else {
                surfaceY = getSurfaceYAt(obj, sx, sz, feetY);
            }
            if (surfaceY === null) continue;
            const rise = surfaceY - feetY;
            const horiz = Math.max(dist, lastMoveHorizDist, PLAYER_RADIUS * 0.35);
            if (rise > GROUND_EPSILON && !isWalkableRise(rise, horiz)) continue;

            if (bestY === null) {
                bestY = surfaceY;
            } else if (rise <= 0) {
                bestY = Math.min(bestY, surfaceY);
            } else {
                bestY = Math.max(bestY, surfaceY);
            }
        }
    }

    return bestY;
}

function canApproachTerrain(object, feetY) {
    if (!playerRoot) return false;
    const { x, z } = playerRoot.position;

    const here = getTerrainSurfaceYAt(object, x, z);
    if (here !== null) return true;

    if (lastMoveDirXZ.lengthSq() < 1e-6) return false;

    for (const mul of [1, 2, 3, 4, 6, 8, 10]) {
        const ax = x + lastMoveDirXZ.x * PLAYER_RADIUS * mul;
        const az = z + lastMoveDirXZ.y * PLAYER_RADIUS * mul;
        if (getTerrainSurfaceYAt(object, ax, az) !== null) return true;
    }

    return false;
}

function canApproachStair(object, feetY) {
    if (!playerRoot) return false;
    const { x, z } = playerRoot.position;

    const here = getSurfaceYAt(object, x, z, feetY);
    if (here !== null && isWalkableRise(here - feetY, 0)) return true;

    if (lastMoveDirXZ.lengthSq() < 1e-6) return false;

    for (const mul of [1, 2, 3, 4, 6]) {
        const dist = PLAYER_RADIUS * mul;
        const ax = x + lastMoveDirXZ.x * dist;
        const az = z + lastMoveDirXZ.y * dist;
        const ahead = getSurfaceYAt(object, ax, az, feetY);
        if (ahead === null) continue;
        if (isWalkableRise(ahead - feetY, Math.max(dist, lastMoveHorizDist))) return true;
    }

    return false;
}

function canApproachObjectSurface(object, feetY) {
    if (isLabTerrain(object)) {
        return canApproachTerrain(object, feetY);
    }
    if (isLabStair(object) || isLabLanding(object)) {
        return canApproachStair(object, feetY);
    }
    if (!playerRoot) return false;
    const { x, z } = playerRoot.position;
    const objBox = updateObjectBox(object);

    const here = getSurfaceYAt(object, x, z, feetY);
    if (here !== null && isWalkableRise(here - feetY, 0)) return true;

    if (lastMoveDirXZ.lengthSq() < 1e-6) return false;

    for (const mul of [1, 2]) {
        const ax = x + lastMoveDirXZ.x * PLAYER_RADIUS * mul;
        const az = z + lastMoveDirXZ.y * PLAYER_RADIUS * mul;
        if (
            overlapsFootprint(ax, az, objBox) &&
            overlapsCapsuleVertical(objBox, feetY)
        ) {
            const ahead = getSurfaceYAt(object, ax, az, feetY);
            if (ahead === null || !isWalkableRise(ahead - feetY, PLAYER_RADIUS * mul)) {
                return false;
            }
        }
        const ahead = getSurfaceYAt(object, ax, az, feetY);
        if (ahead === null) continue;
        if (isWalkableRise(ahead - feetY, PLAYER_RADIUS * mul)) return true;
    }

    return false;
}

/**
 * @param {number} x
 * @param {number} z
 * @param {number | null} [feetY]
 */
export function getGroundEyeY(x, z, feetY = null) {
    if (!groundCollisionEnabled && playerRoot) {
        return playerRoot.position.y;
    }
    const currentFeet = feetY ?? (playerRoot ? getFeetY() : 0);
    const targets = getCollisionTargets();
    let surfaceY = null;

    for (const obj of targets) {
        if (!isLabTerrain(obj)) continue;
        const terrainY = sampleTerrainHeightFromGeometry(obj, x, z);
        if (terrainY !== null) {
            surfaceY = terrainY;
            break;
        }
    }

    for (const obj of targets) {
        if (isLabTerrain(obj)) continue;
        const surfaceAtPoint = getSurfaceYAt(obj, x, z, currentFeet);
        if (surfaceAtPoint === null) continue;
        const rise = surfaceAtPoint - currentFeet;
        if (!isWalkableRise(rise, Math.max(lastMoveHorizDist, PLAYER_RADIUS * 0.35))) continue;
        surfaceY = surfaceY === null ? surfaceAtPoint : Math.max(surfaceY, surfaceAtPoint);
    }

    if (surfaceY === null) surfaceY = 0;
    return surfaceY + PLAYER_HEIGHT;
}

export function isPlayerGrounded() {
    if (!playerRoot || verticalVelocity > 0.05) return false;
    const feetY = getFeetY();
    const eyeY = getGroundEyeY(playerRoot.position.x, playerRoot.position.z, feetY);
    return playerRoot.position.y <= eyeY + GROUND_EPSILON;
}

export function isPlayerAirborne() {
    if (!playerRoot) return false;
    if (verticalVelocity > 0.05) return true;
    return !isPlayerGrounded();
}

export function jump() {
    if (isPlayerGrounded()) {
        verticalVelocity = JUMP_VELOCITY;
    }
}

/**
 * @param {THREE.Box3} boxMobile
 * @param {THREE.Box3} boxFixed
 * @returns {boolean}
 */
function separateBoxesHorizontal(boxMobile, boxFixed) {
    if (!boxMobile.intersectsBox(boxFixed)) return false;

    const overlapX = Math.min(boxMobile.max.x, boxFixed.max.x) - Math.max(boxMobile.min.x, boxFixed.min.x);
    const overlapZ = Math.min(boxMobile.max.z, boxFixed.max.z) - Math.max(boxMobile.min.z, boxFixed.min.z);

    boxMobile.getCenter(centerA);
    boxFixed.getCenter(centerB);

    if (overlapX <= overlapZ) {
        const shift = overlapX * (centerA.x < centerB.x ? -1 : 1);
        boxMobile.min.x += shift;
        boxMobile.max.x += shift;
    } else {
        const shift = overlapZ * (centerA.z < centerB.z ? -1 : 1);
        boxMobile.min.z += shift;
        boxMobile.max.z += shift;
    }

    return true;
}

function getCollisionParts(object) {
    if (isLabStair(object)) {
        const steps = getStairStepMeshes(object);
        return steps.length ? steps : [object];
    }
    if (isLabLanding(object)) {
        const deck = object.children?.find?.((c) => c.name === "landing-deck");
        return deck ? [deck] : [object];
    }
    return [object];
}

/** Repoussement horizontal capsule joueur ↔ collider (marche ou objet). */
function separatePlayerFromCollider(owner, colliderBox, feetY, allowApproach, part = null) {
    if (allowApproach) return false;

    // Le terrain est une surface marchable : pas de blocage horizontal via bbox.
    if (isLabTerrain(owner)) return false;

    const { x, z } = playerRoot.position;
    const stepTop = colliderBox.max.y;

    if (isLabStair(owner) || isLabLanding(owner)) {
        if (feetY >= stepTop - GROUND_EPSILON) return false;
        if (stepTop - feetY <= STAIR_AUTO_STEP_RISE + GROUND_EPSILON * 2) return false;

        // Déjà porté par un palier / marche : ignorer les marches plus hautes dont
        // l’empreinte chevauche (volée à 90° collée au palier).
        const carryingY = getCarryingSurfaceY(x, z, feetY);
        if (
            carryingY !== null &&
            Math.abs(feetY - carryingY) <= GROUND_EPSILON * 2 &&
            stepTop > carryingY + STAIR_AUTO_STEP_RISE + GROUND_EPSILON
        ) {
            return false;
        }

        // Marches / paliers tournés : AABB monde trop large → séparation OBB réelle
        if (part instanceof THREE.Mesh) {
            if (!pointInStepFootprint(part, x, z, PLAYER_RADIUS * 0.55)) return false;
            if (!overlapsCapsuleVertical(colliderBox, feetY)) return false;
            // Ne pousser que si la capsule pénètre vraiment le volume (pas seulement le pad XZ)
            if (colliderBox.min.y >= feetY + PLAYER_CAPSULE_HEIGHT - GROUND_EPSILON) return false;
            return separatePlayerFromStepObb(part);
        }
    }

    const surfaceY = getSurfaceYAt(owner, x, z, feetY);
    if (surfaceY !== null) {
        const onTop =
            feetY >= surfaceY - GROUND_EPSILON &&
            overlapsFootprint(x, z, colliderBox) &&
            Math.abs(stepTop - surfaceY) < GROUND_EPSILON + 0.02;
        if (onTop) return false;
    }

    if (!clipPlayerCapsule(feetY, playerCapsuleBox)) return false;
    if (!clipObjectToCapsuleVertical(colliderBox, feetY, clippedObjectBox)) return false;
    if (!playerCapsuleBox.intersectsBox(clippedObjectBox)) return false;

    return separateBoxesHorizontal(playerCapsuleBox, clippedObjectBox);
}

function applyPlayerCapsulePositionToYaw() {
    if (!playerRoot) return;
    playerRoot.position.x = (playerCapsuleBox.min.x + playerCapsuleBox.max.x) * 0.5;
    playerRoot.position.z = (playerCapsuleBox.min.z + playerCapsuleBox.max.z) * 0.5;
}

/** Ajuste progressivement la hauteur du joueur sur marches ou rampes. */
function applyWalkableSurfaceClimb() {
    if (!playerRoot || verticalVelocity > 0.05) return false;
    syncPlayerEyeToGround();
    return true;
}

function snapPlayerToGround() {
    if (!playerRoot || verticalVelocity > 0 || !groundCollisionEnabled) return;
    syncPlayerEyeToGround();
}

export function snapPlayerToGroundNow() {
    if (!playerRoot || !groundCollisionEnabled) return;
    resetPlayerVerticalMotion();
    syncPlayerEyeToGround({ instant: true });
}

function applyLandingOnSurfaces() {
    if (!playerRoot || verticalVelocity > 0) return;

    for (const obj of getCollisionTargets()) {
        const feetY = getFeetY();
        const { x, z } = playerRoot.position;

        if (isLabTerrain(obj)) {
            const surfaceY = sampleTerrainHeightFromGeometry(obj, x, z);
            if (surfaceY === null) continue;
            const targetEyeY = surfaceY + PLAYER_HEIGHT;
            const feetDrop = getFeetY() - surfaceY;
            if (playerRoot.position.y <= targetEyeY + GROUND_EPSILON * 2) {
                moveEyeToward(targetEyeY, { rate: LANDING_SMOOTH_RATE });
                verticalVelocity = 0;
            } else if (feetDrop > MAX_STEP_HEIGHT) {
                verticalVelocity = Math.min(verticalVelocity, MAX_FALL_SPEED);
            } else {
                moveEyeToward(targetEyeY, { rate: VERTICAL_SMOOTH_RATE * 3 });
            }
            continue;
        }

        const objBox = updateObjectBox(obj);
        const surfaceY = getSurfaceYAt(obj, x, z, feetY);
        if (surfaceY === null) continue;

        // Escalier / palier : ne pas utiliser l’AABB globale (beaucoup trop large après un virage).
        const onTop = isLabStair(obj) || isLabLanding(obj)
            ? feetY >= surfaceY - GROUND_EPSILON * 2
            : feetY >= surfaceY - GROUND_EPSILON * 2 && overlapsFootprint(x, z, objBox);

        if (onTop) {
            moveEyeToward(surfaceY + PLAYER_HEIGHT, { rate: LANDING_SMOOTH_RATE });
            if (Math.abs(getFeetY() - surfaceY) < GROUND_EPSILON * 2) {
                verticalVelocity = 0;
            }
        }
    }
}

export function resolvePlayerCollisions() {
    if (!playerRoot) return;
    if (!groundCollisionEnabled && !objectCollisionEnabled) return;

    if (
        !Number.isFinite(playerRoot.position.x) ||
        !Number.isFinite(playerRoot.position.y) ||
        !Number.isFinite(playerRoot.position.z)
    ) {
        playerRoot.position.set(0, PLAYER_HEIGHT, 0);
        verticalVelocity = 0;
    }

    if (verticalVelocity <= 0 && groundCollisionEnabled && verticalVelocity > -1.2) {
        applyLandingOnSurfaces();
    }

    for (let iter = 0; iter < COLLISION_MAX_ITER; iter++) {
        let movedThisPass = false;
        const feetY = getFeetY();

        for (const obj of getCollisionTargets()) {
            const allowApproach = canApproachObjectSurface(obj, feetY);

            for (const part of getCollisionParts(obj)) {
                const partBox = updateObjectBox(part);
                if (separatePlayerFromCollider(obj, partBox, feetY, allowApproach, part)) {
                    applyPlayerCapsulePositionToYaw();
                    movedThisPass = true;
                }
            }
        }

        if (!movedThisPass) break;
    }

    if (
        !Number.isFinite(playerRoot.position.x) ||
        !Number.isFinite(playerRoot.position.y) ||
        !Number.isFinite(playerRoot.position.z)
    ) {
        playerRoot.position.set(0, PLAYER_HEIGHT, 0);
        verticalVelocity = 0;
    }

    if (verticalVelocity <= 0 && groundCollisionEnabled && Math.abs(verticalVelocity) < 0.35) {
        applyWalkableSurfaceClimb();
    }
}

/**
 * @param {THREE.Vector3} delta
 */
export function movePlayer(delta) {
    if (!playerRoot) return;

    lastMoveHorizDist = Math.hypot(delta.x, delta.z);
    lastMoveDirXZ.set(delta.x, delta.z);
    if (lastMoveDirXZ.lengthSq() > 1e-8) {
        lastMoveDirXZ.normalize();
    } else {
        lastMoveDirXZ.set(0, 0);
    }

    playerRoot.position.x += delta.x;
    playerRoot.position.z += delta.z;
    playerRoot.position.y += delta.y;
    resolvePlayerCollisions();
}

/**
 * @param {number} deltaTime secondes
 */
export function updatePlayerVertical(deltaTime) {
    if (!playerRoot || !groundCollisionEnabled) return;

    const dt = THREE.MathUtils.clamp(deltaTime, 0.001, 0.05);
    verticalVelocity += GRAVITY * dt;
    verticalVelocity = Math.max(verticalVelocity, MAX_FALL_SPEED);

    // Montée (saut) : un seul pas.
    if (verticalVelocity > 0) {
        playerRoot.position.y += verticalVelocity * dt;
        resolvePlayerCollisions();
        return;
    }

    // Descente / chute : sous-pas pour ne pas traverser marches fines / plateaux.
    const { x, z } = playerRoot.position;
    let remaining = verticalVelocity * dt;
    const subCount = Math.max(1, Math.ceil(Math.abs(remaining) / VERTICAL_SUBSTEP));
    const stepDy = remaining / subCount;

    for (let i = 0; i < subCount; i += 1) {
        const prevFeetY = getFeetY();
        playerRoot.position.y += stepDy;
        const nextFeetY = getFeetY();

        // Plafond = pieds avant le sous-pas : capture toute surface croisée (même 2 cm d’épaisseur).
        const landY = getFallLandingSurfaceY(x, z, prevFeetY);
        const landEyeY = landY + PLAYER_HEIGHT;
        const speed = Math.abs(verticalVelocity);
        const landingLead = GROUND_EPSILON + Math.min(speed * 0.02, 0.2);

        if (nextFeetY <= landY + landingLead) {
            // Atterrissage ferme si chute rapide (pas de « flottement »).
            if (speed > 6 || prevFeetY - landY > MAX_STEP_HEIGHT) {
                playerRoot.position.y = landEyeY;
            } else {
                moveEyeToward(landEyeY, { rate: LANDING_SMOOTH_RATE * 1.4 });
                if (playerRoot.position.y < landEyeY) {
                    playerRoot.position.y = landEyeY;
                }
            }
            verticalVelocity = 0;
            break;
        }
    }

    resolvePlayerCollisions();
}
