import assert from "node:assert/strict";
import { expandUserFunctionCalls } from "./sketch-functions.mjs";
import { buildBmpVarBindings, resolveBmpPrintArg } from "./bmp280-ideal.mjs";
import { parseTft18FromSketch, resolveTft18DisplayAt } from "./tft18-sketch-parse.mjs";
import { refreshJoyitTft18DisplayCache, getIdealJoyitTft18Display } from "./tft18-ideal.mjs";

const sketch = `#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#include <Adafruit_BMP280.h>
#define I2C_SDA 35
#define I2C_SCL 34
Adafruit_BMP280 bmp;
Adafruit_ST7735 tft = Adafruit_ST7735(15, 18, 0);
void setup() {
  Wire.begin(I2C_SDA, I2C_SCL);
  bmp.begin(0x76);
  tft.initR(INITR_BLACKTAB);
  tft.fillScreen(ST77XX_GREEN);
}
void altitude() {
  float a = bmp.readAltitude(1013.25);
  tft.setCursor(20, 80);
  tft.print(a, 1);
}
void loop() {
  altitude();
}`;

const components = [
    { type: "esp32_devkit", label: "E1", sketch, lastCompileOk: true },
    { type: "joyit_tft18", label: "TFT1", lastCompileOk: true },
    { type: "grove_bmp280", label: "B1", pressureHpa: 950, temperature: 20, i2cAddress: 0x76 },
];
const wires = [
    { fromJonctionId: "B1_SDA", toJonctionId: "E1_GPIO35" },
    { fromJonctionId: "B1_SCL", toJonctionId: "E1_GPIO34" },
    { fromJonctionId: "B1_VCC", toJonctionId: "E1_3V3" },
    { fromJonctionId: "B1_GND", toJonctionId: "E1_GND" },
    { fromJonctionId: "TFT1_SDA", toJonctionId: "E1_GPIO10" },
    { fromJonctionId: "TFT1_SCL", toJonctionId: "E1_GPIO8" },
    { fromJonctionId: "TFT1_CS", toJonctionId: "E1_GPIO15" },
    { fromJonctionId: "TFT1_DC", toJonctionId: "E1_GPIO18" },
    { fromJonctionId: "TFT1_RES", toJonctionId: "E1_GPIO0" },
    { fromJonctionId: "TFT1_VCC", toJonctionId: "E1_3V3" },
    { fromJonctionId: "TFT1_GND", toJonctionId: "E1_GND" },
];

const loopBody = expandUserFunctionCalls("  altitude();", sketch);
const bindings = buildBmpVarBindings(loopBody, sketch, "E1", components, wires, []);
assert.equal(bindings.a, "540.4");

assert.equal(
    resolveBmpPrintArg("bmp.readAltitude(1013.25)", sketch, "E1", components, wires, []),
    "540.4"
);

refreshJoyitTft18DisplayCache(components, wires, []);
const disp = getIdealJoyitTft18Display("TFT1", components, wires, [], 5);
const labels = disp.labels.map((l) => l.text).join("|");
assert.match(labels, /540/, `altitude should appear on TFT, got: ${labels}`);

console.log("altitude-tft.test.mjs OK");
