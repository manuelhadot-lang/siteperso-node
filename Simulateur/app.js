const canvas = document.getElementById('circuitCanvas');
const ctx = canvas.getContext('2d');

const GRID_SIZE = 20; 
let scale = 1.0;
let panX = 0, panY = 0;

let isPanning = false;
let startX, startY;
let isDraggingComponent = false;

// Variables Drag & Drop menu
let draggedComponentType = null;
let dragX = 0, dragY = 0;
let isDraggingFromMenu = false;

// Variables de gestion de fichiers (File System Access API handle)
let fileHandle = null;

// Structure du circuit
let counters = { battery: 0, resistor: 0, nand: 0, voltmeter: 0, junction: 0 };
let components = [];
let wires = [];
let autoJunctions = [];

// Sélection et Tracé
let activeWire = null; 
let hoverJonction = null;
let hoveredComponent = null;

// Sélection multiple par cadre (Shift)
let isSelectingZone = false;
let isShiftPressed = false;
let zoneStart = { x: 0, y: 0 };
let zoneEnd = { x: 0, y: 0 };
let selectedComponents = []; 

// Presse-papier & Historique
let clipboard = null;
let undoStack = [];
let redoStack = [];

const emptyDragImage = new Image();
emptyDragImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - 45;
    draw();
}
window.addEventListener('resize', resizeCanvas);

// --- SYSTÈME D'HISTORIQUE ---
function saveState() {
    undoStack.push(JSON.stringify({ components, wires, autoJunctions, counters }));
    redoStack = [];
}
function undo() {
    if (undoStack.length === 0) return;
    redoStack.push(JSON.stringify({ components, wires, autoJunctions, counters }));
    const prev = JSON.parse(undoStack.pop());
    components = prev.components; wires = prev.wires; autoJunctions = prev.autoJunctions; counters = prev.counters;
    selectedComponents = []; draw();
}
function redo() {
    if (redoStack.length === 0) return;
    undoStack.push(JSON.stringify({ components, wires, autoJunctions, counters }));
    const next = JSON.parse(redoStack.pop());
    components = next.components; wires = next.wires; autoJunctions = next.autoJunctions; counters = next.counters;
    selectedComponents = []; draw();
}

// --- GESTION ENREGISTREMENT ET FICHIERS (JSON) ---
function getCircuitDataJSON() {
    return JSON.stringify({ components, wires, autoJunctions, counters }, null, 4);
}

async function saveAs() {
    try {
        const options = {
            suggestedName: 'schema_circuit.json',
            types: [{ description: 'Fichier JSON Circuit', accept: { 'application/json': ['.json'] } }]
        };
        fileHandle = await window.showSaveFilePicker(options);
        await writeFileData(fileHandle, getCircuitDataJSON());
    } catch (err) {
        console.log("Enregistrement annulé ou non supporté : ", err);
        fallbackDownload(getCircuitDataJSON());
    }
}

async function saveFile() {
    if (fileHandle) {
        try {
            await writeFileData(fileHandle, getCircuitDataJSON());
        } catch (err) {
            await saveAs();
        }
    } else {
        await saveAs();
    }
}

async function writeFileData(handle, data) {
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
}

// Téléchargement classique de secours si l'API moderne File System n'est pas active
function fallbackDownload(content) {
    const blob = new Blob([content], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileHandle ? 'schema_circuit.json' : 'schema_export.json';
    a.click();
}

async function openFile() {
    if (components.length > 0) {
        if (confirm("Voulez-vous sauvegarder votre schéma actuel avant d'ouvrir un autre fichier ?")) {
            await saveFile();
        }
    }
    try {
        const [handle] = await window.showOpenFilePicker({
            types: [{ description: 'Fichier JSON Circuit', accept: { 'application/json': ['.json'] } }]
        });
        fileHandle = handle;
        const file = await handle.getFile();
        const content = await file.text();
        loadCircuitFromJSON(content);
    } catch (err) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = e => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = event => loadCircuitFromJSON(event.target.result);
            reader.readAsText(file);
        };
        input.click();
    }
}

function loadCircuitFromJSON(jsonText) {
    try {
        const data = JSON.parse(jsonText);
        components = data.components || [];
        wires = data.wires || [];
        autoJunctions = data.autoJunctions || [];
        counters = data.counters || { battery: 0, resistor: 0, nand: 0, voltmeter: 0, junction: 0 };
        selectedComponents = [];
        undoStack = []; redoStack = [];
        draw();
    } catch (e) {
        alert("Erreur lors de la lecture du fichier JSON.");
    }
}

async function createNewProject() {
    if (components.length > 0) {
        if (confirm("Voulez-vous sauvegarder votre schéma actuel avant de l'effacer ?")) {
            await saveFile();
        }
    }
    saveState();
    components = []; wires = []; autoJunctions = [];
    counters = { battery: 0, resistor: 0, nand: 0, voltmeter: 0, junction: 0 };
    selectedComponents = []; fileHandle = null;
    draw();
}

// --- GEOMETRIE ET CALCULS DE CADRAGE ---
function isPointOnSegment(px, py, p1, p2) {
    const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y);
    if (Math.abs(p1.y - p2.y) < 1 && Math.abs(py - p1.y) < 1) return px >= minX && px <= maxX;
    if (Math.abs(p1.x - p2.x) < 1 && Math.abs(px - p1.x) < 1) return px >= minX && px <= maxX && py >= minY && py <= maxY;
    return false;
}

function findWireIntersection(x, y) {
    for (let w of wires) {
        for (let i = 0; i < w.points.length - 1; i++) {
            if (isPointOnSegment(x, y, w.points[i], w.points[i+1])) {
                return { x: snapToGrid(x), y: snapToGrid(y) };
            }
        }
    }
    return null;
}

function getComponentJonctions(comp) {
    const list = [];
    const rad = (comp.rotation || 0) * Math.PI / 180;
    let localPts = [];
    if (comp.type === 'battery' || comp.type === 'resistor' || comp.type === 'voltmeter') {
        localPts = [{ id: `${comp.label}_in`, x: -40, y: 0 }, { id: `${comp.label}_out`, x: 40, y: 0 }];
    } else if (comp.type === 'nand') {
        localPts = [{ id: `${comp.label}_inA`, x: -40, y: -20 }, { id: `${comp.label}_inB`, x: -40, y: 20 }, { id: `${comp.label}_out`, x: 40, y: 0 }];
    }
    localPts.forEach(pt => {
        const rx = pt.x * Math.cos(rad) - pt.y * Math.sin(rad);
        const ry = pt.x * Math.sin(rad) + pt.y * Math.cos(rad);
        list.push({ id: pt.id, x: snapToGrid(comp.x + rx), y: snapToGrid(comp.y + ry) });
    });
    return list;
}

function isJonctionConnected(jonctionId) {
    return wires.some(w => w.fromJonctionId === jonctionId || w.toJonctionId === jonctionId);
}

// --- GRAPHISMES ET LABELS ---
function drawLabels(name, value, angle) {
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (angle % 180 !== 0) {
        ctx.rotate(-angle * Math.PI / 180);
        if (name) { ctx.fillStyle = '#ffffff'; ctx.font = '12px Arial'; ctx.textAlign = 'right'; ctx.fillText(name, -28, 0); }
        if (value) { ctx.fillStyle = '#aaaaaa'; ctx.font = '11px Arial'; ctx.textAlign = 'left'; ctx.fillText(value, 28, 0); }
    } else {
        if (name) { ctx.fillStyle = '#ffffff'; ctx.font = '12px Arial'; ctx.fillText(name, 0, -25); }
        if (value) { ctx.fillStyle = '#aaaaaa'; ctx.font = '11px Arial'; ctx.fillText(value, 0, 25); }
    }
    ctx.restore();
}

function drawComponentBody(comp) {
    ctx.save();
    ctx.translate(comp.x, comp.y);
    const rot = comp.rotation || 0;
    ctx.rotate(rot * Math.PI / 180);

    // Encadrement bleu cyan si le composant est sélectionné
    if (selectedComponents.includes(comp)) {
        ctx.strokeStyle = '#00bcd4'; ctx.lineWidth = 1.5; ctx.strokeRect(-45, -25, 90, 50);
    }

    if (comp.type === 'battery') {
        ctx.strokeStyle = '#ff9800'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-5, -15); ctx.lineTo(-5, 15); ctx.stroke();
        ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(5, -8); ctx.lineTo(5, 8); ctx.stroke();
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-5, 0); ctx.moveTo(5, 0); ctx.lineTo(40, 0); ctx.stroke();
        drawLabels(comp.label, "5V", rot);
    } 
    else if (comp.type === 'resistor') {
        ctx.strokeStyle = '#007acc'; ctx.lineWidth = 2; ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(-20, -10, 40, 20); ctx.strokeRect(-20, -10, 40, 20);
        ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-20, 0); ctx.moveTo(20, 0); ctx.lineTo(40, 0); ctx.stroke();
        drawLabels(comp.label, "1Kohm", rot);
    } 
    else if (comp.type === 'nand') {
        ctx.strokeStyle = '#00ca71'; ctx.lineWidth = 2; ctx.fillStyle = '#1e1e1e';
        ctx.beginPath(); ctx.moveTo(-20, -20); ctx.lineTo(0, -20); ctx.arc(0, 0, 20, -Math.PI/2, Math.PI/2); ctx.lineTo(-20, 20); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(24, 0, 4, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#1e1e1e'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(-40, -20); ctx.lineTo(-20, -20); ctx.moveTo(-40, 20); ctx.lineTo(-20, 20); ctx.moveTo(28, 0); ctx.lineTo(40, 0); ctx.stroke();
        drawLabels(comp.label, null, rot);
    } 
    else if (comp.type === 'voltmeter') {
        ctx.strokeStyle = '#00bcd4'; ctx.lineWidth = 2; ctx.fillStyle = '#2a3b4c';
        ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#0d1b1e'; ctx.fillRect(-12, -7, 24, 14);
        ctx.fillStyle = '#00ff66'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('0.0', -2, 0);
        ctx.font = '7px Arial'; ctx.fillText('V', 8, 1);
        ctx.strokeStyle = '#00bcd4'; ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-20, 0); ctx.moveTo(20, 0); ctx.lineTo(40, 0); ctx.stroke();
        drawLabels(comp.label, null, rot);
    }
    ctx.restore();

    getComponentJonctions(comp).forEach(j => {
        if (!isJonctionConnected(j.id)) {
            ctx.save();
            const isHovered = hoverJonction && hoverJonction.id === j.id;
            ctx.fillStyle = isHovered ? '#ff5722' : '#ff3333';
            ctx.beginPath(); ctx.arc(j.x, j.y, isHovered ? 6 : 4, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }
    });
}

function drawWires() {
    ctx.save(); ctx.lineWidth = 2.5;
    wires.forEach(w => {
        ctx.strokeStyle = '#00ffaa';
        ctx.beginPath(); ctx.moveTo(w.points[0].x, w.points[0].y);
        for (let i = 1; i < w.points.length; i++) ctx.lineTo(w.points[i].x, w.points[i].y);
        ctx.stroke();
    });
    if (activeWire) {
        ctx.strokeStyle = '#ffeb3b'; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(activeWire.points[0].x, activeWire.points[0].y);
        for (let i = 1; i < activeWire.points.length; i++) ctx.lineTo(activeWire.points[i].x, activeWire.points[i].y);
        ctx.stroke();
    }
    ctx.restore();

    autoJunctions.forEach(aj => {
        ctx.save();
        const isHovered = hoverJonction && hoverJonction.id === aj.id;
        ctx.fillStyle = '#00ffaa'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = isHovered ? 2 : 1;
        ctx.beginPath(); ctx.arc(aj.x, aj.y, isHovered ? 6 : 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    });
}

// --- VISUEL RECTANGLE DE SÉLECTION ZONE ---
function drawSelectionZone() {
    if (!isSelectingZone) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 188, 212, 0.7)';
    ctx.fillStyle = 'rgba(0, 188, 212, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.fillRect(zoneStart.x, zoneStart.y, zoneEnd.x - zoneStart.x, zoneEnd.y - zoneStart.y);
    ctx.strokeRect(zoneStart.x, zoneStart.y, zoneEnd.x - zoneStart.x, zoneEnd.y - zoneStart.y);
    ctx.restore();
}

function drawGrid() {
    ctx.strokeStyle = '#262626'; ctx.lineWidth = 1 / scale;
    const startLeft = Math.floor(-panX / scale / GRID_SIZE) * GRID_SIZE;
    const startTop = Math.floor(-panY / scale / GRID_SIZE) * GRID_SIZE;
    const endRight = startLeft + canvas.width / scale + GRID_SIZE;
    const endBottom = startTop + canvas.height / scale + GRID_SIZE;
    ctx.beginPath();
    for (let x = startLeft; x < endRight; x += GRID_SIZE) { ctx.moveTo(x, startTop); ctx.lineTo(x, endBottom); }
    for (let y = startTop; y < endBottom; y += GRID_SIZE) { ctx.moveTo(startLeft, y); ctx.lineTo(endRight, y); }
    ctx.stroke();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save(); ctx.translate(panX, panY); ctx.scale(scale, scale);
    drawGrid();
    drawWires();
    components.forEach(comp => drawComponentBody(comp));
    drawSelectionZone();
    if (isDraggingFromMenu && draggedComponentType) {
        ctx.globalAlpha = 0.5;
        drawComponentBody({ type: draggedComponentType, x: snapToGrid(dragX), y: snapToGrid(dragY), label: "", rotation: 0 });
        ctx.globalAlpha = 1.0;
    }
    ctx.restore();
}

function toGridCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return { x: (clientX - rect.left - panX) / scale, y: (clientY - rect.top - panY) / scale };
}
function snapToGrid(val) { return Math.round(val / GRID_SIZE) * GRID_SIZE; }

// --- TRACKING CLAVIER ET ZONE SELECTION ---
window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (e.key === 'Shift') isShiftPressed = true;

    if (e.code === 'Space' && activeWire) {
        e.preventDefault();
        const lastPoint = activeWire.points[activeWire.points.length - 1];
        activeWire.points.push({ x: lastPoint.x, y: lastPoint.y });
        draw(); return;
    }
    
    // R : Rotation collective ou individuelle
    if (key === 'r' && !activeWire) {
        if (selectedComponents.length > 0) {
            saveState();
            selectedComponents.forEach(comp => comp.rotation = ((comp.rotation || 0) + 90) % 360);
            draw();
        }
        return;
    }

    // Suppr : Effacement de la liste sélectionnée
    if ((e.key === 'Delete' || e.key === 'DeleteBackup') && selectedComponents.length > 0) {
        saveState();
        selectedComponents.forEach(comp => {
            const index = components.indexOf(comp);
            if (index > -1) components.splice(index, 1);
            for (let i = wires.length - 1; i >= 0; i--) {
                if (wires[i].fromJonctionId.startsWith(comp.label) || wires[i].toJonctionId.startsWith(comp.label)) wires.splice(i, 1);
            }
        });
        selectedComponents = []; draw(); return;
    }

    if (e.ctrlKey) {
        if (key === 'z') { e.preventDefault(); undo(); }
        if (key === 'y') { e.preventDefault(); redo(); }
    }
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') isShiftPressed = false;
});

// --- SURVOL SOURIS ---
function updateMouseState(e) {
    const mousePos = toGridCoords(e.clientX, e.clientY);
    hoverJonction = null; hoveredComponent = null;
    if (isPanning || isSelectingZone) return;

    hoveredComponent = components.find(comp => Math.abs(mousePos.x - comp.x) < 30 && Math.abs(mousePos.y - comp.y) < 30);

    for (let comp of components) {
        for (let j of getComponentJonctions(comp)) {
            if (Math.hypot(mousePos.x - j.x, mousePos.y - j.y) < 12) { hoverJonction = j; break; }
        }
        if (hoverJonction) break;
    }
    if (!hoverJonction) {
        for (let aj of autoJunctions) {
            if (Math.hypot(mousePos.x - aj.x, mousePos.y - aj.y) < 12) { hoverJonction = aj; break; }
        }
    }

    if (isShiftPressed) canvas.style.cursor = 'cell';
    else if (activeWire || hoverJonction) canvas.style.cursor = 'crosshair';
    else if (isDraggingComponent) canvas.style.cursor = 'grabbing';
    else if (hoveredComponent) canvas.style.cursor = 'pointer';
    else canvas.style.cursor = 'grab';
}

// --- CLICS ET DÉPLACEMENT ---
let lastMouseGridPos = { x: 0, y: 0 };

canvas.addEventListener('mousedown', (e) => {
    const mousePos = toGridCoords(e.clientX, e.clientY);
    const sX = snapToGrid(mousePos.x);
    const sY = snapToGrid(mousePos.y);
    lastMouseGridPos = { x: sX, y: sY };
    updateMouseState(e);

    if (e.button === 0) {
        // Mode Shift + Glisser : Rectangle de sélection
        if (isShiftPressed) {
            isSelectingZone = true;
            zoneStart = { x: mousePos.x, y: mousePos.y };
            zoneEnd = { x: mousePos.x, y: mousePos.y };
            draw(); return;
        }

        if (hoverJonction) {
            if (!activeWire) {
                activeWire = { fromJonctionId: hoverJonction.id, points: [{ x: hoverJonction.x, y: hoverJonction.y }, { x: sX, y: sY }] };
            } else {
                if (hoverJonction.id !== activeWire.fromJonctionId) {
                    saveState();
                    activeWire.points[activeWire.points.length - 1] = { x: hoverJonction.x, y: hoverJonction.y };
                    activeWire.toJonctionId = hoverJonction.id;
                    wires.push(activeWire);
                }
                activeWire = null;
            }
            draw(); return;
        }

        if (activeWire) {
            const intersect = findWireIntersection(mousePos.x, mousePos.y);
            if (intersect) {
                saveState(); counters.junction++;
                const newJunctionId = `auto_junc_${counters.junction}`;
                autoJunctions.push({ id: newJunctionId, x: intersect.x, y: intersect.y });
                activeWire.points[activeWire.points.length - 1] = { x: intersect.x, y: intersect.y };
                activeWire.toJonctionId = newJunctionId;
                wires.push(activeWire); activeWire = null; draw(); return;
            }
        }
    }

    if (activeWire && e.button === 2) { activeWire = null; draw(); return; }

    if (hoveredComponent) {
        if (!selectedComponents.includes(hoveredComponent)) {
            selectedComponents = [hoveredComponent];
        }
        isDraggingComponent = true;
        saveState();
    } else {
        selectedComponents = []; 
        isPanning = true;
        startX = e.clientX - panX; startY = e.clientY - panY;
    }
    draw();
});

canvas.addEventListener('mousemove', (e) => {
    const mousePos = toGridCoords(e.clientX, e.clientY);
    
    if (isSelectingZone) {
        zoneEnd = { x: mousePos.x, y: mousePos.y };
        draw(); return;
    }

    updateMouseState(e);

    if (activeWire) {
        activeWire.points[activeWire.points.length - 1] = { x: snapToGrid(mousePos.x), y: snapToGrid(mousePos.y) };
        draw();
    } else if (isPanning) {
        panX = e.clientX - startX; panY = e.clientY - startY; draw();
    } else if (isDraggingComponent && selectedComponents.length > 0) {
        const sX = snapToGrid(mousePos.x);
        const sY = snapToGrid(mousePos.y);
        const deltaX = sX - lastMouseGridPos.x;
        const deltaY = sY - lastMouseGridPos.y;

        if (deltaX !== 0 || deltaY !== 0) {
            selectedComponents.forEach(comp => {
                comp.x += deltaX;
                comp.y += deltaY;
            });
            lastMouseGridPos = { x: sX, y: sY };
        }
        draw();
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (isSelectingZone) {
        isSelectingZone = false;
        const xMin = Math.min(zoneStart.x, zoneEnd.x);
        const xMax = Math.max(zoneStart.x, zoneEnd.x);
        const yMin = Math.min(zoneStart.y, zoneEnd.y);
        const yMax = Math.max(zoneStart.y, zoneEnd.y);

        selectedComponents = components.filter(comp => 
            comp.x >= xMin && comp.x <= xMax && comp.y >= yMin && comp.y <= yMax
        );
    }
    isPanning = false;
    isDraggingComponent = false;
    draw();
});

canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = 1.1; const mousePos = toGridCoords(e.clientX, e.clientY);
    if (e.deltaY < 0) scale *= zoomFactor; else scale /= zoomFactor;
    scale = Math.max(0.3, Math.min(scale, 4));
    const rect = canvas.getBoundingClientRect();
    panX = e.clientX - rect.left - mousePos.x * scale; panY = e.clientY - rect.top - mousePos.y * scale;
    draw();
}, { passive: false });

// --- DRAG AND DROP MENU EXTÉRIEUR ---
document.querySelectorAll('.dropdown-item[draggable=true]').forEach(item => {
    item.addEventListener('dragstart', (e) => {
        draggedComponentType = item.getAttribute('data-component');
        isDraggingFromMenu = true; e.dataTransfer.setDragImage(emptyDragImage, 0, 0);
    });
});
canvas.addEventListener('dragover', (e) => {
    e.preventDefault(); if (!isDraggingFromMenu) return;
    const gridPos = toGridCoords(e.clientX, e.clientY); dragX = gridPos.x; dragY = gridPos.y; draw();
});
canvas.addEventListener('dragend', () => { isDraggingFromMenu = false; draggedComponentType = null; draw(); });
canvas.addEventListener('drop', (e) => {
    e.preventDefault(); if (!draggedComponentType) return;
    saveState();
    const gridPos = toGridCoords(e.clientX, e.clientY);
    counters[draggedComponentType]++;
    let prefix = draggedComponentType === 'battery' ? 'VDC' : draggedComponentType === 'resistor' ? 'R' : draggedComponentType === 'nand' ? 'Nand' : 'V';
    const newComp = { type: draggedComponentType, x: snapToGrid(gridPos.x), y: snapToGrid(gridPos.y), label: `${prefix}${counters[draggedComponentType]}`, rotation: 0 };
    components.push(newComp);
    selectedComponents = [newComp];
    isDraggingFromMenu = false; draggedComponentType = null; draw();
});

// --- EXECUTION DE LA SIMULATION EN COMMUNIQUANT AVEC SERVER.JS ---
async function triggerSimulation() {
    let baseUrl = window.location.origin;
    
    // Si lancé par Live Server (port 5500/5501) en dév local, on redirige vers le serveur Node (3000)
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        if (window.location.port !== '3000') {
            baseUrl = 'http://localhost:3000';
        }
    }

    // STRUCTURE SOUHAITÉE PAR TON SERVER.JS :
    // Le serveur extrait directement `req.body?.state` puis vérifie `state.components` et `state.wires`
    const payload = { 
        state: {
            components: components, 
            wires: wires
        },
        gridStep: 16
    };

    const btn = document.getElementById('btn-simulate');
    if (btn) {
        btn.innerText = "⚡ Calculs SPICE..."; 
        btn.style.background = "#ff9800";
    }

    try {
        const response = await fetch(`${baseUrl}/api/simulate`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json' 
            },
            // CRUCIAL : Force l'envoi des cookies (comme la session de déverrouillage du site)
            credentials: 'include', 
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            let backendError = "";
            try {
                const errJson = await response.json();
                backendError = (errJson.errors && errJson.errors.join(', ')) || errJson.error || JSON.stringify(errJson);
            } catch(e) {
                backendError = await response.text();
            }
            throw new Error(`Serveur (Code ${response.status}) : ${backendError}`);
        }

        const result = await response.json();
        
        // Ton serveur répond avec 'ok: true' en cas de succès
        if (result.ok) {
            console.log("=== COMPTE RENDU NGSPICE ===");
            console.log("Logs complets :", result.log);
            console.log("Tensions (Voltmeters) :", result.voltmeterValues);
            console.log("Courants (Ammeters) :", result.ammeterValues);
            
            alert("Simulation réussie ! Toutes les mesures calculées par ngspice sont affichées dans la console F12 (Inspecter -> Console).");
        } else {
            alert("Erreur de simulation :\n" + (result.errors ? result.errors.join('\n') : "Échec inconnu"));
        }
    } catch (err) {
        console.error(err);
        alert(`Erreur de validation du circuit :\n${err.message}`);
    } finally {
        if (btn) {
            btn.innerText = "🚀 Lancer Simulation"; 
            btn.style.background = "#00ca71";
        }
    }
}

// --- ATTACHEMENT SECURISE DES LISTENERS APRES CHARGEMENT COMPLET ---
window.onload = function() {
    resizeCanvas();

    document.getElementById('btn-new').addEventListener('click', createNewProject);
    document.getElementById('btn-open').addEventListener('click', openFile);
    document.getElementById('btn-save').addEventListener('click', saveFile);
    document.getElementById('btn-save-as').addEventListener('click', saveAs);
    
    const btnSimulate = document.getElementById('btn-simulate');
    if (btnSimulate) {
        btnSimulate.addEventListener('click', triggerSimulation);
    }
};