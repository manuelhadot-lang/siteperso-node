import assert from "node:assert/strict";
import {
    buildUartScopeModel,
    uartScopeBitAt,
    uartByteBits,
    uartCharDurationSec,
} from "./arduino-uart-wave.mjs";
import {
    findArduinoDriveForScopeChannel,
    synthesizeArduinoScopeTrace,
} from "./scope-arduino-ideal.mjs";
import { parseArduinoSketch, applyArduinoSketchToComponent } from "./arduino-sketch-parse.mjs";

assert.deepEqual(uartByteBits(0x41), [0, 1, 0, 0, 0, 0, 0, 1, 0, 1]);

const serialSketch = `void setup() { Serial.begin(9600); }
void loop() { Serial.println("A"); delay(1000); }`;

const uno = {
    id: "UNO1",
    type: "arduino_uno",
    label: "UNO1",
    sketch: serialSketch,
    ...parseArduinoSketch(serialSketch),
};
applyArduinoSketchToComponent(uno);
assert.equal(uno.pinModes.D1, "OUTPUT");

const model = buildUartScopeModel(uno);
assert.ok(model.schedule.length >= 2, "émissions UART attendues");
assert.equal(model.loopPeriodMs, 1000);
assert.equal(uartScopeBitAt(model, 0), 0);
const bitMs = 1000 / 9600;
assert.equal(uartScopeBitAt(model, bitMs * 1.5), 1);

const components = [uno, { type: "oscilloscope", label: "Osci1" }];
const wires = [{ fromJonctionId: "UNO1_D1", toJonctionId: "Osci1_CH1" }];
const drive = findArduinoDriveForScopeChannel("Osci1", "CH1", components, wires);
assert.equal(drive?.pinLabel, "D1");
assert.equal(drive?.uart, true);

const trace = synthesizeArduinoScopeTrace(uno, "D1", 0.01, 0);
const lows = trace.filter((p) => p.v < 0.5).length;
assert.ok(lows >= 2, `pics UART attendus, got ${lows}`);

console.log("arduino-uart-wave.test.mjs OK");
