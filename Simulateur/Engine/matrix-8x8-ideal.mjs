/**
 * Matrice LED 8×8 — pilotage idéal GPIO (lignes hautes, colonnes basses).
 */

import { traceJonctionToIdealVolts } from "./arduino-gpio-ideal.mjs";

const MATRIX_LIT_DELTA_V = 0.35;
const SIZE = 8;

export function getIdealMatrix8x8FromArduino(matrixLabel, components, wires, tSec = 0, autoJunctions = []) {
    if (!matrixLabel) return null;
    const rowV = new Array(SIZE).fill(null);
    const colV = new Array(SIZE).fill(null);
    let anyDrive = false;
    for (let r = 0; r < SIZE; r++) {
        const v = traceJonctionToIdealVolts(`${matrixLabel}_R${r}`, components, wires, tSec, autoJunctions);
        rowV[r] = v;
        if (v != null) anyDrive = true;
    }
    for (let c = 0; c < SIZE; c++) {
        const v = traceJonctionToIdealVolts(`${matrixLabel}_C${c}`, components, wires, tSec, autoJunctions);
        colV[c] = v;
        if (v != null) anyDrive = true;
    }
    if (!anyDrive) return null;
    const cells = {};
    let anyLit = false;
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            const vr = rowV[r];
            const vc = colV[c];
            const on = vr != null && vc != null && vr - vc >= MATRIX_LIT_DELTA_V;
            cells[`r${r}c${c}`] = on;
            if (on) anyLit = true;
        }
    }
    return { cells, anyLit };
}
