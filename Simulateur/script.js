const canvas = document.getElementById('schematicCanvas');
const ctx = canvas.getContext('2d');
const coordsLabel = document.getElementById('coords');

let width, height;
let scale = 1.0;
let offset = { x: 0, y: 0 };
let isDraggingView = false; // Clic droit
let isMovingComponent = false; // Clic gauche
let lastMousePos = { x: 0, y: 0 };
/** Capture pointeur pendant déplacement / fil / panoramique (évite état bloqué si mouseup hors canevas). */
let canvasPointerId = null;
/** Début d’un clic sur composant (distinguer clic = édition valeur vs glisser). */
let dragStartClient = null;
let valueEditorCompId = null;

let components = [];
let history = [];
let redoStack = [];
let selectedId = null;
let selectedWireId = null;
let resistorCount = 0;
let vsourceCount = 0;
let voltmeterCount = 0;
let ammeterCount = 0;
let ohmmeterCount = 0;
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

const THEME_STORAGE_KEY = "simu-editor-theme";
const GRID_STORAGE_KEY = "simu-editor-show-grid";

/** `"black"` | `"white"` — menu Mode. */
let editorTheme = "black";
/** Affichage de la grille du canevas (menu Mode). */
let showEditorGrid = true;

const EDITOR_THEMES = {
    black: { canvas: "#000000", grid: "#151515", wire: "#9e9e9e", compLabel: "#ffffff" },
    white: { canvas: "#f0f0f0", grid: "#bdbdbd", wire: "#555555", compLabel: "#1a1a1a" }
};

function getEditorColors() {
    return EDITOR_THEMES[editorTheme] || EDITOR_THEMES.black;
}

function loadEditorDisplayPrefs() {
    try {
        const t = localStorage.getItem(THEME_STORAGE_KEY);
        if (t === "white" || t === "black") editorTheme = t;
        const g = localStorage.getItem(GRID_STORAGE_KEY);
        if (g === "0") showEditorGrid = false;
        else if (g === "1") showEditorGrid = true;
    } catch (_) {
        /* private mode */
    }
}

function applyEditorThemeToPage() {
    document.body.classList.toggle("theme-light", editorTheme === "white");
}

function setTheme(name) {
    if (name !== "black" && name !== "white") return;
    editorTheme = name;
    try {
        localStorage.setItem(THEME_STORAGE_KEY, name);
    } catch (_) {}
    applyEditorThemeToPage();
    draw();
}

function updateGridToggleLabel() {
    const btn = document.getElementById("grid-toggle-btn");
    if (btn) btn.textContent = showEditorGrid ? "🏁 Grille : active" : "🏁 Grille : masquée";
}

function toggleGrid() {
    showEditorGrid = !showEditorGrid;
    try {
        localStorage.setItem(GRID_STORAGE_KEY, showEditorGrid ? "1" : "0");
    } catch (_) {}
    updateGridToggleLabel();
    draw();
}

/** Fils : polyligne monde, extrémités figées à la complétion. */
let wires = [];
/** Jonctions en T entre fils (points monde, affichage rouge). */
let teeWirePoints = [];
let wireCount = 0;
/** Brouillon de fil : { fromKey, points: [{x,y}] } */
let wireDraft = null;
let isWireDrag = false;
/** Routage brouillon de fil : Manhattan sur grille (coude selon la souris). */
const WIRE_EXTEND_MODE = 2;
/** Tolérance de clic (monde) : dépend du zoom pour rester confortable à l’écran. */
function hitSlopWorld() {
    const screenPx = 14;
    return Math.max(GRID_SIZE * 0.45, screenPx / Math.max(scale, 0.08));
}

let usedJunctionKeys = new Set();

function dist(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
}

function junctionEndpointsForComponent(c) {
    const w = c.vertical ? GRID_SIZE : GRID_SIZE * 3;
    const h = c.vertical ? GRID_SIZE * 3 : GRID_SIZE;
    if (c.vertical) {
        const midX = w / 2;
        return [
            { x: c.x + midX, y: c.y, key: `${c.id}#0` },
            { x: c.x + midX, y: c.y + h, key: `${c.id}#1` }
        ];
    }
    const midY = h / 2;
    return [
        { x: c.x, y: c.y + midY, key: `${c.id}#0` },
        { x: c.x + w, y: c.y + midY, key: `${c.id}#1` }
    ];
}

/** Clé stable pour une jonction en T (connexion entre fils, sans borne de composant). */
function teeVirtualKey(px, py) {
    const x = Math.round(px * 1000) / 1000;
    const y = Math.round(py * 1000) / 1000;
    return `__t#${x}#${y}`;
}

/** Extrémité libre (fil figé sans 2e borne au moment de commencer un autre). */
function floatingEndKey(px, py) {
    const x = Math.round(px * 1000) / 1000;
    const y = Math.round(py * 1000) / 1000;
    return `__p#${x}#${y}`;
}

/** Composant le plus au-dessus sous le curseur (pour déplacement). */
function findTopComponentAtWorld(wx, wy) {
    for (let i = components.length - 1; i >= 0; i--) {
        const c = components[i];
        if (!isTwoTerminalType(c.type)) continue;
        const w = c.vertical ? GRID_SIZE : GRID_SIZE * 3;
        const h = c.vertical ? GRID_SIZE * 3 : GRID_SIZE;
        if (wx >= c.x && wx <= c.x + w && wy >= c.y && wy <= c.y + h) return c;
    }
    return null;
}

/** Borne d’un composant sous le curseur, ou null. */
function findComponentTerminalNearWorld(c, wx, wy) {
    const slop = hitSlopWorld();
    for (const j of junctionEndpointsForComponent(c)) {
        if (dist(wx, wy, j.x, j.y) <= slop) return j;
    }
    return null;
}

function findJunctionNearWorld(wx, wy) {
    let best = null;
    let bestD = Infinity;
    for (const c of components) {
        if (!isTwoTerminalType(c.type)) continue;
        for (const j of junctionEndpointsForComponent(c)) {
            const d = dist(wx, wy, j.x, j.y);
            if (d <= hitSlopWorld() && d < bestD) {
                bestD = d;
                best = j;
            }
        }
    }
    const teeHit = hitSlopWorld();
    for (const p of teeWirePoints) {
        const d = dist(wx, wy, p.x, p.y);
        if (d <= teeHit && d < bestD) {
            bestD = d;
            best = { x: p.x, y: p.y, key: teeVirtualKey(p.x, p.y) };
        }
    }
    for (const w of wires) {
        if (!w.solid || !w.points || w.points.length < 2) continue;
        const ends = [
            { key: w.fromKey, x: w.points[0].x, y: w.points[0].y },
            { key: w.toKey, x: w.points[w.points.length - 1].x, y: w.points[w.points.length - 1].y }
        ];
        for (const e of ends) {
            if (!e.key || !e.key.startsWith("__p#")) continue;
            const d = dist(wx, wy, e.x, e.y);
            if (d <= teeHit && d < bestD) {
                bestD = d;
                best = { x: e.x, y: e.y, key: e.key };
            }
        }
    }
    return best;
}

function rebuildUsedJunctionKeys() {
    usedJunctionKeys.clear();
    for (const w of wires) {
        if (w.solid && w.fromKey && w.toKey) {
            usedJunctionKeys.add(w.fromKey);
            usedJunctionKeys.add(w.toKey);
        }
    }
    rebuildTeeWirePoints();
}

const W_EPS = 1e-6;

function sameXY(P, Q) {
    return Math.abs(P.x - Q.x) < W_EPS && Math.abs(P.y - Q.y) < W_EPS;
}

function onSegmentClosed(P, A, B) {
    const minx = Math.min(A.x, B.x),
        maxx = Math.max(A.x, B.x);
    const miny = Math.min(A.y, B.y),
        maxy = Math.max(A.y, B.y);
    if (Math.abs(A.x - B.x) < W_EPS) {
        return Math.abs(P.x - A.x) < W_EPS && P.y >= miny - W_EPS && P.y <= maxy + W_EPS;
    }
    if (Math.abs(A.y - B.y) < W_EPS) {
        return Math.abs(P.y - A.y) < W_EPS && P.x >= minx - W_EPS && P.x <= maxx + W_EPS;
    }
    return false;
}

function strictInteriorOnSegment(P, A, B) {
    if (!onSegmentClosed(P, A, B)) return false;
    if (sameXY(P, A) || sameXY(P, B)) return false;
    return true;
}

function orthogonalIntersectSegments(A1, B1, A2, B2) {
    const h1 = Math.abs(A1.y - B1.y) < W_EPS;
    const h2 = Math.abs(A2.y - B2.y) < W_EPS;
    if (h1 === h2) return null;
    let Ha, Hb, Va, Vb;
    if (h1) {
        Ha = A1;
        Hb = B1;
        Va = A2;
        Vb = B2;
    } else {
        Ha = A2;
        Hb = B2;
        Va = A1;
        Vb = B1;
    }
    const y = Ha.y;
    const x = Va.x;
    const hxMin = Math.min(Ha.x, Hb.x),
        hxMax = Math.max(Ha.x, Hb.x);
    const vyMin = Math.min(Va.y, Vb.y),
        vyMax = Math.max(Va.y, Vb.y);
    if (x < hxMin - W_EPS || x > hxMax + W_EPS) return null;
    if (y < vyMin - W_EPS || y > vyMax + W_EPS) return null;
    return { x, y };
}

function collectWireSegments() {
    const segs = [];
    for (const w of wires) {
        if (!w.points || w.points.length < 2) continue;
        for (let i = 0; i < w.points.length - 1; i++) {
            const a = w.points[i],
                b = w.points[i + 1];
            if (sameXY(a, b)) continue;
            segs.push({ a, b, wid: w.id, i });
        }
    }
    return segs;
}

function rebuildTeeWirePoints() {
    const set = new Set();
    const add = p => {
        set.add(`${p.x},${p.y}`);
    };
    const segs = collectWireSegments();

    for (let i = 0; i < segs.length; i++) {
        for (let j = i + 1; j < segs.length; j++) {
            const s1 = segs[i],
                s2 = segs[j];
            const I = orthogonalIntersectSegments(s1.a, s1.b, s2.a, s2.b);
            if (!I) continue;
            if (!onSegmentClosed(I, s1.a, s1.b) || !onSegmentClosed(I, s2.a, s2.b)) continue;
            const in1 = strictInteriorOnSegment(I, s1.a, s1.b);
            const in2 = strictInteriorOnSegment(I, s2.a, s2.b);
            if (!in1 && !in2) continue;
            add(I);
        }
    }

    for (const w of wires) {
        if (!w.points) continue;
        for (let k = 0; k < w.points.length; k++) {
            const V = w.points[k];
            for (const s of segs) {
                if (sameXY(V, s.a) || sameXY(V, s.b)) continue;
                if (strictInteriorOnSegment(V, s.a, s.b)) add(V);
            }
        }
    }

    teeWirePoints = [];
    for (const k of set) {
        const [sx, sy] = k.split(",");
        teeWirePoints.push({ x: +sx, y: +sy });
    }
}

function distPointToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 < W_EPS) return dist(px, py, ax, ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return dist(px, py, ax + t * dx, ay + t * dy);
}

/** Fil sous le curseur (pour sélection / suppression). */
function findWireNearWorld(wx, wy) {
    const slop = hitSlopWorld();
    let best = null;
    let bestD = Infinity;
    for (const w of wires) {
        if (!w.solid || !w.points || w.points.length < 2) continue;
        for (let i = 0; i < w.points.length - 1; i++) {
            const a = w.points[i];
            const b = w.points[i + 1];
            const d = distPointToSegment(wx, wy, a.x, a.y, b.x, b.y);
            if (d <= slop && d < bestD) {
                bestD = d;
                best = w;
            }
        }
    }
    return best;
}

function deleteSelectedWire() {
    if (!selectedWireId) return;
    wires = wires.filter(w => w.id !== selectedWireId);
    selectedWireId = null;
    rebuildUsedJunctionKeys();
    saveState();
    draw();
}

function syncWireCountFromWires() {
    let m = 0;
    for (const w of wires) {
        const r = /^W(\d+)$/.exec(w.id);
        if (r) m = Math.max(m, +r[1]);
    }
    wireCount = m;
}

function pruneWiresForComponent(compId) {
    wires = wires.filter(w => {
        if (!w.fromKey || !w.toKey) return true;
        const a = w.fromKey.split("#")[0];
        const b = w.toKey.split("#")[0];
        return a !== compId && b !== compId;
    });
    rebuildUsedJunctionKeys();
}

function extendWireSegment(anchor, cursorWorld, mode) {
    const cx = Math.round(cursorWorld.x / GRID_SIZE) * GRID_SIZE;
    const cy = Math.round(cursorWorld.y / GRID_SIZE) * GRID_SIZE;
    const ax = anchor.x;
    const ay = anchor.y;
    const out = [];
    if (mode === 0) {
        const p = { x: cx, y: ay };
        if (p.x !== ax || p.y !== ay) out.push(p);
        return out;
    }
    if (mode === 1) {
        const p = { x: ax, y: cy };
        if (p.x !== ax || p.y !== ay) out.push(p);
        return out;
    }
    const dx = cx - ax;
    const dy = cy - ay;
    if (dx === 0 && dy === 0) return [];
    if (dx === 0) {
        out.push({ x: ax, y: cy });
        return out;
    }
    if (dy === 0) {
        out.push({ x: cx, y: ay });
        return out;
    }
    if (Math.abs(dx) >= Math.abs(dy)) {
        out.push({ x: cx, y: ay });
        out.push({ x: cx, y: cy });
    } else {
        out.push({ x: ax, y: cy });
        out.push({ x: cx, y: cy });
    }
    return out;
}

function appendUniquePoints(poly, newPts) {
    for (const p of newPts) {
        const last = poly[poly.length - 1];
        if (!last || last.x !== p.x || last.y !== p.y) poly.push({ x: p.x, y: p.y });
    }
}

function tryCompleteWireOnMouseUp(worldPos) {
    const j = findJunctionNearWorld(worldPos.x, worldPos.y);
    if (!j || !wireDraft || j.key === wireDraft.fromKey) return false;
    const last = wireDraft.points[wireDraft.points.length - 1];
    if (dist(last.x, last.y, j.x, j.y) > hitSlopWorld()) return false;
    finishWire(j);
    return true;
}

function segmentsExcludingDraftVertex(segs, draft) {
    const m = /^__v#([^#]+)#(\d+)$/.exec(draft.fromKey || "");
    if (!m) return segs;
    const wid = m[1];
    const idx = +m[2];
    return segs.filter(s => {
        if (s.wid !== wid) return true;
        if (s.i === idx || s.i + 1 === idx) return false;
        return true;
    });
}

/** Si le brouillon croise un fil existant en T : coupe au T, termine le fil (jonction __t). */
function tryFinishDraftWireAtTee() {
    if (!wireDraft || wireDraft.points.length < 2) return false;
    let oldSegs = collectWireSegments();
    oldSegs = segmentsExcludingDraftVertex(oldSegs, wireDraft);
    if (!oldSegs.length) return false;

    const pts = wireDraft.points;
    let best = null;
    let distAcc = 0;

    for (let i = 1; i < pts.length; i++) {
        const A = pts[i - 1],
            B = pts[i];
        if (sameXY(A, B)) continue;
        const segLen = Math.abs(B.x - A.x) + Math.abs(B.y - A.y);

        for (const s of oldSegs) {
            const I = orthogonalIntersectSegments(A, B, s.a, s.b);
            if (!I) continue;
            if (!onSegmentClosed(I, A, B) || !onSegmentClosed(I, s.a, s.b)) continue;
            const inNew = strictInteriorOnSegment(I, A, B);
            const inOld = strictInteriorOnSegment(I, s.a, s.b);
            if (!inNew && !inOld) continue;
            const dAI = Math.abs(I.x - A.x) + Math.abs(I.y - A.y);
            if (dAI < W_EPS) continue;
            if (dAI > segLen + W_EPS) continue;
            const dTotal = distAcc + dAI;
            if (!best || dTotal < best.dTotal - W_EPS || (Math.abs(dTotal - best.dTotal) < W_EPS && i < best.i)) {
                best = { dTotal, i, I: { x: I.x, y: I.y } };
            }
        }
        distAcc += segLen;
    }

    if (!best) return false;

    const i = best.i;
    const I = best.I;
    const head = pts.slice(0, i);
    if (!sameXY(head[head.length - 1], I)) head.push({ x: I.x, y: I.y });
    wireDraft.points = head;

    finishWire({ x: I.x, y: I.y, key: teeVirtualKey(I.x, I.y) });
    return true;
}

function finishWire(endJ) {
    if (!wireDraft) return;
    const full = wireDraft.points.map(p => ({ x: p.x, y: p.y }));
    const la = full[full.length - 1];
    if (!sameXY(la, endJ)) full.push({ x: endJ.x, y: endJ.y });
    wires.push({
        id: `W${++wireCount}`,
        solid: true,
        fromKey: wireDraft.fromKey,
        toKey: endJ.key,
        points: full
    });
    wireDraft = null;
    isWireDrag = false;
    rebuildUsedJunctionKeys();
    saveState();
}

/** Enregistre le brouillon dans `wires` avec une borne virtuelle au dernier point (évite de tout perdre en commençant un autre fil). */
function commitDraftWireAsFloatingEnd() {
    if (!wireDraft || wireDraft.points.length < 2) return;
    const last = wireDraft.points[wireDraft.points.length - 1];
    finishWire({ x: last.x, y: last.y, key: floatingEndKey(last.x, last.y) });
}

function drawWiresLayer() {
    ctx.strokeStyle = getEditorColors().wire;
    ctx.lineWidth = 2 / scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const dash = [8 / scale, 6 / scale];

    for (const w of wires) {
        if (!w.points || w.points.length < 2) continue;
        const sel = w.id === selectedWireId;
        ctx.strokeStyle = sel ? "#ff9800" : getEditorColors().wire;
        ctx.lineWidth = sel ? 3.5 / scale : 2 / scale;
        ctx.beginPath();
        ctx.setLineDash([]);
        ctx.moveTo(w.points[0].x, w.points[0].y);
        for (let i = 1; i < w.points.length; i++) ctx.lineTo(w.points[i].x, w.points[i].y);
        ctx.stroke();
    }
    ctx.strokeStyle = getEditorColors().wire;
    ctx.lineWidth = 2 / scale;

    if (wireDraft && wireDraft.points.length) {
        const pts = wireDraft.points;
        /* Fil déjà posé (relâchements) : plein — y compris jusqu’à un T / coude. */
        if (pts.length >= 2) {
            ctx.beginPath();
            ctx.setLineDash([]);
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.stroke();
        }
        /* Prévisualisation depuis le dernier point : seulement en pointillés. */
        if (isWireDrag) {
            const anchor = pts[pts.length - 1];
            const segs = extendWireSegment(anchor, lastWorldMouse, WIRE_EXTEND_MODE);
            ctx.beginPath();
            ctx.setLineDash(dash);
            ctx.moveTo(anchor.x, anchor.y);
            for (const s of segs) ctx.lineTo(s.x, s.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }
}

function init() {
    loadEditorDisplayPrefs();
    applyEditorThemeToPage();
    updateGridToggleLabel();

    window.addEventListener('resize', resize);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    
    // Drag & Drop
    canvas.addEventListener('dragenter', e => { e.preventDefault(); });
    canvas.addEventListener('dragover', handleCanvasDragOver);
    canvas.addEventListener('dragleave', handleCanvasDragLeave);
    canvas.addEventListener('drop', handleDrop);
    window.addEventListener('dragend', handleWindowDragEnd);
    
    // Souris / pointeur
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('dblclick', handleCanvasDblClick);
    initValueEditor();
    window.addEventListener('mousemove', handleMouseMove);
    /* pointerup seul (évite double fin si mouseup + pointerup). */
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('blur', () => {
        cancelCanvasInteractionState();
        releaseCanvasPointerCapture();
    });
    canvas.addEventListener('wheel', handleZoom, { passive: false });

    const workarea = document.getElementById("editor-workarea");
    const simPanel = document.getElementById("sim-panel");
    if (typeof ResizeObserver !== "undefined") {
        const layoutRo = new ResizeObserver(() => resize());
        if (workarea) layoutRo.observe(workarea);
        if (simPanel) layoutRo.observe(simPanel);
    }
    
    // Clavier
    window.addEventListener('keydown', handleKeyDown, true);

    const runBtn = document.getElementById("runBtn");
    if (runBtn) {
        runBtn.addEventListener("mousedown", e => {
            if (e.button === 0) cancelCanvasInteractionState();
        });
        runBtn.addEventListener("click", () => runSimulation());
    }

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

function escapeHtmlSim(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** Affichage lisible V / A / mA / mV selon l’ordre de grandeur. */
function formatValueWithUnit(value, baseUnit) {
    const v = Number(value);
    if (!Number.isFinite(v)) return "—";
    const av = Math.abs(v);
    if (baseUnit === "A") {
        if (av < 1e-6) return `${(v * 1e9).toFixed(3)} nA`;
        if (av < 1e-3) return `${(v * 1e6).toFixed(3)} µA`;
        if (av < 1) return `${(v * 1e3).toFixed(3)} mA`;
        return `${v.toFixed(4)} A`;
    }
    if (baseUnit === "V") {
        if (av < 1e-3) return `${(v * 1e6).toFixed(3)} µV`;
        if (av < 1) return `${(v * 1e3).toFixed(3)} mV`;
        return `${v.toFixed(4)} V`;
    }
    if (baseUnit === "Ohm" || baseUnit === "Ω") {
        if (av >= 1e6) return `${(v / 1e6).toFixed(3)} MΩ`;
        if (av >= 1e3) return `${(v / 1e3).toFixed(3)} kΩ`;
        return `${v.toFixed(2)} Ω`;
    }
    return `${v.toFixed(4)} ${baseUnit}`;
}

function instrumentDisplayLetter(type) {
    if (type === "voltmeter") return "V";
    if (type === "ammeter") return "A";
    if (type === "ohmmeter") return "Ω";
    return "?";
}

/** Annule fil en cours / déplacement / panoramique sur le canevas uniquement.
 *  Ne touche pas au drag palette (activeDragType) : une simulation qui se termine pendant un glisser-déposer
 *  cassait sinon le dépôt de composants. */
function cancelCanvasInteractionState() {
    wireDraft = null;
    isWireDrag = false;
    isMovingComponent = false;
    isDraggingView = false;
    dragStartClient = null;
}

/** Fin / annulation du drag depuis le menu composants (sans toucher au fil en cours). */
function resetPaletteDragState() {
    activeDragType = null;
    dragPreview = null;
    document.querySelectorAll(".menu-item.dropdown-pinned").forEach(el => {
        el.classList.remove("dropdown-pinned");
    });
    removePaletteDragCanvas();
}

function beginCanvasPointerCapture(e) {
    if (!canvas || e == null || e.pointerId == null) return;
    try {
        canvas.setPointerCapture(e.pointerId);
        canvasPointerId = e.pointerId;
    } catch (_) {}
}

function releaseCanvasPointerCapture(e) {
    const pid = e != null && e.pointerId != null ? e.pointerId : canvasPointerId;
    if (!canvas || pid == null) {
        canvasPointerId = null;
        return;
    }
    try {
        if (canvas.hasPointerCapture(pid)) canvas.releasePointerCapture(pid);
    } catch (_) {}
    canvasPointerId = null;
}

/** Après simulation : canevas + jonctions + menu palette remis en état exploitable. */
function restoreEditorAfterSimulation() {
    closeValueEditor();
    cancelCanvasInteractionState();
    resetPaletteDragState();
    rebuildUsedJunctionKeys();
    releaseCanvasPointerCapture();
    requestAnimationFrame(() => {
        resize();
        draw();
    });
}

function isMouseEventTargetInEditorWorkarea(e) {
    return !!(canvas && e && e.target && canvas.parentElement && canvas.parentElement.contains(e.target));
}

async function runSimulation() {
    const bodyEl = document.getElementById("sim-panel-body");
    const runBtn = document.getElementById("runBtn");
    if (!bodyEl) return;
    restoreEditorAfterSimulation();
    bodyEl.innerHTML = "<p class=\"sim-loading\">⏳ Simulation en cours…</p>";
    if (runBtn) {
        runBtn.disabled = true;
        runBtn.textContent = "⏳ …";
    }
    try {
        const raw = JSON.parse(getCircuitJson());
        const state = { components: raw.components || [], wires: raw.wires || [] };
        const res = await fetch("/api/simulate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ state, gridStep: GRID_SIZE }),
        });
        const data = await res.json().catch(() => ({}));
        if (!data.ok) {
            const err = (data.errors && data.errors.join("\n")) || data.message || `Erreur HTTP ${res.status}`;
            bodyEl.innerHTML = `<pre class="sim-error">${escapeHtmlSim(err)}</pre>`;
            return;
        }
        const vm = data.voltmeterValues || {};
        const vmIds = Array.isArray(data.voltmeterIds) ? data.voltmeterIds : Object.keys(vm);
        const vmNodes = Array.isArray(data.voltmeterNodes) ? data.voltmeterNodes : [];
        const vmNodeById = Object.fromEntries(vmNodes.map(x => [x.id, x]));
        const vmKeys = Object.keys(vm);

        const am = data.ammeterValues || {};
        const amIds = Array.isArray(data.ammeterIds) ? data.ammeterIds : Object.keys(am);
        const amMeta = Array.isArray(data.ammeterBranches) ? data.ammeterBranches : [];
        const amMetaById = Object.fromEntries(amMeta.map(x => [x.id, x]));
        const amKeys = Object.keys(am);

        const om = data.ohmmeterValues || {};
        const omIds = Array.isArray(data.ohmmeterIds) ? data.ohmmeterIds : Object.keys(om);
        const omMeta = Array.isArray(data.ohmmeterNodes) ? data.ohmmeterNodes : [];
        const omMetaById = Object.fromEntries(omMeta.map(x => [x.id, x]));
        const omKeys = Object.keys(om);

        let html = "";
        if (vmIds.length === 0 && amIds.length === 0 && omIds.length === 0) {
            html +=
                "<p class=\"sim-muted\">Aucun appareil de mesure (voltmètre, ampèremètre ou ohmmètre).</p>";
        } else {
            if (vmIds.length > 0) {
                if (vmKeys.length === 0) {
                    html +=
                        "<p class=\"sim-muted\">Tensions voltmètre non reconnues dans le journal ngspice (câblage ou connexion à la pile).</p>";
                } else {
                    html +=
                        "<h4 class=\"sim-subtitle\">Voltmètres</h4><table class=\"sim-table\"><thead><tr><th>Id</th><th>Nœuds</th><th>Tension</th></tr></thead><tbody>";
                    for (const id of vmIds) {
                        const row = vm[id];
                        const v = row && typeof row.voltage === "number" ? row.voltage : NaN;
                        const txt = Number.isFinite(v) ? formatValueWithUnit(v, "V") : "—";
                        const nodes = vmNodeById[id] || row || {};
                        const nodeTxt =
                            nodes.nodePlus && nodes.nodeMinus
                                ? `${nodes.nodePlus} → ${nodes.nodeMinus}`
                                : "—";
                        html += `<tr><td>${escapeHtmlSim(id)}</td><td>${escapeHtmlSim(nodeTxt)}</td><td>${escapeHtmlSim(txt)}</td></tr>`;
                    }
                    html += "</tbody></table>";
                }
            }
            if (amIds.length > 0) {
                if (amKeys.length === 0) {
                    html +=
                        "<p class=\"sim-muted\">Courants ampèremètre non reconnus : branchez l’ampèremètre <strong>en série</strong> dans la branche à mesurer (deux fils distincts).</p>";
                } else {
                    html +=
                        "<h4 class=\"sim-subtitle\">Ampèremètres</h4><table class=\"sim-table\"><thead><tr><th>Id</th><th>Branche</th><th>Courant</th></tr></thead><tbody>";
                    for (const id of amIds) {
                        const row = am[id];
                        const i = row && typeof row.current === "number" ? row.current : NaN;
                        const txt = Number.isFinite(i) ? formatValueWithUnit(i, "A") : "—";
                        const meta = amMetaById[id] || row || {};
                        const branchTxt = meta.branch ? String(meta.branch) : "—";
                        html += `<tr><td>${escapeHtmlSim(id)}</td><td>${escapeHtmlSim(branchTxt)}</td><td>${escapeHtmlSim(txt)}</td></tr>`;
                    }
                    html += "</tbody></table>";
                }
            }
            if (omIds.length > 0) {
                if (omKeys.length === 0) {
                    html +=
                        "<p class=\"sim-muted\">Résistances ohmmètre non reconnues : reliez les deux bornes aux extrémités du réseau de résistances à mesurer.</p>";
                } else {
                    html +=
                        "<h4 class=\"sim-subtitle\">Ohmmètres</h4><table class=\"sim-table\"><thead><tr><th>Id</th><th>Nœuds</th><th>Résistance</th></tr></thead><tbody>";
                    for (const id of omIds) {
                        const row = om[id];
                        const r = row && typeof row.resistance === "number" ? row.resistance : NaN;
                        const txt = Number.isFinite(r) ? formatValueWithUnit(r, "Ω") : "—";
                        const meta = omMetaById[id] || row || {};
                        const nodeTxt =
                            meta.nodePlus && meta.nodeMinus
                                ? `${meta.nodePlus} → ${meta.nodeMinus}`
                                : "—";
                        html += `<tr><td>${escapeHtmlSim(id)}</td><td>${escapeHtmlSim(nodeTxt)}</td><td>${escapeHtmlSim(txt)}</td></tr>`;
                    }
                    html += "</tbody></table>";
                }
            }
        }
        if (Array.isArray(data.warnings) && data.warnings.length) {
            html += `<p class=\"sim-warn\">${escapeHtmlSim(data.warnings.join(" "))}</p>`;
        }
        html +=
            "<details class=\"sim-details\"><summary>Diagnostic SPICE</summary><pre class=\"sim-log-snippet\">" +
            escapeHtmlSim(`--- NETLIST ---\n${data.netlist || ""}\n\n--- JOURNAL NGSPICE ---\n${(data.log || "").slice(-3500)}`) +
            "</pre></details>";
        bodyEl.innerHTML = html;
    } catch (e) {
        bodyEl.innerHTML = `<pre class="sim-error">${escapeHtmlSim(e && e.message ? e.message : String(e))}</pre>`;
    } finally {
        restoreEditorAfterSimulation();
        if (runBtn) {
            runBtn.disabled = false;
            runBtn.textContent = "🚀 Lancer la Simulation";
        }
    }
}

function isTwoTerminalType(t) {
    return t === "resistor" || t === "vsource" || t === "voltmeter" || t === "ammeter" || t === "ohmmeter";
}

function isInstrumentType(t) {
    return t === "voltmeter" || t === "ammeter" || t === "ohmmeter";
}

function isValueEditableType(t) {
    return t === "resistor" || t === "vsource";
}

function worldToScreen(wx, wy) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: rect.left + offset.x + wx * scale,
        y: rect.top + offset.y + wy * scale,
    };
}

/** Zone cliquable autour de l’étiquette de valeur (R, E). */
function getValueLabelHitRect(c) {
    const w = c.vertical ? GRID_SIZE : GRID_SIZE * 3;
    const h = c.vertical ? GRID_SIZE * 3 : GRID_SIZE;
    const tw = 80;
    const th = 26;
    if (c.vertical) {
        return {
            x: c.x + w + LABEL_PAD - 6,
            y: c.y + h / 2 - th / 2,
            w: tw,
            h: th,
        };
    }
    return {
        x: c.x + w / 2 - tw / 2,
        y: c.y + h + 6,
        w: tw,
        h: th,
    };
}

function findValueLabelHit(wx, wy) {
    for (let i = components.length - 1; i >= 0; i--) {
        const c = components[i];
        if (!isValueEditableType(c.type)) continue;
        const r = getValueLabelHitRect(c);
        if (wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.h) return c;
    }
    return null;
}

function parseResistorValueInput(raw) {
    let t = String(raw || "").trim().toLowerCase().replace(/\s/g, "").replace(",", ".");
    if (!t) return { ok: false };
    let mult = 1;
    if (t.endsWith("meg")) {
        mult = 1e6;
        t = t.slice(0, -3);
    } else if (t.endsWith("k")) {
        mult = 1e3;
        t = t.slice(0, -1);
    } else if (t.endsWith("m") && /^\d/.test(t.slice(0, -1))) {
        mult = 1e-3;
        t = t.slice(0, -1);
    } else if (t.endsWith("ohm") || t.endsWith("ω")) {
        t = t.replace(/ohm$/, "").replace(/ω$/, "");
    }
    const n = parseFloat(t);
    if (!Number.isFinite(n) || n <= 0) return { ok: false };
    const ohms = n * mult;
    let display = t;
    if (mult === 1e6) display = `${n}meg`;
    else if (mult === 1e3) display = `${n}k`;
    else if (mult === 1e-3) display = `${n}m`;
    else display = String(n).replace(/\.0+$/, "");
    return { ok: true, display };
}

function parseVsourceValueInput(raw) {
    const t = String(raw || "").trim().replace(/\s/g, "").replace(",", ".");
    if (!t) return { ok: false };
    const m = /^([-+]?[\d.]+)\s*v?$/i.exec(t);
    const n = m ? parseFloat(m[1]) : parseFloat(t.replace(/v$/i, ""));
    if (!Number.isFinite(n)) return { ok: false };
    const display = `${n}`.replace(/\.0+$/, "") + "V";
    return { ok: true, display };
}

function closeValueEditor() {
    const editor = document.getElementById("comp-value-editor");
    const input = document.getElementById("comp-value-input");
    valueEditorCompId = null;
    if (editor) editor.hidden = true;
    if (input) {
        input.classList.remove("invalid");
        input.onkeydown = null;
        input.onblur = null;
    }
}

function positionValueEditorForComponent(comp) {
    const editor = document.getElementById("comp-value-editor");
    const input = document.getElementById("comp-value-input");
    if (!editor || !input || !comp) return;
    const w = comp.vertical ? GRID_SIZE : GRID_SIZE * 3;
    const h = comp.vertical ? GRID_SIZE * 3 : GRID_SIZE;
    let wx;
    let wy;
    if (comp.vertical) {
        wx = comp.x + w + LABEL_PAD + 36;
        wy = comp.y + h / 2;
    } else {
        wx = comp.x + w / 2;
        wy = comp.y + h + 22;
    }
    const pt = worldToScreen(wx, wy);
    editor.style.left = `${pt.x}px`;
    editor.style.top = `${pt.y}px`;
}

function openValueEditor(comp) {
    if (!comp || !isValueEditableType(comp.type)) return;
    const editor = document.getElementById("comp-value-editor");
    const input = document.getElementById("comp-value-input");
    if (!editor || !input) return;
    closeValueEditor();
    valueEditorCompId = comp.id;
    selectedId = comp.id;
    input.value = comp.value != null ? String(comp.value) : comp.type === "resistor" ? "1k" : "5V";
    input.placeholder = comp.type === "resistor" ? "ex: 1k, 470, 2.2meg" : "ex: 5V, 12";
    input.classList.remove("invalid");
    positionValueEditorForComponent(comp);
    editor.hidden = false;
    input.onkeydown = e => {
        if (e.key === "Enter") {
            e.preventDefault();
            commitValueEditor();
        } else if (e.key === "Escape") {
            e.preventDefault();
            closeValueEditor();
            draw();
        }
    };
    input.onblur = () => {
        window.setTimeout(() => {
            if (valueEditorCompId) commitValueEditor();
        }, 0);
    };
    input.focus();
    input.select();
}

function commitValueEditor() {
    if (!valueEditorCompId) return;
    const comp = components.find(c => c.id === valueEditorCompId);
    const input = document.getElementById("comp-value-input");
    if (!comp || !input) {
        closeValueEditor();
        return;
    }
    const parsed =
        comp.type === "resistor" ? parseResistorValueInput(input.value) : parseVsourceValueInput(input.value);
    if (!parsed.ok) {
        input.classList.add("invalid");
        input.focus();
        return;
    }
    comp.value = parsed.display;
    closeValueEditor();
    saveState();
    draw();
}

function initValueEditor() {
    const input = document.getElementById("comp-value-input");
    if (!input) return;
    input.addEventListener("mousedown", e => e.stopPropagation());
}

/** Symbole circulaire voltmètre (V) ou ampèremètre (A), horizontal ou vertical. */
function drawCircleInstrument(ctx, letter, w, h, vertical) {
    const r = 18;
    if (vertical) {
        const midX = w / 2;
        ctx.beginPath();
        ctx.moveTo(midX, 0);
        ctx.lineTo(midX, h / 2 - r);
        ctx.moveTo(midX, h / 2 + r);
        ctx.lineTo(midX, h);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(midX, h / 2, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(letter, midX, h / 2);
        ctx.textBaseline = "alphabetic";
    } else {
        const midY = h / 2;
        ctx.beginPath();
        ctx.moveTo(0, midY);
        ctx.lineTo(w / 2 - r, midY);
        ctx.moveTo(w / 2 + r, midY);
        ctx.lineTo(w, midY);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(w / 2, midY, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(letter, w / 2, midY);
        ctx.textBaseline = "alphabetic";
    }
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
    } else if (type === "voltmeter" || type === "ammeter" || type === "ohmmeter") {
        g.strokeStyle =
            type === "voltmeter" ? "#4DB6AC" : type === "ammeter" ? "#CE93D8" : "#FFB74D";
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
        g.fillText(instrumentDisplayLetter(type), cx, mid + 4);
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
    resetPaletteDragState();
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

    if (type === "resistor" || type === "vsource" || type === "voltmeter" || type === "ammeter" || type === "ohmmeter") {
        const snapped = snapTwoTerminalDropWorld(worldPos.x, worldPos.y, false);
        let id;
        let value;
        if (type === "resistor") {
            id = `R${++resistorCount}`;
            value = "1k";
        } else if (type === "vsource") {
            id = `E${++vsourceCount}`;
            value = "5V";
        } else if (type === "voltmeter") {
            id = `V${++voltmeterCount}`;
            value = "";
        } else if (type === "ammeter") {
            id = `A${++ammeterCount}`;
            value = "";
        } else {
            id = `O${++ohmmeterCount}`;
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
    const bg = getEditorColors().canvas;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    drawGrid();
    drawWiresLayer();
    drawWireAuxiliaryJunctions();
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
                      : isInstrumentType(dragPreview.type)
                        ? ""
                        : "",
            vertical: dragPreview.vertical
        };
        renderComponent(ghost, { ghost: true });
        ctx.globalAlpha = 1;
    }

    ctx.restore();
}

function drawGrid() {
    if (!showEditorGrid) return;
    const left = -offset.x / scale;
    const top = -offset.y / scale;
    const right = (width - offset.x) / scale;
    const bottom = (height - offset.y) / scale;
    ctx.beginPath();
    ctx.strokeStyle = getEditorColors().grid;
    ctx.lineWidth = 1/scale;
    for (let x = Math.floor(left/GRID_SIZE)*GRID_SIZE; x < right; x+=GRID_SIZE) {
        ctx.moveTo(x, top); ctx.lineTo(x, bottom);
    }
    for (let y = Math.floor(top/GRID_SIZE)*GRID_SIZE; y < bottom; y+=GRID_SIZE) {
        ctx.moveTo(left, y); ctx.lineTo(right, y);
    }
    ctx.stroke();
}

function drawJunctions(markedPoints) {
    const r = 5;
    ctx.fillStyle = "#e53935";
    ctx.strokeStyle = "#b71c1c";
    ctx.lineWidth = 1 / scale;
    for (const pt of markedPoints) {
        if (pt.key && usedJunctionKeys.has(pt.key)) continue;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }
}

/** Point rouge au bout du fil non terminé : uniquement après relâchement (pas pendant le tirage). */
function getDraftWireOpenEndForMarker() {
    if (!wireDraft || !wireDraft.points.length) return null;
    if (isWireDrag) return null;
    if (wireDraft.points.length === 1) return null;
    return wireDraft.points[wireDraft.points.length - 1];
}

function drawSingleJunctionWorld(x, y) {
    const r = 5;
    ctx.beginPath();
    ctx.fillStyle = "#e53935";
    ctx.strokeStyle = "#b71c1c";
    ctx.lineWidth = 1 / scale;
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
}

/** Jonctions rouges : T entre fils, extrémités __p, bout du brouillon — pas sur les simples coudes d’un fil. */
function drawWireAuxiliaryJunctions() {
    for (const p of teeWirePoints) {
        drawSingleJunctionWorld(p.x, p.y);
    }
    for (const w of wires) {
        if (!w.solid || !w.points || w.points.length < 2) continue;
        for (const key of [w.fromKey, w.toKey]) {
            if (!key || !key.startsWith("__p#")) continue;
            const pt = key === w.fromKey ? w.points[0] : w.points[w.points.length - 1];
            drawSingleJunctionWorld(pt.x, pt.y);
        }
    }
    const d = getDraftWireOpenEndForMarker();
    if (d) drawSingleJunctionWorld(d.x, d.y);
}

function drawComponentLabels(ctx, c, w, h, isVertical) {
    if (!c.id) return;
    ctx.fillStyle = getEditorColors().compLabel;
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
    else if (c.type === "ammeter") ctx.strokeStyle = "#CE93D8";
    else if (c.type === "ohmmeter") ctx.strokeStyle = "#FFB74D";
    else ctx.strokeStyle = "#4CAF50";

    ctx.lineWidth = 2 / scale;
    ctx.fillStyle = getEditorColors().compLabel;
    ctx.font = `${14 / scale}px Segoe UI`;

    let junctA, junctB;
    ctx.save();
    ctx.translate(c.x, c.y);

    if (c.vertical) {
        const h = GRID_SIZE * 3, w = GRID_SIZE;
        const midX = w/2;
        if (isInstrumentType(c.type)) {
            drawCircleInstrument(ctx, instrumentDisplayLetter(c.type), w, h, true);
        } else if (c.type === "vsource") {
            const gap = 5;
            ctx.beginPath(); ctx.moveTo(midX, 0); ctx.lineTo(midX, h/2 - gap); ctx.moveTo(midX, h/2 + gap); ctx.lineTo(midX, h); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(w*0.05, h/2 - gap); ctx.lineTo(w*0.95, h/2 - gap); ctx.moveTo(w*0.25, h/2 + gap); ctx.lineTo(w*0.75, h/2 + gap); ctx.stroke();
        } else {
            ctx.beginPath(); ctx.moveTo(midX, 0); ctx.lineTo(midX, h*0.25); ctx.moveTo(midX, h*0.75); ctx.lineTo(midX, h); ctx.stroke();
            ctx.strokeRect(w/4, h*0.25, w/2, h/2);
        }
        junctA = { x: c.x + midX, y: c.y, key: `${c.id}#0` };
        junctB = { x: c.x + midX, y: c.y + h, key: `${c.id}#1` };
        if (!ghost) drawComponentLabels(ctx, c, w, h, true);
    } else {
        const w = GRID_SIZE * 3, h = GRID_SIZE;
        const midY = h/2;
        if (isInstrumentType(c.type)) {
            drawCircleInstrument(ctx, instrumentDisplayLetter(c.type), w, h, false);
        } else if (c.type === "vsource") {
            const gap = 5;
            ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(w/2 - gap, midY); ctx.moveTo(w/2 + gap, midY); ctx.lineTo(w, midY); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(w/2 - gap, h*0.05); ctx.lineTo(w/2 - gap, h*0.95); ctx.moveTo(w/2 + gap, h*0.3); ctx.lineTo(w/2 + gap, h*0.7); ctx.stroke();
        } else {
            ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(w*0.25, midY); ctx.moveTo(w*0.75, midY); ctx.lineTo(w, midY); ctx.stroke();
            ctx.strokeRect(w*0.25, h/4, w/2, h/2);
        }
        junctA = { x: c.x, y: c.y + midY, key: `${c.id}#0` };
        junctB = { x: c.x + w, y: c.y + midY, key: `${c.id}#1` };
        if (!ghost) drawComponentLabels(ctx, c, w, h, false);
    }

    ctx.restore();
    drawJunctions([junctA, junctB]);
}

// --- MOUVEMENT & SELECTION ---
function startWireFromJunction(jHit) {
    if (wireDraft && wireDraft.fromKey !== jHit.key && wireDraft.points.length >= 1) {
        const last = wireDraft.points[wireDraft.points.length - 1];
        const close = dist(last.x, last.y, jHit.x, jHit.y) <= hitSlopWorld();
        if (close) {
            finishWire(jHit);
            return;
        }
        if (wireDraft.points.length >= 2) {
            commitDraftWireAsFloatingEnd();
        }
    }
    wireDraft = { fromKey: jHit.key, points: [{ x: jHit.x, y: jHit.y }] };
    isWireDrag = true;
    selectedId = null;
    isMovingComponent = false;
}

function handleCanvasDblClick(e) {
    if (valueEditorCompId) return;
    const worldPos = screenToWorld(e.clientX, e.clientY);
    const hitComp = findTopComponentAtWorld(worldPos.x, worldPos.y);
    if (!hitComp || !isValueEditableType(hitComp.type)) return;
    if (findComponentTerminalNearWorld(hitComp, worldPos.x, worldPos.y)) return;
    e.preventDefault();
    openValueEditor(hitComp);
}

function handleMouseDown(e) {
    if (valueEditorCompId && !e.target.closest("#comp-value-editor")) {
        commitValueEditor();
    }

    const worldPos = screenToWorld(e.clientX, e.clientY);

    if (e.button === 0) {
        const valueHit = findValueLabelHit(worldPos.x, worldPos.y);
        if (valueHit) {
            e.preventDefault();
            openValueEditor(valueHit);
            return;
        }

        const hitComp = findTopComponentAtWorld(worldPos.x, worldPos.y);
        if (hitComp) {
            const term = findComponentTerminalNearWorld(hitComp, worldPos.x, worldPos.y);
            if (!term) {
                selectedId = hitComp.id;
                selectedWireId = null;
                isMovingComponent = true;
                lastMousePos = worldPos;
                dragStartClient = { x: e.clientX, y: e.clientY };
                beginCanvasPointerCapture(e);
                draw();
                return;
            }
            startWireFromJunction(term);
            beginCanvasPointerCapture(e);
            draw();
            return;
        }

        const wireHit = findWireNearWorld(worldPos.x, worldPos.y);
        if (wireHit) {
            selectedWireId = wireHit.id;
            selectedId = null;
            draw();
            return;
        }

        const jHit = findJunctionNearWorld(worldPos.x, worldPos.y);
        if (jHit) {
            selectedWireId = null;
            startWireFromJunction(jHit);
            beginCanvasPointerCapture(e);
            draw();
            return;
        }

        selectedId = null;
        selectedWireId = null;
        if (wireDraft) isWireDrag = true;
    } else if (e.button === 2) {
        isDraggingView = true;
        lastMousePos = { x: e.clientX, y: e.clientY };
        beginCanvasPointerCapture(e);
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
        if (valueEditorCompId === comp.id) positionValueEditorForComponent(comp);
        draw();
    } else if (isDraggingView) {
        offset.x += e.clientX - lastMousePos.x;
        offset.y += e.clientY - lastMousePos.y;
        lastMousePos = { x: e.clientX, y: e.clientY };
        draw();
    } else if (isWireDrag && wireDraft) {
        draw();
    }

    const onWire = findWireNearWorld(worldPos.x, worldPos.y);
    const onJunc = findJunctionNearWorld(worldPos.x, worldPos.y);
    if (onJunc) canvas.style.cursor = "crosshair";
    else if (onWire) canvas.style.cursor = "pointer";
    else canvas.style.cursor = "default";
}

function handlePointerUp(e) {
    if (e.button !== 0 && e.button !== 2) return;

    const worldPos = screenToWorld(e.clientX, e.clientY);
    if (e.button === 0 && isWireDrag && wireDraft && !isMovingComponent) {
        if (!isMouseEventTargetInEditorWorkarea(e)) {
            isWireDrag = false;
            wireDraft = null;
        } else {
            const anchor = wireDraft.points[wireDraft.points.length - 1];
            const newPts = extendWireSegment(anchor, worldPos, WIRE_EXTEND_MODE);
            appendUniquePoints(wireDraft.points, newPts);
            isWireDrag = false;
            if (!tryCompleteWireOnMouseUp(worldPos)) {
                tryFinishDraftWireAtTee();
            }
        }
    }
    if (e.button === 0 && isMovingComponent && selectedId) {
        const comp = components.find(c => c.id === selectedId);
        const moved =
            dragStartClient && Math.hypot(e.clientX - dragStartClient.x, e.clientY - dragStartClient.y) > 6;
        if (comp && !moved && isValueEditableType(comp.type)) {
            const worldPos = screenToWorld(e.clientX, e.clientY);
            if (!findComponentTerminalNearWorld(comp, worldPos.x, worldPos.y)) {
                isMovingComponent = false;
                dragStartClient = null;
                releaseCanvasPointerCapture(e);
                openValueEditor(comp);
                draw();
                return;
            }
        }
        if (comp) {
            if (isTwoTerminalType(comp.type)) snapTwoTerminalComponent(comp);
            else {
                comp.x = Math.round(comp.x / GRID_SIZE) * GRID_SIZE;
                comp.y = Math.round(comp.y / GRID_SIZE) * GRID_SIZE;
            }
            saveState();
        }
    }
    isMovingComponent = false;
    isDraggingView = false;
    dragStartClient = null;
    releaseCanvasPointerCapture(e);
    draw();
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
    else if (clipboard.type === "voltmeter") id = `V${++voltmeterCount}`;
    else if (clipboard.type === "ammeter") id = `A${++ammeterCount}`;
    else id = `O${++ohmmeterCount}`;
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
    const t = e.target;
    if (t) {
        if (t.isContentEditable || (t.closest && t.closest("[contenteditable=true]"))) return;
        const tag = String(t.tagName || "").toUpperCase();
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "OPTION") return;
    }
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
    if ((e.key === "Delete" || e.key === "Backspace") && !isCtrl) {
        if (selectedWireId) {
            e.preventDefault();
            deleteSelectedWire();
            return;
        }
        if (selectedId) {
            e.preventDefault();
            const delId = selectedId;
            components = components.filter(c => c.id !== delId);
            pruneWiresForComponent(delId);
            selectedId = null;
            syncCountersFromComponents();
            saveState();
            draw();
        }
    }
    if (e.key === "Escape") {
        if (valueEditorCompId) {
            closeValueEditor();
            draw();
            return;
        }
        if (wireDraft) {
            wireDraft = null;
            isWireDrag = false;
            draw();
        }
    }
}

function saveState() {
    history.push(JSON.stringify({ components, wires }));
    if (history.length > 30) history.shift();
    redoStack = [];
}

function applyParsedSchematic(jsonStr) {
    const data = JSON.parse(jsonStr);
    if (Array.isArray(data)) {
        components = data;
        wires = [];
    } else {
        components = data.components || [];
        wires = data.wires || [];
    }
    syncCountersFromComponents();
    syncWireCountFromWires();
    rebuildUsedJunctionKeys();
}

function undo() {
    if (history.length > 1) {
        redoStack.push(history.pop());
        applyParsedSchematic(history[history.length - 1]);
        draw();
    }
}

function redo() {
    if (redoStack.length > 0) {
        const state = redoStack.pop();
        history.push(state);
        applyParsedSchematic(state);
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

function getCircuitJson() {
    return JSON.stringify({ version: 2, components, wires }, null, 2);
}

function syncCountersFromComponents() {
    let maxR = 0, maxE = 0, maxV = 0, maxA = 0, maxO = 0;
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
        m = /^A(\d+)$/.exec(c.id);
        if (m) maxA = Math.max(maxA, +m[1]);
        m = /^O(\d+)$/.exec(c.id);
        if (m) maxO = Math.max(maxO, +m[1]);
    }
    resistorCount = maxR;
    vsourceCount = maxE;
    voltmeterCount = maxV;
    ammeterCount = maxA;
    ohmmeterCount = maxO;
}

async function loadCircuitFromText(text) {
    const data = JSON.parse(text);
    if (Array.isArray(data)) {
        components = data.map(x => ({ ...x }));
        wires = [];
    } else if (data && Array.isArray(data.components)) {
        components = data.components.map(x => ({ ...x }));
        wires = (data.wires || []).map(w => ({
            ...w,
            points: Array.isArray(w.points) ? w.points.map(p => ({ x: p.x, y: p.y })) : []
        }));
    } else {
        throw new Error("Format JSON invalide (attendu : tableau de composants ou objet { components, wires }).");
    }
    selectedId = null;
    clipboard = null;
    dragPreview = null;
    wireDraft = null;
    isWireDrag = false;
    syncCountersFromComponents();
    syncWireCountFromWires();
    rebuildUsedJunctionKeys();
}

function resetCircuit() {
    components = [];
    wires = [];
    wireDraft = null;
    isWireDrag = false;
    wireCount = 0;
    selectedId = null;
    clipboard = null;
    dragPreview = null;
    currentFileHandle = null;
    history = [];
    redoStack = [];
    resistorCount = 0;
    vsourceCount = 0;
    voltmeterCount = 0;
    ammeterCount = 0;
    ohmmeterCount = 0;
    selectedWireId = null;
    rebuildUsedJunctionKeys();
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

function resize() {
    const container = document.getElementById("editor-workarea");
    if (!container || !canvas) return;
    width = container.clientWidth;
    height = container.clientHeight;
    canvas.width = width;
    canvas.height = height;
    draw();
}

init();