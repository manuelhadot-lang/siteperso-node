/** Géométrie L293D — driver moteur DIP-16 (datasheet TI / ST). */
const G = 20;

export const L293D_BOX_L = -2 * G;
export const L293D_BOX_R = 2 * G;
export const L293D_BOX_T = -4 * G;
export const L293D_BOX_B = 4 * G;
export const L293D_LABEL_L = L293D_BOX_L + G / 2;
export const L293D_LABEL_R = L293D_BOX_R - G / 2;
export const L293D_JUNC_L = -3 * G;
export const L293D_JUNC_R = 3 * G;

/** Broches 1–8 (gauche) et 16–9 (droite), 8 niveaux centrés. */
export const L293D_LEFT_PIN_Y = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (i - 3.5) * G);
export const L293D_RIGHT_PIN_Y = L293D_LEFT_PIN_Y;

/** Indice SPICE #0…#15 = broche DIP − 1. */
export const L293D_PIN = {
    EN12: 0,
    A1: 1,
    Y1: 2,
    GND1: 3,
    GND2: 4,
    Y2: 5,
    A2: 6,
    VSS: 7,
    EN34: 8,
    A3: 9,
    Y3: 10,
    GND3: 11,
    GND4: 12,
    Y4: 13,
    A4: 14,
    VMOT: 15,
};

export const L293D_JONCTION_SUFFIX = {
    EN12: L293D_PIN.EN12,
    A1: L293D_PIN.A1,
    Y1: L293D_PIN.Y1,
    GND1: L293D_PIN.GND1,
    GND2: L293D_PIN.GND2,
    Y2: L293D_PIN.Y2,
    A2: L293D_PIN.A2,
    VSS: L293D_PIN.VSS,
    EN34: L293D_PIN.EN34,
    A3: L293D_PIN.A3,
    Y3: L293D_PIN.Y3,
    GND3: L293D_PIN.GND3,
    GND4: L293D_PIN.GND4,
    Y4: L293D_PIN.Y4,
    A4: L293D_PIN.A4,
    VMOT: L293D_PIN.VMOT,
};

export const L293D_HIT_DX = 3 * G + G / 2;
export const L293D_HIT_DY = 4 * G + G / 2;

export function l293dJonctionToTerminalKey(label, jonctionId) {
    if (!label || !jonctionId?.startsWith(`${label}_`)) return null;
    const suffix = jonctionId.slice(label.length + 1);
    const idx = L293D_JONCTION_SUFFIX[suffix];
    if (idx === undefined) return null;
    return `${label}#${idx}`;
}

export function l293dTerminalKeys(id) {
    const keys = [];
    for (let i = 0; i < 16; i++) keys.push(`${id}#${i}`);
    return keys;
}
