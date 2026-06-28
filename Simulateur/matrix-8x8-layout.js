/**
 * Matrice LED 8×8 cathode commune — Kingbright 1588BS (équivalent FC-16 / YRO203-0088A).
 * R0…R7 = lignes (anodes), C0…C7 = colonnes (cathodes).
 * LED (r,c) allumée si Rr est au niveau haut et Cc au niveau bas.
 * Jonctions sur multiples de 20 (GRID_SIZE) ; chaque patte R/C est centrée sur sa rangée.
 */

export const MATRIX_SIZE = 8;
export const MATRIX_ROW_NAMES = Array.from({ length: MATRIX_SIZE }, (_, i) => `R${i}`);
export const MATRIX_COL_NAMES = Array.from({ length: MATRIX_SIZE }, (_, i) => `C${i}`);

/** Pas vertical entre centres de rangées (= GRID_SIZE). */
export const MATRIX_ROW_PITCH = 20;
export const MATRIX_CELL = 20;
export const MATRIX_CELL_GAP = 0;

export const GRID_PX = MATRIX_SIZE * MATRIX_CELL + (MATRIX_SIZE - 1) * MATRIX_CELL_GAP;

/** Centres des rangées R0 (haut) … R7 (bas) — pas de 20 px. */
export const MATRIX_PIN_Y = Array.from({ length: MATRIX_SIZE }, (_, i) => -80 + i * MATRIX_ROW_PITCH);

export const MATRIX_BOX_L = -80;
export const MATRIX_BOX_R = 80;
export const MATRIX_BOX_T = -100;
export const MATRIX_BOX_B = 80;
export const MATRIX_BOX_CX = (MATRIX_BOX_L + MATRIX_BOX_R) / 2;

/** Écart boîtier → jonction (comme DC10H_STUB_LEN). */
export const MATRIX_STUB_GAP = 20;
export const MATRIX_JUNC_L = MATRIX_BOX_L - MATRIX_STUB_GAP;
export const MATRIX_JUNC_R = MATRIX_BOX_R + MATRIX_STUB_GAP;

export const MATRIX_COMP_LABEL_OFFSET = 26;
export const MATRIX_TYPE_LABEL_OFFSET = 18;
export const MATRIX_PIN_LABEL_OFFSET_X = -16;

export const MATRIX_SEL_L = MATRIX_JUNC_L - 4;
export const MATRIX_SEL_T = MATRIX_BOX_T - MATRIX_COMP_LABEL_OFFSET - 10;
export const MATRIX_SEL_W = MATRIX_JUNC_R + 4 - MATRIX_SEL_L;
export const MATRIX_SEL_H = MATRIX_BOX_B + MATRIX_TYPE_LABEL_OFFSET + 10 - MATRIX_SEL_T;

export const MATRIX_HIT_DX = Math.max(-MATRIX_SEL_L, MATRIX_SEL_L + MATRIX_SEL_W) + 4;
export const MATRIX_HIT_DY = MATRIX_SEL_H / 2 + 4;

export {
    DC10H_COLOR_IDS as MATRIX_COLOR_IDS,
    DC10H_COLORS as MATRIX_COLORS,
    dc10hPalette as matrixPalette,
    nextDc10hColor as nextMatrixColor,
} from './bargraph-dc10h-layout.js';

/** Origine (coin haut-gauche) d'une cellule — centrée sur la patte de rangée. */
export function matrixCellOrigin(row, col) {
    const left = -GRID_PX / 2 + col * (MATRIX_CELL + MATRIX_CELL_GAP);
    const y = MATRIX_PIN_Y[row] - MATRIX_CELL / 2;
    return { x: left, y };
}

export function matrixRowJuncX(flipX) {
    return flipX ? MATRIX_JUNC_R : MATRIX_JUNC_L;
}

export function matrixColJuncX(flipX) {
    return flipX ? MATRIX_JUNC_L : MATRIX_JUNC_R;
}
