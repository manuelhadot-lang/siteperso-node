/** Tubulure — cylindre creux ou plein, longueur / rayon libres, orientation libre (gizmo). */
import * as THREE from "three";

export const LAB_TUBE_KEY = "labTube";
export const TUBE_LENGTH_KEY = "tubeLength";
export const TUBE_RADIUS_KEY = "tubeRadius";
export const TUBE_WALL_KEY = "tubeWall";

export const TUBE_DEFAULT_LENGTH = 2;
export const TUBE_MIN_LENGTH = 0.05;
export const TUBE_MAX_LENGTH = 200;
export const TUBE_LENGTH_STEP = 0.05;

export const TUBE_DEFAULT_RADIUS = 0.12;
export const TUBE_MIN_RADIUS = 0.01;
export const TUBE_MAX_RADIUS = 8;
export const TUBE_RADIUS_STEP = 0.01;

export const TUBE_DEFAULT_WALL = 0.025;
export const TUBE_MIN_WALL = 0;
export const TUBE_MAX_WALL = 2;
export const TUBE_WALL_STEP = 0.005;

const TUBE_RADIAL_SEGMENTS = 32;
const TUBE_ELBOW_TUBULAR_SEGMENTS = 24;
const TUBE_BEND_EPS = 0.5; // degrés — en dessous = droit
const TUBE_DEFAULT_BEND_RADIUS_FACTOR = 3;

export const TUBE_BEND_RADIUS_KEY = "tubeBendRadius";
export const TUBE_BEND_ANGLE_KEY = "tubeBendAngle";
export const TUBE_CAPS_KEY = "tubeCaps";

/**
 * @param {THREE.Object3D} object
 */
export function isLabTube(object) {
    return !!object?.userData?.[LAB_TUBE_KEY];
}

/**
 * @param {number} length
 */
export function clampTubeLength(length) {
    const value = Number(length);
    if (!Number.isFinite(value)) return TUBE_DEFAULT_LENGTH;
    return THREE.MathUtils.clamp(
        Math.round(value / TUBE_LENGTH_STEP) * TUBE_LENGTH_STEP,
        TUBE_MIN_LENGTH,
        TUBE_MAX_LENGTH
    );
}

/**
 * @param {number} radius
 */
export function clampTubeRadius(radius) {
    const value = Number(radius);
    if (!Number.isFinite(value)) return TUBE_DEFAULT_RADIUS;
    return THREE.MathUtils.clamp(
        Math.round(value / TUBE_RADIUS_STEP) * TUBE_RADIUS_STEP,
        TUBE_MIN_RADIUS,
        TUBE_MAX_RADIUS
    );
}

/**
 * @param {number} wall
 * @param {number} [radius]
 */
export function clampTubeWall(wall, radius = TUBE_DEFAULT_RADIUS) {
    const value = Number(wall);
    if (!Number.isFinite(value) || value <= 0) return 0;
    const maxWall = Math.max(0, radius * 0.92);
    return THREE.MathUtils.clamp(
        Math.round(value / TUBE_WALL_STEP) * TUBE_WALL_STEP,
        TUBE_MIN_WALL,
        Math.min(TUBE_MAX_WALL, maxWall)
    );
}

/**
 * @param {number} bendRadius
 * @param {number} tubeRadius
 */
export function clampTubeBendRadius(bendRadius, tubeRadius = TUBE_DEFAULT_RADIUS) {
    const R = clampTubeRadius(tubeRadius);
    const value = Number(bendRadius);
    const fallback = Math.max(R * TUBE_DEFAULT_BEND_RADIUS_FACTOR, R + 0.05);
    if (!Number.isFinite(value) || value <= 0) return fallback;
    return THREE.MathUtils.clamp(value, R * 1.15, 50);
}

/**
 * @param {THREE.Object3D} object
 */
export function getTubeLength(object) {
    return clampTubeLength(object?.userData?.[TUBE_LENGTH_KEY] ?? TUBE_DEFAULT_LENGTH);
}

/**
 * @param {THREE.Object3D} object
 */
export function getTubeRadius(object) {
    return clampTubeRadius(object?.userData?.[TUBE_RADIUS_KEY] ?? TUBE_DEFAULT_RADIUS);
}

/**
 * @param {THREE.Object3D} object
 */
export function getTubeWall(object) {
    return clampTubeWall(
        object?.userData?.[TUBE_WALL_KEY] ?? TUBE_DEFAULT_WALL,
        getTubeRadius(object)
    );
}

/**
 * @param {THREE.Object3D} object
 */
export function getTubeBendAngle(object) {
    const value = Number(object?.userData?.[TUBE_BEND_ANGLE_KEY]);
    return Number.isFinite(value) ? value : 0;
}

/**
 * True si l’origine du groupe est à l’entrée (tronçons de suite), pas au centre.
 * @param {THREE.Object3D} object
 */
export function isTubeEntranceOrigin(object) {
    const caps = object?.userData?.[TUBE_CAPS_KEY];
    const neg = caps?.neg?.p;
    if (!Array.isArray(neg) || neg.length < 3) return false;
    return Math.abs(neg[0]) < 1e-6 && Math.abs(neg[1]) < 1e-6 && Math.abs(neg[2]) < 1e-6;
}

/**
 * @param {THREE.Object3D} object
 */
export function getTubeBendRadius(object) {
    return clampTubeBendRadius(
        object?.userData?.[TUBE_BEND_RADIUS_KEY],
        getTubeRadius(object)
    );
}

/**
 * Géométrie : axe local Y = longueur (orientable à tout angle via le gizmo rotation).
 * @param {number} length
 * @param {number} radius
 * @param {number} wall
 */
export function createTubeGeometry(length, radius, wall) {
    const L = clampTubeLength(length);
    const R = clampTubeRadius(radius);
    const W = clampTubeWall(wall, R);
    const inner = W > 0 ? Math.max(0.001, R - W) : 0;

    if (inner <= 0 || inner >= R * 0.98) {
        return new THREE.CylinderGeometry(R, R, L, TUBE_RADIAL_SEGMENTS);
    }

    const shape = new THREE.Shape();
    shape.absarc(0, 0, R, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
    shape.holes.push(hole);

    const geo = new THREE.ExtrudeGeometry(shape, {
        depth: L,
        bevelEnabled: false,
        curveSegments: TUBE_RADIAL_SEGMENTS,
    });
    // Extrude → +Z ; centrer puis aligner sur Y (comme un cylindre Three.js).
    geo.translate(0, 0, -L * 0.5);
    geo.rotateX(-Math.PI / 2);
    geo.computeVertexNormals();
    return geo;
}

/**
 * Coude torique (arrondi). Entrée à l’origine, tangente entrée = +Y, arc autour de +Z.
 * @param {number} tubeRadius
 * @param {number} bendRadius
 * @param {number} angleRad
 */
export function createElbowGeometry(tubeRadius, bendRadius, angleRad) {
    const R = clampTubeRadius(tubeRadius);
    const BR = clampTubeBendRadius(bendRadius, R);
    const arc = Math.min(Math.max(Math.abs(angleRad), 1e-3), Math.PI * 0.999);
    const tubular = Math.max(
        8,
        Math.ceil(TUBE_ELBOW_TUBULAR_SEGMENTS * (arc / (Math.PI / 2)))
    );
    // Natif : entrée en (+BR,0,0), tangente +Y. On ramène l’entrée à l’origine.
    const geo = new THREE.TorusGeometry(BR, R, TUBE_RADIAL_SEGMENTS, tubular, arc);
    geo.translate(-BR, 0, 0);
    geo.computeVertexNormals();
    return geo;
}

/**
 * @param {THREE.Object3D} group
 * @param {number} length
 * @param {{
 *   bendAngleDeg?: number,
 *   bendRadius?: number,
 *   exitDirLocal?: THREE.Vector3,
 *   exitPosLocal?: THREE.Vector3,
 * }} [extra]
 */
function writeTubeCaps(group, length, extra = {}) {
    const L = clampTubeLength(length);
    const bendAngleDeg = Number(extra.bendAngleDeg) || 0;
    if (Math.abs(bendAngleDeg) < TUBE_BEND_EPS || !extra.exitPosLocal || !extra.exitDirLocal) {
        group.userData[TUBE_CAPS_KEY] = {
            pos: { p: [0, L * 0.5, 0], d: [0, 1, 0] },
            neg: { p: [0, -L * 0.5, 0], d: [0, -1, 0] },
        };
        group.userData[TUBE_BEND_ANGLE_KEY] = 0;
        return;
    }
    const ep = extra.exitPosLocal;
    const ed = extra.exitDirLocal;
    group.userData[TUBE_CAPS_KEY] = {
        // Entrée du coude à l’origine ; bout − = retour vers l’amont.
        neg: { p: [0, 0, 0], d: [0, -1, 0] },
        pos: { p: [ep.x, ep.y, ep.z], d: [ed.x, ed.y, ed.z] },
    };
    group.userData[TUBE_BEND_ANGLE_KEY] = bendAngleDeg;
    if (typeof extra.bendRadius === "number") {
        group.userData[TUBE_BEND_RADIUS_KEY] = extra.bendRadius;
    }
}

/**
 * @param {{
 *   length?: number,
 *   radius?: number,
 *   wall?: number,
 *   color?: string,
 *   roughness?: number,
 *   metalness?: number,
 * }} [options]
 */
export function buildTubeGroup(options = {}) {
    const length = clampTubeLength(options.length ?? TUBE_DEFAULT_LENGTH);
    const radius = clampTubeRadius(options.radius ?? TUBE_DEFAULT_RADIUS);
    const wall = clampTubeWall(options.wall ?? TUBE_DEFAULT_WALL, radius);
    const color = options.color || "#00d1ff";
    const roughness = options.roughness ?? 0.65;
    const metalness = options.metalness ?? 0.05;

    const group = new THREE.Group();
    group.name = "lab-tube";
    const mesh = new THREE.Mesh(
        createTubeGeometry(length, radius, wall),
        new THREE.MeshStandardMaterial({ color, roughness, metalness })
    );
    mesh.name = "tube-body";
    group.add(mesh);

    group.userData[LAB_TUBE_KEY] = true;
    group.userData[TUBE_LENGTH_KEY] = length;
    group.userData[TUBE_RADIUS_KEY] = radius;
    group.userData[TUBE_WALL_KEY] = wall;
    writeTubeCaps(group, length);
    return group;
}

/**
 * @param {THREE.Object3D} tubeGroup
 * @param {{
 *   length?: number,
 *   radius?: number,
 *   wall?: number,
 *   color?: string,
 *   roughness?: number,
 *   metalness?: number,
 * }} [overrides]
 */
export function rebuildTubeGroup(tubeGroup, overrides = {}) {
    const length = clampTubeLength(overrides.length ?? getTubeLength(tubeGroup));
    const radius = clampTubeRadius(overrides.radius ?? getTubeRadius(tubeGroup));
    const wall = clampTubeWall(overrides.wall ?? getTubeWall(tubeGroup), radius);
    const bendAngle = Number(tubeGroup.userData?.[TUBE_BEND_ANGLE_KEY]) || 0;
    const entranceOrigin = isTubeEntranceOrigin(tubeGroup);

    let color = "#00d1ff";
    let roughness = 0.65;
    let metalness = 0.05;
    const body = tubeGroup.children.find((c) => c.name === "tube-body");
    const elbow = tubeGroup.children.find((c) => c.name === "tube-elbow");
    const sample = body instanceof THREE.Mesh ? body : elbow instanceof THREE.Mesh ? elbow : null;
    if (sample) {
        const mat = Array.isArray(sample.material) ? sample.material[0] : sample.material;
        if (mat?.color) color = `#${mat.color.getHexString()}`;
        if (typeof mat?.roughness === "number") roughness = mat.roughness;
        if (typeof mat?.metalness === "number") metalness = mat.metalness;
    }
    if (overrides.color) color = overrides.color;
    if (typeof overrides.roughness === "number") roughness = overrides.roughness;
    if (typeof overrides.metalness === "number") metalness = overrides.metalness;

    // Coude : reconstruire tore + tronçon droit.
    if (Math.abs(bendAngle) >= TUBE_BEND_EPS) {
        const bendR = clampTubeBendRadius(
            overrides.bendRadius ?? getTubeBendRadius(tubeGroup),
            radius
        );
        const ang = THREE.MathUtils.degToRad(Math.abs(bendAngle));
        const exitPos = new THREE.Vector3(
            bendR * (Math.cos(ang) - 1),
            bendR * Math.sin(ang),
            0
        );
        const exitDir = new THREE.Vector3(-Math.sin(ang), Math.cos(ang), 0).normalize();

        if (elbow instanceof THREE.Mesh) {
            elbow.geometry?.dispose?.();
            elbow.geometry = createElbowGeometry(radius, bendR, ang);
            const mat = Array.isArray(elbow.material) ? elbow.material[0] : elbow.material;
            if (mat) {
                mat.color?.set(color);
                if ("roughness" in mat) mat.roughness = roughness;
                if ("metalness" in mat) mat.metalness = metalness;
                mat.needsUpdate = true;
            }
        }
        if (body instanceof THREE.Mesh) {
            body.geometry?.dispose?.();
            body.geometry = createTubeGeometry(length, radius, wall);
            const mat = Array.isArray(body.material) ? body.material[0] : body.material;
            if (mat) {
                mat.color?.set(color);
                if ("roughness" in mat) mat.roughness = roughness;
                if ("metalness" in mat) mat.metalness = metalness;
                mat.needsUpdate = true;
            }
            body.position.copy(exitPos).addScaledVector(exitDir, length * 0.5);
            body.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), exitDir);
        }
        writeTubeCaps(tubeGroup, length, {
            bendAngleDeg: bendAngle,
            bendRadius: bendR,
            exitPosLocal: exitPos.clone().addScaledVector(exitDir, length),
            exitDirLocal: exitDir,
        });
        tubeGroup.userData[TUBE_LENGTH_KEY] = length;
        tubeGroup.userData[TUBE_RADIUS_KEY] = radius;
        tubeGroup.userData[TUBE_WALL_KEY] = wall;
        tubeGroup.userData[TUBE_BEND_RADIUS_KEY] = bendR;
        return;
    }

    if (body instanceof THREE.Mesh) {
        body.geometry?.dispose?.();
        body.geometry = createTubeGeometry(length, radius, wall);
        const mat = Array.isArray(body.material) ? body.material[0] : body.material;
        if (mat) {
            mat.color?.set(color);
            if ("roughness" in mat) mat.roughness = roughness;
            if ("metalness" in mat) mat.metalness = metalness;
            mat.needsUpdate = true;
        }
        if (entranceOrigin) {
            body.position.set(0, length * 0.5, 0);
            body.quaternion.identity();
            tubeGroup.userData[TUBE_CAPS_KEY] = {
                neg: { p: [0, 0, 0], d: [0, -1, 0] },
                pos: { p: [0, length, 0], d: [0, 1, 0] },
            };
            tubeGroup.userData[TUBE_BEND_ANGLE_KEY] = 0;
        } else {
            body.position.set(0, 0, 0);
            body.quaternion.identity();
            writeTubeCaps(tubeGroup, length);
        }
    } else {
        for (const child of [...tubeGroup.children]) {
            tubeGroup.remove(child);
        }
        const mesh = new THREE.Mesh(
            createTubeGeometry(length, radius, wall),
            new THREE.MeshStandardMaterial({
                color,
                roughness,
                metalness,
            })
        );
        mesh.name = "tube-body";
        if (entranceOrigin) {
            mesh.position.y = length * 0.5;
        }
        tubeGroup.add(mesh);
        if (entranceOrigin) {
            tubeGroup.userData[TUBE_CAPS_KEY] = {
                neg: { p: [0, 0, 0], d: [0, -1, 0] },
                pos: { p: [0, length, 0], d: [0, 1, 0] },
            };
            tubeGroup.userData[TUBE_BEND_ANGLE_KEY] = 0;
        } else {
            writeTubeCaps(tubeGroup, length);
        }
    }

    tubeGroup.userData[LAB_TUBE_KEY] = true;
    tubeGroup.userData[TUBE_LENGTH_KEY] = length;
    tubeGroup.userData[TUBE_RADIUS_KEY] = radius;
    tubeGroup.userData[TUBE_WALL_KEY] = wall;
}

const _tubeOut = new THREE.Vector3();
const _tubeIn = new THREE.Vector3();
const _tubeSide = new THREE.Vector3();
const _tubeQuat = new THREE.Quaternion();
const _tubeBasis = new THREE.Matrix4();
const _tubeX = new THREE.Vector3();
const _tubeY = new THREE.Vector3();
const _tubeZ = new THREE.Vector3();
const _tubeWorldUp = new THREE.Vector3(0, 1, 0);
const _tubeLocalY = new THREE.Vector3(0, 1, 0);
const _tmpCapP = new THREE.Vector3();
const _tmpCapD = new THREE.Vector3();

/**
 * Extrémité en monde (+1 = bout « pos », −1 = bout « neg »).
 * Direction = sortante (vers l’extérieur du tube).
 * @param {THREE.Object3D} tube
 * @param {1 | -1} endSign
 */
export function getTubeEndWorld(tube, endSign) {
    tube.updateMatrixWorld(true);
    const sign = endSign < 0 ? -1 : 1;
    const caps = tube.userData?.[TUBE_CAPS_KEY];
    if (caps) {
        const cap = sign > 0 ? caps.pos : caps.neg;
        if (cap?.p && cap?.d) {
            _tmpCapP.set(cap.p[0], cap.p[1], cap.p[2]);
            _tmpCapD.set(cap.d[0], cap.d[1], cap.d[2]).normalize();
            tube.localToWorld(_tmpCapP);
            _tmpCapD.transformDirection(tube.matrixWorld);
            return {
                point: _tmpCapP.clone(),
                direction: _tmpCapD.clone(),
            };
        }
    }
    const L = getTubeLength(tube);
    _tmpCapP.set(0, sign * L * 0.5, 0);
    tube.localToWorld(_tmpCapP);
    _tmpCapD.set(0, sign, 0).transformDirection(tube.matrixWorld).normalize();
    return {
        point: _tmpCapP.clone(),
        direction: _tmpCapD.clone(),
    };
}

/**
 * Calcule la direction de sortie après virages horizontal / vertical.
 * @param {THREE.Vector3} inDir
 * @param {number} yawDeg
 * @param {number} pitchDeg
 */
export function computeTubeExitDirection(inDir, yawDeg = 0, pitchDeg = 0) {
    _tubeOut.copy(inDir).normalize();
    const yaw = THREE.MathUtils.degToRad(Number(yawDeg) || 0);
    const pitch = THREE.MathUtils.degToRad(Number(pitchDeg) || 0);
    if (Math.abs(yaw) > 1e-8) {
        _tubeOut.applyAxisAngle(_tubeWorldUp, yaw);
    }
    if (Math.abs(pitch) > 1e-8) {
        _tubeSide.crossVectors(_tubeWorldUp, _tubeOut);
        if (_tubeSide.lengthSq() < 1e-10) {
            _tubeSide.set(1, 0, 0);
        } else {
            _tubeSide.normalize();
        }
        _tubeOut.applyAxisAngle(_tubeSide, -pitch);
    }
    return _tubeOut.clone().normalize();
}

/**
 * Construit un tronçon de suite : coude arrondi (si angle) + droite.
 * Repère local : entrée à l’origine, tangente entrée = +Y, coude dans le plan XY.
 * @param {{
 *   length?: number,
 *   radius?: number,
 *   wall?: number,
 *   color?: string,
 *   roughness?: number,
 *   metalness?: number,
 *   bendAngleDeg?: number,
 *   bendRadius?: number,
 * }} [options]
 */
export function buildBentTubeGroup(options = {}) {
    const length = clampTubeLength(options.length ?? TUBE_DEFAULT_LENGTH);
    const radius = clampTubeRadius(options.radius ?? TUBE_DEFAULT_RADIUS);
    const wall = clampTubeWall(options.wall ?? TUBE_DEFAULT_WALL, radius);
    const color = options.color || "#00d1ff";
    const roughness = options.roughness ?? 0.65;
    const metalness = options.metalness ?? 0.05;
    const bendAngleDeg = Number(options.bendAngleDeg) || 0;
    const bendRadius = clampTubeBendRadius(options.bendRadius, radius);
    const ang = THREE.MathUtils.degToRad(bendAngleDeg);

    const group = new THREE.Group();
    group.name = "lab-tube";
    const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness });

    if (Math.abs(bendAngleDeg) < TUBE_BEND_EPS) {
        const mesh = new THREE.Mesh(createTubeGeometry(length, radius, wall), mat);
        mesh.name = "tube-body";
        // Entrée à y=0 : décaler le cylindre (centré) de L/2.
        mesh.position.y = length * 0.5;
        group.add(mesh);
        group.userData[LAB_TUBE_KEY] = true;
        group.userData[TUBE_LENGTH_KEY] = length;
        group.userData[TUBE_RADIUS_KEY] = radius;
        group.userData[TUBE_WALL_KEY] = wall;
        group.userData[TUBE_BEND_ANGLE_KEY] = 0;
        group.userData[TUBE_CAPS_KEY] = {
            neg: { p: [0, 0, 0], d: [0, -1, 0] },
            pos: { p: [0, length, 0], d: [0, 1, 0] },
        };
        return group;
    }

    const elbow = new THREE.Mesh(createElbowGeometry(radius, bendRadius, ang), mat.clone());
    elbow.name = "tube-elbow";
    group.add(elbow);

    // Sortie du coude : (BR(cos−1), BR sin, 0), tangente (−sin, cos, 0).
    const exitPos = new THREE.Vector3(
        bendRadius * (Math.cos(ang) - 1),
        bendRadius * Math.sin(ang),
        0
    );
    const exitDir = new THREE.Vector3(-Math.sin(ang), Math.cos(ang), 0).normalize();

    const straight = new THREE.Mesh(createTubeGeometry(length, radius, wall), mat);
    straight.name = "tube-body";
    straight.position.copy(exitPos).addScaledVector(exitDir, length * 0.5);
    straight.quaternion.setFromUnitVectors(_tubeLocalY, exitDir);
    group.add(straight);

    group.userData[LAB_TUBE_KEY] = true;
    group.userData[TUBE_LENGTH_KEY] = length;
    group.userData[TUBE_RADIUS_KEY] = radius;
    group.userData[TUBE_WALL_KEY] = wall;
    group.userData[TUBE_BEND_RADIUS_KEY] = bendRadius;
    writeTubeCaps(group, length, {
        bendAngleDeg,
        bendRadius,
        exitPosLocal: exitPos.clone().addScaledVector(exitDir, length),
        exitDirLocal: exitDir,
    });
    return group;
}

/**
 * Place le tronçon de suite (coude + droite) sur une extrémité.
 * @param {THREE.Object3D} fromTube
 * @param {THREE.Object3D} newTube
 * @param {1 | -1} endSign
 * @param {number} [yawDeg]
 * @param {number} [pitchDeg]
 */
export function placeTubeContinued(fromTube, newTube, endSign, yawDeg = 0, pitchDeg = 0) {
    const end = getTubeEndWorld(fromTube, endSign);
    _tubeIn.copy(end.direction).normalize();
    const outDir = computeTubeExitDirection(_tubeIn, yawDeg, pitchDeg);

    // Repère : +Y local = entrée (inDir), coude dans le plan (inDir, outDir).
    _tubeY.copy(_tubeIn);
    _tubeZ.crossVectors(_tubeIn, outDir);
    if (_tubeZ.lengthSq() < 1e-10) {
        // Droit ou 180° : choisir un axe stable.
        _tubeZ.crossVectors(_tubeIn, _tubeWorldUp);
        if (_tubeZ.lengthSq() < 1e-10) {
            _tubeZ.set(1, 0, 0);
        }
    }
    _tubeZ.normalize();
    _tubeX.crossVectors(_tubeY, _tubeZ).normalize();
    _tubeBasis.makeBasis(_tubeX, _tubeY, _tubeZ);
    _tubeQuat.setFromRotationMatrix(_tubeBasis);

    newTube.quaternion.copy(_tubeQuat);
    newTube.rotation.setFromQuaternion(_tubeQuat, newTube.rotation.order);
    newTube.position.copy(end.point);
    newTube.updateMatrixWorld(true);
}

/**
 * Pose d’une nouvelle tubulure branchée (API historique).
 * @param {THREE.Object3D} tube
 * @param {1 | -1} endSign
 * @param {number} [yawDeg]
 * @param {number} [pitchDeg]
 */
export function getTubeContinuePose(tube, endSign, yawDeg = 0, pitchDeg = 0) {
    const end = getTubeEndWorld(tube, endSign);
    const outDir = computeTubeExitDirection(end.direction, yawDeg, pitchDeg);
    _tubeQuat.setFromUnitVectors(_tubeLocalY, outDir);
    return {
        joint: end.point.clone(),
        quaternion: _tubeQuat.clone(),
        direction: outDir,
    };
}
