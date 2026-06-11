// speaker-audio.js — restitution carte son à partir des courbes .tran du haut-parleur
import { circuit } from './state.js';
import { reachableJonctions } from './Engine/hc90-cascade.mjs';

/** Tension crête de référence du circuit (plein volume numérique). */
export const SPEAKER_MAX_CIRCUIT_VOLTS = 5;

const AUDIO_HEADROOM = 0.88;
const TARGET_SAMPLE_RATE = 44100;
const FADE_IN_MS = 30;
const FADE_OUT_MS = 25;

const AC_SOURCE_TYPES = new Set(['gsin', 'gsqr', 'gimp']);

let audioCtx = null;
/** @type {AudioBufferSourceNode|null} */
let sourceNode = null;
/** @type {OscillatorNode|null} */
let oscNode = null;
let gainNode = null;
let filterNode = null;
let playing = false;
let animRaf = null;
let lastPlaySig = '';
let redraw = () => {};

export function bindSpeakerAudioRedraw(fn) {
    redraw = typeof fn === 'function' ? fn : () => {};
}

function ensureAudioContext() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
}

function speakerNet() {
    const sp = circuit.components.find((c) => c.type === 'speaker' && c.label);
    if (!sp) return new Set();
    const wires = circuit.wires || [];
    const auto = circuit.autoJunctions || [];
    const net = new Set([
        ...reachableJonctions(`${sp.label}_in`, wires, auto),
        ...reachableJonctions(`${sp.label}_out`, wires, auto),
    ]);
    return net;
}

function acSourceOnSpeakerNet(comp) {
    if (!comp?.label) return false;
    return speakerNet().has(`${comp.label}_out`);
}

function plotPeakVolts(plot) {
    if (!plot?.voltage?.length) return 0;
    let peak = 0;
    for (const v of plot.voltage) {
        const a = Math.abs(v);
        if (a > peak) peak = a;
    }
    return peak;
}

function voltsToGain(peakVolts) {
    if (!(peakVolts > 1e-4)) return AUDIO_HEADROOM * 0.5;
    return Math.min(1, (peakVolts / SPEAKER_MAX_CIRCUIT_VOLTS) * AUDIO_HEADROOM);
}

function buildDriveFromComp(comp, plot) {
    const freq = comp.frequency > 0 ? comp.frequency : 440;
    let wave = 'sine';
    if (comp.type === 'gsqr' || comp.type === 'gimp') wave = 'square';

    let nominalPeak = 5;
    if (comp.type === 'gsin') nominalPeak = comp.peakAmplitude ?? 5;
    else if (comp.type === 'gsqr') nominalPeak = comp.peakAmplitude ?? 5;
    else if (comp.type === 'gimp') nominalPeak = comp.voltageRail ?? 5;

    const peak = plotPeakVolts(plot);
    const amplitude = peak > 1e-3 ? voltsToGain(peak) : voltsToGain(nominalPeak);
    return { wave, frequency: freq, amplitude, sourceLabel: comp.label };
}

/**
 * Générateur Sin/Carré/Impulsions → OscillatorNode (pas de boucle .tran).
 * @param {{ time?: number[]; voltage?: number[] }} plot
 */
function detectOscillatorDrive(plot) {
    const speakers = circuit.components.filter((c) => c.type === 'speaker');
    const acSources = circuit.components.filter((c) => AC_SOURCE_TYPES.has(c.type));
    if (!speakers.length || !acSources.length) return null;

    for (const comp of acSources) {
        if (acSourceOnSpeakerNet(comp)) return buildDriveFromComp(comp, plot);
    }

    // Montage simple : un HP + un générateur (même si fils en T non détectés)
    if (acSources.length === 1 && speakers.length >= 1) {
        return buildDriveFromComp(acSources[0], plot);
    }

    // Priorité au sinus si présent avec un HP
    const gsin = acSources.find((c) => c.type === 'gsin');
    if (gsin) return buildDriveFromComp(gsin, plot);

    return null;
}

/** Signature stable (sans amplitude SPICE qui varie à chaque .tran). */
function driveSignature(drive) {
    if (!drive) return '';
    return `osc|${drive.wave}|${drive.frequency}|${drive.sourceLabel}`;
}

function interpolateVoltage(time, voltage, t) {
    if (!time?.length || !voltage?.length) return 0;
    if (t <= time[0]) return voltage[0];
    if (t >= time[time.length - 1]) return voltage[voltage.length - 1];
    for (let i = 1; i < time.length; i++) {
        if (t <= time[i]) {
            const t0 = time[i - 1];
            const t1 = time[i];
            const v0 = voltage[i - 1];
            const v1 = voltage[i];
            if (t1 <= t0) return v0;
            const u = (t - t0) / (t1 - t0);
            return v0 + u * (v1 - v0);
        }
    }
    return voltage[voltage.length - 1];
}

function estimatePeriodSec(time, voltage) {
    if (!time?.length || time.length < 8) return null;
    const mean = voltage.reduce((s, v) => s + v, 0) / voltage.length;
    const crossings = [];
    for (let i = 1; i < voltage.length; i++) {
        const a = voltage[i - 1] - mean;
        const b = voltage[i] - mean;
        if (a < 0 && b >= 0) crossings.push(time[i]);
    }
    if (crossings.length < 3) return null;
    let sum = 0;
    for (let i = 1; i < crossings.length; i++) sum += crossings[i] - crossings[i - 1];
    return (sum / (crossings.length - 1)) * 2;
}

function buildPeriodicLoopBuffer(plot, sampleRate) {
    const time = plot.time;
    const voltage = plot.voltage;
    const t0 = time[0];
    const tEnd = time[time.length - 1];
    const fullDuration = tEnd - t0;
    if (!Number.isFinite(fullDuration) || fullDuration <= 1e-9) return null;

    const period = estimatePeriodSec(time, voltage);
    if (!(period > 1e-9)) return null;

    const periodsInSpan = Math.max(2, Math.floor(fullDuration / period));
    const loopDuration = periodsInSpan * period;
    const loopT0 = t0 + fullDuration - loopDuration;
    if (loopDuration <= 1e-9) return null;

    const numSamples = Math.max(256, Math.round(loopDuration * sampleRate));
    const data = new Float32Array(numSamples);
    const scale = AUDIO_HEADROOM / SPEAKER_MAX_CIRCUIT_VOLTS;

    let sum = 0;
    for (let i = 0; i < numSamples; i++) {
        const t = loopT0 + (i / numSamples) * loopDuration;
        const v = interpolateVoltage(time, voltage, t);
        const s = Number.isFinite(v) ? v * scale : 0;
        data[i] = s;
        sum += s;
    }
    const mean = sum / numSamples;
    for (let i = 0; i < numSamples; i++) data[i] -= mean;

    const fadeSamples = Math.min(Math.floor(0.01 * sampleRate), Math.floor(numSamples / 8));
    if (fadeSamples >= 4) {
        for (let i = 0; i < fadeSamples; i++) {
            const w = i / fadeSamples;
            const tail = numSamples - fadeSamples + i;
            data[tail] = data[tail] * (1 - w) + data[i] * w;
        }
    }
    data[numSamples - 1] = data[0];

    for (let i = 0; i < numSamples; i++) {
        data[i] = Math.max(-1, Math.min(1, data[i]));
    }
    return { data };
}

function plotSignature(plot) {
    const t = plot?.time;
    const v = plot?.voltage;
    if (!t?.length || !v?.length) return '';
    const n = t.length;
    return `buf|${n}|${t[n - 1].toFixed(6)}`;
}

function connectOutputChain(ctx, outputNode, amplitude, useFilter) {
    let chain = outputNode;
    filterNode = null;

    if (useFilter) {
        filterNode = ctx.createBiquadFilter();
        filterNode.type = 'lowpass';
        filterNode.frequency.value = 6000;
        filterNode.Q.value = 0.5;
        chain.connect(filterNode);
        chain = filterNode;
    }

    gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(amplitude, ctx.currentTime + FADE_IN_MS / 1000);
    chain.connect(gainNode);
    gainNode.connect(ctx.destination);
}

function updateOscillatorLive(drive) {
    if (!oscNode || !gainNode || !audioCtx) return false;
    const t = audioCtx.currentTime;
    oscNode.frequency.setTargetAtTime(drive.frequency, t, 0.02);
    gainNode.gain.setTargetAtTime(drive.amplitude, t, 0.02);
    return true;
}

function startOscillatorPlayback(ctx, drive) {
    oscNode = ctx.createOscillator();
    oscNode.type = drive.wave;
    oscNode.frequency.value = drive.frequency;
    connectOutputChain(ctx, oscNode, drive.amplitude, drive.wave === 'square');
    oscNode.start(0);
}

function startBufferPlayback(ctx, plot) {
    const pcm = buildPeriodicLoopBuffer(plot, TARGET_SAMPLE_RATE);
    if (!pcm) return false;

    const buffer = ctx.createBuffer(1, pcm.data.length, TARGET_SAMPLE_RATE);
    buffer.getChannelData(0).set(pcm.data);

    sourceNode = ctx.createBufferSource();
    sourceNode.buffer = buffer;
    sourceNode.loop = true;
    sourceNode.loopStart = 0;
    sourceNode.loopEnd = buffer.duration;

    connectOutputChain(ctx, sourceNode, voltsToGain(plotPeakVolts(plot)), false);
    sourceNode.start(0);
    return true;
}

/**
 * @param {Record<string, { time?: number[]; voltage?: number[] }>} speakerPlots
 */
export function startSpeakerAudio(speakerPlots) {
    if (!speakerPlots || typeof speakerPlots !== 'object') return;

    const plots = Object.values(speakerPlots).filter(
        (p) => p?.time?.length >= 2 && p?.voltage?.length >= 2
    );
    if (!plots.length) return;

    const plot = plots[0];
    const drive = detectOscillatorDrive(plot);

    if (drive) {
        const sig = driveSignature(drive);
        if (playing && oscNode && sig === lastPlaySig) return;
        if (playing && oscNode && updateOscillatorLive(drive)) {
            lastPlaySig = sig;
            return;
        }
    } else if (playing && sourceNode) {
        const sig = plotSignature(plot);
        if (sig === lastPlaySig) return;
    }

    stopSpeakerAudio({ immediate: true });

    const ctx = ensureAudioContext();
    try {
        if (drive) {
            startOscillatorPlayback(ctx, drive);
            lastPlaySig = driveSignature(drive);
        } else if (!startBufferPlayback(ctx, plot)) {
            return;
        } else {
            lastPlaySig = plotSignature(plot);
        }
        playing = true;
        redraw();
        const tick = () => {
            if (!playing) return;
            redraw();
            animRaf = requestAnimationFrame(tick);
        };
        animRaf = requestAnimationFrame(tick);
    } catch {
        playing = false;
        sourceNode = null;
        oscNode = null;
        gainNode = null;
        filterNode = null;
        lastPlaySig = '';
    }
}

export function stopSpeakerAudio(opts = {}) {
    if (animRaf != null) cancelAnimationFrame(animRaf);
    animRaf = null;

    const immediate = opts.immediate === true;
    const ctx = audioCtx;
    const src = sourceNode;
    const osc = oscNode;
    const gain = gainNode;
    const filt = filterNode;

    sourceNode = null;
    oscNode = null;
    gainNode = null;
    filterNode = null;
    playing = false;
    lastPlaySig = '';

    if (!src && !osc) return;

    const finalize = () => {
        if (src) {
            try { src.stop(); } catch { /* */ }
            try { src.disconnect(); } catch { /* */ }
        }
        if (osc) {
            try { osc.stop(); } catch { /* */ }
            try { osc.disconnect(); } catch { /* */ }
        }
        try { filt?.disconnect(); } catch { /* */ }
        try { gain?.disconnect(); } catch { /* */ }
    };

    if (immediate || !ctx || !gain) {
        finalize();
        return;
    }

    const t = ctx.currentTime;
    try {
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.linearRampToValueAtTime(0, t + FADE_OUT_MS / 1000);
    } catch {
        finalize();
        return;
    }
    setTimeout(finalize, FADE_OUT_MS + 10);
}

export function isSpeakerAudioPlaying() {
    return playing;
}
