const canvas = document.getElementById('schematicCanvas');
const ctx = canvas.getContext('2d');
const coordsLabel = document.getElementById('coords');

let width, height;
let scale = 1.0;
let offset = { x: 0, y: 0 };
let isDraggingView = false; // Clic droit
let isMovingComponent = false; // Clic gauche
let lastMousePos = { x: 0, y: 0 };

let components = [];
let history = [];
let redoStack = [];
let selectedId = null;
let resistorCount = 0;
let vsourceCount = 0;
let voltmeterCount = 0;
const GRID_SIZE = 50;

/** Dernière position monde de la souris (collage à la grille). */
let lastWorldMouse = { x: 0, y: 0 };
/** Copie : { type, vertical, value } (sans id ni position). */
let clipboard = null;

/** Glisser depuis la palette : type en cours. */
let activeDragType = null;
/** Aperçu monde { type, x, y, vertical } aligné grille — dessiné pendant le drag. */
let dragPreview = null;

/** Fichier courant (API Fichiers) pour « Enregistrer » sans redemander le chemin. */
let currentFileHandle = null;

const LABEL_PAD = 20;

function init() {
    window.addEventListener('resize', resize);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    
    // Drag & Drop
    canvas.addEventListener('dragenter', e => { e.preventDefault(); });
    canvas.addEventListener('dragover', handleCanvasDragOver);
    canvas.addEventListener('dragleave', handleCanvasDragLeave);
    canvas.addEventListener('drop', handleDrop);
    window.addEventListener('dragend', handleWindowDragEnd);
    
    // Souris
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('wheel', handleZoom, { passive: false });
    
    // Clavier
    window.addEventListener('keydown', handleKeyDown);

    const fileOpen = document.getElementById("file-open-input");
    if (fileOpen) {
        fileOpen.addEventListener("change", async e => {
            const f = e.target.files[0];
            e.target.value = "";
            if (!f) return;
            try {
                await loadCircuitFromText(await f.text());
                currentFileHandle = null;
                history = [];
                redoStack = [];
                saveState();
                draw();
            } catch (err) {
                alert("Impossible d'ouvrir ce fichier : " + (err && err.message ? err.message : err));
            }
        });
    }

    saveState();
    resize();
}

function isTwoTerminalType(t) {
    return t === "resistor" || t === "vsource" || t === "voltmeter";
}

function removePaletteDragCanvas() {
    const old = document.getElementById("palette-drag-canvas");
    if (old) old.remove();
}

/** Mini symbole sous le curseur pour le drag depuis le menu. */
function createPaletteDragImage(type) {
    removePaletteDragCanvas();
    const c = document.createElement("canvas");
    c.id = "palette-drag-canvas";
    c.width = 132;
    c.height = 48;
    c.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none";
    const g = c.getContext("2d");
    g.fillStyle = "#252526";
    g.fillRect(0, 0, c.width, c.height);
    g.lineWidth = 2.5;
    g.lineCap = "round";
    g.lineJoin = "round";
    if (type === "vsource") {
        g.strokeStyle = "#FFA726";
        const mid = 24;
        const cx = 66;
        const gap = 6;
        g.beginPath();
        g.moveTo(6, mid);
        g.lineTo(cx - gap, mid);
        g.moveTo(cx + gap, mid);
        g.lineTo(126, mid);
        g.stroke();
        g.beginPath();
        g.moveTo(cx - gap, 4);
        g.lineTo(cx - gap, 44);
        g.moveTo(cx + gap, 16);
        g.lineTo(cx + gap, 32);
        g.stroke();
    } else if (type === "resistor") {
        g.strokeStyle = "#66BB6A";
        g.beginPath();
        g.moveTo(6, 24); g.lineTo(44, 24);
        g.moveTo(88, 24); g.lineTo(126, 24);
        g.stroke();
        g.strokeRect(44, 16, 44, 16);
    } else if (type === "voltmeter") {
        g.strokeStyle = "#4DB6AC";
        const mid = 24;
        const cx = 66;
        const r = 14;
        g.beginPath();
        g.moveTo(6, mid);
        g.lineTo(cx - r, mid);
        g.moveTo(cx + r, mid);
        g.lineTo(126, mid);
        g.stroke();
        g.beginPath();
        g.arc(cx, mid, r, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = "#ccc";
        g.font = "bold 12px Segoe UI";
        g.textAlign = "center";
        g.fillText("V", cx, mid + 4);
    }
    document.body.appendChild(c);
    return { canvas: c, hx: 66, hy: 24 };
}

// --- DRAG & DROP INITIAL ---
function handleDragStart(e, type) {
    e.stopPropagation();
    const menuItem = e.target.closest(".menu-item");
    if (menuItem) menuItem.classList.add("dropdown-pinned");

    activeDragType = type;
    e.dataTransfer.setData("compType", type);
    e.dataTransfer.effectAllowed = "copy";

    const { canvas: dragImg, hx, hy } = createPaletteDragImage(type);
    e.dataTransfer.setDragImage(dragImg, hx, hy);
}

function handleWindowDragEnd() {
    document.querySelectorAll(".menu-item.dropdown-pinned").forEach(el => {
        el.classList.remove("dropdown-pinned");
    });
    removePaletteDragCanvas();
    activeDragType = null;
    dragPreview = null;
    draw();
}

function handleCanvasDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!isTwoTerminalType(activeDragType)) return;
    const worldPos = screenToWorld(e.clientX, e.clientY);
    const snapped = snapTwoTerminalDropWorld(worldPos.x, worldPos.y, false);
    dragPreview = {
        type: activeDragType,
        x: snapped.x,
        y: snapped.y,
        vertical: false
    };
    draw();
}

function handleCanvasDragLeave(e) {
    if (!e.relatedTarget || !canvas.contains(e.relatedTarget)) {
        dragPreview = null;
        draw();
    }
}

function snapTwoTerminalDropWorld(wx, wy, vertical) {
    const half = GRID_SIZE / 2;
    const snappedTx = Math.round(wx / GRID_SIZE) * GRID_SIZE;
    const snappedTy = Math.round(wy / GRID_SIZE) * GRID_SIZE;
    if (vertical) {
        return { x: snappedTx - half, y: snappedTy };
    }
    return { x: snappedTx, y: snappedTy - half };
}

function snapTwoTerminalComponent(comp) {
    const wx = comp.vertical ? comp.x + GRID_SIZE / 2 : comp.x;
    const wy = comp.vertical ? comp.y : comp.y + GRID_SIZE / 2;
    const p = snapTwoTerminalDropWorld(wx, wy, comp.vertical);
    comp.x = p.x;
    comp.y = p.y;
}

function handleDrop(e) {
    e.preventDefault();
    const type = e.dataTransfer.getData("compType") || activeDragType;
    dragPreview = null;
    activeDragType = null;
    const worldPos = screenToWorld(e.clientX, e.clientY);

    if (type === "resistor" || type === "vsource" || type === "voltmeter") {
        const snapped = snapTwoTerminalDropWorld(worldPos.x, worldPos.y, false);
        let id;
        let value;
        if (type === "resistor") {
            id = `R${++resistorCount}`;
            value = "1k";
        } else if (type === "vsource") {
            id = `E${++vsourceCount}`;
            value = "5V";
        } else {
            id = `V${++voltmeterCount}`;
            value = "";
        }

        components.push({
            id,
            type,
            x: snapped.x,
            y: snapped.y,
            value,
            vertical: false
        });
        saveState();
        draw();
    }
}

// --- RENDU ---
function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);
    
    drawGrid();
    components.forEach(renderComponent);
    if (dragPreview && isTwoTerminalType(dragPreview.type)) {
        ctx.globalAlpha = 0.45;
        const ghost = {
            id: "…",
            type: dragPreview.type,
            x: dragPreview.x,
            y: dragPreview.y,
            value:
                dragPreview.type === "vsource"
                    ? "5V"
                    : dragPreview.type === "resistor"
                      ? "1k"
                      : "",
            vertical: dragPreview.vertical
        };
        renderComponent(ghost, { ghost: true });
        ctx.globalAlpha = 1;
    }

    ctx.restore();
}

function drawGrid() {
    const left = -offset.x / scale;
    const top = -offset.y / scale;
    const right = (width - offset.x) / scale;
    const bottom = (height - offset.y) / scale;
    ctx.beginPath();
    ctx.strokeStyle = '#151515';
    ctx.lineWidth = 1/scale;
    for (let x = Math.floor(left/GRID_SIZE)*GRID_SIZE; x < right; x+=GRID_SIZE) {
        ctx.moveTo(x, top); ctx.lineTo(x, bottom);
    }
    for (let y = Math.floor(top/GRID_SIZE)*GRID_SIZE; y < bottom; y+=GRID_SIZE) {
        ctx.moveTo(left, y); ctx.lineTo(right, y);
    }
    ctx.stroke();
}

function drawJunctions(points) {
    const r = 5;
    ctx.fillStyle = "#e53935";
    ctx.strokeStyle = "#b71c1c";
    ctx.lineWidth = 1 / scale;
    for (const pt of points) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }
}

function drawComponentLabels(ctx, c, w, h, isVertical) {
    if (!c.id) return;
    ctx.fillStyle = "#fff";
    if (isVertical) {
        const yMid = h / 2;
        ctx.textBaseline = "middle";
        ctx.textAlign = "right";
        ctx.fillText(c.id, -LABEL_PAD, yMid);
        ctx.textAlign = "left";
        if (c.value != null && String(c.value).length > 0) {
            ctx.fillText(String(c.value), w + LABEL_PAD, yMid);
        }
    } else {
        const cx = w / 2;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(c.id, cx, -12);
        if (c.value != null && String(c.value).length > 0) {
            ctx.textBaseline = "top";
            ctx.fillText(String(c.value), cx, h + 12);
        }
    }
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "start";
}

function renderComponent(c, opts) {
    const ghost = opts && opts.ghost;
    const isSelected = !ghost && selectedId === c.id;
    
    // Couleurs par type
    if (isSelected) ctx.strokeStyle = "#0078d4";
    else if (c.type === "vsource") ctx.strokeStyle = "#FFA726";
    else if (c.type === "voltmeter") ctx.strokeStyle = "#4DB6AC";
    else ctx.strokeStyle = "#4CAF50";

    ctx.lineWidth = 2 / scale;
    ctx.fillStyle = "#fff";
    ctx.font = `${14 / scale}px Segoe UI`;

    let junctA, junctB;
    ctx.save();
    ctx.translate(c.x, c.y);

    if (c.vertical) {
        const h = GRID_SIZE * 3, w = GRID_SIZE;
        const midX = w/2;
        if (c.type === "voltmeter") {
            const r = 18;
            ctx.beginPath(); 
            ctx.moveTo(midX, 0); ctx.lineTo(midX, h/2 - r); 
            ctx.moveTo(midX, h/2 + r); ctx.lineTo(midX, h); 
            ctx.stroke();
            ctx.beginPath(); ctx.arc(midX, h/2, r, 0, Math.PI*2); ctx.stroke();
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("V", midX, h/2);
            ctx.textBaseline = "alphabetic";
        } else if (c.type === "vsource") {
            const gap = 5;
            ctx.beginPath(); ctx.moveTo(midX, 0); ctx.lineTo(midX, h/2 - gap); ctx.moveTo(midX, h/2 + gap); ctx.lineTo(midX, h); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(w*0.05, h/2 - gap); ctx.lineTo(w*0.95, h/2 - gap); ctx.moveTo(w*0.25, h/2 + gap); ctx.lineTo(w*0.75, h/2 + gap); ctx.stroke();
        } else {
            ctx.beginPath(); ctx.moveTo(midX, 0); ctx.lineTo(midX, h*0.25); ctx.moveTo(midX, h*0.75); ctx.lineTo(midX, h); ctx.stroke();
            ctx.strokeRect(w/4, h*0.25, w/2, h/2);
        }
        junctA = { x: c.x + midX, y: c.y }; junctB = { x: c.x + midX, y: c.y + h };
        if (!ghost) drawComponentLabels(ctx, c, w, h, true);
    } else {
        const w = GRID_SIZE * 3, h = GRID_SIZE;
        const midY = h/2;
        if (c.type === "voltmeter") {
            const r = 18;
            ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(w/2 - r, midY); ctx.moveTo(w/2 + r, midY); ctx.lineTo(w, midY); ctx.stroke();
            ctx.beginPath(); ctx.arc(w/2, midY, r, 0, Math.PI*2); ctx.stroke();
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("V", w/2, midY);
            ctx.textBaseline = "alphabetic";
        } else if (c.type === "vsource") {
            const gap = 5;
            ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(w/2 - gap, midY); ctx.moveTo(w/2 + gap, midY); ctx.lineTo(w, midY); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(w/2 - gap, h*0.05); ctx.lineTo(w/2 - gap, h*0.95); ctx.moveTo(w/2 + gap, h*0.3); ctx.lineTo(w/2 + gap, h*0.7); ctx.stroke();
        } else {
            ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(w*0.25, midY); ctx.moveTo(w*0.75, midY); ctx.lineTo(w, midY); ctx.stroke();
            ctx.strokeRect(w*0.25, h/4, w/2, h/2);
        }
        junctA = { x: c.x, y: c.y + midY }; junctB = { x: c.x + w, y: c.y + midY };
        if (!ghost) drawComponentLabels(ctx, c, w, h, false);
    }

    ctx.restore();
    drawJunctions([junctA, junctB]);
}

// --- MOUVEMENT & SELECTION ---
function handleMouseDown(e) {
    const worldPos = screenToWorld(e.clientX, e.clientY);
    const hit = components.find(c => {
        const w = c.vertical ? GRID_SIZE : GRID_SIZE * 3;
        const h = c.vertical ? GRID_SIZE * 3 : GRID_SIZE;
        return worldPos.x >= c.x && worldPos.x <= c.x + w && worldPos.y >= c.y && worldPos.y <= c.y + h;
    });

    if (e.button === 0) { // Gauche
        if (hit) {
            selectedId = hit.id; isMovingComponent = true; lastMousePos = worldPos;
        } else { selectedId = null; }
    } else if (e.button === 2) { // Droit
        isDraggingView = true; lastMousePos = { x: e.clientX, y: e.clientY };
    }
    draw();
}

function handleMouseMove(e) {
    const worldPos = screenToWorld(e.clientX, e.clientY);
    lastWorldMouse.x = worldPos.x;
    lastWorldMouse.y = worldPos.y;
    coordsLabel.innerText = `X: ${Math.round(worldPos.x)}, Y: ${Math.round(worldPos.y)}`;

    if (isMovingComponent && selectedId) {
        let comp = components.find(c => c.id === selectedId);
        comp.x += worldPos.x - lastMousePos.x;
        comp.y += worldPos.y - lastMousePos.y;
        lastMousePos = worldPos;
        draw();
    } else if (isDraggingView) {
        offset.x += e.clientX - lastMousePos.x;
        offset.y += e.clientY - lastMousePos.y;
        lastMousePos = { x: e.clientX, y: e.clientY };
        draw();
    }
}

function handleMouseUp() {
    if (isMovingComponent && selectedId) {
        let comp = components.find(c => c.id === selectedId);
        if (isTwoTerminalType(comp.type)) snapTwoTerminalComponent(comp);
        else {
            comp.x = Math.round(comp.x / GRID_SIZE) * GRID_SIZE;
            comp.y = Math.round(comp.y / GRID_SIZE) * GRID_SIZE;
        }
        saveState();
    }
    isMovingComponent = false; isDraggingView = false; draw();
}

// --- UTILITAIRES ---
function screenToWorld(x, y) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (x - rect.left - offset.x) / scale,
        y: (y - rect.top - offset.y) / scale
    };
}

function copySelection() {
    if (!selectedId) return;
    const c = components.find(x => x.id === selectedId);
    if (!c || !isTwoTerminalType(c.type)) return;
    clipboard = { type: c.type, vertical: c.vertical, value: c.value };
}

function pasteFromClipboard() {
    if (!clipboard) return;
    if (!isTwoTerminalType(clipboard.type)) return;
    const snapped = snapTwoTerminalDropWorld(lastWorldMouse.x, lastWorldMouse.y, clipboard.vertical);
    let id;
    if (clipboard.type === "resistor") id = `R${++resistorCount}`;
    else if (clipboard.type === "vsource") id = `E${++vsourceCount}`;
    else id = `V${++voltmeterCount}`;
    components.push({
        id,
        type: clipboard.type,
        x: snapped.x,
        y: snapped.y,
        value: clipboard.value,
        vertical: clipboard.vertical
    });
    selectedId = id;
    saveState();
    draw();
}

function handleKeyDown(e) {
    const isCtrl = e.ctrlKey || e.metaKey;
    if (isCtrl && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
    if (isCtrl && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
    if (isCtrl && e.key.toLowerCase() === "c") {
        copySelection();
        if (clipboard) e.preventDefault();
    }
    if (isCtrl && e.key.toLowerCase() === "v") {
        if (clipboard) {
            e.preventDefault();
            pasteFromClipboard();
        }
    }

    if (selectedId && e.key.toLowerCase() === "r" && !isCtrl) {
        const comp = components.find(c => c.id === selectedId);
        if (comp && isTwoTerminalType(comp.type)) {
            comp.vertical = !comp.vertical;
            snapTwoTerminalComponent(comp);
            saveState();
            draw();
        }
    }
    if (selectedId && (e.key === "Delete" || e.key === "Backspace")) {
        components = components.filter(c => c.id !== selectedId);
        selectedId = null;
        syncCountersFromComponents();
        saveState();
        draw();
    }
}

function saveState() {
    history.push(JSON.stringify(components));
    if (history.length > 30) history.shift();
    redoStack = [];
}

function undo() {
    if (history.length > 1) {
        redoStack.push(history.pop());
        components = JSON.parse(history[history.length - 1]);
        syncCountersFromComponents();
        draw();
    }
}

function redo() {
    if (redoStack.length > 0) {
        const state = redoStack.pop();
        history.push(state);
        components = JSON.parse(state);
        syncCountersFromComponents();
        draw();
    }
}

function handleZoom(e) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = scale * factor;
    if (newScale > 0.1 && newScale < 10) {
        offset.x = e.clientX - (e.clientX - offset.x) * factor;
        offset.y = e.clientY - (e.clientY - offset.y) * factor;
        scale = newScale;
        draw();
    }
}

function resize() {
    width = window.innerWidth; height = window.innerHeight - 40;
    canvas.width = width; canvas.height = height; draw();
}

init();

function getCircuitJson() {
    return JSON.stringify(components, null, 2);
}

function syncCountersFromComponents() {
    let maxR = 0, maxE = 0, maxV = 0;
    for (const c of components) {
        if (!c || !c.id) continue;
        let m = /^R(\d+)$/.exec(c.id);
        if (m) maxR = Math.max(maxR, +m[1]);
        m = /^E(\d+)$/.exec(c.id);
        if (m) maxE = Math.max(maxE, +m[1]);
        m = /^V(\d+)$/.exec(c.id);
        if (m) maxV = Math.max(maxV, +m[1]);
        m = /^Vm(\d+)$/.exec(c.id);
        if (m) maxV = Math.max(maxV, +m[1]);
    }
    resistorCount = maxR;
    vsourceCount = maxE;
    voltmeterCount = maxV;
}

function applyLoadedCircuit(list) {
    components = Array.isArray(list) ? list.map(x => ({ ...x })) : [];
    syncCountersFromComponents();
    selectedId = null;
    clipboard = null;
    dragPreview = null;
}

async function loadCircuitFromText(text) {
    const data = JSON.parse(text);
    const list = Array.isArray(data)
        ? data
        : data && Array.isArray(data.components)
          ? data.components
          : null;
    if (!list) {
        throw new Error("Le fichier doit contenir un tableau JSON de composants.");
    }
    applyLoadedCircuit(list);
}

function resetCircuit() {
    components = [];
    selectedId = null;
    clipboard = null;
    dragPreview = null;
    currentFileHandle = null;
    history = [];
    redoStack = [];
    resistorCount = 0;
    vsourceCount = 0;
    voltmeterCount = 0;
    saveState();
    draw();
}

async function nouveauDocument() {
    const enregistrer = confirm(
        "Souhaitez-vous enregistrer le circuit actuel avant de créer un nouveau document ?\n\nOK : enregistrer\nAnnuler : ne pas enregistrer"
    );
    if (enregistrer) await save();
    if (!confirm("Effacer tout le schéma et repartir à zéro ?")) return;
    resetCircuit();
}

async function save() {
    const json = getCircuitJson();
    if ("showSaveFilePicker" in window && currentFileHandle) {
        try {
            const w = await currentFileHandle.createWritable();
            await w.write(json);
            await w.close();
            return;
        } catch (e) {
            console.warn(e);
        }
    }
    await saveAs();
}

async function saveAs() {
    const json = getCircuitJson();
    if ("showSaveFilePicker" in window) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: "mon_circuit.json",
                types: [
                    {
                        description: "Fichier circuit JSON",
                        accept: { "application/json": [".json"] }
                    }
                ]
            });
            const writable = await handle.createWritable();
            await writable.write(json);
            await writable.close();
            currentFileHandle = handle;
        } catch (err) {
            if (err && err.name !== "AbortError") console.warn(err);
        }
    } else {
        currentFileHandle = null;
        const dataStr =
            "data:text/json;charset=utf-8," + encodeURIComponent(json);
        const a = document.createElement("a");
        a.href = dataStr;
        a.download = "mon_circuit.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
    }
}

async function openCircuit() {
    if ("showOpenFilePicker" in window) {
        try {
            const [handle] = await window.showOpenFilePicker({
                types: [
                    {
                        description: "Circuit JSON",
                        accept: { "application/json": [".json"] }
                    }
                ],
                multiple: false
            });
            const file = await handle.getFile();
            await loadCircuitFromText(await file.text());
            currentFileHandle = handle;
            history = [];
            redoStack = [];
            saveState();
            draw();
        } catch (err) {
            if (err && err.name !== "AbortError") {
                console.warn(err);
                alert("Impossible d'ouvrir ce fichier : " + (err.message || err));
            }
        }
        return;
    }
    const inp = document.getElementById("file-open-input");
    if (inp) inp.click();
    else alert("Votre navigateur ne permet pas l'ouverture de fichier depuis cette page.");
}