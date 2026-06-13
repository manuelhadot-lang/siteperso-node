/**
 * Compteur ripple mod-10 (4× DFF, AND Q2+Q4 → reset) — détection UI + animation idéale.
 */
import { reachableJonctions } from "./hc90-cascade.mjs";

const CD4511_BCD_PINS = ["A", "B", "C", "D"];
const SEG7_SEG_PINS = ["a", "b", "c", "d", "e", "f", "g"];

function dffLabelIndex(label) {
    const m = /(\d+)$/.exec(String(label || ""));
    return m ? parseInt(m[1], 10) : null;
}

/**
 * Détecte un compteur ripple décade correctement câblé (AND sur DFF2.Q et DFF4.Q → RESET).
 * @returns {{ mode: "mod10" } | null}
 */
export function detectRippleMod10ForAnim(components, wires, autoJunctions = []) {
    const dffs = components.filter((c) => c.type === "d_flipflop" && c.label);
    const ands = components.filter((c) => c.type === "and" && c.label);
    if (dffs.length < 4 || ands.length === 0) return null;

    for (const and of ands) {
        const outNet = reachableJonctions(`${and.label}_out`, wires, autoJunctions);
        if (dffs.filter((d) => outNet.has(`${d.label}_RESET`)).length < 4) continue;

        const inANet = reachableJonctions(`${and.label}_inA`, wires, autoJunctions);
        const inBNet = reachableJonctions(`${and.label}_inB`, wires, autoJunctions);
        const qIdx = [];
        for (const d of dffs) {
            const qPin = `${d.label}_Q`;
            if (inANet.has(qPin) || inBNet.has(qPin)) {
                const idx = dffLabelIndex(d.label);
                if (idx != null && !qIdx.includes(idx)) qIdx.push(idx);
            }
        }
        if (qIdx.length !== 2) continue;
        qIdx.sort((a, b) => a - b);
        if (qIdx[0] === 2 && qIdx[1] === 4) return { mode: "mod10" };
    }
    return null;
}

/** Afficheur 7 seg alimenté par CD4511 lui-même relié aux Q des bascules ripple mod-10. */
export function rippleMod10Seg7Linked(segLabel, components, wires, autoJunctions = []) {
    if (!segLabel || !detectRippleMod10ForAnim(components, wires, autoJunctions)) return false;

    for (const cd of components) {
        if (cd.type !== "cd4511" || !cd.label) continue;
        let segLinked = false;
        for (const s of SEG7_SEG_PINS) {
            if (reachableJonctions(`${segLabel}_${s}`, wires, autoJunctions).has(`${cd.label}_${s}`)) {
                segLinked = true;
                break;
            }
        }
        if (!segLinked) continue;

        const dffs = components.filter((c) => c.type === "d_flipflop" && c.label);
        let matched = 0;
        for (const d of dffs) {
            const idx = dffLabelIndex(d.label);
            if (idx == null || idx < 1 || idx > 4) continue;
            const bcdPin = `${cd.label}_${CD4511_BCD_PINS[idx - 1]}`;
            if (reachableJonctions(`${d.label}_Q`, wires, autoJunctions).has(bcdPin)) matched++;
        }
        if (matched >= 4) return true;
    }
    return false;
}

/** Chiffre 0…9 : 1 impulsion GImp = +1 (modulo 10). */
export function idealRippleMod10Bcd(elapsedSec, clockPeriodSec) {
    if (!(clockPeriodSec > 0) || !(elapsedSec >= 0)) return 0;
    return Math.floor(elapsedSec / clockPeriodSec) % 10;
}

export function shouldUseIdealRippleMod10Seg7(segLabel, components, wires, autoJunctions, clockPeriodSec) {
    return (
        clockPeriodSec > 0 &&
        rippleMod10Seg7Linked(segLabel, components, wires, autoJunctions)
    );
}
