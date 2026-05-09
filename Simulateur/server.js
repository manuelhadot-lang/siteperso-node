import express from "express";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_TAG } from "./Engine/v2/spice-compiler.js";
import { buildNgspiceDeck } from "./Engine/spice-netlist-v2.js";
import { runNgspice } from "./Engine/v2/ngspice-runner.js";
import { mergeVoltmeterMeasurements } from "./Engine/v2/result-parser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: "2mb" }));
app.use(express.static(__dirname));

app.get("/api/version", (req, res) => {
    res.json({
        ok: true,
        service: "simulateur-standalone",
        simEngineBuildTag: BUILD_TAG,
        pid: process.pid
    });
});

app.post("/api/simulate", async (req, res) => {
    const state = req.body?.state;
    const gs = Number(req.body?.gridStep);
    const deckOpts = Number.isFinite(gs) && gs > 0 ? { gridStep: gs } : {};
    const built = buildNgspiceDeck(state, deckOpts);

    if (!built.ok) {
        res.status(400).json({
            ok: false,
            phase: "build",
            errors: built.errors,
            warnings: built.warnings,
            netlist: built.netlist,
            diagnostics: built.diagnostics || null
        });
        return;
    }

    const tempDir = await mkdtemp(path.join(os.tmpdir(), "sim-ngspice-"));
    const netlistPath = path.join(tempDir, "circuit.cir");
    const outputPath = path.join(tempDir, "ngspice.log");

    try {
        await writeFile(netlistPath, built.netlist, "utf8");
        const runResult = await runNgspice(netlistPath, outputPath);
        let log = "";
        try {
            log = await readFile(outputPath, "utf8");
        } catch {
            //
        }
        const combinedLog = [log, runResult.stdout || "", runResult.stderr || ""]
            .filter((s) => typeof s === "string" && s.trim().length > 0)
            .join("\n");
        const voltmeterValues = mergeVoltmeterMeasurements(combinedLog, built.voltmeters, built.nodeMeasures || []);

        res.json({
            ok: true,
            warnings: built.warnings,
            netlist: built.netlist,
            log: combinedLog || log,
            voltmeterValues,
            diagnostics: built.diagnostics || null
        });
    } catch (error) {
        const missing = /not recognized|ENOENT|introuvable|spawn/i.test(error?.message || "");
        res.status(500).json({
            ok: false,
            phase: "run",
            errors: [
                missing
                    ? "ngspice introuvable : installe ngspice et ajoute-le au PATH."
                    : "Echec d'execution ngspice."
            ],
            warnings: built.warnings,
            netlist: built.netlist,
            diagnostics: built.diagnostics || null,
            details: { message: error?.message || "" }
        });
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

app.listen(PORT, () => {
    console.log(`Simulateur pret: http://localhost:${PORT}`);
});
