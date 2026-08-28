import assert from "node:assert/strict";
import {
    parseArduinoSketch,
    createArduinoRuntime,
    stepArduinoRuntime,
    arduinoRuntimeLevels,
    sketchHasLoop,
    getRuntimeSerialTx,
} from "./arduino-sketch-parse.mjs";

const blink = `
void setup() {
  pinMode(13, OUTPUT);
}
void loop() {
  digitalWrite(13, HIGH);
  delay(500);
  digitalWrite(13, LOW);
  delay(500);
}
`;

const parsed = parseArduinoSketch(blink);
assert.equal(parsed.pinModes.D13, "OUTPUT");
assert.deepEqual(parsed.pinPulses.D13, { highSec: 0.5, lowSec: 0.5 });
assert.equal(parsed.pinLevels.D13, undefined);

const alwaysOn = `
void setup() { pinMode(LED_BUILTIN, OUTPUT); }
void loop() { digitalWrite(LED_BUILTIN, HIGH); delay(1000); }
`;
const on = parseArduinoSketch(alwaysOn);
assert.equal(on.pinModes.D13, "OUTPUT");
assert.equal(on.pinLevels.D13, 1);

const bcdSketch = `
void setup() {
  pinMode(13, OUTPUT);
  pinMode(12, OUTPUT);
  pinMode(11, OUTPUT);
  pinMode(10, OUTPUT);
}
void loop() {
  digitalWrite(13, 1);
  digitalWrite(12, 1);
  digitalWrite(11, 0);
  digitalWrite(10, 0);
  delay(1000);
}
`;
const bcd = parseArduinoSketch(bcdSketch);
assert.equal(bcd.pinLevels.D13, 1);
assert.equal(bcd.pinLevels.D12, 1);
assert.equal(bcd.pinLevels.D11, 0);
assert.equal(bcd.pinLevels.D10, 0);
assert.equal(bcd.pinPulses.D13, undefined);

const toggleSketch = `
void setup() {
  pinMode(13, OUTPUT);
  pinMode(12, OUTPUT);
  pinMode(11, OUTPUT);
  pinMode(10, OUTPUT);
}
void loop() {
  digitalWrite(13, 1);
  digitalWrite(12, 0);
  digitalWrite(11, 0);
  digitalWrite(10, 1);
  delay(1000);
  digitalWrite(13, 0);
  digitalWrite(12, 0);
  digitalWrite(11, 0);
  digitalWrite(10, 0);
  delay(1000);
}`;
const toggle = parseArduinoSketch(toggleSketch);
assert.equal(toggle.pinPhases.length, 2);
assert.equal(toggle.pinPhases[0].levels.D13, 1);
assert.equal(toggle.pinPhases[0].levels.D10, 1);
assert.equal(toggle.pinPhases[1].levels.D13, 0);
assert.equal(toggle.pinLevels.D13, undefined);

assert.equal(sketchHasLoop(blink), true);
assert.equal(sketchHasLoop("void setup() {}"), false);

const counterSketch = `
void setup() {
  DDRD = 0xFF;
}
byte x = 0;
void loop() {
  PORTD = x;
  x++;
}
`;
const rtCounter = createArduinoRuntime({ sketch: counterSketch });
stepArduinoRuntime(rtCounter, 16, {});
stepArduinoRuntime(rtCounter, 16, {});
assert.equal(arduinoRuntimeLevels(rtCounter).D0, 1);

const rtBlink = createArduinoRuntime({ sketch: blink });
stepArduinoRuntime(rtBlink, 600, {});
assert.equal(arduinoRuntimeLevels(rtBlink).D13, 0);

const serialSketch = `
void setup() {
  Serial.begin(9600);
  Serial.println("Hello");
}
void loop() {
  Serial.print("T=");
  Serial.println(42);
  delay(1000);
}
`;
const rtSerial = createArduinoRuntime({ sketch: serialSketch });
assert.equal(getRuntimeSerialTx(rtSerial), "Hello\n");
stepArduinoRuntime(rtSerial, 100, {});
assert.ok(getRuntimeSerialTx(rtSerial).includes("T=42"));
assert.equal(arduinoRuntimeLevels(rtSerial).D1, 1);

const shiftParsed = parseArduinoSketch(`void setup(){ DDRD=0xFF; PORTD=1; } void loop(){ PORTD=PORTD<<1; delay(500); }`);
assert.ok(shiftParsed.pinPhases?.length >= 2, "PORTD<<1 phases");
assert.equal(shiftParsed.pinPhases[0].levels.D1, 1);

const incParsed = parseArduinoSketch(`void setup(){ DDRD=0xFF; PORTD=0; } void loop(){ PORTD=PORTD+1; delay(500); }`);
assert.ok(incParsed.pinPhases?.length >= 2, "PORTD+1 phases");
assert.equal(incParsed.pinPhases[0].levels.D0, 1);
assert.equal(incParsed.pinPhases[1].levels.D1, 1);

const gpioRead = parseArduinoSketch(
    `void setup(){} void loop(){ if (digitalRead(4)==0) { digitalWrite(2,HIGH); } delay(100); }`,
    "esp32_devkit"
);
assert.equal(gpioRead.pinModes.GPIO4, "INPUT_PULLUP", "digitalRead(4) → GPIO4 entrée");

const rtBtn = createArduinoRuntime({
    type: "esp32_devkit",
    sketch: `void setup(){} void loop(){ if (digitalRead(4)==0) { digitalWrite(2,HIGH); } else { digitalWrite(2,LOW); } delay(50); }`,
});
stepArduinoRuntime(rtBtn, 60, { GPIO4: 0 }, {});
assert.equal(arduinoRuntimeLevels(rtBtn).GPIO2, 1, "GPIO2 HIGH si GPIO4 à 0");
stepArduinoRuntime(rtBtn, 60, { GPIO4: 1 }, {});
assert.equal(arduinoRuntimeLevels(rtBtn).GPIO2, 0, "GPIO2 LOW si GPIO4 relâché");

const veilleur = `const int PIN_LDR = 2;
const int PIN_LED = 18;
const int PIN_BUZZER = 19;
const int SEUIL = 500;
bool etaitNuit = false;
void setup() {
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  Serial.begin(115200);
}
void loop() {
  int luminosite = analogRead(PIN_LDR);
  Serial.println(luminosite);
  bool estNuit = (luminosite < SEUIL);
  digitalWrite(PIN_LED, estNuit ? HIGH : LOW);
  if (estNuit && !etaitNuit) {
    digitalWrite(PIN_BUZZER, HIGH);
    delay(150);
    digitalWrite(PIN_BUZZER, LOW);
  }
  etaitNuit = estNuit;
  delay(100);
}`;

const veilleurParsed = parseArduinoSketch(veilleur, "esp32_upesy_lp");
assert.equal(veilleurParsed.pinModes.GPIO18, "OUTPUT", "pinMode(PIN_LED) → GPIO18");
assert.equal(veilleurParsed.pinModes.GPIO19, "OUTPUT", "pinMode(PIN_BUZZER) → GPIO19");
assert.ok(!(veilleurParsed.pinPhases?.length >= 2), "analogRead : pas de phases figées jour/nuit");
assert.equal(veilleurParsed.pinLevels.GPIO18, 0, "LED éteinte tant que le runtime n'a pas lu l'ADC");
assert.ok(!veilleurParsed.pinPulses?.GPIO19, "buzzer dans un if : pas de pulsation permanente");

const rtVeilleur = createArduinoRuntime({ type: "esp32_upesy_lp", sketch: veilleur });
stepArduinoRuntime(rtVeilleur, 200, {}, { GPIO2: 1023 });
assert.ok(getRuntimeSerialTx(rtVeilleur).includes("1023"), "Serial affiche analogRead(PIN_LDR)");
assert.equal(arduinoRuntimeLevels(rtVeilleur).GPIO18, 0, "1023 > 500 → jour → LED éteinte");
stepArduinoRuntime(rtVeilleur, 200, {}, { GPIO2: 100 });
assert.equal(arduinoRuntimeLevels(rtVeilleur).GPIO18, 1, "100 < 500 → nuit → LED allumée");

const veilleur2b = `const int PIN_LDR = 4;
const int PIN_LED = 2;
const int PIN_BUZZER = 19;
const int SEUIL = 1800;
bool etaitNuit = false;
void setup() {
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  Serial.begin(115200);
}
void loop() {
  int luminosite = analogRead(PIN_LDR);
  Serial.println(luminosite);
  bool estNuit = (luminosite < SEUIL);
  digitalWrite(PIN_LED, estNuit ? HIGH : LOW);
  etaitNuit = estNuit;
  delay(100);
}`;
const rtVeilleur2b = createArduinoRuntime({ type: "esp32_upesy_lp", sketch: veilleur2b });
stepArduinoRuntime(rtVeilleur2b, 200, {}, { GPIO4: 4095 });
assert.equal(arduinoRuntimeLevels(rtVeilleur2b).GPIO2, 0, "4095 < 1800 faux → jour → LED éteinte");
stepArduinoRuntime(rtVeilleur2b, 200, {}, { GPIO4: 200 });
assert.equal(arduinoRuntimeLevels(rtVeilleur2b).GPIO2, 1, "200 < 1800 → nuit → LED allumée");

const veilleur10 = `const int PIN_LDR = 4;
const int PIN_LED = 2;
const int SEUIL = 500;
void setup() {
  analogReadResolution(10);
  pinMode(PIN_LED, OUTPUT);
}
void loop() {
  int luminosite = analogRead(PIN_LDR);
  digitalWrite(PIN_LED, luminosite < SEUIL ? HIGH : LOW);
  delay(100);
}`;
const rt10 = createArduinoRuntime({ type: "esp32_upesy_lp", sketch: veilleur10 });
stepArduinoRuntime(rt10, 200, {}, { GPIO4: 2048 });
assert.equal(arduinoRuntimeLevels(rt10).GPIO2, 0, "10 bits : 2048→512, 512<500 faux → LED éteinte (~10 lx)");
stepArduinoRuntime(rt10, 200, {}, { GPIO4: 400 });
assert.equal(arduinoRuntimeLevels(rt10).GPIO2, 1, "10 bits : 400→100, 100<500 → LED allumée");

console.log("arduino-sketch-parse.test.mjs OK");
