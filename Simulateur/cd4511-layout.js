/** Géométrie CD4511 : boîtier 4×8 pas, broches ±3 pas, espacement vertical 1 pas. */
import { GRID_SIZE as G } from './state.js';

/** Rectangle central : 4 pas (L) × 8 pas (H), centré sur le composant. */
export const CD4511_BOX_L = -2 * G;
export const CD4511_BOX_R = 2 * G;
export const CD4511_BOX_T = -4 * G;
export const CD4511_BOX_B = 4 * G;

/** Libellés à ½ pas à l’intérieur du cadre. */
export const CD4511_LABEL_L = CD4511_BOX_L + G / 2;
export const CD4511_LABEL_R = CD4511_BOX_R - G / 2;

/** Jonctions à 1 pas à l’extérieur du boîtier (colonne grille). */
export const CD4511_JUNC_L = -3 * G;
export const CD4511_JUNC_R = 3 * G;

/** 7 broches, 1 pas entre chaque niveau, centrées verticalement (±3 pas). */
export const CD4511_PIN_Y = [-3, -2, -1, 0, 1, 2, 3].map((n) => n * G);

export const CD4511_HIT_DX = 3 * G + G / 2;
export const CD4511_HIT_DY = 4 * G + G / 2;

/** Noms de jonctions schéma (suffixe après le label) → indice broche SPICE. */
export const CD4511_JONCTION_SUFFIX = {
    A: 0,
    B: 1,
    C: 2,
    D: 3,
    LE: 4,
    BI: 5,
    LT: 6,
    a: 7,
    b: 8,
    c: 9,
    d: 10,
    e: 11,
    f: 12,
    g: 13,
};

/** @param {string} label ex. CD45111 */
/** @param {string} jonctionId ex. CD45111_A */
export function cd4511JonctionToTerminalKey(label, jonctionId) {
    if (!label || !jonctionId?.startsWith(`${label}_`)) return null;
    const suffix = jonctionId.slice(label.length + 1);
    const idx = CD4511_JONCTION_SUFFIX[suffix];
    if (idx === undefined) return null;
    return `${label}#${idx}`;
}
