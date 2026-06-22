import assert from "node:assert/strict";
import {
    parseTft18FromSketch,
    pickTft18PhaseAt,
    resolveTft18DisplayAt,
    TFT_GFX_TEXT_SIZE_MAX,
} from "./tft18-sketch-parse.mjs";
import { getIdealJoyitTft18Display, isJoyitTft18WiredToBoard } from "./tft18-ideal.mjs";

function labelTexts(parsed) {
    return (parsed.labels || []).map((l) => l.text);
}

const sketch = `#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#define TFT_CS  10
#define TFT_DC   8
#define TFT_RST  9
Adafruit_ST7735 tft = Adafruit_ST7735(TFT_CS, TFT_DC, TFT_RST);
void setup() {
  tft.initR(INITR_BLACKTAB);
  tft.fillScreen(ST7735_BLACK);
  tft.setTextColor(ST7735_WHITE);
  tft.setTextSize(1);
  tft.setCursor(0, 0);
  tft.println("Hello TFT!");
}
void loop() {}
`;

const parsed = parseTft18FromSketch(sketch);
assert.ok(parsed);
assert.ok(labelTexts(parsed).some((t) => t.includes("Hello TFT!")));
assert.equal(parsed.controlPins.CS, "D10");
assert.equal(parsed.controlPins.DC, "D8");
assert.equal(parsed.controlPins.RES, "D9");

const components = [
    { label: "UNO1", type: "arduino_uno", sketch, lastCompileOk: true },
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
assert.equal(isJoyitTft18WiredToBoard("TFT1", components, wires, []), true);
const disp = getIdealJoyitTft18Display("TFT1", components, wires, []);
assert.equal(disp.wired, true);
assert.ok(disp.labels.some((l) => l.text.includes("Hello TFT!")));

const sketchLoop = `#include <Adafruit_ST7735.h>
Adafruit_ST7735 tft(10, 8, 9);
void setup() {
  tft.initR(INITR_BLACKTAB);
  tft.fillScreen(ST7735_BLACK);
}
void loop() {
  tft.fillScreen(ST7735_RED);
  tft.setCursor(0, 0);
  tft.println("Rouge");
  delay(1000);
  tft.fillScreen(ST7735_BLUE);
  tft.setCursor(0, 0);
  tft.println("Bleu");
  delay(1000);
}
`;
const parsedLoop = parseTft18FromSketch(sketchLoop);
assert.equal(parsedLoop.loopCycleMs, 2000);
assert.equal(parsedLoop.phases.length, 2);
assert.equal(labelTexts(resolveTft18DisplayAt(parsedLoop, 500))[0], "Rouge");
assert.equal(labelTexts(resolveTft18DisplayAt(parsedLoop, 1500))[0], "Bleu");
assert.equal(labelTexts(pickTft18PhaseAt(parsedLoop.phases, 500, parsedLoop.loopCycleMs))[0], "Rouge");

const sketchSetupThenLoop = `#include <Adafruit_ST7735.h>
#define ST77XX_GREEN 0x07E0
#define ST77XX_ORANGE 0xFC00
#define ST77XX_BLUE 0x001F
Adafruit_ST7735 tft(10, 8, 9);
void setup() {
  tft.initR(INITR_BLACKTAB);
  tft.fillScreen(ST77XX_GREEN);
  tft.setTextColor(ST77XX_ORANGE);
  tft.setTextSize(2);
  tft.setCursor(25, 50);
  tft.print("Station");
  delay(1000);
}
void loop() {
  tft.fillScreen(ST77XX_GREEN);
  tft.setTextColor(ST77XX_BLUE);
  tft.setTextSize(1);
  tft.setCursor(25, 50);
  tft.print("Temp");
  tft.write(0xE9);
  tft.print("rature");
}
`;
const parsedSeq = parseTft18FromSketch(sketchSetupThenLoop);
assert.equal(parsedSeq.setupDurationMs, 1000);
assert.equal(parsedSeq.setupPhaseCount, 1);
assert.ok(labelTexts(pickTft18PhaseAt(
    parsedSeq.phases, 200, parsedSeq.loopCycleMs, parsedSeq.setupDurationMs, parsedSeq.setupPhaseCount
)).includes("Station"));
assert.ok(labelTexts(pickTft18PhaseAt(
    parsedSeq.phases, 1500, parsedSeq.loopCycleMs, parsedSeq.setupDurationMs, parsedSeq.setupPhaseCount
)).some((t) => t.includes("Temp")));

const sketchMeteo = `#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#define TFT_CS   6
#define TFT_DC   7
#define TFT_RST  5
#define ST77XX_GREEN 0x07E0
#define ST77XX_RED 0xF800
Adafruit_ST7735 tft = Adafruit_ST7735(TFT_CS, TFT_DC, TFT_RST);
void setup() {
  tft.initR(INITR_BLACKTAB);
  tft.setRotation(0);
  tft.fillScreen(ST77XX_GREEN);
}
void loop() {
  tft.setTextColor(ST77XX_RED);
  tft.setTextSize(2);
  tft.setCursor(25, 50);
  tft.print("Station");
  tft.setCursor(35, 75);
  tft.print("Météo");
}
`;
const parsedMeteo = parseTft18FromSketch(sketchMeteo);
assert.ok(parsedMeteo);
assert.equal(parsedMeteo.controlPins.CS, "D6");
assert.equal(parsedMeteo.bg, "rgb(0,255,0)");
assert.equal(parsedMeteo.fg, "rgb(255,0,0)");
assert.equal(parsedMeteo.textSize, 2);
assert.ok(labelTexts(parsedMeteo).includes("Station"));
assert.ok(labelTexts(parsedMeteo).includes("Météo"));
assert.equal(parsedMeteo.labels.find((l) => l.text === "Station")?.size, 2);

const sketchRot = `#include <Adafruit_ST7735.h>
Adafruit_ST7735 tft(10, 8, 9);
void setup() {
  tft.initR(INITR_BLACKTAB);
  tft.setRotation(1);
  tft.fillScreen(ST7735_BLACK);
  tft.setCursor(10, 20);
  tft.print("Paysage");
}
void loop() {}
`;
assert.equal(parseTft18FromSketch(sketchRot).rotation, 1);

const sketchSize = `#include <Adafruit_ST7735.h>
Adafruit_ST7735 tft(10, 8, 9);
void setup() {
  tft.setTextSize(5);
  tft.setCursor(0, 0);
  tft.print("Max");
}
void loop() {}
`;
const parsedSize = parseTft18FromSketch(sketchSize);
assert.equal(parsedSize.textSize, TFT_GFX_TEXT_SIZE_MAX);
assert.equal(parsedSize.labels[0]?.size, TFT_GFX_TEXT_SIZE_MAX);

const sketchSizeClamp = `#include <Adafruit_ST7735.h>
Adafruit_ST7735 tft(10, 8, 9);
void setup() {
  tft.setTextSize(9);
}
void loop() {}
`;
assert.equal(parseTft18FromSketch(sketchSizeClamp).textSize, TFT_GFX_TEXT_SIZE_MAX);

const espComponents = [
    { label: "ESP1", type: "esp32_c3", sketch: sketchMeteo, lastCompileOk: true },
    { label: "TFT1", type: "joyit_tft18" },
    { label: "VCC1", type: "vcc", value: "3.3" },
    { label: "GND1", type: "gnd" },
];
const espWires = [
    { fromJonctionId: "TFT1_SCL", toJonctionId: "ESP1_GPIO8" },
    { fromJonctionId: "TFT1_SDA", toJonctionId: "ESP1_GPIO10" },
    { fromJonctionId: "TFT1_CS", toJonctionId: "ESP1_GPIO6" },
    { fromJonctionId: "TFT1_DC", toJonctionId: "ESP1_GPIO7" },
    { fromJonctionId: "TFT1_RES", toJonctionId: "ESP1_GPIO5" },
    { fromJonctionId: "TFT1_VCC", toJonctionId: "VCC1_out" },
    { fromJonctionId: "TFT1_GND", toJonctionId: "GND1_out" },
    { fromJonctionId: "ESP1_3V3", toJonctionId: "VCC1_out" },
    { fromJonctionId: "ESP1_GND", toJonctionId: "GND1_out" },
];
assert.equal(isJoyitTft18WiredToBoard("TFT1", espComponents, espWires, []), true);
const meteoDisp = getIdealJoyitTft18Display("TFT1", espComponents, espWires, []);
assert.equal(meteoDisp.wired, true);
assert.equal(meteoDisp.blank, false);
assert.ok(meteoDisp.labels.some((l) => l.text === "Station"));

const sketchWrite = `#include <Adafruit_ST7735.h>
Adafruit_ST7735 tft(10, 8, 9);
void setup() {
  tft.initR(INITR_BLACKTAB);
  tft.fillScreen(ST7735_BLACK);
  tft.setCursor(60, 35);
  tft.print("M");
  tft.write(0xE9);
  tft.print("t");
  tft.write(0xE9);
  tft.print("o");
}
void loop() {}
`;
const parsedWrite = parseTft18FromSketch(sketchWrite);
assert.ok(parsedWrite);
const writeTexts = labelTexts(parsedWrite);
assert.deepEqual(writeTexts, ["M", "\u00e9", "t", "\u00e9", "o"]);

const sketchFn = `#include <Adafruit_ST7735.h>
Adafruit_ST7735 tft(10, 8, 9);
void drawHumidity() {
  tft.setTextColor(ST7735_BLUE);
  tft.print("Humidit");
  tft.write(0xE9);
}
void showPct(int v) {
  tft.setTextColor(ST7735_RED);
  tft.setTextSize(2);
  tft.print(v);
  tft.print("%");
}
void setup() {
  tft.initR(INITR_BLACKTAB);
  tft.fillScreen(ST7735_BLACK);
}
void loop() {
  drawHumidity();
  showPct(50);
  delay(1000);
}
`;
const parsedFn = parseTft18FromSketch(sketchFn);
assert.ok(parsedFn);
const fnTexts = labelTexts(parsedFn);
assert.ok(fnTexts.includes("Humidit"));
assert.ok(fnTexts.includes("\u00e9"));
assert.ok(fnTexts.includes("50"));
assert.ok(fnTexts.includes("%"));

console.log("tft18-sketch-parse.test.mjs OK");
