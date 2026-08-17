import * as THREE from "three";
import {
    GRID_STEP,
    ROTATION_SNAP_RAD,
    snapEuler,
    snapValue,
} from "./grid-constants.js";

const bounds = new THREE.Box3();
const worldSize = new THREE.Vector3();
const meshBounds = new THREE.Box3();

/**
 * @param {THREE.Object3D} mesh
 * @param {{ snapToFloor?: boolean }} [opts]
 */
export function snapMeshToFloor(mesh, opts = {}) {
    if (opts.snapToFloor === false || mesh.userData.snapToFloor === false) return;
    mesh.updateWorldMatrix(true, true);
    bounds.setFromObject(mesh);
    mesh.position.y -= bounds.min.y;
}

/**
 * @param {THREE.Object3D} mesh
 * @param {{ includeY?: boolean }} [opts]
 */
export function snapMeshTranslate(mesh, opts = {}) {
    mesh.position.x = snapValue(mesh.position.x, GRID_STEP);
    mesh.position.z = snapValue(mesh.position.z, GRID_STEP);
    if (opts.includeY !== false) {
        mesh.position.y = snapValue(mesh.position.y, GRID_STEP);
    }
}

/**
 * @param {THREE.Object3D} mesh
 */
export function snapMeshRotation(mesh) {
    snapEuler(mesh.rotation, ROTATION_SNAP_RAD);
}

/**
 * @param {THREE.Object3D} mesh
 */
export function snapMeshScale(mesh) {
    mesh.scale.x = Math.max(GRID_STEP, snapValue(mesh.scale.x, GRID_STEP));
    mesh.scale.y = Math.max(GRID_STEP, snapValue(mesh.scale.y, GRID_STEP));
    mesh.scale.z = Math.max(GRID_STEP, snapValue(mesh.scale.z, GRID_STEP));
}

/**
 * @param {import("three/addons/controls/TransformControls.js").TransformControls} controls
 * @param {{ translate: boolean, rotate: boolean, scale: boolean }} snapByMode
 */
export function applyTransformSnap(controls, snapByMode) {
    controls.setTranslationSnap(snapByMode.translate ? GRID_STEP : null);
    controls.setRotationSnap(snapByMode.rotate ? ROTATION_SNAP_RAD : null);
    controls.setScaleSnap(snapByMode.scale ? GRID_STEP : null);
}

/**
 * @param {THREE.Object3D} mesh
 * @param {"translate"|"rotate"|"scale"} mode
 * @param {{ translate: boolean, rotate: boolean, scale: boolean }} snapByMode
 */
export function snapMeshByMode(mesh, mode, snapByMode) {
    if (mode === "translate" && snapByMode.translate) {
        snapMeshTranslate(mesh);
    } else if (mode === "rotate" && snapByMode.rotate) {
        snapMeshRotation(mesh);
    } else if (mode === "scale" && snapByMode.scale) {
        snapMeshScale(mesh);
    }
}

/**
 * @param {THREE.Object3D} mesh
 */
export function formatObjectTransform(mesh) {
    const p = mesh.position;
    const r = mesh.rotation;
    const s = mesh.scale;
    return {
        position: `${p.x.toFixed(1)} · ${p.y.toFixed(1)} · ${p.z.toFixed(1)} m`,
        rotation: `${THREE.MathUtils.radToDeg(r.x).toFixed(0)}° · ${THREE.MathUtils.radToDeg(r.y).toFixed(0)}° · ${THREE.MathUtils.radToDeg(r.z).toFixed(0)}°`,
        scale: `${s.x.toFixed(1)} · ${s.y.toFixed(1)} · ${s.z.toFixed(1)} m`,
        size: formatObjectWorldSize(mesh),
    };
}

/**
 * Cube englobant aligné sur la scène (mètres) : H = Y, L = X, W = Z.
 * @param {THREE.Object3D} object
 */
export function formatObjectWorldSize(object) {
    const size = getObjectWorldSize(object);
    if (!size) return "—";
    return `H ${fmtMeters(size.y)} · L ${fmtMeters(size.x)} · W ${fmtMeters(size.z)}`;
}

/**
 * @param {THREE.Object3D} object
 * @returns {{ x: number, y: number, z: number } | null}
 */
export function getObjectWorldSize(object) {
    if (!object || object.userData?.lightType) return null;
    object.updateWorldMatrix(true, true);
    bounds.makeEmpty();
    const lightMarker = object.userData?.lightMarker;
    object.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || !child.visible || !child.geometry) return;
        if (child === lightMarker) return;
        const name = child.name || "";
        if (name === "shadow-overlay") return;
        if (child.userData?.isHelper || child.userData?.shadowOverlay) return;
        if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
        const geoBox = child.geometry.boundingBox;
        if (!geoBox || geoBox.isEmpty()) return;
        meshBounds.copy(geoBox).applyMatrix4(child.matrixWorld);
        bounds.union(meshBounds);
    });
    if (bounds.isEmpty()) return null;
    bounds.getSize(worldSize);
    const x = Math.abs(worldSize.x);
    const y = Math.abs(worldSize.y);
    const z = Math.abs(worldSize.z);
    if (![x, y, z].every((n) => Number.isFinite(n))) return null;
    return { x, y, z };
}

/** @param {number} n */
function fmtMeters(n) {
    const v = Math.abs(n) < 0.005 ? 0 : n;
    return `${v.toFixed(2).replace(".", ",")} m`;
}
