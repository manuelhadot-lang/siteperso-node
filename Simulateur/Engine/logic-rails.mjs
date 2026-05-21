/** Niveaux logiques en tension (analogique ngspice) : 0 V et rail 3,3 V ou 5 V. */

export function parseLogicRail(raw) {
    if (raw == null || raw === "") return 5;
    const n = parseFloat(String(raw).replace(",", "."));
    return Number.isFinite(n) && Math.abs(n - 3.3) < 0.05 ? 3.3 : 5;
}

export function toggleLogicRail(rail) {
    return parseLogicRail(rail) === 3.3 ? 5 : 3.3;
}

export function logicVhi(rail) {
    return parseLogicRail(rail);
}

export function logicVth(rail) {
    return logicVhi(rail) / 2;
}

export function logicLevelFromVoltage(v, railOrVth) {
    if (!Number.isFinite(v)) return null;
    const th =
        typeof railOrVth === "number" && railOrVth > 0 && railOrVth < 3
            ? railOrVth
            : logicVth(railOrVth);
    return v >= th ? "1" : "0";
}

export function formatLogicRailLabel(rail) {
    return parseLogicRail(rail) === 3.3 ? "3,3 V" : "5 V";
}

export function parseLogicStateVolts(value, rail) {
    const t = String(value ?? "")
        .trim()
        .toLowerCase();
    if (t === "1" || t === "haut" || t === "high" || t === "true" || t === "on" || t === "vcc") {
        return logicVhi(rail);
    }
    return 0;
}
