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

const page1 = resolveTft18DisplayAt(parsed, 0, {
    ctx: {
        src: sketch,
        boardType: "esp32_devkit",
        liveInput: true,
        inputs: { GPIO4: 1 },
    },
});
assert.ok(labelTexts(page1).includes("Temp"), "else → temp()");
assert.ok(labelTexts(page1).includes("Humi"), "else → humi()");

const page2 = resolveTft18DisplayAt(parsed, 0, {
    ctx: {
        src: sketch,
        boardType: "esp32_devkit",
        liveInput: true,
        inputs: { GPIO4: 0 },
    },
});
assert.ok(labelTexts(page2).includes("2eme page"), "bouton → 2eme page");
assert.ok(!labelTexts(page2).includes("Temp"), "pas temp() si bouton appuyé");

console.log("tft18-digitalread-loop.test.mjs OK");
