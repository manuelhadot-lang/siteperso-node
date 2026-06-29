import assert from "node:assert/strict";
import { applyArduinoSketchToComponent } from "./arduino-sketch-parse.mjs";
import { getIdealMatrix8x8FromArduino } from "./matrix-8x8-ideal.mjs";

const prog2 = `const int rowPins[8] = { 2, 3, 4, 5, 6, 7, 8, 9 };
const int colPins[8] = { 10, 11, 12, 13, A0, A1, A2, A3 };
const byte motif[8][8] = {
  { 0, 1, 1, 0, 0, 1, 1, 0 },
  { 1, 1, 1, 1, 1, 1, 1, 1 },
  { 1, 1, 1, 1, 1, 1, 1, 1 },
  { 1, 1, 1, 1, 1, 1, 1, 1 },
  { 0, 1, 1, 1, 1, 1, 1, 0 },
  { 0, 0, 1, 1, 1, 1, 0, 0 },
  { 0, 0, 0, 1, 1, 0, 0, 0 },
  { 0, 0, 0, 0, 0, 0, 0, 0 },
};
void setup() {
  for (int i = 0; i < 8; i++) {
    pinMode(rowPins[i], OUTPUT);
    pinMode(colPins[i], OUTPUT);
  }
}
void loop() {
  for (int c = 0; c < 8; c++) {
    for (int j = 0; j < 8; j++) {
      digitalWrite(colPins[j], HIGH);
    }
    digitalWrite(colPins[c], LOW);
    for (int r = 0; r < 8; r++) {
      digitalWrite(rowPins[r], motif[r][c] ? HIGH : LOW);
    }
    delay(3);
  }
}`;

const rowLabels = ["D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9"];
const colLabels = ["D10", "D11", "D12", "D13", "A0", "A1", "A2", "A3"];

const uno = { label: "UNO1", type: "arduino_uno", sketch: prog2, lastCompileOk: true };
applyArduinoSketchToComponent(uno);

assert.ok(uno.pinPhases?.length >= 8, "multiplex : au moins 8 phases delay(3)");
assert.equal(uno.pinModes?.D2, "OUTPUT", "R0/D2 sortie");
assert.equal(uno.pinModes?.D10, "OUTPUT", "C0/D10 sortie");

const wires = [];
for (let r = 0; r < 8; r++) {
    wires.push({ fromJonctionId: `UNO1_${rowLabels[r]}`, toJonctionId: `MX1_R${r}` });
}
for (let c = 0; c < 8; c++) {
    wires.push({ fromJonctionId: `UNO1_${colLabels[c]}`, toJonctionId: `MX1_C${c}` });
}

const ideal = getIdealMatrix8x8FromArduino("MX1", [uno, { label: "MX1", type: "matrix_8x8" }], wires, 0);
assert.ok(ideal?.anyLit, "motif cœur visible");
assert.ok(ideal?.cells?.r1c0, "cœur : r1c0 allumé");
assert.ok(ideal?.cells?.r1c7, "cœur : r1c7 allumé");
assert.equal(ideal?.cells?.r7c3, false, "bas du cœur éteint");

console.log("matrix-prog2.test.mjs OK");
