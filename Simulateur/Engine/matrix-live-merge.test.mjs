import assert from "node:assert/strict";
import { applyArduinoSketchToComponent } from "./arduino-sketch-parse.mjs";
import {
    getIdealMatrix8x8FromArduino,
    multiplexScanHz,
    MATRIX_PERSISTENCE_MIN_HZ,
} from "./matrix-8x8-ideal.mjs";

function makeProg(delayMs) {
    return `const int rowPins[8] = { 2, 3, 4, 5, 6, 7, 8, 9 };
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
    for (int j = 0; j < 8; j++) digitalWrite(colPins[j], HIGH);
    digitalWrite(colPins[c], LOW);
    for (int r = 0; r < 8; r++) digitalWrite(rowPins[r], motif[r][c] ? HIGH : LOW);
    delay(${delayMs});
  }
}`;
}

const rowLabels = ["D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9"];
const colLabels = ["D10", "D11", "D12", "D13", "A0", "A1", "A2", "A3"];

function wiresFor(unoLabel = "UNO1", mxLabel = "MX1") {
    const wires = [];
    for (let r = 0; r < 8; r++) {
        wires.push({ fromJonctionId: `${unoLabel}_${rowLabels[r]}`, toJonctionId: `${mxLabel}_R${r}` });
    }
    for (let c = 0; c < 8; c++) {
        wires.push({ fromJonctionId: `${unoLabel}_${colLabels[c]}`, toJonctionId: `${mxLabel}_C${c}` });
    }
    return wires;
}

function runMatrix(delayMs, unoLabel, mxLabel) {
    const uno = { label: unoLabel, type: "arduino_uno", sketch: makeProg(delayMs), lastCompileOk: true };
    applyArduinoSketchToComponent(uno);
    uno.liveLevels = {
        D10: 0,
        D11: 1,
        D12: 1,
        D13: 1,
        A0: 1,
        A1: 1,
        A2: 1,
        A3: 1,
        D2: 0,
        D3: 1,
        D4: 1,
        D5: 1,
        D6: 1,
        D7: 1,
        D8: 1,
        D9: 1,
    };
    const comps = [uno, { label: mxLabel, type: "matrix_8x8" }];
    const hz = multiplexScanHz(comps);
    const ideal = getIdealMatrix8x8FromArduino(mxLabel, comps, wiresFor(unoLabel, mxLabel), 0);
    return { hz, ideal };
}

assert.equal(MATRIX_PERSISTENCE_MIN_HZ, 20);

// delay(3) → 8×3 ms = 24 ms → ~41,7 Hz ≥ 20 → image fixe
const fast = runMatrix(3, "UNO1", "MX1");
assert.ok(fast.hz >= 20, `delay(3) : ${fast.hz.toFixed(1)} Hz`);
assert.ok(fast.ideal?.cells?.r1c7, "delay(3) : motif complet");

// delay(6) → 48 ms → 20,8 Hz ≥ 20 → image fixe
const border = runMatrix(6, "UNO3", "MX3");
assert.ok(border.hz >= 20, `delay(6) : ${border.hz.toFixed(1)} Hz`);
assert.ok(border.ideal?.cells?.r1c7, "delay(6) : motif complet au seuil 20 Hz");

// delay(7) → 56 ms → ~17,9 Hz < 20 → balayage
const mid = runMatrix(7, "UNO4", "MX4");
assert.ok(mid.hz < 20, `delay(7) : ${mid.hz.toFixed(1)} Hz`);
assert.ok(mid.ideal?.cells?.r1c0, "delay(7) : colonne 0");
assert.equal(mid.ideal?.cells?.r1c7, false, "delay(7) : pas de fusion");

// delay(350) → balayage lent
const slow = runMatrix(350, "UNO2", "MX2");
assert.ok(slow.hz < 20);
assert.ok(slow.ideal?.cells?.r1c0, "delay(350) : colonne 0");
assert.equal(slow.ideal?.cells?.r1c7, false, "delay(350) : pas de fusion");

console.log("matrix-live-merge.test.mjs OK");
