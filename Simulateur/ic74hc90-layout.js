/** Géométrie 74HC90 / 74LS90 — boîtier DIP 14 broches (datasheet TI). */
import { GRID_SIZE as G } from './state.js';

export const IC90_BOX_L = -2 * G;
export const IC90_BOX_R = 2 * G;
export const IC90_BOX_T = -3.5 * G;
export const IC90_BOX_B = 3.5 * G;
export const IC90_LABEL_L = IC90_BOX_L + G / 2;
export const IC90_LABEL_R = IC90_BOX_R - G / 2;
export const IC90_JUNC_L = -3 * G;
export const IC90_JUNC_R = 3 * G;

/** Broches 1–7 (gauche) et 14–8 (droite), espacement 1 pas. */
export const IC90_LEFT_PIN_Y = [-3, -2, -1, 0, 1, 2, 3].map((n) => n * G);
export const IC90_RIGHT_PIN_Y = [-3, -2, -1, 0, 1, 2, 3].map((n) => n * G);

export const IC90_HIT_DX = 3 * G + G / 2;
export const IC90_HIT_DY = 3.5 * G + G / 2;

/** Indice SPICE (#0…#13) = numéro de broche DIP − 1. */
export const IC90_PIN = {
    CP1: 0,
    MR1: 1,
    MR2: 2,
    NC4: 3,
    VCC: 4,
    MS1: 5,
    MS2: 6,
    Q2: 7,
    Q1: 8,
    GND: 9,
    Q3: 10,
    Q0: 11,
    NC13: 12,
    CP0: 13,
};

/** Suffixe jonction schéma → indice broche. */
export const IC90_JONCTION_SUFFIX = {
    CP1: IC90_PIN.CP1,
    MR1: IC90_PIN.MR1,
    MR2: IC90_PIN.MR2,
    VCC: IC90_PIN.VCC,
    MS1: IC90_PIN.MS1,
    MS2: IC90_PIN.MS2,
    Q2: IC90_PIN.Q2,
    Q1: IC90_PIN.Q1,
    GND: IC90_PIN.GND,
    Q3: IC90_PIN.Q3,
    Q0: IC90_PIN.Q0,
    CP0: IC90_PIN.CP0,
};

export function ic74hc90JonctionToTerminalKey(label, jonctionId) {
    if (!label || !jonctionId?.startsWith(`${label}_`)) return null;
    const suffix = jonctionId.slice(label.length + 1);
    const idx = IC90_JONCTION_SUFFIX[suffix];
    if (idx === undefined) return null;
    return `${label}#${idx}`;
}

export function ic74hc90OutputPinIndices() {
    return [IC90_PIN.Q0, IC90_PIN.Q1, IC90_PIN.Q2, IC90_PIN.Q3];
}

export function ic74hc90InputPinIndices() {
    return [IC90_PIN.CP1, IC90_PIN.MR1, IC90_PIN.MR2, IC90_PIN.MS1, IC90_PIN.MS2, IC90_PIN.CP0];
}
