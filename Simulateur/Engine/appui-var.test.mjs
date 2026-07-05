import assert from "node:assert/strict";
import {
    createArduinoRuntime,
    stepArduinoRuntime,
    getRuntimeSerialTx,
} from "./arduino-sketch-parse.mjs";

const baseLoop = `
void setup() { Serial.begin(115200); pinMode(4, INPUT_PULLUP); }
void loop() {
  Serial.print("appui=");
  Serial.print(appui);
  Serial.print(" pin4=");
  Serial.println(digitalRead(4));
  delay(2000);
}
`;

const booleanSketch = `boolean appui = true;${baseLoop}`;
const intSketch = `int appui = 1;${baseLoop}`;

for (const [label, sketch, expectedInit] of [
    ["boolean", booleanSketch, 1],
    ["int", intSketch, 1],
]) {
    const rt = createArduinoRuntime({ type: "esp32_devkit", sketch });
    assert.equal(rt.state.vars.appui, expectedInit, `${label}: init vars.appui`);
    stepArduinoRuntime(rt, 100, { GPIO4: 1 });
    const tx = getRuntimeSerialTx(rt);
    assert.ok(tx.includes("appui=1"), `${label}: serial should show appui=1, got ${tx}`);
    console.log(`${label} OK: init=${rt.state.vars.appui} serial=${JSON.stringify(tx)}`);
}

console.log("all appui tests passed");
