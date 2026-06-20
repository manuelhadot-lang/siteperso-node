// state.js
// Remplacez les deux premières lignes de state.js par :
export const canvas = document.getElementById('circuitCanvas') || document.createElement('canvas');
export const ctx = canvas.getContext ? canvas.getContext('2d') : null;

export const GRID_SIZE = 20; 
export let scale = { value: 1.0 };
export let pan = { x: 0, y: 0 };

export let flags = {
    isPanning: false,
    startX: 0,
    startY: 0,
    isDraggingComponent: false,
    isSimulating: false,
    isSelectingZone: false,
    isShiftPressed: false,
    isDraggingFromMenu: false
};

export let simulationResults = { voltmeters: {}, ammeters: {}, ohmmeters: {}, leds: {}, scopePlots: {}, bodePlots: {}, seg7: {}, bargraph: {}, logicValues: {} };

export let menuDrag = {
    draggedComponentType: null,
    x: 0,
    y: 0
};

export let file = { handle: null };

export let counters = { battery: 0, resistor: 0, potentiometer: 0, switch_spdt: 0, push_button: 0, capacitor: 0, inductor: 0, diode: 0, npn: 0, opamp: 0, not: 0, and: 0, nand: 0, or: 0, nor: 0, xor: 0, xnor: 0, d_flipflop: 0, jk_flipflop: 0, cd4511: 0, ic_74hc90: 0, arduino_uno: 0, led: 0, seg7: 0, bargraph_dc10h: 0, grove_lcd16x2: 0, grove_dht22: 0, voltmeter: 0, ammeter: 0, ohmmeter: 0, oscilloscope: 0, bode_analyzer: 0, speaker: 0, junction: 0, gnd: 0, vcc: 0, logic_terminal: 0, gimp: 0, gsin: 0, gsqr: 0 };
export let circuit = {
    components: [],
    wires: [],
    autoJunctions: []
};

export let interaction = {
    activeWire: null, 
    hoverJonction: null,
    hoveredComponent: null,
    hoveredWire: null,      
    selectedWire: null,
    selectedComponents: [],
    selectedAutoJunctions: []
};

export let zone = {
    start: { x: 0, y: 0 },
    end: { x: 0, y: 0 }
};

export let clipboard = { data: null };
export let undoStack = [];
export let redoStack = [];

export const emptyDragImage = new Image();
emptyDragImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// Utilitaires de base liés à la grille
export function snapToGrid(val) { return Math.round(val / GRID_SIZE) * GRID_SIZE; }
export function toGridCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect(); 
    return { 
        x: (clientX - rect.left - pan.x) / scale.value, 
        y: (clientY - rect.top - pan.y) / scale.value 
    };
}

// Système d'historique
export function saveState() {
    undoStack.push(JSON.stringify({ components: circuit.components, wires: circuit.wires, autoJunctions: circuit.autoJunctions, counters }));
    redoStack.length = 0;
}