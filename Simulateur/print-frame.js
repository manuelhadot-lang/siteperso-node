/** Cadre A4 paysage + cartouche pour impression schéma. */
import { snapToGrid, ctx, scale } from './state.js';
import { COLORS } from './theme.js';
import { showModal, hideModal } from './modal-ui.js';

/** A4 paysage — ratio 297×210 mm, taille schéma en px. */
export const A4_LANDSCAPE_W = 1188;
export const A4_LANDSCAPE_H = 840;
const MARGIN = 40;
const CARTOUCHE_W = 240;
const CARTOUCHE_H = 68;
const CARTOUCHE_GAP = 6;

export const defaultCartouche = () => ({
    title: '',
    project: '',
    author: '',
    date: new Date().toLocaleDateString('fr-FR'),
    scale: '',
    revision: '',
    notes: '',
});

export let printFrame = {
    enabled: false,
    x: snapToGrid(-A4_LANDSCAPE_W / 2),
    y: snapToGrid(-A4_LANDSCAPE_H / 2),
    width: A4_LANDSCAPE_W,
    height: A4_LANDSCAPE_H,
    cartouche: defaultCartouche(),
};

export function getPrintFrameRect() {
    const { x, y, width, height } = printFrame;
    return { x, y, width, height };
}

export function getCartoucheRect() {
    const { x, y, width, height } = printFrame;
    return {
        x: x + width - MARGIN - CARTOUCHE_W,
        y: y + height - MARGIN - CARTOUCHE_H,
        width: CARTOUCHE_W,
        height: CARTOUCHE_H,
    };
}

export function isPointInCartouche(x, y) {
    if (!printFrame.enabled) return false;
    const cr = getCartoucheRect();
    return x >= cr.x && x <= cr.x + cr.width && y >= cr.y && y <= cr.y + cr.height;
}

/** Zone utile du schéma (hors cartouche) — affichage éditeur. */
export function getInnerDrawingRect() {
    const { x, y, width, height } = printFrame;
    return {
        x: x + MARGIN,
        y: y + MARGIN,
        width: width - 2 * MARGIN,
        height: height - 2 * MARGIN - CARTOUCHE_H - CARTOUCHE_GAP,
    };
}

/** Zone capturée pour l’impression (cartouche en surimpression sur la page). */
export function getPrintCaptureRect() {
    const { x, y, width, height } = printFrame;
    return {
        x: x + MARGIN,
        y: y + MARGIN,
        width: width - 2 * MARGIN,
        height: height - 2 * MARGIN,
    };
}

export function setPrintFrameEnabled(on) {
    printFrame.enabled = !!on;
    if (printFrame.enabled && !printFrame._placed) {
        printFrame.x = snapToGrid(-A4_LANDSCAPE_W / 2);
        printFrame.y = snapToGrid(-A4_LANDSCAPE_H / 2);
        printFrame._placed = true;
    }
    updatePrintFrameMenuMark();
}

export function loadPrintFrameFromData(data) {
    if (!data || typeof data !== 'object') {
        printFrame.enabled = false;
        printFrame.cartouche = defaultCartouche();
        updatePrintFrameMenuMark();
        return;
    }
    printFrame.enabled = data.enabled === true;
    printFrame.x = Number.isFinite(data.x) ? data.x : snapToGrid(-A4_LANDSCAPE_W / 2);
    printFrame.y = Number.isFinite(data.y) ? data.y : snapToGrid(-A4_LANDSCAPE_H / 2);
    printFrame.width = A4_LANDSCAPE_W;
    printFrame.height = A4_LANDSCAPE_H;
    printFrame.cartouche = { ...defaultCartouche(), ...(data.cartouche || {}) };
    printFrame._placed = true;
    updatePrintFrameMenuMark();
}

export function serializePrintFrame() {
    return {
        enabled: printFrame.enabled,
        x: printFrame.x,
        y: printFrame.y,
        width: printFrame.width,
        height: printFrame.height,
        cartouche: { ...printFrame.cartouche },
    };
}

function updatePrintFrameMenuMark() {
    const btn = document.getElementById('btn-toggle-print-frame');
    if (btn) btn.textContent = printFrame.enabled ? 'Cadre A4 ✓' : 'Cadre A4 (masqué)';
}

export function refreshPrintFrameMenuMark() {
    updatePrintFrameMenuMark();
}

function drawCartoucheContent(cartouche, cx, cy, cw, ch, lineScale) {
    const fs = Math.max(7, 8 / lineScale);
    const lh = fs + 2;
    const pad = 4;
    const colW = (cw - pad * 2) / 2;
    let ty = cy + pad + fs + 2;
    const pair = (k1, v1, k2, v2) => {
        if (ty > cy + ch - pad) return;
        ctx.font = `bold ${fs}px Arial`;
        ctx.fillStyle = COLORS.ink;
        ctx.textAlign = 'left';
        ctx.fillText(k1, cx + pad, ty);
        ctx.font = `${fs}px Arial`;
        ctx.fillStyle = COLORS.inkMuted;
        ctx.fillText((v1 || '—').slice(0, 18), cx + pad + 34, ty);
        ctx.font = `bold ${fs}px Arial`;
        ctx.fillStyle = COLORS.ink;
        ctx.fillText(k2, cx + pad + colW, ty);
        ctx.font = `${fs}px Arial`;
        ctx.fillStyle = COLORS.inkMuted;
        ctx.fillText((v2 || '—').slice(0, 18), cx + pad + colW + 34, ty);
        ty += lh;
    };
    pair('Titre', cartouche.title, 'Date', cartouche.date);
    pair('Projet', cartouche.project, 'Rév.', cartouche.revision);
    pair('Auteur', cartouche.author, 'Échelle', cartouche.scale);
    if (cartouche.notes && ty <= cy + ch - pad) {
        ctx.font = `${Math.max(6, fs - 1)}px Arial`;
        ctx.fillStyle = COLORS.inkMuted;
        ctx.fillText(cartouche.notes.slice(0, 44), cx + pad, Math.min(ty, cy + ch - pad));
    }
}

/** Point à l’intérieur du cadre A4 (zone de déplacement). */
export function isPointInPrintFrame(x, y) {
    if (!printFrame.enabled) return false;
    const { x: fx, y: fy, width, height } = printFrame;
    return x >= fx && x <= fx + width && y >= fy && y <= fy + height;
}

export function movePrintFrameBy(dx, dy) {
    if (!dx && !dy) return;
    printFrame.x = snapToGrid(printFrame.x + dx);
    printFrame.y = snapToGrid(printFrame.y + dy);
}

/** Cadre + cartouche dans la vue éditeur (coords schéma). */
export function drawPrintFrameOverlay() {
    if (!printFrame.enabled) return;
    const { x, y, width, height } = printFrame;
    const cr = getCartoucheRect();
    const inner = getInnerDrawingRect();
    const ls = scale.value;

    ctx.save();
    ctx.fillStyle = editorThemeSheetFill();
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = '#78909c';
    ctx.lineWidth = 2 / ls;
    ctx.strokeRect(x, y, width, height);
    ctx.setLineDash([8 / ls, 6 / ls]);
    ctx.strokeStyle = '#607d8b';
    ctx.lineWidth = 1 / ls;
    ctx.strokeRect(inner.x, inner.y, inner.width, inner.height);
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.componentFill;
    ctx.fillRect(cr.x, cr.y, cr.width, cr.height);
    ctx.strokeStyle = '#546e7a';
    ctx.lineWidth = 1.5 / ls;
    ctx.strokeRect(cr.x, cr.y, cr.width, cr.height);
    ctx.font = `${11 / ls}px Arial`;
    ctx.fillStyle = COLORS.inkDim;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('CARTOUCHE', cr.x + 6, cr.y + 4);
    drawCartoucheContent(printFrame.cartouche, cr.x, cr.y, cr.width, cr.height, ls);
    ctx.restore();
}

function editorThemeSheetFill() {
    return COLORS.canvasBg === '#ffffff' ? 'rgba(255,255,255,0.92)' : 'rgba(30,30,30,0.55)';
}

function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function cartoucheHtml(c) {
    const pair = (k1, v1, k2, v2) =>
        `<tr><td class="k">${escapeHtml(k1)}</td><td>${escapeHtml(v1 || '—')}</td>`
        + `<td class="k">${escapeHtml(k2)}</td><td>${escapeHtml(v2 || '—')}</td></tr>`;
    const notes = c.notes
        ? `<tr><td class="k">Notes</td><td colspan="3">${escapeHtml(c.notes)}</td></tr>`
        : '';
    return `<table class="print-cartouche-table">
        ${pair('Titre', c.title, 'Date', c.date)}
        ${pair('Projet', c.project, 'Rév.', c.revision)}
        ${pair('Auteur', c.author, 'Échelle', c.scale)}
        ${notes}
    </table>`;
}

export function buildPrintHtml(schematicDataUrl) {
    const c = printFrame.cartouche;
    return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Impression schéma</title>
<style>
@page { size: 297mm 210mm; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; width: 100%; height: 100%; font-family: Arial, sans-serif; }
body {
  background: #888; color: #111; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
}
.print-viewport {
  width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
  overflow: hidden; padding: 8px;
}
.print-scale-wrap { position: relative; overflow: hidden; flex-shrink: 0; }
.print-sheet {
  position: relative; background: #fff; border: 0.6mm solid #333;
  width: 297mm; height: 210mm; flex-shrink: 0;
  overflow: hidden; transform-origin: center center;
}
.print-schematic {
  position: absolute; inset: 4mm;
  display: flex; align-items: stretch; justify-content: stretch;
}
.print-schematic img { width: 100%; height: 100%; object-fit: fill; display: block; }
.print-cartouche {
  position: absolute; right: 4mm; bottom: 4mm; z-index: 2;
  width: 68mm; max-height: 17mm;
  border: 0.35mm solid #333; padding: 0.8mm 1.5mm;
  font-size: 5.5pt; line-height: 1.1; overflow: hidden;
  background: rgba(255,255,255,0.96);
}
.print-cartouche-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 5.5pt; line-height: 1.1; }
.print-cartouche-table .k { font-weight: bold; width: 10mm; padding: 0.1mm 0.8mm 0.1mm 0; vertical-align: top; }
.print-cartouche-table td { padding: 0.1mm 0.4mm 0.1mm 0; vertical-align: top; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media print {
  @page { size: 297mm 210mm; margin: 0; }
  html, body { overflow: visible; background: #fff; display: block; width: 297mm; height: 210mm; margin: 0; padding: 0; }
  .print-viewport { display: block; padding: 0; overflow: visible; width: 297mm; height: 210mm; }
  .print-scale-wrap { width: 297mm !important; height: 210mm !important; overflow: visible; }
  .print-sheet {
    transform: none !important;
    width: 297mm !important; height: 210mm !important;
    max-width: none !important; max-height: none !important;
    margin: 0 !important; border: 0.6mm solid #333;
    page-break-after: avoid; page-break-inside: avoid;
  }
}
</style></head><body>
<div class="print-viewport"><div class="print-scale-wrap"><div class="print-sheet">
  <div class="print-schematic"><img src="${schematicDataUrl}" alt="Schéma"></div>
  <div class="print-cartouche">${cartoucheHtml(c)}</div>
</div></div></div>
<script>
(function () {
  function fitSheetPreview() {
    var wrap = document.querySelector('.print-scale-wrap');
    var sheet = document.querySelector('.print-sheet');
    var vp = document.querySelector('.print-viewport');
    if (!wrap || !sheet || !vp) return;
    sheet.style.transform = 'none';
    sheet.style.width = '';
    sheet.style.height = '';
    wrap.style.width = '';
    wrap.style.height = '';
    var pad = 8;
    var vw = Math.max(1, vp.clientWidth - pad * 2);
    var vh = Math.max(1, vp.clientHeight - pad * 2);
    var sw = sheet.offsetWidth;
    var sh = sheet.offsetHeight;
    if (!sw || !sh) return;
    var s = Math.min(vw / sw, vh / sh, 1);
    wrap.style.width = Math.round(sw * s) + 'px';
    wrap.style.height = Math.round(sh * s) + 'px';
    sheet.style.transform = 'scale(' + s + ')';
    sheet.style.transformOrigin = 'top left';
  }
  function resetForPrint() {
    var wrap = document.querySelector('.print-scale-wrap');
    var sheet = document.querySelector('.print-sheet');
    if (wrap) { wrap.style.width = ''; wrap.style.height = ''; }
    if (sheet) {
      sheet.style.transform = 'none';
      sheet.style.width = '';
      sheet.style.height = '';
      sheet.style.transformOrigin = '';
    }
  }
  window.addEventListener('load', fitSheetPreview);
  window.addEventListener('resize', fitSheetPreview);
  window.addEventListener('beforeprint', resetForPrint);
  window.addEventListener('afterprint', fitSheetPreview);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitSheetPreview);
  window.__resetPrintSheet = resetForPrint;
})();
</script></body></html>`;
}

export function openCartoucheModal(defaultTitle = '') {
    const modal = document.getElementById('cartouche-modal');
    if (!modal) return;
    const c = printFrame.cartouche;
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val ?? '';
    };
    set('cartouche-title', c.title || defaultTitle);
    set('cartouche-project', c.project);
    set('cartouche-author', c.author);
    set('cartouche-date', c.date || new Date().toLocaleDateString('fr-FR'));
    set('cartouche-scale', c.scale);
    set('cartouche-revision', c.revision);
    set('cartouche-notes', c.notes);
    showModal(modal);
    document.getElementById('cartouche-title')?.focus();
}

export function closeCartoucheModal() {
    hideModal(document.getElementById('cartouche-modal'));
}

export function saveCartoucheFromForm() {
    const get = (id) => document.getElementById(id)?.value?.trim() ?? '';
    printFrame.cartouche = {
        title: get('cartouche-title'),
        project: get('cartouche-project'),
        author: get('cartouche-author'),
        date: get('cartouche-date'),
        scale: get('cartouche-scale'),
        revision: get('cartouche-revision'),
        notes: get('cartouche-notes'),
    };
    closeCartoucheModal();
}
