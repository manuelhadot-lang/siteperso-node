"use strict";
/**
 * Répare l'installation esp-rv32 sur Windows : copie les en-têtes
 * cibles (riscv32-esp-elf/bits/*) vers include/c++/14.2.0/bits/
 * quand c++config.h est absent (copie seed Simulateur H).
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

function repairEspRv32Tree(espRv32Root) {
    const cxxRoot = path.join(espRv32Root, "riscv32-esp-elf", "include", "c++", "14.2.0");
    const srcBits = path.join(cxxRoot, "riscv32-esp-elf", "bits");
    const destBits = path.join(cxxRoot, "bits");
    const marker = path.join(destBits, "c++config.h");

    if (!fs.existsSync(srcBits)) {
        return { ok: false, reason: "dossier source introuvable", root: espRv32Root };
    }
    if (fs.existsSync(marker)) {
        return { ok: true, repaired: false, root: espRv32Root };
    }

    fs.mkdirSync(destBits, { recursive: true });
    let copied = 0;
    for (const name of fs.readdirSync(srcBits)) {
        const src = path.join(srcBits, name);
        const dest = path.join(destBits, name);
        if (!fs.statSync(src).isFile()) continue;
        if (!fs.existsSync(dest)) {
            fs.copyFileSync(src, dest);
            copied++;
        }
    }
    return { ok: true, repaired: true, copied, root: espRv32Root };
}

function repairArduinoData(dataDir) {
    const toolRoot = path.join(dataDir, "packages", "esp32", "tools", "esp-rv32", "2601");
    if (!fs.existsSync(toolRoot)) {
        return { ok: false, reason: "esp-rv32 2601 introuvable", dataDir };
    }
    const main = repairEspRv32Tree(toolRoot);
    const picolibcRoot = path.join(toolRoot, "picolibc");
    const picolibc = fs.existsSync(picolibcRoot) ? repairEspRv32Tree(picolibcRoot) : null;
    return { dataDir, main, picolibc };
}

function defaultDataDirs() {
    const dirs = [path.join(os.homedir(), ".simulateur-h", "arduino-data")];
    const repo = path.join(__dirname, "..");
    dirs.push(path.join(repo, "Simulateur", "arduino-data"));
    return [...new Set(dirs)];
}

if (require.main === module) {
    const targets = process.argv.slice(2).length ? process.argv.slice(2) : defaultDataDirs();
    let any = false;
    for (const dir of targets) {
        if (!fs.existsSync(dir)) {
            console.log("⊘ ignoré (absent) :", dir);
            continue;
        }
        const res = repairArduinoData(dir);
        any = true;
        if (!res.main.ok) {
            console.log("✗", dir, res.main.reason || "échec");
            continue;
        }
        if (res.main.repaired) {
            console.log(`✓ réparé : ${dir} (${res.main.copied} fichiers bits copiés)`);
        } else {
            console.log("✓ déjà OK :", dir);
        }
    }
    if (!any) console.log("Aucun dossier arduino-data trouvé.");
}

module.exports = { repairArduinoData, repairEspRv32Tree };
