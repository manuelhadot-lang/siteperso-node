#!/usr/bin/env node
/**
 * Génère docs/Simulateur-Programmes.pdf depuis docs/simulateur-programmes.html
 * Usage : node scripts/generate-simulateur-pdf.mjs
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const htmlPath = path.join(root, "docs", "simulateur-programmes.html");
const pdfPath = path.join(root, "docs", "Simulateur-Programmes.pdf");

if (!fs.existsSync(htmlPath)) {
    console.error("Fichier introuvable :", htmlPath);
    process.exit(1);
}

function findEdge() {
    const candidates = [
        path.join(process.env["ProgramFiles(x86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
        path.join(process.env.ProgramFiles || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    ];
    return candidates.find((p) => p && fs.existsSync(p)) || null;
}

const edge = process.platform === "win32" ? findEdge() : null;
if (edge) {
    const fileUrl = pathToFileURL(htmlPath).href;
    execFileSync(edge, ["--headless", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${pdfPath}`, fileUrl], {
        stdio: "inherit",
    });
    console.log("PDF généré :", pdfPath);
    process.exit(0);
}

let puppeteer;
try {
    puppeteer = await import("puppeteer");
} catch {
    console.error(
        "Sur Windows : Microsoft Edge est requis, ou installez puppeteer :\n  npm install --no-save puppeteer"
    );
    process.exit(1);
}

const browser = await puppeteer.default.launch({ headless: true });
try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle0" });
    await page.pdf({
        path: pdfPath,
        format: "A4",
        printBackground: true,
        margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" },
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate:
            '<div style="width:100%;font-size:8px;color:#666;text-align:center;">Simulateur · page <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
    console.log("PDF généré :", pdfPath);
} finally {
    await browser.close();
}
