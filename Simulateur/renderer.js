// renderer.js
import { canvas, ctx, GRID_SIZE, scale, pan, flags, circuit, interaction, zone, menuDrag, snapToGrid, simulationResults } from './state.js';
import { getComponentJonctions, isJonctionConnected, getVoltageAtJonction } from './geometry.js';
import { getGimpPanelHeight, formatGimpLabel } from './gimp-panel.js';
import { getAnimatedLedCurrent } from './led-animation.js';

export function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - 45 - getGimpPanelHeight();
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
    const noRotate = comp.type === 'gimp' || comp.type === 'd_flipflop' || comp.type === 'jk_flipflop';
    const rot = noRotate ? 0 : (comp.rotation || 0);
    ctx.rotate(rot * Math.PI / 180);

    if (interaction.selectedComponents.includes(comp)) {
        ctx.strokeStyle = '#00bcd4'; ctx.lineWidth = 1.5;
        if (comp.type === 'jk_flipflop' || comp.type === 'd_flipflop') ctx.strokeRect(-45, -68, 90, 136);
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
        ctx.beginPath(); ctx.moveTo(-5, -15); ctx.lineTo(-5, 15); ctx.stroke();
        ctx.lineWidth = 4; 
        ctx.beginPath(); ctx.moveTo(5, -8); ctx.lineTo(5, 8); ctx.stroke();
        ctx.lineWidth = 2; 
        ctx.beginPath(); 
        ctx.moveTo(-40, 0); ctx.lineTo(-5, 0); 
        ctx.moveTo(5, 0); ctx.lineTo(40, 0); 
        ctx.stroke();
        let val = comp.value !== undefined ? comp.value + "V" : "5V";
        drawLabels(comp.label, val, rot);
    } 
    else if (comp.type === 'resistor') {
        ctx.strokeStyle = '#007acc'; ctx.lineWidth = 2; ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(-20, -10, 40, 20); ctx.strokeRect(-20, -10, 40, 20);
        ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-20, 0); ctx.moveTo(20, 0); ctx.lineTo(40, 0); ctx.stroke();
        drawLabels(comp.label, comp.value || "1Kohm", rot);
    } 
    else if (comp.type === 'nand') {
        ctx.strokeStyle = '#00ca71'; ctx.lineWidth = 2; ctx.fillStyle = '#1e1e1e';
        ctx.beginPath(); ctx.moveTo(-20, -20); ctx.lineTo(0, -20); ctx.arc(0, 0, 20, -Math.PI/2, Math.PI/2); ctx.lineTo(-20, 20); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(24, 0, 4, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#1e1e1e'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(-40, -20); ctx.lineTo(-20, -20); ctx.moveTo(-40, 20); ctx.lineTo(-20, 20); ctx.moveTo(28, 0); ctx.lineTo(40, 0); ctx.stroke();
        drawLabels(comp.label, null, rot);
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
    else if (comp.type === 'led') {
        let isLit = false;
        if (flags.isSimulating) {
            const animI = getAnimatedLedCurrent(comp.label);
            if (animI != null) {
                isLit = animI > 1e-4;
            } else {
                const ledMeasure = simulationResults.leds && simulationResults.leds[comp.label];
                if (ledMeasure && typeof ledMeasure.current === 'number' && ledMeasure.current > 1e-4) {
                    isLit = true;
                } else {
                    let vAnode = getVoltageAtJonction(`${comp.label}_in`);
                    let vCathode = getVoltageAtJonction(`${comp.label}_out`);
                    if ((vAnode - vCathode) >= 1.5) isLit = true;
                }
            }
        }
        const ledBodyColor = isLit ? '#ff1744' : '#4a030a'; 
        ctx.strokeStyle = isLit ? '#ff6b81' : '#ff1744';
        ctx.lineWidth = 2; ctx.fillStyle = ledBodyColor;
        if (isLit) {
            ctx.save(); ctx.shadowBlur = 20; ctx.shadowColor = '#ff1744';
            ctx.beginPath(); ctx.moveTo(-15, -15); ctx.lineTo(10, 0); ctx.lineTo(-15, 15); ctx.closePath(); ctx.fill(); ctx.restore();
        } else {
            ctx.beginPath(); ctx.moveTo(-15, -15); ctx.lineTo(10, 0); ctx.lineTo(-15, 15); ctx.closePath(); ctx.fill();
        }
        ctx.beginPath(); ctx.moveTo(10, -15); ctx.lineTo(10, 15); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-15, 0); ctx.moveTo(10, 0); ctx.lineTo(40, 0); ctx.stroke();
        ctx.save();
        ctx.strokeStyle = isLit ? '#ff8a9a' : '#730510';
        ctx.beginPath(); ctx.moveTo(-5, -18); ctx.lineTo(5, -28); ctx.moveTo(5, -28); ctx.lineTo(0, -28); ctx.moveTo(5, -28); ctx.lineTo(5, -23);
        ctx.moveTo(5, -14); ctx.lineTo(15, -24); ctx.moveTo(15, -24); ctx.lineTo(10, -24); ctx.moveTo(15, -24); ctx.lineTo(15, -19); ctx.stroke();
        ctx.restore();
        drawLabels(comp.label, isLit ? "ALLUMÉE" : "ÉTEINTE", rot);
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
        drawLabels(comp.label, formatGimpLabel(comp), 0);
    }
    else if (comp.type === 'voltmeter') {
        ctx.strokeStyle = '#00bcd4'; ctx.lineWidth = 2; ctx.fillStyle = '#2a3b4c';
        ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#00bcd4'; ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-20, 0); ctx.moveTo(20, 0); ctx.lineTo(40, 0); ctx.stroke();

        let displayValue = '0.0';
        if (flags.isSimulating && simulationResults.voltmeters && simulationResults.voltmeters[comp.label] !== undefined) {
            let measureData = simulationResults.voltmeters[comp.label];
            if (measureData && typeof measureData === 'object' && measureData.voltage !== undefined) {
                displayValue = typeof measureData.voltage === 'number' ? measureData.voltage.toFixed(1) : String(measureData.voltage);
            } else if (typeof measureData === 'number') { displayValue = measureData.toFixed(1); }
        }
        ctx.save(); ctx.rotate(-rot * Math.PI / 180); 
        ctx.fillStyle = '#0d1b1e'; ctx.fillRect(-12, -7, 24, 14);
        ctx.fillStyle = '#00ff66'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; 
        ctx.fillText(displayValue, -2, 0); ctx.font = '7px Arial'; ctx.fillText('V', 8, 1);
        ctx.restore(); drawLabels(comp.label, null, rot);
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