/** Grove BMP280 (pression / T° I²C) — géométrie calée grille, origine = centre du module. */
import { GRID_SIZE as G } from './state.js';

export const GROVE_BMP280_PINS = ['SDA', 'SCL', 'VCC', 'GND'];
export const GROVE_BMP280_PIN_COUNT = GROVE_BMP280_PINS.length;
export const GROVE_BMP280_DEFAULT_I2C = 0x76;

export const GROVE_BMP280_BOX_W = 8 * G;
export const GROVE_BMP280_BOX_H = 3.5 * G;
export const GROVE_BMP280_BOX_L = -GROVE_BMP280_BOX_W / 2;
export const GROVE_BMP280_BOX_R = GROVE_BMP280_BOX_W / 2;

const GROVE_BMP280_Y_NUDGE = G / 2;
export const GROVE_BMP280_PIN_Y = [-1.5, -0.5, 0.5, 1.5].map((f) => f * G + GROVE_BMP280_Y_NUDGE);

const _wireCenterY = (GROVE_BMP280_PIN_Y[0] + GROVE_BMP280_PIN_Y[GROVE_BMP280_PIN_COUNT - 1]) / 2;
export const GROVE_BMP280_BOX_T = _wireCenterY - GROVE_BMP280_BOX_H / 2;
export const GROVE_BMP280_BOX_B = _wireCenterY + GROVE_BMP280_BOX_H / 2;

export const GROVE_BMP280_CONNECTOR_W = G;
export const GROVE_BMP280_CONN_L = GROVE_BMP280_BOX_L;
export const GROVE_BMP280_STUB_LEN = 4 * G;
export const GROVE_BMP280_JUNC_X = GROVE_BMP280_CONN_L - GROVE_BMP280_STUB_LEN;

export const GROVE_BMP280_SEL_L = GROVE_BMP280_JUNC_X - 4;
export const GROVE_BMP280_SEL_T = GROVE_BMP280_BOX_T - 4;
export const GROVE_BMP280_SEL_W = GROVE_BMP280_BOX_R - GROVE_BMP280_SEL_L + 4;
export const GROVE_BMP280_SEL_H = GROVE_BMP280_BOX_H + 8;

export const GROVE_BMP280_PIN_LABEL_X = (GROVE_BMP280_JUNC_X + GROVE_BMP280_CONN_L) / 2;
export const GROVE_BMP280_HIT_DX = Math.max(-GROVE_BMP280_SEL_L, GROVE_BMP280_BOX_R) + 4;
export const GROVE_BMP280_HIT_DY = GROVE_BMP280_BOX_H / 2 + 14;

export const GROVE_BMP280_SENSOR_L = GROVE_BMP280_BOX_L + GROVE_BMP280_CONNECTOR_W + 4;
export const GROVE_BMP280_SENSOR_R = GROVE_BMP280_BOX_R - 6;
export const GROVE_BMP280_SENSOR_T = GROVE_BMP280_BOX_T + 4;
export const GROVE_BMP280_SENSOR_B = GROVE_BMP280_BOX_B - 4;
