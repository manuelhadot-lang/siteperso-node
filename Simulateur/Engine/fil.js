export function makeNodeKey(x, y) {
    return `${x}:${y}`;
}

/** Tolérance pour trait horizontal / vertical (bornes avec rotation = flottants proches de la grille) */
const WIRE_ALIGN_EPS = 1;

export function isSamePoint(ax, ay, bx, by, eps = WIRE_ALIGN_EPS) {
    return Math.abs(ax - bx) < eps && Math.abs(ay - by) < eps;
}

export function isOrthogonalStraight(ax, ay, bx, by, eps = WIRE_ALIGN_EPS) {
    return Math.abs(ax - bx) < eps || Math.abs(ay - by) < eps;
}

/**
 * Chemin en angles droits (un coude) entre deux points.
 * @param {boolean | null} horizFirstOpt - true: d'abord horizontal ; false: d'abord vertical ; null/undefined: heuristique
 */
export function buildOrthogonalPath(ax, ay, bx, by, horizFirstOpt = null) {
    if (isSamePoint(ax, ay, bx, by)) {
        return [{ x: ax, y: ay }];
    }
    if (isOrthogonalStraight(ax, ay, bx, by)) {
        return [
            { x: ax, y: ay },
            { x: bx, y: by }
        ];
    }
    let horizFirst;
    if (typeof horizFirstOpt === "boolean") {
        horizFirst = horizFirstOpt;
    } else {
        horizFirst = Math.abs(bx - ax) >= Math.abs(by - ay);
    }
    if (horizFirst) {
        return [
            { x: ax, y: ay },
            { x: bx, y: ay },
            { x: bx, y: by }
        ];
    }
    return [
        { x: ax, y: ay },
        { x: ax, y: by },
        { x: bx, y: by }
    ];
}

function ensureWirePoints(wire) {
    if (wire.points && Array.isArray(wire.points) && wire.points.length > 0) {
        return wire.points.map((p) => ({
            x: typeof p.x === "number" ? p.x : p[0],
            y: typeof p.y === "number" ? p.y : p[1]
        }));
    }
    if (typeof wire.horizFirst === "boolean") {
        return buildOrthogonalPath(wire.ax, wire.ay, wire.bx, wire.by, wire.horizFirst);
    }
    return buildOrthogonalPath(wire.ax, wire.ay, wire.bx, wire.by);
}

export function createWire(ax, ay, bx, by, horizFirstOpt = null) {
    const points = buildOrthogonalPath(ax, ay, bx, by, horizFirstOpt);
    const wire = {
        id: crypto.randomUUID(),
        ax,
        ay,
        bx,
        by,
        points
    };
    if (typeof horizFirstOpt === "boolean") {
        wire.horizFirst = horizFirstOpt;
    }
    return wire;
}

export function normalizeWire(rawWire) {
    if (!rawWire) {
        return null;
    }
    const isValid =
        typeof rawWire.ax === "number" &&
        typeof rawWire.ay === "number" &&
        typeof rawWire.bx === "number" &&
        typeof rawWire.by === "number";

    if (!isValid) {
        return null;
    }

    const ax = rawWire.ax;
    const ay = rawWire.ay;
    const bx = rawWire.bx;
    const by = rawWire.by;
    const horizFirst =
        typeof rawWire.horizFirst === "boolean" ? rawWire.horizFirst : null;

    let points = rawWire.points;
    if (!Array.isArray(points) || points.length < 2) {
        points = buildOrthogonalPath(ax, ay, bx, by, horizFirst);
    } else {
        points = points.map((p) => ({
            x: typeof p.x === "number" ? p.x : p[0],
            y: typeof p.y === "number" ? p.y : p[1]
        }));
    }

    const normalized = {
        id: typeof rawWire.id === "string" ? rawWire.id : crypto.randomUUID(),
        ax,
        ay,
        bx,
        by,
        points
    };
    if (typeof horizFirst === "boolean") {
        normalized.horizFirst = horizFirst;
    }
    return normalized;
}

function strokePolyline(ctx, points, worldToScreen) {
    if (!points.length) {
        return;
    }
    const first = worldToScreen(points[0].x, points[0].y);
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < points.length; i += 1) {
        const p = worldToScreen(points[i].x, points[i].y);
        ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
}

export function drawWire(ctx, wire, worldToScreen, color = "#60a5fa", lineWidth = 2) {
    const points = ensureWirePoints(wire);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
    ctx.miterLimit = 4;
    ctx.setLineDash([]);
    strokePolyline(ctx, points, worldToScreen);
    ctx.restore();
}

export function drawOrthogonalPreview(
    ctx,
    ax,
    ay,
    bx,
    by,
    worldToScreen,
    color,
    horizFirstOpt = null
) {
    const points = buildOrthogonalPath(ax, ay, bx, by, horizFirstOpt);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
    ctx.setLineDash([6, 4]);
    strokePolyline(ctx, points, worldToScreen);
    ctx.restore();
}
