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
const GRID_SIZE = 50;

/** Dernière position monde de la souris (collage à la grille). */
let lastWorldMouse = { x: 0, y: 0 };
/** Copie : { type, vertical, value } (sans id ni position). */
let clipboard = null;

/** Glisser depuis la palette : type en cours. */
let activeDragType = null;
/** Aperçu monde { type, x, y, vertical } aligné grille — dessiné pendant le drag. */
let dragPreview = null;

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

    saveState();
    resize();
}

function isTwoTerminalType(t) {
    return t === "resistor" || t === "vsource";
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

    if (type === "resistor" || type === "vsource") {
        const snapped = snapTwoTerminalDropWorld(worldPos.x, worldPos.y, false);
        let id;
        if (type === "resistor") id = `R${++resistorCount}`;
        else id = `E${++vsourceCount}`;
        
        components.push({
            id: id,
            type: type,
            x: snapped.x,
            y: snapped.y,
            value: type === "vsource" ? "5V" : "1k",
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
            value: dragPreview.type === "vsource" ? "5V" : "1k",
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

function renderComponent(c, opts) {
    const ghost = opts && opts.ghost;
    const isSelected = !ghost && selectedId === c.id;
    const isV = c.type === "vsource";
    ctx.strokeStyle = isSelected ? "#0078d4" : isV ? "#FFA726" : "#4CAF50";
    ctx.lineWidth = 2 / scale;
    ctx.fillStyle = "#fff";
    ctx.font = `${14 / scale}px Segoe UI`;

    let junctA, junctB;

    ctx.save();
    ctx.translate(c.x, c.y);
    if (c.vertical) {
        const h = GRID_SIZE * 3, w = GRID_SIZE;
        const bodyH = GRID_SIZE * 1.5, bodyY = (h - bodyH) / 2;
        if (!isV) {
            ctx.beginPath();
            ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, bodyY);
            ctx.moveTo(w / 2, bodyY + bodyH); ctx.lineTo(w / 2, h);
            ctx.stroke();
        }

        if (isV) {
            const cx = w / 2;
            const gap = 5;
            const cyT = h / 2 - gap;
            const cyB = h / 2 + gap;
            ctx.beginPath();
            ctx.moveTo(cx, 0);
            ctx.lineTo(cx, cyT);
            ctx.moveTo(cx, cyB);
            ctx.lineTo(cx, h);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(w * 0.04, cyT);
            ctx.lineTo(w * 0.96, cyT);
            ctx.moveTo(w * 0.26, cyB);
            ctx.lineTo(w * 0.74, cyB);
            ctx.stroke();
        } else {
            ctx.strokeRect(w / 4, bodyY, w / 2, bodyH);
        }

        junctA = { x: c.x + w / 2, y: c.y };
        junctB = { x: c.x + w / 2, y: c.y + h };
        if (!ghost) {
            ctx.textAlign = "right"; ctx.fillText(c.id, -10, h / 2 + 5);
            ctx.textAlign = "left"; ctx.fillText(c.value, w + 10, h / 2 + 5);
        }
    } else {
        const w = GRID_SIZE * 3, h = GRID_SIZE;
        const bodyW = GRID_SIZE * 1.5, bodyX = (w - bodyW) / 2;
        if (isV) {
            const mid = h / 2;
            const gap = 5;
            const cxL = w / 2 - gap;
            const cxR = w / 2 + gap;
            ctx.beginPath();
            ctx.moveTo(0, mid);
            ctx.lineTo(cxL, mid);
            ctx.moveTo(cxR, mid);
            ctx.lineTo(w, mid);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cxL, h * 0.02);
            ctx.lineTo(cxL, h * 0.98);
            ctx.moveTo(cxR, h * 0.3);
            ctx.lineTo(cxR, h * 0.7);
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.moveTo(0, h / 2);
            ctx.lineTo(bodyX, h / 2);
            ctx.moveTo(bodyX + bodyW, h / 2);
            ctx.lineTo(w, h / 2);
            ctx.stroke();
            ctx.strokeRect(bodyX, h / 4, bodyW, h / 2);
        }

        junctA = { x: c.x, y: c.y + h / 2 };
        junctB = { x: c.x + w, y: c.y + h / 2 };
        if (!ghost) {
            ctx.textAlign = "center"; ctx.fillText(c.id, w / 2, -10);
            ctx.fillText(c.value, w / 2, h + 20);
        }
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
    if (c) clipboard = { type: c.type, vertical: c.vertical, value: c.value };
}

function pasteFromClipboard() {
    if (!clipboard) return;
    const snapped = snapTwoTerminalDropWorld(lastWorldMouse.x, lastWorldMouse.y, clipboard.vertical);
    let id = clipboard.type === "resistor" ? `R${++resistorCount}` : `E${++vsourceCount}`;
    components.push({
        id, type: clipboard.type, x: snapped.x, y: snapped.y,
        value: clipboard.value, vertical: clipboard.vertical
    });
    selectedId = id; saveState(); draw();
}

function handleKeyDown(e) {
    const isCtrl = e.ctrlKey || e.metaKey;
    if (isCtrl && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
    if (isCtrl && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
    if (isCtrl && e.key.toLowerCase() === "c") { copySelection(); e.preventDefault(); }
    if (isCtrl && e.key.toLowerCase() === "v") { pasteFromClipboard(); e.preventDefault(); }

    if (selectedId && e.key.toLowerCase() === "r" && !isCtrl) {
        const comp = components.find(c => c.id === selectedId);
        if (comp) {
            comp.vertical = !comp.vertical;
            snapTwoTerminalComponent(comp);
            saveState(); draw();
        }
    }
    if (selectedId && (e.key === "Delete" || e.key === "Backspace")) {
        components = components.filter(c => c.id !== selectedId);
        selectedId = null; saveState(); draw();
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
        draw();
    }
}

function redo() {
    if (redoStack.length > 0) {
        const state = redoStack.pop();
        history.push(state);
        components = JSON.parse(state);
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