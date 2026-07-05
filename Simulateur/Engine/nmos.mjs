/** MOSFET canal N — IRLZ44N (logique, Rds(on) faible). */

export function spiceMosfetModelName(value) {
    const raw = String(value || "IRLZ44N")
        .trim()
        .replace(/\s+/g, "");
    const safe = raw.replace(/[^a-zA-Z0-9_]/g, "");
    const base = safe.length ? safe : "IRLZ44N";
    return /^[a-zA-Z_]/.test(base) ? base : `M_${base}`;
}

/** Lignes .model SPICE pour un NMOS (IRLZ44N par défaut). */
export function nmosModelLines(model, value) {
    const v = String(value || "").toLowerCase();
    if (v.includes("irlz44")) {
        return `.model ${model} NMOS (VTO=1.5 KP=20m RD=0.04 RS=0.04 CGD=1n CGS=1n CGB=1n)`;
    }
    return `.model ${model} NMOS (VTO=2 KP=20m RD=0.1 RS=0.1)`;
}

/**
 * @param {object} c composant { id, value }
 * @param {object} ctx { nodeFor, lines, declaredMosfetModels:Set, spiceBranchName }
 */
export function appendNmosNetlist(c, ctx) {
    const { nodeFor, lines, declaredMosfetModels, spiceBranchName } = ctx;
    const ng = nodeFor(`${c.id}#0`);
    const nd = nodeFor(`${c.id}#1`);
    const ns = nodeFor(`${c.id}#2`);
    const model = spiceMosfetModelName(c.value);
    if (!declaredMosfetModels.has(model)) {
        declaredMosfetModels.add(model);
        lines.push(nmosModelLines(model, c.value));
    }
    lines.push(`${spiceBranchName("M", c.id)} ${nd} ${ng} ${ns} ${ns} ${model}`);
}
