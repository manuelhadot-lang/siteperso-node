export const SUPPORTED_COMPONENT_TYPES = ["resistance", "supply", "ground", "voltmeter"];

const TYPE_CONFIG = {
    resistance: { prefix: "R", defaultValue: "1000Ω" },
    supply: { prefix: "V", defaultValue: "5V", defaultReference: "VCC" },
    ground: { prefix: "", defaultValue: "GND" },
    voltmeter: { prefix: "V", defaultValue: "0 V" }
};

const SUPPLY_TERMINAL_STEPS = 3;
const SUPPLY_LONG_Y = -1;

function snapTerminalPoint(point) {
    return { x: point.x, y: point.y };
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

export function getDefaultReference(type) {
    if (type === "supply") {
        return TYPE_CONFIG.supply.defaultReference || "VCC";
    }
    return `${TYPE_CONFIG[type]?.prefix || "?"}?`;
}

export function getReferencePrefix(type) {
    return TYPE_CONFIG[type]?.prefix || "?";
}

export function getDefaultValue(type) {
    return TYPE_CONFIG[type]?.defaultValue || "";
}

export function supportsComponent(type) {
    return SUPPORTED_COMPONENT_TYPES.includes(type);
}

export function getComponentTerminals(component, gridStep) {
    const type = String(component?.type || "").toLowerCase();
    const value = String(component?.value || "").toLowerCase();

    if (type === "ground" || type.includes("ground") || value === "gnd") {
        const p = snapTerminalPoint(worldPointFromLocal(component, 0, -gridStep));
        return { a: p, b: p };
    }

    if (type === "supply") {
        const d = SUPPLY_TERMINAL_STEPS * gridStep;
        return {
            a: snapTerminalPoint(worldPointFromLocal(component, 0, -d)),
            b: snapTerminalPoint(worldPointFromLocal(component, 0, d))
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

function drawLeads(ctx, transform, gridStep, leftContactX, rightContactX, showLeftNode, showRightNode) {
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

function drawGroundSymbol(ctx, transform, gridStep, showNode) {
    const g = gridStep;
    const top = transform(0, -g);
    const y0 = transform(0, 0).y;

    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(transform(0, 0).x, transform(0, 0).y);
    ctx.stroke();

    const baseY = transform(0, g * 0.35).y;
    const w = g * 0.45;
    const cx = transform(0, 0).x;
    ctx.beginPath();
    ctx.moveTo(cx - w, baseY);
    ctx.lineTo(cx + w, baseY);
    ctx.stroke();

    for (let i = -1; i <= 1; i += 1) {
        const x = cx + i * w * 0.45;
        ctx.beginPath();
        ctx.moveTo(x, baseY + 4);
        ctx.lineTo(x - 6, baseY + 14);
        ctx.stroke();
    }

    if (showNode) {
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(top.x, top.y, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawSupplySymbol(ctx, transform, gridStep, color, showTop, showBot) {
    const g = gridStep;
    const longHalf = g;
    const shortHalf = g * 0.5;
    const longY = SUPPLY_LONG_Y * g;
    const shortY = 0;
    const stemTop = transform(0, -SUPPLY_TERMINAL_STEPS * g);
    const stemBot = transform(0, SUPPLY_TERMINAL_STEPS * g);
    const centerTop = transform(0, longY);

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

    ctx.fillStyle = color;
    ctx.font = `${Math.round(g * 0.45)}px sans-serif`;
    const plus = transform(-longHalf * 0.4, longY - g * 0.15);
    ctx.textBaseline = "middle";
    ctx.fillText("+", plus.x, plus.y);

    if (showTop) {
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(stemTop.x, stemTop.y, 4, 0, Math.PI * 2);
        ctx.fill();
    }
    if (showBot) {
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(stemBot.x, stemBot.y, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawVoltmeterSymbol(ctx, transform, gridStep) {
    const r = gridStep * 1.1;
    const c = transform(0, 0);
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = `bold ${Math.round(r * 0.9)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("V", c.x, c.y);
}

export function drawComponent(ctx, component, worldToScreen, gridStep, color, hiddenNodeKeys = new Set()) {
    const transform = buildTransform(component, worldToScreen);
    const terminals = getComponentTerminals(component, gridStep);
    const leftKey = `${terminals.a.x}:${terminals.a.y}`;
    const rightKey = `${terminals.b.x}:${terminals.b.y}`;
    const showLeft = !hiddenNodeKeys.has(leftKey);
    const showRight = !hiddenNodeKeys.has(rightKey);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (component.type === "ground") {
        drawGroundSymbol(ctx, transform, gridStep, showLeft);
    } else if (component.type === "supply") {
        drawSupplySymbol(ctx, transform, gridStep, color, showLeft, showRight);
    } else if (component.type === "voltmeter") {
        drawLeads(ctx, transform, gridStep, -gridStep * 0.9, gridStep * 0.9, showLeft, showRight);
        drawVoltmeterSymbol(ctx, transform, gridStep);
    } else {
        drawLeads(ctx, transform, gridStep, -gridStep, gridStep, showLeft, showRight);
        const h = gridStep / 3;
        const p1 = transform(-gridStep, -h);
        const p2 = transform(gridStep, h);
        ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
    }

    const ref = component.reference || getDefaultReference(component.type);
    const val = component.value || getDefaultValue(component.type);
    const labelPt = worldToScreen(component.x - gridStep * 1.1, component.y - gridStep * 1.1);
    const valPt = worldToScreen(component.x + gridStep * 0.2, component.y + gridStep * 1.15);
    ctx.font = "13px Segoe UI, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(ref, labelPt.x, labelPt.y);
    ctx.textBaseline = "top";
    ctx.fillText(val, valPt.x, valPt.y);

    ctx.restore();
}
