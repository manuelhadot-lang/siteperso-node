/**
 * Matrice LED 8×8 — pilotage idéal GPIO (lignes hautes, colonnes basses).
 */

import { traceJonctionToIdealVolts } from "./arduino-gpio-ideal.mjs";
import { isMicroBoardType } from "./micro-board-config.mjs";

const MATRIX_LIT_DELTA_V = 0.35;
const SIZE = 8;
/** Fréquence mini (Hz) du cycle complet de balayage pour fusionner l’image (persistance ~20 img/s). */
export const MATRIX_PERSISTENCE_MIN_HZ = 20;

function boardsWithPinPhases(components) {
    return components.some((c) => isMicroBoardType(c.type) && c.pinPhases?.length >= 2);
}

/** Fréquence (Hz) du cycle complet pinPhases (somme des durées = une image). */
export function multiplexScanHz(components) {
    let minHz = Infinity;
    let found = false;
    for (const comp of components) {
        if (!isMicroBoardType(comp.type) || !comp.pinPhases?.length) continue;
        const scanMs = multiplexScanPeriodMs(comp.pinPhases);
        if (scanMs <= 0) continue;
        found = true;
        minHz = Math.min(minHz, 1000 / scanMs);
    }
    return found && Number.isFinite(minHz) ? minHz : 0;
}

function phasesFingerprint(ph) {
    return `${ph.durationMs || 0}|${JSON.stringify(ph.levels || {})}`;
}

/** Période d'une image complète (un tour de loop), même si pinPhases duplique le motif. */
export function multiplexScanPeriodMs(pinPhases) {
    if (!pinPhases?.length) return 0;
    const n = pinPhases.length;
    for (let period = 1; period <= n; period++) {
        if (n % period !== 0) continue;
        let ok = true;
        for (let i = period; i < n; i++) {
            if (phasesFingerprint(pinPhases[i]) !== phasesFingerprint(pinPhases[i % period])) {
                ok = false;
                break;
            }
        }
        if (ok) {
            let ms = 0;
            for (let i = 0; i < period; i++) ms += pinPhases[i].durationMs || 0;
            return ms;
        }
    }
    return pinPhases.reduce((s, p) => s + (p.durationMs || 0), 0);
}

/** Scan ≥ 20 Hz → image fixe. Scan plus lent → balayage colonne par colonne. */
function shouldMergeMultiplexPhases(components) {
    if (!boardsWithPinPhases(components)) return false;
    return multiplexScanHz(components) >= MATRIX_PERSISTENCE_MIN_HZ;
}

function sampleMatrixFrame(matrixLabel, components, wires, tSec, autoJunctions) {
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
    return { cells, anyLit, anyDrive };
}

/** Fusionne toutes les phases GPIO (multiplexage colonne par colonne). */
function mergeMatrixFromPinPhases(matrixLabel, components, wires, autoJunctions) {
    const merged = {};
    let anyLit = false;
    let anyDrive = false;

    for (const comp of components) {
        if (!isMicroBoardType(comp.type) || !comp.pinPhases?.length) continue;
        for (const ph of comp.pinPhases) {
            const savedLive = comp.liveLevels;
            comp.liveLevels = ph.levels || {};
            const frame = sampleMatrixFrame(matrixLabel, components, wires, 0, autoJunctions);
            comp.liveLevels = savedLive;
            if (!frame) continue;
            anyDrive = true;
            for (const [key, on] of Object.entries(frame.cells)) {
                if (on) {
                    merged[key] = true;
                    anyLit = true;
                } else if (!(key in merged)) {
                    merged[key] = false;
                }
            }
        }
    }

    if (!anyDrive) return null;
    return { cells: merged, anyLit };
}

export function getIdealMatrix8x8FromArduino(matrixLabel, components, wires, tSec = 0, autoJunctions = []) {
    if (!matrixLabel) return null;

    if (shouldMergeMultiplexPhases(components)) {
        const fromPhases = mergeMatrixFromPinPhases(matrixLabel, components, wires, autoJunctions);
        if (fromPhases?.anyLit) return fromPhases;
    }

    return sampleMatrixFrame(matrixLabel, components, wires, tSec, autoJunctions);
}
