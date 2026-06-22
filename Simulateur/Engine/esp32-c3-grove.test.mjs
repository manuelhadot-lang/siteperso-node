import assert from "node:assert/strict";
import {
    parseArduinoSketch,
    applyArduinoSketchToComponent,
    resolvePinLevelsAt,
} from "./arduino-sketch-parse.mjs";
import { annotateMicroBoardI2cBusEngine } from "./i2c-bus-ideal.mjs";
import { isGroveLcdWiredToBoard, findBoardForGroveLcd } from "./grove-lcd-ideal.mjs";
import { isGroveDht22WiredToBoard, resolveDhtReadingsForBoard } from "./dht22-ideal.mjs";
import { getIdealBargraphFromArduino } from "./arduino-gpio-ideal.mjs";

const counterSketch = `void setup() {
  DDRD=0b11111111;
  PORTD=0x00;
}
void loop() {
  PORTD=PORTD+1;
  delay(1000);
}`;

const esp = { type: "esp32_c3", label: "ESP1", id: "ESP1", sketch: counterSketch };
applyArduinoSketchToComponent(esp);
assert.ok(esp.pinPhases?.length >= 2, "ESP32 PORTD counter: pinPhases");
assert.equal(esp.pinPhases[0].levels.GPIO0, 1, "phase0 GPIO0");
assert.equal(esp.pinPhases[1].levels.GPIO1, 1, "phase1 GPIO1 (PORTD=2)");

const lv = resolvePinLevelsAt(esp, 1.5);
assert.equal(lv.GPIO0, 0, "t=1.5s GPIO0 off");
assert.equal(lv.GPIO1, 1, "t=1.5s GPIO1 on");

const staticSketch = `void setup() {
  DDRD=0b00001111;
  PORTD=6;
}
void loop() {}`;
const espStatic = { type: "esp32_c3", label: "ESP2", id: "ESP2", sketch: staticSketch };
applyArduinoSketchToComponent(espStatic);
assert.equal(espStatic.pinLevels.GPIO1, 1, "static PORTD=6 GPIO1");
assert.equal(espStatic.pinLevels.GPIO2, 1, "static PORTD=6 GPIO2");

const lcdWires = [
    { fromJonctionId: "LCD1_SDA", toJonctionId: "ESP1_GPIO8" },
    { fromJonctionId: "LCD1_SCL", toJonctionId: "ESP1_GPIO9" },
    { fromJonctionId: "LCD1_VCC", toJonctionId: "ESP1_3V3" },
    { fromJonctionId: "LCD1_GND", toJonctionId: "ESP1_GND" },
];
const components = [
    esp,
    { type: "grove_lcd16x2", label: "LCD1", id: "LCD1", i2cAddress: 0x3e },
];
assert.equal(isGroveLcdWiredToBoard("LCD1", components, lcdWires, []), true);

const espI2c = {
    ...esp,
    sketch: `#include <Wire.h>
#include <LiquidCrystal_I2C.h>
LiquidCrystal_I2C lcd(0x3E,16,2);
void setup(){ lcd.init(); lcd.backlight(); lcd.print("Hi"); }
void loop(){}`,
};
annotateMicroBoardI2cBusEngine(espI2c, components, [
    { solid: true, fromKey: "LCD1#0", toKey: "ESP1#12" },
    { solid: true, fromKey: "LCD1#1", toKey: "ESP1#13" },
    { solid: true, fromKey: "LCD1#2", toKey: "ESP1#0" },
    { solid: true, fromKey: "LCD1#3", toKey: "ESP1#1" },
]);
assert.equal(espI2c.i2cBus?.active, true);

const dhtWires = [
    { fromJonctionId: "DHT1_DATA", toJonctionId: "ESP1_GPIO4" },
    { fromJonctionId: "DHT1_VCC", toJonctionId: "ESP1_3V3" },
    { fromJonctionId: "DHT1_GND", toJonctionId: "ESP1_GND" },
];
const dhtComps = [
    esp,
    { type: "grove_dht22", label: "DHT1", temperature: 22, humidity: 60 },
];
assert.equal(isGroveDht22WiredToBoard("DHT1", dhtComps, dhtWires, []), true);

const dhtSketch = `#include <DHT.h>
DHT dht(2, DHT22);
void setup() { dht.begin(); }
void loop() { Serial.println(dht.readTemperature()); delay(1000); }`;
const espDht = { type: "esp32_c3", label: "ESP1", sketch: dhtSketch };
const dhtGpio2Wires = [
    { fromJonctionId: "DHT1_DATA", toJonctionId: "ESP1_GPIO2" },
    { fromJonctionId: "DHT1_VCC", toJonctionId: "ESP1_3V3" },
    { fromJonctionId: "DHT1_GND", toJonctionId: "ESP1_GND" },
];
const dhtRead = resolveDhtReadingsForBoard(
    espDht,
    [espDht, { type: "grove_dht22", label: "DHT1", temperature: 26.5, humidity: 61 }],
    dhtGpio2Wires,
    []
);
assert.equal(dhtRead?.temperature, 26.5, "DHT pin 2 -> GPIO2");

const barComps = [esp, { label: "BAR1", type: "bargraph_dc10h" }, { label: "GND1", type: "gnd" }];
const barJonctions = [];
for (let i = 0; i < 8; i++) {
    barJonctions.push({ fromJonctionId: `ESP1_GPIO${i}`, toJonctionId: `BAR1_s${i + 1}` });
}
barJonctions.push({ fromJonctionId: "BAR1_COM", toJonctionId: "GND1_out" });
const bg = getIdealBargraphFromArduino("BAR1", barComps, barJonctions, 0.5);
assert.ok(bg?.segments?.s1, "bargraph ESP32 GPIO0 at t=0.5");

assert.equal(findBoardForGroveLcd("LCD1", components, lcdWires, []).board?.label, "ESP1");

console.log("esp32-c3-grove.test.mjs OK");
