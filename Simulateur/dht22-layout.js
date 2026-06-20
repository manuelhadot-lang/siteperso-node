/** Grove DHT22 (T° / humidité) — géométrie calée grille, origine = centre du module. */
import { GRID_SIZE as G } from './state.js';

export const GROVE_DHT22_PINS = ['DATA', 'VCC', 'NC', 'GND'];
export const GROVE_DHT22_PIN_COUNT = GROVE_DHT22_PINS.length;

/** PCB bleu ~ 8×3,5 pas. */
export const GROVE_DHT22_BOX_W = 8 * G;
export const GROVE_DHT22_BOX_H = 3.5 * G;
export const GROVE_DHT22_BOX_L = -GROVE_DHT22_BOX_W / 2;
export const GROVE_DHT22_BOX_R = GROVE_DHT22_BOX_W / 2;

const GROVE_DHT22_Y_NUDGE = G / 2;
export const GROVE_DHT22_PIN_Y = [-1.5, -0.5, 0.5, 1.5].map((f) => f * G + GROVE_DHT22_Y_NUDGE);

const _wireCenterY = (GROVE_DHT22_PIN_Y[0] + GROVE_DHT22_PIN_Y[GROVE_DHT22_PIN_COUNT - 1]) / 2;
export const GROVE_DHT22_BOX_T = _wireCenterY - GROVE_DHT22_BOX_H / 2;
export const GROVE_DHT22_BOX_B = _wireCenterY + GROVE_DHT22_BOX_H / 2;

export const GROVE_DHT22_CONNECTOR_W = G;
export const GROVE_DHT22_CONN_L = GROVE_DHT22_BOX_L;
export const GROVE_DHT22_STUB_LEN = 4 * G;
export const GROVE_DHT22_JUNC_X = GROVE_DHT22_CONN_L - GROVE_DHT22_STUB_LEN;

export const GROVE_DHT22_SEL_L = GROVE_DHT22_JUNC_X - 4;
export const GROVE_DHT22_SEL_T = GROVE_DHT22_BOX_T - 4;
export const GROVE_DHT22_SEL_W = GROVE_DHT22_BOX_R - GROVE_DHT22_SEL_L + 4;
export const GROVE_DHT22_SEL_H = GROVE_DHT22_BOX_H + 8;

export const GROVE_DHT22_PIN_LABEL_X = (GROVE_DHT22_JUNC_X + GROVE_DHT22_CONN_L) / 2;
export const GROVE_DHT22_HIT_DX = Math.max(-GROVE_DHT22_SEL_L, GROVE_DHT22_BOX_R) + 4;
export const GROVE_DHT22_HIT_DY = GROVE_DHT22_BOX_H / 2 + 14;

/** Zone capteur blanc (grille perforée) à droite du connecteur. */
export const GROVE_DHT22_SENSOR_L = GROVE_DHT22_BOX_L + GROVE_DHT22_CONNECTOR_W + 4;
export const GROVE_DHT22_SENSOR_R = GROVE_DHT22_BOX_R - 6;
export const GROVE_DHT22_SENSOR_T = GROVE_DHT22_BOX_T + 4;
export const GROVE_DHT22_SENSOR_B = GROVE_DHT22_BOX_B - 4;
