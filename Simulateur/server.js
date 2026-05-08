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

function parseVoltMeasurements(log, voltmeters = []) {
    const byRef = {};
    for (const meter of voltmeters) {
        const escapedName = String(meter.measureName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`${escapedName}\\s*=\\s*([+-]?\\d*\\.?\\d+(?:[eE][+-]?\\d+)?)`, "i");
        const match = re.exec(log);
        if (!match) {
            continue;
        }
        const value = Number.parseFloat(match[1]);
        if (Number.isFinite(value)) {
            byRef[meter.reference] = value;
        }
    }
    return byRef;
}

function parseNodeVoltages(log) {
    const byNode = {};
    const numberRe = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;

    // Format explicite: v(node)=value
    const explicitRegex = /v\(\s*([^)]+?)\s*\)\s*=\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/gi;
    let explicit;
    while ((explicit = explicitRegex.exec(log)) !== null) {
        const nodeName = String(explicit[1] || "").trim().toLowerCase();
        const value = Number.parseFloat(explicit[2]);
        if (nodeName && Number.isFinite(value)) {
            byNode[nodeName] = value;
        }
    }

    const lines = String(log || "").split(/\r?\n/);

    // Format "Operating Point" classique: "<node> <value>"
    for (const line of lines) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*$/);
        if (!m) {
            continue;
        }
        const nodeName = m[1].toLowerCase();
        const value = Number.parseFloat(m[2]);
        if (Number.isFinite(value)) {
            byNode[nodeName] = value;
        }
    }

    // Format table .print op :
    // "Index   v(n1)   v(n2)"
    // "0       2.5     5"
    for (let i = 0; i < lines.length - 1; i += 1) {
        const header = lines[i];
        if (!/\bindex\b/i.test(header) || !/v\(/i.test(header)) {
            continue;
        }
        const valueLine = lines[i + 1] || "";
        const headerMatches = [...header.matchAll(/v\(\s*([^)]+?)\s*\)/gi)];
        if (headerMatches.length === 0) {
            continue;
        }
        const nums = valueLine.match(new RegExp(numberRe.source, "g")) || [];
        // 1re colonne = index, puis les tensions
        if (nums.length < headerMatches.length + 1) {
            continue;
        }
        for (let k = 0; k < headerMatches.length; k += 1) {
            const nodeName = String(headerMatches[k][1] || "").trim().toLowerCase();
            const value = Number.parseFloat(nums[k + 1]);
            if (nodeName && Number.isFinite(value)) {
                byNode[nodeName] = value;
            }
        }
    }

    return byNode;
}

function mergeVoltmeterMeasurements(log, voltmeters = []) {
    const directValues = parseVoltMeasurements(log, voltmeters);
    const nodeVoltages = parseNodeVoltages(log);
    const merged = { ...directValues };

    for (const meter of voltmeters) {
        if (Number.isFinite(merged[meter.reference])) {
            continue;
        }
        const nPlus = String(meter.nPlus || "").toLowerCase();
        const nMinus = String(meter.nMinus || "").toLowerCase();
        if (!(nPlus in nodeVoltages) || !(nMinus in nodeVoltages)) {
            continue;
        }
        const computed = nodeVoltages[nPlus] - nodeVoltages[nMinus];
        if (Number.isFinite(computed)) {
            merged[meter.reference] = computed;
        }
    }
    return merged;
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
        const runResult = await runNgspice(netlistPath, outputPath);
        let log = "";
        try {
            log = await readFile(outputPath, "utf8");
        } catch {
            // Certaines variantes/runtime d'ngspice peuvent ne pas ecrire le log attendu.
        }
        const combinedLog = [log, runResult.stdout || "", runResult.stderr || ""]
            .filter((part) => typeof part === "string" && part.trim().length > 0)
            .join("\n");
        const voltmeterValues = mergeVoltmeterMeasurements(combinedLog, built.voltmeters);
        res.json({
            ok: true,
            warnings: built.warnings,
            netlist: built.netlist,
            log: combinedLog || log,
            voltmeterValues
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
