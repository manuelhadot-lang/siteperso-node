// scope-popup.js — fenêtre oscilloscope flottante (CH1 + CH2 superposées)
import { flags } from './state.js';
import { getScopeTraceWindow, SCOPE_H_DIVS, SCOPE_V_DIVS } from './scope-animation.js';

let popupComp = null;
let onCloseCallback = () => {};
let popupCanvas = null;
let popupCtx = null;

let floatX = 120;
let floatY = 70;
let dragging = false;
let dragOffX = 0;
let dragOffY = 0;

const popupEl = () => document.getElementById('scope-popup');
const titleEl = () => document.getElementById('scope-popup-title');

export function setScopePopupCloseCallback(fn) {
    onCloseCallback = typeof fn === 'function' ? fn : () => {};
}

function applyFloatPosition() {
    const el = popupEl();
    if (!el) return;
    el.style.left = `${floatX}px`;
    el.style.top = `${floatY}px`;
}

function drawTraceOnCtx(ctx, points, windowSec, vdiv, posDiv, x0, y0, w, h, color) {
    if (!points?.length || windowSec <= 0 || vdiv <= 0) return;
    const pxPerDivY = h / SCOPE_V_DIVS;
    const midY = y0 + h / 2;
    const pos = Number.isFinite(posDiv) ? posDiv : 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, w, h);
    ctx.clip();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    for (const pt of points) {
        const x = x0 + (pt.t / windowSec) * w;
        const y = midY - ((pt.v / vdiv) + pos) * pxPerDivY;
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
    }
    if (started) ctx.stroke();
    ctx.restore();
}

export function isScopePopupOpen() {
    const el = popupEl();
    return popupComp != null && el && !el.classList.contains('hidden');
}

export function renderScopePopup() {
    if (!popupComp || !popupCtx || !popupCanvas) return;
    const w = popupCanvas.width;
    const h = popupCanvas.height;
    const margin = { l: 48, r: 16, t: 24, b: 32 };
    const plotW = w - margin.l - margin.r;
    const plotH = h - margin.t - margin.b;
    const x0 = margin.l;
    const y0 = margin.t;

    popupCtx.fillStyle = '#050a0e';
    popupCtx.fillRect(0, 0, w, h);

    popupCtx.strokeStyle = '#1a3a4a';
    popupCtx.lineWidth = 1;
    const divW = plotW / SCOPE_H_DIVS;
    const divH = plotH / SCOPE_V_DIVS;
    for (let i = 0; i <= SCOPE_H_DIVS; i++) {
        popupCtx.beginPath();
        popupCtx.moveTo(x0 + i * divW, y0);
        popupCtx.lineTo(x0 + i * divW, y0 + plotH);
        popupCtx.stroke();
    }
    for (let j = 0; j <= SCOPE_V_DIVS; j++) {
        popupCtx.beginPath();
        popupCtx.moveTo(x0, y0 + j * divH);
        popupCtx.lineTo(x0 + plotW, y0 + j * divH);
        popupCtx.stroke();
    }
    popupCtx.strokeStyle = '#2a5a6a';
    popupCtx.lineWidth = 1.5;
    popupCtx.beginPath();
    popupCtx.moveTo(x0, y0 + plotH / 2);
    popupCtx.lineTo(x0 + plotW, y0 + plotH / 2);
    popupCtx.moveTo(x0 + plotW / 2, y0);
    popupCtx.lineTo(x0 + plotW / 2, y0 + plotH);
    popupCtx.stroke();

    if (flags.isSimulating) {
        const win = getScopeTraceWindow(popupComp);
        if (win && (win.ch1.length || win.ch2.length)) {
            drawTraceOnCtx(popupCtx, win.ch1, win.windowSec, win.ch1Vdiv, win.ch1PosDiv, x0, y0, plotW, plotH, '#ffeb3b');
            drawTraceOnCtx(popupCtx, win.ch2, win.windowSec, win.ch2Vdiv, win.ch2PosDiv, x0, y0, plotW, plotH, '#00e5ff');
            popupCtx.fillStyle = '#8899aa';
            popupCtx.font = '11px Arial';
            popupCtx.textAlign = 'right';
            const td = win.timeDiv >= 0.001
                ? `${(win.timeDiv * 1000).toFixed(win.timeDiv >= 0.01 ? 1 : 2)} ms/div`
                : `${(win.timeDiv * 1e6).toFixed(0)} µs/div`;
            popupCtx.fillText(`${td}  |  CH1: ${win.ch1Vdiv} V/div  |  CH2: ${win.ch2Vdiv} V/div`, w - margin.r, h - 10);
        } else {
            popupCtx.fillStyle = '#556677';
            popupCtx.font = '14px Arial';
            popupCtx.textAlign = 'center';
            popupCtx.textBaseline = 'middle';
            popupCtx.fillText('Aucun signal — vérifiez les connexions CH1/CH2', w / 2, h / 2);
        }
    } else {
        popupCtx.fillStyle = '#556677';
        popupCtx.font = '14px Arial';
        popupCtx.textAlign = 'center';
        popupCtx.textBaseline = 'middle';
        popupCtx.fillText('Lancez la simulation pour voir les signaux', w / 2, h / 2);
    }

    popupCtx.fillStyle = '#ffeb3b';
    popupCtx.font = '12px Arial';
    popupCtx.textAlign = 'left';
    popupCtx.fillText('CH1', margin.l, 16);
    popupCtx.fillStyle = '#00e5ff';
    popupCtx.fillText('CH2', margin.l + 36, 16);
}

export function refreshScopePopup() {
    if (isScopePopupOpen()) renderScopePopup();
}

export function openScopePopup(comp) {
    if (!comp || comp.type !== 'oscilloscope') return;
    popupComp = comp;
    popupCanvas = document.getElementById('scope-popup-canvas');
    popupCtx = popupCanvas?.getContext('2d') ?? null;
    if (titleEl()) titleEl().textContent = `${comp.label} — Oscilloscope`;
    applyFloatPosition();
    popupEl()?.classList.remove('hidden');
    renderScopePopup();
}

export function closeScopePopup(clearComp = false) {
    popupEl()?.classList.add('hidden');
    if (clearComp) popupComp = null;
    onCloseCallback();
}

function clampFloatPosition() {
    const el = popupEl();
    if (!el) return;
    const w = el.offsetWidth || 680;
    const h = el.offsetHeight || 420;
    floatX = Math.max(4, Math.min(window.innerWidth - w - 4, floatX));
    floatY = Math.max(48, Math.min(window.innerHeight - h - 4, floatY));
}

export function initScopePopup() {
    document.getElementById('scope-popup-close')?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeScopePopup();
    });

    const handle = document.getElementById('scope-popup-drag-handle');
    handle?.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('#scope-popup-close')) return;
        dragging = true;
        const rect = popupEl()?.getBoundingClientRect();
        if (rect) {
            dragOffX = e.clientX - rect.left;
            dragOffY = e.clientY - rect.top;
        }
        e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        floatX = e.clientX - dragOffX;
        floatY = e.clientY - dragOffY;
        clampFloatPosition();
        applyFloatPosition();
    });

    window.addEventListener('mouseup', () => {
        dragging = false;
    });

    window.addEventListener('resize', () => {
        if (isScopePopupOpen()) {
            clampFloatPosition();
            applyFloatPosition();
        }
    });
}
