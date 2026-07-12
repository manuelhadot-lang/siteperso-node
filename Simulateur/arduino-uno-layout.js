/** Géométrie Arduino UNO R3 — brochage réel (headers power/analog + digital). */
import { GRID_SIZE as G } from './grid-constants.js';

export const UNO_BOX_L = -4 * G;
export const UNO_BOX_R = 5 * G;
export const UNO_BOX_T = -7 * G;
export const UNO_BOX_B = 8 * G;
export const UNO_JUNC_L = -5 * G;
export const UNO_JUNC_R = 6 * G;
export const UNO_LABEL_L = UNO_BOX_L + G / 2;
export const UNO_LABEL_R = UNO_BOX_R - G / 2;
export const UNO_HIT_DX = 6 * G + G / 2;
export const UNO_HIT_DY = 8 * G + G / 2;

/** Broches header gauche (haut → bas) : alimentation + analogique. */
export const UNO_LEFT_PINS = [
    'IOREF', 'RESET', '3V3', '5V', 'GND', 'GND2', 'VIN',
    'A0', 'A1', 'A2', 'A3', 'A4', 'A5',
];

/** Broches header droit (haut → bas) : D13 → D0. */
export const UNO_RIGHT_PINS = [
    'D13', 'D12', 'D11', 'D10', 'D9', 'D8', 'D7', 'D6',
    'D5', 'D4', 'D3', 'D2', 'D1', 'D0',
];

export const UNO_LEFT_PIN_Y = UNO_LEFT_PINS.map((_, i) => (i - 6) * G);

/** 14 broches : positions entières sur la grille (évite le décalage i - 6.5). */
export const UNO_RIGHT_PIN_Y = UNO_RIGHT_PINS.map((_, i) => (i - 6) * G);

/** Indice SPICE #0…#26 (ordre : gauche puis droite). */
export const UNO_PIN = {};
UNO_LEFT_PINS.forEach((name, i) => {
    UNO_PIN[name] = i;
});
UNO_RIGHT_PINS.forEach((name, i) => {
    UNO_PIN[name] = UNO_LEFT_PINS.length + i;
});

export const UNO_PIN_COUNT = UNO_LEFT_PINS.length + UNO_RIGHT_PINS.length;

export const UNO_JONCTION_SUFFIX = { ...UNO_PIN };

export const UNO_DIGITAL_PINS = UNO_RIGHT_PINS.slice().reverse();
export const UNO_ANALOG_PINS = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'];

/**
 * Numéro de broche du boîtier DIP-28 ATmega328P (datasheet Microchip).
 * Correspond aux signaux GPIO du header Arduino UNO R3.
 */
export const UNO_ATMEGA328P_DIP = {
    RESET: 1,
    D0: 2,
    D1: 3,
    D2: 4,
    D3: 5,
    D4: 6,
    D5: 11,
    D6: 12,
    D7: 13,
    D8: 14,
    D9: 15,
    D10: 16,
    D11: 17,
    D12: 18,
    D13: 19,
    A0: 23,
    A1: 24,
    A2: 25,
    A3: 26,
    A4: 27,
    A5: 28,
};

/** Libellé broche header : « D0 (2) » si numéro MCU connu. */
export function formatUnoPinLabel(pinName) {
    const n = UNO_ATMEGA328P_DIP[pinName];
    return n != null ? `${pinName} (${n})` : pinName;
}

export function arduinoUnoJonctionToTerminalKey(label, jonctionId) {
    if (!label || !jonctionId?.startsWith(`${label}_`)) return null;
    const suffix = jonctionId.slice(label.length + 1);
    const idx = UNO_JONCTION_SUFFIX[suffix];
    if (idx === undefined) return null;
    return `${label}#${idx}`;
}

export function arduinoUnoTerminalKeys(label) {
    const keys = [];
    for (let i = 0; i < UNO_PIN_COUNT; i++) keys.push(`${label}#${i}`);
    return keys;
}

export const DEFAULT_ARDUINO_SKETCH = `// Arduino UNO — sketch minimal
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
