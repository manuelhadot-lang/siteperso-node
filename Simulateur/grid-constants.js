export const GRID_SIZE = 20;

export function snapToGrid(val) {
    return Math.round(val / GRID_SIZE) * GRID_SIZE;
}
