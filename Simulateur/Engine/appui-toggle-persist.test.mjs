import assert from "node:assert/strict";
import { parseTft18FromSketch, resolveTft18DisplayAt } from "./tft18-sketch-parse.mjs";

const labelTexts = (snap) => (snap?.labels ?? []).map((l) => l.text).join("|");

const sketch = `#include <Adafruit_ST7735.h>
#define ST77XX_GREEN 0x07E0
static int appui = 1;
static int dernierEtat = 1;
Adafruit_ST7735 tft(10, 8, 9);
void setup() {
  pinMode(4, INPUT_PULLUP);
  tft.initR(INITR_BLACKTAB);
}
void loop() {
  int etat = digitalRead(4);
  if (etat == 0 && dernierEtat == 1) {
    appui = !appui;
    delay(200);
  }
  dernierEtat = etat;
  if (appui == 0) {
    tft.fillScreen(ST77XX_GREEN);
    tft.setCursor(25, 50);
    tft.print("2eme page");
  } else {
    tft.setCursor(10, 10);
    tft.print("Meteo");
    delay(500);
  }
}`;

const parsed = parseTft18FromSketch(sketch);
const persisted = {};
const src = parsed.sketchSrc;

const start = resolveTft18DisplayAt(parsed, 500, {
    ctx: {
        liveInput: true,
        boardType: "esp32_devkit",
        inputs: { GPIO4: 1 },
        src,
        setupDone: true,
        persistedVars: persisted,
    },
});
assert.ok(labelTexts(start).includes("Meteo"), "demarrage → Meteo");

resolveTft18DisplayAt(parsed, 600, {
    ctx: {
        liveInput: true,
        boardType: "esp32_devkit",
        inputs: { GPIO4: 0 },
        src,
        setupDone: true,
        persistedVars: persisted,
        inputChangedAtMs: 600,
    },
});
assert.equal(persisted.appui, 0, "appui bascule a 0 apres appui");
assert.equal(persisted.dernierEtat, 0, "dernierEtat=0 apres appui");

const afterPress = resolveTft18DisplayAt(parsed, 600, {
    ctx: {
        liveInput: true,
        boardType: "esp32_devkit",
        inputs: { GPIO4: 0 },
        src,
        setupDone: true,
        persistedVars: persisted,
        inputChangedAtMs: 600,
    },
});
assert.ok(labelTexts(afterPress).includes("2eme page"), "appui=0 → 2eme page");

console.log("appui-toggle-persist.test.mjs OK");
