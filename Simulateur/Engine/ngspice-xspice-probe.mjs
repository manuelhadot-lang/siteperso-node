/**
 * Détecte si le binaire ngspice supporte XSPICE (codemodel + devices A).
 * ngspice -v n'affiche pas toujours "XSPICE" même si devhelp d_dff fonctionne.
 */
import { existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";

let cachedByExe = new Map();

const D_DFF_HELP = /d_dff\s*-\s*digital/i;

/**
 * @param {string} exe
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
function probeXspiceViaDevhelp(exe, env) {
    const dir = mkdtempSync(join(tmpdir(), "ngspice-xspice-probe-"));
    const cir = join(dir, "probe.cir");
    const log = join(dir, "out.log");
    writeFileSync(
        cir,
        "* xspice probe\n.control\ndevhelp d_dff\n.quit\n.endc\n",
        "utf8"
    );
    let combined = "";
    try {
        try {
            combined = execFileSync(exe, ["-b", "-o", log, cir], {
                encoding: "utf8",
                timeout: 20000,
                windowsHide: true,
                env: env || process.env,
                maxBuffer: 4 * 1024 * 1024,
            });
        } catch (err) {
            /* devhelp s'affiche souvent sur stdout/stderr, pas dans le .log */
            combined =
                (err && typeof err.stdout === "string" ? err.stdout : "") +
                (err && typeof err.stderr === "string" ? err.stderr : "");
        }
        if (D_DFF_HELP.test(combined)) return true;
        if (existsSync(log)) {
            const text = readFileSync(log, "utf8");
            if (D_DFF_HELP.test(text)) return true;
        }
    } finally {
        try {
            rmSync(dir, { recursive: true, force: true });
        } catch {
            /* ignore */
        }
    }
    return false;
}

/**
 * @param {string | null | undefined} exe chemin vers ngspice / ngspice_con
 * @param {NodeJS.ProcessEnv} [env] PATH étendu (bin/lib) si bundle portable
 * @returns {boolean}
 */
export function ngspiceHasXspice(exe, env) {
    if (!exe || !existsSync(exe)) return false;
    const key = exe.toLowerCase();
    if (cachedByExe.has(key)) return cachedByExe.get(key);

    let ok = false;
    try {
        const out = execFileSync(exe, ["-v"], {
            encoding: "utf8",
            timeout: 8000,
            windowsHide: true,
            env: env || process.env,
        });
        ok = /\bxspice\b/i.test(out);
    } catch {
        ok = false;
    }

    if (!ok) ok = probeXspiceViaDevhelp(exe, env);

    cachedByExe.set(key, ok);
    return ok;
}
