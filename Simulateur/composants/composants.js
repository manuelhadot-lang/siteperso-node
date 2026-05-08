const SUPPORTED_TYPES = new Set([
    "resistance",
    "capacitor",
    "diode",
    "inductor",
    "ground",
    "supply",
    "powerTerminal",
    "voltmeter",
    "ammeter",
    "ohmmeter",
    "transistorNpn"
]);

const TYPE_CONFIG = {
    resistance: { prefix: "R", defaultValue: "1000Ω" },
    capacitor: { prefix: "C", defaultValue: "10µF" },
    diode: { prefix: "D", defaultValue: "1N4148" },
    inductor: { prefix: "L", defaultValue: "10mH" },
    ground: { prefix: "M", defaultValue: "GND" },
    supply: { prefix: "P", defaultValue: "5V", defaultReference: "VCC" },
    powerTerminal: { prefix: "B", defaultValue: "5V" },
    voltmeter: { prefix: "V", defaultValue: "0 V" },
    ammeter: { prefix: "A", defaultValue: "0 A" },
    ohmmeter: { prefix: "O", defaultValue: "∞ Ω" },
    transistorNpn: { prefix: "Q", defaultValue: "2N2222" }
};

export function isSupportedComponentType(type) {
    return SUPPORTED_TYPES.has(type);
}

export function getReferencePrefix(type) {
    return TYPE_CONFIG[type]?.prefix || "X";
}

export function getDefaultValue(type) {
    return TYPE_CONFIG[type]?.defaultValue || "";
}

export function createComponent(type, x, y, options = {}) {
    const defaultRef =
        type === "supply"
            ? TYPE_CONFIG.supply.defaultReference
            : `${getReferencePrefix(type)}?`;
    return {
        id: crypto.randomUUID(),
        type,
        x,
        y,
        rotation: 0,
        reference: options.reference || defaultRef,
        value: options.value || getDefaultValue(type)
    };
}

function worldPointFromLocal(component, localX, localY) {
    const angle = ((component.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
        x: component.x + localX * cos - localY * sin,
        y: component.y + localX * sin + localY * cos
    };
}

const SUPPLY_LONG_Y = -0.205;
const SUPPLY_SHORT_Y = 0.225;
/** Borne haute / basse : nombre entier de carreaux depuis le centre (alignement grille). */
const SUPPLY_TERMINAL_STEPS = 2;
const TERMINAL_COORD_EPS = 1e-6;

function snapTerminalPoint(point) {
    const snap = (value) =>
        Number.isFinite(value)
            ? (Math.abs(value - Math.round(value)) <= TERMINAL_COORD_EPS
                ? Math.round(value)
                : Number(value.toFixed(6)))
            : value;
    return {
        x: snap(point.x),
        y: snap(point.y)
    };
}

export function getComponentBounds(component, gridStep) {
    if (component.type === "supply") {
        const rotation = ((component.rotation || 0) % 180 + 180) % 180;
        const isVertical = rotation === 90;
        const halfBar = gridStep;
        const halfThickness = 2.25 * gridStep;
        if (isVertical) {
            return {
                left: component.x - halfThickness,
                right: component.x + halfThickness,
                top: component.y - halfBar,
                bottom: component.y + halfBar
            };
        }
        return {
            left: component.x - halfBar,
            right: component.x + halfBar,
            top: component.y - halfThickness,
            bottom: component.y + halfThickness
        };
    }

    if (component.type === "powerTerminal") {
        const g = gridStep;
        const locals = [
            { x: 0, y: -0.48 * g },
            { x: -0.42 * g, y: 0.18 * g },
            { x: 0.42 * g, y: 0.18 * g },
            { x: 0, y: g },
            { x: -0.5 * g, y: -0.95 * g },
            { x: 0.5 * g, y: -0.95 * g }
        ];
        let left = Infinity;
        let right = -Infinity;
        let top = Infinity;
        let bottom = -Infinity;
        locals.forEach((p) => {
            const w = worldPointFromLocal(component, p.x, p.y);
            left = Math.min(left, w.x);
            right = Math.max(right, w.x);
            top = Math.min(top, w.y);
            bottom = Math.max(bottom, w.y);
        });
        const pad = g * 0.1;
        return {
            left: left - pad,
            right: right + pad,
            top: top - pad,
            bottom: bottom + pad
        };
    }

    if (component.type === "transistorNpn") {
        const d = gridStep;
        const locals = [
            { x: -d, y: 0 },
            { x: d, y: -2 * d },
            { x: d, y: 2 * d },
            { x: 0, y: -d },
            { x: 0, y: d },
            { x: d, y: -d },
            { x: d, y: d }
        ];
        let left = Infinity;
        let right = -Infinity;
        let top = Infinity;
        let bottom = -Infinity;
        locals.forEach((p) => {
            const w = worldPointFromLocal(component, p.x, p.y);
            left = Math.min(left, w.x);
            right = Math.max(right, w.x);
            top = Math.min(top, w.y);
            bottom = Math.max(bottom, w.y);
        });
        const pad = d * 0.12;
        return {
            left: left - pad,
            right: right + pad,
            top: top - pad,
            bottom: bottom + pad
        };
    }

    if (component.type === "ground") {
        const g = gridStep;
        const w0 = 0.28 * g;
        const w1 = 0.19 * g;
        const w2 = 0.12 * g;
        const y0 = -0.66 * g;
        const y1 = -0.48 * g;
        const y2 = -0.32 * g;
        const locals = [
            { x: 0, y: -g },
            { x: 0, y: -0.06 * g },
            { x: -w0, y: y0 },
            { x: w0, y: y0 },
            { x: -w1, y: y1 },
            { x: w1, y: y1 },
            { x: -w2, y: y2 },
            { x: w2, y: y2 }
        ];
        let left = Infinity;
        let right = -Infinity;
        let top = Infinity;
        let bottom = -Infinity;
        locals.forEach((p) => {
            const w = worldPointFromLocal(component, p.x, p.y);
            left = Math.min(left, w.x);
            right = Math.max(right, w.x);
            top = Math.min(top, w.y);
            bottom = Math.max(bottom, w.y);
        });
        const pad = g * 0.15;
        return {
            left: left - pad,
            right: right + pad,
            top: top - pad,
            bottom: bottom + pad
        };
    }

    const rotation = ((component.rotation || 0) % 180 + 180) % 180;
    const isVertical = rotation === 90;
    const halfLength = gridStep * 2;
    const halfThickness = gridStep * 0.8;

    if (isVertical) {
        return {
            left: component.x - halfThickness,
            right: component.x + halfThickness,
            top: component.y - halfLength,
            bottom: component.y + halfLength
        };
    }

    return {
        left: component.x - halfLength,
        right: component.x + halfLength,
        top: component.y - halfThickness,
        bottom: component.y + halfThickness
    };
}

export function getComponentTerminals(component, gridStep) {
    const type = String(component?.type || "").toLowerCase();
    const value = String(component?.value || "").toLowerCase();
    const isGroundLike =
        type === "ground" || type.includes("ground") || type === "sourceground" || value === "gnd";

    if (isGroundLike) {
        const p = snapTerminalPoint(worldPointFromLocal(component, 0, -gridStep));
        return { a: p, b: p };
    }

    if (component.type === "supply") {
        const d = SUPPLY_TERMINAL_STEPS * gridStep;
        return {
            a: snapTerminalPoint(worldPointFromLocal(component, 0, -d)),
            b: snapTerminalPoint(worldPointFromLocal(component, 0, d))
        };
    }

    const isPowerTerminalLike =
        type === "powerterminal" ||
        type.includes("powerterminal") ||
        component.type === "powerTerminal";

    if (isPowerTerminalLike) {
        const g = gridStep;
        const p = snapTerminalPoint(worldPointFromLocal(component, 0, g));
        return { a: p, b: p };
    }

    if (component.type === "transistorNpn") {
        const d = gridStep;
        return {
            a: snapTerminalPoint(worldPointFromLocal(component, -d, 0)),
            b: snapTerminalPoint(worldPointFromLocal(component, d, -2 * d)),
            c: snapTerminalPoint(worldPointFromLocal(component, d, 2 * d))
        };
    }

    const angle = ((component.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    function terminalAt(localX) {
        return snapTerminalPoint({
            x: component.x + localX * cos,
            y: component.y + localX * sin
        });
    }

    return {
        a: terminalAt(-2 * gridStep),
        b: terminalAt(2 * gridStep)
    };
}

function buildTransform(component, worldToScreen) {
    const angle = ((component.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return (localX, localY) => {
        const worldX = component.x + localX * cos - localY * sin;
        const worldY = component.y + localX * sin + localY * cos;
        return worldToScreen(worldX, worldY);
    };
}

function drawLeadsAndNodes(
    ctx,
    transform,
    gridStep,
    leftContactX,
    rightContactX,
    showLeftNode,
    showRightNode
) {
    const leftNode = transform(-2 * gridStep, 0);
    const leftLeadEnd = transform(leftContactX, 0);
    const rightLeadStart = transform(rightContactX, 0);
    const rightNode = transform(2 * gridStep, 0);

    ctx.beginPath();
    ctx.moveTo(leftNode.x, leftNode.y);
    ctx.lineTo(leftLeadEnd.x, leftLeadEnd.y);
    ctx.moveTo(rightLeadStart.x, rightLeadStart.y);
    ctx.lineTo(rightNode.x, rightNode.y);
    ctx.stroke();

    if (showLeftNode || showRightNode) {
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        if (showLeftNode) {
            ctx.arc(leftNode.x, leftNode.y, 4, 0, Math.PI * 2);
        }
        if (showRightNode) {
            ctx.arc(rightNode.x, rightNode.y, 4, 0, Math.PI * 2);
        }
        ctx.fill();
    }
}

function drawResistanceBody(ctx, transform, gridStep) {
    const halfHeight = gridStep / 3;
    const topLeft = transform(-gridStep, -halfHeight);
    const topRight = transform(gridStep, -halfHeight);
    const bottomRight = transform(gridStep, halfHeight);
    const bottomLeft = transform(-gridStep, halfHeight);

    ctx.beginPath();
    ctx.moveTo(topLeft.x, topLeft.y);
    ctx.lineTo(topRight.x, topRight.y);
    ctx.lineTo(bottomRight.x, bottomRight.y);
    ctx.lineTo(bottomLeft.x, bottomLeft.y);
    ctx.closePath();
    ctx.stroke();
}

function drawCapacitorBody(ctx, transform, gridStep) {
    const plateGap = gridStep * 0.24;
    const halfHeight = gridStep * 0.7;
    const leftTop = transform(-plateGap, -halfHeight);
    const leftBottom = transform(-plateGap, halfHeight);
    const rightTop = transform(plateGap, -halfHeight);
    const rightBottom = transform(plateGap, halfHeight);

    ctx.beginPath();
    ctx.moveTo(leftTop.x, leftTop.y);
    ctx.lineTo(leftBottom.x, leftBottom.y);
    ctx.moveTo(rightTop.x, rightTop.y);
    ctx.lineTo(rightBottom.x, rightBottom.y);
    ctx.stroke();
}

function drawDiodeBody(ctx, transform, gridStep) {
    const halfHeight = gridStep * 0.55;
    const baseX = -gridStep * 0.5;
    const barX = gridStep * 0.16;
    const tipX = barX;
    const top = transform(baseX, -halfHeight);
    const tip = transform(tipX, 0);
    const bottom = transform(baseX, halfHeight);
    const barTop = transform(barX, -halfHeight);
    const barBottom = transform(barX, halfHeight);

    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(barTop.x, barTop.y);
    ctx.lineTo(barBottom.x, barBottom.y);
    ctx.stroke();
}

/**
 * Alimentation : trait long 2 carreaux, trait court 1 carreau (espacement réduit),
 * verticaux centrés ; seul « + » au-dessus du long, à gauche du vertical. VCC / 5V : drawTexts.
 */
function drawSupplySymbol(ctx, transform, gridStep, color, showTopNode, showBotNode) {
    const g = gridStep;
    const longHalf = g;
    const shortHalf = 0.5 * g;
    const longY = SUPPLY_LONG_Y * g;
    const shortY = SUPPLY_SHORT_Y * g;
    const stemTopY = -SUPPLY_TERMINAL_STEPS * g;
    const stemBotY = SUPPLY_TERMINAL_STEPS * g;

    const centerTop = transform(0, longY);
    const stemTop = transform(0, stemTopY);
    ctx.beginPath();
    ctx.moveTo(centerTop.x, centerTop.y);
    ctx.lineTo(stemTop.x, stemTop.y);
    ctx.stroke();

    const tl = transform(-longHalf, longY);
    const tr = transform(longHalf, longY);
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.stroke();

    const sl = transform(-shortHalf, shortY);
    const sr = transform(shortHalf, shortY);
    ctx.beginPath();
    ctx.moveTo(sl.x, sl.y);
    ctx.lineTo(sr.x, sr.y);
    ctx.stroke();

    const centerBot = transform(0, shortY);
    const stemBot = transform(0, stemBotY);
    ctx.beginPath();
    ctx.moveTo(centerBot.x, centerBot.y);
    ctx.lineTo(stemBot.x, stemBot.y);
    ctx.stroke();

    const topNode = stemTop;
    const botNode = stemBot;
    if (showTopNode || showBotNode) {
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        if (showTopNode) {
            ctx.arc(topNode.x, topNode.y, 4, 0, Math.PI * 2);
        }
        if (showBotNode) {
            ctx.arc(botNode.x, botNode.y, 4, 0, Math.PI * 2);
        }
        ctx.fill();
    }

    const fontPx = Math.max(11, Math.round(g * 0.38));
    ctx.fillStyle = color;
    ctx.font = `600 ${fontPx}px Segoe UI, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    const pPlus = transform(-0.38 * g, longY - 0.26 * g);
    ctx.fillText("+", pPlus.x, pPlus.y);
}

/** Borne d'alimentation : triangle vers le haut sur ~1 carreau, connexion unique en bas (repère local). */
function drawPowerTerminalSymbol(ctx, transform, gridStep, showNode) {
    const g = gridStep;
    const apex = transform(0, -0.48 * g);
    const bl = transform(-0.42 * g, 0.18 * g);
    const br = transform(0.42 * g, 0.18 * g);
    const stem0 = transform(0, 0.18 * g);
    const stem1 = transform(0, g);

    ctx.beginPath();
    ctx.moveTo(apex.x, apex.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.lineTo(br.x, br.y);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(stem0.x, stem0.y);
    ctx.lineTo(stem1.x, stem1.y);
    ctx.stroke();

    if (showNode) {
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(stem1.x, stem1.y, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawGroundSymbol(ctx, transform, gridStep, showNode) {
    const g = gridStep;
    // Un carreau de haut (borne y=-g → bas ~y=0), traits horizontaux resserrés et plus étroits.
    const top = transform(0, -g);
    const join = transform(0, -0.74 * g);
    const w0 = 0.28 * g;
    const w1 = 0.19 * g;
    const w2 = 0.12 * g;
    const y0 = -0.66 * g;
    const y1 = -0.48 * g;
    const y2 = -0.32 * g;

    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(join.x, join.y);
    ctx.stroke();

    const p0l = transform(-w0, y0);
    const p0r = transform(w0, y0);
    ctx.beginPath();
    ctx.moveTo(p0l.x, p0l.y);
    ctx.lineTo(p0r.x, p0r.y);
    ctx.stroke();

    const p1l = transform(-w1, y1);
    const p1r = transform(w1, y1);
    ctx.beginPath();
    ctx.moveTo(p1l.x, p1l.y);
    ctx.lineTo(p1r.x, p1r.y);
    ctx.stroke();

    const p2l = transform(-w2, y2);
    const p2r = transform(w2, y2);
    ctx.beginPath();
    ctx.moveTo(p2l.x, p2l.y);
    ctx.lineTo(p2r.x, p2r.y);
    ctx.stroke();

    if (showNode) {
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(top.x, top.y, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

/**
 * Transistor NPN : base à gauche (a), collecteur en haut à droite (b), émetteur en bas à droite (c).
 * Repère local : centre du symbole ; pas = gridStep (comme sur la grille de référence).
 */
function drawTransistorNpnSymbol(ctx, transform, gridStep, hiddenNodeKeys, terminals) {
    const d = gridStep;
    const baseLead = transform(-d, 0);
    const junction = transform(0, 0);
    ctx.beginPath();
    ctx.moveTo(baseLead.x, baseLead.y);
    ctx.lineTo(junction.x, junction.y);
    ctx.stroke();

    const barTop = transform(0, -d);
    const barBot = transform(0, d);
    ctx.beginPath();
    ctx.moveTo(barTop.x, barTop.y);
    ctx.lineTo(barBot.x, barBot.y);
    ctx.stroke();

    const collCorner = transform(d, -d);
    const collTip = transform(d, -2 * d);
    ctx.beginPath();
    ctx.moveTo(junction.x, junction.y);
    ctx.lineTo(collCorner.x, collCorner.y);
    ctx.lineTo(collTip.x, collTip.y);
    ctx.stroke();

    const emitCorner = transform(d, d);
    const emitTip = transform(d, 2 * d);
    ctx.beginPath();
    ctx.moveTo(junction.x, junction.y);
    ctx.lineTo(emitCorner.x, emitCorner.y);
    ctx.stroke();

    const ax = emitCorner.x - junction.x;
    const ay = emitCorner.y - junction.y;
    const len = Math.hypot(ax, ay) || 1;
    const ux = ax / len;
    const uy = ay / len;
    const px = -uy;
    const py = ux;
    const as = d * 0.28;
    const tip = transform(d * 0.82, d * 0.82);
    const w1 = transform(d * 0.82 - ux * as * 0.5 + px * as * 0.42, d * 0.82 - uy * as * 0.5 + py * as * 0.42);
    const w2 = transform(d * 0.82 - ux * as * 0.5 - px * as * 0.42, d * 0.82 - uy * as * 0.5 - py * as * 0.42);
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(w1.x, w1.y);
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(w2.x, w2.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(emitCorner.x, emitCorner.y);
    ctx.lineTo(emitTip.x, emitTip.y);
    ctx.stroke();

    const screenNodes = [baseLead, collTip, emitTip];
    const keys = [`${terminals.a.x}:${terminals.a.y}`, `${terminals.b.x}:${terminals.b.y}`, `${terminals.c.x}:${terminals.c.y}`];
    ctx.fillStyle = "#ef4444";
    for (let i = 0; i < 3; i += 1) {
        if (hiddenNodeKeys.has(keys[i])) {
            continue;
        }
        const p = screenNodes[i];
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

/** Rayon du cercle des appareils (V / A / Ω) : aligné sur les extrémités des fils horizontaux. */
const METER_BODY_RADIUS = 0.55;

function drawMeterBody(ctx, transform, gridStep, letter) {
    const radius = gridStep * METER_BODY_RADIUS;
    const start = transform(radius, 0);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    for (let i = 1; i <= 48; i += 1) {
        const ang = (i / 48) * Math.PI * 2;
        const p = transform(Math.cos(ang) * radius, Math.sin(ang) * radius);
        ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();

    const c = transform(0, 0);
    const fontPx = Math.max(10, Math.round(gridStep * 0.5));
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = `700 ${fontPx}px Segoe UI, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(letter, c.x, c.y);
}

function drawInductorBody(ctx, transform, gridStep) {
    // Bobine plus large: 3 grandes spires entre -1 pas et +1 pas.
    const turns = 3;
    const radius = gridStep / 3;
    const startX = -gridStep;
    const samplesPerTurn = 16;

    const start = transform(startX, 0);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);

    for (let turn = 0; turn < turns; turn += 1) {
        const centerX = startX + radius + turn * radius * 2;
        for (let step = 0; step <= samplesPerTurn; step += 1) {
            const angle = Math.PI - (step / samplesPerTurn) * Math.PI;
            const localX = centerX + radius * Math.cos(angle);
            const localY = -radius * Math.sin(angle);
            const point = transform(localX, localY);
            ctx.lineTo(point.x, point.y);
        }
    }

    ctx.stroke();
}

function drawTexts(ctx, component, worldToScreen, gridStep, color) {
    if (component.type === "ground") {
        const text = component.value || getDefaultValue(component.type);
        const g = gridStep;
        // Toujours sous le symbole (repère local), proche du dernier trait — pas de référence M×.
        const w = worldPointFromLocal(component, 0, 0.16 * g);
        const p = worldToScreen(w.x, w.y);
        ctx.fillStyle = color;
        ctx.font = "13px Segoe UI, sans-serif";
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        ctx.fillText(text, p.x, p.y);
        return;
    }

    if (component.type === "powerTerminal") {
        const g = gridStep;
        const text = component.value || getDefaultValue(component.type);
        const apexW = worldPointFromLocal(component, 0, -0.48 * g);
        const p = worldToScreen(apexW.x, apexW.y);
        const liftPx = 12;
        ctx.fillStyle = color;
        ctx.font = "13px Segoe UI, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(text, p.x, p.y - liftPx);
        return;
    }

    if (component.type === "transistorNpn") {
        const g = gridStep;
        const norm = ((component.rotation || 0) % 360 + 360) % 360;
        // Même pile (référence puis valeur), alignée à gauche, ancre coin haut-gauche du texte — repère local du symbole.
        // 0° / 180° : une seule ancre tourne avec le composant (bas à gauche en 0°, haut à droite en 180°).
        // 90° : base en haut, texte à gauche du pied de base, remonté.
        // 270° : base en bas, texte à gauche du pied, dans le coin bas-gauche sous la barre.
        let ax;
        let ay;
        if (norm === 0 || norm === 180) {
            ax = -0.52 * g;
            ay = 1.0 * g;
        } else if (norm === 90) {
            ax = -0.78 * g;
            ay = 0.58 * g;
        } else {
            ax = -0.44 * g;
            ay = -0.58 * g;
        }
        const origin = worldPointFromLocal(component, ax, ay);
        const p = worldToScreen(origin.x, origin.y);
        const lineHeight = 15;
        ctx.fillStyle = color;
        ctx.font = "13px Segoe UI, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(component.reference || `${getReferencePrefix(component.type)}?`, p.x, p.y);
        ctx.fillText(component.value || getDefaultValue(component.type), p.x, p.y + lineHeight);
        return;
    }

    if (component.type === "supply") {
        const g = gridStep;
        const norm = ((component.rotation || 0) % 360 + 360) % 360;
        const isVert = norm === 90 || norm === 270;
        const ly = SUPPLY_LONG_Y * g;
        const sy = SUPPLY_SHORT_Y * g;
        const refW = worldPointFromLocal(
            component,
            isVert ? -1.18 * g : -1.22 * g,
            isVert ? 0 : ly - 0.58 * g
        );
        const valW = worldPointFromLocal(
            component,
            isVert ? 1.18 * g : 1.22 * g,
            isVert ? 0 : sy + 0.58 * g
        );
        const labelPoint = worldToScreen(refW.x, refW.y);
        const valuePoint = worldToScreen(valW.x, valW.y);
        ctx.fillStyle = color;
        ctx.font = "13px Segoe UI, sans-serif";
        ctx.textBaseline = "middle";
        ctx.textAlign = "right";
        ctx.fillText(component.reference || `${getReferencePrefix(component.type)}?`, labelPoint.x, labelPoint.y);
        ctx.textAlign = "left";
        ctx.fillText(component.value || getDefaultValue(component.type), valuePoint.x, valuePoint.y);
        return;
    }

    const normalizedRotation = ((component.rotation || 0) % 360 + 360) % 360;
    const isVertical = normalizedRotation === 90 || normalizedRotation === 270;
    const labelOffset = isVertical
        ? { x: -gridStep * 0.95, y: 0 }
        : { x: 0, y: -gridStep * 1.02 };
    const valueOffset = isVertical
        ? { x: gridStep * 0.95, y: 0 }
        : { x: 0, y: gridStep * 1.02 };
    const labelPoint = worldToScreen(component.x + labelOffset.x, component.y + labelOffset.y);
    const valuePoint = worldToScreen(component.x + valueOffset.x, component.y + valueOffset.y);

    ctx.fillStyle = color;
    ctx.font = "13px Segoe UI, sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = isVertical ? "right" : "center";
    ctx.fillText(component.reference || `${getReferencePrefix(component.type)}?`, labelPoint.x, labelPoint.y);
    ctx.textAlign = isVertical ? "left" : "center";
    ctx.fillText(component.value || getDefaultValue(component.type), valuePoint.x, valuePoint.y);
}

export function drawComponent(
    ctx,
    component,
    worldToScreen,
    gridStep,
    color,
    hiddenNodeKeys = new Set(),
    omitLabels = false
) {
    const transform = buildTransform(component, worldToScreen);
    let leftContactX = -gridStep;
    let rightContactX = gridStep;
    const terminals = getComponentTerminals(component, gridStep);
    const leftKey = `${terminals.a.x}:${terminals.a.y}`;
    const rightKey = `${terminals.b.x}:${terminals.b.y}`;
    const showLeftNode = !hiddenNodeKeys.has(leftKey);
    const showRightNode = !hiddenNodeKeys.has(rightKey);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (component.type === "ground") {
        const showGroundNode = !hiddenNodeKeys.has(leftKey);
        drawGroundSymbol(ctx, transform, gridStep, showGroundNode);
    } else if (component.type === "supply") {
        drawSupplySymbol(ctx, transform, gridStep, color, showLeftNode, showRightNode);
    } else if (component.type === "powerTerminal") {
        const showNode = !hiddenNodeKeys.has(leftKey);
        drawPowerTerminalSymbol(ctx, transform, gridStep, showNode);
    } else if (component.type === "transistorNpn") {
        drawTransistorNpnSymbol(ctx, transform, gridStep, hiddenNodeKeys, terminals);
    } else if (component.type === "capacitor") {
        leftContactX = -gridStep * 0.24;
        rightContactX = gridStep * 0.24;
        drawLeadsAndNodes(
            ctx,
            transform,
            gridStep,
            leftContactX,
            rightContactX,
            showLeftNode,
            showRightNode
        );
        drawCapacitorBody(ctx, transform, gridStep);
    } else if (component.type === "diode") {
        leftContactX = -gridStep * 0.5;
        rightContactX = gridStep * 0.16;
        drawLeadsAndNodes(
            ctx,
            transform,
            gridStep,
            leftContactX,
            rightContactX,
            showLeftNode,
            showRightNode
        );
        drawDiodeBody(ctx, transform, gridStep);
    } else if (component.type === "inductor") {
        drawLeadsAndNodes(
            ctx,
            transform,
            gridStep,
            leftContactX,
            rightContactX,
            showLeftNode,
            showRightNode
        );
        drawInductorBody(ctx, transform, gridStep);
    } else if (component.type === "voltmeter") {
        const meterLead = gridStep * METER_BODY_RADIUS;
        drawLeadsAndNodes(
            ctx,
            transform,
            gridStep,
            -meterLead,
            meterLead,
            showLeftNode,
            showRightNode
        );
        drawMeterBody(ctx, transform, gridStep, "V");
    } else if (component.type === "ammeter") {
        const meterLead = gridStep * METER_BODY_RADIUS;
        drawLeadsAndNodes(
            ctx,
            transform,
            gridStep,
            -meterLead,
            meterLead,
            showLeftNode,
            showRightNode
        );
        drawMeterBody(ctx, transform, gridStep, "A");
    } else if (component.type === "ohmmeter") {
        const meterLead = gridStep * METER_BODY_RADIUS;
        drawLeadsAndNodes(
            ctx,
            transform,
            gridStep,
            -meterLead,
            meterLead,
            showLeftNode,
            showRightNode
        );
        drawMeterBody(ctx, transform, gridStep, "Ω");
    } else {
        drawLeadsAndNodes(
            ctx,
            transform,
            gridStep,
            leftContactX,
            rightContactX,
            showLeftNode,
            showRightNode
        );
        drawResistanceBody(ctx, transform, gridStep);
    }

    if (!omitLabels) {
        drawTexts(ctx, component, worldToScreen, gridStep, color);
    }
    ctx.restore();
}

