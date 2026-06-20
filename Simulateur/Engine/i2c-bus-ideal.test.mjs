import assert from "node:assert/strict";
import { parseGroveLcdFromSketch } from "./grove-lcd-sketch-parse.mjs";
import { appendArduinoUnoNetlist } from "./arduino-uno.mjs";
import { annotateUnoI2cBusEngine, sketchUsesI2cLcd } from "./i2c-bus-ideal.mjs";
import { buildNetlistFromGraphicalState } from "./schematic-to-spice.mjs";

const sketch = `#include <Wire.h>
#include <LiquidCrystal_I2C.h>
LiquidCrystal_I2C lcd(0x3E, 16, 2);
void setup() {
  lcd.init();
  lcd.backlight();
  lcd.print("Hello Grove!");
}
void loop() {}
`;

assert.ok(sketchUsesI2cLcd(sketch));

const components = [
    { id: "UNO1", type: "arduino_uno", sketch, x: 0, y: 0 },
    { id: "LCD1", type: "grove_lcd16x2", i2cAddress: 0x3e, x: 100, y: 0 },
    { id: "GND1", type: "ground", x: 0, y: 50 },
    { id: "Osci1", type: "oscilloscope", timeDivSec: 50e-6, x: 200, y: 0 },
];
const wires = [
    { solid: true, fromKey: "LCD1#0", toKey: "UNO1#11", points: [] },
    { solid: true, fromKey: "LCD1#1", toKey: "UNO1#12", points: [] },
    { solid: true, fromKey: "LCD1#2", toKey: "UNO1#3", points: [] },
    { solid: true, fromKey: "LCD1#3", toKey: "UNO1#4", points: [] },
    { solid: true, fromKey: "Osci1#0", toKey: "UNO1#11", points: [] },
    { solid: true, fromKey: "Osci1#1", toKey: "UNO1#12", points: [] },
    { solid: true, fromKey: "Osci1#2", toKey: "UNO1#4", points: [] },
];

const uno = components[0];
annotateUnoI2cBusEngine(uno, components, wires);
assert.ok(uno.i2cBus?.active);

const lines = [];
appendArduinoUnoNetlist(uno, (k) => k.replace("#", "_"), lines, (p, id) => `${p}${id}`, { i2cRepeatSec: 0.0004 });
assert.ok(lines.some((l) => /SDA_DRV.*PWL/i.test(l)));
assert.ok(lines.some((l) => /SCL_DRV.*PWL/i.test(l)));

const { netlist, ok, analysisTran } = buildNetlistFromGraphicalState({ components, wires });
assert.equal(ok, true);
assert.equal(analysisTran, true);
assert.match(netlist, /UNO1_SDA_DRV.*PWL/i);
assert.match(netlist, /\.tran/i);

console.log("i2c-bus-ideal.test.mjs OK");
