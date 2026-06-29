// app.js (Nouveau fichier principal)
import { canvas, GRID_SIZE, scale, pan, flags, counters, circuit, interaction, zone, menuDrag, clipboard, undoStack, redoStack, emptyDragImage, snapToGrid, toGridCoords, saveState } from './state.js';
import { isPointOnSegment, findWireIntersection, getComponentJonctions, componentHitTest, potentiometerControlHit, switchSpdtToggleHit, pushButtonToggleHit, syncWireEndpointsToJonctions } from './geometry.js';
import { resizeCanvas, draw } from './renderer.js';
import { triggerSimulation, stopSimulation, requestLiveSimulation } from './simulation.js';
import { openSourcePanel, closeSourcePanel, onSourceRemoved, initSourcePanel } from './source-panel.js';
import { openScopePanel, closeScopePanelFully, onScopeRemoved, initScopePanel, onScopePopupClosed, refreshScopePanelFields } from './scope-panel.js';
import { initScopePopup, refreshScopePopup, setScopePopupCloseCallback, setScopeViewChangeCallback } from './scope-popup.js';
import { initSerialMonitor, openSerialMonitor, refreshSerialMonitor } from './serial-monitor-popup.js';
import { initArduinoLibPopup } from './arduino-lib-popup.js';
import { initBodePopup, openBodePopup } from './bode-popup.js';
import { bindLedAnimationRedraw, onCircuitLoaded } from './led-animation.js';
import { applyArduinoSketchToComponent } from './Engine/arduino-sketch-parse.mjs';
import { bindSpeakerAudioRedraw, primeSpeakerAudioContext } from './speaker-audio.js';
import { bindScopeAnimationRedraw, bindScopePopupRedraw } from './scope-animation.js';
import { initEditorTheme, setEditorTheme } from './theme.js';
import { initValuePrompt, showValuePrompt } from './value-prompt.js';
import {
    initArduinoEditor,
    openArduinoEditor,
    openArduinoEditorForCircuit,
    getActiveArduinoBoard,
    onArduinoBoardRemoved,
    resetArduinoEditorOnCircuitLoad,
    flushArduinoSketchesBeforeSave,
    syncActiveBoardAfterCircuitChange,
} from './arduino-editor.js';
import { DEFAULT_ARDUINO_SKETCH } from './arduino-uno-layout.js';
import { DEFAULT_ESP32_SKETCH, ESP32_FQBN } from './esp32-c3-layout.js';
import { DEFAULT_ESP32_DEVKIT_SKETCH, ESP32_DEVKIT_FQBN } from './esp32-devkit-layout.js';
import { isMicroBoard } from './micro-board.js';
import { showModal, hideModal, initModalUi } from './modal-ui.js';
import { parseJsonText, normalizeCircuitPayload, migrateLoadedComponents } from './json-utils.js';
import { DC10H_COLOR_IDS, DC10H_COLORS } from './bargraph-dc10h-layout.js';
import { MATRIX_COLOR_IDS, MATRIX_COLORS } from './matrix-8x8-layout.js';

/** « Simulateur H » (application Windows) ou site web. */
const APP_PRODUCT_NAME =
    new URLSearchParams(window.location.search).get('app') === 'h'
        ? 'Simulateur H'
        : 'Simulateur de Circuits';

const COMPONENT_PREFIX = {
    battery: 'VDC', resistor: 'R', potentiometer: 'POT', switch_spdt: 'SW', push_button: 'BP', capacitor: 'C', inductor: 'L', diode: 'D',
    npn: 'Q', opamp: 'AOP', lm386: 'LM386',
    not: 'NOT', and: 'AND', nand: 'NAND', or: 'OR', nor: 'NOR', xor: 'XOR', xnor: 'XNOR',
    d_flipflop: 'DFF', jk_flipflop: 'JKFF', cd4511: 'CD4511', ic_74hc90: 'HC90', arduino_uno: 'UNO', esp32_c3: 'ESP', esp32_devkit: 'ESP32', led: 'LED', seg7: 'SEG', bargraph_dc10h: 'BAR', matrix_8x8: 'MX8', grove_lcd16x2: 'LCD', grove_dht22: 'DHT', grove_tsl2591: 'TSL', grove_bmp280: 'BMP', joyit_tft18: 'TFT',
    voltmeter: 'V', ammeter: 'A', ohmmeter: 'OHM', oscilloscope: 'Osci', bode_analyzer: 'Bode', speaker: 'HP', gnd: 'GND', vcc: 'VCC', logic_terminal: 'LOGIC', gimp: 'GImp', gsin: 'Sin', gsqr: 'Sq',
};
const NON_ROTATABLE = new Set(['d_flipflop', 'jk_flipflop', 'cd4511', 'ic_74hc90', 'arduino_uno', 'esp32_c3', 'esp32_devkit', 'gimp', 'gsin', 'gsqr', 'oscilloscope', 'npn', 'opamp', 'lm386', 'seg7', 'bargraph_dc10h', 'matrix_8x8', 'grove_dht22', 'grove_tsl2591', 'grove_bmp280']);
function ensureComponentCounter(type) {
    if (counters[type] == null || !Number.isFinite(counters[type])) counters[type] = 0;
    counters[type]++;
    return counters[type];
}
function newComponentLabel(type) {
    const pfx = COMPONENT_PREFIX[type] || 'U';
    return `${pfx}${ensureComponentCounter(type)}`;
}
function ensureAllCounters() {
    for (const type of Object.keys(COMPONENT_PREFIX)) {
        if (counters[type] == null || !Number.isFinite(counters[type])) counters[type] = 0;
    }
    if (counters.junction == null || !Number.isFinite(counters.junction)) counters.junction = 0;
}
let fileHandle = null;
let circuitDisplayName = 'Sans titre';

function formatCircuitDisplayName(raw) {
    const s = String(raw || '').trim();
    if (!s) return 'Sans titre';
    return s.replace(/\.json$/i, '');
}

function setCircuitDisplayName(name) {
    circuitDisplayName = formatCircuitDisplayName(name);
    const el = document.getElementById('circuit-name');
    if (el) {
        el.textContent = circuitDisplayName;
        el.title = `Montage : ${circuitDisplayName}`;
    }
    document.title = `${circuitDisplayName} — ${APP_PRODUCT_NAME}`;
}
let lastMouseGridPos = { x: 0, y: 0 };
let liveDragMoved = false;
let heldPushButton = null;

// --- HISTORIQUE & SÉCURITÉ ---
function undo() {
    if (flags.isSimulating) { alert("Veuillez arrêter la simulation avant de modifier le schéma."); return; }
    if (undoStack.length === 0) return;
    redoStack.push(JSON.stringify({ components: circuit.components, wires: circuit.wires, autoJunctions: circuit.autoJunctions, counters }));
    const prev = JSON.parse(undoStack.pop());
    circuit.components = prev.components; circuit.wires = prev.wires; circuit.autoJunctions = prev.autoJunctions; Object.assign(counters, prev.counters);
    interaction.selectedComponents = []; interaction.selectedAutoJunctions = []; interaction.selectedWire = null;
    syncActiveBoardAfterCircuitChange();
    draw();
}
function redo() {
    if (flags.isSimulating) { alert("Veuillez arrêter la simulation avant de modifier le schéma."); return; }
    if (redoStack.length === 0) return;
    undoStack.push(JSON.stringify({ components: circuit.components, wires: circuit.wires, autoJunctions: circuit.autoJunctions, counters }));
    const next = JSON.parse(redoStack.pop());
    circuit.components = next.components; circuit.wires = next.wires; circuit.autoJunctions = next.autoJunctions; Object.assign(counters, next.counters);
    interaction.selectedComponents = []; interaction.selectedAutoJunctions = []; interaction.selectedWire = null;
    syncActiveBoardAfterCircuitChange();
    draw();
}

// --- FICHIERS ET SAUVEGARDE ---
function getCircuitDataJSON() {
    flushArduinoSketchesBeforeSave();
    return JSON.stringify(
        {
            name: circuitDisplayName,
            components: circuit.components,
            wires: circuit.wires,
            autoJunctions: circuit.autoJunctions,
            counters,
        },
        null,
        4
    );
}
async function saveAs() {
    try {
        fileHandle = await window.showSaveFilePicker({ suggestedName: 'schema_circuit.json', types: [{ description: 'Fichier JSON Circuit', accept: { 'application/json': ['.json'] } }] });
        setCircuitDisplayName(fileHandle.name);
        const writable = await fileHandle.createWritable(); await writable.write(getCircuitDataJSON()); await writable.close();
    } catch (err) { fallbackDownload(getCircuitDataJSON()); }
}
async function saveFile() {
    if (fileHandle) { try { const w = await fileHandle.createWritable(); await w.write(getCircuitDataJSON()); await w.close(); } catch (e) { await saveAs(); } } else { await saveAs(); }
}
function fallbackDownload(content) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type: 'application/json' })); a.download = 'schema_export.json'; a.click();
}
async function openFile() {
    if (circuit.components.length > 0 && confirm("Voulez-vous sauvegarder votre schéma actuel ?")) { await saveFile(); }
    try {
        const [handle] = await window.showOpenFilePicker({ types: [{ accept: { 'application/json': ['.json'] } }] });
        fileHandle = handle;
        setCircuitDisplayName(handle.name);
        loadCircuitFromJSON(await (await handle.getFile()).text());
    } catch (err) {
        if (err?.name === 'AbortError') return;
        const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
        input.onchange = e => {
            const file = e.target.files?.[0];
            if (!file) return;
            fileHandle = null;
            setCircuitDisplayName(file.name);
            const r = new FileReader();
            r.onload = ev => loadCircuitFromJSON(ev.target.result);
            r.onerror = () => alert('Impossible de lire le fichier sélectionné.');
            r.readAsText(file, 'UTF-8');
        };
        input.click();
    }
}
function syncCountersFromLabels(components) {
    for (const comp of components) {
        const pfx = COMPONENT_PREFIX[comp.type];
        if (!pfx || !comp.label?.startsWith(pfx)) continue;
        const n = parseInt(comp.label.slice(pfx.length), 10);
        if (Number.isFinite(n) && n > (counters[comp.type] || 0)) {
            counters[comp.type] = n;
        }
    }
}

function repairComponentsAfterLoad(components) {
    migrateLoadedComponents(components);
    for (const comp of components) {
        if (isMicroBoard(comp)) {
            if (typeof comp.sketch !== 'string') {
                comp.sketch = comp.type === 'esp32_devkit' ? DEFAULT_ESP32_DEVKIT_SKETCH : comp.type === 'esp32_c3' ? DEFAULT_ESP32_SKETCH : DEFAULT_ARDUINO_SKETCH;
            }
            if (!comp.fqbn) {
                comp.fqbn = comp.type === 'esp32_devkit' ? ESP32_DEVKIT_FQBN : comp.type === 'esp32_c3' ? ESP32_FQBN : 'arduino:avr:uno';
            } else if ((comp.type === 'esp32_c3' || comp.type === 'esp32_devkit') && String(comp.fqbn).startsWith('espressif:esp32:')) {
                comp.fqbn = comp.type === 'esp32_devkit' ? ESP32_DEVKIT_FQBN : ESP32_FQBN;
            }
            comp.pinModes = comp.pinModes || {};
            comp.pinLevels = comp.pinLevels || {};
            comp.lastCompileLog = typeof comp.lastCompileLog === 'string' ? comp.lastCompileLog : '';
            applyArduinoSketchToComponent(comp);
        }
    }
}

function resetUiAfterCircuitLoad() {
    flags.isDraggingFromMenu = false;
    menuDrag.draggedComponentType = null;
    flags.isPanning = false;
    interaction.activeWire = null;
    document.querySelectorAll('.navbar > .menu-item.open').forEach((m) => m.classList.remove('open'));
    document.querySelectorAll('.dropdown-submenu.open').forEach((s) => s.classList.remove('open'));
    hideModal(document.getElementById('value-prompt-modal'));
}

function loadCircuitFromJSON(jsonText) {
    try {
        const data = normalizeCircuitPayload(parseJsonText(jsonText));
        if (data.name) setCircuitDisplayName(data.name);
        resetArduinoEditorOnCircuitLoad();
        for (const k of Object.keys(counters)) counters[k] = 0;
        circuit.components = data.components;
        circuit.wires = data.wires;
        circuit.autoJunctions = data.autoJunctions;
        Object.assign(counters, data.counters);
        repairComponentsAfterLoad(circuit.components);
        ensureAllCounters();
        syncCountersFromLabels(circuit.components);
        syncWireEndpointsToJonctions();
        interaction.selectedComponents = [];
        interaction.selectedAutoJunctions = [];
        interaction.selectedWire = null;
        undoStack.length = 0;
        redoStack.length = 0;
        stopSimulation();
        closeSourcePanel();
        closeScopePanelFully();
        resetUiAfterCircuitLoad();
        onCircuitLoaded();
        draw();
    } catch (e) {
        console.error('loadCircuitFromJSON', e);
        alert(`Erreur lors de la lecture du fichier JSON.\n\n${e?.message || e}`);
    }
}

// --- CLAVIER & RECOPIE ---
function isTextFieldFocused() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return true;
    return el.isContentEditable === true;
}

window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase(); if (e.key === 'Shift') flags.isShiftPressed = true;
    if (isTextFieldFocused()) return;
    if (e.code === 'Space' && interaction.activeWire) {
        e.preventDefault(); const last = interaction.activeWire.points[interaction.activeWire.points.length - 1]; interaction.activeWire.points.push({ x: last.x, y: last.y }); draw(); return;
    }
    if (key === 'r' && !interaction.activeWire && interaction.selectedComponents.length > 0) {
        if (flags.isSimulating) { alert("Arrêtez la simulation avant de pivoter."); return; }
        const rotatable = interaction.selectedComponents.filter(comp => !NON_ROTATABLE.has(comp.type));
        if (rotatable.length === 0) { alert("La rotation est verrouillée pour les bascules, le GImp, le transistor et l'AOP."); return; }
        saveState(); rotatable.forEach(comp => comp.rotation = ((comp.rotation || 0) + 90) % 360); draw(); return;
    }
    if (key === 'x' && !interaction.activeWire && interaction.selectedComponents.length > 0) {
        if (flags.isSimulating) { alert("Arrêtez la simulation avant de retourner."); return; }
        const flippable = interaction.selectedComponents.filter(comp =>
            comp.type === 'gimp' || comp.type === 'npn' || comp.type === 'opamp' || comp.type === 'lm386' || comp.type === 'grove_lcd16x2' || comp.type === 'grove_dht22' || comp.type === 'grove_tsl2591' || comp.type === 'grove_bmp280' || comp.type === 'joyit_tft18' || comp.type === 'bargraph_dc10h' || comp.type === 'matrix_8x8');
        if (flippable.length === 0) return;
        saveState(); flippable.forEach(comp => { comp.flipX = !comp.flipX; }); draw(); return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (interaction.selectedComponents.length > 0 || interaction.selectedAutoJunctions.length > 0 || interaction.selectedWire !== null) {
            if (flags.isSimulating) { alert("Arrêtez la simulation avant de supprimer."); return; }
            saveState();
            if (interaction.selectedComponents.length > 0) {
                interaction.selectedComponents.forEach(comp => {
                    onSourceRemoved(comp);
                    onScopeRemoved(comp);
                    onArduinoBoardRemoved(comp);
                    const idx = circuit.components.indexOf(comp); if (idx > -1) circuit.components.splice(idx, 1);
                    circuit.wires = circuit.wires.filter(w => !w.fromJonctionId.startsWith(comp.label) && !w.toJonctionId.startsWith(comp.label));
                }); interaction.selectedComponents = [];
            }
            if (interaction.selectedAutoJunctions.length > 0) {
                interaction.selectedAutoJunctions.forEach(aj => {
                    const idx = circuit.autoJunctions.indexOf(aj); if (idx > -1) circuit.autoJunctions.splice(idx, 1);
                    circuit.wires = circuit.wires.filter(w => w.fromJonctionId !== aj.id && w.toJonctionId !== aj.id);
                }); interaction.selectedAutoJunctions = [];
            }
            if (interaction.selectedWire) { const idx = circuit.wires.indexOf(interaction.selectedWire); if (idx > -1) circuit.wires.splice(idx, 1); interaction.selectedWire = null; }
            circuit.autoJunctions = circuit.autoJunctions.filter(aj => circuit.wires.some(w => w.fromJonctionId === aj.id || w.toJonctionId === aj.id)); draw(); return;
        }
    }
    if (e.ctrlKey && key === 'c' && (interaction.selectedComponents.length > 0 || interaction.selectedAutoJunctions.length > 0)) {
        const internalWires = circuit.wires.filter(w => {
            const fC = interaction.selectedComponents.some(c => w.fromJonctionId.startsWith(c.label)), fJ = interaction.selectedAutoJunctions.some(aj => w.fromJonctionId === aj.id);
            const tC = interaction.selectedComponents.some(c => w.toJonctionId.startsWith(c.label)), tJ = interaction.selectedAutoJunctions.some(aj => w.toJonctionId === aj.id);
            return (fC || fJ) && (tC || tJ);
        });
        clipboard.data = { components: JSON.parse(JSON.stringify(interaction.selectedComponents)), autoJunctions: JSON.parse(JSON.stringify(interaction.selectedAutoJunctions)), wires: JSON.parse(JSON.stringify(internalWires)) };
    }
    if (e.ctrlKey && key === 'v' && clipboard.data) {
        if (flags.isSimulating) { alert("Arrêtez la simulation avant de coller."); return; }
        saveState(); const labelMap = {}, juncMap = {}, newC = [], newJ = [], newW = [];
        clipboard.data.components.forEach(comp => {
            const nl = newComponentLabel(comp.type); labelMap[comp.label] = nl;
            const cloned = { ...comp, x: comp.x + 40, y: comp.y + 40, label: nl }; circuit.components.push(cloned); newC.push(cloned);
        });
        clipboard.data.autoJunctions.forEach(aj => {
            counters.junction++; const njid = `auto_junc_${counters.junction}`; juncMap[aj.id] = njid;
            const cloned = { id: njid, x: aj.x + 40, y: aj.y + 40 }; circuit.autoJunctions.push(cloned); newJ.push(cloned);
        });
        clipboard.data.wires.forEach(w => {
            let fid = w.fromJonctionId, tid = w.toJonctionId;
            for (let ol in labelMap) { if (fid.startsWith(ol)) fid = fid.replace(ol, labelMap[ol]); if (tid.startsWith(ol)) tid = tid.replace(ol, labelMap[ol]); }
            if (juncMap[fid]) fid = juncMap[fid]; if (juncMap[tid]) tid = juncMap[tid];
            const cloned = { fromJonctionId: fid, toJonctionId: tid, points: w.points.map(pt => ({ x: pt.x + 40, y: pt.y + 40 })) }; circuit.wires.push(cloned); newW.push(cloned);
        });
        interaction.selectedComponents = newC; interaction.selectedAutoJunctions = newJ; interaction.selectedWire = null;
        clipboard.data = { components: JSON.parse(JSON.stringify(newC)), autoJunctions: JSON.parse(JSON.stringify(newJ)), wires: JSON.parse(JSON.stringify(newW)) }; draw();
    }
    if (e.ctrlKey && key === 'z') { e.preventDefault(); undo(); }
    if (e.ctrlKey && key === 'y') { e.preventDefault(); redo(); }
});
window.addEventListener('keyup', (e) => { if (e.key === 'Shift') flags.isShiftPressed = false; });

// --- GESTION DES MOUSE EVENTS ---
function updateMouseState(e) {
    const mousePos = toGridCoords(e.clientX, e.clientY);
    interaction.hoverJonction = null; interaction.hoveredComponent = null; interaction.hoveredWire = null;
    if (flags.isPanning || flags.isSelectingZone) return;

    interaction.hoveredComponent = circuit.components.find(comp => componentHitTest(comp, mousePos.x, mousePos.y));
    for (let comp of circuit.components) {
        for (let j of getComponentJonctions(comp)) { if (Math.hypot(mousePos.x - j.x, mousePos.y - j.y) < 12) { interaction.hoverJonction = j; break; } }
        if (interaction.hoverJonction) break;
    }
    if (!interaction.hoverJonction) {
        for (let aj of circuit.autoJunctions) { if (Math.hypot(mousePos.x - aj.x, mousePos.y - aj.y) < 12) { interaction.hoverJonction = aj; break; } }
    }
    if (!interaction.hoveredComponent && !interaction.hoverJonction && !interaction.activeWire) {
        for (let w of circuit.wires) {
            for (let i = 0; i < w.points.length - 1; i++) {
                if (isPointOnSegment(mousePos.x, mousePos.y, w.points[i], w.points[i+1], 5)) { interaction.hoveredWire = w; break; }
            }
            if (interaction.hoveredWire) break;
        }
    }
    canvas.style.cursor = flags.isShiftPressed ? 'cell' : (interaction.activeWire || interaction.hoverJonction ? 'crosshair' : (flags.isDraggingComponent ? 'grabbing' : (interaction.hoveredComponent ? 'pointer' : (interaction.hoveredWire ? 'help' : 'grab'))));
}

canvas.addEventListener('mousedown', (e) => {
    const mousePos = toGridCoords(e.clientX, e.clientY); const sX = snapToGrid(mousePos.x), sY = snapToGrid(mousePos.y);
    lastMouseGridPos = { x: sX, y: sY }; updateMouseState(e);
    if (e.button === 0 && isTextFieldFocused()) document.activeElement.blur();
    if (e.button === 0) {
        const hitComp = circuit.components.find((c) => componentHitTest(c, mousePos.x, mousePos.y));
        if (hitComp?.type === 'potentiometer') {
            const ctrl = potentiometerControlHit(hitComp, mousePos.x, mousePos.y);
            if (ctrl) {
                if (!flags.isSimulating) saveState();
                const step = 5;
                const pos = hitComp.position ?? 50;
                hitComp.position = ctrl === 'inc' ? Math.min(100, pos + step) : Math.max(0, pos - step);
                draw();
                if (flags.isSimulating) requestLiveSimulation();
                return;
            }
        }
        if (hitComp?.type === 'switch_spdt' && !interaction.hoverJonction && switchSpdtToggleHit(hitComp, mousePos.x, mousePos.y)) {
            if (!flags.isSimulating) saveState();
            hitComp.state = hitComp.state === 1 ? 0 : 1;
            draw();
            if (flags.isSimulating) requestLiveSimulation();
            return;
        }
        if (hitComp?.type === 'push_button' && !interaction.hoverJonction && pushButtonToggleHit(hitComp, mousePos.x, mousePos.y)) {
            if (!flags.isSimulating) saveState();
            if (hitComp.maintained) {
                hitComp.state = hitComp.state === 1 ? 0 : 1;
            } else {
                hitComp.state = 1;
                heldPushButton = hitComp;
            }
            draw();
            if (flags.isSimulating) requestLiveSimulation();
            return;
        }
        if (interaction.hoveredComponent && interaction.hoveredComponent.type === 'logic_terminal' && flags.isSimulating) {
            saveState(); interaction.hoveredComponent.state = interaction.hoveredComponent.state === 1 ? 0 : 1; draw();
            triggerSimulation(true); return;
        }
        if (flags.isShiftPressed) { flags.isSelectingZone = true; zone.start = { x: mousePos.x, y: mousePos.y }; zone.end = { x: mousePos.x, y: mousePos.y }; draw(); return; }
        if (interaction.hoverJonction) {
            if (flags.isSimulating) { alert("Arrêtez la simulation avant d'éditer."); return; }
            const matchedaj = circuit.autoJunctions.find(aj => aj.id === interaction.hoverJonction.id);
            if (matchedaj && !interaction.activeWire) { interaction.selectedComponents = []; interaction.selectedAutoJunctions = [matchedaj]; flags.isDraggingComponent = true; saveState(); draw(); return; }
            if (!interaction.activeWire) { interaction.activeWire = { fromJonctionId: interaction.hoverJonction.id, points: [{ x: interaction.hoverJonction.x, y: interaction.hoverJonction.y }, { x: sX, y: sY }] }; } 
            else { if (interaction.hoverJonction.id !== interaction.activeWire.fromJonctionId) { saveState(); interaction.activeWire.points[interaction.activeWire.points.length - 1] = { x: interaction.hoverJonction.x, y: interaction.hoverJonction.y }; interaction.activeWire.toJonctionId = interaction.hoverJonction.id; circuit.wires.push(interaction.activeWire); } interaction.activeWire = null; }
            interaction.selectedWire = null; draw(); return;
        }
        if (interaction.activeWire) {
            const intersect = findWireIntersection(mousePos.x, mousePos.y);
            if (intersect) {
                saveState(); counters.junction++; const njid = `auto_junc_${counters.junction}`; circuit.autoJunctions.push({ id: njid, x: intersect.x, y: intersect.y });
                interaction.activeWire.points[interaction.activeWire.points.length - 1] = { x: intersect.x, y: intersect.y }; interaction.activeWire.toJonctionId = njid; circuit.wires.push(interaction.activeWire); interaction.activeWire = null; interaction.selectedWire = null; draw(); return;
            }
        }
        if (interaction.hoveredWire) { interaction.selectedWire = interaction.hoveredWire; interaction.selectedComponents = []; interaction.selectedAutoJunctions = []; draw(); return; } else { interaction.selectedWire = null; }
    }
    if (interaction.activeWire && e.button === 2) { interaction.activeWire = null; draw(); return; }
    if (interaction.hoveredComponent) {
        const hc = interaction.hoveredComponent;
        if (flags.isSimulating) {
            if (hc.type === 'oscilloscope') {
                openScopePanel(hc);
                interaction.selectedComponents = [hc];
                draw();
                return;
            }
            if (hc.type === 'bode_analyzer') {
                closeSourcePanel();
                closeScopePanelFully();
                openBodePopup(hc);
                interaction.selectedComponents = [hc];
                draw();
                return;
            }
            if (hc.type === 'gimp' || hc.type === 'gsin' || hc.type === 'gsqr') {
                openSourcePanel(hc);
                interaction.selectedComponents = [hc];
                draw();
                return;
            }
            if (!interaction.selectedComponents.includes(hc)) {
                interaction.selectedComponents = [hc];
                interaction.selectedAutoJunctions = [];
            }
            flags.isDraggingComponent = true;
            liveDragMoved = false;
            draw();
            return;
        }
        if (!interaction.selectedComponents.includes(hc)) { interaction.selectedComponents = [hc]; interaction.selectedAutoJunctions = []; }
        if (hc.type === 'gimp' || hc.type === 'gsin' || hc.type === 'gsqr') { openSourcePanel(hc); }
        else if (hc.type === 'oscilloscope') { openScopePanel(hc); }
        else { closeSourcePanel(); closeScopePanelFully(); }
        flags.isDraggingComponent = true; saveState();
    } else { interaction.selectedComponents = []; interaction.selectedAutoJunctions = []; if (!flags.isSimulating) { closeSourcePanel(); closeScopePanelFully(); } flags.isPanning = true; flags.startX = e.clientX - pan.x; flags.startY = e.clientY - pan.y; }
    draw();
});

canvas.addEventListener('mouseleave', () => {
    if (heldPushButton) {
        heldPushButton.state = 0;
        heldPushButton = null;
        draw();
        if (flags.isSimulating) requestLiveSimulation();
    }
});
canvas.addEventListener('mousemove', (e) => {
    const mousePos = toGridCoords(e.clientX, e.clientY);
    if (flags.isSelectingZone) { zone.end = { x: mousePos.x, y: mousePos.y }; draw(); return; }
    updateMouseState(e);
    if (interaction.activeWire) { interaction.activeWire.points[interaction.activeWire.points.length - 1] = { x: snapToGrid(mousePos.x), y: snapToGrid(mousePos.y) }; draw(); } 
    else if (flags.isPanning) { pan.x = e.clientX - flags.startX; pan.y = e.clientY - flags.startY; draw(); } 
    else if (flags.isDraggingComponent && (interaction.selectedComponents.length > 0 || interaction.selectedAutoJunctions.length > 0)) {
        const sX = snapToGrid(mousePos.x), sY = snapToGrid(mousePos.y), dX = sX - lastMouseGridPos.x, dY = sY - lastMouseGridPos.y;
        if (dX !== 0 || dY !== 0) {
            interaction.selectedComponents.forEach(c => { c.x += dX; c.y += dY; }); interaction.selectedAutoJunctions.forEach(aj => { aj.x += dX; aj.y += dY; });
            circuit.wires.forEach(w => {
                const fMoved = interaction.selectedComponents.some(c => w.fromJonctionId.startsWith(c.label)) || interaction.selectedAutoJunctions.some(aj => w.fromJonctionId === aj.id);
                const tMoved = interaction.selectedComponents.some(c => w.toJonctionId.startsWith(c.label)) || interaction.selectedAutoJunctions.some(aj => w.toJonctionId === aj.id);
                if (fMoved && tMoved) { w.points.forEach(pt => { pt.x += dX; pt.y += dY; }); } else if (fMoved) { w.points[0].x += dX; w.points[0].y += dY; } else if (tMoved) { w.points[w.points.length - 1].x += dX; w.points[w.points.length - 1].y += dY; }
            });
            lastMouseGridPos = { x: sX, y: sY };
            if (flags.isSimulating) liveDragMoved = true;
        } draw();
    } else draw();
});

canvas.addEventListener('mouseup', () => {
    if (heldPushButton) {
        heldPushButton.state = 0;
        heldPushButton = null;
        draw();
        if (flags.isSimulating) requestLiveSimulation();
    }
    if (flags.isSelectingZone) {
        flags.isSelectingZone = false; const xMi = Math.min(zone.start.x, zone.end.x), xMa = Math.max(zone.start.x, zone.end.x), yMi = Math.min(zone.start.y, zone.end.y), yMa = Math.max(zone.start.y, zone.end.y);
        interaction.selectedComponents = circuit.components.filter(c => c.x >= xMi && c.x <= xMa && c.y >= yMi && c.y <= yMa); interaction.selectedAutoJunctions = circuit.autoJunctions.filter(aj => aj.x >= xMi && aj.x <= xMa && aj.y >= yMi && aj.y <= yMa);
    }
    const wasDragging = flags.isDraggingComponent;
    flags.isPanning = false; flags.isDraggingComponent = false;
    if (wasDragging && flags.isSimulating && liveDragMoved) {
        requestLiveSimulation();
    }
    draw();
});

function openCd4511DocModal(componentLabel) {
    const modal = document.getElementById('cd4511-doc-modal');
    const title = document.getElementById('cd4511-doc-title');
    if (!modal) return;
    if (title) {
        title.textContent = componentLabel
            ? `CD4511 — ${componentLabel}`
            : 'CD4511 — Décodeur BCD / 7 segments';
    }
    showModal(modal);
}

function closeCd4511DocModal() {
    hideModal(document.getElementById('cd4511-doc-modal'));
}

function openHc90DocModal(componentLabel) {
    const modal = document.getElementById('hc90-doc-modal');
    const title = document.getElementById('hc90-doc-title');
    if (!modal) return;
    if (title) {
        title.textContent = componentLabel
            ? `74HC90 — ${componentLabel}`
            : '74HC90 — Compteur décade asynchrone';
    }
    showModal(modal);
}

function closeHc90DocModal() {
    hideModal(document.getElementById('hc90-doc-modal'));
}

function openLm386DocModal(componentLabel) {
    const modal = document.getElementById('lm386-doc-modal');
    const title = document.getElementById('lm386-doc-title');
    if (!modal) return;
    if (title) {
        title.textContent = componentLabel
            ? `LM386 — ${componentLabel}`
            : 'LM386 — Amplificateur audio';
    }
    showModal(modal);
}

function closeLm386DocModal() {
    hideModal(document.getElementById('lm386-doc-modal'));
}

function openUnoDocModal(componentLabel) {
    const modal = document.getElementById('uno-doc-modal');
    const title = document.getElementById('uno-doc-title');
    if (!modal) return;
    if (title) {
        title.textContent = componentLabel
            ? `Arduino UNO R3 — ${componentLabel}`
            : 'Arduino UNO R3';
    }
    showModal(modal);
}

function closeUnoDocModal() {
    hideModal(document.getElementById('uno-doc-modal'));
}

function openEsp32DocModal(compOrLabel) {
    const modal = document.getElementById('esp32-doc-modal');
    const title = document.getElementById('esp32-doc-title');
    const body = document.getElementById('esp32-doc-body');
    if (!modal) return;
    const comp = typeof compOrLabel === 'object' ? compOrLabel : null;
    const label = comp?.label || (typeof compOrLabel === 'string' ? compOrLabel : '');
    const isDevkit = comp?.type === 'esp32_devkit';
    if (title) {
        title.textContent = label
            ? `${isDevkit ? 'ESP32 DevKit WROOM-32' : 'ESP32-C3 DevKit'} — ${label}`
            : (isDevkit ? 'ESP32 DevKit WROOM-32' : 'ESP32-C3 DevKit');
    }
    if (body) {
        body.dataset.boardType = isDevkit ? 'esp32_devkit' : 'esp32_c3';
        body.querySelector('.esp32-doc-c3')?.classList.toggle('hidden', isDevkit);
        body.querySelector('.esp32-doc-devkit')?.classList.toggle('hidden', !isDevkit);
    }
    showModal(modal);
}

function closeEsp32DocModal() {
    hideModal(document.getElementById('esp32-doc-modal'));
}

let activeBargraphDocComp = null;

function refreshBargraphColorPicker(selectedId) {
    const picker = document.getElementById('bargraph-color-picker');
    if (!picker) return;
    picker.innerHTML = '';
    for (const id of DC10H_COLOR_IDS) {
        const pal = DC10H_COLORS[id];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bargraph-color-btn' + (id === selectedId ? ' is-active' : '');
        btn.dataset.colorId = id;
        btn.title = pal.label;
        const swatch = document.createElement('span');
        swatch.className = 'bargraph-color-swatch';
        swatch.style.background = pal.lit;
        btn.appendChild(swatch);
        btn.appendChild(document.createTextNode(pal.label));
        btn.addEventListener('click', () => {
            if (!activeBargraphDocComp) return;
            activeBargraphDocComp.barColor = id;
            refreshBargraphColorPicker(id);
            draw();
        });
        picker.appendChild(btn);
    }
}

function openBargraphDocModal(comp) {
    const modal = document.getElementById('bargraph-doc-modal');
    const title = document.getElementById('bargraph-doc-title');
    if (!modal || !comp) return;
    activeBargraphDocComp = comp;
    if (title) {
        title.textContent = comp.label
            ? `Bargraph DC10H — ${comp.label}`
            : 'Bargraph DC10H — Lite-On';
    }
    refreshBargraphColorPicker(comp.barColor || 'red');
    showModal(modal);
}

function closeBargraphDocModal() {
    activeBargraphDocComp = null;
    hideModal(document.getElementById('bargraph-doc-modal'));
}

let activeMatrixDocComp = null;

function refreshMatrixColorPicker(selectedId) {
    const picker = document.getElementById('matrix-color-picker');
    if (!picker) return;
    picker.innerHTML = '';
    for (const id of MATRIX_COLOR_IDS) {
        const pal = MATRIX_COLORS[id];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bargraph-color-btn' + (id === selectedId ? ' is-active' : '');
        btn.title = pal.label;
        const swatch = document.createElement('span');
        swatch.className = 'bargraph-color-swatch';
        swatch.style.background = pal.lit;
        btn.appendChild(swatch);
        btn.appendChild(document.createTextNode(pal.label));
        btn.addEventListener('click', () => {
            if (!activeMatrixDocComp) return;
            activeMatrixDocComp.matrixColor = id;
            refreshMatrixColorPicker(id);
            draw();
        });
        picker.appendChild(btn);
    }
}

function openMatrixDocModal(comp) {
    const modal = document.getElementById('matrix-doc-modal');
    const title = document.getElementById('matrix-doc-title');
    if (!modal || !comp) return;
    activeMatrixDocComp = comp;
    if (title) {
        title.textContent = comp.label
            ? `Matrice 8×8 — ${comp.label}`
            : 'Matrice LED 8×8 — Kingbright 1588BS';
    }
    refreshMatrixColorPicker(comp.matrixColor || 'red');
    showModal(modal);
}

function closeMatrixDocModal() {
    activeMatrixDocComp = null;
    hideModal(document.getElementById('matrix-doc-modal'));
}

canvas.addEventListener('dblclick', async (e) => {
    const mousePos = toGridCoords(e.clientX, e.clientY); const target = circuit.components.find(c => componentHitTest(c, mousePos.x, mousePos.y));
    if (target) {
        if (target.type === 'cd4511') {
            openCd4511DocModal(target.label);
            return;
        }
        if (target.type === 'bargraph_dc10h') {
            openBargraphDocModal(target);
            return;
        }
        if (target.type === 'matrix_8x8') {
            openMatrixDocModal(target);
            return;
        }
        if (target.type === 'ic_74hc90') {
            openHc90DocModal(target.label);
            return;
        }
        if (target.type === 'lm386') {
            if (e.shiftKey) {
                const live = flags.isSimulating;
                let v = await showValuePrompt(`Alimentation V+ de ${target.label} (V, broche 6) :`, String(target.vplus ?? 9));
                if (v === null) return;
                if (!live) saveState();
                target.vplus = Math.max(4, Math.min(18, parseFloat(v) || 9));
                draw();
                if (live) requestLiveSimulation();
            } else {
                openLm386DocModal(target.label);
            }
            return;
        }
        if (target.type === 'esp32_c3' || target.type === 'esp32_devkit') {
            if (e.shiftKey) {
                openEsp32DocModal(target);
            } else {
                openArduinoEditor(target);
            }
            return;
        }
        if (target.type === 'arduino_uno') {
            openUnoDocModal(target.label);
            return;
        }
        if (target.type === 'oscilloscope') {
            openScopePanel(target);
            return;
        }
        if (target.type === 'bode_analyzer') {
            closeSourcePanel();
            closeScopePanelFully();
            openBodePopup(target);
            return;
        }
        if (target.type === 'gimp' || target.type === 'gsin' || target.type === 'gsqr') {
            openSourcePanel(target);
            return;
        }
        const live = flags.isSimulating;
        if (target.type === 'resistor') {
            let v = await showValuePrompt(`Valeur de ${target.label} :`, target.value || "1k");
            if (v) { if (!live) saveState(); target.value = v.trim(); draw(); if (live) requestLiveSimulation(); }
        }
        else if (target.type === 'potentiometer') {
            let v = await showValuePrompt(`Résistance totale de ${target.label} (ex. 10k) :`, target.value || '10k');
            if (v) {
                if (!live) saveState();
                target.value = v.trim();
                const p = await showValuePrompt('Position du curseur (0–100 %) :', String(target.position ?? 50));
                if (p !== null && p.trim() !== '' && !isNaN(parseFloat(p))) {
                    target.position = Math.min(100, Math.max(0, parseFloat(p)));
                }
                draw();
                if (live) requestLiveSimulation();
            }
        }
        else if (target.type === 'capacitor') {
            let v = await showValuePrompt(`Capacité de ${target.label} (ex. 1u, 100n, 10p, 1m) :`, target.value || "1u");
            if (v) { if (!live) saveState(); target.value = v.trim(); draw(); if (live) requestLiveSimulation(); }
        }
        else if (target.type === 'speaker') {
            let v = await showValuePrompt(`Impédance de ${target.label} (Ω, ex. 8) :`, target.value || '8');
            if (v) { if (!live) saveState(); target.value = v.trim(); draw(); if (live) requestLiveSimulation(); }
        }
        else if (target.type === 'inductor') {
            let v = await showValuePrompt(`Inductance de ${target.label} (ex. 1m, 10u) :`, target.value || "1m");
            if (v) { if (!live) saveState(); target.value = v.trim(); draw(); if (live) requestLiveSimulation(); }
        }
        else if (target.type === 'diode') {
            let v = await showValuePrompt(`Modèle diode ${target.label} (ex. 1N4148) :`, target.value || "1N4148");
            if (v) { if (!live) saveState(); target.value = v.trim(); draw(); if (live) requestLiveSimulation(); }
        }
        else if (target.type === 'opamp') {
            let vp = await showValuePrompt('Alimentation + (V) :', String(target.vp ?? 15));
            if (vp === null) return;
            let vn = await showValuePrompt('Alimentation − (V) :', String(target.vn ?? -15));
            if (vn === null) return;
            if (!live) saveState();
            target.vp = parseFloat(vp) || 15;
            target.vn = parseFloat(vn) || -15;
            draw();
            if (live) requestLiveSimulation();
        }
        else if (['battery', 'vcc'].includes(target.type)) {
            let v = await showValuePrompt("Tension (Volts) :", target.value !== undefined ? String(target.value) : "5");
            if (v && !isNaN(parseFloat(v))) { if (!live) saveState(); target.value = parseFloat(v); draw(); if (live) requestLiveSimulation(); }
        }
        else if (target.type === 'logic_terminal') {
            if (live) { alert("Arrêtez la simulation."); return; }
            let v = await showValuePrompt("Tension Niveau Haut (Volts) :", target.highVoltage !== undefined ? String(target.highVoltage) : "5");
            if (v && !isNaN(parseFloat(v))) { saveState(); target.highVoltage = parseFloat(v); draw(); }
        }
        else if (target.type === 'grove_dht22') {
            const curT = target.temperature ?? 24;
            const curH = target.humidity ?? 55;
            const t = await showValuePrompt(`Température simulée ${target.label} (°C) :`, String(curT));
            if (t === null || t.trim() === '') return;
            const tVal = parseFloat(t);
            if (!Number.isFinite(tVal)) return;
            const h = await showValuePrompt(`Humidité simulée ${target.label} (%) :`, String(curH));
            if (h === null || h.trim() === '') return;
            const hVal = parseFloat(h);
            if (!Number.isFinite(hVal)) return;
            if (!live) saveState();
            target.temperature = Math.max(-40, Math.min(80, tVal));
            target.humidity = Math.max(0, Math.min(100, hVal));
            draw();
            if (live) requestLiveSimulation();
        }
        else if (target.type === 'grove_tsl2591') {
            const curLux = target.lux ?? 100;
            const lux = await showValuePrompt(`Luminosité simulée ${target.label} (lux) :`, String(curLux));
            if (lux === null || lux.trim() === '') return;
            const luxVal = parseFloat(lux);
            if (!Number.isFinite(luxVal)) return;
            if (!live) saveState();
            target.lux = Math.max(0, Math.min(88000, luxVal));
            draw();
            if (live) requestLiveSimulation();
        }
        else if (target.type === 'grove_bmp280') {
            const curP = target.pressureHpa ?? 1013.25;
            const curT = target.temperature ?? 22;
            const p = await showValuePrompt(`Pression simulée ${target.label} (hPa) :`, String(curP));
            if (p === null || p.trim() === '') return;
            const pVal = parseFloat(p);
            if (!Number.isFinite(pVal)) return;
            const t = await showValuePrompt(`Température simulée ${target.label} (°C) :`, String(curT));
            if (t === null || t.trim() === '') return;
            const tVal = parseFloat(t);
            if (!Number.isFinite(tVal)) return;
            if (!live) saveState();
            target.pressureHpa = Math.max(300, Math.min(1100, pVal));
            target.temperature = Math.max(-40, Math.min(85, tVal));
            draw();
            if (live) requestLiveSimulation();
        }
        else if (target.type === 'push_button') {
            const cur = target.maintained ? 'maintenu' : 'momentane';
            let v = await showValuePrompt(
                `Mode de ${target.label} — "momentane" (fermé pendant l'appui) ou "maintenu" (1er clic ferme, 2e clic ouvre) :`,
                cur
            );
            if (v) {
                if (!live) saveState();
                target.maintained = v.trim().toLowerCase().startsWith('maint');
                target.state = 0;
                heldPushButton = null;
                draw();
                if (live) requestLiveSimulation();
            }
        }
    }
});

canvas.addEventListener('wheel', (e) => {
    e.preventDefault(); const factor = 1.1, mousePos = toGridCoords(e.clientX, e.clientY);
    if (e.deltaY < 0) scale.value *= factor; else scale.value /= factor; scale.value = Math.max(0.3, Math.min(scale.value, 4));
    const rect = canvas.getBoundingClientRect(); pan.x = e.clientX - rect.left - mousePos.x * scale.value; pan.y = e.clientY - rect.top - mousePos.y * scale.value; draw();
}, { passive: false });

canvas.addEventListener('contextmenu', e => e.preventDefault());

// --- DRAG & DROP DEPUIS MENU ---
function finishMenuDrag() {
    flags.isDraggingFromMenu = false;
    menuDrag.draggedComponentType = null;
    draw();
}

function onMenuDragOver(e) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    if (!flags.isDraggingFromMenu || !menuDrag.draggedComponentType) return;
    const gp = toGridCoords(e.clientX, e.clientY);
    menuDrag.x = gp.x;
    menuDrag.y = gp.y;
    draw();
}

function applyNewComponentDefaults(nc, type) {
    if (type === 'gimp') {
        nc.frequency = 2;
        nc.dutyCycle = 50;
        nc.voltageRail = 5;
        nc.flipX = false;
    } else if (type === 'potentiometer') {
        nc.value = '10k';
        nc.position = 50;
    } else if (type === 'switch_spdt') {
        nc.state = 0;
    } else if (type === 'push_button') {
        nc.state = 0;
        nc.maintained = false;
    } else if (type === 'speaker') {
        nc.value = '8';
    } else if (type === 'gsin') {
        nc.peakAmplitude = 5;
        nc.frequency = 440;
        nc.offset = 0;
    } else if (type === 'gsqr') {
        nc.peakAmplitude = 5;
        nc.frequency = 1000;
        nc.offset = 0;
    } else if (type === 'capacitor') {
        nc.value = '1u';
    } else if (type === 'inductor') {
        nc.value = '1m';
    } else if (type === 'diode') {
        nc.value = '1N4148';
    } else if (type === 'npn') {
        nc.value = '2N2222';
        nc.flipX = false;
    } else if (type === 'opamp') {
        nc.value = 'uA741';
        nc.vp = 15;
        nc.vn = -15;
        nc.flipX = false;
        nc.flipY = false;
    } else if (type === 'lm386') {
        nc.value = 'LM386N-1';
        nc.vplus = 9;
    } else if (type === 'oscilloscope') {
        nc.timeDivSec = 0.001;
        nc.ch1VoltsPerDiv = 1;
        nc.ch2VoltsPerDiv = 1;
        nc.ch1PositionDiv = 0;
        nc.ch2PositionDiv = 0;
        nc.timePositionDiv = 0;
        nc.syncOffsetDiv = 0;
    } else if (type === 'esp32_c3') {
        nc.sketch = DEFAULT_ESP32_SKETCH;
        nc.fqbn = ESP32_FQBN;
        nc.pinModes = {};
        nc.pinLevels = {};
        nc.avrRegisters = null;
        nc.lastCompileOk = null;
        nc.lastCompileLog = '';
    } else if (type === 'esp32_devkit') {
        nc.sketch = DEFAULT_ESP32_DEVKIT_SKETCH;
        nc.fqbn = ESP32_DEVKIT_FQBN;
        nc.pinModes = {};
        nc.pinLevels = {};
        nc.avrRegisters = null;
        nc.lastCompileOk = null;
        nc.lastCompileLog = '';
    } else if (type === 'arduino_uno') {
        nc.sketch = DEFAULT_ARDUINO_SKETCH;
        nc.fqbn = 'arduino:avr:uno';
        nc.pinModes = {};
        nc.pinLevels = {};
        nc.avrRegisters = null;
        nc.lastCompileOk = null;
        nc.lastCompileLog = '';
    } else if (type === 'grove_lcd16x2') {
        nc.i2cAddress = 0x3e;
        nc.flipX = false;
    } else if (type === 'bargraph_dc10h') {
        nc.barColor = 'red';
        nc.flipX = false;
    } else if (type === 'matrix_8x8') {
        nc.matrixColor = 'red';
        nc.flipX = false;
    } else if (type === 'grove_dht22') {
        nc.flipX = false;
        nc.temperature = 24;
        nc.humidity = 55;
    } else if (type === 'grove_tsl2591') {
        nc.flipX = false;
        nc.i2cAddress = 0x29;
        nc.lux = 100;
    } else if (type === 'grove_bmp280') {
        nc.flipX = false;
        nc.i2cAddress = 0x76;
        nc.pressureHpa = 1013.25;
        nc.temperature = 22;
    } else if (type === 'joyit_tft18') {
        nc.flipX = false;
    }
}

function onMenuDrop(e) {
    e.preventDefault();
    const type = menuDrag.draggedComponentType
        || e.dataTransfer?.getData('text/plain')
        || '';
    if (!type) return;
    if (flags.isSimulating) {
        alert('Arrêtez la simulation pour ajouter un composant.');
        finishMenuDrag();
        return;
    }
    saveState();
    const gp = toGridCoords(e.clientX, e.clientY);
    const nc = {
        type,
        x: snapToGrid(gp.x),
        y: snapToGrid(gp.y),
        label: newComponentLabel(type),
        rotation: 0,
        state: 0,
        highVoltage: 5,
    };
    applyNewComponentDefaults(nc, type);
    circuit.components.push(nc);
    interaction.selectedComponents = [nc];
    interaction.selectedAutoJunctions = [];
    interaction.selectedWire = null;
    finishMenuDrag();
    if (nc.type === 'gimp' || nc.type === 'gsin' || nc.type === 'gsqr') {
        openSourcePanel(nc);
    } else if (nc.type === 'oscilloscope') {
        openScopePanel(nc);
    } else if (isMicroBoard(nc)) {
        openArduinoEditor(nc);
    }
}

canvas.addEventListener('dragover', onMenuDragOver);
canvas.addEventListener('drop', onMenuDrop);

/** Retire les emoji / symboles décoratifs des entrées de menu déroulant. */
function stripMenuDecorations(text) {
    return String(text || '')
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '')
        .replace(/[\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2460}-\u{24FF}\u{25A0}-\u{25FF}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeSubmenuLabels() {
    document.querySelectorAll('.dropdown .dropdown-item').forEach((el) => {
        const label = el.getAttribute('data-label') || el.textContent;
        const clean = stripMenuDecorations(label);
        if (clean) el.textContent = clean;
    });
}

// --- CHARGEMENT INITIAL ---
function initApp() {
    initModalUi();
    initEditorTheme();
    document.getElementById('btn-theme-dark')?.addEventListener('click', () => { setEditorTheme('dark'); draw(); });
    document.getElementById('btn-theme-light')?.addEventListener('click', () => { setEditorTheme('light'); draw(); });
    normalizeSubmenuLabels();
    ensureAllCounters();
    setCircuitDisplayName('Sans titre');
    resizeCanvas(); window.addEventListener('resize', resizeCanvas);
    document.querySelectorAll('.dropdown-item[draggable=true]').forEach(item => {
        item.addEventListener('dragstart', (e) => {
            if (flags.isSimulating) { alert("Arrêtez la simulation pour ajouter."); e.preventDefault(); return; }
            menuDrag.draggedComponentType = e.currentTarget.getAttribute('data-component');
            flags.isDraggingFromMenu = true;
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData('text/plain', menuDrag.draggedComponentType);
                e.dataTransfer.setDragImage(emptyDragImage, 0, 0);
            }
        });
        item.addEventListener('dragend', finishMenuDrag);
    });
    document.getElementById('menu-serial-monitor')?.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        document.querySelectorAll('.navbar > .menu-item.open').forEach((m) => m.classList.remove('open'));
        openSerialMonitor(getActiveArduinoBoard()?.label);
    });
    document.getElementById('menu-esp32-editor')?.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        document.querySelectorAll('.navbar > .menu-item.open').forEach((m) => m.classList.remove('open'));
        openArduinoEditorForCircuit('esp32');
    });
    document.getElementById('menu-arduino-editor')?.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        document.querySelectorAll('.navbar > .menu-item.open').forEach((m) => m.classList.remove('open'));
        openArduinoEditorForCircuit('arduino_uno');
    });
    document.getElementById('arduino-btn-serial-monitor')?.addEventListener('click', () => {
        openSerialMonitor(getActiveArduinoBoard()?.label);
    });
    document.querySelectorAll('.dropdown-submenu .submenu-title').forEach(title => {
        title.addEventListener('click', (e) => {
            e.stopPropagation();
            const sub = title.closest('.dropdown-submenu');
            const wasOpen = sub.classList.contains('open');
            document.querySelectorAll('.dropdown-submenu.open').forEach(s => s.classList.remove('open'));
            if (!wasOpen) sub.classList.add('open');
        });
    });
    document.querySelectorAll('.dropdown-submenu .submenu').forEach(sub => {
        sub.addEventListener('click', (e) => e.stopPropagation());
    });
    document.querySelectorAll('.navbar > .menu-item').forEach((item) => {
        if (!item.querySelector('.dropdown')) return;
        item.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            if (e.target.closest('.dropdown-item')) return;
            e.stopPropagation();
            const wasOpen = item.classList.contains('open');
            document.querySelectorAll('.navbar > .menu-item.open').forEach((m) => m.classList.remove('open'));
            if (!wasOpen) item.classList.add('open');
        });
        item.querySelector('.dropdown')?.addEventListener('pointerdown', (e) => e.stopPropagation());
    });
    document.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.navbar')) return;
        document.querySelectorAll('.navbar > .menu-item.open').forEach((m) => m.classList.remove('open'));
        document.querySelectorAll('.dropdown-submenu.open').forEach(s => s.classList.remove('open'));
    });
    document.getElementById('btn-new').addEventListener('click', () => {
        if (circuit.components.length > 0 && confirm("Tout effacer ?")) {
            saveState();
            circuit.components = [];
            circuit.wires = [];
            circuit.autoJunctions = [];
            Object.keys(counters).forEach(k => counters[k] = 0);
            fileHandle = null;
            setCircuitDisplayName('Sans titre');
            stopSimulation();
        }
    });
    document.getElementById('btn-open').addEventListener('click', () => {
        document.querySelectorAll('.navbar > .menu-item.open').forEach((m) => m.classList.remove('open'));
        openFile();
    }); document.getElementById('btn-save').addEventListener('click', saveFile); document.getElementById('btn-save-as').addEventListener('click', saveAs);
    document.getElementById('btn-simulate').addEventListener('click', () => {
        if (!flags.isSimulating) {
            primeSpeakerAudioContext().catch(() => {});
            triggerSimulation();
        }
    }); document.getElementById('btn-stop').addEventListener('click', stopSimulation);
    initSourcePanel();
    initValuePrompt();
    initArduinoEditor();
    initScopePanel();
    initScopePopup();
    initSerialMonitor();
    initArduinoLibPopup();
    initBodePopup();
    setScopePopupCloseCallback(onScopePopupClosed);
    setScopeViewChangeCallback(() => refreshScopePanelFields());
    document.getElementById('source-panel-close')?.addEventListener('click', () => {
        closeSourcePanel();
        closeScopePanelFully();
    });
    bindLedAnimationRedraw(() => {
        draw();
        refreshSerialMonitor();
    });
    bindSpeakerAudioRedraw(draw);
    bindScopeAnimationRedraw(draw);
    bindScopePopupRedraw(refreshScopePopup);
    const m = document.getElementById('commands-modal');
    document.getElementById('btn-commands')?.addEventListener('click', () => showModal(m));
    document.getElementById('close-commands')?.addEventListener('click', () => hideModal(m));
    window.addEventListener('click', (e) => { if (e.target === m) hideModal(m); });
    const cdDoc = document.getElementById('cd4511-doc-modal');
    document.getElementById('close-cd4511-doc')?.addEventListener('click', closeCd4511DocModal);
    window.addEventListener('click', (e) => { if (e.target === cdDoc) closeCd4511DocModal(); });
    const hc90Doc = document.getElementById('hc90-doc-modal');
    document.getElementById('close-hc90-doc')?.addEventListener('click', closeHc90DocModal);
    window.addEventListener('click', (e) => { if (e.target === hc90Doc) closeHc90DocModal(); });
    const lm386Doc = document.getElementById('lm386-doc-modal');
    document.getElementById('close-lm386-doc')?.addEventListener('click', closeLm386DocModal);
    window.addEventListener('click', (e) => { if (e.target === lm386Doc) closeLm386DocModal(); });
    const unoDoc = document.getElementById('uno-doc-modal');
    document.getElementById('close-uno-doc')?.addEventListener('click', closeUnoDocModal);
    window.addEventListener('click', (e) => { if (e.target === unoDoc) closeUnoDocModal(); });
    const esp32Doc = document.getElementById('esp32-doc-modal');
    document.getElementById('close-esp32-doc')?.addEventListener('click', closeEsp32DocModal);
    window.addEventListener('click', (e) => { if (e.target === esp32Doc) closeEsp32DocModal(); });
    const bargraphDoc = document.getElementById('bargraph-doc-modal');
    document.getElementById('close-bargraph-doc')?.addEventListener('click', closeBargraphDocModal);
    window.addEventListener('click', (e) => { if (e.target === bargraphDoc) closeBargraphDocModal(); });
    const matrixDoc = document.getElementById('matrix-doc-modal');
    document.getElementById('close-matrix-doc')?.addEventListener('click', closeMatrixDocModal);
    window.addEventListener('click', (e) => { if (e.target === matrixDoc) closeMatrixDocModal(); });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}