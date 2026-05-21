/**
 * wrdata 6 colonnes, 2 LED — la 1re LED ne doit pas lire la mauvaise colonne.
 * node Simulateur/Engine/wrdata-led-parse.test.mjs
 */
import { mergeLedTranPlotsFromWrdata } from "./v2/result-parser.mjs";

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

const waveTxt = `0 0 5 -0.01 0.01 0
0.5 0 5 -0.01 0.01 0
1 5 5 -0.01 0 0.02
1.5 5 5 -0.01 0 0.02
2 0 5 -0.01 0.01 0
`;

const meta = [
    { id: "LD3", timeCol: 0, wrVarCount: 4, currentWrIndex: 3, branch: "VIL_LD3" },
    { id: "LD4", timeCol: 0, wrVarCount: 5, currentWrIndex: 4, branch: "VIL_LD4" },
];

const plots = mergeLedTranPlotsFromWrdata(waveTxt, meta);
assert(plots.LD3?.current?.length === 5, "LD3 courbes");
assert(plots.LD4?.current?.length === 5, "LD4 courbes");
const peak3 = Math.max(...plots.LD3.current);
const peak4 = Math.max(...plots.LD4.current);
const min3 = Math.min(...plots.LD3.current);
const min4 = Math.min(...plots.LD4.current);
assert(peak3 > 0.005 && min3 < 0.001, `LD3 doit varier (min=${min3} max=${peak3})`);
assert(peak4 > 0.005 && min4 < 0.001, `LD4 doit varier (min=${min4} max=${peak4})`);
assert(Math.abs(plots.LD3.time[0]) < 1e-9, "temps colonne 0");

console.log("wrdata-led-parse.test.mjs : OK");
