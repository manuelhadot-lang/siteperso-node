/**
 * Conversion schéma graphique → état moteur SPICE (partagé simulation + tests).
 */
import { cd4511JonctionToTerminalKey } from './cd4511-layout.js';
import { ic74hc90JonctionToTerminalKey } from './ic74hc90-layout.js';
import { lm386JonctionToTerminalKey } from './lm386-layout.js';
import { lm7805JonctionToTerminalKey } from './lm7805-layout.js';
import { ir2104JonctionToTerminalKey } from './ir2104-layout.js';
import { l293dJonctionToTerminalKey } from './l293d-layout.js';
import { dcMotorJonctionToTerminalKey } from './dc-motor-layout.js';
import { servoMotorJonctionToTerminalKey } from './servo-motor-layout.js';
import { arduinoUnoJonctionToTerminalKey } from './arduino-uno-layout.js';
import { esp32C3JonctionToTerminalKey, ESP32_FQBN } from './esp32-c3-layout.js';
import { esp32DevkitJonctionToTerminalKey, ESP32_DEVKIT_FQBN } from './esp32-devkit-layout.js';
import { isMicroBoard } from './micro-board.js';
import { applyArduinoSketchToComponent } from './Engine/arduino-sketch-parse.mjs';
import { snapToGrid } from './grid-constants.js';

const COMPONENT_TYPE_TO_ENGINE = {
    battery: 'vsource', vcc: 'vterm', logic_terminal: 'logic_state',
    gnd: 'ground',
    not: 'logic_not', and: 'logic_and', nand: 'logic_nand', or: 'logic_or', nor: 'logic_nor', xor: 'logic_xor', xnor: 'logic_xnor',
    d_flipflop: 'logic_dff', jk_flipflop: 'logic_jk', cd4511: 'logic_cd4511', ic_74hc90: 'ic_74hc90',
    arduino_uno: 'arduino_uno', esp32_c3: 'esp32_c3', esp32_devkit: 'esp32_devkit',
    led: 'diode_led', seg7: 'seg7', bargraph_dc10h: 'bargraph_dc10h', matrix_8x8: 'matrix_8x8',
    grove_lcd16x2: 'grove_lcd16x2', grove_dht22: 'grove_dht22', grove_tsl2591: 'grove_tsl2591',
    grove_bmp280: 'grove_bmp280', joyit_tft18: 'joyit_tft18',
    gimp: 'vpulse', gsin: 'vsin', gsqr: 'vsquare',
};

function formatGsinValue(comp) {
    const a = comp.peakAmplitude ?? 5;
    const f = comp.frequency ?? 1000;
    const o = comp.offset ?? 0;
    const fStr = f >= 1000 && f % 1000 === 0 ? `${f / 1000}kHz` : `${f}Hz`;
    return `${a}V ${fStr} ${o}V`;
}

function formatGimpValue(comp) {
    const v = comp.voltageRail ?? 5;
    const f = comp.frequency ?? 2;
    const d = comp.dutyCycle ?? 50;
    let fStr;
    if (f > 0 && f < 1) {
        const period = 1 / f;
        fStr = `${period >= 10 ? Math.round(period * 1000) / 1000 : period}s`;
    } else if (f >= 1000 && f % 1000 === 0) {
        fStr = `${f / 1000}kHz`;
    } else {
        fStr = `${f}Hz`;
    }
    return `${v}V ${fStr} ${d}%`;
}

function formatGsqrValue(comp) {
    const a = comp.peakAmplitude ?? 5;
    const f = comp.frequency ?? 1000;
    const o = comp.offset ?? 0;
    const fStr = f >= 1000 && f % 1000 === 0 ? `${f / 1000}kHz` : `${f}Hz`;
    return `${a}V ${fStr} offset ${o}V`;
}

export function jonctionIdToTerminalKey(jonctionId, components, autoJunctions = []) {
    const junc = autoJunctions.find((j) => j.id === jonctionId);
    if (junc) return `__t#${junc.x}#${junc.y}`;
    for (const comp of components) {
        const id = comp.label;
        if (!id) continue;
        if (comp.type === 'not') {
            if (jonctionId === `${id}_inA`) return `${id}#0`;
            if (jonctionId === `${id}_out`) return `${id}#1`;
        } else if (['and', 'nand', 'or', 'nor', 'xor', 'xnor'].includes(comp.type)) {
            if (jonctionId === `${id}_inA`) return `${id}#0`;
            if (jonctionId === `${id}_inB`) return `${id}#1`;
            if (jonctionId === `${id}_out`) return `${id}#2`;
        } else if (comp.type === 'd_flipflop') {
            if (jonctionId === `${id}_D`) return `${id}#0`;
            if (jonctionId === `${id}_CLK`) return `${id}#1`;
            if (jonctionId === `${id}_Q`) return `${id}#2`;
            if (jonctionId === `${id}_Qbar`) return `${id}#3`;
            if (jonctionId === `${id}_SET`) return `${id}#4`;
            if (jonctionId === `${id}_RESET`) return `${id}#5`;
        } else if (comp.type === 'jk_flipflop') {
            if (jonctionId === `${id}_J`) return `${id}#0`;
            if (jonctionId === `${id}_K`) return `${id}#1`;
            if (jonctionId === `${id}_CLK`) return `${id}#2`;
            if (jonctionId === `${id}_Q`) return `${id}#3`;
            if (jonctionId === `${id}_Qbar`) return `${id}#4`;
            if (jonctionId === `${id}_SET`) return `${id}#5`;
            if (jonctionId === `${id}_RESET`) return `${id}#6`;
        } else if (['gnd', 'vcc', 'logic_terminal'].includes(comp.type)) {
            if (jonctionId === `${id}_out`) return `${id}#0`;
        } else if (comp.type === 'gimp') {
            if (jonctionId === `${id}_in`) return `${id}#1`;
            if (jonctionId === `${id}_out`) return `${id}#0`;
        } else if (comp.type === 'gsin') {
            if (jonctionId === `${id}_in`) return `${id}#0`;
            if (jonctionId === `${id}_out`) return `${id}#1`;
        } else if (comp.type === 'gsqr') {
            if (jonctionId === `${id}_in`) return `${id}#0`;
            if (jonctionId === `${id}_out`) return `${id}#1`;
        } else if (comp.type === 'oscilloscope') {
            if (jonctionId === `${id}_CH1`) return `${id}#0`;
            if (jonctionId === `${id}_CH2`) return `${id}#1`;
            if (jonctionId === `${id}_GND`) return `${id}#2`;
        } else if (comp.type === 'npn') {
            if (jonctionId === `${id}_B`) return `${id}#0`;
            if (jonctionId === `${id}_C`) return `${id}#1`;
            if (jonctionId === `${id}_E`) return `${id}#2`;
        } else if (comp.type === 'nmos') {
            if (jonctionId === `${id}_G`) return `${id}#0`;
            if (jonctionId === `${id}_D`) return `${id}#1`;
            if (jonctionId === `${id}_S`) return `${id}#2`;
        } else if (comp.type === 'opamp') {
            if (jonctionId === `${id}_plus`) return `${id}#0`;
            if (jonctionId === `${id}_minus`) return `${id}#1`;
            if (jonctionId === `${id}_out`) return `${id}#2`;
        } else if (comp.type === 'seg7') {
            const segs = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
            for (let i = 0; i < segs.length; i++) {
                if (jonctionId === `${id}_${segs[i]}`) return `${id}#${i}`;
            }
            if (jonctionId === `${id}_COM`) return `${id}#7`;
        } else if (comp.type === 'bargraph_dc10h') {
            for (let i = 0; i < 10; i++) {
                if (jonctionId === `${id}_s${i + 1}`) return `${id}#${i}`;
            }
            if (jonctionId === `${id}_COM`) return `${id}#10`;
        } else if (comp.type === 'matrix_8x8') {
            for (let i = 0; i < 8; i++) {
                if (jonctionId === `${id}_R${i}`) return `${id}#${i}`;
            }
            for (let i = 0; i < 8; i++) {
                if (jonctionId === `${id}_C${i}`) return `${id}#${8 + i}`;
            }
        } else if (comp.type === 'grove_lcd16x2') {
            const pins = ['SDA', 'SCL', 'VCC', 'GND'];
            for (let i = 0; i < pins.length; i++) {
                if (jonctionId === `${id}_${pins[i]}`) return `${id}#${i}`;
            }
        } else if (comp.type === 'grove_dht22') {
            const pins = ['DATA', 'VCC', 'NC', 'GND'];
            for (let i = 0; i < pins.length; i++) {
                if (jonctionId === `${id}_${pins[i]}`) return `${id}#${i}`;
            }
        } else if (comp.type === 'grove_tsl2591') {
            const pins = ['SDA', 'SCL', 'VCC', 'GND'];
            for (let i = 0; i < pins.length; i++) {
                if (jonctionId === `${id}_${pins[i]}`) return `${id}#${i}`;
            }
        } else if (comp.type === 'grove_bmp280') {
            const pins = ['SDA', 'SCL', 'VCC', 'GND'];
            for (let i = 0; i < pins.length; i++) {
                if (jonctionId === `${id}_${pins[i]}`) return `${id}#${i}`;
            }
        } else if (comp.type === 'joyit_tft18') {
            const pins = ['VCC', 'GND', 'SCL', 'SDA', 'RES', 'DC', 'CS'];
            for (let i = 0; i < pins.length; i++) {
                if (jonctionId === `${id}_${pins[i]}`) return `${id}#${i}`;
            }
        } else if (comp.type === 'cd4511') {
            const key = cd4511JonctionToTerminalKey(id, jonctionId);
            if (key) return key;
        } else if (comp.type === 'ic_74hc90') {
            const key = ic74hc90JonctionToTerminalKey(id, jonctionId);
            if (key) return key;
        } else if (comp.type === 'lm386') {
            const key = lm386JonctionToTerminalKey(id, jonctionId);
            if (key) return key;
        } else if (comp.type === 'lm7805') {
            const key = lm7805JonctionToTerminalKey(id, jonctionId);
            if (key) return key;
        } else if (comp.type === 'ir2104') {
            const key = ir2104JonctionToTerminalKey(id, jonctionId);
            if (key) return key;
        } else if (comp.type === 'l293d') {
            const key = l293dJonctionToTerminalKey(id, jonctionId);
            if (key) return key;
        } else if (comp.type === 'dc_motor') {
            const key = dcMotorJonctionToTerminalKey(id, jonctionId);
            if (key) return key;
        } else if (comp.type === 'servo_motor') {
            const key = servoMotorJonctionToTerminalKey(id, jonctionId);
            if (key) return key;
        } else if (comp.type === 'esp32_c3') {
            const key = esp32C3JonctionToTerminalKey(id, jonctionId);
            if (key) return key;
        } else if (comp.type === 'esp32_devkit') {
            const key = esp32DevkitJonctionToTerminalKey(id, jonctionId);
            if (key) return key;
        } else if (comp.type === 'arduino_uno') {
            const key = arduinoUnoJonctionToTerminalKey(id, jonctionId);
            if (key) return key;
        } else if (comp.type === 'potentiometer') {
            if (jonctionId === `${id}_in`) return `${id}#0`;
            if (jonctionId === `${id}_wip`) return `${id}#1`;
            if (jonctionId === `${id}_out`) return `${id}#2`;
        } else if (comp.type === 'switch_spdt') {
            if (jonctionId === `${id}_com`) return `${id}#0`;
            if (jonctionId === `${id}_a`) return `${id}#1`;
            if (jonctionId === `${id}_b`) return `${id}#2`;
        } else {
            if (jonctionId === `${id}_in`) return `${id}#0`;
            if (jonctionId === `${id}_out`) return `${id}#1`;
        }
    }
    return null;
}

/**
 * @param {{ components: any[]; wires: any[]; autoJunctions?: any[] }} circuitData
 * @returns {{ components: any[]; wires: any[]; droppedWires: number }}
 */
export function buildSimStateFromCircuit(circuitData) {
    const components = Array.isArray(circuitData.components) ? circuitData.components : [];
    const wires = Array.isArray(circuitData.wires) ? circuitData.wires : [];
    const autoJunctions = Array.isArray(circuitData.autoJunctions) ? circuitData.autoJunctions : [];

    const simComponents = components.map((comp) => {
        const id = comp.label;
        const engineType = COMPONENT_TYPE_TO_ENGINE[comp.type] || comp.type;
        const out = { id, type: engineType, x: comp.x, y: comp.y, rotation: comp.rotation || 0 };
        if (comp.type === 'logic_terminal') {
            out.value = comp.state === 1 ? '1' : '0';
            out.logicRail = comp.highVoltage !== undefined ? comp.highVoltage : 5;
        } else if (comp.type === 'vcc') {
            out.value = comp.value !== undefined ? String(comp.value) : '5';
        } else if (engineType === 'vsource') {
            out.value = comp.value || '5';
        } else if (comp.type === 'gimp') {
            out.value = formatGimpValue(comp);
        } else if (comp.type === 'gsin') {
            out.value = formatGsinValue(comp);
        } else if (comp.type === 'gsqr') {
            out.value = formatGsqrValue(comp);
        }
        if (comp.type === 'resistor') out.value = comp.value || '1k';
        if (comp.type === 'potentiometer') {
            out.value = comp.value || '10k';
            out.position = comp.position ?? 50;
        }
        if (comp.type === 'switch_spdt') out.state = comp.state ?? 0;
        if (comp.type === 'push_button') out.state = comp.state ?? 0;
        if (comp.type === 'capacitor') out.value = comp.value || '1u';
        if (comp.type === 'inductor') out.value = comp.value || '1m';
        if (comp.type === 'diode') out.value = comp.value || '1N4148';
        if (comp.type === 'speaker') out.value = comp.value || '8';
        if (comp.type === 'dc_motor') out.value = comp.value || '50';
        if (comp.type === 'servo_motor') out.value = comp.value || '100';
        if (comp.type === 'npn') out.value = comp.value || '2N2222';
        if (comp.type === 'nmos') out.value = comp.value || 'IRLZ44N';
        if (comp.type === 'opamp') {
            out.value = comp.value || 'uA741';
            out.vp = comp.vp ?? 15;
            out.vn = comp.vn ?? -15;
        }
        if (comp.type === 'lm386') {
            out.value = comp.value || 'LM386N-1';
            out.vplus = comp.vplus ?? 9;
        }
        if (comp.type === 'lm7805') {
            out.value = comp.value || 'LM7805';
            out.vout = comp.vout ?? 5;
            out.vinMin = comp.vinMin ?? 7;
            out.dropout = comp.dropout ?? 2;
        }
        if (comp.type === 'ir2104') {
            out.value = comp.value || 'IR2104';
            out.vcc = comp.vcc ?? 12;
            out.vth = comp.vth ?? 2.5;
        }
        if (comp.type === 'l293d') {
            out.value = comp.value || 'L293D';
            out.vmot = comp.vmot ?? 12;
            out.vth = comp.vth ?? 1.5;
        }
        if (comp.type === 'oscilloscope') {
            out.timeDivSec = comp.timeDivSec ?? 0.001;
            out.ch1VoltsPerDiv = comp.ch1VoltsPerDiv ?? 1;
            out.ch2VoltsPerDiv = comp.ch2VoltsPerDiv ?? 1;
            out.ch1PositionDiv = comp.ch1PositionDiv ?? 0;
            out.ch2PositionDiv = comp.ch2PositionDiv ?? 0;
            out.timePositionDiv = comp.timePositionDiv ?? 0;
            out.syncOffsetDiv = comp.syncOffsetDiv ?? 0;
        }
        if (isMicroBoard(comp)) {
            applyArduinoSketchToComponent(comp);
            out.sketch = comp.sketch || '';
            out.fqbn = comp.fqbn || (comp.type === 'esp32_c3' ? ESP32_FQBN : comp.type === 'esp32_devkit' ? ESP32_DEVKIT_FQBN : 'arduino:avr:uno');
            out.pinModes = comp.pinModes || {};
            out.pinLevels = comp.pinLevels || {};
            out.pinPulses = comp.pinPulses || {};
            out.pinPhases = comp.pinPhases || [];
            out.avrRegisters = comp.avrRegisters || null;
        }
        return out;
    });

    const keyFor = (jId) => jonctionIdToTerminalKey(jId, components, autoJunctions);

    const simWires = wires
        .filter((w) => w.fromJonctionId && w.toJonctionId)
        .map((w) => {
            const fromKey = keyFor(w.fromJonctionId);
            const toKey = keyFor(w.toJonctionId);
            const pts = Array.isArray(w.points) && w.points.length >= 2
                ? w.points
                : [{ x: 0, y: 0 }, { x: 0, y: 0 }];
            return { solid: true, fromKey, toKey, points: pts };
        })
        .filter((w) => w.fromKey && w.toKey);

    const bridges = [];
    const gridKeys = new Map();
    for (const w of wires) {
        if (!w.fromJonctionId || !w.toJonctionId) continue;
        const fromKey = keyFor(w.fromJonctionId);
        const toKey = keyFor(w.toJonctionId);
        if (!fromKey || !toKey || !Array.isArray(w.points) || w.points.length < 2) continue;
        const wireKeys = [fromKey, toKey];
        for (const pt of w.points) {
            const g = `${snapToGrid(pt.x)},${snapToGrid(pt.y)}`;
            if (!gridKeys.has(g)) gridKeys.set(g, new Set());
            for (const k of wireKeys) gridKeys.get(g).add(k);
        }
    }
    for (const keys of gridKeys.values()) {
        if (keys.size < 2) continue;
        const arr = [...keys];
        for (let i = 1; i < arr.length; i++) {
            bridges.push({ solid: true, fromKey: arr[0], toKey: arr[i], points: [] });
        }
    }

    return {
        components: simComponents,
        wires: [...simWires, ...bridges],
        droppedWires: wires.length - simWires.length,
    };
}
