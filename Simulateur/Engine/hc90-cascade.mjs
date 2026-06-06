/**
 * Détection chaîne 74HC90 (unités + dizaines) et comptage idéal pour l’animation.
 */

const CLOCK_SOURCE_TYPES = new Set(["gimp", "gsin", "gsqr"]);
const HC90_Q_RE = /^(.+)_Q([0-3])$/;

/** Jonctions reliées électriquement à startId (graphe non orienté). */
export function reachableJonctions(startId, wires) {
    if (!startId) return new Set();
    const visited = new Set([startId]);
    const queue = [startId];
    while (queue.length) {
        const jid = queue.shift();
        for (const w of wires || []) {
            let next = null;
            if (w.fromJonctionId === jid) next = w.toJonctionId;
            else if (w.toJonctionId === jid) next = w.fromJonctionId;
            if (next && !visited.has(next)) {
                visited.add(next);
                queue.push(next);
            }
        }
    }
    return visited;
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

function cp0ClockedBySource(label, clockOuts, wires) {
    const cp0 = `${label}_CP0`;
    const net = reachableJonctions(cp0, wires);
    return clockOuts.some((out) => net.has(out));
}

/** Report unités → dizaines : Q3 direct ou AND(Q0,Q3). */
export function validateHc90Carry(unitsLabel, tensLabel, components, wires) {
    const cp0Net = reachableJonctions(`${tensLabel}_CP0`, wires);
    const q0 = `${unitsLabel}_Q0`;
    const q3 = `${unitsLabel}_Q3`;
    if (cp0Net.has(q3) && !hasAndBetween(unitsLabel, tensLabel, components, wires)) {
        return { valid: true, kind: "q3" };
    }
    for (const comp of components) {
        if (comp.type !== "and" || !comp.label) continue;
        const out = `${comp.label}_out`;
        if (!cp0Net.has(out)) continue;
        const inANet = reachableJonctions(`${comp.label}_inA`, wires);
        const inBNet = reachableJonctions(`${comp.label}_inB`, wires);
        const okQ0Q3 =
            (inANet.has(q0) && inBNet.has(q3)) || (inANet.has(q3) && inBNet.has(q0));
        if (okQ0Q3) return { valid: true, kind: "and_q0_q3" };
    }
    return { valid: false, kind: "unknown" };
}

function hasAndBetween(unitsLabel, tensLabel, components, wires) {
    const cp0Net = reachableJonctions(`${tensLabel}_CP0`, wires);
    return components.some((c) => c.type === "and" && c.label && cp0Net.has(`${c.label}_out`));
}

/**
 * @returns {{
 *   mode: 'none'|'single'|'two_digit'|'multi',
 *   units: string|null,
 *   tens: string|null,
 *   clockSource: boolean,
 *   carryValid: boolean,
 *   carryKind: string
 * }}
 */
export function detectHc90Cascade(components, wires) {
    const labels = hc90Labels(components);
    const clockOuts = clockOutJonctions(components);
    const hasClock = clockOuts.length > 0;

    if (labels.length === 0) {
        return { mode: "none", units: null, tens: null, clockSource: false, carryValid: false, carryKind: "none" };
    }
    if (labels.length === 1) {
        const units = labels[0];
        const clocked = hasClock && cp0ClockedBySource(units, clockOuts, wires);
        return {
            mode: "single",
            units,
            tens: null,
            clockSource: clocked,
            carryValid: true,
            carryKind: "single",
        };
    }
    if (labels.length > 2) {
        return { mode: "multi", units: null, tens: null, clockSource: hasClock, carryValid: false, carryKind: "unknown" };
    }

    const [a, b] = labels;
    const aClock = cp0ClockedBySource(a, clockOuts, wires);
    const bClock = cp0ClockedBySource(b, clockOuts, wires);
    let units = null;
    let tens = null;
    if (aClock && !bClock) {
        units = a;
        tens = b;
    } else if (bClock && !aClock) {
        units = b;
        tens = a;
    } else {
        return { mode: "multi", units: null, tens: null, clockSource: hasClock, carryValid: false, carryKind: "unknown" };
    }

    const carry = validateHc90Carry(units, tens, components, wires);
    return {
        mode: "two_digit",
        units,
        tens,
        clockSource: true,
        carryValid: carry.valid,
        carryKind: carry.kind,
    };
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
        const total = pulses % 100;
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

/** Animation fiable dès qu’un GImp horloge le HC90 unités (toute fréquence). */
export function shouldUseIdealHc90Counting(cascade, clockPeriodSec) {
    if (!cascade?.clockSource || !(clockPeriodSec > 0)) return false;
    if (cascade.mode === "two_digit" && cascade.units && cascade.tens) return true;
    if (cascade.mode === "single" && cascade.units) return true;
    return false;
}
