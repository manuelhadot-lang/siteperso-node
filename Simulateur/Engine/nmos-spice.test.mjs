/**
 * MOSFET IRLZ44N — netlist SPICE.
 * node Simulateur/Engine/nmos-spice.test.mjs
 */
import assert from "node:assert/strict";
import { appendNmosNetlist, nmosModelLines, spiceMosfetModelName } from "./nmos.mjs";
import { buildNetlistFromGraphicalState } from "./schematic-to-spice.mjs";

assert.equal(spiceMosfetModelName("IRLZ44N"), "IRLZ44N");
assert.ok(nmosModelLines("IRLZ44N", "IRLZ44N").includes("NMOS"));

const lines = [];
const declared = new Set();
appendNmosNetlist(
    { id: "M1", value: "IRLZ44N" },
    {
        nodeFor: (k) => k.replace("#", "_"),
        lines,
        declaredMosfetModels: declared,
        spiceBranchName: (p, id) => `${p}${id}`,
    }
);
assert.ok(lines.some((l) => l.includes(".model IRLZ44N NMOS")), lines.join("\n"));
assert.ok(lines.some((l) => l.startsWith("MM1 ")), lines.join("\n"));

const built = buildNetlistFromGraphicalState({
    components: [
        { id: "V1", type: "vsource", value: "5", x: 0, y: 0 },
        { id: "GND1", type: "ground", x: 0, y: 80 },
        { id: "M1", type: "nmos", value: "IRLZ44N", x: 200, y: 0 },
        { id: "R1", type: "resistor", value: "10k", x: 400, y: 0 },
    ],
    wires: [
        { solid: true, fromKey: "V1#1", toKey: "M1#1", points: [] },
        { solid: true, fromKey: "V1#0", toKey: "GND1#0", points: [] },
        { solid: true, fromKey: "M1#2", toKey: "GND1#0", points: [] },
        { solid: true, fromKey: "M1#0", toKey: "R1#0", points: [] },
        { solid: true, fromKey: "R1#1", toKey: "GND1#0", points: [] },
    ],
});
assert.ok(built.ok, built.errors?.join("; "));
assert.match(built.netlist, /\.model IRLZ44N NMOS/);
assert.match(built.netlist, /M_M1\s+\S+\s+\S+\s+\S+\s+\S+\s+IRLZ44N/);

console.log("nmos-spice.test.mjs OK");
