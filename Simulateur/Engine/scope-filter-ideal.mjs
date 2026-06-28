/**
 * Oscilloscope : aperçu idéal filtre RC + gain AOP pendant le réglage live du Sin.
 */

import { reachableJonctions } from "./hc90-cascade.mjs";
import { fixedVoltageAtJunction } from "./arduino-analog-ideal.mjs";
import { acGeneratorVoltageAt } from "./scope-gsin-ideal.mjs";
import {
    detectLm386GainForUi,
    detectLm386VccForUi,
    lm386PreviewStage,
    lm386Vbias,
} from "./lm386.mjs";

function parseResistorOhms(value) {
    const s = String(value || "1k").trim().toLowerCase();
    const m = s.match(/^([\d.]+)\s*([kmg]?)$/);
    if (!m) return 1000;
    let n = parseFloat(m[1]);
    if (!Number.isFinite(n) || n <= 0) return 1000;
    if (m[2] === "k") n *= 1e3;
    else if (m[2] === "m") n *= 1e6;
    else if (m[2] === "g") n *= 1e9;
    return n;
}

function parseCapacitanceFarad(s) {
    if (s == null) return 1e-6;
    let t = String(s).trim().toLowerCase().replace(/\s/g, "").replace(",", ".").replace("µ", "u");
    if (!t) return 1e-6;
    let mult = 1;
    if (t.endsWith("uf")) {
        mult = 1e-6;
        t = t.slice(0, -2);
    } else if (t.endsWith("u")) {
        mult = 1e-6;
        t = t.slice(0, -1);
    } else if (t.endsWith("pf")) {
        mult = 1e-12;
        t = t.slice(0, -2);
    } else if (t.endsWith("nf")) {
        mult = 1e-9;
        t = t.slice(0, -2);
    } else if (t.endsWith("p")) {
        mult = 1e-12;
        t = t.slice(0, -1);
    } else if (t.endsWith("n")) {
        mult = 1e-9;
        t = t.slice(0, -1);
    } else if (t.endsWith("m")) {
        mult = 1e-3;
        t = t.slice(0, -1);
    } else if (t.endsWith("f")) {
        mult = 1;
        t = t.slice(0, -1);
    }
    const n = parseFloat(t);
    return Number.isFinite(n) && n > 0 ? n * mult : 1e-6;
}

function netHasGround(jid, wires, autoJunctions) {
    const net = reachableJonctions(jid, wires, autoJunctions);
    for (const j of net) {
        if (fixedVoltageAtJunction(j) === 0) return true;
    }
    return false;
}

function sameNet(a, b, wires, autoJunctions) {
    if (!a || !b) return false;
    return reachableJonctions(a, wires, autoJunctions).has(b);
}

const PASSIVE_UI_TYPES = new Set(["capacitor", "resistor", "inductor", "speaker", "led"]);

/** Graphe fils + passifs (C/R/L/HP) + AOP / LM386. */
function reachableWithOpamps(startId, components, wires, autoJunctions) {
    let net = reachableJonctions(startId, wires, autoJunctions);
    for (let iter = 0; iter < 16; iter++) {
        const before = net.size;
        for (const c of components) {
            if (PASSIVE_UI_TYPES.has(c.type)) {
                const a = `${c.label}_in`;
                const b = `${c.label}_out`;
                if (net.has(a) || net.has(b)) {
                    net.add(a);
                    net.add(b);
                }
            }
        }
        for (const op of components) {
            if (op.type !== "opamp") continue;
            const plus = `${op.label}_plus`;
            const minus = `${op.label}_minus`;
            const out = `${op.label}_out`;
            if (net.has(plus) || net.has(minus) || net.has(out)) {
                net.add(plus);
                net.add(minus);
                net.add(out);
            }
        }
        for (const chip of components) {
            if (chip.type !== "lm386") continue;
            const inp = `${chip.label}_INP`;
            const inm = `${chip.label}_INM`;
            const out = `${chip.label}_OUT`;
            if (net.has(inp) || net.has(inm) || net.has(out)) {
                net.add(inp);
                net.add(inm);
                net.add(out);
            }
        }
        const expanded = new Set();
        for (const j of net) {
            for (const j2 of reachableJonctions(j, wires, autoJunctions)) expanded.add(j2);
        }
        net = expanded;
        if (net.size === before) break;
    }
    return net;
}

function signalReachesScope(fromJid, chNet, components, wires, autoJunctions) {
    const reach = reachableWithOpamps(fromJid, components, wires, autoJunctions);
    for (const j of reach) {
        if (chNet.has(j)) return true;
    }
    return false;
}

function resistorBetween(jA, jB, res, wires, autoJunctions) {
    const rIn = `${res.label}_in`;
    const rOut = `${res.label}_out`;
    return (
        (sameNet(jA, rIn, wires, autoJunctions) && sameNet(jB, rOut, wires, autoJunctions)) ||
        (sameNet(jA, rOut, wires, autoJunctions) && sameNet(jB, rIn, wires, autoJunctions))
    );
}

function parseOpampVp(c) {
    const n = Number(c?.vp);
    return Number.isFinite(n) ? n : 15;
}

function parseOpampVn(c) {
    const n = Number(c?.vn);
    return Number.isFinite(n) ? n : -15;
}

function clipOpamp(vIdeal, vp, vn) {
    if (vp < vn) return vIdeal;
    return Math.max(vn, Math.min(vp, vIdeal));
}

function applyOpampChain(vIn, chain) {
    let v = vIn;
    for (const stage of chain) {
        if (stage.type === "lm386") {
            const vb = stage.vbias ?? lm386Vbias(stage.vcc ?? 9);
            v = clipOpamp(vb + (stage.gain ?? 1) * v, stage.vp, stage.vn);
            if (stage.acCoupled) v -= vb;
        } else {
            v = clipOpamp((stage.gain ?? 1) * v, stage.vp, stage.vn);
        }
    }
    return v;
}

function opampLinearGain(opamp, components, wires, autoJunctions) {
    const out = `${opamp.label}_out`;
    const minus = `${opamp.label}_minus`;
    if (sameNet(out, minus, wires, autoJunctions)) return 1;

    let rf = 0;
    let rg = 0;
    for (const r of components) {
        if (r.type !== "resistor" && r.type !== "potentiometer") continue;
        const rOhm = parseResistorOhms(r.value);
        const rIn = `${r.label}_in`;
        const rOut = `${r.label}_out`;
        if (resistorBetween(out, minus, r, wires, autoJunctions)) rf = rOhm;
        const minusReach = reachableJonctions(minus, wires, autoJunctions);
        if (minusReach.has(rIn) && netHasGround(rOut, wires, autoJunctions)) rg = rOhm;
        if (minusReach.has(rOut) && netHasGround(rIn, wires, autoJunctions)) rg = rOhm;
    }
    if (rf > 0 && rg > 0) return 1 + rf / rg;
    return 1;
}

function buildAmplifierChainFromJunction(startJid, chNet, components, wires, autoJunctions) {
    const chain = [];
    let frontier = reachableWithOpamps(startJid, components, wires, autoJunctions);
    const used = new Set();
    for (let pass = 0; pass < 12; pass++) {
        let found = false;
        for (const op of components) {
            if (op.type !== "opamp" || used.has(op.label)) continue;
            const plus = `${op.label}_plus`;
            if (!frontier.has(plus)) continue;
            const outReach = reachableWithOpamps(`${op.label}_out`, components, wires, autoJunctions);
            const reachesScope = [...outReach].some((j) => chNet.has(j));
            if (!reachesScope) continue;
            chain.push({
                gain: opampLinearGain(op, components, wires, autoJunctions),
                vp: parseOpampVp(op),
                vn: parseOpampVn(op),
            });
            used.add(op.label);
            for (const j of outReach) frontier.add(j);
            found = true;
        }
        for (const chip of components) {
            if (chip.type !== "lm386" || used.has(chip.label)) continue;
            const inp = `${chip.label}_INP`;
            if (!frontier.has(inp)) continue;
            const outReach = reachableWithOpamps(`${chip.label}_OUT`, components, wires, autoJunctions);
            const reachesScope = [...outReach].some((j) => chNet.has(j));
            if (!reachesScope) continue;
            const gain = detectLm386GainForUi(chip, components, wires, autoJunctions);
            const vcc = detectLm386VccForUi(chip, components, wires, autoJunctions);
            chain.push(lm386PreviewStage(gain, vcc));
            used.add(chip.label);
            for (const j of outReach) frontier.add(j);
            found = true;
        }
        if (!found) break;
    }
    return chain;
}

function rcTransfer(type, fHz, rOhm, cFarad) {
    const w = 2 * Math.PI * Math.max(0, fHz);
    const x = w * rOhm * cFarad;
    if (type === "hp") {
        return {
            mag: x / Math.sqrt(1 + x * x),
            phase: Math.PI / 2 - Math.atan(x),
        };
    }
    return {
        mag: 1 / Math.sqrt(1 + x * x),
        phase: -Math.atan(x),
    };
}

function filteredAcVoltageAt(sourceComp, preview, tAbs) {
    const f = sourceComp.frequency ?? 1000;
    const aIn = sourceComp.peakAmplitude ?? 5;
    const oIn = sourceComp.offset ?? 0;
    const { mag, phase } = rcTransfer(preview.type, f, preview.rOhm, preview.cFarad);
    const chain = preview.opampChain ?? [];
    const gLin = preview.linearGain ?? chain.reduce((p, s) => p * (s.gain ?? 1), 1);
    const a = aIn * mag * (chain.length ? 1 : gLin);
    const o = preview.type === "lp" ? oIn * mag * (chain.length ? 1 : gLin) : 0;
    if (!(f > 0)) return applyOpampChain(o, chain);
    const vFilter = o + a * Math.sin(2 * Math.PI * f * Math.max(0, tAbs) + phase);
    return applyOpampChain(vFilter, chain);
}

/**
 * Filtre RC (HP/LP) entre le Sin réglé et une voie scope, plus gain AOP en aval.
 * Retourne null si le générateur est déjà câblé directement sur la voie.
 */
export function findRcFilterPreviewForScope(
    oscLabel,
    channelSuffix,
    sourceComp,
    components,
    wires,
    autoJunctions = []
) {
    if (!sourceComp?.label || (sourceComp.type !== "gsin" && sourceComp.type !== "gsqr")) return null;

    const chNet = reachableWithOpamps(`${oscLabel}_${channelSuffix}`, components, wires, autoJunctions);
    const srcOut = `${sourceComp.label}_out`;
    const srcNet = reachableJonctions(srcOut, wires, autoJunctions);
    if ([...srcNet].some((j) => chNet.has(j))) return null;

    const resistors = components.filter((c) => c.type === "resistor" || c.type === "potentiometer");
    const capacitors = components.filter((c) => c.type === "capacitor");

    let best = null;
    for (const cap of capacitors) {
        const cIn = `${cap.label}_in`;
        const cOut = `${cap.label}_out`;
        for (const res of resistors) {
            const rIn = `${res.label}_in`;
            const rOut = `${res.label}_out`;

            const shared =
                sameNet(cIn, rIn, wires, autoJunctions) ||
                sameNet(cIn, rOut, wires, autoJunctions) ||
                sameNet(cOut, rIn, wires, autoJunctions) ||
                sameNet(cOut, rOut, wires, autoJunctions);
            if (!shared) continue;

            let type = null;
            let junctionId = null;

            if (srcNet.has(cIn) && !srcNet.has(cOut)) {
                const j = cOut;
                if (
                    (sameNet(j, rIn, wires, autoJunctions) && netHasGround(rOut, wires, autoJunctions)) ||
                    (sameNet(j, rOut, wires, autoJunctions) && netHasGround(rIn, wires, autoJunctions))
                ) {
                    type = "hp";
                    junctionId = j;
                }
            } else if (srcNet.has(cOut) && !srcNet.has(cIn)) {
                const j = cIn;
                if (
                    (sameNet(j, rIn, wires, autoJunctions) && netHasGround(rOut, wires, autoJunctions)) ||
                    (sameNet(j, rOut, wires, autoJunctions) && netHasGround(rIn, wires, autoJunctions))
                ) {
                    type = "hp";
                    junctionId = j;
                }
            }

            if (srcNet.has(rIn) && !srcNet.has(rOut)) {
                const j = rOut;
                if (
                    (sameNet(j, cIn, wires, autoJunctions) && netHasGround(cOut, wires, autoJunctions)) ||
                    (sameNet(j, cOut, wires, autoJunctions) && netHasGround(cIn, wires, autoJunctions))
                ) {
                    type = "lp";
                    junctionId = j;
                }
            } else if (srcNet.has(rOut) && !srcNet.has(rIn)) {
                const j = rIn;
                if (
                    (sameNet(j, cIn, wires, autoJunctions) && netHasGround(cOut, wires, autoJunctions)) ||
                    (sameNet(j, cOut, wires, autoJunctions) && netHasGround(cIn, wires, autoJunctions))
                ) {
                    type = "lp";
                    junctionId = j;
                }
            }

            if (!type || !junctionId) continue;

            if (!signalReachesScope(junctionId, chNet, components, wires, autoJunctions)) continue;

            const opampChain = buildAmplifierChainFromJunction(
                junctionId,
                chNet,
                components,
                wires,
                autoJunctions
            );
            const linearGain = opampChain.reduce((p, s) => p * (s.gain ?? 1), 1);
            best = {
                type,
                rOhm: parseResistorOhms(res.value),
                cFarad: parseCapacitanceFarad(cap.value),
                linearGain,
                opampChain,
            };
            return best;
        }
    }
    return best;
}

/**
 * Chaîne Sin → LM386 → voie scope (CH2 sortie HP) sans filtre RC intermédiaire.
 */
export function findLm386OutputPreviewForScope(
    oscLabel,
    channelSuffix,
    components,
    wires,
    autoJunctions = []
) {
    const wireNet = reachableJonctions(`${oscLabel}_${channelSuffix}`, wires, autoJunctions);
    for (const src of components) {
        if ((src.type === "gsin" || src.type === "gsqr") && wireNet.has(`${src.label}_out`)) {
            return null;
        }
    }

    const chNet = reachableWithOpamps(`${oscLabel}_${channelSuffix}`, components, wires, autoJunctions);

    for (const chip of components) {
        if (chip.type !== "lm386") continue;
        const outReach = reachableWithOpamps(`${chip.label}_OUT`, components, wires, autoJunctions);
        if (![...outReach].some((j) => chNet.has(j))) continue;

        for (const src of components) {
            if (src.type !== "gsin" && src.type !== "gsqr") continue;
            const srcReach = reachableWithOpamps(`${src.label}_out`, components, wires, autoJunctions);
            if (!srcReach.has(`${chip.label}_INP`)) continue;
            const gain = detectLm386GainForUi(chip, components, wires, autoJunctions);
            const vcc = detectLm386VccForUi(chip, components, wires, autoJunctions);
            return {
                sourceComp: src,
                opampChain: [lm386PreviewStage(gain, vcc)],
            };
        }
    }
    return null;
}

/**
 * Sin/Carré → LM386 → haut-parleur (sortie après C2 de couplage).
 */
export function findLm386DriveForSpeaker(components, wires, autoJunctions = []) {
    const speakers = components.filter((c) => c.type === "speaker" && c.label);
    if (!speakers.length) return null;

    for (const sp of speakers) {
        const hpNet = reachableWithOpamps(`${sp.label}_in`, components, wires, autoJunctions);
        for (const j of reachableWithOpamps(`${sp.label}_out`, components, wires, autoJunctions)) {
            hpNet.add(j);
        }

        for (const chip of components) {
            if (chip.type !== "lm386") continue;
            const outReach = reachableWithOpamps(`${chip.label}_OUT`, components, wires, autoJunctions);
            if (![...outReach].some((j) => hpNet.has(j))) continue;

            for (const src of components) {
                if (src.type !== "gsin" && src.type !== "gsqr") continue;
                const srcReach = reachableWithOpamps(`${src.label}_out`, components, wires, autoJunctions);
                if (!srcReach.has(`${chip.label}_INP`)) continue;
                const gain = detectLm386GainForUi(chip, components, wires, autoJunctions);
                const vcc = detectLm386VccForUi(chip, components, wires, autoJunctions);
                return {
                    sourceComp: src,
                    opampChain: [lm386PreviewStage(gain, vcc)],
                };
            }
        }
    }
    return null;
}

/** Crête AC (V) après chaîne LM386 pour l'amplitude crête du générateur. */
export function amplifiedAcPeakVolts(sourceComp, opampChain) {
    if (!sourceComp || !opampChain?.length) return 0;
    const aIn = sourceComp.peakAmplitude ?? 5;
    return Math.abs(applyOpampChain(aIn, opampChain));
}

/** Courbe Sin/Carré amplifiée (LM386) pour l'oscilloscope. */
export function synthesizeAmplifiedAcScopeTrace(
    sourceComp,
    opampChain,
    windowSec,
    elapsedSec,
    timeOffsetSec = 0,
    syncOffsetSec = 0
) {
    if (!sourceComp || !opampChain?.length || windowSec <= 0) return [];
    const period = sourcePeriodSec(sourceComp);
    if (!(period > 0)) return [];

    const tRef = Math.max(0, elapsedSec);
    const phase = ((tRef % period) + period) % period;
    const anchor = tRef - phase;
    const n = Math.max(128, Math.min(1600, Math.ceil(windowSec * (40 / period))));
    const points = [];
    for (let i = 0; i < n; i++) {
        const tScreen = (i / (n - 1)) * windowSec;
        const tPhase = ((syncOffsetSec + timeOffsetSec + tScreen) % period + period) % period;
        const vIn = acGeneratorVoltageAt(sourceComp, anchor + tPhase);
        points.push({ t: tScreen, v: applyOpampChain(vIn, opampChain) });
    }
    return points;
}

function sourcePeriodSec(comp) {
    const f = comp?.frequency ?? 1000;
    return f > 0 ? 1 / f : 0;
}

/** Courbe sinusoïdale filtrée + gain AOP, synchronisée sur la période du Sin. */
export function synthesizeFilteredAcScopeTrace(
    sourceComp,
    preview,
    windowSec,
    elapsedSec,
    timeOffsetSec = 0,
    syncOffsetSec = 0
) {
    if (!sourceComp || !preview || windowSec <= 0) return [];
    const period = sourcePeriodSec(sourceComp);
    if (!(period > 0)) return [];

    const tRef = Math.max(0, elapsedSec);
    const phase = ((tRef % period) + period) % period;
    const anchor = tRef - phase;
    const n = Math.max(128, Math.min(1600, Math.ceil(windowSec * (40 / period))));
    const points = [];
    for (let i = 0; i < n; i++) {
        const tScreen = (i / (n - 1)) * windowSec;
        const tPhase = ((syncOffsetSec + timeOffsetSec + tScreen) % period + period) % period;
        points.push({ t: tScreen, v: filteredAcVoltageAt(sourceComp, preview, anchor + tPhase) });
    }
    return points;
}
