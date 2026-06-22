import assert from "node:assert/strict";
import { parseDht22FromSketch, buildDhtVarBindingsFromBody } from "./dht22-sketch-parse.mjs";
import { parseGroveLcdFromSketch, resolveLcdDisplayAt } from "./grove-lcd-sketch-parse.mjs";
import { buildDhtVarBindings } from "./dht22-ideal.mjs";

const sketch = `#include <DHT.h>
#include <Wire.h>
#include <rgb_lcd.h>

rgb_lcd lcd;

#define DHTPIN 2
#define DHTTYPE DHT22

DHT dht(DHTPIN, DHTTYPE);

void setup() 
{ 
  dht.begin();
  lcd.begin(16,2);
}

void loop() 
{
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  lcd.setCursor(0,0);
  lcd.print(t);
}`;

const parsedDht = parseDht22FromSketch(sketch);
assert.equal(parsedDht.pinLabel, "D2", "DHTPIN 2 -> D2");

const components = [
    { type: "arduino_uno", label: "UNO1", sketch, lastCompileOk: true },
    { type: "grove_dht22", label: "DHT1", temperature: 26.3, humidity: 61 },
    { type: "grove_lcd16x2", label: "LCD1" },
];
const wires = [
    { fromJonctionId: "DHT1_DATA", toJonctionId: "UNO1_D2" },
    { fromJonctionId: "DHT1_VCC", toJonctionId: "UNO1_5V" },
    { fromJonctionId: "DHT1_GND", toJonctionId: "UNO1_GND" },
];
const autoJunctions = [];

const bindings = buildDhtVarBindingsFromBody(
    `float t = dht.readTemperature(); float h = dht.readHumidity();`,
    "dht",
    26.3,
    61
);
assert.equal(bindings.t, "26.3");
assert.equal(bindings.h, "61");

const ctx = {
    resolveDht: (arg) => null,
    collectVarBindings: (body) => buildDhtVarBindings(body, sketch, "UNO1", components, wires, autoJunctions),
};

const parsed = parseGroveLcdFromSketch(sketch, ctx);
assert.ok(parsed, "LCD sketch parsed");
assert.equal(parsed.loopVarBindings.t, "26.3");

const display = resolveLcdDisplayAt(parsed, 100, { ctx });
assert.ok(/^26[.,]3/.test(display?.lines[0].trim()), `LCD shows temp, got: "${display?.lines[0]}"`);

console.log("dht22-lcd-sketch.test.mjs OK");
