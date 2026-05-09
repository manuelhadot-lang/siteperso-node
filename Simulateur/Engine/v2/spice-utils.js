const COORD_EPS = 1e-6;

export const SPICE_OPTIONS_LINE = ".options reltol=1e-4 abstol=1e-12 vntol=1e-6";
export const SPICE_DIODE_MODEL_LINE =
    ".model DDEFAULT D(Is=2.52n Rs=0.568 N=1.906 Cjo=1p M=0.03 Eg=1.11 Bv=100 Ibv=0.1u)";

export function qCoord(value) {
    if (!Number.isFinite(value)) {
        return value;
    }
    if (Math.abs(value - Math.round(value)) <= COORD_EPS) {
        return Math.round(value);
    }
    return Number(value.toFixed(6));
}

export function pointKey(x, y) {
    return `${qCoord(x)}:${qCoord(y)}`;
}

export function normalizeValueText(raw) {
    return String(raw || "")
        .trim()
        .replace(",", ".")
        .replace(/µ/g, "u")
        .replace(/Ω/gi, "")
        .replace(/\s+/g, "");
}

export function parseSpiceNumericValue(raw, fallback = null) {
    const txt = normalizeValueText(raw);
    if (!txt) {
        return fallback;
    }
    const match = txt.match(/^([+-]?\d*\.?\d+(?:e[+-]?\d+)?)([a-zA-Z]*)$/);
    if (!match) {
        return fallback;
    }
    const base = Number.parseFloat(match[1]);
    if (!Number.isFinite(base)) {
        return fallback;
    }
    const unit = (match[2] || "")
        .toLowerCase()
        .replace(/(volt|volts|v)$/i, "")
        .replace(/(ohm|ohms)$/i, "");
    const multipliers = { t: 1e12, g: 1e9, meg: 1e6, k: 1e3, m: 1e-3, u: 1e-6, n: 1e-9 };
    if (!unit) {
        return `${base}`;
    }
    return multipliers[unit] !== undefined ? `${base * multipliers[unit]}` : fallback;
}

export function sanitizeRef(ref, fallbackPrefix, idx) {
    const cleaned = String(ref || "").toUpperCase().replace(/[^A-Z0-9_]/g, "");
    return cleaned || `${fallbackPrefix}${idx}`;
}
