/**
 * Génère pont-diode-double-alternance.json et valide la netlist.
 * node Simulateur/Engine/build-bridge-json.mjs
 */
import { writeFileSync } from "fs";
import { join } from "path";
import { buildNetlistFromGraphicalState } from "./schematic-to-spice.mjs";

const GRID = 20;
const snap = (v) => Math.round(v / GRID) * GRID;

function jonctions(comp) {
    const rad = ((comp.rotation || 0) * Math.PI) / 180;
    const local = [];
    const label = comp.label;
    if (comp.type === "gsin") {
        local.push({ id: `${label}_in`, x: 0, y: 40 });
        local.push({ id: `${label}_out`, x: 40, y: 0 });
    } else if (comp.type === "gnd") {
        local.push({ id: `${label}_out`, x: GRID, y: 0 });
    } else if (comp.type === "diode") {
        local.push({ id: `${label}_in`, x: -40, y: 0 });
        local.push({ id: `${label}_out`, x: 40, y: 0 });
    } else if (["resistor", "capacitor", "voltmeter"].includes(comp.type)) {
        local.push({ id: `${label}_in`, x: -40, y: 0 });
        local.push({ id: `${label}_out`, x: 40, y: 0 });
    } else if (comp.type === "oscilloscope") {
        local.push({ id: `${label}_CH1`, x: -60, y: -20 });
        local.push({ id: `${label}_CH2`, x: -60, y: 20 });
        local.push({ id: `${label}_GND`, x: 0, y: 60 });
    }
    const out = {};
    for (const pt of local) {
        let lx = pt.x;
        let ly = pt.y;
        if (!["gsin", "oscilloscope"].includes(comp.type)) {
            const rx = lx * Math.cos(rad) - ly * Math.sin(rad);
            const ry = lx * Math.sin(rad) + ly * Math.cos(rad);
            lx = rx;
            ly = ry;
        }
        out[pt.id] = { x: snap(comp.x + lx), y: snap(comp.y + ly) };
    }
    return out;
}

function wire(fromId, toId, jmap, extra = []) {
    const a = jmap[fromId];
    const b = jmap[toId];
    const pts = [{ x: a.x, y: a.y }, ...extra, { x: b.x, y: b.y }];
    return { fromJonctionId: fromId, toJonctionId: toId, points: pts };
}

const components = [
    { type: "gsin", label: "Sin_1", x: 0, y: 120, rotation: 0, peakAmplitude: 5, frequency: 50, offset: 0 },
    { type: "gnd", label: "GND_1", x: 0, y: 200, rotation: 0 },
    { type: "diode", label: "D_1", x: 240, y: 110, rotation: -90, value: "1N4007" },
    { type: "diode", label: "D_2", x: 200, y: 110, rotation: -90, value: "1N4007" },
    { type: "diode", label: "D_3", x: 240, y: 170, rotation: -90, value: "1N4007" },
    { type: "diode", label: "D_4", x: 200, y: 170, rotation: -90, value: "1N4007" },
    { type: "resistor", label: "R_1", x: 360, y: 120, rotation: 90, value: "1k" },
    { type: "capacitor", label: "C_1", x: 360, y: 180, rotation: 0, value: "100u" },
    { type: "voltmeter", label: "V_1", x: 420, y: 150, rotation: 90, value: "" },
    { type: "oscilloscope", label: "Osci_1", x: 520, y: 140, rotation: 0, timeDivSec: 0.005, ch1VoltsPerDiv: 2, ch2VoltsPerDiv: 2 },
];

const jmap = {};
for (const c of components) Object.assign(jmap, jonctions(c));

// Nœuds communs (jonctions auto sur bus)
const autoJunctions = [
    { id: "__t#120#140", x: 120, y: 140 }, // A (Sin+)
    { id: "__t#120#180", x: 120, y: 180 }, // B (Sin- / GND AC)
    { id: "__t#300#80", x: 300, y: 80 },   // V+
    { id: "__t#300#200", x: 300, y: 200 }, // V- (flottante)
];
jmap["__t#120#140"] = { x: 120, y: 140 };
jmap["__t#120#180"] = { x: 120, y: 180 };
jmap["__t#300#80"] = { x: 300, y: 80 };
jmap["__t#300#200"] = { x: 300, y: 200 };

const wires = [
    // Entrée AC + masse SPICE (Sin- = GND)
    wire("Sin_1_out", "__t#120#140", jmap),
    wire("Sin_1_in", "GND_1_out", jmap),
    wire("GND_1_out", "__t#120#180", jmap),
    // Pont : D1 A→V+, D2 B→V+, D3 V-→A, D4 V-→B
    wire("__t#120#140", "D_1_in", jmap),
    wire("D_1_out", "__t#300#80", jmap),
    wire("__t#120#180", "D_2_in", jmap),
    wire("D_2_out", "__t#300#80", jmap, [{ x: 200, y: 80 }]),
    wire("__t#300#200", "D_3_in", jmap),
    wire("D_3_out", "__t#120#140", jmap),
    wire("__t#300#200", "D_4_in", jmap),
    wire("D_4_out", "__t#120#180", jmap),
    // Charge R//C entre V+ et V- (masse flottante côté V-)
    wire("__t#300#80", "R_1_in", jmap),
    wire("R_1_out", "__t#300#200", jmap),
    wire("__t#300#80", "C_1_in", jmap, [{ x: 340, y: 80 }]),
    wire("C_1_out", "__t#300#200", jmap, [{ x: 340, y: 200 }]),
    // Voltmètre sur la charge (V+ / V-)
    wire("__t#300#80", "V_1_in", jmap, [{ x: 380, y: 80 }]),
    wire("V_1_out", "__t#300#200", jmap, [{ x: 380, y: 200 }]),
    // Oscilloscope : GND = référence AC, CH1 = V+, CH2 = V-
    wire("Osci_1_GND", "__t#120#180", jmap, [{ x: 520, y: 180 }]),
    wire("__t#300#80", "Osci_1_CH1", jmap, [{ x: 460, y: 80 }, { x: 460, y: 120 }]),
    wire("__t#300#200", "Osci_1_CH2", jmap, [{ x: 460, y: 200 }, { x: 460, y: 160 }]),
];

const counters = {
    battery: 0, resistor: 1, capacitor: 1, inductor: 0, diode: 4, npn: 0, opamp: 0,
    not: 0, and: 0, nand: 0, or: 0, nor: 0, xor: 0, xnor: 0, d_flipflop: 0, jk_flipflop: 0,
    cd4511: 0, ic_74hc90: 0, led: 0, seg7: 0, voltmeter: 1, ammeter: 0, ohmmeter: 0,
    oscilloscope: 1, bode_analyzer: 0, junction: 0, gnd: 1, vcc: 0, logic_terminal: 0,
    gimp: 0, gsin: 1, gsqr: 0,
};

const json = { components, wires, autoJunctions, counters };

// Validation netlist (format moteur)
const simComponents = components.map((c) => ({
    id: c.label,
    type: c.type === "gsin" ? "vsin" : c.type === "gnd" ? "ground" : c.type,
    x: c.x,
    y: c.y,
    rotation: c.rotation || 0,
    value:
        c.type === "gsin"
            ? `${c.peakAmplitude}V ${c.frequency}Hz ${c.offset}V`
            : c.value,
    ...(c.type === "oscilloscope"
        ? {
              timeDivSec: c.timeDivSec,
              ch1VoltsPerDiv: c.ch1VoltsPerDiv,
              ch2VoltsPerDiv: c.ch2VoltsPerDiv,
          }
        : {}),
}));

const jonctionToKey = (jid) => {
    if (jid.startsWith("__t#")) return jid;
    const m = jid.match(/^(.+)_(in|out|CH1|CH2|GND)$/);
    if (!m) return null;
    const [, label, pin] = m;
    const comp = components.find((c) => c.label === label);
    if (!comp) return null;
    if (pin === "in") return `${label}#0`;
    if (pin === "out") return `${label}#1`;
    if (pin === "CH1") return `${label}#0`;
    if (pin === "CH2") return `${label}#1`;
    if (pin === "GND") return `${label}#2`;
    return null;
};

const simWires = wires
    .map((w) => ({
        solid: true,
        fromKey: jonctionToKey(w.fromJonctionId),
        toKey: jonctionToKey(w.toJonctionId),
        points: w.points,
    }))
    .filter((w) => w.fromKey && w.toKey);

const built = buildNetlistFromGraphicalState({ components: simComponents, wires: simWires });
if (!built.ok) {
    console.error("Netlist FAILED:", built.errors);
    process.exit(1);
}
if (!built.analysisTran) {
    console.error("Expected .tran analysis");
    process.exit(1);
}

const outPath = join(import.meta.dirname, "..", "circuits", "pont-diode-double-alternance.json");
writeFileSync(outPath, JSON.stringify(json, null, 4), "utf8");
console.log("Written:", outPath);
console.log("Netlist OK — diodes:", (built.netlist.match(/^D/gim) || []).length);
