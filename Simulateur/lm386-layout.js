/** Géométrie LM386 — boîtier DIP 8 broches (datasheet TI). */
const G = 20;

export const LM386_BOX_L = -1.5 * G;
export const LM386_BOX_R = 1.5 * G;
/** Cadre central plus haut que l’empattement des broches (±40 px). */
export const LM386_BOX_T = -2.5 * G;
export const LM386_BOX_B = 2.5 * G;
export const LM386_LABEL_L = LM386_BOX_L + G / 3;
export const LM386_LABEL_R = LM386_BOX_R - G / 3;
export const LM386_JUNC_L = -2.5 * G;
export const LM386_JUNC_R = 2.5 * G;

/** Broches 1–4 (gauche) et 8–5 (droite) — pas entier de 20 px (aligné snapToGrid). */
export const LM386_LEFT_PIN_Y = [-2, -1, 1, 2].map((n) => n * G);
export const LM386_RIGHT_PIN_Y = [-2, -1, 1, 2].map((n) => n * G);

/** Numéros DIP 8 → indice SPICE (#0…#7) = numéro − 1. */
export const LM386_PIN = {
    G1: 0,
    INM: 1,
    INP: 2,
    GND: 3,
    OUT: 4,
    VCC: 5,
    BYP: 6,
    G8: 7,
};

export const LM386_JONCTION_SUFFIX = {
    G1: LM386_PIN.G1,
    INM: LM386_PIN.INM,
    INP: LM386_PIN.INP,
    GND: LM386_PIN.GND,
    OUT: LM386_PIN.OUT,
    VCC: LM386_PIN.VCC,
    BYP: LM386_PIN.BYP,
    G8: LM386_PIN.G8,
};

export const LM386_HIT_DX = 2.5 * G + G / 2;
export const LM386_HIT_DY = 2.5 * G + G / 2;

export function lm386JonctionToTerminalKey(label, jonctionId) {
    if (!label || !jonctionId?.startsWith(`${label}_`)) return null;
    const suffix = jonctionId.slice(label.length + 1);
    const idx = LM386_JONCTION_SUFFIX[suffix];
    if (idx === undefined) return null;
    return `${label}#${idx}`;
}

export function lm386TerminalKeys(id) {
    const keys = [];
    for (let i = 0; i < 8; i++) keys.push(`${id}#${i}`);
    return keys;
}
