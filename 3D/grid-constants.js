/** Unités métriques — 1 unité Three.js = 1 mètre. */
export const GRID_STEP = 1;
export const GRID_SIZE = 50;
export const CUBE_SIZE = 1;
export const CUBE_HALF = CUBE_SIZE / 2;
export const ROTATION_SNAP_DEG = 10;
export const ROTATION_SNAP_RAD = (ROTATION_SNAP_DEG * Math.PI) / 180;

export function snapValue(value, step) {
    return Math.round(value / step) * step;
}

export function snapVector3(vec, step) {
    vec.x = snapValue(vec.x, step);
    vec.y = snapValue(vec.y, step);
    vec.z = snapValue(vec.z, step);
    return vec;
}

export function snapEuler(euler, stepRad) {
    euler.x = snapValue(euler.x, stepRad);
    euler.y = snapValue(euler.y, stepRad);
    euler.z = snapValue(euler.z, stepRad);
    return euler;
}
