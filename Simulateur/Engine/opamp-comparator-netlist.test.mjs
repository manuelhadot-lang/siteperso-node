/**
 * Vérifie que la netlist AOP convient aux comparateurs (simple, seuils, hystérésis câblée).
 * Exécution : node Simulateur/Engine/opamp-comparator-netlist.test.mjs
 */
import { buildNetlistFromGraphicalState } from "./schematic-to-spice.mjs";

const G = 50;

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

/** Comparateur simple : Vin+ > Vref → sortie haute. */
function simpleComparatorState() {
    return {
        components: [
            { id: "E1", type: "vsource", x: 0, y: 0, value: "5V", orient: 0 },
            { id: "R1", type: "resistor", x: 100, y: 0, value: "10k", orient: 0 },
            { id: "R2", type: "resistor", x: 100, y: 100, value: "10k", orient: 0 },
            { id: "U1", type: "opamp", x: 300, y: 50, value: "LM741", vp: 15, vn: -15, orient: 0 },
            { id: "Rload", type: "resistor", x: 500, y: 50, value: "10k", orient: 0 },
            { id: "V1", type: "voltmeter", x: 600, y: 50, value: "", orient: 0 },
        ],
        wires: [
            wire("E1#0", "R1#0", [
                [0, 25],
                [100, 25],
            ]),
            wire("E1#1", "R2#1", [
                [0, 125],
                [100, 125],
            ]),
            wire("R1#1", "U1#0", [
                [150, 25],
                [300, 25],
            ]),
            wire("R2#0", "U1#1", [
                [100, 75],
                [300, 75],
            ]),
            wire("U1#2", "Rload#0", [
                [500, 75],
                [500, 75],
            ]),
            wire("Rload#1", "E1#1", [
                [550, 75],
                [0, 125],
            ]),
            wire("Rload#0", "V1#0", [
                [500, 75],
                [600, 75],
            ]),
            wire("V1#1", "E1#1", [
                [600, 125],
                [0, 125],
            ]),
        ],
    };
}

/** Schmitt (hystérésis) : rétroaction R3 vers entrée +. */
function schmittComparatorState() {
    return {
        components: [
            { id: "E1", type: "vsource", x: 0, y: 0, value: "5V", orient: 0 },
            { id: "Sin1", type: "vsin", x: 0, y: 200, value: "2.5V 100Hz 2.5V", orient: 0 },
            { id: "U1", type: "opamp", x: 300, y: 100, value: "LM741", vp: 12, vn: -12, orient: 0 },
            { id: "R1", type: "resistor", x: 150, y: 100, value: "10k", orient: 0 },
            { id: "R2", type: "resistor", x: 150, y: 200, value: "10k", orient: 0 },
            { id: "R3", type: "resistor", x: 400, y: 50, value: "100k", orient: 0 },
            { id: "R4", type: "resistor", x: 400, y: 150, value: "10k", orient: 0 },
            { id: "Rload", type: "resistor", x: 550, y: 100, value: "10k", orient: 0 },
            { id: "Osc1", type: "oscilloscope", x: 700, y: 50, value: "", orient: 0, mirrorX: false },
        ],
        wires: [
            wire("Sin1#0", "R2#0", [
                [50, 225],
                [150, 125],
            ]),
            wire("Sin1#1", "E1#1", [
                [50, 275],
                [0, 275],
            ]),
            wire("E1#0", "R1#0", [
                [0, 25],
                [150, 25],
            ]),
            wire("E1#1", "R1#1", [
                [0, 275],
                [150, 275],
            ]),
            wire("R1#1", "U1#1", [
                [200, 125],
                [300, 125],
            ]),
            wire("R2#1", "U1#0", [
                [200, 225],
                [300, 125],
            ]),
            wire("U1#2", "R4#0", [
                [500, 125],
                [550, 125],
            ]),
            wire("R4#1", "Rload#0", [
                [600, 125],
                [550, 125],
            ]),
            wire("Rload#1", "E1#1", [
                [600, 175],
                [0, 275],
            ]),
            wire("U1#2", "R3#0", [
                [500, 125],
                [400, 75],
            ]),
            wire("R3#1", "U1#0", [
                [400, 125],
                [300, 125],
            ]),
            wire("U1#2", "Osc1#0", [
                [500, 125],
                [650, 125],
            ]),
            wire("Osc1#2", "E1#1", [
                [750, 275],
                [0, 275],
            ]),
        ],
    };
}

function wire(fromKey, toKey, points) {
    return { id: `W_${fromKey}_${toKey}`, solid: true, fromKey, toKey, points };
}

function runCase(name, state) {
    const r = buildNetlistFromGraphicalState(state, { gridStep: G });
    assert(r.ok, `${name}: build failed: ${(r.errors || []).join("; ")}`);
    const nl = r.netlist;
    assert(/BAOP_/.test(nl), `${name}: missing opamp B-source`);
    assert(/u\(/.test(nl) || /tanh\(/.test(nl), `${name}: opamp behavioral model expected`);
    assert(!/limit\(1e6/.test(nl), `${name}: old limit model should be replaced`);
    console.log(`OK ${name}`);
    if (r.warnings?.length) {
        for (const w of r.warnings) console.log(`  warn: ${w}`);
    }
    return r;
}

runCase("comparateur simple", simpleComparatorState());
const schmitt = runCase("comparateur hystérésis (câblage)", schmittComparatorState());
assert(schmitt.analysisTran === true, "Schmitt with sin+scope should use .tran");
assert(/u\(V\(/.test(schmitt.netlist) || /u\(0-/.test(schmitt.netlist), "Schmitt: hard step comparator model expected for positive feedback");

/** Amplificateur inverseur : rétroaction − via R1 → modèle tanh. */
function invertingAmpState() {
    return {
        components: [
            { id: "Sin1", type: "vsin", x: 0, y: 0, value: "5V 1kHz 0V", orient: 0 },
            { id: "R2", type: "resistor", x: 100, y: 0, value: "1k", orient: 0 },
            { id: "R1", type: "resistor", x: 200, y: -50, value: "1k", orient: 0 },
            { id: "AOP1", type: "opamp", x: 300, y: 0, value: "uA741", vp: 15, vn: -15, orient: 0 },
            { id: "Osci1", type: "oscilloscope", x: 500, y: 0, orient: 0 },
            { id: "GND1", type: "ground", x: 300, y: 100, orient: 0 },
        ],
        wires: [
            wire("Sin1#0", "R2#0", []),
            wire("Sin1#0", "Osci1#1", []),
            wire("Sin1#1", "GND1#0", []),
            wire("R2#1", "AOP1#1", []),
            wire("AOP1#0", "GND1#0", []),
            wire("AOP1#2", "R1#0", []),
            wire("R1#1", "AOP1#1", []),
            wire("AOP1#2", "Osci1#0", []),
            wire("Osci1#2", "GND1#0", []),
        ],
    };
}

/** Amplificateur non inverseur : rétroaction − via R1. */
function nonInvertingAmpState() {
    return {
        components: [
            { id: "Sin1", type: "vsin", x: 0, y: 0, value: "5V 1kHz 0V", orient: 0 },
            { id: "R2", type: "resistor", x: 200, y: 50, value: "1k", orient: 0 },
            { id: "R1", type: "resistor", x: 200, y: -50, value: "1k", orient: 0 },
            { id: "AOP1", type: "opamp", x: 300, y: 0, value: "uA741", vp: 15, vn: -15, orient: 0 },
            { id: "Osci1", type: "oscilloscope", x: 500, y: 0, orient: 0 },
            { id: "GND1", type: "ground", x: 300, y: 100, orient: 0 },
        ],
        wires: [
            wire("Sin1#0", "AOP1#0", []),
            wire("Sin1#0", "Osci1#1", []),
            wire("Sin1#1", "GND1#0", []),
            wire("AOP1#1", "R2#0", []),
            wire("R2#1", "GND1#0", []),
            wire("AOP1#2", "R1#0", []),
            wire("R1#1", "AOP1#1", []),
            wire("AOP1#2", "Osci1#0", []),
            wire("Osci1#2", "GND1#0", []),
        ],
    };
}

const inv = runCase("amplificateur inverseur", invertingAmpState());
assert(/tanh\(/.test(inv.netlist), "Inverseur: modèle tanh (linéaire) attendu");
assert(!/u\(0-/.test(inv.netlist.split("BAOP")[1] || ""), "Inverseur: pas de comparateur u()");

const nonInv = runCase("amplificateur non inverseur", nonInvertingAmpState());
assert(/tanh\(/.test(nonInv.netlist), "Non-inverseur: modèle tanh attendu");

console.log("Tous les tests netlist AOP comparateur ont réussi.");
