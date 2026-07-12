/** Géométrie ESP32 DevKit V1 (WROOM-32) — ~30 GPIO, logique 3,3 V. */
import { GRID_SIZE as G } from './grid-constants.js';

export const ESP32_DEVKIT_BOX_L = -4 * G;
export const ESP32_DEVKIT_BOX_R = 5 * G;
export const ESP32_DEVKIT_BOX_T = -10 * G;
export const ESP32_DEVKIT_BOX_B = 9 * G;
export const ESP32_DEVKIT_JUNC_L = -5 * G;
export const ESP32_DEVKIT_JUNC_R = 6 * G;
export const ESP32_DEVKIT_LABEL_L = ESP32_DEVKIT_BOX_L + G / 2;
export const ESP32_DEVKIT_LABEL_R = ESP32_DEVKIT_BOX_R - G / 2;
export const ESP32_DEVKIT_HIT_DX = 6 * G + G / 2;
export const ESP32_DEVKIT_HIT_DY = 10 * G + G / 2;

/** Brochage DOIT ESP32 DevKit V1 (header gauche, haut → bas). */
export const ESP32_DEVKIT_LEFT_PINS = [
    '3V3', 'EN', 'GPIO36', 'GPIO39', 'GPIO34', 'GPIO35', 'GPIO32', 'GPIO33',
    'GPIO25', 'GPIO26', 'GPIO27', 'GPIO14', 'GPIO12', 'GND', 'GPIO13', 'GPIO9', 'GPIO10', 'GPIO11',
];

/** Header droit (haut → bas). */
export const ESP32_DEVKIT_RIGHT_PINS = [
    'GPIO23', 'GPIO22', 'GPIO1', 'GPIO3', 'GPIO21', 'GND2', 'GPIO19', 'GPIO18',
    'GPIO5', 'GPIO17', 'GPIO16', 'GPIO4', 'GPIO2', 'GPIO15', 'GPIO8', 'GPIO0', 'GPIO6', '5V',
];

/** Indices 0…17 — pas de 20 px, centre entre i=8 et i=9 (y=0). */
export const ESP32_DEVKIT_LEFT_PIN_Y = ESP32_DEVKIT_LEFT_PINS.map((_, i) => (i - 9) * G);
export const ESP32_DEVKIT_RIGHT_PIN_Y = ESP32_DEVKIT_RIGHT_PINS.map((_, i) => (i - 9) * G);

export const ESP32_DEVKIT_PIN = {};
ESP32_DEVKIT_LEFT_PINS.forEach((name, i) => {
    ESP32_DEVKIT_PIN[name] = i;
});
ESP32_DEVKIT_RIGHT_PINS.forEach((name, i) => {
    ESP32_DEVKIT_PIN[name] = ESP32_DEVKIT_LEFT_PINS.length + i;
});

export const ESP32_DEVKIT_PIN_COUNT = ESP32_DEVKIT_LEFT_PINS.length + ESP32_DEVKIT_RIGHT_PINS.length;
export const ESP32_DEVKIT_JONCTION_SUFFIX = { ...ESP32_DEVKIT_PIN };

/** Broches GPIO simulées (pastilles en simulation). */
export const ESP32_DEVKIT_GPIO_PINS = [
    ...ESP32_DEVKIT_LEFT_PINS,
    ...ESP32_DEVKIT_RIGHT_PINS,
].filter((n) => /^GPIO\d+$/.test(n));

export const ESP32_DEVKIT_LOGIC_VOLTS = 3.3;
export const ESP32_DEVKIT_FQBN = 'esp32:esp32:esp32';

export const ESP32_DEVKIT_UPLOAD_PROFILES = [
    { id: 'esp32', label: 'ESP32 DevKit (WROOM-32)', fqbn: ESP32_DEVKIT_FQBN },
    { id: 'doit', label: 'DOIT DevKit V1', fqbn: 'esp32:esp32:esp32doit-devkit-v1' },
];

export function formatEsp32DevkitPinLabel(pinName) {
    if (pinName === 'GPIO1') return 'GPIO1 (TX0)';
    if (pinName === 'GPIO3') return 'GPIO3 (RX0)';
    if (pinName === 'GPIO2') return 'GPIO2 (LED)';
    if (pinName === 'GPIO21') return 'GPIO21 (SDA)';
    if (pinName === 'GPIO22') return 'GPIO22 (SCL)';
    if (pinName === 'GPIO17') return 'GPIO17 (TX2)';
    if (pinName === 'GPIO16') return 'GPIO16 (RX2)';
    return pinName;
}

export function esp32DevkitJonctionToTerminalKey(label, jonctionId) {
    if (!label || !jonctionId?.startsWith(`${label}_`)) return null;
    const suffix = jonctionId.slice(label.length + 1);
    const idx = ESP32_DEVKIT_JONCTION_SUFFIX[suffix];
    if (idx === undefined) return null;
    return `${label}#${idx}`;
}

export function esp32DevkitTerminalKeys(label) {
    const keys = [];
    for (let i = 0; i < ESP32_DEVKIT_PIN_COUNT; i++) keys.push(`${label}#${i}`);
    return keys;
}

export const DEFAULT_ESP32_DEVKIT_SKETCH = `// ESP32 DevKit (WROOM-32) — sketch minimal
void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(500);
  digitalWrite(LED_BUILTIN, LOW);
  delay(500);
}
`;
