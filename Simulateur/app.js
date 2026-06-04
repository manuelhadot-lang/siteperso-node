// app.js (Nouveau fichier principal)
import { canvas, GRID_SIZE, scale, pan, flags, counters, circuit, interaction, zone, menuDrag, clipboard, undoStack, redoStack, emptyDragImage, snapToGrid, toGridCoords, saveState } from './state.js';
import { isPointOnSegment, findWireIntersection, getComponentJonctions, componentHitTest } from './geometry.js';
import { resizeCanvas, draw } from './renderer.js';
import { triggerSimulation, stopSimulation, requestLiveSimulation } from './simulation.js';
import { openSourcePanel, closeSourcePanel, onSourceRemoved, initSourcePanel } from './source-panel.js';
import { openScopePanel, closeScopePanelFully, onScopeRemoved, initScopePanel, onScopePopupClosed } from './scope-panel.js';
import { initScopePopup, refreshScopePopup, setScopePopupCloseCallback } from './scope-popup.js';
import { bindLedAnimationRedraw } from './led-animation.js';
import { bindScopeAnimationRedraw, bindScopePopupRedraw } from './scope-animation.js';

const COMPONENT_PREFIX = {
    battery: 'VDC', resistor: 'R', capacitor: 'C', inductor: 'L', diode: 'D',
    npn: 'Q', opamp: 'AOP',
    not: 'NOT', and: 'AND', nand: 'NAND', or: 'OR', nor: 'NOR', xor: 'XOR', xnor: 'XNOR',
    d_flipflop: 'DFF', jk_flipflop: 'JKFF', cd4511: 'CD4511', ic_74hc90: 'HC90', led: 'LED', seg7: 'SEG',
    voltmeter: 'V', ammeter: 'A', ohmmeter: 'OHM', oscilloscope: 'Osci', gnd: 'GND', vcc: 'VCC', logic_terminal: 'LOGIC', gimp: 'GImp', gsin: 'Sin', gsqr: 'Sq',
};
const NON_ROTATABLE = new Set(['d_flipflop', 'jk_flipflop', 'cd4511', 'ic_74hc90', 'gimp', 'gsin', 'gsqr', 'oscilloscope', 'npn', 'opamp', 'seg7']);
let fileHandle = null;
let lastMouseGridPos = { x: 0, y: 0 };
let liveDragMoved = false;

// --- HISTORIQUE & SÉCURITÉ ---
function undo() {
    if (flags.isSimulating) { alert("Veuillez arrêter la simulation avant de modifier le schéma."); return; }
    if (undoStack.length === 0) return;
    redoStack.push(JSON.stringify({ components: circuit.components, wires: circuit.wires, autoJunctions: circuit.autoJunctions, counters }));
    const prev = JSON.parse(undoStack.pop());
    circuit.components = prev.components; circuit.wires = prev.wires; circuit.autoJunctions = prev.autoJunctions; Object.assign(counters, prev.counters);
    interaction.selectedComponents = []; interaction.selectedAutoJunctions = []; interaction.selectedWire = null; draw();
}
function redo() {
    if (flags.isSimulating) { alert("Veuillez arrêter la simulation avant de modifier le schéma."); return; }
    if (redoStack.length === 0) return;
    undoStack.push(JSON.stringify({ components: circuit.components, wires: circuit.wires, autoJunctions: circuit.autoJunctions, counters }));
    const next = JSON.parse(redoStack.pop());
    circuit.components = next.components; circuit.wires = next.wires; circuit.autoJunctions = next.autoJunctions; Object.assign(counters, next.counters);
    interaction.selectedComponents = []; interaction.selectedAutoJunctions = []; interaction.selectedWire = null; draw();
}

// --- FICHIERS ET SAUVEGARDE ---
function getCircuitDataJSON() { return JSON.stringify({ components: circuit.components, wires: circuit.wires, autoJunctions: circuit.autoJunctions, counters }, null, 4); }
async function saveAs() {
    try {
        fileHandle = await window.showSaveFilePicker({ suggestedName: 'schema_circuit.json', types: [{ description: 'Fichier JSON Circuit', accept: { 'application/json': ['.json'] } }] });
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
        fileHandle = handle; loadCircuitFromJSON(await (await handle.getFile()).text());
    } catch (err) {
        const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
        input.onchange = e => { const r = new FileReader(); r.onload = ev => loadCircuitFromJSON(ev.target.result); r.readAsText(e.target.files[0]); }; input.click();
    }
}
function loadCircuitFromJSON(jsonText) {
    try {
        const data = JSON.parse(jsonText);
        circuit.components = data.components || []; circuit.wires = data.wires || []; circuit.autoJunctions = data.autoJunctions || [];
        Object.assign(counters, data.counters || {}); interaction.selectedComponents = []; interaction.selectedAutoJunctions = []; interaction.selectedWire = null;
        undoStack.length = 0; redoStack.length = 0; stopSimulation(); closeSourcePanel(); draw();
    } catch (e) { alert("Erreur lors de la lecture du fichier JSON."); }
}

// --- CLAVIER & RECOPIE ---
window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase(); if (e.key === 'Shift') flags.isShiftPressed = true;
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
            comp.type === 'gimp' || comp.type === 'npn' || comp.type === 'opamp');
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
            counters[comp.type]++; 
            let pfx = COMPONENT_PREFIX[comp.type] || 'U';
            const nl = `${pfx}${counters[comp.type]}`; labelMap[comp.label] = nl;
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
    if (e.button === 0) {
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
                closeSourcePanel();
                openScopePanel(hc);
                interaction.selectedComponents = [hc];
                draw();
                return;
            }
            if (hc.type === 'gimp' || hc.type === 'gsin' || hc.type === 'gsqr') {
                closeScopePanelFully();
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
        if (hc.type === 'gimp' || hc.type === 'gsin' || hc.type === 'gsqr') { closeScopePanelFully(); openSourcePanel(hc); }
        else if (hc.type === 'oscilloscope') { closeSourcePanel(); openScopePanel(hc); }
        else { closeSourcePanel(); closeScopePanelFully(); }
        flags.isDraggingComponent = true; saveState();
    } else { interaction.selectedComponents = []; interaction.selectedAutoJunctions = []; if (!flags.isSimulating) { closeSourcePanel(); closeScopePanelFully(); } flags.isPanning = true; flags.startX = e.clientX - pan.x; flags.startY = e.clientY - pan.y; }
    draw();
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
    modal.style.display = 'block';
}

function closeCd4511DocModal() {
    const modal = document.getElementById('cd4511-doc-modal');
    if (modal) modal.style.display = 'none';
}

canvas.addEventListener('dblclick', (e) => {
    const mousePos = toGridCoords(e.clientX, e.clientY); const target = circuit.components.find(c => componentHitTest(c, mousePos.x, mousePos.y));
    if (target) {
        if (target.type === 'cd4511') {
            openCd4511DocModal(target.label);
            return;
        }
        if (target.type === 'oscilloscope') {
            closeSourcePanel();
            openScopePanel(target);
            return;
        }
        if (target.type === 'gimp' || target.type === 'gsin' || target.type === 'gsqr') {
            closeScopePanelFully();
            openSourcePanel(target);
            return;
        }
        const live = flags.isSimulating;
        if (target.type === 'resistor') {
            let v = prompt(`Valeur de ${target.label} :`, target.value || "1k");
            if (v) { if (!live) saveState(); target.value = v.trim(); draw(); if (live) requestLiveSimulation(); }
        }
        else if (target.type === 'capacitor') {
            let v = prompt(`Capacité de ${target.label} (ex. 1u, 100n, 10p, 1m) :`, target.value || "1u");
            if (v) { if (!live) saveState(); target.value = v.trim(); draw(); if (live) requestLiveSimulation(); }
        }
        else if (target.type === 'inductor') {
            let v = prompt(`Inductance de ${target.label} (ex. 1m, 10u) :`, target.value || "1m");
            if (v) { if (!live) saveState(); target.value = v.trim(); draw(); if (live) requestLiveSimulation(); }
        }
        else if (target.type === 'diode') {
            let v = prompt(`Modèle diode ${target.label} (ex. 1N4148) :`, target.value || "1N4148");
            if (v) { if (!live) saveState(); target.value = v.trim(); draw(); if (live) requestLiveSimulation(); }
        }
        else if (target.type === 'opamp') {
            let vp = prompt('Alimentation + (V) :', target.vp ?? 15);
            if (vp === null) return;
            let vn = prompt('Alimentation − (V) :', target.vn ?? -15);
            if (vn === null) return;
            if (!live) saveState();
            target.vp = parseFloat(vp) || 15;
            target.vn = parseFloat(vn) || -15;
            draw();
            if (live) requestLiveSimulation();
        }
        else if (['battery', 'vcc'].includes(target.type)) {
            let v = prompt("Tension (Volts) :", target.value !== undefined ? target.value : "5");
            if (v && !isNaN(parseFloat(v))) { if (!live) saveState(); target.value = parseFloat(v); draw(); if (live) requestLiveSimulation(); }
        }
        else if (target.type === 'logic_terminal') {
            if (live) { alert("Arrêtez la simulation."); return; }
            let v = prompt("Tension Niveau Haut (Volts) :", target.highVoltage !== undefined ? target.highVoltage : "5");
            if (v && !isNaN(parseFloat(v))) { saveState(); target.highVoltage = parseFloat(v); draw(); }
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
canvas.addEventListener('dragover', (e) => { e.preventDefault(); if (!flags.isDraggingFromMenu) return; const gp = toGridCoords(e.clientX, e.clientY); menuDrag.x = gp.x; menuDrag.y = gp.y; draw(); });
canvas.addEventListener('dragend', () => { flags.isDraggingFromMenu = false; menuDrag.draggedComponentType = null; draw(); });
canvas.addEventListener('drop', (e) => {
    e.preventDefault(); if (!menuDrag.draggedComponentType) return; saveState();
    const gp = toGridCoords(e.clientX, e.clientY); counters[menuDrag.draggedComponentType]++;
    let pfx = COMPONENT_PREFIX[menuDrag.draggedComponentType] || 'U';
    const nc = { type: menuDrag.draggedComponentType, x: snapToGrid(gp.x), y: snapToGrid(gp.y), label: `${pfx}${counters[menuDrag.draggedComponentType]}`, rotation: 0, state: 0, highVoltage: 5 };
    if (menuDrag.draggedComponentType === 'gimp') {
        nc.frequency = 1000;
        nc.dutyCycle = 10;
        nc.voltageRail = 5;
        nc.flipX = false;
    } else if (menuDrag.draggedComponentType === 'gsin') {
        nc.peakAmplitude = 5;
        nc.frequency = 1000;
        nc.offset = 0;
    } else if (menuDrag.draggedComponentType === 'gsqr') {
        nc.peakAmplitude = 5;
        nc.frequency = 1000;
        nc.offset = 0;
    } else if (menuDrag.draggedComponentType === 'capacitor') {
        nc.value = '1u';
    } else if (menuDrag.draggedComponentType === 'inductor') {
        nc.value = '1m';
    } else if (menuDrag.draggedComponentType === 'diode') {
        nc.value = '1N4148';
    } else if (menuDrag.draggedComponentType === 'npn') {
        nc.value = '2N2222';
        nc.flipX = false;
    } else if (menuDrag.draggedComponentType === 'opamp') {
        nc.value = 'uA741';
        nc.vp = 15;
        nc.vn = -15;
        nc.flipX = false;
        nc.flipY = false;
    } else if (menuDrag.draggedComponentType === 'oscilloscope') {
        nc.timeDivSec = 0.001;
        nc.ch1VoltsPerDiv = 1;
        nc.ch2VoltsPerDiv = 1;
        nc.ch1PositionDiv = 0;
        nc.ch2PositionDiv = 0;
    }
    circuit.components.push(nc); interaction.selectedComponents = [nc]; interaction.selectedAutoJunctions = []; interaction.selectedWire = null; flags.isDraggingFromMenu = false; menuDrag.draggedComponentType = null; draw();
    if (nc.type === 'gimp' || nc.type === 'gsin' || nc.type === 'gsqr') { closeScopePanelFully(); openSourcePanel(nc); }
    else if (nc.type === 'oscilloscope') { closeSourcePanel(); openScopePanel(nc); }
});

// --- CHARGEMENT INITIAL ---
window.onload = function() {
    resizeCanvas(); window.addEventListener('resize', resizeCanvas);
    document.querySelectorAll('.dropdown-item[draggable=true]').forEach(item => {
        item.addEventListener('dragstart', (e) => {
            if (flags.isSimulating) { alert("Arrêtez la simulation pour ajouter."); e.preventDefault(); return; }
            menuDrag.draggedComponentType = e.currentTarget.getAttribute('data-component'); flags.isDraggingFromMenu = true; e.dataTransfer.setDragImage(emptyDragImage, 0, 0);
        });
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
    document.addEventListener('click', () => {
        document.querySelectorAll('.dropdown-submenu.open').forEach(s => s.classList.remove('open'));
    });
    document.getElementById('btn-new').addEventListener('click', () => { if (circuit.components.length > 0 && confirm("Tout effacer ?")) { saveState(); circuit.components = []; circuit.wires = []; circuit.autoJunctions = []; Object.keys(counters).forEach(k => counters[k]=0); stopSimulation(); } });
    document.getElementById('btn-open').addEventListener('click', openFile); document.getElementById('btn-save').addEventListener('click', saveFile); document.getElementById('btn-save-as').addEventListener('click', saveAs);
    document.getElementById('btn-simulate').addEventListener('click', () => { if (!flags.isSimulating) triggerSimulation(); }); document.getElementById('btn-stop').addEventListener('click', stopSimulation);
    initSourcePanel();
    initScopePanel();
    initScopePopup();
    setScopePopupCloseCallback(onScopePopupClosed);
    document.getElementById('source-panel-close')?.addEventListener('click', () => {
        closeSourcePanel();
        closeScopePanelFully();
    });
    bindLedAnimationRedraw(draw);
    bindScopeAnimationRedraw(draw);
    bindScopePopupRedraw(refreshScopePopup);
    const m = document.getElementById('commands-modal'); document.getElementById('btn-commands').addEventListener('click', () => m.style.display = 'block'); document.getElementById('close-commands').addEventListener('click', () => m.style.display = 'none'); window.addEventListener('click', (e) => { if (e.target === m) m.style.display = 'none'; });
    const cdDoc = document.getElementById('cd4511-doc-modal');
    document.getElementById('close-cd4511-doc')?.addEventListener('click', closeCd4511DocModal);
    window.addEventListener('click', (e) => { if (e.target === cdDoc) closeCd4511DocModal(); });
};