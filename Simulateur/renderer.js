// renderer.js
import { canvas, ctx as mainCtx, GRID_SIZE, scale, pan, flags, circuit, interaction, zone, menuDrag, snapToGrid, simulationResults } from './state.js';

let rCtx = mainCtx;
let rCanvas = canvas;

function withRenderSurface(surface, fn) {
    const prev = { ctx: rCtx, canvas: rCanvas };
    rCtx = surface.ctx;
    rCanvas = surface.canvas;
    try {
        return fn();
    } finally {
        rCtx = prev.ctx;
        rCanvas = prev.canvas;
    }
}
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
    IC90_Q_STACK_INDICES,
} from './ic74hc90-layout.js';
import {
    LM386_BOX_B,
    LM386_BOX_L,
    LM386_BOX_R,
    LM386_BOX_T,
    LM386_JUNC_L,
    LM386_JUNC_R,
    LM386_LABEL_L,
    LM386_LABEL_R,
    LM386_LEFT_PIN_Y,
    LM386_RIGHT_PIN_Y,
    LM386_HIT_DX,
    LM386_HIT_DY,
} from './lm386-layout.js';
import {
    LM7805_BOX_B,
    LM7805_BOX_L,
    LM7805_BOX_R,
    LM7805_BOX_T,
    LM7805_JUNC_L,
    LM7805_LABEL_L,
    LM7805_PIN_Y,
    LM7805_HIT_DX,
    LM7805_HIT_DY,
} from './lm7805-layout.js';
import {
    IR2104_BOX_B,
    IR2104_BOX_L,
    IR2104_BOX_R,
    IR2104_BOX_T,
    IR2104_HIT_DX,
    IR2104_HIT_DY,
    IR2104_JUNC_L,
    IR2104_JUNC_R,
    IR2104_LABEL_L,
    IR2104_LABEL_R,
    IR2104_LEFT_PIN_Y,
    IR2104_RIGHT_PIN_Y,
} from './ir2104-layout.js';
import {
    L293D_BOX_B,
    L293D_BOX_L,
    L293D_BOX_R,
    L293D_BOX_T,
    L293D_HIT_DX,
    L293D_HIT_DY,
    L293D_JUNC_L,
    L293D_JUNC_R,
    L293D_LABEL_L,
    L293D_LABEL_R,
    L293D_LEFT_PIN_Y,
    L293D_RIGHT_PIN_Y,
} from './l293d-layout.js';
import {
    SERVO_BODY_W,
    SERVO_BODY_H,
    SERVO_JUNC_L,
    SERVO_JUNC_R,
    SERVO_PIN_PLUS_Y,
    SERVO_PIN_MINUS_Y,
    SERVO_PIN_SIGNAL_Y,
} from './servo-motor-layout.js';
import {
    UNO_BOX_B,
    UNO_BOX_L,
    UNO_BOX_R,
    UNO_BOX_T,
    UNO_JUNC_L,
    UNO_JUNC_R,
    UNO_LABEL_L,
    UNO_LABEL_R,
    UNO_HIT_DX,
    UNO_HIT_DY,
    UNO_LEFT_PINS,
    UNO_RIGHT_PINS,
    UNO_LEFT_PIN_Y,
    UNO_RIGHT_PIN_Y,
    UNO_DIGITAL_PINS,
    formatUnoPinLabel,
} from './arduino-uno-layout.js';
import {
    ESP32_BOX_B,
    ESP32_BOX_L,
    ESP32_BOX_R,
    ESP32_BOX_T,
    ESP32_JUNC_L,
    ESP32_JUNC_R,
    ESP32_LABEL_L,
    ESP32_LABEL_R,
    ESP32_LEFT_PINS,
    ESP32_RIGHT_PINS,
    ESP32_LEFT_PIN_Y,
    ESP32_RIGHT_PIN_Y,
    ESP32_GPIO_PINS,
    formatEsp32PinLabel,
} from './esp32-c3-layout.js';
import {
    ESP32_DEVKIT_BOX_B,
    ESP32_DEVKIT_BOX_L,
    ESP32_DEVKIT_BOX_R,
    ESP32_DEVKIT_BOX_T,
    ESP32_DEVKIT_JUNC_L,
    ESP32_DEVKIT_JUNC_R,
    ESP32_DEVKIT_LABEL_L,
    ESP32_DEVKIT_LABEL_R,
    ESP32_DEVKIT_LEFT_PINS,
    ESP32_DEVKIT_RIGHT_PINS,
    ESP32_DEVKIT_LEFT_PIN_Y,
    ESP32_DEVKIT_RIGHT_PIN_Y,
    ESP32_DEVKIT_GPIO_PINS,
    formatEsp32DevkitPinLabel,
} from './esp32-devkit-layout.js';
import { getComponentJonctions, isJonctionConnected, getVoltageAtJonction, syncWireEndpointsToJonctions } from './geometry.js';
import { getBottomPanelHeight } from './source-panel.js';
import { getArduinoPanelWidth } from './arduino-editor.js';
import { isGroveLcdWiredToBoard } from './Engine/grove-lcd-ideal.mjs';
import { isJoyitTft18WiredToBoard } from './Engine/tft18-ideal.mjs';
import {
    GROVE_LCD_CONN_L,
    GROVE_LCD_BOX_L,
    GROVE_LCD_BOX_R,
    GROVE_LCD_BOX_T,
    GROVE_LCD_BOX_B,
    GROVE_LCD_JUNC_X,
    GROVE_LCD_PIN_Y,
    GROVE_LCD_HIT_DX,
    GROVE_LCD_HIT_DY,
    GROVE_LCD_PINS,
    GROVE_LCD_COLS,
    GROVE_LCD_ROWS,
    GROVE_LCD_BEZEL,
    GROVE_LCD_CONNECTOR_W,
    GROVE_LCD_SCREEN_L,
    GROVE_LCD_SCREEN_R,
    GROVE_LCD_SCREEN_T,
    GROVE_LCD_SCREEN_B,
    GROVE_LCD_SEL_L,
    GROVE_LCD_SEL_T,
    GROVE_LCD_SEL_W,
    GROVE_LCD_SEL_H,
    GROVE_LCD_PIN_LABEL_X,
    GROVE_LCD_STUB_LEN,
} from './grove-lcd-layout.js';
import {
    TFT18_CONN_L,
    TFT18_BOX_L,
    TFT18_BOX_R,
    TFT18_BOX_T,
    TFT18_BOX_B,
    TFT18_JUNC_X,
    TFT18_PIN_Y,
    TFT18_PINS,
    TFT18_CONNECTOR_W,
    TFT18_SCREEN_L,
    TFT18_SCREEN_R,
    TFT18_SCREEN_T,
    TFT18_SCREEN_B,
    TFT18_SEL_L,
    TFT18_SEL_T,
    TFT18_SEL_W,
    TFT18_SEL_H,
    TFT18_PIN_LABEL_X,
} from './tft18-layout.js';
import { TFT_NATIVE_W, TFT_NATIVE_H, TFT_GFX_CHAR_W, TFT_GFX_CHAR_H } from './Engine/tft18-sketch-parse.mjs';
import {
    GROVE_DHT22_CONN_L,
    GROVE_DHT22_BOX_L,
    GROVE_DHT22_BOX_R,
    GROVE_DHT22_BOX_T,
    GROVE_DHT22_BOX_B,
    GROVE_DHT22_JUNC_X,
    GROVE_DHT22_PIN_Y,
    GROVE_DHT22_PINS,
    GROVE_DHT22_CONNECTOR_W,
    GROVE_DHT22_SENSOR_L,
    GROVE_DHT22_SENSOR_R,
    GROVE_DHT22_SENSOR_T,
    GROVE_DHT22_SENSOR_B,
    GROVE_DHT22_SEL_L,
    GROVE_DHT22_SEL_T,
    GROVE_DHT22_SEL_W,
    GROVE_DHT22_SEL_H,
    GROVE_DHT22_PIN_LABEL_X,
} from './dht22-layout.js';
import {
    GROVE_TSL2591_CONN_L,
    GROVE_TSL2591_BOX_L,
    GROVE_TSL2591_BOX_R,
    GROVE_TSL2591_BOX_T,
    GROVE_TSL2591_BOX_B,
    GROVE_TSL2591_JUNC_X,
    GROVE_TSL2591_PIN_Y,
    GROVE_TSL2591_PINS,
    GROVE_TSL2591_CONNECTOR_W,
    GROVE_TSL2591_SENSOR_L,
    GROVE_TSL2591_SENSOR_R,
    GROVE_TSL2591_SENSOR_T,
    GROVE_TSL2591_SENSOR_B,
    GROVE_TSL2591_SEL_L,
    GROVE_TSL2591_SEL_T,
    GROVE_TSL2591_SEL_W,
    GROVE_TSL2591_SEL_H,
    GROVE_TSL2591_PIN_LABEL_X,
} from './tsl2591-layout.js';
import {
    GROVE_BMP280_CONN_L,
    GROVE_BMP280_BOX_L,
    GROVE_BMP280_BOX_R,
    GROVE_BMP280_BOX_T,
    GROVE_BMP280_BOX_B,
    GROVE_BMP280_JUNC_X,
    GROVE_BMP280_PIN_Y,
    GROVE_BMP280_PINS,
    GROVE_BMP280_CONNECTOR_W,
    GROVE_BMP280_SENSOR_L,
    GROVE_BMP280_SENSOR_R,
    GROVE_BMP280_SENSOR_T,
    GROVE_BMP280_SENSOR_B,
    GROVE_BMP280_SEL_L,
    GROVE_BMP280_SEL_T,
    GROVE_BMP280_SEL_W,
    GROVE_BMP280_SEL_H,
    GROVE_BMP280_PIN_LABEL_X,
} from './bmp280-layout.js';
import {
    DC10H_SEG_COUNT,
    DC10H_SEG_NAMES,
    DC10H_PIN_Y,
    DC10H_BOX_L,
    DC10H_BOX_R,
    DC10H_BOX_T,
    DC10H_BOX_B,
    DC10H_BAR_H,
    DC10H_COM_X,
    DC10H_COM_Y,
    DC10H_JUNC_L,
    DC10H_JUNC_R,
    DC10H_SEL_L,
    DC10H_SEL_T,
    DC10H_SEL_W,
    DC10H_SEL_H,
    DC10H_COMP_LABEL_OFFSET,
    DC10H_TYPE_LABEL_OFFSET,
    DC10H_PIN_LABEL_OFFSET_X,
    DC10H_COM_LABEL_OFFSET_X,
    dc10hBarTopY,
    dc10hComX,
    dc10hPalette,
} from './bargraph-dc10h-layout.js';
import {
    MATRIX_SIZE,
    MATRIX_PIN_Y,
    MATRIX_ROW_NAMES,
    MATRIX_COL_NAMES,
    MATRIX_BOX_L,
    MATRIX_BOX_R,
    MATRIX_BOX_T,
    MATRIX_BOX_B,
    MATRIX_BOX_CX,
    MATRIX_CELL,
    MATRIX_SEL_L,
    MATRIX_SEL_T,
    MATRIX_SEL_W,
    MATRIX_SEL_H,
    MATRIX_COMP_LABEL_OFFSET,
    MATRIX_TYPE_LABEL_OFFSET,
    MATRIX_PIN_LABEL_OFFSET_X,
    matrixCellOrigin,
    matrixRowJuncX,
    matrixColJuncX,
    matrixPalette,
} from './matrix-8x8-layout.js';
import {
    getHd44780Glyph,
    HD44780_CHAR_W,
    HD44780_CHAR_H,
    HD44780_NATIVE_W,
} from './hd44780-font.js';
import { getGfxGlyph } from './gfx-glcd-font.js';
import { getAnimatedHc90Bcd, getAnimatedLedCurrent, getAnimatedSeg7Segments, getAnimatedBargraphSegments, getAnimatedMatrix8x8Cells, getAnimatedVoltmeterVoltage, getIdealSeg7Display, getIdealBargraphDisplay, getIdealMatrix8x8Display, getAnimatedGroveLcdDisplay, getAnimatedJoyitTft18Display, isLedOvercurrent, quantizeVoltmeterReading } from './led-animation.js';
import { isSpeakerAudioPlaying } from './speaker-audio.js';
import { getMotorRotationDeg, getServoAngleDeg } from './led-animation.js';
import { COLORS, showGrid } from './theme.js';
import { drawPrintFrameOverlay, getPrintCaptureRect, printFrame } from './print-frame.js';
function hc90SimCount(comp) {
    if (!flags.isSimulating || !comp?.label) return null;
    const bcdAnim = getAnimatedHc90Bcd(comp.label);
    if (bcdAnim != null) return bcdAnim;
    let n = 0;
    let any = false;
    for (let i = 0; i < 4; i++) {
        const lv = simulationResults.logicValues?.[`${comp.label}_Q${i}`];
        if (lv && lv.logic === 1) {
            n |= 1 << i;
            any = true;
        } else if (lv && lv.logic === 0) any = true;
    }
    return any ? n : null;
}

export function resizeCanvas() {
    const container = canvas.parentElement;
    const w = container?.clientWidth > 0
        ? container.clientWidth
        : Math.max(200, window.innerWidth - getArduinoPanelWidth());
    const h = container?.clientHeight > 0
        ? container.clientHeight
        : Math.max(200, window.innerHeight - 48 - getBottomPanelHeight());
    canvas.width = Math.max(200, Math.floor(w));
    canvas.height = Math.max(200, Math.floor(h));
    draw();
}

function drawUprightText(angle, fn) {
    rCtx.save();
    if (angle) rCtx.rotate(-angle * Math.PI / 180);
    fn();
    rCtx.restore();
}

/** Texte horizontal à un point (x,y) du repère composant déjà pivoté. */
function drawUprightTextAt(angle, x, y, fn) {
    rCtx.save();
    rCtx.translate(x, y);
    if (angle) rCtx.rotate(-angle * Math.PI / 180);
    fn();
    rCtx.restore();
}

/** Décalage en repère composant (tourne avec le symbole), puis texte horizontal. */
function drawUprightTextAtLocal(angle, x, y, localOffX, localOffY, fn) {
    rCtx.save();
    rCtx.translate(x, y);
    rCtx.translate(localOffX, localOffY);
    if (angle) rCtx.rotate(-angle * Math.PI / 180);
    fn();
    rCtx.restore();
}

function drawOutlinedText(text) {
    rCtx.lineWidth = 3;
    rCtx.lineJoin = 'round';
    rCtx.strokeStyle = 'rgba(8, 8, 12, 0.92)';
    rCtx.strokeText(text, 0, 0);
    rCtx.fillStyle = COLORS.ink;
    rCtx.fillText(text, 0, 0);
}

function formatDisplayValue(val) {
    if (val == null || val === '') return '';
    return String(val).trim()
        .replace(/Kohm/gi, 'K')
        .replace(/Mohm/gi, 'M')
        .replace(/ohm/gi, '');
}

/** Sépare préfixe et indice numérique (R1 → R + 1, 78051 → 7805 + 1). */
function splitComponentLabel(label) {
    if (!label) return { prefix: '', suffix: '' };
    const m = String(label).match(/^(.+?)(\d+)$/);
    if (m) return { prefix: m[1], suffix: m[2] };
    return { prefix: String(label), suffix: '' };
}

function drawLabels(name, value, angle, opts = {}) {
    const labelX = opts.labelX ?? -38;
    const nameY = opts.nameY ?? -36;
    const textAlign = opts.textAlign ?? 'left';
    drawUprightText(angle, () => {
        const { prefix, suffix } = splitComponentLabel(name);
        if (prefix || suffix) {
            rCtx.textBaseline = 'top';
            rCtx.textAlign = 'left';
            rCtx.font = '12px Arial';
            const prefixW = prefix ? rCtx.measureText(prefix).width : 0;
            rCtx.font = '10px Arial';
            const suffixW = suffix ? rCtx.measureText(suffix).width : 0;
            let x = textAlign === 'center' ? labelX - (prefixW + suffixW) / 2 : labelX;
            if (prefix) {
                rCtx.fillStyle = COLORS.ink;
                rCtx.font = '12px Arial';
                rCtx.fillText(prefix, x, nameY);
                x += prefixW;
            }
            if (suffix) {
                rCtx.fillStyle = COLORS.inkMuted;
                rCtx.font = '10px Arial';
                rCtx.fillText(suffix, x, nameY + 1);
            }
        }
        const display = formatDisplayValue(value);
        if (display) {
            rCtx.fillStyle = COLORS.inkMuted;
            rCtx.font = '11px Arial';
            rCtx.textAlign = textAlign;
            rCtx.textBaseline = 'top';
            rCtx.fillText(display, labelX, (prefix || suffix) ? nameY + 14 : nameY);
        }
    });
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
    rCtx.font = 'bold 12px Arial';
    rCtx.textAlign = 'center';
    rCtx.textBaseline = 'bottom';
    rCtx.fillStyle = '#ff5252';
    rCtx.fillText('+', wireEndX, wireY - 6);
}

/** Libellé de broche au-dessus du fil (pas sur le trait). */
function drawPinLabelAbove(angle, wireX, wireY, text, align = 'center', kind = 'default') {
    drawUprightTextAt(angle, wireX, wireY - 6, () => {
        rCtx.textAlign = align;
        rCtx.textBaseline = 'bottom';
        if (kind === 'plus') {
            rCtx.font = 'bold 11px Arial';
            rCtx.fillStyle = '#ff5252';
        } else {
            rCtx.font = '7px Arial';
            rCtx.fillStyle = '#eceff1';
        }
        rCtx.fillText(text, 0, 0);
    });
}

function drawMeterBody(color = '#00bcd4', showPlus = true) {
    rCtx.strokeStyle = color; rCtx.lineWidth = 2; rCtx.fillStyle = COLORS.meterFill;
    rCtx.beginPath(); rCtx.arc(0, 0, 20, 0, Math.PI * 2); rCtx.fill(); rCtx.stroke();
    rCtx.strokeStyle = color;
    rCtx.beginPath(); rCtx.moveTo(-40, 0); rCtx.lineTo(-20, 0); rCtx.moveTo(20, 0); rCtx.lineTo(40, 0); rCtx.stroke();
    if (showPlus) drawWirePlusLabel(40, 0);
}

function drawOscilloscopeScreen(comp) {
    const x0 = -42, y0 = -24, w = 84, h = 48;
    rCtx.fillStyle = COLORS.scopeBg;
    rCtx.fillRect(x0, y0, w, h);
    rCtx.strokeStyle = COLORS.scopeGrid;
    rCtx.lineWidth = 1;
    const divW = w / 8;
    const divH = h / 8;
    for (let i = 1; i < 8; i++) {
        rCtx.beginPath(); rCtx.moveTo(x0 + i * divW, y0); rCtx.lineTo(x0 + i * divW, y0 + h); rCtx.stroke();
    }
    for (let j = 1; j < 8; j++) {
        rCtx.beginPath(); rCtx.moveTo(x0, y0 + j * divH); rCtx.lineTo(x0 + w, y0 + j * divH); rCtx.stroke();
    }
    rCtx.fillStyle = COLORS.scopeLabel;
    rCtx.font = 'bold 11px Arial';
    rCtx.textAlign = 'center';
    rCtx.textBaseline = 'middle';
    rCtx.fillText('Osci', 0, 0);
    rCtx.strokeStyle = '#00bcd4';
    rCtx.lineWidth = 2;
    rCtx.strokeRect(x0, y0, w, h);
    rCtx.fillStyle = COLORS.ink;
    rCtx.font = '12px Arial';
    rCtx.textAlign = 'center';
    rCtx.textBaseline = 'bottom';
    rCtx.fillText(comp.label, 0, y0 - 6);
}

const SEG7_PIN_Y = [-60, -40, -20, 0, 20, 40, 60];
const SEG7_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

function seg7SetFrom(segments) {
    return new Set(Object.entries(segments).filter(([, on]) => on).map(([k]) => k));
}

function getSeg7LitSet(comp) {
    if (!flags.isSimulating) return new Set();
    const anim = getAnimatedSeg7Segments(comp.label);
    if (anim?.segments) return seg7SetFrom(anim.segments);
    const data = simulationResults.seg7?.[comp.label];
    if (data?.segments) return seg7SetFrom(data.segments);
    const idealArduino = getIdealSeg7Display(comp.label);
    if (idealArduino?.segments && !idealArduino.blank) {
        return seg7SetFrom(idealArduino.segments);
    }
    return new Set();
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
    rCtx.strokeStyle = pinColor;
    rCtx.lineWidth = 3;
    for (let i = 0; i < 7; i++) {
        rCtx.beginPath();
        rCtx.moveTo(-40, pinYs[i]);
        rCtx.lineTo(boxL, pinYs[i]);
        rCtx.stroke();
    }
    // Patte commune : sort du bas vers la pastille commune (centrée + plus longue)
    rCtx.beginPath();
    rCtx.moveTo(comX, boxB);
    rCtx.lineTo(comX, comY);
    rCtx.stroke();

    // Boîtier droit (non incliné)
    rCtx.strokeStyle = COLORS.componentStroke;
    rCtx.lineWidth = 2;
    rCtx.strokeRect(boxL, boxT, boxR - boxL, boxB - boxT);

    // Segments du chiffre centrés dans le boîtier, légèrement inclinés
    rCtx.save();
    rCtx.transform(1, 0, -0.14, 1, 0, 0);

    const segMarginX = 15;
    const segMarginTop = 22;
    const segMarginBottom = 24;
    const leftX = boxL + segMarginX;
    const rightX = boxR - segMarginX;
    const topY = boxT + segMarginTop;
    const botY = boxB - segMarginBottom;
    const midY = (topY + botY) / 2;
    rCtx.lineCap = 'round';
    rCtx.lineWidth = 6;
    const seg = (x1, y1, x2, y2, name) => {
        rCtx.strokeStyle = segColor(name);
        rCtx.beginPath();
        rCtx.moveTo(x1, y1);
        rCtx.lineTo(x2, y2);
        rCtx.stroke();
    };
    const hInset = 4;
    seg(leftX + hInset, topY, rightX - hInset, topY, 'a');    // haut
    seg(rightX, topY + 5, rightX, midY - 5, 'b');             // haut-droite
    seg(rightX, midY + 5, rightX, botY - 5, 'c');             // bas-droite
    seg(leftX + hInset, botY, rightX - hInset, botY, 'd');    // bas
    seg(leftX, midY + 5, leftX, botY - 5, 'e');               // bas-gauche
    seg(leftX, topY + 5, leftX, midY - 5, 'f');               // haut-gauche
    seg(leftX + hInset, midY, rightX - hInset, midY, 'g');    // milieu
    rCtx.restore();

    // Étiquettes des broches a..g, au-dessus de chaque patte près du boîtier
    rCtx.fillStyle = COLORS.ink;
    rCtx.font = 'bold 12px Arial';
    rCtx.textAlign = 'right';
    rCtx.textBaseline = 'bottom';
    for (let i = 0; i < 7; i++) rCtx.fillText(names[i], boxL - 4, pinYs[i] - 2);
    // Étiquette de la borne commune C
    rCtx.textAlign = 'left';
    rCtx.textBaseline = 'middle';
    rCtx.fillText('C', comX + 8, comY);
    // Nom du composant
    rCtx.textAlign = 'center';
    rCtx.textBaseline = 'bottom';
    rCtx.fillText(comp.label, 26, boxT - 6);
}

function bargraphLitSetFrom(segments) {
    return new Set(Object.entries(segments).filter(([, on]) => on).map(([k]) => k));
}

function getBargraphLitSet(comp) {
    if (!flags.isSimulating) return new Set();
    const anim = getAnimatedBargraphSegments(comp.label);
    if (anim?.segments) return bargraphLitSetFrom(anim.segments);
    const data = simulationResults.bargraph?.[comp.label];
    const spiceSet = data?.segments ? bargraphLitSetFrom(data.segments) : new Set();
    const ideal = getIdealBargraphDisplay(comp.label);
    const idealSet = ideal?.segments ? bargraphLitSetFrom(ideal.segments) : new Set();
    if (spiceSet.size > 0) return spiceSet;
    if (idealSet.size > 0) return idealSet;
    return spiceSet;
}

function drawBargraphLabel(text, x, y, opts = {}) {
    const {
        font = 'bold 8px Arial',
        align = 'center',
        baseline = 'middle',
        outlined = false,
        fill = COLORS.ink,
    } = opts;
    rCtx.font = font;
    rCtx.textAlign = align;
    rCtx.textBaseline = baseline;
    if (outlined) drawOutlinedTextAt(text, x, y, { font, align, baseline });
    else {
        rCtx.fillStyle = fill;
        rCtx.fillText(text, x, y);
    }
}

function drawBargraphDc10h(comp) {
    const lit = getBargraphLitSet(comp);
    const pal = dc10hPalette(comp.barColor || 'red');
    const segColor = (name) => (lit.has(name) ? pal.lit : pal.dim);
    const pinYs = DC10H_PIN_Y;
    const names = DC10H_SEG_NAMES;
    const pinColor = pal.pin;
    const flip = !!comp.flipX;

    const boxL = DC10H_BOX_L;
    const boxR = DC10H_BOX_R;
    const boxT = DC10H_BOX_T;
    const boxB = DC10H_BOX_B;
    const comY = DC10H_COM_Y;

    const juncX = flip ? DC10H_JUNC_R : DC10H_JUNC_L;
    const boxPinX = flip ? DC10H_BOX_R : DC10H_BOX_L;
    const comX = dc10hComX(flip);

    rCtx.strokeStyle = pinColor;
    rCtx.lineWidth = 2.5;
    rCtx.lineCap = 'round';
    for (let i = 0; i < DC10H_SEG_COUNT; i++) {
        rCtx.beginPath();
        rCtx.moveTo(juncX, pinYs[i]);
        rCtx.lineTo(boxPinX, pinYs[i]);
        rCtx.stroke();
    }
    rCtx.beginPath();
    rCtx.moveTo(comX, boxB);
    rCtx.lineTo(comX, comY);
    rCtx.stroke();

    rCtx.strokeStyle = COLORS.componentStroke;
    rCtx.lineWidth = 2;
    rCtx.strokeRect(boxL, boxT, boxR - boxL, boxB - boxT);

    const barL = boxL + 6;
    const barR = boxR - 6;
    for (let i = 0; i < DC10H_SEG_COUNT; i++) {
        const segName = names[i];
        const y = dc10hBarTopY(i);
        rCtx.fillStyle = segColor(segName);
        rCtx.fillRect(barL, y, barR - barL, DC10H_BAR_H);
        if (lit.has(segName)) {
            rCtx.fillStyle = 'rgba(255,255,255,0.15)';
            rCtx.fillRect(barL, y, barR - barL, DC10H_BAR_H * 0.35);
        }
    }

    const cx = (boxL + boxR) / 2;
    const pinLabelX = juncX + (flip ? -DC10H_PIN_LABEL_OFFSET_X : DC10H_PIN_LABEL_OFFSET_X);
    const comLabelX = comX + (flip ? -DC10H_COM_LABEL_OFFSET_X : DC10H_COM_LABEL_OFFSET_X);

    for (let i = 0; i < DC10H_SEG_COUNT; i++) {
        drawBargraphLabel(names[i], pinLabelX, pinYs[i], {
            font: 'bold 8px Arial',
            align: flip ? 'left' : 'right',
            baseline: 'middle',
            outlined: true,
        });
    }

    drawBargraphLabel('COM', comLabelX, (boxB + comY) / 2, {
        font: 'bold 8px Arial',
        align: flip ? 'right' : 'left',
        baseline: 'middle',
        outlined: true,
    });

    drawBargraphLabel(comp.label, cx, boxT - DC10H_COMP_LABEL_OFFSET, {
        font: '11px Arial',
        align: 'center',
        baseline: 'bottom',
        outlined: true,
    });

    drawBargraphLabel('DC10H', cx, comY + DC10H_TYPE_LABEL_OFFSET, {
        font: '9px Arial',
        align: 'center',
        baseline: 'top',
        fill: '#aaa',
    });
}

function matrixLitSetFrom(cells) {
    return new Set(Object.entries(cells).filter(([, on]) => on).map(([k]) => k));
}

function getMatrixLitSet(comp) {
    if (!flags.isSimulating) return new Set();
    const anim = getAnimatedMatrix8x8Cells(comp.label);
    if (anim?.cells) return matrixLitSetFrom(anim.cells);
    const ideal = getIdealMatrix8x8Display(comp.label);
    return ideal?.cells ? matrixLitSetFrom(ideal.cells) : new Set();
}

function drawMatrix8x8(comp) {
    const lit = getMatrixLitSet(comp);
    const pal = matrixPalette(comp.matrixColor || 'red');
    const flip = !!comp.flipX;
    const rowJx = matrixRowJuncX(flip);
    const colJx = matrixColJuncX(flip);
    const boxPinRowX = flip ? MATRIX_BOX_R : MATRIX_BOX_L;
    const boxPinColX = flip ? MATRIX_BOX_L : MATRIX_BOX_R;
    const pinColor = pal.pin;

    rCtx.strokeStyle = pinColor;
    rCtx.lineWidth = 2.5;
    rCtx.lineCap = 'round';
    for (let i = 0; i < MATRIX_SIZE; i++) {
        rCtx.beginPath();
        rCtx.moveTo(rowJx, MATRIX_PIN_Y[i]);
        rCtx.lineTo(boxPinRowX, MATRIX_PIN_Y[i]);
        rCtx.stroke();
        rCtx.beginPath();
        rCtx.moveTo(colJx, MATRIX_PIN_Y[i]);
        rCtx.lineTo(boxPinColX, MATRIX_PIN_Y[i]);
        rCtx.stroke();
    }

    rCtx.strokeStyle = COLORS.componentStroke;
    rCtx.lineWidth = 2;
    rCtx.strokeRect(MATRIX_BOX_L, MATRIX_BOX_T, MATRIX_BOX_R - MATRIX_BOX_L, MATRIX_BOX_B - MATRIX_BOX_T);

    for (let r = 0; r < MATRIX_SIZE; r++) {
        for (let c = 0; c < MATRIX_SIZE; c++) {
            const key = `r${r}c${c}`;
            const { x, y } = matrixCellOrigin(r, c);
            rCtx.fillStyle = lit.has(key) ? pal.lit : pal.dim;
            rCtx.fillRect(x, y, MATRIX_CELL, MATRIX_CELL);
            if (lit.has(key)) {
                rCtx.fillStyle = 'rgba(255,255,255,0.18)';
                rCtx.fillRect(x, y, MATRIX_CELL, MATRIX_CELL * 0.35);
            }
            rCtx.strokeStyle = 'rgba(0,0,0,0.35)';
            rCtx.lineWidth = 0.5;
            rCtx.strokeRect(x, y, MATRIX_CELL, MATRIX_CELL);
        }
    }

    const rowLabelX = rowJx + (flip ? -MATRIX_PIN_LABEL_OFFSET_X : MATRIX_PIN_LABEL_OFFSET_X);
    const colLabelX = colJx + (flip ? MATRIX_PIN_LABEL_OFFSET_X : -MATRIX_PIN_LABEL_OFFSET_X);
    for (let i = 0; i < MATRIX_SIZE; i++) {
        drawBargraphLabel(MATRIX_ROW_NAMES[i], rowLabelX, MATRIX_PIN_Y[i], {
            font: 'bold 7px Arial',
            align: flip ? 'left' : 'right',
            baseline: 'middle',
            outlined: true,
        });
        drawBargraphLabel(MATRIX_COL_NAMES[i], colLabelX, MATRIX_PIN_Y[i], {
            font: 'bold 7px Arial',
            align: flip ? 'right' : 'left',
            baseline: 'middle',
            outlined: true,
        });
    }

    drawBargraphLabel(comp.label, MATRIX_BOX_CX, MATRIX_BOX_T - MATRIX_COMP_LABEL_OFFSET, {
        font: '11px Arial',
        align: 'center',
        baseline: 'bottom',
        outlined: true,
    });

    drawBargraphLabel('8×8 CC', MATRIX_BOX_CX, MATRIX_BOX_B + MATRIX_TYPE_LABEL_OFFSET, {
        font: '9px Arial',
        align: 'center',
        baseline: 'top',
        fill: '#aaa',
    });
}

function drawOutlinedTextAt(text, x, y, { font, align, baseline }) {
    rCtx.font = font;
    rCtx.textAlign = align;
    rCtx.textBaseline = baseline;
    rCtx.lineWidth = 3;
    rCtx.lineJoin = 'round';
    rCtx.strokeStyle = 'rgba(8, 8, 12, 0.92)';
    rCtx.strokeText(text, x, y);
    rCtx.fillStyle = COLORS.ink;
    rCtx.fillText(text, x, y);
}

function getGroveLcdDisplayState(comp) {
    if (!comp?.label) {
        return { lines: ['', ''], backlight: false, wired: false, blank: true };
    }
    if (!flags.isSimulating) {
        const wired = isGroveLcdWiredToBoard(
            comp.label,
            circuit.components,
            circuit.wires,
            circuit.autoJunctions
        );
        return { lines: ['', ''], backlight: false, wired, blank: true, rgb: null };
    }
    return getAnimatedGroveLcdDisplay(comp.label);
}

/** Grille native HD44780 : 16×5 = 80 px/ligne, 2×8 = 16 px haut → 1280 points. */
const LCD_NATIVE_H = HD44780_CHAR_H * GROVE_LCD_ROWS;
/** Marge 1 px natif (haut, gauche, droite) pour ne pas toucher le cadre vert. */
const LCD_MARGIN_L = 1;
const LCD_MARGIN_T = 1;
const LCD_MARGIN_R = 1;
const LCD_FRAME_W = HD44780_NATIVE_W + LCD_MARGIN_L + LCD_MARGIN_R;
const LCD_FRAME_H = LCD_NATIVE_H + LCD_MARGIN_T;

function groveLcdTextColor(state, screenOn) {
    if (!screenOn) return state.wired ? '#1a2a1a' : '#6a8a6a';
    const rgb = state.rgb;
    if (rgb && rgb.r != null) {
        const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
        return lum > 0.45 ? '#111111' : '#e8e8e8';
    }
    return '#111111';
}

function groveLcdBacklightFill(state, screenOn) {
    if (!screenOn) return '#1e2a1e';
    const rgb = state.rgb;
    if (rgb && rgb.r != null) {
        return `rgb(${rgb.r | 0},${rgb.g | 0},${rgb.b | 0})`;
    }
    return '#c5d84a';
}

/** Pivot schéma (R) — cadre, écran simulé et broches dans le même repère. */
function withLcdRotation(comp, fn) {
    const rotDeg = comp.rotation || 0;
    if (!rotDeg) {
        fn();
        return;
    }
    rCtx.save();
    rCtx.rotate(rotDeg * Math.PI / 180);
    fn();
    rCtx.restore();
}

function clipScreenRect(scrL, scrT, scrW, scrH, flipX, fx) {
    rCtx.beginPath();
    if (flipX) {
        const xa = fx(scrL);
        const xb = fx(scrL + scrW);
        rCtx.rect(Math.min(xa, xb), scrT, Math.abs(scrW), scrH);
    } else {
        rCtx.rect(scrL, scrT, scrW, scrH);
    }
    rCtx.clip();
}

/** Pattes et labels — repère layout + miroir fx, aligné sur geometry (toute rotation). */
function drawLcdPinStubsAndLabels(pinNames, pinYArr, juncX, connX, flip, drawTextFx) {
    const fx = (x) => flip * x;
    rCtx.strokeStyle = COLORS.strokeMuted;
    rCtx.lineWidth = 2.5;
    rCtx.lineCap = 'round';
    for (let i = 0; i < pinNames.length; i++) {
        const py = pinYArr[i];
        rCtx.beginPath();
        rCtx.moveTo(fx(juncX), py);
        rCtx.lineTo(fx(connX), py);
        rCtx.stroke();
    }
    const pinStep = pinYArr.length > 1 ? Math.abs(pinYArr[1] - pinYArr[0]) : GRID_SIZE;
    const labelGap = 3;
    const pinLabelFontSize = Math.min(9, Math.max(6, Math.floor(pinStep - labelGap - 2)));
    rCtx.font = `bold ${pinLabelFontSize}px Arial`;
    rCtx.textAlign = 'center';
    rCtx.textBaseline = 'bottom';
    rCtx.fillStyle = COLORS.ink;
    const labelX = (juncX + connX) / 2;
    for (let i = 0; i < pinNames.length; i++) {
        drawTextFx(pinNames[i], labelX, pinYArr[i] - labelGap);
    }
}

function drawGroveLcdCharGrid(scrL, scrT, scrW, scrH, lines, screenOn, state, flipX, fx) {
    if (state.blank && state.wired) return;
    const fg = groveLcdTextColor(state, screenOn);
    const pxW = scrW / LCD_FRAME_W;
    const pxH = scrH / LCD_FRAME_H;

    rCtx.save();
    clipScreenRect(scrL, scrT, scrW, scrH, flipX, fx);
    rCtx.fillStyle = fg;
    rCtx.imageSmoothingEnabled = false;
    for (let row = 0; row < GROVE_LCD_ROWS; row++) {
        const line = String(lines[row] || '').padEnd(GROVE_LCD_COLS, ' ').slice(0, GROVE_LCD_COLS);
        for (let col = 0; col < GROVE_LCD_COLS; col++) {
            const glyph = getHd44780Glyph(line[col]);
            const baseNx = col * HD44780_CHAR_W;
            const baseNy = row * HD44780_CHAR_H;
            for (let r = 0; r < HD44780_CHAR_H; r++) {
                const bits = glyph[r] & 0x1f;
                for (let c = 0; c < HD44780_CHAR_W; c++) {
                    if ((bits >> (4 - c)) & 1) {
                        const nx = baseNx + c;
                        const ny = baseNy + r;
                        const x = scrL + (LCD_MARGIN_L + nx) * pxW;
                        const y = scrT + (LCD_MARGIN_T + ny) * pxH;
                        if (flipX) {
                            const xa = fx(x);
                            const xb = fx(x + pxW);
                            rCtx.fillRect(Math.min(xa, xb), y, Math.abs(pxW), pxH);
                        } else {
                            rCtx.fillRect(x, y, pxW, pxH);
                        }
                    }
                }
            }
        }
    }
    rCtx.restore();
}

function drawGroveLcd16x2(comp) {
    withLcdRotation(comp, () => drawGroveLcd16x2Body(comp));
}

function drawGroveLcd16x2Body(comp) {
    const state = getGroveLcdDisplayState(comp);
    const flip = comp.flipX ? -1 : 1;
    const fx = (x) => flip * x;
    const fillRectFx = (x, y, w, h) => {
        const xa = fx(x);
        const xb = fx(x + w);
        rCtx.fillRect(Math.min(xa, xb), y, Math.abs(w), h);
    };
    const strokeRectFx = (x, y, w, h) => {
        const xa = fx(x);
        const xb = fx(x + w);
        rCtx.strokeRect(Math.min(xa, xb), y, Math.abs(w), h);
    };
    const drawTextFx = (text, x, y) => {
        rCtx.save();
        if (comp.flipX) {
            rCtx.translate(fx(x), y);
            rCtx.scale(-1, 1);
            rCtx.fillText(text, 0, 0);
        } else {
            rCtx.fillText(text, x, y);
        }
        rCtx.restore();
    };

    const boxL = GROVE_LCD_BOX_L;
    const boxR = GROVE_LCD_BOX_R;
    const boxT = GROVE_LCD_BOX_T;
    const boxB = GROVE_LCD_BOX_B;
    const connL = GROVE_LCD_CONN_L;

    const scrL = GROVE_LCD_SCREEN_L;
    const scrT = GROVE_LCD_SCREEN_T;
    const scrW = GROVE_LCD_SCREEN_R - GROVE_LCD_SCREEN_L;
    const scrH = GROVE_LCD_SCREEN_B - GROVE_LCD_SCREEN_T;

    // Connecteur Grove (colonne gauche, 1 pas)
    rCtx.fillStyle = '#141414';
    fillRectFx(connL, boxT, GROVE_LCD_CONNECTOR_W, boxB - boxT);

    // Cadre noir
    rCtx.fillStyle = '#1c1c1c';
    rCtx.strokeStyle = '#0a0a0a';
    rCtx.lineWidth = 2;
    fillRectFx(boxL, boxT, boxR - boxL, boxB - boxT);
    strokeRectFx(boxL, boxT, boxR - boxL, boxB - boxT);

    // Écran vert 16×2 (couleur rétroéclairage jaune-vert)
    const screenOn = flags.isSimulating
        && state.wired
        && state.backlight !== false
        && !state.blank;
    rCtx.fillStyle = groveLcdBacklightFill(state, screenOn);
    rCtx.save();
    clipScreenRect(scrL, scrT, scrW, scrH, comp.flipX, fx);
    fillRectFx(scrL, scrT, scrW, scrH);
    rCtx.restore();

    const lines = state.lines || ['', ''];
    drawGroveLcdCharGrid(scrL, scrT, scrW, scrH, lines, screenOn, state, comp.flipX, fx);

    drawLcdPinStubsAndLabels(GROVE_LCD_PINS, GROVE_LCD_PIN_Y, GROVE_LCD_JUNC_X, connL, flip, drawTextFx);

    rCtx.fillStyle = COLORS.ink;
    rCtx.font = '11px Arial';
    rCtx.textAlign = 'center';
    rCtx.textBaseline = 'top';
    drawTextFx(comp.label, 0, boxB + 10);
}

function getJoyitTft18DisplayState(comp) {
    if (!comp?.label) {
        return { labels: [], bg: '#000000', fg: '#888888', wired: false, blank: true, textSize: 1, rotation: 0 };
    }
    if (!flags.isSimulating) {
        const wired = isJoyitTft18WiredToBoard(
            comp.label,
            circuit.components,
            circuit.wires,
            circuit.autoJunctions
        );
        return { labels: [], bg: '#111111', fg: '#666666', wired, blank: true, textSize: 1, rotation: 0 };
    }
    return getAnimatedJoyitTft18Display(comp.label);
}

function drawGfxChar(ch, x, y, size) {
    const glyph = getGfxGlyph(ch);
    for (let r = 0; r < TFT_GFX_CHAR_H; r++) {
        const bits = glyph[r] & 0x1f;
        for (let c = 0; c < 5; c++) {
            if ((bits >> (4 - c)) & 1) {
                rCtx.fillRect(x + c * size, y + r * size, size, size);
            }
        }
    }
}

function drawGfxString(text, x, y, size, fg) {
    rCtx.fillStyle = fg;
    const cellW = TFT_GFX_CHAR_W * size;
    for (let i = 0; i < text.length; i++) {
        drawGfxChar(text[i], x + i * cellW, y, size);
    }
}

/** Contenu TFT 128×160 — remplit tout le cadre (étirement), rotation Adafruit 0–3. */
function drawJoyitTft18Content(scrL, scrT, scrW, scrH, state, screenOn, flipX, fx) {
    if (state.blank && state.wired && screenOn) return;

    const rot = (state.rotation || 0) & 3;
    const swapped = rot % 2 === 1;
    const scaleX = (swapped ? scrH : scrW) / TFT_NATIVE_W;
    const scaleY = (swapped ? scrW : scrH) / TFT_NATIVE_H;
    const cx = scrL + scrW / 2;
    const cy = scrT + scrH / 2;
    const bgColor = screenOn ? (state.bg || '#000000') : '#1a1a1a';

    rCtx.save();
    clipScreenRect(scrL, scrT, scrW, scrH, flipX, fx);
    rCtx.fillStyle = bgColor;
    if (flipX) {
        const xa = fx(scrL);
        const xb = fx(scrL + scrW);
        rCtx.fillRect(Math.min(xa, xb), scrT, Math.abs(scrW), scrH);
    } else {
        rCtx.fillRect(scrL, scrT, scrW, scrH);
    }

    rCtx.translate(fx(cx), cy);
    if (flipX) rCtx.scale(-1, 1);
    rCtx.rotate(rot * Math.PI / 2);
    rCtx.scale(scaleX, scaleY);
    rCtx.translate(-TFT_NATIVE_W / 2, -TFT_NATIVE_H / 2);

    const labels = state.labels || [];
    if (screenOn && labels.length) {
        for (const lb of labels) {
            drawGfxString(
                lb.text,
                lb.x,
                lb.y,
                Math.max(1, lb.size || 1),
                lb.fg || state.fg || '#ffffff'
            );
        }
    } else if (!screenOn && labels.length) {
        for (const lb of labels) {
            drawGfxString(lb.text, lb.x, lb.y, 1, '#444444');
        }
    }
    rCtx.restore();
}

function drawJoyitTft18(comp) {
    withLcdRotation(comp, () => drawJoyitTft18Body(comp));
}

function drawJoyitTft18Body(comp) {
    const state = getJoyitTft18DisplayState(comp);
    const flip = comp.flipX ? -1 : 1;
    const fx = (x) => flip * x;
    const fillRectFx = (x, y, w, h) => {
        const xa = fx(x);
        const xb = fx(x + w);
        rCtx.fillRect(Math.min(xa, xb), y, Math.abs(w), h);
    };
    const strokeRectFx = (x, y, w, h) => {
        const xa = fx(x);
        const xb = fx(x + w);
        rCtx.strokeRect(Math.min(xa, xb), y, Math.abs(w), h);
    };
    const drawTextFx = (text, x, y) => {
        rCtx.save();
        if (comp.flipX) {
            rCtx.translate(fx(x), y);
            rCtx.scale(-1, 1);
            rCtx.fillText(text, 0, 0);
        } else {
            rCtx.fillText(text, x, y);
        }
        rCtx.restore();
    };

    const boxL = TFT18_BOX_L;
    const boxR = TFT18_BOX_R;
    const boxT = TFT18_BOX_T;
    const boxB = TFT18_BOX_B;
    const connL = TFT18_CONN_L;
    const scrL = TFT18_SCREEN_L;
    const scrT = TFT18_SCREEN_T;
    const scrW = TFT18_SCREEN_R - TFT18_SCREEN_L;
    const scrH = TFT18_SCREEN_B - TFT18_SCREEN_T;

    rCtx.fillStyle = '#141414';
    fillRectFx(connL, boxT, TFT18_CONNECTOR_W, boxB - boxT);

    rCtx.fillStyle = '#252525';
    rCtx.strokeStyle = '#0a0a0a';
    rCtx.lineWidth = 2;
    fillRectFx(boxL, boxT, boxR - boxL, boxB - boxT);
    strokeRectFx(boxL, boxT, boxR - boxL, boxB - boxT);

    const screenOn = flags.isSimulating && state.wired && !state.blank;
    drawJoyitTft18Content(scrL, scrT, scrW, scrH, state, screenOn, comp.flipX, fx);

    drawLcdPinStubsAndLabels(TFT18_PINS, TFT18_PIN_Y, TFT18_JUNC_X, connL, flip, drawTextFx);

    rCtx.font = '11px Arial';
    rCtx.textAlign = 'center';
    rCtx.textBaseline = 'top';
    drawTextFx(comp.label, 0, boxB + 10);
    drawTextFx('TFT 1.8″', 0, boxT - 14);
}

function drawGroveDht22SensorGrid(sx, sy, sw, sh, fx) {
    const cols = 6;
    const rows = 3;
    const gap = 2;
    const cellW = (sw - gap * (cols - 1)) / cols;
    const cellH = (sh - gap * (rows - 1)) / rows;
    rCtx.fillStyle = '#f4f4f0';
    rCtx.strokeStyle = '#c8c8c0';
    rCtx.lineWidth = 1;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const x = sx + c * (cellW + gap);
            const y = sy + r * (cellH + gap);
            const xa = fx(x);
            const xb = fx(x + cellW);
            rCtx.fillRect(Math.min(xa, xb), y, Math.abs(cellW), cellH);
            rCtx.strokeRect(Math.min(xa, xb), y, Math.abs(cellW), cellH);
            const hx = x + cellW * 0.22;
            const hy = y + cellH * 0.22;
            const hw = cellW * 0.56;
            const hh = cellH * 0.56;
            rCtx.fillStyle = '#d8d8d0';
            const hxa = fx(hx);
            const hxb = fx(hx + hw);
            rCtx.fillRect(Math.min(hxa, hxb), hy, Math.abs(hw), hh);
            rCtx.fillStyle = '#f4f4f0';
        }
    }
}

function drawGroveDht22(comp) {
    const flip = comp.flipX ? -1 : 1;
    const fx = (x) => flip * x;
    const fillRectFx = (x, y, w, h) => {
        const xa = fx(x);
        const xb = fx(x + w);
        rCtx.fillRect(Math.min(xa, xb), y, Math.abs(w), h);
    };
    const strokeRectFx = (x, y, w, h) => {
        const xa = fx(x);
        const xb = fx(x + w);
        rCtx.strokeRect(Math.min(xa, xb), y, Math.abs(w), h);
    };
    const drawTextFx = (text, x, y) => {
        rCtx.save();
        if (comp.flipX) {
            rCtx.translate(fx(x), y);
            rCtx.scale(-1, 1);
            rCtx.fillText(text, 0, 0);
        } else {
            rCtx.fillText(text, x, y);
        }
        rCtx.restore();
    };

    const boxL = GROVE_DHT22_BOX_L;
    const boxR = GROVE_DHT22_BOX_R;
    const boxT = GROVE_DHT22_BOX_T;
    const boxB = GROVE_DHT22_BOX_B;
    const connL = GROVE_DHT22_CONN_L;

    rCtx.fillStyle = '#141414';
    fillRectFx(connL, boxT, GROVE_DHT22_CONNECTOR_W, boxB - boxT);

    rCtx.fillStyle = '#1a3d7a';
    rCtx.strokeStyle = '#0f2448';
    rCtx.lineWidth = 2;
    fillRectFx(boxL, boxT, boxR - boxL, boxB - boxT);
    strokeRectFx(boxL, boxT, boxR - boxL, boxB - boxT);

    const sx = GROVE_DHT22_SENSOR_L;
    const sy = GROVE_DHT22_SENSOR_T;
    const sw = GROVE_DHT22_SENSOR_R - GROVE_DHT22_SENSOR_L;
    const sh = GROVE_DHT22_SENSOR_B - GROVE_DHT22_SENSOR_T;
    drawGroveDht22SensorGrid(sx, sy, sw, sh, fx);

    rCtx.strokeStyle = COLORS.strokeMuted;
    rCtx.lineWidth = 2.5;
    rCtx.lineCap = 'round';
    for (let i = 0; i < GROVE_DHT22_PINS.length; i++) {
        const py = GROVE_DHT22_PIN_Y[i];
        rCtx.beginPath();
        rCtx.moveTo(fx(GROVE_DHT22_JUNC_X), py);
        rCtx.lineTo(fx(connL), py);
        rCtx.stroke();
    }

    const pinStep = GROVE_DHT22_PIN_Y.length > 1
        ? GROVE_DHT22_PIN_Y[1] - GROVE_DHT22_PIN_Y[0]
        : 14;
    const labelGap = 3;
    const pinLabelFontSize = Math.min(8, Math.max(6, Math.floor(pinStep - labelGap - 2)));
    rCtx.font = `bold ${pinLabelFontSize}px Arial`;
    rCtx.textAlign = 'center';
    rCtx.textBaseline = 'bottom';
    rCtx.fillStyle = COLORS.ink;
    for (let i = 0; i < GROVE_DHT22_PINS.length; i++) {
        const py = GROVE_DHT22_PIN_Y[i];
        drawTextFx(GROVE_DHT22_PINS[i], GROVE_DHT22_PIN_LABEL_X, py - labelGap);
    }

    rCtx.fillStyle = COLORS.ink;
    rCtx.font = '10px Arial';
    rCtx.textAlign = 'center';
    rCtx.textBaseline = 'top';
    drawTextFx('DHT22', 0, boxT - 12);
    drawTextFx(comp.label, 0, boxB + 8);
}

function drawGroveTsl2591(comp) {
    const flip = comp.flipX ? -1 : 1;
    const fx = (x) => flip * x;
    const fillRectFx = (x, y, w, h) => {
        const xa = fx(x);
        const xb = fx(x + w);
        rCtx.fillRect(Math.min(xa, xb), y, Math.abs(w), h);
    };
    const strokeRectFx = (x, y, w, h) => {
        const xa = fx(x);
        const xb = fx(x + w);
        rCtx.strokeRect(Math.min(xa, xb), y, Math.abs(w), h);
    };
    const drawTextFx = (text, x, y) => {
        rCtx.save();
        if (comp.flipX) {
            rCtx.translate(fx(x), y);
            rCtx.scale(-1, 1);
            rCtx.fillText(text, 0, 0);
        } else {
            rCtx.fillText(text, x, y);
        }
        rCtx.restore();
    };

    const boxL = GROVE_TSL2591_BOX_L;
    const boxR = GROVE_TSL2591_BOX_R;
    const boxT = GROVE_TSL2591_BOX_T;
    const boxB = GROVE_TSL2591_BOX_B;
    const connL = GROVE_TSL2591_CONN_L;

    rCtx.fillStyle = '#141414';
    fillRectFx(connL, boxT, GROVE_TSL2591_CONNECTOR_W, boxB - boxT);

    rCtx.fillStyle = '#2a1a4a';
    rCtx.strokeStyle = '#1a1030';
    rCtx.lineWidth = 2;
    fillRectFx(boxL, boxT, boxR - boxL, boxB - boxT);
    strokeRectFx(boxL, boxT, boxR - boxL, boxB - boxT);

    const sx = GROVE_TSL2591_SENSOR_L;
    const sy = GROVE_TSL2591_SENSOR_T;
    const sw = GROVE_TSL2591_SENSOR_R - GROVE_TSL2591_SENSOR_L;
    const sh = GROVE_TSL2591_SENSOR_B - GROVE_TSL2591_SENSOR_T;
    rCtx.fillStyle = '#1a1028';
    fillRectFx(sx, sy, sw, sh);
    strokeRectFx(sx, sy, sw, sh);
    rCtx.strokeStyle = '#ffd54f';
    rCtx.lineWidth = 1.5;
    const cx = sx + sw / 2;
    const cy = sy + sh / 2;
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        rCtx.beginPath();
        rCtx.moveTo(fx(cx), cy);
        rCtx.lineTo(fx(cx + Math.cos(a) * sw * 0.42), cy + Math.sin(a) * sh * 0.42);
        rCtx.stroke();
    }
    rCtx.fillStyle = '#ffd54f';
    rCtx.beginPath();
    rCtx.arc(fx(cx), cy, Math.min(sw, sh) * 0.14, 0, Math.PI * 2);
    rCtx.fill();

    rCtx.strokeStyle = COLORS.strokeMuted;
    rCtx.lineWidth = 2.5;
    rCtx.lineCap = 'round';
    for (let i = 0; i < GROVE_TSL2591_PINS.length; i++) {
        const py = GROVE_TSL2591_PIN_Y[i];
        rCtx.beginPath();
        rCtx.moveTo(fx(GROVE_TSL2591_JUNC_X), py);
        rCtx.lineTo(fx(connL), py);
        rCtx.stroke();
    }

    const pinStep = GROVE_TSL2591_PIN_Y.length > 1
        ? GROVE_TSL2591_PIN_Y[1] - GROVE_TSL2591_PIN_Y[0]
        : 14;
    const labelGap = 3;
    const pinLabelFontSize = Math.min(8, Math.max(6, Math.floor(pinStep - labelGap - 2)));
    rCtx.font = `bold ${pinLabelFontSize}px Arial`;
    rCtx.textAlign = 'center';
    rCtx.textBaseline = 'bottom';
    rCtx.fillStyle = COLORS.ink;
    for (let i = 0; i < GROVE_TSL2591_PINS.length; i++) {
        const py = GROVE_TSL2591_PIN_Y[i];
        drawTextFx(GROVE_TSL2591_PINS[i], GROVE_TSL2591_PIN_LABEL_X, py - labelGap);
    }

    rCtx.font = '10px Arial';
    rCtx.textAlign = 'center';
    rCtx.textBaseline = 'top';
    rCtx.fillStyle = COLORS.ink;
    drawTextFx('TSL2591', 0, boxT - 12);
    drawTextFx(comp.label, 0, boxB + 8);
}

function drawGroveBmp280(comp) {
    const flip = comp.flipX ? -1 : 1;
    const fx = (x) => flip * x;
    const fillRectFx = (x, y, w, h) => rCtx.fillRect(fx(x) - (flip < 0 ? w : 0), y, w, h);
    const strokeRectFx = (x, y, w, h) => rCtx.strokeRect(fx(x) - (flip < 0 ? w : 0), y, w, h);
    const drawTextFx = (text, x, y) => {
        rCtx.save();
        if (comp.flipX) {
            rCtx.translate(fx(x), y);
            rCtx.scale(-1, 1);
            rCtx.fillText(text, 0, 0);
        } else {
            rCtx.fillText(text, x, y);
        }
        rCtx.restore();
    };

    const boxL = GROVE_BMP280_BOX_L;
    const boxR = GROVE_BMP280_BOX_R;
    const boxT = GROVE_BMP280_BOX_T;
    const boxB = GROVE_BMP280_BOX_B;
    const connL = GROVE_BMP280_CONN_L;

    rCtx.fillStyle = '#141414';
    fillRectFx(connL, boxT, GROVE_BMP280_CONNECTOR_W, boxB - boxT);

    rCtx.fillStyle = '#1a2a4a';
    rCtx.strokeStyle = '#102040';
    rCtx.lineWidth = 2;
    fillRectFx(boxL, boxT, boxR - boxL, boxB - boxT);
    strokeRectFx(boxL, boxT, boxR - boxL, boxB - boxT);

    const sx = GROVE_BMP280_SENSOR_L;
    const sy = GROVE_BMP280_SENSOR_T;
    const sw = GROVE_BMP280_SENSOR_R - GROVE_BMP280_SENSOR_L;
    const sh = GROVE_BMP280_SENSOR_B - GROVE_BMP280_SENSOR_T;
    rCtx.fillStyle = '#0d1a30';
    fillRectFx(sx, sy, sw, sh);
    strokeRectFx(sx, sy, sw, sh);
    rCtx.strokeStyle = '#64b5f6';
    rCtx.lineWidth = 1.5;
    const cx = sx + sw / 2;
    const cy = sy + sh / 2;
    const r = Math.min(sw, sh) * 0.38;
    rCtx.beginPath();
    rCtx.arc(fx(cx), cy, r, Math.PI * 0.75, Math.PI * 0.25);
    rCtx.stroke();
    rCtx.beginPath();
    rCtx.moveTo(fx(cx), cy);
    rCtx.lineTo(fx(cx + r * 0.55), cy - r * 0.35);
    rCtx.stroke();

    rCtx.strokeStyle = COLORS.strokeMuted;
    rCtx.lineWidth = 2.5;
    rCtx.lineCap = 'round';
    for (let i = 0; i < GROVE_BMP280_PINS.length; i++) {
        const py = GROVE_BMP280_PIN_Y[i];
        rCtx.beginPath();
        rCtx.moveTo(fx(GROVE_BMP280_JUNC_X), py);
        rCtx.lineTo(fx(connL), py);
        rCtx.stroke();
    }

    const pinStep = GROVE_BMP280_PIN_Y.length > 1
        ? GROVE_BMP280_PIN_Y[1] - GROVE_BMP280_PIN_Y[0]
        : 14;
    const labelGap = 3;
    const pinLabelFontSize = Math.min(8, Math.max(6, Math.floor(pinStep - labelGap - 2)));
    rCtx.font = `bold ${pinLabelFontSize}px Arial`;
    rCtx.textAlign = 'center';
    rCtx.textBaseline = 'bottom';
    rCtx.fillStyle = COLORS.ink;
    for (let i = 0; i < GROVE_BMP280_PINS.length; i++) {
        const py = GROVE_BMP280_PIN_Y[i];
        drawTextFx(GROVE_BMP280_PINS[i], GROVE_BMP280_PIN_LABEL_X, py - labelGap);
    }

    rCtx.font = '10px Arial';
    rCtx.textAlign = 'center';
    rCtx.textBaseline = 'top';
    rCtx.fillStyle = COLORS.ink;
    drawTextFx('BMP280', 0, boxT - 12);
    drawTextFx(comp.label, 0, boxB + 8);
}

function drawLogicGateSymbol(gateType) {
    const inTopY = -20;
    const inBottomY = 20;
    const inMidY = 0;
    const gateLeft = -20;
    const gateArcR = 20;
    const outBubbleR = (gateType === 'nand' || gateType === 'nor' || gateType === 'xnor' || gateType === 'not') ? 4 : 0;
    const isOrFamily = gateType === 'or' || gateType === 'nor' || gateType === 'xor' || gateType === 'xnor';
    const isXorFamily = gateType === 'xor' || gateType === 'xnor';
    const isNot = gateType === 'not';

    rCtx.strokeStyle = '#00ca71';
    rCtx.lineWidth = 2;
    rCtx.fillStyle = COLORS.componentFill;

    if (isNot) {
        rCtx.beginPath();
        rCtx.moveTo(-16, -18);
        rCtx.lineTo(14, 0);
        rCtx.lineTo(-16, 18);
        rCtx.closePath();
        rCtx.fill();
        rCtx.stroke();
    } else if (isOrFamily) {
        rCtx.beginPath();
        rCtx.moveTo(-20, -20);
        rCtx.quadraticCurveTo(0, -20, 14, 0);
        rCtx.quadraticCurveTo(0, 20, -20, 20);
        rCtx.quadraticCurveTo(-8, 0, -20, -20);
        rCtx.closePath();
        rCtx.fill();
        rCtx.stroke();

        if (isXorFamily) {
            rCtx.beginPath();
            rCtx.moveTo(-25, -20);
            rCtx.quadraticCurveTo(-13, 0, -25, 20);
            rCtx.stroke();
        }
    } else {
        // Forme AND / NAND
        rCtx.beginPath();
        rCtx.moveTo(gateLeft, -20);
        rCtx.lineTo(0, -20);
        rCtx.arc(0, 0, gateArcR, -Math.PI / 2, Math.PI / 2);
        rCtx.lineTo(gateLeft, 20);
        rCtx.closePath();
        rCtx.fill();
        rCtx.stroke();
    }

    const outStemStart = 20 + outBubbleR;
    if (isNot) {
        // La pointe du triangle est à x=14
        const notStemStart = 14 + outBubbleR;
        rCtx.beginPath();
        rCtx.moveTo(notStemStart, 0);
        rCtx.lineTo(40, 0);
        rCtx.stroke();
    } else {
        rCtx.beginPath();
        rCtx.moveTo(outStemStart, 0);
        rCtx.lineTo(40, 0);
        rCtx.stroke();
    }

    if (isNot) {
        rCtx.beginPath();
        rCtx.moveTo(-40, 0);
        rCtx.lineTo(-16, 0);
        rCtx.stroke();
    } else {
        rCtx.beginPath();
        rCtx.moveTo(-40, inTopY);
        rCtx.lineTo(gateLeft, inTopY);
        rCtx.moveTo(-40, inBottomY);
        rCtx.lineTo(gateLeft, inBottomY);
        rCtx.stroke();
    }

    if (outBubbleR > 0) {
        const cx = isNot ? 14 + outBubbleR : 20 + outBubbleR;
        rCtx.beginPath();
        rCtx.arc(cx, 0, outBubbleR, 0, Math.PI * 2);
        rCtx.stroke();
        rCtx.fillStyle = COLORS.componentFill;
        rCtx.fill();
    }

    rCtx.fillStyle = COLORS.inkMuted;
    rCtx.font = '10px Arial';
    rCtx.textAlign = 'left';
    if (isNot) {
        rCtx.fillText('A', -34, inMidY - 4);
    } else {
        rCtx.fillText('A', -34, inTopY - 4);
        rCtx.fillText('B', -34, inBottomY - 4);
    }
}

function drawMeterDisplay(valuePart, unitPart, rot) {
    const text = unitPart ? `${valuePart}${unitPart}` : String(valuePart);
    rCtx.save();
    rCtx.rotate(-rot * Math.PI / 180);
    rCtx.font = 'bold 7px monospace';
    const textW = rCtx.measureText(text).width;
    const boxW = Math.max(28, Math.min(46, textW + 10));
    rCtx.fillStyle = COLORS.meterDisplayBg;
    rCtx.fillRect(-boxW / 2, -7, boxW, 14);
    rCtx.fillStyle = '#00ff66';
    rCtx.textAlign = 'center';
    rCtx.textBaseline = 'middle';
    rCtx.fillText(text, 0, 0);
    rCtx.restore();
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
    rCtx.save();
    rCtx.strokeStyle = COLORS.ledSmoke;
    rCtx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
        const xOff = -6 + i * 6 + Math.sin(phase + i * 1.3) * 3;
        rCtx.beginPath();
        rCtx.moveTo(xOff, -16);
        rCtx.quadraticCurveTo(
            xOff + Math.sin(phase + i * 2) * 5, -26,
            xOff + Math.cos(phase + i) * 4, -36 - i * 5
        );
        rCtx.stroke();
    }
    rCtx.restore();
}

/** Set/Reset : trait vertical uniquement à l'extérieur du boîtier ; jonction au bout ; S/R à gauche du fil. */
function drawFlipFlopSetReset(ctx, boxTopY, boxBottomY, stubOutside = 30) {
    const setJuncY = boxTopY - stubOutside;
    const resetJuncY = boxBottomY + stubOutside;
    rCtx.beginPath();
    rCtx.moveTo(0, setJuncY); rCtx.lineTo(0, boxTopY);
    rCtx.moveTo(0, resetJuncY); rCtx.lineTo(0, boxBottomY);
    rCtx.stroke();
    rCtx.fillStyle = COLORS.ink;
    rCtx.font = '10px Arial';
    rCtx.textBaseline = 'middle';
    rCtx.textAlign = 'right';
    rCtx.fillText('S', -10, (setJuncY + boxTopY) / 2);
    rCtx.fillText('R', -10, (resetJuncY + boxBottomY) / 2);
}

function drawComponentBody(comp) {
    rCtx.save(); rCtx.translate(comp.x, comp.y);
    const noRotate = comp.type === 'gimp' || comp.type === 'gsin' || comp.type === 'gsqr' || comp.type === 'oscilloscope' || comp.type === 'd_flipflop' || comp.type === 'jk_flipflop' || comp.type === 'cd4511' || comp.type === 'ic_74hc90' || comp.type === 'lm386' || comp.type === 'lm7805' || comp.type === 'ir2104' || comp.type === 'l293d' || comp.type === 'arduino_uno' || comp.type === 'esp32_c3' || comp.type === 'esp32_devkit' || comp.type === 'npn' || comp.type === 'nmos' || comp.type === 'opamp' || comp.type === 'seg7' || comp.type === 'bargraph_dc10h' || comp.type === 'matrix_8x8' || comp.type === 'grove_lcd16x2' || comp.type === 'grove_dht22' || comp.type === 'grove_tsl2591' || comp.type === 'grove_bmp280' || comp.type === 'joyit_tft18';
    const rot = noRotate ? 0 : (comp.rotation || 0);
    rCtx.rotate(rot * Math.PI / 180);

    if (interaction.selectedComponents.includes(comp)) {
        rCtx.strokeStyle = '#00bcd4'; rCtx.lineWidth = 1.5;
        if (comp.type === 'cd4511') {
            rCtx.strokeRect(-CD4511_HIT_DX, -CD4511_HIT_DY, CD4511_HIT_DX * 2, CD4511_HIT_DY * 2);
        }
        else if (comp.type === 'ic_74hc90') {
            rCtx.strokeRect(-IC90_HIT_DX, -IC90_HIT_DY, IC90_HIT_DX * 2, IC90_HIT_DY * 2);
        }
        else if (comp.type === 'lm386') {
            rCtx.strokeRect(-LM386_HIT_DX, -LM386_HIT_DY, LM386_HIT_DX * 2, LM386_HIT_DY * 2);
        }
        else if (comp.type === 'lm7805') {
            rCtx.strokeRect(-LM7805_HIT_DX, -LM7805_HIT_DY, LM7805_HIT_DX * 2, LM7805_HIT_DY * 2);
        }
        else if (comp.type === 'ir2104') {
            rCtx.strokeRect(-IR2104_HIT_DX, -IR2104_HIT_DY, IR2104_HIT_DX * 2, IR2104_HIT_DY * 2);
        }
        else if (comp.type === 'l293d') {
            rCtx.strokeRect(-L293D_HIT_DX, -L293D_HIT_DY, L293D_HIT_DX * 2, L293D_HIT_DY * 2);
        }
        else if (comp.type === 'jk_flipflop' || comp.type === 'd_flipflop') rCtx.strokeRect(-45, -68, 90, 136);
        else if (comp.type === 'oscilloscope') rCtx.strokeRect(-50, -38, 100, 100);
        else if (comp.type === 'npn') rCtx.strokeRect(-42, -42, 64, 84);
        else if (comp.type === 'nmos') rCtx.strokeRect(-42, -60, 64, 120);
        else if (comp.type === 'opamp') rCtx.strokeRect(-44, -40, 88, 80);
        else if (comp.type === 'seg7') rCtx.strokeRect(-52, -86, 124, 200);
        else if (comp.type === 'bargraph_dc10h') {
            rCtx.strokeRect(DC10H_SEL_L, DC10H_SEL_T, DC10H_SEL_W, DC10H_SEL_H);
        }
        else if (comp.type === 'matrix_8x8') {
            rCtx.strokeRect(MATRIX_SEL_L, MATRIX_SEL_T, MATRIX_SEL_W, MATRIX_SEL_H);
        }
        else if (comp.type === 'grove_lcd16x2') {
            rCtx.save();
            if (comp.rotation) rCtx.rotate((comp.rotation || 0) * Math.PI / 180);
            const flip = comp.flipX ? -1 : 1;
            const fx = (x) => flip * x;
            const selL = Math.min(fx(GROVE_LCD_SEL_L), fx(GROVE_LCD_SEL_L + GROVE_LCD_SEL_W));
            rCtx.strokeRect(selL, GROVE_LCD_SEL_T, GROVE_LCD_SEL_W, GROVE_LCD_SEL_H);
            rCtx.restore();
        }
        else if (comp.type === 'joyit_tft18') {
            rCtx.save();
            if (comp.rotation) rCtx.rotate((comp.rotation || 0) * Math.PI / 180);
            const flip = comp.flipX ? -1 : 1;
            const fx = (x) => flip * x;
            const selL = Math.min(fx(TFT18_SEL_L), fx(TFT18_SEL_L + TFT18_SEL_W));
            rCtx.strokeRect(selL, TFT18_SEL_T, TFT18_SEL_W, TFT18_SEL_H);
            rCtx.restore();
        }
        else if (comp.type === 'grove_dht22') {
            const flip = comp.flipX ? -1 : 1;
            const fx = (x) => flip * x;
            const selL = Math.min(fx(GROVE_DHT22_SEL_L), fx(GROVE_DHT22_SEL_L + GROVE_DHT22_SEL_W));
            rCtx.strokeRect(selL, GROVE_DHT22_SEL_T, GROVE_DHT22_SEL_W, GROVE_DHT22_SEL_H);
        }
        else if (comp.type === 'grove_tsl2591') {
            const flip = comp.flipX ? -1 : 1;
            const fx = (x) => flip * x;
            const selL = Math.min(fx(GROVE_TSL2591_SEL_L), fx(GROVE_TSL2591_SEL_L + GROVE_TSL2591_SEL_W));
            rCtx.strokeRect(selL, GROVE_TSL2591_SEL_T, GROVE_TSL2591_SEL_W, GROVE_TSL2591_SEL_H);
        }
        else if (comp.type === 'grove_bmp280') {
            const flip = comp.flipX ? -1 : 1;
            const fx = (x) => flip * x;
            const selL = Math.min(fx(GROVE_BMP280_SEL_L), fx(GROVE_BMP280_SEL_L + GROVE_BMP280_SEL_W));
            rCtx.strokeRect(selL, GROVE_BMP280_SEL_T, GROVE_BMP280_SEL_W, GROVE_BMP280_SEL_H);
        }
        else if (comp.type === 'logic_terminal') rCtx.strokeRect(-14, -10, 24, 20);
        else if (comp.type !== 'logic_terminal') rCtx.strokeRect(-45, -25, 90, 50);
    }

    const railLead = GRID_SIZE;
    if (comp.type === 'gnd') {
        rCtx.strokeStyle = COLORS.inkDim; rCtx.lineWidth = 2;
        rCtx.beginPath(); rCtx.moveTo(-12, 0); rCtx.lineTo(railLead, 0);
        rCtx.moveTo(-12, -10); rCtx.lineTo(-12, 10);
        rCtx.moveTo(-17, -6); rCtx.lineTo(-17, 6);
        rCtx.moveTo(-22, -3); rCtx.lineTo(-22, 3);
        rCtx.stroke(); drawLabels(comp.label, "0V", rot);
    }
    else if (comp.type === 'vcc') {
        rCtx.strokeStyle = '#ff3d00'; rCtx.lineWidth = 2;
        rCtx.beginPath(); rCtx.moveTo(-12, 0); rCtx.lineTo(railLead, 0);
        rCtx.moveTo(-12, 0); rCtx.lineTo(-4, -7); rCtx.lineTo(-4, 7); rCtx.closePath(); rCtx.fillStyle = '#ff3d00'; rCtx.fill();
        rCtx.stroke();
        let val = comp.value !== undefined ? comp.value + "V" : "5V";
        drawLabels(comp.label, val, rot);
    }
    else if (comp.type === 'logic_terminal') {
        if (interaction.selectedComponents.includes(comp)) {
            rCtx.strokeStyle = '#00bcd4'; rCtx.lineWidth = 1.5;
            rCtx.strokeRect(-14, -10, 24, 20);
        }
        rCtx.strokeStyle = '#9c27b0'; rCtx.lineWidth = 2;
        rCtx.beginPath(); rCtx.moveTo(8, 0); rCtx.lineTo(railLead, 0);
        rCtx.stroke();
        rCtx.fillStyle = COLORS.componentFill; rCtx.fillRect(-12, -8, 20, 16); rCtx.strokeRect(-12, -8, 20, 16);
        const state = comp.state || 0;
        drawUprightTextAt(rot, -2, 0, () => {
            rCtx.fillStyle = state === 1 ? '#00e676' : '#ff1744';
            rCtx.font = 'bold 11px Arial';
            rCtx.textAlign = 'center';
            rCtx.textBaseline = 'middle';
            rCtx.fillText(String(state), 0, 0);
        });
    }
    else if (comp.type === 'battery') {
        rCtx.strokeStyle = '#ff9800'; rCtx.lineWidth = 2;
        // Grande barre (gauche, haute) = + ; petite barre (droite, basse) = −
        rCtx.beginPath(); rCtx.moveTo(-5, -15); rCtx.lineTo(-5, 15); rCtx.stroke();
        rCtx.beginPath(); rCtx.moveTo(5, -8); rCtx.lineTo(5, 8); rCtx.stroke();
        rCtx.beginPath();
        rCtx.moveTo(-40, 0); rCtx.lineTo(-5, 0);
        rCtx.moveTo(5, 0); rCtx.lineTo(40, 0);
        rCtx.stroke();
        drawWirePlusLabel(-40, 0);
        let val = comp.value !== undefined ? comp.value + "V" : "5V";
        drawLabels(comp.label, val, rot);
    }
    else if (comp.type === 'resistor') {
        rCtx.strokeStyle = '#007acc'; rCtx.lineWidth = 2; rCtx.fillStyle = COLORS.componentFill;
        rCtx.fillRect(-20, -10, 40, 20); rCtx.strokeRect(-20, -10, 40, 20);
        rCtx.beginPath(); rCtx.moveTo(-40, 0); rCtx.lineTo(-20, 0); rCtx.moveTo(20, 0); rCtx.lineTo(40, 0); rCtx.stroke();
        drawLabels(comp.label, comp.value || '1K', rot);
    }
    else if (comp.type === 'potentiometer') {
        const pos = Math.min(100, Math.max(0, comp.position ?? 50));
        const wx = -20 + (pos / 100) * 40;
        rCtx.strokeStyle = '#007acc'; rCtx.lineWidth = 2; rCtx.fillStyle = COLORS.componentFill;
        rCtx.fillRect(-20, -10, 40, 20); rCtx.strokeRect(-20, -10, 40, 20);
        rCtx.beginPath();
        rCtx.moveTo(-40, 0); rCtx.lineTo(-20, 0);
        rCtx.moveTo(20, 0); rCtx.lineTo(40, 0);
        rCtx.moveTo(wx, -10); rCtx.lineTo(wx, -22);
        rCtx.moveTo(0, -22); rCtx.lineTo(wx, -22);
        rCtx.stroke();
        rCtx.fillStyle = '#ff9800';
        rCtx.font = 'bold 13px Arial';
        rCtx.textAlign = 'center';
        rCtx.textBaseline = 'middle';
        rCtx.fillText('◀', -10, 18);
        rCtx.fillText('▶', 8, 18);
        const rotNorm = ((rot % 360) + 360) % 360;
        const potVertical = rotNorm === 90 || rotNorm === 270;
        const pctX = potVertical ? 26 : 22;
        const pctY = 18;
        drawUprightTextAt(rot, pctX, pctY, () => {
            rCtx.fillStyle = '#ff9800';
            rCtx.font = 'bold 11px Arial';
            rCtx.textAlign = 'left';
            rCtx.textBaseline = 'middle';
            rCtx.fillText(`${Math.round(pos)}%`, 0, 0);
        });
        drawLabels(comp.label, comp.value || '10k', rot);
    }
    else if (comp.type === 'switch_spdt') {
        const onA = (comp.state ?? 0) !== 1;
        rCtx.strokeStyle = COLORS.componentStroke; rCtx.lineWidth = 2;
        rCtx.beginPath();
        rCtx.moveTo(-40, -18); rCtx.lineTo(-14, -18);
        rCtx.moveTo(-40, 0); rCtx.lineTo(-14, 0);
        rCtx.moveTo(-40, 18); rCtx.lineTo(-14, 18);
        rCtx.stroke();
        rCtx.fillStyle = COLORS.componentFill;
        rCtx.fillRect(-12, -18, 24, 36);
        rCtx.strokeStyle = COLORS.componentStroke;
        rCtx.strokeRect(-12, -18, 24, 36);
        rCtx.beginPath();
        rCtx.moveTo(0, 0);
        if (onA) rCtx.lineTo(0, -14);
        else rCtx.lineTo(0, 14);
        rCtx.stroke();
        rCtx.fillStyle = COLORS.inkDim;
        rCtx.font = '9px Arial';
        rCtx.textAlign = 'right';
        rCtx.textBaseline = 'middle';
        rCtx.fillText('COM', -44, 0);
        rCtx.fillText('B', -44, 18);
        drawLabels(comp.label, null, rot);
    }
    else if (comp.type === 'push_button') {
        const pressed = (comp.state ?? 0) === 1;
        rCtx.strokeStyle = COLORS.componentStroke; rCtx.lineWidth = 2;
        rCtx.beginPath();
        rCtx.moveTo(-40, 0); rCtx.lineTo(-16, 0);
        rCtx.moveTo(16, 0); rCtx.lineTo(40, 0);
        rCtx.stroke();
        rCtx.beginPath();
        rCtx.arc(-16, 0, 3, 0, Math.PI * 2);
        rCtx.moveTo(16, 0);
        rCtx.arc(16, 0, 3, 0, Math.PI * 2);
        rCtx.fillStyle = COLORS.componentStroke;
        rCtx.fill();
        const barY = pressed ? -3 : -9;
        rCtx.strokeStyle = COLORS.componentStroke; rCtx.lineWidth = 2;
        rCtx.beginPath();
        rCtx.moveTo(-16, barY); rCtx.lineTo(16, barY);
        rCtx.moveTo(0, barY); rCtx.lineTo(0, barY - 8);
        rCtx.stroke();
        rCtx.fillStyle = pressed ? '#ef5350' : COLORS.componentFill;
        rCtx.strokeStyle = COLORS.componentStroke; rCtx.lineWidth = 2;
        rCtx.beginPath();
        rCtx.rect(-12, barY - 16, 24, 8);
        rCtx.fill();
        rCtx.stroke();
        if (comp.maintained) {
            rCtx.fillStyle = COLORS.inkDim;
            rCtx.font = '9px Arial';
            rCtx.textAlign = 'center';
            rCtx.textBaseline = 'bottom';
            rCtx.fillText('M', 0, barY - 18);
        }
        drawLabels(comp.label, pressed ? 'ON' : 'OFF', rot);
    }
    else if (comp.type === 'capacitor') {
        rCtx.strokeStyle = '#66bb6a'; rCtx.lineWidth = 2;
        rCtx.beginPath();
        rCtx.moveTo(-40, 0); rCtx.lineTo(-8, 0);
        rCtx.moveTo(-8, -14); rCtx.lineTo(-8, 14);
        rCtx.moveTo(8, -14); rCtx.lineTo(8, 14);
        rCtx.moveTo(8, 0); rCtx.lineTo(40, 0);
        rCtx.stroke();
        drawLabels(comp.label, comp.value || '1u', rot);
    }
    else if (comp.type === 'inductor') {
        rCtx.strokeStyle = '#ffa726'; rCtx.lineWidth = 2;
        rCtx.beginPath();
        rCtx.moveTo(-40, 0); rCtx.lineTo(-28, 0);
        for (let i = 0; i < 4; i++) {
            rCtx.arc(-21 + i * 14, 0, 7, Math.PI, 0, false);
        }
        rCtx.lineTo(40, 0);
        rCtx.stroke();
        drawLabels(comp.label, comp.value || '1m', rot);
    }
    else if (comp.type === 'diode') {
        rCtx.strokeStyle = '#ef5350'; rCtx.lineWidth = 2; rCtx.fillStyle = COLORS.componentFill;
        rCtx.beginPath();
        rCtx.moveTo(-40, 0); rCtx.lineTo(-12, 0);
        rCtx.moveTo(-12, -12); rCtx.lineTo(12, 0); rCtx.lineTo(-12, 12); rCtx.closePath();
        rCtx.fill(); rCtx.stroke();
        rCtx.beginPath();
        rCtx.moveTo(12, -12); rCtx.lineTo(12, 12);
        rCtx.moveTo(12, 0); rCtx.lineTo(40, 0);
        rCtx.stroke();
        drawLabels(comp.label, comp.value || '1N4148', rot);
    }
    else if (comp.type === 'npn') {
        const bx = 0, by = 0;
        const cx = 20, cy = -20, cEnd = -40;
        const ex = 20, ey = 20, eEnd = 40;
        const fx = (x) => (comp.flipX ? -x : x);
        rCtx.save();
        if (comp.flipX) rCtx.scale(-1, 1);
        rCtx.strokeStyle = COLORS.strokeLight;
        rCtx.lineWidth = 3;
        rCtx.beginPath();
        rCtx.moveTo(bx, -20); rCtx.lineTo(bx, 20);
        rCtx.stroke();
        rCtx.lineWidth = 2;
        rCtx.beginPath();
        rCtx.moveTo(-40, by); rCtx.lineTo(bx, by);
        rCtx.moveTo(bx, by); rCtx.lineTo(cx, cy); rCtx.lineTo(cx, cEnd);
        rCtx.moveTo(bx, by); rCtx.lineTo(ex, ey); rCtx.lineTo(ex, eEnd);
        rCtx.stroke();
        const ax = 13, ay = 13;
        const ux = 0.707, uy = 0.707, px = -uy, py = ux, wing = 4.5;
        const tipX = ax + ux * 5.5, tipY = ay + uy * 5.5;
        rCtx.beginPath();
        rCtx.moveTo(tipX, tipY);
        rCtx.lineTo(ax - ux * 1.5 + px * wing, ay - uy * 1.5 + py * wing);
        rCtx.moveTo(tipX, tipY);
        rCtx.lineTo(ax - ux * 1.5 - px * wing, ay - uy * 1.5 - py * wing);
        rCtx.stroke();
        rCtx.restore();
        rCtx.fillStyle = COLORS.inkMuted; rCtx.font = '11px Arial'; rCtx.textBaseline = 'middle';
        rCtx.textAlign = 'left';
        rCtx.fillText('b', fx(-34), -10);
        rCtx.fillText('c', fx(4), -32);
        rCtx.fillText('e', fx(4), 32);
        rCtx.fillStyle = COLORS.ink; rCtx.font = '12px Arial';
        rCtx.fillText(comp.label, fx(-36), -24);
        rCtx.textAlign = 'center';
        rCtx.fillText('2N2222', fx(34), 2);
    }
    else if (comp.type === 'nmos') {
        const fx = (x) => (comp.flipX ? -x : x);
        const frameCx = -10;
        const lineGap = 8;
        const gateX = frameCx - lineGap / 2;
        const channelX = frameCx + lineGap / 2;
        const vHalf = 32;
        const dY = -60;
        const sY = 60;
        rCtx.save();
        if (comp.flipX) rCtx.scale(-1, 1);
        rCtx.strokeStyle = COLORS.strokeLight;
        rCtx.fillStyle = COLORS.strokeLight;
        rCtx.lineWidth = 2;
        rCtx.lineJoin = 'round';
        rCtx.lineCap = 'round';
        rCtx.beginPath();
        rCtx.moveTo(-40, 0);
        rCtx.lineTo(gateX, 0);
        rCtx.stroke();
        rCtx.beginPath();
        rCtx.moveTo(gateX, -vHalf);
        rCtx.lineTo(gateX, vHalf);
        rCtx.moveTo(channelX, -vHalf);
        rCtx.lineTo(channelX, vHalf);
        rCtx.stroke();
        rCtx.beginPath();
        rCtx.moveTo(channelX, -vHalf);
        rCtx.lineTo(20, -52);
        rCtx.lineTo(20, dY);
        rCtx.moveTo(channelX, vHalf);
        rCtx.lineTo(20, 52);
        rCtx.lineTo(20, sY);
        rCtx.stroke();
        rCtx.beginPath();
        rCtx.moveTo(channelX, vHalf);
        rCtx.lineTo(channelX + 10, vHalf + 6);
        rCtx.lineTo(channelX + 10, vHalf - 6);
        rCtx.closePath();
        rCtx.fill();
        rCtx.stroke();
        rCtx.restore();
        rCtx.fillStyle = COLORS.inkMuted;
        rCtx.font = '11px Arial';
        rCtx.textBaseline = 'middle';
        rCtx.textAlign = 'left';
        rCtx.fillText('G', fx(-34), -10);
        rCtx.fillText('D', fx(4), -54);
        rCtx.fillText('S', fx(4), 54);
        rCtx.fillStyle = COLORS.ink;
        rCtx.font = '12px Arial';
        rCtx.fillText(comp.label, fx(-36), -24);
        rCtx.textAlign = 'center';
        rCtx.fillText(comp.value || 'IRLZ44N', fx(34), 2);
    }
    else if (comp.type === 'opamp') {
        const tLeft = -12, tTop = -30, tBot = 30, tApex = 28, inY = 20;
        const fx = (x) => (comp.flipX ? -x : x);
        const fy = (y) => (comp.flipY ? -y : y);
        rCtx.save();
        if (comp.flipX) rCtx.scale(-1, 1);
        if (comp.flipY) rCtx.scale(1, -1);
        rCtx.fillStyle = COLORS.opampFill;
        rCtx.strokeStyle = COLORS.strokeMuted;
        rCtx.lineWidth = 2.5;
        rCtx.beginPath();
        rCtx.moveTo(tLeft, tTop); rCtx.lineTo(tLeft, tBot); rCtx.lineTo(tApex, 0); rCtx.closePath();
        rCtx.fill(); rCtx.stroke();
        rCtx.strokeStyle = COLORS.strokeLight; rCtx.lineWidth = 2;
        rCtx.beginPath();
        rCtx.moveTo(-40, -inY); rCtx.lineTo(tLeft, -inY);
        rCtx.moveTo(-40, inY); rCtx.lineTo(tLeft, inY);
        rCtx.moveTo(tApex, 0); rCtx.lineTo(40, 0);
        rCtx.stroke();
        rCtx.restore();
        rCtx.fillStyle = COLORS.ink; rCtx.font = 'bold 10px Arial';
        rCtx.textAlign = 'center'; rCtx.textBaseline = 'middle';
        rCtx.fillText('+', fx(-8), fy(-inY));
        rCtx.fillText('−', fx(-8), fy(inY));
        rCtx.fillStyle = COLORS.ink; rCtx.font = '12px Arial';
        rCtx.fillText(comp.label, fx(8), fy(-38));
        rCtx.fillStyle = COLORS.inkMuted;
        rCtx.fillText(comp.value || 'uA741', fx(8), fy(42));
    }
    else if (['not', 'and', 'nand', 'or', 'nor', 'xor', 'xnor'].includes(comp.type)) {
        drawLogicGateSymbol(comp.type);
        drawLabels(comp.label, null, rot);
    }
    else if (comp.type === 'd_flipflop') {
        rCtx.strokeStyle = '#00bcd4'; rCtx.lineWidth = 2; rCtx.fillStyle = COLORS.componentFill;
        rCtx.fillRect(-30, -30, 60, 60); rCtx.strokeRect(-30, -30, 60, 60);
        rCtx.beginPath();
        rCtx.moveTo(-40, -20); rCtx.lineTo(-30, -20);   // D
        rCtx.moveTo(-40, 20); rCtx.lineTo(-30, 20);     // CLK
        rCtx.moveTo(30, -20); rCtx.lineTo(40, -20);     // Q
        rCtx.moveTo(30, 20); rCtx.lineTo(40, 20);       // /Q
        rCtx.stroke();
        drawFlipFlopSetReset(rCtx, -30, 30);
        rCtx.fillStyle = COLORS.ink; rCtx.font = '10px Arial'; rCtx.textBaseline = 'middle';
        rCtx.textAlign = 'left'; rCtx.fillText('D', -27, -20); rCtx.fillText('>', -27, 20);
        rCtx.textAlign = 'right'; rCtx.fillText('Q', 27, -20); rCtx.fillText('Q', 27, 20);
        rCtx.beginPath(); rCtx.moveTo(20, 13); rCtx.lineTo(27, 13); rCtx.stroke();
        rCtx.font = '12px Arial'; rCtx.fillStyle = COLORS.ink; rCtx.fillText(comp.label, 0, -62);
    }
    else if (comp.type === 'jk_flipflop') {
        rCtx.strokeStyle = '#ff9800'; rCtx.lineWidth = 2; rCtx.fillStyle = COLORS.componentFill;
        rCtx.fillRect(-30, -35, 60, 70); rCtx.strokeRect(-30, -35, 60, 70);
        rCtx.beginPath();
        rCtx.moveTo(-40, -20); rCtx.lineTo(-30, -20);   // J
        rCtx.moveTo(-40, 0); rCtx.lineTo(-30, 0);       // CLK
        rCtx.moveTo(-40, 20); rCtx.lineTo(-30, 20);     // K
        rCtx.moveTo(30, -20); rCtx.lineTo(40, -20);     // Q
        rCtx.moveTo(30, 20); rCtx.lineTo(40, 20);       // /Q
        rCtx.stroke();
        drawFlipFlopSetReset(rCtx, -35, 35);
        rCtx.fillStyle = COLORS.ink; rCtx.font = '10px Arial'; rCtx.textBaseline = 'middle';
        rCtx.textAlign = 'left'; rCtx.fillText('J', -27, -20); rCtx.fillText('>', -27, 0); rCtx.fillText('K', -27, 20);
        rCtx.textAlign = 'right'; rCtx.fillText('Q', 27, -20); rCtx.fillText('Q', 27, 20);
        rCtx.beginPath(); rCtx.moveTo(20, 13); rCtx.lineTo(27, 13); rCtx.stroke();
        rCtx.font = '12px Arial'; rCtx.fillStyle = COLORS.ink; rCtx.fillText(comp.label, 0, -64);
    }
    else if (comp.type === 'cd4511') {
        const inLbl = ['A', 'B', 'C', 'D', 'LE', 'BI', 'LT'];
        const outLbl = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
        rCtx.strokeStyle = '#ab47bc'; rCtx.lineWidth = 2; rCtx.fillStyle = COLORS.componentFill;
        rCtx.fillRect(CD4511_BOX_L, CD4511_BOX_T, CD4511_BOX_R - CD4511_BOX_L, CD4511_BOX_B - CD4511_BOX_T);
        rCtx.strokeRect(CD4511_BOX_L, CD4511_BOX_T, CD4511_BOX_R - CD4511_BOX_L, CD4511_BOX_B - CD4511_BOX_T);
        rCtx.beginPath();
        CD4511_PIN_Y.forEach((y) => {
            rCtx.moveTo(CD4511_JUNC_L, y);
            rCtx.lineTo(CD4511_BOX_L, y);
        });
        CD4511_PIN_Y.forEach((y) => {
            rCtx.moveTo(CD4511_BOX_R, y);
            rCtx.lineTo(CD4511_JUNC_R, y);
        });
        rCtx.stroke();
        rCtx.fillStyle = COLORS.ink; rCtx.font = 'bold 9px Arial'; rCtx.textBaseline = 'middle';
        rCtx.textAlign = 'left';
        inLbl.forEach((t, i) => rCtx.fillText(t, CD4511_LABEL_L, CD4511_PIN_Y[i]));
        rCtx.textAlign = 'right';
        outLbl.forEach((t, i) => rCtx.fillText(t, CD4511_LABEL_R, CD4511_PIN_Y[i]));
        rCtx.font = '9px Arial'; rCtx.textAlign = 'center';
        rCtx.fillText('CD4511', 0, -4);
        rCtx.font = '8px Arial';
        rCtx.fillText('BCD→7', 0, 6);
        rCtx.font = '11px Arial';
        rCtx.fillText(comp.label, 0, CD4511_BOX_T - 12);
    }
    else if (comp.type === 'ic_74hc90') {
        const leftLbl = ['CP1', 'MR1', 'MR2', '', 'VCC', 'MS1', 'MS2'];
        const rightLbl = ['Q0', 'Q1', 'Q2', 'Q3', '', 'GND', 'CP0'];
        rCtx.strokeStyle = '#26a69a'; rCtx.lineWidth = 2; rCtx.fillStyle = COLORS.componentFill;
        rCtx.fillRect(IC90_BOX_L, IC90_BOX_T, IC90_BOX_R - IC90_BOX_L, IC90_BOX_B - IC90_BOX_T);
        rCtx.strokeRect(IC90_BOX_L, IC90_BOX_T, IC90_BOX_R - IC90_BOX_L, IC90_BOX_B - IC90_BOX_T);
        rCtx.beginPath();
        IC90_LEFT_PIN_Y.forEach((y, i) => {
            if (!leftLbl[i]) return;
            rCtx.moveTo(IC90_JUNC_L, y);
            rCtx.lineTo(IC90_BOX_L, y);
        });
        IC90_RIGHT_PIN_Y.forEach((y, i) => {
            if (!rightLbl[i]) return;
            rCtx.moveTo(IC90_BOX_R, y);
            rCtx.lineTo(IC90_JUNC_R, y);
        });
        rCtx.stroke();
        rCtx.fillStyle = COLORS.ink; rCtx.font = '8px Arial'; rCtx.textBaseline = 'middle';
        rCtx.textAlign = 'left';
        leftLbl.forEach((t, i) => { if (t) rCtx.fillText(t, IC90_LABEL_L, IC90_LEFT_PIN_Y[i]); });
        rCtx.textAlign = 'right';
        rightLbl.forEach((t, i) => { if (t) rCtx.fillText(t, IC90_LABEL_R, IC90_RIGHT_PIN_Y[i]); });
        rCtx.font = 'bold 9px Arial'; rCtx.textAlign = 'center';
        rCtx.fillText('74HC90', 0, -4);
        rCtx.font = '8px Arial';
        rCtx.fillText('décade', 0, 6);
        const count = hc90SimCount(comp);
        if (count != null) {
            rCtx.fillStyle = '#76ff03';
            rCtx.font = 'bold 13px Arial';
            rCtx.fillText(String(count), 0, 20);
            const qPins = IC90_Q_STACK_INDICES.map((qi) => ({
                qi,
                y: IC90_RIGHT_PIN_Y[qi],
            }));
            qPins.forEach(({ qi, y }) => {
                const on = (count >> qi) & 1;
                rCtx.beginPath();
                rCtx.fillStyle = on ? '#76ff03' : '#455a64';
                rCtx.arc(IC90_JUNC_R - 8, y, 4, 0, Math.PI * 2);
                rCtx.fill();
            });
        }
        rCtx.fillStyle = COLORS.ink;
        rCtx.font = '11px Arial';
        rCtx.fillText(comp.label, 0, IC90_BOX_T - 12);
    }
    else if (comp.type === 'lm386') {
        const leftLbl = ['1 G1', '2 −', '3 +', '4 GND'];
        const rightLbl = ['8 G8', '7 BP', '6 V+', '5 OUT'];
        rCtx.strokeStyle = '#8d6e63';
        rCtx.lineWidth = 2;
        rCtx.fillStyle = '#3e2723';
        rCtx.fillRect(LM386_BOX_L, LM386_BOX_T, LM386_BOX_R - LM386_BOX_L, LM386_BOX_B - LM386_BOX_T);
        rCtx.strokeRect(LM386_BOX_L, LM386_BOX_T, LM386_BOX_R - LM386_BOX_L, LM386_BOX_B - LM386_BOX_T);
        rCtx.beginPath();
        rCtx.arc(LM386_BOX_L + 6, LM386_BOX_T + 6, 3, 0, Math.PI * 2);
        rCtx.stroke();
        LM386_LEFT_PIN_Y.forEach((y, i) => {
            rCtx.moveTo(LM386_JUNC_L, y);
            rCtx.lineTo(LM386_BOX_L, y);
        });
        LM386_RIGHT_PIN_Y.forEach((y, i) => {
            rCtx.moveTo(LM386_BOX_R, y);
            rCtx.lineTo(LM386_JUNC_R, y);
        });
        rCtx.stroke();
        rCtx.fillStyle = '#efebe9';
        rCtx.font = '7px Arial';
        rCtx.textBaseline = 'middle';
        rCtx.textAlign = 'left';
        leftLbl.forEach((t, i) => rCtx.fillText(t, LM386_LABEL_L, LM386_LEFT_PIN_Y[i]));
        rCtx.textAlign = 'right';
        rightLbl.forEach((t, i) => rCtx.fillText(t, LM386_LABEL_R, LM386_RIGHT_PIN_Y[i]));
        rCtx.font = 'bold 9px Arial';
        rCtx.textAlign = 'center';
        rCtx.fillStyle = '#ffcc80';
        rCtx.fillText('LM386', 0, -2);
        rCtx.font = '7px Arial';
        const vplus = comp.vplus ?? 9;
        rCtx.fillText(`${vplus} V`, 0, 8);
        rCtx.fillStyle = '#efebe9';
        rCtx.font = '10px Arial';
        rCtx.fillText(comp.label, 0, LM386_BOX_T - 10);
    }
    else if (comp.type === 'lm7805') {
        const pinLbl = ['IN', 'GND', 'OUT'];
        rCtx.strokeStyle = '#455a64';
        rCtx.lineWidth = 2;
        rCtx.fillStyle = '#263238';
        rCtx.fillRect(LM7805_BOX_L, LM7805_BOX_T, LM7805_BOX_R - LM7805_BOX_L, LM7805_BOX_B - LM7805_BOX_T);
        rCtx.strokeRect(LM7805_BOX_L, LM7805_BOX_T, LM7805_BOX_R - LM7805_BOX_L, LM7805_BOX_B - LM7805_BOX_T);
        rCtx.beginPath();
        rCtx.moveTo(LM7805_BOX_R, LM7805_BOX_T + 4);
        rCtx.lineTo(LM7805_BOX_R + 8, LM7805_BOX_T + 4);
        rCtx.lineTo(LM7805_BOX_R + 8, LM7805_BOX_B - 4);
        rCtx.lineTo(LM7805_BOX_R, LM7805_BOX_B - 4);
        rCtx.stroke();
        LM7805_PIN_Y.forEach((y) => {
            rCtx.beginPath();
            rCtx.moveTo(LM7805_JUNC_L, y);
            rCtx.lineTo(LM7805_BOX_L, y);
            rCtx.stroke();
        });
        rCtx.fillStyle = '#eceff1';
        rCtx.font = '8px Arial';
        rCtx.textBaseline = 'middle';
        rCtx.textAlign = 'left';
        pinLbl.forEach((t, i) => rCtx.fillText(t, LM7805_LABEL_L, LM7805_PIN_Y[i]));
        drawLabels(comp.label, null, rot);
    }
    else if (comp.type === 'ir2104') {
        const leftLbl = ['1 LO', '2 VS', '3 HO', '4 VB'];
        const rightLbl = ['8 IN', '7 COM', '6 VCC', '5 NC'];
        rCtx.strokeStyle = '#1565c0';
        rCtx.lineWidth = 2;
        rCtx.fillStyle = '#0d47a1';
        rCtx.fillRect(IR2104_BOX_L, IR2104_BOX_T, IR2104_BOX_R - IR2104_BOX_L, IR2104_BOX_B - IR2104_BOX_T);
        rCtx.strokeRect(IR2104_BOX_L, IR2104_BOX_T, IR2104_BOX_R - IR2104_BOX_L, IR2104_BOX_B - IR2104_BOX_T);
        rCtx.beginPath();
        rCtx.arc(IR2104_BOX_L + 6, IR2104_BOX_T + 6, 3, 0, Math.PI * 2);
        rCtx.stroke();
        IR2104_LEFT_PIN_Y.forEach((y) => {
            rCtx.moveTo(IR2104_JUNC_L, y);
            rCtx.lineTo(IR2104_BOX_L, y);
        });
        IR2104_RIGHT_PIN_Y.forEach((y) => {
            rCtx.moveTo(IR2104_BOX_R, y);
            rCtx.lineTo(IR2104_JUNC_R, y);
        });
        rCtx.stroke();
        rCtx.fillStyle = '#e3f2fd';
        rCtx.font = '7px Arial';
        rCtx.textBaseline = 'middle';
        rCtx.textAlign = 'left';
        leftLbl.forEach((t, i) => rCtx.fillText(t, IR2104_LABEL_L, IR2104_LEFT_PIN_Y[i]));
        rCtx.textAlign = 'right';
        rightLbl.forEach((t, i) => rCtx.fillText(t, IR2104_LABEL_R, IR2104_RIGHT_PIN_Y[i]));
        rCtx.font = 'bold 9px Arial';
        rCtx.textAlign = 'center';
        rCtx.fillStyle = '#90caf9';
        rCtx.fillText('IR2104', 0, -2);
        rCtx.font = '7px Arial';
        const vcc = comp.vcc ?? 12;
        rCtx.fillText(`demi-pont ${vcc} V`, 0, 8);
        rCtx.fillStyle = '#e3f2fd';
        rCtx.font = '10px Arial';
        rCtx.fillText(comp.label, 0, IR2104_BOX_T - 10);
    }
    else if (comp.type === 'l293d') {
        const leftLbl = ['1 E12', '2 1A', '3 1Y', '4 GND', '5 GND', '6 2Y', '7 2A', '8 VSS'];
        const rightLbl = ['16 Vs', '15 4A', '14 4Y', '13 GND', '12 GND', '11 3Y', '10 3A', '9 E34'];
        rCtx.strokeStyle = '#2e7d32';
        rCtx.lineWidth = 2;
        rCtx.fillStyle = '#1b5e20';
        rCtx.fillRect(L293D_BOX_L, L293D_BOX_T, L293D_BOX_R - L293D_BOX_L, L293D_BOX_B - L293D_BOX_T);
        rCtx.strokeRect(L293D_BOX_L, L293D_BOX_T, L293D_BOX_R - L293D_BOX_L, L293D_BOX_B - L293D_BOX_T);
        rCtx.beginPath();
        rCtx.arc(L293D_BOX_L + 6, L293D_BOX_T + 6, 3, 0, Math.PI * 2);
        rCtx.stroke();
        L293D_LEFT_PIN_Y.forEach((y) => {
            rCtx.moveTo(L293D_JUNC_L, y);
            rCtx.lineTo(L293D_BOX_L, y);
        });
        L293D_RIGHT_PIN_Y.forEach((y) => {
            rCtx.moveTo(L293D_BOX_R, y);
            rCtx.lineTo(L293D_JUNC_R, y);
        });
        rCtx.stroke();
        rCtx.fillStyle = '#e8f5e9';
        rCtx.font = '6px Arial';
        rCtx.textBaseline = 'middle';
        rCtx.textAlign = 'left';
        leftLbl.forEach((t, i) => rCtx.fillText(t, L293D_LABEL_L, L293D_LEFT_PIN_Y[i]));
        rCtx.textAlign = 'right';
        rightLbl.forEach((t, i) => rCtx.fillText(t, L293D_LABEL_R, L293D_RIGHT_PIN_Y[i]));
        rCtx.fillStyle = '#e8f5e9';
        rCtx.font = '10px Arial';
        rCtx.textAlign = 'center';
        rCtx.fillText(comp.label, 0, L293D_BOX_T - 10);
    }
    else if (comp.type === 'arduino_uno') {
        rCtx.fillStyle = '#00979d';
        rCtx.strokeStyle = '#006064';
        rCtx.lineWidth = 2;
        rCtx.fillRect(UNO_BOX_L, UNO_BOX_T, UNO_BOX_R - UNO_BOX_L, UNO_BOX_B - UNO_BOX_T);
        rCtx.strokeRect(UNO_BOX_L, UNO_BOX_T, UNO_BOX_R - UNO_BOX_L, UNO_BOX_B - UNO_BOX_T);
        rCtx.beginPath();
        UNO_LEFT_PIN_Y.forEach((y) => {
            rCtx.moveTo(UNO_JUNC_L, y);
            rCtx.lineTo(UNO_BOX_L, y);
        });
        UNO_RIGHT_PIN_Y.forEach((y) => {
            rCtx.moveTo(UNO_BOX_R, y);
            rCtx.lineTo(UNO_JUNC_R, y);
        });
        rCtx.strokeStyle = '#004d40';
        rCtx.stroke();
        rCtx.fillStyle = '#ffffff';
        rCtx.font = '6px Arial';
        rCtx.textBaseline = 'middle';
        rCtx.textAlign = 'left';
        UNO_LEFT_PINS.forEach((t, i) => rCtx.fillText(formatUnoPinLabel(t), UNO_LABEL_L, UNO_LEFT_PIN_Y[i]));
        rCtx.textAlign = 'right';
        UNO_RIGHT_PINS.forEach((t, i) => rCtx.fillText(formatUnoPinLabel(t), UNO_LABEL_R, UNO_RIGHT_PIN_Y[i]));
        rCtx.font = 'bold 10px Arial';
        rCtx.textAlign = 'center';
        rCtx.fillStyle = '#ffffff';
        rCtx.fillText('UNO', 0, 0);
        rCtx.font = '8px Arial';
        rCtx.fillText('ATmega328P', 0, 12);
        if (flags.isSimulating && comp.label) {
            UNO_DIGITAL_PINS.forEach((pinName) => {
                const lv = simulationResults.logicValues?.[`${comp.label}_${pinName}`]
                    ?? simulationResults.logicValues?.[`${comp.label}/${pinName}`];
                if (!lv) return;
                const idx = UNO_RIGHT_PINS.indexOf(pinName);
                if (idx < 0) return;
                const y = UNO_RIGHT_PIN_Y[idx];
                rCtx.beginPath();
                rCtx.fillStyle = lv.logic === 1 ? '#76ff03' : '#455a64';
                rCtx.arc(UNO_JUNC_R - 8, y, 3, 0, Math.PI * 2);
                rCtx.fill();
            });
        }
        if (comp.lastCompileOk === true) {
            rCtx.fillStyle = '#76ff03';
            rCtx.font = '7px Arial';
            rCtx.textAlign = 'left';
            rCtx.fillText('✓ compile', UNO_BOX_L + 4, UNO_BOX_B - 6);
        } else if (comp.lastCompileOk === false) {
            rCtx.fillStyle = '#ff5252';
            rCtx.font = '7px Arial';
            rCtx.textAlign = 'left';
            rCtx.fillText('✗ compile', UNO_BOX_L + 4, UNO_BOX_B - 6);
        }
        rCtx.fillStyle = COLORS.ink;
        rCtx.font = '11px Arial';
        rCtx.textAlign = 'center';
        rCtx.fillText(comp.label, 0, UNO_BOX_T - 12);
    }
    else if (comp.type === 'esp32_c3') {
        rCtx.fillStyle = '#512da8';
        rCtx.strokeStyle = '#311b92';
        rCtx.lineWidth = 2;
        rCtx.fillRect(ESP32_BOX_L, ESP32_BOX_T, ESP32_BOX_R - ESP32_BOX_L, ESP32_BOX_B - ESP32_BOX_T);
        rCtx.strokeRect(ESP32_BOX_L, ESP32_BOX_T, ESP32_BOX_R - ESP32_BOX_L, ESP32_BOX_B - ESP32_BOX_T);
        rCtx.beginPath();
        ESP32_LEFT_PIN_Y.forEach((y) => {
            rCtx.moveTo(ESP32_JUNC_L, y);
            rCtx.lineTo(ESP32_BOX_L, y);
        });
        ESP32_RIGHT_PIN_Y.forEach((y) => {
            rCtx.moveTo(ESP32_BOX_R, y);
            rCtx.lineTo(ESP32_JUNC_R, y);
        });
        rCtx.strokeStyle = '#1a237e';
        rCtx.stroke();
        rCtx.fillStyle = '#ffffff';
        rCtx.font = '6px Arial';
        rCtx.textBaseline = 'middle';
        rCtx.textAlign = 'left';
        ESP32_LEFT_PINS.forEach((t, i) => rCtx.fillText(formatEsp32PinLabel(t), ESP32_LABEL_L, ESP32_LEFT_PIN_Y[i]));
        rCtx.textAlign = 'right';
        ESP32_RIGHT_PINS.forEach((t, i) => rCtx.fillText(formatEsp32PinLabel(t), ESP32_LABEL_R, ESP32_RIGHT_PIN_Y[i]));
        rCtx.font = 'bold 10px Arial';
        rCtx.textAlign = 'center';
        rCtx.fillStyle = '#ffffff';
        rCtx.fillText('ESP32-C3', 0, -2);
        rCtx.font = '8px Arial';
        rCtx.fillText('RISC-V', 0, 10);
        if (flags.isSimulating && comp.label) {
            ESP32_GPIO_PINS.forEach((pinName) => {
                const lv = simulationResults.logicValues?.[`${comp.label}_${pinName}`]
                    ?? simulationResults.logicValues?.[`${comp.label}/${pinName}`];
                if (!lv) return;
                const idx = ESP32_RIGHT_PINS.indexOf(pinName);
                const side = idx >= 0 ? 'R' : 'L';
                const pinIdx = side === 'R' ? idx : ESP32_LEFT_PINS.indexOf(pinName);
                if (pinIdx < 0) return;
                const y = side === 'R' ? ESP32_RIGHT_PIN_Y[pinIdx] : ESP32_LEFT_PIN_Y[pinIdx];
                const x = side === 'R' ? ESP32_JUNC_R - 8 : ESP32_JUNC_L + 8;
                rCtx.beginPath();
                rCtx.fillStyle = lv.logic === 1 ? '#76ff03' : '#455a64';
                rCtx.arc(x, y, 3, 0, Math.PI * 2);
                rCtx.fill();
            });
        }
        if (comp.lastCompileOk === true) {
            rCtx.fillStyle = '#76ff03';
            rCtx.font = '7px Arial';
            rCtx.textAlign = 'left';
            rCtx.fillText('✓ compile', ESP32_BOX_L + 4, ESP32_BOX_B - 6);
        } else if (comp.lastCompileOk === false) {
            rCtx.fillStyle = '#ff5252';
            rCtx.font = '7px Arial';
            rCtx.textAlign = 'left';
            rCtx.fillText('✗ compile', ESP32_BOX_L + 4, ESP32_BOX_B - 6);
        }
        rCtx.fillStyle = COLORS.ink;
        rCtx.font = '11px Arial';
        rCtx.textAlign = 'center';
        rCtx.fillText(comp.label, 0, ESP32_BOX_T - 12);
    }
    else if (comp.type === 'esp32_devkit') {
        rCtx.fillStyle = '#1565c0';
        rCtx.strokeStyle = '#0d47a1';
        rCtx.lineWidth = 2;
        rCtx.fillRect(ESP32_DEVKIT_BOX_L, ESP32_DEVKIT_BOX_T, ESP32_DEVKIT_BOX_R - ESP32_DEVKIT_BOX_L, ESP32_DEVKIT_BOX_B - ESP32_DEVKIT_BOX_T);
        rCtx.strokeRect(ESP32_DEVKIT_BOX_L, ESP32_DEVKIT_BOX_T, ESP32_DEVKIT_BOX_R - ESP32_DEVKIT_BOX_L, ESP32_DEVKIT_BOX_B - ESP32_DEVKIT_BOX_T);
        rCtx.beginPath();
        ESP32_DEVKIT_LEFT_PIN_Y.forEach((y) => {
            rCtx.moveTo(ESP32_DEVKIT_JUNC_L, y);
            rCtx.lineTo(ESP32_DEVKIT_BOX_L, y);
        });
        ESP32_DEVKIT_RIGHT_PIN_Y.forEach((y) => {
            rCtx.moveTo(ESP32_DEVKIT_BOX_R, y);
            rCtx.lineTo(ESP32_DEVKIT_JUNC_R, y);
        });
        rCtx.strokeStyle = '#1a237e';
        rCtx.stroke();
        rCtx.fillStyle = '#ffffff';
        rCtx.font = '5px Arial';
        rCtx.textBaseline = 'middle';
        rCtx.textAlign = 'left';
        ESP32_DEVKIT_LEFT_PINS.forEach((t, i) => rCtx.fillText(formatEsp32DevkitPinLabel(t), ESP32_DEVKIT_LABEL_L, ESP32_DEVKIT_LEFT_PIN_Y[i]));
        rCtx.textAlign = 'right';
        ESP32_DEVKIT_RIGHT_PINS.forEach((t, i) => rCtx.fillText(formatEsp32DevkitPinLabel(t), ESP32_DEVKIT_LABEL_R, ESP32_DEVKIT_RIGHT_PIN_Y[i]));
        rCtx.font = 'bold 10px Arial';
        rCtx.textAlign = 'center';
        rCtx.fillStyle = '#ffffff';
        rCtx.fillText('ESP32', 0, -4);
        rCtx.font = '7px Arial';
        rCtx.fillText('WROOM-32', 0, 8);
        if (flags.isSimulating && comp.label) {
            ESP32_DEVKIT_GPIO_PINS.forEach((pinName) => {
                const lv = simulationResults.logicValues?.[`${comp.label}_${pinName}`]
                    ?? simulationResults.logicValues?.[`${comp.label}/${pinName}`];
                if (!lv) return;
                const idx = ESP32_DEVKIT_RIGHT_PINS.indexOf(pinName);
                const side = idx >= 0 ? 'R' : 'L';
                const pinIdx = side === 'R' ? idx : ESP32_DEVKIT_LEFT_PINS.indexOf(pinName);
                if (pinIdx < 0) return;
                const y = side === 'R' ? ESP32_DEVKIT_RIGHT_PIN_Y[pinIdx] : ESP32_DEVKIT_LEFT_PIN_Y[pinIdx];
                const x = side === 'R' ? ESP32_DEVKIT_JUNC_R - 8 : ESP32_DEVKIT_JUNC_L + 8;
                rCtx.beginPath();
                rCtx.fillStyle = lv.logic === 1 ? '#76ff03' : '#455a64';
                rCtx.arc(x, y, 3, 0, Math.PI * 2);
                rCtx.fill();
            });
        }
        if (comp.lastCompileOk === true) {
            rCtx.fillStyle = '#76ff03';
            rCtx.font = '7px Arial';
            rCtx.textAlign = 'left';
            rCtx.fillText('✓ compile', ESP32_DEVKIT_BOX_L + 4, ESP32_DEVKIT_BOX_B - 6);
        } else if (comp.lastCompileOk === false) {
            rCtx.fillStyle = '#ff5252';
            rCtx.font = '7px Arial';
            rCtx.textAlign = 'left';
            rCtx.fillText('✗ compile', ESP32_DEVKIT_BOX_L + 4, ESP32_DEVKIT_BOX_B - 6);
        }
        rCtx.fillStyle = COLORS.ink;
        rCtx.font = '11px Arial';
        rCtx.textAlign = 'center';
        rCtx.fillText(comp.label, 0, ESP32_DEVKIT_BOX_T - 12);
    }
    else if (comp.type === 'seg7') {
        drawSeg7Display(comp);
    }
    else if (comp.type === 'bargraph_dc10h') {
        drawBargraphDc10h(comp);
    }
    else if (comp.type === 'matrix_8x8') {
        drawMatrix8x8(comp);
    }
    else if (comp.type === 'grove_lcd16x2') {
        drawGroveLcd16x2(comp);
    }
    else if (comp.type === 'joyit_tft18') {
        drawJoyitTft18(comp);
    }
    else if (comp.type === 'grove_dht22') {
        drawGroveDht22(comp);
    }
    else if (comp.type === 'grove_tsl2591') {
        drawGroveTsl2591(comp);
    }
    else if (comp.type === 'grove_bmp280') {
        drawGroveBmp280(comp);
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
        rCtx.strokeStyle = isBurnt ? '#666666' : (isLit ? '#ff6b81' : '#ff1744');
        rCtx.lineWidth = 2; rCtx.fillStyle = ledBodyColor;
        if (isLit) {
            rCtx.save(); rCtx.shadowBlur = 20; rCtx.shadowColor = '#ff1744';
            rCtx.beginPath(); rCtx.moveTo(-15, -15); rCtx.lineTo(10, 0); rCtx.lineTo(-15, 15); rCtx.closePath(); rCtx.fill(); rCtx.restore();
        } else {
            rCtx.beginPath(); rCtx.moveTo(-15, -15); rCtx.lineTo(10, 0); rCtx.lineTo(-15, 15); rCtx.closePath(); rCtx.fill();
        }
        rCtx.beginPath(); rCtx.moveTo(10, -15); rCtx.lineTo(10, 15); rCtx.stroke();
        rCtx.beginPath(); rCtx.moveTo(-40, 0); rCtx.lineTo(-15, 0); rCtx.moveTo(10, 0); rCtx.lineTo(40, 0); rCtx.stroke();
        if (!isBurnt) {
            rCtx.save();
            rCtx.strokeStyle = isLit ? '#ff8a9a' : '#730510';
            rCtx.beginPath(); rCtx.moveTo(-5, -18); rCtx.lineTo(5, -28); rCtx.moveTo(5, -28); rCtx.lineTo(0, -28); rCtx.moveTo(5, -28); rCtx.lineTo(5, -23);
            rCtx.moveTo(5, -14); rCtx.lineTo(15, -24); rCtx.moveTo(15, -24); rCtx.lineTo(10, -24); rCtx.moveTo(15, -24); rCtx.lineTo(15, -19); rCtx.stroke();
            rCtx.restore();
        }
        if (isBurnt) {
            drawLedSmoke(performance.now() / 350);
        }
        drawLabels(comp.label, isBurnt ? 'GRILLÉE' : null, rot);
    }
    else if (comp.type === 'gimp') {
        rCtx.save();
        if (comp.flipX) rCtx.scale(-1, 1);
        rCtx.strokeStyle = '#ab47bc'; rCtx.lineWidth = 2;
        rCtx.beginPath();
        rCtx.moveTo(8, 0); rCtx.lineTo(40, 0);
        rCtx.moveTo(0, 18); rCtx.lineTo(0, 40);
        rCtx.stroke();
        rCtx.fillStyle = COLORS.componentFill; rCtx.fillRect(-18, -18, 26, 36); rCtx.strokeRect(-18, -18, 26, 36);
        rCtx.fillStyle = '#ce93d8'; rCtx.font = 'bold 11px Arial'; rCtx.textAlign = 'center'; rCtx.textBaseline = 'middle';
        rCtx.fillText('G', -5, 0);
        rCtx.restore();
        drawLabels(comp.label, null, 0);
    }
    else if (comp.type === 'gsin') {
        rCtx.strokeStyle = '#26c6da'; rCtx.lineWidth = 2; rCtx.fillStyle = COLORS.componentFill;
        rCtx.fillRect(-18, -14, 36, 28); rCtx.strokeRect(-18, -14, 36, 28);
        rCtx.strokeStyle = '#4dd0e1'; rCtx.lineWidth = 1.5;
        rCtx.beginPath();
        rCtx.moveTo(-14, 0);
        rCtx.quadraticCurveTo(-7, -10, 0, 0);
        rCtx.quadraticCurveTo(7, 10, 14, 0);
        rCtx.stroke();
        rCtx.lineWidth = 2; rCtx.strokeStyle = '#26c6da';
        rCtx.beginPath();
        rCtx.moveTo(18, 0); rCtx.lineTo(40, 0);
        rCtx.moveTo(0, 14); rCtx.lineTo(0, 40);
        rCtx.stroke();
        drawWirePlusLabel(40, 0);
        drawLabels(comp.label, null, 0);
    }
    else if (comp.type === 'gsqr') {
        rCtx.strokeStyle = '#29b6f6'; rCtx.lineWidth = 2; rCtx.fillStyle = COLORS.componentFill;
        rCtx.fillRect(-18, -14, 36, 28); rCtx.strokeRect(-18, -14, 36, 28);
        rCtx.strokeStyle = '#4fc3f7'; rCtx.lineWidth = 1.5;
        rCtx.beginPath();
        rCtx.moveTo(-14, 6); rCtx.lineTo(-14, -6); rCtx.lineTo(-2, -6); rCtx.lineTo(-2, 6); rCtx.lineTo(10, 6); rCtx.lineTo(10, -6); rCtx.lineTo(14, -6);
        rCtx.stroke();
        rCtx.lineWidth = 2; rCtx.strokeStyle = '#29b6f6';
        rCtx.beginPath();
        rCtx.moveTo(18, 0); rCtx.lineTo(40, 0);
        rCtx.moveTo(0, 14); rCtx.lineTo(0, 40);
        rCtx.stroke();
        drawWirePlusLabel(40, 0);
        drawLabels(comp.label, null, 0);
    }
    else if (comp.type === 'oscilloscope') {
        rCtx.strokeStyle = '#00bcd4'; rCtx.lineWidth = 2;
        rCtx.beginPath();
        rCtx.moveTo(-60, -20); rCtx.lineTo(-42, -20);
        rCtx.moveTo(-60, 20); rCtx.lineTo(-42, 20);
        rCtx.moveTo(0, 24); rCtx.lineTo(0, 60);
        rCtx.stroke();
        rCtx.fillStyle = '#8899aa'; rCtx.font = '9px Arial'; rCtx.textAlign = 'center'; rCtx.textBaseline = 'bottom';
        rCtx.fillText('CH1', -51, -22);
        rCtx.fillText('CH2', -51, 18);
        drawOscilloscopeScreen(comp);
    }
    else if (comp.type === 'voltmeter') {
        let displayValue = flags.isSimulating ? '—' : '0.0';
        let rawV = null;
        if (flags.isSimulating) {
            const animV = getAnimatedVoltmeterVoltage(comp.label);
            if (animV != null && Number.isFinite(animV)) {
                rawV = animV;
            } else if (simulationResults.voltmeters && simulationResults.voltmeters[comp.label] !== undefined) {
                let measureData = simulationResults.voltmeters[comp.label];
                if (measureData && typeof measureData === 'object' && measureData.voltage !== undefined) {
                    rawV = measureData.voltage;
                } else if (typeof measureData === 'number') { rawV = measureData; }
            }
        }
        if (rawV != null && Number.isFinite(rawV)) {
            displayValue = formatMeterValue(quantizeVoltmeterReading(rawV));
        }
        drawMeterBody('#00bcd4');
        drawMeterDisplay(displayValue, ' V', rot);
        drawLabels(comp.label, null, rot);
    }
    else if (comp.type === 'bode_analyzer') {
        drawMeterBody('#7cff6b');
        drawMeterDisplay('Bode', '', rot);
        drawLabels(comp.label, null, rot);
    }
    else if (comp.type === 'speaker') {
        const playing = flags.isSimulating && isSpeakerAudioPlaying();
        rCtx.strokeStyle = playing ? '#ffeb3b' : '#ab47bc';
        rCtx.lineWidth = 2;
        rCtx.fillStyle = '#2a3b4c';
        rCtx.beginPath();
        rCtx.arc(0, 0, 20, 0, Math.PI * 2);
        rCtx.fill();
        rCtx.stroke();
        rCtx.strokeStyle = playing ? '#ffeb3b' : '#ab47bc';
        rCtx.beginPath();
        rCtx.moveTo(-40, 0);
        rCtx.lineTo(-20, 0);
        rCtx.moveTo(20, 0);
        rCtx.lineTo(40, 0);
        rCtx.stroke();
        if (playing) {
            rCtx.strokeStyle = '#ffeb3b';
            rCtx.lineWidth = 1.5;
            for (let i = 0; i < 3; i++) {
                const r = 10 + i * 5;
                rCtx.beginPath();
                rCtx.arc(22, 0, r, -Math.PI / 4, Math.PI / 4);
                rCtx.stroke();
            }
        }
        drawWirePlusLabel(40, 0);
        const z = comp.value ? `${comp.value}Ω` : '8Ω';
        drawMeterDisplay(playing ? '♪' : 'HP', playing ? '' : z, rot);
        drawLabels(comp.label, null, rot);
    }
    else if (comp.type === 'dc_motor') {
        const angleDeg = flags.isSimulating ? getMotorRotationDeg(comp.label) : 0;
        const spinning = flags.isSimulating && Math.abs(angleDeg % 360) > 0.1;
        rCtx.strokeStyle = spinning ? '#29b6f6' : '#546e7a';
        rCtx.lineWidth = 2;
        rCtx.fillStyle = '#37474f';
        rCtx.beginPath();
        rCtx.arc(0, 0, 22, 0, Math.PI * 2);
        rCtx.fill();
        rCtx.stroke();
        rCtx.beginPath();
        rCtx.moveTo(-40, 0);
        rCtx.lineTo(-22, 0);
        rCtx.moveTo(22, 0);
        rCtx.lineTo(40, 0);
        rCtx.stroke();
        rCtx.save();
        rCtx.rotate((angleDeg * Math.PI) / 180);
        rCtx.strokeStyle = spinning ? '#4fc3f7' : '#90a4ae';
        rCtx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
            const a = (i * Math.PI * 2) / 3;
            rCtx.beginPath();
            rCtx.moveTo(0, 0);
            rCtx.lineTo(Math.cos(a) * 16, Math.sin(a) * 16);
            rCtx.stroke();
        }
        rCtx.beginPath();
        rCtx.arc(0, 0, 5, 0, Math.PI * 2);
        rCtx.fillStyle = spinning ? '#b3e5fc' : '#cfd8dc';
        rCtx.fill();
        rCtx.restore();
        drawWirePlusLabel(40, 0);
        drawLabels(comp.label, null, rot);
    }
    else if (comp.type === 'servo_motor') {
        const angleDeg = flags.isSimulating ? getServoAngleDeg(comp.label) : 90;
        const active = flags.isSimulating && Math.abs(angleDeg - 90) > 0.5;
        const bw = SERVO_BODY_W;
        const bh = SERVO_BODY_H;
        const hornY = bh / 2 + 4;
        rCtx.strokeStyle = active ? '#ff7043' : '#546e7a';
        rCtx.lineWidth = 2;
        rCtx.fillStyle = '#37474f';
        rCtx.fillRect(-bw / 2, -bh / 2, bw, bh);
        rCtx.strokeRect(-bw / 2, -bh / 2, bw, bh);
        rCtx.beginPath();
        rCtx.moveTo(SERVO_JUNC_L, SERVO_PIN_PLUS_Y);
        rCtx.lineTo(-bw / 2, SERVO_PIN_PLUS_Y);
        rCtx.moveTo(SERVO_JUNC_L, SERVO_PIN_MINUS_Y);
        rCtx.lineTo(-bw / 2, SERVO_PIN_MINUS_Y);
        rCtx.moveTo(bw / 2, SERVO_PIN_SIGNAL_Y);
        rCtx.lineTo(SERVO_JUNC_R, SERVO_PIN_SIGNAL_Y);
        rCtx.stroke();
        rCtx.save();
        rCtx.translate(0, hornY);
        rCtx.rotate(((angleDeg - 90) * Math.PI) / 180);
        rCtx.strokeStyle = active ? '#ffab91' : '#90a4ae';
        rCtx.lineWidth = 2.5;
        rCtx.beginPath();
        rCtx.moveTo(0, 0);
        rCtx.lineTo(0, -14);
        rCtx.moveTo(-6, -10);
        rCtx.lineTo(6, -10);
        rCtx.stroke();
        rCtx.beginPath();
        rCtx.arc(0, 0, 4, 0, Math.PI * 2);
        rCtx.fillStyle = active ? '#ffccbc' : '#cfd8dc';
        rCtx.fill();
        rCtx.stroke();
        rCtx.restore();
        drawLabels(comp.label, null, rot, { labelX: 0, nameY: -bh / 2 - 14, textAlign: 'center' });
        drawPinLabelAbove(rot, SERVO_JUNC_L, SERVO_PIN_PLUS_Y, '+', 'right', 'plus');
        drawPinLabelAbove(rot, SERVO_JUNC_L, SERVO_PIN_MINUS_Y, '−', 'right');
        drawPinLabelAbove(rot, SERVO_JUNC_R, SERVO_PIN_SIGNAL_Y, 'S', 'left');
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
    rCtx.restore();

    getComponentJonctions(comp).forEach(j => {
        if (!isJonctionConnected(j.id)) {
            rCtx.save(); const isHovered = interaction.hoverJonction && interaction.hoverJonction.id === j.id;
            rCtx.fillStyle = isHovered ? '#ff5722' : '#ff3333';
            rCtx.beginPath(); rCtx.arc(j.x, j.y, isHovered ? 6 : 4, 0, Math.PI * 2); rCtx.fill(); rCtx.restore();
        }
    });
}

function drawWires() {
    rCtx.save();
    circuit.wires.forEach(w => {
        if (w === interaction.selectedWire) { rCtx.strokeStyle = '#ff9800'; rCtx.lineWidth = 4.0; } 
        else if (w === interaction.hoveredWire) { rCtx.strokeStyle = '#ffeb3b'; rCtx.lineWidth = 3.5; } 
        else { rCtx.strokeStyle = COLORS.wireDefault; rCtx.lineWidth = 2.5; } 
        rCtx.beginPath(); rCtx.moveTo(w.points[0].x, w.points[0].y);
        for (let i = 1; i < w.points.length; i++) rCtx.lineTo(w.points[i].x, w.points[i].y);
        rCtx.stroke();
    });
    if (interaction.activeWire) {
        rCtx.strokeStyle = '#ffeb3b'; rCtx.lineWidth = 2.5; rCtx.setLineDash([4, 4]);
        rCtx.beginPath(); rCtx.moveTo(interaction.activeWire.points[0].x, interaction.activeWire.points[0].y);
        for (let i = 1; i < interaction.activeWire.points.length; i++) rCtx.lineTo(interaction.activeWire.points[i].x, interaction.activeWire.points[i].y);
        rCtx.stroke();
    }
    rCtx.restore();

    circuit.autoJunctions.forEach(aj => {
        rCtx.save(); const isHovered = interaction.hoverJonction && interaction.hoverJonction.id === aj.id;
        const isSelected = interaction.selectedAutoJunctions.includes(aj);
        if (isSelected) { rCtx.fillStyle = '#00bcd4'; rCtx.strokeStyle = COLORS.junctionStroke; rCtx.lineWidth = 2; } 
        else { rCtx.fillStyle = COLORS.wireDefault; rCtx.strokeStyle = COLORS.junctionStroke; rCtx.lineWidth = isHovered ? 2 : 1; }
        rCtx.beginPath(); rCtx.arc(aj.x, aj.y, (isHovered || isSelected) ? 6 : 4.5, 0, Math.PI * 2); rCtx.fill(); rCtx.restore();
    });
}

function drawGrid() {
    rCtx.strokeStyle = COLORS.grid; rCtx.lineWidth = 1 / scale.value;
    const startLeft = Math.floor(-pan.x / scale.value / GRID_SIZE) * GRID_SIZE;
    const startTop = Math.floor(-pan.y / scale.value / GRID_SIZE) * GRID_SIZE;
    const endRight = startLeft + rCanvas.width / scale.value + GRID_SIZE;
    const endBottom = startTop + rCanvas.height / scale.value + GRID_SIZE;
    rCtx.beginPath();
    for (let x = startLeft; x < endRight; x += GRID_SIZE) { rCtx.moveTo(x, startTop); rCtx.lineTo(x, endBottom); }
    for (let y = startTop; y < endBottom; y += GRID_SIZE) { rCtx.moveTo(startLeft, y); rCtx.lineTo(endRight, y); }
    rCtx.stroke();
}

export function captureSchematicForPrint() {
    if (!printFrame.enabled) return null;
    const inner = getPrintCaptureRect();
    const prevPan = { x: pan.x, y: pan.y };
    const prevScale = scale.value;
    const off = document.createElement('canvas');
    const pxW = 2800;
    off.width = pxW;
    off.height = Math.max(1, Math.round(pxW * (inner.height / inner.width)));
    const fit = off.width / inner.width;
    pan.x = -inner.x * fit;
    pan.y = -inner.y * fit;
    scale.value = fit;
    withRenderSurface({ ctx: off.getContext('2d'), canvas: off }, () => {
        draw({ skipPrintFrame: true });
    });
    pan.x = prevPan.x;
    pan.y = prevPan.y;
    scale.value = prevScale;
    draw();
    return off.toDataURL('image/png');
}

export function draw(opts = {}) {
    syncWireEndpointsToJonctions();
    rCtx.fillStyle = COLORS.canvasBg;
    rCtx.fillRect(0, 0, rCanvas.width, rCanvas.height);
    rCtx.save();
    rCtx.translate(pan.x, pan.y);
    rCtx.scale(scale.value, scale.value);
    if (showGrid) drawGrid();
    if (!opts.skipPrintFrame) drawPrintFrameOverlay();
    drawWires();
    circuit.components.forEach(comp => drawComponentBody(comp));
    if (flags.isSelectingZone) {
        rCtx.save(); rCtx.strokeStyle = 'rgba(0, 188, 212, 0.7)'; rCtx.fillStyle = 'rgba(0, 188, 212, 0.15)'; rCtx.lineWidth = 1.5; rCtx.setLineDash([4, 4]);
        rCtx.fillRect(zone.start.x, zone.start.y, zone.end.x - zone.start.x, zone.end.y - zone.start.y);
        rCtx.strokeRect(zone.start.x, zone.start.y, zone.end.x - zone.start.x, zone.end.y - zone.start.y); rCtx.restore();
    }
    if (flags.isDraggingFromMenu && menuDrag.draggedComponentType) {
        rCtx.globalAlpha = 0.5;
        const preview = {
            type: menuDrag.draggedComponentType,
            x: snapToGrid(menuDrag.x),
            y: snapToGrid(menuDrag.y),
            label: '',
            rotation: 0,
            state: 0,
            flipX: false,
        };
        if (preview.type === 'grove_lcd16x2') preview.i2cAddress = 0x3e;
        if (preview.type === 'joyit_tft18') preview.flipX = false;
        drawComponentBody(preview);
        rCtx.globalAlpha = 1.0;
    }
    rCtx.restore();
}