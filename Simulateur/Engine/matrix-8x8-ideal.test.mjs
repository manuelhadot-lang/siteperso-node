import assert from "node:assert/strict";
import { applyArduinoSketchToComponent } from "./arduino-sketch-parse.mjs";
import { getIdealMatrix8x8FromArduino } from "./matrix-8x8-ideal.mjs";

const sketch = `void setup(){ DDRD=0b00000001; } void loop(){ PORTD=1; }`;
const uno = { label: "UNO1", type: "arduino_uno", sketch };
applyArduinoSketchToComponent(uno);

const comps = [uno, { label: "MX1", type: "matrix_8x8" }, { label: "GND1", type: "gnd" }];
const wires = [
    { fromJonctionId: "UNO1_D0", toJonctionId: "MX1_R0" },
    { fromJonctionId: "MX1_C0", toJonctionId: "GND1_out" },
];

const ideal = getIdealMatrix8x8FromArduino("MX1", comps, wires);
assert.ok(ideal?.cells?.r0c0, "r0c0 allumé (R0 haut, C0 bas)");
assert.equal(ideal?.cells?.r0c1, false, "r0c1 éteint");
assert.equal(ideal?.cells?.r1c0, false, "r1c0 éteint");

console.log("matrix-8x8-ideal.test.mjs OK");
