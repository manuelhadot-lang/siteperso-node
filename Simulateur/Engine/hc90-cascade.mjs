/**
 * Détection chaîne 74HC90 (unités + dizaines) et comptage idéal pour l’animation.
 */

/** Indices broche HC90 (#pin SPICE) — local pour ne pas importer logic-74hc90 (fs) côté navigateur. */
const HC90_PIN_Q1 = 8;
const HC90_PIN_Q2 = 7;
const HC90_PIN_MR1 = 1;
const HC90_PIN_MR2 = 2;

const CLOCK_SOURCE_TYPES = new Set(["gimp", "gsin", "gsqr", "vpulse", "vsin", "vsquare"]);
const HC90_Q_RE = /^(.+)_Q([0-3])$/;
const UI_AND_TYPES = new Set(["and", "logic_and"]);
const UI_COMBINATORIAL_TYPES = new Set([
    "and",
    "logic_and",
    "nand",
    "logic_nand",
    "or",
    "logic_or",
    "nor",
    "logic_nor",
]);

const WIRE_EPS = 1e-6;

function pointOnWireSegment(p, a, b) {
    if (!p || !a || !b) return false;
    if (Math.abs(a.x - b.x) < WIRE_EPS) {
        return (
            Math.abs(p.x - a.x) < WIRE_EPS &&
            p.y >= Math.min(a.y, b.y) - WIRE_EPS &&
            p.y <= Math.max(a.y, b.y) + WIRE_EPS
        );
    }
    if (Math.abs(a.y - b.y) < WIRE_EPS) {
        return (
            Math.abs(p.y - a.y) < WIRE_EPS &&
            p.x >= Math.min(a.x, b.x) - WIRE_EPS &&
            p.x <= Math.max(a.x, b.x) + WIRE_EPS
        );
    }
    return false;
}

/** Graphe électrique incluant les jonctions auto posées sur un fil (T). */
function buildJonctionGroups(wires, autoJunctions = []) {
    const parent = new Map();
    function touch(id) {
        if (id && !parent.has(id)) parent.set(id, id);
    }
    function find(id) {
        touch(id);
        let root = id;
        while (parent.get(root) !== root) root = parent.get(root);
        let cur = id;
        while (parent.get(cur) !== root) {
            const next = parent.get(cur);
            parent.set(cur, root);
            cur = next;
        }
        return root;
    }
    function union(a, b) {
        if (!a || !b) return;
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent.set(ra, rb);
    }

    for (const w of wires || []) {
        if (!w?.fromJonctionId || !w?.toJonctionId) continue;
        union(w.fromJonctionId, w.toJonctionId);
        const pts = w.points;
        if (!Array.isArray(pts) || pts.length < 2) continue;
        for (const aj of autoJunctions) {
            if (!aj?.id) continue;
            for (let i = 0; i < pts.length - 1; i++) {
                if (pointOnWireSegment({ x: aj.x, y: aj.y }, pts[i], pts[i + 1])) {
                    union(aj.id, w.fromJonctionId);
                    union(aj.id, w.toJonctionId);
                    break;
                }
            }
        }
    }
    return parent;
}

/** Jonctions reliées électriquement à startId (graphe non orienté). */
export function reachableJonctions(startId, wires, autoJunctions = []) {
    if (!startId) return new Set();
    const parent = buildJonctionGroups(wires, autoJunctions);
    if (!parent.has(startId)) return new Set([startId]);
    const root = findJonctionRoot(startId, parent);
    const visited = new Set();
    for (const id of parent.keys()) {
        if (findJonctionRoot(id, parent) === root) visited.add(id);
    }
    return visited;
}

function findJonctionRoot(id, parent) {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    return root;
}

function hc90Labels(components) {
    return components.filter((c) => c.type === "ic_74hc90" && c.label).map((c) => c.label);
}

function clockOutJonctions(components) {
    const outs = [];
    for (const c of components) {
        if (!CLOCK_SOURCE_TYPES.has(c.type) || !c.label) continue;
        outs.push(`${c.label}_out`);
    }
    return outs;
}

function cp0ClockedBySource(label, clockOuts, wires, autoJunctions = []) {
    const cp0 = `${label}_CP0`;
    const net = reachableJonctions(cp0, wires, autoJunctions);
    return clockOuts.some((out) => net.has(out));
}

/** Report unités → dizaines : Q3 direct ou AND(Q0,Q3). */
export function validateHc90Carry(unitsLabel, tensLabel, components, wires, autoJunctions = []) {
    const cp0Net = reachableJonctions(`${tensLabel}_CP0`, wires, autoJunctions);
    const q0 = `${unitsLabel}_Q0`;
    const q3 = `${unitsLabel}_Q3`;
    if (cp0Net.has(q3) && !hasAndBetween(unitsLabel, tensLabel, components, wires, autoJunctions)) {
        return { valid: true, kind: "q3" };
    }
    for (const comp of components) {
        if (!isAndGate(comp)) continue;
        const out = `${comp.label}_out`;
        if (!cp0Net.has(out)) continue;
        const inANet = reachableJonctions(`${comp.label}_inA`, wires, autoJunctions);
        const inBNet = reachableJonctions(`${comp.label}_inB`, wires, autoJunctions);
        const okQ0Q3 =
            (inANet.has(q0) && inBNet.has(q3)) || (inANet.has(q3) && inBNet.has(q0));
        if (okQ0Q3) return { valid: true, kind: "and_q0_q3" };
    }
    return { valid: false, kind: "unknown" };
}

function hasAndBetween(unitsLabel, tensLabel, components, wires, autoJunctions = []) {
    const cp0Net = reachableJonctions(`${tensLabel}_CP0`, wires, autoJunctions);
    return components.some((c) => isAndGate(c) && cp0Net.has(`${c.label}_out`));
}

function isAndGate(comp) {
    return !!(comp?.label && UI_AND_TYPES.has(comp.type));
}

function isCombinatorialGate(comp) {
    return !!(comp?.label && UI_COMBINATORIAL_TYPES.has(comp.type));
}

function gateOutputJonction(comp) {
    return `${comp.label}_out`;
}

function gateInputJonctions(comp) {
    return [`${comp.label}_inA`, `${comp.label}_inB`];
}

function hc90MrJonctions(...labels) {
    const out = [];
    for (const label of labels) {
        if (!label) continue;
        out.push(`${label}_MR1`, `${label}_MR2`);
    }
    return out;
}

/** AND dont les entrées sont Q1 et Q2 du HC90 « dizaines ». */
function findMod60Q1Q2And(tensLabel, components, wires, autoJunctions = []) {
    const q1 = `${tensLabel}_Q1`;
    const q2 = `${tensLabel}_Q2`;
    return components.filter((comp) => {
        if (!isAndGate(comp)) return false;
        const inANet = reachableJonctions(`${comp.label}_inA`, wires, autoJunctions);
        const inBNet = reachableJonctions(`${comp.label}_inB`, wires, autoJunctions);
        return (inANet.has(q1) && inBNet.has(q2)) || (inANet.has(q2) && inBNet.has(q1));
    });
}

/**
 * Sortie d’une porte combinatoire (directe ou via d’autres portes) reliée à MR1/MR2.
 * Ex. AND(Q1,Q2) → ANDRST → MR (reset mod-60 complet).
 */
function combinatorialOutputDrivesMr(outputJid, mrJids, components, wires, autoJunctions = [], visited = new Set()) {
    const outNet = reachableJonctions(outputJid, wires, autoJunctions);
    for (const mr of mrJids) {
        if (outNet.has(mr)) return true;
    }
    for (const comp of components) {
        if (!isCombinatorialGate(comp)) continue;
        const inputs = gateInputJonctions(comp);
        if (!inputs.some((inJ) => outNet.has(inJ))) continue;
        if (visited.has(comp.label)) continue;
        visited.add(comp.label);
        if (combinatorialOutputDrivesMr(gateOutputJonction(comp), mrJids, components, wires, autoJunctions, visited)) {
            return true;
        }
    }
    return false;
}

/** Reset mod-60 : AND(Q1,Q2) du HC90 dizaines → MR (direct ou via portes intermédiaires). */
export function detectHc90Mod60Reset(tensLabel, components, wires, unitsLabel = null, autoJunctions = []) {
    if (!tensLabel) return false;
    const mrJids = hc90MrJonctions(tensLabel, unitsLabel);
    for (const andGate of findMod60Q1Q2And(tensLabel, components, wires, autoJunctions)) {
        if (combinatorialOutputDrivesMr(gateOutputJonction(andGate), mrJids, components, wires, autoJunctions)) {
            return true;
        }
    }
    return false;
}

/**
 * @returns {{
 *   mode: 'none'|'single'|'two_digit'|'multi',
 *   units: string|null,
 *   tens: string|null,
 *   clockSource: boolean,
 *   carryValid: boolean,
 *   carryKind: string,
 *   mod60: boolean
 * }}
 */
export function detectHc90Cascade(components, wires, autoJunctions = []) {
    const labels = hc90Labels(components);
    const clockOuts = clockOutJonctions(components);
    const hasClock = clockOuts.length > 0;

    if (labels.length === 0) {
        return { mode: "none", units: null, tens: null, clockSource: false, carryValid: false, carryKind: "none", mod60: false };
    }
    if (labels.length === 1) {
        const units = labels[0];
        const clocked = hasClock && cp0ClockedBySource(units, clockOuts, wires, autoJunctions);
        return {
            mode: "single",
            units,
            tens: null,
            clockSource: clocked,
            carryValid: true,
            carryKind: "single",
            mod60: false,
        };
    }
    if (labels.length > 2) {
        return { mode: "multi", units: null, tens: null, clockSource: hasClock, carryValid: false, carryKind: "unknown", mod60: false };
    }

    const [a, b] = labels;
    const aClock = cp0ClockedBySource(a, clockOuts, wires, autoJunctions);
    const bClock = cp0ClockedBySource(b, clockOuts, wires, autoJunctions);
    let units = null;
    let tens = null;
    if (aClock && !bClock) {
        units = a;
        tens = b;
    } else if (bClock && !aClock) {
        units = b;
        tens = a;
    } else {
        const carryAB = validateHc90Carry(a, b, components, wires, autoJunctions);
        const carryBA = validateHc90Carry(b, a, components, wires, autoJunctions);
        if (carryAB.valid && !carryBA.valid) {
            units = a;
            tens = b;
        } else if (carryBA.valid && !carryAB.valid) {
            units = b;
            tens = a;
        } else {
            return { mode: "multi", units: null, tens: null, clockSource: hasClock, carryValid: false, carryKind: "unknown", mod60: false };
        }
    }

    const carry = validateHc90Carry(units, tens, components, wires, autoJunctions);
    return {
        mode: "two_digit",
        units,
        tens,
        clockSource: true,
        carryValid: carry.valid,
        carryKind: carry.kind,
        mod60: detectHc90Mod60Reset(tens, components, wires, units, autoJunctions),
    };
}

/** Niveau logique haut sur une broche HC90 (logic_terminal à 1 ou VCC). */
function isHc90PinLogicHigh(pinJonctionId, components, wires, autoJunctions = []) {
    const net = reachableJonctions(pinJonctionId, wires, autoJunctions);
    for (const comp of components) {
        if (comp.type === "logic_terminal" && comp.label) {
            const out = `${comp.label}_out`;
            if (net.has(out) && Number(comp.state) === 1) return true;
        }
        if (comp.type === "vcc" && comp.label) {
            const out = `${comp.label}_out`;
            if (net.has(out)) return true;
        }
    }
    return false;
}

/**
 * Master reset actif : MR1 ET MR2 au niveau haut sur au moins un 74HC90.
 * (Broches reliées à la masse / logic_terminal à 0 → inactif.)
 */
export function isHc90MasterResetActive(components, wires, autoJunctions = []) {
    for (const comp of components) {
        if (comp.type !== "ic_74hc90" || !comp.label) continue;
        const mr1 = `${comp.label}_MR1`;
        const mr2 = `${comp.label}_MR2`;
        if (isHc90PinLogicHigh(mr1, components, wires, autoJunctions) && isHc90PinLogicHigh(mr2, components, wires, autoJunctions)) {
            return true;
        }
    }
    return false;
}

/** Nombre total de fronts horloge depuis t = 0 (1 impulsion GImp = +1). */
export function hc90PulseCount(elapsedSec, clockPeriodSec) {
    if (!(clockPeriodSec > 0) || !(elapsedSec >= 0)) return 0;
    return Math.floor(elapsedSec / clockPeriodSec);
}

/** Chiffre BCD 0–9 pour un HC90 donné (comptage idéal 0…99 ou 0…9). */
export function idealHc90BcdForLabel(compLabel, cascade, elapsedSec, clockPeriodSec) {
    if (!cascade || !compLabel || !(clockPeriodSec > 0)) return null;
    const pulses = hc90PulseCount(elapsedSec, clockPeriodSec);
    if (cascade.mode === "single" && compLabel === cascade.units) {
        return pulses % 10;
    }
    if (cascade.mode === "two_digit" && cascade.units && cascade.tens) {
        const mod = cascade.mod60 ? 60 : 100;
        const total = pulses % mod;
        if (compLabel === cascade.units) return total % 10;
        if (compLabel === cascade.tens) return Math.floor(total / 10) % 10;
    }
    return null;
}

/**
 * Temps .tran pour lire l’état après N impulsions (N = pulseInSpan).
 * pulseInSpan=0 → t=0 (affichage 0 après rollover 10/20/…/100).
 */
export function hc90TranSampleTimeSec(elapsedSec, clockPeriodSec, plotSpanSec, phase = 0.49) {
    if (!(clockPeriodSec > 0) || !(plotSpanSec > 0)) return elapsedSec;
    const totalPulses = hc90PulseCount(elapsedSec, clockPeriodSec);
    const pulsesPerSpan = Math.max(1, Math.floor(plotSpanSec / clockPeriodSec));
    const pulseInSpan = totalPulses % pulsesPerSpan;
    if (pulseInSpan === 0) return 0;
    return Math.min(
        plotSpanSec - 1e-12,
        (pulseInSpan - 1) * clockPeriodSec + clockPeriodSec * phase
    );
}

const CD4511_BCD_PINS = ["A", "B", "C", "D"];
const SEG7_SEG_PINS = ["a", "b", "c", "d", "e", "f", "g"];

/** HC90 dont Q0…Q3 alimentent un CD4511 relié à cet afficheur SEG. */
export function hc90LabelForSeg7(segLabel, components, wires, autoJunctions = []) {
    if (!segLabel) return null;
    for (const cd of components) {
        if (cd.type !== "cd4511" || !cd.label) continue;
        let segLinked = false;
        for (const s of SEG7_SEG_PINS) {
            const segPin = `${segLabel}_${s}`;
            const cdPin = `${cd.label}_${s}`;
            if (reachableJonctions(segPin, wires, autoJunctions).has(cdPin)) {
                segLinked = true;
                break;
            }
        }
        if (!segLinked) continue;
        for (const hc of components) {
            if (hc.type !== "ic_74hc90" || !hc.label) continue;
            let matched = 0;
            for (let i = 0; i < 4; i++) {
                const qNet = reachableJonctions(`${hc.label}_Q${i}`, wires, autoJunctions);
                const bcdPin = `${cd.label}_${CD4511_BCD_PINS[i]}`;
                if (qNet.has(bcdPin)) matched++;
            }
            if (matched >= 4) return hc.label;
        }
    }
    return null;
}

/** Animation fiable dès qu’un GImp horloge le HC90 unités (toute fréquence). */
export function shouldUseIdealHc90Counting(cascade, clockPeriodSec) {
    if (!cascade?.clockSource || !(clockPeriodSec > 0)) return false;
    if (cascade.mode === "two_digit" && cascade.units && cascade.tens) return true;
    if (cascade.mode === "single" && cascade.units) return true;
    return false;
}

const ENGINE_AND_TYPES = new Set(["and", "logic_and"]);
const ENGINE_COMB_TYPES = new Set([
    "and",
    "logic_and",
    "or",
    "logic_or",
    "nand",
    "logic_nand",
    "nor",
    "logic_nor",
]);

/** Graphe fils SPICE / moteur (clés terminal `id#pin`). */
export function reachableTerminalKeys(startKey, wires) {
    if (!startKey) return new Set();
    const visited = new Set([startKey]);
    const queue = [startKey];
    while (queue.length) {
        const key = queue.shift();
        for (const w of wires || []) {
            if (!w?.solid) continue;
            let next = null;
            if (w.fromKey === key) next = w.toKey;
            else if (w.toKey === key) next = w.fromKey;
            if (next && !visited.has(next)) {
                visited.add(next);
                queue.push(next);
            }
        }
    }
    return visited;
}

function isEngineAndGate(comp) {
    const id = comp?.id || comp?.label;
    return id && ENGINE_AND_TYPES.has(comp.type);
}

function isEngineCombGate(comp) {
    const id = comp?.id || comp?.label;
    return id && ENGINE_COMB_TYPES.has(comp.type);
}

function engineGateOutKey(comp) {
    const id = comp.id || comp.label;
    return `${id}#2`;
}

function engineGateInKeys(comp) {
    const id = comp.id || comp.label;
    return [`${id}#0`, `${id}#1`];
}

function findMod60Q1Q2AndKeys(tensId, components, wires) {
    const q1 = `${tensId}#${HC90_PIN_Q1}`;
    const q2 = `${tensId}#${HC90_PIN_Q2}`;
    return components.filter((comp) => {
        if (!isEngineAndGate(comp)) return false;
        const inANet = reachableTerminalKeys(`${comp.id || comp.label}#0`, wires);
        const inBNet = reachableTerminalKeys(`${comp.id || comp.label}#1`, wires);
        return (inANet.has(q1) && inBNet.has(q2)) || (inANet.has(q2) && inBNet.has(q1));
    });
}

function combinatorialKeyDrivesMr(outputKey, mrKeys, components, wires, visited = new Set()) {
    const outNet = reachableTerminalKeys(outputKey, wires);
    for (const mr of mrKeys) {
        if (outNet.has(mr)) return true;
    }
    for (const comp of components) {
        const id = comp.id || comp.label;
        if (!isEngineCombGate(comp)) continue;
        if (visited.has(id)) continue;
        if (!engineGateInKeys(comp).some((inK) => outNet.has(inK))) continue;
        visited.add(id);
        if (combinatorialKeyDrivesMr(engineGateOutKey(comp), mrKeys, components, wires, visited)) {
            return true;
        }
    }
    return false;
}

/** Détection mod-60 pour la netlist SPICE (clés `fromKey` / `toKey`). */
export function detectHc90Mod60FromGraphicalState(components, wires) {
    const hc90s = components.filter((c) => c.type === "ic_74hc90" && c.id);
    if (hc90s.length < 2) return false;
    const mrKeys = hc90s.flatMap((c) => [
        `${c.id}#${HC90_PIN_MR1}`,
        `${c.id}#${HC90_PIN_MR2}`,
    ]);
    for (const tens of hc90s) {
        for (const andGate of findMod60Q1Q2AndKeys(tens.id, components, wires)) {
            if (combinatorialKeyDrivesMr(engineGateOutKey(andGate), mrKeys, components, wires)) {
                return true;
            }
        }
    }
    return false;
}
