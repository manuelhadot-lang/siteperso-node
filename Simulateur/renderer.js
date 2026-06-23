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
    IC90_Q_STACK_INDICES,
} from './ic74hc90-layout.js';
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
import { getComponentJonctions, isJonctionConnected, getVoltageAtJonction } from './geometry.js';
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
    getHd44780Glyph,
    HD44780_CHAR_W,
    HD44780_CHAR_H,
    HD44780_NATIVE_W,
} from './hd44780-font.js';
import { getGfxGlyph } from './gfx-glcd-font.js';
import { getAnimatedHc90Bcd, getAnimatedLedCurrent, getAnimatedSeg7Segments, getAnimatedBargraphSegments, getAnimatedVoltmeterVoltage, getIdealSeg7Display, getIdealBargraphDisplay, getAnimatedGroveLcdDisplay, getAnimatedJoyitTft18Display, isLedOvercurrent, quantizeVoltmeterReading } from './led-animation.js';
import { isSpeakerAudioPlaying } from './speaker-audio.js';
import { COLORS } from './theme.js';
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
    ctx.save();
    if (angle) ctx.rotate(-angle * Math.PI / 180);
    fn();
    ctx.restore();
}

/** Texte horizontal à un point (x,y) du repère composant déjà pivoté. */
function drawUprightTextAt(angle, x, y, fn) {
    ctx.save();
    ctx.translate(x, y);
    if (angle) ctx.rotate(-angle * Math.PI / 180);
    fn();
    ctx.restore();
}

/** Décalage en repère composant (tourne avec le symbole), puis texte horizontal. */
function drawUprightTextAtLocal(angle, x, y, localOffX, localOffY, fn) {
    ctx.save();
    ctx.translate(x, y);
    ctx.translate(localOffX, localOffY);
    if (angle) ctx.rotate(-angle * Math.PI / 180);
    fn();
    ctx.restore();
}

function drawOutlinedText(text) {
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(8, 8, 12, 0.92)';
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(text, 0, 0);
}

function formatDisplayValue(val) {
    if (val == null || val === '') return '';
    return String(val).trim()
        .replace(/Kohm/gi, 'K')
        .replace(/Mohm/gi, 'M')
        .replace(/ohm/gi, '');
}

function drawLabels(name, value, angle) {
    const labelX = -38;
    const nameY = -36;
    drawUprightText(angle, () => {
        if (name) {
            ctx.fillStyle = COLORS.ink;
            ctx.font = '12px Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(name, labelX, nameY);
        }
        const display = formatDisplayValue(value);
        if (display) {
            ctx.fillStyle = COLORS.inkMuted;
            ctx.font = '11px Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(display, labelX, name ? nameY + 14 : nameY);
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
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#ff5252';
    ctx.fillText('+', wireEndX, wireY - 6);
}

function drawMeterBody(color = '#00bcd4', showPlus = true) {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.fillStyle = COLORS.meterFill;
    ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = color;
    ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-20, 0); ctx.moveTo(20, 0); ctx.lineTo(40, 0); ctx.stroke();
    if (showPlus) drawWirePlusLabel(40, 0);
}

function drawOscilloscopeScreen(comp) {
    const x0 = -42, y0 = -24, w = 84, h = 48;
    ctx.fillStyle = COLORS.scopeBg;
    ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = COLORS.scopeGrid;
    ctx.lineWidth = 1;
    const divW = w / 8;
    const divH = h / 8;
    for (let i = 1; i < 8; i++) {
        ctx.beginPath(); ctx.moveTo(x0 + i * divW, y0); ctx.lineTo(x0 + i * divW, y0 + h); ctx.stroke();
    }
    for (let j = 1; j < 8; j++) {
        ctx.beginPath(); ctx.moveTo(x0, y0 + j * divH); ctx.lineTo(x0 + w, y0 + j * divH); ctx.stroke();
    }
    ctx.fillStyle = COLORS.scopeLabel;
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Osci', 0, 0);
    ctx.strokeStyle = '#00bcd4';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y0, w, h);
    ctx.fillStyle = COLORS.ink;
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(comp.label, 0, y0 - 6);
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
    ctx.strokeStyle = COLORS.componentStroke;
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
    ctx.fillStyle = COLORS.ink;
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
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    if (outlined) drawOutlinedTextAt(text, x, y, { font, align, baseline });
    else {
        ctx.fillStyle = fill;
        ctx.fillText(text, x, y);
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

    ctx.strokeStyle = pinColor;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    for (let i = 0; i < DC10H_SEG_COUNT; i++) {
        ctx.beginPath();
        ctx.moveTo(juncX, pinYs[i]);
        ctx.lineTo(boxPinX, pinYs[i]);
        ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(comX, boxB);
    ctx.lineTo(comX, comY);
    ctx.stroke();

    ctx.strokeStyle = COLORS.componentStroke;
    ctx.lineWidth = 2;
    ctx.strokeRect(boxL, boxT, boxR - boxL, boxB - boxT);

    const barL = boxL + 6;
    const barR = boxR - 6;
    for (let i = 0; i < DC10H_SEG_COUNT; i++) {
        const segName = names[i];
        const y = dc10hBarTopY(i);
        ctx.fillStyle = segColor(segName);
        ctx.fillRect(barL, y, barR - barL, DC10H_BAR_H);
        if (lit.has(segName)) {
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fillRect(barL, y, barR - barL, DC10H_BAR_H * 0.35);
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

function drawOutlinedTextAt(text, x, y, { font, align, baseline }) {
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(8, 8, 12, 0.92)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(text, x, y);
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
    ctx.save();
    ctx.rotate(rotDeg * Math.PI / 180);
    fn();
    ctx.restore();
}

function clipScreenRect(scrL, scrT, scrW, scrH, flipX, fx) {
    ctx.beginPath();
    if (flipX) {
        const xa = fx(scrL);
        const xb = fx(scrL + scrW);
        ctx.rect(Math.min(xa, xb), scrT, Math.abs(scrW), scrH);
    } else {
        ctx.rect(scrL, scrT, scrW, scrH);
    }
    ctx.clip();
}

/** Pattes et labels — repère layout + miroir fx, aligné sur geometry (toute rotation). */
function drawLcdPinStubsAndLabels(pinNames, pinYArr, juncX, connX, flip, drawTextFx) {
    const fx = (x) => flip * x;
    ctx.strokeStyle = COLORS.strokeMuted;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    for (let i = 0; i < pinNames.length; i++) {
        const py = pinYArr[i];
        ctx.beginPath();
        ctx.moveTo(fx(juncX), py);
        ctx.lineTo(fx(connX), py);
        ctx.stroke();
    }
    const pinStep = pinYArr.length > 1 ? Math.abs(pinYArr[1] - pinYArr[0]) : GRID_SIZE;
    const labelGap = 3;
    const pinLabelFontSize = Math.min(9, Math.max(6, Math.floor(pinStep - labelGap - 2)));
    ctx.font = `bold ${pinLabelFontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = COLORS.ink;
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

    ctx.save();
    clipScreenRect(scrL, scrT, scrW, scrH, flipX, fx);
    ctx.fillStyle = fg;
    ctx.imageSmoothingEnabled = false;
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
                            ctx.fillRect(Math.min(xa, xb), y, Math.abs(pxW), pxH);
                        } else {
                            ctx.fillRect(x, y, pxW, pxH);
                        }
                    }
                }
            }
        }
    }
    ctx.restore();
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
        ctx.fillRect(Math.min(xa, xb), y, Math.abs(w), h);
    };
    const strokeRectFx = (x, y, w, h) => {
        const xa = fx(x);
        const xb = fx(x + w);
        ctx.strokeRect(Math.min(xa, xb), y, Math.abs(w), h);
    };
    const drawTextFx = (text, x, y) => {
        ctx.save();
        if (comp.flipX) {
            ctx.translate(fx(x), y);
            ctx.scale(-1, 1);
            ctx.fillText(text, 0, 0);
        } else {
            ctx.fillText(text, x, y);
        }
        ctx.restore();
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
    ctx.fillStyle = '#141414';
    fillRectFx(connL, boxT, GROVE_LCD_CONNECTOR_W, boxB - boxT);

    // Cadre noir
    ctx.fillStyle = '#1c1c1c';
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 2;
    fillRectFx(boxL, boxT, boxR - boxL, boxB - boxT);
    strokeRectFx(boxL, boxT, boxR - boxL, boxB - boxT);

    // Écran vert 16×2 (couleur rétroéclairage jaune-vert)
    const screenOn = flags.isSimulating
        && state.wired
        && state.backlight !== false
        && !state.blank;
    ctx.fillStyle = groveLcdBacklightFill(state, screenOn);
    ctx.save();
    clipScreenRect(scrL, scrT, scrW, scrH, comp.flipX, fx);
    fillRectFx(scrL, scrT, scrW, scrH);
    ctx.restore();

    const lines = state.lines || ['', ''];
    drawGroveLcdCharGrid(scrL, scrT, scrW, scrH, lines, screenOn, state, comp.flipX, fx);

    drawLcdPinStubsAndLabels(GROVE_LCD_PINS, GROVE_LCD_PIN_Y, GROVE_LCD_JUNC_X, connL, flip, drawTextFx);

    ctx.fillStyle = COLORS.ink;
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
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
                ctx.fillRect(x + c * size, y + r * size, size, size);
            }
        }
    }
}

function drawGfxString(text, x, y, size, fg) {
    ctx.fillStyle = fg;
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

    ctx.save();
    clipScreenRect(scrL, scrT, scrW, scrH, flipX, fx);
    ctx.fillStyle = bgColor;
    if (flipX) {
        const xa = fx(scrL);
        const xb = fx(scrL + scrW);
        ctx.fillRect(Math.min(xa, xb), scrT, Math.abs(scrW), scrH);
    } else {
        ctx.fillRect(scrL, scrT, scrW, scrH);
    }

    ctx.translate(fx(cx), cy);
    if (flipX) ctx.scale(-1, 1);
    ctx.rotate(rot * Math.PI / 2);
    ctx.scale(scaleX, scaleY);
    ctx.translate(-TFT_NATIVE_W / 2, -TFT_NATIVE_H / 2);

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
    ctx.restore();
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
        ctx.fillRect(Math.min(xa, xb), y, Math.abs(w), h);
    };
    const strokeRectFx = (x, y, w, h) => {
        const xa = fx(x);
        const xb = fx(x + w);
        ctx.strokeRect(Math.min(xa, xb), y, Math.abs(w), h);
    };
    const drawTextFx = (text, x, y) => {
        ctx.save();
        if (comp.flipX) {
            ctx.translate(fx(x), y);
            ctx.scale(-1, 1);
            ctx.fillText(text, 0, 0);
        } else {
            ctx.fillText(text, x, y);
        }
        ctx.restore();
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

    ctx.fillStyle = '#141414';
    fillRectFx(connL, boxT, TFT18_CONNECTOR_W, boxB - boxT);

    ctx.fillStyle = '#252525';
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 2;
    fillRectFx(boxL, boxT, boxR - boxL, boxB - boxT);
    strokeRectFx(boxL, boxT, boxR - boxL, boxB - boxT);

    const screenOn = flags.isSimulating && state.wired && !state.blank;
    drawJoyitTft18Content(scrL, scrT, scrW, scrH, state, screenOn, comp.flipX, fx);

    drawLcdPinStubsAndLabels(TFT18_PINS, TFT18_PIN_Y, TFT18_JUNC_X, connL, flip, drawTextFx);

    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    drawTextFx(comp.label, 0, boxB + 10);
    drawTextFx('TFT 1.8″', 0, boxT - 14);
}

function drawGroveDht22SensorGrid(sx, sy, sw, sh, fx) {
    const cols = 6;
    const rows = 3;
    const gap = 2;
    const cellW = (sw - gap * (cols - 1)) / cols;
    const cellH = (sh - gap * (rows - 1)) / rows;
    ctx.fillStyle = '#f4f4f0';
    ctx.strokeStyle = '#c8c8c0';
    ctx.lineWidth = 1;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const x = sx + c * (cellW + gap);
            const y = sy + r * (cellH + gap);
            const xa = fx(x);
            const xb = fx(x + cellW);
            ctx.fillRect(Math.min(xa, xb), y, Math.abs(cellW), cellH);
            ctx.strokeRect(Math.min(xa, xb), y, Math.abs(cellW), cellH);
            const hx = x + cellW * 0.22;
            const hy = y + cellH * 0.22;
            const hw = cellW * 0.56;
            const hh = cellH * 0.56;
            ctx.fillStyle = '#d8d8d0';
            const hxa = fx(hx);
            const hxb = fx(hx + hw);
            ctx.fillRect(Math.min(hxa, hxb), hy, Math.abs(hw), hh);
            ctx.fillStyle = '#f4f4f0';
        }
    }
}

function drawGroveDht22(comp) {
    const flip = comp.flipX ? -1 : 1;
    const fx = (x) => flip * x;
    const fillRectFx = (x, y, w, h) => {
        const xa = fx(x);
        const xb = fx(x + w);
        ctx.fillRect(Math.min(xa, xb), y, Math.abs(w), h);
    };
    const strokeRectFx = (x, y, w, h) => {
        const xa = fx(x);
        const xb = fx(x + w);
        ctx.strokeRect(Math.min(xa, xb), y, Math.abs(w), h);
    };
    const drawTextFx = (text, x, y) => {
        ctx.save();
        if (comp.flipX) {
            ctx.translate(fx(x), y);
            ctx.scale(-1, 1);
            ctx.fillText(text, 0, 0);
        } else {
            ctx.fillText(text, x, y);
        }
        ctx.restore();
    };

    const boxL = GROVE_DHT22_BOX_L;
    const boxR = GROVE_DHT22_BOX_R;
    const boxT = GROVE_DHT22_BOX_T;
    const boxB = GROVE_DHT22_BOX_B;
    const connL = GROVE_DHT22_CONN_L;

    ctx.fillStyle = '#141414';
    fillRectFx(connL, boxT, GROVE_DHT22_CONNECTOR_W, boxB - boxT);

    ctx.fillStyle = '#1a3d7a';
    ctx.strokeStyle = '#0f2448';
    ctx.lineWidth = 2;
    fillRectFx(boxL, boxT, boxR - boxL, boxB - boxT);
    strokeRectFx(boxL, boxT, boxR - boxL, boxB - boxT);

    const sx = GROVE_DHT22_SENSOR_L;
    const sy = GROVE_DHT22_SENSOR_T;
    const sw = GROVE_DHT22_SENSOR_R - GROVE_DHT22_SENSOR_L;
    const sh = GROVE_DHT22_SENSOR_B - GROVE_DHT22_SENSOR_T;
    drawGroveDht22SensorGrid(sx, sy, sw, sh, fx);

    ctx.strokeStyle = COLORS.strokeMuted;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    for (let i = 0; i < GROVE_DHT22_PINS.length; i++) {
        const py = GROVE_DHT22_PIN_Y[i];
        ctx.beginPath();
        ctx.moveTo(fx(GROVE_DHT22_JUNC_X), py);
        ctx.lineTo(fx(connL), py);
        ctx.stroke();
    }

    const pinStep = GROVE_DHT22_PIN_Y.length > 1
        ? GROVE_DHT22_PIN_Y[1] - GROVE_DHT22_PIN_Y[0]
        : 14;
    const labelGap = 3;
    const pinLabelFontSize = Math.min(8, Math.max(6, Math.floor(pinStep - labelGap - 2)));
    ctx.font = `bold ${pinLabelFontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = COLORS.ink;
    for (let i = 0; i < GROVE_DHT22_PINS.length; i++) {
        const py = GROVE_DHT22_PIN_Y[i];
        drawTextFx(GROVE_DHT22_PINS[i], GROVE_DHT22_PIN_LABEL_X, py - labelGap);
    }

    ctx.fillStyle = COLORS.ink;
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    drawTextFx('DHT22', 0, boxT - 12);
    drawTextFx(comp.label, 0, boxB + 8);
}

function drawGroveTsl2591(comp) {
    const flip = comp.flipX ? -1 : 1;
    const fx = (x) => flip * x;
    const fillRectFx = (x, y, w, h) => {
        const xa = fx(x);
        const xb = fx(x + w);
        ctx.fillRect(Math.min(xa, xb), y, Math.abs(w), h);
    };
    const strokeRectFx = (x, y, w, h) => {
        const xa = fx(x);
        const xb = fx(x + w);
        ctx.strokeRect(Math.min(xa, xb), y, Math.abs(w), h);
    };
    const drawTextFx = (text, x, y) => {
        ctx.save();
        if (comp.flipX) {
            ctx.translate(fx(x), y);
            ctx.scale(-1, 1);
            ctx.fillText(text, 0, 0);
        } else {
            ctx.fillText(text, x, y);
        }
        ctx.restore();
    };

    const boxL = GROVE_TSL2591_BOX_L;
    const boxR = GROVE_TSL2591_BOX_R;
    const boxT = GROVE_TSL2591_BOX_T;
    const boxB = GROVE_TSL2591_BOX_B;
    const connL = GROVE_TSL2591_CONN_L;

    ctx.fillStyle = '#141414';
    fillRectFx(connL, boxT, GROVE_TSL2591_CONNECTOR_W, boxB - boxT);

    ctx.fillStyle = '#2a1a4a';
    ctx.strokeStyle = '#1a1030';
    ctx.lineWidth = 2;
    fillRectFx(boxL, boxT, boxR - boxL, boxB - boxT);
    strokeRectFx(boxL, boxT, boxR - boxL, boxB - boxT);

    const sx = GROVE_TSL2591_SENSOR_L;
    const sy = GROVE_TSL2591_SENSOR_T;
    const sw = GROVE_TSL2591_SENSOR_R - GROVE_TSL2591_SENSOR_L;
    const sh = GROVE_TSL2591_SENSOR_B - GROVE_TSL2591_SENSOR_T;
    ctx.fillStyle = '#1a1028';
    fillRectFx(sx, sy, sw, sh);
    strokeRectFx(sx, sy, sw, sh);
    ctx.strokeStyle = '#ffd54f';
    ctx.lineWidth = 1.5;
    const cx = sx + sw / 2;
    const cy = sy + sh / 2;
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(fx(cx), cy);
        ctx.lineTo(fx(cx + Math.cos(a) * sw * 0.42), cy + Math.sin(a) * sh * 0.42);
        ctx.stroke();
    }
    ctx.fillStyle = '#ffd54f';
    ctx.beginPath();
    ctx.arc(fx(cx), cy, Math.min(sw, sh) * 0.14, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = COLORS.strokeMuted;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    for (let i = 0; i < GROVE_TSL2591_PINS.length; i++) {
        const py = GROVE_TSL2591_PIN_Y[i];
        ctx.beginPath();
        ctx.moveTo(fx(GROVE_TSL2591_JUNC_X), py);
        ctx.lineTo(fx(connL), py);
        ctx.stroke();
    }

    const pinStep = GROVE_TSL2591_PIN_Y.length > 1
        ? GROVE_TSL2591_PIN_Y[1] - GROVE_TSL2591_PIN_Y[0]
        : 14;
    const labelGap = 3;
    const pinLabelFontSize = Math.min(8, Math.max(6, Math.floor(pinStep - labelGap - 2)));
    ctx.font = `bold ${pinLabelFontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = COLORS.ink;
    for (let i = 0; i < GROVE_TSL2591_PINS.length; i++) {
        const py = GROVE_TSL2591_PIN_Y[i];
        drawTextFx(GROVE_TSL2591_PINS[i], GROVE_TSL2591_PIN_LABEL_X, py - labelGap);
    }

    const lux = Number.isFinite(comp.lux) ? comp.lux : 100;
    const luxText = `${Math.round(lux * 10) / 10} lx`;
    ctx.fillStyle = COLORS.ink;
    ctx.font = '9px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    drawTextFx(luxText, 0, (boxT + boxB) / 2 + 1);

    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    drawTextFx('TSL2591', 0, boxT - 12);
    drawTextFx(comp.label, 0, boxB + 8);
}

function drawGroveBmp280(comp) {
    const flip = comp.flipX ? -1 : 1;
    const fx = (x) => flip * x;
    const fillRectFx = (x, y, w, h) => ctx.fillRect(fx(x) - (flip < 0 ? w : 0), y, w, h);
    const strokeRectFx = (x, y, w, h) => ctx.strokeRect(fx(x) - (flip < 0 ? w : 0), y, w, h);
    const drawTextFx = (text, x, y) => {
        ctx.save();
        if (comp.flipX) {
            ctx.translate(fx(x), y);
            ctx.scale(-1, 1);
            ctx.fillText(text, 0, 0);
        } else {
            ctx.fillText(text, x, y);
        }
        ctx.restore();
    };

    const boxL = GROVE_BMP280_BOX_L;
    const boxR = GROVE_BMP280_BOX_R;
    const boxT = GROVE_BMP280_BOX_T;
    const boxB = GROVE_BMP280_BOX_B;
    const connL = GROVE_BMP280_CONN_L;

    ctx.fillStyle = '#141414';
    fillRectFx(connL, boxT, GROVE_BMP280_CONNECTOR_W, boxB - boxT);

    ctx.fillStyle = '#1a2a4a';
    ctx.strokeStyle = '#102040';
    ctx.lineWidth = 2;
    fillRectFx(boxL, boxT, boxR - boxL, boxB - boxT);
    strokeRectFx(boxL, boxT, boxR - boxL, boxB - boxT);

    const sx = GROVE_BMP280_SENSOR_L;
    const sy = GROVE_BMP280_SENSOR_T;
    const sw = GROVE_BMP280_SENSOR_R - GROVE_BMP280_SENSOR_L;
    const sh = GROVE_BMP280_SENSOR_B - GROVE_BMP280_SENSOR_T;
    ctx.fillStyle = '#0d1a30';
    fillRectFx(sx, sy, sw, sh);
    strokeRectFx(sx, sy, sw, sh);
    ctx.strokeStyle = '#64b5f6';
    ctx.lineWidth = 1.5;
    const cx = sx + sw / 2;
    const cy = sy + sh / 2;
    const r = Math.min(sw, sh) * 0.38;
    ctx.beginPath();
    ctx.arc(fx(cx), cy, r, Math.PI * 0.75, Math.PI * 0.25);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(fx(cx), cy);
    ctx.lineTo(fx(cx + r * 0.55), cy - r * 0.35);
    ctx.stroke();

    ctx.strokeStyle = COLORS.strokeMuted;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    for (let i = 0; i < GROVE_BMP280_PINS.length; i++) {
        const py = GROVE_BMP280_PIN_Y[i];
        ctx.beginPath();
        ctx.moveTo(fx(GROVE_BMP280_JUNC_X), py);
        ctx.lineTo(fx(connL), py);
        ctx.stroke();
    }

    const pinStep = GROVE_BMP280_PIN_Y.length > 1
        ? GROVE_BMP280_PIN_Y[1] - GROVE_BMP280_PIN_Y[0]
        : 14;
    const labelGap = 3;
    const pinLabelFontSize = Math.min(8, Math.max(6, Math.floor(pinStep - labelGap - 2)));
    ctx.font = `bold ${pinLabelFontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = COLORS.ink;
    for (let i = 0; i < GROVE_BMP280_PINS.length; i++) {
        const py = GROVE_BMP280_PIN_Y[i];
        drawTextFx(GROVE_BMP280_PINS[i], GROVE_BMP280_PIN_LABEL_X, py - labelGap);
    }

    const pressureHpa = Number.isFinite(comp.pressureHpa) ? comp.pressureHpa : 1013.25;
    const tempC = Number.isFinite(comp.temperature) ? comp.temperature : 22;
    const pressText = `${Math.round(pressureHpa * 10) / 10} hPa`;
    ctx.fillStyle = COLORS.ink;
    ctx.font = '8px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    drawTextFx(pressText, 0, (boxT + boxB) / 2 - 2);
    ctx.font = '7px Arial';
    drawTextFx(`${Math.round(tempC * 10) / 10}°C`, 0, (boxT + boxB) / 2 + 8);

    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
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

    ctx.strokeStyle = '#00ca71';
    ctx.lineWidth = 2;
    ctx.fillStyle = COLORS.componentFill;

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
        ctx.fillStyle = COLORS.componentFill;
        ctx.fill();
    }

    ctx.fillStyle = COLORS.inkMuted;
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
    ctx.fillStyle = COLORS.meterDisplayBg;
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
    ctx.strokeStyle = COLORS.ledSmoke;
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
    ctx.fillStyle = COLORS.ink;
    ctx.font = '10px Arial';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.fillText('S', -10, (setJuncY + boxTopY) / 2);
    ctx.fillText('R', -10, (resetJuncY + boxBottomY) / 2);
}

function drawComponentBody(comp) {
    ctx.save(); ctx.translate(comp.x, comp.y);
    const noRotate = comp.type === 'gimp' || comp.type === 'gsin' || comp.type === 'gsqr' || comp.type === 'oscilloscope' || comp.type === 'd_flipflop' || comp.type === 'jk_flipflop' || comp.type === 'cd4511' || comp.type === 'ic_74hc90' || comp.type === 'arduino_uno' || comp.type === 'esp32_c3' || comp.type === 'npn' || comp.type === 'opamp' || comp.type === 'seg7' || comp.type === 'bargraph_dc10h' || comp.type === 'grove_lcd16x2' || comp.type === 'grove_dht22' || comp.type === 'grove_tsl2591' || comp.type === 'grove_bmp280' || comp.type === 'joyit_tft18';
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
        else if (comp.type === 'bargraph_dc10h') {
            ctx.strokeRect(DC10H_SEL_L, DC10H_SEL_T, DC10H_SEL_W, DC10H_SEL_H);
        }
        else if (comp.type === 'grove_lcd16x2') {
            ctx.save();
            if (comp.rotation) ctx.rotate((comp.rotation || 0) * Math.PI / 180);
            const flip = comp.flipX ? -1 : 1;
            const fx = (x) => flip * x;
            const selL = Math.min(fx(GROVE_LCD_SEL_L), fx(GROVE_LCD_SEL_L + GROVE_LCD_SEL_W));
            ctx.strokeRect(selL, GROVE_LCD_SEL_T, GROVE_LCD_SEL_W, GROVE_LCD_SEL_H);
            ctx.restore();
        }
        else if (comp.type === 'joyit_tft18') {
            ctx.save();
            if (comp.rotation) ctx.rotate((comp.rotation || 0) * Math.PI / 180);
            const flip = comp.flipX ? -1 : 1;
            const fx = (x) => flip * x;
            const selL = Math.min(fx(TFT18_SEL_L), fx(TFT18_SEL_L + TFT18_SEL_W));
            ctx.strokeRect(selL, TFT18_SEL_T, TFT18_SEL_W, TFT18_SEL_H);
            ctx.restore();
        }
        else if (comp.type === 'grove_dht22') {
            const flip = comp.flipX ? -1 : 1;
            const fx = (x) => flip * x;
            const selL = Math.min(fx(GROVE_DHT22_SEL_L), fx(GROVE_DHT22_SEL_L + GROVE_DHT22_SEL_W));
            ctx.strokeRect(selL, GROVE_DHT22_SEL_T, GROVE_DHT22_SEL_W, GROVE_DHT22_SEL_H);
        }
        else if (comp.type === 'grove_tsl2591') {
            const flip = comp.flipX ? -1 : 1;
            const fx = (x) => flip * x;
            const selL = Math.min(fx(GROVE_TSL2591_SEL_L), fx(GROVE_TSL2591_SEL_L + GROVE_TSL2591_SEL_W));
            ctx.strokeRect(selL, GROVE_TSL2591_SEL_T, GROVE_TSL2591_SEL_W, GROVE_TSL2591_SEL_H);
        }
        else if (comp.type === 'grove_bmp280') {
            const flip = comp.flipX ? -1 : 1;
            const fx = (x) => flip * x;
            const selL = Math.min(fx(GROVE_BMP280_SEL_L), fx(GROVE_BMP280_SEL_L + GROVE_BMP280_SEL_W));
            ctx.strokeRect(selL, GROVE_BMP280_SEL_T, GROVE_BMP280_SEL_W, GROVE_BMP280_SEL_H);
        }
        else if (comp.type === 'logic_terminal') ctx.strokeRect(-14, -10, 24, 20);
        else if (comp.type !== 'logic_terminal') ctx.strokeRect(-45, -25, 90, 50);
    }

    const railLead = GRID_SIZE;
    if (comp.type === 'gnd') {
        ctx.strokeStyle = COLORS.inkDim; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(railLead, 0);
        ctx.moveTo(-12, -10); ctx.lineTo(-12, 10);
        ctx.moveTo(-17, -6); ctx.lineTo(-17, 6);
        ctx.moveTo(-22, -3); ctx.lineTo(-22, 3);
        ctx.stroke(); drawLabels(comp.label, "0V", rot);
    }
    else if (comp.type === 'vcc') {
        ctx.strokeStyle = '#ff3d00'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(railLead, 0);
        ctx.moveTo(-12, 0); ctx.lineTo(-4, -7); ctx.lineTo(-4, 7); ctx.closePath(); ctx.fillStyle = '#ff3d00'; ctx.fill();
        ctx.stroke();
        let val = comp.value !== undefined ? comp.value + "V" : "5V";
        drawLabels(comp.label, val, rot);
    }
    else if (comp.type === 'logic_terminal') {
        if (interaction.selectedComponents.includes(comp)) {
            ctx.strokeStyle = '#00bcd4'; ctx.lineWidth = 1.5;
            ctx.strokeRect(-14, -10, 24, 20);
        }
        ctx.strokeStyle = '#9c27b0'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(railLead, 0);
        ctx.stroke();
        ctx.fillStyle = COLORS.componentFill; ctx.fillRect(-12, -8, 20, 16); ctx.strokeRect(-12, -8, 20, 16);
        let state = comp.state || 0;
        ctx.fillStyle = state === 1 ? '#00e676' : '#ff1744';
        ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(state, -2, 0);
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
        ctx.strokeStyle = '#007acc'; ctx.lineWidth = 2; ctx.fillStyle = COLORS.componentFill;
        ctx.fillRect(-20, -10, 40, 20); ctx.strokeRect(-20, -10, 40, 20);
        ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-20, 0); ctx.moveTo(20, 0); ctx.lineTo(40, 0); ctx.stroke();
        drawLabels(comp.label, comp.value || '1K', rot);
    }
    else if (comp.type === 'potentiometer') {
        const pos = Math.min(100, Math.max(0, comp.position ?? 50));
        const wx = -20 + (pos / 100) * 40;
        ctx.strokeStyle = '#007acc'; ctx.lineWidth = 2; ctx.fillStyle = COLORS.componentFill;
        ctx.fillRect(-20, -10, 40, 20); ctx.strokeRect(-20, -10, 40, 20);
        ctx.beginPath();
        ctx.moveTo(-40, 0); ctx.lineTo(-20, 0);
        ctx.moveTo(20, 0); ctx.lineTo(40, 0);
        ctx.moveTo(wx, -10); ctx.lineTo(wx, -22);
        ctx.moveTo(0, -22); ctx.lineTo(wx, -22);
        ctx.stroke();
        ctx.fillStyle = '#ff9800';
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('◀', -9, 18);
        ctx.fillText('▶', 9, 18);
        const potValue = `${formatDisplayValue(comp.value || '10k')} (${Math.round(pos)}%)`;
        drawLabels(comp.label, potValue, rot);
    }
    else if (comp.type === 'switch_spdt') {
        const onA = (comp.state ?? 0) !== 1;
        ctx.strokeStyle = COLORS.componentStroke; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-40, -18); ctx.lineTo(-14, -18);
        ctx.moveTo(-40, 0); ctx.lineTo(-14, 0);
        ctx.moveTo(-40, 18); ctx.lineTo(-14, 18);
        ctx.stroke();
        ctx.fillStyle = COLORS.componentFill;
        ctx.fillRect(-12, -18, 24, 36);
        ctx.strokeStyle = COLORS.componentStroke;
        ctx.strokeRect(-12, -18, 24, 36);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        if (onA) ctx.lineTo(0, -14);
        else ctx.lineTo(0, 14);
        ctx.stroke();
        ctx.fillStyle = COLORS.inkDim;
        ctx.font = '9px Arial';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText('COM', -44, 0);
        ctx.fillText('B', -44, 18);
        drawLabels(comp.label, null, rot);
    }
    else if (comp.type === 'push_button') {
        const pressed = (comp.state ?? 0) === 1;
        ctx.strokeStyle = COLORS.componentStroke; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-40, 0); ctx.lineTo(-16, 0);
        ctx.moveTo(16, 0); ctx.lineTo(40, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(-16, 0, 3, 0, Math.PI * 2);
        ctx.moveTo(16, 0);
        ctx.arc(16, 0, 3, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.componentStroke;
        ctx.fill();
        const barY = pressed ? -3 : -9;
        ctx.strokeStyle = COLORS.componentStroke; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-16, barY); ctx.lineTo(16, barY);
        ctx.moveTo(0, barY); ctx.lineTo(0, barY - 8);
        ctx.stroke();
        ctx.fillStyle = pressed ? '#ef5350' : COLORS.componentFill;
        ctx.strokeStyle = COLORS.componentStroke; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.rect(-12, barY - 16, 24, 8);
        ctx.fill();
        ctx.stroke();
        if (comp.maintained) {
            ctx.fillStyle = COLORS.inkDim;
            ctx.font = '9px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText('M', 0, barY - 18);
        }
        drawLabels(comp.label, pressed ? 'ON' : 'OFF', rot);
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
        ctx.strokeStyle = '#ef5350'; ctx.lineWidth = 2; ctx.fillStyle = COLORS.componentFill;
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
        ctx.strokeStyle = COLORS.strokeLight;
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
        ctx.fillStyle = COLORS.inkMuted; ctx.font = '11px Arial'; ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText('b', fx(-34), -10);
        ctx.fillText('c', fx(4), -32);
        ctx.fillText('e', fx(4), 32);
        ctx.fillStyle = COLORS.ink; ctx.font = '12px Arial';
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
        ctx.fillStyle = COLORS.opampFill;
        ctx.strokeStyle = COLORS.strokeMuted;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(tLeft, tTop); ctx.lineTo(tLeft, tBot); ctx.lineTo(tApex, 0); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.strokeStyle = COLORS.strokeLight; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-40, -inY); ctx.lineTo(tLeft, -inY);
        ctx.moveTo(-40, inY); ctx.lineTo(tLeft, inY);
        ctx.moveTo(tApex, 0); ctx.lineTo(40, 0);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = COLORS.ink; ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('+', fx(-8), fy(-inY));
        ctx.fillText('−', fx(-8), fy(inY));
        ctx.fillStyle = COLORS.ink; ctx.font = '12px Arial';
        ctx.fillText(comp.label, fx(8), fy(-38));
        ctx.fillStyle = COLORS.inkMuted;
        ctx.fillText(comp.value || 'uA741', fx(8), fy(42));
    }
    else if (['not', 'and', 'nand', 'or', 'nor', 'xor', 'xnor'].includes(comp.type)) {
        drawLogicGateSymbol(comp.type);
        drawLabels(comp.label, null, rot);
    }
    else if (comp.type === 'd_flipflop') {
        ctx.strokeStyle = '#00bcd4'; ctx.lineWidth = 2; ctx.fillStyle = COLORS.componentFill;
        ctx.fillRect(-30, -30, 60, 60); ctx.strokeRect(-30, -30, 60, 60);
        ctx.beginPath();
        ctx.moveTo(-40, -20); ctx.lineTo(-30, -20);   // D
        ctx.moveTo(-40, 20); ctx.lineTo(-30, 20);     // CLK
        ctx.moveTo(30, -20); ctx.lineTo(40, -20);     // Q
        ctx.moveTo(30, 20); ctx.lineTo(40, 20);       // /Q
        ctx.stroke();
        drawFlipFlopSetReset(ctx, -30, 30);
        ctx.fillStyle = COLORS.ink; ctx.font = '10px Arial'; ctx.textBaseline = 'middle';
        ctx.textAlign = 'left'; ctx.fillText('D', -27, -20); ctx.fillText('>', -27, 20);
        ctx.textAlign = 'right'; ctx.fillText('Q', 27, -20); ctx.fillText('Q', 27, 20);
        ctx.beginPath(); ctx.moveTo(20, 13); ctx.lineTo(27, 13); ctx.stroke();
        ctx.font = '12px Arial'; ctx.fillStyle = COLORS.ink; ctx.fillText(comp.label, 0, -62);
    }
    else if (comp.type === 'jk_flipflop') {
        ctx.strokeStyle = '#ff9800'; ctx.lineWidth = 2; ctx.fillStyle = COLORS.componentFill;
        ctx.fillRect(-30, -35, 60, 70); ctx.strokeRect(-30, -35, 60, 70);
        ctx.beginPath();
        ctx.moveTo(-40, -20); ctx.lineTo(-30, -20);   // J
        ctx.moveTo(-40, 0); ctx.lineTo(-30, 0);       // CLK
        ctx.moveTo(-40, 20); ctx.lineTo(-30, 20);     // K
        ctx.moveTo(30, -20); ctx.lineTo(40, -20);     // Q
        ctx.moveTo(30, 20); ctx.lineTo(40, 20);       // /Q
        ctx.stroke();
        drawFlipFlopSetReset(ctx, -35, 35);
        ctx.fillStyle = COLORS.ink; ctx.font = '10px Arial'; ctx.textBaseline = 'middle';
        ctx.textAlign = 'left'; ctx.fillText('J', -27, -20); ctx.fillText('>', -27, 0); ctx.fillText('K', -27, 20);
        ctx.textAlign = 'right'; ctx.fillText('Q', 27, -20); ctx.fillText('Q', 27, 20);
        ctx.beginPath(); ctx.moveTo(20, 13); ctx.lineTo(27, 13); ctx.stroke();
        ctx.font = '12px Arial'; ctx.fillStyle = COLORS.ink; ctx.fillText(comp.label, 0, -64);
    }
    else if (comp.type === 'cd4511') {
        const inLbl = ['A', 'B', 'C', 'D', 'LE', 'BI', 'LT'];
        const outLbl = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
        ctx.strokeStyle = '#ab47bc'; ctx.lineWidth = 2; ctx.fillStyle = COLORS.componentFill;
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
        ctx.fillStyle = COLORS.ink; ctx.font = 'bold 9px Arial'; ctx.textBaseline = 'middle';
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
        const rightLbl = ['Q0', 'Q1', 'Q2', 'Q3', '', 'GND', 'CP0'];
        ctx.strokeStyle = '#26a69a'; ctx.lineWidth = 2; ctx.fillStyle = COLORS.componentFill;
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
        ctx.fillStyle = COLORS.ink; ctx.font = '8px Arial'; ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        leftLbl.forEach((t, i) => { if (t) ctx.fillText(t, IC90_LABEL_L, IC90_LEFT_PIN_Y[i]); });
        ctx.textAlign = 'right';
        rightLbl.forEach((t, i) => { if (t) ctx.fillText(t, IC90_LABEL_R, IC90_RIGHT_PIN_Y[i]); });
        ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center';
        ctx.fillText('74HC90', 0, -4);
        ctx.font = '8px Arial';
        ctx.fillText('décade', 0, 6);
        const count = hc90SimCount(comp);
        if (count != null) {
            ctx.fillStyle = '#76ff03';
            ctx.font = 'bold 13px Arial';
            ctx.fillText(String(count), 0, 20);
            const qPins = IC90_Q_STACK_INDICES.map((qi) => ({
                qi,
                y: IC90_RIGHT_PIN_Y[qi],
            }));
            qPins.forEach(({ qi, y }) => {
                const on = (count >> qi) & 1;
                ctx.beginPath();
                ctx.fillStyle = on ? '#76ff03' : '#455a64';
                ctx.arc(IC90_JUNC_R - 8, y, 4, 0, Math.PI * 2);
                ctx.fill();
            });
        }
        ctx.fillStyle = COLORS.ink;
        ctx.font = '11px Arial';
        ctx.fillText(comp.label, 0, IC90_BOX_T - 12);
    }
    else if (comp.type === 'arduino_uno') {
        ctx.fillStyle = '#00979d';
        ctx.strokeStyle = '#006064';
        ctx.lineWidth = 2;
        ctx.fillRect(UNO_BOX_L, UNO_BOX_T, UNO_BOX_R - UNO_BOX_L, UNO_BOX_B - UNO_BOX_T);
        ctx.strokeRect(UNO_BOX_L, UNO_BOX_T, UNO_BOX_R - UNO_BOX_L, UNO_BOX_B - UNO_BOX_T);
        ctx.beginPath();
        UNO_LEFT_PIN_Y.forEach((y) => {
            ctx.moveTo(UNO_JUNC_L, y);
            ctx.lineTo(UNO_BOX_L, y);
        });
        UNO_RIGHT_PIN_Y.forEach((y) => {
            ctx.moveTo(UNO_BOX_R, y);
            ctx.lineTo(UNO_JUNC_R, y);
        });
        ctx.strokeStyle = '#004d40';
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = '6px Arial';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        UNO_LEFT_PINS.forEach((t, i) => ctx.fillText(formatUnoPinLabel(t), UNO_LABEL_L, UNO_LEFT_PIN_Y[i]));
        ctx.textAlign = 'right';
        UNO_RIGHT_PINS.forEach((t, i) => ctx.fillText(formatUnoPinLabel(t), UNO_LABEL_R, UNO_RIGHT_PIN_Y[i]));
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('UNO', 0, 0);
        ctx.font = '8px Arial';
        ctx.fillText('ATmega328P', 0, 12);
        if (flags.isSimulating && comp.label) {
            UNO_DIGITAL_PINS.forEach((pinName) => {
                const lv = simulationResults.logicValues?.[`${comp.label}_${pinName}`]
                    ?? simulationResults.logicValues?.[`${comp.label}/${pinName}`];
                if (!lv) return;
                const idx = UNO_RIGHT_PINS.indexOf(pinName);
                if (idx < 0) return;
                const y = UNO_RIGHT_PIN_Y[idx];
                ctx.beginPath();
                ctx.fillStyle = lv.logic === 1 ? '#76ff03' : '#455a64';
                ctx.arc(UNO_JUNC_R - 8, y, 3, 0, Math.PI * 2);
                ctx.fill();
            });
        }
        if (comp.lastCompileOk === true) {
            ctx.fillStyle = '#76ff03';
            ctx.font = '7px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('✓ compile', UNO_BOX_L + 4, UNO_BOX_B - 6);
        } else if (comp.lastCompileOk === false) {
            ctx.fillStyle = '#ff5252';
            ctx.font = '7px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('✗ compile', UNO_BOX_L + 4, UNO_BOX_B - 6);
        }
        ctx.fillStyle = COLORS.ink;
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(comp.label, 0, UNO_BOX_T - 12);
    }
    else if (comp.type === 'esp32_c3') {
        ctx.fillStyle = '#512da8';
        ctx.strokeStyle = '#311b92';
        ctx.lineWidth = 2;
        ctx.fillRect(ESP32_BOX_L, ESP32_BOX_T, ESP32_BOX_R - ESP32_BOX_L, ESP32_BOX_B - ESP32_BOX_T);
        ctx.strokeRect(ESP32_BOX_L, ESP32_BOX_T, ESP32_BOX_R - ESP32_BOX_L, ESP32_BOX_B - ESP32_BOX_T);
        ctx.beginPath();
        ESP32_LEFT_PIN_Y.forEach((y) => {
            ctx.moveTo(ESP32_JUNC_L, y);
            ctx.lineTo(ESP32_BOX_L, y);
        });
        ESP32_RIGHT_PIN_Y.forEach((y) => {
            ctx.moveTo(ESP32_BOX_R, y);
            ctx.lineTo(ESP32_JUNC_R, y);
        });
        ctx.strokeStyle = '#1a237e';
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = '6px Arial';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ESP32_LEFT_PINS.forEach((t, i) => ctx.fillText(formatEsp32PinLabel(t), ESP32_LABEL_L, ESP32_LEFT_PIN_Y[i]));
        ctx.textAlign = 'right';
        ESP32_RIGHT_PINS.forEach((t, i) => ctx.fillText(formatEsp32PinLabel(t), ESP32_LABEL_R, ESP32_RIGHT_PIN_Y[i]));
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('ESP32-C3', 0, -2);
        ctx.font = '8px Arial';
        ctx.fillText('RISC-V', 0, 10);
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
                ctx.beginPath();
                ctx.fillStyle = lv.logic === 1 ? '#76ff03' : '#455a64';
                ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fill();
            });
        }
        if (comp.lastCompileOk === true) {
            ctx.fillStyle = '#76ff03';
            ctx.font = '7px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('✓ compile', ESP32_BOX_L + 4, ESP32_BOX_B - 6);
        } else if (comp.lastCompileOk === false) {
            ctx.fillStyle = '#ff5252';
            ctx.font = '7px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('✗ compile', ESP32_BOX_L + 4, ESP32_BOX_B - 6);
        }
        ctx.fillStyle = COLORS.ink;
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(comp.label, 0, ESP32_BOX_T - 12);
    }
    else if (comp.type === 'seg7') {
        drawSeg7Display(comp);
    }
    else if (comp.type === 'bargraph_dc10h') {
        drawBargraphDc10h(comp);
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
        drawLabels(comp.label, isBurnt ? 'GRILLÉE' : null, rot);
    }
    else if (comp.type === 'gimp') {
        ctx.save();
        if (comp.flipX) ctx.scale(-1, 1);
        ctx.strokeStyle = '#ab47bc'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(8, 0); ctx.lineTo(40, 0);
        ctx.moveTo(0, 18); ctx.lineTo(0, 40);
        ctx.stroke();
        ctx.fillStyle = COLORS.componentFill; ctx.fillRect(-18, -18, 26, 36); ctx.strokeRect(-18, -18, 26, 36);
        ctx.fillStyle = '#ce93d8'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('G', -5, 0);
        ctx.restore();
        drawLabels(comp.label, null, 0);
    }
    else if (comp.type === 'gsin') {
        ctx.strokeStyle = '#26c6da'; ctx.lineWidth = 2; ctx.fillStyle = COLORS.componentFill;
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
        ctx.strokeStyle = '#29b6f6'; ctx.lineWidth = 2; ctx.fillStyle = COLORS.componentFill;
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
        ctx.strokeStyle = playing ? '#ffeb3b' : '#ab47bc';
        ctx.lineWidth = 2;
        ctx.fillStyle = '#2a3b4c';
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = playing ? '#ffeb3b' : '#ab47bc';
        ctx.beginPath();
        ctx.moveTo(-40, 0);
        ctx.lineTo(-20, 0);
        ctx.moveTo(20, 0);
        ctx.lineTo(40, 0);
        ctx.stroke();
        if (playing) {
            ctx.strokeStyle = '#ffeb3b';
            ctx.lineWidth = 1.5;
            for (let i = 0; i < 3; i++) {
                const r = 10 + i * 5;
                ctx.beginPath();
                ctx.arc(22, 0, r, -Math.PI / 4, Math.PI / 4);
                ctx.stroke();
            }
        }
        drawWirePlusLabel(40, 0);
        const z = comp.value ? `${comp.value}Ω` : '8Ω';
        drawMeterDisplay(playing ? '♪' : 'HP', playing ? '' : z, rot);
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
        else { ctx.strokeStyle = COLORS.wireDefault; ctx.lineWidth = 2.5; } 
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
        if (isSelected) { ctx.fillStyle = '#00bcd4'; ctx.strokeStyle = COLORS.junctionStroke; ctx.lineWidth = 2; } 
        else { ctx.fillStyle = COLORS.wireDefault; ctx.strokeStyle = COLORS.junctionStroke; ctx.lineWidth = isHovered ? 2 : 1; }
        ctx.beginPath(); ctx.arc(aj.x, aj.y, (isHovered || isSelected) ? 6 : 4.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    });
}

function drawGrid() {
    ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1 / scale.value;
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
    ctx.fillStyle = COLORS.canvasBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(scale.value, scale.value);
    drawGrid();
    drawWires();
    circuit.components.forEach(comp => drawComponentBody(comp));
    if (flags.isSelectingZone) {
        ctx.save(); ctx.strokeStyle = 'rgba(0, 188, 212, 0.7)'; ctx.fillStyle = 'rgba(0, 188, 212, 0.15)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
        ctx.fillRect(zone.start.x, zone.start.y, zone.end.x - zone.start.x, zone.end.y - zone.start.y);
        ctx.strokeRect(zone.start.x, zone.start.y, zone.end.x - zone.start.x, zone.end.y - zone.start.y); ctx.restore();
    }
    if (flags.isDraggingFromMenu && menuDrag.draggedComponentType) {
        ctx.globalAlpha = 0.5;
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
        ctx.globalAlpha = 1.0;
    }
    ctx.restore();
}