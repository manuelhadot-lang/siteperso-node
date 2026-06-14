// simulation.js
import { circuit, flags, simulationResults, GRID_SIZE } from './state.js';
import { cd4511JonctionToTerminalKey } from './cd4511-layout.js';
import { ic74hc90JonctionToTerminalKey } from './ic74hc90-layout.js';
import { arduinoUnoJonctionToTerminalKey } from './arduino-uno-layout.js';
import { draw } from './renderer.js';
import { startLedAnimation, stopLedAnimation, startBurntLedSmokeLoop, isLedOvercurrent, hasLedAnimation, hasVoltmeterAnimation, ensureArduinoLedAnimation, hasArduinoStaticIdealDisplay } from './led-animation.js';
import { startScopeAnimation, stopScopeAnimation } from './scope-animation.js';
import { openScopePanel, isScopePanelOpen, getActiveScope } from './scope-panel.js';
import { isScopePopupOpen, refreshScopePopup } from './scope-popup.js';
import { isBodePopupOpen, openBodePopup, refreshBodePopup } from './bode-popup.js';
import { startSpeakerAudio, stopSpeakerAudio } from './speaker-audio.js';

let liveSimTimer = null;
let simulationInFlight = false;
let simulationQueuedSilent = false;

/** Relance ngspice pendant une simulation active (valeurs composants / sources). */
export function requestLiveSimulation() {
    if (!flags.isSimulating) return;
    clearTimeout(liveSimTimer);
    liveSimTimer = setTimeout(() => {
        if (flags.isSimulating) triggerSimulation(true);
    }, 400);
}

import { prepareArduinoForSimulation } from './arduino-editor.js';
import { applyArduinoSketchToComponent } from './Engine/arduino-sketch-parse.mjs';

const COMPONENT_TYPE_TO_ENGINE = {
    battery: 'vsource', vcc: 'vterm', logic_terminal: 'logic_state',
    gnd: 'ground',
    not: 'logic_not', and: 'logic_and', nand: 'logic_nand', or: 'logic_or', nor: 'logic_nor', xor: 'logic_xor', xnor: 'logic_xnor',
    d_flipflop: 'logic_dff', jk_flipflop: 'logic_jk', cd4511: 'logic_cd4511', ic_74hc90: 'ic_74hc90', arduino_uno: 'arduino_uno', led: 'diode_led', seg7: 'seg7',
    gimp: 'vpulse', gsin: 'vsin', gsqr: 'vsquare',
};

function formatGsinValue(comp) {
    const a = comp.peakAmplitude ?? 5;
    const f = comp.frequency ?? 1000;
    const o = comp.offset ?? 0;
    const fStr = f >= 1000 && f % 1000 === 0 ? `${f / 1000}kHz` : `${f}Hz`;
    return `${a}V ${fStr} ${o}V`;
}

function formatGimpValue(comp) {
    const v = comp.voltageRail ?? 5;
    const f = comp.frequency ?? 2;
    const d = comp.dutyCycle ?? 50;
    let fStr;
    if (f > 0 && f < 1) {
        const period = 1 / f;
        fStr = `${period >= 10 ? Math.round(period * 1000) / 1000 : period}s`;
    } else if (f >= 1000 && f % 1000 === 0) {
        fStr = `${f / 1000}kHz`;
    } else {
        fStr = `${f}Hz`;
    }
    return `${v}V ${fStr} ${d}%`;
}

function formatGsqrValue(comp) {
    const a = comp.peakAmplitude ?? 5;
    const f = comp.frequency ?? 1000;
    const o = comp.offset ?? 0;
    const fStr = f >= 1000 && f % 1000 === 0 ? `${f / 1000}kHz` : `${f}Hz`;
    return `${a}V ${fStr} offset ${o}V`;
}

function jonctionIdToTerminalKey(jonctionId) {
    const junc = circuit.autoJunctions.find((j) => j.id === jonctionId);
    if (junc) return `__t#${junc.x}#${junc.y}`;
    for (const comp of circuit.components) {
        const id = comp.label; if (!id) continue;
        if (comp.type === 'not') {
            if (jonctionId === `${id}_inA`) return `${id}#0`;
            if (jonctionId === `${id}_out`) return `${id}#1`;
        } else if (['and', 'nand', 'or', 'nor', 'xor', 'xnor'].includes(comp.type)) {
            if (jonctionId === `${id}_inA`) return `${id}#0`;
            if (jonctionId === `${id}_inB`) return `${id}#1`;
            if (jonctionId === `${id}_out`) return `${id}#2`;
        } else if (comp.type === 'd_flipflop') {
            if (jonctionId === `${id}_D`) return `${id}#0`;
            if (jonctionId === `${id}_CLK`) return `${id}#1`;
            if (jonctionId === `${id}_Q`) return `${id}#2`;
            if (jonctionId === `${id}_Qbar`) return `${id}#3`;
            if (jonctionId === `${id}_SET`) return `${id}#4`;
            if (jonctionId === `${id}_RESET`) return `${id}#5`;
        } else if (comp.type === 'jk_flipflop') {
            if (jonctionId === `${id}_J`) return `${id}#0`;
            if (jonctionId === `${id}_K`) return `${id}#1`;
            if (jonctionId === `${id}_CLK`) return `${id}#2`;
            if (jonctionId === `${id}_Q`) return `${id}#3`;
            if (jonctionId === `${id}_Qbar`) return `${id}#4`;
            if (jonctionId === `${id}_SET`) return `${id}#5`;
            if (jonctionId === `${id}_RESET`) return `${id}#6`;
        } else if (['gnd', 'vcc', 'logic_terminal'].includes(comp.type)) {
            if (jonctionId === `${id}_out`) return `${id}#0`;
        } else if (comp.type === 'gimp') {
            if (jonctionId === `${id}_in`) return `${id}#1`;
            if (jonctionId === `${id}_out`) return `${id}#0`;
        } else if (comp.type === 'gsin') {
            if (jonctionId === `${id}_in`) return `${id}#0`;
            if (jonctionId === `${id}_out`) return `${id}#1`;
        } else if (comp.type === 'gsqr') {
            if (jonctionId === `${id}_in`) return `${id}#0`;
            if (jonctionId === `${id}_out`) return `${id}#1`;
        } else if (comp.type === 'oscilloscope') {
            if (jonctionId === `${id}_CH1`) return `${id}#0`;
            if (jonctionId === `${id}_CH2`) return `${id}#1`;
            if (jonctionId === `${id}_GND`) return `${id}#2`;
        } else if (comp.type === 'npn') {
            if (jonctionId === `${id}_B`) return `${id}#0`;
            if (jonctionId === `${id}_C`) return `${id}#1`;
            if (jonctionId === `${id}_E`) return `${id}#2`;
        } else if (comp.type === 'opamp') {
            if (jonctionId === `${id}_plus`) return `${id}#0`;
            if (jonctionId === `${id}_minus`) return `${id}#1`;
            if (jonctionId === `${id}_out`) return `${id}#2`;
        } else if (comp.type === 'seg7') {
            const segs = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
            for (let i = 0; i < segs.length; i++) {
                if (jonctionId === `${id}_${segs[i]}`) return `${id}#${i}`;
            }
            if (jonctionId === `${id}_COM`) return `${id}#7`;
        } else if (comp.type === 'cd4511') {
            const key = cd4511JonctionToTerminalKey(id, jonctionId);
            if (key) return key;
        } else if (comp.type === 'ic_74hc90') {
            const key = ic74hc90JonctionToTerminalKey(id, jonctionId);
            if (key) return key;
        } else if (comp.type === 'arduino_uno') {
            const key = arduinoUnoJonctionToTerminalKey(id, jonctionId);
            if (key) return key;
        } else if (comp.type === 'potentiometer') {
            if (jonctionId === `${id}_in`) return `${id}#0`;
            if (jonctionId === `${id}_wip`) return `${id}#1`;
            if (jonctionId === `${id}_out`) return `${id}#2`;
        } else if (comp.type === 'switch_spdt') {
            if (jonctionId === `${id}_com`) return `${id}#0`;
            if (jonctionId === `${id}_a`) return `${id}#1`;
            if (jonctionId === `${id}_b`) return `${id}#2`;
        } else {
            if (jonctionId === `${id}_in`) return `${id}#0`;
            if (jonctionId === `${id}_out`) return `${id}#1`;
        }
    }
    return null;
}

function buildSimulationState() {
    const simComponents = circuit.components.map((comp) => {
        const id = comp.label;
        const engineType = COMPONENT_TYPE_TO_ENGINE[comp.type] || comp.type;
        const out = { id, type: engineType, x: comp.x, y: comp.y, rotation: comp.rotation || 0 };
        if (comp.type === 'logic_terminal') {
            out.value = comp.state === 1 ? '1' : '0';
            out.logicRail = comp.highVoltage !== undefined ? comp.highVoltage : 5;
        } else if (comp.type === 'vcc') {
            out.value = comp.value !== undefined ? String(comp.value) : '5';
        } else if (engineType === 'vsource') {
            out.value = comp.value || '5';
        } else if (comp.type === 'gimp') {
            out.value = formatGimpValue(comp);
        } else if (comp.type === 'gsin') {
            out.value = formatGsinValue(comp);
        } else if (comp.type === 'gsqr') {
            out.value = formatGsqrValue(comp);
        }
        if (comp.type === 'resistor') out.value = comp.value || '1k';
        if (comp.type === 'potentiometer') {
            out.value = comp.value || '10k';
            out.position = comp.position ?? 50;
        }
        if (comp.type === 'switch_spdt') out.state = comp.state ?? 0;
        if (comp.type === 'push_button') out.state = comp.state ?? 0;
        if (comp.type === 'capacitor') out.value = comp.value || '1u';
        if (comp.type === 'inductor') out.value = comp.value || '1m';
        if (comp.type === 'diode') out.value = comp.value || '1N4148';
        if (comp.type === 'speaker') out.value = comp.value || '8';
        if (comp.type === 'npn') out.value = comp.value || '2N2222';
        if (comp.type === 'opamp') {
            out.value = comp.value || 'uA741';
            out.vp = comp.vp ?? 15;
            out.vn = comp.vn ?? -15;
        }
        if (comp.type === 'oscilloscope') {
            out.timeDivSec = comp.timeDivSec ?? 0.001;
            out.ch1VoltsPerDiv = comp.ch1VoltsPerDiv ?? 1;
            out.ch2VoltsPerDiv = comp.ch2VoltsPerDiv ?? 1;
            out.ch1PositionDiv = comp.ch1PositionDiv ?? 0;
            out.ch2PositionDiv = comp.ch2PositionDiv ?? 0;
        }
        if (comp.type === 'arduino_uno') {
            applyArduinoSketchToComponent(comp);
            out.sketch = comp.sketch || '';
            out.fqbn = comp.fqbn || 'arduino:avr:uno';
            out.pinModes = comp.pinModes || {};
            out.pinLevels = comp.pinLevels || {};
            out.pinPulses = comp.pinPulses || {};
            out.pinPhases = comp.pinPhases || [];
            out.avrRegisters = comp.avrRegisters || null;
        }
        return out;
    });
    const simWires = circuit.wires
        .filter((w) => w.fromJonctionId && w.toJonctionId)
        .map((w) => {
            const fromKey = jonctionIdToTerminalKey(w.fromJonctionId);
            const toKey = jonctionIdToTerminalKey(w.toJonctionId);
            const pts = Array.isArray(w.points) && w.points.length >= 2
                ? w.points
                : [{ x: 0, y: 0 }, { x: 0, y: 0 }];
            return { solid: true, fromKey, toKey, points: pts };
        })
        .filter((w) => w.fromKey && w.toKey);
    const dropped = circuit.wires.length - simWires.length;
    if (dropped > 0) {
        console.warn(
            `[Simulation] ${dropped} fil(s) ignoré(s) : jonction non reconnue ou extrémité manquante. Vérifiez le câblage (CD4511 : broches A…LT, a…g).`
        );
    }
    return { components: simComponents, wires: simWires };
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
        /CD4511|74HC90|XSPICE|digital\.cm|BI relié|LT relié|Q0 relié|fréquentielle|Analyse fréquentielle|Bode/i.test(String(w))
    );
    if (critical) alert(`Avertissement simulation :\n${text}`);
}

export async function triggerSimulation(isSilentUpdate = false) {
    if (simulationInFlight) {
        if (isSilentUpdate) simulationQueuedSilent = true;
        return;
    }
    simulationInFlight = true;
    prepareArduinoForSimulation();
    const baseUrl = resolveSimulationApiBaseUrl();
    const payload = { state: buildSimulationState(), gridStep: GRID_SIZE };
    const wiredCount = circuit.wires.filter((w) => w.fromJonctionId && w.toJonctionId).length;
    warnDroppedWiresForLogicCircuits(wiredCount - payload.state.wires.length, isSilentUpdate);
    const btnSim = document.getElementById('btn-simulate');
    const btnStop = document.getElementById('btn-stop');
    if (btnSim && !isSilentUpdate) { btnSim.innerText = "⚡ Calculs SPICE..."; btnSim.style.background = "#ff9800"; }
    try {
        const response = await fetch(`${baseUrl}/api/simulate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
        });
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
        if (result.ok) {
            showSimulationWarnings(result.warnings, isSilentUpdate);
            simulationResults.voltmeters = result.voltmeterValues || {};
            simulationResults.ammeters = result.ammeterValues || {};
            simulationResults.ohmmeters = result.ohmmeterValues || {};
            simulationResults.leds = result.ledValues || {};
            simulationResults.scopePlots = result.scopePlots || {};
            simulationResults.bodePlots = result.bodePlots || {};
            simulationResults.seg7 = result.seg7Values || {};
            simulationResults.logicValues = result.logicValues || {};
            const scopePlotKeys = Object.keys(simulationResults.scopePlots);
            if (scopePlotKeys.length > 0) {
                startScopeAnimation(simulationResults.scopePlots);
            } else {
                stopScopeAnimation();
            }
            const osc = circuit.components.find((c) => c.type === 'oscilloscope');
            if (osc) {
                if (!isSilentUpdate) {
                    openScopePanel(osc, { openPopup: true });
                } else {
                    const keepPopup = isScopePopupOpen();
                    const keepPanel = isScopePanelOpen();
                    if (keepPanel || keepPopup) {
                        openScopePanel(getActiveScope() || osc, { openPopup: keepPopup });
                    }
                    refreshScopePopup();
                }
            }
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
                const logicGateTranPlots = result.logicGateTranPlots || {};
                const arduinoIdeal = hasArduinoStaticIdealDisplay();
                if (
                    Object.keys(vmPlots).length ||
                    Object.keys(ledPlots).length ||
                    Object.keys(seg7Plots).length ||
                    Object.keys(logicGateTranPlots).length
                ) {
                    startLedAnimation(ledPlots, vmPlots, seg7Plots, logicGateTranPlots, {
                        keepClock: isSilentUpdate,
                    });
                } else if (!arduinoIdeal) {
                    stopLedAnimation();
                }
                const speakerPlots = result.speakerTranPlots || {};
                if (Object.keys(speakerPlots).length > 0) {
                    startSpeakerAudio(speakerPlots);
                } else {
                    stopSpeakerAudio();
                }
            } else {
                stopLedAnimation();
                stopSpeakerAudio();
            }
            const hasBurntLed = Object.values(simulationResults.leds).some((m) => {
                const i = m && typeof m === 'object' ? m.current : m;
                return isLedOvercurrent(i);
            });
            if (hasBurntLed && !hasLedAnimation() && !hasVoltmeterAnimation()) startBurntLedSmokeLoop();
            flags.isSimulating = true;
            ensureArduinoLedAnimation();
            if (btnSim) { btnSim.innerText = "▶️ Simulation Live"; btnSim.style.background = "#00bcd4"; }
            if (btnStop) btnStop.classList.remove('disabled');
            draw();
        } else {
            if (!isSilentUpdate) alert("Erreur du moteur SPICE :\n" + formatSpiceEngineErrors(result));
            stopSimulation();
        }
    } catch (err) {
        if (!isSilentUpdate) alert(`Erreur réseau :\n${formatSimulationNetworkError(err, baseUrl)}`);
        stopSimulation();
    } finally {
        simulationInFlight = false;
        if (simulationQueuedSilent) {
            simulationQueuedSilent = false;
            triggerSimulation(true);
        }
    }
}

export function stopSimulation() {
    clearTimeout(liveSimTimer);
    liveSimTimer = null;
    stopLedAnimation();
    stopScopeAnimation();
    stopSpeakerAudio();
    flags.isSimulating = false;
    simulationResults.voltmeters = {}; simulationResults.ammeters = {}; simulationResults.ohmmeters = {}; simulationResults.leds = {}; simulationResults.scopePlots = {}; simulationResults.bodePlots = {}; simulationResults.seg7 = {}; simulationResults.logicValues = {};
    const btnSim = document.getElementById('btn-simulate'); const btnStop = document.getElementById('btn-stop');
    if (btnSim) { btnSim.innerText = "🚀 Lancer Simulation"; btnSim.style.background = "#00ca71"; }
    if (btnStop) btnStop.classList.add('disabled');
    draw();
}