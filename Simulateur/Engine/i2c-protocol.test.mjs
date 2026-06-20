import assert from "node:assert/strict";
import {
    I2cMasterWaveform,
    groveLcdBusAddress8,
    pwlToSpiceString,
    expandPwlPlateaus,
    I2C_SCL_PERIOD_SEC,
} from "./i2c-protocol.mjs";
import { buildLcdI2cWaveformFromSketch } from "./lcd-pcf8574-i2c.mjs";
import { appendI2cBusNetlist, annotateUnoI2cBusEngine } from "./i2c-bus-ideal.mjs";
import { buildNetlistFromGraphicalState } from "./schematic-to-spice.mjs";

assert.equal(groveLcdBusAddress8(0x3e), 0x3e);

const bus = new I2cMasterWaveform();
bus.writeTransaction(0x3e, [0x08, 0x0c]);
const pwl = bus.toPwl();
assert.ok(pwl.sda.length >= 10);
assert.ok(pwl.scl.length >= 10);
const sdaStr = pwlToSpiceString(pwl.sda);
assert.match(sdaStr, /^PWL\(/);

const expanded = expandPwlPlateaus([[0, 5], [4e-6, 0], [8e-6, 5]]);
assert.equal(expanded.length, 5);
assert.deepEqual(expanded[1], [4e-6, 5]);
assert.deepEqual(expanded[2], [4e-6, 0]);
assert.ok(sdaStr.includes("5") && sdaStr.includes("0"));

const sketch = `#include <Wire.h>
#include <LiquidCrystal_I2C.h>
LiquidCrystal_I2C lcd(0x3E, 16, 2);
void setup() {
  lcd.init();
  lcd.backlight();
  lcd.print("Hi");
}
void loop() {}
`;

const wf = buildLcdI2cWaveformFromSketch(sketch, 0.005);
assert.ok(wf);
assert.ok(wf.sda.length > 50);
assert.ok(wf.scl.length > 50);
assert.ok(wf.durationSec >= I2C_SCL_PERIOD_SEC * 8);

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
appendI2cBusNetlist(uno, (k) => k.replace("#", "_"), lines, (p, id) => `${p}${id}`, 0.0004);
assert.ok(lines.some((l) => /SDA_DRV.*PWL/i.test(l)));
assert.ok(lines.some((l) => /SCL_DRV.*PWL/i.test(l)));
assert.ok(!lines.some((l) => /PULSE/i.test(l)));

const result = buildNetlistFromGraphicalState({ components, wires });
const { netlist, ok, analysisTran } = result;
assert.equal(ok, true);
assert.equal(analysisTran, true);
assert.match(netlist, /UNO1_SDA_DRV.*PWL/i);
assert.match(netlist, /\.tran/i);

console.log("i2c-protocol.test.mjs OK", { sdaPts: wf.sda.length, dur: wf.durationSec });
