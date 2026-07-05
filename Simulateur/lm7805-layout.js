/** Géométrie LM7805 — boîtier TO-220, 3 broches (datasheet ST / ON Semi). */
const G = 20;

export const LM7805_BOX_L = -1.5 * G;
export const LM7805_BOX_R = 1.5 * G;
export const LM7805_BOX_T = -1.5 * G;
export const LM7805_BOX_B = 1.5 * G;
export const LM7805_LABEL_L = LM7805_BOX_L + G / 3;
/** Aligné sur l’empattement standard (−40 px), extrémité des fils de broche. */
export const LM7805_JUNC_L = -2 * G;

/** Broches 1 IN, 2 GND, 3 OUT (vue dessus, repère broche 1 en haut). */
export const LM7805_PIN_Y = [-1, 0, 1].map((n) => n * G);

/** Indices SPICE #0…#2 = broches 1…3. */
export const LM7805_PIN = {
    IN: 0,
    GND: 1,
    OUT: 2,
};

export const LM7805_JONCTION_SUFFIX = {
    IN: LM7805_PIN.IN,
    GND: LM7805_PIN.GND,
    OUT: LM7805_PIN.OUT,
};

export const LM7805_HIT_DX = 2.5 * G + G / 2;
export const LM7805_HIT_DY = 1.5 * G + G / 2;

export function lm7805JonctionToTerminalKey(label, jonctionId) {
    if (!label || !jonctionId?.startsWith(`${label}_`)) return null;
    const suffix = jonctionId.slice(label.length + 1);
    const idx = LM7805_JONCTION_SUFFIX[suffix];
    if (idx === undefined) return null;
    return `${label}#${idx}`;
}

export function lm7805TerminalKeys(id) {
    return [`${id}#0`, `${id}#1`, `${id}#2`];
}
