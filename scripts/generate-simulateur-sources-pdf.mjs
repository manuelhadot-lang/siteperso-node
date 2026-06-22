#!/usr/bin/env node
/**
 * Génère docs/Simulateur-Source-Complet.pdf — listing de tout le code source (hors tests).
 * Usage : node scripts/generate-simulateur-sources-pdf.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const htmlPath = path.join(root, "docs", "simulateur-source-complet.html");
const pdfPath = path.join(root, "docs", "Simulateur-Source-Complet.pdf");

const ROOT_DIRS = [
    { dir: "Simulateur", exts: [".js", ".mjs", ".html", ".css"] },
    { dir: path.join("Simulateur", "Engine"), exts: [".mjs"], recursive: true },
    { dir: "SimulateurH", exts: [".js", ".cjs"] },
    {
        dir: "tools",
        exts: [".cjs"],
        names: [
            "simulate-engine-loader.cjs",
            "ngspice-bundle.cjs",
            "arduino-api.cjs",
            "arduino-routes.cjs",
            "read-json-safe.cjs",
            "check-ngspice.cjs",
        ],
    },
];

function isTestFile(name) {
    return /\.test\.(mjs|js)$/i.test(name) || name.endsWith(".test.cjs");
}

function collectFiles() {
    const seen = new Set();
    const out = [];

    function add(abs, rel) {
        const key = rel.replace(/\\/g, "/").toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ abs, rel: rel.replace(/\\/g, "/") });
    }

    for (const spec of ROOT_DIRS) {
        const base = path.join(root, spec.dir);
        if (!fs.existsSync(base)) continue;

        if (spec.names) {
            for (const name of spec.names) {
                const abs = path.join(base, name);
                if (fs.existsSync(abs)) add(abs, path.join(spec.dir, name));
            }
            continue;
        }

        function walk(dir, relPrefix) {
            for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
                const abs = path.join(dir, ent.name);
                const rel = path.join(relPrefix, ent.name);
                if (ent.isDirectory()) {
                    if (spec.recursive && ent.name !== "node_modules") walk(abs, rel);
                    continue;
                }
                if (isTestFile(ent.name)) continue;
                const ext = path.extname(ent.name).toLowerCase();
                if (!spec.exts.includes(ext)) continue;
                add(abs, rel);
            }
        }
        walk(base, spec.dir);
    }

    out.sort((a, b) => a.rel.localeCompare(b.rel, "fr"));
    return out;
}

function escapeHtml(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function countLines(text) {
    if (!text.length) return 0;
    return text.split(/\r?\n/).length;
}

function buildHtml(files) {
    let totalLines = 0;
    const sections = files.map(({ abs, rel }) => {
        const raw = fs.readFileSync(abs, "utf8");
        const lines = raw.split(/\r?\n/);
        totalLines += lines.length;
        const numbered = lines
            .map((line, i) => {
                const n = String(i + 1).padStart(5, " ");
                return `<tr><td class="ln">${n}</td><td class="lc">${escapeHtml(line) || " "}</td></tr>`;
            })
            .join("\n");
        return { rel, lineCount: lines.length, numbered };
    });

    const toc = sections
        .map(
            (s) =>
                `<li><a href="#f-${s.rel.replace(/[^a-zA-Z0-9]/g, "-")}">${escapeHtml(s.rel)}</a> <span class="lcnt">(${s.lineCount} lignes)</span></li>`
        )
        .join("\n");

    const body = sections
        .map((s) => {
            const id = `f-${s.rel.replace(/[^a-zA-Z0-9]/g, "-")}`;
            return `<section class="file" id="${id}">
<h2>${escapeHtml(s.rel)} <span class="lcnt">— ${s.lineCount} lignes</span></h2>
<table class="code"><tbody>
${s.numbered}
</tbody></table>
</section>`;
        })
        .join("\n");

    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Simulateur — Source complet</title>
<style>
  @page { size: A4; margin: 12mm 10mm; }
  body { font-family: Consolas, "Courier New", monospace; font-size: 6.5pt; line-height: 1.25; color: #111; margin: 0; padding: 0; }
  .cover { font-family: "Segoe UI", Arial, sans-serif; text-align: center; padding: 30mm 10mm; page-break-after: always; }
  .cover h1 { font-size: 18pt; color: #0d47a1; }
  .cover p { font-size: 10pt; color: #444; }
  .toc { font-family: "Segoe UI", Arial, sans-serif; font-size: 9pt; page-break-after: always; padding: 8mm; }
  .toc h2 { font-size: 14pt; color: #1565c0; }
  .toc ol { columns: 2; column-gap: 8mm; padding-left: 18px; }
  .toc li { break-inside: avoid; margin: 2px 0; }
  .toc a { color: #1565c0; text-decoration: none; font-family: Consolas, monospace; font-size: 8pt; }
  .lcnt { color: #888; font-weight: normal; font-size: 8pt; }
  section.file { page-break-before: always; }
  section.file h2 { font-family: "Segoe UI", Arial, sans-serif; font-size: 9pt; color: #c62828; background: #f5f5f5; padding: 4px 6px; margin: 0 0 4px; border-left: 3px solid #c62828; }
  table.code { width: 100%; border-collapse: collapse; table-layout: fixed; }
  td.ln { width: 9mm; color: #999; text-align: right; padding-right: 3px; vertical-align: top; user-select: none; border-right: 1px solid #ddd; }
  td.lc { white-space: pre-wrap; word-break: break-all; padding-left: 4px; vertical-align: top; }
  tr:nth-child(even) td.lc { background: #fafafa; }
</style>
</head>
<body>
<div class="cover">
  <h1>Simulateur de Circuits — Code source complet</h1>
  <p>Listing intégral de tous les fichiers de production (hors tests)</p>
  <p><strong>${files.length}</strong> fichiers · <strong>${totalLines.toLocaleString("fr-FR")}</strong> lignes</p>
  <p>Généré le ${new Date().toLocaleDateString("fr-FR")}</p>
</div>
<div class="toc">
  <h2>Sommaire des fichiers</h2>
  <ol>${toc}</ol>
</div>
${body}
</body>
</html>`;
}

function findEdge() {
    const candidates = [
        path.join(process.env["ProgramFiles(x86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
        path.join(process.env.ProgramFiles || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    ];
    return candidates.find((p) => p && fs.existsSync(p)) || null;
}

function toPdf(htmlOut, pdfOut) {
    const edge = process.platform === "win32" ? findEdge() : null;
    if (!edge) throw new Error("Microsoft Edge requis pour générer le PDF sur Windows.");
    fs.mkdirSync(path.dirname(htmlOut), { recursive: true });
    execFileSync(
        edge,
        ["--headless", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${pdfOut}`, pathToFileURL(htmlOut).href],
        { stdio: "inherit" }
    );
}

const files = collectFiles();
if (!files.length) {
    console.error("Aucun fichier source trouvé.");
    process.exit(1);
}

console.log(`Collecte : ${files.length} fichiers…`);
const html = buildHtml(files);
fs.writeFileSync(htmlPath, html, "utf8");
console.log("HTML :", htmlPath);

console.log("Génération PDF (peut prendre 1–2 min)…");
toPdf(htmlPath, pdfPath);

const stat = fs.statSync(pdfPath);
console.log(`PDF généré : ${pdfPath} (${(stat.size / 1024 / 1024).toFixed(1)} Mo)`);
