// led-animation.js — clignotement LED à partir des courbes .tran (wrdata)
import { circuit, flags, simulationResults } from './state.js';
import { bcdDigitToSeg7Segments, bcdFromQVoltages } from './Engine/bcd-seg7.mjs';
import { quantizeVoltmeterReading } from './Engine/voltmeter-display.mjs';
import { resolveNetVoltage, readBoardAnalogInputs, reachableJonctionsViaSeriesPassives } from './Engine/arduino-analog-ideal.mjs';

export { quantizeVoltmeterReading };
import {
    detectHc90Cascade,
    hc90LabelForSeg7,
    hc90QBitForLed,
    hc90TranSampleTimeSec,
    idealHc90BcdForLabel,
    isHc90MasterResetActive,
    shouldUseIdealHc90Counting,
} from './Engine/hc90-cascade.mjs';
import {
    idealRippleMod10Bcd,
    shouldUseIdealRippleMod10Seg7,
} from './Engine/ripple-mod10.mjs';
import {
    applyArduinoSketchToComponent,
    arduinoGpioIsTimeVarying,
    resolvePinLevelsAt,
    createArduinoRuntime,
    stepArduinoRuntime,
    arduinoRuntimeLevels,
    sketchHasLoop,
    sketchUsesAnalogInput,
    getRuntimeSerialTx,
    injectRuntimeSerialRx,
    getRuntimeSerialMeta,
} from './Engine/arduino-sketch-parse.mjs';
import { sketchUsesSerial } from './Engine/arduino-uart-wave.mjs';
import { getVoltageAtJonction } from './geometry.js';
import { reachableJonctions } from './Engine/hc90-cascade.mjs';
import { readMicroBoardDigitalInputs } from './Engine/arduino-live-inputs.mjs';
import { isMicroBoard, microBoardPinLabelFromJonction } from './micro-board.js';
import { syncArduinoSketchesFromEditor } from './arduino-sketch-sync.js';
import {
    getIdealSeg7FromArduino,
    getIdealBargraphFromArduino,
    getIdealVoltmeterVoltage,
} from './Engine/arduino-gpio-ideal.mjs';
import { isGroveLcdWiredToBoard, refreshGroveLcdDisplayCache, getIdealGroveLcdDisplay } from './Engine/grove-lcd-ideal.mjs';
import { isJoyitTft18WiredToBoard, refreshJoyitTft18DisplayCache, getIdealJoyitTft18Display } from './Engine/tft18-ideal.mjs';
import { isGroveDht22WiredToBoard, getIdealDht22Reading, resolveDhtReadingsForBoard } from './Engine/dht22-ideal.mjs';
import { sketchUsesDht } from './Engine/dht22-sketch-parse.mjs';
import { isGroveTsl2591WiredToBoard, resolveTslReadingsForBoard } from './Engine/tsl2591-ideal.mjs';
import { isGroveBmp280WiredToBoard, resolveBmpReadingsForBoard } from './Engine/bmp280-ideal.mjs';
import { sketchUsesTsl2591 } from './Engine/tsl2591-sketch-parse.mjs';
import { sketchUsesBmp280 } from './Engine/bmp280-sketch-parse.mjs';
import { getIdealMatrix8x8FromArduino } from './Engine/matrix-8x8-ideal.mjs';

/** Au-delà de cette fréquence, persistance rétinienne : LED fixe (courant moyen). */
export const PERSISTENCE_FREQ_HZ = 50;

const LED_ON_A = 1e-4;
/** Courant simulé pour une LED HC90 en mode comptage idéal (Render / .tran court). */
const HC90_IDEAL_LED_ON_A = 0.008;
/** Courant simulé pour une LED pilotée par GPIO Arduino (animation idéale). */
const ARDUINO_IDEAL_LED_ON_A = 0.008;

/** Courant maxi recommandé pour une LED standard (au-delà → grillée). */
export const LED_MAX_SAFE_CURRENT_A = 0.02;

export function isLedOvercurrent(current) {
    return typeof current === 'number' && Number.isFinite(current) && Math.abs(current) > LED_MAX_SAFE_CURRENT_A;
}

let redraw = () => {};
const SEG7_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
const BARGRAPH_SEG_NAMES = Array.from({ length: 10 }, (_, i) => `s${i + 1}`);
const SEG7_LIT_DELTA_V = 0.35;

let anim = {
    rafId: null,
    startMs: 0,
    plots: {},
    vmPlots: {},
    seg7Plots: {},
    bargraphPlots: {},
    /** @type {Record<string, { q: Array<{ time: number[]; voltage: number[]; vth?: number } | null>; span: number }>} */
    hc90QPlots: {},
    /** Dernier BCD valide 0–9 par HC90 (filtre états transitoires > 9). */
    hc90LastBcd: {},
    /** MR1·MR2 actifs (reset asynchrone) sur le circuit courant. */
    hc90MrActive: false,
    /** @type {Record<string, number>} période (s) propre à chaque LED */
    ledPeriods: {},
    vmPeriods: {},
    /** @type {Record<string, boolean>} persistance rétinienne par LED */
    ledPersistence: {},
    /** @type {Record<string, number>} courant moyen si persistance */
    steadyCurrent: {},
    /** @type {ReturnType<typeof detectHc90Cascade>|null} */
    /** @type {Record<string, { pulse?: { highSec: number, lowSec: number }, level?: number }>} */
    arduinoLedDrive: {},
    /** @type {Record<string, number>} angle (deg) moteur DC */
    motorAngles: {},
    /** @type {Record<string, number>} angle palonnier servo (0–180°) */
    servoAngles: {},
    /** @type {Record<string, number>} consigne lissée servo */
    servoTargets: {},
    motorLastMs: 0,
};

export function bindLedAnimationRedraw(fn) {
    redraw = typeof fn === 'function' ? fn : () => {};
}

let onArduinoRuntimeTick = () => {};

/** Callback après chaque pas runtime UNO (ex. rafraîchir le moniteur série). */
export function bindArduinoRuntimeTick(fn) {
    onArduinoRuntimeTick = typeof fn === 'function' ? fn : () => {};
}

/* --- Runtime Arduino temps réel (sketches pilotés par digitalRead) --------- */

/** @type {Map<string, { rt: object, sketch: string }>} */
const arduinoRuntimes = new Map();
let lastRuntimeStepMs = 0;

/** Niveaux d'entrée live (boutons/interrupteurs vers une rampe) pour un UNO. */
function readUnoInputs(uno) {
    return readMicroBoardDigitalInputs(
        uno,
        circuit.components,
        circuit.wires,
        circuit.autoJunctions
    );
}

/** Avance (une fois par frame) les runtimes des UNO dont le sketch a un loop(). */
function updateArduinoRuntimes() {
    const now = performance.now();
    if (lastRuntimeStepMs <= 0) lastRuntimeStepMs = now;
    const deltaMs = now - lastRuntimeStepMs;
    lastRuntimeStepMs = now;
    const seen = new Set();
    for (const comp of circuit.components) {
        if (!isMicroBoard(comp)) continue;
        applyArduinoSketchToComponent(comp);
        if (!sketchHasLoop(comp.sketch || '')) {
            comp.liveLevels = null;
            comp.simTimeMs = null;
            continue;
        }
        seen.add(comp.label);
        let entry = arduinoRuntimes.get(comp.label);
        if (!entry || entry.sketch !== (comp.sketch || '')) {
            entry = { rt: createArduinoRuntime(comp), sketch: comp.sketch || '', lastAnalogKey: '' };
            arduinoRuntimes.set(comp.label, entry);
        }
        const analogInputs = readBoardAnalogInputs(comp, {
            components: circuit.components,
            wires: circuit.wires,
            autoJunctions: circuit.autoJunctions,
            tSec: getSimulationElapsedSec(),
            getVoltageAtJonction,
            voltmeters: simulationResults.voltmeters,
        });
        if (sketchUsesAnalogInput(comp.sketch || '')) {
            const analogKey = JSON.stringify(analogInputs);
            if (entry.lastAnalogKey && entry.lastAnalogKey !== analogKey) {
                entry.rt.gen = null;
                entry.rt.sleepMs = 0;
                entry.rt.idle = false;
            }
            entry.lastAnalogKey = analogKey;
        }
        entry.rt.state.dhtReadings = sketchUsesDht(comp.sketch || '')
            ? resolveDhtReadingsForBoard(
                comp,
                circuit.components,
                circuit.wires,
                circuit.autoJunctions
            )
            : null;
        entry.rt.state.tslReadings = sketchUsesTsl2591(comp.sketch || '')
            ? resolveTslReadingsForBoard(
                comp,
                circuit.components,
                circuit.wires,
                circuit.autoJunctions
            )
            : null;
        entry.rt.state.bmpReadings = sketchUsesBmp280(comp.sketch || '')
            ? resolveBmpReadingsForBoard(
                comp,
                circuit.components,
                circuit.wires,
                circuit.autoJunctions
            )
            : null;
        stepArduinoRuntime(entry.rt, deltaMs, readUnoInputs(comp), analogInputs);
        comp.liveLevels = arduinoRuntimeLevels(entry.rt);
        comp.simTimeMs = entry.rt.state.simTimeMs ?? 0;
        comp.serialLog = getRuntimeSerialTx(entry.rt);
        const serMeta = getRuntimeSerialMeta(entry.rt);
        comp.serialBegun = serMeta.begun;
        comp.serialBaud = serMeta.baud;
        if (entry.rt.state.regs) {
            comp.avrRegisters = { ...(comp.avrRegisters || {}), ...entry.rt.state.regs };
        }
    }
    for (const key of [...arduinoRuntimes.keys()]) {
        if (!seen.has(key)) arduinoRuntimes.delete(key);
    }
    onArduinoRuntimeTick();
}

function resetTftLiveInputState(components) {
    for (const c of components) {
        delete c._tftLastInputKey;
        delete c._tftInputChangedAtMs;
        delete c._tftSetupDone;
        delete c._tftLoopVars;
    }
}

export function resetTftLiveInputStateForCircuit(components) {
    resetTftLiveInputState(components);
}

function resetArduinoRuntimes() {
    arduinoRuntimes.clear();
    lastRuntimeStepMs = 0;
    for (const comp of circuit.components) {
        if (isMicroBoard(comp)) {
            comp.liveLevels = null;
            comp.simTimeMs = null;
            comp.serialLog = '';
            comp.serialBegun = false;
            comp.serialBaud = 0;
        }
    }
}

export { resetArduinoRuntimes };

/** Cartes UNO présentes sur le schéma. */
export function listUnoBoardLabels() {
    return circuit.components
        .filter((c) => isMicroBoard(c) && c.label)
        .map((c) => c.label);
}

export function getUnoSerialOutput(label) {
    const entry = arduinoRuntimes.get(label);
    if (entry) return getRuntimeSerialTx(entry.rt);
    const comp = circuit.components.find((c) => isMicroBoard(c) && c.label === label);
    return comp?.serialLog ?? '';
}

export function sendUnoSerialInput(label, text) {
    const entry = arduinoRuntimes.get(label);
    if (entry) injectRuntimeSerialRx(entry.rt, text);
}

export function clearUnoSerialOutput(label) {
    const entry = arduinoRuntimes.get(label);
    if (entry?.rt?.state?.serial) entry.rt.state.serial.tx = '';
    const comp = circuit.components.find((c) => isMicroBoard(c) && c.label === label);
    if (comp) comp.serialLog = '';
}

/** Après ouverture / chargement d'un schéma JSON (sketch depuis JSON, pas l'éditeur). */
export function onCircuitLoaded() {
    for (const comp of circuit.components) {
        if (isMicroBoard(comp)) applyArduinoSketchToComponent(comp);
    }
    refreshGroveLcdDisplayCache(circuit.components, circuit.wires, circuit.autoJunctions);
    refreshJoyitTft18DisplayCache(circuit.components, circuit.wires, circuit.autoJunctions);
    resetArduinoRuntimes();
    indexArduinoLedDrives();
}

/** Sketch recompilé ou modifié : réinitialise runtime, LED pilotées et phase d'animation. */
export function onArduinoSketchUpdated() {
    syncArduinoSketchesFromEditor();
    for (const comp of circuit.components) {
        if (isMicroBoard(comp)) applyArduinoSketchToComponent(comp);
    }
    refreshGroveLcdDisplayCache(circuit.components, circuit.wires, circuit.autoJunctions);
    refreshJoyitTft18DisplayCache(circuit.components, circuit.wires, circuit.autoJunctions);
    resetArduinoRuntimes();
    indexArduinoLedDrives();
    if (!flags.isSimulating) return;
    if (anim.startMs > 0 || anim.rafId != null) anim.startMs = performance.now();
    ensureArduinoLedAnimation();
}

function getSourceFrequencyHz() {
    for (const comp of circuit.components) {
        if ((comp.type === 'gimp' || comp.type === 'gsin' || comp.type === 'gsqr') && comp.frequency > 0) return comp.frequency;
    }
    return 0;
}

function getGimpPeriodSec() {
    const hz = getSourceFrequencyHz();
    return hz > 0 ? 1 / hz : null;
}

function hasRippleCounter() {
    const ffTypes = new Set(['d_flipflop', 'jk_flipflop']);
    for (const comp of circuit.components) {
        if (!ffTypes.has(comp.type)) continue;
        const clkJon = `${comp.label}_CLK`;
        for (const w of circuit.wires) {
            const other = w.fromJonctionId === clkJon ? w.toJonctionId
                : w.toJonctionId === clkJon ? w.fromJonctionId : null;
            if (!other) continue;
            const mQ = /^([A-Za-z0-9_]+)_Q$/.exec(other);
            const mQb = /^([A-Za-z0-9_]+)_Qbar$/.exec(other);
            const prevLabel = (mQ || mQb)?.[1];
            if (!prevLabel || prevLabel === comp.label) continue;
            if (circuit.components.some((c) => ffTypes.has(c.type) && c.label === prevLabel)) return true;
        }
    }
    return false;
}

/** 74HC90 en mode décade : l’animation doit balayer le .tran, pas figer une phase d’horloge. */
function hasHc90DecadeCounter() {
    return circuit.components.some((c) => c.type === 'ic_74hc90');
}

function indexHc90QPlots(logicGateTranPlots) {
    const byComp = {};
    for (const [id, plot] of Object.entries(logicGateTranPlots || {})) {
        const m = /^(.+)_Q([0-3])$/.exec(id);
        if (!m || !plot?.time?.length) continue;
        const base = m[1];
        const qi = Number(m[2]);
        if (!byComp[base]) byComp[base] = { q: [null, null, null, null], span: 0 };
        byComp[base].q[qi] = plot;
        const span = plot.time[plot.time.length - 1] - plot.time[0];
        if (span > byComp[base].span) byComp[base].span = span;
    }
    return byComp;
}

function hc90TranSpanSec() {
    let max = 0;
    for (const pack of Object.values(anim.hc90QPlots)) {
        if (pack.span > max) max = pack.span;
    }
    return max;
}

/**
 * Temps simulé pour l’échantillon HC90 : 1 impulsion GImp = 1 pas de comptage (temps réel).
 * On lit la valeur stabilisée en fin de période d’horloge (comme les tests SPICE).
 */
/**
 * Synchronise l’horloge d’animation avec le reset MR :
 * - MR actif → affichage 0 ;
 * - MR relâché → repartir de t=0 (nouvelle .tran SPICE).
 */
function syncHc90MasterResetClock() {
    const mrActive = isHc90MasterResetActive(circuit.components, circuit.wires, circuit.autoJunctions);
    if (anim.hc90MrActive && !mrActive) {
        anim.startMs = performance.now();
        anim.hc90LastBcd = {};
    }
    anim.hc90MrActive = mrActive;
    return mrActive;
}

function hc90SampleTimeSec(elapsed, compLabel) {
    const plotSpan = hc90TranSpanSec() || anim.hc90QPlots[compLabel]?.span || 0;
    const clockPeriod = getGimpPeriodSec();
    if (plotSpan > 0 && clockPeriod > 0) {
        return hc90TranSampleTimeSec(elapsed, clockPeriod, plotSpan);
    }
    if (plotSpan > 0) return elapsed % plotSpan;
    return elapsed;
}

function sampleHc90Bcd(compLabel, tSec) {
    const pack = anim.hc90QPlots[compLabel];
    if (!pack?.q?.[0]?.time?.length) return null;
    const vth = pack.q[0].vth ?? 2.5;
    const qV = pack.q.map((plot) =>
        plot?.time?.length ? interpolateSeries(plot.time, plot.voltage, tSec) : 0
    );
    const raw = bcdFromQVoltages(qV, vth);
    if (raw > 9) {
        const last = anim.hc90LastBcd[compLabel];
        return last != null ? last : null;
    }
    anim.hc90LastBcd[compLabel] = raw;
    return raw;
}

/** Valeur BCD 0–9 animée pour un 74HC90 (comptage idéal ou courbes Q0…Q3 du .tran). */
export function getAnimatedHc90Bcd(compLabel) {
    if (!compLabel || !hasHc90DecadeCounter()) return null;
    if (syncHc90MasterResetClock()) return 0;
    const elapsed = (performance.now() - anim.startMs) / 1000;
    const clockPeriod = getGimpPeriodSec();
    const cascade = anim.hc90Cascade ?? detectHc90Cascade(circuit.components, circuit.wires, circuit.autoJunctions);
    if (shouldUseIdealHc90Counting(cascade, clockPeriod)) {
        const ideal = idealHc90BcdForLabel(compLabel, cascade, elapsed, clockPeriod);
        if (ideal != null) return ideal;
    }
    if (!anim.hc90QPlots[compLabel]) return null;
    return sampleHc90Bcd(compLabel, hc90SampleTimeSec(elapsed, compLabel));
}

/** Instant stable dans la phase basse du GImp (ripple propagé). */
function getGimpStablePhase() {
    for (const comp of circuit.components) {
        if (comp.type === 'gimp') {
            const duty = Math.min(99, Math.max(1, comp.dutyCycle ?? 50));
            const lowStart = duty / 100;
            return lowStart + (1 - lowStart) * 0.5;
        }
    }
    return 0.75;
}

function sampleTimeSec(elapsed, ledPeriod) {
    if (hasRippleCounter()) {
        const master = getGimpPeriodSec() ?? ledPeriod;
        const phase = getGimpStablePhase();
        const tStable = Math.floor(elapsed / master) * master + master * phase;
        return tStable;
    }
    return plotTimeOrigin(elapsed, ledPeriod);
}

function plotTimeOrigin(elapsed, period) {
    return elapsed % period;
}


function arduinoPinLabelFromJonction(board, jonctionId) {
    return microBoardPinLabelFromJonction(board, jonctionId);
}

function indexArduinoLedDrives() {
    anim.arduinoLedDrive = {};
    const hopCtx = {
        components: circuit.components,
        wires: circuit.wires,
        autoJunctions: circuit.autoJunctions,
    };
    for (const led of circuit.components.filter((c) => c.type === 'led')) {
        const starts = [`${led.label}_in`, `${led.label}_out`];
        for (const board of circuit.components.filter((c) => isMicroBoard(c))) {
            applyArduinoSketchToComponent(board);
            let found = null;
            for (const start of starts) {
                const net = reachableJonctionsViaSeriesPassives(start, hopCtx);
                for (const jid of net) {
                    const pinLabel = arduinoPinLabelFromJonction(board, jid);
                    if (pinLabel && board.pinModes?.[pinLabel] === 'OUTPUT') {
                        found = {
                            unoLabel: board.label,
                            pinLabel,
                            pulse: board.pinPulses?.[pinLabel],
                            level: board.pinLevels?.[pinLabel],
                        };
                        break;
                    }
                }
                if (found) break;
            }
            if (found && (found.pulse || found.level === 1 || found.level === 0)) {
                anim.arduinoLedDrive[led.label] = found;
                break;
            }
        }
    }
}

function hasLcdTimeVaryingDisplay() {
    for (const comp of circuit.components) {
        if (comp.type !== 'grove_lcd16x2') continue;
        if (comp.lcdDisplayCache?.hasTiming) return true;
    }
    for (const comp of circuit.components) {
        if (comp.type !== 'joyit_tft18') continue;
        if (comp.tftDisplayCache?.hasTiming) return true;
    }
    return false;
}

/** LCD Grove avec delay() dans le sketch — affichage selon le temps de simulation. */
export function getAnimatedGroveLcdDisplay(label) {
    const elapsed = anim.startMs > 0 ? (performance.now() - anim.startMs) / 1000 : 0;
    return getIdealGroveLcdDisplay(
        label,
        circuit.components,
        circuit.wires,
        circuit.autoJunctions,
        elapsed,
        {
            getVoltageAtJonction,
            voltmeters: simulationResults.voltmeters,
        }
    );
}

/** TFT Joy-it avec delay() ou variables dynamiques — affichage selon le temps de simulation. */
export function getAnimatedJoyitTft18Display(label) {
    const elapsed = anim.startMs > 0 ? (performance.now() - anim.startMs) / 1000 : 0;
    return getIdealJoyitTft18Display(
        label,
        circuit.components,
        circuit.wires,
        circuit.autoJunctions,
        elapsed,
        {
            getVoltageAtJonction,
            voltmeters: simulationResults.voltmeters,
        }
    );
}

/** Temps écoulé depuis le début de la simulation animée (s). */
export function getSimulationElapsedSec() {
    if (anim.startMs <= 0) return 0;
    let maxSimMs = 0;
    let hasSim = false;
    for (const comp of circuit.components) {
        if (!isMicroBoard(comp)) continue;
        if (comp.simTimeMs != null && Number.isFinite(comp.simTimeMs)) {
            hasSim = true;
            maxSimMs = Math.max(maxSimMs, comp.simTimeMs);
        }
    }
    if (hasSim) return maxSimMs / 1000;
    return (performance.now() - anim.startMs) / 1000;
}

/** Mesures DHT22 animées pendant la simulation. */
export function getAnimatedDht22Reading(label) {
    const elapsed = anim.startMs > 0 ? (performance.now() - anim.startMs) / 1000 : 0;
    return getIdealDht22Reading(
        label,
        circuit.components,
        circuit.wires,
        circuit.autoJunctions,
        elapsed
    );
}

function hasArduinoStaticIdealDisplay() {
    syncArduinoSketchesFromEditor();
    for (const comp of circuit.components) {
        if (comp.type !== 'seg7') continue;
        const ideal = getIdealSeg7FromArduino(
            comp.label,
            circuit.components,
            circuit.wires,
            0,
            circuit.autoJunctions
        );
        if (ideal?.segments && !ideal.blank) return true;
    }
    for (const comp of circuit.components) {
        if (comp.type !== 'bargraph_dc10h') continue;
        const ideal = getIdealBargraphFromArduino(
            comp.label,
            circuit.components,
            circuit.wires,
            0,
            circuit.autoJunctions
        );
        if (ideal?.segments && Object.values(ideal.segments).some(Boolean)) return true;
    }
    for (const comp of circuit.components) {
        if (comp.type !== 'matrix_8x8') continue;
        const ideal = getIdealMatrix8x8FromArduino(
            comp.label,
            circuit.components,
            circuit.wires,
            0,
            circuit.autoJunctions
        );
        if (ideal?.anyLit) return true;
    }
    for (const comp of circuit.components) {
        if (comp.type !== 'voltmeter') continue;
        const v = getIdealVoltmeterVoltage(
            comp.label,
            circuit.components,
            circuit.wires,
            0,
            circuit.autoJunctions
        );
        if (v != null && Number.isFinite(v)) return true;
    }
    for (const comp of circuit.components) {
        if (comp.type !== 'grove_lcd16x2') continue;
        if (isGroveLcdWiredToBoard(comp.label, circuit.components, circuit.wires, circuit.autoJunctions)) {
            return true;
        }
    }
    for (const comp of circuit.components) {
        if (comp.type !== 'joyit_tft18') continue;
        if (isJoyitTft18WiredToBoard(comp.label, circuit.components, circuit.wires, circuit.autoJunctions)) {
            return true;
        }
    }
    return false;
}

/** Affichage 7 segments piloté par sketch Arduino (sans attendre SPICE). */
export function getIdealSeg7Display(label) {
    syncArduinoSketchesFromEditor();
    return getIdealSeg7FromArduino(
        label,
        circuit.components,
        circuit.wires,
        0,
        circuit.autoJunctions
    );
}

/** Bargraph DC10H piloté directement par GPIO Arduino (sans attendre SPICE). */
export function getIdealBargraphDisplay(label, tSec) {
    syncArduinoSketchesFromEditor();
    const elapsed =
        tSec ??
        (anim.startMs > 0 ? (performance.now() - anim.startMs) / 1000 : 0);
    return getIdealBargraphFromArduino(
        label,
        circuit.components,
        circuit.wires,
        elapsed,
        circuit.autoJunctions
    );
}

/** Matrice 8×8 pilotée directement par GPIO Arduino (sans attendre SPICE). */
export function getIdealMatrix8x8Display(label, tSec) {
    syncArduinoSketchesFromEditor();
    const elapsed = tSec ?? getSimulationElapsedSec();
    return getIdealMatrix8x8FromArduino(
        label,
        circuit.components,
        circuit.wires,
        elapsed,
        circuit.autoJunctions
    );
}

export { hasArduinoStaticIdealDisplay };

function getIdealArduinoLedCurrent(label) {
    const drive = anim.arduinoLedDrive[label];
    if (!drive?.pinLabel || !drive?.unoLabel) return null;
    const board = circuit.components.find((c) => isMicroBoard(c) && c.label === drive.unoLabel);
    if (!board) return null;
    applyArduinoSketchToComponent(board);
    const elapsed = anim.startMs > 0 ? (performance.now() - anim.startMs) / 1000 : 0;
    const levels = resolvePinLevelsAt(board, elapsed);
    const lv = levels[drive.pinLabel];
    if (lv === 1) return ARDUINO_IDEAL_LED_ON_A;
    if (lv === 0) return 0;
    return null;
}

function hasArduinoTimeVaryingGpio() {
    syncArduinoSketchesFromEditor();
    return circuit.components.some((c) => isMicroBoard(c) && arduinoGpioIsTimeVarying(c));
}

function hasArduinoInteractiveSketch() {
    syncArduinoSketchesFromEditor();
    return circuit.components.some((c) => {
        if (!isMicroBoard(c)) return false;
        const sk = c.sketch || '';
        return sketchHasLoop(sk) || sketchUsesAnalogInput(sk) || sketchUsesSerial(sk);
    });
}

function hasArduinoLoopSimulation() {
    return hasArduinoInteractiveSketch();
}

function hasDht22Simulation() {
    syncArduinoSketchesFromEditor();
    return circuit.components.some(
        (c) => c.type === 'grove_dht22' && isGroveDht22WiredToBoard(c.label, circuit.components, circuit.wires, circuit.autoJunctions)
    );
}

function hasTsl2591Simulation() {
    syncArduinoSketchesFromEditor();
    return circuit.components.some(
        (c) => c.type === 'grove_tsl2591' && isGroveTsl2591WiredToBoard(c.label, circuit.components, circuit.wires, circuit.autoJunctions)
    );
}

function hasBmp280Simulation() {
    syncArduinoSketchesFromEditor();
    return circuit.components.some(
        (c) => c.type === 'grove_bmp280' && isGroveBmp280WiredToBoard(c.label, circuit.components, circuit.wires, circuit.autoJunctions)
    );
}

export function ensureArduinoLedAnimation() {
    if (!flags.isSimulating) return;
    indexArduinoLedDrives();
    if (
        !hasArduinoTimeVaryingGpio() &&
        !hasArduinoLoopSimulation() &&
        !hasDht22Simulation() &&
        !hasTsl2591Simulation() &&
        !hasBmp280Simulation() &&
        !Object.keys(anim.arduinoLedDrive).length &&
        !hasArduinoStaticIdealDisplay() &&
        !hasLcdTimeVaryingDisplay()
    ) {
        return;
    }
    if (anim.startMs <= 0) anim.startMs = performance.now();
    if (anim.rafId != null) return;
    const tick = () => {
        updateArduinoRuntimes();
        redraw();
        anim.rafId = requestAnimationFrame(tick);
    };
    anim.rafId = requestAnimationFrame(tick);
}

function fallbackPeriodSec(plots) {
    const freqHz = getSourceFrequencyHz();
    if (freqHz > 0) return 1 / freqHz;
    const plot = Object.values(plots)[0];
    if (plot?.time?.length > 1) {
        const span = plot.time[plot.time.length - 1] - plot.time[0];
        if (span > 0) return span;
    }
    return 1;
}

/** Période détectée dans le tracé SPICE (ex. diviseur par 2 → 2× l'horloge). */
function detectLedPeriodSec(plot) {
    const { time, current } = plot;
    if (!time?.length || !current?.length) return null;

    const rising = [];
    for (let i = 1; i < current.length; i++) {
        if (current[i] > LED_ON_A && current[i - 1] <= LED_ON_A) rising.push(time[i]);
    }
    if (rising.length >= 2) return rising[1] - rising[0];

    let toggles = 0;
    for (let i = 1; i < current.length; i++) {
        if ((current[i] > LED_ON_A) !== (current[i - 1] > LED_ON_A)) toggles++;
    }
    const span = time[time.length - 1] - time[0];
    if (toggles >= 2 && span > 0) return (2 * span) / toggles;
    return null;
}

function interpolateSeries(time, values, tSec) {
    if (!time?.length || !values?.length) return NaN;
    if (tSec <= time[0]) return values[0] ?? NaN;
    const last = time.length - 1;
    if (tSec >= time[last]) return values[last] ?? NaN;
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (time[mid] <= tSec) lo = mid;
        else hi = mid;
    }
    const t0 = time[lo];
    const t1 = time[hi];
    const v0 = values[lo];
    const v1 = values[hi];
    if (t1 <= t0) return v0;
    const f = (tSec - t0) / (t1 - t0);
    return v0 + f * (v1 - v0);
}

function seg7LitFromVoltages(segmentV, vCom) {
    const lit = {};
    const vc = Number.isFinite(vCom) ? vCom : 0;
    for (let i = 0; i < 7; i++) {
        const v = segmentV[i];
        lit[SEG7_NAMES[i]] = Number.isFinite(v) && v - vc >= SEG7_LIT_DELTA_V;
    }
    return lit;
}

function bargraphLitFromVoltages(segmentV, vCom) {
    const lit = {};
    const vc = Number.isFinite(vCom) ? vCom : 0;
    for (let i = 0; i < 10; i++) {
        const v = segmentV[i];
        lit[BARGRAPH_SEG_NAMES[i]] = Number.isFinite(v) && v - vc >= SEG7_LIT_DELTA_V;
    }
    return lit;
}

function interpolatePlot(plot, tSec) {
    const { time, current } = plot;
    if (!time?.length) return 0;
    if (tSec <= time[0]) return current[0] ?? 0;
    const last = time.length - 1;
    if (tSec >= time[last]) return current[last] ?? 0;
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (time[mid] <= tSec) lo = mid;
        else hi = mid;
    }
    const t0 = time[lo];
    const t1 = time[hi];
    const i0 = current[lo] ?? 0;
    const i1 = current[hi] ?? 0;
    if (t1 <= t0) return i0;
    const f = (tSec - t0) / (t1 - t0);
    return i0 + f * (i1 - i0);
}

function averageCurrentOverPeriod(plot, periodSec) {
    const { time, current } = plot;
    if (!time?.length) return 0;
    const tEnd = time[0] + periodSec;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < time.length; i++) {
        if (time[i] >= tEnd) break;
        sum += current[i] ?? 0;
        count++;
    }
    return count > 0 ? sum / count : 0;
}

function prepareLedTiming(plots) {
    const fallback = fallbackPeriodSec(plots);
    anim.ledPeriods = {};
    anim.ledPersistence = {};
    anim.steadyCurrent = {};

    for (const [id, plot] of Object.entries(plots)) {
        const period = detectLedPeriodSec(plot) ?? fallback;
        anim.ledPeriods[id] = period;
        const freqHz = period > 0 ? 1 / period : 0;
        if (freqHz > PERSISTENCE_FREQ_HZ) {
            anim.ledPersistence[id] = true;
            anim.steadyCurrent[id] = averageCurrentOverPeriod(plot, period);
        }
    }
}

function interpolateVoltagePlot(plot, tSec) {
    const { time, voltage } = plot;
    if (!time?.length) return 0;
    if (tSec <= time[0]) return voltage[0] ?? 0;
    const last = time.length - 1;
    if (tSec >= time[last]) return voltage[last] ?? 0;
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (time[mid] <= tSec) lo = mid;
        else hi = mid;
    }
    const t0 = time[lo];
    const t1 = time[hi];
    const v0 = voltage[lo] ?? 0;
    const v1 = voltage[hi] ?? 0;
    if (t1 <= t0) return v0;
    return v0 + ((tSec - t0) / (t1 - t0)) * (v1 - v0);
}

function detectPlotPeriodSec(time, values, threshold = 2.5) {
    if (!time?.length || !values?.length) return null;
    const rising = [];
    for (let i = 1; i < values.length; i++) {
        if (values[i] > threshold && values[i - 1] <= threshold) rising.push(time[i]);
    }
    if (rising.length >= 2) return rising[1] - rising[0];
    let toggles = 0;
    for (let i = 1; i < values.length; i++) {
        if ((values[i] > threshold) !== (values[i - 1] > threshold)) toggles++;
    }
    const span = time[time.length - 1] - time[0];
    if (toggles >= 2 && span > 0) return (2 * span) / toggles;
    return null;
}

function prepareVmTiming(vmPlots) {
    anim.vmPeriods = {};
    const fallback = fallbackPeriodSec({});
    for (const [id, plot] of Object.entries(vmPlots)) {
        anim.vmPeriods[id] = detectPlotPeriodSec(plot.time, plot.voltage) ?? fallback;
    }
}

export function getAnimatedVoltmeterVoltage(label) {
    syncArduinoSketchesFromEditor();
    const elapsed = anim.startMs > 0 ? (performance.now() - anim.startMs) / 1000 : 0;
    const ideal = getIdealVoltmeterVoltage(label, circuit.components, circuit.wires, elapsed, circuit.autoJunctions);
    if (ideal != null && Number.isFinite(ideal)) return ideal;
    const plot = anim.vmPlots[label];
    if (!plot?.time?.length) return null;
    const period = anim.vmPeriods[label] ?? 1;
    const elapsedPlot = (performance.now() - anim.startMs) / 1000;
    // Temps réel : ne pas figer sur la phase stable des compteurs ripple (réservée aux LED).
    const tSample = plotTimeOrigin(elapsedPlot, period);
    const plotSpan = plot.time[plot.time.length - 1] - plot.time[0];
    const tAbs = plot.time[0] + (plotSpan > 0 ? tSample % plotSpan : tSample);
    return quantizeVoltmeterReading(interpolateVoltagePlot(plot, tAbs), plot.voltage);
}

export function hasVoltmeterAnimation() {
    return Object.keys(anim.vmPlots).length > 0 && anim.rafId != null;
}

export function getAnimatedLedCurrent(label) {
    if (syncHc90MasterResetClock()) {
        const qMap = hc90QBitForLed(label, circuit.components, circuit.wires, circuit.autoJunctions);
        if (qMap) return 0;
    }
    const clockPeriod = getGimpPeriodSec();
    const cascade = anim.hc90Cascade ?? detectHc90Cascade(circuit.components, circuit.wires, circuit.autoJunctions);
    const qMap = hc90QBitForLed(label, circuit.components, circuit.wires, circuit.autoJunctions);
    if (qMap && shouldUseIdealHc90Counting(cascade, clockPeriod)) {
        const bcd = getAnimatedHc90Bcd(qMap.hc90Label);
        if (bcd != null) {
            return (bcd >> qMap.qIndex) & 1 ? HC90_IDEAL_LED_ON_A : 0;
        }
    }
    // LED câblée sur GPIO Arduino : le sketch interprété prime sur d'anciennes courbes .tran SPICE.
    if (anim.arduinoLedDrive[label]) {
        const ideal = getIdealArduinoLedCurrent(label);
        if (ideal != null) return ideal;
    }
    const plot = anim.plots[label];
    if (!plot) {
        const ideal = getIdealArduinoLedCurrent(label);
        if (ideal != null) return ideal;
        return null;
    }
    if (anim.ledPersistence[label]) {
        return anim.steadyCurrent[label] ?? 0;
    }
    const period = anim.ledPeriods[label] ?? 1;
    const elapsed = (performance.now() - anim.startMs) / 1000;
    const plotSpan = plot.time[plot.time.length - 1] - plot.time[0];
    const tSample =
        hasHc90DecadeCounter() && plotSpan > 0 && clockPeriod > 0
            ? hc90TranSampleTimeSec(elapsed, clockPeriod, plotSpan)
            : sampleTimeSec(elapsed, period);
    const tAbs = plot.time[0] + (plotSpan > 0 ? Math.min(tSample, plotSpan - 1e-12) : tSample);
    return interpolatePlot(plot, tAbs);
}

export function hasLedAnimation() {
    return anim.rafId != null && Object.keys(anim.plots).length > 0;
}

export function hasSeg7Animation() {
    return anim.rafId != null && Object.keys(anim.seg7Plots).length > 0;
}

/** Segments allumés à l'instant courant de la simulation live (.tran). */
export function getAnimatedSeg7Segments(label) {
    syncArduinoSketchesFromEditor();
    updateArduinoRuntimes();
    const elapsed = anim.startMs > 0 ? (performance.now() - anim.startMs) / 1000 : 0;
    const ideal = getIdealSeg7FromArduino(label, circuit.components, circuit.wires, elapsed, circuit.autoJunctions);
    if (ideal?.segments) return ideal;
    const plot = anim.seg7Plots[label];
    if (!plot?.time?.length) return null;
    if (syncHc90MasterResetClock()) return { segments: bcdDigitToSeg7Segments(0) };
    const hc90Label = hc90LabelForSeg7(label, circuit.components, circuit.wires, circuit.autoJunctions);
    if (hc90Label) {
        const bcd = getAnimatedHc90Bcd(hc90Label);
        if (bcd != null) return { segments: bcdDigitToSeg7Segments(bcd) };
    }
    const clockPeriod = getGimpPeriodSec() ?? 1;
    const elapsedPlot = (performance.now() - anim.startMs) / 1000;
    if (
        shouldUseIdealRippleMod10Seg7(
            label,
            circuit.components,
            circuit.wires,
            circuit.autoJunctions,
            clockPeriod
        )
    ) {
        return { segments: bcdDigitToSeg7Segments(idealRippleMod10Bcd(elapsedPlot, clockPeriod)) };
    }
    const plotSpan = plot.time[plot.time.length - 1] - plot.time[0];
    const tSample =
        hasHc90DecadeCounter() && plotSpan > 0 && clockPeriod > 0
            ? hc90TranSampleTimeSec(elapsedPlot, clockPeriod, plotSpan)
            : sampleTimeSec(elapsedPlot, clockPeriod);
    const tAbs = plot.time[0] + (plotSpan > 0 ? tSample % plotSpan : tSample);
    const vCom = interpolateSeries(plot.time, plot.common, tAbs);
    const segmentV = SEG7_NAMES.map((n) => interpolateSeries(plot.time, plot.segments[n], tAbs));
    return { segments: seg7LitFromVoltages(segmentV, vCom) };
}

/** Segments bargraph allumés à l'instant courant de la simulation live (.tran). */
export function getAnimatedBargraphSegments(label) {
    const plot = anim.bargraphPlots[label];
    if (!plot?.time?.length) {
        const ideal = getIdealBargraphDisplay(label);
        return ideal?.segments ? { segments: ideal.segments } : null;
    }
    const clockPeriod = getGimpPeriodSec() ?? 1;
    const elapsedPlot = (performance.now() - anim.startMs) / 1000;
    const plotSpan = plot.time[plot.time.length - 1] - plot.time[0];
    const tSample = sampleTimeSec(elapsedPlot, clockPeriod);
    const tAbs = plot.time[0] + (plotSpan > 0 ? tSample % plotSpan : tSample);
    const vCom = interpolateSeries(plot.time, plot.common, tAbs);
    const segmentV = BARGRAPH_SEG_NAMES.map((n) => interpolateSeries(plot.time, plot.segments[n], tAbs));
    return { segments: bargraphLitFromVoltages(segmentV, vCom) };
}

/** Cellules matrice 8×8 allumées à l'instant courant (pilotage GPIO idéal). */
export function getAnimatedMatrix8x8Cells(label) {
    const ideal = getIdealMatrix8x8Display(label);
    return ideal?.cells ? { cells: ideal.cells } : null;
}

function motorPlotVoltage(label) {
    const plot = anim.plots[label] || anim.vmPlots?.[label];
    if (!plot?.time?.length || !plot.voltage?.length) return null;
    const elapsed = (performance.now() - anim.startMs) / 1000;
    const period = anim.ledPeriods[label] ?? anim.vmPeriods?.[label] ?? detectLedPeriodSec(plot) ?? 1;
    const tSample = sampleTimeSec(elapsed, period);
    return interpolateVoltagePlot(plot, tSample);
}

function motorIdealVoltage(label) {
    const ctx = {
        components: circuit.components,
        wires: circuit.wires,
        autoJunctions: circuit.autoJunctions || [],
    };
    const vp = resolveNetVoltage(`${label}_plus`, ctx);
    const vm = resolveNetVoltage(`${label}_minus`, ctx);
    if (!Number.isFinite(vp) && !Number.isFinite(vm)) return 0;
    return (Number.isFinite(vp) ? vp : 0) - (Number.isFinite(vm) ? vm : 0);
}

function servoVoltageCtx() {
    return {
        components: circuit.components,
        wires: circuit.wires,
        autoJunctions: circuit.autoJunctions || [],
        getVoltageAtJonction,
        voltmeters: simulationResults.voltmeters,
    };
}

function servoSignalNet(label) {
    return reachableJonctions(`${label}_signal`, circuit.wires, circuit.autoJunctions || []);
}

function findPotForServoSignal(label) {
    const sigNet = servoSignalNet(label);
    for (const pot of circuit.components) {
        if (pot.type !== 'potentiometer' || !pot.label) continue;
        for (const t of ['wip', 'in', 'out']) {
            if (sigNet.has(`${pot.label}_${t}`)) return pot;
        }
    }
    return null;
}

function servoSignalHasAcSource(label) {
    const sigNet = servoSignalNet(label);
    for (const comp of circuit.components) {
        if (!comp.label || !['gsin', 'gimp', 'gsqr'].includes(comp.type)) continue;
        if (sigNet.has(`${comp.label}_out`)) return true;
    }
    return false;
}

/** Angle depuis un potentiomètre lié à S (curseur ou borne — rails IN/OUT exclus de la boucle signal). */
function servoAngleFromPot(servoLabel, vcc) {
    const pot = findPotForServoSignal(servoLabel);
    if (!pot || !Number.isFinite(vcc) || vcc < 0.5) return null;
    const ctx = servoVoltageCtx();
    const loopGuard = new Set([`${servoLabel}_signal`]);
    const vi = resolveNetVoltage(`${pot.label}_in`, ctx, new Set(loopGuard));
    const vo = resolveNetVoltage(`${pot.label}_out`, ctx, new Set(loopGuard));
    const viN = Number.isFinite(vi) ? vi : vcc;
    const voN = Number.isFinite(vo) ? vo : 0;
    const pos = Math.min(100, Math.max(0, Number(pot.position) ?? 50)) / 100;
    const vsig = viN * (1 - pos) + voN * pos;
    return Math.max(0, Math.min(180, (vsig / vcc) * 180));
}

function servoNetVoltages(label) {
    const ctx = servoVoltageCtx();
    const vPlus = resolveNetVoltage(`${label}_plus`, ctx);
    const vMinus = resolveNetVoltage(`${label}_minus`, ctx);
    const vSignal = resolveNetVoltage(`${label}_signal`, ctx);
    const vcc = (Number.isFinite(vPlus) ? vPlus : 0) - (Number.isFinite(vMinus) ? vMinus : 0);
    const vsig = (Number.isFinite(vSignal) ? vSignal : 0) - (Number.isFinite(vMinus) ? vMinus : 0);
    return { vcc, vsig };
}

function servoPlotSignal(label) {
    if (!servoSignalHasAcSource(label)) return null;
    const plot = anim.plots[label] || anim.vmPlots?.[label];
    if (!plot?.time?.length || !plot.voltage?.length) return null;
    const elapsed = (performance.now() - anim.startMs) / 1000;
    const period = anim.ledPeriods[label] ?? anim.vmPeriods?.[label] ?? detectLedPeriodSec(plot) ?? 1;
    const tSample = sampleTimeSec(elapsed, period);
    return interpolateVoltagePlot(plot, tSample);
}

function servoTargetAngle(label) {
    const { vcc, vsig } = servoNetVoltages(label);
    if (!Number.isFinite(vcc) || vcc < 3) return anim.servoTargets[label] ?? 90;

    const fromPot = servoAngleFromPot(label, vcc);
    if (fromPot != null) return fromPot;

    const plotSig = servoPlotSignal(label);
    const sig = plotSig != null ? plotSig : vsig;
    const ratio = Math.max(0, Math.min(1, sig / vcc));
    return ratio * 180;
}

function updateMotorRotations() {
    if (!flags.isSimulating) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - (anim.motorLastMs || now)) / 1000);
    anim.motorLastMs = now;
    for (const comp of circuit.components) {
        if (comp.type !== 'dc_motor') continue;
        const label = comp.label;
        const plotV = motorPlotVoltage(label);
        const v = plotV != null ? plotV : motorIdealVoltage(label);
        if (Math.abs(v) < 0.35) continue;
        const dir = v >= 0 ? 1 : -1;
        const speed = Math.min(720, Math.abs(v) * 100);
        anim.motorAngles[label] = ((anim.motorAngles[label] ?? 0) + dir * speed * dt) % 360;
    }
    for (const comp of circuit.components) {
        if (comp.type !== 'servo_motor') continue;
        const label = comp.label;
        const target = servoTargetAngle(label);
        anim.servoTargets[label] = target;
        const current = anim.servoAngles[label] ?? target;
        const alpha = Math.min(1, dt * 12);
        anim.servoAngles[label] = current + (target - current) * alpha;
    }
}

export function getMotorRotationDeg(label) {
    return anim.motorAngles[label] ?? 0;
}

export function getServoAngleDeg(label) {
    return anim.servoAngles[label] ?? 90;
}

function hasMechanicalComponents() {
    return circuit.components.some((c) => c.type === 'dc_motor' || c.type === 'servo_motor');
}

/** Boucle d'animation pour moteurs DC / servos (circuits DC sans courbes .tran). */
export function ensureDcMotorAnimationLoop() {
    if (!flags.isSimulating) return;
    if (!hasMechanicalComponents()) return;
    if (anim.rafId != null) return;
    anim.motorLastMs = performance.now();
    const tick = () => {
        updateMotorRotations();
        redraw();
        anim.rafId = requestAnimationFrame(tick);
    };
    anim.rafId = requestAnimationFrame(tick);
}

export function startLedAnimation(plots, vmPlots = {}, seg7Plots = {}, logicGateTranPlots = {}, opts = {}) {
    const mrActive = isHc90MasterResetActive(circuit.components, circuit.wires, circuit.autoJunctions);
    const mrReleased = anim.hc90MrActive && !mrActive;
    const savedStartMs = opts.keepClock === true && !mrReleased ? anim.startMs : 0;
    stopLedAnimation(opts.keepClock === true && !mrReleased);
    const hasLeds = plots && Object.keys(plots).length > 0;
    const hasVm = vmPlots && Object.keys(vmPlots).length > 0;
    const hasSeg7 = seg7Plots && Object.keys(seg7Plots).length > 0;
    const bargraphPlots = opts.bargraphPlots || {};
    const hasBargraph = bargraphPlots && Object.keys(bargraphPlots).length > 0;
    anim.hc90QPlots = indexHc90QPlots(logicGateTranPlots);
    anim.hc90Cascade = detectHc90Cascade(circuit.components, circuit.wires, circuit.autoJunctions);
    anim.hc90MrActive = mrActive;
    const hasHc90Anim = Object.keys(anim.hc90QPlots).length > 0;
    const hasMotors = hasMechanicalComponents();
    if (!hasLeds && !hasVm && !hasSeg7 && !hasBargraph && !hasHc90Anim && !hasMotors) return;

    anim.plots = plots || {};
    anim.vmPlots = vmPlots || {};
    anim.seg7Plots = seg7Plots || {};
    anim.bargraphPlots = bargraphPlots || {};
    anim.startMs = savedStartMs > 0 ? savedStartMs : performance.now();
    if (hasLeds) prepareLedTiming(plots);
    if (hasVm) prepareVmTiming(vmPlots);

    const needsFrameLoop =
        Object.keys(anim.plots).some((id) => !anim.ledPersistence[id]) ||
        hasVm ||
        hasSeg7 ||
        hasBargraph ||
        hasHc90Anim ||
        hasMotors;
    if (!needsFrameLoop) {
        redraw();
        return;
    }

    anim.motorLastMs = performance.now();
    const tick = () => {
        updateMotorRotations();
        updateArduinoRuntimes();
        redraw();
        anim.rafId = requestAnimationFrame(tick);
    };
    anim.rafId = requestAnimationFrame(tick);
}

let smokeRafId = null;

export function startBurntLedSmokeLoop() {
    if (smokeRafId != null) return;
    const tick = () => {
        redraw();
        smokeRafId = requestAnimationFrame(tick);
    };
    smokeRafId = requestAnimationFrame(tick);
}

function stopBurntLedSmokeLoop() {
    if (smokeRafId != null) cancelAnimationFrame(smokeRafId);
    smokeRafId = null;
}

export function stopLedAnimation(preserveArduino = false) {
    if (anim.rafId != null) cancelAnimationFrame(anim.rafId);
    anim.rafId = null;
    anim.plots = {};
    anim.vmPlots = {};
    anim.seg7Plots = {};
    anim.bargraphPlots = {};
    anim.hc90QPlots = {};
    anim.hc90LastBcd = {};
    anim.hc90MrActive = false;
    anim.hc90Cascade = null;
    anim.ledPeriods = {};
    anim.vmPeriods = {};
    anim.ledPersistence = {};
    anim.steadyCurrent = {};
    anim.arduinoLedDrive = {};
    anim.motorAngles = {};
    anim.servoAngles = {};
    anim.servoTargets = {};
    anim.motorLastMs = 0;
    if (!preserveArduino) {
        anim.startMs = 0;
        resetArduinoRuntimes();
    }
    stopBurntLedSmokeLoop();
}
