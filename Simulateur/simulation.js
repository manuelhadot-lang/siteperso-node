// simulation.js
import { circuit, flags, simulationResults, GRID_SIZE } from './state.js';
import { draw } from './renderer.js';
import { startLedAnimation, stopLedAnimation } from './led-animation.js';

const COMPONENT_TYPE_TO_ENGINE = {
    battery: 'vsource', vcc: 'vterm', logic_terminal: 'logic_state',
    gnd: 'ground', nand: 'logic_nand', d_flipflop: 'logic_dff', jk_flipflop: 'logic_jk', led: 'diode_led',
    gimp: 'vpulse',
};

function formatGimpValue(comp) {
    const v = comp.voltageRail ?? 5;
    const f = comp.frequency ?? 1000;
    const d = comp.dutyCycle ?? 10;
    const fStr = f >= 1000 && f % 1000 === 0 ? `${f / 1000}kHz` : `${f}Hz`;
    return `${v}V ${fStr} ${d}%`;
}

function jonctionIdToTerminalKey(jonctionId) {
    const junc = circuit.autoJunctions.find((j) => j.id === jonctionId);
    if (junc) return `__t#${junc.x}#${junc.y}`;
    for (const comp of circuit.components) {
        const id = comp.label; if (!id) continue;
        if (comp.type === 'nand') {
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
        } else if (['battery', 'gimp'].includes(comp.type)) {
            // Symbole : entrée (gauche) = −, sortie (droite) = + (comme la pile)
            if (jonctionId === `${id}_in`) return `${id}#1`;
            if (jonctionId === `${id}_out`) return `${id}#0`;
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
        }
        if (comp.type === 'resistor') out.value = comp.value || '1k';
        return out;
    });
    const simWires = circuit.wires
        .filter((w) => w.fromJonctionId && w.toJonctionId && Array.isArray(w.points) && w.points.length >= 2)
        .map((w) => ({ solid: true, fromKey: jonctionIdToTerminalKey(w.fromJonctionId), toKey: jonctionIdToTerminalKey(w.toJonctionId), points: w.points }))
        .filter((w) => w.fromKey && w.toKey);
    return { components: simComponents, wires: simWires };
}

export async function triggerSimulation(isSilentUpdate = false) {
    let baseUrl = window.location.origin;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        if (window.location.port !== '3000') baseUrl = 'http://localhost:3000';
    }
    const payload = { state: buildSimulationState(), gridStep: GRID_SIZE };
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
            try { const errJson = await response.json(); backendError = errJson.error || errJson.message; } catch(e) { backendError = await response.text(); }
            throw new Error(backendError);
        }
        const result = await response.json();
        if (result.ok) {
            simulationResults.voltmeters = result.voltmeterValues || {};
            simulationResults.leds = result.ledValues || {};
            if (result.analysisTran && result.ledTranPlots && Object.keys(result.ledTranPlots).length) {
                startLedAnimation(result.ledTranPlots);
            } else {
                stopLedAnimation();
            }
            flags.isSimulating = true;
            if (btnSim) { btnSim.innerText = "▶️ Simulation Live"; btnSim.style.background = "#00bcd4"; }
            if (btnStop) btnStop.classList.remove('disabled');
            draw();
        } else {
            if (!isSilentUpdate) alert("Erreur du moteur SPICE :\n" + (result.error || "Vérifiez les masses"));
            stopSimulation();
        }
    } catch (err) {
        if (!isSilentUpdate) alert(`Erreur réseau :\n${err.message}`);
        stopSimulation();
    }
}

export function stopSimulation() {
    stopLedAnimation();
    flags.isSimulating = false; 
    simulationResults.voltmeters = {}; simulationResults.ammeters = {}; simulationResults.leds = {};
    const btnSim = document.getElementById('btn-simulate'); const btnStop = document.getElementById('btn-stop');
    if (btnSim) { btnSim.innerText = "🚀 Lancer Simulation"; btnSim.style.background = "#00ca71"; }
    if (btnStop) btnStop.classList.add('disabled');
    draw();
}