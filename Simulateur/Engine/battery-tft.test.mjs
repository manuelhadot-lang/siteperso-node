import assert from "node:assert/strict";
import { evaluateLoopVarBindings, sketchUsesAnalogInput } from "./arduino-sketch-parse.mjs";
import { parseTft18FromSketch, resolveTft18DisplayAt } from "./tft18-sketch-parse.mjs";
import { refreshJoyitTft18DisplayCache, getIdealJoyitTft18Display } from "./tft18-ideal.mjs";
import { readBoardAnalogInputs } from "./arduino-analog-ideal.mjs";

const sketch = `#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#define I2C_SDA 35
#define I2C_SCL 34
static int page = 0;
static int dernierEtat = 1;
Adafruit_ST7735 tft = Adafruit_ST7735(15, 18, 0);
void setup() {
  pinMode(4, INPUT);
  pinMode(36, INPUT);
  tft.initR(INITR_BLACKTAB);
  tft.fillScreen(ST77XX_GREEN);
}
void batterie() {
  float bat = analogRead(36);
  tft.setCursor(20, 55);
  tft.print(bat);
}
void loop() {
  int etat = digitalRead(4);
  if (etat == 0 && dernierEtat == 1) {
    page = !page;
    delay(200);
  }
  dernierEtat = etat;
  if (page == 1) {
    tft.fillScreen(ST77XX_GREEN);
    batterie();
  }
}`;

assert.ok(sketchUsesAnalogInput(sketch), "analogRead dans batterie() doit être détecté");

const components = [
    { type: "esp32_devkit", label: "E1", sketch, lastCompileOk: true },
    { type: "joyit_tft18", label: "TFT1", lastCompileOk: true },
    { type: "vcc", label: "V3", value: 3.3 },
    { type: "gnd", label: "GND1" },
    { type: "potentiometer", label: "POT1", value: "10k", position: 20 },
];
const wires = [
    { fromJonctionId: "V3_out", toJonctionId: "POT1_in" },
    { fromJonctionId: "POT1_out", toJonctionId: "GND1_out" },
    { fromJonctionId: "POT1_wip", toJonctionId: "E1_GPIO36" },
    { fromJonctionId: "TFT1_SDA", toJonctionId: "E1_GPIO10" },
    { fromJonctionId: "TFT1_SCL", toJonctionId: "E1_GPIO8" },
    { fromJonctionId: "TFT1_CS", toJonctionId: "E1_GPIO15" },
    { fromJonctionId: "TFT1_DC", toJonctionId: "E1_GPIO18" },
    { fromJonctionId: "TFT1_RES", toJonctionId: "E1_GPIO0" },
    { fromJonctionId: "TFT1_VCC", toJonctionId: "E1_3V3" },
    { fromJonctionId: "TFT1_GND", toJonctionId: "E1_GND" },
];

const adc = readBoardAnalogInputs(components[0], {
    components,
    wires,
    autoJunctions: [],
});
assert.ok(adc.GPIO36 > 700, `POT 80% sur 3.3V → ADC élevé, got ${adc.GPIO36}`);

const bindings = evaluateLoopVarBindings(sketch, adc, "esp32_devkit");
assert.equal(bindings.bat, "818.00");

components[0]._tftLoopVars = { page: 1, dernierEtat: 1 };

refreshJoyitTft18DisplayCache(components, wires, []);
const disp = getIdealJoyitTft18Display("TFT1", components, wires, [], 5, {
    inputs: { GPIO4: 1 },
});
assert.ok(disp.wired, "TFT doit être câblé");
const labels = disp.labels.map((l) => l.text).join("|");
assert.match(labels, /818/, `valeur bat sur TFT, got: ${labels}`);

console.log("battery-tft.test.mjs OK");
