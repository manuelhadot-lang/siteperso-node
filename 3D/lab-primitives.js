/** Primitives lab : géométries et métadonnées (cube, sphère, pyramide…). */
import * as THREE from "three";
import { CUBE_SIZE } from "./grid-constants.js";

/** @typedef {"box" | "sphere" | "pyramid" | "cylinder" | "cone" | "torus" | "panel"} LabPrimitiveShape */

/** @type {LabPrimitiveShape[]} */
export const LAB_PRIMITIVE_SHAPES = [
    "box",
    "sphere",
    "pyramid",
    "cylinder",
    "cone",
    "torus",
    "panel",
];

/**
 * @type {Record<LabPrimitiveShape, {
 *   kind: string,
 *   label: string,
 *   mime: string,
 *   btnId: string,
 * }>}
 */
export const PRIMITIVE_META = {
    box: {
        kind: "cube",
        label: "Cube",
        mime: "application/x-lab-cube",
        btnId: "btn-add-cube",
    },
    sphere: {
        kind: "sphere",
        label: "Sphère",
        mime: "application/x-lab-sphere",
        btnId: "btn-add-sphere",
    },
    pyramid: {
        kind: "pyramid",
        label: "Pyramide",
        mime: "application/x-lab-pyramid",
        btnId: "btn-add-pyramid",
    },
    cylinder: {
        kind: "cylinder",
        label: "Cylindre",
        mime: "application/x-lab-cylinder",
        btnId: "btn-add-cylinder",
    },
    cone: {
        kind: "cone",
        label: "Cône (tronc)",
        mime: "application/x-lab-cone",
        btnId: "btn-add-cone",
    },
    torus: {
        kind: "torus",
        label: "Anneau",
        mime: "application/x-lab-torus",
        btnId: "btn-add-torus",
    },
    panel: {
        kind: "panel",
        label: "Panneau",
        mime: "application/x-lab-panel",
        btnId: "btn-add-panel",
    },
};

const R = CUBE_SIZE * 0.5;

/**
 * @param {string} kind
 * @returns {LabPrimitiveShape}
 */
export function shapeFromKind(kind) {
    if (kind === "cube" || kind === "box") return "box";
    if (kind === "sphere") return "sphere";
    if (kind === "pyramid") return "pyramid";
    if (kind === "cylinder") return "cylinder";
    if (kind === "cone") return "cone";
    if (kind === "torus") return "torus";
    if (kind === "panel") return "panel";
    return "box";
}

/**
 * @param {string | undefined} shape
 * @returns {shape is LabPrimitiveShape}
 */
export function isLabPrimitiveShape(shape) {
    return LAB_PRIMITIVE_SHAPES.includes(/** @type {LabPrimitiveShape} */ (shape));
}

/**
 * @param {LabPrimitiveShape} shape
 * @param {boolean} [smooth]
 * @returns {THREE.BufferGeometry}
 */
export function createPrimitiveGeometry(shape, smooth = true) {
    switch (shape) {
        case "sphere":
            return smooth
                ? new THREE.SphereGeometry(R, 48, 32)
                : new THREE.SphereGeometry(R, 8, 6);
        case "pyramid":
            // Pyramide à base carrée (4 côtés)
            return new THREE.ConeGeometry(R * 1.15, CUBE_SIZE, 4);
        case "cylinder":
            return smooth
                ? new THREE.CylinderGeometry(R, R, CUBE_SIZE, 32)
                : new THREE.CylinderGeometry(R, R, CUBE_SIZE, 8);
        case "cone":
            // Tronc de cône (frustum) : sommet plus étroit
            return smooth
                ? new THREE.CylinderGeometry(R * 0.28, R, CUBE_SIZE, 32)
                : new THREE.CylinderGeometry(R * 0.28, R, CUBE_SIZE, 8);
        case "torus":
            return smooth
                ? new THREE.TorusGeometry(R * 0.72, R * 0.28, 24, 48)
                : new THREE.TorusGeometry(R * 0.72, R * 0.28, 8, 12);
        case "panel":
            // Panneau plat vertical (épaisseur ~4 cm)
            return new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, 0.04);
        case "box":
        default:
            return new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
    }
}

/**
 * @param {LabPrimitiveShape} shape
 * @returns {string}
 */
export function kindFromShape(shape) {
    return PRIMITIVE_META[shape]?.kind || "cube";
}
