/** Bargraph DC10H (Lite-On) — 10 segments, cathode commune. s1 = barre du bas, s10 = barre du haut. */
/** Jonctions sur multiples de 20 (GRID_SIZE) pour coïncider avec snapToGrid. */

export const DC10H_SEG_COUNT = 10;
export const DC10H_SEG_NAMES = Array.from({ length: DC10H_SEG_COUNT }, (_, i) => `s${i + 1}`);

export const DC10H_BOX_L = -20;
export const DC10H_BOX_R = 40;
export const DC10H_BOX_T = -100;
/** Cadre blanc jusqu'au segment du bas (s1, y=100) inclus. */
export const DC10H_BOX_B = 120;

export const DC10H_JUNC_L = -40;
/** Jonctions à droite (flip X) — même écart de 20 px que JUNC_L → BOX_L. */
export const DC10H_JUNC_R = 60;
export const DC10H_STUB_LEN = DC10H_BOX_L - DC10H_JUNC_L;
export const DC10H_BOX_CX = (DC10H_BOX_L + DC10H_BOX_R) / 2;

/** s1 (bas, y=100) … s10 (haut, y=-80) — pas de 20 px. */
export const DC10H_PIN_Y = [100, 80, 60, 40, 20, 0, -20, -40, -60, -80];

export const DC10H_COM_X = 20;
export const DC10H_COM_Y = 140;

export const DC10H_BAR_H = 12;

/** Décalage du nom composant au-dessus du cadre (repère local, côté s10). */
export const DC10H_COMP_LABEL_OFFSET = 22;
/** Décalage « DC10H » sous la jonction COM (repère local). */
export const DC10H_TYPE_LABEL_OFFSET = 16;
/** Décalage des noms de broches hors des fils (repère local, côté jonctions). */
export const DC10H_PIN_LABEL_OFFSET_X = -12;
export const DC10H_COM_LABEL_OFFSET_X = 10;

export const DC10H_SEL_L = DC10H_JUNC_L - 4;
export const DC10H_SEL_T = DC10H_BOX_T - DC10H_COMP_LABEL_OFFSET - 10;
export const DC10H_SEL_W = DC10H_JUNC_R + 4 - DC10H_SEL_L;
export const DC10H_SEL_H = DC10H_COM_Y + DC10H_TYPE_LABEL_OFFSET + 10 - DC10H_SEL_T;

export const DC10H_HIT_DX = Math.max(-DC10H_SEL_L, DC10H_SEL_L + DC10H_SEL_W) + 4;
export const DC10H_HIT_DY = DC10H_SEL_H / 2 + 4;

export const DC10H_COLOR_IDS = ['red', 'green', 'amber', 'blue', 'yellow'];

export const DC10H_COLORS = {
    red: { lit: '#ff1744', dim: '#3d0a0a', pin: '#ff1744', label: 'Rouge' },
    green: { lit: '#00e676', dim: '#0a2e14', pin: '#00e676', label: 'Vert' },
    amber: { lit: '#ffab00', dim: '#3a2800', pin: '#ffab00', label: 'Ambre' },
    blue: { lit: '#448aff', dim: '#0a1a3a', pin: '#448aff', label: 'Bleu' },
    yellow: { lit: '#ffea00', dim: '#3a3500', pin: '#ffea00', label: 'Jaune' },
};

export function dc10hPalette(colorId) {
    return DC10H_COLORS[colorId] || DC10H_COLORS.red;
}

export function nextDc10hColor(colorId) {
    const idx = DC10H_COLOR_IDS.indexOf(colorId);
    const next = idx < 0 ? 0 : (idx + 1) % DC10H_COLOR_IDS.length;
    return DC10H_COLOR_IDS[next];
}

/** Y du haut de la barre pour le segment s(segIndex+1), centrée sur la patte. */
export function dc10hBarTopY(segIndex) {
    return DC10H_PIN_Y[segIndex] - DC10H_BAR_H / 2;
}

/** Position X de COM (symétrique par rapport au centre du boîtier). */
export function dc10hComX(flipX) {
    return flipX ? 2 * DC10H_BOX_CX - DC10H_COM_X : DC10H_COM_X;
}
