import assert from "node:assert/strict";
import { parseTft18FromSketch } from "./tft18-sketch-parse.mjs";
import { getIdealJoyitTft18Display } from "./tft18-ideal.mjs";

const sketchSetupOnly = `#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#define ST77XX_GREEN 0x07E0
#define ST77XX_ORANGE 0xFC00
Adafruit_ST7735 tft(10, 8, 9);
void setup() {
  tft.initR(INITR_BLACKTAB);
  tft.setRotation(0);
  tft.fillScreen(ST77XX_GREEN);
  tft.setTextColor(ST77XX_ORANGE);
  tft.setTextSize(2);
  tft.setCursor(25, 50);
  tft.print("Station");
  tft.setCursor(35, 80);
  tft.print("M");
  tft.write(0xE9);
  tft.print("t");
  tft.write(0xE9);
  tft.print("o");
}
void loop() {
}
`;

const parsed = parseTft18FromSketch(sketchSetupOnly);
assert.ok(parsed, "parsed");
assert.equal(parsed.hasTiming, true, "loop vide → phase statique du setup");
assert.ok(parsed.labels.some((l) => l.text === "Station"), "Station in setup");
assert.ok(parsed.labels.some((l) => l.text === "\u00e9"), "e acute in setup");

const components = [
    { label: "UNO1", type: "arduino_uno", sketch: sketchSetupOnly, lastCompileOk: true },
    { label: "TFT1", type: "joyit_tft18" },
];
const wires = [
    { fromJonctionId: "TFT1_SCL", toJonctionId: "UNO1_D13" },
    { fromJonctionId: "TFT1_SDA", toJonctionId: "UNO1_D11" },
    { fromJonctionId: "TFT1_CS", toJonctionId: "UNO1_D10" },
    { fromJonctionId: "TFT1_DC", toJonctionId: "UNO1_D8" },
    { fromJonctionId: "TFT1_RES", toJonctionId: "UNO1_D9" },
    { fromJonctionId: "TFT1_VCC", toJonctionId: "UNO1_5V" },
    { fromJonctionId: "TFT1_GND", toJonctionId: "UNO1_GND" },
];

const disp = getIdealJoyitTft18Display("TFT1", components, wires, [], 0);
assert.equal(disp.wired, true);
assert.equal(disp.blank, false, "setup-only must not be blank");
assert.ok(disp.labels.some((l) => l.text === "Station"), "Station visible via ideal");

console.log("tft18-setup-only.test.mjs OK");
