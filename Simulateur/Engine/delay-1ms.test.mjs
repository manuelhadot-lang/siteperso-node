import assert from "node:assert/strict";
import {
    createArduinoRuntime,
    stepArduinoRuntime,
    parseArduinoSketch,
} from "./arduino-sketch-parse.mjs";

const delayLoop = `void setup() {}
void loop() {
  delay(1);
}`;

const rt = createArduinoRuntime({ type: "arduino_uno", sketch: delayLoop });
stepArduinoRuntime(rt, 0, {});
stepArduinoRuntime(rt, 1, {});
assert.equal(rt.state.simTimeMs, 1, "delay(1) avance simTimeMs de 1 ms");
stepArduinoRuntime(rt, 1, {});
assert.equal(rt.state.simTimeMs, 2, "deuxième delay(1)");

const matrixLoop = `const int colPins[8] = { 10, 11, 12, 13, A0, A1, A2, A3 };
void setup() {}
void loop() {
  for (int c = 0; c < 8; c++) {
    digitalWrite(colPins[c], LOW);
    delay(1);
  }
}`;
const mxParsed = parseArduinoSketch(matrixLoop);
assert.ok(mxParsed.pinPhases?.length >= 8, "8 colonnes × delay(1)");
assert.equal(mxParsed.pinPhases[0].durationMs, 1, "chaque phase = 1 ms");

console.log("delay-1ms.test.mjs OK");
