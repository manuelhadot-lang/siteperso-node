// geometry.js
import { circuit, flags, simulationResults, snapToGrid, GRID_SIZE } from './state.js';
import { CD4511_JUNC_L, CD4511_JUNC_R, CD4511_PIN_Y, CD4511_HIT_DX, CD4511_HIT_DY } from './cd4511-layout.js';
import {
    LM386_BOX_L,
    LM386_BOX_R,
    LM386_BOX_T,
    LM386_BOX_B,
    LM386_JUNC_L,
    LM386_JUNC_R,
    LM386_LEFT_PIN_Y,
    LM386_RIGHT_PIN_Y,
    LM386_HIT_DX,
    LM386_HIT_DY,
    lm386JonctionToTerminalKey,
} from './lm386-layout.js';
import {
    LM7805_JUNC_L,
    LM7805_PIN_Y,
    LM7805_HIT_DX,
    LM7805_HIT_DY,
    lm7805JonctionToTerminalKey,
} from './lm7805-layout.js';
import {
    IR2104_JUNC_L,
    IR2104_JUNC_R,
    IR2104_LEFT_PIN_Y,
    IR2104_RIGHT_PIN_Y,
    IR2104_HIT_DX,
    IR2104_HIT_DY,
    ir2104JonctionToTerminalKey,
} from './ir2104-layout.js';
import {
    L293D_JUNC_L,
    L293D_JUNC_R,
    L293D_LEFT_PIN_Y,
    L293D_RIGHT_PIN_Y,
    L293D_HIT_DX,
    L293D_HIT_DY,
    l293dJonctionToTerminalKey,
} from './l293d-layout.js';
import { servoMotorJonctions } from './servo-motor-layout.js';
import {
    IC90_JUNC_L,
    IC90_JUNC_R,
    IC90_LEFT_PIN_Y,
    IC90_RIGHT_PIN_Y,
    IC90_HIT_DX,
    IC90_HIT_DY,
    ic74hc90JonctionToTerminalKey,
} from './ic74hc90-layout.js';
import {
    UNO_JUNC_L,
    UNO_JUNC_R,
    UNO_LEFT_PINS,
    UNO_RIGHT_PINS,
    UNO_LEFT_PIN_Y,
    UNO_RIGHT_PIN_Y,
    UNO_HIT_DX,
    UNO_HIT_DY,
} from './arduino-uno-layout.js';
import {
    ESP32_JUNC_L,
    ESP32_JUNC_R,
    ESP32_LEFT_PINS,
    ESP32_RIGHT_PINS,
    ESP32_LEFT_PIN_Y,
    ESP32_RIGHT_PIN_Y,
    ESP32_HIT_DX,
    ESP32_HIT_DY,
} from './esp32-c3-layout.js';
import {
    ESP32_DEVKIT_JUNC_L,
    ESP32_DEVKIT_JUNC_R,
    ESP32_DEVKIT_LEFT_PINS,
    ESP32_DEVKIT_RIGHT_PINS,
    ESP32_DEVKIT_LEFT_PIN_Y,
    ESP32_DEVKIT_RIGHT_PIN_Y,
    ESP32_DEVKIT_HIT_DX,
    ESP32_DEVKIT_HIT_DY,
} from './esp32-devkit-layout.js';
import {
    ESP32_UPESY_LP_JUNC_L,
    ESP32_UPESY_LP_JUNC_R,
    ESP32_UPESY_LP_LEFT_PINS,
    ESP32_UPESY_LP_RIGHT_PINS,
    ESP32_UPESY_LP_LEFT_PIN_Y,
    ESP32_UPESY_LP_RIGHT_PIN_Y,
    ESP32_UPESY_LP_HIT_DX,
    ESP32_UPESY_LP_HIT_DY,
} from './esp32-upesy-lp-layout.js';
import {
    GROVE_LCD_PINS,
    GROVE_LCD_PIN_Y,
    GROVE_LCD_JUNC_X,
    GROVE_LCD_SEL_L,
    GROVE_LCD_SEL_T,
    GROVE_LCD_SEL_W,
    GROVE_LCD_SEL_H,
} from './grove-lcd-layout.js';
import {
    GROVE_DHT22_PINS,
    GROVE_DHT22_PIN_Y,
    GROVE_DHT22_JUNC_X,
    GROVE_DHT22_HIT_DX,
    GROVE_DHT22_HIT_DY,
} from './dht22-layout.js';
import {
    GROVE_TSL2591_PINS,
    GROVE_TSL2591_PIN_Y,
    GROVE_TSL2591_JUNC_X,
    GROVE_TSL2591_SEL_L,
    GROVE_TSL2591_SEL_T,
    GROVE_TSL2591_SEL_W,
    GROVE_TSL2591_SEL_H,
    GROVE_TSL2591_HIT_DX,
    GROVE_TSL2591_HIT_DY,
} from './tsl2591-layout.js';
import {
    GROVE_BMP280_PINS,
    GROVE_BMP280_PIN_Y,
    GROVE_BMP280_JUNC_X,
    GROVE_BMP280_SEL_L,
    GROVE_BMP280_SEL_T,
    GROVE_BMP280_SEL_W,
    GROVE_BMP280_SEL_H,
    GROVE_BMP280_HIT_DX,
    GROVE_BMP280_HIT_DY,
} from './bmp280-layout.js';
import {
    TFT18_PINS,
    TFT18_PIN_Y,
    TFT18_JUNC_X,
    TFT18_SEL_L,
    TFT18_SEL_T,
    TFT18_SEL_W,
    TFT18_SEL_H,
} from './tft18-layout.js';
import {
    DC10H_PIN_Y,
    DC10H_SEG_NAMES,
    DC10H_JUNC_L,
    DC10H_JUNC_R,
    DC10H_COM_X,
    DC10H_COM_Y,
    DC10H_SEL_L,
    DC10H_SEL_T,
    DC10H_SEL_W,
    DC10H_SEL_H,
    dc10hComX,
} from './bargraph-dc10h-layout.js';
import {
    MATRIX_PIN_Y,
    MATRIX_ROW_NAMES,
    MATRIX_COL_NAMES,
    MATRIX_SEL_L,
    MATRIX_SEL_T,
    MATRIX_SEL_W,
    MATRIX_SEL_H,
    matrixRowJuncX,
    matrixColJuncX,
} from './matrix-8x8-layout.js';

export function isPointOnSegment(px, py, p1, p2, tolerance = 1) {
    const minX = Math.min(p1.x, p2.x) - tolerance, maxX = Math.max(p1.x, p2.x) + tolerance;
    const minY = Math.min(p1.y, p2.y) - tolerance, maxY = Math.max(p1.y, p2.y) + tolerance;
    if (px < minX || px > maxX || py < minY || py > maxY) return false;
    if (Math.abs(p1.x - p2.x) < 2) return Math.abs(px - p1.x) <= tolerance;
    if (Math.abs(p1.y - p2.y) < 2) return Math.abs(py - p1.y) <= tolerance;
    const A = px - p1.x; const B = py - p1.y; const C = p2.x - p1.x; const D = p2.y - p1.y;
    const dot = A * C + B * D; const lenSq = C * C + D * D;
    const param = lenSq !== 0 ? dot / lenSq : -1;
    if (param >= 0 && param <= 1) {
        const xx = p1.x + param * C; const yy = p1.y + param * D;
        return Math.hypot(px - xx, py - yy) <= tolerance;
    }
    return false;
}

export function findWireIntersection(x, y) {
    for (let w of circuit.wires) {
        for (let i = 0; i < w.points.length - 1; i++) {
            if (isPointOnSegment(x, y, w.points[i], w.points[i+1], 1)) { 
                return { x: snapToGrid(x), y: snapToGrid(y) }; 
            }
        }
    }
    return null;
}

export function getComponentJonctions(comp) {
    const list = [];
    const rad = (comp.rotation || 0) * Math.PI / 180;
    let localPts = [];

    if (['battery', 'resistor', 'voltmeter', 'ammeter', 'ohmmeter', 'bode_analyzer', 'speaker', 'led', 'ldr', 'push_button'].includes(comp.type)) {
        localPts = [{ id: `${comp.label}_in`, x: -40, y: 0 }, { id: `${comp.label}_out`, x: 40, y: 0 }];
    } else if (comp.type === 'dc_motor') {
        localPts = [
            { id: `${comp.label}_minus`, x: -40, y: 0 },
            { id: `${comp.label}_plus`, x: 40, y: 0 },
        ];
    } else if (comp.type === 'servo_motor') {
        localPts = servoMotorJonctions(comp.label);
    } else if (comp.type === 'potentiometer') {
        const pos = Math.min(100, Math.max(0, comp.position ?? 50));
        const wipX = -20 + (pos / 100) * 40;
        localPts = [
            { id: `${comp.label}_in`, x: -40, y: 0 },
            { id: `${comp.label}_wip`, x: wipX, y: -22 },
            { id: `${comp.label}_out`, x: 40, y: 0 },
        ];
    } else if (comp.type === 'switch_spdt') {
        localPts = [
            { id: `${comp.label}_a`, x: -40, y: -18 },
            { id: `${comp.label}_com`, x: -40, y: 0 },
            { id: `${comp.label}_b`, x: -40, y: 18 },
        ];
    } else if (comp.type === 'gimp') {
        localPts = [
            { id: `${comp.label}_in`, x: 0, y: 40 },
            { id: `${comp.label}_out`, x: comp.flipX ? -40 : 40, y: 0 },
        ];
    } else if (comp.type === 'gsin') {
        localPts = [
            { id: `${comp.label}_in`, x: 0, y: 40 },
            { id: `${comp.label}_out`, x: 40, y: 0 },
        ];
    } else if (comp.type === 'oscilloscope') {
        localPts = [
            { id: `${comp.label}_CH1`, x: -60, y: -20 },
            { id: `${comp.label}_CH2`, x: -60, y: 20 },
            { id: `${comp.label}_GND`, x: 0, y: 60 },
        ];
    } else if (comp.type === 'seg7') {
        const ys = [-60, -40, -20, 0, 20, 40, 60];
        const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
        localPts = names.map((n, i) => ({ id: `${comp.label}_${n}`, x: -40, y: ys[i] }));
        localPts.push({ id: `${comp.label}_COM`, x: 20, y: 100 });
    } else if (comp.type === 'bargraph_dc10h') {
        const jx = comp.flipX ? DC10H_JUNC_R : DC10H_JUNC_L;
        const comX = dc10hComX(!!comp.flipX);
        localPts = DC10H_SEG_NAMES.map((n, i) => ({ id: `${comp.label}_${n}`, x: jx, y: DC10H_PIN_Y[i] }));
        localPts.push({ id: `${comp.label}_COM`, x: comX, y: DC10H_COM_Y });
    } else if (comp.type === 'matrix_8x8') {
        const rx = matrixRowJuncX(!!comp.flipX);
        const cx = matrixColJuncX(!!comp.flipX);
        MATRIX_ROW_NAMES.forEach((n, i) => {
            localPts.push({ id: `${comp.label}_${n}`, x: rx, y: MATRIX_PIN_Y[i] });
        });
        MATRIX_COL_NAMES.forEach((n, i) => {
            localPts.push({ id: `${comp.label}_${n}`, x: cx, y: MATRIX_PIN_Y[i] });
        });
    } else if (comp.type === 'grove_lcd16x2') {
        GROVE_LCD_PINS.forEach((n, i) => {
            localPts.push({ id: `${comp.label}_${n}`, x: GROVE_LCD_JUNC_X, y: GROVE_LCD_PIN_Y[i] });
        });
    } else if (comp.type === 'grove_dht22') {
        const jx = comp.flipX ? -GROVE_DHT22_JUNC_X : GROVE_DHT22_JUNC_X;
        GROVE_DHT22_PINS.forEach((n, i) => {
            list.push({
                id: `${comp.label}_${n}`,
                x: snapToGrid(comp.x + jx),
                y: snapToGrid(comp.y + GROVE_DHT22_PIN_Y[i]),
            });
        });
        return list;
    } else if (comp.type === 'grove_tsl2591') {
        GROVE_TSL2591_PINS.forEach((n, i) => {
            localPts.push({ id: `${comp.label}_${n}`, x: GROVE_TSL2591_JUNC_X, y: GROVE_TSL2591_PIN_Y[i] });
        });
    } else if (comp.type === 'grove_bmp280') {
        GROVE_BMP280_PINS.forEach((n, i) => {
            localPts.push({ id: `${comp.label}_${n}`, x: GROVE_BMP280_JUNC_X, y: GROVE_BMP280_PIN_Y[i] });
        });
    } else if (comp.type === 'joyit_tft18') {
        TFT18_PINS.forEach((n, i) => {
            localPts.push({ id: `${comp.label}_${n}`, x: TFT18_JUNC_X, y: TFT18_PIN_Y[i] });
        });
    } else if (['capacitor', 'inductor', 'diode'].includes(comp.type)) {
        localPts = [{ id: `${comp.label}_in`, x: -40, y: 0 }, { id: `${comp.label}_out`, x: 40, y: 0 }];
    } else if (comp.type === 'gsqr') {
        localPts = [
            { id: `${comp.label}_in`, x: 0, y: 40 },
            { id: `${comp.label}_out`, x: 40, y: 0 },
        ];
    } else if (comp.type === 'npn') {
        localPts = [
            { id: `${comp.label}_B`, x: -40, y: 0 },
            { id: `${comp.label}_C`, x: 20, y: -40 },
            { id: `${comp.label}_E`, x: 20, y: 40 },
        ];
    } else if (comp.type === 'nmos') {
        localPts = [
            { id: `${comp.label}_G`, x: -40, y: 0 },
            { id: `${comp.label}_D`, x: 20, y: -60 },
            { id: `${comp.label}_S`, x: 20, y: 60 },
        ];
    } else if (comp.type === 'opamp') {
        localPts = [
            { id: `${comp.label}_plus`, x: -40, y: -20 },
            { id: `${comp.label}_minus`, x: -40, y: 20 },
            { id: `${comp.label}_out`, x: 40, y: 0 },
        ];
    } else if (['and', 'nand', 'or', 'nor', 'xor', 'xnor'].includes(comp.type)) {
        localPts = [{ id: `${comp.label}_inA`, x: -40, y: -20 }, { id: `${comp.label}_inB`, x: -40, y: 20 }, { id: `${comp.label}_out`, x: 40, y: 0 }];
    } else if (comp.type === 'not') {
        localPts = [{ id: `${comp.label}_inA`, x: -40, y: 0 }, { id: `${comp.label}_out`, x: 40, y: 0 }];
    } else if (comp.type === 'd_flipflop') {
        localPts = [
            { id: `${comp.label}_D`, x: -40, y: -20 },
            { id: `${comp.label}_CLK`, x: -40, y: 20 },
            { id: `${comp.label}_Q`, x: 40, y: -20 },
            { id: `${comp.label}_Qbar`, x: 40, y: 20 },
            { id: `${comp.label}_SET`, x: 0, y: -60 },
            { id: `${comp.label}_RESET`, x: 0, y: 60 }
        ];
    } else if (comp.type === 'jk_flipflop') {
        localPts = [
            { id: `${comp.label}_J`, x: -40, y: -20 },
            { id: `${comp.label}_CLK`, x: -40, y: 0 },
            { id: `${comp.label}_K`, x: -40, y: 20 },
            { id: `${comp.label}_Q`, x: 40, y: -20 },
            { id: `${comp.label}_Qbar`, x: 40, y: 20 },
            { id: `${comp.label}_SET`, x: 0, y: -60 },
            { id: `${comp.label}_RESET`, x: 0, y: 60 }
        ];
    } else if (comp.type === 'cd4511') {
        const inNames = ['A', 'B', 'C', 'D', 'LE', 'BI', 'LT'];
        localPts = inNames.map((n, i) => ({ id: `${comp.label}_${n}`, x: CD4511_JUNC_L, y: CD4511_PIN_Y[i] }));
        const outNames = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
        outNames.forEach((n, i) => {
            localPts.push({ id: `${comp.label}_${n}`, x: CD4511_JUNC_R, y: CD4511_PIN_Y[i] });
        });
    } else if (comp.type === 'ic_74hc90') {
        const left = ['CP1', 'MR1', 'MR2', null, 'VCC', 'MS1', 'MS2'];
        const right = ['Q0', 'Q1', 'Q2', 'Q3', null, 'GND', 'CP0'];
        left.forEach((n, i) => {
            if (n) localPts.push({ id: `${comp.label}_${n}`, x: IC90_JUNC_L, y: IC90_LEFT_PIN_Y[i] });
        });
        right.forEach((n, i) => {
            if (n) localPts.push({ id: `${comp.label}_${n}`, x: IC90_JUNC_R, y: IC90_RIGHT_PIN_Y[i] });
        });
    } else if (comp.type === 'lm386') {
        const left = ['G1', 'INM', 'INP', 'GND'];
        const right = ['G8', 'BYP', 'VCC', 'OUT'];
        left.forEach((n, i) => {
            localPts.push({ id: `${comp.label}_${n}`, x: LM386_JUNC_L, y: LM386_LEFT_PIN_Y[i] });
        });
        right.forEach((n, i) => {
            localPts.push({ id: `${comp.label}_${n}`, x: LM386_JUNC_R, y: LM386_RIGHT_PIN_Y[i] });
        });
    } else if (comp.type === 'lm7805') {
        ['IN', 'GND', 'OUT'].forEach((n, i) => {
            localPts.push({ id: `${comp.label}_${n}`, x: LM7805_JUNC_L, y: LM7805_PIN_Y[i] });
        });
    } else if (comp.type === 'ir2104') {
        const left = ['LO', 'VS', 'HO', 'VB'];
        const right = ['IN', 'COM', 'VCC', 'NC'];
        left.forEach((n, i) => {
            localPts.push({ id: `${comp.label}_${n}`, x: IR2104_JUNC_L, y: IR2104_LEFT_PIN_Y[i] });
        });
        right.forEach((n, i) => {
            localPts.push({ id: `${comp.label}_${n}`, x: IR2104_JUNC_R, y: IR2104_RIGHT_PIN_Y[i] });
        });
    } else if (comp.type === 'l293d') {
        const left = ['EN12', 'A1', 'Y1', 'GND1', 'GND2', 'Y2', 'A2', 'VSS'];
        const right = ['VMOT', 'A4', 'Y4', 'GND4', 'GND3', 'Y3', 'A3', 'EN34'];
        left.forEach((n, i) => {
            localPts.push({ id: `${comp.label}_${n}`, x: L293D_JUNC_L, y: L293D_LEFT_PIN_Y[i] });
        });
        right.forEach((n, i) => {
            localPts.push({ id: `${comp.label}_${n}`, x: L293D_JUNC_R, y: L293D_RIGHT_PIN_Y[i] });
        });
    } else if (comp.type === 'esp32_c3') {
        ESP32_LEFT_PINS.forEach((n, i) => {
            localPts.push({ id: `${comp.label}_${n}`, x: ESP32_JUNC_L, y: ESP32_LEFT_PIN_Y[i] });
        });
        ESP32_RIGHT_PINS.forEach((n, i) => {
            localPts.push({ id: `${comp.label}_${n}`, x: ESP32_JUNC_R, y: ESP32_RIGHT_PIN_Y[i] });
        });
    } else if (comp.type === 'esp32_devkit') {
        ESP32_DEVKIT_LEFT_PINS.forEach((n, i) => {
            localPts.push({ id: `${comp.label}_${n}`, x: ESP32_DEVKIT_JUNC_L, y: ESP32_DEVKIT_LEFT_PIN_Y[i] });
        });
        ESP32_DEVKIT_RIGHT_PINS.forEach((n, i) => {
            localPts.push({ id: `${comp.label}_${n}`, x: ESP32_DEVKIT_JUNC_R, y: ESP32_DEVKIT_RIGHT_PIN_Y[i] });
        });
    } else if (comp.type === 'esp32_upesy_lp') {
        ESP32_UPESY_LP_LEFT_PINS.forEach((n, i) => {
            localPts.push({ id: `${comp.label}_${n}`, x: ESP32_UPESY_LP_JUNC_L, y: ESP32_UPESY_LP_LEFT_PIN_Y[i] });
        });
        ESP32_UPESY_LP_RIGHT_PINS.forEach((n, i) => {
            localPts.push({ id: `${comp.label}_${n}`, x: ESP32_UPESY_LP_JUNC_R, y: ESP32_UPESY_LP_RIGHT_PIN_Y[i] });
        });
    } else if (comp.type === 'arduino_uno') {
        UNO_LEFT_PINS.forEach((n, i) => {
            localPts.push({ id: `${comp.label}_${n}`, x: UNO_JUNC_L, y: UNO_LEFT_PIN_Y[i] });
        });
        UNO_RIGHT_PINS.forEach((n, i) => {
            localPts.push({ id: `${comp.label}_${n}`, x: UNO_JUNC_R, y: UNO_RIGHT_PIN_Y[i] });
        });
    } else if (['gnd', 'vcc', 'logic_terminal'].includes(comp.type)) {
        localPts = [{ id: `${comp.label}_out`, x: GRID_SIZE, y: 0 }];
    }

    localPts.forEach(pt => {
        let lx = pt.x;
        let ly = pt.y;
        if (comp.type !== 'gimp' && comp.type !== 'gsin' && comp.type !== 'gsqr' && comp.type !== 'oscilloscope' && comp.type !== 'd_flipflop' && comp.type !== 'jk_flipflop' && comp.type !== 'cd4511' && comp.type !== 'ic_74hc90' && comp.type !== 'lm386' && comp.type !== 'lm7805' && comp.type !== 'ir2104' && comp.type !== 'l293d' && comp.type !== 'arduino_uno' && comp.type !== 'esp32_c3' && comp.type !== 'esp32_devkit' && comp.type !== 'esp32_upesy_lp' && comp.type !== 'npn' && comp.type !== 'nmos' && comp.type !== 'opamp' && comp.type !== 'seg7' && comp.type !== 'bargraph_dc10h' && comp.type !== 'matrix_8x8' && comp.type !== 'grove_dht22') {
            const rx = lx * Math.cos(rad) - ly * Math.sin(rad);
            const ry = lx * Math.sin(rad) + ly * Math.cos(rad);
            lx = rx;
            ly = ry;
        }
        if (comp.flipX && (comp.type === 'npn' || comp.type === 'nmos' || comp.type === 'opamp' || comp.type === 'grove_lcd16x2' || comp.type === 'grove_tsl2591' || comp.type === 'grove_bmp280' || comp.type === 'joyit_tft18')) lx = -lx;
        if (comp.flipY && comp.type === 'opamp') ly = -ly;
        const exactJunc = comp.type === 'gimp' || comp.type === 'gsin' || comp.type === 'gsqr' || comp.type === 'oscilloscope' || comp.type === 'd_flipflop' || comp.type === 'jk_flipflop' || comp.type === 'cd4511' || comp.type === 'ic_74hc90' || comp.type === 'lm386' || comp.type === 'lm7805' || comp.type === 'ir2104' || comp.type === 'l293d' || comp.type === 'dc_motor' || comp.type === 'servo_motor' || comp.type === 'potentiometer' || comp.type === 'arduino_uno' || comp.type === 'esp32_c3' || comp.type === 'esp32_devkit' || comp.type === 'esp32_upesy_lp';
        const wx = comp.x + lx;
        const wy = comp.y + ly;
        list.push({ id: pt.id, x: exactJunc ? wx : snapToGrid(wx), y: exactJunc ? wy : snapToGrid(wy) });
    });
    return list;
}

/** Zone cliquable pour sélectionner un composant (coords schéma). */
export function componentHitTest(comp, mx, my) {
    const dx = Math.abs(mx - comp.x);
    const dy = Math.abs(my - comp.y);
    if (comp.type === 'logic_terminal') return dx < 24 && dy < 14;
    if (comp.type === 'd_flipflop' || comp.type === 'jk_flipflop') return dx < 45 && dy < 68;
    if (comp.type === 'cd4511') return dx < CD4511_HIT_DX && dy < CD4511_HIT_DY;
    if (comp.type === 'ic_74hc90') return dx < IC90_HIT_DX && dy < IC90_HIT_DY;
    if (comp.type === 'lm386') return dx < LM386_HIT_DX && dy < LM386_HIT_DY;
    if (comp.type === 'lm7805') return dx < LM7805_HIT_DX && dy < LM7805_HIT_DY;
    if (comp.type === 'ir2104') return dx < IR2104_HIT_DX && dy < IR2104_HIT_DY;
    if (comp.type === 'l293d') return dx < L293D_HIT_DX && dy < L293D_HIT_DY;
    if (comp.type === 'esp32_c3') return dx < ESP32_HIT_DX && dy < ESP32_HIT_DY;
    if (comp.type === 'esp32_devkit') return dx < ESP32_DEVKIT_HIT_DX && dy < ESP32_DEVKIT_HIT_DY;
    if (comp.type === 'esp32_upesy_lp') return dx < ESP32_UPESY_LP_HIT_DX && dy < ESP32_UPESY_LP_HIT_DY;
    if (comp.type === 'arduino_uno') return dx < UNO_HIT_DX && dy < UNO_HIT_DY;
    if (comp.type === 'gimp' || comp.type === 'gsin' || comp.type === 'gsqr') return dx < 45 && dy < 50;
    if (comp.type === 'oscilloscope') return dx < 52 && dy < 62;
    if (comp.type === 'seg7') return dx < 60 && dy < 110;
    if (comp.type === 'bargraph_dc10h') {
        const x = mx - comp.x;
        const y = my - comp.y;
        return x >= DC10H_SEL_L && x <= DC10H_SEL_L + DC10H_SEL_W
            && y >= DC10H_SEL_T && y <= DC10H_SEL_T + DC10H_SEL_H;
    }
    if (comp.type === 'matrix_8x8') {
        const x = mx - comp.x;
        const y = my - comp.y;
        return x >= MATRIX_SEL_L && x <= MATRIX_SEL_L + MATRIX_SEL_W
            && y >= MATRIX_SEL_T && y <= MATRIX_SEL_T + MATRIX_SEL_H;
    }
    if (comp.type === 'grove_lcd16x2') {
        const { x, y } = compLocalCoords(comp, mx, my);
        const flip = comp.flipX ? -1 : 1;
        const fx = (v) => flip * v;
        const selL = Math.min(fx(GROVE_LCD_SEL_L), fx(GROVE_LCD_SEL_L + GROVE_LCD_SEL_W));
        return x >= selL && x <= selL + GROVE_LCD_SEL_W
            && y >= GROVE_LCD_SEL_T && y <= GROVE_LCD_SEL_T + GROVE_LCD_SEL_H;
    }
    if (comp.type === 'grove_dht22') return dx < GROVE_DHT22_HIT_DX && dy < GROVE_DHT22_HIT_DY;
    if (comp.type === 'grove_tsl2591') {
        const { x, y } = compLocalCoords(comp, mx, my);
        const flip = comp.flipX ? -1 : 1;
        const fx = (v) => flip * v;
        const selL = Math.min(fx(GROVE_TSL2591_SEL_L), fx(GROVE_TSL2591_SEL_L + GROVE_TSL2591_SEL_W));
        return x >= selL && x <= selL + GROVE_TSL2591_SEL_W
            && y >= GROVE_TSL2591_SEL_T && y <= GROVE_TSL2591_SEL_T + GROVE_TSL2591_SEL_H;
    }
    if (comp.type === 'grove_bmp280') {
        const { x, y } = compLocalCoords(comp, mx, my);
        const flip = comp.flipX ? -1 : 1;
        const fx = (v) => flip * v;
        const selL = Math.min(fx(GROVE_BMP280_SEL_L), fx(GROVE_BMP280_SEL_L + GROVE_BMP280_SEL_W));
        return x >= selL && x <= selL + GROVE_BMP280_SEL_W
            && y >= GROVE_BMP280_SEL_T && y <= GROVE_BMP280_SEL_T + GROVE_BMP280_SEL_H;
    }
    if (comp.type === 'joyit_tft18') {
        const { x, y } = compLocalCoords(comp, mx, my);
        const flip = comp.flipX ? -1 : 1;
        const fx = (v) => flip * v;
        const selL = Math.min(fx(TFT18_SEL_L), fx(TFT18_SEL_L + TFT18_SEL_W));
        return x >= selL && x <= selL + TFT18_SEL_W
            && y >= TFT18_SEL_T && y <= TFT18_SEL_T + TFT18_SEL_H;
    }
    if (comp.type === 'opamp') return dx < 44 && dy < 42;
    if (comp.type === 'npn') return dx < 44 && dy < 44;
    if (comp.type === 'nmos') return dx < 44 && dy < 62;
    if (comp.type === 'switch_spdt') return dx < 38 && dy < 38;
    if (comp.type === 'push_button') return dx < 34 && dy < 26;
    if (comp.type === 'potentiometer') return dx < 34 && dy < 38;
    if (comp.type === 'ldr') return dx < 42 && dy < 58;
    return dx < 30 && dy < 30;
}

export function compLocalCoords(comp, mx, my) {
    const dx = mx - comp.x;
    const dy = my - comp.y;
    const rad = -(comp.rotation || 0) * Math.PI / 180;
    return {
        x: dx * Math.cos(rad) - dy * Math.sin(rad),
        y: dx * Math.sin(rad) + dy * Math.cos(rad),
    };
}

/** Clic sur ◀ / ▶ du potentiomètre. */
export function potentiometerControlHit(comp, mx, my) {
    if (comp.type !== 'potentiometer') return null;
    const { x, y } = compLocalCoords(comp, mx, my);
    if (x >= -16 && x <= -2 && y >= 11 && y <= 25) return 'dec';
    if (x >= 2 && x <= 16 && y >= 11 && y <= 25) return 'inc';
    return null;
}

/** Clic sur ◀ / ▶ de la photorésistance (luminosité). */
export function ldrControlHit(comp, mx, my) {
    if (comp.type !== 'ldr') return null;
    const { x, y } = compLocalCoords(comp, mx, my);
    if (x >= -16 && x <= -2 && y >= 14 && y <= 30) return 'dec';
    if (x >= 2 && x <= 16 && y >= 14 && y <= 30) return 'inc';
    return null;
}

/** Zone du levier (clic = bascule A ↔ B). */
export function switchSpdtToggleHit(comp, mx, my) {
    if (comp.type !== 'switch_spdt') return false;
    const { x, y } = compLocalCoords(comp, mx, my);
    return x >= -12 && x <= 12 && y >= -18 && y <= 18;
}

/** Zone du capuchon du bouton poussoir (clic = appui ↔ relâche). */
export function pushButtonToggleHit(comp, mx, my) {
    if (comp.type !== 'push_button') return false;
    const { x, y } = compLocalCoords(comp, mx, my);
    return x >= -16 && x <= 16 && y >= -20 && y <= 16;
}

export function isJonctionConnected(jonctionId) {
    return circuit.wires.some(w => w.fromJonctionId === jonctionId || w.toJonctionId === jonctionId);
}

/** Positions monde des jonctions composants + auto-jonctions. */
export function buildJonctionPositionMap() {
    const map = new Map();
    for (const comp of circuit.components) {
        for (const j of getComponentJonctions(comp)) map.set(j.id, { x: j.x, y: j.y });
    }
    for (const aj of circuit.autoJunctions) map.set(aj.id, { x: aj.x, y: aj.y });
    return map;
}

/** Recale les extrémités des fils sur les jonctions (après déplacement composant ou correction géométrie). */
export function syncWireEndpointsToJonctions() {
    const pos = buildJonctionPositionMap();
    for (const w of circuit.wires) {
        const from = pos.get(w.fromJonctionId);
        const to = pos.get(w.toJonctionId);
        if (from && w.points.length > 0) {
            w.points[0].x = from.x;
            w.points[0].y = from.y;
        }
        if (to && w.points.length > 0) {
            w.points[w.points.length - 1].x = to.x;
            w.points[w.points.length - 1].y = to.y;
        }
    }
}

export function getVoltageAtJonction(targetJonctionId) {
    if (!flags.isSimulating || !simulationResults.voltmeters) return 0;
    let openList = [targetJonctionId];
    let connectedJonctions = new Set(openList);

    while (openList.length > 0) {
        let current = openList.pop();
        for (let w of circuit.wires) {
            if (w.fromJonctionId === current && !connectedJonctions.has(w.toJonctionId)) {
                connectedJonctions.add(w.toJonctionId); openList.push(w.toJonctionId);
            }
            if (w.toJonctionId === current && !connectedJonctions.has(w.fromJonctionId)) {
                connectedJonctions.add(w.fromJonctionId); openList.push(w.fromJonctionId);
            }
        }
    }

    for (let jId of connectedJonctions) {
        if (jId.startsWith('GND')) return 0;
        for (let vName in simulationResults.voltmeters) {
            let measureData = simulationResults.voltmeters[vName];
            let v = (typeof measureData === 'object') ? measureData.voltage : measureData;
            if (jId === `${vName}_in`) return v || 0;
            if (jId === `${vName}_out`) return 0; 
        }
        for (let comp of circuit.components) {
            if (comp.label && jId.startsWith(comp.label)) {
                if (comp.type === 'vcc') return comp.value !== undefined ? comp.value : 5;
                if (comp.type === 'battery' && jId.endsWith('_in')) return comp.value !== undefined ? comp.value : 5;
            }
        }
    }
    return 0;
}