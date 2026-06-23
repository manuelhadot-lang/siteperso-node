import assert from "node:assert/strict";
import { parseBmp280FromSketch, buildBmpVarBindingsFromBody, pressureToAltitude } from "./bmp280-sketch-parse.mjs";
import { buildBmpVarBindings, resolveBmpReadingsForBoard, resolveBmpPrintArg } from "./bmp280-ideal.mjs";

const sketch = `#include <Wire.h>
#include <Adafruit_BMP280.h>
Adafruit_BMP280 bmp;
void setup() {
  Wire.begin();
  bmp.begin(0x76);
}
void loop() {
  float t = bmp.readTemperature();
  float p = bmp.readPressure();
  float alt = bmp.readAltitude(1013.25);
  lcd.print(p);
}
`;

const parsed = parseBmp280FromSketch(sketch);
assert.equal(parsed?.varName, "bmp");
assert.equal(parsed?.i2cAddress, 0x76);

const alt = pressureToAltitude(1013.25, 101325);
assert.ok(Math.abs(alt) < 1, "niveau mer → altitude ~0");

const body = `float t = bmp.readTemperature();
float p = bmp.readPressure();
float alt = bmp.readAltitude(1013.25);`;
const bindings = buildBmpVarBindingsFromBody(body, "bmp", 22.5, 1018);
assert.equal(bindings.t, "22.5");
assert.equal(bindings.p, "1018");

const components = [
    { type: "arduino_uno", label: "UNO1", sketch, lastCompileOk: true },
    { type: "grove_bmp280", label: "BMP1", pressureHpa: 1008.2, temperature: 21.3, i2cAddress: 0x76 },
];
const wires = [
    { fromJonctionId: "BMP1_SDA", toJonctionId: "UNO1_A4" },
    { fromJonctionId: "BMP1_SCL", toJonctionId: "UNO1_A5" },
    { fromJonctionId: "BMP1_VCC", toJonctionId: "UNO1_5V" },
    { fromJonctionId: "BMP1_GND", toJonctionId: "UNO1_GND" },
];

const readings = resolveBmpReadingsForBoard(components[0], components, wires, []);
assert.equal(readings?.temperature, 21.3);
assert.equal(readings?.pressurePa, 100820);

const loopBindings = buildBmpVarBindings(body, sketch, "UNO1", components, wires, []);
assert.equal(loopBindings.p, "1008.2");
assert.equal(loopBindings.t, "21.3");

assert.equal(
    resolveBmpPrintArg("bmp.readPressure()", sketch, "UNO1", components, wires, []),
    "1008.2"
);

console.log("bmp280-sketch.test.mjs OK");
