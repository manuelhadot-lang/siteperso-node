// bode-popup.js — fenêtre diagramme de Bode (gain en dB, axe fréquence semi-log)
import { flags, simulationResults } from './state.js';

let popupComp = null;
let popupCanvas = null;
let popupCtx = null;

let floatX = 140;
let floatY = 90;
let dragging = false;
let dragOffX = 0;
let dragOffY = 0;

/** Curseur souris : fréquence (Hz) sous le pointeur, null = masqué */
let cursorFreqHz = null;

/** Géométrie du dernier tracé (pour convertir souris ↔ fréquence) */
let plotGeom = null;

const popupEl = () => document.getElementById('bode-popup');
const titleEl = () => document.getElementById('bode-popup-title');
const infoEl = () => document.getElementById('bode-popup-info');

function getBodePlotForComp(comp) {
    if (!comp) return null;
    const plots = simulationResults.bodePlots;
    if (!plots || typeof plots !== 'object') return null;
    if (plots[comp.label]) return plots[comp.label];
    const keys = Object.keys(plots);
    if (keys.length === 1) return plots[keys[0]];
    return null;
}

function applyFloatPosition() {
    const el = popupEl();
    if (!el) return;
    el.style.left = `${floatX}px`;
    el.style.top = `${floatY}px`;
}

function formatFreqHz(f) {
    if (!Number.isFinite(f) || f <= 0) return '?';
    if (f >= 1e6) return `${(f / 1e6).toFixed(f >= 10e6 ? 0 : 2)} MHz`;
    if (f >= 1000) return `${(f / 1000).toFixed(f >= 10e3 ? 1 : 2)} kHz`;
    return `${f < 10 ? f.toFixed(2) : Math.round(f * 10) / 10} Hz`;
}

function freqToX(freq, fMin, fMax, x0, plotW) {
    const lo = Math.log10(Math.max(fMin, 1e-6));
    const hi = Math.log10(Math.max(fMax, fMin * 1.01));
    const f = Math.max(freq, fMin);
    return x0 + ((Math.log10(f) - lo) / (hi - lo)) * plotW;
}

function xToFreq(x, fMin, fMax, x0, plotW) {
    const lo = Math.log10(Math.max(fMin, 1e-6));
    const hi = Math.log10(Math.max(fMax, fMin * 1.01));
    const t = Math.max(0, Math.min(1, (x - x0) / plotW));
    return Math.pow(10, lo + t * (hi - lo));
}

function gainToY(gainDb, gMin, gMax, y0, plotH) {
    const t = (gainDb - gMin) / Math.max(gMax - gMin, 1e-6);
    return y0 + plotH - t * plotH;
}

function interpolateGainDb(frequency, gainDb, f) {
    if (!frequency?.length || f <= 0) return NaN;
    if (f <= frequency[0]) return gainDb[0];
    if (f >= frequency[frequency.length - 1]) return gainDb[gainDb.length - 1];
    for (let i = 1; i < frequency.length; i++) {
        if (f <= frequency[i]) {
            const f0 = frequency[i - 1];
            const f1 = frequency[i];
            const g0 = gainDb[i - 1];
            const g1 = gainDb[i];
            if (f1 <= f0) return g0;
            const t = (Math.log10(f) - Math.log10(f0)) / (Math.log10(f1) - Math.log10(f0));
            return g0 + t * (g1 - g0);
        }
    }
    return gainDb[gainDb.length - 1];
}

function drawBodeGrid(ctx, x0, y0, plotW, plotH, fMin, fMax, gMin, gMax) {
    ctx.strokeStyle = '#1a3a4a';
    ctx.lineWidth = 1;
    const decades = Math.max(1, Math.ceil(Math.log10(fMax / Math.max(fMin, 1e-6))));
    for (let d = 0; d <= decades; d++) {
        const f = fMin * Math.pow(10, (d / decades) * Math.log10(fMax / fMin));
        const x = freqToX(f, fMin, fMax, x0, plotW);
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y0 + plotH);
        ctx.stroke();
    }
    for (let i = 0; i <= 4; i++) {
        const y = y0 + (i / 4) * plotH;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 + plotW, y);
        ctx.stroke();
    }
}

function drawFreqLabels(ctx, x0, y0, plotW, plotH, fMin, fMax) {
    ctx.fillStyle = '#8899aa';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const ticks = [fMin, fMin * 10, fMin * 100, fMin * 1000, fMax].filter((f) => f >= fMin && f <= fMax * 1.001);
    const seen = new Set();
    for (const f of ticks) {
        const key = Math.round(Math.log10(f) * 100);
        if (seen.has(key)) continue;
        seen.add(key);
        ctx.fillText(formatFreqHz(f), freqToX(f, fMin, fMax, x0, plotW), y0 + plotH + 6);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.translate(x0 - 8, y0 + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Gain (dB)', 0, 0);
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.fillText('Fréquence', x0 + plotW / 2, y0 + plotH + 22);
}

function drawGainLabels(ctx, x0, y0, plotH, gMin, gMax) {
    ctx.fillStyle = '#8899aa';
    ctx.font = '10px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
        const g = gMin + (i / 4) * (gMax - gMin);
        ctx.fillText(`${g.toFixed(0)}`, x0 - 6, gainToY(g, gMin, gMax, y0, plotH));
    }
}

function drawCursor(ctx, plot, geom) {
    if (cursorFreqHz == null || !plot?.frequency?.length || !geom) return;
    const { x0, y0, plotW, plotH, fMin, fMax, gMin, gMax } = geom;
    const f = Math.max(fMin, Math.min(fMax, cursorFreqHz));
    const gain = interpolateGainDb(plot.frequency, plot.gainDb, f);
    if (!Number.isFinite(gain)) return;
    const cx = freqToX(f, fMin, fMax, x0, plotW);
    const cy = gainToY(gain, gMin, gMax, y0, plotH);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, plotW, plotH);
    ctx.clip();
    ctx.strokeStyle = '#ff9800';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, y0);
    ctx.lineTo(cx, y0 + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ff9800';
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    if (infoEl()) {
        let txt = `f = ${formatFreqHz(f)}  |  Gain = ${gain.toFixed(2)} dB`;
        if (plot.responseHint?.includes('passe-haut')) {
            txt += `  — ${plot.responseHint}`;
        }
        infoEl().textContent = txt;
    }
}

function updateCursorFromMouse(clientX, clientY) {
    if (!plotGeom || !popupCanvas) return;
    const rect = popupCanvas.getBoundingClientRect();
    const scaleX = popupCanvas.width / rect.width;
    const scaleY = popupCanvas.height / rect.height;
    const mx = (clientX - rect.left) * scaleX;
    const my = (clientY - rect.top) * scaleY;
    const { x0, y0, plotW, plotH, fMin, fMax } = plotGeom;
    if (mx < x0 || mx > x0 + plotW || my < y0 || my > y0 + plotH) return;
    cursorFreqHz = xToFreq(mx, fMin, fMax, x0, plotW);
    renderBodePopup();
}

export function isBodePopupOpen() {
    const el = popupEl();
    return popupComp != null && el && !el.classList.contains('hidden');
}

export function renderBodePopup() {
    if (!popupComp || !popupCtx || !popupCanvas) return;
    const w = popupCanvas.width;
    const h = popupCanvas.height;
    const margin = { l: 52, r: 20, t: 28, b: 44 };
    const plotW = w - margin.l - margin.r;
    const plotH = h - margin.t - margin.b;
    const x0 = margin.l;
    const y0 = margin.t;

    popupCtx.fillStyle = '#050a0e';
    popupCtx.fillRect(0, 0, w, h);

    const plot = getBodePlotForComp(popupComp);
    plotGeom = null;

    if (!flags.isSimulating || !plot?.frequency?.length) {
        if (infoEl()) {
            infoEl().textContent = flags.isSimulating
                ? 'Sin requis — + sur la sortie du filtre, − sur la masse'
                : 'Lancez la simulation';
        }
        popupCtx.fillStyle = '#8899aa';
        popupCtx.font = '13px Arial';
        popupCtx.textAlign = 'center';
        popupCtx.textBaseline = 'middle';
        const lines = flags.isSimulating
            ? ['Aucune courbe', 'Générateur Sin + filtre RC/RL/RLC']
            : ['Lancez la simulation pour voir le diagramme de Bode'];
        lines.forEach((line, i) => {
            popupCtx.fillText(line, w / 2, h / 2 - 10 + i * 20);
        });
        return;
    }

    const { frequency, gainDb, fMin, fMax } = plot;
    let gMin = Math.min(...gainDb);
    let gMax = Math.max(...gainDb);
    if (gMax - gMin < 6) {
        const mid = (gMax + gMin) / 2;
        gMin = mid - 6;
        gMax = mid + 6;
    } else {
        gMin -= 2;
        gMax += 2;
    }

    plotGeom = { x0, y0, plotW, plotH, fMin, fMax, gMin, gMax };

    if (cursorFreqHz == null && frequency.length > 0) {
        const midIdx = Math.floor(frequency.length / 2);
        cursorFreqHz = frequency[midIdx];
    }

    drawBodeGrid(popupCtx, x0, y0, plotW, plotH, fMin, fMax, gMin, gMax);
    drawGainLabels(popupCtx, x0, y0, plotH, gMin, gMax);
    drawFreqLabels(popupCtx, x0, y0, plotW, plotH, fMin, fMax);

    popupCtx.save();
    popupCtx.beginPath();
    popupCtx.rect(x0, y0, plotW, plotH);
    popupCtx.clip();
    popupCtx.strokeStyle = '#7cff6b';
    popupCtx.lineWidth = 2;
    popupCtx.beginPath();
    let started = false;
    for (let i = 0; i < frequency.length; i++) {
        const x = freqToX(frequency[i], fMin, fMax, x0, plotW);
        const y = gainToY(gainDb[i], gMin, gMax, y0, plotH);
        if (!started) {
            popupCtx.moveTo(x, y);
            started = true;
        } else {
            popupCtx.lineTo(x, y);
        }
    }
    if (started) popupCtx.stroke();
    popupCtx.restore();

    drawCursor(popupCtx, plot, plotGeom);

    if (infoEl() && cursorFreqHz == null && plot.responseHint?.includes('passe-haut')) {
        infoEl().textContent = plot.responseHint;
    }

    popupCtx.fillStyle = plot.responseHint?.includes('passe-haut') ? '#ff9800' : '#7cff6b';
    popupCtx.font = '12px Arial';
    popupCtx.textAlign = 'left';
    const title =
        plot.responseHint?.includes('passe-haut')
            ? '⚠ Passe-haut — vérifiez le câblage (+ jonction R/C, − GND)'
            : '|H(jω)| — déplacez la souris sur la courbe';
    popupCtx.fillText(title, margin.l, 16);
}

export function refreshBodePopup() {
    if (isBodePopupOpen()) renderBodePopup();
}

export function openBodePopup(comp) {
    if (!comp || comp.type !== 'bode_analyzer') return;
    popupComp = comp;
    popupCanvas = document.getElementById('bode-popup-canvas');
    popupCtx = popupCanvas?.getContext('2d') ?? null;
    cursorFreqHz = null;
    plotGeom = null;
    if (titleEl()) titleEl().textContent = `${comp.label} — Analyse fréquentielle`;
    applyFloatPosition();
    popupEl()?.classList.remove('hidden');
    renderBodePopup();
}

export function closeBodePopup(clearComp = false) {
    popupEl()?.classList.add('hidden');
    if (clearComp) popupComp = null;
    cursorFreqHz = null;
    plotGeom = null;
}

function clampFloatPosition() {
    const el = popupEl();
    if (!el) return;
    const pw = el.offsetWidth || 680;
    const ph = el.offsetHeight || 440;
    floatX = Math.max(4, Math.min(window.innerWidth - pw - 4, floatX));
    floatY = Math.max(48, Math.min(window.innerHeight - ph - 4, floatY));
}

export function initBodePopup() {
    document.getElementById('bode-popup-close')?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeBodePopup();
    });

    const handle = document.getElementById('bode-popup-drag-handle');
    handle?.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('#bode-popup-close')) return;
        dragging = true;
        const rect = popupEl()?.getBoundingClientRect();
        if (rect) {
            dragOffX = e.clientX - rect.left;
            dragOffY = e.clientY - rect.top;
        }
        e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
        if (dragging) {
            floatX = e.clientX - dragOffX;
            floatY = e.clientY - dragOffY;
            clampFloatPosition();
            applyFloatPosition();
            return;
        }
        if (isBodePopupOpen() && plotGeom) {
            updateCursorFromMouse(e.clientX, e.clientY);
        }
    });

    window.addEventListener('mouseup', () => {
        dragging = false;
    });

    window.addEventListener('resize', () => {
        if (isBodePopupOpen()) {
            clampFloatPosition();
            applyFloatPosition();
        }
    });
}
