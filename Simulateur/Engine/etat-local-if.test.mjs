import assert from "node:assert/strict";
import {
    createArduinoRuntime,
    stepArduinoRuntime,
    getRuntimeSerialTx,
} from "./arduino-sketch-parse.mjs";
import { parseTft18FromSketch, resolveTft18DisplayAt } from "./tft18-sketch-parse.mjs";

const labelTexts = (snap) => (snap?.labels ?? []).map((l) => l.text).join("|");

const sketch = `#include <Adafruit_ST7735.h>
#define ST77XX_GREEN 0x07E0
boolean appui = true;
Adafruit_ST7735 tft(10, 8, 9);
void setup() {
  pinMode(4, INPUT_PULLUP);
  tft.initR(INITR_BLACKTAB);
}
void loop() {
  int etat = digitalRead(4);
  if ((etat == 0) && (appui == 1)) {
    tft.fillScreen(ST77XX_GREEN);
    tft.setCursor(25, 50);
    tft.print("2eme page");
  } else {
    tft.setCursor(10, 10);
    tft.print("Meteo");
    delay(2000);
  }
}`;

const rt = createArduinoRuntime({ type: "esp32_devkit", sketch });
stepArduinoRuntime(rt, 600, { GPIO4: 1 }, {});
const log = getRuntimeSerialTx(rt);
console.log("serial runtime:", JSON.stringify(log));

const parsed = parseTft18FromSketch(sketch);
const pageReleased = resolveTft18DisplayAt(parsed, 500, {
    ctx: {
        liveInput: true,
        boardType: "esp32_devkit",
        inputs: { GPIO4: 1 },
        src: sketch,
        setupDone: true,
    },
});
const labels = labelTexts(pageReleased);
console.log("TFT labels GPIO4=1:", labels);
assert.ok(labels.includes("Meteo"), "etat=1 appui=1 → else Meteo, got: " + labels);
assert.ok(!labels.includes("2eme page"), "ne doit pas afficher 2eme page");

const pagePressed = resolveTft18DisplayAt(parsed, 500, {
    ctx: {
        liveInput: true,
        boardType: "esp32_devkit",
        inputs: { GPIO4: 0 },
        src: sketch,
        setupDone: true,
    },
});
assert.ok(labelTexts(pagePressed).includes("2eme page"), "etat=0 appui=1 → 2eme page");

console.log("etat-local-if.test.mjs OK");
