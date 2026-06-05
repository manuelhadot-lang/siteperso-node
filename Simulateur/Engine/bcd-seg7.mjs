/** BCD 0–9 → segments 7 segments (cathode commune, 1 = segment allumé). */

const SEG7_NAMES = ["a", "b", "c", "d", "e", "f", "g"];

const BCD_SEGMENTS = [
    [1, 1, 1, 1, 1, 1, 0],
    [0, 1, 1, 0, 0, 0, 0],
    [1, 1, 0, 1, 1, 0, 1],
    [1, 1, 1, 1, 0, 0, 1],
    [0, 1, 1, 0, 0, 1, 1],
    [1, 0, 1, 1, 0, 1, 1],
    [1, 0, 1, 1, 1, 1, 1],
    [1, 1, 1, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 0, 1, 1],
];

export function bcdDigitToSeg7Segments(digit) {
    const d = Math.min(9, Math.max(0, Math.floor(Number(digit) || 0)));
    const row = BCD_SEGMENTS[d];
    const segments = {};
    SEG7_NAMES.forEach((name, i) => {
        segments[name] = !!row[i];
    });
    return segments;
}

/** @param {number[]} qVoltages [Q0,Q1,Q2,Q3] */
export function bcdFromQVoltages(qVoltages, vth = 2.5) {
    let n = 0;
    for (let i = 0; i < 4; i++) {
        const v = qVoltages[i];
        if (Number.isFinite(v) && v > vth) n |= 1 << i;
    }
    return n;
}

/** Retrouve le chiffre 0–9 à partir des segments allumés (afficheur). */
export function seg7PatternToDigit(segments) {
    if (!segments || typeof segments !== "object") return null;
    for (let d = 0; d <= 9; d++) {
        const ref = bcdDigitToSeg7Segments(d);
        if (SEG7_NAMES.every((n) => !!segments[n] === ref[n])) return d;
    }
    return null;
}

export { SEG7_NAMES };
