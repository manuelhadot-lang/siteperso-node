/** Cartes microcontrôleur partagées (UNO, ESP32…). */
import { UNO_JONCTION_SUFFIX } from './arduino-uno-layout.js';
import { ESP32_JONCTION_SUFFIX } from './esp32-c3-layout.js';
import { ESP32_DEVKIT_JONCTION_SUFFIX } from './esp32-devkit-layout.js';
import { ESP32_UPESY_LP_JONCTION_SUFFIX } from './esp32-upesy-lp-layout.js';

export const MICRO_BOARD_TYPES = new Set(['arduino_uno', 'esp32_c3', 'esp32_devkit', 'esp32_upesy_lp']);

export function isMicroBoard(comp) {
    return !!comp && MICRO_BOARD_TYPES.has(comp.type);
}

export function microBoardPinLabelFromJonction(board, jonctionId) {
    if (!board?.label || !jonctionId?.startsWith(`${board.label}_`)) return null;
    const suffix = jonctionId.slice(board.label.length + 1);
    if (board.type === 'arduino_uno') {
        if (suffix in UNO_JONCTION_SUFFIX && /^D\d+$/.test(suffix)) return suffix;
    } else if (board.type === 'esp32_c3') {
        if (suffix in ESP32_JONCTION_SUFFIX && /^GPIO\d+$/.test(suffix)) return suffix;
    } else if (board.type === 'esp32_devkit') {
        if (suffix in ESP32_DEVKIT_JONCTION_SUFFIX && /^GPIO\d+$/.test(suffix)) return suffix;
    } else if (board.type === 'esp32_upesy_lp') {
        if (suffix in ESP32_UPESY_LP_JONCTION_SUFFIX && /^GPIO\d+$/.test(suffix)) return suffix;
    }
    return null;
}
