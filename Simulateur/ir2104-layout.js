/** Géométrie IR2104 — driver demi-pont DIP-8 (datasheet Infineon). */
const G = 20;

export const IR2104_BOX_L = -1.5 * G;
export const IR2104_BOX_R = 1.5 * G;
export const IR2104_BOX_T = -2.5 * G;
export const IR2104_BOX_B = 2.5 * G;
export const IR2104_LABEL_L = IR2104_BOX_L + G / 3;
export const IR2104_LABEL_R = IR2104_BOX_R - G / 3;
export const IR2104_JUNC_L = -2.5 * G;
export const IR2104_JUNC_R = 2.5 * G;

/** Broches 1–4 (gauche) et 8–5 (droite). */
export const IR2104_LEFT_PIN_Y = [-2, -1, 1, 2].map((n) => n * G);
export const IR2104_RIGHT_PIN_Y = [-2, -1, 1, 2].map((n) => n * G);

/** Numéros DIP 8 → indice SPICE (#0…#7) = numéro − 1. */
export const IR2104_PIN = {
    LO: 0,
    VS: 1,
    HO: 2,
    VB: 3,
    NC: 4,
    VCC: 5,
    COM: 6,
    IN: 7,
};

export const IR2104_JONCTION_SUFFIX = {
    LO: IR2104_PIN.LO,
    VS: IR2104_PIN.VS,
    HO: IR2104_PIN.HO,
    VB: IR2104_PIN.VB,
    NC: IR2104_PIN.NC,
    VCC: IR2104_PIN.VCC,
    COM: IR2104_PIN.COM,
    IN: IR2104_PIN.IN,
};

export const IR2104_HIT_DX = 2.5 * G + G / 2;
export const IR2104_HIT_DY = 2.5 * G + G / 2;

export function ir2104JonctionToTerminalKey(label, jonctionId) {
    if (!label || !jonctionId?.startsWith(`${label}_`)) return null;
    const suffix = jonctionId.slice(label.length + 1);
    const idx = IR2104_JONCTION_SUFFIX[suffix];
    if (idx === undefined) return null;
    return `${label}#${idx}`;
}

export function ir2104TerminalKeys(id) {
    const keys = [];
    for (let i = 0; i < 8; i++) keys.push(`${id}#${i}`);
    return keys;
}
