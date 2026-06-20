import assert from "node:assert/strict";
import { parseArduinoSketch } from "./arduino-sketch-parse.mjs";
import { buildNetlistFromGraphicalState } from "./schematic-to-spice.mjs";

const sketch = `void setup(){ DDRD=0xFF; PORTD=0xFF; }
void loop(){ PORTD=PORTD/2; delay(100); }`;
const parsed = parseArduinoSketch(sketch);

const components = [
    { id: "UNO1", type: "arduino_uno", label: "UNO1", sketch, ...parsed },
    { id: "BAR1", type: "bargraph_dc10h", label: "BAR1" },
];
const built = buildNetlistFromGraphicalState({ components, wires: [] }, { quickTran: true });
assert.equal(built.ok, true);
assert.equal(built.analysisTran, false, "UNO+bargraph : pas de .tran");
assert.match(built.netlist, /\.op\b/);
assert.ok(
    built.warnings.some((w) => /temps réel/i.test(w)),
    "avertissement animation temps réel"
);

console.log("arduino-ideal-only.test.mjs OK");
