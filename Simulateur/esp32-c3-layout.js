/** Géométrie ESP32-C3 DevKitM-1 — brochage header (3,3 V logique). */
import { GRID_SIZE as G } from './grid-constants.js';

export const ESP32_BOX_L = -4 * G;
export const ESP32_BOX_R = 5 * G;
export const ESP32_BOX_T = -5 * G;
export const ESP32_BOX_B = 6 * G;
export const ESP32_JUNC_L = -5 * G;
export const ESP32_JUNC_R = 6 * G;
export const ESP32_LABEL_L = ESP32_BOX_L + G / 2;
export const ESP32_LABEL_R = ESP32_BOX_R - G / 2;
export const ESP32_HIT_DX = 6 * G + G / 2;
export const ESP32_HIT_DY = 6 * G + G / 2;

/** Broches header gauche (haut → bas) : alimentation + GPIO bas. */
export const ESP32_LEFT_PINS = [
    '3V3', 'GND', 'GND2', 'EN', 'GPIO0', 'GPIO1', 'GPIO2', 'GPIO3', 'GPIO4',
];

/** Broches header droit (haut → bas). */
export const ESP32_RIGHT_PINS = [
    'GPIO5', 'GPIO6', 'GPIO7', 'GPIO8', 'GPIO9', 'GPIO10', 'GPIO20', 'GPIO21', '5V',
];

export const ESP32_LEFT_PIN_Y = ESP32_LEFT_PINS.map((_, i) => (i - 4) * G);
export const ESP32_RIGHT_PIN_Y = ESP32_RIGHT_PINS.map((_, i) => (i - 4) * G);

export const ESP32_PIN = {};
ESP32_LEFT_PINS.forEach((name, i) => {
    ESP32_PIN[name] = i;
});
ESP32_RIGHT_PINS.forEach((name, i) => {
    ESP32_PIN[name] = ESP32_LEFT_PINS.length + i;
});

export const ESP32_PIN_COUNT = ESP32_LEFT_PINS.length + ESP32_RIGHT_PINS.length;
export const ESP32_JONCTION_SUFFIX = { ...ESP32_PIN };

/** Broches GPIO simulées (affichage pastilles en simulation). */
export const ESP32_GPIO_PINS = [
    'GPIO0', 'GPIO1', 'GPIO2', 'GPIO3', 'GPIO4', 'GPIO5', 'GPIO6', 'GPIO7',
    'GPIO8', 'GPIO9', 'GPIO10', 'GPIO20', 'GPIO21',
];

export const ESP32_LOGIC_VOLTS = 3.3;
export const ESP32_FQBN = 'esp32:esp32:esp32c3';
/** Seeed XIAO ESP32-C3 — téléversement USB (arduino-cli). */
export const ESP32_XIAO_FQBN = 'esp32:esp32:seeed_xiao_esp32c3';

import { ESP32_DEVKIT_UPLOAD_PROFILES } from './esp32-devkit-layout.js';
import { ESP32_UPESY_LP_UPLOAD_PROFILES } from './esp32-upesy-lp-layout.js';

export const ARDUINO_UNO_FQBN = 'arduino:avr:uno';

/** Profils FQBN pour compilation / téléversement USB. */
export const UPLOAD_PROFILES = {
    arduino_uno: [
        { id: 'uno', label: 'Arduino UNO R3', fqbn: ARDUINO_UNO_FQBN },
    ],
    esp32_c3: [
        { id: 'esp32c3', label: 'ESP32-C3 DevKit', fqbn: ESP32_FQBN },
        { id: 'xiao', label: 'Seeed XIAO ESP32-C3', fqbn: ESP32_XIAO_FQBN },
    ],
    esp32_devkit: ESP32_DEVKIT_UPLOAD_PROFILES,
    esp32_upesy_lp: ESP32_UPESY_LP_UPLOAD_PROFILES,
};

export function uploadProfilesForBoardType(boardType) {
    return UPLOAD_PROFILES[boardType] || UPLOAD_PROFILES.arduino_uno;
}

export function normalizeBoardFqbn(comp) {
    if (!comp) return ARDUINO_UNO_FQBN;
    const profiles = uploadProfilesForBoardType(comp.type);
    const fqbn = String(comp.fqbn || profiles[0]?.fqbn || ARDUINO_UNO_FQBN);
    if (profiles.some((p) => p.fqbn === fqbn)) return fqbn;
    if (comp.type === 'esp32_c3' && fqbn.includes('esp32')) return ESP32_FQBN;
    if (comp.type === 'esp32_devkit' && fqbn.includes('esp32')) return UPLOAD_PROFILES.esp32_devkit[0]?.fqbn || fqbn;
    if (comp.type === 'esp32_upesy_lp') return UPLOAD_PROFILES.esp32_upesy_lp[0]?.fqbn || 'esp32:esp32:esp32';
    return profiles[0]?.fqbn || ARDUINO_UNO_FQBN;
}

export function formatEsp32PinLabel(pinName) {
    if (pinName === 'GPIO8') return 'GPIO8 (LED/SDA)';
    if (pinName === 'GPIO9') return 'GPIO9 (SCL)';
    if (pinName === 'GPIO20') return 'GPIO20 (RX)';
    if (pinName === 'GPIO21') return 'GPIO21 (TX)';
    return pinName;
}

export function esp32C3JonctionToTerminalKey(label, jonctionId) {
    if (!label || !jonctionId?.startsWith(`${label}_`)) return null;
    const suffix = jonctionId.slice(label.length + 1);
    const idx = ESP32_JONCTION_SUFFIX[suffix];
    if (idx === undefined) return null;
    return `${label}#${idx}`;
}

export function esp32C3TerminalKeys(label) {
    const keys = [];
    for (let i = 0; i < ESP32_PIN_COUNT; i++) keys.push(`${label}#${i}`);
    return keys;
}

export const DEFAULT_ESP32_SKETCH = `// ESP32-C3 DevKit — sketch minimal
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
