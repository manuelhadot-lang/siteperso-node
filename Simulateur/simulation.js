// simulation.js
import { circuit, flags, simulationResults, GRID_SIZE, snapToGrid } from './state.js';
import { buildSimStateFromCircuit } from './circuit-sim-state.js';
import { isMicroBoard } from './micro-board.js';
import { draw } from './renderer.js';
import { startLedAnimation, stopLedAnimation, startBurntLedSmokeLoop, isLedOvercurrent, hasLedAnimation, hasVoltmeterAnimation, ensureArduinoLedAnimation, hasArduinoStaticIdealDisplay, resetArduinoRuntimes, resetTftLiveInputStateForCircuit, ensureDcMotorAnimationLoop } from './led-animation.js';
import { startScopeAnimation, stopScopeAnimation } from './scope-animation.js';
import { shouldAnimateGsinScope } from './Engine/scope-gsin-ideal.mjs';
import { openScopePanel, closeScopePanelFully, isScopePanelOpen, getActiveScope, refreshScopePanelFields } from './scope-panel.js';
import { isScopePopupOpen, refreshScopePopup } from './scope-popup.js';
import { isSerialMonitorOpen, refreshSerialMonitor } from './serial-monitor-popup.js';
import { isBodePopupOpen, openBodePopup, refreshBodePopup } from './bode-popup.js';
import { startSpeakerAudio, stopSpeakerAudio, primeSpeakerAudioContext, shouldPlaySpeakerAudio } from './speaker-audio.js';
import { flushSourcePanelFields } from './source-panel.js';

let liveSimTimer = null;
let simulationInFlight = false;
let simulationQueuedSilent = false;
/** @type {AbortController | null} */
let simulationAbortController = null;
let simulationGeneration = 0;

/** Relance ngspice pendant une simulation active (valeurs composants / sources). */
export function requestLiveSimulation() {
    if (!flags.isSimulating) return;
    clearTimeout(liveSimTimer);
    const delay = flags.sourcePanelTuning ? 50 : 400;
    liveSimTimer = setTimeout(() => {
        if (flags.isSimulating) triggerSimulation(true);
    }, delay);
}

import { prepareArduinoForSimulation } from './arduino-editor.js';
import {
    applyArduinoSketchToComponent,
    arduinoGpioIsTimeVarying,
    sketchHasLoop,
} from './Engine/arduino-sketch-parse.mjs';

function buildSimulationState() {
    const built = buildSimStateFromCircuit({
        components: circuit.components,
        wires: circuit.wires,
        autoJunctions: circuit.autoJunctions,
    });
    if (built.droppedWires > 0) {
        console.warn(
            `[Simulation] ${built.droppedWires} fil(s) ignoré(s) : jonction non reconnue ou extrémité manquante. Vérifiez le câblage (CD4511 : broches A…LT, a…g).`
        );
    }
    return { components: built.components, wires: built.wires };
}

/** URL de POST /api/simulate (serveur Node, même machine que la page). */
function resolveSimulationApiBaseUrl() {
    const { protocol, hostname, port, pathname } = window.location;
    const isSimulateurH = new URLSearchParams(window.location.search).get('app') === 'h';
    if (protocol === 'file:') {
        return isSimulateurH ? 'http://127.0.0.1:43721' : 'http://127.0.0.1:3000';
    }
    if (pathname.startsWith('/Simulateur')) return window.location.origin;
    const p = port || (protocol === 'https:' ? '443' : '80');
    if (p === '3000' || p === '80' || p === '443') return window.location.origin;
    const host =
        hostname === 'localhost' || hostname === '127.0.0.1' ? '127.0.0.1' : hostname;
    return `${protocol}//${host}:3000`;
}

function formatSimulationNetworkError(err, baseUrl) {
    const msg = err?.message || String(err);
    if (/Cannot GET/i.test(msg)) {
        return (
            `Le serveur Node ne gère pas cette requête (réponse « Cannot GET »).\n\n` +
            `1. Dans le dossier du projet : npm start\n` +
            `2. Ouvrez http://localhost:3000/Simulateur/ (pas le fichier HTML en double-clic)\n\n` +
            `URL tentée : ${baseUrl}/api/simulate`
        );
    }
    if (/Failed to fetch|NetworkError|ERR_CONNECTION|fetch/i.test(msg)) {
        return (
            `Impossible de joindre le serveur (${baseUrl}).\n\n` +
            `Lancez « npm start », puis ouvrez http://localhost:3000/Simulateur/`
        );
    }
    if (/EPERM|operation not permitted|bloqué|blocked|antivirus/i.test(msg)) {
        return (
            `ngspice bloqué par l'antivirus Windows (EPERM).\n\n` +
            `Les circuits 74HC90 / CD4511 nécessitent ngspice_con.exe dans Simulateur/bin/.\n` +
            `Demandez une exception pour ce dossier, ou testez : npm run check-ngspice`
        );
    }
    return msg;
}

function formatSpiceEngineErrors(result) {
    if (Array.isArray(result?.errors) && result.errors.length) {
        return result.errors.map(String).filter((e) => e.trim()).join('\n');
    }
    return result?.error || result?.message || 'Vérifiez les masses et le câblage (VCC, GND, BI/LT du CD4511, MR du 74HC90).';
}

function warnDroppedWiresForLogicCircuits(dropped, isSilentUpdate) {
    if (isSilentUpdate || dropped <= 0) return;
    const hasLogicIc = circuit.components.some((c) => c.type === 'cd4511' || c.type === 'ic_74hc90');
    if (!hasLogicIc) return;
    alert(
        `${dropped} fil(s) ignoré(s) — le schéma n'est pas entièrement transmis au moteur SPICE.\n\n` +
            `Vérifiez le câblage (74HC90 : CP0, VCC, GND, MR1/MR2 à 0 V, Q0→CP1, Q0…Q3→CD4511 A…D ; ` +
            `CD4511 : BI et LT au +5 V, LE à 0 V, a…g → afficheur).`
    );
}
function showSimulationWarnings(warnings, isSilentUpdate) {
    if (isSilentUpdate || !Array.isArray(warnings) || !warnings.length) return;
    const text = warnings.map(String).filter((w) => w.trim()).join('\n');
    if (!text) return;
    const critical = warnings.some((w) =>
        /CD4511|74HC90|XSPICE|digital\.cm|BI relié|LT relié|Q0 relié|fréquentielle|Analyse fréquentielle|Bode|AOP|amplificateur|LM386|Oscilloscope|CH1|CH2|masse|courbe|comparateur|non-inverseur|suiveur|Haut-parleur|court-circuit/i.test(
            String(w)
        )
    );
    if (critical) alert(`Avertissement simulation :\n${text}`);
}

/** Démarre l'animation GPIO avant la fin du calcul SPICE (bargraph / LED Arduino). */
function shouldStartArduinoLiveDisplayEarly() {
    let hasBoard = false;
    for (const comp of circuit.components) {
        if (!isMicroBoard(comp)) continue;
        hasBoard = true;
        applyArduinoSketchToComponent(comp);
        if (sketchHasLoop(comp.sketch || '') || arduinoGpioIsTimeVarying(comp)) return true;
    }
    if (!hasBoard) return false;
    return circuit.components.some((c) =>
        c.type === 'bargraph_dc10h' || c.type === 'matrix_8x8' || c.type === 'seg7' || c.type === 'grove_lcd16x2' || c.type === 'joyit_tft18'
    );
}

export async function triggerSimulation(isSilentUpdate = false) {
    if (simulationInFlight) {
        if (isSilentUpdate && flags.sourcePanelTuning) {
            simulationGeneration += 1;
            simulationQueuedSilent = false;
            if (simulationAbortController) {
                simulationAbortController.abort();
                simulationAbortController = null;
            }
            simulationInFlight = false;
        } else if (isSilentUpdate) {
            simulationQueuedSilent = true;
            return;
        }
    }
    simulationInFlight = true;
    simulationGeneration += 1;
    const myGeneration = simulationGeneration;
    if (simulationAbortController) simulationAbortController.abort();
    simulationAbortController = new AbortController();
    const { signal } = simulationAbortController;
    prepareArduinoForSimulation();
    flushSourcePanelFields();
    if (!isSilentUpdate) {
        resetTftLiveInputStateForCircuit(circuit.components);
    }
    if (!isSilentUpdate) {
        primeSpeakerAudioContext().catch(() => {});
        refreshScopePanelFields();
    }
    const baseUrl = resolveSimulationApiBaseUrl();
    const payload = {
        state: buildSimulationState(),
        gridStep: GRID_SIZE,
        liveSourceTuning: flags.sourcePanelTuning === true,
    };
    const wiredCount = circuit.wires.filter((w) => w.fromJonctionId && w.toJonctionId).length;
    warnDroppedWiresForLogicCircuits(wiredCount - payload.state.wires.length, isSilentUpdate);
    const btnSim = document.getElementById('btn-simulate');
    const btnStop = document.getElementById('btn-stop');
    if (btnSim && !isSilentUpdate) { btnSim.innerText = "⚡ Calculs SPICE..."; btnSim.style.background = "#ff9800"; }
    if (!isSilentUpdate && shouldStartArduinoLiveDisplayEarly()) {
        flags.isSimulating = true;
        resetArduinoRuntimes();
        ensureArduinoLedAnimation();
        if (btnStop) btnStop.classList.remove('disabled');
        draw();
    }
    try {
        const response = await fetch(`${baseUrl}/api/simulate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
            signal,
        });
        if (myGeneration !== simulationGeneration) return;
        if (!response.ok) {
            let backendError = "";
            try {
                const errJson = await response.json();
                backendError =
                    errJson.error ||
                    errJson.message ||
                    (Array.isArray(errJson.errors) ? errJson.errors.join('\n') : '');
            } catch (e) {
                backendError = await response.text();
            }
            throw new Error(formatSimulationNetworkError({ message: backendError }, baseUrl));
        }
        const result = await response.json();
        if (myGeneration !== simulationGeneration) return;
        if (result.ok) {
            showSimulationWarnings(result.warnings, isSilentUpdate);
            simulationResults.voltmeters = result.voltmeterValues || {};
            simulationResults.ammeters = result.ammeterValues || {};
            simulationResults.ohmmeters = result.ohmmeterValues || {};
            simulationResults.leds = result.ledValues || {};
            simulationResults.scopePlots = result.scopePlots || {};
            simulationResults.bodePlots = result.bodePlots || {};
            simulationResults.seg7 = result.seg7Values || {};
            simulationResults.bargraph = result.bargraphValues || {};
            simulationResults.logicValues = result.logicValues || {};
            refreshScopePanelFields();
            refreshScopePopup();
            const scopePlotKeys = Object.keys(simulationResults.scopePlots);
            const hasOsc = circuit.components.some((c) => c.type === 'oscilloscope');
            if (scopePlotKeys.length > 0 || hasOsc) {
                startScopeAnimation(simulationResults.scopePlots, { keepClock: isSilentUpdate });
            } else {
                stopScopeAnimation();
            }
            if (
                !isSilentUpdate &&
                hasOsc &&
                scopePlotKeys.length === 0 &&
                result.analysisTran &&
                !shouldAnimateGsinScope(circuit.components)
            ) {
                alert(
                    'Oscilloscope : aucune courbe reçue du moteur SPICE.\n\n' +
                        'Vérifiez CH1, CH2 et la masse (borne du bas) câblés, plus une masse GND dans le circuit.\n' +
                        'Relancez avec Ctrl+F5 si vous venez de mettre à jour le simulateur.'
                );
            }
            const osc = circuit.components.find((c) => c.type === 'oscilloscope');
            if (osc) {
                if (!isSilentUpdate) {
                    openScopePanel(osc, { openPopup: true });
                } else {
                    const keepPopup = isScopePopupOpen();
                    const sf = document.getElementById('scope-fields');
                    const scopeFieldsVisible = sf && !sf.classList.contains('hidden');
                    if (isScopePanelOpen() || keepPopup || scopeFieldsVisible) {
                        openScopePanel(getActiveScope() || osc, { openPopup: keepPopup });
                    }
                    refreshScopePopup();
                }
            }
            if (isSerialMonitorOpen()) refreshSerialMonitor();
            const bodeComp = circuit.components.find((c) => c.type === 'bode_analyzer');
            if (bodeComp && (result.analysisAc || Object.keys(simulationResults.bodePlots).length > 0)) {
                if (!isSilentUpdate) {
                    openBodePopup(bodeComp);
                } else if (isBodePopupOpen()) {
                    refreshBodePopup();
                }
            }
            if (result.analysisTran) {
                const vmPlots = result.voltmeterTranPlots || {};
                const ledPlots = result.ledTranPlots || {};
                const seg7Plots = result.seg7TranPlots || {};
                const bargraphPlots = result.bargraphTranPlots || {};
                const logicGateTranPlots = result.logicGateTranPlots || {};
                const arduinoIdeal = hasArduinoStaticIdealDisplay();
                if (
                    Object.keys(vmPlots).length ||
                    Object.keys(ledPlots).length ||
                    Object.keys(seg7Plots).length ||
                    Object.keys(bargraphPlots).length ||
                    Object.keys(logicGateTranPlots).length
                ) {
                    startLedAnimation(ledPlots, vmPlots, seg7Plots, logicGateTranPlots, {
                        keepClock: isSilentUpdate,
                        bargraphPlots,
                    });
                } else if (!arduinoIdeal) {
                    stopLedAnimation();
                }
                flushSourcePanelFields();
                const speakerPlots = result.speakerTranPlots || {};
                if (shouldPlaySpeakerAudio(speakerPlots)) {
                    startSpeakerAudio(speakerPlots).catch(() => {});
                } else {
                    stopSpeakerAudio();
                }
            } else {
                stopLedAnimation(true);
                stopSpeakerAudio();
            }
            const hasBurntLed = Object.values(simulationResults.leds).some((m) => {
                const i = m && typeof m === 'object' ? m.current : m;
                return isLedOvercurrent(i);
            });
            if (hasBurntLed && !hasLedAnimation() && !hasVoltmeterAnimation()) startBurntLedSmokeLoop();
            flags.isSimulating = true;
            resetArduinoRuntimes();
            ensureArduinoLedAnimation();
            ensureDcMotorAnimationLoop();
            if (btnSim) { btnSim.innerText = "▶️ Simulation Live"; btnSim.style.background = "#00bcd4"; }
            if (btnStop) btnStop.classList.remove('disabled');
            draw();
        } else {
            if (!isSilentUpdate) alert("Erreur du moteur SPICE :\n" + formatSpiceEngineErrors(result));
            stopSimulation();
        }
    } catch (err) {
        if (err?.name === 'AbortError' || myGeneration !== simulationGeneration) return;
        if (!isSilentUpdate) alert(`Erreur réseau :\n${formatSimulationNetworkError(err, baseUrl)}`);
        stopSimulation();
    } finally {
        simulationInFlight = false;
        if (myGeneration !== simulationGeneration) return;
        if (simulationQueuedSilent) {
            simulationQueuedSilent = false;
            triggerSimulation(true);
        }
    }
}

export function stopSimulation() {
    simulationGeneration += 1;
    simulationQueuedSilent = false;
    if (simulationAbortController) {
        simulationAbortController.abort();
        simulationAbortController = null;
    }
    simulationInFlight = false;
    clearTimeout(liveSimTimer);
    liveSimTimer = null;
    stopLedAnimation();
    stopScopeAnimation();
    closeScopePanelFully();
    stopSpeakerAudio();
    flags.isSimulating = false;
    resetTftLiveInputStateForCircuit(circuit.components);
    simulationResults.voltmeters = {}; simulationResults.ammeters = {}; simulationResults.ohmmeters = {}; simulationResults.leds = {}; simulationResults.scopePlots = {}; simulationResults.bodePlots = {}; simulationResults.seg7 = {}; simulationResults.bargraph = {}; simulationResults.logicValues = {};
    const btnSim = document.getElementById('btn-simulate'); const btnStop = document.getElementById('btn-stop');
    if (btnSim) { btnSim.innerText = "🚀 Lancer Simulation"; btnSim.style.background = "#00ca71"; }
    if (btnStop) btnStop.classList.add('disabled');
    draw();
}