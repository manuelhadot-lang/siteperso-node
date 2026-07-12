/** Collisions joueur ↔ objets uniquement (objets avec collisionEnabled). */
import * as THREE from "three";

export const COLLISION_KEY = "collisionEnabled";
export const PLAYER_RADIUS = 0.35;
export const PLAYER_HEIGHT = 1.65;
export const COLLISION_MAX_ITER = 8;
export const GRAVITY = -22;
export const JUMP_VELOCITY = 7;
export const MAX_STEP_HEIGHT = 0.55;
export const GROUND_EPSILON = 0.08;
/** Blocage horizontal : bande de 15 cm à la hauteur des pieds du joueur. */
export const GROUND_COLLISION_HEIGHT = 0.15;
/** Pente max marchable (rampe) — au-delà, il faut sauter ou contourner. */
export const MAX_WALK_SLOPE_RAD = THREE.MathUtils.degToRad(42);

export let moveSpeed = 10;

const collidableObjects = [];
let playerRoot = null;
let verticalVelocity = 0;

const boxA = new THREE.Box3();
const boxB = new THREE.Box3();
const centerA = new THREE.Vector3();
const centerB = new THREE.Vector3();
const playerBox = new THREE.Box3();
const groundBandBox = new THREE.Box3();
const playerGroundBand = new THREE.Box3();

const rayOrigin = new THREE.Vector3();
const downDirection = new THREE.Vector3(0, -1, 0);
const raycaster = new THREE.Raycaster();
const lastMoveDirXZ = new THREE.Vector2();
let lastMoveHorizDist = 0;

/**
 * @param {THREE.Object3D} yaw
 */
export function initCollisionSystem(yaw) {
    playerRoot = yaw;
}

export function setMoveSpeed(speed) {
    moveSpeed = THREE.MathUtils.clamp(speed, 2, 30);
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
    return collidableObjects.filter((obj) => hasCollisionEnabled(obj));
}

function updateObjectBox(object, target = boxB) {
    object.updateWorldMatrix(true, true);
    return target.setFromObject(object);
}

function overlapsFootprint(x, z, box) {
    return (
        x + PLAYER_RADIUS >= box.min.x &&
        x - PLAYER_RADIUS <= box.max.x &&
        z + PLAYER_RADIUS >= box.min.z &&
        z - PLAYER_RADIUS <= box.max.z
    );
}

export function getPlayerBox(target = playerBox) {
    if (!playerRoot) return target.makeEmpty();
    const { x, y, z } = playerRoot.position;
    target.min.set(x - PLAYER_RADIUS, y - PLAYER_HEIGHT, z - PLAYER_RADIUS);
    target.max.set(x + PLAYER_RADIUS, y + 0.5, z + PLAYER_RADIUS);
    return target;
}

/**
 * @param {THREE.Object3D} object
 * @param {number} x
 * @param {number} z
 * @param {number | null} [feetY]
 * @returns {number | null}
 */
function getSurfaceYAt(object, x, z, feetY = null) {
    const box = updateObjectBox(object);
    if (!overlapsFootprint(x, z, box)) return null;

    rayOrigin.set(x, box.max.y + 2, z);
    raycaster.set(rayOrigin, downDirection);
    const hits = raycaster.intersectObject(object, true);
    if (hits.length) {
        const hit = hits[0];
        if (hit.face) {
            const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
            if (normal.y < 0.45) return null;
        }
        const currentFeet = feetY ?? (playerRoot ? playerRoot.position.y - PLAYER_HEIGHT : 0);
        if (hit.point.y > currentFeet + MAX_STEP_HEIGHT + GROUND_EPSILON) return null;
        return hit.point.y;
    }

    if (feetY !== null && box.max.y > feetY + MAX_STEP_HEIGHT + GROUND_EPSILON) return null;
    return box.max.y;
}

/** Montée autorisée selon la distance horizontale (marche ou rampe). */
function isWalkableRise(rise, horizontalDist) {
    if (rise < -0.05) return false;
    if (rise <= GROUND_EPSILON) return true;

    const maxRise =
        horizontalDist < 1e-4
            ? MAX_STEP_HEIGHT
            : Math.min(
                  MAX_STEP_HEIGHT,
                  horizontalDist * Math.tan(MAX_WALK_SLOPE_RAD) + GROUND_EPSILON
              );

    return rise <= maxRise;
}

/**
 * Meilleure surface sous le joueur (centre + points devant, pour entrer sur une rampe).
 * @param {number} x
 * @param {number} z
 * @param {number} feetY
 */
function getBestWalkableSurfaceY(x, z, feetY) {
    let bestY = 0;

    const samples = [{ sx: x, sz: z, dist: 0 }];
    if (lastMoveDirXZ.lengthSq() > 1e-6) {
        for (const mul of [1, 2]) {
            samples.push({
                sx: x + lastMoveDirXZ.x * PLAYER_RADIUS * mul,
                sz: z + lastMoveDirXZ.y * PLAYER_RADIUS * mul,
                dist: PLAYER_RADIUS * mul,
            });
        }
    }

    for (const { sx, sz, dist } of samples) {
        for (const obj of getCollisionTargets()) {
            const surfaceY = getSurfaceYAt(obj, sx, sz, feetY);
            if (surfaceY === null) continue;
            if (!isWalkableRise(surfaceY - feetY, Math.max(dist, lastMoveHorizDist))) continue;
            bestY = Math.max(bestY, surfaceY);
        }
    }

    return bestY;
}

function canApproachObjectSurface(object, feetY) {
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
            objBox.min.y < feetY + GROUND_COLLISION_HEIGHT &&
            objBox.max.y > feetY
        ) {
            return false;
        }
        const ahead = getSurfaceYAt(object, ax, az, feetY);
        if (ahead === null) continue;
        if (isWalkableRise(ahead - feetY, PLAYER_RADIUS * mul)) return true;
    }

    return false;
}

/** Bande de collision objet à la hauteur des pieds du joueur (15 cm). */
function clipObjectGroundBand(objBox, feetY, target = groundBandBox) {
    const bandBottom = feetY;
    const bandTop = feetY + GROUND_COLLISION_HEIGHT;
    target.min.copy(objBox.min);
    target.max.copy(objBox.max);
    target.min.y = Math.max(target.min.y, bandBottom);
    target.max.y = Math.min(target.max.y, bandTop);
    return target.min.y < target.max.y;
}

/** Bande de collision joueur à la hauteur des pieds (15 cm). */
function clipPlayerGroundBand(feetY, target = playerGroundBand) {
    if (!playerRoot) return false;
    const { x, z } = playerRoot.position;
    const bandBottom = feetY;
    const bandTop = feetY + GROUND_COLLISION_HEIGHT;
    if (bandBottom >= bandTop) return false;

    target.min.set(x - PLAYER_RADIUS, bandBottom, z - PLAYER_RADIUS);
    target.max.set(x + PLAYER_RADIUS, bandTop, z + PLAYER_RADIUS);
    return true;
}

/**
 * @param {number} x
 * @param {number} z
 * @param {number | null} [feetY]
 */
export function getGroundEyeY(x, z, feetY = null) {
    let surfaceY = 0;
    const currentFeet = feetY ?? (playerRoot ? playerRoot.position.y - PLAYER_HEIGHT : 0);

    for (const obj of getCollisionTargets()) {
        const surfaceAtPoint = getSurfaceYAt(obj, x, z, currentFeet);
        if (surfaceAtPoint === null) continue;

        const rise = surfaceAtPoint - currentFeet;
        if (rise > GROUND_EPSILON && !isWalkableRise(rise, 0)) continue;

        surfaceY = Math.max(surfaceY, surfaceAtPoint);
    }

    const walkable = getBestWalkableSurfaceY(x, z, currentFeet);
    surfaceY = Math.max(surfaceY, walkable);

    return surfaceY + PLAYER_HEIGHT;
}

export function isPlayerGrounded() {
    if (!playerRoot || verticalVelocity > 0.05) return false;
    const feetY = playerRoot.position.y - PLAYER_HEIGHT;
    const eyeY = getGroundEyeY(playerRoot.position.x, playerRoot.position.z, feetY);
    return playerRoot.position.y <= eyeY + GROUND_EPSILON;
}

/** En l'air : pas de repoussement horizontal (saut sur place). */
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

/** Blocage horizontal joueur ↔ bande à hauteur des pieds de l'objet. */
function separatePlayerFromGroundBand(obj, objBox) {
    const feetY = playerRoot.position.y - PLAYER_HEIGHT;
    const { x, z } = playerRoot.position;
    const solidAtFeet =
        overlapsFootprint(x, z, objBox) &&
        objBox.min.y < feetY + GROUND_COLLISION_HEIGHT &&
        objBox.max.y > feetY;

    if (!solidAtFeet && canApproachObjectSurface(obj, feetY)) return false;

    if (!clipPlayerGroundBand(feetY, playerGroundBand)) return false;
    if (!clipObjectGroundBand(objBox, feetY, groundBandBox)) return false;
    if (!playerGroundBand.intersectsBox(groundBandBox)) return false;

    return separateBoxesHorizontal(playerGroundBand, groundBandBox);
}

function applyPlayerGroundBandToYaw() {
    if (!playerRoot) return;
    playerRoot.position.x = (playerGroundBand.min.x + playerGroundBand.max.x) * 0.5;
    playerRoot.position.z = (playerGroundBand.min.z + playerGroundBand.max.z) * 0.5;
}

/** Ajuste la hauteur du joueur sur rampe, marche ou plateau. */
function applyWalkableSurfaceClimb() {
    if (!playerRoot) return false;

    const { x, z } = playerRoot.position;
    const feetY = playerRoot.position.y - PLAYER_HEIGHT;
    const targetSurfaceY = getBestWalkableSurfaceY(x, z, feetY);

    if (Math.abs(targetSurfaceY - feetY) <= GROUND_EPSILON) return false;

    playerRoot.position.y = targetSurfaceY + PLAYER_HEIGHT;
    if (targetSurfaceY > feetY) verticalVelocity = 0;
    return true;
}

function snapPlayerToGround() {
    if (!playerRoot || verticalVelocity > 0 || isPlayerAirborne()) return;
    const feetY = playerRoot.position.y - PLAYER_HEIGHT;
    const eyeY = getGroundEyeY(playerRoot.position.x, playerRoot.position.z, feetY);
    if (playerRoot.position.y < eyeY) {
        playerRoot.position.y = eyeY;
        verticalVelocity = 0;
    }
}

function applyLandingOnSurfaces() {
    if (!playerRoot || verticalVelocity > 0) return;

    for (const obj of getCollisionTargets()) {
        const objBox = updateObjectBox(obj);
        const feetY = playerRoot.position.y - PLAYER_HEIGHT;
        const surfaceY = getSurfaceYAt(obj, playerRoot.position.x, playerRoot.position.z, feetY);
        if (surfaceY === null) continue;

        const onTop =
            feetY >= surfaceY - GROUND_EPSILON &&
            overlapsFootprint(playerRoot.position.x, playerRoot.position.z, objBox);

        if (onTop) {
            playerRoot.position.y = surfaceY + PLAYER_HEIGHT;
            verticalVelocity = 0;
        }
    }
}

export function resolvePlayerCollisions() {
    if (!playerRoot) return;

    if (isPlayerAirborne()) {
        applyLandingOnSurfaces();
        if (verticalVelocity <= 0) {
            snapPlayerToGround();
        }
        return;
    }

    for (let iter = 0; iter < COLLISION_MAX_ITER; iter++) {
        let movedThisPass = false;
        getPlayerBox(playerBox);

        for (const obj of getCollisionTargets()) {
            const objBox = updateObjectBox(obj);
            const feetY = playerRoot.position.y - PLAYER_HEIGHT;
            const surfaceY = getSurfaceYAt(obj, playerRoot.position.x, playerRoot.position.z, feetY);

            if (surfaceY !== null) {
                const onTop =
                    feetY >= surfaceY - GROUND_EPSILON &&
                    overlapsFootprint(playerRoot.position.x, playerRoot.position.z, objBox);

                if (onTop && verticalVelocity <= 0) {
                    playerRoot.position.y = surfaceY + PLAYER_HEIGHT;
                    verticalVelocity = 0;
                    movedThisPass = true;
                    continue;
                }
            }

            if (separatePlayerFromGroundBand(obj, objBox)) {
                applyPlayerGroundBandToYaw();
                movedThisPass = true;
            }
        }

        if (!movedThisPass) break;
    }

    applyWalkableSurfaceClimb();
    snapPlayerToGround();
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
    if (!playerRoot) return;

    verticalVelocity += GRAVITY * deltaTime;
    playerRoot.position.y += verticalVelocity * deltaTime;

    if (verticalVelocity <= 0) {
        const feetY = playerRoot.position.y - PLAYER_HEIGHT;
        const eyeY = getGroundEyeY(playerRoot.position.x, playerRoot.position.z, feetY);
        if (playerRoot.position.y <= eyeY) {
            playerRoot.position.y = eyeY;
            verticalVelocity = 0;
        }
    }

    resolvePlayerCollisions();
}
