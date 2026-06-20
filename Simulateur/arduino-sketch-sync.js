/** Synchronise le sketch éditeur → composants UNO (sans dépendre de renderer.js). */
import { circuit } from './state.js';
import { applyArduinoSketchToComponent } from './Engine/arduino-sketch-parse.mjs';

let getActiveBoard = () => null;

export function registerArduinoSketchSync(getBoardFn) {
    getActiveBoard = typeof getBoardFn === 'function' ? getBoardFn : () => null;
}

function isActiveBoardOnCanvas(board) {
    return !!board && circuit.components.includes(board);
}

export function syncArduinoSketchesFromEditor() {
    const board = getActiveBoard();
    const el = document.getElementById('arduino-sketch-input');
    const panel = document.getElementById('arduino-panel');
    if (board && el && panel && !panel.classList.contains('hidden') && isActiveBoardOnCanvas(board)) {
        board.sketch = el.value;
    }
    for (const comp of circuit.components) {
        if (comp.type === 'arduino_uno') applyArduinoSketchToComponent(comp);
    }
}
