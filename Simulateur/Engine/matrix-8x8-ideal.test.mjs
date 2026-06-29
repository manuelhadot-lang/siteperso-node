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

const prog1 = `const int rowPins[8] = { 2, 3, 4, 5, 6, 7, 8, 9 };
const int colPins[8] = { 10, 11, 12, 13, A0, A1, A2, A3 };
void setup() {
  for (int i = 0; i < 8; i++) {
    pinMode(rowPins[i], OUTPUT);
    pinMode(colPins[i], OUTPUT);
    digitalWrite(rowPins[i], LOW);
    digitalWrite(colPins[i], HIGH);
  }
}
void loop() {
  digitalWrite(colPins[0], LOW);
  digitalWrite(rowPins[0], HIGH);
  delay(500);
  digitalWrite(rowPins[0], LOW);
  digitalWrite(colPins[0], HIGH);
  delay(500);
}`;
const unoMx = { label: "UNO2", type: "arduino_uno", sketch: prog1 };
applyArduinoSketchToComponent(unoMx);
const mxWires = [
    { fromJonctionId: "UNO2_D2", toJonctionId: "MX2_R0" },
    { fromJonctionId: "UNO2_D10", toJonctionId: "MX2_C0" },
];
const mxComps = [unoMx, { label: "MX2", type: "matrix_8x8" }];
const mxIdeal = getIdealMatrix8x8FromArduino("MX2", mxComps, mxWires, 0);
assert.ok(mxIdeal?.cells?.r0c0, "prog1 tableau : r0c0 allumé phase 0");
assert.ok(unoMx.pinModes?.D2 === "OUTPUT" && unoMx.pinModes?.D10 === "OUTPUT", "D2/D10 en sortie");

console.log("matrix-8x8-ideal.test.mjs OK");
