import express from "express";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildNgspiceDeck } from "./Engine/spice-netlist.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "2mb" }));
app.use(express.static(__dirname));

function runNgspice(netlistPath, outputPath) {
    return new Promise((resolve, reject) => {
        execFile(
            "ngspice",
            ["-b", "-o", outputPath, netlistPath],
            { windowsHide: true, timeout: 25000, maxBuffer: 8 * 1024 * 1024 },
            (error, stdout, stderr) => {
                if (error) {
                    reject({
                        message: error.message,
                        code: error.code,
                        stdout: stdout || "",
                        stderr: stderr || ""
                    });
                    return;
                }
                resolve({ stdout: stdout || "", stderr: stderr || "" });
            }
        );
    });
}

app.post("/api/simulate", async (req, res) => {
    const state = req.body?.state;
    const built = buildNgspiceDeck(state);
    if (!built.ok) {
        res.status(400).json({
            ok: false,
            phase: "build",
            errors: built.errors,
            warnings: built.warnings,
            netlist: built.netlist
        });
        return;
    }

    const tempDir = await mkdtemp(path.join(os.tmpdir(), "sim-ngspice-"));
    const netlistPath = path.join(tempDir, "circuit.cir");
    const outputPath = path.join(tempDir, "ngspice.log");

    try {
        await writeFile(netlistPath, built.netlist, "utf8");
        await runNgspice(netlistPath, outputPath);
        const log = await readFile(outputPath, "utf8");
        res.json({
            ok: true,
            warnings: built.warnings,
            netlist: built.netlist,
            log
        });
    } catch (error) {
        const missing = /not recognized|ENOENT|introuvable/i.test(error?.message || "");
        res.status(500).json({
            ok: false,
            phase: "run",
            errors: [
                missing
                    ? "ngspice introuvable. Installe-le puis ajoute-le au PATH systeme."
                    : "Echec d'execution ngspice."
            ],
            warnings: built.warnings,
            netlist: built.netlist,
            details: {
                message: error?.message || "",
                stdout: error?.stdout || "",
                stderr: error?.stderr || ""
            }
        });
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

app.listen(PORT, () => {
    console.log(`Simulateur pret: http://localhost:${PORT}`);
});
