const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer'); // Nécessite 'npm install nodemailer'
const http = require('http'); // Module natif Node.js
const { Server } = require("socket.io"); // Module Socket.io
const archiver = require('archiver'); // Nécessite 'npm install archiver'
const { execFile } = require("node:child_process");
const os = require("node:os");
const { mkdtemp, readFile: readFileAsync, rm, writeFile } = require("node:fs/promises");
const { pathToFileURL } = require("node:url");

const app = express();
const server = http.createServer(app); // On crée le serveur HTTP avec Express
const io = new Server(server); // On attache Socket.io au serveur HTTP
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;

// --- 1. CONFIGURATION DES CHEMINS ---
const dirUploads = path.join(__dirname, 'upload-tp');
const dirDocs = path.join(__dirname, 'doc'); 
const mesSousDossiersDocs = ["Digicode", "Robo_Cytron", "RobotTriPostal", "StationMeteoConnectee", "UltraSon", "documents", "3D"];
const dirQuizAssets = path.join(__dirname, 'public', 'quiz-assets');
const dirSimulateur = path.join(__dirname, 'Simulateur');
const ngspiceDeckModuleUrl = pathToFileURL(path.join(__dirname, "Simulateur", "Engine", "spice-netlist-v2.js")).href;
const ngspiceResultParserModuleUrl = pathToFileURL(path.join(__dirname, "Simulateur", "Engine", "v2", "result-parser.js")).href;
let buildNgspiceDeckFn = null;
let mergeVoltmeterMeasurementsFn = null;
let mergeAmmeterMeasurementsFn = null;
let mergeOhmmeterMeasurementsFn = null;
let mergeScopePlotsFromTranWrdataFn = null;
const SIM_ENGINE_BUILD_TAG = "v2-reset-2026-05-09";

/**
 * Nettoie une valeur d’environnement (guillemets, espaces).
 * @param {string} s
 */
function cleanEnvExecutable(s) {
    let x = String(s).trim();
    if ((x.startsWith('"') && x.endsWith('"')) || (x.startsWith("'") && x.endsWith("'")))
        x = x.slice(1, -1).trim();
    return x;
}

/**
 * Résout un chemin vers ngspice : absolu tel quel, sinon relatif au cwd puis à la racine du projet.
 * @param {string} p
 */
function resolveNgspiceCandidate(p) {
    const t = cleanEnvExecutable(p);
    if (!t) return "ngspice";
    if (path.isAbsolute(t)) return path.normalize(t);
    const fromCwd = path.resolve(process.cwd(), t);
    if (fs.existsSync(fromCwd)) return fromCwd;
    const fromApp = path.resolve(__dirname, t);
    if (fs.existsSync(fromApp)) return fromApp;
    return t;
}

/**
 * Binaire ngspice : défaut "ngspice". Sous Windows sans entrée PATH, définir
 * NGSPICE ou NGSPICE_PATH (ex. C:\Spice64\bin\ngspice.exe).
 */
function ngspiceExecutablePath() {
    const raw = process.env.NGSPICE || process.env.NGSPICE_PATH;
    if (typeof raw === "string" && raw.trim().length > 0) return resolveNgspiceCandidate(raw);
    return "ngspice";
}

/**
 * @param {{ message?: string; code?: string | number }} error
 */
function isNgspiceMissingError(error) {
    if (!error) return false;
    if (error.code === "ENOENT") return true;
    const msg = `${error.message || ""}`;
    return /not recognized|introuvable|pas reconnu|cannot find|No such file|ENOENT|spawn|est pas une commande|n'est pas reconnu|n’est pas reconnu/i.test(
        msg
    );
}

// --- CHARGEMENT DES ELEVES ---
let baseEleves = {};
if (fs.existsSync('./eleves.json')) baseEleves = JSON.parse(fs.readFileSync('./eleves.json'));

// Route pour vérifier si un code élève existe
app.get('/api/check-student/:code', (req, res) => {
    const codeCherche = req.params.code.toUpperCase();
    let eleveTrouve = null;

    for (let classe in baseEleves) {
        const match = baseEleves[classe].find(e => e.code.toUpperCase() === codeCherche);
        if (match) {
            eleveTrouve = { nom: match.nom, prenom: match.prenom };
            break;
        }
    }

    if (eleveTrouve) {
        res.json({ exists: true, ...eleveTrouve });
    } else {
        res.json({ exists: false });
    }
});

// Création automatique
if (!fs.existsSync(dirUploads)) fs.mkdirSync(dirUploads);
if (!fs.existsSync(dirDocs)) fs.mkdirSync(dirDocs);
if (!fs.existsSync(dirQuizAssets)) fs.mkdirSync(dirQuizAssets, { recursive: true });
mesSousDossiersDocs.forEach(sd => {
    const p = path.join(dirDocs, sd);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// Liste de tes classes (Modifie ces noms selon tes besoins)
const mesClasses = ["Tle_STI2D1", "Tle_STI2D2", "1ere_STI2D1", "1ere_STI2D2"];

// --- 2. CHARGEMENT DES PLANNINGS ---
let planningProjets = { "Robotique": "2026-03-01", "UltraSon": "2026-03-01", "Station_Meteo": "2026-03-01", "Digicode": "2026-03-01", "Robo_Cytron_ESP32": "2026-03-01" };
let planningDocs = {};
let quizzes = {};
let chatMessages = [];

if (fs.existsSync('./planning_projets.json')) planningProjets = JSON.parse(fs.readFileSync('./planning_projets.json'));
if (fs.existsSync('./planning_docs.json')) planningDocs = JSON.parse(fs.readFileSync('./planning_docs.json'));
if (fs.existsSync('./quizzes.json')) quizzes = JSON.parse(fs.readFileSync('./quizzes.json'));
if (fs.existsSync('./chat_messages.json')) chatMessages = JSON.parse(fs.readFileSync('./chat_messages.json'));

// --- 3. CONFIGURATION MULTER ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const projet = req.body.projet || 'Robotique';
        const target = path.join(dirUploads, projet);
        if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
        cb(null, target);
    },
    filename: (req, file, cb) => {
        const nom = (req.body.nom || 'SANSNOM').toUpperCase().replace(/\s/g, '_');
        const prenom = (req.body.prenom || 'SANSPRENOM').replace(/\s/g, '_');
        cb(null, `${nom}_${prenom}_${new Date().toISOString().slice(0, 10)}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage: storage });

// Configuration Multer pour les images des Quiz
const storageQuiz = multer.diskStorage({
    destination: (req, file, cb) => cb(null, dirQuizAssets),
    filename: (req, file, cb) => cb(null, 'img_' + Date.now() + path.extname(file.originalname))
});
const uploadQuiz = multer({ storage: storageQuiz });


// --- 4. MIDDLEWARES ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

function isProjectAccessible(projectKey) {
    const aujourdhui = new Date().toISOString().split('T')[0];
    const dateOuverture = planningProjets[projectKey];
    return !dateOuverture || aujourdhui >= dateOuverture;
}

function sendProjectLocked(res, projectKey) {
    const dateOuverture = planningProjets[projectKey];
    const dateAffichee = dateOuverture ? dateOuverture.split('-').reverse().join('/') : "date à venir";
    return res.send(`<script>alert("🔒 Projet disponible le ${dateAffichee}"); window.location='/projets.html';</script>`);
}

function withProjectDateGate(projectKey, handler) {
    return (req, res) => {
        if (!isProjectAccessible(projectKey)) return sendProjectLocked(res, projectKey);
        return handler(req, res);
    };
}

// Redirige l'ancienne page statique qui contournait les dates.
app.get('/projets_backup.html', (req, res) => res.redirect('/projets.html'));
app.get('/ContenuRobotique.html', withProjectDateGate('Robotique', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ContenuRobotique.html'))));
app.get('/ultrason.html', withProjectDateGate('UltraSon', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ultrason.html'))));
app.get('/StationMeteoConnectee.html', withProjectDateGate('Station_Meteo', (req, res) => res.sendFile(path.join(__dirname, 'public', 'StationMeteoConnectee.html'))));
app.get('/Digicode.html', withProjectDateGate('Digicode', (req, res) => res.sendFile(path.join(__dirname, 'public', 'Digicode.html'))));
app.get('/Robo_Cytron_ESP32.html', withProjectDateGate('Robo_Cytron_ESP32', (req, res) => res.sendFile(path.join(__dirname, 'public', 'Robo_Cytron_ESP32.html'))));

app.use(express.static('public'));
app.use('/Simulateur', express.static(dirSimulateur));
app.use('/assets-3d', express.static(path.join(dirDocs, '3D'))); // Route pour les modèles 3D
app.get('/api/version', (req, res) => {
    res.json({
        ok: true,
        service: "siteperso-main-server",
        simEngineBuildTag: SIM_ENGINE_BUILD_TAG,
        ngspiceDeckModuleUrl,
        ngspiceResultParserModuleUrl,
        ngspiceExecutable: ngspiceExecutablePath(),
        pid: process.pid
    });
});

/* Rechargement dynamique : `import(file://…?t=…)` évite le cache ESM de Node sans passer
   par une data: URI (certaines versions / politiques peuvent refuser ou limiter ces imports). */

/** @param {string} filePath chemin absolu du module .js à importer à chaud */
async function importFresh(filePath) {
    const url = `${pathToFileURL(path.resolve(filePath)).href}?t=${Date.now()}&r=${Math.random()}`;
    return import(url);
}

const ngspiceDeckModulePath       = path.join(__dirname, "Simulateur", "Engine", "spice-netlist-v2.js");
const ngspiceResultParserModulePath = path.join(__dirname, "Simulateur", "Engine", "v2", "result-parser.js");

async function getBuildNgspiceDeck() {
    const module = await importFresh(ngspiceDeckModulePath);
    if (typeof module.buildNgspiceDeck !== "function")
        throw new Error("Module buildNgspiceDeck introuvable.");
    return module.buildNgspiceDeck;
}

async function getMergeVoltmeterMeasurements() {
    const module = await importFresh(ngspiceResultParserModulePath);
    if (typeof module.mergeVoltmeterMeasurements !== "function")
        throw new Error("Module mergeVoltmeterMeasurements introuvable.");
    return module.mergeVoltmeterMeasurements;
}

async function getMergeAmmeterMeasurements() {
    const module = await importFresh(ngspiceResultParserModulePath);
    if (typeof module.mergeAmmeterMeasurements !== "function")
        throw new Error("Module mergeAmmeterMeasurements introuvable.");
    return module.mergeAmmeterMeasurements;
}

async function getMergeOhmmeterMeasurements() {
    const module = await importFresh(ngspiceResultParserModulePath);
    if (typeof module.mergeOhmmeterMeasurements !== "function")
        throw new Error("Module mergeOhmmeterMeasurements introuvable.");
    return module.mergeOhmmeterMeasurements;
}

async function getMergeScopePlotsFromTranWrdata() {
    const module = await importFresh(ngspiceResultParserModulePath);
    if (typeof module.mergeScopePlotsFromTranWrdata !== "function")
        throw new Error("Module mergeScopePlotsFromTranWrdata introuvable.");
    return module.mergeScopePlotsFromTranWrdata;
}

function runNgspice(netlistPath, outputPath) {
    const exe = ngspiceExecutablePath();
    return new Promise((resolve, reject) => {
        execFile(
            exe,
            ["-b", "-o", outputPath, netlistPath],
            {
                windowsHide: true,
                timeout: 25000,
                maxBuffer: 8 * 1024 * 1024,
                env: process.env,
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

app.post("/api/simulate", async (req, res) => {
    const state = req.body?.state;
    let buildNgspiceDeck;
    let mergeVoltmeterMeasurements;
    let mergeAmmeterMeasurements;
    let mergeOhmmeterMeasurements;
    let mergeScopePlotsFromTranWrdata;
    try {
        buildNgspiceDeck = await getBuildNgspiceDeck();
        mergeVoltmeterMeasurements = await getMergeVoltmeterMeasurements();
        mergeAmmeterMeasurements = await getMergeAmmeterMeasurements();
        mergeOhmmeterMeasurements = await getMergeOhmmeterMeasurements();
        mergeScopePlotsFromTranWrdata = await getMergeScopePlotsFromTranWrdata();
    } catch (error) {
        res.status(500).json({
            ok: false,
            phase: "init",
            errors: ["Modules ngspice (netlist ou parseur resultats) indisponibles sur le serveur."],
            details: { message: error?.message || "" }
        });
        return;
    }

    const gs = Number(req.body?.gridStep);
    const deckOpts = Number.isFinite(gs) && gs > 0 ? { gridStep: gs } : {};
    const built = buildNgspiceDeck(state, deckOpts);
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
    const wavePathFs = path.join(tempDir, "tran_waves.txt");
    const wavePathSpice = wavePathFs.replace(/\\/g, "/");

    try {
        let deckText = built.netlist;
        if (built.analysisTran && typeof deckText === "string") {
            deckText = deckText.split("__TRAN_WAVE_PATH__").join(wavePathSpice);
        }
        await writeFile(netlistPath, deckText, "utf8");
        const runResult = await runNgspice(netlistPath, outputPath);
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
        const voltmeterValues = tran
            ? {}
            : mergeVoltmeterMeasurements(combinedLog, built.voltmeters, built.nodeMeasures || []);
        const ammeterValues = tran ? {} : mergeAmmeterMeasurements(combinedLog, built.ammeters || []);
        const ohmmeterValues = tran ? {} : mergeOhmmeterMeasurements(combinedLog, built.ohmeters || []);
        let scopePlots = {};
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
            /* Diagnostic visible dans Vérification → Journal */
            const linesCnt = waveTxt ? waveTxt.split("\n").length : 0;
            const plotKeys = Object.keys(scopePlots);
            waveDiag = [
                `[wrdata] Fichier courbes : ${waveTxt.length} octets, ${linesCnt} lignes`,
                `[wrdata] Premières données : ${waveTxt.slice(0, 300).replace(/\r/g, "") || "(vide)"}`,
                `[wrdata] Plots extraits : ${plotKeys.length ? plotKeys.join(", ") : "(aucun)"}`
            ].join("\n");
        }
        res.json({
            ok: true,
            warnings: built.warnings,
            netlist: deckText,
            log: [combinedLog || log, waveDiag].filter(Boolean).join("\n\n--- DIAGNOSTIC COURBES ---\n"),
            voltmeterValues,
            ammeterValues,
            ohmmeterValues,
            analysisTran: tran,
            scopePlots
        });
    } catch (error) {
        const missing = isNgspiceMissingError(error);
        const exeTried = /** @type {{ ngspiceExe?: string }} */ (error)?.ngspiceExe || ngspiceExecutablePath();
        const tailOut = [error?.stderr, error?.stdout, error?.message]
            .filter((x) => typeof x === "string" && x.trim())
            .join("\n")
            .trim()
            .slice(0, 2000);
        res.status(500).json({
            ok: false,
            phase: "run",
            errors: [
                missing
                    ? `ngspice introuvable ou non exécutable (essayé : ${exeTried}). En local : installe ngspice ou définis NGSPICE / NGSPICE_PATH vers ngspice.exe, puis relance npm start depuis le même terminal où « ngspice -v » fonctionne.`
                    : `Echec d'exécution ngspice (${exeTried}).${tailOut ? `\n\n${tailOut}` : ""}`,
            ],
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

// --- 5. COMPTEUR ---
let visitCount = 0;
if (fs.existsSync('./visits.json')) visitCount = JSON.parse(fs.readFileSync('./visits.json')).count || 0;
app.get('/api/counter', (req, res) => {
    visitCount++;
    fs.writeFileSync('./visits.json', JSON.stringify({ count: visitCount }));
    res.json({ count: visitCount });
});

// --- 6. AUTHENTIFICATION PROF ---
const authentificationProf = (req, res, next) => {
    if (!ADMIN_USER || !ADMIN_PASS) {
        return res.status(500).send(
            "Configuration admin manquante : définir ADMIN_USER et ADMIN_PASS dans les variables d'environnement du service (sur Render : Environment du Web Service, pas dans le Dockerfile)."
        );
    }

    const auth = req.headers.authorization;
    if (!auth) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Zone Prof"');
        return res.status(401).send("Identification requise.");
    }
    const credentials = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
    if (credentials[0] === ADMIN_USER && credentials[1] === ADMIN_PASS) return next();
    return res.status(401).send("Identifiants incorrects.");
};

// --- FONCTIONS DE SÉCURITÉ ---
// 1. Empêcher l'injection de scripts (XSS)
function escapeHtml(text) {
    if (!text) return text;
    return String(text).replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
}

// --- 7. ROUTES ÉLÈVES & DOCUMENTS ---
app.get('/projets.html', (req, res) => {
    const aujourdhui = new Date().toISOString().split('T')[0];
    const cartesHTML = Object.keys(planningProjets).map(p => {
        const ouvert = aujourdhui >= planningProjets[p];
        return `<a href="${ouvert ? '/'+p : '#'}" class="card" style="text-decoration:none; ${ouvert ? '' : 'opacity:0.5; cursor:not-allowed;'}">
                    <h2>${p.replace(/_/g, ' ')}</h2>
                    <p>${ouvert ? '✅ Ouvert' : '🔒 Dès le ' + planningProjets[p].split('-').reverse().join('/')}</p>
                </a>`;
    }).join('');
    res.send(`<html><head><meta charset="UTF-8"><link rel="stylesheet" href="style.css"></head><body style="background:#0f172a; color:white; font-family:sans-serif; padding:20px;"><h1>PROJETS STI2D</h1><div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:20px;">${cartesHTML}</div></body></html>`);
});

// Pages de cours
app.get('/Robotique', withProjectDateGate('Robotique', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ContenuRobotique.html'))));
app.get('/UltraSon', withProjectDateGate('UltraSon', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ultrason.html'))));
app.get('/Station_Meteo', withProjectDateGate('Station_Meteo', (req, res) => res.sendFile(path.join(__dirname, 'public', 'StationMeteoConnectee.html'))));
app.get('/Digicode', withProjectDateGate('Digicode', (req, res) => res.sendFile(path.join(__dirname, 'public', 'Digicode.html'))));
app.get('/Robo_Cytron_ESP32', withProjectDateGate('Robo_Cytron_ESP32', (req, res) => res.sendFile(path.join(__dirname, 'public', 'Robo_Cytron_ESP32.html'))));
app.get('/apps', (req, res) => res.sendFile(path.join(__dirname, 'public', 'apps.html')));
app.get('/docs', (req, res) => res.sendFile(path.join(__dirname, 'public', 'docs.html')));
app.get('/contact.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'contact.html')));

// Téléchargement sécurisé
app.get('/get-doc/:sousDossier/:nomFichier', (req, res) => {
    const { sousDossier, nomFichier } = req.params;
    
    // SÉCURITÉ : Empêcher de remonter dans l'arborescence (Path Traversal)
    if (sousDossier.includes('..') || nomFichier.includes('..') || nomFichier.includes('/') || nomFichier.includes('\\')) {
        return res.status(403).send("Accès interdit.");
    }

    const aujourdhui = new Date().toISOString().split('T')[0];
    const dateAcces = planningDocs[nomFichier];
    if (dateAcces && aujourdhui < dateAcces) return res.send(`<script>alert("🔒 Disponible le ${dateAcces.split('-').reverse().join('/')}"); window.history.back();</script>`);
    
    const filePath = path.join(dirDocs, sousDossier, nomFichier);
    
    // Vérifie que le fichier est bien DANS le dossier prévu
    if (filePath.startsWith(dirDocs) && fs.existsSync(filePath)) res.download(filePath);
    else res.status(404).send("Fichier introuvable ou accès refusé.");
});

// API pour masquer les boutons sur les pages de cours
app.get('/api/check-access/:nomFichier', (req, res) => {
    const aujourdhui = new Date().toISOString().split('T')[0];
    const dateAcces = planningDocs[req.params.nomFichier];
    res.json({ accessible : !dateAcces || aujourdhui >= dateAcces });
});

// --- 8. RÉCEPTION DES TP ---
app.post('/upload-tp', upload.single('tp_file'), (req, res) => {
    if (req.body.access_code !== "STI2D2026") {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.send("<script>alert('Code incorrect !'); window.history.back();</script>");
    }
    res.send("<body style='background:#0f172a; color:white; text-align:center;'><h1>✅ Bien reçu !</h1><a href='/' style='color:#00d1ff;'>Retour</a></body>");
});

// --- 8b. API TCHAT ---
app.get('/api/chat', (req, res) => res.json(chatMessages.slice(-50))); // Renvoie les 50 derniers messages

app.post('/api/chat', (req, res) => {
    const { author, text, isProf } = req.body;
    if(author && text) {
        // SÉCURITÉ : Nettoyage des entrées avant enregistrement (XSS)
        const msg = { id: Date.now(), time: new Date().toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'}), author: escapeHtml(author), text: escapeHtml(text), isProf: !!isProf };
        chatMessages.push(msg);
        if(chatMessages.length > 200) chatMessages.shift(); // Garde l'historique propre
        fs.writeFileSync('./chat_messages.json', JSON.stringify(chatMessages));
        res.json({success: true});
    } else res.status(400).json({error: "Données manquantes"});
});

// --- 8c. API ENVOI EMAIL ---
app.post('/api/send-email', async (req, res) => {
    const { name, email, message } = req.body;

    // Configuration de l'envoi (Gmail)
    // ⚠️ Remplacez le mot de passe ci-dessous par votre "Mot de passe d'application" Gmail
    // (https://myaccount.google.com/apppasswords)
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'manuel.hadot@gmail.com', // Votre adresse Gmail
            pass: process.env.GMAIL_PASS || 'krazgfcgsuusibbx' // Utilise la variable d'environnement si disponible
        }
    });

    const mailOptions = {
        from: '"Site STI2D" <manuel.hadot@gmail.com>', // L'expéditeur technique doit être votre compte pour passer les filtres Gmail
        to: 'manuel.hadot@gmail.com',
        replyTo: email, // Permet de répondre directement à l'élève en cliquant sur "Répondre"
        subject: `[Site STI2D] Nouveau message de ${name}`,
        text: `Nom: ${name}\nEmail de réponse: ${email}\n\nMessage:\n${message}`
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ success: true });
    } catch (error) {
        console.error("Erreur envoi mail:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Route obscure pour récupérer le lien d'administration (cache l'URL dans le code source client)
app.post('/api/admin-door', (req, res) => {
    res.json({ url: '/espace-correction' });
});

// --- 9. ESPACE PROF (VERSION BLINDÉE) ---
// --- 9. ESPACE PROF (CORRIGÉ & OPTIMISÉ) ---
app.get('/espace-correction', authentificationProf, (req, res) => {
    // 1. Préparation de la liste des documents
    let htmlDocs = "";
    mesSousDossiersDocs.forEach(sd => {
        const chemin = path.join(dirDocs, sd);
        const fichiers = fs.existsSync(chemin) ? fs.readdirSync(chemin).filter(f => !f.startsWith('.')) : [];
        
        htmlDocs += `<div style="margin-bottom:10px; border-left:3px solid #00d1ff; padding-left:10px;">
                        <b style="color:#00d1ff; font-size:0.9rem;">📁 ${sd}</b>`;
        if (fichiers.length === 0) htmlDocs += `<p style="color:#666; font-size:0.7rem;">(Vide)</p>`;
        else {
            fichiers.forEach(f => {
                htmlDocs += `<div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px; background:#333; padding:4px; border-radius:3px;">
                                <span style="font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:200px;" title="${escapeHtml(f)}">${escapeHtml(f)}</span>
                                <input type="date" name="${f}" value="${planningDocs[f] || ''}" style="font-size:0.7rem;">
                             </div>`;
            });
        }
        htmlDocs += `</div>`;
    });

    // 2. Génération du tableau des élèves (SORTI DE LA BOUCLE PRÉCÉDENTE)
    let htmlEleves = "";
    for (let classe in baseEleves) {
        htmlEleves += `
        <div style="margin-top:20px; background:#222; padding:15px; border-radius:8px;">
            <h3 style="color:#10b981; margin-top:0;">📊 Classe : ${classe}</h3>
            <table style="width:100%; border-collapse:collapse; color:white; font-size:0.9rem;">
                <thead>
                    <tr style="background:#00d1ff; color:black;">
                        <th style="padding:8px; text-align:left;">Nom</th>
                        <th style="padding:8px; text-align:left;">Prénom</th>
                        <th style="padding:8px; text-align:center;">Code Accès</th>
                        <th style="padding:8px; text-align:left;">Notes Quiz</th>
                        <th style="padding:8px; text-align:center;">Action</th>
                    </tr>
                </thead>
                <tbody>`;
        
        baseEleves[classe].forEach((e, index) => {
            let notesStr = Object.entries(e.notes).length > 0 
                ? Object.entries(e.notes).map(([q, n]) => `
                    <span style="display:inline-block; background:#444; padding:2px 5px; border-radius:4px; margin-right:5px; margin-bottom:2px;">
                        ${escapeHtml(q)}: <b>${n}/20</b>
                        <form action="/admin/supprimer-note" method="POST" style="display:inline;">
                            <input type="hidden" name="classe" value="${classe}">
                            <input type="hidden" name="code" value="${e.code}">
                            <input type="hidden" name="quiz" value="${q}">
                            <button type="submit" style="background:none; border:none; color:#ef4444; cursor:pointer; font-weight:bold; margin-left:5px; font-size:0.8rem;" title="Supprimer cette note">×</button>
                        </form>
                    </span>`).join(' ')
                : `<span style="color:#666;">Aucune note</span>`;
            
            htmlEleves += `
                <tr style="background:${index % 2 === 0 ? '#1a1a1a' : '#252525'}; border-bottom:1px solid #333;">
                    <td style="padding:8px;">${escapeHtml(e.nom)}</td>
                    <td style="padding:8px;">${escapeHtml(e.prenom)}</td>
                    <td style="padding:8px; text-align:center; font-family:monospace; color:#00d1ff;">${escapeHtml(e.code)}</td>
                    <td style="padding:8px;">${notesStr}</td>
                    <td style="padding:8px; text-align:center;">
                        <form action="/admin/supprimer-eleve" method="POST" onsubmit="return confirm('Supprimer définitivement cet élève ?');">
                            <input type="hidden" name="classe" value="${classe}">
                            <input type="hidden" name="code" value="${e.code}">
                            <button type="submit" style="background:#ef4444; color:white; border:none; padding:5px 10px; border-radius:3px; cursor:pointer;" title="Supprimer l'élève">🗑️</button>
                        </form>
                    </td>
                </tr>`;
        });
        htmlEleves += `</tbody></table></div>`;
    }

    // 3. Envoi du HTML final
    res.send(`
    <html lang="fr">
    <head><meta charset="UTF-8"><title>Admin STI2D</title></head>
    <body style="background:#121212; color:white; font-family:sans-serif; padding:20px;">
        <h1 style="margin-bottom:20px; border-bottom:2px solid #00d1ff; padding-bottom:10px;">👩‍🏫 Gestion Professeur</h1>
        
        <div style="background:#1e293b; padding:15px; border-radius:10px; border:1px solid #00d1ff; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center;">
            <h2 style="margin:0; color:#00d1ff; font-size:1.2rem;">🧩 Générateur de QCM</h2>
            <a href="/admin/export-csv" style="background:#eab308; color:#0f172a; text-decoration:none; padding:10px 20px; border-radius:5px; font-weight:bold;">📊 Exporter les Notes (.csv)</a>
            <a href="/admin/backup-zip" style="background:#f97316; color:white; text-decoration:none; padding:10px 20px; border-radius:5px; font-weight:bold; margin-left:10px;">💾 SAUVEGARDE TOTALE (.zip)</a>
            <a href="/gestion-quiz" style="background:#00d1ff; color:#0f172a; text-decoration:none; padding:10px 20px; border-radius:5px; font-weight:bold;">🛠️ Créer / Modifier un Quiz</a>
            <a href="/contact.html?prof=1" target="_blank" style="background:#10b981; color:white; text-decoration:none; padding:10px 20px; border-radius:5px; font-weight:bold; margin-left:10px;">💬 Accéder au Tchat</a>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:20px;">
            <section style="background:#1e1e1e; padding:15px; border-radius:10px;">
                <h2 style="font-size:1.1rem; border-bottom:1px solid #333; padding-bottom:5px;">🗓️ Dates Projets</h2>
                <form action="/update-dates" method="POST">
                    ${Object.keys(planningProjets).map(p => `
                        <div style="margin-bottom:10px;">
                            <label style="font-size:0.8rem; color:#bbb;">${p}</label>
                            <input type="date" name="${p}" value="${planningProjets[p]}" style="width:100%; padding:5px; margin-top:3px; background:#333; color:white; border:1px solid #444;">
                        </div>`).join('')}
                    <button type="submit" style="width:100%; background:#00c2ff; border:none; padding:10px; border-radius:5px; font-weight:bold; cursor:pointer;">💾 Sauvegarder Projets</button>
                </form>
            </section>

            <section style="background:#1e1e1e; padding:15px; border-radius:10px; border:1px solid #00d1ff;">
                <h2 style="font-size:1.1rem; color:#00d1ff; border-bottom:1px solid #333; padding-bottom:5px;">📄 Dates Documents</h2>
                <form action="/update-docs-dates" method="POST">
                    <div style="max-height:400px; overflow-y:auto;">${htmlDocs}</div>
                    <button type="submit" style="width:100%; background:#10b981; color:white; border:none; padding:10px; border-radius:5px; font-weight:bold; cursor:pointer; margin-top:10px;">💾 Sauvegarder Docs</button>
                </form>
            </section>

            <section style="background:#1e1e1e; padding:15px; border-radius:10px;">
                <h2 style="font-size:1.1rem; border-bottom:1px solid #333; padding-bottom:5px;">📥 Travaux reçus</h2>
                <div style="max-height:500px; overflow-y:auto;">
                    ${Object.keys(planningProjets).map(p => {
                        const copies = fs.existsSync(path.join(dirUploads, p)) ? fs.readdirSync(path.join(dirUploads, p)).filter(f => !f.startsWith('.')) : [];
                        return `<div style="margin-bottom:10px;">
                                    <b style="color:#10b981; font-size:0.9rem;">${p} (${copies.length})</b>
                                    <ul style="font-size:0.75rem; padding-left:15px; margin:5px 0; color:#aaa;">
                                        ${copies.map(c => {
                                            // Lien sécurisé pour le téléchargement
                                            return `<li style="margin-bottom:3px;">
                                                <a href="/download-copie/${p}/${c}" style="color:#00d1ff; text-decoration:none;">${escapeHtml(c)}</a>
                                            </li>`;
                                        }).join('')}
                                    </ul>
                                </div>`;
                    }).join('')}
                </div>
            </section>

            <section style="background:#1e1e1e; padding:20px; border-radius:10px; grid-column: 1 / -1; border-top: 4px solid #10b981;">
                <h2 style="color:#10b981; margin-top:0;">👥 Inscription des Élèves</h2>
                <form action="/admin/ajouter-eleve" method="POST" style="display:flex; gap:10px; flex-wrap:wrap; background:#111; padding:15px; border-radius:8px;">
                    <select name="classe" required style="padding:8px; border-radius:4px; border:none; background:#333; color:white; cursor:pointer;">
                        <option value="" disabled selected>Choisir une classe...</option>
                        ${mesClasses.map(c => `<option value="${c}">${c.replace(/_/g, ' ')}</option>`).join('')}
                    </select>
                    <input type="text" name="nom" placeholder="NOM" required style="padding:8px; border-radius:4px; border:none; background:#333; color:white;">
                    <input type="text" name="prenom" placeholder="Prénom" required style="padding:8px; border-radius:4px; border:none; background:#333; color:white;">
                    <input type="text" name="code" placeholder="Code (ex: JD123)" required style="padding:8px; border-radius:4px; border:none; background:#333; color:white;">
                    <button type="submit" style="background:#10b981; color:white; border:none; padding:8px 20px; border-radius:4px; font-weight:bold; cursor:pointer;">➕ Ajouter l'élève</button>
                </form>
                ${htmlEleves || "<p style='color:#666; margin-top:20px;'>Aucun élève inscrit pour le moment.</p>"}
            </section>
        </div>
    </body>
    </html>`);
});

// --- ROUTES DE SAUVEGARDE ---
app.post('/update-dates', authentificationProf, (req, res) => {
    planningProjets = Object.assign(planningProjets, req.body);
    fs.writeFileSync('./planning_projets.json', JSON.stringify(planningProjets));
    res.send("<script>alert('Dates Projets sauvegardées !'); window.location='/espace-correction';</script>");
});

app.post('/update-docs-dates', authentificationProf, (req, res) => {
    planningDocs = Object.assign(planningDocs, req.body);
    fs.writeFileSync('./planning_docs.json', JSON.stringify(planningDocs));
    res.send("<script>alert('Dates Documents sauvegardées !'); window.location='/espace-correction';</script>");
});

app.get('/download-copie/:projet/:file', authentificationProf, (req, res) => {
    const { projet, file } = req.params;
    // SÉCURITÉ : Empêcher le Path Traversal dans l'espace prof
    if (file.includes('..') || file.includes('/') || file.includes('\\') || projet.includes('..')) {
        return res.status(403).send("Accès interdit.");
    }
    res.download(path.join(dirUploads, projet, file));
});

// Route pour exporter les notes en CSV (Excel)
app.get('/admin/export-csv', authentificationProf, (req, res) => {
    let csvContent = "Classe;Nom;Prénom;Code;Moyenne;Détail_Notes\n";
    
    for (let classe in baseEleves) {
        baseEleves[classe].forEach(e => {
            const notes = Object.values(e.notes);
            const moyenne = notes.length > 0 ? (notes.reduce((a, b) => a + b, 0) / notes.length).toFixed(2) : "N/A";
            const detail = Object.entries(e.notes).map(([k, v]) => `${k}:${v}`).join('|');
            csvContent += `${classe};${e.nom};${e.prenom};${e.code};${moyenne.replace('.', ',')};${detail}\n`;
        });
    }

    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.attachment('notes_eleves.csv');
    res.send('\uFEFF' + csvContent); // \uFEFF force Excel à lire en UTF-8 (accents)
});

// Route pour télécharger une SAUVEGARDE COMPLÈTE (Backup ZIP)
app.get('/admin/backup-zip', authentificationProf, (req, res) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    res.attachment(`BACKUP_STI2D_${new Date().toISOString().slice(0,10)}.zip`);

    archive.on('error', (err) => res.status(500).send({ error: err.message }));
    archive.pipe(res);

    // Ajouter les fichiers JSON de données
    const files = ['eleves.json', 'quizzes.json', 'planning_projets.json', 'planning_docs.json', 'chat_messages.json', 'visits.json'];
    files.forEach(file => {
        if (fs.existsSync(file)) archive.file(file, { name: file });
    });

    // Ajouter le dossier des uploads élèves (optionnel, peut être lourd)
    // archive.directory(dirUploads, 'Travaux_Eleves'); 

    archive.finalize();
});

// --- ROUTES GESTION QUIZ ---

// 1. API pour uploader une image de question
app.post('/api/upload-asset', authentificationProf, uploadQuiz.single('file'), (req, res) => {
    if (req.file) res.json({ url: '/quiz-assets/' + req.file.filename });
    else res.status(500).json({ error: "Erreur upload" });
});

// 2. API pour sauvegarder un quiz
app.post('/api/save-quiz', authentificationProf, (req, res) => {
    const { id, title, questions } = req.body;
    const quizId = id || 'quiz_' + Date.now();
    quizzes[quizId] = { id: quizId, title, questions, date: new Date().toISOString().split('T')[0] };
    fs.writeFileSync('./quizzes.json', JSON.stringify(quizzes, null, 2));
    res.json({ success: true, id: quizId });
});

// 3. API pour récupérer la liste des quiz (Public pour l'index, ou Prof)
app.get('/api/list-quizzes', (req, res) => {
    const list = Object.values(quizzes).map(q => ({ id: q.id, title: q.title, count: q.questions.length }));
    res.json(list);
});

// 4. API pour récupérer un quiz complet (Client)
app.get('/api/get-quiz/:id', (req, res) => {
    const q = quizzes[req.params.id];
    if (q) res.json(q);
    else res.status(404).json({ error: "Quiz introuvable" });
});

// 5. API pour supprimer un quiz
app.post('/api/delete-quiz', authentificationProf, (req, res) => {
    const { id } = req.body;
    if (quizzes[id]) {
        delete quizzes[id];
        fs.writeFileSync('./quizzes.json', JSON.stringify(quizzes, null, 2));
    }
    res.json({ success: true });
});

// 6. Interface Graphique de création de Quiz
app.get('/gestion-quiz', authentificationProf, (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <title>Éditeur de Quiz</title>
        <style>
            body { background:#0f172a; color:white; font-family:sans-serif; padding:20px; max-width:1000px; margin:auto; }
            .header { display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #00d1ff; padding-bottom:15px; margin-bottom:20px; }
            .btn { padding:10px 15px; border:none; border-radius:5px; cursor:pointer; font-weight:bold; }
            .btn-primary { background:#00d1ff; color:#0f172a; }
            .btn-danger { background:#ef4444; color:white; }
            .btn-success { background:#10b981; color:white; }
            .quiz-item { background:#1e293b; padding:15px; margin-bottom:10px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; }
            .question-box { background:#334155; padding:15px; margin-bottom:15px; border-radius:8px; border-left:4px solid #00d1ff; }
            input[type="text"] { width:100%; padding:8px; margin:5px 0; background:#1e293b; border:1px solid #475569; color:white; border-radius:4px; }
            input[type="file"] { margin-top:5px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🛠️ Éditeur de Quiz</h1>
            <a href="/espace-correction" style="color:#00d1ff;">Retour Dashboard</a>
        </div>

        <div id="list-view">
            <button class="btn btn-success" onclick="createNew()">+ NOUVEAU QUIZ</button>
            <div id="quiz-list" style="margin-top:20px;"></div>
        </div>

        <div id="editor-view" style="display:none;">
            <input type="text" id="quiz-title" placeholder="Titre du Quiz (ex: Évaluation Réseaux)" style="font-size:1.5rem; margin-bottom:20px;">
            <div id="questions-container"></div>
            <button class="btn btn-primary" onclick="addQuestion()">+ Ajouter une question</button>
            <div style="margin-top:20px; border-top:1px solid #333; padding-top:20px;">
                <button class="btn btn-success" onclick="saveQuiz()">💾 ENREGISTRER LE QUIZ</button>
                <button class="btn btn-danger" onclick="cancelEdit()">Annuler</button>
            </div>
        </div>

        <script>
            let currentQuiz = { id: null, questions: [] };
            const API_URL = '/api';

            async function loadList() {
                const res = await fetch(API_URL + '/list-quizzes');
                const list = await res.json();
                document.getElementById('quiz-list').innerHTML = list.map(q => 
                    \`<div class="quiz-item">
                        <div><strong>\${q.title}</strong> (\${q.count} questions)</div>
                        <div>
                            <button class="btn btn-primary" onclick="editQuiz('\${q.id}')">Modifier</button>
                            <button class="btn btn-danger" onclick="deleteQuiz('\${q.id}')">Suppr</button>
                        </div>
                    </div>\`
                ).join('');
            }

            function createNew() {
                currentQuiz = { id: null, title: "", questions: [] };
                renderEditor();
                document.getElementById('list-view').style.display = 'none';
                document.getElementById('editor-view').style.display = 'block';
            }

            async function editQuiz(id) {
                const res = await fetch(API_URL + '/get-quiz/' + id);
                currentQuiz = await res.json();
                document.getElementById('quiz-title').value = currentQuiz.title;
                renderEditor();
                document.getElementById('list-view').style.display = 'none';
                document.getElementById('editor-view').style.display = 'block';
            }

            function renderEditor() {
                const container = document.getElementById('questions-container');
                container.innerHTML = "";
                currentQuiz.questions.forEach((q, idx) => {
                    container.innerHTML += \`
                    <div class="question-box" id="q-box-\${idx}">
                        <div style="display:flex; justify-content:space-between;">
                            <h3>Question \${idx + 1}</h3>
                            <button class="btn btn-danger" style="padding:2px 8px;" onclick="removeQuestion(\${idx})">X</button>
                        </div>
                        <input type="text" placeholder="Intitulé de la question" value="\${q.text}" onchange="updateQ(\${idx}, 'text', this.value)">
                        
                        <div style="margin:10px 0; background:#222; padding:10px; border-radius:4px;">
                            <label>📷 Image (optionnel) : </label>
                            \${q.image ? \`<img src="\${q.image}" height="50" style="vertical-align:middle; margin-right:10px;">\` : ''}
                            <input type="file" onchange="uploadImage(\${idx}, this)">
                        </div>

                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                            \${[0,1,2].map(i => \`
                                <div>
                                    <input type="radio" name="correct-\${idx}" \${q.correct == i ? 'checked' : ''} onclick="updateQ(\${idx}, 'correct', \${i})">
                                    <input type="text" placeholder="Réponse \${i+1}" value="\${q.answers[i] || ''}" onchange="updateAns(\${idx}, \${i}, this.value)" style="width:85%">
                                </div>
                            \`).join('')}
                        </div>
                    </div>\`;
                });
            }

            function addQuestion() {
                currentQuiz.questions.push({ text: "", answers: ["", "", ""], correct: 0, image: null });
                renderEditor();
            }

            function removeQuestion(idx) {
                currentQuiz.questions.splice(idx, 1);
                renderEditor();
            }

            function updateQ(idx, field, val) { currentQuiz.questions[idx][field] = val; }
            function updateAns(qIdx, aIdx, val) { currentQuiz.questions[qIdx].answers[aIdx] = val; }

            async function uploadImage(idx, input) {
                if(!input.files[0]) return;
                const formData = new FormData();
                formData.append('file', input.files[0]);
                const res = await fetch('/api/upload-asset', { method: 'POST', body: formData });
                const data = await res.json();
                currentQuiz.questions[idx].image = data.url;
                renderEditor();
            }

            async function saveQuiz() {
                const title = document.getElementById('quiz-title').value;
                if(!title) return alert("Veuillez mettre un titre !");
                
                await fetch('/api/save-quiz', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ id: currentQuiz.id, title, questions: currentQuiz.questions })
                });
                alert("Sauvegardé !");
                location.reload();
            }

            async function deleteQuiz(id) {
                if(confirm("Confirmer la suppression ?")) {
                    await fetch('/api/delete-quiz', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ id })
                    });
                    loadList();
                }
            }

            function cancelEdit() {
                document.getElementById('editor-view').style.display = 'none';
                document.getElementById('list-view').style.display = 'block';
            }

            loadList();
        </script>
    </body>
    </html>`);
});

// Route pour ajouter un élève (Interface Prof)
app.post('/admin/ajouter-eleve', authentificationProf, (req, res) => {
    const { classe, nom, prenom, code } = req.body;
    if (!baseEleves[classe]) baseEleves[classe] = [];
    // On nettoie les entrées au cas où (même si escapeHtml est utilisé à l'affichage)
    baseEleves[classe].push({ nom: nom.trim(), prenom: prenom.trim(), code: code.trim(), notes: {} });
    fs.writeFileSync('./eleves.json', JSON.stringify(baseEleves, null, 2));
    res.redirect('/espace-correction');
});

// Route pour supprimer un élève
app.post('/admin/supprimer-eleve', authentificationProf, (req, res) => {
    const { classe, code } = req.body;
    if (baseEleves[classe]) {
        // On ne garde que les élèves qui n'ont PAS le code sélectionné
        baseEleves[classe] = baseEleves[classe].filter(e => e.code !== code);
        
        // Si la classe est vide après suppression, on peut choisir de la supprimer aussi
        if (baseEleves[classe].length === 0) delete baseEleves[classe];
        
        fs.writeFileSync('./eleves.json', JSON.stringify(baseEleves, null, 2));
    }
    res.redirect('/espace-correction');
});

// Route pour supprimer une note
app.post('/admin/supprimer-note', authentificationProf, (req, res) => {
    const { classe, code, quiz } = req.body;
    if (baseEleves[classe]) {
        let eleve = baseEleves[classe].find(e => e.code === code);
        if (eleve && eleve.notes && eleve.notes[quiz]) {
            delete eleve.notes[quiz];
            fs.writeFileSync('./eleves.json', JSON.stringify(baseEleves, null, 2));
        }
    }
    res.redirect('/espace-correction');
});

// Route API pour que le Quiz envoie la note
app.post('/api/save-note', (req, res) => {
    const { codeEleve, quizNom, note } = req.body;
    let trouve = false;

    for (let classe in baseEleves) {
        let eleve = baseEleves[classe].find(e => e.code === codeEleve);
        if (eleve) {
            eleve.notes[quizNom] = note;
            trouve = true;
            break;
        }
    }

    if (trouve) {
        fs.writeFileSync('./eleves.json', JSON.stringify(baseEleves, null, 2));
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "Code élève inconnu" });
    }
});

app.listen(PORT, () => console.log(`🚀 Serveur en ligne : http://localhost:${PORT}`));