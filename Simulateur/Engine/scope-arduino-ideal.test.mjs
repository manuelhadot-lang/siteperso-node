import assert from "node:assert/strict";
import { parseArduinoSketch, applyArduinoSketchToComponent } from "./arduino-sketch-parse.mjs";
import {
    findArduinoDriveForScopeChannel,
    synthesizeArduinoScopeTrace,
} from "./scope-arduino-ideal.mjs";

const blink = `void setup(){ pinMode(13, OUTPUT); }
void loop(){ digitalWrite(13,HIGH); delay(50); digitalWrite(13,LOW); delay(50); }`;

const uno = {
    id: "UNO1",
    type: "arduino_uno",
    label: "UNO1",
    sketch: blink,
    ...parseArduinoSketch(blink),
};
applyArduinoSketchToComponent(uno);

const components = [uno, { type: "oscilloscope", label: "Osci1" }];
const wires = [{ fromJonctionId: "UNO1_D13", toJonctionId: "Osci1_CH1" }];

const drive = findArduinoDriveForScopeChannel("Osci1", "CH1", components, wires);
assert.equal(drive?.pinLabel, "D13");

const trace = synthesizeArduinoScopeTrace(uno, "D13", 0.1, 0.15);
assert.ok(trace.length >= 64);
const highs = trace.filter((p) => p.v >= 4.5).length;
const lows = trace.filter((p) => p.v <= 0.5).length;
assert.ok(highs > 10, `niveaux hauts attendus, got ${highs}`);
assert.ok(lows > 10, `niveaux bas attendus, got ${lows}`);

const traceLater = synthesizeArduinoScopeTrace(uno, "D13", 0.1, 3.7);
assert.equal(trace.length, traceLater.length);
for (let i = 0; i < trace.length; i++) {
    assert.equal(trace[i].v, traceLater[i].v, `sync phase @ i=${i}`);
    assert.equal(trace[i].t, traceLater[i].t, `sync time @ i=${i}`);
}

console.log("scope-arduino-ideal.test.mjs OK");
