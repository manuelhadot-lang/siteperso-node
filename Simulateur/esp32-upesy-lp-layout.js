/** Géométrie uPesy ESP32 Wroom Low Power DevKit — 16+16 broches (KiCad uPesy). */
import { GRID_SIZE as G } from './grid-constants.js';

export const ESP32_UPESY_LP_BOX_L = -4 * G;
export const ESP32_UPESY_LP_BOX_R = 5 * G;
export const ESP32_UPESY_LP_BOX_T = -9 * G;
export const ESP32_UPESY_LP_BOX_B = 8 * G;
export const ESP32_UPESY_LP_JUNC_L = -5 * G;
export const ESP32_UPESY_LP_JUNC_R = 6 * G;
export const ESP32_UPESY_LP_LABEL_L = ESP32_UPESY_LP_BOX_L + G / 2;
export const ESP32_UPESY_LP_LABEL_R = ESP32_UPESY_LP_BOX_R - G / 2;
export const ESP32_UPESY_LP_HIT_DX = 6 * G + G / 2;
export const ESP32_UPESY_LP_HIT_DY = 9 * G + G / 2;

/**
 * Header gauche, haut → bas (symbole KiCad uPesy_ESP32_Wroom_Low_Power_DevKit).
 * GPIO6–11 non exposés (flash interne). GPIO35 = pont diviseur batterie (NC silkscreen).
 */
export const ESP32_UPESY_LP_LEFT_PINS = [
    'EN', 'GPIO36', 'GPIO39', 'GPIO34', 'GPIO35', 'GPIO32', 'GPIO33', 'GPIO25',
    'GPIO26', 'GPIO27', 'GPIO14', 'GPIO12', 'GPIO13', 'VIN', '5V', 'GND',
];

/** Header droit, haut → bas. */
export const ESP32_UPESY_LP_RIGHT_PINS = [
    'GPIO23', 'GPIO22', 'GPIO1', 'GPIO3', 'GPIO21', 'GPIO19', 'GPIO18', 'GPIO5',
    'GPIO17', 'GPIO16', 'GPIO4', 'GPIO0', 'GPIO2', 'GPIO15', '3V3', 'GND2',
];

/** 16 broches, un pas de grille, Y = (i - 8) × G (−8G … +7G). */
export const ESP32_UPESY_LP_LEFT_PIN_Y = ESP32_UPESY_LP_LEFT_PINS.map((_, i) => (i - 8) * G);
export const ESP32_UPESY_LP_RIGHT_PIN_Y = ESP32_UPESY_LP_RIGHT_PINS.map((_, i) => (i - 8) * G);

export const ESP32_UPESY_LP_PIN = {};
ESP32_UPESY_LP_LEFT_PINS.forEach((name, i) => {
    ESP32_UPESY_LP_PIN[name] = i;
});
ESP32_UPESY_LP_RIGHT_PINS.forEach((name, i) => {
    ESP32_UPESY_LP_PIN[name] = ESP32_UPESY_LP_LEFT_PINS.length + i;
});

export const ESP32_UPESY_LP_PIN_COUNT = ESP32_UPESY_LP_LEFT_PINS.length + ESP32_UPESY_LP_RIGHT_PINS.length;
export const ESP32_UPESY_LP_JONCTION_SUFFIX = { ...ESP32_UPESY_LP_PIN };

export const ESP32_UPESY_LP_GPIO_PINS = [
    ...ESP32_UPESY_LP_LEFT_PINS,
    ...ESP32_UPESY_LP_RIGHT_PINS,
].filter((n) => /^GPIO\d+$/.test(n));

export const ESP32_UPESY_LP_LOGIC_VOLTS = 3.3;
/** WROOM-32 générique : présent dans tous les cores Arduino-ESP32 (2.x et 3.x). */
export const ESP32_UPESY_LP_FQBN = 'esp32:esp32:esp32';
/** Id vendor (core 2.x) — casse exacte `uPesy_wroom` ; souvent absent en 3.x. */
export const ESP32_UPESY_LP_VENDOR_FQBN = 'esp32:esp32:uPesy_wroom';

export const ESP32_UPESY_LP_UPLOAD_PROFILES = [
    { id: 'esp32', label: 'ESP32 Dev Module (WROOM-32)', fqbn: ESP32_UPESY_LP_FQBN },
    { id: 'upesy_wroom', label: 'uPesy ESP32 Wroom DevKit (core 2.x)', fqbn: ESP32_UPESY_LP_VENDOR_FQBN },
];

/** Pont diviseur batterie : V_BAT = 1.435 × V_GPIO35 (doc uPesy). */
export const UPESY_VBAT_DIVIDER = 1.435;
export const UPESY_DEFAULT_VBAT = 3.7;
export const UPESY_VBAT_MIN = 3.0;
export const UPESY_VBAT_MAX = 4.3;

export function clampUpesyVbat(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return UPESY_DEFAULT_VBAT;
    return Math.max(UPESY_VBAT_MIN, Math.min(UPESY_VBAT_MAX, n));
}

export function upesyGpio35Volts(vbat) {
    return clampUpesyVbat(vbat) / UPESY_VBAT_DIVIDER;
}

export function formatEsp32UpesyLpPinLabel(pinName) {
    if (pinName === 'GPIO1') return 'GPIO1 (TX0)';
    if (pinName === 'GPIO3') return 'GPIO3 (RX0)';
    if (pinName === 'GPIO35') return 'GPIO35 (VBAT)';
    if (pinName === 'GPIO21') return 'GPIO21 (SDA)';
    if (pinName === 'GPIO22') return 'GPIO22 (SCL)';
    if (pinName === 'GPIO17') return 'GPIO17 (TX2)';
    if (pinName === 'GPIO16') return 'GPIO16 (RX2)';
    if (pinName === 'VIN') return 'VIN';
    return pinName;
}

export function esp32UpesyLpJonctionToTerminalKey(label, jonctionId) {
    if (!label || !jonctionId?.startsWith(`${label}_`)) return null;
    const suffix = jonctionId.slice(label.length + 1);
    const idx = ESP32_UPESY_LP_JONCTION_SUFFIX[suffix];
    if (idx === undefined) return null;
    return `${label}#${idx}`;
}

export function esp32UpesyLpTerminalKeys(label) {
    const keys = [];
    for (let i = 0; i < ESP32_UPESY_LP_PIN_COUNT; i++) keys.push(`${label}#${i}`);
    return keys;
}

export const DEFAULT_ESP32_UPESY_LP_SKETCH = `// uPesy ESP32 Wroom Low Power DevKit
// Pas de LED_BUILTIN. GPIO35 = tension batterie (pont 1,435).
// Maj + double-clic sur la carte : régler Vbat simulée (3,0–4,3 V).
// analogRead : 12 bits (0–4095), comme Arduino-ESP32.

void setup() {
  Serial.begin(115200);
}

void loop() {
  int raw = analogRead(35);
  float vBat = 1.435 * (raw / 4095.0) * 3.3;
  Serial.print("Vbat = ");
  Serial.print(vBat, 2);
  Serial.println(" V");
  delay(1000);
}
`;
