import {
    createComponent,
    drawComponent,
    getComponentBounds,
    getComponentTerminals,
    getDefaultValue,
    getReferencePrefix,
    isSupportedComponentType
} from "./composants/composants.js";
import {
    buildOrthogonalPath,
    drawOrthogonalPreview,
    drawWire,
    isOrthogonalStraight,
    isSamePoint,
    makeNodeKey,
    normalizeWire
} from "./Engine/fil.js";

const canvas = document.getElementById("gridCanvas");
const ctx = canvas.getContext("2d");
const newProjectDialog = document.getElementById("newProjectDialog");
const openProjectInput = document.getElementById("openProjectInput");
const simDiagnosticsPanel = document.getElementById("simDiagnostics");
const simDiagnosticsTitle = document.getElementById("simDiagnosticsTitle");
const simDiagnosticsList = document.getElementById("simDiagnosticsList");
const simDiagnosticsClear = document.getElementById("simDiagnosticsClear");
let simDiagnosticsAutoHideTimer = null;

const GRID_STEP = 40;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 6;
const ZOOM_FACTOR = 1.1;

let zoom = 1;
let offsetX = 0;
let offsetY = 0;
let isPanning = false;
let activeTool = null;
let draggedComponentId = null;
let isPlacingNewComponent = false;
let components = [];
let wires = [];
let selectedComponentId = null;
let selectedWireId = null;
let draggedWireId = null;
let wireDragStartWorld = null;
let wireDragSnapshot = null;
/** Borne composant fixée au début du drag (coordonnées monde), ou null */
let wireDragLockStart = null;
let wireDragLockEnd = null;
let wireDragSnapshotHorizFirst = null;
let clipboardComponent = null;
let pendingWireStart = null;
let pendingWireEnd = null;
/** Sens du coude (horizontal d'abord) pour le segment courant ; fixe au 1er L puis Espace recalcule selon la souris */
let pendingWireHorizFirst = null;
/** Position monde du pointeur (non snappée), pour choisir quel coude (bx,ay) vs (ax,by) est le plus proche */
let pendingWirePointerWorld = null;
/** Dernier clientX/Y connus (Espace ne déclenche pas mousemove : il faut resynchroniser avant de valider le segment) */
let lastWireClientX = 0;
let lastWireClientY = 0;
let pendingWirePoints = [];
let pasteOffsetStep = 1;
let undoStack = [];
let redoStack = [];
let dragStartState = null;
let currentFileHandle = null;
let nextReferenceByPrefix = {
    R: 1,
    C: 1,
    D: 1,
    L: 1,
    M: 1,
    V: 1,
    A: 1,
    O: 1,
    Q: 1,
    B: 1
};

const MAX_HISTORY = 100;
const COMPONENT_ACTION_TO_TYPE = {
    componentResistance: "resistance",
    componentCapacitor: "capacitor",
    componentDiode: "diode",
    componentInductor: "inductor",
    sourceGround: "ground",
    sourceSupply: "supply",
    sourcePowerTerminal: "powerTerminal",
    deviceVoltmeter: "voltmeter",
    deviceAmmeter: "ammeter",
    deviceOhmmeter: "ohmmeter",
    componentTransistorNpn: "transistorNpn"
};

let lastMouseX = 0;
let lastMouseY = 0;
let draggedMenuComponentType = null;

function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    draw();
}

function worldToScreen(x, y) {
    return {
        x: x * zoom + offsetX,
        y: y * zoom + offsetY
    };
}

function screenToWorld(x, y) {
    return {
        x: (x - offsetX) / zoom,
        y: (y - offsetY) / zoom
    };
}

function snapToGrid(value) {
    return Math.round(value / GRID_STEP) * GRID_STEP;
}

function cloneComponents(list) {
    return list.map((component) => ({ ...component }));
}

function cloneWires(list) {
    return list.map((wire) => ({
        ...wire,
        points: Array.isArray(wire.points)
            ? wire.points.map((point) => ({ x: point.x, y: point.y }))
            : wire.points
    }));
}

function syncReferenceCounters() {
    const maxByPrefix = { R: 0, C: 0, D: 0, L: 0, M: 0, V: 0, A: 0, O: 0, Q: 0, B: 0 };
    components.forEach((component) => {
        if (typeof component.reference !== "string") {
            return;
        }
        const match = /^([RCDLMVAOQB])(\d+)$/i.exec(component.reference.trim());
        if (!match) {
            return;
        }
        const prefix = match[1].toUpperCase();
        const parsed = Number.parseInt(match[2], 10);
        if (Number.isFinite(parsed) && parsed > maxByPrefix[prefix]) {
            maxByPrefix[prefix] = parsed;
        }
    });

    nextReferenceByPrefix = {
        R: maxByPrefix.R + 1,
        C: maxByPrefix.C + 1,
        D: maxByPrefix.D + 1,
        L: maxByPrefix.L + 1,
        M: maxByPrefix.M + 1,
        V: maxByPrefix.V + 1,
        A: maxByPrefix.A + 1,
        O: maxByPrefix.O + 1,
        Q: maxByPrefix.Q + 1,
        B: maxByPrefix.B + 1
    };
}

function createComponentReference(type) {
    if (type === "supply") {
        return "VCC";
    }
    const prefix = getReferencePrefix(type);
    const current = nextReferenceByPrefix[prefix] || 1;
    nextReferenceByPrefix[prefix] = current + 1;
    return `${prefix}${current}`;
}

function normalizeComponent(rawComponent) {
    if (!rawComponent || !isSupportedComponentType(rawComponent.type)) {
        return null;
    }

    if (typeof rawComponent.x !== "number" || typeof rawComponent.y !== "number") {
        return null;
    }

    let value =
        rawComponent.value == null || rawComponent.value === ""
            ? getDefaultValue(rawComponent.type)
            : typeof rawComponent.value === "string"
              ? rawComponent.value
              : typeof rawComponent.value === "number" && Number.isFinite(rawComponent.value)
                ? String(rawComponent.value)
                : getDefaultValue(rawComponent.type);
    if (rawComponent.type === "ground" && /^\s*0\s*V\s*$/i.test(String(value).trim())) {
        value = "GND";
    }

    return {
        id: typeof rawComponent.id === "string" ? rawComponent.id : crypto.randomUUID(),
        type: rawComponent.type,
        x: rawComponent.x,
        y: rawComponent.y,
        rotation: typeof rawComponent.rotation === "number" ? rawComponent.rotation : 0,
        reference: typeof rawComponent.reference === "string"
            ? rawComponent.reference
            : `${getReferencePrefix(rawComponent.type)}?`,
        value
    };
}

function normalizeProjectState(rawState) {
    const componentsList = Array.isArray(rawState.components) ? rawState.components : [];
    const wiresList = Array.isArray(rawState.wires) ? rawState.wires : [];
    const normalizedComponents = componentsList
        .map(normalizeComponent)
        .filter((component) => component !== null);
    const normalizedWires = wiresList
        .map(normalizeWire)
        .filter((wire) => wire !== null);

    const fallbackCountByPrefix = { R: 1, C: 1, D: 1, L: 1, M: 1, V: 1, A: 1, O: 1, Q: 1, B: 1 };
    normalizedComponents.forEach((component) => {
        if (component.type === "supply") {
            const r = (component.reference || "").trim();
            if (!r) {
                component.reference = "VCC";
            }
        } else {
            const prefix = getReferencePrefix(component.type);
            const regex = new RegExp(`^${prefix}\\d+$`, "i");
            if (!regex.test(component.reference || "")) {
                const fallbackIndex = fallbackCountByPrefix[prefix] || 1;
                component.reference = `${prefix}${fallbackIndex}`;
                fallbackCountByPrefix[prefix] = fallbackIndex + 1;
            }
        }
        if (!component.value) {
            component.value = getDefaultValue(component.type);
        }
    });

    return {
        zoom: typeof rawState.zoom === "number" ? rawState.zoom : 1,
        offsetX: typeof rawState.offsetX === "number" ? rawState.offsetX : 0,
        offsetY: typeof rawState.offsetY === "number" ? rawState.offsetY : 0,
        theme: rawState.theme === "white" ? "white" : "dark",
        components: normalizedComponents,
        wires: normalizedWires
    };
}

function captureSceneState() {
    return {
        zoom,
        offsetX,
        offsetY,
        theme: document.body.dataset.theme || "dark",
        components: cloneComponents(components),
        wires: cloneWires(wires)
    };
}

function sceneStatesEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

function pushHistoryState(state) {
    undoStack.push(state);
    if (undoStack.length > MAX_HISTORY) {
        undoStack.shift();
    }
    redoStack = [];
}

function restoreSceneState(state) {
    zoom = typeof state.zoom === "number" ? state.zoom : 1;
    offsetX = typeof state.offsetX === "number" ? state.offsetX : 0;
    offsetY = typeof state.offsetY === "number" ? state.offsetY : 0;
    components = Array.isArray(state.components) ? cloneComponents(state.components) : [];
    wires = Array.isArray(state.wires) ? cloneWires(state.wires) : [];
    syncReferenceCounters();
    selectedComponentId = null;
    selectedWireId = null;
    draggedWireId = null;
    wireDragStartWorld = null;
    wireDragSnapshot = null;
    wireDragLockStart = null;
    wireDragLockEnd = null;
    wireDragSnapshotHorizFirst = null;
    draggedComponentId = null;
    isPlacingNewComponent = false;
    clearPendingWireDraft();
    document.body.dataset.theme = state.theme === "white" ? "white" : "dark";
    draw();
}

function undo() {
    if (undoStack.length === 0) {
        return;
    }

    const currentState = captureSceneState();
    const previousState = undoStack.pop();
    redoStack.push(currentState);
    restoreSceneState(previousState);
}

function redo() {
    if (redoStack.length === 0) {
        return;
    }

    const currentState = captureSceneState();
    const nextState = redoStack.pop();
    undoStack.push(currentState);
    restoreSceneState(nextState);
}

function findComponentAt(worldX, worldY) {
    for (let index = components.length - 1; index >= 0; index -= 1) {
        const component = components[index];
        if (!isSupportedComponentType(component.type)) {
            continue;
        }

        const bounds = getComponentBounds(component, GRID_STEP);
        if (
            worldX >= bounds.left &&
            worldX <= bounds.right &&
            worldY >= bounds.top &&
            worldY <= bounds.bottom
        ) {
            return component;
        }
    }

    return null;
}

function rectBoundsOverlap(a, b) {
    return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

/**
 * true si le composant (position x,y) chevauche la boîte d'un autre composant.
 * Le composant peut ne pas encore être dans `components` (placement).
 */
function componentOverlapsOthersAt(component, x, y) {
    const ox = component.x;
    const oy = component.y;
    component.x = x;
    component.y = y;
    const b = getComponentBounds(component, GRID_STEP);
    component.x = ox;
    component.y = oy;
    for (const other of components) {
        if (other.id === component.id) {
            continue;
        }
        if (!isSupportedComponentType(other.type)) {
            continue;
        }
        if (rectBoundsOverlap(b, getComponentBounds(other, GRID_STEP))) {
            return true;
        }
    }
    return false;
}

const WIRE_POINT_EPS = 1e-3;

function pointsEqualApprox(a, b, eps = WIRE_POINT_EPS) {
    return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
}

function buildConnectionCountMap() {
    const countMap = new Map();

    function addPoint(x, y) {
        const key = makeNodeKey(x, y);
        countMap.set(key, (countMap.get(key) || 0) + 1);
    }

    components.forEach((component) => {
        const terminals = getComponentTerminals(component, GRID_STEP);
        addPoint(terminals.a.x, terminals.a.y);
        if (!pointsEqualApprox(terminals.a, terminals.b)) {
            addPoint(terminals.b.x, terminals.b.y);
        }
        if (
            terminals.c &&
            !pointsEqualApprox(terminals.a, terminals.c) &&
            !pointsEqualApprox(terminals.b, terminals.c)
        ) {
            addPoint(terminals.c.x, terminals.c.y);
        }
    });

    wires.forEach((wire) => {
        addPoint(wire.ax, wire.ay);
        addPoint(wire.bx, wire.by);
    });

    return countMap;
}

function buildHiddenNodeKeys() {
    const countMap = buildConnectionCountMap();
    const hidden = new Set();
    countMap.forEach((count, key) => {
        if (count >= 2) {
            hidden.add(key);
        }
    });
    return hidden;
}

function collectTerminalPoints() {
    const points = [];
    components.forEach((component) => {
        const terminals = getComponentTerminals(component, GRID_STEP);
        points.push(terminals.a);
        if (!pointsEqualApprox(terminals.a, terminals.b)) {
            points.push(terminals.b);
        }
        if (
            terminals.c &&
            !pointsEqualApprox(terminals.a, terminals.c) &&
            !pointsEqualApprox(terminals.b, terminals.c)
        ) {
            points.push(terminals.c);
        }
    });
    return points;
}

function inferHorizFirstFromWirePoints(wire) {
    if (typeof wire.horizFirst === "boolean") {
        return wire.horizFirst;
    }
    const pts = wire.points;
    if (!Array.isArray(pts) || pts.length < 3) {
        return null;
    }
    const p0 = pts[0];
    const p1 = pts[1];
    if (Math.abs(p1.x - p0.x) < WIRE_POINT_EPS) {
        return false;
    }
    if (Math.abs(p1.y - p0.y) < WIRE_POINT_EPS) {
        return true;
    }
    return null;
}

function buildAnchorsFromTerminalPair(oldT, newT) {
    const anchors = [{ ox: oldT.a.x, oy: oldT.a.y, nx: newT.a.x, ny: newT.a.y }];
    if (!pointsEqualApprox(oldT.a, oldT.b)) {
        anchors.push({ ox: oldT.b.x, oy: oldT.b.y, nx: newT.b.x, ny: newT.b.y });
    }
    if (
        oldT.c &&
        newT.c &&
        !pointsEqualApprox(oldT.a, oldT.c) &&
        !pointsEqualApprox(oldT.b, oldT.c)
    ) {
        anchors.push({ ox: oldT.c.x, oy: oldT.c.y, nx: newT.c.x, ny: newT.c.y });
    }
    return anchors;
}

function syncWiresToAnchors(anchors) {
    if (!anchors || anchors.length === 0) {
        return;
    }

    const dx0 = anchors[0].nx - anchors[0].ox;
    const dy0 = anchors[0].ny - anchors[0].oy;
    const uniform = anchors.every(
        (a) =>
            Math.abs(a.nx - a.ox - dx0) < WIRE_POINT_EPS && Math.abs(a.ny - a.oy - dy0) < WIRE_POINT_EPS
    );
    const twoAnchors = anchors.length >= 2;
    const oldLineHorizontal =
        twoAnchors && Math.abs(anchors[0].oy - anchors[1].oy) < WIRE_POINT_EPS;
    const yLine = oldLineHorizontal ? anchors[0].oy : null;

    wires.forEach((wire) => {
        const original = getWirePathPoints(wire);
        const points = original.map((p) => ({ x: p.x, y: p.y }));
        if (points.length === 0) {
            return;
        }

        const wireTouchesAnchor = points.some((p) =>
            anchors.some((an) => isSamePoint(p.x, p.y, an.ox, an.oy))
        );
        if (!wireTouchesAnchor) {
            return;
        }

        let changed = false;
        for (let i = 0; i < points.length; i += 1) {
            let hitAnchor = false;
            for (const an of anchors) {
                if (isSamePoint(points[i].x, points[i].y, an.ox, an.oy)) {
                    points[i].x = an.nx;
                    points[i].y = an.ny;
                    hitAnchor = true;
                    changed = true;
                    break;
                }
            }
            if (hitAnchor) {
                continue;
            }
            if (
                uniform &&
                oldLineHorizontal &&
                yLine !== null &&
                Math.abs(dx0) < WIRE_POINT_EPS &&
                Math.abs(dy0) > WIRE_POINT_EPS
            ) {
                if (Math.abs(points[i].y - yLine) < WIRE_POINT_EPS) {
                    points[i].x += dx0;
                    points[i].y += dy0;
                    changed = true;
                }
            }
        }

        if (!changed) {
            return;
        }

        const compact = [points[0]];
        for (let j = 1; j < points.length; j += 1) {
            const prev = compact[compact.length - 1];
            const cur = points[j];
            if (!pointsEqualApprox(prev, cur)) {
                compact.push(cur);
            }
        }
        if (compact.length === 0) {
            return;
        }

        wire.points = compact;
        wire.ax = compact[0].x;
        wire.ay = compact[0].y;
        wire.bx = compact[compact.length - 1].x;
        wire.by = compact[compact.length - 1].y;
        const hf = inferHorizFirstFromWirePoints({ points: compact });
        if (typeof hf === "boolean") {
            wire.horizFirst = hf;
        } else {
            delete wire.horizFirst;
        }
    });
}

function syncWiresAfterComponentMove(component, prevX, prevY) {
    const nx = component.x;
    const ny = component.y;
    if (prevX === nx && prevY === ny) {
        return;
    }
    component.x = prevX;
    component.y = prevY;
    const oldT = getComponentTerminals(component, GRID_STEP);
    component.x = nx;
    component.y = ny;
    const newT = getComponentTerminals(component, GRID_STEP);
    syncWiresToAnchors(buildAnchorsFromTerminalPair(oldT, newT));
}

function syncWiresAfterComponentRotation(component, prevRotation) {
    const newRot = component.rotation;
    component.rotation = prevRotation;
    const oldT = getComponentTerminals(component, GRID_STEP);
    component.rotation = newRot;
    const newT = getComponentTerminals(component, GRID_STEP);
    syncWiresToAnchors(buildAnchorsFromTerminalPair(oldT, newT));
}

/**
 * Borne opposée sur le même composant (évite d'« accrocher » la 2e borne en tirant vers le bas / le côté).
 */
function getSiblingTerminalIfAny(anchor) {
    if (!anchor) {
        return null;
    }
    for (const component of components) {
        const t = getComponentTerminals(component, GRID_STEP);
        if (t.c) {
            continue;
        }
        if (pointsEqualApprox(t.a, t.b)) {
            continue;
        }
        if (pointsEqualApprox(t.a, anchor)) {
            return t.b;
        }
        if (pointsEqualApprox(t.b, anchor)) {
            return t.a;
        }
    }
    return null;
}

function getWirePreviewExcludeTerminals(anchor) {
    const list = [anchor];
    for (const component of components) {
        const t = getComponentTerminals(component, GRID_STEP);
        if (!t.c) {
            continue;
        }
        if (pointsEqualApprox(t.a, anchor)) {
            list.push(t.b, t.c);
            return list;
        }
        if (pointsEqualApprox(t.b, anchor)) {
            list.push(t.a, t.c);
            return list;
        }
        if (pointsEqualApprox(t.c, anchor)) {
            list.push(t.a, t.b);
            return list;
        }
    }
    const sibling = getSiblingTerminalIfAny(anchor);
    if (sibling) {
        list.push(sibling);
    }
    return list;
}

/**
 * @param {{ x: number, y: number } | null | Array<{ x: number, y: number }>} excludeTerminals - borne(s) à ignorer (départ, et éventuellement l'autre borne du même composant en aperçu)
 */
function snapPointForWire(worldX, worldY, excludeTerminals = null) {
    const excludes = [];
    if (excludeTerminals) {
        if (Array.isArray(excludeTerminals)) {
            excludes.push(...excludeTerminals);
        } else {
            excludes.push(excludeTerminals);
        }
    }

    const terminals = collectTerminalPoints();
    const threshold = GRID_STEP * 0.45;
    let nearest = null;
    let bestDistSq = threshold * threshold;

    terminals.forEach((terminal) => {
        if (excludes.some((ex) => pointsEqualApprox(terminal, ex))) {
            return;
        }
        const dx = terminal.x - worldX;
        const dy = terminal.y - worldY;
        const distSq = dx * dx + dy * dy;
        if (distSq <= bestDistSq) {
            bestDistSq = distSq;
            nearest = terminal;
        }
    });

    if (nearest) {
        return { x: nearest.x, y: nearest.y };
    }

    return {
        x: snapToGrid(worldX),
        y: snapToGrid(worldY)
    };
}

function drawGrid() {
    const styles = getComputedStyle(document.body);
    const bgColor = styles.getPropertyValue("--bg-color").trim();
    const gridColor = styles.getPropertyValue("--grid-color").trim();

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;

    const worldLeft = (0 - offsetX) / zoom;
    const worldTop = (0 - offsetY) / zoom;
    const worldRight = (canvas.width - offsetX) / zoom;
    const worldBottom = (canvas.height - offsetY) / zoom;

    const startX = Math.floor(worldLeft / GRID_STEP) * GRID_STEP;
    const endX = Math.ceil(worldRight / GRID_STEP) * GRID_STEP;
    const startY = Math.floor(worldTop / GRID_STEP) * GRID_STEP;
    const endY = Math.ceil(worldBottom / GRID_STEP) * GRID_STEP;

    ctx.beginPath();

    for (let x = startX; x <= endX; x += GRID_STEP) {
        const screenX = x * zoom + offsetX;
        ctx.moveTo(screenX, 0);
        ctx.lineTo(screenX, canvas.height);
    }

    for (let y = startY; y <= endY; y += GRID_STEP) {
        const screenY = y * zoom + offsetY;
        ctx.moveTo(0, screenY);
        ctx.lineTo(canvas.width, screenY);
    }

    ctx.stroke();
}

function draw() {
    drawGrid();
    drawWires();
    drawComponents();
    drawJunctionDots();
    drawPendingWire();
}

function drawComponents() {
    const styles = getComputedStyle(document.body);
    const componentColor = styles.getPropertyValue("--menu-text").trim();
    const selectedColor = "#22c55e";
    const hiddenNodeKeys = buildHiddenNodeKeys();

    components.forEach((component) => {
        drawComponent(ctx, component, worldToScreen, GRID_STEP, componentColor, hiddenNodeKeys);

        if (component.id === selectedComponentId) {
            const bounds = getComponentBounds(component, GRID_STEP);
            const topLeft = worldToScreen(bounds.left, bounds.top);
            const bottomRight = worldToScreen(bounds.right, bounds.bottom);

            ctx.save();
            ctx.strokeStyle = selectedColor;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(
                topLeft.x,
                topLeft.y,
                bottomRight.x - topLeft.x,
                bottomRight.y - topLeft.y
            );
            ctx.restore();
        }
    });
}

function drawWires() {
    wires.forEach((wire) => {
        const selected = wire.id === selectedWireId;
        drawWire(ctx, wire, worldToScreen, selected ? "#22c55e" : "#60a5fa", selected ? 3 : 2);
    });
}

function getWirePathPoints(wire) {
    if (Array.isArray(wire.points) && wire.points.length >= 2) {
        return wire.points;
    }
    return [
        { x: wire.ax, y: wire.ay },
        { x: wire.bx, y: wire.by }
    ];
}

function cloneWireDragSnapshot(wire) {
    const pts = getWirePathPoints(wire);
    return {
        points: pts.map((p) => ({ x: p.x, y: p.y }))
    };
}

function distPointToSegmentSqScreen(px, py, ax, ay, bx, by) {
    const a = worldToScreen(ax, ay);
    const b = worldToScreen(bx, by);
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const wx = px - a.x;
    const wy = py - a.y;
    const c1 = vx * wx + vy * wy;
    if (c1 <= 0) {
        return (px - a.x) ** 2 + (py - a.y) ** 2;
    }
    const c2 = vx * vx + vy * vy;
    if (c2 <= c1) {
        return (px - b.x) ** 2 + (py - b.y) ** 2;
    }
    const t = c1 / c2;
    const qx = a.x + t * vx;
    const qy = a.y + t * vy;
    return (px - qx) ** 2 + (py - qy) ** 2;
}

function findWireAtCanvas(canvasX, canvasY) {
    const hitR2 = 8 * 8;
    for (let index = wires.length - 1; index >= 0; index -= 1) {
        const wire = wires[index];
        const pts = getWirePathPoints(wire);
        for (let i = 0; i < pts.length - 1; i += 1) {
            const a = pts[i];
            const b = pts[i + 1];
            if (distPointToSegmentSqScreen(canvasX, canvasY, a.x, a.y, b.x, b.y) <= hitR2) {
                return wire;
            }
        }
    }
    return null;
}

function findMatchingTerminal(worldX, worldY) {
    for (const component of components) {
        const t = getComponentTerminals(component, GRID_STEP);
        if (isSamePoint(worldX, worldY, t.a.x, t.a.y)) {
            return { x: t.a.x, y: t.a.y };
        }
        if (!pointsEqualApprox(t.a, t.b) && isSamePoint(worldX, worldY, t.b.x, t.b.y)) {
            return { x: t.b.x, y: t.b.y };
        }
        if (
            t.c &&
            !pointsEqualApprox(t.a, t.c) &&
            !pointsEqualApprox(t.b, t.c) &&
            isSamePoint(worldX, worldY, t.c.x, t.c.y)
        ) {
            return { x: t.c.x, y: t.c.y };
        }
    }
    return null;
}

function segmentOrientation(a, b, eps = WIRE_POINT_EPS) {
    if (!a || !b) {
        return null;
    }
    if (Math.abs(a.x - b.x) < eps) {
        return "vertical";
    }
    if (Math.abs(a.y - b.y) < eps) {
        return "horizontal";
    }
    return null;
}

function buildLockedWireDragPath(start, end, originalPoints, ddx, ddy) {
    if (ddx === 0 && ddy === 0) {
        return originalPoints.map((p) => ({ x: p.x, y: p.y }));
    }

    const firstSeg = segmentOrientation(originalPoints[0], originalPoints[1]);
    const baseMid = originalPoints[1] || {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2
    };
    const shiftedX = baseMid.x + ddx;
    const shiftedY = baseMid.y + ddy;

    // On conserve l'orientation initiale du premier segment.
    if (firstSeg === "vertical") {
        return [
            { x: start.x, y: start.y },
            { x: start.x, y: shiftedY },
            { x: shiftedX, y: shiftedY },
            { x: shiftedX, y: end.y },
            { x: end.x, y: end.y }
        ];
    }

    if (firstSeg === "horizontal") {
        return [
            { x: start.x, y: start.y },
            { x: shiftedX, y: start.y },
            { x: shiftedX, y: shiftedY },
            { x: end.x, y: shiftedY },
            { x: end.x, y: end.y }
        ];
    }

    // Fallback si le tracé d'origine est atypique (non orthogonal).
    return [
        { x: start.x, y: start.y },
        { x: shiftedX, y: start.y },
        { x: shiftedX, y: shiftedY },
        { x: end.x, y: shiftedY },
        { x: end.x, y: end.y }
    ];
}

function selectWireOnly(wireHit) {
    selectedWireId = wireHit.id;
    selectedComponentId = null;
    draggedComponentId = null;
    isPlacingNewComponent = false;
    draggedWireId = null;
    wireDragStartWorld = null;
    wireDragSnapshot = null;
    wireDragLockStart = null;
    wireDragLockEnd = null;
    wireDragSnapshotHorizFirst = null;
    dragStartState = null;
}

function isPointOnOrthogonalSegment(point, a, b, eps = WIRE_POINT_EPS) {
    if (Math.abs(a.x - b.x) < eps) {
        if (Math.abs(point.x - a.x) >= eps) {
            return false;
        }
        const minY = Math.min(a.y, b.y) - eps;
        const maxY = Math.max(a.y, b.y) + eps;
        return point.y >= minY && point.y <= maxY;
    }
    if (Math.abs(a.y - b.y) < eps) {
        if (Math.abs(point.y - a.y) >= eps) {
            return false;
        }
        const minX = Math.min(a.x, b.x) - eps;
        const maxX = Math.max(a.x, b.x) + eps;
        return point.x >= minX && point.x <= maxX;
    }
    return false;
}

function buildJunctionDots(excludeComponentId = null) {
    const candidates = new Map();
    const terminals = [];

    components.forEach((component) => {
        if (excludeComponentId && component.id === excludeComponentId) {
            return;
        }
        const t = getComponentTerminals(component, GRID_STEP);
        terminals.push(t.a);
        candidates.set(makeNodeKey(t.a.x, t.a.y), { x: t.a.x, y: t.a.y });
        if (!pointsEqualApprox(t.a, t.b)) {
            terminals.push(t.b);
            candidates.set(makeNodeKey(t.b.x, t.b.y), { x: t.b.x, y: t.b.y });
        }
        if (t.c && !pointsEqualApprox(t.a, t.c) && !pointsEqualApprox(t.b, t.c)) {
            terminals.push(t.c);
            candidates.set(makeNodeKey(t.c.x, t.c.y), { x: t.c.x, y: t.c.y });
        }
    });

    wires.forEach((wire) => {
        const points = getWirePathPoints(wire);
        points.forEach((p) => {
            candidates.set(makeNodeKey(p.x, p.y), { x: p.x, y: p.y });
        });
    });

    const junctions = [];
    candidates.forEach((point) => {
        let degree = 0;

        terminals.forEach((terminal) => {
            if (pointsEqualApprox(terminal, point)) {
                degree += 1;
            }
        });

        wires.forEach((wire) => {
            const points = getWirePathPoints(wire);
            for (let i = 0; i < points.length - 1; i += 1) {
                const a = points[i];
                const b = points[i + 1];
                if (!isPointOnOrthogonalSegment(point, a, b)) {
                    continue;
                }
                if (pointsEqualApprox(point, a) || pointsEqualApprox(point, b)) {
                    degree += 1;
                } else {
                    // Borne sur le fil sans sommet au même endroit : ne pas compter comme bifurcation complète.
                    const onAnyTerminal = terminals.some((term) => pointsEqualApprox(term, point));
                    degree += onAnyTerminal ? 1 : 2;
                }
            }
        });

        if (degree >= 3) {
            junctions.push(point);
        }
    });

    return junctions;
}

function getComponentTerminalsAtPosition(component, x, y) {
    const prevX = component.x;
    const prevY = component.y;
    component.x = x;
    component.y = y;
    const terminals = getComponentTerminals(component, GRID_STEP);
    component.x = prevX;
    component.y = prevY;
    return terminals;
}

function componentTouchesJunctionAt(component, x, y, junctions) {
    if (!junctions || junctions.length === 0) {
        return false;
    }
    const terminals = getComponentTerminalsAtPosition(component, x, y);
    for (const junction of junctions) {
        if (pointsEqualApprox(terminals.a, junction)) {
            return true;
        }
        if (!pointsEqualApprox(terminals.a, terminals.b) && pointsEqualApprox(terminals.b, junction)) {
            return true;
        }
        if (
            terminals.c &&
            !pointsEqualApprox(terminals.a, terminals.c) &&
            !pointsEqualApprox(terminals.b, terminals.c) &&
            pointsEqualApprox(terminals.c, junction)
        ) {
            return true;
        }
    }
    return false;
}

function buildWireAnglePoints() {
    const angles = [];
    wires.forEach((wire) => {
        const points = getWirePathPoints(wire);
        if (!Array.isArray(points) || points.length < 3) {
            return;
        }
        for (let i = 1; i < points.length - 1; i += 1) {
            const prev = points[i - 1];
            const cur = points[i];
            const next = points[i + 1];
            const inSeg = segmentOrientation(prev, cur);
            const outSeg = segmentOrientation(cur, next);
            if (inSeg && outSeg && inSeg !== outSeg) {
                angles.push({ x: cur.x, y: cur.y });
            }
        }
    });
    return angles;
}

function buildBlockedContactPoints(excludeComponentId) {
    const blocked = new Map();
    buildJunctionDots(excludeComponentId).forEach((point) => {
        blocked.set(makeNodeKey(point.x, point.y), point);
    });
    buildWireAnglePoints().forEach((point) => {
        blocked.set(makeNodeKey(point.x, point.y), point);
    });
    return Array.from(blocked.values());
}

function constrainComponentMove(component, prevX, prevY, targetX, targetY) {
    if (prevX === targetX && prevY === targetY) {
        return { x: targetX, y: targetY };
    }

    const blockedPoints = buildBlockedContactPoints(component.id);

    const dx = targetX - prevX;
    const dy = targetY - prevY;
    const stepX = dx === 0 ? 0 : Math.sign(dx) * GRID_STEP;
    const stepY = dy === 0 ? 0 : Math.sign(dy) * GRID_STEP;
    const countX = Math.round(Math.abs(dx) / GRID_STEP);
    const countY = Math.round(Math.abs(dy) / GRID_STEP);
    const stepCount = Math.max(countX, countY);

    let lastValidX = prevX;
    let lastValidY = prevY;
    for (let i = 1; i <= stepCount; i += 1) {
        const candX = prevX + stepX * Math.min(i, countX);
        const candY = prevY + stepY * Math.min(i, countY);
        if (blockedPoints.length > 0 && componentTouchesJunctionAt(component, candX, candY, blockedPoints)) {
            break;
        }
        if (componentOverlapsOthersAt(component, candX, candY)) {
            break;
        }
        lastValidX = candX;
        lastValidY = candY;
    }

    return { x: lastValidX, y: lastValidY };
}

function drawJunctionDots() {
    const junctions = buildJunctionDots();
    if (junctions.length === 0) {
        return;
    }

    ctx.save();
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    junctions.forEach((point) => {
        const screenPoint = worldToScreen(point.x, point.y);
        ctx.moveTo(screenPoint.x + 4, screenPoint.y);
        ctx.arc(screenPoint.x, screenPoint.y, 4, 0, Math.PI * 2);
    });
    ctx.fill();
    ctx.restore();
}

function getPendingWireAnchor() {
    if (Array.isArray(pendingWirePoints) && pendingWirePoints.length > 0) {
        return pendingWirePoints[pendingWirePoints.length - 1];
    }
    return pendingWireStart;
}

function clearPendingWireDraft() {
    pendingWireStart = null;
    pendingWireEnd = null;
    pendingWireHorizFirst = null;
    pendingWirePointerWorld = null;
    pendingWirePoints = [];
}

/** true = d'abord horizontal (coude en (bx, ay)) ; false = d'abord vertical (coude en (ax, by)) — le plus proche du pointeur */
function horizFirstNearestPointer(ax, ay, bx, by, px, py) {
    const elbowH = { x: bx, y: ay };
    const elbowV = { x: ax, y: by };
    const dH = (px - elbowH.x) ** 2 + (py - elbowH.y) ** 2;
    const dV = (px - elbowV.x) ** 2 + (py - elbowV.y) ** 2;
    return dH <= dV;
}

function appendOrthogonalSegment(points, fromPoint, toPoint, horizFirstOpt = null) {
    const segment = buildOrthogonalPath(
        fromPoint.x,
        fromPoint.y,
        toPoint.x,
        toPoint.y,
        horizFirstOpt
    );

    for (let i = 1; i < segment.length; i += 1) {
        const point = segment[i];
        const last = points[points.length - 1];
        if (!last || last.x !== point.x || last.y !== point.y) {
            points.push({ x: point.x, y: point.y });
        }
    }
}

function getPendingWireHorizFirstForDraw() {
    const anchor = getPendingWireAnchor();
    if (!anchor || !pendingWireEnd) {
        return null;
    }
    const ax = anchor.x;
    const ay = anchor.y;
    const bx = pendingWireEnd.x;
    const by = pendingWireEnd.y;
    if (isOrthogonalStraight(ax, ay, bx, by)) {
        return null;
    }
    if (typeof pendingWireHorizFirst === "boolean") {
        return pendingWireHorizFirst;
    }
    // Premier segment en L : une seule fois — coude (bx,ay) vs (ax,by) le plus proche de la souris.
    // (|dx| vs |dy| seul pénalise un début vertical : |dx|>|dy| force « horizontal d'abord » alors que la souris suit la verticale.)
    if (pendingWirePointerWorld) {
        pendingWireHorizFirst = horizFirstNearestPointer(
            ax,
            ay,
            bx,
            by,
            pendingWirePointerWorld.x,
            pendingWirePointerWorld.y
        );
    } else {
        pendingWireHorizFirst = Math.abs(bx - ax) >= Math.abs(by - ay);
    }
    return pendingWireHorizFirst;
}

function drawPendingWire() {
    const anchor = getPendingWireAnchor();
    if (!pendingWireStart || !pendingWireEnd || !anchor) {
        return;
    }

    if (pendingWirePoints.length >= 2) {
        ctx.save();
        ctx.strokeStyle = "#93c5fd";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        const first = worldToScreen(pendingWirePoints[0].x, pendingWirePoints[0].y);
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < pendingWirePoints.length; i += 1) {
            const point = worldToScreen(pendingWirePoints[i].x, pendingWirePoints[i].y);
            ctx.lineTo(point.x, point.y);
        }
        ctx.stroke();
        ctx.restore();
    }

    drawOrthogonalPreview(
        ctx,
        anchor.x,
        anchor.y,
        pendingWireEnd.x,
        pendingWireEnd.y,
        worldToScreen,
        "#93c5fd",
        getPendingWireHorizFirstForDraw()
    );
}

function updateWirePreviewFromClient(clientX, clientY) {
    const anchor = getPendingWireAnchor();
    if (activeTool !== "wire" || !anchor) {
        return;
    }
    lastWireClientX = clientX;
    lastWireClientY = clientY;
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    const y = Math.min(Math.max(clientY - rect.top, 0), rect.height);
    const worldPoint = screenToWorld(x, y);
    pendingWirePointerWorld = { x: worldPoint.x, y: worldPoint.y };
    pendingWireEnd = snapPointForWire(worldPoint.x, worldPoint.y, getWirePreviewExcludeTerminals(anchor));
    const ax = anchor.x;
    const ay = anchor.y;
    const bx = pendingWireEnd.x;
    const by = pendingWireEnd.y;
    if (isOrthogonalStraight(ax, ay, bx, by)) {
        pendingWireHorizFirst = null;
    }
    draw();
}

function getWireHorizFirstForCommit() {
    const anchor = getPendingWireAnchor();
    if (!anchor || !pendingWireEnd) {
        return null;
    }
    const ax = anchor.x;
    const ay = anchor.y;
    const bx = pendingWireEnd.x;
    const by = pendingWireEnd.y;
    if (isOrthogonalStraight(ax, ay, bx, by)) {
        return null;
    }
    if (typeof pendingWireHorizFirst === "boolean") {
        return pendingWireHorizFirst;
    }
    if (pendingWirePointerWorld) {
        return horizFirstNearestPointer(ax, ay, bx, by, pendingWirePointerWorld.x, pendingWirePointerWorld.y);
    }
    return Math.abs(bx - ax) >= Math.abs(by - ay);
}

function zoomAt(mouseX, mouseY, zoomMultiplier) {
    const prevZoom = zoom;
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * zoomMultiplier));

    if (zoom === prevZoom) {
        return;
    }

    // Garde le point sous la souris fixe pendant le zoom.
    offsetX = mouseX - ((mouseX - offsetX) / prevZoom) * zoom;
    offsetY = mouseY - ((mouseY - offsetY) / prevZoom) * zoom;
}

function getCanvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}

function setActiveTool(tool) {
    activeTool = tool;
    selectedWireId = null;
    draggedWireId = null;
    wireDragStartWorld = null;
    wireDragSnapshot = null;
    wireDragLockStart = null;
    wireDragLockEnd = null;
    wireDragSnapshotHorizFirst = null;
    if (activeTool !== "wire") {
        clearPendingWireDraft();
    }
    canvas.classList.toggle("placing", Boolean(activeTool));
    const filBtn = document.querySelector('.menu-bar [data-action="componentWire"]');
    if (filBtn) {
        filBtn.classList.toggle("menu-wire-active", activeTool === "wire");
    }
}

function closeOpenMenus() {
    document.querySelectorAll(".menu-group .menu-title").forEach((button) => button.blur());
}

const componentDragImageByType = new Map();

function getOrCreateComponentDragImage(type) {
    let entry = componentDragImageByType.get(type);
    if (!entry) {
        const canvasEl = document.createElement("canvas");
        canvasEl.style.position = "fixed";
        canvasEl.style.left = "-10000px";
        canvasEl.style.top = "0";
        canvasEl.style.pointerEvents = "none";
        document.body.appendChild(canvasEl);
        entry = { canvas: canvasEl, hotspotX: 0, hotspotY: 0 };
        componentDragImageByType.set(type, entry);
    }
    const { canvas: dragCanvas } = entry;
    const previewRef = type === "supply" ? "VCC" : `${getReferencePrefix(type)}0`;
    const previewComponent = createComponent(type, 0, 0, {
        reference: previewRef,
        value: getDefaultValue(type)
    });
    const bounds = getComponentBounds(previewComponent, GRID_STEP);
    const pad = 14;
    const w = Math.max(1, Math.ceil(bounds.right - bounds.left + pad * 2));
    const h = Math.max(1, Math.ceil(bounds.bottom - bounds.top + pad * 2));
    dragCanvas.width = w;
    dragCanvas.height = h;
    const dctx = dragCanvas.getContext("2d");
    dctx.clearRect(0, 0, w, h);
    const offsetX = pad - bounds.left;
    const offsetY = pad - bounds.top;
    const worldToScreenLocal = (x, y) => ({
        x: x + offsetX,
        y: y + offsetY
    });
    const styles = getComputedStyle(document.body);
    const color = styles.getPropertyValue("--menu-text").trim() || "#e5e7eb";
    drawComponent(dctx, previewComponent, worldToScreenLocal, GRID_STEP, color, new Set(), true);
    const center = worldToScreenLocal(0, 0);
    entry.hotspotX = Math.round(center.x);
    entry.hotspotY = Math.round(center.y);
    return entry;
}

function placeComponentFromClient(type, clientX, clientY) {
    if (!isSupportedComponentType(type)) {
        return false;
    }

    const rect = canvas.getBoundingClientRect();
    const inside =
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom;
    if (!inside) {
        return false;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const worldPoint = screenToWorld(x, y);

    const sx = snapToGrid(worldPoint.x);
    const sy = snapToGrid(worldPoint.y);
    const created = createComponent(type, sx, sy, {
        reference: createComponentReference(type),
        value: getDefaultValue(type)
    });
    if (componentOverlapsOthersAt(created, sx, sy)) {
        return false;
    }
    pushHistoryState(captureSceneState());
    components.push(created);
    selectedComponentId = created.id;
    draggedComponentId = null;
    isPlacingNewComponent = false;
    setActiveTool(null);
    draw();
    return true;
}

function setupComponentMenuDragAndDrop() {
    const componentItems = document.querySelectorAll(
        ".menu-dropdown .menu-item[data-action^='component'], .menu-dropdown .menu-item[data-action^='source'], .menu-dropdown .menu-item[data-action^='device'], .menu-submenu .menu-item[data-action^='component'], .menu-submenu .menu-item[data-action^='source']"
    );
    componentItems.forEach((item) => {
        const action = item.dataset.action;
        const type = COMPONENT_ACTION_TO_TYPE[action];
        if (!type) {
            return;
        }
        item.draggable = true;

        item.addEventListener("dragstart", (event) => {
            draggedMenuComponentType = type;
            closeOpenMenus();
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = "copy";
                event.dataTransfer.setData("text/plain", type);
                const { canvas: dragCanvas, hotspotX, hotspotY } = getOrCreateComponentDragImage(type);
                try {
                    event.dataTransfer.setDragImage(dragCanvas, hotspotX, hotspotY);
                } catch {
                    // Certains navigateurs ignorent setDragImage : le drop reste fonctionnel.
                }
            }
        });

        item.addEventListener("dragend", () => {
            draggedMenuComponentType = null;
            closeOpenMenus();
        });
    });

    canvas.addEventListener("dragenter", (event) => {
        if (!draggedMenuComponentType) {
            return;
        }
        event.preventDefault();
    });

    canvas.addEventListener("dragover", (event) => {
        if (!draggedMenuComponentType) {
            return;
        }
        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "copy";
        }
    });

    canvas.addEventListener("drop", (event) => {
        const type =
            draggedMenuComponentType ||
            (event.dataTransfer && event.dataTransfer.getData("text/plain"));
        if (!isSupportedComponentType(type)) {
            return;
        }
        event.preventDefault();
        placeComponentFromClient(type, event.clientX, event.clientY);
        draggedMenuComponentType = null;
        closeOpenMenus();
    });
}

function getProjectState() {
    return {
        zoom,
        offsetX,
        offsetY,
        theme: document.body.dataset.theme || "dark",
        components,
        wires
    };
}

function setTheme(theme) {
    document.body.dataset.theme = theme;
    draw();
}

function setProjectState(state) {
    zoom = typeof state.zoom === "number" ? state.zoom : 1;
    offsetX = typeof state.offsetX === "number" ? state.offsetX : 0;
    offsetY = typeof state.offsetY === "number" ? state.offsetY : 0;
    components = Array.isArray(state.components) ? state.components : [];
    wires = Array.isArray(state.wires) ? state.wires : [];
    syncReferenceCounters();
    selectedComponentId = null;
    selectedWireId = null;
    draggedWireId = null;
    wireDragStartWorld = null;
    wireDragSnapshot = null;
    wireDragLockStart = null;
    wireDragLockEnd = null;
    wireDragSnapshotHorizFirst = null;
    clipboardComponent = null;
    clearPendingWireDraft();
    pasteOffsetStep = 1;
    setTheme(state.theme === "white" ? "white" : "dark");
    draw();
}

async function handleNewProject() {
    const hasContent = components.length > 0;
    if (hasContent) {
        const decision = await askSaveBeforeNewDialog();
        if (decision === "cancel") {
            return;
        }

        if (decision === "yes") {
            const saved = await handleSaveAsProject();
            if (!saved) {
                return;
            }
        }
    }

    pushHistoryState(captureSceneState());
    setProjectState({
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
        theme: document.body.dataset.theme || "dark",
        components: [],
        wires: []
    });
    nextReferenceByPrefix = { R: 1, C: 1, D: 1, L: 1, M: 1, V: 1, A: 1, O: 1, Q: 1, B: 1 };
}

function askSaveBeforeNewDialog() {
    return new Promise((resolve) => {
        if (!newProjectDialog || typeof newProjectDialog.showModal !== "function") {
            const fallback = window.confirm("Enregistrer sous avant Nouveau ?");
            resolve(fallback ? "yes" : "no");
            return;
        }

        const buttons = Array.from(newProjectDialog.querySelectorAll("[data-choice]"));

        function cleanup(choice) {
            buttons.forEach((button) => {
                button.removeEventListener("click", onButtonClick);
            });
            newProjectDialog.removeEventListener("cancel", onCancel);
            if (newProjectDialog.open) {
                newProjectDialog.close();
            }
            resolve(choice);
        }

        function onButtonClick(event) {
            const choice = event.currentTarget.dataset.choice;
            cleanup(choice || "cancel");
        }

        function onCancel(event) {
            event.preventDefault();
            cleanup("cancel");
        }

        buttons.forEach((button) => {
            button.addEventListener("click", onButtonClick);
        });
        newProjectDialog.addEventListener("cancel", onCancel);
        newProjectDialog.showModal();
    });
}

function handleCopy() {
    const selected = components.find((component) => component.id === selectedComponentId);
    if (!selected) {
        return;
    }

    clipboardComponent = {
        type: selected.type,
        x: selected.x,
        y: selected.y,
        rotation: selected.rotation || 0,
        value: selected.value || getDefaultValue(selected.type)
    };
    pasteOffsetStep = 1;
}

function handlePaste() {
    if (!clipboardComponent) {
        return;
    }

    if (!isSupportedComponentType(clipboardComponent.type)) {
        return;
    }

    const maxAttempts = 48;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const offset = GRID_STEP * pasteOffsetStep;
        const sx = snapToGrid(clipboardComponent.x + offset);
        const sy = snapToGrid(clipboardComponent.y + offset);
        const cloned = createComponent(clipboardComponent.type, sx, sy, {
            reference: createComponentReference(clipboardComponent.type),
            value: clipboardComponent.value || getDefaultValue(clipboardComponent.type)
        });
        cloned.rotation = clipboardComponent.rotation || 0;
        if (!componentOverlapsOthersAt(cloned, sx, sy)) {
            pushHistoryState(captureSceneState());
            components.push(cloned);
            selectedComponentId = cloned.id;
            pasteOffsetStep += 1;
            draw();
            return;
        }
        pasteOffsetStep += 1;
    }
}

function rotateSelectedComponent() {
    if (!selectedComponentId) {
        return;
    }

    const component = components.find((item) => item.id === selectedComponentId);
    if (!component) {
        return;
    }

    pushHistoryState(captureSceneState());
    const prevRot = ((component.rotation || 0) + 360) % 360;
    component.rotation = (prevRot + 90) % 360;
    syncWiresAfterComponentRotation(component, prevRot);
    draw();
}

function editComponentValue(component) {
    if (!component || !isSupportedComponentType(component.type)) {
        return;
    }

    const currentValue = component.value || getDefaultValue(component.type);
    const input = window.prompt(
        "Valeur du composant (ex: 1000Ω, 10µF, 12 V, 50 mA, 1 kΩ)",
        currentValue
    );
    if (input === null) {
        return;
    }

    const nextValue = input.trim();
    if (!nextValue || nextValue === currentValue) {
        return;
    }

    pushHistoryState(captureSceneState());
    component.value = nextValue;
    draw();
}

function deleteSelectedWire() {
    if (!selectedWireId) {
        return;
    }

    const index = wires.findIndex((wire) => wire.id === selectedWireId);
    if (index === -1) {
        selectedWireId = null;
        return;
    }

    pushHistoryState(captureSceneState());
    wires.splice(index, 1);
    selectedWireId = null;
    draggedWireId = null;
    wireDragStartWorld = null;
    wireDragSnapshot = null;
    wireDragLockStart = null;
    wireDragLockEnd = null;
    wireDragSnapshotHorizFirst = null;
    draw();
}

function deleteSelectedComponent() {
    if (!selectedComponentId) {
        return;
    }

    const index = components.findIndex((component) => component.id === selectedComponentId);
    if (index === -1) {
        selectedComponentId = null;
        return;
    }

    pushHistoryState(captureSceneState());
    const component = components[index];
    const terminals = getComponentTerminals(component, GRID_STEP);
    components.splice(index, 1);
    wires = wires.filter((wire) => {
        const touchesA =
            (wire.ax === terminals.a.x && wire.ay === terminals.a.y) ||
            (wire.bx === terminals.a.x && wire.by === terminals.a.y);
        const touchesB =
            (wire.ax === terminals.b.x && wire.ay === terminals.b.y) ||
            (wire.bx === terminals.b.x && wire.by === terminals.b.y);
        const touchesC =
            terminals.c &&
            ((wire.ax === terminals.c.x && wire.ay === terminals.c.y) ||
                (wire.bx === terminals.c.x && wire.by === terminals.c.y));
        return !(touchesA || touchesB || touchesC);
    });
    selectedComponentId = null;
    selectedWireId = null;
    draggedComponentId = null;
    draw();
}

async function handleSaveAsProject() {
    const content = JSON.stringify(getProjectState(), null, 2);

    if ("showSaveFilePicker" in window) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: "projet-grille.json",
                types: [
                    {
                        description: "Fichier JSON",
                        accept: { "application/json": [".json"] }
                    }
                ]
            });
            const writable = await handle.createWritable();
            await writable.write(content);
            await writable.close();
            currentFileHandle = handle;
            return true;
        } catch (error) {
            if (error && error.name === "AbortError") {
                return false;
            }
            alert("Impossible d'enregistrer le fichier sur le disque.");
            return false;
        }
    }

    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "projet-grille.json";
    link.click();
    URL.revokeObjectURL(url);
    return true;
}

function readFileText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

async function loadProjectFromFile(file) {
    try {
        const text = await readFileText(file);
        const parsed = JSON.parse(text);
        const normalizedState = normalizeProjectState(parsed);
        pushHistoryState(captureSceneState());
        setProjectState(normalizedState);
        return true;
    } catch (error) {
        alert("Fichier invalide. Impossible d'ouvrir ce schema.");
        return false;
    }
}

async function handleOpenProject() {
    if ("showOpenFilePicker" in window) {
        try {
            const [fileHandle] = await window.showOpenFilePicker({
                multiple: false,
                types: [
                    {
                        description: "Fichier JSON",
                        accept: { "application/json": [".json"] }
                    }
                ]
            });
            if (!fileHandle) {
                return false;
            }
            const file = await fileHandle.getFile();
            const loaded = await loadProjectFromFile(file);
            if (loaded) {
                currentFileHandle = fileHandle;
            }
            return loaded;
        } catch (error) {
            if (error && error.name === "AbortError") {
                return false;
            }
            alert("Impossible d'ouvrir le fichier.");
            return false;
        }
    }

    if (!openProjectInput) {
        return false;
    }

    return new Promise((resolve) => {
        openProjectInput.value = "";
        openProjectInput.click();

        async function onChange() {
            openProjectInput.removeEventListener("change", onChange);
            const file = openProjectInput.files && openProjectInput.files[0];
            if (!file) {
                resolve(false);
                return;
            }

            const loaded = await loadProjectFromFile(file);
            resolve(loaded);
        }

        openProjectInput.addEventListener("change", onChange, { once: true });
    });
}

async function handleSaveProject() {
    const content = JSON.stringify(getProjectState(), null, 2);

    if (currentFileHandle && "createWritable" in currentFileHandle) {
        try {
            const writable = await currentFileHandle.createWritable();
            await writable.write(content);
            await writable.close();
            return true;
        } catch (error) {
            // Si le handle n'est plus valide, on repasse en "Enregistrer sous".
            currentFileHandle = null;
        }
    }

    return handleSaveAsProject();
}

function handleAbout() {
    alert("Mon Simulateur - Grille interactive avec zoom et deplacement.");
}

function sanitizeMeterReference(ref, fallback = "VM") {
    const cleaned = String(ref || "")
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, "");
    return cleaned || fallback;
}

function formatSimulationDiagnostics(diagnostics) {
    if (!diagnostics || typeof diagnostics !== "object") {
        return [];
    }
    const lines = [];
    if (Array.isArray(diagnostics.floatingNets) && diagnostics.floatingNets.length > 0) {
        lines.push(`Noeuds flottants detectes: ${diagnostics.floatingNets.join(", ")}`);
    }
    if (diagnostics.sourceConnectedToGround === false) {
        lines.push("Aucune source reliee a la masse par un chemin conducteur.");
    }
    if (Array.isArray(diagnostics.unsupportedComponents) && diagnostics.unsupportedComponents.length > 0) {
        lines.push(`Composants ignores pour l'instant: ${diagnostics.unsupportedComponents.join(", ")}`);
    }
    return lines;
}

function renderSimulationDiagnosticsPanel(title, level, items = []) {
    if (!simDiagnosticsPanel) {
        return;
    }
    if (simDiagnosticsAutoHideTimer) {
        clearTimeout(simDiagnosticsAutoHideTimer);
        simDiagnosticsAutoHideTimer = null;
    }
    if (!items || items.length === 0) {
        simDiagnosticsPanel.classList.remove("is-visible");
        if (simDiagnosticsList) {
            simDiagnosticsList.innerHTML = "";
        }
        return;
    }
    if (simDiagnosticsTitle) {
        simDiagnosticsTitle.className = `sim-diagnostics-title ${level || "warn"}`;
        simDiagnosticsTitle.textContent = title;
    }
    if (!simDiagnosticsList) {
        return;
    }
    simDiagnosticsList.innerHTML = "";
    items.forEach((line) => {
        const li = document.createElement("li");
        li.textContent = line;
        simDiagnosticsList.appendChild(li);
    });
    simDiagnosticsPanel.classList.add("is-visible");

    if (level === "ok") {
        simDiagnosticsAutoHideTimer = window.setTimeout(() => {
            simDiagnosticsPanel.classList.remove("is-visible");
            if (simDiagnosticsList) {
                simDiagnosticsList.innerHTML = "";
            }
            simDiagnosticsAutoHideTimer = null;
        }, 4500);
    }
}

class ConnectivityDisjointSet {
    constructor() {
        this.parent = new Map();
    }

    make(x) {
        if (!this.parent.has(x)) {
            this.parent.set(x, x);
        }
    }

    find(x) {
        this.make(x);
        let p = this.parent.get(x);
        while (p !== this.parent.get(p)) {
            p = this.parent.get(p);
        }
        let cur = x;
        while (cur !== p) {
            const next = this.parent.get(cur);
            this.parent.set(cur, p);
            cur = next;
        }
        return p;
    }

    union(a, b) {
        const ra = this.find(a);
        const rb = this.find(b);
        if (ra !== rb) {
            this.parent.set(ra, rb);
        }
    }
}

function hasConnectedGroundInScene() {
    const groundComponents = components.filter((component) => component.type === "ground");
    if (groundComponents.length === 0) {
        return { ok: false, reason: "missing" };
    }

    const dsu = new ConnectivityDisjointSet();
    const nodeKey = (x, y) => makeNodeKey(x, y);

    wires.forEach((wire) => {
        const points = getWirePathPoints(wire);
        points.forEach((point) => dsu.make(nodeKey(point.x, point.y)));
        for (let i = 1; i < points.length; i += 1) {
            dsu.union(
                nodeKey(points[i - 1].x, points[i - 1].y),
                nodeKey(points[i].x, points[i].y)
            );
        }
    });

    const componentTerminalKeys = [];
    components.forEach((component) => {
        const terminals = getComponentTerminals(component, GRID_STEP);
        const terminalPoints = [terminals.a, terminals.b, terminals.c].filter(Boolean);
        terminalPoints.forEach((point) => {
            const key = nodeKey(point.x, point.y);
            dsu.make(key);
            componentTerminalKeys.push({ component, key });
        });
    });

    const groundRoots = new Set();
    componentTerminalKeys.forEach(({ component, key }) => {
        if (component.type === "ground") {
            groundRoots.add(dsu.find(key));
        }
    });

    const activeConnectedToGround = componentTerminalKeys.some(({ component, key }) => {
        if (component.type === "ground") {
            return false;
        }
        return groundRoots.has(dsu.find(key));
    });

    return activeConnectedToGround
        ? { ok: true, reason: null }
        : { ok: false, reason: "floating" };
}

async function handleSimulateNgspice() {
    try {
        const response = await fetch("/api/simulate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state: getProjectState(), gridStep: GRID_STEP })
        });
        const payload = await response.json();
        if (!payload.ok) {
            const diagLines = formatSimulationDiagnostics(payload.diagnostics);
            const lines = [
                "Simulation impossible.",
                ...(payload.errors || []),
                ...(payload.warnings || []).map((warning) => `Avertissement: ${warning}`),
                ...diagLines.map((line) => `Diagnostic: ${line}`)
            ];
            renderSimulationDiagnosticsPanel("Simulation impossible", "error", lines.slice(1));
            console.error("ngspice error payload:", payload);
            return;
        }
        const rawMeterValues = payload.voltmeterValues || {};
        const formattedLines = [];
        components.forEach((component) => {
            if (component.type !== "voltmeter") {
                return;
            }
            const key = sanitizeMeterReference(component.reference, "VM");
            const value = rawMeterValues[key];
            if (!Number.isFinite(value)) {
                return;
            }
            component.value = `${value.toFixed(3)} V`;
            formattedLines.push(`${component.reference || key}: ${component.value}`);
        });
        if (formattedLines.length > 0) {
            draw();
        }
        const diagLines = formatSimulationDiagnostics(payload.diagnostics);
        const panelLines = [
            ...(payload.warnings || []).map((warning) => `Avertissement: ${warning}`),
            ...diagLines.map((line) => `Diagnostic: ${line}`),
            ...(formattedLines.length > 0 ? formattedLines.map((line) => `Mesure: ${line}`) : ["Aucune mesure voltmetre exploitable."])
        ];
        renderSimulationDiagnosticsPanel("Simulation terminee", payload.warnings?.length ? "warn" : "ok", panelLines);
        console.log("===== NETLIST NGSPICE =====\n" + payload.netlist);
        console.log("===== SORTIE NGSPICE =====\n" + payload.log);
    } catch (error) {
        renderSimulationDiagnosticsPanel("Simulation impossible", "error", [
            "Impossible de lancer la simulation.",
            "Verifie que l'API /api/simulate est disponible et que ngspice est installe sur le serveur."
        ]);
        console.error(error);
    }
}

function wireMenuActions() {
    document.querySelectorAll(".menu-bar [data-action]").forEach((item) => {
        item.addEventListener("click", async () => {
            const action = item.dataset.action;
            if (action === "new") {
                await handleNewProject();
            } else if (action === "open") {
                await handleOpenProject();
            } else if (action === "save") {
                await handleSaveProject();
            } else if (action === "saveAs") {
                await handleSaveAsProject();
            } else if (action === "about") {
                handleAbout();
            } else if (action === "simulateNgspice") {
                await handleSimulateNgspice();
            } else if (action === "themeDark") {
                pushHistoryState(captureSceneState());
                setTheme("dark");
            } else if (action === "themeWhite") {
                pushHistoryState(captureSceneState());
                setTheme("white");
            } else if (action === "componentResistance") {
                setActiveTool("resistance");
            } else if (action === "componentWire") {
                setActiveTool(activeTool === "wire" ? null : "wire");
            } else if (action === "componentCapacitor") {
                setActiveTool("capacitor");
            } else if (action === "componentDiode") {
                setActiveTool("diode");
            } else if (action === "componentInductor") {
                setActiveTool("inductor");
            } else if (action === "sourceGround") {
                setActiveTool("ground");
            } else if (action === "sourceSupply") {
                setActiveTool("supply");
            } else if (action === "sourcePowerTerminal") {
                setActiveTool("powerTerminal");
            } else if (action === "deviceVoltmeter") {
                setActiveTool("voltmeter");
            } else if (action === "deviceAmmeter") {
                setActiveTool("ammeter");
            } else if (action === "deviceOhmmeter") {
                setActiveTool("ohmmeter");
            } else if (action === "componentTransistorNpn") {
                setActiveTool("transistorNpn");
            }
        });
    });
}

canvas.addEventListener("wheel", (event) => {
    event.preventDefault();

    const point = getCanvasPoint(event);
    const multiplier = event.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    zoomAt(point.x, point.y, multiplier);
    draw();
});

canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
});

canvas.addEventListener("mousedown", (event) => {
    const point = getCanvasPoint(event);
    const worldPoint = screenToWorld(point.x, point.y);

    if (event.button === 2) {
        isPanning = true;
        lastMouseX = point.x;
        lastMouseY = point.y;
        canvas.classList.add("panning");
        return;
    }

    if (event.button === 0 && activeTool === "wire") {
        selectedWireId = null;
        draggedWireId = null;
        wireDragStartWorld = null;
        wireDragSnapshot = null;
        wireDragLockStart = null;
        wireDragLockEnd = null;
        wireDragSnapshotHorizFirst = null;
        lastWireClientX = event.clientX;
        lastWireClientY = event.clientY;
        const snapped = snapPointForWire(worldPoint.x, worldPoint.y);
        if (!pendingWireStart) {
            pendingWireStart = snapped;
            pendingWireEnd = snapped;
            pendingWireHorizFirst = null;
            pendingWirePointerWorld = { x: worldPoint.x, y: worldPoint.y };
            pendingWirePoints = [{ x: snapped.x, y: snapped.y }];
        } else {
            pendingWireEnd = snapped;
            pendingWirePointerWorld = { x: worldPoint.x, y: worldPoint.y };
            const anchor = getPendingWireAnchor();
            const samePoint = anchor && anchor.x === snapped.x && anchor.y === snapped.y;
            if (!samePoint && anchor) {
                const points = pendingWirePoints.map((point) => ({ x: point.x, y: point.y }));
                appendOrthogonalSegment(points, anchor, snapped, getWireHorizFirstForCommit());

                const start = points[0];
                const end = points[points.length - 1];
                pushHistoryState(captureSceneState());
                wires.push({
                    id: crypto.randomUUID(),
                    ax: start.x,
                    ay: start.y,
                    bx: end.x,
                    by: end.y,
                    points
                });
            }
            clearPendingWireDraft();
        }
        draw();
        return;
    }

    if (event.button !== 0 || !isSupportedComponentType(activeTool)) {
        if (event.button === 0) {
            const picked = findComponentAt(worldPoint.x, worldPoint.y);
            if (picked) {
                selectedComponentId = picked.id;
                selectedWireId = null;
                draggedWireId = null;
                wireDragStartWorld = null;
                wireDragSnapshot = null;
                wireDragLockStart = null;
                wireDragLockEnd = null;
                wireDragSnapshotHorizFirst = null;
                draggedComponentId = picked.id;
                isPlacingNewComponent = false;
                dragStartState = captureSceneState();
            } else {
                const wireHit = findWireAtCanvas(point.x, point.y);
                if (wireHit) {
                    selectWireOnly(wireHit);
                } else {
                    selectedComponentId = null;
                    selectedWireId = null;
                    draggedComponentId = null;
                    draggedWireId = null;
                    wireDragStartWorld = null;
                    wireDragSnapshot = null;
                    wireDragLockStart = null;
                    wireDragLockEnd = null;
                    wireDragSnapshotHorizFirst = null;
                    isPlacingNewComponent = false;
                    dragStartState = null;
                }
            }
            draw();
        }
        return;
    }

    const picked = findComponentAt(worldPoint.x, worldPoint.y);
    if (picked) {
        selectedComponentId = picked.id;
        selectedWireId = null;
        draggedWireId = null;
        wireDragStartWorld = null;
        wireDragSnapshot = null;
        wireDragLockStart = null;
        wireDragLockEnd = null;
        wireDragSnapshotHorizFirst = null;
        draggedComponentId = picked.id;
        isPlacingNewComponent = false;
        dragStartState = captureSceneState();
        draw();
        return;
    }

    const wireHitWhilePlacing = findWireAtCanvas(point.x, point.y);
    if (wireHitWhilePlacing) {
        selectWireOnly(wireHitWhilePlacing);
        draw();
        return;
    }

    const sx = snapToGrid(worldPoint.x);
    const sy = snapToGrid(worldPoint.y);
    const created = createComponent(activeTool, sx, sy, {
        reference: createComponentReference(activeTool),
        value: getDefaultValue(activeTool)
    });
    if (componentOverlapsOthersAt(created, sx, sy)) {
        draw();
        return;
    }
    dragStartState = captureSceneState();
    components.push(created);
    draggedComponentId = created.id;
    selectedComponentId = created.id;
    selectedWireId = null;
    draggedWireId = null;
    wireDragStartWorld = null;
    wireDragSnapshot = null;
    wireDragLockStart = null;
    wireDragLockEnd = null;
    wireDragSnapshotHorizFirst = null;
    isPlacingNewComponent = true;
    draw();
});

window.addEventListener("mouseup", (event) => {
    if (event.button === 2) {
        isPanning = false;
        canvas.classList.remove("panning");
    }

    if (event.button === 0 && activeTool === "wire" && pendingWireStart) {
        updateWirePreviewFromClient(event.clientX, event.clientY);
    }

    if (event.button === 0 && draggedWireId) {
        const pointUp = getCanvasPoint(event);
        const worldUp = screenToWorld(pointUp.x, pointUp.y);
        const ddxEnd = snapToGrid(worldUp.x) - (wireDragStartWorld ? wireDragStartWorld.x : 0);
        const ddyEnd = snapToGrid(worldUp.y) - (wireDragStartWorld ? wireDragStartWorld.y : 0);
        const wire = wires.find((w) => w.id === draggedWireId);
        const moved = ddxEnd !== 0 || ddyEnd !== 0;
        if (wire && wireDragSnapshot && moved && !(wireDragLockStart && wireDragLockEnd)) {
            let ax = wire.ax;
            let ay = wire.ay;
            let bx = wire.bx;
            let by = wire.by;
            if (wireDragLockStart && !wireDragLockEnd) {
                const snapped = snapPointForWire(bx, by, { x: ax, y: ay });
                bx = snapped.x;
                by = snapped.y;
            } else if (!wireDragLockStart && wireDragLockEnd) {
                const snapped = snapPointForWire(ax, ay, { x: bx, y: by });
                ax = snapped.x;
                ay = snapped.y;
            } else if (!wireDragLockStart && !wireDragLockEnd) {
                const s0 = snapPointForWire(ax, ay);
                ax = s0.x;
                ay = s0.y;
                const s1 = snapPointForWire(bx, by, { x: ax, y: ay });
                bx = s1.x;
                by = s1.y;
            }
            const hf = inferHorizFirstFromWirePoints(wire);
            wire.points = buildOrthogonalPath(ax, ay, bx, by, hf);
            wire.ax = ax;
            wire.ay = ay;
            wire.bx = bx;
            wire.by = by;
            if (typeof hf === "boolean") {
                wire.horizFirst = hf;
            } else {
                delete wire.horizFirst;
            }
        }
        const endWireState = captureSceneState();
        if (dragStartState && !sceneStatesEqual(dragStartState, endWireState)) {
            pushHistoryState(dragStartState);
        }
        dragStartState = null;
        draggedWireId = null;
        wireDragStartWorld = null;
        wireDragSnapshot = null;
        wireDragLockStart = null;
        wireDragLockEnd = null;
        wireDragSnapshotHorizFirst = null;
        draw();
        return;
    }

    if (event.button !== 0 || !draggedComponentId) {
        return;
    }

    const point = getCanvasPoint(event);
    const worldPoint = screenToWorld(point.x, point.y);
    const component = components.find((item) => item.id === draggedComponentId);
    if (component) {
        const prevX = component.x;
        const prevY = component.y;
        const sx = snapToGrid(worldPoint.x);
        const sy = snapToGrid(worldPoint.y);
        const constrained = constrainComponentMove(component, prevX, prevY, sx, sy);
        if (constrained.x !== prevX || constrained.y !== prevY) {
            component.x = constrained.x;
            component.y = constrained.y;
            syncWiresAfterComponentMove(component, prevX, prevY);
        }
    }

    const endState = captureSceneState();
    if (dragStartState && !sceneStatesEqual(dragStartState, endState)) {
        pushHistoryState(dragStartState);
    }
    dragStartState = null;

    selectedComponentId = draggedComponentId;
    draggedComponentId = null;
    if (isSupportedComponentType(activeTool) && isPlacingNewComponent) {
        setActiveTool(null);
    }
    isPlacingNewComponent = false;
    draw();
});

window.addEventListener("mousemove", (event) => {
    if (isPanning) {
        const point = getCanvasPoint(event);
        const dx = point.x - lastMouseX;
        const dy = point.y - lastMouseY;

        offsetX += dx;
        offsetY += dy;

        lastMouseX = point.x;
        lastMouseY = point.y;

        draw();
        return;
    }

    if (draggedWireId && wireDragSnapshot && wireDragStartWorld) {
        const point = getCanvasPoint(event);
        const worldPoint = screenToWorld(point.x, point.y);
        const wire = wires.find((w) => w.id === draggedWireId);
        if (wire) {
            const ddx = snapToGrid(worldPoint.x) - wireDragStartWorld.x;
            const ddy = snapToGrid(worldPoint.y) - wireDragStartWorld.y;
            const snapPts = wireDragSnapshot.points;
            const n0 = snapPts[0];
            const nL = snapPts[snapPts.length - 1];
            const bothLocked = wireDragLockStart && wireDragLockEnd;

            if (bothLocked) {
                const lockedStart = { x: wireDragLockStart.x, y: wireDragLockStart.y };
                const lockedEnd = { x: wireDragLockEnd.x, y: wireDragLockEnd.y };
                wire.points = buildLockedWireDragPath(lockedStart, lockedEnd, snapPts, ddx, ddy);
                wire.ax = lockedStart.x;
                wire.ay = lockedStart.y;
                wire.bx = lockedEnd.x;
                wire.by = lockedEnd.y;
            } else if (wireDragLockStart || wireDragLockEnd) {
                let ax;
                let ay;
                let bx;
                let by;
                if (wireDragLockStart) {
                    ax = wireDragLockStart.x;
                    ay = wireDragLockStart.y;
                } else {
                    ax = n0.x + ddx;
                    ay = n0.y + ddy;
                }
                if (wireDragLockEnd) {
                    bx = wireDragLockEnd.x;
                    by = wireDragLockEnd.y;
                } else {
                    bx = nL.x + ddx;
                    by = nL.y + ddy;
                }
                const hf = wireDragSnapshotHorizFirst;
                wire.points = buildOrthogonalPath(ax, ay, bx, by, hf);
                if (typeof hf === "boolean") {
                    wire.horizFirst = hf;
                } else {
                    delete wire.horizFirst;
                }
                wire.ax = ax;
                wire.ay = ay;
                wire.bx = bx;
                wire.by = by;
            } else {
                const pts = snapPts.map((p) => ({ x: p.x + ddx, y: p.y + ddy }));
                wire.points = pts;
                wire.ax = pts[0].x;
                wire.ay = pts[0].y;
                wire.bx = pts[pts.length - 1].x;
                wire.by = pts[pts.length - 1].y;
            }
        }
        draw();
        return;
    }

    if (!draggedComponentId) {
        return;
    }

    const point = getCanvasPoint(event);
    const worldPoint = screenToWorld(point.x, point.y);
    const component = components.find((item) => item.id === draggedComponentId);
    if (component) {
        const prevX = component.x;
        const prevY = component.y;
        const sx = snapToGrid(worldPoint.x);
        const sy = snapToGrid(worldPoint.y);
        const constrained = constrainComponentMove(component, prevX, prevY, sx, sy);
        if (prevX !== constrained.x || prevY !== constrained.y) {
            component.x = constrained.x;
            component.y = constrained.y;
            syncWiresAfterComponentMove(component, prevX, prevY);
        }
    }

    draw();
});

canvas.addEventListener("dblclick", (event) => {
    if (event.button !== 0) {
        return;
    }

    const point = getCanvasPoint(event);
    const worldPoint = screenToWorld(point.x, point.y);
    const picked = findComponentAt(worldPoint.x, worldPoint.y);
    if (!picked) {
        return;
    }

    selectedComponentId = picked.id;
    editComponentValue(picked);
});

window.addEventListener("resize", resizeCanvas);

document.addEventListener(
    "mousemove",
    (event) => {
        if (activeTool !== "wire" || !pendingWireStart) {
            return;
        }
        updateWirePreviewFromClient(event.clientX, event.clientY);
    },
    { passive: true }
);

window.addEventListener("keydown", (event) => {
    if (event.code === "Space" && activeTool === "wire" && pendingWireStart && pendingWireEnd) {
        // Le keydown n'est pas synchronisé avec le dernier mousemove : mettre à jour l'extrémité et le pointeur monde.
        updateWirePreviewFromClient(lastWireClientX, lastWireClientY);
        const anchor = getPendingWireAnchor();
        if (!anchor) {
            return;
        }
        const ax = anchor.x;
        const ay = anchor.y;
        const bx = pendingWireEnd.x;
        const by = pendingWireEnd.y;
        if (isSamePoint(ax, ay, bx, by)) {
            return;
        }

        event.preventDefault();
        let horizFirst = null;
        if (!isOrthogonalStraight(ax, ay, bx, by)) {
            // Espace doit valider exactement l'angle actuellement affiche.
            // On reutilise donc le meme calcul que le rendu du pointille.
            horizFirst = getPendingWireHorizFirstForDraw();
        }

        appendOrthogonalSegment(pendingWirePoints, anchor, pendingWireEnd, horizFirst);
        const last = pendingWirePoints[pendingWirePoints.length - 1];
        pendingWireEnd = { x: last.x, y: last.y };
        // Nouveau segment : l'angle du prochain L se fixe au premier deplacement diagonal,
        // puis ne change qu'avec un nouvel appui sur Espace.
        pendingWireHorizFirst = null;
        draw();
        return;
    }

    const isCopy = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c";
    const isPaste = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v";
    const isUndo = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z";
    const isRedo = ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") ||
        ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "z");
    const isRotate = !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === "r";
    const isDelete = !event.ctrlKey && !event.metaKey && !event.altKey &&
        (event.key === "Delete" || event.key === "Del");
    const isEscape = event.key === "Escape";

    if (!isCopy && !isPaste && !isUndo && !isRedo && !isRotate && !isDelete && !isEscape) {
        return;
    }

    event.preventDefault();

    if (isCopy) {
        handleCopy();
    } else if (isPaste) {
        handlePaste();
    } else if (isUndo) {
        undo();
    } else if (isRedo) {
        redo();
    } else if (isRotate) {
        rotateSelectedComponent();
    } else if (isDelete) {
        if (selectedWireId) {
            deleteSelectedWire();
        } else {
            deleteSelectedComponent();
        }
    } else if (isEscape) {
        clearPendingWireDraft();
        selectedWireId = null;
        draggedWireId = null;
        wireDragStartWorld = null;
        wireDragSnapshot = null;
        wireDragLockStart = null;
        wireDragLockEnd = null;
        wireDragSnapshotHorizFirst = null;
        if (activeTool === "wire") {
            setActiveTool(null);
        }
        draw();
    }
});

if (simDiagnosticsClear) {
    simDiagnosticsClear.addEventListener("click", () => {
        if (simDiagnosticsAutoHideTimer) {
            clearTimeout(simDiagnosticsAutoHideTimer);
            simDiagnosticsAutoHideTimer = null;
        }
        if (simDiagnosticsList) {
            simDiagnosticsList.innerHTML = "";
        }
        if (simDiagnosticsPanel) {
            simDiagnosticsPanel.classList.remove("is-visible");
        }
    });
}

wireMenuActions();
setupComponentMenuDragAndDrop();
setTheme("dark");
resizeCanvas();
