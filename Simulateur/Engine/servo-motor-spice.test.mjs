/**
 * Servo moteur → résistance d'alimentation + broche signal (animation).
 * node Simulateur/Engine/servo-motor-spice.test.mjs
 */
import assert from "node:assert/strict";
import { buildNetlistFromGraphicalState } from "./schematic-to-spice.mjs";

const state = {
    components: [
        { id: "V1", type: "vsource", value: "5", x: 0, y: 0 },
        { id: "GND1", type: "ground", x: 0, y: 80 },
        { id: "SV1", type: "servo_motor", value: "100", x: 200, y: 0 },
        { id: "LOG1", type: "logic_state", value: "1", x: 200, y: -80 },
    ],
    wires: [
        { solid: true, fromKey: "V1#1", toKey: "SV1#1", points: [] },
        { solid: true, fromKey: "V1#0", toKey: "GND1#0", points: [] },
        { solid: true, fromKey: "SV1#0", toKey: "GND1#0", points: [] },
        { solid: true, fromKey: "LOG1#0", toKey: "SV1#2", points: [] },
        { solid: true, fromKey: "LOG1#0", toKey: "GND1#0", points: [] },
    ],
};

const built = buildNetlistFromGraphicalState(state);
assert.ok(built.ok, built.errors?.join("; "));
assert.match(built.netlist, /R_SV1.*100/);
console.log("servo-motor-spice.test.mjs OK");
