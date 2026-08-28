/** Corps solides STI2D : gravité, inertia, rebond, rotation, collisions objet↔objet (cannon-es). */
import * as THREE from "three";
import * as CANNON from "cannon-es";
import {
    GRAVITY,
    MAX_FALL_SPEED,
    getPlayerAvatarState,
} from "./lab-collision.js";

export const PHYSICS_KEY = "physicsEnabled";
export const PHYSICS_MASS_KEY = "physicsMass";
export const PHYSICS_BOUNCE_KEY = "physicsBounce";
/** @private */
const PHYSICS_VY_KEY = "_physicsVy";
/** @private */
const PHYSICS_GROUNDED_KEY = "_physicsGrounded";

export const DEFAULT_PHYSICS_MASS = 1;
export const DEFAULT_PHYSICS_BOUNCE = 0.4;
export const PHYSICS_MASS_MIN = 0.1;
export const PHYSICS_MASS_MAX = 100;
export const PHYSICS_BOUNCE_MIN = 0;
export const PHYSICS_BOUNCE_MAX = 1;

const PLAYER_MASS = 72;
const SETTLE_SPEED = 0.12;
const MIN_HALF = 0.02;

const _bounds = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();
const _inv = new THREE.Matrix4();
const _meshMat = new THREE.Matrix4();
const _tmpBox = new THREE.Box3();
const _offset = new THREE.Vector3();
const _worldOffset = new THREE.Vector3();
const _impulse = new THREE.Vector3();
const _contact = new THREE.Vector3();
const _playerBox = new THREE.Box3();
const _objBox = new THREE.Box3();

/** @type {CANNON.World | null} */
let world = null;
/** @type {CANNON.Material | null} */
let groundMat = null;
/** @type {CANNON.Material | null} */
let staticMat = null;
/** @type {Map<number, CANNON.Material>} */
const bounceMaterials = new Map();
/** @type {Map<THREE.Object3D, { body: CANNON.Body, offset: THREE.Vector3, shapeKey: string }>} */
const dynamicMap = new Map();
/** @type {Map<THREE.Object3D, { body: CANNON.Body, offset: THREE.Vector3, shapeKey: string }>} */
const staticMap = new Map();

/**
 * @param {number} mass
 */
export function clampPhysicsMass(mass) {
    const n = Number(mass);
    if (!Number.isFinite(n)) return DEFAULT_PHYSICS_MASS;
    return THREE.MathUtils.clamp(n, PHYSICS_MASS_MIN, PHYSICS_MASS_MAX);
}

/**
 * @param {number} bounce
 */
export function clampPhysicsBounce(bounce) {
    const n = Number(bounce);
    if (!Number.isFinite(n)) return DEFAULT_PHYSICS_BOUNCE;
    return THREE.MathUtils.clamp(n, PHYSICS_BOUNCE_MIN, PHYSICS_BOUNCE_MAX);
}

/**
 * @param {THREE.Object3D | null | undefined} object
 */
export function isObjectPhysicsEnabled(object) {
    return !!object?.userData?.[PHYSICS_KEY];
}

/**
 * @param {THREE.Object3D} object
 */
export function getObjectPhysicsMass(object) {
    return clampPhysicsMass(object?.userData?.[PHYSICS_MASS_KEY] ?? DEFAULT_PHYSICS_MASS);
}

/**
 * @param {THREE.Object3D} object
 */
export function getObjectPhysicsBounce(object) {
    return clampPhysicsBounce(object?.userData?.[PHYSICS_BOUNCE_KEY] ?? DEFAULT_PHYSICS_BOUNCE);
}

/**
 * @param {THREE.Object3D} object
 * @param {boolean} enabled
 */
export function setObjectPhysicsEnabled(object, enabled) {
    if (!object?.userData) return;
    object.userData[PHYSICS_KEY] = !!enabled;
    if (enabled) {
        if (object.userData[PHYSICS_MASS_KEY] === undefined) {
            object.userData[PHYSICS_MASS_KEY] = DEFAULT_PHYSICS_MASS;
        }
        if (object.userData[PHYSICS_BOUNCE_KEY] === undefined) {
            object.userData[PHYSICS_BOUNCE_KEY] = DEFAULT_PHYSICS_BOUNCE;
        }
        object.userData[PHYSICS_VY_KEY] = 0;
        object.userData[PHYSICS_GROUNDED_KEY] = false;
        ensureWorld();
        ensureDynamicBody(object, { resetVel: true });
    } else {
        object.userData[PHYSICS_VY_KEY] = 0;
        object.userData[PHYSICS_GROUNDED_KEY] = false;
        removeDynamicBody(object);
    }
}

/**
 * @param {THREE.Object3D} object
 * @param {number} mass
 */
export function setObjectPhysicsMass(object, mass) {
    if (!object?.userData) return;
    object.userData[PHYSICS_MASS_KEY] = clampPhysicsMass(mass);
    const rec = dynamicMap.get(object);
    if (rec?.body) {
        rec.body.mass = getObjectPhysicsMass(object);
        rec.body.updateMassProperties();
        rec.body.wakeUp();
    }
}

/**
 * @param {THREE.Object3D} object
 * @param {number} bounce
 */
export function setObjectPhysicsBounce(object, bounce) {
    if (!object?.userData) return;
    object.userData[PHYSICS_BOUNCE_KEY] = clampPhysicsBounce(bounce);
    const rec = dynamicMap.get(object);
    if (rec?.body) {
        rec.body.material = materialForBounce(getObjectPhysicsBounce(object));
        rec.body.wakeUp();
    }
}

/**
 * Relance la simulation (après un déplacement au gizmo, etc.).
 * @param {THREE.Object3D} object
 */
export function wakeObjectPhysics(object) {
    if (!object?.userData || !isObjectPhysicsEnabled(object)) return;
    object.userData[PHYSICS_GROUNDED_KEY] = false;
    ensureWorld();
    const rec = ensureDynamicBody(object, { rebuild: true, resetVel: true });
    if (rec?.body) rec.body.wakeUp();
}

/**
 * @param {THREE.Object3D} object
 */
export function disposeObjectPhysics(object) {
    removeDynamicBody(object);
    removeStaticBody(object);
}

/**
 * Poids P = m·g (N) et énergies pour l’affichage STI2D.
 * @param {THREE.Object3D} object
 */
export function getObjectPhysicsTeaching(object) {
    const mass = getObjectPhysicsMass(object);
    const g = Math.abs(GRAVITY);
    object.updateWorldMatrix(true, true);
    _bounds.setFromObject(object);
    const height = Math.max(0, _bounds.min.y);
    const rec = dynamicMap.get(object);
    const vx = rec?.body?.velocity?.x || 0;
    const vy = rec?.body?.velocity?.y || Number(object.userData[PHYSICS_VY_KEY]) || 0;
    const vz = rec?.body?.velocity?.z || 0;
    const speed = Math.hypot(vx, vy, vz);
    return {
        mass,
        weightN: mass * g,
        heightM: height,
        potentialJ: mass * g * height,
        kineticJ: 0.5 * mass * speed * speed,
        speed,
        bounce: getObjectPhysicsBounce(object),
    };
}

/**
 * @param {THREE.Object3D} object
 */
export function serializeObjectPhysics(object) {
    if (!isObjectPhysicsEnabled(object)) {
        return { physicsEnabled: false };
    }
    return {
        physicsEnabled: true,
        physicsMass: getObjectPhysicsMass(object),
        physicsBounce: getObjectPhysicsBounce(object),
    };
}

/**
 * @param {THREE.Object3D} object
 * @param {{ physicsEnabled?: boolean, physicsMass?: number, physicsBounce?: number } | null | undefined} data
 */
export function applyObjectPhysicsData(object, data) {
    if (!object?.userData || !data) return;
    if (typeof data.physicsMass === "number") setObjectPhysicsMass(object, data.physicsMass);
    if (typeof data.physicsBounce === "number") setObjectPhysicsBounce(object, data.physicsBounce);
    if (data.physicsEnabled !== undefined) {
        setObjectPhysicsEnabled(object, !!data.physicsEnabled);
    }
}

function ensureWorld() {
    if (world) return world;
    world = new CANNON.World({
        gravity: new CANNON.Vec3(0, GRAVITY, 0),
        allowSleep: true,
    });
    world.solver.iterations = 12;
    world.defaultContactMaterial.friction = 0.42;
    world.defaultContactMaterial.restitution = 0.25;

    groundMat = new CANNON.Material("lab-ground");
    staticMat = new CANNON.Material("lab-static");
    world.addContactMaterial(
        new CANNON.ContactMaterial(groundMat, staticMat, {
            friction: 0.5,
            restitution: 0.15,
        })
    );

    const ground = new CANNON.Body({ mass: 0, material: groundMat, type: CANNON.Body.STATIC });
    ground.addShape(new CANNON.Plane());
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(ground);
    return world;
}

/**
 * @param {number} bounce
 */
function materialForBounce(bounce) {
    ensureWorld();
    const key = Math.round(clampPhysicsBounce(bounce) * 20);
    const cached = bounceMaterials.get(key);
    if (cached) return cached;
    const e = key / 20;
    const mat = new CANNON.Material(`lab-e${key}`);
    const friction = e > 0.75 ? 0.28 : 0.48;
    world.addContactMaterial(
        new CANNON.ContactMaterial(mat, groundMat, {
            friction,
            restitution: e,
            contactEquationStiffness: 1e7,
            contactEquationRelaxation: 4,
        })
    );
    world.addContactMaterial(
        new CANNON.ContactMaterial(mat, staticMat, {
            friction: friction + 0.05,
            restitution: e * 0.85,
            contactEquationStiffness: 1e7,
            contactEquationRelaxation: 4,
        })
    );
    world.addContactMaterial(
        new CANNON.ContactMaterial(mat, mat, {
            friction: 0.38,
            restitution: Math.min(e, 0.55),
            contactEquationStiffness: 1e7,
            contactEquationRelaxation: 4,
        })
    );
    for (const [otherKey, otherMat] of bounceMaterials) {
        const otherE = otherKey / 20;
        world.addContactMaterial(
            new CANNON.ContactMaterial(mat, otherMat, {
                friction: 0.4,
                restitution: Math.min(e, otherE, 0.55),
                contactEquationStiffness: 1e7,
                contactEquationRelaxation: 4,
            })
        );
    }
    bounceMaterials.set(key, mat);
    return mat;
}

/**
 * Boîte locale (espace objet, avant scale du pivot).
 * @param {THREE.Object3D} object
 */
function getObjectLocalBox(object) {
    object.updateWorldMatrix(true, true);
    _inv.copy(object.matrixWorld).invert();
    _bounds.makeEmpty();
    let found = false;
    object.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || !child.geometry) return;
        if (child.name === "shadow-overlay") return;
        if (typeof child.name === "string" && child.name.startsWith("lab-")) return;
        if (child.userData?._labNoPaintPick) return;
        child.geometry.computeBoundingBox();
        if (!child.geometry.boundingBox) return;
        _tmpBox.copy(child.geometry.boundingBox);
        _meshMat.multiplyMatrices(_inv, child.matrixWorld);
        _tmpBox.applyMatrix4(_meshMat);
        if (found) _bounds.union(_tmpBox);
        else {
            _bounds.copy(_tmpBox);
            found = true;
        }
    });
    if (!found) {
        _bounds.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(1, 1, 1));
    }
    return _bounds;
}

/**
 * Ellipsoïde convexe (ballon de rugby, sphère étirée).
 * @param {number} rx
 * @param {number} ry
 * @param {number} rz
 */
function createEllipsoidShape(rx, ry, rz) {
    const stacks = 8;
    const slices = 12;
    /** @type {CANNON.Vec3[]} */
    const vertices = [new CANNON.Vec3(0, ry, 0)];
    for (let i = 1; i < stacks; i += 1) {
        const phi = (Math.PI * i) / stacks;
        const sp = Math.sin(phi);
        const cp = Math.cos(phi);
        for (let j = 0; j < slices; j += 1) {
            const theta = (2 * Math.PI * j) / slices;
            vertices.push(
                new CANNON.Vec3(rx * sp * Math.cos(theta), ry * cp, rz * sp * Math.sin(theta))
            );
        }
    }
    vertices.push(new CANNON.Vec3(0, -ry, 0));
    /** @type {number[][]} */
    const faces = [];
    for (let j = 0; j < slices; j += 1) {
        faces.push([0, 1 + j, 1 + ((j + 1) % slices)]);
    }
    for (let i = 0; i < stacks - 2; i += 1) {
        const a = 1 + i * slices;
        const b = 1 + (i + 1) * slices;
        for (let j = 0; j < slices; j += 1) {
            const j2 = (j + 1) % slices;
            faces.push([a + j, b + j, b + j2]);
            faces.push([a + j, b + j2, a + j2]);
        }
    }
    const south = vertices.length - 1;
    const lastRing = 1 + (stacks - 2) * slices;
    for (let j = 0; j < slices; j += 1) {
        faces.push([south, lastRing + ((j + 1) % slices), lastRing + j]);
    }
    return new CANNON.ConvexPolyhedron({ vertices, faces });
}

/**
 * Pyramide à base carrée (ConeGeometry 4 côtés).
 * @param {number} hx
 * @param {number} hy
 * @param {number} hz
 */
function createPyramidShape(hx, hy, hz) {
    const rx = hx * 1.15;
    const rz = hz * 1.15;
    const vertices = [
        new CANNON.Vec3(0, hy, 0),
        new CANNON.Vec3(rx, -hy, 0),
        new CANNON.Vec3(0, -hy, rz),
        new CANNON.Vec3(-rx, -hy, 0),
        new CANNON.Vec3(0, -hy, -rz),
    ];
    const faces = [
        [0, 1, 2],
        [0, 2, 3],
        [0, 3, 4],
        [0, 4, 1],
        [1, 4, 3],
        [1, 3, 2],
    ];
    return new CANNON.ConvexPolyhedron({ vertices, faces });
}

/**
 * @param {THREE.Object3D} object
 * @param {{ hx: number, hy: number, hz: number }} ext
 */
function createShapeForObject(object, ext) {
    const { hx, hy, hz } = ext;
    const shape = object?.userData?.labShape || "box";
    const maxR = Math.max(hx, hy, hz);
    const minR = Math.min(hx, hy, hz);
    const aspect = maxR / Math.max(minR, 1e-4);
    const sphereLike = Math.abs(hx - hy) / maxR < 0.08 && Math.abs(hy - hz) / maxR < 0.08;

    if (shape === "sphere") {
        if (sphereLike) return { shape: new CANNON.Sphere(Math.max(MIN_HALF, maxR)), kind: "sphere" };
        try {
            return { shape: createEllipsoidShape(hx, hy, hz), kind: "ellipsoid" };
        } catch {
            return { shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)), kind: "box" };
        }
    }
    if (shape === "cylinder") {
        return {
            shape: new CANNON.Cylinder(Math.max(hx, hz), Math.max(hx, hz), hy * 2, 16),
            kind: "cylinder",
        };
    }
    if (shape === "cone") {
        return {
            shape: new CANNON.Cylinder(Math.max(hx, hz) * 0.28, Math.max(hx, hz), hy * 2, 16),
            kind: "cone",
        };
    }
    if (shape === "pyramid") {
        try {
            return { shape: createPyramidShape(hx, hy, hz), kind: "pyramid" };
        } catch {
            return { shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)), kind: "box" };
        }
    }
    if (shape === "torus") {
        return {
            shape: new CANNON.Cylinder(maxR, maxR, Math.min(hx, hy, hz) * 2, 12),
            kind: "torus",
        };
    }
    if (shape === "panel" || shape === "box") {
        return {
            shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)),
            kind: "box",
        };
    }
    // Import : ballon allongé (deux petits axes proches) → ellipsoïde, sinon OBB.
    const sorted = [hx, hy, hz].sort((a, b) => a - b);
    const rugby =
        aspect >= 1.28 && sorted[1] / Math.max(sorted[0], 1e-4) < 1.22;
    if (rugby) {
        try {
            return { shape: createEllipsoidShape(hx, hy, hz), kind: "ellipsoid" };
        } catch {
            return { shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)), kind: "box" };
        }
    }
    return {
        shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)),
        kind: "box",
    };
}

/**
 * @param {THREE.Object3D} object
 */
function measureShape(object) {
    const box = getObjectLocalBox(object);
    box.getSize(_size);
    box.getCenter(_center);
    const sx = Math.abs(object.scale.x) || 1;
    const sy = Math.abs(object.scale.y) || 1;
    const sz = Math.abs(object.scale.z) || 1;
    const hx = Math.max(MIN_HALF, (_size.x * sx) / 2);
    const hy = Math.max(MIN_HALF, (_size.y * sy) / 2);
    const hz = Math.max(MIN_HALF, (_size.z * sz) / 2);
    const offset = new THREE.Vector3(_center.x * sx, _center.y * sy, _center.z * sz);
    const shapeKey = `${object.userData?.labShape || "box"}:${hx.toFixed(3)}:${hy.toFixed(3)}:${hz.toFixed(3)}`;
    return { hx, hy, hz, offset, shapeKey };
}

/**
 * @param {CANNON.Body} body
 * @param {THREE.Object3D} object
 * @param {THREE.Vector3} offset
 */
function copyThreeToBody(body, object, offset) {
    object.updateWorldMatrix(true, false);
    _worldOffset.copy(offset).applyQuaternion(object.quaternion);
    body.position.set(
        object.position.x + _worldOffset.x,
        object.position.y + _worldOffset.y,
        object.position.z + _worldOffset.z
    );
    body.quaternion.set(
        object.quaternion.x,
        object.quaternion.y,
        object.quaternion.z,
        object.quaternion.w
    );
    body.aabbNeedsUpdate = true;
    body.updateAABB();
}

/**
 * @param {CANNON.Body} body
 * @param {THREE.Object3D} object
 * @param {THREE.Vector3} offset
 */
function copyBodyToThree(body, object, offset) {
    object.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
    object.rotation.setFromQuaternion(object.quaternion);
    _worldOffset.copy(offset).applyQuaternion(object.quaternion);
    object.position.set(
        body.position.x - _worldOffset.x,
        body.position.y - _worldOffset.y,
        body.position.z - _worldOffset.z
    );
}

/**
 * @param {THREE.Object3D} object
 * @param {{ rebuild?: boolean, resetVel?: boolean, mass?: number, material?: CANNON.Material }} [opts]
 */
function ensureDynamicBody(object, opts = {}) {
    ensureWorld();
    const measure = measureShape(object);
    let rec = dynamicMap.get(object);
    if (rec && (opts.rebuild || rec.shapeKey !== measure.shapeKey)) {
        removeDynamicBody(object);
        rec = undefined;
    }
    if (!rec) {
        const built = createShapeForObject(object, measure);
        const body = new CANNON.Body({
            mass: opts.mass ?? getObjectPhysicsMass(object),
            material: opts.material ?? materialForBounce(getObjectPhysicsBounce(object)),
            allowSleep: false,
            linearDamping: built.kind === "sphere" || built.kind === "ellipsoid" ? 0.12 : 0.08,
            angularDamping: built.kind === "sphere" || built.kind === "ellipsoid" ? 0.18 : 0.22,
        });
        body.sleepSpeedLimit = 0.18;
        body.sleepTimeLimit = 0.5;
        built.shape.collisionFilterGroup = 1;
        built.shape.collisionFilterMask = -1;
        body.collisionFilterGroup = 1;
        body.collisionFilterMask = -1;
        body.collisionResponse = true;
        body.addShape(built.shape);
        copyThreeToBody(body, object, measure.offset);
        if (opts.resetVel) {
            body.velocity.set(0, 0, 0);
            body.angularVelocity.set(0, 0, 0);
        }
        world.addBody(body);
        rec = { body, offset: measure.offset.clone(), shapeKey: measure.shapeKey };
        dynamicMap.set(object, rec);
        removeStaticBody(object);
    } else if (opts.resetVel) {
        copyThreeToBody(rec.body, object, rec.offset);
        rec.body.velocity.set(0, 0, 0);
        rec.body.angularVelocity.set(0, 0, 0);
        rec.body.mass = getObjectPhysicsMass(object);
        rec.body.updateMassProperties();
        rec.body.material = materialForBounce(getObjectPhysicsBounce(object));
    }
    return rec;
}

/**
 * @param {THREE.Object3D} object
 */
function ensureStaticBody(object) {
    ensureWorld();
    const measure = measureShape(object);
    let rec = staticMap.get(object);
    if (rec && rec.shapeKey !== measure.shapeKey) {
        removeStaticBody(object);
        rec = undefined;
    }
    if (!rec) {
        const built = createShapeForObject(object, measure);
        const body = new CANNON.Body({
            mass: 0,
            type: CANNON.Body.STATIC,
            material: staticMat,
        });
        built.shape.collisionFilterGroup = 1;
        built.shape.collisionFilterMask = -1;
        body.collisionFilterGroup = 1;
        body.collisionFilterMask = -1;
        body.collisionResponse = true;
        body.addShape(built.shape);
        world.addBody(body);
        rec = { body, offset: measure.offset.clone(), shapeKey: measure.shapeKey };
        staticMap.set(object, rec);
    }
    copyThreeToBody(rec.body, object, rec.offset);
    return rec;
}

function removeDynamicBody(object) {
    const rec = dynamicMap.get(object);
    if (!rec) return;
    if (world) world.removeBody(rec.body);
    dynamicMap.delete(object);
}

function removeStaticBody(object) {
    const rec = staticMap.get(object);
    if (!rec) return;
    if (world) world.removeBody(rec.body);
    staticMap.delete(object);
}

function isStaticColliderCandidate(object) {
    if (!object) return false;
    if (isObjectPhysicsEnabled(object)) return false;
    if (object.userData?.labTerrain) return false;
    if (object.userData?.labArchitecture) return false;
    if (object.userData?.labStair) return false;
    if (object.userData?.labLanding) return false;
    if (object.userData?.labBoat) return false;
    if (object.userData?.labLight) return false;
    return true;
}

/**
 * Tous les props de scène bloquent les corps dynamiques.
 * La case « Collisions » reste réservée à l’avatar.
 * @param {THREE.Object3D[]} objects
 */
function syncStaticColliders(objects) {
    const live = new Set();
    for (const object of objects) {
        if (!isStaticColliderCandidate(object)) continue;
        live.add(object);
        ensureStaticBody(object);
    }
    for (const object of [...staticMap.keys()]) {
        if (!live.has(object)) removeStaticBody(object);
    }
}

function applyAvatarImpulses(dt) {
    const avatar = getPlayerAvatarState();
    if (!avatar || dt < 1e-4) return;
    const px = avatar.x;
    const pz = avatar.z;
    const feetY = avatar.feetY;
    const topY = feetY + avatar.height;
    const pr = avatar.radius;
    const pvx = avatar.moveX / dt;
    const pvz = avatar.moveZ / dt;
    const moving = Math.hypot(pvx, pvz) > 0.15;

    _playerBox.min.set(px - pr, feetY, pz - pr);
    _playerBox.max.set(px + pr, topY, pz + pr);

    for (const [object, rec] of dynamicMap) {
        if (!rec?.body) continue;
        object.updateWorldMatrix(true, true);
        _objBox.setFromObject(object);
        if (!_objBox.intersectsBox(_playerBox)) continue;

        const cx = (_objBox.min.x + _objBox.max.x) * 0.5;
        const cy = (_objBox.min.y + _objBox.max.y) * 0.5;
        const cz = (_objBox.min.z + _objBox.max.z) * 0.5;
        let nx = cx - px;
        let nz = cz - pz;
        const horiz = Math.hypot(nx, nz);
        if (horiz < 1e-5) {
            nx = moving ? pvx : 0.01;
            nz = moving ? pvz : 0;
        } else {
            nx /= horiz;
            nz /= horiz;
        }

        const overlapX =
            Math.min(_playerBox.max.x, _objBox.max.x) - Math.max(_playerBox.min.x, _objBox.min.x);
        const overlapZ =
            Math.min(_playerBox.max.z, _objBox.max.z) - Math.max(_playerBox.min.z, _objBox.min.z);
        const overlap = Math.max(0.01, Math.min(overlapX, overlapZ));
        if (!moving) continue;

        const mass = Math.max(0.1, rec.body.mass);
        const rel = (pvx * nx + pvz * nz) * 0.9 + overlap * 1.6;
        if (rel <= 0.05) continue;

        const inv = 1 / PLAYER_MASS + 1 / mass;
        const j = THREE.MathUtils.clamp(rel / inv, 0, 18);
        _impulse.set(nx * j, Math.max(0, j * 0.08), nz * j);

        const contactY = Math.min(cy, feetY + 0.12);
        _contact.set(cx, contactY, cz);
        rec.body.wakeUp();
        rec.body.applyImpulse(
            new CANNON.Vec3(_impulse.x, _impulse.y, _impulse.z),
            new CANNON.Vec3(
                _contact.x - rec.body.position.x,
                _contact.y - rec.body.position.y,
                _contact.z - rec.body.position.z
            )
        );
        object.userData[PHYSICS_GROUNDED_KEY] = false;
    }
}

/**
 * Intégration d’un pas (API historique, un objet).
 * @param {THREE.Object3D} object
 * @param {number} dt
 * @returns {boolean}
 */
export function stepObjectPhysics(object, dt) {
    if (!isObjectPhysicsEnabled(object)) return false;
    return stepPhysicsObjects([object], dt);
}

/**
 * @param {THREE.Object3D[]} objects
 * @param {number} dt
 * @param {{ skip?: (object: THREE.Object3D) => boolean }} [opts]
 */
export function stepPhysicsObjects(objects, dt, opts = {}) {
    ensureWorld();
    const step = THREE.MathUtils.clamp(dt, 0.001, 0.05);
    const live = new Set();
    let moved = false;

    for (const object of objects) {
        if (!object || !isObjectPhysicsEnabled(object)) continue;
        live.add(object);
        if (opts.skip?.(object)) {
            const rec = ensureDynamicBody(object);
            if (rec?.body) {
                rec.body.type = CANNON.Body.KINEMATIC;
                rec.body.velocity.set(0, 0, 0);
                rec.body.angularVelocity.set(0, 0, 0);
                copyThreeToBody(rec.body, object, rec.offset);
            }
            continue;
        }
        const rec = ensureDynamicBody(object);
        if (rec?.body && rec.body.type !== CANNON.Body.DYNAMIC) {
            rec.body.type = CANNON.Body.DYNAMIC;
            rec.body.wakeUp();
        }
    }

    for (const object of [...dynamicMap.keys()]) {
        if (!live.has(object) || !isObjectPhysicsEnabled(object)) {
            removeDynamicBody(object);
        }
    }

    syncStaticColliders(objects);
    applyAvatarImpulses(step);
    world.step(1 / 60, step, 5);

    for (const object of live) {
        if (opts.skip?.(object)) continue;
        const rec = dynamicMap.get(object);
        if (!rec?.body) continue;
        if (rec.body.velocity.y < MAX_FALL_SPEED) rec.body.velocity.y = MAX_FALL_SPEED;
        const px = object.position.x;
        const py = object.position.y;
        const pz = object.position.z;
        copyBodyToThree(rec.body, object, rec.offset);
        const v = rec.body.velocity;
        const w = rec.body.angularVelocity;
        object.userData[PHYSICS_VY_KEY] = v.y;
        const still =
            v.lengthSquared() < SETTLE_SPEED * SETTLE_SPEED &&
            w.lengthSquared() < 0.08;
        object.userData[PHYSICS_GROUNDED_KEY] = still && rec.body.sleepState === CANNON.Body.SLEEPING;
        if (
            Math.abs(object.position.x - px) > 1e-5 ||
            Math.abs(object.position.y - py) > 1e-5 ||
            Math.abs(object.position.z - pz) > 1e-5
        ) {
            moved = true;
        } else if (!still) {
            moved = true;
        }
    }

    return moved;
}
