import assert from "node:assert/strict";
import { parseGroveLcdFromSketch, pickLcdPhaseAt, resolveLcdDisplayAt, maxLcdDisplayShift, LCD_DDRAM_LAST_ADDR } from "./grove-lcd-sketch-parse.mjs";
import { getIdealGroveLcdDisplay, isGroveLcdWiredToUno } from "./grove-lcd-ideal.mjs";

const sketch = `#include <Wire.h>
#include <LiquidCrystal_I2C.h>
LiquidCrystal_I2C lcd(0x3E, 16, 2);
void setup() {
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Hello Grove!");
  lcd.setCursor(0, 1);
  lcd.print("104020112");
}
void loop() {}
`;

const parsed = parseGroveLcdFromSketch(sketch);
assert.ok(parsed);
assert.equal(parsed.address, 0x3e);
assert.equal(parsed.lines[0].trim(), "Hello Grove!");
assert.equal(parsed.lines[1].trim(), "104020112");
assert.equal(parsed.backlight, true);

const components = [
    {
        label: "UNO1",
        type: "arduino_uno",
        sketch,
    },
    { label: "LCD1", type: "grove_lcd16x2", i2cAddress: 0x3e },
];
const wires = [
    { fromJonctionId: "LCD1_SDA", toJonctionId: "UNO1_A4" },
    { fromJonctionId: "LCD1_SCL", toJonctionId: "UNO1_A5" },
    { fromJonctionId: "LCD1_VCC", toJonctionId: "UNO1_5V" },
    { fromJonctionId: "LCD1_GND", toJonctionId: "UNO1_GND" },
];
assert.equal(isGroveLcdWiredToUno("LCD1", components, wires, []), true);
const disp = getIdealGroveLcdDisplay("LCD1", components, wires, []);
assert.equal(disp.wired, true);
assert.equal(disp.lines[0].trim(), "Hello Grove!");

const wiresGnd2 = [
    { fromJonctionId: "LCD1_SDA", toJonctionId: "UNO1_A4" },
    { fromJonctionId: "LCD1_SCL", toJonctionId: "UNO1_A5" },
    { fromJonctionId: "LCD1_VCC", toJonctionId: "VCC1_out" },
    { fromJonctionId: "LCD1_GND", toJonctionId: "UNO1_GND2" },
    { fromJonctionId: "UNO1_5V", toJonctionId: "VCC1_out" },
];
assert.equal(isGroveLcdWiredToUno("LCD1", [...components, { label: "VCC1", type: "vcc" }], wiresGnd2, []), true);

const sketchF = `#include <LiquidCrystal_I2C.h>
LiquidCrystal_I2C lcd(0x3E,16,2);
void setup() {
  lcd.init();
  lcd.backlight();
  lcd.print(F("Bonjour"));
}
void loop() {}
`;
assert.equal(parseGroveLcdFromSketch(sketchF).lines[0].trim(), "Bonjour");

const sketchDelay = `#include <Wire.h>
#include <LiquidCrystal_I2C.h>
LiquidCrystal_I2C lcd(0x3E, 16, 2);
void setup() {
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Hello  les STI2D");
  lcd.setCursor(4, 1);
  lcd.print("");
  delay(2000);
  lcd.print("sdfs");
}
void loop() {}
`;
const parsedDelay = parseGroveLcdFromSketch(sketchDelay);
assert.ok(parsedDelay?.hasTiming);
assert.equal(parsedDelay.phases.length, 3);
assert.equal(parsedDelay.phases[0].lines[0].trim(), "Hello  les STI2D");
assert.equal(parsedDelay.phases[0].lines[1].trim(), "");
assert.equal(parsedDelay.phases[0].atMs, 0);
assert.equal(parsedDelay.phases[2].atMs, 2000);
assert.equal(parsedDelay.phases[2].lines[1].trim(), "sdfs");
assert.equal(pickLcdPhaseAt(parsedDelay.phases, 500, { setupDurationMs: parsedDelay.setupDurationMs, loopCycleMs: parsedDelay.loopCycleMs }).lines[1].trim(), "");
assert.equal(pickLcdPhaseAt(parsedDelay.phases, 2500, { setupDurationMs: parsedDelay.setupDurationMs, loopCycleMs: parsedDelay.loopCycleMs }).lines[1].trim(), "sdfs");

const sketchLoop = `#include <Wire.h>
#include <LiquidCrystal_I2C.h>
LiquidCrystal_I2C lcd(0x3E, 16, 2);
void setup() {
  lcd.init();
  lcd.backlight();
}
void loop() {
  lcd.setCursor(0, 0);
  lcd.print("Hello  les STI2D");
  lcd.setCursor(3, 1);
  lcd.print("2026/2027");
  delay(1000);
  lcd.clear();
  lcd.setCursor(3, 0);
  lcd.print("2026/2027");
  lcd.setCursor(0, 1);
  lcd.print("Hello  les STI2D");
  delay(1000);
  lcd.clear();
}
`;
const parsedLoop = parseGroveLcdFromSketch(sketchLoop);
assert.equal(parsedLoop.loopCycleMs, 2000);
assert.equal(resolveLcdDisplayAt(parsedLoop, 500).lines[0].trim(), "Hello  les STI2D");
assert.equal(resolveLcdDisplayAt(parsedLoop, 1500).lines[0].trim(), "2026/2027");
assert.equal(resolveLcdDisplayAt(parsedLoop, 2500).lines[0].trim(), "Hello  les STI2D");
assert.equal(resolveLcdDisplayAt(parsedLoop, 3500).lines[0].trim(), "2026/2027");

const sketchScroll = `#include <LiquidCrystal_I2C.h>
LiquidCrystal_I2C lcd(0x3E, 16, 2);
void setup() {
  lcd.init();
  lcd.print("ABCDEFGH");
  lcd.scrollDisplayLeft();
}
void loop() {}
`;
const parsedScroll = parseGroveLcdFromSketch(sketchScroll);
assert.equal(parsedScroll.lines[0].trim(), "BCDEFGH");

const sketchRgb = `#include <rgb_lcd.h>
rgb_lcd lcd;
void setup() {
  lcd.begin(16, 2);
  lcd.setRGB(255, 0, 0);
  lcd.print("Rouge");
}
void loop() {}
`;
const parsedRgb = parseGroveLcdFromSketch(sketchRgb);
assert.deepEqual(parsedRgb.rgb, { r: 255, g: 0, b: 0 });
assert.equal(parsedRgb.lines[0].trim(), "Rouge");

const sketchScrollLoop = `#include <rgb_lcd.h>
rgb_lcd lcd;
void setup() {
  lcd.begin(16, 2);
  lcd.setRGB(255, 128, 0);
  lcd.print("Hello");
}
void loop() {
  lcd.scrollDisplayLeft();
  delay(1000);
}
`;
const parsedScrollLoop = parseGroveLcdFromSketch(sketchScrollLoop);
assert.equal(parsedScrollLoop.loopCycleMs, 1000);
assert.equal(resolveLcdDisplayAt(parsedScrollLoop, 0).lines[0].trim(), "ello");
assert.equal(resolveLcdDisplayAt(parsedScrollLoop, 500).lines[0].trim(), "ello");
assert.equal(resolveLcdDisplayAt(parsedScrollLoop, 1000).lines[0].trim(), "llo");
assert.equal(resolveLcdDisplayAt(parsedScrollLoop, 2500).lines[0].trim(), "lo");

const sketchDdram = `#include <rgb_lcd.h>
rgb_lcd lcd;
void setup() {
  lcd.begin(16, 2);
  lcd.print("0123456789ABCDEF0123456789ABCD");
  lcd.scrollDisplayLeft();
  lcd.scrollDisplayLeft();
}
void loop() {}
`;
const parsedDdram = parseGroveLcdFromSketch(sketchDdram);
assert.equal(parsedDdram.lines[0].trim(), "23456789ABCDEF01");

const sketchOverflow = `#include <rgb_lcd.h>
rgb_lcd lcd;
void setup() {
  lcd.begin(16, 2);
  lcd.print("ABCDEFGHIJKLMNOPQRST");
  lcd.scrollDisplayLeft();
  lcd.scrollDisplayLeft();
  lcd.scrollDisplayLeft();
  lcd.scrollDisplayLeft();
}
void loop() {}
`;
const parsedOverflow = parseGroveLcdFromSketch(sketchOverflow);
assert.equal(parsedOverflow.lines[0].trim(), "EFGHIJKLMNOPQRST");
assert.equal(parsedOverflow.lines[1].trim(), "");

assert.equal(maxLcdDisplayShift(16), 24);

const text40 = "0123456789012345678901234567890123456789";
let scroll24 = `#include <rgb_lcd.h>\nrgb_lcd lcd;\nvoid setup() {\n  lcd.begin(16, 2);\n  lcd.print("${text40}");\n`;
for (let i = 0; i < maxLcdDisplayShift(16); i++) scroll24 += "  lcd.scrollDisplayLeft();\n";
scroll24 += "}\nvoid loop() {}\n";
const parsedScroll24 = parseGroveLcdFromSketch(scroll24);
assert.equal(text40.length, 40);
assert.equal(parsedScroll24.setupEndState.displayShift, 24);
assert.equal(parsedScroll24.lines[0].charAt(15), "9");
assert.equal(parsedScroll24.setupEndState.ddram[0].charAt(LCD_DDRAM_LAST_ADDR), "9");

console.log("grove-lcd-sketch-parse.test.mjs OK");
