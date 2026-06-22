/** Grove LCD RGB 2×16 I2C — géométrie calée grille, centré sur comp.x/y (origine = centre du boîtier). */
import { GRID_SIZE as G } from './state.js';

export const GROVE_LCD_COLS = 16;
export const GROVE_LCD_ROWS = 2;
export const GROVE_LCD_DEFAULT_I2C = 0x3e;

export const GROVE_LCD_PINS = ['SDA', 'SCL', 'VCC', 'GND'];
export const GROVE_LCD_PIN_COUNT = GROVE_LCD_PINS.length;

/** Boîtier : 12 pas (long) × 4 pas (haut). */
export const GROVE_LCD_BOX_W = 12 * G;
export const GROVE_LCD_BOX_H = 4 * G;
export const GROVE_LCD_BOX_L = -GROVE_LCD_BOX_W / 2;
export const GROVE_LCD_BOX_R = GROVE_LCD_BOX_W / 2;

/** Boîtier centré sur l’origine ; broches calées grille, réparties sur la hauteur. */
const _wireCenterY = 0;
export const GROVE_LCD_BOX_T = _wireCenterY - GROVE_LCD_BOX_H / 2;
export const GROVE_LCD_BOX_B = _wireCenterY + GROVE_LCD_BOX_H / 2;

/** 4 broches (pas entiers × G), du haut vers le bas du boîtier. */
export const GROVE_LCD_PIN_Y = [-1.5, -0.5, 0.5, 1.5].map((f) => f * G);

/** Connecteur Grove : 1 pas de large, bord gauche du boîtier. */
export const GROVE_LCD_CONNECTOR_W = G;
export const GROVE_LCD_CONN_L = GROVE_LCD_BOX_L;

/** Pattes : 6 pas vers la gauche (jonctions plus éloignées du boîtier). */
export const GROVE_LCD_STUB_LEN = 6 * G;
export const GROVE_LCD_JUNC_X = GROVE_LCD_CONN_L - GROVE_LCD_STUB_LEN;

export const GROVE_LCD_BEZEL = 1;
export const GROVE_LCD_SEL_L = GROVE_LCD_JUNC_X - 4;
export const GROVE_LCD_SEL_T = GROVE_LCD_BOX_T - 4;
export const GROVE_LCD_SEL_W = GROVE_LCD_BOX_R - GROVE_LCD_SEL_L + 4;
export const GROVE_LCD_SEL_H = GROVE_LCD_BOX_H + 8;

export const GROVE_LCD_PIN_LABEL_X = (GROVE_LCD_JUNC_X + GROVE_LCD_CONN_L) / 2;

export const GROVE_LCD_HIT_DX = Math.max(-GROVE_LCD_SEL_L, GROVE_LCD_BOX_R) + 4;
export const GROVE_LCD_HIT_DY = GROVE_LCD_BOX_H / 2 + 16;

/** Zone verte (écran) : à droite du connecteur, dans le cadre. */
export const GROVE_LCD_SCREEN_L = GROVE_LCD_BOX_L + GROVE_LCD_CONNECTOR_W + GROVE_LCD_BEZEL;
export const GROVE_LCD_SCREEN_R = GROVE_LCD_BOX_R - GROVE_LCD_BEZEL;
export const GROVE_LCD_SCREEN_T = GROVE_LCD_BOX_T + GROVE_LCD_BEZEL;
export const GROVE_LCD_SCREEN_B = GROVE_LCD_BOX_B - GROVE_LCD_BEZEL;
