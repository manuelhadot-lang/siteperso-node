import assert from "node:assert/strict";
import { parseTsl2591FromSketch, buildTslVarBindingsFromBody, luxToRawChannels } from "./tsl2591-sketch-parse.mjs";
import { parseGroveLcdFromSketch, resolveLcdDisplayAt } from "./grove-lcd-sketch-parse.mjs";
import { buildTslVarBindings, resolveTslReadingsForBoard, resolveTslPrintArg } from "./tsl2591-ideal.mjs";

const sketch = `#include <Wire.h>
#include <Adafruit_TSL2591.h>
#include <LiquidCrystal_I2C.h>

Adafruit_TSL2591 tsl = Adafruit_TSL2591(2591);
LiquidCrystal_I2C lcd(0x3E, 16, 2);

void setup() {
  tsl.begin();
  lcd.init();
}

void loop() {
  uint32_t lum = tsl.getFullLuminosity();
  uint16_t full = lum >> 16;
  uint16_t ir = lum & 0xFFFF;
  float lux = tsl.calculateLux(full, ir);
  lcd.setCursor(0, 0);
  lcd.print(lux);
}`;

const parsed = parseTsl2591FromSketch(sketch);
assert.equal(parsed?.varName, "tsl");
assert.equal(parsed?.i2cAddress, 0x29);

const { full, ir } = luxToRawChannels(250);
assert.ok(full > 0 && ir > 0);

const body = `uint32_t lum = tsl.getFullLuminosity();
uint16_t full = lum >> 16;
uint16_t ir = lum & 0xFFFF;
float lux = tsl.calculateLux(full, ir);`;
const bindings = buildTslVarBindingsFromBody(body, "tsl", 250, full, ir);
assert.equal(bindings.lux, "250");

const components = [
    { type: "arduino_uno", label: "UNO1", sketch, lastCompileOk: true },
    { type: "grove_tsl2591", label: "TSL1", lux: 320, i2cAddress: 0x29 },
    { type: "grove_lcd16x2", label: "LCD1" },
];
const wires = [
    { fromJonctionId: "TSL1_SDA", toJonctionId: "UNO1_A4" },
    { fromJonctionId: "TSL1_SCL", toJonctionId: "UNO1_A5" },
    { fromJonctionId: "TSL1_VCC", toJonctionId: "UNO1_5V" },
    { fromJonctionId: "TSL1_GND", toJonctionId: "UNO1_GND" },
    { fromJonctionId: "LCD1_SDA", toJonctionId: "UNO1_A4" },
    { fromJonctionId: "LCD1_SCL", toJonctionId: "UNO1_A5" },
    { fromJonctionId: "LCD1_VCC", toJonctionId: "UNO1_5V" },
    { fromJonctionId: "LCD1_GND", toJonctionId: "UNO1_GND" },
];

const readings = resolveTslReadingsForBoard(components[0], components, wires, []);
assert.equal(readings?.lux, 320);

const ctx = {
    resolveTsl: (arg) => resolveTslPrintArg(arg, sketch, "UNO1", components, wires, []),
    collectVarBindings: (body) => buildTslVarBindings(body, sketch, "UNO1", components, wires, []),
};

const lcdParsed = parseGroveLcdFromSketch(sketch, ctx);
assert.ok(lcdParsed, "LCD sketch parsed");
assert.equal(lcdParsed.loopVarBindings.lux, "320");

const display = resolveLcdDisplayAt(lcdParsed, 500, { ctx });
assert.ok(display?.lines[0].trim().startsWith("320"), `LCD line: ${JSON.stringify(display?.lines[0])}`);

console.log("tsl2591-sketch.test.mjs OK");
