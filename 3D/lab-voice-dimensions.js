import { GRID_STEP, ROTATION_SNAP_DEG, snapValue } from "./grid-constants.js";

const SpeechRecognition =
    typeof window !== "undefined"
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : null;

/** @typedef {"scale"|"position"|"rotation"} VoiceTransformMode */

const FRENCH_UNITS = {
    zero: 0,
    zéro: 0,
    un: 1,
    une: 1,
    deux: 2,
    trois: 3,
    quatre: 4,
    cinq: 5,
    six: 6,
    sept: 7,
    huit: 8,
    neuf: 9,
    dix: 10,
    onze: 11,
    douze: 12,
    treize: 13,
    quatorze: 14,
    quinze: 15,
    seize: 16,
};

const FRENCH_TENS = {
    vingt: 20,
    trente: 30,
    quarante: 40,
    cinquante: 50,
    soixante: 60,
};

const CANCEL_WORDS = /\b(annuler|annule|stop|arrêter|arreter|abandonner)\b/i;

/** @type {Record<VoiceTransformMode, { label: string, axisLabels: Record<"x"|"y"|"z", string>, unit: string, requiresSelection: boolean }>} */
const MODE_CONFIG = {
    scale: {
        label: "Échelle",
        axisLabels: {
            x: "X (largeur)",
            y: "Y (profondeur)",
            z: "Z (hauteur)",
        },
        unit: "m",
        requiresSelection: false,
    },
    position: {
        label: "Position",
        axisLabels: {
            x: "X (largeur)",
            y: "Y (profondeur)",
            z: "Z (hauteur)",
        },
        unit: "m",
        requiresSelection: true,
    },
    rotation: {
        label: "Rotation",
        axisLabels: {
            x: "X (°)",
            y: "Y (° prof.)",
            z: "Z (° haut.)",
        },
        unit: "°",
        requiresSelection: true,
    },
};

/** @param {VoiceTransformMode} mode */
function getModeConfig(mode) {
    return MODE_CONFIG[mode] ?? MODE_CONFIG.scale;
}

/** @param {string} text */
function normalizeSpeech(text) {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\b(x|y|z)\b/g, " ")
        .replace(/\bmètres?\b/g, " ")
        .replace(/\bmetres?\b/g, " ")
        .replace(/\bmetre\b/g, " ")
        .replace(/\bdegres?\b/g, " ")
        .replace(/\b°\b/g, " ")
        .replace(/\bm\b/g, " ")
        .replace(/\bnégatif\b/g, " moins ")
        .replace(/\bnegatif\b/g, " moins ")
        .replace(/\bvirgule\b/g, ".")
        .replace(/\bpoint\b/g, ".")
        .replace(/[,]/g, ".")
        .replace(/\s+/g, " ")
        .trim();
}

/** @param {string} token */
function parseFrenchToken(token) {
    if (!token) return null;
    const cleaned = token.replace(/-/g, " ").trim();
    if (/^\d+(\.\d+)?$/.test(cleaned)) return parseFloat(cleaned);

    if (FRENCH_UNITS[cleaned] !== undefined) return FRENCH_UNITS[cleaned];

    const tensMatch = cleaned.match(
        /^(vingt|trente|quarante|cinquante|soixante)(?:\s+(et\s+)?(un|deux|trois|quatre|cinq|six|sept|huit|neuf))?$/
    );
    if (tensMatch) {
        const base = FRENCH_TENS[tensMatch[1]] ?? null;
        if (base === null) return null;
        const unit = tensMatch[3] ? (FRENCH_UNITS[tensMatch[3]] ?? 0) : 0;
        return base + unit;
    }

    return null;
}

/** @param {string} text */
function parseSingleValue(text) {
    let normalized = normalizeSpeech(text);
    if (!normalized) return null;

    let sign = 1;
    if (/\bmoins\b/.test(normalized) || /^-\s*\d/.test(normalized)) {
        sign = -1;
        normalized = normalized.replace(/\bmoins\b/g, " ").replace(/^-\s*/, "").trim();
    }

    const decimalMatch = normalized.match(/(\d+)\s*\.\s*(\d+)/);
    if (decimalMatch) return sign * parseFloat(`${decimalMatch[1]}.${decimalMatch[2]}`);

    const digitMatch = normalized.match(/\b(\d+(?:\.\d+)?)\b/);
    if (digitMatch) return sign * parseFloat(digitMatch[1]);

    for (const [word, value] of Object.entries(FRENCH_UNITS)) {
        if (new RegExp(`\\b${word}\\b`).test(normalized)) return sign * value;
    }

    for (const token of normalized.split(" ")) {
        const parsed = parseFrenchToken(token);
        if (parsed !== null) return sign * parsed;
    }

    return null;
}

/**
 * @param {number} value
 * @param {VoiceTransformMode} mode
 * @param {boolean} snapEnabled
 */
function clampVoiceValue(value, mode, snapEnabled) {
    if (!Number.isFinite(value)) return null;

    if (mode === "scale") {
        if (value <= 0) return null;
        const min = snapEnabled ? GRID_STEP : 0.1;
        const clamped = Math.min(50, Math.max(min, value));
        return snapEnabled ? Math.max(GRID_STEP, snapValue(clamped, GRID_STEP)) : clamped;
    }

    if (mode === "position") {
        let v = value;
        if (snapEnabled) v = snapValue(v, GRID_STEP);
        return Math.min(50, Math.max(-50, v));
    }

    let v = value;
    if (snapEnabled) v = snapValue(v, ROTATION_SNAP_DEG);
    return Math.min(360, Math.max(-360, v));
}

function getMicrophoneHelpMessage() {
    const host = window.location.hostname;
    const port = window.location.port || "3000";

    if (!window.isSecureContext) {
        if (host !== "localhost" && host !== "127.0.0.1") {
            return `Micro indisponible en HTTP via ${host}. Ouvrez http://localhost:${port}/3D/ sur ce PC.`;
        }
        return "Micro indisponible — HTTPS ou localhost requis.";
    }

    return "Micro refusé — icône cadenas ou caméra dans la barre d’adresse → Autoriser le micro, puis recliquez.";
}

/** @param {MediaStream} stream */
function releaseStream(stream) {
    for (const track of stream.getTracks()) {
        track.stop();
    }
}

/**
 * @param {VoiceTransformMode} mode
 * @param {number | null} value
 */
function formatVoiceValue(mode, value) {
    if (value === null) return "—";
    const unit = getModeConfig(mode).unit;
    if (mode === "rotation") return `${value.toFixed(0)}${unit}`;
    return `${value.toFixed(1)} ${unit}`;
}

/**
 * Y/Z inversés comme pour l'échelle : voix Y → axe Z scène, voix Z → axe Y scène.
 * @param {{ x: number, y: number, z: number }} values
 */
function mapVoiceToScene(values) {
    return { x: values.x, y: values.z, z: values.y };
}

/**
 * @param {{
 *   voiceBtn: HTMLButtonElement,
 *   voicePanel: HTMLElement,
 *   voiceModeSelect: HTMLSelectElement,
 *   voiceStartBtn: HTMLButtonElement,
 *   voiceX: HTMLOutputElement,
 *   voiceY: HTMLOutputElement,
 *   voiceZ: HTMLOutputElement,
 *   voiceHint: HTMLElement,
 *   showStatus?: (msg: string) => void,
 *   getSelectedCube: () => import("three").Object3D | null,
 *   applyCubeDimensions: (dims: { x: number, y: number, z: number }) => void,
 *   applyCubePosition: (pos: { x: number, y: number, z: number }) => void,
 *   applyCubeRotation: (rotDeg: { x: number, y: number, z: number }) => void,
 *   getSnapEnabled: (mode: VoiceTransformMode) => boolean,
 * }} options
 */
export function initVoiceTransformController(options) {
    const {
        voiceBtn,
        voicePanel,
        voiceModeSelect,
        voiceStartBtn,
        voiceX,
        voiceY,
        voiceZ,
        voiceHint,
        showStatus,
        getSelectedCube,
        applyCubeDimensions,
        applyCubePosition,
        applyCubeRotation,
        getSnapEnabled,
    } = options;

    /** @type {"idle"|"x"|"y"|"z"} */
    let step = "idle";
    let panelOpen = false;
    let sessionActive = false;
    let micPermissionOk = false;
    let awaitingSpeechResult = false;
    /** @type {SpeechRecognition | null} */
    let recognition = null;
    /** @type {{ x: number | null, y: number | null, z: number | null }} */
    let values = { x: null, y: null, z: null };

    const stepOutputs = { x: voiceX, y: voiceY, z: voiceZ };
    const stepEls = voicePanel.querySelectorAll(".lab-voice-panel__step");

    function getMode() {
        const value = voiceModeSelect.value;
        if (value === "position" || value === "rotation") return value;
        return "scale";
    }

    function syncPanel() {
        const mode = getMode();
        voiceX.textContent = formatVoiceValue(mode, values.x);
        voiceY.textContent = formatVoiceValue(mode, values.y);
        voiceZ.textContent = formatVoiceValue(mode, values.z);

        for (const el of stepEls) {
            const axis = el.getAttribute("data-axis");
            el.classList.toggle("is-active", sessionActive && axis === step);
            el.classList.toggle("is-done", axis && values[axis] !== null);
        }

        voiceBtn.classList.toggle("is-active", panelOpen || sessionActive);
        voiceBtn.classList.toggle("is-listening", sessionActive && step !== "idle");
        voiceBtn.setAttribute("aria-pressed", panelOpen || sessionActive ? "true" : "false");
        voicePanel.hidden = !panelOpen;
        voiceModeSelect.disabled = sessionActive;
        voiceStartBtn.disabled = sessionActive;
    }

    function setHint(message) {
        voiceHint.textContent = message;
    }

    function resetSession() {
        step = "idle";
        sessionActive = false;
        awaitingSpeechResult = false;
        values = { x: null, y: null, z: null };
        stopRecognition();
        syncPanel();
        updateIdleHint();
    }

    function updateIdleHint() {
        if (sessionActive) return;
        const config = getModeConfig(getMode());
        setHint(`Mode ${config.label} — cliquez Écouter puis annoncez X, Y et Z`);
    }

    function stopRecognition() {
        awaitingSpeechResult = false;
        if (!recognition) return;
        try {
            recognition.onresult = null;
            recognition.onerror = null;
            recognition.onend = null;
            recognition.stop();
        } catch {
            /* ignore */
        }
        recognition = null;
    }

    async function queryMicrophonePermissionState() {
        if (!navigator.permissions?.query) return "unknown";
        try {
            const status = await navigator.permissions.query({ name: "microphone" });
            return status.state;
        } catch {
            return "unknown";
        }
    }

    async function ensureMicrophoneAccess() {
        if (!window.isSecureContext) {
            throw new Error("insecure");
        }

        const permissionState = await queryMicrophonePermissionState();
        if (permissionState === "granted") {
            micPermissionOk = true;
            return;
        }
        if (permissionState === "denied") {
            throw new Error("denied");
        }

        if (!navigator.mediaDevices?.getUserMedia) {
            micPermissionOk = true;
            return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
        });
        releaseStream(stream);
        micPermissionOk = true;
        await new Promise((resolve) => window.setTimeout(resolve, 120));
    }

    function reportMicrophoneError(error) {
        const code = error instanceof Error ? error.message : String(error);
        const name = error instanceof DOMException ? error.name : "";

        if (code === "insecure" || name === "SecurityError") {
            showStatus?.(getMicrophoneHelpMessage());
            setHint(getMicrophoneHelpMessage());
            return;
        }

        if (code === "denied" || name === "NotAllowedError" || name === "PermissionDeniedError") {
            const message = getMicrophoneHelpMessage();
            showStatus?.(message);
            setHint(message);
            return;
        }

        if (code === "unsupported") {
            showStatus?.("Micro non disponible dans ce navigateur");
            setHint("Utilisez Chrome ou Edge récent");
            return;
        }

        if (name === "NotFoundError") {
            showStatus?.("Aucun micro détecté sur cet appareil");
            setHint("Branchez un micro puis réessayez");
            return;
        }

        showStatus?.("Impossible d’accéder au micro — réessayez");
        setHint("Cliquez le micro pour réessayer");
    }

    function finishSession() {
        const mode = getMode();
        const config = getModeConfig(mode);
        const snapEnabled = getSnapEnabled(mode);
        const x = clampVoiceValue(values.x, mode, snapEnabled);
        const y = clampVoiceValue(values.y, mode, snapEnabled);
        const z = clampVoiceValue(values.z, mode, snapEnabled);

        if (x === null || y === null || z === null) {
            showStatus?.("Valeurs invalides — réessayez");
            resetSession();
            return;
        }

        const sceneValues = mapVoiceToScene({ x, y, z });

        if (mode === "scale") {
            applyCubeDimensions(sceneValues);
            const target = getSelectedCube();
            const prefix = target ? "Cube dimensionné" : "Cube créé";
            showStatus?.(`${prefix} : ${x.toFixed(1)} × ${z.toFixed(1)} × ${y.toFixed(1)} m`);
        } else if (mode === "position") {
            applyCubePosition(sceneValues);
            showStatus?.(`Position : ${x.toFixed(1)} · ${z.toFixed(1)} · ${y.toFixed(1)} m`);
        } else {
            applyCubeRotation(sceneValues);
            showStatus?.(`Rotation : ${x.toFixed(0)}° · ${z.toFixed(0)}° · ${y.toFixed(0)}°`);
        }

        resetSession();
    }

    function advanceStep() {
        const mode = getMode();
        const labels = getModeConfig(mode).axisLabels;

        if (step === "x") {
            step = "y";
            syncPanel();
            setHint(`Écoute… dites ${labels.y}`);
            startListening();
            return;
        }
        if (step === "y") {
            step = "z";
            syncPanel();
            setHint(`Écoute… dites ${labels.z}`);
            startListening();
            return;
        }
        if (step === "z") {
            finishSession();
        }
    }

    /** @param {string} text */
    function handleFinalTranscript(text) {
        awaitingSpeechResult = false;
        if (!text.trim() || !sessionActive) return;
        if (step !== "x" && step !== "y" && step !== "z") return;

        const mode = getMode();
        const labels = getModeConfig(mode).axisLabels;

        if (CANCEL_WORDS.test(text)) {
            showStatus?.(`${getModeConfig(mode).label} vocal annulé`);
            resetSession();
            return;
        }

        const raw = parseSingleValue(text);
        if (raw === null) {
            setHint(`Je n'ai pas compris — répétez ${labels[step]}`);
            startListening();
            return;
        }

        const snapEnabled = getSnapEnabled(mode);
        const clamped = clampVoiceValue(raw, mode, snapEnabled);
        if (clamped === null) {
            const hint =
                mode === "scale"
                    ? "Valeur invalide — donnez un nombre positif en mètres"
                    : mode === "position"
                      ? "Valeur invalide — position en mètres"
                      : "Valeur invalide — angle en degrés";
            setHint(hint);
            startListening();
            return;
        }

        values[step] = clamped;
        stepOutputs[step].textContent = formatVoiceValue(mode, clamped);
        syncPanel();
        advanceStep();
    }

    function scheduleListenRetry(delayMs = 400) {
        window.setTimeout(() => {
            if (sessionActive && step !== "idle" && !recognition) {
                startListening();
            }
        }, delayMs);
    }

    function startListening() {
        if (!SpeechRecognition) {
            showStatus?.("Reconnaissance vocale non supportée dans ce navigateur");
            resetSession();
            return;
        }

        stopRecognition();
        awaitingSpeechResult = true;

        const mode = getMode();
        const labels = getModeConfig(mode).axisLabels;

        const instance = new SpeechRecognition();
        recognition = instance;
        instance.lang = "fr-FR";
        instance.continuous = false;
        instance.interimResults = true;
        instance.maxAlternatives = 1;

        instance.onresult = (event) => {
            let interim = "";
            let finalText = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                const transcript = result[0]?.transcript ?? "";
                if (result.isFinal) {
                    finalText += transcript;
                } else {
                    interim += transcript;
                }
            }
            if (interim && step !== "idle") {
                setHint(`Écoute… ${labels[step]} — « ${interim.trim()} »`);
            }
            if (finalText) {
                handleFinalTranscript(finalText);
            }
        };

        instance.onerror = (event) => {
            if (event.error === "aborted") return;

            if (event.error === "no-speech") {
                awaitingSpeechResult = false;
                if (sessionActive && step !== "idle") {
                    setHint(`Aucune voix — répétez ${labels[step]}`);
                    scheduleListenRetry(500);
                }
                return;
            }

            awaitingSpeechResult = false;
            if (event.error === "not-allowed" || event.error === "audio-capture") {
                micPermissionOk = false;
                reportMicrophoneError(new DOMException("NotAllowedError", "NotAllowedError"));
            } else {
                showStatus?.(`Erreur micro (${event.error}) — réessayez`);
            }
            resetSession();
        };

        instance.onend = () => {
            const shouldRetry =
                sessionActive &&
                step !== "idle" &&
                awaitingSpeechResult &&
                recognition === instance;
            recognition = null;
            if (shouldRetry) {
                scheduleListenRetry(250);
            }
        };

        try {
            instance.start();
        } catch (error) {
            awaitingSpeechResult = false;
            reportMicrophoneError(error);
            resetSession();
        }
    }

    async function startSession() {
        if (!SpeechRecognition) {
            showStatus?.("Utilisez Chrome ou Edge pour la commande vocale");
            return;
        }

        const mode = getMode();
        const config = getModeConfig(mode);

        if (config.requiresSelection && !getSelectedCube()) {
            showStatus?.("Sélectionnez un cube avant de parler");
            return;
        }

        voicePanel.hidden = false;
        setHint("Autorisation du micro…");

        if (!micPermissionOk) {
            try {
                await ensureMicrophoneAccess();
            } catch (error) {
                reportMicrophoneError(error);
                return;
            }
        }

        sessionActive = true;
        step = "x";
        values = { x: null, y: null, z: null };
        syncPanel();

        if (mode === "scale" && !getSelectedCube()) {
            setHint(`Écoute… dites ${config.axisLabels.x} (un cube sera créé)`);
        } else {
            setHint(`Écoute… dites ${config.axisLabels.x}`);
        }
        startListening();
    }

    voiceBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        if (sessionActive) {
            showStatus?.("Commande vocale arrêtée");
            resetSession();
            return;
        }
        panelOpen = !panelOpen;
        syncPanel();
        if (panelOpen) {
            updateIdleHint();
        }
    });

    voiceStartBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        if (sessionActive) return;
        void startSession();
    });

    voiceModeSelect.addEventListener("change", () => {
        if (sessionActive) return;
        values = { x: null, y: null, z: null };
        syncPanel();
        updateIdleHint();
    });

    resetSession();

    return {
        isActive: () => sessionActive,
        stop: resetSession,
    };
}

/** @deprecated Alias — préférez initVoiceTransformController */
export const initVoiceDimensionsController = initVoiceTransformController;
