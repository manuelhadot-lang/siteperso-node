/**
 * Parser diagramme de Bode (wrdata .ac synthétique).
 * node Simulateur/Engine/bode-ac-parse.test.mjs
 */
import { mergeBodePlotsFromAcWrdata, computeCutoffFrequencies } from "./v2/result-parser.mjs";

function assert(cond, msg) {
    if (!cond) throw new Error(`FAIL: ${msg}`);
}

// RC passe-bas théorique : fc ≈ 1.59 kHz pour R=1k, C=100n
// Format wrdata ngspice .ac : freq, puis par vecteur (freq_dup, valeur)
const waveTxt = `1.000000e+01 1.000000e+01 0.000000e+00 1.000000e+01 0.000000e+00 1.000000e+01 0.000000e+00 1.000000e+01 0.000000e+00 1.000000e+01 0.000000e+00
1.000000e+02 1.000000e+02 0.000000e+00 1.000000e+02 0.000000e+00 1.000000e+02 0.000000e+00 1.000000e+02 0.000000e+00 1.000000e+02 0.000000e+00
1.000000e+03 1.000000e+03 0.000000e+00 1.000000e+03 -0.043651e+00 1.000000e+03 0.000000e+00 1.000000e+03 0.000000e+00 1.000000e+03 0.000000e+00
1.592000e+03 1.592000e+03 0.000000e+00 1.592000e+03 -3.010300e+00 1.592000e+03 0.000000e+00 1.592000e+03 0.000000e+00 1.592000e+03 0.000000e+00
1.000000e+04 1.000000e+04 0.000000e+00 1.000000e+04 -13.975000e+00 1.000000e+04 0.000000e+00 1.000000e+04 0.000000e+00 1.000000e+04 0.000000e+00
`;

const meta = [{
    id: "Bode_1",
    freqCol: 0,
    fMin: 10,
    fMax: 10000,
    outPlus: { dbCol: 4, phCol: 6, isGnd: false },
    outMinus: { isGnd: true },
    inPlus: { dbCol: 8, phCol: 10, isGnd: false },
    inMinus: { isGnd: true },
}];

const plots = mergeBodePlotsFromAcWrdata(waveTxt, meta);
assert(plots.Bode_1, "plot Bode_1");
assert(plots.Bode_1.frequency.length >= 4, "assez de points");
assert(plots.Bode_1.gainDb[0] < 0.1, "gain basse fréquence ~0 dB");
assert(plots.Bode_1.cutoffHz.length >= 1, "fc détectée");
assert(Math.abs(plots.Bode_1.cutoffHz[0] - 1592) < 50, `fc ≈ 1.59 kHz (got ${plots.Bode_1.cutoffHz[0]})`);

const fc = computeCutoffFrequencies([10, 100, 1000, 1592, 10000], [0, 0, -0.04, -3.01, -14]);
assert(fc.length === 1, "une coupure");
assert(Math.abs(fc[0] - 1592) < 5, "interpolation fc");

console.log("bode-ac-parse.test.mjs : OK");
