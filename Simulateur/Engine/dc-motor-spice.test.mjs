/**
 * Moteur DC → résistance SPICE entre + et −.
 * node Simulateur/Engine/dc-motor-spice.test.mjs
 */
import assert from "node:assert/strict";
import { buildNetlistFromGraphicalState } from "./schematic-to-spice.mjs";

const state = {
    components: [
        { id: "V1", type: "vsource", value: "9", x: 0, y: 0 },
        { id: "GND1", type: "ground", x: 0, y: 80 },
        { id: "M1", type: "dc_motor", value: "50", x: 200, y: 0 },
    ],
    wires: [
        { solid: true, fromKey: "V1#1", toKey: "M1#1", points: [] },
        { solid: true, fromKey: "V1#0", toKey: "GND1#0", points: [] },
        { solid: true, fromKey: "M1#0", toKey: "GND1#0", points: [] },
    ],
};

const built = buildNetlistFromGraphicalState(state);
assert.ok(built.ok, built.errors?.join("; "));
assert.match(built.netlist, /R_M1.*50/);
console.log("dc-motor-spice.test.mjs OK");
