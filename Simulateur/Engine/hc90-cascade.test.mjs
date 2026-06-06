/**
 * Détection cascade HC90 + comptage idéal 0…99.
 * node Simulateur/Engine/hc90-cascade.test.mjs
 */
import {
    detectHc90Cascade,
    hc90TranSampleTimeSec,
    idealHc90BcdForLabel,
    shouldUseIdealHc90Counting,
    validateHc90Carry,
} from "./hc90-cascade.mjs";

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

const baseComps = [
    { label: "GImp_1", type: "gimp", frequency: 1 },
    { label: "HC90_1", type: "ic_74hc90" },
    { label: "HC90_2", type: "ic_74hc90" },
    { label: "AND_1", type: "and" },
];

const goodWires = [
    { fromJonctionId: "GImp_1_out", toJonctionId: "HC90_1_CP0" },
    { fromJonctionId: "HC90_1_Q0", toJonctionId: "AND_1_inA" },
    { fromJonctionId: "HC90_1_Q3", toJonctionId: "AND_1_inB" },
    { fromJonctionId: "AND_1_out", toJonctionId: "HC90_2_CP0" },
];

const cascade = detectHc90Cascade(baseComps, goodWires);
assert(cascade.mode === "two_digit", "mode two_digit");
assert(cascade.units === "HC90_1", "unités");
assert(cascade.tens === "HC90_2", "dizaines");
assert(cascade.carryValid, "report valide");
assert(cascade.carryKind === "and_q0_q3", "AND Q0 Q3");

assert(shouldUseIdealHc90Counting(cascade, 1), "idéal à 1 Hz");

assert(Math.abs(hc90TranSampleTimeSec(10, 1, 100) - 9.49) < 1e-9, "pulse 10 → t=9.49");
assert(hc90TranSampleTimeSec(100, 1, 100) === 0, "pulse 100 → t=0 (rollover 00)");
assert(hc90TranSampleTimeSec(0, 1, 24) === 0, "démarrage à 0");

const badWires = [
    { fromJonctionId: "GImp_1_out", toJonctionId: "HC90_1_CP0" },
    { fromJonctionId: "HC90_1_Q1", toJonctionId: "AND_1_inA" },
    { fromJonctionId: "HC90_1_Q3", toJonctionId: "AND_1_inB" },
    { fromJonctionId: "AND_1_out", toJonctionId: "HC90_2_CP0" },
];
const badCascade = detectHc90Cascade(baseComps, badWires);
assert(badCascade.carryValid === false, "Q1+Q3 invalide");
assert(shouldUseIdealHc90Counting(badCascade, 1), "idéal même si report invalide");

const period = 1;
assert(idealHc90BcdForLabel("HC90_1", cascade, 0.5, period) === 0, "t=0.5 u");
assert(idealHc90BcdForLabel("HC90_2", cascade, 0.5, period) === 0, "t=0.5 d");
assert(idealHc90BcdForLabel("HC90_1", cascade, 9.5, period) === 9, "t=9.5 u");
assert(idealHc90BcdForLabel("HC90_2", cascade, 9.5, period) === 0, "t=9.5 d");
assert(idealHc90BcdForLabel("HC90_2", cascade, 10.5, period) === 1, "t=10.5 d");
assert(idealHc90BcdForLabel("HC90_1", cascade, 99.5, period) === 9, "t=99.5 u");
assert(idealHc90BcdForLabel("HC90_2", cascade, 99.5, period) === 9, "t=99.5 d");
assert(idealHc90BcdForLabel("HC90_1", cascade, 100.5, period) === 0, "rollover u");
assert(idealHc90BcdForLabel("HC90_2", cascade, 100.5, period) === 0, "rollover d");

const carry = validateHc90Carry("HC90_1", "HC90_2", baseComps, goodWires);
assert(carry.valid && carry.kind === "and_q0_q3", "validate carry");

console.log("hc90-cascade.test.mjs : OK");
