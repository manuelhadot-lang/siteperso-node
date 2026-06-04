// renderer.js
import { canvas, ctx, GRID_SIZE, scale, pan, flags, circuit, interaction, zone, menuDrag, snapToGrid, simulationResults } from './state.js';
import {
    CD4511_BOX_B,
    CD4511_BOX_L,
    CD4511_BOX_R,
    CD4511_BOX_T,
    CD4511_JUNC_L,
    CD4511_JUNC_R,
    CD4511_LABEL_L,
    CD4511_LABEL_R,
    CD4511_PIN_Y,
    CD4511_HIT_DX,
    CD4511_HIT_DY,
} from './cd4511-layout.js';
import {
    IC90_BOX_B,
    IC90_BOX_L,
    IC90_BOX_R,
    IC90_BOX_T,
    IC90_JUNC_L,
    IC90_JUNC_R,
    IC90_LABEL_L,
    IC90_LABEL_R,
    IC90_HIT_DX,
    IC90_HIT_DY,
    IC90_LEFT_PIN_Y,
    IC90_RIGHT_PIN_Y,
} from './ic74hc90-layout.js';
import { getComponentJonctions, isJonctionConnected, getVoltageAtJonction } from './geometry.js';
import { getBottomPanelHeight } from './source-panel.js';
import { getAnimatedLedCurrent, getAnimatedSeg7Segments, getAnimatedVoltmeterVoltage, isLedOvercurrent, quantizeVoltmeterReading } from './led-animation.js';

export function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - 45 - getBottomPanelHeight();
    draw();
}

function drawLabels(name, value, angle) {
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (angle % 180 !== 0) {
        ctx.rotate(-angle * Math.PI / 180);
        if (name) { ctx.fillStyle = '#ffffff'; ctx.font = '12px Arial'; ctx.textAlign = 'right'; ctx.fillText(name, -28, 0); }
        if (value) { ctx.fillStyle = '#aaaaaa'; ctx.font = '11px Arial'; ctx.textAlign = 'left'; ctx.fillText(value, 28, 0); }
    } else {
        if (name) { ctx.fillStyle = '#ffffff'; ctx.font = '12px Arial'; ctx.fillText(name, 0, -25); }
        if (value) { ctx.fillStyle = '#aaaaaa'; ctx.font = '11px Arial'; ctx.fillText(value, 0, 25); }
    }
    ctx.restore();
}

function formatMeterValue(num, decimals = 1) {
    if (typeof num !== 'number' || !Number.isFinite(num)) return '0.0';
    return num.toFixed(decimals);
}

function formatCurrentDisplay(amps) {
    if (typeof amps !== 'number' || !Number.isFinite(amps)) return '0.0';
    const abs = Math.abs(amps);
    if (abs >= 1) return amps.toFixed(2);
    if (abs >= 0.001) return (amps * 1000).toFixed(1);
    return (amps * 1e6).toFixed(0);
}

function formatCurrentUnit(amps) {
    if (typeof amps !== 'number' || !Number.isFinite(amps)) return 'A';
    const abs = Math.abs(amps);
    if (abs >= 1) return 'A';
    if (abs >= 0.001) return 'mA';
    return 'µA';
}

function formatResistanceDisplay(ohms) {
    if (typeof ohms !== 'number' || !Number.isFinite(ohms)) return '0';
    if (ohms >= 1e6) return (ohms / 1e6).toFixed(1);
    if (ohms >= 1e3) return (ohms / 1e3).toFixed(1);
    if (ohms >= 10) return ohms.toFixed(0);
    return ohms.toFixed(1);
}

function formatResistanceUnit(ohms) {
    if (typeof ohms !== 'number' || !Number.isFinite(ohms)) return 'Ω';
    if (ohms >= 1e6) return 'MΩ';
    if (ohms >= 1e3) return 'kΩ';
    return 'Ω';
}

/** « + » à côté de la borne droite (+), au-dessus du fil — pas sur le trait. */
function drawWirePlusLabel(wireEndX = 40, wireY = 0) {
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#ff5252';
    ctx.fillText('+', wireEndX, wireY - 6);
}

function drawMeterBody(color = '#00bcd4', showPlus = true) {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.fillStyle = '#2a3b4c';
    ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = color;
    ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-20, 0); ctx.moveTo(20, 0); ctx.lineTo(40, 0); ctx.stroke();
    if (showPlus) drawWirePlusLabel(40, 0);
}

function drawOscilloscopeScreen(comp) {
    const x0 = -42, y0 = -24, w = 84, h = 48;
    ctx.fillStyle = '#050a0e';
    ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = '#1a3a4a';
    ctx.lineWidth = 1;
    const divW = w / 8;
    const divH = h / 8;
    for (let i = 1; i < 8; i++) {
        ctx.beginPath(); ctx.moveTo(x0 + i * divW, y0); ctx.lineTo(x0 + i * divW, y0 + h); ctx.stroke();
    }
    for (let j = 1; j < 8; j++) {
        ctx.beginPath(); ctx.moveTo(x0, y0 + j * divH); ctx.lineTo(x0 + w, y0 + j * divH); ctx.stroke();
    }
    ctx.fillStyle = '#3a5a6a';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Osci', 0, 0);
    ctx.strokeStyle = '#00bcd4';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(comp.label, 0, y0 - 6);
}

const SEG7_PIN_Y = [-60, -40, -20, 0, 20, 40, 60];
const SEG7_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

function getSeg7LitSet(comp) {
    if (flags.isSimulating) {
        const anim = getAnimatedSeg7Segments(comp.label);
        if (anim?.segments) {
            return new Set(Object.entries(anim.segments).filter(([, on]) => on).map(([k]) => k));
        }
    }
    const data = simulationResults.seg7?.[comp.label];
    if (!data?.segments) return new Set();
    return new Set(Object.entries(data.segments).filter(([, on]) => on).map(([k]) => k));
}

function drawSeg7Display(comp) {
    const lit = getSeg7LitSet(comp);
    const segColor = (name) => (lit.has(name) ? '#ff1744' : '#4a0808');
    const pinYs = SEG7_PIN_Y;
    const names = SEG7_NAMES;

    // Style des fils/pattes : rouge comme une LED
    const pinColor = '#ff1744';
    const comX = 20;
    const comY = 100;

    // Boîtier plus large (droit)
    // Centré sur x=20 pour aligner le fil de cathode et sa jonction.
    const boxL = -18, boxR = 58, boxT = -78, boxB = 80;

    // Pattes a..g : du point de connexion (pastille) jusqu'au bord gauche du boîtier (en rouge)
    ctx.strokeStyle = pinColor;
    ctx.lineWidth = 3;
    for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.moveTo(-40, pinYs[i]);
        ctx.lineTo(boxL, pinYs[i]);
        ctx.stroke();
    }
    // Patte commune : sort du bas vers la pastille commune (centrée + plus longue)
    ctx.beginPath();
    ctx.moveTo(comX, boxB);
    ctx.lineTo(comX, comY);
    ctx.stroke();

    // Boîtier droit (non incliné)
    ctx.strokeStyle = '#bdbdbd';
    ctx.lineWidth = 2;
    ctx.strokeRect(boxL, boxT, boxR - boxL, boxB - boxT);

    // Segments du chiffre centrés dans le boîtier, légèrement inclinés
    ctx.save();
    ctx.transform(1, 0, -0.14, 1, 0, 0);

    const segMarginX = 15;
    const segMarginTop = 22;
    const segMarginBottom = 24;
    const leftX = boxL + segMarginX;
    const rightX = boxR - segMarginX;
    const topY = boxT + segMarginTop;
    const botY = boxB - segMarginBottom;
    const midY = (topY + botY) / 2;
    ctx.lineCap = 'round';
    ctx.lineWidth = 6;
    const seg = (x1, y1, x2, y2, name) => {
        ctx.strokeStyle = segColor(name);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    };
    const hInset = 4;
    seg(leftX + hInset, topY, rightX - hInset, topY, 'a');    // haut
    seg(rightX, topY + 5, rightX, midY - 5, 'b');             // haut-droite
    seg(rightX, midY + 5, rightX, botY - 5, 'c');             // bas-droite
    seg(leftX + hInset, botY, rightX - hInset, botY, 'd');    // bas
    seg(leftX, midY + 5, leftX, botY - 5, 'e');               // bas-gauche
    seg(leftX, topY + 5, leftX, midY - 5, 'f');               // haut-gauche
    seg(leftX + hInset, midY, rightX - hInset, midY, 'g');    // milieu
    ctx.restore();

    // Étiquettes des broches a..g, au-dessus de chaque patte près du boîtier
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    for (let i = 0; i < 7; i++) ctx.fillText(names[i], boxL - 4, pinYs[i] - 2);
    // Étiquette de la borne commune C
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('C', comX + 8, comY);
    // Nom du composant
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(comp.label, 26, boxT - 6);
}

function drawLogicGateSymbol(gateType, label) {
    const inTopY = -20;
    const inBottomY = 20;
    const inMidY = 0;
    const gateLeft = -20;
    const gateArcR = 20;
    const outBubbleR = (gateType === 'nand' || gateType === 'nor' || gateType === 'xnor' || gateType === 'not') ? 4 : 0;
    const isOrFamily = gateType === 'or' || gateType === 'nor' || gateType === 'xor' || gateType === 'xnor';
    const isXorFamily = gateType === 'xor' || gateType === 'xnor';
    const isNot = gateType === 'not';

    ctx.strokeStyle = '#00ca71';
    ctx.lineWidth = 2;
    ctx.fillStyle = '#1e1e1e';

    if (isNot) {
        ctx.beginPath();
        ctx.moveTo(-16, -18);
        ctx.lineTo(14, 0);
        ctx.lineTo(-16, 18);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    } else if (isOrFamily) {
        ctx.beginPath();
        ctx.moveTo(-20, -20);
        ctx.quadraticCurveTo(0, -20, 14, 0);
        ctx.quadraticCurveTo(0, 20, -20, 20);
        ctx.quadraticCurveTo(-8, 0, -20, -20);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        if (isXorFamily) {
            ctx.beginPath();
            ctx.moveTo(-25, -20);
            ctx.quadraticCurveTo(-13, 0, -25, 20);
            ctx.stroke();
        }
    } else {
        // Forme AND / NAND
        ctx.beginPath();
        ctx.moveTo(gateLeft, -20);
        ctx.lineTo(0, -20);
        ctx.arc(0, 0, gateArcR, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(gateLeft, 20);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    const outStemStart = 20 + outBubbleR;
    if (isNot) {
        // La pointe du triangle est à x=14
        const notStemStart = 14 + outBubbleR;
        ctx.beginPath();
        ctx.moveTo(notStemStart, 0);
        ctx.lineTo(40, 0);
        ctx.stroke();
    } else {
        ctx.beginPath();
        ctx.moveTo(outStemStart, 0);
        ctx.lineTo(40, 0);
        ctx.stroke();
    }

    if (isNot) {
        ctx.beginPath();
        ctx.moveTo(-40, 0);
        ctx.lineTo(-16, 0);
        ctx.stroke();
    } else {
        ctx.beginPath();
        ctx.moveTo(-40, inTopY);
        ctx.lineTo(gateLeft, inTopY);
        ctx.moveTo(-40, inBottomY);
        ctx.lineTo(gateLeft, inBottomY);
        ctx.stroke();
    }

    if (outBubbleR > 0) {
        const cx = isNot ? 14 + outBubbleR : 20 + outBubbleR;
        ctx.beginPath();
        ctx.arc(cx, 0, outBubbleR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#1e1e1e';
        ctx.fill();
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, 0, -26);

    ctx.fillStyle = '#aaaaaa';
    ctx.font = '10px Arial';
    ctx.textAlign = 'left';
    if (isNot) {
        ctx.fillText('A', -34, inMidY - 4);
    } else {
        ctx.fillText('A', -34, inTopY - 4);
        ctx.fillText('B', -34, inBottomY - 4);
    }
}

function drawMeterDisplay(valuePart, unitPart, rot) {
    const text = unitPart ? `${valuePart}${unitPart}` : String(valuePart);
    ctx.save();
    ctx.rotate(-rot * Math.PI / 180);
    ctx.font = 'bold 7px monospace';
    const textW = ctx.measureText(text).width;
    const boxW = Math.max(28, Math.min(46, textW + 10));
    ctx.fillStyle = '#0d1b1e';
    ctx.fillRect(-boxW / 2, -7, boxW, 14);
    ctx.fillStyle = '#00ff66';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);
    ctx.restore();
}

function getLedCurrentAmps(comp) {
    if (!flags.isSimulating) return null;
    const animI = getAnimatedLedCurrent(comp.label);
    if (animI != null) return animI;
    const ledMeasure = simulationResults.leds && simulationResults.leds[comp.label];
    if (ledMeasure && typeof ledMeasure.current === 'number') return ledMeasure.current;
    return null;
}

function drawLedSmoke(phase) {
    ctx.save();
    ctx.strokeStyle = 'rgba(170, 170, 170, 0.75)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
        const xOff = -6 + i * 6 + Math.sin(phase + i * 1.3) * 3;
        ctx.beginPath();
        ctx.moveTo(xOff, -16);
        ctx.quadraticCurveTo(
            xOff + Math.sin(phase + i * 2) * 5, -26,
            xOff + Math.cos(phase + i) * 4, -36 - i * 5
        );
        ctx.stroke();
    }
    ctx.restore();
}

/** Set/Reset : trait vertical uniquement à l'extérieur du boîtier ; jonction au bout ; S/R à gauche du fil. */
function drawFlipFlopSetReset(ctx, boxTopY, boxBottomY, stubOutside = 30) {
    const setJuncY = boxTopY - stubOutside;
    const resetJuncY = boxBottomY + stubOutside;
    ctx.beginPath();
    ctx.moveTo(0, setJuncY); ctx.lineTo(0, boxTopY);
    ctx.moveTo(0, resetJuncY); ctx.lineTo(0, boxBottomY);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px Arial';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.fillText('S', -10, (setJuncY + boxTopY) / 2);
    ctx.fillText('R', -10, (resetJuncY + boxBottomY) / 2);
}

function drawComponentBody(comp) {
    ctx.save(); ctx.translate(comp.x, comp.y);
    const noRotate = comp.type === 'gimp' || comp.type === 'gsin' || comp.type === 'gsqr' || comp.type === 'oscilloscope' || comp.type === 'd_flipflop' || comp.type === 'jk_flipflop' || comp.type === 'cd4511' || comp.type === 'ic_74hc90' || comp.type === 'npn' || comp.type === 'opamp' || comp.type === 'seg7';
    const rot = noRotate ? 0 : (comp.rotation || 0);
    ctx.rotate(rot * Math.PI / 180);

    if (interaction.selectedComponents.includes(comp)) {
        ctx.strokeStyle = '#00bcd4'; ctx.lineWidth = 1.5;
        if (comp.type === 'cd4511') {
            ctx.strokeRect(-CD4511_HIT_DX, -CD4511_HIT_DY, CD4511_HIT_DX * 2, CD4511_HIT_DY * 2);
        }
        else if (comp.type === 'ic_74hc90') {
            ctx.strokeRect(-IC90_HIT_DX, -IC90_HIT_DY, IC90_HIT_DX * 2, IC90_HIT_DY * 2);
        }
        else if (comp.type === 'jk_flipflop' || comp.type === 'd_flipflop') ctx.strokeRect(-45, -68, 90, 136);
        else if (comp.type === 'oscilloscope') ctx.strokeRect(-50, -38, 100, 100);
        else if (comp.type === 'npn') ctx.strokeRect(-42, -42, 64, 84);
        else if (comp.type === 'opamp') ctx.strokeRect(-44, -40, 88, 80);
        else if (comp.type === 'seg7') ctx.strokeRect(-52, -86, 124, 200);
        else if (comp.type !== 'logic_terminal') ctx.strokeRect(-45, -25, 90, 50);
    }

    if (comp.type === 'gnd') {
        ctx.strokeStyle = '#9e9e9e'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(40, 0);
        ctx.moveTo(-20, -15); ctx.lineTo(-20, 15);
        ctx.moveTo(-27, -9); ctx.lineTo(-27, 9);
        ctx.moveTo(-34, -4); ctx.lineTo(-34, 4);
        ctx.stroke(); drawLabels(comp.label, "0V", rot);
    }
    else if (comp.type === 'vcc') {
        ctx.strokeStyle = '#ff3d00'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(40, 0);
        ctx.moveTo(-20, 0); ctx.lineTo(-5, -10); ctx.lineTo(-5, 10); ctx.closePath(); ctx.fillStyle = '#ff3d00'; ctx.fill();
        ctx.stroke();
        let val = comp.value !== undefined ? comp.value + "V" : "5V";
        drawLabels(comp.label, val, rot);
    }
    else if (comp.type === 'logic_terminal') {
        if (interaction.selectedComponents.includes(comp)) {
            ctx.strokeStyle = '#00bcd4'; ctx.lineWidth = 1.5;
            ctx.strokeRect(-22, -17, 39, 34);
        }
        ctx.strokeStyle = '#9c27b0'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(40, 0);
        ctx.stroke();
        ctx.fillStyle = '#1e1e1e'; ctx.fillRect(-20, -15, 35, 30); ctx.strokeRect(-20, -15, 35, 30);
        let state = comp.state || 0;
        ctx.fillStyle = state === 1 ? '#00e676' : '#ff1744';
        ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(state, -2, 1);
        let highV = comp.highVoltage || 5;
        drawLabels(null, `V(1)=${highV}V`, rot);
    }
    else if (comp.type === 'battery') {
        ctx.strokeStyle = '#ff9800'; ctx.lineWidth = 2;
        // Grande barre (gauche, haute) = + ; petite barre (droite, basse) = −
        ctx.beginPath(); ctx.moveTo(-5, -15); ctx.lineTo(-5, 15); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(5, -8); ctx.lineTo(5, 8); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-40, 0); ctx.lineTo(-5, 0);
        ctx.moveTo(5, 0); ctx.lineTo(40, 0);
        ctx.stroke();
        drawWirePlusLabel(-40, 0);
        let val = comp.value !== undefined ? comp.value + "V" : "5V";
        drawLabels(comp.label, val, rot);
    }
    else if (comp.type === 'resistor') {
        ctx.strokeStyle = '#007acc'; ctx.lineWidth = 2; ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(-20, -10, 40, 20); ctx.strokeRect(-20, -10, 40, 20);
        ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-20, 0); ctx.moveTo(20, 0); ctx.lineTo(40, 0); ctx.stroke();
        drawLabels(comp.label, comp.value || "1Kohm", rot);
    }
    else if (comp.type === 'capacitor') {
        ctx.strokeStyle = '#66bb6a'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-40, 0); ctx.lineTo(-8, 0);
        ctx.moveTo(-8, -14); ctx.lineTo(-8, 14);
        ctx.moveTo(8, -14); ctx.lineTo(8, 14);
        ctx.moveTo(8, 0); ctx.lineTo(40, 0);
        ctx.stroke();
        drawLabels(comp.label, comp.value || '1u', rot);
    }
    else if (comp.type === 'inductor') {
        ctx.strokeStyle = '#ffa726'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-40, 0); ctx.lineTo(-28, 0);
        for (let i = 0; i < 4; i++) {
            ctx.arc(-21 + i * 14, 0, 7, Math.PI, 0, false);
        }
        ctx.lineTo(40, 0);
        ctx.stroke();
        drawLabels(comp.label, comp.value || '1m', rot);
    }
    else if (comp.type === 'diode') {
        ctx.strokeStyle = '#ef5350'; ctx.lineWidth = 2; ctx.fillStyle = '#1e1e1e';
        ctx.beginPath();
        ctx.moveTo(-40, 0); ctx.lineTo(-12, 0);
        ctx.moveTo(-12, -12); ctx.lineTo(12, 0); ctx.lineTo(-12, 12); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(12, -12); ctx.lineTo(12, 12);
        ctx.moveTo(12, 0); ctx.lineTo(40, 0);
        ctx.stroke();
        drawLabels(comp.label, comp.value || '1N4148', rot);
    }
    else if (comp.type === 'npn') {
        const bx = 0, by = 0;
        const cx = 20, cy = -20, cEnd = -40;
        const ex = 20, ey = 20, eEnd = 40;
        const fx = (x) => (comp.flipX ? -x : x);
        ctx.save();
        if (comp.flipX) ctx.scale(-1, 1);
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(bx, -20); ctx.lineTo(bx, 20);
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-40, by); ctx.lineTo(bx, by);
        ctx.moveTo(bx, by); ctx.lineTo(cx, cy); ctx.lineTo(cx, cEnd);
        ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.lineTo(ex, eEnd);
        ctx.stroke();
        const ax = 13, ay = 13;
        const ux = 0.707, uy = 0.707, px = -uy, py = ux, wing = 4.5;
        const tipX = ax + ux * 5.5, tipY = ay + uy * 5.5;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(ax - ux * 1.5 + px * wing, ay - uy * 1.5 + py * wing);
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(ax - ux * 1.5 - px * wing, ay - uy * 1.5 - py * wing);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = '#aaaaaa'; ctx.font = '11px Arial'; ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText('b', fx(-34), -10);
        ctx.fillText('c', fx(4), -32);
        ctx.fillText('e', fx(4), 32);
        ctx.fillStyle = '#ffffff'; ctx.font = '12px Arial';
        ctx.fillText(comp.label, fx(-36), -24);
        ctx.textAlign = 'center';
        ctx.fillText('2N2222', fx(34), 2);
    }
    else if (comp.type === 'opamp') {
        const tLeft = -12, tTop = -30, tBot = 30, tApex = 28, inY = 20;
        const fx = (x) => (comp.flipX ? -x : x);
        const fy = (y) => (comp.flipY ? -y : y);
        ctx.save();
        if (comp.flipX) ctx.scale(-1, 1);
        if (comp.flipY) ctx.scale(1, -1);
        ctx.fillStyle = '#d8d8d8';
        ctx.strokeStyle = '#666666';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(tLeft, tTop); ctx.lineTo(tLeft, tBot); ctx.lineTo(tApex, 0); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#cccccc'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-40, -inY); ctx.lineTo(tLeft, -inY);
        ctx.moveTo(-40, inY); ctx.lineTo(tLeft, inY);
        ctx.moveTo(tApex, 0); ctx.lineTo(40, 0);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = '#222222'; ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('+', fx(-8), fy(-inY));
        ctx.fillText('−', fx(-8), fy(inY));
        ctx.fillStyle = '#ffffff'; ctx.font = '12px Arial';
        ctx.fillText(comp.label, fx(8), fy(-38));
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText(comp.value || 'uA741', fx(8), fy(42));
    }
    else if (['not', 'and', 'nand', 'or', 'nor', 'xor', 'xnor'].includes(comp.type)) {
        drawLogicGateSymbol(comp.type, comp.label);
    }
    else if (comp.type === 'd_flipflop') {
        ctx.strokeStyle = '#00bcd4'; ctx.lineWidth = 2; ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(-30, -30, 60, 60); ctx.strokeRect(-30, -30, 60, 60);
        ctx.beginPath();
        ctx.moveTo(-40, -20); ctx.lineTo(-30, -20);   // D
        ctx.moveTo(-40, 20); ctx.lineTo(-30, 20);     // CLK
        ctx.moveTo(30, -20); ctx.lineTo(40, -20);     // Q
        ctx.moveTo(30, 20); ctx.lineTo(40, 20);       // /Q
        ctx.stroke();
        drawFlipFlopSetReset(ctx, -30, 30);
        ctx.fillStyle = '#ffffff'; ctx.font = '10px Arial'; ctx.textBaseline = 'middle';
        ctx.textAlign = 'left'; ctx.fillText('D', -27, -20); ctx.fillText('>', -27, 20);
        ctx.textAlign = 'right'; ctx.fillText('Q', 27, -20); ctx.fillText('Q', 27, 20);
        ctx.beginPath(); ctx.moveTo(20, 13); ctx.lineTo(27, 13); ctx.stroke();
        ctx.font = '12px Arial'; ctx.fillStyle = '#ffffff'; ctx.fillText(comp.label, 0, -62);
    }
    else if (comp.type === 'jk_flipflop') {
        ctx.strokeStyle = '#ff9800'; ctx.lineWidth = 2; ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(-30, -35, 60, 70); ctx.strokeRect(-30, -35, 60, 70);
        ctx.beginPath();
        ctx.moveTo(-40, -20); ctx.lineTo(-30, -20);   // J
        ctx.moveTo(-40, 0); ctx.lineTo(-30, 0);       // CLK
        ctx.moveTo(-40, 20); ctx.lineTo(-30, 20);     // K
        ctx.moveTo(30, -20); ctx.lineTo(40, -20);     // Q
        ctx.moveTo(30, 20); ctx.lineTo(40, 20);       // /Q
        ctx.stroke();
        drawFlipFlopSetReset(ctx, -35, 35);
        ctx.fillStyle = '#ffffff'; ctx.font = '10px Arial'; ctx.textBaseline = 'middle';
        ctx.textAlign = 'left'; ctx.fillText('J', -27, -20); ctx.fillText('>', -27, 0); ctx.fillText('K', -27, 20);
        ctx.textAlign = 'right'; ctx.fillText('Q', 27, -20); ctx.fillText('Q', 27, 20);
        ctx.beginPath(); ctx.moveTo(20, 13); ctx.lineTo(27, 13); ctx.stroke();
        ctx.font = '12px Arial'; ctx.fillStyle = '#ffffff'; ctx.fillText(comp.label, 0, -64);
    }
    else if (comp.type === 'cd4511') {
        const inLbl = ['A', 'B', 'C', 'D', 'LE', 'BI', 'LT'];
        const outLbl = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
        ctx.strokeStyle = '#ab47bc'; ctx.lineWidth = 2; ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(CD4511_BOX_L, CD4511_BOX_T, CD4511_BOX_R - CD4511_BOX_L, CD4511_BOX_B - CD4511_BOX_T);
        ctx.strokeRect(CD4511_BOX_L, CD4511_BOX_T, CD4511_BOX_R - CD4511_BOX_L, CD4511_BOX_B - CD4511_BOX_T);
        ctx.beginPath();
        CD4511_PIN_Y.forEach((y) => {
            ctx.moveTo(CD4511_JUNC_L, y);
            ctx.lineTo(CD4511_BOX_L, y);
        });
        CD4511_PIN_Y.forEach((y) => {
            ctx.moveTo(CD4511_BOX_R, y);
            ctx.lineTo(CD4511_JUNC_R, y);
        });
        ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 9px Arial'; ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        inLbl.forEach((t, i) => ctx.fillText(t, CD4511_LABEL_L, CD4511_PIN_Y[i]));
        ctx.textAlign = 'right';
        outLbl.forEach((t, i) => ctx.fillText(t, CD4511_LABEL_R, CD4511_PIN_Y[i]));
        ctx.font = '9px Arial'; ctx.textAlign = 'center';
        ctx.fillText('CD4511', 0, -4);
        ctx.font = '8px Arial';
        ctx.fillText('BCD→7', 0, 6);
        ctx.font = '11px Arial';
        ctx.fillText(comp.label, 0, CD4511_BOX_T - 12);
    }
    else if (comp.type === 'ic_74hc90') {
        const leftLbl = ['CP1', 'MR1', 'MR2', '', 'VCC', 'MS1', 'MS2'];
        const rightLbl = ['CP0', '', 'Q0', 'Q3', 'GND', 'Q1', 'Q2'];
        ctx.strokeStyle = '#26a69a'; ctx.lineWidth = 2; ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(IC90_BOX_L, IC90_BOX_T, IC90_BOX_R - IC90_BOX_L, IC90_BOX_B - IC90_BOX_T);
        ctx.strokeRect(IC90_BOX_L, IC90_BOX_T, IC90_BOX_R - IC90_BOX_L, IC90_BOX_B - IC90_BOX_T);
        ctx.beginPath();
        IC90_LEFT_PIN_Y.forEach((y, i) => {
            if (!leftLbl[i]) return;
            ctx.moveTo(IC90_JUNC_L, y);
            ctx.lineTo(IC90_BOX_L, y);
        });
        IC90_RIGHT_PIN_Y.forEach((y, i) => {
            if (!rightLbl[i]) return;
            ctx.moveTo(IC90_BOX_R, y);
            ctx.lineTo(IC90_JUNC_R, y);
        });
        ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.font = '8px Arial'; ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        leftLbl.forEach((t, i) => { if (t) ctx.fillText(t, IC90_LABEL_L, IC90_LEFT_PIN_Y[i]); });
        ctx.textAlign = 'right';
        rightLbl.forEach((t, i) => { if (t) ctx.fillText(t, IC90_LABEL_R, IC90_RIGHT_PIN_Y[i]); });
        ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center';
        ctx.fillText('74HC90', 0, -4);
        ctx.font = '8px Arial';
        ctx.fillText('décade', 0, 6);
        ctx.font = '11px Arial';
        ctx.fillText(comp.label, 0, IC90_BOX_T - 12);
    }
    else if (comp.type === 'seg7') {
        drawSeg7Display(comp);
    }
    else if (comp.type === 'led') {
        const ledCurrent = getLedCurrentAmps(comp);
        const isBurnt = ledCurrent != null && isLedOvercurrent(ledCurrent);
        let isLit = false;
        if (flags.isSimulating && !isBurnt) {
            if (ledCurrent != null) {
                isLit = ledCurrent > 1e-4;
            } else {
                let vAnode = getVoltageAtJonction(`${comp.label}_in`);
                let vCathode = getVoltageAtJonction(`${comp.label}_out`);
                if ((vAnode - vCathode) >= 1.5) isLit = true;
            }
        }
        const ledBodyColor = isBurnt ? '#3a3a3a' : (isLit ? '#ff1744' : '#4a030a');
        ctx.strokeStyle = isBurnt ? '#666666' : (isLit ? '#ff6b81' : '#ff1744');
        ctx.lineWidth = 2; ctx.fillStyle = ledBodyColor;
        if (isLit) {
            ctx.save(); ctx.shadowBlur = 20; ctx.shadowColor = '#ff1744';
            ctx.beginPath(); ctx.moveTo(-15, -15); ctx.lineTo(10, 0); ctx.lineTo(-15, 15); ctx.closePath(); ctx.fill(); ctx.restore();
        } else {
            ctx.beginPath(); ctx.moveTo(-15, -15); ctx.lineTo(10, 0); ctx.lineTo(-15, 15); ctx.closePath(); ctx.fill();
        }
        ctx.beginPath(); ctx.moveTo(10, -15); ctx.lineTo(10, 15); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-15, 0); ctx.moveTo(10, 0); ctx.lineTo(40, 0); ctx.stroke();
        if (!isBurnt) {
            ctx.save();
            ctx.strokeStyle = isLit ? '#ff8a9a' : '#730510';
            ctx.beginPath(); ctx.moveTo(-5, -18); ctx.lineTo(5, -28); ctx.moveTo(5, -28); ctx.lineTo(0, -28); ctx.moveTo(5, -28); ctx.lineTo(5, -23);
            ctx.moveTo(5, -14); ctx.lineTo(15, -24); ctx.moveTo(15, -24); ctx.lineTo(10, -24); ctx.moveTo(15, -24); ctx.lineTo(15, -19); ctx.stroke();
            ctx.restore();
        }
        if (isBurnt) {
            drawLedSmoke(performance.now() / 350);
        }
        drawLabels(comp.label, isBurnt ? 'GRILLÉE' : (isLit ? 'ALLUMÉE' : 'ÉTEINTE'), rot);
    }
    else if (comp.type === 'gimp') {
        ctx.save();
        if (comp.flipX) ctx.scale(-1, 1);
        ctx.strokeStyle = '#ab47bc'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(8, 0); ctx.lineTo(40, 0);
        ctx.moveTo(0, 18); ctx.lineTo(0, 40);
        ctx.stroke();
        ctx.fillStyle = '#1e1e1e'; ctx.fillRect(-18, -18, 26, 36); ctx.strokeRect(-18, -18, 26, 36);
        ctx.fillStyle = '#ce93d8'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('G', -5, 0);
        ctx.restore();
        drawLabels(comp.label, null, 0);
    }
    else if (comp.type === 'gsin') {
        ctx.strokeStyle = '#26c6da'; ctx.lineWidth = 2; ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(-18, -14, 36, 28); ctx.strokeRect(-18, -14, 36, 28);
        ctx.strokeStyle = '#4dd0e1'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-14, 0);
        ctx.quadraticCurveTo(-7, -10, 0, 0);
        ctx.quadraticCurveTo(7, 10, 14, 0);
        ctx.stroke();
        ctx.lineWidth = 2; ctx.strokeStyle = '#26c6da';
        ctx.beginPath();
        ctx.moveTo(18, 0); ctx.lineTo(40, 0);
        ctx.moveTo(0, 14); ctx.lineTo(0, 40);
        ctx.stroke();
        drawWirePlusLabel(40, 0);
        drawLabels(comp.label, null, 0);
    }
    else if (comp.type === 'gsqr') {
        ctx.strokeStyle = '#29b6f6'; ctx.lineWidth = 2; ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(-18, -14, 36, 28); ctx.strokeRect(-18, -14, 36, 28);
        ctx.strokeStyle = '#4fc3f7'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-14, 6); ctx.lineTo(-14, -6); ctx.lineTo(-2, -6); ctx.lineTo(-2, 6); ctx.lineTo(10, 6); ctx.lineTo(10, -6); ctx.lineTo(14, -6);
        ctx.stroke();
        ctx.lineWidth = 2; ctx.strokeStyle = '#29b6f6';
        ctx.beginPath();
        ctx.moveTo(18, 0); ctx.lineTo(40, 0);
        ctx.moveTo(0, 14); ctx.lineTo(0, 40);
        ctx.stroke();
        drawWirePlusLabel(40, 0);
        drawLabels(comp.label, null, 0);
    }
    else if (comp.type === 'oscilloscope') {
        ctx.strokeStyle = '#00bcd4'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-60, -20); ctx.lineTo(-42, -20);
        ctx.moveTo(-60, 20); ctx.lineTo(-42, 20);
        ctx.moveTo(0, 24); ctx.lineTo(0, 60);
        ctx.stroke();
        ctx.fillStyle = '#8899aa'; ctx.font = '9px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText('CH1', -51, -22);
        ctx.fillText('CH2', -51, 18);
        drawOscilloscopeScreen(comp);
    }
    else if (comp.type === 'voltmeter') {
        let displayValue = '0.0';
        let rawV = null;
        const animV = flags.isSimulating ? getAnimatedVoltmeterVoltage(comp.label) : null;
        if (animV != null && Number.isFinite(animV)) {
            rawV = animV;
        } else if (flags.isSimulating && simulationResults.voltmeters && simulationResults.voltmeters[comp.label] !== undefined) {
            let measureData = simulationResults.voltmeters[comp.label];
            if (measureData && typeof measureData === 'object' && measureData.voltage !== undefined) {
                rawV = measureData.voltage;
            } else if (typeof measureData === 'number') { rawV = measureData; }
        }
        if (rawV != null && Number.isFinite(rawV)) {
            displayValue = formatMeterValue(quantizeVoltmeterReading(rawV));
        }
        drawMeterBody('#00bcd4');
        drawMeterDisplay(displayValue, ' V', rot);
        drawLabels(comp.label, null, rot);
    }
    else if (comp.type === 'ammeter') {
        let displayValue = '0.0';
        let unit = 'A';
        if (flags.isSimulating && simulationResults.ammeters && simulationResults.ammeters[comp.label] !== undefined) {
            const measureData = simulationResults.ammeters[comp.label];
            const i = (measureData && typeof measureData === 'object') ? measureData.current : measureData;
            displayValue = formatCurrentDisplay(i);
            unit = formatCurrentUnit(i);
        }
        drawMeterBody('#ff9800');
        drawMeterDisplay(displayValue, unit, rot);
        drawLabels(comp.label, null, rot);
    }
    else if (comp.type === 'ohmmeter') {
        let displayValue = '0';
        let unit = 'Ω';
        if (flags.isSimulating && simulationResults.ohmmeters && simulationResults.ohmmeters[comp.label] !== undefined) {
            const measureData = simulationResults.ohmmeters[comp.label];
            const r = (measureData && typeof measureData === 'object') ? measureData.resistance : measureData;
            displayValue = formatResistanceDisplay(r);
            unit = formatResistanceUnit(r);
        }
        drawMeterBody('#ce93d8', false);
        drawMeterDisplay(displayValue, unit, rot);
        drawLabels(comp.label, null, rot);
    }
    ctx.restore();

    getComponentJonctions(comp).forEach(j => {
        if (!isJonctionConnected(j.id)) {
            ctx.save(); const isHovered = interaction.hoverJonction && interaction.hoverJonction.id === j.id;
            ctx.fillStyle = isHovered ? '#ff5722' : '#ff3333';
            ctx.beginPath(); ctx.arc(j.x, j.y, isHovered ? 6 : 4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
    });
}

function drawWires() {
    ctx.save();
    circuit.wires.forEach(w => {
        if (w === interaction.selectedWire) { ctx.strokeStyle = '#ff9800'; ctx.lineWidth = 4.0; } 
        else if (w === interaction.hoveredWire) { ctx.strokeStyle = '#ffeb3b'; ctx.lineWidth = 3.5; } 
        else { ctx.strokeStyle = '#00ffaa'; ctx.lineWidth = 2.5; } 
        ctx.beginPath(); ctx.moveTo(w.points[0].x, w.points[0].y);
        for (let i = 1; i < w.points.length; i++) ctx.lineTo(w.points[i].x, w.points[i].y);
        ctx.stroke();
    });
    if (interaction.activeWire) {
        ctx.strokeStyle = '#ffeb3b'; ctx.lineWidth = 2.5; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(interaction.activeWire.points[0].x, interaction.activeWire.points[0].y);
        for (let i = 1; i < interaction.activeWire.points.length; i++) ctx.lineTo(interaction.activeWire.points[i].x, interaction.activeWire.points[i].y);
        ctx.stroke();
    }
    ctx.restore();

    circuit.autoJunctions.forEach(aj => {
        ctx.save(); const isHovered = interaction.hoverJonction && interaction.hoverJonction.id === aj.id;
        const isSelected = interaction.selectedAutoJunctions.includes(aj);
        if (isSelected) { ctx.fillStyle = '#00bcd4'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; } 
        else { ctx.fillStyle = '#00ffaa'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = isHovered ? 2 : 1; }
        ctx.beginPath(); ctx.arc(aj.x, aj.y, (isHovered || isSelected) ? 6 : 4.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    });
}

function drawGrid() {
    ctx.strokeStyle = '#262626'; ctx.lineWidth = 1 / scale.value;
    const startLeft = Math.floor(-pan.x / scale.value / GRID_SIZE) * GRID_SIZE;
    const startTop = Math.floor(-pan.y / scale.value / GRID_SIZE) * GRID_SIZE;
    const endRight = startLeft + canvas.width / scale.value + GRID_SIZE;
    const endBottom = startTop + canvas.height / scale.value + GRID_SIZE;
    ctx.beginPath();
    for (let x = startLeft; x < endRight; x += GRID_SIZE) { ctx.moveTo(x, startTop); ctx.lineTo(x, endBottom); }
    for (let y = startTop; y < endBottom; y += GRID_SIZE) { ctx.moveTo(startLeft, y); ctx.lineTo(endRight, y); }
    ctx.stroke();
}

export function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save(); ctx.translate(pan.x, pan.y); ctx.scale(scale.value, scale.value);
    drawGrid(); drawWires(); circuit.components.forEach(comp => drawComponentBody(comp)); 
    if (flags.isSelectingZone) {
        ctx.save(); ctx.strokeStyle = 'rgba(0, 188, 212, 0.7)'; ctx.fillStyle = 'rgba(0, 188, 212, 0.15)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
        ctx.fillRect(zone.start.x, zone.start.y, zone.end.x - zone.start.x, zone.end.y - zone.start.y);
        ctx.strokeRect(zone.start.x, zone.start.y, zone.end.x - zone.start.x, zone.end.y - zone.start.y); ctx.restore();
    }
    if (flags.isDraggingFromMenu && menuDrag.draggedComponentType) {
        ctx.globalAlpha = 0.5; drawComponentBody({ type: menuDrag.draggedComponentType, x: snapToGrid(menuDrag.x), y: snapToGrid(menuDrag.y), label: "", rotation: 0, state: 0 }); ctx.globalAlpha = 1.0;
    }
    ctx.restore();
}