import assert from "node:assert/strict";
import { parseArduinoSketch } from "./arduino-sketch-parse.mjs";
import { appendArduinoUnoNetlist } from "./arduino-uno.mjs";

const sketch = `void setup(){ pinMode(13, OUTPUT); }
void loop(){ digitalWrite(13,HIGH); delay(500); digitalWrite(13,LOW); delay(500); }`;
const parsed = parseArduinoSketch(sketch);
const comp = { id: "UNO1", type: "arduino_uno", ...parsed };
const lines = [];
appendArduinoUnoNetlist(comp, (k) => k.replace("#", "_"), lines, (p, id) => `${p}${id}`);
const d13 = lines.find((l) => /UNO1_D13.*PULSE/i.test(l));
assert.ok(d13, `D13 PULSE attendu, lignes:\n${lines.join("\n")}`);
assert.match(d13, /PULSE\(0 5 0 1n 1n 500\.000m 1\)/);
console.log("arduino-uno-blink-netlist.test.mjs OK");
