/** Grove TSL2591 (luminosité I²C) — géométrie calée grille, origine = centre du module. */
import { GRID_SIZE as G } from './state.js';

export const GROVE_TSL2591_PINS = ['SDA', 'SCL', 'VCC', 'GND'];
export const GROVE_TSL2591_PIN_COUNT = GROVE_TSL2591_PINS.length;
export const GROVE_TSL2591_DEFAULT_I2C = 0x29;

/** PCB bleu ~ 8×3,5 pas (comme DHT22 Grove). */
export const GROVE_TSL2591_BOX_W = 8 * G;
export const GROVE_TSL2591_BOX_H = 3.5 * G;
export const GROVE_TSL2591_BOX_L = -GROVE_TSL2591_BOX_W / 2;
export const GROVE_TSL2591_BOX_R = GROVE_TSL2591_BOX_W / 2;

const GROVE_TSL2591_Y_NUDGE = G / 2;
export const GROVE_TSL2591_PIN_Y = [-1.5, -0.5, 0.5, 1.5].map((f) => f * G + GROVE_TSL2591_Y_NUDGE);

const _wireCenterY = (GROVE_TSL2591_PIN_Y[0] + GROVE_TSL2591_PIN_Y[GROVE_TSL2591_PIN_COUNT - 1]) / 2;
export const GROVE_TSL2591_BOX_T = _wireCenterY - GROVE_TSL2591_BOX_H / 2;
export const GROVE_TSL2591_BOX_B = _wireCenterY + GROVE_TSL2591_BOX_H / 2;

export const GROVE_TSL2591_CONNECTOR_W = G;
export const GROVE_TSL2591_CONN_L = GROVE_TSL2591_BOX_L;
export const GROVE_TSL2591_STUB_LEN = 4 * G;
export const GROVE_TSL2591_JUNC_X = GROVE_TSL2591_CONN_L - GROVE_TSL2591_STUB_LEN;

export const GROVE_TSL2591_SEL_L = GROVE_TSL2591_JUNC_X - 4;
export const GROVE_TSL2591_SEL_T = GROVE_TSL2591_BOX_T - 4;
export const GROVE_TSL2591_SEL_W = GROVE_TSL2591_BOX_R - GROVE_TSL2591_SEL_L + 4;
export const GROVE_TSL2591_SEL_H = GROVE_TSL2591_BOX_H + 8;

export const GROVE_TSL2591_PIN_LABEL_X = (GROVE_TSL2591_JUNC_X + GROVE_TSL2591_CONN_L) / 2;
export const GROVE_TSL2591_HIT_DX = Math.max(-GROVE_TSL2591_SEL_L, GROVE_TSL2591_BOX_R) + 4;
export const GROVE_TSL2591_HIT_DY = GROVE_TSL2591_BOX_H / 2 + 14;

/** Zone capteur (filtre IR) à droite du connecteur. */
export const GROVE_TSL2591_SENSOR_L = GROVE_TSL2591_BOX_L + GROVE_TSL2591_CONNECTOR_W + 4;
export const GROVE_TSL2591_SENSOR_R = GROVE_TSL2591_BOX_R - 6;
export const GROVE_TSL2591_SENSOR_T = GROVE_TSL2591_BOX_T + 4;
export const GROVE_TSL2591_SENSOR_B = GROVE_TSL2591_BOX_B - 4;
