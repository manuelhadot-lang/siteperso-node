/**
 * Valide tous les circuits du dossier exemples/ (JSON, fils, netlist SPICE, sketches Arduino).
 * Usage : node Simulateur/Engine/exemples-circuits.test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildNetlistFromGraphicalState } from "./schematic-to-spice.mjs";
import {
    createArduinoRuntime,
    parseArduinoSketch,
    sketchUsesLiveInput,
} from "./arduino-sketch-parse.mjs";
import { readMicroBoardDigitalInputs } from "./arduino-live-inputs.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const examplesDir = path.join(repoRoot, "exemples");

const { buildSimStateFromCircuit, jonctionIdToTerminalKey } = await import(
    pathToFileURL(path.join(repoRoot, "Simulateur", "circuit-sim-state.js")).href
);

const BOARD_TYPES = new Set(["arduino_uno", "esp32_c3", "esp32_devkit", "esp32_upesy_lp"]);

function listExampleFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...listExampleFiles(p));
        else if (entry.name.toLowerCase().endsWith(".json")) out.push(p);
    }
    return out.sort();
}

function loadCircuit(filePath) {
    const rel = path.relative(examplesDir, filePath).replace(/\\/g, "/");
    const raw = fs.readFileSync(filePath, "utf8");
    let data;
    try {
        data = JSON.parse(raw.replace(/^\uFEFF/, "").trim());
    } catch (e) {
        throw new Error(`JSON invalide : ${e.message}`);
    }
    if (!Array.isArray(data.components)) throw new Error("components manquant");
    return { rel, data };
}

function validateWires(data) {
    const components = data.components || [];
    const auto = data.autoJunctions || [];
    const issues = [];
    for (const w of data.wires || []) {
        for (const end of [w.fromJonctionId, w.toJonctionId]) {
            if (!jonctionIdToTerminalKey(end, components, auto)) {
                issues.push(`jonction non reconnue : ${end}`);
            }
        }
    }
    return issues;
}

function validateNetlist(data) {
    try {
        const sim = buildSimStateFromCircuit(data);
        if (sim.droppedWires > 0) {
            return `${sim.droppedWires} fil(s) ignoré(s) à la conversion SPICE`;
        }
        const built = buildNetlistFromGraphicalState(sim);
        if (!built?.netlist || String(built.netlist).trim().length < 10) {
            return "netlist vide";
        }
        return null;
    } catch (e) {
        return e?.message || String(e);
    }
}

function validateArduinoBoards(data) {
    const issues = [];
    for (const comp of data.components) {
        if (!BOARD_TYPES.has(comp.type) || !comp.sketch) continue;
        try {
            parseArduinoSketch(comp.sketch);
            createArduinoRuntime(comp);
        } catch (e) {
            issues.push(`sketch ${comp.label} : ${e?.message || e}`);
            continue;
        }
        if (/pinMode\s*\(\s*touche\s*,/i.test(comp.sketch) && !/const\s+int\s+touche|int\s+touche\s*=\s*13/.test(comp.sketch)) {
            issues.push(`sketch ${comp.label} : pinMode(touche) sans initialisation`);
        }
        if (sketchUsesLiveInput(comp.sketch)) {
            const rt = createArduinoRuntime(comp);
            if (rt.state?.regs?.DDRD === 14) {
                issues.push(`sketch ${comp.label} : DDRD=14 (D0 en entrée au lieu de sortie BCD)`);
            }
            const buttons = data.components.filter((c) => c.type === "push_button");
            if (buttons.length) {
                const readPins = [...comp.sketch.matchAll(/\bdigitalRead\s*\(\s*(\d+)\s*\)/gi)].map((m) => Number(m[1]));
                for (const pin of readPins) {
                    const label = comp.type === "arduino_uno" ? `D${pin}` : `GPIO${pin}`;
                    const released = readMicroBoardDigitalInputs(comp, data.components, data.wires || [], data.autoJunctions || []);
                    const pressed = readMicroBoardDigitalInputs(
                        comp,
                        data.components.map((c) => (c.type === "push_button" ? { ...c, state: 1 } : c)),
                        data.wires || [],
                        data.autoJunctions || []
                    );
                    if (released[label] !== 1) {
                        issues.push(`${comp.label} ${label} : HIGH attendu bouton relâché (lu ${released[label]})`);
                    }
                    if (pressed[label] !== 0) {
                        issues.push(`${comp.label} ${label} : LOW attendu bouton appuyé (lu ${pressed[label]})`);
                    }
                }
            }
        }
    }
    return issues;
}

const files = listExampleFiles(examplesDir);
assert.ok(files.length > 0, "aucun exemple trouvé");

const failures = [];

for (const file of files) {
    const { rel, data } = loadCircuit(file);
    const fileIssues = [
        ...validateWires(data),
        ...validateArduinoBoards(data),
    ];
    const nl = validateNetlist(data);
    if (nl) fileIssues.push(`netlist : ${nl}`);

    if (fileIssues.length) failures.push({ rel, issues: fileIssues });
}

if (failures.length) {
    console.error(`\n${failures.length} circuit(s) avec problème(s) sur ${files.length} :\n`);
    for (const f of failures) {
        console.error(`  ${f.rel}`);
        for (const i of f.issues) console.error(`    - ${i}`);
    }
    process.exit(1);
}

console.log(`exemples-circuits.test.mjs OK — ${files.length} circuits validés`);
