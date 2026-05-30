// geometry.js
import { circuit, flags, simulationResults, snapToGrid } from './state.js';

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

    if (['battery', 'resistor', 'voltmeter', 'led'].includes(comp.type)) {
        localPts = [{ id: `${comp.label}_in`, x: -40, y: 0 }, { id: `${comp.label}_out`, x: 40, y: 0 }];
    } else if (comp.type === 'gimp') {
        localPts = [
            { id: `${comp.label}_in`, x: 0, y: 40 },
            { id: `${comp.label}_out`, x: comp.flipX ? -40 : 40, y: 0 },
        ];
    } else if (comp.type === 'nand') {
        localPts = [{ id: `${comp.label}_inA`, x: -40, y: -20 }, { id: `${comp.label}_inB`, x: -40, y: 20 }, { id: `${comp.label}_out`, x: 40, y: 0 }];
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
    } else if (['gnd', 'vcc', 'logic_terminal'].includes(comp.type)) {
        localPts = [{ id: `${comp.label}_out`, x: 40, y: 0 }];
    }

    localPts.forEach(pt => {
        let lx = pt.x;
        let ly = pt.y;
        if (comp.type !== 'gimp' && comp.type !== 'd_flipflop' && comp.type !== 'jk_flipflop') {
            const rx = lx * Math.cos(rad) - ly * Math.sin(rad);
            const ry = lx * Math.sin(rad) + ly * Math.cos(rad);
            lx = rx;
            ly = ry;
        }
        list.push({ id: pt.id, x: snapToGrid(comp.x + lx), y: snapToGrid(comp.y + ly) });
    });
    return list;
}

/** Zone cliquable pour sélectionner un composant (coords schéma). */
export function componentHitTest(comp, mx, my) {
    const dx = Math.abs(mx - comp.x);
    const dy = Math.abs(my - comp.y);
    if (comp.type === 'logic_terminal') return dx < 38 && dy < 22;
    if (comp.type === 'd_flipflop' || comp.type === 'jk_flipflop') return dx < 45 && dy < 68;
    if (comp.type === 'gimp') return dx < 45 && dy < 50;
    return dx < 30 && dy < 30;
}

export function isJonctionConnected(jonctionId) {
    return circuit.wires.some(w => w.fromJonctionId === jonctionId || w.toJonctionId === jonctionId);
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
                if (comp.type === 'battery' && jId.endsWith('_out')) return comp.value !== undefined ? comp.value : 5;
            }
        }
    }
    return 0;
}