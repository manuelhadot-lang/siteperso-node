/**
 * Détection cascade HC90 + comptage idéal 0…99.
 * node Simulateur/Engine/hc90-cascade.test.mjs
 */
import {
    detectHc90Cascade,
    detectHc90Mod60Reset,
    hc90TranSampleTimeSec,
    idealHc90BcdForLabel,
    isHc90MasterResetActive,
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
assert(
    shouldUseIdealHc90Counting({ mode: "single", units: "HC90_1", clockSource: false }, 0.5),
    "idéal pour un seul HC90 même si CP0 non détecté"
);

assert(Math.abs(hc90TranSampleTimeSec(10, 1, 100) - 9.49) < 1e-9, "pulse 10 → t=9.49");
assert(Math.abs(hc90TranSampleTimeSec(100, 1, 100) - 99.49) < 1e-9, "pulse 100 → fin de span");
assert(hc90TranSampleTimeSec(0, 1, 24) === 0, "démarrage à 0");
assert(Math.abs(hc90TranSampleTimeSec(12, 0.5, 12) - 11.745) < 0.02, "pulse 24 → dernière impulsion du span");

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

const mrComps = [
    ...baseComps,
    { label: "MR1", type: "logic_terminal", state: 1 },
    { label: "MR2", type: "logic_terminal", state: 1 },
];
const mrWires = [
    ...goodWires,
    { fromJonctionId: "MR1_out", toJonctionId: "HC90_1_MR1" },
    { fromJonctionId: "MR2_out", toJonctionId: "HC90_1_MR2" },
    { fromJonctionId: "MR1_out", toJonctionId: "HC90_2_MR1" },
    { fromJonctionId: "MR2_out", toJonctionId: "HC90_2_MR2" },
];
assert(isHc90MasterResetActive(mrComps, mrWires), "MR1+MR2 à 1 → reset actif");
assert(!isHc90MasterResetActive(
    mrComps.map((c) => (c.label === "MR2" ? { ...c, state: 0 } : c)),
    mrWires
), "MR2 à 0 → reset inactif");

const mod60Comps = [...baseComps, { label: "AND_2", type: "and" }];
const mod60Wires = [
    ...goodWires,
    { fromJonctionId: "HC90_2_Q1", toJonctionId: "AND_2_inA" },
    { fromJonctionId: "HC90_2_Q2", toJonctionId: "AND_2_inB" },
    { fromJonctionId: "AND_2_out", toJonctionId: "HC90_2_MR1" },
    { fromJonctionId: "AND_2_out", toJonctionId: "HC90_2_MR2" },
];
const mod60Cascade = detectHc90Cascade(mod60Comps, mod60Wires);
assert(mod60Cascade.mod60, "mod60 détecté");
assert(detectHc90Mod60Reset("HC90_2", mod60Comps, mod60Wires), "AND Q1 Q2 → MR");
assert(idealHc90BcdForLabel("HC90_1", mod60Cascade, 59.5, period) === 9, "t=59.5 u");
assert(idealHc90BcdForLabel("HC90_2", mod60Cascade, 59.5, period) === 5, "t=59.5 d");
assert(idealHc90BcdForLabel("HC90_1", mod60Cascade, 60.5, period) === 0, "mod60 rollover u");
assert(idealHc90BcdForLabel("HC90_2", mod60Cascade, 60.5, period) === 0, "mod60 rollover d");

const mod60IndirectComps = [
    ...baseComps,
    { label: "AND_60", type: "and" },
    { label: "AND_NR", type: "and" },
    { label: "AND_RST", type: "and" },
    { label: "LOGIC_1", type: "logic_terminal", state: 1 },
];
const mod60IndirectWires = [
    ...goodWires,
    { fromJonctionId: "HC90_2_Q1", toJonctionId: "AND_60_inA" },
    { fromJonctionId: "HC90_2_Q2", toJonctionId: "AND_60_inB" },
    { fromJonctionId: "AND_60_out", toJonctionId: "AND_RST_inA" },
    { fromJonctionId: "LOGIC_1_out", toJonctionId: "AND_NR_inA" },
    { fromJonctionId: "LOGIC_1_out", toJonctionId: "AND_NR_inB" },
    { fromJonctionId: "AND_NR_out", toJonctionId: "AND_RST_inB" },
    { fromJonctionId: "AND_RST_out", toJonctionId: "HC90_2_MR1" },
    { fromJonctionId: "AND_RST_out", toJonctionId: "HC90_2_MR2" },
    { fromJonctionId: "AND_RST_out", toJonctionId: "HC90_1_MR1" },
    { fromJonctionId: "AND_RST_out", toJonctionId: "HC90_1_MR2" },
];
const mod60IndirectCascade = detectHc90Cascade(mod60IndirectComps, mod60IndirectWires);
assert(mod60IndirectCascade.mod60, "mod60 via AND intermédiaire");
assert(idealHc90BcdForLabel("HC90_2", mod60IndirectCascade, 59.5, period) === 5, "mod60 indirect t=59.5 d");
assert(idealHc90BcdForLabel("HC90_1", mod60IndirectCascade, 60.5, period) === 0, "mod60 indirect rollover u");

const tJuncComps = [
    { label: "GImp_1", type: "gimp" },
    { label: "HC90_U", type: "ic_74hc90" },
    { label: "HC90_D", type: "ic_74hc90" },
    { label: "AND_C", type: "and" },
    { label: "AND_R", type: "and" },
];
const tJuncAuto = [
    { id: "j_q0", x: 1660, y: 260 },
    { id: "j_q3", x: 1680, y: 320 },
    { id: "j_q1", x: 1000, y: 280 },
    { id: "j_q2", x: 980, y: 300 },
];
const tJuncWires = [
    { fromJonctionId: "GImp_1_out", toJonctionId: "HC90_U_CP0" },
    {
        fromJonctionId: "HC90_U_Q0",
        toJonctionId: "CD4511_X_A",
        points: [{ x: 1580, y: 260 }, { x: 1780, y: 260 }],
    },
    {
        fromJonctionId: "HC90_U_Q3",
        toJonctionId: "CD4511_X_D",
        points: [{ x: 1580, y: 320 }, { x: 1780, y: 320 }],
    },
    {
        fromJonctionId: "HC90_D_Q1",
        toJonctionId: "CD4511_Y_B",
        points: [{ x: 900, y: 280 }, { x: 1040, y: 280 }],
    },
    {
        fromJonctionId: "HC90_D_Q2",
        toJonctionId: "CD4511_Y_C",
        points: [{ x: 900, y: 300 }, { x: 1040, y: 300 }],
    },
    { fromJonctionId: "AND_C_inB", toJonctionId: "j_q0", points: [{ x: 1440, y: 640 }, { x: 1660, y: 260 }] },
    { fromJonctionId: "AND_C_inA", toJonctionId: "j_q3", points: [{ x: 1440, y: 680 }, { x: 1680, y: 320 }] },
    { fromJonctionId: "AND_C_out", toJonctionId: "HC90_D_CP0" },
    { fromJonctionId: "AND_R_inB", toJonctionId: "j_q1", points: [{ x: 860, y: 100 }, { x: 1000, y: 280 }] },
    { fromJonctionId: "AND_R_inA", toJonctionId: "j_q2", points: [{ x: 860, y: 140 }, { x: 980, y: 300 }] },
    { fromJonctionId: "AND_R_out", toJonctionId: "HC90_D_MR1" },
    { fromJonctionId: "HC90_D_MR2", toJonctionId: "HC90_D_MR1" },
];
const tJuncCascade = detectHc90Cascade(tJuncComps, tJuncWires, tJuncAuto);
assert(tJuncCascade.mod60, "mod60 via jonctions T");
assert(tJuncCascade.carryValid, "report via jonctions T");
assert(idealHc90BcdForLabel("HC90_U", tJuncCascade, 59.5, period) === 9, "jonction T t=59.5 u");
assert(idealHc90BcdForLabel("HC90_D", tJuncCascade, 59.5, period) === 5, "jonction T t=59.5 d");
assert(idealHc90BcdForLabel("HC90_U", tJuncCascade, 60.5, period) === 0, "jonction T rollover u");

console.log("hc90-cascade.test.mjs : OK");
