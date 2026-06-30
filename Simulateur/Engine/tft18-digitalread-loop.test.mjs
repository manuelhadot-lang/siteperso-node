import assert from "node:assert/strict";
import { parseTft18FromSketch, resolveTft18DisplayAt } from "./tft18-sketch-parse.mjs";

const labelTexts = (snap) => (snap?.labels ?? []).map((l) => l.text).join("|");

const sketch = `#include <Adafruit_ST7735.h>
#define ST77XX_GREEN 0x07E0
#define ST77XX_RED 0xF800
Adafruit_ST7735 tft(10, 8, 9);
void temp() {
  tft.fillScreen(ST77XX_GREEN);
  tft.setCursor(10, 10);
  tft.print("Temp");
}
void humi() {
  tft.setCursor(10, 40);
  tft.print("Humi");
}
void setup() {
  tft.initR(INITR_BLACKTAB);
}
void loop() {
  if (digitalRead(4) == 0) {
    tft.fillScreen(ST77XX_GREEN);
    tft.setCursor(25, 50);
    tft.print("2eme page");
  } else {
    temp();
    humi();
    delay(2000);
  }
}
`;

const parsed = parseTft18FromSketch(sketch, {
    src: sketch,
    boardType: "esp32_devkit",
    inputs: { GPIO4: 1 },
});
assert.ok(parsed, "parse TFT");

const page1 = resolveTft18DisplayAt(parsed, 500, {
    ctx: {
        src: sketch,
        boardType: "esp32_devkit",
        liveInput: true,
        inputs: { GPIO4: 1 },
    },
});
assert.ok(labelTexts(page1).includes("Temp"), "else → temp()");
assert.ok(labelTexts(page1).includes("Humi"), "else → humi()");

const page2 = resolveTft18DisplayAt(parsed, 500, {
    ctx: {
        src: sketch,
        boardType: "esp32_devkit",
        liveInput: true,
        inputs: { GPIO4: 0 },
    },
});
assert.ok(labelTexts(page2).includes("2eme page"), "bouton → 2eme page");
assert.ok(!labelTexts(page2).includes("Temp"), "pas temp() si bouton appuyé");

const sketchTimed = `#include <Adafruit_ST7735.h>
#define ST77XX_GREEN 0x07E0
Adafruit_ST7735 tft(10, 8, 9);
void setup() {
  tft.initR(INITR_BLACKTAB);
  tft.fillScreen(ST77XX_GREEN);
  tft.setCursor(25, 50);
  tft.print("Station");
  delay(3000);
  tft.fillScreen(ST77XX_GREEN);
}
void loop() {
  if (digitalRead(4) == 0) {
    tft.setCursor(25, 50);
    tft.print("2eme page");
    delay(3000);
    tft.fillScreen(ST77XX_GREEN);
  } else {
    tft.setCursor(10, 10);
    tft.print("Meteo");
    delay(2000);
  }
}
`;
const parsedTimed = parseTft18FromSketch(sketchTimed);
assert.ok(labelTexts(resolveTft18DisplayAt(parsedTimed, 1500, {
    ctx: { liveInput: true, boardType: "esp32_devkit", inputs: { GPIO4: 1 }, src: sketchTimed },
})).includes("Station"), "setup Station avant loop");
const duringBtn = resolveTft18DisplayAt(parsedTimed, parsedTimed.setupDurationMs + 500, {
    ctx: { liveInput: true, boardType: "esp32_devkit", inputs: { GPIO4: 0 }, src: sketchTimed },
});
assert.ok(labelTexts(duringBtn).includes("2eme page"), "bouton pendant delay(3000)");
const afterBtnDelay = resolveTft18DisplayAt(parsedTimed, parsedTimed.setupDurationMs + 3000, {
    ctx: { liveInput: true, boardType: "esp32_devkit", inputs: { GPIO4: 0 }, src: sketchTimed },
});
assert.equal(labelTexts(afterBtnDelay), "", "fillScreen après delay efface le texte");

console.log("tft18-digitalread-loop.test.mjs OK");
