"use strict";
/**
 * Serveur minimal Simulateur H : fichiers statiques + POST /api/simulate.
 * Fichier dans l'asar Electron (express disponible). repoRoot = dossier avec Simulateur/ et tools/.
 */
const express = require("express");
const path = require("path");
const os = require("node:os");
const { execFile } = require("node:child_process");
const { copyFile, mkdtemp, readFile: readFileAsync, rm, writeFile } = require("node:fs/promises");
const { pathToFileURL } = require("node:url");

const XSPICE_DIGITAL_CM_PLACEHOLDER = "__XSPICE_DIGITAL_CM__";
const SIM_ENGINE_BUILD_TAG = "v2-reset-2026-05-09";

function createSimulateStandaloneApp(repoRoot) {
    const {
        resolveNgspiceForServer,
        applyPathPrepend,
        isNgspiceWrongPlatformBinary,
        resolveDigitalCmSourcePath,
    } = require(path.join(repoRoot, "tools", "ngspice-bundle.cjs"));

    const app = express();
    app.use(express.json({ limit: "20mb" }));
    app.use(express.urlencoded({ extended: true }));

    const dirSimulateur = path.join(repoRoot, "Simulateur");


const ngspiceXspiceProbeModuleUrl = pathToFileURL(
    path.join(repoRoot, "Simulateur", "Engine", "ngspice-xspice-probe.mjs")
).href;
/** @type {{ exe: string | null; envKey: string | null; value: boolean | null }} */
let cachedNgspiceXspice = { exe: null, envKey: null, value: null };

function envPathKey(env) {
    return env && (env.PATH || env.Path) ? String(env.PATH || env.Path) : "";
}

function forceBsourceFromEnv() {
    const v = process.env.FORCE_BSOURCE;
    return v === "1" || String(v || "").toLowerCase() === "true";
}

/**
 * Détecte si le binaire ngspice du serveur supporte XSPICE (résultat mis en cache).
 * @param {string} exe
 * @param {NodeJS.ProcessEnv} env
 */
async function serverNgspiceHasXspice(exe, env) {
    const envKey = envPathKey(env);
    if (
        cachedNgspiceXspice.exe === exe &&
        cachedNgspiceXspice.envKey === envKey &&
        cachedNgspiceXspice.value !== null
    ) {
        return cachedNgspiceXspice.value;
    }
    try {
        const mod = await import(ngspiceXspiceProbeModuleUrl);
        const value = mod.ngspiceHasXspice(exe, env);
        cachedNgspiceXspice = { exe, envKey, value };
        return value;
    } catch {
        cachedNgspiceXspice = { exe, envKey, value: false };
        return false;
    }
}

/**
 * Binaire ngspice : NGSPICE / NGSPICE_PATH, sinon Simulateur/bin/ngspice(.exe)
 * si vous y copiez le bundle (bin, lib, share).
 */
function ngspiceExecutablePath() {
    return resolveNgspiceForServer(repoRoot).exe;
}

/**
 * @param {{ message?: string; code?: string | number }} error
 */
function isNgspiceMissingError(error) {
    if (!error) return false;
    if (error.code === "ENOENT") return true;
    const msg = `${error.message || ""}`;
    // Ne pas matcher seul « spawn » : spawn EPERM = blocage sécurité, pas « introuvable ».
    return /not recognized|introuvable|pas reconnu|cannot find|No such file|est pas une commande|n'est pas reconnu|n'est pas reconnu|command not found/i.test(
        msg
    );
}

/**
 * @param {{ message?: string; code?: string | number }} error
 * @param {string} [exeTried]
 */
function isLikelySecuritySoftwareBlock(error, exeTried) {
    if (!error || isNgspiceWrongPlatformBinary(exeTried || "")) return false;
    if (!isWin32Platform()) return false;
    const c = error.code;
    if (c === "EPERM" || c === "EACCES") return true;
    const msg = `${error.message || ""}`;
    return /operation not permitted|accès refusé|access denied|bloqué|blocked|not permitted by/i.test(msg);
}

function isWin32Platform() {
    return process.platform === "win32";
}

// --- CHARGEMENT DES ELEVES ---


const {
    loadSimEngineModules,
    preloadSimEngineModules,
} = require(path.join(repoRoot, "tools", "simulate-engine-loader.cjs"));

/** buildNgspiceDeck est async (ESM) ; tolère aussi une version synchrone ancienne. */
async function invokeBuildNgspiceDeck(buildFn, state, opts) {
    const result = buildFn(state, opts);
    if (result != null && typeof result.then === "function") return await result;
    return result;
}

/** Délai exec ngspice : circuits 74HC90 / CD4511 (.tran jusqu'à ~120 s simulées). */
function ngspiceExecTimeoutMs(netlistText) {
    const text = String(netlistText || "");
    if (!/\.tran\b/i.test(text)) return 30000;
    const m = text.match(/\.tran\s+\S+\s+(\S+)/i);
    if (!m) return 90000;
    const tstop = parseFloat(m[1]);
    if (!Number.isFinite(tstop) || tstop <= 0) return 90000;
    return Math.min(180000, Math.max(15000, Math.round(tstop * 3000 + 10000)));
}

function runNgspice(netlistPath, outputPath, opts = {}) {
    const { exe, prependPath } = resolveNgspiceForServer(repoRoot);
    const env = applyPathPrepend(process.env, prependPath);
    const cwd = opts.cwd || repoRoot;
    const timeoutMs = opts.timeoutMs ?? 90000;
    // Linux (Docker/Render) : -i charge digital.cm copié dans le répertoire de travail.
    // Windows : pas de -i/-f (ngspice_con charge spinit du bundle).
    const args = ["-b"];
    if (opts.xspiceRc && process.platform !== "win32") {
        args.push("-i", opts.xspiceRc);
    }
    args.push("-o", outputPath, netlistPath);
    return new Promise((resolve, reject) => {
        execFile(
            exe,
            args,
            {
                windowsHide: true,
                timeout: timeoutMs,
                maxBuffer: 8 * 1024 * 1024,
                env,
                cwd,
            },
            (error, stdout, stderr) => {
                if (error) {
                    reject({
                        message: error.message,
                        code: error.code,
                        stdout: stdout || "",
                        stderr: stderr || "",
                        ngspiceExe: exe,
                    });
                    return;
                }
                resolve({ stdout: stdout || "", stderr: stderr || "" });
            }
        );
    });
}

app.get("/api/simulate", (req, res) => {
    res.status(405).json({
        ok: false,
        phase: "method",
        errors: [
            "Cette URL accepte uniquement POST (pas GET dans la barre d’adresse).",
            "Lancez « npm start », puis ouvrez http://localhost:3000/Simulateur/ et cliquez sur « Lancer Simulation ».",
        ],
    });
});

app.post("/api/simulate", async (req, res) => {
    const state = req.body?.state;
    if (
        !state ||
        typeof state !== "object" ||
        !Array.isArray(state.components) ||
        !Array.isArray(state.wires)
    ) {
        return res.status(400).json({
            ok: false,
            phase: "build",
            errors: [
                "Schéma non reçu par le serveur. Rechargez le simulateur (Ctrl+F5), puis réessayez.",
            ],
            warnings: [],
            netlist: "",
        });
    }
    let eng;
    try {
        eng = await loadSimEngineModules(repoRoot);
    } catch (error) {
        res.status(500).json({
            ok: false,
            phase: "init",
            errors: ["Modules ngspice (netlist ou parseur resultats) indisponibles sur le serveur."],
            details: { message: error?.message || "" }
        });
        return;
    }
    const {
        buildNgspiceDeck,
        mergeVoltmeterMeasurements,
        mergeAmmeterMeasurements,
        mergeLedMeasurements,
        mergeLedTranPlotsFromWrdata,
        mergeLedValuesFromTranPlots,
        mergeLogicGateMeasurements,
        mergeLogicGateTranFromWrdata,
        mergeLogicGateTranPlotsFromWrdata,
        mergeOhmmeterMeasurements,
        mergeOscilloscopeMeasurements,
        deriveOscilloscopeValuesFromScopePlots,
        mergeScopePlotsFromTranWrdata,
        mergeBodePlotsFromAcWrdata,
        mergeVoltmeterRmsFromTranWrdata,
        mergeAmmeterRmsFromTranWrdata,
        mergeVoltmeterFromTranWrdata,
        mergeAmmeterFromTranWrdata,
        mergeOhmmeterFromTranWrdata,
        mergeVoltmeterTranPlotsFromWrdata,
        mergeSeg7Measurements,
        mergeSeg7FromTranWrdata,
        mergeSeg7TranPlotsFromWrdata,
        mergeBargraphMeasurements,
        mergeBargraphFromTranWrdata,
        mergeBargraphTranPlotsFromWrdata,
    } = eng;

    const gs = Number(req.body?.gridStep);
    const { exe: ngspiceExe, prependPath } = resolveNgspiceForServer(repoRoot);
    const ngspiceEnv = applyPathPrepend(process.env, prependPath);
    const linuxServer = process.platform !== "win32";
    const hasXspice = await serverNgspiceHasXspice(ngspiceExe, ngspiceEnv);
    const forceAllBsource = forceBsourceFromEnv() || !hasXspice;
    const deckOpts = {
        repoRoot: repoRoot,
        ngspiceExe,
        ngspiceEnv,
        // CD4511 : d_genlut plante sur ngspice apt (Render) → sources B obligatoires sous Linux.
        // Bascules D : XSPICE si le binaire le supporte ; repli B sinon.
        forceBsourceCd4511: linuxServer || forceAllBsource,
        forceBsourceDff: forceAllBsource,
        // 74HC90 : bascules JK XSPICE si disponibles (repli B automatique sinon).
        quickTran: linuxServer,
    };
    if (Number.isFinite(gs) && gs > 0) deckOpts.gridStep = gs;
    if (req.body?.liveSourceTuning === true) deckOpts.liveSourceTuning = true;
    const built = await invokeBuildNgspiceDeck(buildNgspiceDeck, state, deckOpts);
    if (!built || typeof built !== "object") {
        return res.status(500).json({
            ok: false,
            phase: "build",
            errors: [
                "Réponse netlist invalide du moteur SPICE. Redéployez le serveur (server.js + Simulateur/Engine/).",
            ],
            warnings: [],
            netlist: "",
        });
    }
    if (!built.ok) {
        const errs = Array.isArray(built.errors)
            ? built.errors.filter((e) => e != null && String(e).trim()).map(String)
            : [];
        if (!errs.length) errs.push("Impossible de générer la netlist SPICE à partir du schéma.");
        res.status(400).json({
            ok: false,
            phase: "build",
            errors: errs,
            warnings: built.warnings || [],
            netlist: built.netlist || "",
        });
        return;
    }

    const tempDir = await mkdtemp(path.join(os.tmpdir(), "sim-ngspice-"));
    const netlistPath = path.join(tempDir, "circuit.cir");
    const outputPath = path.join(tempDir, "ngspice.log");
    const wavePathFs = path.join(tempDir, "tran_waves.txt");
    const acWavePathFs = path.join(tempDir, "ac_waves.txt");

    try {
        let deckText = built.netlist;
        // Toujours chemins relatifs : ngspice tourne dans tempDir (évite espaces dans le chemin du projet).
        if (built.analysisTran && typeof deckText === "string") {
            deckText = deckText.split("__TRAN_WAVE_PATH__").join("tran_waves.txt");
        }
        if (built.analysisAc && typeof deckText === "string") {
            deckText = deckText.split("__AC_WAVE_PATH__").join("ac_waves.txt");
        }
        let xspiceRc;
        if (typeof deckText === "string" && deckText.includes(XSPICE_DIGITAL_CM_PLACEHOLDER)) {
            const digitalSrc = resolveDigitalCmSourcePath(repoRoot);
            if (!digitalSrc) {
                return res.status(500).json({
                    ok: false,
                    phase: "run",
                    errors: [
                        "digital.cm introuvable (Simulateur/lib/ngspice/digital.cm). Voir Simulateur/lib/ngspice/README.txt.",
                    ],
                    warnings: built.warnings,
                    netlist: built.netlist,
                });
            }
            await copyFile(digitalSrc, path.join(tempDir, "digital.cm"));
            xspiceRc = path.join(tempDir, "ngspice-xspice.rc");
            await writeFile(xspiceRc, "codemodel digital.cm\n", "utf8");
            xspiceRc = path.basename(xspiceRc);
        }
        await writeFile(netlistPath, deckText, "utf8");
        const spiceTimeoutMs = ngspiceExecTimeoutMs(deckText);
        const runResult = await runNgspice("circuit.cir", "ngspice.log", {
            cwd: tempDir,
            xspiceRc,
            timeoutMs: spiceTimeoutMs,
        });
        let log = "";
        try {
            log = await readFileAsync(outputPath, "utf8");
        } catch {
            // Certaines variantes/runtime d'ngspice peuvent ne pas ecrire le log attendu.
        }
        const combinedLog = [log, runResult.stdout || "", runResult.stderr || ""]
            .filter((part) => typeof part === "string" && part.trim().length > 0)
            .join("\n");
        const tran = !!(/** @type {{ analysisTran?: boolean }} */ (built).analysisTran);
        const ac = !!(/** @type {{ analysisAc?: boolean }} */ (built).analysisAc);
        let voltmeterValues = mergeVoltmeterMeasurements(combinedLog, built.voltmeters, built.nodeMeasures || []);
        let ammeterValues = mergeAmmeterMeasurements(combinedLog, built.ammeters || []);
        let ledValues = mergeLedMeasurements(combinedLog, built.leds || []);
        let logicValues = mergeLogicGateMeasurements(combinedLog, built.logicGates || []);
        let ohmmeterValues = {};
        let voltmeterRmsValues = {};
        let ammeterRmsValues = {};
        let scopePlots = {};
        let bodePlots = {};
        let seg7Values = mergeSeg7Measurements(combinedLog, built.seg7Displays || []);
        let bargraphValues = mergeBargraphMeasurements(combinedLog, built.bargraphDisplays || []);
        let seg7TranPlots = {};
        let bargraphTranPlots = {};
        let logicGateTranPlots = {};
        let ledTranPlots = {};
        let voltmeterTranPlots = {};
        let speakerTranPlots = {};
        let waveDiag = "";
        if (tran) {
            let waveTxt = "";
            try {
                waveTxt = await readFileAsync(wavePathFs, "utf8");
            } catch (waveErr) {
                waveTxt = "";
                waveDiag = `[wrdata] Fichier courbes introuvable : ${waveErr?.message || waveErr}`;
            }
            const meta = Array.isArray(built.scopesTranMeta) ? built.scopesTranMeta : [];
            scopePlots = mergeScopePlotsFromTranWrdata(waveTxt, meta);
            const ledsMeta = Array.isArray(built.ledsTranMeta) ? built.ledsTranMeta : [];
            ledTranPlots = mergeLedTranPlotsFromWrdata(waveTxt, ledsMeta);
            const fromTran = mergeLedValuesFromTranPlots(ledTranPlots);
            if (Object.keys(fromTran).length > 0) ledValues = fromTran;
            const lgMeta = Array.isArray(built.logicGatesTranMeta) ? built.logicGatesTranMeta : [];
            logicGateTranPlots = mergeLogicGateTranPlotsFromWrdata(waveTxt, lgMeta);
            const fromTranLg = mergeLogicGateTranFromWrdata(waveTxt, lgMeta);
            if (Object.keys(fromTranLg).length > 0) logicValues = fromTranLg;
            const metersMeta = built.metersTranMeta || {};
            voltmeterValues = mergeVoltmeterFromTranWrdata(
                waveTxt,
                Array.isArray(metersMeta.voltmeters) ? metersMeta.voltmeters : []
            );
            voltmeterTranPlots = mergeVoltmeterTranPlotsFromWrdata(
                waveTxt,
                Array.isArray(metersMeta.voltmeters) ? metersMeta.voltmeters : []
            );
            speakerTranPlots = mergeVoltmeterTranPlotsFromWrdata(
                waveTxt,
                Array.isArray(metersMeta.speakers) ? metersMeta.speakers : []
            );
            ammeterValues = mergeAmmeterFromTranWrdata(
                waveTxt,
                Array.isArray(metersMeta.ammeters) ? metersMeta.ammeters : []
            );
            voltmeterRmsValues = mergeVoltmeterRmsFromTranWrdata(
                waveTxt,
                Array.isArray(metersMeta.voltmetersRms) ? metersMeta.voltmetersRms : []
            );
            ammeterRmsValues = mergeAmmeterRmsFromTranWrdata(
                waveTxt,
                Array.isArray(metersMeta.ammetersRms) ? metersMeta.ammetersRms : []
            );
            const seg7Meta = Array.isArray(built.seg7TranMeta) ? built.seg7TranMeta : [];
            const fromTranSeg7 = mergeSeg7FromTranWrdata(waveTxt, seg7Meta);
            if (Object.keys(fromTranSeg7).length > 0) seg7Values = fromTranSeg7;
            seg7TranPlots = mergeSeg7TranPlotsFromWrdata(waveTxt, seg7Meta);
            const bargraphMeta = Array.isArray(built.bargraphTranMeta) ? built.bargraphTranMeta : [];
            const fromTranBargraph = mergeBargraphFromTranWrdata(waveTxt, bargraphMeta);
            if (Object.keys(fromTranBargraph).length > 0) bargraphValues = fromTranBargraph;
            bargraphTranPlots = mergeBargraphTranPlotsFromWrdata(waveTxt, bargraphMeta);
            /* Diagnostic visible dans Vérification → Journal */
            const linesCnt = waveTxt ? waveTxt.split("\n").length : 0;
            const plotKeys = Object.keys(scopePlots);
            const ledPlotKeys = Object.keys(ledTranPlots);
            waveDiag = [
                `[wrdata] Fichier courbes : ${waveTxt.length} octets, ${linesCnt} lignes`,
                `[wrdata] Premières données : ${waveTxt.slice(0, 300).replace(/\r/g, "") || "(vide)"}`,
                `[wrdata] Oscilloscopes : ${plotKeys.length ? plotKeys.join(", ") : "(aucun)"}`,
                `[wrdata] LED (courant i(VIL_*)) : ${ledPlotKeys.length ? ledPlotKeys.join(", ") : "(aucun)"}`
            ].join("\n");
            const oscList = Array.isArray(built.oscilloscopes) ? built.oscilloscopes : [];
            if (oscList.length > 0 && plotKeys.length === 0) {
                const miss = oscList.map((o) => o.id).join(", ");
                built.warnings = built.warnings || [];
                built.warnings.push(
                    `Oscilloscope(s) ${miss} : aucune courbe dans tran_waves.txt. Reliez CH1, CH2 et la masse (borne du bas) ; vérifiez qu’il y a un générateur sinus/carré.`
                );
            }
        }
        if (ac) {
            let acWaveTxt = "";
            try {
                acWaveTxt = await readFileAsync(acWavePathFs, "utf8");
            } catch (acErr) {
                acWaveTxt = "";
                waveDiag = `[wrdata ac] Fichier courbes introuvable : ${acErr?.message || acErr}`;
            }
            const bodeMeta = Array.isArray(built.bodeAcMeta) ? built.bodeAcMeta : [];
            bodePlots = mergeBodePlotsFromAcWrdata(acWaveTxt, bodeMeta);
            const bodeList = Array.isArray(built.bodeAnalyzers) ? built.bodeAnalyzers : [];
            if (bodeList.length > 0 && Object.keys(bodePlots).length === 0) {
                const miss = bodeList.map((b) => b.id).join(", ");
                built.warnings = built.warnings || [];
                built.warnings.push(
                    `Analyse fréquentielle ${miss} : aucune courbe dans ac_waves.txt. Vérifiez le câblage et le générateur sinus.`
                );
            }
        }
        const ohmList = Array.isArray(built.ohmeters) ? built.ohmeters : [];
        const ohmIsoNetlist = built.ohmmeterIsolationNetlist;
        if (ohmList.length > 0 && typeof ohmIsoNetlist === "string" && ohmIsoNetlist.trim()) {
            try {
                const ohmLogPath = path.join(tempDir, "ngspice_ohm.log");
                await writeFile(path.join(tempDir, "circuit_ohm.cir"), ohmIsoNetlist, "utf8");
                const ohmRun = await runNgspice("circuit_ohm.cir", "ngspice_ohm.log", {
                    cwd: tempDir,
                    xspiceRc,
                    timeoutMs: spiceTimeoutMs,
                });
                let ohmLog = "";
                try {
                    ohmLog = await readFileAsync(ohmLogPath, "utf8");
                } catch {
                    /* pas de log ohmmètre */
                }
                const ohmCombined = [ohmLog, ohmRun.stdout || "", ohmRun.stderr || ""]
                    .filter((part) => typeof part === "string" && part.trim().length > 0)
                    .join("\n");
                ohmmeterValues = mergeOhmmeterMeasurements(ohmCombined, ohmList);
            } catch (ohmErr) {
                built.warnings = built.warnings || [];
                built.warnings.push(
                    "Ohmmètre : mesure en mode isolation impossible — vérifiez le câblage ou retirez l’ohmmètre du circuit alimenté."
                );
                ohmmeterValues = mergeOhmmeterMeasurements(combinedLog, ohmList);
            }
        }
        const oscilloscopeValues = tran
            ? deriveOscilloscopeValuesFromScopePlots(scopePlots)
            : mergeOscilloscopeMeasurements(combinedLog, built.oscilloscopes || []);
        res.json({
            ok: true,
            warnings: built.warnings,
            netlist: deckText,
            log: [combinedLog || log, waveDiag].filter(Boolean).join("\n\n--- DIAGNOSTIC COURBES ---\n"),
            voltmeterValues,
            voltmeterIds: Array.isArray(built.voltmeters) ? built.voltmeters.map((v) => v.id) : [],
            voltmeterNodes: Array.isArray(built.voltmeters) ? built.voltmeters : [],
            ammeterValues,
            ammeterIds: Array.isArray(built.ammeters) ? built.ammeters.map((a) => a.id) : [],
            ammeterBranches: Array.isArray(built.ammeters) ? built.ammeters : [],
            ledValues,
            ledIds: Array.isArray(built.leds) ? built.leds.map((l) => l.id) : [],
            ledBranches: Array.isArray(built.leds) ? built.leds : [],
            ledTranPlots,
            voltmeterTranPlots,
            speakerTranPlots,
            logicValues,
            logicIds: Array.isArray(built.logicGates) ? built.logicGates.map((g) => g.id) : [],
            logicGates: Array.isArray(built.logicGates) ? built.logicGates : [],
            voltmeterRmsValues,
            voltmeterRmsIds: Array.isArray(built.voltmetersRms)
                ? built.voltmetersRms.map((v) => v.id)
                : [],
            voltmeterRmsNodes: Array.isArray(built.voltmetersRms) ? built.voltmetersRms : [],
            ammeterRmsValues,
            ammeterRmsIds: Array.isArray(built.ammetersRms) ? built.ammetersRms.map((a) => a.id) : [],
            ammeterRmsBranches: Array.isArray(built.ammetersRms) ? built.ammetersRms : [],
            ohmmeterValues,
            ohmmeterIds: Array.isArray(built.ohmeters) ? built.ohmeters.map((o) => o.id) : [],
            ohmmeterNodes: Array.isArray(built.ohmeters) ? built.ohmeters : [],
            oscilloscopeValues,
            oscilloscopeIds: Array.isArray(built.oscilloscopes)
                ? built.oscilloscopes.map((o) => o.id)
                : [],
            oscilloscopeNodes: Array.isArray(built.oscilloscopes) ? built.oscilloscopes : [],
            analysisTran: tran,
            analysisAc: ac,
            scopePlots,
            bodePlots,
            seg7Values,
            seg7TranPlots,
            bargraphValues,
            bargraphTranPlots,
            logicGateTranPlots,
            seg7Displays: Array.isArray(built.seg7Displays) ? built.seg7Displays : [],
            bargraphDisplays: Array.isArray(built.bargraphDisplays) ? built.bargraphDisplays : [],
        });
    } catch (error) {
        const exeTried = /** @type {{ ngspiceExe?: string }} */ (error)?.ngspiceExe || ngspiceExecutablePath();
        const wrongPlatform = isNgspiceWrongPlatformBinary(exeTried);
        const missing = isNgspiceMissingError(error);
        const securityBlock = isLikelySecuritySoftwareBlock(error, exeTried);
        let logTail = "";
        try {
            logTail = await readFileAsync(outputPath, "utf8");
        } catch {
            /* pas de ngspice.log */
        }
        const tailOut = [logTail, error?.stderr, error?.stdout, error?.message]
            .filter((x) => typeof x === "string" && x.trim())
            .join("\n")
            .trim()
            .slice(-4000);
        let primary;
        if (wrongPlatform) {
            primary =
                `Binaire ngspice incompatible (${exeTried}) : un exécutable Windows (.exe) ne peut pas tourner sur ${process.platform}. ` +
                `Sur Render / Docker / Linux : définir la variable d’environnement NGSPICE=/usr/bin/ngspice (voir Dockerfile) ou installer ngspice via le système ; ne pas déployer Simulateur/bin/ngspice.exe sur le serveur. ` +
                `En local Windows : utiliser ngspice.exe dans Simulateur/bin/ ou NGSPICE vers votre installation.`;
        } else if (missing) {
            const exeBase = path.basename(String(exeTried || "")).toLowerCase().replace(/\.exe$/i, "");
            const probe = exeBase === "ngspice_con" ? "ngspice_con -v" : "ngspice -v";
            const hint = isWin32Platform()
                ? "sur Windows : place ngspice_con.exe dans Simulateur/bin/ (livré avec le projet), supprime une éventuelle variable NGSPICE=ngspice mal définie, ou pointe NGSPICE vers le chemin complet du .exe"
                : "sur Linux : installe ngspice (apt install ngspice) puis exporte NGSPICE=/usr/bin/ngspice — ne déploie pas les .exe Windows sur le serveur";
            primary = `ngspice introuvable ou non exécutable (essayé : ${exeTried}). ${hint}, puis relance npm start depuis le même terminal où « ${probe} » fonctionne.`;
        } else if (securityBlock) {
            primary =
                `Exécution de ngspice bloquée (${exeTried}). Un antivirus ou une stratégie « logiciel inconnu » (ex. Trend Micro) peut empêcher ngspice.exe : seul un administrateur informatique peut créer une exception. ` +
                `En attendant : utiliser le site hébergé en ligne (Docker / Render) où ngspice tourne sur le serveur, pas sur le PC du visiteur.`;
        } else {
            primary = `Echec d'exécution ngspice (${exeTried}).${tailOut ? `\n\n${tailOut}` : ""}`;
        }
        const attachTail = tailOut && (missing || securityBlock || wrongPlatform);
        res.status(500).json({
            ok: false,
            phase: "run",
            errors: [primary + (attachTail ? `\n\n${tailOut}` : "")],
            warnings: built.warnings,
            netlist: built.netlist,
            details: {
                message: error?.message || "",
                stdout: error?.stdout || "",
                stderr: error?.stderr || "",
                ngspiceExe: exeTried,
            },
        });
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

    app.get("/api/version", (req, res) => {
        res.json({
            ok: true,
            service: "simulateur-h",
            simEngineBuildTag: SIM_ENGINE_BUILD_TAG,
            ngspiceExecutable: ngspiceExecutablePath(),
            pid: process.pid,
        });
    });

    const { mountArduinoRoutes } = require(path.join(repoRoot, "tools", "arduino-routes.cjs"));
    mountArduinoRoutes(app);

    const { mountSimulatorVisitRoutes } = require(path.join(repoRoot, "tools", "simulator-visit-counter.cjs"));
    mountSimulatorVisitRoutes(app, repoRoot);

    app.get("/favicon.ico", (req, res) => {
        res.type("image/svg+xml");
        res.sendFile(path.join(dirSimulateur, "favicon.svg"));
    });
    app.use("/Simulateur", express.static(dirSimulateur));
    app.get("/", (req, res) => res.redirect("/Simulateur/"));
    return app;
}

function startStandaloneSimulateServer(options = {}) {
    const repoRoot = options.repoRoot;
    if (!repoRoot) throw new Error("repoRoot requis");
    const port = options.port ?? 43721;
    const host = options.host ?? "127.0.0.1";
    const app = createSimulateStandaloneApp(repoRoot);
    const { resolveNgspiceForServer } = require(path.join(repoRoot, "tools", "ngspice-bundle.cjs"));
    const { preloadSimEngineModules: preloadEngine } = require(path.join(
        repoRoot,
        "tools",
        "simulate-engine-loader.cjs"
    ));
    return new Promise((resolve, reject) => {
        const server = app.listen(port, host, () => {
            preloadEngine(repoRoot);
            const { exe: ngspiceExe } = resolveNgspiceForServer(repoRoot);
            console.log("[Simulateur H] ngspice : " + ngspiceExe);
            console.log("[Simulateur H] http://" + host + ":" + port + "/Simulateur/");
            resolve({ server, port, host, url: "http://" + host + ":" + port + "/Simulateur/" });
        });
        server.on("error", reject);
    });
}

module.exports = { createSimulateStandaloneApp, startStandaloneSimulateServer, SIM_ENGINE_BUILD_TAG };
