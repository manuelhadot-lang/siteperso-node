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
let ledColorEditorCompId = null;
let ledAnimRaf = null;
/** @type {Record<string, { time: number[]; current: number[] }>} */
let lastLedTranPlots = {};
let ledTranAnimStartMs = 0;

const LED_DEFAULT_COLOR = "#e53935";
const LED_DEFAULT_IMAX_A = 0.02;
const LED_ON_CURRENT_A = 0.0005;

let components = [];
let history = [];
let redoStack = [];
let selectedId = null;
let selectedWireId = null;
/** Sélection rectangulaire (Shift+glisser) : composants et fils. */
let areaSelection = null;
let isMarqueeSelecting = false;
let marqueeCornerA = null;
let marqueeCornerB = null;
let isMovingAreaSelection = false;
let areaMoveStartWorld = null;
let resistorCount = 0;
let capacitorCount = 0;
let inductorCount = 0;
let diodeCount = 0;
let npnCount = 0;
let opampCount = 0;
let vsourceCount = 0;
let groundCount = 0;
let vtermCount = 0;
let logicStateCount = 0;
let voltmeterCount = 0;
let ammeterCount = 0;
let voltmeterRmsCount = 0;
let ammeterRmsCount = 0;
let ohmmeterCount = 0;
let ledCount = 0;
let lampCount = 0;
let seg7Count = 0;
let lcdCount = 0;
let logicNotCount = 0;
let logicAndCount = 0;
let logicOrCount = 0;
let logicNandCount = 0;
let logicNorCount = 0;
let logicXorCount = 0;
let logicXnorCount = 0;
let logicDbasCount = 0;
let logicJkCount = 0;
let ic74ls00Count = 0;
let ic74ls74Count = 0;
let vsinCount = 0;
let vsquareCount = 0;
let oscilloscopeCount = 0;
const GRID_SIZE = 50;
const GND_BASE_W = GRID_SIZE * 2;
const GND_BASE_H = GRID_SIZE * 2;
/** Point de connexion fil (symbole orientation 0, repère base). */
const GND_CONN_X = GND_BASE_W / 2;
const GND_CONN_Y = 0;
const VTERM_CONN_X = GND_BASE_W / 2;
const VTERM_CONN_Y = GND_BASE_H - GRID_SIZE * 0.35;
const DIODE_BASE_W = GRID_SIZE * 3;
const DIODE_BASE_H = GRID_SIZE;
const OPAMP_BASE_W = GRID_SIZE * 4;
const OPAMP_BASE_H = GRID_SIZE * 2;
/** Portes logiques CEI 60617-12 : 3×4 carreaux (inverseur 3×2), fils 1 carreau hors symbole. */
const LOGIC_GATE_W = GRID_SIZE * 3;
const LOGIC_GATE_H2 = GRID_SIZE * 4;
const LOGIC_GATE_H1 = GRID_SIZE * 2;
const LOGIC_GATE_LEAD = GRID_SIZE;
/** Bascules D / JK (orientation 0 : rectangle 4×4 carreaux, modèle schéma). */
const LOGIC_FF_W = GRID_SIZE * 4;
const LOGIC_FF_H = GRID_SIZE * 4;
const LOGIC_FF_LEAD = GRID_SIZE;
/** Boîtier DIP 14 broches 74HC00 / 74LS00. */
const IC74LS00_W = GRID_SIZE * 3;
const IC74LS00_H = GRID_SIZE * 7;
const IC74LS00_LEAD = GRID_SIZE;
const NPN_BASE_W = GRID_SIZE * 2;
const NPN_BASE_H = GRID_SIZE * 4;
const SIGNAL_GEN_BOX = GRID_SIZE * 2;
const OSC_W = GRID_SIZE * 2;
const OSC_H = GRID_SIZE * 3;
/** Afficheur 7 segments cathode commune : 7 entrées (a–g) à gauche, masse C en bas. */
const SEG7_BASE_W = GRID_SIZE * 4;
const SEG7_BASE_H = GRID_SIZE * 10;
const SEG7_SEGMENT_NAMES = ["a", "b", "c", "d", "e", "f", "g"];
const SEG7_COMMON_IDX = 7;
const SEG7_ON_COLOR = "#e53935";
const SEG7_OFF_COLOR = "#4a1515";
/** Inclinaison italique des segments (comme un vrai afficheur). */
const SEG7_ITALIC_SKEW = -0.2;
const SEG7_PIN_A_Y = GRID_SIZE * 2;
const SEG7_CATHODE_X = GRID_SIZE * 4;
/** Taille du chiffre calée sur un cadre 3 carreaux (cadre élargi = chiffre inchangé). */
const SEG7_DIGIT_REF_FRAME_W = GRID_SIZE * 3;

/** Dernière position monde de la souris (collage à la grille). */
let lastWorldMouse = { x: 0, y: 0 };
/** Copie : { type, vertical, value } (sans id ni position). */
let clipboard = null;

/** Glisser depuis la palette : type en cours. */
let activeDragType = null;
let activeDragModel = null;
/** Type palette conservé jusqu’au drop (dragend peut effacer activeDragType avant drop). */
let paletteDragType = null;
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
    const flag = "\uD83C\uDFC1";
    if (btn) {
        btn.textContent = showEditorGrid
            ? flag + " Grille : active"
            : flag + " Grille : masqu\u00E9e";
    }
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

/** Tolérance pour terminer un fil (curseur ou dernière extrémité du tracé). */
function wireCompleteSlopWorld() {
    return Math.max(hitSlopWorld(), GRID_SIZE * 0.72);
}

let usedJunctionKeys = new Set();

function dist(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
}

function usesFourWayOrient(type) {
    return (
        type === "diode" ||
        type === "led" ||
        type === "lamp" ||
        type === "seg7" ||
        type === "lcd" ||
        type === "logic_not" ||
        type === "logic_and" ||
        type === "logic_or" ||
        type === "logic_nand" ||
        type === "logic_nor" ||
        type === "logic_xor" ||
        type === "logic_xnor" ||
        type === "logic_dff" ||
        type === "logic_jk" ||
        type === "ic_74ls00" ||
        type === "ic_74ls74" ||
        type === "npn" ||
        type === "opamp" ||
        type === "ground" ||
        type === "vterm" ||
        type === "logic_state"
    );
}

function isGroundType(t) {
    return t === "ground";
}

function isVtermType(t) {
    return t === "vterm";
}

function isLogicStateType(t) {
    return t === "logic_state";
}

function isSingleTerminalRefType(t) {
    return isGroundType(t) || isVtermType(t) || isLogicStateType(t);
}

/** Affichage 0 ou 1 pour une borne d’état logique. */
function normalizeLogicStateDisplay(val) {
    const t = String(val ?? "")
        .trim()
        .toLowerCase();
    if (t === "1" || t === "haut" || t === "high" || t === "true" || t === "on" || t === "vcc") return "1";
    return "0";
}

/** Rail logique 3,3 V ou 5 V (propriété composant logicRail). */
function parseLogicRail(rail) {
    if (rail == null || rail === "") return 5;
    const n = parseFloat(String(rail).replace(",", "."));
    return Number.isFinite(n) && Math.abs(n - 3.3) < 0.05 ? 3.3 : 5;
}

function toggleLogicRail(rail) {
    return parseLogicRail(rail) === 3.3 ? 5 : 3.3;
}

function formatLogicRailShort(rail) {
    return parseLogicRail(rail) === 3.3 ? "3,3 V" : "5 V";
}

function ensureLogicRailField(c) {
    if (!c || (c.type !== "logic_state" && !isLogicFamilyType(c.type))) return;
    if (c.logicRail == null || c.logicRail === "") c.logicRail = 5;
}

function isLedType(t) {
    return t === "led";
}

function isOptoPlaceholderType(t) {
    return t === "lamp" || t === "lcd";
}

function isSeg7Type(t) {
    return t === "seg7";
}

function isOptoTwoTerminalType(t) {
    return isLedType(t) || isOptoPlaceholderType(t);
}

function isLogicNotType(t) {
    return t === "logic_not";
}

function isLogicGateType(t) {
    return (
        t === "logic_not" ||
        t === "logic_and" ||
        t === "logic_or" ||
        t === "logic_nand" ||
        t === "logic_nor" ||
        t === "logic_xor" ||
        t === "logic_xnor"
    );
}

function isLogicFlipFlopType(t) {
    return t === "logic_dff" || t === "logic_jk";
}

function isIc74ls00Type(t) {
    return t === "ic_74ls00";
}

function isIc74ls74Type(t) {
    return t === "ic_74ls74";
}

function isLogicIcType(t) {
    return isIc74ls00Type(t) || isIc74ls74Type(t);
}

function isLogicFamilyType(t) {
    return isLogicGateType(t) || isLogicFlipFlopType(t) || isLogicIcType(t);
}

function logicGateKind(t) {
    switch (t) {
        case "logic_not":
            return { iec: "1", invert: true, inputs: 1 };
        case "logic_and":
            return { iec: "&", invert: false, inputs: 2 };
        case "logic_or":
            return { iec: "\u22651", invert: false, inputs: 2 };
        case "logic_nand":
            return { iec: "&", invert: true, inputs: 2 };
        case "logic_nor":
            return { iec: "\u22651", invert: true, inputs: 2 };
        case "logic_xor":
            return { iec: "=1", invert: false, inputs: 2 };
        case "logic_xnor":
            return { iec: "=1", invert: true, inputs: 2 };
        default:
            return { iec: "?", invert: false, inputs: 2 };
    }
}

function logicGateBaseH(type) {
    return isLogicNotType(type) ? LOGIC_GATE_H1 : LOGIC_GATE_H2;
}

function logicGateDimsFromOrient(orient, type) {
    const o = ((orient % 4) + 4) % 4;
    const bw = LOGIC_GATE_W;
    const bh = logicGateBaseH(type);
    const wide = o === 0 || o === 2;
    return { w: wide ? bw : bh, h: wide ? bh : bw };
}

function logicGateJunctionsWorld(c) {
    const g = GRID_SIZE;
    const bw = LOGIC_GATE_W;
    const bh = logicGateBaseH(c.type);
    const kind = logicGateKind(c.type);
    const lead = LOGIC_GATE_LEAD;
    const points =
        kind.inputs === 1
            ? [
                  [-lead, bh / 2],
                  [bw + lead, bh / 2],
              ]
            : [
                  [-lead, g],
                  [-lead, 3 * g],
                  [bw + lead, 2 * g],
              ];
    return junctionsFromLocalBase(c, points, bw, bh);
}

function snapLogicGateDropWorld(wx, wy, type, orient, mirrorX = false, mirrorY = false) {
    const bh = logicGateBaseH(type);
    const g = GRID_SIZE;
    const lead = LOGIC_GATE_LEAD;
    const anchorY = isLogicNotType(type) ? bh / 2 : g;
    return snapByLocalJunction(type, wx, wy, orient, -lead, anchorY, LOGIC_GATE_W, bh, mirrorX, mirrorY);
}

function snapLogicGateComponent(comp) {
    const bh = logicGateBaseH(comp.type);
    const g = GRID_SIZE;
    const lead = LOGIC_GATE_LEAD;
    const anchorY = isLogicNotType(comp.type) ? bh / 2 : g;
    const jb = localBaseToWorld(comp, -lead, anchorY, LOGIC_GATE_W, bh);
    const p = snapLogicGateDropWorld(
        jb.x,
        jb.y,
        comp.type,
        getCompOrient(comp),
        !!comp.mirrorX,
        !!comp.mirrorY
    );
    comp.x = p.x;
    comp.y = p.y;
}

function logicFlipFlopBaseH(type) {
    return LOGIC_FF_H;
}

function logicFlipFlopDimsFromOrient(orient, type) {
    const o = ((orient % 4) + 4) % 4;
    const bw = LOGIC_FF_W;
    const bh = logicFlipFlopBaseH(type);
    const wide = o === 0 || o === 2;
    return { w: wide ? bw : bh, h: wide ? bh : bw };
}

function logicFlipFlopPinLocalY(type, pinIndex) {
    const g = GRID_SIZE;
    if (type === "logic_dff") {
        if (pinIndex === 0) return g;
        if (pinIndex === 1) return 3 * g;
        if (pinIndex === 2) return 2 * g;
        if (pinIndex === 3) return 3 * g;
        return 2 * g;
    }
    if (pinIndex === 0) return g;
    if (pinIndex === 1) return 2 * g;
    if (pinIndex === 2) return 3 * g;
    if (pinIndex === 3) return g;
    if (pinIndex === 4) return 3 * g;
    return g;
}

function logicFlipFlopOutputPinIndices(type) {
    return type === "logic_dff" ? [2, 3] : [3, 4];
}

function logicFlipFlopLocalPoints(type) {
    const g = GRID_SIZE;
    const bw = LOGIC_FF_W;
    const lead = LOGIC_FF_LEAD;
    if (type === "logic_dff") {
        return [
            [-lead, g],
            [-lead, 3 * g],
            [bw + lead, 2 * g],
            [bw + lead, 3 * g],
        ];
    }
    return [
        [-lead, g],
        [-lead, 2 * g],
        [-lead, 3 * g],
        [bw + lead, g],
        [bw + lead, 3 * g],
    ];
}

function logicFlipFlopJunctionsWorld(c) {
    const bh = logicFlipFlopBaseH(c.type);
    return junctionsFromLocalBase(c, logicFlipFlopLocalPoints(c.type), LOGIC_FF_W, bh);
}

function snapLogicFlipFlopDropWorld(wx, wy, type, orient, mirrorX = false, mirrorY = false) {
    const g = GRID_SIZE;
    const lead = LOGIC_FF_LEAD;
    return snapByLocalJunction(type, wx, wy, orient, -lead, g, LOGIC_FF_W, LOGIC_FF_H, mirrorX, mirrorY);
}

function snapLogicFlipFlopComponent(comp) {
    const g = GRID_SIZE;
    const jb = localBaseToWorld(comp, -LOGIC_FF_LEAD, g, LOGIC_FF_W, LOGIC_FF_H);
    const p = snapLogicFlipFlopDropWorld(
        jb.x,
        jb.y,
        comp.type,
        getCompOrient(comp),
        !!comp.mirrorX,
        !!comp.mirrorY
    );
    comp.x = p.x;
    comp.y = p.y;
}

function ic74ls00PinY(pinIndex) {
    const g = GRID_SIZE;
    if (pinIndex <= 6) return g * (pinIndex + 0.5);
    return g * (13 - pinIndex + 0.5);
}

function ic74ls00PinX(pinIndex) {
    return pinIndex <= 6 ? 0 : IC74LS00_W;
}

function ic74ls00LocalPoints() {
    const lead = IC74LS00_LEAD;
    const bw = IC74LS00_W;
    const pts = [];
    for (let i = 0; i < 14; i++) {
        const py = ic74ls00PinY(i);
        const left = ic74ls00PinX(i) <= 0;
        pts.push([left ? -lead : bw + lead, py]);
    }
    return pts;
}

function ic74ls00DimsFromOrient(orient) {
    const o = ((orient % 4) + 4) % 4;
    const wide = o === 0 || o === 2;
    return { w: wide ? IC74LS00_W : IC74LS00_H, h: wide ? IC74LS00_H : IC74LS00_W };
}

function ic74ls00JunctionsWorld(c) {
    return junctionsFromLocalBase(c, ic74ls00LocalPoints(), IC74LS00_W, IC74LS00_H);
}

function snapIc74ls00DropWorld(wx, wy, orient, mirrorX = false, mirrorY = false) {
    return snapByLocalJunction(
        "ic_74ls00",
        wx,
        wy,
        orient,
        -IC74LS00_LEAD,
        ic74ls00PinY(0),
        IC74LS00_W,
        IC74LS00_H,
        mirrorX,
        mirrorY
    );
}

function snapIc74ls00Component(comp) {
    const jb = localBaseToWorld(comp, -IC74LS00_LEAD, ic74ls00PinY(0), IC74LS00_W, IC74LS00_H);
    const p = snapIc74ls00DropWorld(jb.x, jb.y, getCompOrient(comp), !!comp.mirrorX, !!comp.mirrorY);
    comp.x = p.x;
    comp.y = p.y;
}

function seg7DimsFromOrient(orient) {
    const o = ((orient % 4) + 4) % 4;
    const wide = o === 0 || o === 2;
    return { w: wide ? SEG7_BASE_W : SEG7_BASE_H, h: wide ? SEG7_BASE_H : SEG7_BASE_W };
}

function seg7FrameBoxLocal() {
    const g = GRID_SIZE;
    const pinTop = SEG7_PIN_A_Y;
    const pinBot = SEG7_PIN_A_Y + 6 * g;
    return {
        x: g,
        y: pinTop - g,
        w: g * 4,
        h: pinBot - pinTop + 2 * g,
    };
}

function seg7PinY(i) {
    return SEG7_PIN_A_Y + i * GRID_SIZE;
}

function seg7CommonXLocal() {
    return SEG7_CATHODE_X;
}

function seg7CommonYLocal() {
    const frame = seg7FrameBoxLocal();
    return frame.y + frame.h + GRID_SIZE;
}

function seg7InnerBoxLocal() {
    const outer = seg7FrameBoxLocal();
    const g = GRID_SIZE;
    const padX = g * 0.42;
    const digitW = SEG7_DIGIT_REF_FRAME_W - 2 * padX;
    const digitH = outer.h * 0.62;
    return {
        x: outer.x + (outer.w - digitW) / 2,
        y: outer.y + (outer.h - digitH) / 2,
        w: digitW,
        h: digitH,
    };
}

function seg7PinLocalPoints() {
    const pts = [];
    for (let i = 0; i < 7; i++) pts.push([0, seg7PinY(i)]);
    pts.push([seg7CommonXLocal(), seg7CommonYLocal()]);
    return pts;
}

function seg7JunctionsWorld(c) {
    return junctionsFromLocalBase(c, seg7PinLocalPoints(), SEG7_BASE_W, SEG7_BASE_H);
}

function snapSeg7DropWorld(wx, wy, orient, mirrorX = false, mirrorY = false) {
    return snapByLocalJunction(
        "seg7",
        wx,
        wy,
        orient,
        0,
        seg7PinY(0),
        SEG7_BASE_W,
        SEG7_BASE_H,
        mirrorX,
        mirrorY
    );
}

function snapSeg7Component(comp) {
    const jb = localBaseToWorld(comp, 0, seg7PinY(0), SEG7_BASE_W, SEG7_BASE_H);
    const p = snapSeg7DropWorld(jb.x, jb.y, getCompOrient(comp), !!comp.mirrorX, !!comp.mirrorY);
    comp.x = p.x;
    comp.y = p.y;
}

function singleTerminalDimsFromOrient(orient) {
    const o = ((orient % 4) + 4) % 4;
    const tall = o === 0 || o === 2;
    return { w: tall ? GND_BASE_W : GND_BASE_H, h: tall ? GND_BASE_H : GND_BASE_W };
}

function singleTerminalConnLocal(type) {
    return isGroundType(type)
        ? [GND_CONN_X, GND_CONN_Y]
        : [VTERM_CONN_X, VTERM_CONN_Y];
}

function singleTerminalJunctionsWorld(c) {
    const [bx, by] = singleTerminalConnLocal(c.type);
    return junctionsFromLocalBase(c, [[bx, by]], GND_BASE_W, GND_BASE_H);
}

function snapSingleTerminalDropWorld(wx, wy, type, orient) {
    const [bx, by] = singleTerminalConnLocal(type);
    return snapByLocalJunction(type, wx, wy, orient, bx, by, GND_BASE_W, GND_BASE_H);
}

function snapSingleTerminalComponent(comp) {
    const j = singleTerminalJunctionsWorld(comp)[0];
    const p = snapSingleTerminalDropWorld(j.x, j.y, comp.type, getCompOrient(comp));
    comp.x = p.x;
    comp.y = p.y;
}

function twoTerminalAnodeOffset(orient) {
    const o = ((orient % 4) + 4) % 4;
    const { w, h } = twoTerminalDimsFromOrient(o);
    if (o === 0) return { dx: 0, dy: h / 2 };
    if (o === 1) return { dx: w / 2, dy: 0 };
    if (o === 2) return { dx: w, dy: h / 2 };
    return { dx: w / 2, dy: h };
}

function opampDimsFromOrient(orient) {
    const o = ((orient % 4) + 4) % 4;
    const wide = o === 0 || o === 2;
    return { w: wide ? OPAMP_BASE_W : OPAMP_BASE_H, h: wide ? OPAMP_BASE_H : OPAMP_BASE_W };
}

function getCompOrient(c) {
    if (c.orient != null && c.orient >= 0 && c.orient <= 3) return c.orient | 0;
    return c.vertical ? 1 : 0;
}

function syncVerticalFromOrient(c) {
    const o = getCompOrient(c);
    c.orient = o;
    c.vertical = o === 1 || o === 3;
}

function cycleCompOrient(c) {
    c.orient = (getCompOrient(c) + 1) % 4;
    syncVerticalFromOrient(c);
}

function twoTerminalDimsFromOrient(orient) {
    const o = ((orient % 4) + 4) % 4;
    const wide = o === 0 || o === 2;
    return { w: wide ? GRID_SIZE * 3 : GRID_SIZE, h: wide ? GRID_SIZE : GRID_SIZE * 3 };
}

function npnDimsFromOrient(orient) {
    const o = ((orient % 4) + 4) % 4;
    const tall = o === 0 || o === 2;
    return { w: tall ? GRID_SIZE * 2 : GRID_SIZE * 4, h: tall ? GRID_SIZE * 4 : GRID_SIZE * 2 };
}

function componentDims(c) {
    if (isSeg7Type(c.type)) return seg7DimsFromOrient(getCompOrient(c));
    if (isOpampType(c.type)) return opampDimsFromOrient(getCompOrient(c));
    if (isLogicGateType(c.type)) return logicGateDimsFromOrient(getCompOrient(c), c.type);
    if (isLogicFlipFlopType(c.type)) return logicFlipFlopDimsFromOrient(getCompOrient(c), c.type);
    if (isLogicIcType(c.type)) return ic74ls00DimsFromOrient(getCompOrient(c));
    if (isNpnType(c.type)) return npnDimsFromOrient(getCompOrient(c));
    if (isSingleTerminalRefType(c.type)) return singleTerminalDimsFromOrient(getCompOrient(c));
    if (isTwoTerminalType(c.type)) return twoTerminalDimsFromOrient(getCompOrient(c));
    return { w: GRID_SIZE, h: GRID_SIZE };
}

function twoTerminalJunctionsWorld(c) {
    const o = getCompOrient(c);
    const { w, h } = twoTerminalDimsFromOrient(o);
    let pts;
    if (o === 0) pts = [{ x: 0, y: h / 2 }, { x: w, y: h / 2 }];
    else if (o === 1) pts = [{ x: w / 2, y: 0 }, { x: w / 2, y: h }];
    else if (o === 2) pts = [{ x: w, y: h / 2 }, { x: 0, y: h / 2 }];
    else pts = [{ x: w / 2, y: h }, { x: w / 2, y: 0 }];
    return pts.map((p, i) => ({
        x: c.x + p.x,
        y: c.y + p.y,
        key: `${c.id}#${i}`,
    }));
}

/** Point repère (orientation 0) → monde : miroirs locaux puis rotation centrée comme le dessin. */
function localBaseToWorld(c, bx, by, baseW, baseH) {
    const o = getCompOrient(c);
    const { w, h } = componentDims(c);
    let lx = bx - baseW / 2;
    let ly = by - baseH / 2;
    if (c.mirrorX) lx = -lx;
    if (c.mirrorY) ly = -ly;
    const rad = (-o * Math.PI) / 2;
    const rx = lx * Math.cos(rad) - ly * Math.sin(rad);
    const ry = lx * Math.sin(rad) + ly * Math.cos(rad);
    return { x: c.x + w / 2 + rx, y: c.y + h / 2 + ry };
}

function junctionsFromLocalBase(c, points, baseW, baseH) {
    return points.map((p, i) => {
        const w = localBaseToWorld(c, p[0], p[1], baseW, baseH);
        return { x: w.x, y: w.y, key: `${c.id}#${i}` };
    });
}

function snapByLocalJunction(type, wx, wy, orient, bx, by, baseW, baseH, mirrorX = false, mirrorY = false) {
    const fake = { type, x: 0, y: 0, orient, mirrorX, mirrorY };
    const p = localBaseToWorld(fake, bx, by, baseW, baseH);
    const snappedTx = Math.round(wx / GRID_SIZE) * GRID_SIZE;
    const snappedTy = Math.round(wy / GRID_SIZE) * GRID_SIZE;
    return { x: snappedTx - p.x, y: snappedTy - p.y };
}

function npnJunctionsWorld(c) {
    const g = GRID_SIZE;
    return junctionsFromLocalBase(
        c,
        [
            [0, NPN_BASE_H / 2],
            [NPN_BASE_W, g],
            [NPN_BASE_W, 3 * g],
        ],
        NPN_BASE_W,
        NPN_BASE_H
    );
}

function snapTwoTerminalDropWorld(wx, wy, orient) {
    const o = ((orient % 4) + 4) % 4;
    const half = GRID_SIZE / 2;
    const snappedTx = Math.round(wx / GRID_SIZE) * GRID_SIZE;
    const snappedTy = Math.round(wy / GRID_SIZE) * GRID_SIZE;
    if (o === 0) return { x: snappedTx, y: snappedTy - half };
    if (o === 1) return { x: snappedTx - half, y: snappedTy };
    if (o === 2) return { x: snappedTx - GRID_SIZE * 3, y: snappedTy - half };
    return { x: snappedTx - half, y: snappedTy - GRID_SIZE * 3 };
}

function snapNpnDropWorld(wx, wy, orient, mirrorX = false, mirrorY = false) {
    return snapByLocalJunction(
        "npn",
        wx,
        wy,
        orient,
        0,
        NPN_BASE_H / 2,
        NPN_BASE_W,
        NPN_BASE_H,
        mirrorX,
        mirrorY
    );
}

function junctionEndpointsForComponent(c) {
    if (isOscilloscopeType(c.type)) {
        return oscilloscopeJunctionsWorld(c);
    }
    if (isSignalGeneratorType(c.type)) {
        const mirrorX = !!c.mirrorX;
        if (!mirrorX) {
            return [
                { x: c.x - GRID_SIZE, y: c.y + GRID_SIZE, key: `${c.id}#0` },
                { x: c.x + GRID_SIZE, y: c.y + 3 * GRID_SIZE, key: `${c.id}#1` },
            ];
        }
        return [
            { x: c.x + 3 * GRID_SIZE, y: c.y + GRID_SIZE, key: `${c.id}#0` },
            { x: c.x + GRID_SIZE, y: c.y + 3 * GRID_SIZE, key: `${c.id}#1` },
        ];
    }
    if (isNpnType(c.type)) return npnJunctionsWorld(c);
    if (isOpampType(c.type)) return opampJunctionsWorld(c);
    if (isLogicGateType(c.type)) return logicGateJunctionsWorld(c);
    if (isLogicFlipFlopType(c.type)) return logicFlipFlopJunctionsWorld(c);
    if (isLogicIcType(c.type)) return ic74ls00JunctionsWorld(c);
    if (isSeg7Type(c.type)) return seg7JunctionsWorld(c);
    if (isSingleTerminalRefType(c.type)) return singleTerminalJunctionsWorld(c);
    return twoTerminalJunctionsWorld(c);
}

function opampJunctionsWorld(c) {
    const g = GRID_SIZE;
    return junctionsFromLocalBase(
        c,
        [
            [0, 0],
            [0, 2 * g],
            [OPAMP_BASE_W, g],
        ],
        OPAMP_BASE_W,
        OPAMP_BASE_H
    );
}

function snapOpampDropWorld(wx, wy, orient, mirrorX = false, mirrorY = false) {
    return snapByLocalJunction("opamp", wx, wy, orient, 0, 0, OPAMP_BASE_W, OPAMP_BASE_H, mirrorX, mirrorY);
}

function snapOpampComponent(comp) {
    const jb = localBaseToWorld(comp, 0, 0, OPAMP_BASE_W, OPAMP_BASE_H);
    const p = snapOpampDropWorld(jb.x, jb.y, getCompOrient(comp), !!comp.mirrorX, !!comp.mirrorY);
    comp.x = p.x;
    comp.y = p.y;
}

/** Clé stable pour une jonction en T (connexion entre fils, sans borne de composant). */
function teeVirtualKey(px, py) {
    const g = snapPointToGrid({ x: px, y: py });
    return `__t#${g.x}#${g.y}`;
}

/** Extrémité libre (fil figé sans 2e borne au moment de commencer un autre). */
function floatingEndKey(px, py) {
    const g = snapPointToGrid({ x: px, y: py });
    return `__p#${g.x}#${g.y}`;
}

/** Clé de jonction cohérente (borne, T, extrémité flottante) au même point grille. */
function resolveJunctionKeyAt(x, y) {
    const g = snapPointToGrid({ x, y });
    for (const c of components) {
        if (!isSchematicTerminalType(c.type)) continue;
        for (const j of junctionEndpointsForComponent(c)) {
            if (sameXY(j, g)) return j.key;
        }
    }
    for (const p of teeWirePoints) {
        if (sameXY(p, g)) return teeVirtualKey(p.x, p.y);
    }
    for (const w of wires) {
        if (!w.solid || !w.points || w.points.length < 2) continue;
        const ends = [
            { key: w.fromKey, pt: w.points[0] },
            { key: w.toKey, pt: w.points[w.points.length - 1] },
        ];
        for (const e of ends) {
            if (!e.key || !e.key.startsWith("__p#")) continue;
            if (sameXY(e.pt, g)) return e.key;
        }
    }
    return floatingEndKey(g.x, g.y);
}

function hasAreaSelection() {
    return (
        areaSelection &&
        (areaSelection.compIds.size > 0 || areaSelection.wireIds.size > 0)
    );
}

function clearAreaSelection() {
    areaSelection = null;
}

function compIsInAreaSelection(id) {
    return areaSelection != null && areaSelection.compIds.has(id);
}

function wireIsInAreaSelection(id) {
    return areaSelection != null && areaSelection.wireIds.has(id);
}

function normalizeMarqueeRect(a, b) {
    return {
        x0: Math.min(a.x, b.x),
        y0: Math.min(a.y, b.y),
        x1: Math.max(a.x, b.x),
        y1: Math.max(a.y, b.y),
    };
}

function pointInRect(p, r) {
    return p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;
}

function segmentIntersectsRect(a, b, r) {
    const minx = Math.min(a.x, b.x);
    const maxx = Math.max(a.x, b.x);
    const miny = Math.min(a.y, b.y);
    const maxy = Math.max(a.y, b.y);
    if (maxx < r.x0 || minx > r.x1 || maxy < r.y0 || miny > r.y1) return false;
    if (Math.abs(a.y - b.y) < W_EPS) {
        return a.y >= r.y0 && a.y <= r.y1 && maxx >= r.x0 && minx <= r.x1;
    }
    if (Math.abs(a.x - b.x) < W_EPS) {
        return a.x >= r.x0 && a.x <= r.x1 && maxy >= r.y0 && miny <= r.y1;
    }
    return false;
}

function rectIntersectsComponent(rect, c) {
    const { w, h } = componentDims(c);
    return !(c.x + w < rect.x0 || c.x > rect.x1 || c.y + h < rect.y0 || c.y > rect.y1);
}

function rectIntersectsWire(rect, w) {
    if (!w.solid || !w.points || w.points.length < 2) return false;
    for (let i = 0; i < w.points.length - 1; i++) {
        const a = w.points[i];
        const b = w.points[i + 1];
        if (pointInRect(a, rect) || pointInRect(b, rect)) return true;
        if (segmentIntersectsRect(a, b, rect)) return true;
    }
    return false;
}

function finalizeMarqueeSelection() {
    if (!marqueeCornerA || !marqueeCornerB) {
        isMarqueeSelecting = false;
        return;
    }
    const rect = normalizeMarqueeRect(marqueeCornerA, marqueeCornerB);
    if (rect.x1 - rect.x0 < 4 && rect.y1 - rect.y0 < 4) {
        isMarqueeSelecting = false;
        marqueeCornerA = null;
        marqueeCornerB = null;
        return;
    }
    const compIds = new Set();
    const wireIds = new Set();
    for (const c of components) {
        if (rectIntersectsComponent(rect, c)) compIds.add(c.id);
    }
    for (const w of wires) {
        if (rectIntersectsWire(rect, w)) wireIds.add(w.id);
    }
    if (compIds.size > 0 || wireIds.size > 0) {
        areaSelection = { compIds, wireIds };
        selectedId = null;
        selectedWireId = null;
    }
    isMarqueeSelecting = false;
    marqueeCornerA = null;
    marqueeCornerB = null;
}

function hitAreaSelectionAtWorld(wx, wy) {
    if (!hasAreaSelection()) return false;
    for (const id of areaSelection.compIds) {
        const c = components.find(x => x.id === id);
        if (!c) continue;
        const { w, h } = componentDims(c);
        if (wx >= c.x && wx <= c.x + w && wy >= c.y && wy <= c.y + h) return true;
    }
    const slop = hitSlopWorld();
    for (const id of areaSelection.wireIds) {
        const w = wires.find(x => x.id === id);
        if (!w || !w.solid || !w.points || w.points.length < 2) continue;
        for (let i = 0; i < w.points.length - 1; i++) {
            const a = w.points[i];
            const b = w.points[i + 1];
            if (distPointToSegment(wx, wy, a.x, a.y, b.x, b.y) <= slop) return true;
        }
    }
    return false;
}

function beginAreaSelectionMove(worldPos) {
    isMovingAreaSelection = true;
    areaMoveStartWorld = { x: worldPos.x, y: worldPos.y };
    lastMousePos = worldPos;
    dragStartClient = null;
}

function moveAreaSelectionBy(dx, dy) {
    if (!hasAreaSelection()) return;
    for (const id of areaSelection.compIds) {
        const c = components.find(x => x.id === id);
        if (c) {
            c.x += dx;
            c.y += dy;
        }
    }
    for (const id of areaSelection.wireIds) {
        const w = wires.find(x => x.id === id);
        if (!w || !w.points) continue;
        for (const p of w.points) {
            p.x += dx;
            p.y += dy;
        }
    }
}

function snapAreaSelectionAfterMove() {
    if (!hasAreaSelection()) return;
    for (const id of areaSelection.compIds) {
        const c = components.find(x => x.id === id);
        if (!c) continue;
        if (isOscilloscopeType(c.type)) snapOscilloscopeComponent(c);
        else if (isSignalGeneratorType(c.type)) snapSignalGeneratorComponent(c);
        else if (isNpnType(c.type)) snapNpnComponent(c);
        else if (isOpampType(c.type)) snapOpampComponent(c);
        else if (isLogicGateType(c.type)) snapLogicGateComponent(c);
        else if (isLogicFlipFlopType(c.type)) snapLogicFlipFlopComponent(c);
        else if (isLogicIcType(c.type)) snapIc74ls00Component(c);
        else if (isSeg7Type(c.type)) snapSeg7Component(c);
        else if (isSingleTerminalRefType(c.type)) snapSingleTerminalComponent(c);
        else if (isTwoTerminalType(c.type)) snapTwoTerminalComponent(c);
        else {
            c.x = Math.round(c.x / GRID_SIZE) * GRID_SIZE;
            c.y = Math.round(c.y / GRID_SIZE) * GRID_SIZE;
        }
    }
    for (const id of areaSelection.wireIds) {
        const w = wires.find(x => x.id === id);
        if (!w || !w.points) continue;
        w.points = orthogonalizeWirePoints(w.points);
    }
    rebuildUsedJunctionKeys();
}

function deleteAreaSelection() {
    if (!hasAreaSelection()) return;
    wires = wires.filter(w => !areaSelection.wireIds.has(w.id));
    for (const id of areaSelection.compIds) {
        pruneWiresForComponent(id);
    }
    components = components.filter(c => !areaSelection.compIds.has(c.id));
    clearAreaSelection();
    syncCountersFromComponents();
    rebuildUsedJunctionKeys();
}

/** Composant le plus au-dessus sous le curseur (pour déplacement). */
function signalGeneratorHitBounds(c) {
    const mirrorX = !!c.mirrorX;
    const x0 = mirrorX ? c.x : c.x - GRID_SIZE;
    const x1 = mirrorX ? c.x + 3 * GRID_SIZE : c.x + 2 * GRID_SIZE;
    const y1 = c.y + 3 * GRID_SIZE;
    return { x0, y0: c.y, x1, y1 };
}

function oscilloscopeHitBounds(c) {
    const mirrorX = !!c.mirrorX;
    const x0 = mirrorX ? c.x : c.x - GRID_SIZE;
    const x1 = mirrorX ? c.x + 3 * GRID_SIZE : c.x + 2 * GRID_SIZE;
    const y1 = c.y + 4 * GRID_SIZE;
    return { x0, y0: c.y, x1, y1 };
}

/** Bornes monde : #0 CH1, #1 CH2, #2 masse commune (flip X par défaut = jonctions à gauche). */
function oscilloscopeJunctionsWorld(c) {
    const mirrorX = !!c.mirrorX;
    if (!mirrorX) {
        return [
            { x: c.x - GRID_SIZE, y: c.y + GRID_SIZE, key: `${c.id}#0` },
            { x: c.x - GRID_SIZE, y: c.y + 2 * GRID_SIZE, key: `${c.id}#1` },
            { x: c.x + GRID_SIZE, y: c.y + 4 * GRID_SIZE, key: `${c.id}#2` },
        ];
    }
    return [
        { x: c.x + 3 * GRID_SIZE, y: c.y + GRID_SIZE, key: `${c.id}#0` },
        { x: c.x + 3 * GRID_SIZE, y: c.y + 2 * GRID_SIZE, key: `${c.id}#1` },
        { x: c.x + GRID_SIZE, y: c.y + 4 * GRID_SIZE, key: `${c.id}#2` },
    ];
}

function findTopComponentAtWorld(wx, wy) {
    for (let i = components.length - 1; i >= 0; i--) {
        const c = components[i];
        if (isOscilloscopeType(c.type)) {
            const b = oscilloscopeHitBounds(c);
            if (wx >= b.x0 && wx <= b.x1 && wy >= b.y0 && wy <= b.y1) return c;
            continue;
        }
        if (isSignalGeneratorType(c.type)) {
            const b = signalGeneratorHitBounds(c);
            if (wx >= b.x0 && wx <= b.x1 && wy >= b.y0 && wy <= b.y1) return c;
            continue;
        }
        if (
            !isTwoTerminalType(c.type) &&
            !isNpnType(c.type) &&
            !isOpampType(c.type) &&
            !isLogicFamilyType(c.type) &&
            !isSeg7Type(c.type) &&
            !isSingleTerminalRefType(c.type)
        )
            continue;
        const { w, h } = componentDims(c);
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

function forEachConnectableJunction(fn, excludeKey) {
    for (const c of components) {
        if (!isSchematicTerminalType(c.type)) continue;
        for (const j of junctionEndpointsForComponent(c)) {
            if (j.key !== excludeKey) fn(j);
        }
    }
    for (const p of teeWirePoints) {
        const j = { x: p.x, y: p.y, key: teeVirtualKey(p.x, p.y) };
        if (j.key !== excludeKey) fn(j);
    }
    for (const w of wires) {
        if (!w.solid || !w.points || w.points.length < 2) continue;
        const ends = [
            { key: w.fromKey, x: w.points[0].x, y: w.points[0].y },
            { key: w.toKey, x: w.points[w.points.length - 1].x, y: w.points[w.points.length - 1].y },
        ];
        for (const e of ends) {
            if (!e.key || !e.key.startsWith("__p#")) continue;
            if (e.key !== excludeKey) fn(e);
        }
    }
}

/** Bornes prioritaires : composants d'abord, puis T entre fils, puis extrémités flottantes.
 *  Évite qu'un point flottant d'un ancien tracé "vole" un clic destiné à une vraie borne. */
function findJunctionNearWorld(wx, wy) {
    const slop = hitSlopWorld();
    let best = null;
    let bestD = Infinity;

    for (const c of components) {
        if (!isSchematicTerminalType(c.type)) continue;
        for (const j of junctionEndpointsForComponent(c)) {
            const d = dist(wx, wy, j.x, j.y);
            if (d <= slop && d < bestD) {
                bestD = d;
                best = j;
            }
        }
    }
    if (best) return best;

    for (const p of teeWirePoints) {
        const d = dist(wx, wy, p.x, p.y);
        if (d <= slop && d < bestD) {
            bestD = d;
            best = { x: p.x, y: p.y, key: teeVirtualKey(p.x, p.y) };
        }
    }
    if (best) return best;

    for (const w of wires) {
        if (!w.solid || !w.points || w.points.length < 2) continue;
        const ends = [
            { key: w.fromKey, x: w.points[0].x, y: w.points[0].y },
            { key: w.toKey, x: w.points[w.points.length - 1].x, y: w.points[w.points.length - 1].y },
        ];
        for (const e of ends) {
            if (!e.key || !e.key.startsWith("__p#")) continue;
            const d = dist(wx, wy, e.x, e.y);
            if (d <= slop && d < bestD) {
                bestD = d;
                best = { x: e.x, y: e.y, key: e.key };
            }
        }
    }
    return best;
}

function closestPointOnOrthogonalSegment(px, py, a, b) {
    if (Math.abs(a.y - b.y) < W_EPS) {
        const minx = Math.min(a.x, b.x);
        const maxx = Math.max(a.x, b.x);
        return { x: Math.max(minx, Math.min(maxx, px)), y: a.y };
    }
    if (Math.abs(a.x - b.x) < W_EPS) {
        const miny = Math.min(a.y, b.y);
        const maxy = Math.max(a.y, b.y);
        return { x: a.x, y: Math.max(miny, Math.min(maxy, py)) };
    }
    return null;
}

function rebuildUsedJunctionKeys() {
    for (const w of wires) {
        if (w.solid && w.points && w.points.length >= 2) {
            w.points = orthogonalizeWirePoints(w.points);
        }
    }
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

function snapPointToGrid(p) {
    return {
        x: Math.round(p.x / GRID_SIZE) * GRID_SIZE,
        y: Math.round(p.y / GRID_SIZE) * GRID_SIZE,
    };
}

/** Aligne tous les sommets sur la grille et supprime les segments diagonaux (coude Manhattan). */
function orthogonalizeWirePoints(points) {
    if (!points || points.length < 2) return points || [];
    const out = [snapPointToGrid(points[0])];
    for (let i = 1; i < points.length; i++) {
        const b = snapPointToGrid(points[i]);
        const a = out[out.length - 1];
        if (a.x !== b.x && a.y !== b.y) {
            out.push({ x: b.x, y: a.y });
        }
        if (!sameXY(out[out.length - 1], b)) out.push(b);
    }
    return out;
}

function selectPlacedComponent(comp) {
    if (!comp) return;
    clearAreaSelection();
    selectedId = comp.id;
    selectedWireId = null;
    closeGeneratorInspector();
}

function wireGridKey(p) {
    const g = snapPointToGrid(p);
    return `${g.x},${g.y}`;
}

/** Sommet d'un fil existant proche (coudes, extrémités de segments) — pour accrocher un T. */
function snapToNearbyWireVertex(px, py, excludeWireId, slop) {
    let best = null;
    let bestD = Infinity;
    for (const w of wires) {
        if (!w.solid || !w.points || w.points.length < 2) continue;
        if (w.id === excludeWireId) continue;
        for (const p of w.points) {
            const d = dist(px, py, p.x, p.y);
            if (d <= slop && d < bestD) {
                bestD = d;
                best = { x: p.x, y: p.y };
            }
        }
    }
    return best;
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

/** Jonctions visibles :
 *  - deux fils partagent un sommet (grille),
 *  - un sommet d'un fil repose sur un segment d'un autre (y compris au coude),
 *  - un segment traverse le coude d'un autre sans sommet au coude (sommet du fil A sur le segment de B).
 *  Pas de jonction au simple croisement (aucun sommet au point de croisement). */
function rebuildTeeWirePoints() {
    const byPoint = new Map();
    const touch = (p, wid) => {
        const g = snapPointToGrid(p);
        const k = `${g.x},${g.y}`;
        if (!byPoint.has(k)) byPoint.set(k, { x: g.x, y: g.y, wireIds: new Set() });
        byPoint.get(k).wireIds.add(wid);
    };

    for (const w of wires) {
        if (!w.solid || !w.points || w.points.length < 2) continue;
        for (const p of w.points) touch(p, w.id);
    }

    const segs = collectWireSegments().filter(s => {
        const w = wires.find(x => x.id === s.wid);
        return w && w.solid;
    });

    for (const w of wires) {
        if (!w.solid || !w.points || w.points.length < 2) continue;
        for (const v of w.points) {
            for (const s of segs) {
                if (s.wid === w.id) continue;
                if (onSegmentClosed(v, s.a, s.b)) {
                    touch(v, w.id);
                    touch(v, s.wid);
                }
            }
        }
    }

    teeWirePoints = [];
    for (const info of byPoint.values()) {
        if (info.wireIds.size >= 2) teeWirePoints.push({ x: info.x, y: info.y });
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
    if (!wireDraft || wireDraft.points.length < 2) return false;
    const tight = hitSlopWorld();
    const loose = wireCompleteSlopWorld();
    const last = wireDraft.points[wireDraft.points.length - 1];
    const exclude = wireDraft.fromKey;

    const isCompTerm = j => !j.key.startsWith("__t#") && !j.key.startsWith("__p#");
    const isTee = j => j.key.startsWith("__t#");
    const isFloating = j => j.key.startsWith("__p#");

    /** Choix prioritaire : on cherche la borne désignée par l'INTENTION (curseur) avec une tolérance serrée,
     *  puis on élargit au tracé. Évite que la borne adjacente (CH1 vs CH2, V+ vs V−) "vole" le clic. */
    const pickBest = (priority, distFn, slop) => {
        let best = null;
        let bestD = Infinity;
        forEachConnectableJunction(j => {
            if (!priority(j)) return;
            const d = distFn(j);
            if (d <= slop && d < bestD) {
                bestD = d;
                best = j;
            }
        }, exclude);
        return best;
    };

    const dCur = j => dist(worldPos.x, worldPos.y, j.x, j.y);
    const dLast = j => dist(last.x, last.y, j.x, j.y);
    const dMin = j => Math.min(dCur(j), dLast(j));

    const best =
        pickBest(isCompTerm, dCur, tight) ||
        pickBest(isCompTerm, dLast, tight) ||
        pickBest(isCompTerm, dMin, loose) ||
        pickBest(isTee, dCur, tight) ||
        pickBest(isTee, dCur, loose) ||
        pickBest(isTee, dMin, loose) ||
        pickBest(isFloating, dCur, loose) ||
        pickBest(isFloating, dCur, tight) ||
        pickBest(isFloating, dLast, loose) ||
        pickBest(isFloating, dMin, loose);

    if (!best) return false;

    const endG = snapPointToGrid({ x: best.x, y: best.y });
    const endKey = resolveJunctionKeyAt(endG.x, endG.y);
    const endJ = { x: endG.x, y: endG.y, key: endKey };

    if (!sameXY(last, endG)) {
        const newPts = extendWireSegment(last, endG, WIRE_EXTEND_MODE);
        appendUniquePoints(wireDraft.points, newPts);
        const after = wireDraft.points[wireDraft.points.length - 1];
        if (!sameXY(after, endG)) wireDraft.points.push({ x: endG.x, y: endG.y });
    } else {
        wireDraft.points[wireDraft.points.length - 1] = { x: endG.x, y: endG.y };
    }
    finishWire(endJ);
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

/** Reliure volontaire sur un T (coude existant, segment, ou jonction déjà connue). */
function tryFinishDraftWireAtTee(worldPos) {
    if (!wireDraft || wireDraft.points.length < 2) return false;
    const slop = wireCompleteSlopWorld();
    const last = wireDraft.points[wireDraft.points.length - 1];
    const aimX = worldPos ? worldPos.x : last.x;
    const aimY = worldPos ? worldPos.y : last.y;

    const finishAt = (x, y) => {
        const g = snapPointToGrid({ x, y });
        wireDraft.points[wireDraft.points.length - 1] = g;
        finishWire({ x: g.x, y: g.y, key: resolveJunctionKeyAt(g.x, g.y) });
    };

    for (const p of teeWirePoints) {
        const d = Math.min(dist(last.x, last.y, p.x, p.y), dist(aimX, aimY, p.x, p.y));
        if (d <= slop) {
            finishAt(p.x, p.y);
            return true;
        }
    }

    const cornerVtx = snapToNearbyWireVertex(aimX, aimY, null, slop);
    if (cornerVtx) {
        finishAt(cornerVtx.x, cornerVtx.y);
        return true;
    }

    for (const s of collectWireSegments()) {
        const dLast = distPointToSegment(last.x, last.y, s.a.x, s.a.y, s.b.x, s.b.y);
        const dCur = distPointToSegment(aimX, aimY, s.a.x, s.a.y, s.b.x, s.b.y);
        if (Math.min(dLast, dCur) > slop) continue;

        let I = closestPointOnOrthogonalSegment(aimX, aimY, s.a, s.b);
        if (!I || !onSegmentClosed(I, s.a, s.b)) continue;

        const vtxOnWire = snapToNearbyWireVertex(I.x, I.y, s.wid, slop);
        if (vtxOnWire) I = vtxOnWire;

        if (sameXY(I, s.a) || sameXY(I, s.b)) {
            const corner = snapToNearbyWireVertex(I.x, I.y, null, slop);
            if (corner) I = corner;
        }

        finishAt(I.x, I.y);
        return true;
    }
    return false;
}

function finishWire(endJ) {
    if (!wireDraft) return;
    const endG = snapPointToGrid({ x: endJ.x, y: endJ.y });
    const toKey = endJ.key || resolveJunctionKeyAt(endG.x, endG.y);
    let full = wireDraft.points.map(p => snapPointToGrid(p));
    const la = full[full.length - 1];
    if (!sameXY(la, endG)) full.push({ x: endG.x, y: endG.y });
    else full[full.length - 1] = { x: endG.x, y: endG.y };
    full = orthogonalizeWirePoints(full);
    if (full.length >= 1) {
        full[full.length - 1] = { x: endG.x, y: endG.y };
    }
    wires.push({
        id: `W${++wireCount}`,
        solid: true,
        fromKey: wireDraft.fromKey,
        toKey,
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
        const sel = w.id === selectedWireId || wireIsInAreaSelection(w.id);
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
    closeLedColorEditor();
    updateGridToggleLabel();
    resetPaletteDragState();

    window.addEventListener('resize', resize);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    
    // Drag & Drop
    canvas.addEventListener('dragenter', e => { e.preventDefault(); });
    canvas.addEventListener('dragover', handleCanvasDragOver);
    canvas.addEventListener('dragleave', handleCanvasDragLeave);
    canvas.addEventListener('drop', handleDrop);
    window.addEventListener('dragend', handleWindowDragEnd);
    initLogicSubmenuClicks();
    
    // Souris / pointeur
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('dblclick', handleCanvasDblClick);
    initValueEditor();
    initLedColorEditor();
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
    const stopBtn = document.getElementById("stopSimBtn");
    if (stopBtn) {
        stopBtn.addEventListener("click", () => stopLiveSimulation());
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

let inspectorCompId = null;

function parseFreqFromGeneratorString(raw) {
    const t = String(raw || "")
        .toLowerCase()
        .replace(/\s/g, "")
        .replace(",", ".");
    let m = /([\d.]+)khz/.exec(t);
    if (m) {
        const n = parseFloat(m[1]) * 1000;
        return Number.isFinite(n) && n > 0 ? n : 1000;
    }
    m = /([\d.]+)mhz/.exec(t);
    if (m) {
        const n = parseFloat(m[1]) * 1e6;
        return Number.isFinite(n) && n > 0 ? n : 1000;
    }
    m = /([\d.]+)hz/.exec(t);
    if (m) {
        const n = parseFloat(m[1]);
        return Number.isFinite(n) && n > 0 ? n : 1000;
    }
    return 1000;
}

function parsePhaseFromGeneratorString(raw) {
    const s = String(raw || "").trim();
    let m = /(?:phase|φ|phi)\s*([-+]?[\d.]+)\s*(?:°|deg)?/i.exec(s);
    if (m) {
        const n = parseFloat(m[1]);
        return Number.isFinite(n) ? n : 0;
    }
    m = /([-+]?[\d.]+)\s*(?:°|deg)\s*$/i.exec(s);
    if (m) {
        const n = parseFloat(m[1]);
        return Number.isFinite(n) ? n : 0;
    }
    return 0;
}

function parseOffsetFromGeneratorString(raw) {
    const s = String(raw || "").trim();
    const mOff = /(?:offset|off|dc)\s*([-+]?[\d.]+)\s*v?/i.exec(s);
    if (mOff) {
        const n = parseFloat(mOff[1]);
        return Number.isFinite(n) ? n : 0;
    }
    const allV = [...s.matchAll(/([-+]?[\d.]+)\s*v/gi)];
    const isSquarePair = /^([-+]?[\d.]+)\s*v\s+([-+]?[\d.]+)\s*v/i.test(s);
    if (isSquarePair) {
        if (allV.length >= 3) {
            const n = parseFloat(allV[allV.length - 1][1]);
            return Number.isFinite(n) ? n : 0;
        }
        return 0;
    }
    if (allV.length >= 2) {
        const n = parseFloat(allV[allV.length - 1][1]);
        return Number.isFinite(n) ? n : 0;
    }
    return 0;
}

/** Sinus : « 5V 1kHz 0V 90° » (amplitude crête, phase optionnelle). */
function parseSignalGeneratorParams(value) {
    const raw = String(value || "").trim();
    const ampM = /([-+]?[\d.]+)\s*v/i.exec(raw);
    const amp = ampM ? parseFloat(ampM[1]) : 5;
    const freqHz = parseFreqFromGeneratorString(raw);
    const offset = parseOffsetFromGeneratorString(raw);
    const phaseDeg = parsePhaseFromGeneratorString(raw);
    if (!Number.isFinite(amp) || amp <= 0) return { ok: false };
    return { ok: true, amplitude: amp, freqHz, offset, phaseDeg };
}

/** Carré : « 5V 5V 1kHz 0V » (ampli +, ampli −, fréquence, offset). */
function parseSquareGeneratorParams(value) {
    const raw = String(value || "").trim();
    const pair = /^([-+]?[\d.]+)\s*v\s+([-+]?[\d.]+)\s*v/i.exec(raw);
    let ampPos = 5;
    let ampNeg = 5;
    if (pair) {
        ampPos = Math.abs(parseFloat(pair[1]));
        ampNeg = Math.abs(parseFloat(pair[2]));
    } else {
        const single = parseSignalGeneratorParams(raw);
        if (!single.ok) return { ok: false };
        ampPos = single.amplitude;
        ampNeg = single.amplitude;
    }
    const freqHz = parseFreqFromGeneratorString(raw);
    const offset = parseOffsetFromGeneratorString(raw);
    if (!Number.isFinite(ampPos) || ampPos <= 0 || !Number.isFinite(ampNeg) || ampNeg <= 0) return { ok: false };
    return { ok: true, ampPos, ampNeg, freqHz, offset };
}

function formatFreqForDisplay(freqHz) {
    const f = Number(freqHz);
    if (!Number.isFinite(f) || f <= 0) return "1kHz";
    if (f >= 1e6) return `${(f / 1e6).toFixed(3).replace(/\.?0+$/, "")}MHz`;
    if (f >= 1000) return `${(f / 1000).toFixed(3).replace(/\.?0+$/, "")}kHz`;
    return `${f}Hz`;
}

function formatSignalGeneratorValue(amp, freqHz, offset, phaseDeg) {
    const a = Number(amp);
    const o = Number(offset);
    const ph = Number(phaseDeg) || 0;
    const ampStr = `${a}`.replace(/\.0+$/, "") + "V";
    const offStr = `${o}`.replace(/\.0+$/, "") + "V";
    const base = `${ampStr} ${formatFreqForDisplay(freqHz)} ${offStr}`;
    if (ph === 0) return base;
    const phStr = `${ph}`.replace(/\.0+$/, "") + "°";
    return `${base} ${phStr}`;
}

const OPAMP_DEFAULT_VP = 15;
const OPAMP_DEFAULT_VN = -15;

function getOpampVp(c) {
    const n = Number(c?.vp);
    return Number.isFinite(n) ? n : OPAMP_DEFAULT_VP;
}

function getOpampVn(c) {
    const n = Number(c?.vn);
    return Number.isFinite(n) ? n : OPAMP_DEFAULT_VN;
}

function ensureOpampFields(c) {
    if (!c || !isOpampType(c.type)) return;
    if (!Number.isFinite(c.vp)) c.vp = OPAMP_DEFAULT_VP;
    if (!Number.isFinite(c.vn)) c.vn = OPAMP_DEFAULT_VN;
}

function formatOpampSupplyLabel(vp, vn) {
    const p = Number(vp);
    const n = Number(vn);
    const ps = `${p}`.replace(/\.0+$/, "");
    const ns = `${n}`.replace(/\.0+$/, "");
    return `+${ps}V / ${ns}V`;
}

function formatSquareGeneratorValue(ampPos, ampNeg, freqHz, offset) {
    const p = Number(ampPos);
    const n = Number(ampNeg);
    const o = Number(offset);
    const pStr = `${p}`.replace(/\.0+$/, "") + "V";
    const nStr = `${n}`.replace(/\.0+$/, "") + "V";
    const offStr = `${o}`.replace(/\.0+$/, "") + "V";
    return `${pStr} ${nStr} ${formatFreqForDisplay(freqHz)} ${offStr}`;
}

function syncSimPanelPlaceholder() {
    const ph = document.getElementById("inspector-placeholder");
    const insp = document.getElementById("inspector-panel");
    const body = document.getElementById("sim-panel-body");
    if (!ph) return;
    const hasInsp = insp && !insp.hidden;
    const hasResults =
        body &&
        (body.querySelector(".sim-table, .sim-error, .sim-loading, .sim-details") ||
            (body.textContent && !/Lancez une simulation/.test(body.textContent)));
    ph.hidden = hasInsp || !!hasResults;
}

function closeGeneratorInspector() {
    inspectorCompId = null;
    const panel = document.getElementById("inspector-panel");
    const body = document.getElementById("inspector-body");
    if (panel) panel.hidden = true;
    if (body) body.innerHTML = "";
    syncSimPanelPlaceholder();
}

function readInspectorFreqHz(freqEl, freqUnitEl) {
    let freq = parseFloat(freqEl.value);
    const unit = freqUnitEl ? freqUnitEl.value : "Hz";
    if (unit === "kHz") freq *= 1000;
    else if (unit === "MHz") freq *= 1e6;
    return freq;
}

function commitGeneratorInspector() {
    if (!inspectorCompId) return false;
    const comp = components.find(c => c.id === inspectorCompId);
    if (!comp || !isSignalGeneratorType(comp.type)) return false;
    const freqEl = document.getElementById("insp-gen-freq");
    const freqUnitEl = document.getElementById("insp-gen-freq-unit");
    const offEl = document.getElementById("insp-gen-offset");
    if (!freqEl || !offEl) return false;
    const freq = readInspectorFreqHz(freqEl, freqUnitEl);
    const offset = parseFloat(offEl.value);
    if (!Number.isFinite(freq) || freq <= 0) {
        freqEl.classList.add("invalid");
        return false;
    }
    if (!Number.isFinite(offset)) {
        offEl.classList.add("invalid");
        return false;
    }
    freqEl.classList.remove("invalid");
    offEl.classList.remove("invalid");

    if (comp.type === "vsquare") {
        const ampPosEl = document.getElementById("insp-gen-amp-pos");
        const ampNegEl = document.getElementById("insp-gen-amp-neg");
        if (!ampPosEl || !ampNegEl) return false;
        const ampPos = parseFloat(ampPosEl.value);
        const ampNeg = parseFloat(ampNegEl.value);
        if (!Number.isFinite(ampPos) || ampPos <= 0) {
            ampPosEl.classList.add("invalid");
            return false;
        }
        if (!Number.isFinite(ampNeg) || ampNeg <= 0) {
            ampNegEl.classList.add("invalid");
            return false;
        }
        ampPosEl.classList.remove("invalid");
        ampNegEl.classList.remove("invalid");
        comp.value = formatSquareGeneratorValue(ampPos, ampNeg, freq, offset);
    } else {
        const ampEl = document.getElementById("insp-gen-amp");
        if (!ampEl) return false;
        const amp = parseFloat(ampEl.value);
        if (!Number.isFinite(amp) || amp <= 0) {
            ampEl.classList.add("invalid");
            return false;
        }
        const phaseEl = document.getElementById("insp-gen-phase");
        let phaseDeg = 0;
        if (phaseEl) {
            phaseDeg = parseFloat(phaseEl.value);
            if (!Number.isFinite(phaseDeg)) {
                phaseEl.classList.add("invalid");
                return false;
            }
            phaseEl.classList.remove("invalid");
        }
        ampEl.classList.remove("invalid");
        comp.value = formatSignalGeneratorValue(amp, freq, offset, phaseDeg);
    }
    saveState();
    draw();
    return true;
}

function commitOpampInspector() {
    if (!inspectorCompId) return false;
    const comp = components.find(c => c.id === inspectorCompId);
    if (!comp || !isOpampType(comp.type)) return false;
    const vpEl = document.getElementById("insp-opamp-vp");
    const vnEl = document.getElementById("insp-opamp-vn");
    const modelEl = document.getElementById("insp-opamp-model");
    if (!vpEl || !vnEl) return false;
    const vp = parseFloat(vpEl.value);
    const vn = parseFloat(vnEl.value);
    if (!Number.isFinite(vp) || vp <= 0) {
        vpEl.classList.add("invalid");
        return false;
    }
    if (!Number.isFinite(vn) || vn >= 0) {
        vnEl.classList.add("invalid");
        return false;
    }
    vpEl.classList.remove("invalid");
    vnEl.classList.remove("invalid");
    comp.vp = vp;
    comp.vn = vn;
    if (modelEl) {
        const t = String(modelEl.value || "").trim().replace(/\s+/g, "");
        if (t && /^[a-z0-9._-]+$/i.test(t)) comp.value = t;
    }
    ensureOpampFields(comp);
    saveState();
    draw();
    return true;
}

function openOpampInspector(comp) {
    if (!comp || !isOpampType(comp.type)) return;
    closeValueEditor();
    ensureOpampFields(comp);
    inspectorCompId = comp.id;
    selectedId = comp.id;
    const panel = document.getElementById("inspector-panel");
    const body = document.getElementById("inspector-body");
    const title = document.getElementById("inspector-title");
    if (!panel || !body) return;
    const vp = getOpampVp(comp);
    const vn = getOpampVn(comp);
    const model = comp.value != null ? String(comp.value) : "LM741";
    if (title) title.textContent = `AOP — ${comp.id}`;
    body.innerHTML =
        `<form class="inspector-form" id="inspector-opamp-form" onsubmit="return false;">` +
        `<label>Modèle<input type="text" id="insp-opamp-model" spellcheck="false" value="${escapeHtmlSim(model)}"></label>` +
        `<label>Alimentation + (V)<input type="number" id="insp-opamp-vp" step="any" min="0.001" value="${escapeHtmlSim(String(vp))}"></label>` +
        `<label>Alimentation − (V)<input type="number" id="insp-opamp-vn" step="any" max="-0.001" value="${escapeHtmlSim(String(vn))}"></label>` +
        `<p class="inspector-hint">Double-clic sur l'AOP pour rouvrir. Entrée pour valider.</p>` +
        `</form>`;
    panel.hidden = false;
    syncSimPanelPlaceholder();
    const bind = () => commitOpampInspector();
    ["insp-opamp-model", "insp-opamp-vp", "insp-opamp-vn"].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("change", bind);
        if (el.tagName === "INPUT") {
            el.addEventListener("keydown", e => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    bind();
                }
            });
        }
    });
    draw();
}

function openGeneratorInspector(comp) {
    if (!comp || !isSignalGeneratorType(comp.type)) return;
    closeValueEditor();
    inspectorCompId = comp.id;
    selectedId = comp.id;
    const panel = document.getElementById("inspector-panel");
    const body = document.getElementById("inspector-body");
    const title = document.getElementById("inspector-title");
    if (!panel || !body) return;
    const isSquare = comp.type === "vsquare";
    const p = isSquare ? parseSquareGeneratorParams(comp.value) : parseSignalGeneratorParams(comp.value);
    const freqHz = p.ok ? p.freqHz : 1000;
    const offset = p.ok ? p.offset : 0;
    let freqVal = freqHz;
    let freqUnit = "Hz";
    if (freqHz >= 1e6) {
        freqVal = freqHz / 1e6;
        freqUnit = "MHz";
    } else if (freqHz >= 1000) {
        freqVal = freqHz / 1000;
        freqUnit = "kHz";
    }
    const typeLabel = isSquare ? "Générateur carré" : "Générateur sinus";
    if (title) title.textContent = `${typeLabel} — ${comp.id}`;
    const freqBlock =
        `<label>Fréquence<input type="number" id="insp-gen-freq" step="any" min="0.001" value="${escapeHtmlSim(String(freqVal))}">` +
        `<select id="insp-gen-freq-unit"><option value="Hz"${freqUnit === "Hz" ? " selected" : ""}>Hz</option>` +
        `<option value="kHz"${freqUnit === "kHz" ? " selected" : ""}>kHz</option>` +
        `<option value="MHz"${freqUnit === "MHz" ? " selected" : ""}>MHz</option></select></label>` +
        `<label>Offset DC (V)<input type="number" id="insp-gen-offset" step="any" value="${escapeHtmlSim(String(offset))}"></label>`;
    let ampBlock;
    if (isSquare) {
        const ampPos = p.ok ? p.ampPos : 5;
        const ampNeg = p.ok ? p.ampNeg : 5;
        ampBlock =
            `<label>Amplitude + (V)<input type="number" id="insp-gen-amp-pos" step="any" min="0.001" value="${escapeHtmlSim(String(ampPos))}"></label>` +
            `<label>Amplitude − (V)<input type="number" id="insp-gen-amp-neg" step="any" min="0.001" value="${escapeHtmlSim(String(ampNeg))}"></label>`;
    } else {
        const amp = p.ok ? p.amplitude : 5;
        const phaseDeg = p.ok ? p.phaseDeg : 0;
        ampBlock =
            `<label>Amplitude (V crête)<input type="number" id="insp-gen-amp" step="any" min="0.001" value="${escapeHtmlSim(String(amp))}"></label>` +
            `<label>Phase (°)<input type="number" id="insp-gen-phase" step="any" value="${escapeHtmlSim(String(phaseDeg))}"></label>`;
    }
    body.innerHTML =
        `<form class="inspector-form" id="inspector-gen-form" onsubmit="return false;">` +
        ampBlock +
        freqBlock +
        `<p class="inspector-hint">Pris en compte à la prochaine simulation. Entrée pour valider.</p>` +
        `</form>`;
    panel.hidden = false;
    syncSimPanelPlaceholder();
    const bind = () => commitGeneratorInspector();
    const fieldIds = [
        "insp-gen-freq",
        "insp-gen-offset",
        "insp-gen-freq-unit",
        "insp-gen-amp",
        "insp-gen-phase",
        "insp-gen-amp-pos",
        "insp-gen-amp-neg",
    ];
    fieldIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("change", bind);
        if (el.tagName === "INPUT") {
            el.addEventListener("keydown", e => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    bind();
                }
            });
        }
    });
    draw();
}

let oscilloscopeOverlayEl = null;
let lastScopePlots = null;
let liveSimActive = false;
let liveSimDebounceTimer = null;
let liveSimAbortController = null;
let liveSimSeq = 0;
let liveSimInFlight = false;
let liveSimPending = false;
const LIVE_SIM_DEBOUNCE_MS = 400;
let scopeSweepRafId = null;
let scopeSweepLastTs = 0;

function getScopeSweepWallSec(ui) {
    const timeDiv = ui?.timeDiv > 0 ? ui.timeDiv : 1e-3;
    return SCOPE_H_DIVS * timeDiv;
}
const scopeUiById = {};
const SCOPE_H_DIVS = 8;
const SCOPE_V_DIVS = 10;
const SCOPE_PX_PER_DIV = 44;

const SCOPE_TIME_DIV_OPTIONS = [
    { label: "2 µs/div", sec: 2e-6 },
    { label: "5 µs/div", sec: 5e-6 },
    { label: "10 µs/div", sec: 10e-6 },
    { label: "20 µs/div", sec: 20e-6 },
    { label: "50 µs/div", sec: 50e-6 },
    { label: "100 µs/div", sec: 100e-6 },
    { label: "200 µs/div", sec: 200e-6 },
    { label: "500 µs/div", sec: 500e-6 },
    { label: "1 ms/div", sec: 1e-3 },
    { label: "2 ms/div", sec: 2e-3 },
    { label: "5 ms/div", sec: 5e-3 },
    { label: "10 ms/div", sec: 10e-3 },
    { label: "20 ms/div", sec: 20e-3 },
    { label: "50 ms/div", sec: 50e-3 },
    { label: "100 ms/div", sec: 100e-3 },
    { label: "200 ms/div", sec: 200e-3 },
    { label: "500 ms/div", sec: 500e-3 },
    { label: "1 s/div", sec: 1 },
];

const SCOPE_VOLT_DIV_OPTIONS = [
    { label: "50 mV/div", v: 0.05 },
    { label: "100 mV/div", v: 0.1 },
    { label: "200 mV/div", v: 0.2 },
    { label: "500 mV/div", v: 0.5 },
    { label: "1 V/div", v: 1 },
    { label: "2 V/div", v: 2 },
    { label: "5 V/div", v: 5 },
];

function stopScopeSweepAnimation() {
    if (scopeSweepRafId != null) {
        cancelAnimationFrame(scopeSweepRafId);
        scopeSweepRafId = null;
    }
}

function startScopeSweepAnimation() {
    stopScopeSweepAnimation();
    scopeSweepLastTs = performance.now();
    const tick = ts => {
        if (!oscilloscopeOverlayEl) {
            stopScopeSweepAnimation();
            return;
        }
        const dt = Math.min(0.05, (ts - scopeSweepLastTs) / 1000);
        scopeSweepLastTs = ts;
        if (lastScopePlots) {
            for (const id of Object.keys(lastScopePlots)) {
                const ui = scopeUiById[id];
                const plot = lastScopePlots[id];
                if (!ui || !plot) continue;
                if (ui.syncEnabled !== false) {
                    applyScopeSyncIfEnabled(plot, ui);
                    ui.sweepPhase = 1;
                    continue;
                }
                const period = getScopeSweepWallSec(ui);
                let ph = ui.sweepPhase ?? 0;
                ph += dt / period;
                if (ph >= 1) ph -= Math.floor(ph);
                ui.sweepPhase = ph;
            }
        }
        redrawAllScopeCanvases();
        scopeSweepRafId = requestAnimationFrame(tick);
    };
    scopeSweepRafId = requestAnimationFrame(tick);
}

function redrawAllScopeCanvases() {
    if (!oscilloscopeOverlayEl || !lastScopePlots) return;
    for (const block of oscilloscopeOverlayEl.querySelectorAll(".osc-scope-block")) {
        const id = block.querySelector("h3")?.textContent;
        if (!id || !lastScopePlots[id]) continue;
        const plot = lastScopePlots[id];
        if (!scopeUiById[id]) autoScopeUi(plot, id);
        const cvs = block.querySelector("canvas.osc-scope-canvas-dual");
        const ui = scopeUiById[id];
        applyScopeSyncIfEnabled(plot, ui);
        const phase = ui.syncEnabled !== false ? 1 : ui.sweepPhase ?? 0;
        if (cvs && ui) drawDualScopeCanvas(cvs, plot, ui, phase);
    }
}

function makeOscilloscopePanelDraggable(panel, handle) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    handle.addEventListener("pointerdown", e => {
        if (e.button !== 0 || e.target.closest("button")) return;
        dragging = true;
        const r = panel.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startLeft = r.left;
        startTop = r.top;
        panel.style.right = "auto";
        panel.style.left = `${startLeft}px`;
        panel.style.top = `${startTop}px`;
        handle.setPointerCapture(e.pointerId);
        e.preventDefault();
    });
    handle.addEventListener("pointermove", e => {
        if (!dragging) return;
        panel.style.left = `${startLeft + e.clientX - startX}px`;
        panel.style.top = `${startTop + e.clientY - startY}px`;
    });
    const endDrag = e => {
        if (!dragging) return;
        dragging = false;
        try {
            handle.releasePointerCapture(e.pointerId);
        } catch (_) {}
    };
    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);
}

function closeOscilloscopeViewer() {
    stopScopeSweepAnimation();
    if (oscilloscopeOverlayEl) {
        oscilloscopeOverlayEl.remove();
        oscilloscopeOverlayEl = null;
    }
}

function menuOpenOscilloscope() {
    if (!liveSimActive) {
        const body = document.getElementById("sim-panel-body");
        if (body) {
            const hint = document.createElement("p");
            hint.className = "sim-warn";
            hint.textContent = "Lancez d\u2019abord la simulation en direct pour afficher l\u2019oscilloscope.";
            body.prepend(hint);
            window.setTimeout(() => hint.remove(), 5000);
        }
        return;
    }
    if (!lastScopePlots || !Object.keys(lastScopePlots).length) {
        const body = document.getElementById("sim-panel-body");
        if (body) {
            const hint = document.createElement("p");
            hint.className = "sim-warn";
            hint.textContent =
                "Aucune courbe : ajoutez un oscilloscope au circuit et reliez-le correctement.";
            body.prepend(hint);
            window.setTimeout(() => hint.remove(), 5000);
        }
        return;
    }
    openOscilloscopeViewer(lastScopePlots);
}
window.menuOpenOscilloscope = menuOpenOscilloscope;

/** Récapitulatif des raccourcis (menu Commandes). */
const APP_COMMANDS_SECTIONS = [
    {
        title: "Édition",
        rows: [
            { keys: "Ctrl+Z", desc: "Annuler la dernière action." },
            { keys: "Ctrl+Y", desc: "Rétablir l\u2019action annulée." },
            { keys: "Ctrl+C", desc: "Copier le composant sélectionné ou la sélection (Shift)." },
            { keys: "Ctrl+V", desc: "Coller à la position du curseur (grille)." },
            { keys: "Suppr", desc: "Supprimer le composant, le fil sélectionné ou la sélection multiple." },
        ],
    },
    {
        title: "Composants",
        rows: [
            { keys: "R", desc: "Tourner le composant (90\u00B0) : résistances, diodes, portes logiques, NPN, AOP, etc." },
            { keys: "X", desc: "Miroir horizontal : NPN, AOP, portes logiques, générateurs, oscilloscope." },
            { keys: "Y", desc: "Miroir vertical : NPN, AOP, portes logiques." },
            {
                keys: "Double-clic",
                desc: "Modifier une valeur (R, C, pile, borne\u2026), choisir le rail 3,3 V / 5 V (état logique ou porte), ouvrir l\u2019inspecteur (générateur, AOP) ou la couleur LED.",
            },
            {
                keys: "Clic",
                desc: "État logique : basculer 0 / 1 (sans déplacer le composant).",
            },
        ],
    },
    {
        title: "Fils et schéma",
        rows: [
            { keys: "Clic borne", desc: "Commencer ou terminer un fil entre deux jonctions." },
            { keys: "Échap", desc: "Figé l\u2019extrémité du fil en cours ; fermer une fenêtre ou annuler la sélection." },
            { keys: "Shift + glisser", desc: "Sélection rectangulaire (composants et fils) ; déplacer la sélection." },
            { keys: "Glisser (corps)", desc: "Déplacer un composant sur la grille." },
        ],
    },
    {
        title: "Vue",
        rows: [
            { keys: "Molette", desc: "Zoom avant / arrière sur le schéma." },
            { keys: "Clic droit + glisser", desc: "Déplacer la vue (panoramique)." },
        ],
    },
    {
        title: "Simulation",
        rows: [
            { keys: "▶ Simulation", desc: "Lancer ngspice en direct ; résultats dans le panneau à droite." },
            { keys: "■ Arrêter", desc: "Interrompre la simulation en cours." },
        ],
    },
];

let commandsHelpOverlayEl = null;

function closeCommandsHelp() {
    if (commandsHelpOverlayEl) {
        commandsHelpOverlayEl.remove();
        commandsHelpOverlayEl = null;
    }
}

function menuOpenCommandsHelp() {
    closeCommandsHelp();

    const wrap = document.createElement("div");
    wrap.className = "cmd-help-overlay";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-label", "Commandes du simulateur");

    const panel = document.createElement("div");
    panel.className = "cmd-help-panel";

    const header = document.createElement("header");
    header.className = "cmd-help-header";
    const h2 = document.createElement("h2");
    h2.textContent = "Commandes";
    header.appendChild(h2);
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "cmd-help-close";
    closeBtn.textContent = "\u2715";
    closeBtn.title = "Fermer (Échap)";
    closeBtn.addEventListener("click", () => closeCommandsHelp());
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const body = document.createElement("div");
    body.className = "cmd-help-body";
    for (const section of APP_COMMANDS_SECTIONS) {
        const sec = document.createElement("section");
        sec.className = "cmd-help-section";
        const h3 = document.createElement("h3");
        h3.textContent = section.title;
        sec.appendChild(h3);
        const table = document.createElement("table");
        table.className = "cmd-help-table";
        const tbody = document.createElement("tbody");
        for (const row of section.rows) {
            const tr = document.createElement("tr");
            const tdK = document.createElement("td");
            tdK.className = "cmd-help-keys";
            const kbd = document.createElement("kbd");
            kbd.textContent = row.keys;
            tdK.appendChild(kbd);
            const tdD = document.createElement("td");
            tdD.className = "cmd-help-desc";
            tdD.textContent = row.desc;
            tr.appendChild(tdK);
            tr.appendChild(tdD);
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        sec.appendChild(table);
        body.appendChild(sec);
    }
    panel.appendChild(body);
    wrap.appendChild(panel);

    wrap.addEventListener("click", e => {
        if (e.target === wrap) closeCommandsHelp();
    });
    panel.addEventListener("click", e => e.stopPropagation());

    document.body.appendChild(wrap);
    commandsHelpOverlayEl = wrap;
    closeBtn.focus({ preventScroll: true });
}

window.menuOpenCommandsHelp = menuOpenCommandsHelp;
window.closeCommandsHelp = closeCommandsHelp;

function closeSimPanel() {
    const root = document.getElementById("editor-container");
    if (root) root.classList.add("sim-panel-hidden");
    resize();
}

function openSimPanel() {
    const root = document.getElementById("editor-container");
    if (root) root.classList.remove("sim-panel-hidden");
    resize();
}

function menuToggleSimPanel() {
    const root = document.getElementById("editor-container");
    if (!root) return;
    if (root.classList.contains("sim-panel-hidden")) openSimPanel();
    else closeSimPanel();
}

window.closeSimPanel = closeSimPanel;
window.openSimPanel = openSimPanel;
window.menuToggleSimPanel = menuToggleSimPanel;

function updateLiveSimToolbar() {
    const runBtn = document.getElementById("runBtn");
    const stopBtn = document.getElementById("stopSimBtn");
    if (runBtn) {
        runBtn.disabled = !!liveSimActive;
        runBtn.textContent = liveSimActive
            ? "Simulation en direct…"
            : "\u25B6 Simulation en direct";
    }
    if (stopBtn) stopBtn.hidden = !liveSimActive;
    const title = document.querySelector("#sim-results-wrap .sim-panel-title");
    if (title) {
        title.textContent = liveSimActive
            ? "R\u00E9sultats (temps r\u00E9el)"
            : "R\u00E9sultats simulation (ngspice)";
    }
}

function scheduleLiveSimRefresh() {
    if (!liveSimActive) return;
    if (liveSimDebounceTimer) clearTimeout(liveSimDebounceTimer);
    liveSimDebounceTimer = window.setTimeout(() => {
        liveSimDebounceTimer = null;
        void runSimulationTick();
    }, LIVE_SIM_DEBOUNCE_MS);
}

function stopLiveSimulation() {
    liveSimActive = false;
    lastLedTranPlots = {};
    ledTranAnimStartMs = 0;
    for (const c of components) {
        if (isLedType(c.type)) {
            c.ledOn = false;
            c.ledSmoke = false;
            c.ledCurrent = 0;
            c.ledReverseBias = false;
        }
        if (isSeg7Type(c.type)) {
            ensureSeg7Fields(c);
            c.seg7On = Array(7).fill(false);
        }
    }
    liveSimSeq++;
    if (liveSimDebounceTimer) {
        clearTimeout(liveSimDebounceTimer);
        liveSimDebounceTimer = null;
    }
    if (liveSimAbortController) {
        liveSimAbortController.abort();
        liveSimAbortController = null;
    }
    liveSimInFlight = false;
    liveSimPending = false;
    lastScopePlots = null;
    closeOscilloscopeViewer();
    updateLiveSimToolbar();
}

function startLiveSimulation() {
    if (liveSimActive) return;
    liveSimActive = true;
    liveSimSeq = 0;
    updateLiveSimToolbar();
    updateSimPanelResults('<p class="sim-loading">\u23F3 Simulation en direct\u2026</p>');
    void runSimulationTick();
}

/** Met \u00E0 jour les courbes sans reconstruire les r\u00E9glages scope. */
function refreshOscilloscopePlots(scopePlots) {
    if (!scopePlots || typeof scopePlots !== "object") return;
    const ids = Object.keys(scopePlots);
    if (!ids.length) return;
    lastScopePlots = scopePlots;
    if (!oscilloscopeOverlayEl) return;
    const body = oscilloscopeOverlayEl.querySelector(".osc-scope-body");
    if (!body) {
        openOscilloscopeViewer(scopePlots);
        return;
    }
    const blocks = [...body.querySelectorAll(".osc-scope-block")];
    const blockById = new Map(
        blocks.map(b => [b.querySelector("h3")?.textContent || "", b]).filter(([id]) => id)
    );
    if (ids.length !== blockById.size || ids.some(id => !blockById.has(id))) {
        openOscilloscopeViewer(scopePlots);
        return;
    }
    for (const id of ids) {
        const plot = scopePlots[id];
        const block = blockById.get(id);
        if (!plot || !block) continue;
        if (!scopeUiById[id]) autoScopeUi(plot, id);
    }
    redrawAllScopeCanvases();
}

function applySimulationResults(data, res, rawBody) {
    lastLedTranPlots =
        data?.ledTranPlots && typeof data.ledTranPlots === "object" ? data.ledTranPlots : {};
    if (Object.keys(lastLedTranPlots).length > 0) ledTranAnimStartMs = performance.now();
    applyLedSimulationState(buildLedValuesFromSimData(data));
    applySeg7SimulationState(buildSeg7StateFromSimData(data));
    updateSimPanelResults(buildSimulationResultsHtml(data, res, rawBody));
    draw();
    const scopePlots = data.scopePlots || {};
    const hasScope = data.ok !== false && Object.keys(scopePlots).length > 0;
    if (hasScope) {
        refreshOscilloscopePlots(scopePlots);
    } else if (liveSimActive) {
        closeOscilloscopeViewer();
    }
}

async function runSimulationTick() {
    if (!liveSimActive) return;
    if (liveSimInFlight) {
        liveSimPending = true;
        return;
    }
    const seq = ++liveSimSeq;
    liveSimInFlight = true;
    if (liveSimAbortController) liveSimAbortController.abort();
    liveSimAbortController = new AbortController();
    const signal = liveSimAbortController.signal;
    try {
        const raw = JSON.parse(getCircuitJson());
        const state = { components: raw.components || [], wires: raw.wires || [] };
        const pre = validateCircuitBeforeSimulate(state.components);
        if (!pre.ok) {
            if (seq === liveSimSeq && liveSimActive) {
                updateSimPanelResults(
                    `<pre class="sim-error">${escapeHtmlSim(pre.errors.join("\n\n"))}</pre>`
                );
                closeOscilloscopeViewer();
            }
            return;
        }
        const res = await fetch("/api/simulate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ state, gridStep: GRID_SIZE }),
            signal,
        });
        if (!liveSimActive || seq !== liveSimSeq) return;
        const { data, raw: rawBody } = await parseSimulateApiResponse(res);
        applySimulationResults(data, res, rawBody);
    } catch (e) {
        if (e && e.name === "AbortError") return;
        if (seq === liveSimSeq && liveSimActive) {
            updateSimPanelResults(
                `<pre class="sim-error">${escapeHtmlSim(e && e.message ? e.message : String(e))}</pre>`
            );
        }
    } finally {
        liveSimInFlight = false;
        if (liveSimPending && liveSimActive) {
            liveSimPending = false;
            scheduleLiveSimRefresh();
        }
    }
}

function formatScopeTimeLabel(seconds) {
    const s = Number(seconds);
    if (!Number.isFinite(s)) return "";
    const av = Math.abs(s);
    if (av >= 1) return `${s.toFixed(3)} s`;
    if (av >= 1e-3) return `${(s * 1e3).toFixed(3)} ms`;
    return `${(s * 1e6).toFixed(3)} µs`;
}

function getPlotTimeExtents(plot) {
    let tMin = Infinity;
    let tMax = -Infinity;
    for (const ch of [plot?.ch1, plot?.ch2]) {
        const tArr = ch?.time;
        if (!tArr?.length) continue;
        tMin = Math.min(tMin, tArr[0]);
        tMax = Math.max(tMax, tArr[tArr.length - 1]);
    }
    if (!Number.isFinite(tMin) || !Number.isFinite(tMax) || tMax <= tMin) {
        return { tMin: 0, tMax: 0, span: 0 };
    }
    return { tMin, tMax, span: Math.max(tMax - tMin, 1e-12) };
}

function clampScopeTimeStart(plot, ui) {
    const { tMin, tMax, span } = getPlotTimeExtents(plot);
    if (span <= 0) return 0;
    const timeDiv = ui.timeDiv > 0 ? ui.timeDiv : 1e-3;
    const viewSpan = SCOPE_H_DIVS * timeDiv;
    const maxT0 = viewSpan >= span ? tMin : Math.max(tMin, tMax - viewSpan);
    const t0 = ui.timeStart ?? tMin;
    return Math.max(tMin, Math.min(t0, maxT0));
}

function channelVoltageMid(ch) {
    let min = Infinity;
    let max = -Infinity;
    const n = Math.min(ch?.time?.length ?? 0, ch?.voltage?.length ?? 0);
    for (let i = 0; i < n; i++) {
        const v = ch.voltage[i];
        if (!Number.isFinite(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return 0;
    return (min + max) / 2;
}

function estimatePeriodFromChannel(ch) {
    if (!ch?.time?.length || !ch?.voltage?.length) return null;
    const n = Math.min(ch.time.length, ch.voltage.length);
    if (n < 4) return null;
    const level = channelVoltageMid(ch);
    const rising = [];
    for (let i = 1; i < n; i++) {
        const v0 = ch.voltage[i - 1];
        const v1 = ch.voltage[i];
        if (!Number.isFinite(v0) || !Number.isFinite(v1)) continue;
        if (v0 < level && v1 >= level) rising.push(ch.time[i]);
    }
    if (rising.length < 2) return null;
    const gaps = [];
    for (let i = 1; i < rising.length; i++) {
        const dt = rising[i] - rising[i - 1];
        if (dt > 1e-12) gaps.push(dt);
    }
    if (!gaps.length) return null;
    gaps.sort((a, b) => a - b);
    return gaps[Math.floor(gaps.length / 2)];
}

function getCircuitGeneratorPeriodSec() {
    try {
        const raw = JSON.parse(getCircuitJson());
        for (const c of raw.components || []) {
            if (c.type === "vsin" || c.type === "vsquare") {
                const f = parseFreqFromGeneratorString(c.value);
                if (f > 0) return 1 / f;
            }
        }
    } catch (_) {}
    return null;
}

function resolveScopeSignalPeriod(plot) {
    const fromCh1 = estimatePeriodFromChannel(plot?.ch1);
    const fromCh2 = estimatePeriodFromChannel(plot?.ch2);
    const est = fromCh1 || fromCh2;
    const genT = getCircuitGeneratorPeriodSec();
    if (genT > 0) {
        if (!est) return genT;
        if (Math.abs(est - genT) / genT < 0.2) return genT;
    }
    return est;
}

function findFirstRisingEdgeTime(ch, level) {
    if (!ch?.time?.length || !ch?.voltage?.length) return null;
    const n = Math.min(ch.time.length, ch.voltage.length);
    for (let i = 1; i < n; i++) {
        const v0 = ch.voltage[i - 1];
        const v1 = ch.voltage[i];
        if (!Number.isFinite(v0) || !Number.isFinite(v1)) continue;
        if (v0 < level && v1 >= level) return ch.time[i];
    }
    return null;
}

/** Fenêtre horizontale calée sur un front montant CH1 (affichage stable). */
function computeTriggeredTimeStart(plot, ui) {
    const { tMin, tMax } = getPlotTimeExtents(plot);
    const timeDiv = ui.timeDiv > 0 ? ui.timeDiv : 1e-3;
    const viewSpan = SCOPE_H_DIVS * timeDiv;
    const maxT0 = viewSpan >= tMax - tMin ? tMin : Math.max(tMin, tMax - viewSpan);

    const ch = plot?.ch1?.time?.length ? plot.ch1 : plot?.ch2;
    if (!ch?.time?.length) return clampScopeTimeStart(plot, ui);

    const level = Number.isFinite(ui.triggerLevel) ? ui.triggerLevel : channelVoltageMid(ch);
    const period = resolveScopeSignalPeriod(plot);
    const triggerFrac = ui.triggerPos ?? 0.12;
    let tTrig = findFirstRisingEdgeTime(ch, level);
    if (tTrig == null) tTrig = tMin;

    let t0 = tTrig - triggerFrac * viewSpan;
    if (period > 0) {
        const rel = t0 - tTrig;
        t0 = tTrig + Math.round(rel / period) * period - triggerFrac * viewSpan;
    }
    return Math.max(tMin, Math.min(t0, maxT0));
}

function applyScopeSyncIfEnabled(plot, ui) {
    if (ui.syncEnabled === false || ui.manualTimePan) return;
    ui.timeStart = computeTriggeredTimeStart(plot, ui);
}

function channelAbsVMax(ch) {
    let m = 0.2;
    if (!ch?.voltage) return m;
    for (const v of ch.voltage) {
        if (Number.isFinite(v)) m = Math.max(m, Math.abs(v));
    }
    return Math.max(m, 0.2);
}

function pickVoltDivForAmplitude(vMax) {
    const target = vMax / 3;
    let best = SCOPE_VOLT_DIV_OPTIONS[0].v;
    for (const opt of SCOPE_VOLT_DIV_OPTIONS) {
        if (opt.v >= target) {
            best = opt.v;
            break;
        }
    }
    return best;
}

function ensureTimeDivOption(select, sec) {
    if (!select || !(sec > 0)) return;
    for (const opt of select.options) {
        if (Math.abs(parseFloat(opt.value) - sec) < sec * 0.02) {
            opt.selected = true;
            return;
        }
    }
    const o = document.createElement("option");
    o.value = String(sec);
    o.textContent = `${formatScopeTimeLabel(sec)}/div`;
    o.selected = true;
    select.appendChild(o);
}

/** Plus petit pas de temps dont les divisions horizontales couvrent toute la simulation. */
function pickTimeDivForSpan(span) {
    for (const opt of SCOPE_TIME_DIV_OPTIONS) {
        if (opt.sec * SCOPE_H_DIVS >= span) return opt.sec;
    }
    return span / SCOPE_H_DIVS;
}

function autoScopeUi(plot, scopeId) {
    const ch1 = plot.ch1;
    const ch2 = plot.ch2;
    const { tMin, tMax, span } = getPlotTimeExtents(plot);
    if (span <= 0) {
        scopeUiById[scopeId] = {
            timeDiv: 1e-3,
            ch1VoltDiv: 1,
            ch2VoltDiv: 1,
            ch1PosDiv: 0,
            ch2PosDiv: 0,
            timeStart: 0,
            sweepPhase: 0,
            syncEnabled: true,
            triggerPos: 0.12,
            manualTimePan: false,
        };
        return;
    }
    scopeUiById[scopeId] = {
        timeDiv: pickTimeDivForSpan(span),
        ch1VoltDiv: pickVoltDivForAmplitude(channelAbsVMax(ch1)),
        ch2VoltDiv: pickVoltDivForAmplitude(channelAbsVMax(ch2)),
        ch1PosDiv: 0,
        ch2PosDiv: 0,
        timeStart: tMin,
        tMax,
        sweepPhase: scopeUiById[scopeId]?.sweepPhase ?? 0,
        syncEnabled: scopeUiById[scopeId]?.syncEnabled ?? true,
        triggerPos: scopeUiById[scopeId]?.triggerPos ?? 0.12,
        manualTimePan: scopeUiById[scopeId]?.manualTimePan ?? false,
    };
}

function interpolateChannelAtTime(ch, tQuery) {
    if (!ch?.time?.length || !ch?.voltage?.length) return null;
    const n = Math.min(ch.time.length, ch.voltage.length);
    if (n === 0) return null;
    if (tQuery <= ch.time[0]) return { t: ch.time[0], v: ch.voltage[0] };
    if (tQuery >= ch.time[n - 1]) return { t: ch.time[n - 1], v: ch.voltage[n - 1] };
    for (let i = 1; i < n; i++) {
        const t1 = ch.time[i];
        if (tQuery <= t1) {
            const t0 = ch.time[i - 1];
            const v0 = ch.voltage[i - 1];
            const v1 = ch.voltage[i];
            const a = t1 > t0 ? (tQuery - t0) / (t1 - t0) : 0;
            return { t: tQuery, v: v0 + a * (v1 - v0) };
        }
    }
    return null;
}

function drawDualScopeCanvas(canvas, plot, ui, sweepPhase = 1) {
    const ctx = canvas.getContext("2d");
    if (!ctx || !plot || !ui) return;
    const phase = Number.isFinite(sweepPhase) ? Math.max(0, Math.min(1, sweepPhase)) : 1;
    const w = canvas.width;
    const h = canvas.height;
    const padL = 52;
    const padT = 18;
    const plotW = SCOPE_H_DIVS * SCOPE_PX_PER_DIV;
    const plotH = SCOPE_V_DIVS * SCOPE_PX_PER_DIV;
    const originX = padL;
    const originY = padT + plotH / 2;

    ctx.fillStyle = "#0a0a12";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#2e2e42";
    ctx.lineWidth = 1;
    for (let i = 0; i <= SCOPE_H_DIVS; i++) {
        const x = originX + i * SCOPE_PX_PER_DIV;
        ctx.beginPath();
        ctx.moveTo(x, padT);
        ctx.lineTo(x, padT + plotH);
        ctx.stroke();
    }
    for (let j = 0; j <= SCOPE_V_DIVS; j++) {
        const y = padT + j * SCOPE_PX_PER_DIV;
        ctx.beginPath();
        ctx.moveTo(originX, y);
        ctx.lineTo(originX + plotW, y);
        ctx.stroke();
    }
    ctx.strokeStyle = "#4a4a62";
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(originX + plotW, originY);
    ctx.stroke();

    const timeDiv = ui.timeDiv > 0 ? ui.timeDiv : 1e-3;
    const ch1VoltDiv = ui.ch1VoltDiv > 0 ? ui.ch1VoltDiv : ui.voltDiv > 0 ? ui.voltDiv : 1;
    const ch2VoltDiv = ui.ch2VoltDiv > 0 ? ui.ch2VoltDiv : ui.voltDiv > 0 ? ui.voltDiv : 1;
    if (ui.syncEnabled !== false) applyScopeSyncIfEnabled(plot, ui);
    const t0 = clampScopeTimeStart(plot, ui);
    if (ui.timeStart !== t0) ui.timeStart = t0;
    const viewSpan = SCOPE_H_DIVS * timeDiv;
    const mapX = t => originX + ((t - t0) / timeDiv) * SCOPE_PX_PER_DIV;
    const mapY = (v, posDiv, voltDiv) => originY - ((v / voltDiv + posDiv) * SCOPE_PX_PER_DIV);
    const tSweep = t0 + viewSpan * phase;
    const xSweep = mapX(tSweep);

    if (phase < 1) {
        ctx.strokeStyle = "rgba(80, 80, 110, 0.35)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(xSweep, padT);
        ctx.lineTo(xSweep, padT + plotH);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    function strokeChannelSweep(ch, color, posDiv, voltDiv) {
        if (!ch?.time?.length || !ch?.voltage?.length) return;
        const n = Math.min(ch.time.length, ch.voltage.length);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8;
        let started = false;
        for (let i = 0; i < n; i++) {
            const t = ch.time[i];
            const v = ch.voltage[i];
            if (!Number.isFinite(t) || !Number.isFinite(v)) continue;
            if (t > tSweep + 1e-15) break;
            const x = mapX(t);
            const y = mapY(v, posDiv, voltDiv);
            if (x < originX - 1 || x > originX + plotW + 1) {
                if (started) {
                    ctx.stroke();
                    started = false;
                }
                continue;
            }
            if (!started) {
                ctx.beginPath();
                ctx.moveTo(x, y);
                started = true;
            } else ctx.lineTo(x, y);
        }
        if (phase < 1) {
            const atSweep = interpolateChannelAtTime(ch, tSweep);
            if (atSweep && Number.isFinite(atSweep.v)) {
                const xs = mapX(atSweep.t);
                const ys = mapY(atSweep.v, posDiv, voltDiv);
                if (xs >= originX && xs <= originX + plotW) {
                    if (!started) {
                        ctx.beginPath();
                        ctx.moveTo(xs, ys);
                        started = true;
                    } else ctx.lineTo(xs, ys);
                }
            }
        }
        if (started) ctx.stroke();
    }

    strokeChannelSweep(plot.ch1, "#ffeb3b", ui.ch1PosDiv, ch1VoltDiv);
    strokeChannelSweep(plot.ch2, "#4dd0e1", ui.ch2PosDiv, ch2VoltDiv);

    const fmtVdiv = v => (v >= 1 ? `${v} V/div` : `${v * 1000} mV/div`);
    ctx.fillStyle = "#999";
    ctx.font = "10px Consolas, monospace";
    ctx.textAlign = "left";
    ctx.fillText(formatScopeTimeLabel(t0), originX, h - 6);
    ctx.textAlign = "right";
    ctx.fillText(formatScopeTimeLabel(t0 + viewSpan), originX + plotW, h - 6);
    ctx.textAlign = "left";
    ctx.fillText(`${formatScopeTimeLabel(timeDiv)}/div`, originX + 4, padT + 10);
    ctx.fillStyle = "#ffeb3b";
    ctx.fillText(`CH1 ${fmtVdiv(ch1VoltDiv)}`, originX + 4, padT + 22);
    ctx.fillStyle = "#4dd0e1";
    ctx.textAlign = "right";
    ctx.fillText(`CH2 ${fmtVdiv(ch2VoltDiv)}`, originX + plotW - 4, padT + 22);
}

function buildScopeControls(block, scopeId, plot) {
    if (!scopeUiById[scopeId]) autoScopeUi(plot, scopeId);
    const ui = scopeUiById[scopeId];
    const controls = document.createElement("div");
    controls.className = "osc-scope-controls";

    const timeLabel = document.createElement("label");
    timeLabel.textContent = "Base de temps";
    const timeSel = document.createElement("select");
    for (const opt of SCOPE_TIME_DIV_OPTIONS) {
        const o = document.createElement("option");
        o.value = String(opt.sec);
        o.textContent = opt.label;
        if (Math.abs(opt.sec - ui.timeDiv) < opt.sec * 0.2) o.selected = true;
        timeSel.appendChild(o);
    }
    ensureTimeDivOption(timeSel, ui.timeDiv);
    timeLabel.appendChild(timeSel);

    const volt1Label = document.createElement("label");
    volt1Label.textContent = "Ampli CH1 (V/div)";
    const volt1Sel = document.createElement("select");
    for (const opt of SCOPE_VOLT_DIV_OPTIONS) {
        const o = document.createElement("option");
        o.value = String(opt.v);
        o.textContent = opt.label;
        const v1 = ui.ch1VoltDiv ?? ui.voltDiv ?? 1;
        if (Math.abs(opt.v - v1) < opt.v * 0.2) o.selected = true;
        volt1Sel.appendChild(o);
    }
    volt1Label.appendChild(volt1Sel);

    const volt2Label = document.createElement("label");
    volt2Label.textContent = "Ampli CH2 (V/div)";
    const volt2Sel = document.createElement("select");
    for (const opt of SCOPE_VOLT_DIV_OPTIONS) {
        const o = document.createElement("option");
        o.value = String(opt.v);
        o.textContent = opt.label;
        const v2 = ui.ch2VoltDiv ?? ui.voltDiv ?? 1;
        if (Math.abs(opt.v - v2) < opt.v * 0.2) o.selected = true;
        volt2Sel.appendChild(o);
    }
    volt2Label.appendChild(volt2Sel);

    const { tMin, tMax, span } = getPlotTimeExtents(plot);
    const timePosLabel = document.createElement("label");
    timePosLabel.textContent = "Position temps";
    const timePosRange = document.createElement("input");
    timePosRange.type = "range";
    timePosRange.min = "0";
    timePosRange.max = "100";
    timePosRange.step = "1";
    const viewSpan = SCOPE_H_DIVS * ui.timeDiv;
    const maxStart = Math.max(0, span - viewSpan);
    const t0Clamped = clampScopeTimeStart(plot, ui);
    const startNorm = maxStart > 0 ? ((t0Clamped - tMin) / maxStart) * 100 : 0;
    timePosRange.value = String(Math.round(Math.max(0, Math.min(100, startNorm))));
    timePosLabel.appendChild(timePosRange);

    const ch1Label = document.createElement("label");
    ch1Label.textContent = "Position CH1";
    const ch1Range = document.createElement("input");
    ch1Range.type = "range";
    ch1Range.min = "-4";
    ch1Range.max = "4";
    ch1Range.step = "0.1";
    ch1Range.value = String(ui.ch1PosDiv);
    ch1Label.appendChild(ch1Range);

    const ch2Label = document.createElement("label");
    ch2Label.textContent = "Position CH2";
    const ch2Range = document.createElement("input");
    ch2Range.type = "range";
    ch2Range.min = "-4";
    ch2Range.max = "4";
    ch2Range.step = "0.1";
    ch2Range.value = String(ui.ch2PosDiv);
    ch2Label.appendChild(ch2Range);

    const syncBtn = document.createElement("button");
    syncBtn.type = "button";
    syncBtn.className = "osc-sync-btn" + (ui.syncEnabled !== false ? " active" : "");
    syncBtn.textContent = ui.syncEnabled !== false ? "SYNC ON" : "SYNC OFF";
    syncBtn.title =
        "Synchronisation sur front montant CH1 (signal stable). Désactiver pour le balayage horizontal.";

    const autoBtn = document.createElement("button");
    autoBtn.type = "button";
    autoBtn.className = "osc-auto-btn";
    autoBtn.textContent = "Réglage automatique";
    controls.append(timeLabel, timePosLabel, volt1Label, volt2Label, ch1Label, ch2Label, syncBtn, autoBtn);
    block.appendChild(controls);

    const redraw = () => {
        const cvs = block.querySelector("canvas.osc-scope-canvas-dual");
        const u = scopeUiById[scopeId];
        if (!cvs || !u) return;
        applyScopeSyncIfEnabled(plot, u);
        const phase = u.syncEnabled !== false ? 1 : u.sweepPhase ?? 0;
        drawDualScopeCanvas(cvs, plot, u, phase);
    };
    syncBtn.addEventListener("click", () => {
        const u = scopeUiById[scopeId];
        u.syncEnabled = !u.syncEnabled;
        syncBtn.classList.toggle("active", u.syncEnabled);
        syncBtn.textContent = u.syncEnabled ? "SYNC ON" : "SYNC OFF";
        if (u.syncEnabled) {
            u.manualTimePan = false;
            u.sweepPhase = 1;
            applyScopeSyncIfEnabled(plot, u);
        } else {
            u.sweepPhase = 0;
        }
        redraw();
    });
    timeSel.addEventListener("change", () => {
        const u = scopeUiById[scopeId];
        u.timeDiv = parseFloat(timeSel.value);
        u.sweepPhase = 0;
        u.timeStart = clampScopeTimeStart(plot, u);
        const { tMin, span: sp } = getPlotTimeExtents(plot);
        const viewSp = SCOPE_H_DIVS * u.timeDiv;
        const maxS = Math.max(0, sp - viewSp);
        timePosRange.value = String(
            Math.round(maxS > 0 ? ((u.timeStart - tMin) / maxS) * 100 : 0)
        );
        if (u.syncEnabled !== false) applyScopeSyncIfEnabled(plot, u);
        redraw();
    });
    volt1Sel.addEventListener("change", () => {
        scopeUiById[scopeId].ch1VoltDiv = parseFloat(volt1Sel.value);
        redraw();
    });
    volt2Sel.addEventListener("change", () => {
        scopeUiById[scopeId].ch2VoltDiv = parseFloat(volt2Sel.value);
        redraw();
    });
    timePosRange.addEventListener("input", () => {
        const u = scopeUiById[scopeId];
        u.manualTimePan = true;
        u.syncEnabled = false;
        syncBtn.classList.remove("active");
        syncBtn.textContent = "SYNC OFF";
        const { tMin: t0, span: sp } = getPlotTimeExtents(plot);
        const viewSp = SCOPE_H_DIVS * u.timeDiv;
        const maxS = Math.max(0, sp - viewSp);
        u.timeStart = t0 + (parseFloat(timePosRange.value) / 100) * maxS;
        u.timeStart = clampScopeTimeStart(plot, u);
        redraw();
    });
    ch1Range.addEventListener("input", () => {
        scopeUiById[scopeId].ch1PosDiv = parseFloat(ch1Range.value);
        redraw();
    });
    ch2Range.addEventListener("input", () => {
        scopeUiById[scopeId].ch2PosDiv = parseFloat(ch2Range.value);
        redraw();
    });
    autoBtn.addEventListener("click", () => {
        autoScopeUi(plot, scopeId);
        ensureTimeDivOption(timeSel, scopeUiById[scopeId].timeDiv);
        volt1Sel.value = String(scopeUiById[scopeId].ch1VoltDiv);
        volt2Sel.value = String(scopeUiById[scopeId].ch2VoltDiv);
        ch1Range.value = String(scopeUiById[scopeId].ch1PosDiv);
        ch2Range.value = String(scopeUiById[scopeId].ch2PosDiv);
        const u = scopeUiById[scopeId];
        const { tMin: t0, span: sp } = getPlotTimeExtents(plot);
        const viewSp = SCOPE_H_DIVS * u.timeDiv;
        const maxS = Math.max(0, sp - viewSp);
        u.timeStart = clampScopeTimeStart(plot, u);
        timePosRange.value = String(
            Math.round(maxS > 0 ? ((u.timeStart - t0) / maxS) * 100 : 0)
        );
        redraw();
    });
}

function openOscilloscopeViewer(scopePlots) {
    if (!liveSimActive) return;
    if (!scopePlots || typeof scopePlots !== "object") return;
    const ids = Object.keys(scopePlots);
    if (!ids.length) return;

    lastScopePlots = scopePlots;
    closeOscilloscopeViewer();

    const wrap = document.createElement("div");
    wrap.className = "osc-scope-float-wrap";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-label", "Oscilloscope");

    const panel = document.createElement("div");
    panel.className = "osc-scope-panel osc-scope-panel-float";

    const header = document.createElement("header");
    header.className = "osc-scope-header";
    const h2 = document.createElement("h2");
    h2.textContent = liveSimActive ? "Oscilloscope (temps r\u00E9el)" : "Oscilloscope";
    header.appendChild(h2);
    const actions = document.createElement("div");
    actions.className = "osc-scope-header-actions";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "osc-scope-close";
    closeBtn.textContent = "\u2715";
    closeBtn.title = "Fermer la fen\u00Eatre (Échap)";
    closeBtn.addEventListener("click", () => closeOscilloscopeViewer());
    actions.appendChild(closeBtn);
    header.appendChild(actions);
    makeOscilloscopePanelDraggable(panel, header);
    panel.appendChild(header);

    const body = document.createElement("div");
    body.className = "osc-scope-body";

    for (const id of ids) {
        const plot = scopePlots[id];
        if (!plot) continue;
        if (!scopeUiById[id]) autoScopeUi(plot, id);
        const block = document.createElement("section");
        block.className = "osc-scope-block";
        const title = document.createElement("h3");
        title.textContent = id;
        block.appendChild(title);

        const legend = document.createElement("p");
        legend.className = "osc-scope-legend";
        legend.innerHTML = '<span class="lg-ch1">\u25A0 CH1</span><span class="lg-ch2">\u25A0 CH2</span>';
        block.appendChild(legend);
        buildScopeControls(block, id, plot);
        const cvs = document.createElement("canvas");
        cvs.className = "osc-scope-canvas-dual";
        cvs.width = 52 + SCOPE_H_DIVS * SCOPE_PX_PER_DIV + 14;
        cvs.height = 18 + SCOPE_V_DIVS * SCOPE_PX_PER_DIV + 26;
        block.appendChild(cvs);
        body.appendChild(block);
    }

    panel.appendChild(body);
    wrap.appendChild(panel);
    document.body.appendChild(wrap);
    oscilloscopeOverlayEl = wrap;

    for (const id of Object.keys(lastScopePlots || {})) {
        if (scopeUiById[id]) scopeUiById[id].sweepPhase = 0;
    }
    startScopeSweepAnimation();
}

function isVoltmeterRmsType(t) {
    return t === "voltmeter_rms";
}

function isAmmeterRmsType(t) {
    return t === "ammeter_rms";
}

function instrumentDisplayLetter(type) {
    if (type === "voltmeter") return "V";
    if (type === "voltmeter_rms") return "Ve";
    if (type === "ammeter") return "A";
    if (type === "ammeter_rms") return "Ae";
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
    activeDragModel = null;
    paletteDragType = null;
    dragPreview = null;
    document.body.classList.remove("palette-drag-active");
    document.querySelectorAll(".menu-item.dropdown-pinned").forEach(el => {
        el.classList.remove("dropdown-pinned");
    });
    document.querySelectorAll(".menu-item-has-submenu.submenu-drag-open").forEach(el => {
        el.classList.remove("submenu-drag-open");
    });
    document.querySelectorAll(".menu-item-has-submenu.submenu-open").forEach(el => {
        el.classList.remove("submenu-open");
    });
    removePaletteDragCanvas();
}

/** Lit data-comp-type sur un bouton de palette (dataset + attribut). */
function paletteCompTypeFromElement(el) {
    if (!el) return "";
    const row = el.closest?.("[data-comp-type]") || (el.matches?.("[data-comp-type]") ? el : null);
    if (!row) return "";
    return row.getAttribute("data-comp-type") || row.dataset?.compType || "";
}

/** Normalise le type composant (guillemets typographiques, espaces). */
function normalizePaletteCompType(t) {
    const s = String(t || "")
        .trim()
        .replace(/\u2018|\u2019/g, "'");
    const low = s.toLowerCase();
    if (low === "logic_jk" || low === "logic_j k") return "logic_jk";
    if (low === "logic_dff" || low === "logic_dbas") return "logic_dff";
    return s;
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

/** Mêmes règles que le serveur (schematic-to-spice) — message clair avant l’appel API. */
function validateCircuitBeforeSimulate(compList) {
    const list = Array.isArray(compList) ? compList : [];
    if (list.length === 0) {
        return {
            ok: false,
            errors: ["Circuit vide : ajoutez une résistance, une pile DC (Sources) ou un ohmmètre (Ω)."],
        };
    }
    const hasPower = list.some(
        c =>
            c &&
            (c.type === "vsource" ||
                c.type === "vsin" ||
                c.type === "vsquare" ||
                c.type === "vterm" ||
                c.type === "logic_state")
    );
    const hasGround = list.some(c => c && c.type === "ground");
    const hasOhm = list.some(c => c && c.type === "ohmmeter");
    const needsDc = list.some(
        c =>
            c &&
            (c.type === "voltmeter" ||
                c.type === "ammeter" ||
                c.type === "voltmeter_rms" ||
                c.type === "ammeter_rms" ||
                c.type === "oscilloscope")
    );
    if (needsDc && !hasPower) {
        return {
            ok: false,
            errors: [
                "Voltmètre, ampèremètre ou oscilloscope : ajoutez une source (pile, borne, état logique, sinus ou carré).",
            ],
        };
    }
    if (!hasPower && !hasOhm && !hasGround) {
        return {
            ok: false,
            errors: [
                "Pour mesurer des résistances sans pile : placez un ohmmètre (Ω) entre les deux points du réseau, avec des fils sur ses deux bornes.",
                "Sinon : ajoutez une pile DC, une borne, un état logique ou une masse pour définir le circuit.",
            ],
        };
    }
    return { ok: true, errors: [] };
}

async function parseSimulateApiResponse(res) {
    const raw = await res.text();
    if (!raw.trim()) return { data: {}, raw };
    try {
        return { data: JSON.parse(raw), raw };
    } catch {
        return { data: { ok: false, errors: [raw.trim().slice(0, 2000)] }, raw };
    }
}

function formatSimulateApiError(res, data, raw) {
    let errs = [];
    if (Array.isArray(data.errors)) errs = data.errors.map(e => String(e)).filter(Boolean);
    else if (data.errors != null && data.errors !== "") errs = [String(data.errors)];
    else if (data.error) errs = [String(data.error)];
    if (errs.length) return errs.join("\n\n");
    if (data.phase === "build") {
        return (
            "Le schéma ne peut pas être simulé.\n\n" +
            "• Résistances sans pile : ohmmètre (Ω) + fils sur les deux bornes\n" +
            "• Tension / courant : pile DC + voltmètre ou ampèremètre en série (A)\n" +
            "• Chaque borne de composant doit être reliée par au moins un fil"
        );
    }
    if (res.status === 403) {
        return (
            "Accès refusé (session). Connectez-vous sur /acces-site, rechargez le simulateur (Ctrl+F5), puis relancez.\n\n" +
            "→ /acces-site?next=" +
            encodeURIComponent("/Simulateur/index.html")
        );
    }
    if (raw && raw.length < 600 && !raw.trimStart().startsWith("<")) return raw.trim();
    return `Erreur HTTP ${res.status} — rechargez la page (Ctrl+F5) et réessayez.`;
}

let lastSimResultsHtml = null;

function updateSimPanelResults(html) {
    lastSimResultsHtml = html;
    const body = document.getElementById("sim-panel-body");
    if (!body) return;
    body.innerHTML =
        html || '<p class="sim-muted">Lancez une simulation avec le bouton 🚀.</p>';
    syncSimPanelPlaceholder();
}

function buildSimulationResultsHtml(data, res, rawBody) {
    if (!res.ok || data.ok === false) {
        const err = formatSimulateApiError(res, data, rawBody);
        let html = `<pre class="sim-error">${escapeHtmlSim(err)}</pre>`;
        if (Array.isArray(data.warnings) && data.warnings.length) {
            html += `<p class="sim-warn">${escapeHtmlSim(data.warnings.join(" "))}</p>`;
        }
        return html;
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
    const vmRms = data.voltmeterRmsValues || {};
    const vmRmsIds = Array.isArray(data.voltmeterRmsIds) ? data.voltmeterRmsIds : Object.keys(vmRms);
    const vmRmsNodes = Array.isArray(data.voltmeterRmsNodes) ? data.voltmeterRmsNodes : [];
    const vmRmsNodeById = Object.fromEntries(vmRmsNodes.map(x => [x.id, x]));
    const vmRmsKeys = Object.keys(vmRms);
    const amRms = data.ammeterRmsValues || {};
    const amRmsIds = Array.isArray(data.ammeterRmsIds) ? data.ammeterRmsIds : Object.keys(amRms);
    const amRmsMeta = Array.isArray(data.ammeterRmsBranches) ? data.ammeterRmsBranches : [];
    const amRmsMetaById = Object.fromEntries(amRmsMeta.map(x => [x.id, x]));
    const amRmsKeys = Object.keys(amRms);
    const om = data.ohmmeterValues || {};
    const omIds = Array.isArray(data.ohmmeterIds) ? data.ohmmeterIds : Object.keys(om);
    const omMeta = Array.isArray(data.ohmmeterNodes) ? data.ohmmeterNodes : [];
    const omMetaById = Object.fromEntries(omMeta.map(x => [x.id, x]));
    const omKeys = Object.keys(om);
    const led = data.ledValues || {};
    const ledIds = Array.isArray(data.ledIds) ? data.ledIds : Object.keys(led);
    const ledKeys = Object.keys(led);
    const lg = data.logicValues || {};
    const lgIds = Array.isArray(data.logicIds) ? data.logicIds : Object.keys(lg);
    const lgKeys = Object.keys(lg);
    let html = "";
    const sc = data.oscilloscopeValues || {};
    const scIds = Array.isArray(data.oscilloscopeIds) ? data.oscilloscopeIds : Object.keys(sc);
    const scKeys = Object.keys(sc);
    if (
        vmIds.length === 0 &&
        amIds.length === 0 &&
        vmRmsIds.length === 0 &&
        amRmsIds.length === 0 &&
        omIds.length === 0 &&
        ledIds.length === 0 &&
        lgIds.length === 0 &&
        scIds.length === 0
    ) {
        html += "<p class=\"sim-muted\">Aucun appareil de mesure.</p>";
    } else {
        if (vmIds.length > 0 && vmKeys.length > 0) {
            html += "<h4 class=\"sim-subtitle\">Voltmètres (DC)</h4><table class=\"sim-table\"><thead><tr><th>Id</th><th>Nœuds</th><th>Tension</th></tr></thead><tbody>";
            for (const id of vmIds) {
                const row = vm[id];
                const v = row && typeof row.voltage === "number" ? row.voltage : NaN;
                const txt = Number.isFinite(v) ? formatValueWithUnit(v, "V") : "—";
                const nodes = vmNodeById[id] || row || {};
                const nodeTxt = nodes.nodePlus && nodes.nodeMinus ? `${nodes.nodePlus} → ${nodes.nodeMinus}` : "—";
                html += `<tr><td>${escapeHtmlSim(id)}</td><td>${escapeHtmlSim(nodeTxt)}</td><td>${escapeHtmlSim(txt)}</td></tr>`;
            }
            html += "</tbody></table>";
        }
        if (vmRmsIds.length > 0 && vmRmsKeys.length > 0) {
            html += "<h4 class=\"sim-subtitle\">Voltmètres (Veff)</h4><table class=\"sim-table\"><thead><tr><th>Id</th><th>Nœuds</th><th>Veff</th></tr></thead><tbody>";
            for (const id of vmRmsIds) {
                const row = vmRms[id];
                const v = row && typeof row.voltage === "number" ? row.voltage : NaN;
                const sfx = row?.measure === "Vrms" ? " eff." : "";
                const txt = Number.isFinite(v) ? formatValueWithUnit(v, "V") + sfx : "—";
                const nodes = vmRmsNodeById[id] || row || {};
                const nodeTxt = nodes.nodePlus && nodes.nodeMinus ? `${nodes.nodePlus} → ${nodes.nodeMinus}` : "—";
                html += `<tr><td>${escapeHtmlSim(id)}</td><td>${escapeHtmlSim(nodeTxt)}</td><td>${escapeHtmlSim(txt)}</td></tr>`;
            }
            html += "</tbody></table>";
        }
        if (amIds.length > 0 && amKeys.length > 0) {
            html += "<h4 class=\"sim-subtitle\">Ampèremètres (DC)</h4><table class=\"sim-table\"><thead><tr><th>Id</th><th>Branche</th><th>Courant</th></tr></thead><tbody>";
            for (const id of amIds) {
                const row = am[id];
                const i = row && typeof row.current === "number" ? row.current : NaN;
                const txt = Number.isFinite(i) ? formatValueWithUnit(i, "A") : "—";
                const meta = amMetaById[id] || row || {};
                html += `<tr><td>${escapeHtmlSim(id)}</td><td>${escapeHtmlSim(meta.branch || "—")}</td><td>${escapeHtmlSim(txt)}</td></tr>`;
            }
            html += "</tbody></table>";
        }
        if (amRmsIds.length > 0 && amRmsKeys.length > 0) {
            html += "<h4 class=\"sim-subtitle\">Ampèremètres (Aeff)</h4><table class=\"sim-table\"><thead><tr><th>Id</th><th>Branche</th><th>Aeff</th></tr></thead><tbody>";
            for (const id of amRmsIds) {
                const row = amRms[id];
                const i = row && typeof row.current === "number" ? row.current : NaN;
                const sfx = row?.measure === "Arms" ? " eff." : "";
                const txt = Number.isFinite(i) ? formatValueWithUnit(i, "A") + sfx : "—";
                const meta = amRmsMetaById[id] || row || {};
                html += `<tr><td>${escapeHtmlSim(id)}</td><td>${escapeHtmlSim(meta.branch || "—")}</td><td>${escapeHtmlSim(txt)}</td></tr>`;
            }
            html += "</tbody></table>";
        }
        if (ledIds.length > 0 && ledKeys.length > 0) {
            html += "<h4 class=\"sim-subtitle\">LED</h4><table class=\"sim-table\"><thead><tr><th>Id</th><th>Courant</th><th>État</th></tr></thead><tbody>";
            for (const id of ledIds) {
                const row = led[id];
                const i = row && typeof row.current === "number" ? row.current : NaN;
                const txt = Number.isFinite(i) ? formatValueWithUnit(i, "A") : "—";
                const comp = components.find(c => c.id === id);
                let etat = "éteinte";
                if (comp && comp.ledSmoke) etat = "⚠ surintensité (fumée)";
                else if (comp && comp.ledReverseBias) etat = "⚠ polarité (anode → +)";
                else if (comp && comp.ledOn) etat = "allumée";
                html += `<tr><td>${escapeHtmlSim(id)}</td><td>${escapeHtmlSim(txt)}</td><td>${escapeHtmlSim(etat)}</td></tr>`;
            }
            html += "</tbody></table>";
        }
        if (lgIds.length > 0 && lgKeys.length > 0) {
            html += "<h4 class=\"sim-subtitle\">Portes logiques</h4><table class=\"sim-table\"><thead><tr><th>Id</th><th>Sortie</th><th>Niveau</th></tr></thead><tbody>";
            for (const id of lgIds) {
                const row = lg[id];
                const v = row && typeof row.voltage === "number" ? row.voltage : NaN;
                const vTxt = Number.isFinite(v) ? formatValueWithUnit(v, "V") : "—";
                const lvl = row?.logic === "1" ? "1 (HAUT)" : row?.logic === "0" ? "0 (BAS)" : "—";
                html += `<tr><td>${escapeHtmlSim(id)}</td><td>${escapeHtmlSim(vTxt)}</td><td>${escapeHtmlSim(lvl)}</td></tr>`;
            }
            html += "</tbody></table>";
        }
        if (omIds.length > 0 && omKeys.length > 0) {
            html += "<h4 class=\"sim-subtitle\">Ohmmètres</h4><table class=\"sim-table\"><thead><tr><th>Id</th><th>Nœuds</th><th>R</th></tr></thead><tbody>";
            for (const id of omIds) {
                const row = om[id];
                const r = row && typeof row.resistance === "number" ? row.resistance : NaN;
                const txt = Number.isFinite(r) ? formatValueWithUnit(r, "Ω") : "—";
                const meta = omMetaById[id] || row || {};
                const nodeTxt = meta.nodePlus && meta.nodeMinus ? `${meta.nodePlus} → ${meta.nodeMinus}` : "—";
                html += `<tr><td>${escapeHtmlSim(id)}</td><td>${escapeHtmlSim(nodeTxt)}</td><td>${escapeHtmlSim(txt)}</td></tr>`;
            }
            html += "</tbody></table>";
        }
        if (scIds.length > 0) {
            if (scKeys.length > 0) {
                html += "<h4 class=\"sim-subtitle\">Oscilloscopes</h4><table class=\"sim-table\"><thead><tr><th>Id</th><th>CH1</th><th>CH2</th></tr></thead><tbody>";
                for (const id of scIds) {
                    const row = sc[id];
                    const v1 = row?.ch1?.voltage;
                    const v2 = row?.ch2?.voltage;
                    const sfx = row?.ch1?.measure === "Vpp" || row?.ch2?.measure === "Vpp" ? " (crête)" : "";
                    const t1 = typeof v1 === "number" && Number.isFinite(v1) ? formatValueWithUnit(v1, "V") + sfx : "—";
                    const t2 = typeof v2 === "number" && Number.isFinite(v2) ? formatValueWithUnit(v2, "V") + sfx : "—";
                    html += `<tr><td>${escapeHtmlSim(id)}</td><td>${escapeHtmlSim(t1)}</td><td>${escapeHtmlSim(t2)}</td></tr>`;
                }
                html += "</tbody></table>";
            }
        }
    }
    if (Array.isArray(data.warnings) && data.warnings.length) {
        html += `<p class="sim-warn">${escapeHtmlSim(data.warnings.join(" "))}</p>`;
    }
    html +=
        "<details class=\"sim-details\"><summary>Diagnostic SPICE</summary><pre class=\"sim-log-snippet\">" +
        escapeHtmlSim(`--- NETLIST ---\n${data.netlist || ""}\n\n--- JOURNAL ---\n${(data.log || "").slice(-3500)}`) +
        "</pre></details>";
    return html;
}

function runSimulation() {
    startLiveSimulation();
}

function isTwoTerminalType(t) {
    return (
        t === "resistor" ||
        t === "capacitor" ||
        t === "inductor" ||
        t === "diode" ||
        isOptoTwoTerminalType(t) ||
        t === "vsource" ||
        t === "voltmeter" ||
        t === "ammeter" ||
        t === "voltmeter_rms" ||
        t === "ammeter_rms" ||
        t === "ohmmeter"
    );
}

function isSignalGeneratorType(t) {
    return t === "vsin" || t === "vsquare";
}

function isOscilloscopeType(t) {
    return t === "oscilloscope";
}

function isNpnType(t) {
    return t === "npn";
}

function isOpampType(t) {
    return t === "opamp";
}

function isThreeTerminalActiveType(t) {
    return isNpnType(t) || isOpampType(t);
}

function isSchematicTerminalType(t) {
    return (
        isTwoTerminalType(t) ||
        isSeg7Type(t) ||
        isThreeTerminalActiveType(t) ||
        isLogicGateType(t) ||
        isLogicFlipFlopType(t) ||
        isLogicIcType(t) ||
        isSignalGeneratorType(t) ||
        isOscilloscopeType(t) ||
        isSingleTerminalRefType(t)
    );
}

function isInstrumentType(t) {
    return (
        t === "voltmeter" ||
        t === "ammeter" ||
        t === "voltmeter_rms" ||
        t === "ammeter_rms" ||
        t === "ohmmeter"
    );
}

function isValueEditableType(t) {
    return (
        t === "resistor" ||
        t === "capacitor" ||
        t === "inductor" ||
        t === "diode" ||
        t === "npn" ||
        t === "vsource" ||
        t === "vterm"
    );
}

function isOpampInspectorType(t) {
    return t === "opamp";
}

/** Symbole masse (orientation 0 : connexion en haut). */
function drawGroundSymbol(ctx, w, h) {
    const cx = w / 2;
    const stemBot = h * 0.28;
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, stemBot);
    ctx.stroke();
    const bars = [
        { y: stemBot + GRID_SIZE * 0.1, half: w * 0.42 },
        { y: stemBot + GRID_SIZE * 0.28, half: w * 0.28 },
        { y: stemBot + GRID_SIZE * 0.46, half: w * 0.14 },
    ];
    for (const b of bars) {
        ctx.beginPath();
        ctx.moveTo(cx - b.half, b.y);
        ctx.lineTo(cx + b.half, b.y);
        ctx.stroke();
    }
    const fs = Math.max(10, 12 / Math.max(scale, 0.2));
    ctx.font = `600 ${fs}px Segoe UI`;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("GND", cx, stemBot + GRID_SIZE * 0.55);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
}

/** Centre du carré 0/1 (repère symbole borne logique, orientation 0). */
function logicStateLabelLocal() {
    const cx = GND_BASE_W / 2;
    const tipY = GND_BASE_H - GRID_SIZE * 0.35;
    const baseY = tipY - GRID_SIZE * 0.55;
    const boxH = GRID_SIZE * 1.2;
    const boxTop = baseY - boxH - GRID_SIZE * 0.06;
    return { x: cx, y: boxTop + boxH / 2 };
}

/** Borne d’état logique (0 ou rail 3,3 V / 5 V) — connexion en bas comme la borne tension. */
function drawLogicStateSymbol(ctx, w, h, valueText, drawDigit = true) {
    const state = normalizeLogicStateDisplay(valueText);
    const cx = w / 2;
    const tipY = h - GRID_SIZE * 0.35;
    const baseY = tipY - GRID_SIZE * 0.55;
    const boxW = GRID_SIZE * 1.2;
    const boxH = GRID_SIZE * 1.2;
    const boxTop = baseY - boxH - GRID_SIZE * 0.06;
    const boxLeft = cx - boxW / 2;
    const stroke0 = ctx.strokeStyle;

    ctx.beginPath();
    ctx.moveTo(cx, tipY);
    ctx.lineTo(cx, baseY);
    ctx.stroke();

    ctx.save();
    ctx.fillStyle = state === "1" ? "rgba(102, 187, 106, 0.28)" : "rgba(144, 164, 174, 0.22)";
    ctx.strokeStyle = state === "1" ? "#43A047" : "#78909C";
    ctx.beginPath();
    ctx.rect(boxLeft, boxTop, boxW, boxH);
    ctx.fill();
    ctx.stroke();
    if (drawDigit) {
        const fs = Math.max(14, 18 / Math.max(scale, 0.2));
        ctx.font = `700 ${fs}px Segoe UI`;
        ctx.fillStyle = state === "1" ? "#2E7D32" : "#455A64";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(state, cx, boxTop + boxH / 2);
        ctx.textAlign = "start";
        ctx.textBaseline = "alphabetic";
    }
    ctx.restore();
    ctx.strokeStyle = stroke0;
}

function drawLogicStateLabelUpright(ctx, c) {
    const state = normalizeLogicStateDisplay(c.value);
    const ll = logicStateLabelLocal();
    const pt = localBaseToWorld(c, ll.x, ll.y, GND_BASE_W, GND_BASE_H);
    const fs = Math.max(14, 18 / Math.max(scale, 0.2));
    ctx.save();
    ctx.font = `700 ${fs}px Segoe UI`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = state === "1" ? "#2E7D32" : "#455A64";
    ctx.fillText(state, pt.x - c.x, pt.y - c.y);
    ctx.restore();
}

function logicStateRailLabelLocal() {
    const cx = GND_BASE_W / 2;
    const tipY = GND_BASE_H - GRID_SIZE * 0.35;
    const baseY = tipY - GRID_SIZE * 0.55;
    const boxH = GRID_SIZE * 1.2;
    const boxTop = baseY - boxH - GRID_SIZE * 0.06;
    return { x: cx, y: boxTop - GRID_SIZE * 0.22 };
}

function drawLogicStateRailLabelUpright(ctx, c) {
    ensureLogicRailField(c);
    const rl = logicStateRailLabelLocal();
    const pt = localBaseToWorld(c, rl.x, rl.y, GND_BASE_W, GND_BASE_H);
    const fs = Math.max(9, 11 / Math.max(scale, 0.2));
    ctx.save();
    ctx.font = `600 ${fs}px Segoe UI`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "#5C6BC0";
    ctx.fillText(formatLogicRailShort(c.logicRail), pt.x - c.x, pt.y - c.y);
    ctx.restore();
}

/** Borne tension (orientation 0 : connexion en bas, triangle vers le haut). */
function drawVtermSymbol(ctx, w, h, valueText) {
    const cx = w / 2;
    const tipY = h - GRID_SIZE * 0.35;
    const baseY = tipY - GRID_SIZE * 0.55;
    const halfW = GRID_SIZE * 0.42;
    ctx.beginPath();
    ctx.moveTo(cx, tipY);
    ctx.lineTo(cx, baseY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - halfW, baseY);
    ctx.lineTo(cx, tipY - GRID_SIZE * 0.95);
    ctx.lineTo(cx + halfW, baseY);
    ctx.closePath();
    ctx.stroke();
    const fs = Math.max(11, 13 / Math.max(scale, 0.2));
    ctx.font = `600 ${fs}px Segoe UI`;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(valueText || "5V", cx - GRID_SIZE * 0.15, (baseY + tipY) / 2);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
}

/** Triangle + barre centrés (orientation 0 : anode gauche). */
function drawDiodeSymbolLR(ctx, bw, bh) {
    const midY = bh / 2;
    const halfCross = bh * 0.46;
    const cx = bw / 2;
    const xTriBase = cx - bw * 0.18;
    const xBar = cx + bw * 0.18;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(xTriBase, midY);
    ctx.moveTo(xBar, midY);
    ctx.lineTo(bw, midY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(xTriBase, midY - halfCross);
    ctx.lineTo(xBar, midY);
    ctx.lineTo(xTriBase, midY + halfCross);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(xBar, midY - halfCross * 1.08);
    ctx.lineTo(xBar, midY + halfCross * 1.08);
    ctx.stroke();
}

function drawDiodeSymbol(ctx, w, h, orient) {
    const o = ((orient % 4) + 4) % 4;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((-o * Math.PI) / 2);
    ctx.translate(-DIODE_BASE_W / 2, -DIODE_BASE_H / 2);
    drawDiodeSymbolLR(ctx, DIODE_BASE_W, DIODE_BASE_H);
    ctx.restore();
}

function hexToRgb(hex) {
    const h = String(hex || "").replace("#", "");
    if (h.length === 3) {
        return {
            r: parseInt(h[0] + h[0], 16),
            g: parseInt(h[1] + h[1], 16),
            b: parseInt(h[2] + h[2], 16),
        };
    }
    if (h.length !== 6) return { r: 229, g: 57, b: 53 };
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

function normalizeLedColor(raw) {
    const presets = {
        red: "#e53935",
        rouge: "#e53935",
        green: "#43a047",
        vert: "#43a047",
        blue: "#1e88e5",
        bleu: "#1e88e5",
        yellow: "#fdd835",
        jaune: "#fdd835",
        orange: "#fb8c00",
        white: "#eeeeee",
        blanc: "#eeeeee",
    };
    const t = String(raw || "").trim().toLowerCase();
    if (presets[t]) return presets[t];
    if (/^#[0-9a-f]{6}$/i.test(t)) return t;
    if (/^#[0-9a-f]{3}$/i.test(t)) {
        return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`;
    }
    return LED_DEFAULT_COLOR;
}

function ensureLedFields(c) {
    if (!c || !isLedType(c.type)) return;
    if (!c.ledColor) c.ledColor = normalizeLedColor(c.value);
    if (c.iMax == null || !(c.iMax > 0)) c.iMax = LED_DEFAULT_IMAX_A;
    c.ledOn = !!c.ledOn;
    c.ledSmoke = !!c.ledSmoke;
    c.ledReverseBias = !!c.ledReverseBias;
    c.ledCurrent = Number.isFinite(c.ledCurrent) ? c.ledCurrent : 0;
}

function getLedColor(c) {
    ensureLedFields(c);
    return c.ledColor || LED_DEFAULT_COLOR;
}

function getLedImax(c) {
    ensureLedFields(c);
    return c.iMax > 0 ? c.iMax : LED_DEFAULT_IMAX_A;
}

function ledSpiceBranchName(id) {
    const safe = String(id).replace(/[^a-zA-Z0-9_]/g, "_");
    return `vil_${safe}`.toLowerCase();
}

/** Parse les courants de branches depuis le journal ngspice (secours si ledValues vide). */
function collectBranchCurrentsFromLogClient(log) {
    const map = Object.create(null);
    if (!log || typeof log !== "string") return map;
    const touch = (branch, i) => {
        const b = String(branch || "").trim().toLowerCase();
        if (b && Number.isFinite(i)) map[b] = i;
    };
    let m;
    const reEq = /\bi\s*\(\s*([^)]+?)\s*\)\s*=\s*([-+eE0-9.]+)/gi;
    while ((m = reEq.exec(log)) !== null) touch(m[1], parseFloat(m[2]));
    const reSp = /\bi\s*\(\s*([^)]+?)\s*\)\s+([-+eE0-9.]+)/gi;
    while ((m = reSp.exec(log)) !== null) touch(m[1], parseFloat(m[2]));
    const reRev = /\b([-+eE0-9.]+)\s*=\s*i\s*\(\s*([^)]+?)\s*\)/gi;
    while ((m = reRev.exec(log)) !== null) touch(m[2], parseFloat(m[1]));
    const reDev = /\b((?:vil|vi|d)_[a-z0-9_]+)(?:#branchcurrent)?\s*[:=]?\s+([-+eE0-9.]+)/gi;
    while ((m = reDev.exec(log)) !== null) touch(m[1], parseFloat(m[2]));
    const blocks = log.split(/@@LD:([A-Za-z0-9_]+)@@/gi);
    for (let i = 1; i < blocks.length; i += 2) {
        const id = blocks[i];
        const chunk = blocks[i + 1] || "";
        const safe = String(id).replace(/[^a-zA-Z0-9_]/g, "_");
        const reLd = /\bi\s*\(\s*vil_([^)]+?)\s*\)\s*=\s*([-+eE0-9.]+)/i;
        const hit = reLd.exec(chunk);
        if (hit) touch(`vil_${hit[1]}`, parseFloat(hit[2]));
        else {
            const reLd2 = /\bi\s*\(\s*([^)]+?)\s*\)\s*=\s*([-+eE0-9.]+)/i;
            const hit2 = reLd2.exec(chunk);
            if (hit2) touch(hit2[1], parseFloat(hit2[2]));
        }
        if (id && map[`vil_${safe}`.toLowerCase()] == null) {
            const reAny = /\bi\s*\(\s*[^)]+\s*\)\s*=\s*([-+eE0-9.]+)/i.exec(chunk);
            if (reAny) touch(`vil_${safe}`.toLowerCase(), parseFloat(reAny[1]));
        }
    }
    return map;
}

function collectNodeVoltagesFromLogClient(log) {
    const map = Object.create(null);
    if (!log || typeof log !== "string") return map;
    const re = /\bv\s*\(\s*([^)]+?)\s*\)\s*=\s*([-+eE0-9.]+)/gi;
    let m;
    while ((m = re.exec(log)) !== null) {
        const n = String(m[1]).trim().toLowerCase();
        const v = parseFloat(m[2]);
        if (n && Number.isFinite(v)) map[n] = v;
    }
    return map;
}

function nodeVFromLogMap(name, vmap) {
    const n = String(name || "").trim().toLowerCase();
    if (n === "0" || n === "gnd") return 0;
    const v = vmap[n];
    return v != null && Number.isFinite(v) ? v : null;
}

/** Courant direct : V(anode) > V(cathode) si tensions connues, sinon i>0 (convention SPICE). */
function ledForwardCurrentFromRow(row, meta, vmap) {
    if (!row || typeof row.current !== "number" || !Number.isFinite(row.current)) return 0;
    const i = row.current;
    const np = meta?.nodePlus;
    const nm = meta?.nodeMinus;
    if (np && nm && vmap && Object.keys(vmap).length > 0) {
        const vp = nodeVFromLogMap(np, vmap);
        const vm = nodeVFromLogMap(nm, vmap);
        if (vp != null && vm != null) {
            if (vp <= vm + 0.15) return 0;
            return Math.abs(i);
        }
    }
    return i > 0 ? i : 0;
}

function ledCurrentFromTranPlot(plot, tWallSec) {
    const times = plot?.time;
    const currents = plot?.current;
    if (!times?.length || !currents?.length) return 0;
    const t0 = times[0];
    const t1 = times[times.length - 1];
    const span = t1 - t0;
    if (!(span > 0)) return currents[currents.length - 1] ?? 0;
    const tx = t0 + ((((tWallSec % span) + span) % span));
    if (tx <= times[0]) return currents[0] ?? 0;
    if (tx >= times[times.length - 1]) return currents[currents.length - 1] ?? 0;
    for (let k = 0; k < times.length - 1; k++) {
        if (tx >= times[k] && tx <= times[k + 1]) {
            const dt = times[k + 1] - times[k];
            const u = dt > 0 ? (tx - times[k]) / dt : 0;
            const i0 = currents[k] ?? 0;
            const i1 = currents[k + 1] ?? 0;
            return i0 + u * (i1 - i0);
        }
    }
    return currents[currents.length - 1] ?? 0;
}

function buildLedValuesFromSimData(data) {
    const tranPlots = data?.ledTranPlots;
    if (data?.analysisTran && tranPlots && typeof tranPlots === "object" && Object.keys(tranPlots).length > 0) {
        const out = {};
        for (const c of components) {
            if (!isLedType(c.type)) continue;
            const plot = tranPlots[c.id];
            if (!plot?.current?.length) {
                out[c.id] = { current: 0, reverseBias: true };
                continue;
            }
            let peak = 0;
            for (const i of plot.current) {
                if (Number.isFinite(i) && i > peak) peak = i;
            }
            out[c.id] = {
                current: peak,
                branch: plot.branch,
                nodePlus: plot.nodePlus,
                nodeMinus: plot.nodeMinus,
                reverseBias: peak < LED_ON_CURRENT_A,
            };
        }
        return out;
    }

    const out = { ...(data?.ledValues || {}) };
    const log = data?.log || "";
    const metaList = Array.isArray(data?.ledBranches) ? data.ledBranches : [];
    const metaById = Object.fromEntries(metaList.map(m => [m.id, m]));
    const branchMap = collectBranchCurrentsFromLogClient(log);
    const vmap = collectNodeVoltagesFromLogClient(log);

    for (const c of components) {
        if (!isLedType(c.type)) continue;
        const meta = metaById[c.id] || {
            id: c.id,
            branch: ledSpiceBranchName(c.id),
            nodePlus: null,
            nodeMinus: null,
        };
        const branch = String(meta.branch || ledSpiceBranchName(c.id)).toLowerCase();
        let iRaw = out[c.id]?.current;
        if (iRaw == null) {
            iRaw = branchMap[branch];
            if (iRaw == null) iRaw = branchMap[ledSpiceBranchName(c.id)];
            if (iRaw == null) iRaw = branchMap[`d${c.id}`.toLowerCase()];
        }
        if (iRaw == null || !Number.isFinite(iRaw)) {
            out[c.id] = { current: 0, branch, nodePlus: meta.nodePlus, nodeMinus: meta.nodeMinus };
            continue;
        }
        const iFwd = ledForwardCurrentFromRow({ current: iRaw }, meta, vmap);
        const vp = nodeVFromLogMap(meta.nodePlus, vmap);
        const vm = nodeVFromLogMap(meta.nodeMinus, vmap);
        const reverseBias = vp != null && vm != null && vp <= vm + 0.15;
        out[c.id] = {
            current: iFwd,
            branch,
            nodePlus: meta.nodePlus,
            nodeMinus: meta.nodeMinus,
            reverseBias,
        };
    }
    return out;
}

/** État visuel dérivé du courant (source unique pour le dessin). */
function getLedVisualState(c) {
    if (!c || !isLedType(c.type)) return { intensity: 0, on: false, smoke: false, i: 0 };
    let i = Number(c.ledCurrent);
    const plot = lastLedTranPlots[c.id];
    if (plot?.time?.length > 1) {
        if (!ledTranAnimStartMs) ledTranAnimStartMs = performance.now();
        const tWall = (performance.now() - ledTranAnimStartMs) / 1000;
        i = ledCurrentFromTranPlot(plot, tWall);
    }
    if (!Number.isFinite(i) || i <= 0) return { intensity: 0, on: false, smoke: false, i: 0 };
    const iMax = getLedImax(c);
    if (i > iMax) return { intensity: 1, on: true, smoke: true, i };
    if (i <= LED_ON_CURRENT_A) return { intensity: 0, on: false, smoke: false, i };
    const intensity = Math.min(1, i / iMax);
    return { intensity, on: true, smoke: false, i };
}

function getLedIntensity(c) {
    return getLedVisualState(c).intensity;
}

function applyLedSimulationState(ledValues) {
    for (const c of components) {
        if (!isLedType(c.type)) continue;
        ensureLedFields(c);
        const row = ledValues[c.id];
        if (!row || typeof row.current !== "number" || !Number.isFinite(row.current)) {
            c.ledCurrent = 0;
            c.ledReverseBias = !!(row && row.reverseBias);
        } else {
            c.ledCurrent = row.current;
            c.ledReverseBias = !!row.reverseBias;
        }
        const vs = getLedVisualState(c);
        c.ledOn = vs.on;
        c.ledSmoke = vs.smoke;
    }
    updateLedAnimationLoop();
}

function ledNeedsAnimation() {
    if (components.some(c => isLedType(c.type) && c.ledSmoke)) return true;
    if (Object.keys(lastLedTranPlots).length > 0) return true;
    if (
        liveSimActive &&
        components.some(c => isLedType(c.type) && getLedVisualState(c).intensity > 0)
    )
        return true;
    return false;
}

function updateLedAnimationLoop() {
    if (ledNeedsAnimation()) {
        if (ledAnimRaf == null) startLedAnimationLoop();
    } else if (ledAnimRaf != null) {
        cancelAnimationFrame(ledAnimRaf);
        ledAnimRaf = null;
    }
}

function startLedAnimationLoop() {
    const step = () => {
        ledAnimRaf = null;
        if (!ledNeedsAnimation()) return;
        draw();
        ledAnimRaf = requestAnimationFrame(step);
    };
    ledAnimRaf = requestAnimationFrame(step);
}

function drawLedSmoke(ctx, cx, cy, bw, bh) {
    const t = performance.now();
    ctx.save();
    for (let i = 0; i < 9; i++) {
        const phase = t * 0.0022 + i * 0.9;
        const px = cx + Math.sin(phase * 2.3) * bw * 0.28;
        const py = cy - bh * 0.55 - ((t * 0.05 + i * 18) % (bh * 1.4));
        const r = GRID_SIZE * (0.22 + 0.08 * (i % 3));
        const a = 0.18 + 0.12 * (0.5 + 0.5 * Math.sin(phase));
        ctx.fillStyle = `rgba(70, 70, 72, ${a})`;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawLedArrows(ctx, ax, cy, bw, intensity) {
    const ay = cy - GRID_SIZE * 0.42;
    ctx.save();
    ctx.lineWidth = Math.max(1.2, (1.4 + intensity * 1.6) / scale);
    ctx.strokeStyle = `rgba(255, 215, 80, ${0.55 + 0.35 * intensity})`;
    for (const dy of [0, GRID_SIZE * 0.36]) {
        ctx.beginPath();
        ctx.moveTo(ax, ay - dy);
        ctx.lineTo(ax + GRID_SIZE * 0.26, ay - dy - GRID_SIZE * 0.22);
        ctx.moveTo(ax + GRID_SIZE * 0.18, ay - dy - GRID_SIZE * 0.04);
        ctx.lineTo(ax + GRID_SIZE * 0.26, ay - dy - GRID_SIZE * 0.22);
        ctx.moveTo(ax + GRID_SIZE * 0.10, ay - dy - GRID_SIZE * 0.18);
        ctx.lineTo(ax + GRID_SIZE * 0.26, ay - dy - GRID_SIZE * 0.22);
        ctx.stroke();
    }
    ctx.restore();
}

/** Halo + fumée en coordonnées monde (après les composants). */
function drawLedEffectsOverlay() {
    for (const c of components) {
        if (!isLedType(c.type)) continue;
        const vs = getLedVisualState(c);
        if (!vs.on && !vs.smoke) continue;
        const { w, h } = componentDims(c);
        const cx = c.x + w / 2;
        const cy = c.y + h / 2;
        const color = getLedColor(c);
        const rgb = hexToRgb(color);

        if (vs.smoke) {
            drawLedSmoke(ctx, cx, cy - h * 0.15, w * 1.6, h * 1.8);
        }

        if (vs.on && vs.intensity > 0) {
            const haloR = Math.max(w, h) * (0.45 + 0.45 * vs.intensity);
            ctx.save();
            ctx.shadowColor = color;
            ctx.shadowBlur = (10 + 22 * vs.intensity) / Math.max(scale, 0.2);
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
            grad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.28 * vs.intensity})`);
            grad.addColorStop(0.45, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.1 * vs.intensity})`);
            grad.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }
}

/** Trait oblique CEI au coin corps / fil de sortie (collé au rectangle et au fil). */
function drawLogicInversionSlash(ctx, cornerX, cornerY) {
    const s = GRID_SIZE * 0.28;
    const lw = Math.max(1.4, 1.8 / Math.max(scale, 0.2));
    ctx.save();
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cornerX, cornerY - s);
    ctx.lineTo(cornerX + s, cornerY);
    ctx.stroke();
    ctx.restore();
}

/** Symbole rectangulaire CEI 60617-12 (orientation 0 : entrées à gauche, sortie à droite). */
function drawLogicGateSymbolLR(ctx, bw, bh, gateType) {
    const kind = logicGateKind(gateType);
    const g = GRID_SIZE;
    const lead = LOGIC_GATE_LEAD;
    const outY = kind.inputs === 1 ? bh / 2 : 2 * g;

    ctx.beginPath();
    ctx.rect(0, 0, bw, bh);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(bw, outY);
    ctx.lineTo(bw + lead, outY);
    ctx.stroke();
    if (kind.invert) drawLogicInversionSlash(ctx, bw, outY);

    if (kind.inputs === 1) {
        ctx.beginPath();
        ctx.moveTo(-lead, outY);
        ctx.lineTo(0, outY);
        ctx.stroke();
    } else {
        ctx.beginPath();
        ctx.moveTo(-lead, g);
        ctx.lineTo(0, g);
        ctx.moveTo(-lead, 3 * g);
        ctx.lineTo(0, 3 * g);
        ctx.stroke();
    }
}

/** Libellé CEI toujours lisible (non affecté par la rotation du symbole). */
function drawLogicGateIecLabelUpright(ctx, c) {
    const bh = logicGateBaseH(c.type);
    const bw = LOGIC_GATE_W;
    const kind = logicGateKind(c.type);
    const g = GRID_SIZE;
    const labelY = kind.inputs === 1 ? bh / 2 : 2 * g;
    const pt = localBaseToWorld(c, bw / 2, labelY, bw, bh);
    const fs = Math.max(11, Math.min(bh * 0.42, bw * 0.38) / Math.max(scale, 0.2));
    ctx.save();
    ctx.font = `600 ${fs}px Segoe UI`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillText(kind.iec, pt.x - c.x, pt.y - c.y);
    ctx.restore();
}

function drawLogicGateSymbolOriented(ctx, c) {
    const o = getCompOrient(c);
    const bh = logicGateBaseH(c.type);
    const { w, h } = logicGateDimsFromOrient(o, c.type);
    const sx = c.mirrorX ? -1 : 1;
    const sy = c.mirrorY ? -1 : 1;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((-o * Math.PI) / 2);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    ctx.translate(-LOGIC_GATE_W / 2, -bh / 2);
    drawLogicGateSymbolLR(ctx, LOGIC_GATE_W, bh, c.type);
    ctx.restore();
}

function drawClockInputTriangle(ctx, y) {
    const s = GRID_SIZE * 0.24;
    ctx.save();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(0, y - s);
    ctx.lineTo(s * 1.15, y);
    ctx.lineTo(0, y + s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

function componentPinLabelFontSize() {
    return Math.max(12, 16 / Math.max(scale, 0.2));
}

function drawLogicFlipFlopSymbolLR(ctx, bw, bh, type) {
    const g = GRID_SIZE;
    const lead = LOGIC_FF_LEAD;
    ctx.beginPath();
    ctx.rect(0, 0, bw, bh);
    ctx.stroke();
    const clkY = type === "logic_dff" ? 3 * g : 2 * g;
    const inputYs = type === "logic_dff" ? [g, clkY] : [g, clkY, 3 * g];
    const outputYs = type === "logic_dff" ? [2 * g, 3 * g] : [g, 3 * g];
    for (const py of inputYs) {
        ctx.beginPath();
        ctx.moveTo(-lead, py);
        ctx.lineTo(0, py);
        ctx.stroke();
    }
    drawClockInputTriangle(ctx, clkY);
    for (const py of outputYs) {
        ctx.beginPath();
        ctx.moveTo(bw, py);
        ctx.lineTo(bw + lead, py);
        ctx.stroke();
    }
}

function drawLogicFlipFlopPinLabelsUpright(ctx, c) {
    const g = GRID_SIZE;
    const fs = componentPinLabelFontSize();
    const labels =
        c.type === "logic_dff"
            ? [
                  [0, "D"],
                  [1, "Clk"],
                  [2, "Q"],
                  [3, "/Q"],
              ]
            : [
                  [0, "J"],
                  [1, "Clk"],
                  [2, "K"],
                  [3, "Q"],
                  [4, "/Q"],
              ];
    const outPins = logicFlipFlopOutputPinIndices(c.type);
    ctx.save();
    ctx.font = `600 ${fs}px Segoe UI`;
    ctx.fillStyle = ctx.strokeStyle;
    for (const [idx, lbl] of labels) {
        const py = logicFlipFlopPinLocalY(c.type, idx);
        const isOut = outPins.includes(idx);
        const lx = isOut ? LOGIC_FF_W + LOGIC_FF_LEAD * 0.5 : -LOGIC_FF_LEAD * 0.5;
        const pt = localBaseToWorld(c, lx, py - g * 0.38, LOGIC_FF_W, LOGIC_FF_H);
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(lbl, pt.x - c.x, pt.y - c.y);
    }
    ctx.restore();
}

function drawLogicFlipFlopSymbolOriented(ctx, c) {
    const o = getCompOrient(c);
    const bh = LOGIC_FF_H;
    const { w, h } = logicFlipFlopDimsFromOrient(o, c.type);
    const sx = c.mirrorX ? -1 : 1;
    const sy = c.mirrorY ? -1 : 1;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((-o * Math.PI) / 2);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    ctx.translate(-LOGIC_FF_W / 2, -bh / 2);
    drawLogicFlipFlopSymbolLR(ctx, LOGIC_FF_W, bh, c.type);
    ctx.restore();
}

const IC74LS00_PIN_LABELS = ["1A", "1B", "1Y", "2A", "2B", "2Y", "GND", "3Y", "3A", "3B", "4Y", "4A", "4B", "VCC"];
const IC74LS74_PIN_LABELS = [
    "1CLR",
    "1D",
    "1CLK",
    "1PRE",
    "1Q",
    "1QB",
    "GND",
    "2Q",
    "2QB",
    "2PRE",
    "2CLK",
    "2D",
    "2CLR",
    "VCC",
];

function icLogicDipCenterLabel(type) {
    if (isIc74ls74Type(type)) return "74LS74";
    return "74HC00";
}

function icLogicDipPinLabels(type) {
    return isIc74ls74Type(type) ? IC74LS74_PIN_LABELS : IC74LS00_PIN_LABELS;
}

function drawIcLogicDipSymbolLR(ctx, bw, bh, centerLabel) {
    const lead = IC74LS00_LEAD;
    ctx.beginPath();
    ctx.rect(0, 0, bw, bh);
    ctx.stroke();
    for (let i = 0; i < 14; i++) {
        const px = ic74ls00PinX(i);
        const py = ic74ls00PinY(i);
        const out = px <= 0;
        ctx.beginPath();
        if (out) {
            ctx.moveTo(-lead, py);
            ctx.lineTo(0, py);
        } else {
            ctx.moveTo(bw, py);
            ctx.lineTo(bw + lead, py);
        }
        ctx.stroke();
    }
    const fs = Math.max(10, GRID_SIZE * 0.32);
    ctx.save();
    ctx.font = `700 ${fs}px Segoe UI`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillText(centerLabel, bw / 2, bh / 2);
    ctx.restore();
}

function drawIc74ls00SymbolLR(ctx, bw, bh) {
    drawIcLogicDipSymbolLR(ctx, bw, bh, "74HC00");
}

function drawIc74PinLabelsUpright(ctx, c) {
    const g = GRID_SIZE;
    const lead = IC74LS00_LEAD;
    const fs = componentPinLabelFontSize();
    const pinLabels = icLogicDipPinLabels(c.type);
    ctx.save();
    ctx.font = `600 ${fs}px Segoe UI`;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    for (let i = 0; i < 14; i++) {
        const py = ic74ls00PinY(i);
        const left = ic74ls00PinX(i) <= 0;
        const lx = left ? -lead * 0.5 : IC74LS00_W + lead * 0.5;
        const pt = localBaseToWorld(c, lx, py - g * 0.32, IC74LS00_W, IC74LS00_H);
        ctx.fillText(pinLabels[i], pt.x - c.x, pt.y - c.y);
    }
    ctx.restore();
}

function drawIc74ls00SymbolOriented(ctx, c) {
    const o = getCompOrient(c);
    const { w, h } = ic74ls00DimsFromOrient(o);
    const sx = c.mirrorX ? -1 : 1;
    const sy = c.mirrorY ? -1 : 1;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((-o * Math.PI) / 2);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    ctx.translate(-IC74LS00_W / 2, -IC74LS00_H / 2);
    drawIcLogicDipSymbolLR(ctx, IC74LS00_W, IC74LS00_H, icLogicDipCenterLabel(c.type));
    ctx.restore();
}

/** LED : symbole miroir de la diode (dessin seul ; #0 gauche, #1 droite inchangés). */
function drawLedSymbol(ctx, w, h, orient, comp, ghost) {
    const o = ((orient % 4) + 4) % 4;
    const color = getLedColor(comp);
    const rgb = hexToRgb(color);
    const vs = ghost ? { intensity: 0, on: false, smoke: false, i: 0 } : getLedVisualState(comp);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((-o * Math.PI) / 2);
    ctx.translate(-DIODE_BASE_W / 2, -DIODE_BASE_H / 2);
    const bw = DIODE_BASE_W;
    const bh = DIODE_BASE_H;
    ctx.translate(bw, 0);
    ctx.scale(-1, 1);
    const outline = ghost ? ctx.strokeStyle : vs.on ? color : "#78909c";
    ctx.strokeStyle = outline;
    drawDiodeSymbolLR(ctx, bw, bh);
    const midY = bh / 2;
    const halfCross = bh * 0.46;
    const cx = bw / 2;
    const xTriBase = cx - bw * 0.18;
    const fillAlpha = 0.22 + 0.78 * vs.intensity;
    ctx.beginPath();
    ctx.moveTo(xTriBase, midY - halfCross);
    ctx.lineTo(cx + bw * 0.18, midY);
    ctx.lineTo(xTriBase, midY + halfCross);
    ctx.closePath();
    ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${fillAlpha})`;
    ctx.fill();
    if (vs.on) {
        ctx.strokeStyle = color;
        ctx.lineWidth = (1.5 + vs.intensity) / scale;
        ctx.stroke();
    }
    if (vs.on && vs.intensity > 0.12) {
        ctx.beginPath();
        ctx.arc(xTriBase + bw * 0.12, midY - halfCross * 0.35, bw * 0.05, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.25 + 0.55 * vs.intensity})`;
        ctx.fill();
    }
    if (vs.on && vs.intensity > 0.04) drawLedArrows(ctx, cx + bw * 0.1, midY, bw, vs.intensity);
    ctx.restore();
}

function drawOptoPlaceholderSymbol(ctx, w, h, orient, label) {
    const o = ((orient % 4) + 4) % 4;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((-o * Math.PI) / 2);
    ctx.translate(-DIODE_BASE_W / 2, -DIODE_BASE_H / 2);
    const bw = DIODE_BASE_W;
    const bh = DIODE_BASE_H;
    const midY = bh / 2;
    ctx.setLineDash([5 / scale, 4 / scale]);
    ctx.strokeRect(bw * 0.2, bh * 0.2, bw * 0.6, bh * 0.6);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(bw * 0.2, midY);
    ctx.moveTo(bw * 0.8, midY);
    ctx.lineTo(bw, midY);
    ctx.stroke();
    const fs = Math.max(9, 11 / Math.max(scale, 0.2));
    ctx.font = `600 ${fs}px Segoe UI`;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, bw / 2, bh / 2);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
    ctx.restore();
}

function drawSeg7Bar(ctx, x1, y1, x2, y2, lit) {
    ctx.save();
    ctx.strokeStyle = lit ? SEG7_ON_COLOR : SEG7_OFF_COLOR;
    ctx.lineWidth = Math.max(3.5, GRID_SIZE * 0.18) / scale;
    ctx.lineCap = "round";
    if (lit) {
        ctx.shadowColor = SEG7_ON_COLOR;
        ctx.shadowBlur = 10 / Math.max(scale, 0.2);
    }
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
}

function drawSeg7SegmentsInner(ctx, box, segOn) {
    const mx = box.x + box.w / 2;
    const my = box.y + box.h / 2;
    ctx.save();
    ctx.translate(mx, my);
    ctx.transform(1, 0, SEG7_ITALIC_SKEW, 1, 0, 0);
    ctx.translate(-mx, -my);

    const { x, y, w, h } = box;
    const t = GRID_SIZE * 0.12;
    const mx2 = x + w / 2;
    const my2 = y + h / 2;
    const hw = w * 0.42;
    const gap = GRID_SIZE * 0.14;
    drawSeg7Bar(ctx, mx2 - hw, y + t, mx2 + hw, y + t, segOn[0]);
    drawSeg7Bar(ctx, x + w - t, y + t + gap, x + w - t, my2 - gap, segOn[1]);
    drawSeg7Bar(ctx, x + w - t, my2 + gap, x + w - t, y + h - t - gap, segOn[2]);
    drawSeg7Bar(ctx, mx2 - hw, y + h - t, mx2 + hw, y + h - t, segOn[3]);
    drawSeg7Bar(ctx, x + t, my2 + gap, x + t, y + h - t - gap, segOn[4]);
    drawSeg7Bar(ctx, x + t, y + t + gap, x + t, my2 - gap, segOn[5]);
    drawSeg7Bar(ctx, mx2 - hw, my2, mx2 + hw, my2, segOn[6]);
    ctx.restore();
}

function getSeg7SegmentStates(c) {
    if (!c || !isSeg7Type(c.type)) return Array(7).fill(false);
    if (Array.isArray(c.seg7On) && c.seg7On.length === 7) return c.seg7On;
    return Array(7).fill(false);
}

function ensureSeg7Fields(c) {
    if (!c || !isSeg7Type(c.type)) return;
    if (!Array.isArray(c.seg7On) || c.seg7On.length !== 7) c.seg7On = Array(7).fill(false);
}

function seg7ThresholdFromDelta(maxDelta) {
    if (!Number.isFinite(maxDelta) || maxDelta < 0.5) return 2.5;
    if (maxDelta > 4.2) return 2.5;
    if (maxDelta > 2.8) return 1.65;
    return maxDelta * 0.45;
}

function buildSeg7StateFromSimData(data) {
    const vmap = collectNodeVoltagesFromLogClient(data?.log || "");
    const metaList = Array.isArray(data?.seg7Displays) ? data.seg7Displays : [];
    const out = Object.create(null);
    for (const meta of metaList) {
        if (!meta || !meta.id) continue;
        const vCom = nodeVFromLogMap(meta.commonNode, vmap);
        const vComN = vCom != null && Number.isFinite(vCom) ? vCom : 0;
        let maxDelta = 0;
        const deltas = (meta.segmentNodes || []).map(n => {
            const v = nodeVFromLogMap(n, vmap);
            const d = v != null && Number.isFinite(v) ? v - vComN : 0;
            if (d > maxDelta) maxDelta = d;
            return d;
        });
        const vth = seg7ThresholdFromDelta(maxDelta);
        out[meta.id] = deltas.map(d => d >= vth - 0.08);
    }
    return out;
}

function applySeg7SimulationState(seg7States) {
    for (const c of components) {
        if (!isSeg7Type(c.type)) continue;
        ensureSeg7Fields(c);
        const row = seg7States && seg7States[c.id];
        c.seg7On = row && row.length === 7 ? row.slice() : Array(7).fill(false);
    }
    updateSeg7AnimationLoop();
}

function seg7NeedsAnimation() {
    return liveSimActive && components.some(c => isSeg7Type(c.type) && getSeg7SegmentStates(c).some(Boolean));
}

function updateSeg7AnimationLoop() {
    if (seg7NeedsAnimation()) {
        if (seg7AnimRaf == null) startSeg7AnimationLoop();
    } else if (seg7AnimRaf != null) {
        cancelAnimationFrame(seg7AnimRaf);
        seg7AnimRaf = null;
    }
}

let seg7AnimRaf = null;

function startSeg7AnimationLoop() {
    const step = () => {
        seg7AnimRaf = null;
        if (!seg7NeedsAnimation()) return;
        draw();
        seg7AnimRaf = requestAnimationFrame(step);
    };
    seg7AnimRaf = requestAnimationFrame(step);
}

function drawSeg7PinLabelsUpright(ctx, c) {
    const g = GRID_SIZE;
    const fs = componentPinLabelFontSize();
    ctx.save();
    ctx.font = `600 ${fs}px Segoe UI`;
    ctx.fillStyle = ctx.strokeStyle;
    for (let i = 0; i < 7; i++) {
        const pt = localBaseToWorld(c, 0, seg7PinY(i) - g * 0.42, SEG7_BASE_W, SEG7_BASE_H);
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(SEG7_SEGMENT_NAMES[i], pt.x - c.x, pt.y - c.y);
    }
    const comPt = localBaseToWorld(
        c,
        seg7CommonXLocal() + g * 0.62,
        seg7CommonYLocal() + g * 0.06,
        SEG7_BASE_W,
        SEG7_BASE_H
    );
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("C", comPt.x - c.x, comPt.y - c.y);
    ctx.restore();
}

/** Afficheur 7 segments cathode commune (orientation 0 : broches a–g à gauche, C en bas). */
function drawSeg7Symbol(ctx, w, h, orient, comp, ghost) {
    const o = ((orient % 4) + 4) % 4;
    const segOn = ghost ? Array(7).fill(false) : getSeg7SegmentStates(comp);
    const frame = seg7FrameBoxLocal();
    const inner = seg7InnerBoxLocal();
    const comX = seg7CommonXLocal();
    const comY = seg7CommonYLocal();

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((-o * Math.PI) / 2);
    ctx.translate(-SEG7_BASE_W / 2, -SEG7_BASE_H / 2);

    ctx.strokeRect(frame.x, frame.y, frame.w, frame.h);

    for (let i = 0; i < 7; i++) {
        const py = seg7PinY(i);
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(frame.x, py);
        ctx.stroke();
    }

    const cathodeAttachX = comX;
    ctx.beginPath();
    ctx.moveTo(cathodeAttachX, frame.y + frame.h);
    ctx.lineTo(comX, comY);
    ctx.stroke();

    drawSeg7SegmentsInner(ctx, inner, segOn);
    ctx.restore();
}

function closeLedColorEditor() {
    const editor = document.getElementById("led-color-editor");
    const input = document.getElementById("led-color-input");
    ledColorEditorCompId = null;
    if (editor) editor.hidden = true;
    if (input) {
        input.oninput = null;
        input.onchange = null;
    }
}

function positionLedColorEditorForComponent(comp) {
    const editor = document.getElementById("led-color-editor");
    if (!editor || !comp) return;
    const { w, h } = componentDims(comp);
    const wx = comp.x + w / 2;
    const wy = comp.y + h + 24;
    const pt = worldToScreen(wx, wy);
    editor.style.left = `${pt.x}px`;
    editor.style.top = `${pt.y}px`;
}

/** Panneau couleur sous la LED (reste ouvert jusqu’à clic ailleurs ou Échap). */
function openLedColorEditor(comp) {
    if (!comp || !isLedType(comp.type)) return;
    const editor = document.getElementById("led-color-editor");
    const input = document.getElementById("led-color-input");
    if (!editor || !input) return;
    closeValueEditor();
    closeLedColorEditor();
    isMovingComponent = false;
    dragStartClient = null;
    ensureLedFields(comp);
    selectedId = comp.id;
    ledColorEditorCompId = comp.id;
    input.value = getLedColor(comp);
    positionLedColorEditorForComponent(comp);
    editor.hidden = false;
    input.oninput = () => {
        comp.ledColor = normalizeLedColor(input.value);
        draw();
    };
    input.onchange = () => {
        comp.ledColor = normalizeLedColor(input.value);
        saveState();
    };
    window.requestAnimationFrame(() => {
        if (ledColorEditorCompId !== comp.id) return;
        input.focus({ preventScroll: true });
    });
}

/** AOP 4×2 carreaux : triangle 3 carr. de haut (+/− à l'intérieur). */
function drawOpAmpSymbol(ctx, bw, bh) {
    const g = GRID_SIZE;
    const yPlus = 0;
    const yMinus = 2 * g;
    const xBase = g;
    const xTip = 3 * g;
    const midY = g;
    const triTop = -g / 2;
    const triBot = 2.5 * g;
    ctx.beginPath();
    ctx.moveTo(0, yPlus);
    ctx.lineTo(xBase, yPlus);
    ctx.moveTo(0, yMinus);
    ctx.lineTo(xBase, yMinus);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(xBase, triTop);
    ctx.lineTo(xTip, midY);
    ctx.lineTo(xBase, triBot);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(xTip, midY);
    ctx.lineTo(bw, midY);
    ctx.stroke();
    const fs = Math.max(12, 17 / Math.max(scale, 0.2));
    ctx.font = `600 ${fs}px Segoe UI`;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const labelX = xBase + g * 0.32;
    ctx.fillText("+", labelX, yPlus + g * 0.22);
    ctx.fillText("−", labelX, yMinus - g * 0.22);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
}

function drawOpAmpSymbolOriented(ctx, c) {
    const o = getCompOrient(c);
    const { w, h } = opampDimsFromOrient(o);
    const sx = c.mirrorX ? -1 : 1;
    const sy = c.mirrorY ? -1 : 1;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((-o * Math.PI) / 2);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    ctx.translate(-OPAMP_BASE_W / 2, -OPAMP_BASE_H / 2);
    drawOpAmpSymbol(ctx, OPAMP_BASE_W, OPAMP_BASE_H);
    ctx.restore();
}

function drawNpnEmitterArrow(ctx, x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const px = -uy;
    const py = ux;
    const tipX = x0 + dx * 0.55;
    const tipY = y0 + dy * 0.55;
    const as = Math.max(5, len * 0.14);
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - ux * as + px * as * 0.55, tipY - uy * as + py * as * 0.55);
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - ux * as - px * as * 0.55, tipY - uy * as - py * as * 0.55);
    ctx.stroke();
}

/** NPN 2×4 : b (#0), c (#1), e (#2). */
function drawNpnSymbol(ctx, w, h) {
    const g = GRID_SIZE;
    const barX = g;
    const midY = h / 2;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(barX, midY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(barX, g);
    ctx.lineTo(barX, 3 * g);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(barX, midY);
    ctx.lineTo(w, g);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(barX, midY);
    ctx.lineTo(w, 3 * g);
    ctx.stroke();
    drawNpnEmitterArrow(ctx, barX, midY, w, 3 * g);
}

function drawNpnSymbolOriented(ctx, c) {
    const o = getCompOrient(c);
    const { w, h } = npnDimsFromOrient(o);
    const sx = c.mirrorX ? -1 : 1;
    const sy = c.mirrorY ? -1 : 1;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((-o * Math.PI) / 2);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    ctx.translate(-NPN_BASE_W / 2, -NPN_BASE_H / 2);
    drawNpnSymbol(ctx, NPN_BASE_W, NPN_BASE_H);
    ctx.restore();
}

/** Condensateur : barres perpendiculaires aux fils, rapprochées et hautes (3 carreaux). */
function drawCapacitorSymbol(ctx, w, h, vertical) {
    const plateLen = (vertical ? w : h) * 0.9;
    const plateSep = (vertical ? h : w) * 0.1;
    const halfPlate = plateLen / 2;

    if (vertical) {
        const midX = w / 2;
        const y1 = h / 2 - plateSep / 2;
        const y2 = h / 2 + plateSep / 2;
        ctx.beginPath();
        ctx.moveTo(midX, 0);
        ctx.lineTo(midX, y1);
        ctx.moveTo(midX, y2);
        ctx.lineTo(midX, h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(midX - halfPlate, y1);
        ctx.lineTo(midX + halfPlate, y1);
        ctx.moveTo(midX - halfPlate, y2);
        ctx.lineTo(midX + halfPlate, y2);
        ctx.stroke();
    } else {
        const midY = h / 2;
        const x1 = w / 2 - plateSep / 2;
        const x2 = w / 2 + plateSep / 2;
        ctx.beginPath();
        ctx.moveTo(0, midY);
        ctx.lineTo(x1, midY);
        ctx.moveTo(x2, midY);
        ctx.lineTo(w, midY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x1, midY - halfPlate);
        ctx.lineTo(x1, midY + halfPlate);
        ctx.moveTo(x2, midY - halfPlate);
        ctx.lineTo(x2, midY + halfPlate);
        ctx.stroke();
    }
}

function drawInductorSymbol(ctx, w, h, vertical) {
    const loops = 4;
    if (vertical) {
        const midX = w / 2;
        const y0 = h * 0.22;
        const y1 = h * 0.78;
        const seg = (y1 - y0) / loops;
        const rad = seg / 2;
        ctx.beginPath();
        ctx.moveTo(midX, 0);
        ctx.lineTo(midX, y0);
        ctx.moveTo(midX, y1);
        ctx.lineTo(midX, h);
        ctx.stroke();
        for (let i = 0; i < loops; i++) {
            const cy = y0 + seg * i + rad;
            ctx.beginPath();
            ctx.arc(midX, cy, rad, Math.PI / 2, -Math.PI / 2);
            ctx.stroke();
        }
    } else {
        const midY = h / 2;
        const x0 = w * 0.22;
        const x1 = w * 0.78;
        const seg = (x1 - x0) / loops;
        const rad = seg / 2;
        ctx.beginPath();
        ctx.moveTo(0, midY);
        ctx.lineTo(x0, midY);
        ctx.moveTo(x1, midY);
        ctx.lineTo(w, midY);
        ctx.stroke();
        for (let i = 0; i < loops; i++) {
            const cx = x0 + seg * i + rad;
            ctx.beginPath();
            ctx.arc(cx, midY, rad, Math.PI, 0);
            ctx.stroke();
        }
    }
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
    const { w, h } = componentDims(c);
    const vertLayout = isNpnType(c.type) ? false : getCompOrient(c) === 1 || getCompOrient(c) === 3;
    const tw = 80;
    const th = 26;
    if (vertLayout) {
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

function parseCapacitorValueInput(raw) {
    let t = String(raw || "")
        .trim()
        .toLowerCase()
        .replace(/\s/g, "")
        .replace(",", ".")
        .replace("µ", "u");
    if (!t) return { ok: false };
    let mult = 1;
    let suffix = "";
    if (t.endsWith("uf")) {
        mult = 1e-6;
        suffix = "uF";
        t = t.slice(0, -2);
    } else if (t.endsWith("nf")) {
        mult = 1e-9;
        suffix = "nF";
        t = t.slice(0, -2);
    } else if (t.endsWith("pf")) {
        mult = 1e-12;
        suffix = "pF";
        t = t.slice(0, -2);
    } else if (t.endsWith("mf")) {
        mult = 1e-3;
        suffix = "mF";
        t = t.slice(0, -2);
    } else if (t.endsWith("f")) {
        mult = 1;
        suffix = "F";
        t = t.slice(0, -1);
    }
    const n = parseFloat(t);
    if (!Number.isFinite(n) || n <= 0) return { ok: false };
    const display = suffix ? `${n}${suffix}` : `${n}F`;
    return { ok: true, display };
}

function parseInductorValueInput(raw) {
    let t = String(raw || "")
        .trim()
        .toLowerCase()
        .replace(/\s/g, "")
        .replace(",", ".")
        .replace("µ", "u");
    if (!t) return { ok: false };
    let mult = 1;
    let suffix = "H";
    if (t.endsWith("mh")) {
        mult = 1e-3;
        suffix = "mH";
        t = t.slice(0, -2);
    } else if (t.endsWith("uh")) {
        mult = 1e-6;
        suffix = "uH";
        t = t.slice(0, -2);
    } else if (t.endsWith("kh")) {
        mult = 1e3;
        suffix = "kH";
        t = t.slice(0, -2);
    } else if (t.endsWith("h")) {
        mult = 1;
        suffix = "H";
        t = t.slice(0, -1);
    }
    const n = parseFloat(t);
    if (!Number.isFinite(n) || n <= 0) return { ok: false };
    const display = `${n}${suffix}`;
    return { ok: true, display };
}

function parseNpnValueInput(raw) {
    return parseDiodeValueInput(raw);
}

function parseOpampValueInput(raw) {
    return parseDiodeValueInput(raw);
}

function droppedComponentValue(type, model) {
    if (model) return model;
    if (type === "npn") return "2N2222";
    if (type === "opamp") return "LM741";
    if (type === "diode") return "1N4148";
    return defaultValueForComponentType(type);
}

function parseDiodeValueInput(raw) {
    const t = String(raw || "")
        .trim()
        .replace(/\s+/g, "");
    if (!t || !/^[a-z0-9._-]+$/i.test(t)) return { ok: false };
    return { ok: true, display: t };
}

function parseComponentValueInput(comp, raw) {
    if (comp.type === "resistor") return parseResistorValueInput(raw);
    if (comp.type === "capacitor") return parseCapacitorValueInput(raw);
    if (comp.type === "inductor") return parseInductorValueInput(raw);
    if (comp.type === "diode") return parseDiodeValueInput(raw);
    if (comp.type === "npn") return parseNpnValueInput(raw);
    if (comp.type === "vsource" || comp.type === "vterm") return parseVsourceValueInput(raw);
    return { ok: false };
}

function defaultValueForComponentType(type) {
    if (type === "resistor") return "1k";
    if (type === "capacitor") return "1uF";
    if (type === "inductor") return "1mH";
    if (type === "diode") return "1N4148";
    if (type === "npn") return "2N2222";
    if (type === "opamp") return "LM741";
    if (type === "logic_state") return "1";
    return "5V";
}

function valuePlaceholderForComponentType(type) {
    if (type === "resistor") return "ex: 1k, 470, 2.2meg";
    if (type === "capacitor") return "ex: 1uF, 100nF, 10pF";
    if (type === "inductor") return "ex: 1mH, 47uH, 2.2H";
    if (type === "diode") return "ex: 1N4148, 1N4007";
    if (type === "npn") return "ex: 2N2222, BC547";
    if (type === "opamp") return "ex: LM741, TL072";
    return "ex: 5V, 12";
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
    const { w, h } = componentDims(comp);
    const vertLayout =
        !isNpnType(comp.type) && (getCompOrient(comp) === 1 || getCompOrient(comp) === 3);
    let wx;
    let wy;
    if (vertLayout) {
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
    input.value = comp.value != null ? String(comp.value) : defaultValueForComponentType(comp.type);
    input.placeholder = valuePlaceholderForComponentType(comp.type);
    input.classList.remove("invalid");
    positionValueEditorForComponent(comp);
    editor.hidden = false;
    input.onkeydown = e => {
        if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            commitValueEditor();
        } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            closeValueEditor();
            draw();
        }
    };
    input.onblur = null;
    window.requestAnimationFrame(() => {
        if (valueEditorCompId !== comp.id) return;
        input.focus({ preventScroll: true });
        input.select();
    });
}

function commitValueEditor() {
    if (!valueEditorCompId) return;
    const comp = components.find(c => c.id === valueEditorCompId);
    const input = document.getElementById("comp-value-input");
    if (!comp || !input) {
        closeValueEditor();
        return;
    }
    const parsed = parseComponentValueInput(comp, input.value);
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

function initLedColorEditor() {
    const editor = document.getElementById("led-color-editor");
    const input = document.getElementById("led-color-input");
    if (!editor || !input) return;
    editor.addEventListener("mousedown", e => e.stopPropagation());
    input.addEventListener("mousedown", e => e.stopPropagation());
}

/** Cale un générateur pour que les jonctions (#0 latérale, #1 bas) tombent sur la grille. */
function snapSignalGeneratorDropWorld(wx, wy, mirrorX) {
    const jx = Math.round(wx / GRID_SIZE) * GRID_SIZE;
    const jy = Math.round(wy / GRID_SIZE) * GRID_SIZE;
    if (!mirrorX) {
        return { x: jx + GRID_SIZE, y: jy - GRID_SIZE, mirrorX: false };
    }
    return { x: jx - 3 * GRID_SIZE, y: jy - GRID_SIZE, mirrorX: true };
}

function snapSignalGeneratorComponent(comp) {
    const mirrorX = !!comp.mirrorX;
    let jx;
    let jy;
    if (!mirrorX) {
        jx = comp.x - GRID_SIZE;
        jy = comp.y + GRID_SIZE;
    } else {
        jx = comp.x + 3 * GRID_SIZE;
        jy = comp.y + GRID_SIZE;
    }
    const sjx = Math.round(jx / GRID_SIZE) * GRID_SIZE;
    const sjy = Math.round(jy / GRID_SIZE) * GRID_SIZE;
    const p = snapSignalGeneratorDropWorld(sjx, sjy, mirrorX);
    comp.x = p.x;
    comp.y = p.y;
    comp.mirrorX = p.mirrorX;
}

function snapOscilloscopeDropWorld(wx, wy, mirrorX) {
    const jx = Math.round(wx / GRID_SIZE) * GRID_SIZE;
    const jy = Math.round(wy / GRID_SIZE) * GRID_SIZE;
    if (!mirrorX) {
        return { x: jx + GRID_SIZE, y: jy - GRID_SIZE, mirrorX: false };
    }
    return { x: jx - 3 * GRID_SIZE, y: jy - GRID_SIZE, mirrorX: true };
}

function snapOscilloscopeComponent(comp) {
    const mirrorX = !!comp.mirrorX;
    const ends = oscilloscopeJunctionsWorld(comp);
    const sjx = Math.round(ends[0].x / GRID_SIZE) * GRID_SIZE;
    const sjy = Math.round(ends[0].y / GRID_SIZE) * GRID_SIZE;
    const p = snapOscilloscopeDropWorld(sjx, sjy, mirrorX);
    comp.x = p.x;
    comp.y = p.y;
    comp.mirrorX = p.mirrorX;
}

function drawOscilloscopeSymbol(ctx, c, w, h) {
    const mirrorX = !!c.mirrorX;
    const ends = oscilloscopeJunctionsWorld(c);
    const localEnds = ends.map(j => ({ x: j.x - c.x, y: j.y - c.y, key: j.key }));

    ctx.strokeRect(0, 0, w, h);

    const screenH = h * 0.66;
    const pad = w * 0.12;
    ctx.strokeRect(pad, pad, w - 2 * pad, screenH - 2 * pad);
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad, pad, w - 2 * pad, screenH - 2 * pad);
    ctx.clip();
    const gx0 = pad + 6;
    const gx1 = w - pad - 6;
    const gy0 = pad + 6;
    const gy1 = screenH - pad - 6;
    const gStepX = (gx1 - gx0) / 4;
    const gStepY = (gy1 - gy0) / 3;
    ctx.lineWidth = 0.8 / scale;
    for (let i = 0; i <= 4; i++) {
        const x = gx0 + i * gStepX;
        ctx.beginPath();
        ctx.moveTo(x, gy0);
        ctx.lineTo(x, gy1);
        ctx.stroke();
    }
    for (let j = 0; j <= 3; j++) {
        const y = gy0 + j * gStepY;
        ctx.beginPath();
        ctx.moveTo(gx0, y);
        ctx.lineTo(gx1, y);
        ctx.stroke();
    }
    ctx.restore();
    ctx.lineWidth = 2 / scale;

    const knobY = screenH + (h - screenH) * 0.55;
    const knobR = w * 0.1;
    ctx.beginPath();
    ctx.arc(w * 0.35, knobY, knobR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w * 0.65, knobY, knobR, 0, Math.PI * 2);
    ctx.stroke();

    const edgeCh1 = mirrorX ? { x: w, y: GRID_SIZE } : { x: 0, y: GRID_SIZE };
    const edgeCh2 = mirrorX ? { x: w, y: 2 * GRID_SIZE } : { x: 0, y: 2 * GRID_SIZE };
    const edgeGnd = { x: w / 2, y: h };

    ctx.beginPath();
    ctx.moveTo(edgeCh1.x, edgeCh1.y);
    ctx.lineTo(localEnds[0].x, localEnds[0].y);
    ctx.moveTo(edgeCh2.x, edgeCh2.y);
    ctx.lineTo(localEnds[1].x, localEnds[1].y);
    ctx.moveTo(edgeGnd.x, edgeGnd.y);
    ctx.lineTo(localEnds[2].x, localEnds[2].y);
    ctx.stroke();

    const fs = Math.max(10, 11 / scale);
    ctx.font = `${fs}px Segoe UI`;
    ctx.fillStyle = getEditorColors().compLabel;
    const labelUp = 14 / scale;

    function drawChannelLabel(text, edge, end) {
        const mx = (edge.x + end.x) / 2;
        const my = (edge.y + end.y) / 2 - labelUp;
        ctx.textBaseline = "bottom";
        if (mirrorX) {
            ctx.textAlign = "left";
            ctx.fillText(text, mx + 4, my);
        } else {
            ctx.textAlign = "right";
            ctx.fillText(text, mx - 4, my);
        }
    }

    drawChannelLabel("CH1", edgeCh1, localEnds[0]);
    drawChannelLabel("CH2", edgeCh2, localEnds[1]);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
}

function drawWaveformInBox(ctx, type, w, h) {
    const pad = w * 0.18;
    const left = pad;
    const right = w - pad;
    const midY = h / 2;
    const amp = h * 0.32;
    ctx.beginPath();
    if (type === "vsquare") {
        const yHi = midY - amp;
        const yLo = midY + amp;
        const xQ = (left + right) / 2;
        ctx.moveTo(left, yHi);
        ctx.lineTo(xQ, yHi);
        ctx.lineTo(xQ, yLo);
        ctx.lineTo(right, yLo);
        ctx.lineTo(right, yHi);
    } else {
        const steps = 24;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = left + t * (right - left);
            const y = midY - amp * Math.sin(t * Math.PI * 2);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
    }
    ctx.stroke();
}

function drawSignalGeneratorSymbol(ctx, c, w, h) {
    const mirrorX = !!c.mirrorX;
    const juncts = junctionEndpointsForComponent(c);
    const boxJ0 = { x: mirrorX ? w : 0, y: h / 2 };
    const boxJ1 = { x: w / 2, y: h };
    ctx.strokeRect(0, 0, w, h);
    drawWaveformInBox(ctx, c.type, w, h);
    ctx.beginPath();
    ctx.moveTo(boxJ0.x, boxJ0.y);
    ctx.lineTo(juncts[0].x - c.x, juncts[0].y - c.y);
    ctx.moveTo(boxJ1.x, boxJ1.y);
    ctx.lineTo(juncts[1].x - c.x, juncts[1].y - c.y);
    ctx.stroke();
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
    } else if (type === "capacitor") {
        g.strokeStyle = "#42A5F5";
        drawCapacitorSymbol(g, 126, 48, false);
    } else if (type === "inductor") {
        g.strokeStyle = "#FF7043";
        drawInductorSymbol(g, 126, 48, false);
    } else if (type === "diode") {
        g.strokeStyle = "#EC407A";
        drawDiodeSymbol(g, 126, 48, 0);
    } else if (type === "led") {
        drawLedSymbol(
            g,
            126,
            48,
            0,
            {
                type: "led",
                ledColor: LED_DEFAULT_COLOR,
                ledOn: true,
                ledSmoke: false,
                ledCurrent: LED_DEFAULT_IMAX_A * 0.8,
                iMax: LED_DEFAULT_IMAX_A,
            },
            false
        );
    } else if (type === "lamp") {
        g.strokeStyle = "#FFB74D";
        drawOptoPlaceholderSymbol(g, 126, 48, 0, "LAMPE");
    } else if (type === "seg7") {
        g.strokeStyle = "#4DD0E1";
        g.save();
        g.translate(8, 4);
        drawSeg7Symbol(g, SEG7_BASE_W, SEG7_BASE_H, 0, null, true);
        g.restore();
    } else if (type === "lcd") {
        g.strokeStyle = "#81C784";
        drawOptoPlaceholderSymbol(g, 126, 48, 0, "LCD");
    } else if (type === "npn") {
        g.strokeStyle = "#FFA726";
        g.save();
        g.translate(8, 4);
        drawNpnSymbol(g, NPN_BASE_W, NPN_BASE_H);
        g.restore();
    } else if (type === "opamp") {
        g.strokeStyle = "#AB47BC";
        g.save();
        g.translate(12, 10);
        drawOpAmpSymbol(g, OPAMP_BASE_W, OPAMP_BASE_H);
        g.restore();
    } else if (isLogicGateType(type)) {
        g.strokeStyle = "#7986CB";
        g.save();
        g.translate(8, isLogicNotType(type) ? 14 : 4);
        drawLogicGateSymbolLR(g, LOGIC_GATE_W, logicGateBaseH(type), type);
        g.restore();
    } else if (isLogicFlipFlopType(type)) {
        g.strokeStyle = "#7986CB";
        g.save();
        const sc = Math.min(108 / LOGIC_FF_W, 40 / LOGIC_FF_H);
        g.translate(12, 4);
        g.scale(sc, sc);
        drawLogicFlipFlopSymbolLR(g, LOGIC_FF_W, LOGIC_FF_H, type);
        g.restore();
    } else if (isLogicIcType(type)) {
        g.strokeStyle = "#7986CB";
        g.save();
        g.translate(6, 2);
        drawIcLogicDipSymbolLR(g, IC74LS00_W, IC74LS00_H, icLogicDipCenterLabel(type));
        g.restore();
    } else if (
        type === "voltmeter" ||
        type === "ammeter" ||
        type === "voltmeter_rms" ||
        type === "ammeter_rms" ||
        type === "ohmmeter"
    ) {
        g.strokeStyle =
            type === "voltmeter" || type === "voltmeter_rms"
                ? "#4DB6AC"
                : type === "ammeter" || type === "ammeter_rms"
                  ? "#CE93D8"
                  : "#FFB74D";
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
    } else if (type === "vsin" || type === "vsquare") {
        g.strokeStyle = type === "vsin" ? "#42A5F5" : "#7E57C2";
        const bx = 44;
        const by = 8;
        const bw = 44;
        const bh = 32;
        g.strokeRect(bx, by, bw, bh);
        g.save();
        g.translate(bx, by);
        drawWaveformInBox(g, type, bw, bh);
        g.restore();
        g.beginPath();
        g.moveTo(bx, by + bh / 2);
        g.lineTo(28, by + bh / 2);
        g.moveTo(bx + bw / 2, by + bh);
        g.lineTo(bx + bw / 2, 46);
        g.stroke();
    } else if (type === "oscilloscope") {
        g.strokeStyle = "#26A69A";
        const bx = 48;
        const by = 4;
        const bw = 36;
        const bh = 40;
        g.strokeRect(bx, by, bw, bh);
        g.strokeRect(bx + 4, by + 4, bw - 8, bh * 0.62);
        g.beginPath();
        g.arc(bx + 12, by + bh - 8, 4, 0, Math.PI * 2);
        g.arc(bx + 24, by + bh - 8, 4, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.moveTo(bx, by + bh / 3);
        g.lineTo(32, by + bh / 3);
        g.moveTo(bx, by + (2 * bh) / 3);
        g.lineTo(32, by + (2 * bh) / 3);
        g.moveTo(bx + bw / 2, by + bh);
        g.lineTo(bx + bw / 2, 46);
        g.stroke();
    } else if (type === "ground") {
        g.strokeStyle = "#78909C";
        g.save();
        g.translate(50, 6);
        drawGroundSymbol(g, GND_BASE_W, GND_BASE_H);
        g.restore();
    } else if (type === "vterm") {
        g.strokeStyle = "#FFA726";
        g.save();
        g.translate(50, 6);
        drawVtermSymbol(g, GND_BASE_W, GND_BASE_H, "5V");
        g.restore();
    } else if (type === "logic_state") {
        g.strokeStyle = "#5C6BC0";
        g.save();
        g.translate(50, 6);
        drawLogicStateSymbol(g, GND_BASE_W, GND_BASE_H, "1");
        g.restore();
    }
    document.body.appendChild(c);
    return { canvas: c, hx: 66, hy: 24 };
}

/** Clic sur « Portes ▸ », « Bascule ▸ », etc. : ouvre le sous-menu (menu Logique). */
function initLogicSubmenuClicks() {
    document.querySelectorAll(".menu-item-has-submenu > .submenu-label").forEach((label) => {
        label.addEventListener("click", (e) => {
            e.stopPropagation();
            const row = label.parentElement;
            if (!row) return;
            const open = row.classList.contains("submenu-open");
            document.querySelectorAll(".menu-item-has-submenu.submenu-open").forEach((el) => {
                el.classList.remove("submenu-open");
            });
            if (!open) row.classList.add("submenu-open");
        });
    });
}

// --- DRAG & DROP INITIAL ---
function handleDragStart(e, type, model) {
    e.stopPropagation();
    const fromEl = e.currentTarget instanceof Element ? e.currentTarget : e.target;
    const resolvedType = normalizePaletteCompType(
        type || paletteCompTypeFromElement(fromEl) || ""
    );
    if (!resolvedType) return;

    document.body.classList.add("palette-drag-active");
    const menuItem = e.target.closest(".menu-item");
    if (menuItem) menuItem.classList.add("dropdown-pinned");
    const subMenu = fromEl?.closest?.(".menu-item-has-submenu");
    if (subMenu) subMenu.classList.add("submenu-drag-open");

    const m = model || fromEl?.dataset?.compModel || fromEl?.getAttribute?.("data-comp-model") || "";
    paletteDragType = resolvedType;
    activeDragType = resolvedType;
    activeDragModel = m || null;
    e.dataTransfer.setData("compType", resolvedType);
    e.dataTransfer.setData("text/plain", resolvedType);
    if (m) e.dataTransfer.setData("compModel", m);
    e.dataTransfer.effectAllowed = "copy";

    const { canvas: dragImg, hx, hy } = createPaletteDragImage(resolvedType);
    e.dataTransfer.setDragImage(dragImg, hx, hy);
}
window.handleDragStart = handleDragStart;

function handleWindowDragEnd() {
    resetPaletteDragState();
    draw();
}

function handleCanvasDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    const worldPos = screenToWorld(e.clientX, e.clientY);
    if (!activeDragType && paletteDragType) activeDragType = paletteDragType;
    if (!activeDragType) return;
    if (isOscilloscopeType(activeDragType)) {
        const snapped = snapOscilloscopeDropWorld(worldPos.x, worldPos.y, false);
        dragPreview = {
            type: activeDragType,
            x: snapped.x,
            y: snapped.y,
            vertical: false,
            mirrorX: snapped.mirrorX,
        };
    } else if (isSignalGeneratorType(activeDragType)) {
        const snapped = snapSignalGeneratorDropWorld(worldPos.x, worldPos.y, false);
        dragPreview = {
            type: activeDragType,
            x: snapped.x,
            y: snapped.y,
            vertical: false,
            mirrorX: snapped.mirrorX,
        };
    } else if (isTwoTerminalType(activeDragType)) {
        const snapped = snapTwoTerminalDropWorld(worldPos.x, worldPos.y, false);
        dragPreview = {
            type: activeDragType,
            x: snapped.x,
            y: snapped.y,
            vertical: false,
        };
    } else if (isNpnType(activeDragType)) {
        const snapped = snapNpnDropWorld(worldPos.x, worldPos.y, 0);
        dragPreview = {
            type: activeDragType,
            x: snapped.x,
            y: snapped.y,
            value: droppedComponentValue(activeDragType, activeDragModel),
            orient: 0,
            vertical: false,
        };
    } else if (isOpampType(activeDragType)) {
        const snapped = snapOpampDropWorld(worldPos.x, worldPos.y, 0);
        dragPreview = {
            type: activeDragType,
            x: snapped.x,
            y: snapped.y,
            value: droppedComponentValue(activeDragType, activeDragModel),
            orient: 0,
            vertical: false,
        };
    } else if (isLogicFlipFlopType(activeDragType)) {
        const snapped = snapLogicFlipFlopDropWorld(worldPos.x, worldPos.y, activeDragType, 0);
        dragPreview = {
            type: activeDragType,
            x: snapped.x,
            y: snapped.y,
            orient: 0,
            vertical: false,
        };
    } else if (isLogicIcType(activeDragType)) {
        const snapped = snapIc74ls00DropWorld(worldPos.x, worldPos.y, 0);
        dragPreview = {
            type: activeDragType,
            x: snapped.x,
            y: snapped.y,
            orient: 0,
            vertical: false,
        };
    } else if (isLogicGateType(activeDragType)) {
        const snapped = snapLogicGateDropWorld(worldPos.x, worldPos.y, activeDragType, 0);
        dragPreview = {
            type: activeDragType,
            x: snapped.x,
            y: snapped.y,
            value: "",
            orient: 0,
            vertical: false,
        };
    } else if (isSeg7Type(activeDragType)) {
        const snapped = snapSeg7DropWorld(worldPos.x, worldPos.y, 0);
        dragPreview = {
            type: activeDragType,
            x: snapped.x,
            y: snapped.y,
            value: "",
            orient: 0,
            vertical: false,
        };
    } else if (isGroundType(activeDragType)) {
        const snapped = snapSingleTerminalDropWorld(worldPos.x, worldPos.y, "ground", 0);
        dragPreview = { type: "ground", x: snapped.x, y: snapped.y, orient: 0, vertical: false };
    } else if (isVtermType(activeDragType)) {
        const snapped = snapSingleTerminalDropWorld(worldPos.x, worldPos.y, "vterm", 0);
        dragPreview = {
            type: "vterm",
            x: snapped.x,
            y: snapped.y,
            value: "5V",
            orient: 0,
            vertical: false,
        };
    } else if (isLogicStateType(activeDragType)) {
        const snapped = snapSingleTerminalDropWorld(worldPos.x, worldPos.y, "logic_state", 0);
        dragPreview = {
            type: "logic_state",
            x: snapped.x,
            y: snapped.y,
            value: "1",
            logicRail: 5,
            orient: 0,
            vertical: false,
        };
    } else return;
    draw();
}

function handleCanvasDragLeave(e) {
    if (!e.relatedTarget || !canvas.contains(e.relatedTarget)) {
        dragPreview = null;
        draw();
    }
}

function snapTwoTerminalComponent(comp) {
    const o = getCompOrient(comp);
    const { dx, dy } = twoTerminalAnodeOffset(o);
    const p = snapTwoTerminalDropWorld(comp.x + dx, comp.y + dy, o);
    comp.x = p.x;
    comp.y = p.y;
}

function snapNpnComponent(comp) {
    const jb = localBaseToWorld(comp, 0, NPN_BASE_H / 2, NPN_BASE_W, NPN_BASE_H);
    const p = snapNpnDropWorld(jb.x, jb.y, getCompOrient(comp), !!comp.mirrorX, !!comp.mirrorY);
    comp.x = p.x;
    comp.y = p.y;
}

function handleDrop(e) {
    e.preventDefault();
    const type = normalizePaletteCompType(
        e.dataTransfer.getData("compType") ||
            e.dataTransfer.getData("text/plain") ||
            paletteDragType ||
            activeDragType ||
            ""
    );
    const worldPos = screenToWorld(e.clientX, e.clientY);
    if (!type) {
        resetPaletteDragState();
        draw();
        return;
    }
    dragPreview = null;
    activeDragType = null;
    activeDragModel = null;
    paletteDragType = null;

    if (type === "oscilloscope") {
        const snapped = snapOscilloscopeDropWorld(worldPos.x, worldPos.y, false);
        const comp = {
            id: `Osc${++oscilloscopeCount}`,
            type: "oscilloscope",
            x: snapped.x,
            y: snapped.y,
            value: "",
            vertical: false,
            mirrorX: snapped.mirrorX,
        };
        components.push(comp);
        selectPlacedComponent(comp);
        saveState();
        draw();
    } else if (type === "vsin" || type === "vsquare") {
        const snapped = snapSignalGeneratorDropWorld(worldPos.x, worldPos.y, false);
        const id = type === "vsin" ? `Sin${++vsinCount}` : `Carre${++vsquareCount}`;
        const genValue =
            type === "vsquare" ? "5V 5V 1kHz 0V" : "5V 1kHz 0V";
        const comp = {
            id,
            type,
            x: snapped.x,
            y: snapped.y,
            value: genValue,
            vertical: false,
            mirrorX: snapped.mirrorX,
        };
        components.push(comp);
        selectPlacedComponent(comp);
        saveState();
        draw();
    } else if (type === "ground") {
        const snapped = snapSingleTerminalDropWorld(worldPos.x, worldPos.y, "ground", 0);
        const comp = {
            id: `G${++groundCount}`,
            type: "ground",
            x: snapped.x,
            y: snapped.y,
            value: "",
            orient: 0,
            vertical: false,
        };
        components.push(comp);
        snapSingleTerminalComponent(comp);
        selectPlacedComponent(comp);
        saveState();
        draw();
    } else if (type === "logic_state") {
        const snapped = snapSingleTerminalDropWorld(worldPos.x, worldPos.y, "logic_state", 0);
        const comp = {
            id: `LS${++logicStateCount}`,
            type: "logic_state",
            x: snapped.x,
            y: snapped.y,
            value: "1",
            logicRail: 5,
            orient: 0,
            vertical: false,
        };
        components.push(comp);
        snapSingleTerminalComponent(comp);
        selectPlacedComponent(comp);
        saveState();
        draw();
    } else if (type === "vterm") {
        const snapped = snapSingleTerminalDropWorld(worldPos.x, worldPos.y, "vterm", 0);
        const comp = {
            id: `B${++vtermCount}`,
            type: "vterm",
            x: snapped.x,
            y: snapped.y,
            value: "5V",
            orient: 0,
            vertical: false,
        };
        components.push(comp);
        snapSingleTerminalComponent(comp);
        selectPlacedComponent(comp);
        saveState();
        draw();
    } else if (type === "npn") {
        const model = e.dataTransfer.getData("compModel") || activeDragModel || "";
        const snapped = snapNpnDropWorld(worldPos.x, worldPos.y, 0);
        const comp = {
            id: `Q${++npnCount}`,
            type: "npn",
            x: snapped.x,
            y: snapped.y,
            value: droppedComponentValue("npn", model),
            orient: 0,
            vertical: false,
        };
        components.push(comp);
        snapNpnComponent(comp);
        selectPlacedComponent(comp);
        saveState();
        draw();
    } else if (type === "opamp") {
        const model = e.dataTransfer.getData("compModel") || activeDragModel || "";
        const snapped = snapOpampDropWorld(worldPos.x, worldPos.y, 0);
        const comp = {
            id: `U${++opampCount}`,
            type: "opamp",
            x: snapped.x,
            y: snapped.y,
            value: droppedComponentValue("opamp", model),
            vp: OPAMP_DEFAULT_VP,
            vn: OPAMP_DEFAULT_VN,
            orient: 0,
            vertical: false,
        };
        ensureOpampFields(comp);
        components.push(comp);
        snapOpampComponent(comp);
        selectPlacedComponent(comp);
        saveState();
        draw();
    } else if (isLogicFlipFlopType(type)) {
        const snapped = snapLogicFlipFlopDropWorld(worldPos.x, worldPos.y, type, 0);
        const id = type === "logic_dff" ? `Dbas${++logicDbasCount}` : `JKff${++logicJkCount}`;
        const comp = {
            id,
            type,
            x: snapped.x,
            y: snapped.y,
            value: "",
            orient: 0,
            vertical: false,
        };
        components.push(comp);
        snapLogicFlipFlopComponent(comp);
        selectPlacedComponent(comp);
        saveState();
        draw();
    } else if (isLogicGateType(type)) {
        const snapped = snapLogicGateDropWorld(worldPos.x, worldPos.y, type, 0);
        let id;
        if (type === "logic_not") id = `NOT${++logicNotCount}`;
        else if (type === "logic_and") id = `AND${++logicAndCount}`;
        else if (type === "logic_or") id = `OR${++logicOrCount}`;
        else if (type === "logic_nand") id = `NAND${++logicNandCount}`;
        else if (type === "logic_nor") id = `NOR${++logicNorCount}`;
        else if (type === "logic_xor") id = `XOR${++logicXorCount}`;
        else id = `XNOR${++logicXnorCount}`;
        const comp = {
            id,
            type,
            x: snapped.x,
            y: snapped.y,
            value: "",
            orient: 0,
            vertical: false,
        };
        components.push(comp);
        snapLogicGateComponent(comp);
        selectPlacedComponent(comp);
        saveState();
        draw();
    } else if (isLogicIcType(type)) {
        const snapped = snapIc74ls00DropWorld(worldPos.x, worldPos.y, 0);
        let id;
        let value;
        if (isIc74ls74Type(type)) {
            id = `U7474${++ic74ls74Count}`;
            value = "74LS74";
        } else {
            id = `U74${++ic74ls00Count}`;
            value = "74HC00";
        }
        const comp = {
            id,
            type,
            x: snapped.x,
            y: snapped.y,
            value,
            orient: 0,
            vertical: false,
        };
        components.push(comp);
        snapIc74ls00Component(comp);
        selectPlacedComponent(comp);
        saveState();
        draw();
    } else if (type === "seg7") {
        const snapped = snapSeg7DropWorld(worldPos.x, worldPos.y, 0);
        const comp = {
            id: `S7${++seg7Count}`,
            type: "seg7",
            x: snapped.x,
            y: snapped.y,
            value: "",
            orient: 0,
            vertical: false,
            seg7On: Array(7).fill(false),
        };
        components.push(comp);
        snapSeg7Component(comp);
        selectPlacedComponent(comp);
        saveState();
        draw();
    } else if (
        type === "resistor" ||
        type === "capacitor" ||
        type === "inductor" ||
        type === "diode" ||
        type === "led" ||
        type === "lamp" ||
        type === "lcd" ||
        type === "vsource" ||
        type === "voltmeter" ||
        type === "ammeter" ||
        type === "voltmeter_rms" ||
        type === "ammeter_rms" ||
        type === "ohmmeter"
    ) {
        const snapped = snapTwoTerminalDropWorld(worldPos.x, worldPos.y, 0);
        let id;
        let value;
        if (type === "resistor") {
            id = `R${++resistorCount}`;
            value = "1k";
        } else if (type === "capacitor") {
            id = `C${++capacitorCount}`;
            value = "1uF";
        } else if (type === "inductor") {
            id = `L${++inductorCount}`;
            value = "1mH";
        } else if (type === "diode") {
            id = `D${++diodeCount}`;
            value = "1N4148";
        } else if (type === "led") {
            id = `LD${++ledCount}`;
            value = "";
        } else if (type === "lamp") {
            id = `LP${++lampCount}`;
            value = "";
        } else if (type === "lcd") {
            id = `LCD${++lcdCount}`;
            value = "";
        } else if (type === "vsource") {
            id = `E${++vsourceCount}`;
            value = "5V";
        } else if (type === "voltmeter") {
            id = `V${++voltmeterCount}`;
            value = "";
        } else if (type === "voltmeter_rms") {
            id = `Vm${++voltmeterRmsCount}`;
            value = "";
        } else if (type === "ammeter") {
            id = `A${++ammeterCount}`;
            value = "";
        } else if (type === "ammeter_rms") {
            id = `Am${++ammeterRmsCount}`;
            value = "";
        } else {
            id = `O${++ohmmeterCount}`;
            value = "";
        }

        const comp = {
            id,
            type,
            x: snapped.x,
            y: snapped.y,
            value,
            orient: 0,
            vertical: false,
        };
        if (isLedType(type)) {
            comp.ledColor = LED_DEFAULT_COLOR;
            comp.iMax = LED_DEFAULT_IMAX_A;
            ensureLedFields(comp);
        }
        components.push(comp);
        snapTwoTerminalComponent(comp);
        selectPlacedComponent(comp);
        saveState();
        draw();
    }
    resetPaletteDragState();
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
    components.forEach(c => {
        ensureOpampFields(c);
        ensureLedFields(c);
        renderComponent(c);
    });
    if (dragPreview && isSchematicTerminalType(dragPreview.type)) {
        ctx.globalAlpha = 0.45;
        const ghost = {
            id: "…",
            type: dragPreview.type,
            x: dragPreview.x,
            y: dragPreview.y,
            value:
                dragPreview.value != null && String(dragPreview.value).length > 0
                    ? dragPreview.value
                    : droppedComponentValue(dragPreview.type, activeDragModel),
            orient: dragPreview.orient != null ? dragPreview.orient : 0,
            vertical: dragPreview.vertical,
            mirrorX: dragPreview.mirrorX,
            mirrorY: dragPreview.mirrorY,
        };
        renderComponent(ghost, { ghost: true });
        ctx.globalAlpha = 1;
    }

    drawLedEffectsOverlay();

    if (isMarqueeSelecting && marqueeCornerA && marqueeCornerB) {
        const r = normalizeMarqueeRect(marqueeCornerA, marqueeCornerB);
        ctx.save();
        ctx.strokeStyle = "rgba(0, 120, 212, 0.9)";
        ctx.fillStyle = "rgba(0, 120, 212, 0.12)";
        ctx.lineWidth = 1.5 / scale;
        ctx.setLineDash([6 / scale, 4 / scale]);
        const rw = r.x1 - r.x0;
        const rh = r.y1 - r.y0;
        ctx.fillRect(r.x0, r.y0, rw, rh);
        ctx.strokeRect(r.x0, r.y0, rw, rh);
        ctx.setLineDash([]);
        ctx.restore();
    }

    ctx.restore();

    if (ledColorEditorCompId) {
        const ledComp = components.find(c => c.id === ledColorEditorCompId);
        if (ledComp) positionLedColorEditorForComponent(ledComp);
    }
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
    const isSelected =
        !ghost && (selectedId === c.id || compIsInAreaSelection(c.id));
    
    // Couleurs par type
    if (isSelected) ctx.strokeStyle = "#0078d4";
    else if (c.type === "vsource" || c.type === "vterm") ctx.strokeStyle = "#FFA726";
    else if (c.type === "logic_state") ctx.strokeStyle = "#5C6BC0";
    else if (c.type === "ground") ctx.strokeStyle = "#78909C";
    else if (c.type === "vsin") ctx.strokeStyle = "#42A5F5";
    else if (c.type === "vsquare") ctx.strokeStyle = "#7E57C2";
    else if (c.type === "oscilloscope") ctx.strokeStyle = "#26A69A";
    else if (c.type === "capacitor") ctx.strokeStyle = "#42A5F5";
    else if (c.type === "inductor") ctx.strokeStyle = "#FF7043";
    else if (c.type === "diode") ctx.strokeStyle = "#EC407A";
    else if (isLedType(c.type)) ctx.strokeStyle = getLedColor(c);
    else if (isSeg7Type(c.type)) ctx.strokeStyle = "#4DD0E1";
    else if (isOptoPlaceholderType(c.type)) ctx.strokeStyle = "#90A4AE";
    else if (c.type === "npn") ctx.strokeStyle = "#FFA726";
    else if (c.type === "opamp") ctx.strokeStyle = "#AB47BC";
    else if (isLogicFamilyType(c.type)) ctx.strokeStyle = "#7986CB";
    else if (c.type === "voltmeter" || c.type === "voltmeter_rms") ctx.strokeStyle = "#4DB6AC";
    else if (c.type === "ammeter" || c.type === "ammeter_rms") ctx.strokeStyle = "#CE93D8";
    else if (c.type === "ohmmeter") ctx.strokeStyle = "#FFB74D";
    else ctx.strokeStyle = "#4CAF50";

    ctx.lineWidth = 2 / scale;
    ctx.fillStyle = getEditorColors().compLabel;
    ctx.font = `${14 / scale}px Segoe UI`;

    let junctA, junctB;
    ctx.save();
    ctx.translate(c.x, c.y);

    if (isOscilloscopeType(c.type)) {
        const w = OSC_W;
        const h = OSC_H;
        drawOscilloscopeSymbol(ctx, c, w, h);
        const ends = oscilloscopeJunctionsWorld(c);
        if (!ghost) {
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.fillText(c.id, w / 2, -10);
            ctx.textAlign = "start";
            ctx.textBaseline = "alphabetic";
        }
        ctx.restore();
        drawJunctions(ends);
        return;
    }
    if (isSignalGeneratorType(c.type)) {
        const w = SIGNAL_GEN_BOX;
        const h = SIGNAL_GEN_BOX;
        drawSignalGeneratorSymbol(ctx, c, w, h);
        const ends = junctionEndpointsForComponent(c);
        junctA = ends[0];
        junctB = ends[1];
        if (!ghost) {
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.fillText(c.id, w / 2, -10);
            ctx.textAlign = "start";
            ctx.textBaseline = "alphabetic";
        }
    } else if (isNpnType(c.type)) {
        const { w, h } = npnDimsFromOrient(getCompOrient(c));
        drawNpnSymbolOriented(ctx, c);
        const ends = npnJunctionsWorld(c);
        if (!ghost) {
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.fillText(c.id, w / 2, -10);
            if (c.value) {
                ctx.font = `${11 / scale}px Segoe UI`;
                ctx.textBaseline = "top";
                ctx.fillText(String(c.value), w / 2, h + 14);
                ctx.font = `${14 / scale}px Segoe UI`;
            }
            ctx.textAlign = "start";
            ctx.textBaseline = "alphabetic";
        }
        ctx.restore();
        drawJunctions(ends);
        return;
    } else if (isOpampType(c.type)) {
        const { w, h } = opampDimsFromOrient(getCompOrient(c));
        drawOpAmpSymbolOriented(ctx, c);
        const ends = opampJunctionsWorld(c);
        if (!ghost) {
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.fillText(c.id, w / 2, -10);
            if (c.value) {
                ctx.textBaseline = "top";
                ctx.fillText(String(c.value), w / 2, h + 10);
                ctx.font = `${10 / scale}px Segoe UI`;
                ctx.fillText(formatOpampSupplyLabel(getOpampVp(c), getOpampVn(c)), w / 2, h + 24);
                ctx.font = `${14 / scale}px Segoe UI`;
            }
            ctx.textAlign = "start";
            ctx.textBaseline = "alphabetic";
        }
        ctx.restore();
        drawJunctions(ends);
        return;
    } else if (isLogicGateType(c.type)) {
        const { w, h } = logicGateDimsFromOrient(getCompOrient(c), c.type);
        drawLogicGateSymbolOriented(ctx, c);
        if (!ghost) drawLogicGateIecLabelUpright(ctx, c);
        const ends = logicGateJunctionsWorld(c);
        if (!ghost) {
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.fillText(c.id, w / 2, -10);
            ctx.textAlign = "start";
            ctx.textBaseline = "alphabetic";
        }
        ctx.restore();
        drawJunctions(ends);
        return;
    } else if (isLogicFlipFlopType(c.type)) {
        const { w, h } = logicFlipFlopDimsFromOrient(getCompOrient(c), c.type);
        drawLogicFlipFlopSymbolOriented(ctx, c);
        if (!ghost) drawLogicFlipFlopPinLabelsUpright(ctx, c);
        const ends = logicFlipFlopJunctionsWorld(c);
        if (!ghost) {
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.fillText(c.id, w / 2, -10);
            ctx.textAlign = "start";
            ctx.textBaseline = "alphabetic";
        }
        ctx.restore();
        drawJunctions(ends);
        return;
    } else if (isLogicIcType(c.type)) {
        const { w, h } = ic74ls00DimsFromOrient(getCompOrient(c));
        drawIc74ls00SymbolOriented(ctx, c);
        if (!ghost) drawIc74PinLabelsUpright(ctx, c);
        const ends = ic74ls00JunctionsWorld(c);
        if (!ghost) {
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.fillText(c.id, w / 2, -10);
            if (c.value) {
                ctx.textBaseline = "top";
                ctx.fillText(String(c.value), w / 2, h + 10);
            }
            ctx.textAlign = "start";
            ctx.textBaseline = "alphabetic";
        }
        ctx.restore();
        drawJunctions(ends);
        return;
    } else if (isSeg7Type(c.type)) {
        const { w, h } = seg7DimsFromOrient(getCompOrient(c));
        drawSeg7Symbol(ctx, w, h, getCompOrient(c), c, ghost);
        if (!ghost) drawSeg7PinLabelsUpright(ctx, c);
        const ends = seg7JunctionsWorld(c);
        if (!ghost) {
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.fillText(c.id, w / 2, -10);
            ctx.textAlign = "start";
            ctx.textBaseline = "alphabetic";
        }
        ctx.restore();
        drawJunctions(ends);
        return;
    } else if (isSingleTerminalRefType(c.type)) {
        const o = getCompOrient(c);
        const { w, h } = singleTerminalDimsFromOrient(o);
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate((-o * Math.PI) / 2);
        ctx.translate(-GND_BASE_W / 2, -GND_BASE_H / 2);
        if (isGroundType(c.type)) drawGroundSymbol(ctx, GND_BASE_W, GND_BASE_H);
        else if (isLogicStateType(c.type)) {
            drawLogicStateSymbol(ctx, GND_BASE_W, GND_BASE_H, c.value, false);
        } else drawVtermSymbol(ctx, GND_BASE_W, GND_BASE_H, c.value);
        ctx.restore();
        if (isLogicStateType(c.type) && !ghost) {
            drawLogicStateLabelUpright(ctx, c);
            drawLogicStateRailLabelUpright(ctx, c);
        }
        const ends = singleTerminalJunctionsWorld(c);
        ctx.restore();
        drawJunctions(ends);
        return;
    } else if (isTwoTerminalType(c.type)) {
        const o = getCompOrient(c);
        const { w, h } = twoTerminalDimsFromOrient(o);
        const vertLayout = o === 1 || o === 3;
        const midX = w / 2;
        const midY = h / 2;
        if (isInstrumentType(c.type)) {
            drawCircleInstrument(ctx, instrumentDisplayLetter(c.type), w, h, vertLayout);
        } else if (c.type === "vsource") {
            const gap = 5;
            if (vertLayout) {
                ctx.beginPath();
                ctx.moveTo(midX, 0);
                ctx.lineTo(midX, h / 2 - gap);
                ctx.moveTo(midX, h / 2 + gap);
                ctx.lineTo(midX, h);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(w * 0.05, h / 2 - gap);
                ctx.lineTo(w * 0.95, h / 2 - gap);
                ctx.moveTo(w * 0.25, h / 2 + gap);
                ctx.lineTo(w * 0.75, h / 2 + gap);
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.moveTo(0, midY);
                ctx.lineTo(w / 2 - gap, midY);
                ctx.moveTo(w / 2 + gap, midY);
                ctx.lineTo(w, midY);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(w / 2 - gap, h * 0.05);
                ctx.lineTo(w / 2 - gap, h * 0.95);
                ctx.moveTo(w / 2 + gap, h * 0.3);
                ctx.lineTo(w / 2 + gap, h * 0.7);
                ctx.stroke();
            }
        } else if (c.type === "capacitor") {
            drawCapacitorSymbol(ctx, w, h, vertLayout);
        } else if (c.type === "inductor") {
            drawInductorSymbol(ctx, w, h, vertLayout);
        } else if (c.type === "diode") {
            drawDiodeSymbol(ctx, w, h, o);
        } else if (isLedType(c.type)) {
            drawLedSymbol(ctx, w, h, o, c, ghost);
        } else if (c.type === "lamp") {
            drawOptoPlaceholderSymbol(ctx, w, h, o, "LAMPE");
        } else if (c.type === "lcd") {
            drawOptoPlaceholderSymbol(ctx, w, h, o, "LCD");
        } else {
            if (vertLayout) {
                ctx.beginPath();
                ctx.moveTo(midX, 0);
                ctx.lineTo(midX, h * 0.25);
                ctx.moveTo(midX, h * 0.75);
                ctx.lineTo(midX, h);
                ctx.stroke();
                ctx.strokeRect(w / 4, h * 0.25, w / 2, h / 2);
            } else {
                ctx.beginPath();
                ctx.moveTo(0, midY);
                ctx.lineTo(w * 0.25, midY);
                ctx.moveTo(w * 0.75, midY);
                ctx.lineTo(w, midY);
                ctx.stroke();
                ctx.strokeRect(w * 0.25, h / 4, w / 2, h / 2);
            }
        }
        const ends = twoTerminalJunctionsWorld(c);
        junctA = ends[0];
        junctB = ends[1];
        if (!ghost) drawComponentLabels(ctx, c, w, h, vertLayout);
    }

    ctx.restore();
    drawJunctions([junctA, junctB]);
}

// --- MOUVEMENT & SELECTION ---
/** Clic sur une borne : si un fil est en cours, on l'étend en Manhattan jusqu'à la borne et on termine.
 *  Sinon, on démarre un nouveau brouillon depuis cette borne. */
function startWireFromJunction(jHit) {
    if (wireDraft && wireDraft.fromKey !== jHit.key) {
        const anchor = wireDraft.points[wireDraft.points.length - 1];
        const newPts = extendWireSegment(anchor, { x: jHit.x, y: jHit.y }, WIRE_EXTEND_MODE);
        appendUniquePoints(wireDraft.points, newPts);
        const last = wireDraft.points[wireDraft.points.length - 1];
        if (!sameXY(last, jHit)) wireDraft.points.push({ x: jHit.x, y: jHit.y });
        finishWire(jHit);
        isWireDrag = false;
        return;
    }
    if (wireDraft && wireDraft.fromKey === jHit.key) {
        // Re-clic sur la borne de départ : on annule le brouillon.
        wireDraft = null;
        isWireDrag = false;
        return;
    }
    wireDraft = { fromKey: jHit.key, points: [{ x: jHit.x, y: jHit.y }] };
    isWireDrag = true;
    selectedId = null;
    isMovingComponent = false;
}

function handleCanvasDblClick(e) {
    const worldPos = screenToWorld(e.clientX, e.clientY);
    let hitComp = findTopComponentAtWorld(worldPos.x, worldPos.y);
    if (!hitComp) hitComp = findValueLabelHit(worldPos.x, worldPos.y);
    if (!hitComp) return;
    if (isVtermType(hitComp.type)) {
        e.preventDefault();
        e.stopPropagation();
        isMovingComponent = false;
        dragStartClient = null;
        releaseCanvasPointerCapture(e);
        closeValueEditor();
        window.setTimeout(() => openValueEditor(hitComp), 0);
        return;
    }
    if (isLogicStateType(hitComp.type)) {
        e.preventDefault();
        e.stopPropagation();
        isMovingComponent = false;
        dragStartClient = null;
        releaseCanvasPointerCapture(e);
        closeValueEditor();
        ensureLogicRailField(hitComp);
        hitComp.logicRail = toggleLogicRail(hitComp.logicRail);
        saveState();
        draw();
        return;
    }
    if (isLogicFamilyType(hitComp.type)) {
        e.preventDefault();
        e.stopPropagation();
        isMovingComponent = false;
        dragStartClient = null;
        releaseCanvasPointerCapture(e);
        closeValueEditor();
        ensureLogicRailField(hitComp);
        hitComp.logicRail = toggleLogicRail(hitComp.logicRail);
        saveState();
        draw();
        return;
    }
    if (isLedType(hitComp.type)) {
        e.preventDefault();
        e.stopPropagation();
        isMovingComponent = false;
        dragStartClient = null;
        releaseCanvasPointerCapture(e);
        closeValueEditor();
        window.setTimeout(() => openLedColorEditor(hitComp), 0);
        return;
    }
    if (findComponentTerminalNearWorld(hitComp, worldPos.x, worldPos.y)) return;
    e.preventDefault();
    e.stopPropagation();
    isMovingComponent = false;
    dragStartClient = null;
    releaseCanvasPointerCapture(e);
    if (isSignalGeneratorType(hitComp.type)) {
        closeValueEditor();
        openGeneratorInspector(hitComp);
        return;
    }
    if (isOpampType(hitComp.type)) {
        closeValueEditor();
        openOpampInspector(hitComp);
        return;
    }
    if (!isValueEditableType(hitComp.type)) return;
    closeValueEditor();
    window.setTimeout(() => openValueEditor(hitComp), 0);
}

function handleMouseDown(e) {
    if (valueEditorCompId && !e.target.closest("#comp-value-editor") && e.detail < 2) {
        closeValueEditor();
        draw();
    }
    if (ledColorEditorCompId && !e.target.closest("#led-color-editor") && e.detail < 2) {
        closeLedColorEditor();
        draw();
    }
    const worldPos = screenToWorld(e.clientX, e.clientY);

    if (e.button === 0 && e.detail >= 2) {
        return;
    }

    if (e.button === 0) {
        if (e.shiftKey) {
            if (hasAreaSelection() && hitAreaSelectionAtWorld(worldPos.x, worldPos.y)) {
                beginAreaSelectionMove(worldPos);
                beginCanvasPointerCapture(e);
                draw();
                return;
            }
            clearAreaSelection();
            selectedId = null;
            selectedWireId = null;
            isMarqueeSelecting = true;
            marqueeCornerA = { x: worldPos.x, y: worldPos.y };
            marqueeCornerB = { x: worldPos.x, y: worldPos.y };
            beginCanvasPointerCapture(e);
            draw();
            return;
        }

        clearAreaSelection();

        const hitComp = findTopComponentAtWorld(worldPos.x, worldPos.y);
        if (hitComp) {
            const term = findComponentTerminalNearWorld(hitComp, worldPos.x, worldPos.y);
            if (!term) {
                selectedId = hitComp.id;
                selectedWireId = null;
                if (isSignalGeneratorType(hitComp.type)) openGeneratorInspector(hitComp);
                else closeGeneratorInspector();
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

        const jHit = findJunctionNearWorld(worldPos.x, worldPos.y);
        if (jHit) {
            selectedWireId = null;
            startWireFromJunction(jHit);
            beginCanvasPointerCapture(e);
            draw();
            return;
        }

        const wireCorner = snapToNearbyWireVertex(worldPos.x, worldPos.y, null, hitSlopWorld());
        if (wireCorner) {
            selectedWireId = null;
            startWireFromJunction({
                x: wireCorner.x,
                y: wireCorner.y,
                key: teeVirtualKey(wireCorner.x, wireCorner.y),
            });
            beginCanvasPointerCapture(e);
            draw();
            return;
        }

        if (wireDraft) {
            selectedWireId = null;
            selectedId = null;
            isWireDrag = true;
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

        selectedId = null;
        selectedWireId = null;
        closeGeneratorInspector();
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

    if (isMarqueeSelecting) {
        marqueeCornerB = { x: worldPos.x, y: worldPos.y };
        draw();
    } else if (isMovingAreaSelection) {
        const dx = worldPos.x - lastMousePos.x;
        const dy = worldPos.y - lastMousePos.y;
        moveAreaSelectionBy(dx, dy);
        lastMousePos = worldPos;
        draw();
    } else if (isMovingComponent && selectedId) {
        let comp = components.find(c => c.id === selectedId);
        comp.x += worldPos.x - lastMousePos.x;
        comp.y += worldPos.y - lastMousePos.y;
        lastMousePos = worldPos;
        if (valueEditorCompId === comp.id) positionValueEditorForComponent(comp);
        if (ledColorEditorCompId === comp.id) positionLedColorEditorForComponent(comp);
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
    if (e.button === 0 && isMarqueeSelecting) {
        marqueeCornerB = { x: worldPos.x, y: worldPos.y };
        finalizeMarqueeSelection();
    }
    if (e.button === 0 && isMovingAreaSelection) {
        snapAreaSelectionAfterMove();
        saveState();
        isMovingAreaSelection = false;
        areaMoveStartWorld = null;
    }
    if (e.button === 0 && isWireDrag && wireDraft && !isMovingComponent && !isMovingAreaSelection) {
        if (!isMouseEventTargetInEditorWorkarea(e)) {
            isWireDrag = false;
            if (wireDraft.points.length >= 2) commitDraftWireAsFloatingEnd();
            else wireDraft = null;
        } else {
            const anchor = wireDraft.points[wireDraft.points.length - 1];
            const newPts = extendWireSegment(anchor, worldPos, WIRE_EXTEND_MODE);
            appendUniquePoints(wireDraft.points, newPts);
            isWireDrag = false;
            if (!tryCompleteWireOnMouseUp(worldPos)) {
                tryFinishDraftWireAtTee(worldPos);
            }
        }
    }
    if (e.button === 0 && isMovingComponent && selectedId) {
        const comp = components.find(c => c.id === selectedId);
        const moved =
            dragStartClient && Math.hypot(e.clientX - dragStartClient.x, e.clientY - dragStartClient.y) > 6;
        if (comp && !moved) {
            const worldPos = screenToWorld(e.clientX, e.clientY);
            if (!findComponentTerminalNearWorld(comp, worldPos.x, worldPos.y)) {
                if (isLogicStateType(comp.type)) {
                    ensureLogicRailField(comp);
                    comp.value = normalizeLogicStateDisplay(comp.value) === "1" ? "0" : "1";
                    saveState();
                    isMovingComponent = false;
                    dragStartClient = null;
                    releaseCanvasPointerCapture(e);
                    draw();
                    return;
                }
                if (isSignalGeneratorType(comp.type)) {
                    isMovingComponent = false;
                    dragStartClient = null;
                    releaseCanvasPointerCapture(e);
                    openGeneratorInspector(comp);
                    draw();
                    return;
                }
            }
        }
        if (comp) {
            if (isOscilloscopeType(comp.type)) snapOscilloscopeComponent(comp);
            else if (isSignalGeneratorType(comp.type)) snapSignalGeneratorComponent(comp);
            else if (isNpnType(comp.type)) snapNpnComponent(comp);
            else if (isOpampType(comp.type)) snapOpampComponent(comp);
            else if (isLogicGateType(comp.type)) snapLogicGateComponent(comp);
            else if (isLogicFlipFlopType(comp.type)) snapLogicFlipFlopComponent(comp);
            else if (isLogicIcType(comp.type)) snapIc74ls00Component(comp);
            else if (isSeg7Type(comp.type)) snapSeg7Component(comp);
            else if (isSingleTerminalRefType(comp.type)) snapSingleTerminalComponent(comp);
            else if (isTwoTerminalType(comp.type)) snapTwoTerminalComponent(comp);
            else {
                comp.x = Math.round(comp.x / GRID_SIZE) * GRID_SIZE;
                comp.y = Math.round(comp.y / GRID_SIZE) * GRID_SIZE;
            }
            saveState();
        }
    }
    isMovingComponent = false;
    isMovingAreaSelection = false;
    isMarqueeSelecting = false;
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

function cloneComponentForClipboard(c) {
    const o = {
        type: c.type,
        vertical: c.vertical,
        value: c.value,
        mirrorX: !!c.mirrorX,
        mirrorY: !!c.mirrorY,
        orient: getCompOrient(c),
        x: c.x,
        y: c.y,
    };
    if (isOpampType(c.type)) {
        o.vp = getOpampVp(c);
        o.vn = getOpampVn(c);
    }
    if (isLedType(c.type)) {
        ensureLedFields(c);
        o.ledColor = getLedColor(c);
        o.iMax = getLedImax(c);
    }
    if (isLogicStateType(c.type) || isLogicFamilyType(c.type)) {
        ensureLogicRailField(c);
        o.logicRail = parseLogicRail(c.logicRail);
    }
    return o;
}

function copySelection() {
    if (hasAreaSelection()) {
        const comps = [];
        for (const id of areaSelection.compIds) {
            const c = components.find(x => x.id === id);
            if (c) {
                const item = cloneComponentForClipboard(c);
                item._srcId = c.id;
                comps.push(item);
            }
        }
        const wirs = [];
        for (const id of areaSelection.wireIds) {
            const w = wires.find(x => x.id === id);
            if (w && w.solid) {
                wirs.push({
                    _srcId: w.id,
                    fromKey: w.fromKey,
                    toKey: w.toKey,
                    points: w.points.map(p => ({ x: p.x, y: p.y })),
                });
            }
        }
        clipboard = { kind: "group", components: comps, wires: wirs };
        return;
    }
    if (!selectedId) return;
    const c = components.find(x => x.id === selectedId);
    if (!c || !isSchematicTerminalType(c.type)) return;
    clipboard = cloneComponentForClipboard(c);
    clipboard.kind = "single";
}

function remapTerminalKeyForPaste(key, idMap) {
    if (!key || key.startsWith("__")) return key;
    const m = /^([^#]+)#(\d+)$/.exec(key);
    if (!m) return key;
    const nid = idMap[m[1]];
    return nid ? `${nid}#${m[2]}` : key;
}

function allocateComponentId(type) {
    if (isOscilloscopeType(type)) return `Osc${++oscilloscopeCount}`;
    if (isNpnType(type)) return `Q${++npnCount}`;
    if (isOpampType(type)) return `U${++opampCount}`;
    if (type === "vsin") return `Sin${++vsinCount}`;
    if (type === "vsquare") return `Carre${++vsquareCount}`;
    if (type === "ground") return `G${++groundCount}`;
    if (type === "vterm") return `B${++vtermCount}`;
    if (type === "logic_state") return `LS${++logicStateCount}`;
    if (type === "resistor") return `R${++resistorCount}`;
    if (type === "capacitor") return `C${++capacitorCount}`;
    if (type === "inductor") return `L${++inductorCount}`;
    if (type === "diode") return `D${++diodeCount}`;
    if (type === "led") return `LD${++ledCount}`;
    if (type === "lamp") return `LP${++lampCount}`;
    if (type === "seg7") return `S7${++seg7Count}`;
    if (type === "lcd") return `LCD${++lcdCount}`;
    if (type === "logic_not") return `NOT${++logicNotCount}`;
    if (type === "logic_and") return `AND${++logicAndCount}`;
    if (type === "logic_or") return `OR${++logicOrCount}`;
    if (type === "logic_nand") return `NAND${++logicNandCount}`;
    if (type === "logic_nor") return `NOR${++logicNorCount}`;
    if (type === "logic_xor") return `XOR${++logicXorCount}`;
    if (type === "logic_xnor") return `XNOR${++logicXnorCount}`;
    if (type === "logic_dff") return `Dbas${++logicDbasCount}`;
    if (type === "logic_jk") return `JKff${++logicJkCount}`;
    if (type === "ic_74ls00") return `U74${++ic74ls00Count}`;
    if (type === "ic_74ls74") return `U7474${++ic74ls74Count}`;
    if (type === "vsource") return `E${++vsourceCount}`;
    if (type === "voltmeter") return `V${++voltmeterCount}`;
    if (type === "voltmeter_rms") return `Vm${++voltmeterRmsCount}`;
    if (type === "ammeter") return `A${++ammeterCount}`;
    if (type === "ammeter_rms") return `Am${++ammeterRmsCount}`;
    return `O${++ohmmeterCount}`;
}

function pasteGroupFromClipboard() {
    const idMap = {};
    const offset = GRID_SIZE;
    const newCompIds = new Set();
    const newWireIds = new Set();

    for (const item of clipboard.components) {
        const id = allocateComponentId(item.type);
        if (item._srcId) idMap[item._srcId] = id;
        const pasted = {
            id,
            type: item.type,
            x: item.x + offset,
            y: item.y + offset,
            value: item.value,
            vertical: item.vertical,
            mirrorX: !!item.mirrorX,
            mirrorY: !!item.mirrorY,
            orient: item.orient != null ? item.orient : 0,
        };
        syncVerticalFromOrient(pasted);
        if (isOpampType(pasted.type)) {
            pasted.vp = item.vp != null ? item.vp : OPAMP_DEFAULT_VP;
            pasted.vn = item.vn != null ? item.vn : OPAMP_DEFAULT_VN;
            ensureOpampFields(pasted);
        }
        if (isLedType(pasted.type)) {
            pasted.ledColor = item.ledColor || LED_DEFAULT_COLOR;
            pasted.iMax = item.iMax > 0 ? item.iMax : LED_DEFAULT_IMAX_A;
            ensureLedFields(pasted);
        }
        components.push(pasted);
        newCompIds.add(id);
    }

    for (const witem of clipboard.wires) {
        const pts = witem.points.map(p => ({ x: p.x + offset, y: p.y + offset }));
        const wid = `W${++wireCount}`;
        wires.push({
            id: wid,
            solid: true,
            fromKey: remapTerminalKeyForPaste(witem.fromKey, idMap),
            toKey: remapTerminalKeyForPaste(witem.toKey, idMap),
            points: orthogonalizeWirePoints(pts),
        });
        newWireIds.add(wid);
    }

    clearAreaSelection();
    areaSelection = { compIds: newCompIds, wireIds: newWireIds };
    selectedId = null;
    selectedWireId = null;
    rebuildUsedJunctionKeys();
    saveState();
    draw();
}

function pasteFromClipboard() {
    if (!clipboard) return;
    if (clipboard.kind === "group") {
        pasteGroupFromClipboard();
        return;
    }
    if (!isSchematicTerminalType(clipboard.type)) return;
    let id;
    let x;
    let y;
    let mirrorX = false;
    if (isOscilloscopeType(clipboard.type)) {
        const snapped = snapOscilloscopeDropWorld(
            lastWorldMouse.x,
            lastWorldMouse.y,
            !!clipboard.mirrorX
        );
        x = snapped.x;
        y = snapped.y;
        mirrorX = snapped.mirrorX;
        id = `Osc${++oscilloscopeCount}`;
    } else if (isNpnType(clipboard.type)) {
        const snapped = snapNpnDropWorld(
            lastWorldMouse.x,
            lastWorldMouse.y,
            getCompOrient(clipboard),
            !!clipboard.mirrorX,
            !!clipboard.mirrorY
        );
        x = snapped.x;
        y = snapped.y;
        mirrorX = !!clipboard.mirrorX;
        id = `Q${++npnCount}`;
    } else if (isOpampType(clipboard.type)) {
        const snapped = snapOpampDropWorld(
            lastWorldMouse.x,
            lastWorldMouse.y,
            getCompOrient(clipboard),
            !!clipboard.mirrorX,
            !!clipboard.mirrorY
        );
        x = snapped.x;
        y = snapped.y;
        mirrorX = !!clipboard.mirrorX;
        id = `U${++opampCount}`;
    } else if (isLogicGateType(clipboard.type)) {
        const snapped = snapLogicGateDropWorld(
            lastWorldMouse.x,
            lastWorldMouse.y,
            clipboard.type,
            getCompOrient(clipboard),
            !!clipboard.mirrorX,
            !!clipboard.mirrorY
        );
        x = snapped.x;
        y = snapped.y;
        mirrorX = !!clipboard.mirrorX;
        id = allocateComponentId(clipboard.type);
    } else if (isLogicFlipFlopType(clipboard.type)) {
        const snapped = snapLogicFlipFlopDropWorld(
            lastWorldMouse.x,
            lastWorldMouse.y,
            clipboard.type,
            getCompOrient(clipboard),
            !!clipboard.mirrorX,
            !!clipboard.mirrorY
        );
        x = snapped.x;
        y = snapped.y;
        mirrorX = !!clipboard.mirrorX;
        id = allocateComponentId(clipboard.type);
    } else if (isLogicIcType(clipboard.type)) {
        const snapped = snapIc74ls00DropWorld(
            lastWorldMouse.x,
            lastWorldMouse.y,
            getCompOrient(clipboard),
            !!clipboard.mirrorX,
            !!clipboard.mirrorY
        );
        x = snapped.x;
        y = snapped.y;
        mirrorX = !!clipboard.mirrorX;
        id = allocateComponentId(clipboard.type);
    } else if (isSignalGeneratorType(clipboard.type)) {
        const snapped = snapSignalGeneratorDropWorld(
            lastWorldMouse.x,
            lastWorldMouse.y,
            !!clipboard.mirrorX
        );
        x = snapped.x;
        y = snapped.y;
        mirrorX = snapped.mirrorX;
        id = clipboard.type === "vsin" ? `Sin${++vsinCount}` : `Carre${++vsquareCount}`;
    } else if (isSingleTerminalRefType(clipboard.type)) {
        const snapped = snapSingleTerminalDropWorld(
            lastWorldMouse.x,
            lastWorldMouse.y,
            clipboard.type,
            getCompOrient(clipboard)
        );
        x = snapped.x;
        y = snapped.y;
        id = isGroundType(clipboard.type)
            ? `G${++groundCount}`
            : isLogicStateType(clipboard.type)
              ? `LS${++logicStateCount}`
              : `B${++vtermCount}`;
    } else {
        const snapped = snapTwoTerminalDropWorld(
            lastWorldMouse.x,
            lastWorldMouse.y,
            getCompOrient(clipboard)
        );
        x = snapped.x;
        y = snapped.y;
        if (clipboard.type === "resistor") id = `R${++resistorCount}`;
        else if (clipboard.type === "capacitor") id = `C${++capacitorCount}`;
        else if (clipboard.type === "inductor") id = `L${++inductorCount}`;
        else if (clipboard.type === "diode") id = `D${++diodeCount}`;
        else if (clipboard.type === "led") id = `LD${++ledCount}`;
        else if (clipboard.type === "lamp") id = `LP${++lampCount}`;
        else if (clipboard.type === "seg7") id = `S7${++seg7Count}`;
        else if (clipboard.type === "lcd") id = `LCD${++lcdCount}`;
        else if (clipboard.type === "vsource") id = `E${++vsourceCount}`;
        else if (clipboard.type === "voltmeter") id = `V${++voltmeterCount}`;
        else if (clipboard.type === "voltmeter_rms") id = `Vm${++voltmeterRmsCount}`;
        else if (clipboard.type === "ammeter") id = `A${++ammeterCount}`;
        else if (clipboard.type === "ammeter_rms") id = `Am${++ammeterRmsCount}`;
        else id = `O${++ohmmeterCount}`;
    }
    const pasted = {
        id,
        type: clipboard.type,
        x,
        y,
        value: clipboard.value,
        vertical: clipboard.vertical,
        mirrorX,
        mirrorY: !!clipboard.mirrorY,
        orient: clipboard.orient != null ? clipboard.orient : 0,
    };
    syncVerticalFromOrient(pasted);
    if (isLedType(pasted.type)) {
        pasted.ledColor = clipboard.ledColor || LED_DEFAULT_COLOR;
        pasted.iMax = clipboard.iMax > 0 ? clipboard.iMax : LED_DEFAULT_IMAX_A;
        ensureLedFields(pasted);
    }
    if (isOpampType(pasted.type)) {
        pasted.vp = clipboard.vp != null ? clipboard.vp : OPAMP_DEFAULT_VP;
        pasted.vn = clipboard.vn != null ? clipboard.vn : OPAMP_DEFAULT_VN;
        ensureOpampFields(pasted);
    }
    if (isLogicStateType(pasted.type) || isLogicFamilyType(pasted.type)) {
        pasted.logicRail = clipboard.logicRail != null ? parseLogicRail(clipboard.logicRail) : 5;
    }
    if (isSeg7Type(pasted.type)) {
        ensureSeg7Fields(pasted);
        pasted.seg7On = Array(7).fill(false);
    }
    components.push(pasted);
    if (isNpnType(pasted.type)) snapNpnComponent(pasted);
    else if (isOpampType(pasted.type)) snapOpampComponent(pasted);
    else if (isLogicGateType(pasted.type)) snapLogicGateComponent(pasted);
    else if (isLogicFlipFlopType(pasted.type)) snapLogicFlipFlopComponent(pasted);
    else if (isLogicIcType(pasted.type)) snapIc74ls00Component(pasted);
    else if (isSeg7Type(pasted.type)) snapSeg7Component(pasted);
    else if (isSingleTerminalRefType(pasted.type)) snapSingleTerminalComponent(pasted);
    else if (isTwoTerminalType(pasted.type)) snapTwoTerminalComponent(pasted);
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
        if (comp && usesFourWayOrient(comp.type)) {
            cycleCompOrient(comp);
            if (isNpnType(comp.type)) snapNpnComponent(comp);
            else if (isOpampType(comp.type)) snapOpampComponent(comp);
            else if (isLogicGateType(comp.type)) snapLogicGateComponent(comp);
            else if (isLogicFlipFlopType(comp.type)) snapLogicFlipFlopComponent(comp);
            else if (isLogicIcType(comp.type)) snapIc74ls00Component(comp);
            else if (isSeg7Type(comp.type)) snapSeg7Component(comp);
            else if (isSingleTerminalRefType(comp.type)) snapSingleTerminalComponent(comp);
            else snapTwoTerminalComponent(comp);
            saveState();
            draw();
        } else if (comp && isTwoTerminalType(comp.type) && !isSignalGeneratorType(comp.type)) {
            comp.vertical = !comp.vertical;
            comp.orient = comp.vertical ? 1 : 0;
            snapTwoTerminalComponent(comp);
            saveState();
            draw();
        }
    }
    if (selectedId && e.key.toLowerCase() === "x" && !isCtrl) {
        const comp = components.find(c => c.id === selectedId);
        if (
            comp &&
            (isSignalGeneratorType(comp.type) ||
                isOscilloscopeType(comp.type) ||
                isNpnType(comp.type) ||
                isOpampType(comp.type) ||
                isLogicFamilyType(comp.type))
        ) {
            comp.mirrorX = !comp.mirrorX;
            if (isOscilloscopeType(comp.type)) snapOscilloscopeComponent(comp);
            else if (isSignalGeneratorType(comp.type)) snapSignalGeneratorComponent(comp);
            else if (isNpnType(comp.type)) snapNpnComponent(comp);
            else if (isLogicGateType(comp.type)) snapLogicGateComponent(comp);
            else if (isLogicFlipFlopType(comp.type)) snapLogicFlipFlopComponent(comp);
            else if (isLogicIcType(comp.type)) snapIc74ls00Component(comp);
            else snapOpampComponent(comp);
            saveState();
            draw();
        }
    }
    if (selectedId && e.key.toLowerCase() === "y" && !isCtrl) {
        const comp = components.find(c => c.id === selectedId);
        if (
            comp &&
            (isNpnType(comp.type) ||
                isOpampType(comp.type) ||
                isLogicGateType(comp.type) ||
                isLogicFlipFlopType(comp.type) ||
                isLogicIcType(comp.type))
        ) {
            comp.mirrorY = !comp.mirrorY;
            if (isNpnType(comp.type)) snapNpnComponent(comp);
            else if (isLogicGateType(comp.type)) snapLogicGateComponent(comp);
            else if (isLogicFlipFlopType(comp.type)) snapLogicFlipFlopComponent(comp);
            else if (isLogicIcType(comp.type)) snapIc74ls00Component(comp);
            else snapOpampComponent(comp);
            saveState();
            draw();
        }
    }
    if ((e.key === "Delete" || e.key === "Backspace") && !isCtrl) {
        if (hasAreaSelection()) {
            e.preventDefault();
            deleteAreaSelection();
            saveState();
            draw();
            return;
        }
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
        if (hasAreaSelection() || isMarqueeSelecting) {
            clearAreaSelection();
            isMarqueeSelecting = false;
            marqueeCornerA = null;
            marqueeCornerB = null;
            isMovingAreaSelection = false;
            draw();
            return;
        }
        if (oscilloscopeOverlayEl) {
            closeOscilloscopeViewer();
            return;
        }
        if (commandsHelpOverlayEl) {
            closeCommandsHelp();
            return;
        }
        if (valueEditorCompId) {
            closeValueEditor();
            draw();
            return;
        }
        if (ledColorEditorCompId) {
            closeLedColorEditor();
            draw();
            return;
        }
        if (wireDraft) {
            if (wireDraft.points.length >= 2) commitDraftWireAsFloatingEnd();
            else {
                wireDraft = null;
                isWireDrag = false;
            }
            saveState();
            draw();
        }
    }
}

function saveState() {
    history.push(JSON.stringify({ components, wires }));
    if (history.length > 30) history.shift();
    redoStack = [];
    scheduleLiveSimRefresh();
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
    components.forEach(ensureOpampFields);
    components.forEach(ensureLedFields);
    components.forEach(ensureLogicRailField);
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
    let maxR = 0,
        maxC = 0,
        maxL = 0,
        maxD = 0,
        maxQ = 0,
        maxU = 0,
        maxE = 0,
        maxV = 0,
        maxVm = 0,
        maxA = 0,
        maxAm = 0,
        maxO = 0,
        maxSin = 0,
        maxCarre = 0,
        maxOsc = 0,
        maxLd = 0,
        maxLp = 0,
        maxS7 = 0,
        maxLcd = 0,
        maxNot = 0,
        maxAnd = 0,
        maxOr = 0,
        maxNand = 0,
        maxNor = 0,
        maxXor = 0,
        maxXnor = 0,
        maxDbas = 0,
        maxJk = 0,
        maxU74 = 0,
        maxU7474 = 0;
    for (const c of components) {
        if (!c || !c.id) continue;
        let m = /^R(\d+)$/.exec(c.id);
        if (m) maxR = Math.max(maxR, +m[1]);
        m = /^C(\d+)$/.exec(c.id);
        if (m) maxC = Math.max(maxC, +m[1]);
        m = /^L(\d+)$/.exec(c.id);
        if (m) maxL = Math.max(maxL, +m[1]);
        m = /^D(\d+)$/.exec(c.id);
        if (m) maxD = Math.max(maxD, +m[1]);
        m = /^Q(\d+)$/.exec(c.id);
        if (m) maxQ = Math.max(maxQ, +m[1]);
        m = /^U(\d+)$/.exec(c.id);
        if (m) maxU = Math.max(maxU, +m[1]);
        m = /^E(\d+)$/.exec(c.id);
        if (m) maxE = Math.max(maxE, +m[1]);
        m = /^V(\d+)$/.exec(c.id);
        if (m) maxV = Math.max(maxV, +m[1]);
        m = /^Vm(\d+)$/.exec(c.id);
        if (m) maxVm = Math.max(maxVm, +m[1]);
        m = /^A(\d+)$/.exec(c.id);
        if (m) maxA = Math.max(maxA, +m[1]);
        m = /^Am(\d+)$/.exec(c.id);
        if (m) maxAm = Math.max(maxAm, +m[1]);
        m = /^O(\d+)$/.exec(c.id);
        if (m) maxO = Math.max(maxO, +m[1]);
        m = /^Sin(\d+)$/i.exec(c.id);
        if (m) maxSin = Math.max(maxSin, +m[1]);
        m = /^Carre(\d+)$/i.exec(c.id);
        if (m) maxCarre = Math.max(maxCarre, +m[1]);
        m = /^Osc(\d+)$/i.exec(c.id);
        if (m) maxOsc = Math.max(maxOsc, +m[1]);
        m = /^LD(\d+)$/i.exec(c.id);
        if (m) maxLd = Math.max(maxLd, +m[1]);
        m = /^LP(\d+)$/i.exec(c.id);
        if (m) maxLp = Math.max(maxLp, +m[1]);
        m = /^S7(\d+)$/i.exec(c.id);
        if (m) maxS7 = Math.max(maxS7, +m[1]);
        m = /^LCD(\d+)$/i.exec(c.id);
        if (m) maxLcd = Math.max(maxLcd, +m[1]);
        m = /^NOT(\d+)$/i.exec(c.id);
        if (m) maxNot = Math.max(maxNot, +m[1]);
        m = /^AND(\d+)$/i.exec(c.id);
        if (m) maxAnd = Math.max(maxAnd, +m[1]);
        m = /^OR(\d+)$/i.exec(c.id);
        if (m) maxOr = Math.max(maxOr, +m[1]);
        m = /^NAND(\d+)$/i.exec(c.id);
        if (m) maxNand = Math.max(maxNand, +m[1]);
        m = /^NOR(\d+)$/i.exec(c.id);
        if (m) maxNor = Math.max(maxNor, +m[1]);
        m = /^XOR(\d+)$/i.exec(c.id);
        if (m) maxXor = Math.max(maxXor, +m[1]);
        m = /^XNOR(\d+)$/i.exec(c.id);
        if (m) maxXnor = Math.max(maxXnor, +m[1]);
        m = /^Dbas(\d+)$/i.exec(c.id);
        if (m) maxDbas = Math.max(maxDbas, +m[1]);
        m = /^DFF(\d+)$/i.exec(c.id);
        if (m) maxDbas = Math.max(maxDbas, +m[1]);
        m = /^JKff(\d+)$/i.exec(c.id);
        if (m) maxJk = Math.max(maxJk, +m[1]);
        m = /^JK(\d+)$/i.exec(c.id);
        if (m) maxJk = Math.max(maxJk, +m[1]);
        m = /^U7474(\d+)$/i.exec(c.id);
        if (m) maxU7474 = Math.max(maxU7474, +m[1]);
        m = /^U74(\d+)$/i.exec(c.id);
        if (m) maxU74 = Math.max(maxU74, +m[1]);
    }
    resistorCount = maxR;
    capacitorCount = maxC;
    inductorCount = maxL;
    diodeCount = maxD;
    npnCount = maxQ;
    opampCount = maxU;
    vsourceCount = maxE;
    let maxG = 0;
    let maxB = 0;
    let maxLs = 0;
    for (const c of components) {
        if (!c || !c.id) continue;
        let m = /^G(\d+)$/.exec(c.id);
        if (m) maxG = Math.max(maxG, +m[1]);
        m = /^B(\d+)$/.exec(c.id);
        if (m) maxB = Math.max(maxB, +m[1]);
        m = /^LS(\d+)$/i.exec(c.id);
        if (m) maxLs = Math.max(maxLs, +m[1]);
    }
    groundCount = maxG;
    vtermCount = maxB;
    logicStateCount = maxLs;
    voltmeterCount = maxV;
    voltmeterRmsCount = maxVm;
    ammeterCount = maxA;
    ammeterRmsCount = maxAm;
    ohmmeterCount = maxO;
    vsinCount = maxSin;
    vsquareCount = maxCarre;
    oscilloscopeCount = maxOsc;
    ledCount = maxLd;
    lampCount = maxLp;
    seg7Count = maxS7;
    lcdCount = maxLcd;
    logicNotCount = maxNot;
    logicAndCount = maxAnd;
    logicOrCount = maxOr;
    logicNandCount = maxNand;
    logicNorCount = maxNor;
    logicXorCount = maxXor;
    logicXnorCount = maxXnor;
    logicDbasCount = maxDbas;
    logicJkCount = maxJk;
    ic74ls00Count = maxU74;
    ic74ls74Count = maxU7474;
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
    components.forEach(ensureOpampFields);
    components.forEach(ensureLogicRailField);
    syncCountersFromComponents();
    syncWireCountFromWires();
    rebuildUsedJunctionKeys();
}

function resetCircuit() {
    stopLiveSimulation();
    components = [];
    wires = [];
    wireDraft = null;
    isWireDrag = false;
    wireCount = 0;
    selectedId = null;
    selectedWireId = null;
    clearAreaSelection();
    isMarqueeSelecting = false;
    isMovingAreaSelection = false;
    clipboard = null;
    dragPreview = null;
    currentFileHandle = null;
    history = [];
    redoStack = [];
    resistorCount = 0;
    capacitorCount = 0;
    inductorCount = 0;
    diodeCount = 0;
    npnCount = 0;
    opampCount = 0;
    vsourceCount = 0;
    groundCount = 0;
    vtermCount = 0;
    logicStateCount = 0;
    voltmeterCount = 0;
    ammeterCount = 0;
    voltmeterRmsCount = 0;
    ammeterRmsCount = 0;
    ohmmeterCount = 0;
    ledCount = 0;
    lampCount = 0;
    seg7Count = 0;
    lcdCount = 0;
    logicNotCount = 0;
    logicAndCount = 0;
    logicOrCount = 0;
    logicNandCount = 0;
    logicNorCount = 0;
    logicXorCount = 0;
    logicXnorCount = 0;
    logicDbasCount = 0;
    logicJkCount = 0;
    ic74ls00Count = 0;
    ic74ls74Count = 0;
    vsinCount = 0;
    vsquareCount = 0;
    oscilloscopeCount = 0;
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
