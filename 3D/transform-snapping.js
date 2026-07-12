import * as THREE from "three";
import {
    GRID_STEP,
    ROTATION_SNAP_RAD,
    snapEuler,
    snapValue,
} from "./grid-constants.js";

const bounds = new THREE.Box3();

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
    };
}
