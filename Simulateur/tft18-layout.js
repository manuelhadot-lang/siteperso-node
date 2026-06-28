/** Joy-it RB-TFT1.8 (ST7735R, 128×160, SPI) — géométrie grille, origine = centre du module. */
import { GRID_SIZE as G } from './state.js';

export const TFT18_WIDTH = 128;
export const TFT18_HEIGHT = 160;

/** Broches header (Joy-it manual, câblage Arduino UNO type). */
export const TFT18_PINS = ['VCC', 'GND', 'SCL', 'SDA', 'RES', 'DC', 'CS'];
export const TFT18_PIN_COUNT = TFT18_PINS.length;

export const TFT18_BOX_W = 10 * G;
export const TFT18_BOX_H = 7 * G;
export const TFT18_BOX_L = -TFT18_BOX_W / 2;
export const TFT18_BOX_R = TFT18_BOX_W / 2;

/** Boîtier centré sur l’origine ; broches calées grille, réparties sur la hauteur. */
const _wireCenterY = 0;
export const TFT18_BOX_T = _wireCenterY - TFT18_BOX_H / 2;
export const TFT18_BOX_B = _wireCenterY + TFT18_BOX_H / 2;

/** 7 broches (pas entiers × G), du haut vers le bas du boîtier. */
export const TFT18_PIN_Y = [-3, -2, -1, 0, 1, 2, 3].map((f) => f * G);

export const TFT18_CONNECTOR_W = G;
export const TFT18_CONN_L = TFT18_BOX_L;
export const TFT18_STUB_LEN = 6 * G;
export const TFT18_JUNC_X = TFT18_CONN_L - TFT18_STUB_LEN;

export const TFT18_BEZEL = 1;
export const TFT18_SCREEN_L = TFT18_BOX_L + TFT18_CONNECTOR_W + TFT18_BEZEL;
export const TFT18_SCREEN_R = TFT18_BOX_R - TFT18_BEZEL;
export const TFT18_SCREEN_T = TFT18_BOX_T + TFT18_BEZEL;
export const TFT18_SCREEN_B = TFT18_BOX_B - TFT18_BEZEL;

export const TFT18_SEL_L = TFT18_JUNC_X - 4;
export const TFT18_SEL_T = TFT18_BOX_T - 4;
export const TFT18_SEL_W = TFT18_BOX_R - TFT18_SEL_L + 4;
export const TFT18_SEL_H = TFT18_BOX_H + 8;

export const TFT18_PIN_LABEL_X = (TFT18_JUNC_X + TFT18_CONN_L) / 2;
export const TFT18_HIT_DX = Math.max(-TFT18_SEL_L, TFT18_BOX_R) + 4;
export const TFT18_HIT_DY = TFT18_BOX_H / 2 + 18;

/** Broches SPI matérielles par défaut (câblage Joy-it / Arduino). */
export const TFT18_SPI_DEFAULTS = {
    arduino_uno: { SCL: 'D13', SDA: 'D11', CS: 'D10', DC: 'D8', RES: 'D9' },
    esp32_c3: { SCL: 'GPIO8', SDA: 'GPIO10', CS: 'GPIO6', DC: 'GPIO7', RES: 'GPIO5' },
    esp32_devkit: { SCL: 'GPIO18', SDA: 'GPIO23', CS: 'GPIO5', DC: 'GPIO16', RES: 'GPIO17' },
};
