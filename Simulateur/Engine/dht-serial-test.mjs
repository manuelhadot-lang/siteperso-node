import assert from "node:assert/strict";
import { compileArduinoSketch } from "../../tools/arduino-api.cjs";
import {
    createArduinoRuntime,
    stepArduinoRuntime,
    getRuntimeSerialTx,
} from "./arduino-sketch-parse.mjs";
import { resolveDhtReadingsForBoard } from "./dht22-ideal.mjs";

const sketch = `#include <Wire.h>
#include <DHT.h>
DHT dht(2, DHT22);
void setup() {
  Serial.begin(9600);
  dht.begin();
}
void loop() {
  float temp = dht.readTemperature();
  Serial.println(temp);
  delay(1000);
}`;

const esp = { type: "esp32_c3", label: "ESP1", sketch };
const components = [
    esp,
    { type: "grove_dht22", label: "DHT1", temperature: 26.5, humidity: 61 },
    { type: "vcc", label: "VCC1" },
    { type: "gnd", label: "GND1" },
];
const wires = [
    { fromJonctionId: "DHT1_DATA", toJonctionId: "ESP1_GPIO2" },
    { fromJonctionId: "DHT1_VCC", toJonctionId: "VCC1_out" },
    { fromJonctionId: "DHT1_GND", toJonctionId: "GND1_out" },
];

const dht = resolveDhtReadingsForBoard(esp, components, wires, []);
assert.ok(dht, "DHT wired");
assert.equal(dht.temperature, 26.5);

const rt = createArduinoRuntime(esp);
rt.state.dhtReadings = dht;
stepArduinoRuntime(rt, 0, {}, {});
stepArduinoRuntime(rt, 5000, {}, {});
const tx = getRuntimeSerialTx(rt);
assert.match(tx, /26\.5/, `serial should show temp, got: ${tx}`);

console.log("dht-serial-test.mjs OK");
