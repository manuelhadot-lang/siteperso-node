/**
 * Animation idéale compteur ripple mod-10.
 * node Simulateur/Engine/ripple-mod10.test.mjs
 */
import {
    detectRippleMod10ForAnim,
    idealRippleMod10Bcd,
    rippleMod10Seg7Linked,
    shouldUseIdealRippleMod10Seg7,
} from "./ripple-mod10.mjs";

function w(fromJon, toJon) {
    return { fromJonctionId: fromJon, toJonctionId: toJon, solid: true, points: [] };
}

const components = [
    { type: "gimp", label: "GImp_1", frequency: 2 },
    { type: "d_flipflop", label: "DFF_1" },
    { type: "d_flipflop", label: "DFF_2" },
    { type: "d_flipflop", label: "DFF_3" },
    { type: "d_flipflop", label: "DFF_4" },
    { type: "and", label: "AND_1" },
    { type: "cd4511", label: "CD4511_1" },
    { type: "seg7", label: "SEG_1" },
];

const wires = [
    w("GImp_1_out", "DFF_1_CLK"),
    w("DFF_1_Qbar", "DFF_2_CLK"),
    w("DFF_2_Qbar", "DFF_3_CLK"),
    w("DFF_3_Qbar", "DFF_4_CLK"),
    w("DFF_2_Q", "AND_1_inA"),
    w("DFF_4_Q", "AND_1_inB"),
    w("AND_1_out", "DFF_1_RESET"),
    w("AND_1_out", "DFF_2_RESET"),
    w("AND_1_out", "DFF_3_RESET"),
    w("AND_1_out", "DFF_4_RESET"),
    w("DFF_1_Q", "CD4511_1_A"),
    w("DFF_2_Q", "CD4511_1_B"),
    w("DFF_3_Q", "CD4511_1_C"),
    w("DFF_4_Q", "CD4511_1_D"),
    w("CD4511_1_a", "SEG_1_a"),
    w("CD4511_1_b", "SEG_1_b"),
    w("CD4511_1_c", "SEG_1_c"),
    w("CD4511_1_d", "SEG_1_d"),
    w("CD4511_1_e", "SEG_1_e"),
    w("CD4511_1_f", "SEG_1_f"),
    w("CD4511_1_g", "SEG_1_g"),
];

if (!detectRippleMod10ForAnim(components, wires)) throw new Error("détection mod-10");
if (!rippleMod10Seg7Linked("SEG_1", components, wires)) throw new Error("liaison SEG7");
if (!shouldUseIdealRippleMod10Seg7("SEG_1", components, wires, [], 0.5)) {
    throw new Error("ideal seg7");
}

const period = 0.5;
for (let p = 0; p < 25; p++) {
    const expect = p % 10;
    const got = idealRippleMod10Bcd(p * period + 0.01, period);
    if (got !== expect) throw new Error(`pulse ${p} : attendu ${expect}, vu ${got}`);
}

console.log("ripple-mod10.test.mjs : OK");
