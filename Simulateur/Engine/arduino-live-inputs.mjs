/**
 * Niveaux d'entrée GPIO live (boutons, interrupteurs) pour la simulation Arduino.
 */
import { reachableJonctions } from "./hc90-cascade.mjs";

function junctionNetReachesGnd(net) {
    for (const j of net) {
        if (typeof j === "string" && (j.startsWith("GND") || /^GND\d*_/.test(j))) return true;
    }
    return false;
}

function junctionNetReachesHigh(net) {
    for (const j of net) {
        if (typeof j !== "string") continue;
        if (j.startsWith("VCC")) return true;
        if (/^VDC\d*_in$/.test(j)) return true;
    }
    return false;
}

/** Niveaux d'entrée (INPUT / INPUT_PULLUP) pour une carte microcontrôleur. */
export function readMicroBoardDigitalInputs(board, components, wires, autoJunctions = []) {
    const inputs = {};
    const modes = board.pinModes || {};
    for (const [label, mode] of Object.entries(modes)) {
        if (mode !== "INPUT" && mode !== "INPUT_PULLUP") continue;
        const net = reachableJonctions(`${board.label}_${label}`, wires, autoJunctions);
        let value = 1;
        if (junctionNetReachesGnd(net)) value = 0;
        else if (junctionNetReachesHigh(net)) value = 1;
        for (const comp of components) {
            if (comp.type !== "push_button" && comp.type !== "switch_spdt") continue;
            const a = `${comp.label}_in`;
            const b = `${comp.label}_out`;
            const pinSide = net.has(a) ? a : net.has(b) ? b : null;
            if (!pinSide && comp.type === "switch_spdt") continue;
            if (comp.type === "push_button") {
                if (!pinSide) continue;
                const otherSide = pinSide === a ? b : a;
                const other = reachableJonctions(otherSide, wires, autoJunctions);
                if (junctionNetReachesGnd(other)) value = comp.state === 1 ? 0 : 1;
                else if (junctionNetReachesHigh(other)) value = comp.state === 1 ? 1 : 0;
            }
        }
        inputs[label] = value;
    }
    return inputs;
}
