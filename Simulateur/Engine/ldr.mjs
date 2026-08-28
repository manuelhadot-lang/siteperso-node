/**
 * Photorésistance (LDR) — modèle type GL5528.
 * R(lux) = R10 × (10 / lux)^γ, borné entre Rmin et Rdark.
 */

export const LDR_DEFAULT_LUX = 100;
export const LDR_R10_OHM = 10_000;
export const LDR_GAMMA = 0.7;
export const LDR_RDARK_OHM = 1_000_000;
export const LDR_RMIN_OHM = 100;
export const LDR_LUX_MIN = 0;
export const LDR_LUX_MAX = 10_000;
export const LDR_LUX_STEPS = [0, 1, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];

export function isLdrType(t) {
    return t === "ldr";
}

export function clampLdrLux(lux) {
    const n = Number(lux);
    if (!Number.isFinite(n)) return LDR_DEFAULT_LUX;
    return Math.min(LDR_LUX_MAX, Math.max(LDR_LUX_MIN, n));
}

/**
 * Résistance (Ω) en fonction de la luminosité.
 * @param {{ lux?: number, r10?: number, gamma?: number }} [comp]
 */
export function ldrResistanceOhm(comp = {}) {
    const lux = clampLdrLux(comp.lux ?? LDR_DEFAULT_LUX);
    const r10 = Number(comp.r10) > 0 ? Number(comp.r10) : LDR_R10_OHM;
    const gamma = Number(comp.gamma) > 0 ? Number(comp.gamma) : LDR_GAMMA;
    if (lux <= 0) return LDR_RDARK_OHM;
    const r = r10 * (10 / lux) ** gamma;
    return Math.min(LDR_RDARK_OHM, Math.max(LDR_RMIN_OHM, r));
}

export function stepLdrLux(lux, dir) {
    const x = clampLdrLux(lux);
    if (dir > 0) {
        const next = LDR_LUX_STEPS.find((s) => s > x + 1e-9);
        return next ?? LDR_LUX_MAX;
    }
    const prev = [...LDR_LUX_STEPS].reverse().find((s) => s < x - 1e-9);
    return prev ?? LDR_LUX_MIN;
}

export function formatLdrOhms(ohm) {
    const n = Number(ohm);
    if (!Number.isFinite(n) || n <= 0) return "1M";
    if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}k`;
    return String(Math.round(n));
}

export function formatLdrLux(lux) {
    const n = clampLdrLux(lux);
    if (n >= 100) return `${Math.round(n)} lx`;
    if (n >= 10) return `${n.toFixed(n % 1 === 0 ? 0 : 1)} lx`;
    if (n <= 0) return "0 lx";
    return `${n.toFixed(1)} lx`;
}
