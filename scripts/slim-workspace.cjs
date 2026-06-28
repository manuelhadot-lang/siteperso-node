"use strict";
/**
 * Allège le dossier de travail en supprimant ce qui est régénérable.
 * Les cores Arduino restent dans %USERPROFILE%\.simulateur-h\arduino-data
 * après un premier lancement Simulateur H ou npm run prepare-arduino-bundle.
 *
 *   node scripts/slim-workspace.cjs          # aperçu
 *   node scripts/slim-workspace.cjs --apply   # suppression
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const ROOT = path.join(__dirname, "..");
const apply = process.argv.includes("--apply");

const TARGETS = [
    {
        rel: path.join("Simulateur", "arduino-data", "packages"),
        label: "Toolchains Arduino (AVR + ESP32) — copie locale du seed",
        hint: "Conservés dans ~/.simulateur-h/arduino-data après premier lancement.",
    },
    {
        rel: path.join("Simulateur", "arduino-data", "staging"),
        label: "Cache staging arduino-cli",
    },
    {
        rel: path.join("Simulateur", "arduino-data", "tmp"),
        label: "Fichiers temporaires arduino-cli",
    },
    {
        rel: path.join("Simulateur", "arduino-data", "library"),
        label: "Bibliothèques installées par arduino-cli (Library Manager)",
    },
    {
        rel: path.join("Simulateur", "arduino-data", ".cache"),
        label: "Cache arduino-cli",
    },
    {
        rel: path.join("SimulateurH", "dist-out"),
        label: "Installateurs Electron déjà compilés",
        hint: "Regénérer avec npm run simulateur-h:build",
    },
];

function dirSizeBytes(dir) {
    let total = 0;
    if (!fs.existsSync(dir)) return 0;
    const stack = [dir];
    while (stack.length) {
        const cur = stack.pop();
        let entries;
        try {
            entries = fs.readdirSync(cur, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const ent of entries) {
            const p = path.join(cur, ent.name);
            if (ent.isDirectory()) stack.push(p);
            else if (ent.isFile()) {
                try {
                    total += fs.statSync(p).size;
                } catch {
                    /* ignore */
                }
            }
        }
    }
    return total;
}

function fmt(bytes) {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} Go`;
    if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} Mo`;
    return `${Math.round(bytes / 1024)} Ko`;
}

const userArduino = path.join(os.homedir(), ".simulateur-h", "arduino-data", "packages");
const hasUserPackages = fs.existsSync(userArduino);

let freed = 0;
const lines = [];

for (const t of TARGETS) {
    const abs = path.join(ROOT, t.rel);
    if (!fs.existsSync(abs)) continue;
    const size = dirSizeBytes(abs);
    if (size <= 0) continue;
    freed += size;
    lines.push(`  • ${t.label}: ${fmt(size)}  (${t.rel})`);
    if (t.hint) lines.push(`      → ${t.hint}`);
    if (apply) {
        fs.rmSync(abs, { recursive: true, force: true });
    }
}

const indexFiles = [
    path.join(ROOT, "Simulateur", "arduino-data", "library_index.json"),
    path.join(ROOT, "Simulateur", "arduino-data", "library_index.json.sig"),
    path.join(ROOT, "Simulateur", "arduino-data", "package_index.json"),
    path.join(ROOT, "Simulateur", "arduino-data", "package_index.json.sig"),
];
for (const f of indexFiles) {
    if (!fs.existsSync(f)) continue;
    const size = fs.statSync(f).size;
    freed += size;
    lines.push(`  • Index Arduino (${path.basename(f)}): ${fmt(size)}`);
    if (apply) fs.rmSync(f, { force: true });
}

console.log(apply ? "=== Allègement appliqué ===\n" : "=== Espace récupérable (aperçu) ===\n");
if (!lines.length) {
    console.log("Rien à supprimer — le workspace est déjà allégé.");
} else {
    for (const l of lines) console.log(l);
    console.log(`\nTotal : ~${fmt(freed)}`);
    if (!apply) {
        console.log("\nPour supprimer : node scripts/slim-workspace.cjs --apply");
    }
}

if (!hasUserPackages) {
    console.log(
        "\n⚠️  Pas de cores dans ~/.simulateur-h/arduino-data/packages.\n" +
            "   Après allègement, lancez une fois :\n" +
            "     npm run prepare-arduino-bundle\n" +
            "   ou ouvrez Simulateur H (téléchargement au premier lancement si le seed contient les cores)."
    );
} else {
    console.log("\n✓ Cores Arduino présents dans ~/.simulateur-h (compilation OK sans la copie locale).");
}

const homeSize = dirSizeBytes(path.join(os.homedir(), ".simulateur-h"));
if (homeSize > 0) {
    console.log(
        `\nNote : ~/.simulateur-h occupe encore ~${fmt(homeSize)} (hors dépôt git).\n` +
            "       C'est normal : une seule copie des toolchains pour Simulateur H."
    );
}
