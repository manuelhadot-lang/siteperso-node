import assert from "node:assert/strict";
import { getIdealJoyitTft18Display } from "./tft18-ideal.mjs";

const sketch = `#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#include <Adafruit_TSL2591.h>
#include <DHT.h>
#define I2C_SDA 4
#define I2C_SCL 5
#define TFT_CS 6
#define TFT_DC 7
#define TFT_RST 9
#define DHT_PIN 21
DHT dht(DHT_PIN, DHT22);
Adafruit_ST7735 tft = Adafruit_ST7735(TFT_CS, TFT_DC, TFT_RST);
Adafruit_TSL2591 tsl = Adafruit_TSL2591(2591);
void lumin() {
  uint32_t lum = tsl.getFullLuminosity();
  uint16_t full = lum & 0xFFFF;
  uint16_t ir = lum >> 16;
  float lux = tsl.calculateLux(full, ir);
  tft.setTextColor(ST77XX_BLUE);
  tft.setTextSize(1);
  tft.setCursor(5, 80);
  tft.print("Luminosite");
  tft.setTextSize(2);
  tft.setCursor(20, 95);
  tft.setTextColor(ST77XX_RED);
  tft.print(lux);
  tft.print(" lx");
}
void setup() {
  Wire.begin(I2C_SDA, I2C_SCL);
  tft.fillScreen(ST77XX_GREEN);
}
void loop() { lumin(); delay(2000); }
`;

const components = [
    { label: "C3", type: "esp32_c3", sketch, lastCompileOk: true },
    { label: "TFT1", type: "joyit_tft18" },
    { label: "TSL1", type: "grove_tsl2591", lux: 320, i2cAddress: 0x29 },
];
const wires = [
    { fromJonctionId: "TFT1_SCL", toJonctionId: "C3_GPIO8" },
    { fromJonctionId: "TFT1_SDA", toJonctionId: "C3_GPIO10" },
    { fromJonctionId: "TFT1_CS", toJonctionId: "C3_GPIO6" },
    { fromJonctionId: "TFT1_DC", toJonctionId: "C3_GPIO7" },
    { fromJonctionId: "TFT1_RES", toJonctionId: "C3_GPIO9" },
    { fromJonctionId: "TFT1_VCC", toJonctionId: "C3_3V3" },
    { fromJonctionId: "TFT1_GND", toJonctionId: "C3_GND" },
    { fromJonctionId: "TSL1_SDA", toJonctionId: "C3_GPIO4" },
    { fromJonctionId: "TSL1_SCL", toJonctionId: "C3_GPIO5" },
    { fromJonctionId: "TSL1_VCC", toJonctionId: "C3_3V3" },
    { fromJonctionId: "TSL1_GND", toJonctionId: "C3_GND" },
];

const disp = getIdealJoyitTft18Display("TFT1", components, wires, [], 5);
const texts = disp.labels.map((l) => l.text).join(" | ");
assert.ok(texts.includes("320"), `lux visible on TFT, got: ${texts}`);

console.log("tft18-lux-temp.test.mjs OK");
