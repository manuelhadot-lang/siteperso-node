import { drawComponent, getDefaultValue, supportsComponent, getComponentTerminals } from "./composants/composants.js";

const GRID_STEP = 40;
const ZOOM_MIN = 0.35;
const ZOOM_MAX = 4;
const ZOOM_FACTOR = 1.12;

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");

let zoom = 1;
let offsetX = 0;
let offsetY = 0;

/** @type {{ id:string, type:string, x:number, y:number, rotation?:number, reference:string, value:string }[]} */
let components = [];
/** @type {{ id:string, points:{x:number,y:number}[]}[]} */
let wires = [];

let activeTool = "select";
let selectedId = null;

let wireDraftStart = null;
let isPanning = false;
let panStart = null;

/** @type {{ comp:any, grabX:number, grabY:number}|null} */
let componentDrag = null;
const DRAGWIRE_EPS = 0.01;

function snapToGrid(x, y) {
    return {
        x: Math.round(x / GRID_STEP) * GRID_STEP,
        y: Math.round(y / GRID_STEP) * GRID_STEP
    };
}

function worldToScreen(wx, wy) {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    return {
        x: (wx + offsetX) * zoom + cx,
        y: (wy + offsetY) * zoom + cy
    };
}

function screenToWorld(sx, sy) {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    return {
        x: (sx - cx) / zoom - offsetX,
        y: (sy - cy) / zoom - offsetY
    };
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - document.querySelector(".toolbar").offsetHeight;
}

function setStatus(kind, lines) {
    statusEl.textContent = lines.filter(Boolean).join("\n") || "";
    statusEl.className = kind ? kind : "";
}

function sanitizeMeterReference(ref, fallback = "VM") {
    const cleaned = String(ref || "")
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, "");
    return cleaned || fallback;
}

const nextPrefix = { R: 1, VM: 1 };

function newReference(type) {
    if (type === "supply") {
        return "VCC";
    }
    if (type === "ground") {
        return "";
    }
    if (type === "voltmeter") {
        const n = nextPrefix.VM++;
        return `VM${n}`;
    }
    if (type === "resistance") {
        const n = nextPrefix.R++;
        return `R${n}`;
    }
    return "?";
}

function createComponent(type, x, y) {
    components.push({
        id: crypto.randomUUID(),
        type,
        x,
        y,
        rotation: 0,
        reference: newReference(type),
        value: getDefaultValue(type)
    });
}

function findComponentAt(world) {
    for (let i = components.length - 1; i >= 0; i -= 1) {
        const c = components[i];
        const d =
            c.type === "supply"
                ? GRID_STEP * 3.25
                : c.type === "ground"
                  ? GRID_STEP * 1.6
                  : GRID_STEP * 2;
        if (Math.abs(world.x - c.x) <= d && Math.abs(world.y - c.y) <= d) {
            return c;
        }
    }
    return null;
}

function terminalsSnapshot(comp, cx, cy) {
    const c = { ...comp, x: cx, y: cy };
    return getComponentTerminals(c, GRID_STEP);
}

function nearGridPoint(px, py, ax, ay) {
    return Math.abs(px - ax) < DRAGWIRE_EPS && Math.abs(py - ay) < DRAGWIRE_EPS;
}

function rewiresAfterComponentMove(comp, prevX, prevY) {
    const old = terminalsSnapshot(comp, prevX, prevY);
    const neu = getComponentTerminals(comp, GRID_STEP);
    ["a", "b", "c"].forEach((key) => {
        const o = old[key];
        const n = neu[key];
        if (!o || !n) {
            return;
        }
        for (const wire of wires) {
            const pts = wire.points || [];
            for (const p of pts) {
                if (nearGridPoint(p.x, p.y, o.x, o.y)) {
                    p.x = n.x;
                    p.y = n.y;
                }
            }
        }
    });
}

function orthoWire(a, b) {
    const snappedA = snapToGrid(a.x, a.y);
    const snappedB = snapToGrid(b.x, b.y);
    if (Math.abs(snappedA.x - snappedB.x) < 1e-6 || Math.abs(snappedA.y - snappedB.y) < 1e-6) {
        return [snappedA, snappedB];
    }
    const mid = { x: snappedB.x, y: snappedA.y };
    return [snappedA, mid, snappedB];
}

function drawGridAndWires(themeColor) {
    const minor = themeColor === "white" ? "rgba(27,31,36,0.12)" : "rgba(139,148,158,0.08)";
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const startWX = ((-cx) / zoom - offsetX);
    const startWY = ((-cy) / zoom - offsetY);

    ctx.strokeStyle = minor;
    ctx.lineWidth = 1;
    const gx0 = Math.floor(startWX / GRID_STEP) * GRID_STEP;
    const gy0 = Math.floor(startWY / GRID_STEP) * GRID_STEP;
    const n = Math.ceil(canvas.width / (GRID_STEP * zoom)) + 4;

    ctx.beginPath();
    for (let i = -2; i < n; i += 1) {
        const wx = gx0 + i * GRID_STEP;
        const s = worldToScreen(wx, 0);
        const s0 = worldToScreen(wx, -1e9);
        const s1 = worldToScreen(wx, 1e9);
        ctx.moveTo(s0.x, s0.y);
        ctx.lineTo(s1.x, s1.y);
    }
    ctx.stroke();

    ctx.beginPath();
    for (let j = -2; j < n; j += 1) {
        const wy = gy0 + j * GRID_STEP;
        const s0 = worldToScreen(-1e9, wy);
        const s1 = worldToScreen(1e9, wy);
        ctx.moveTo(s0.x, s0.y);
        ctx.lineTo(s1.x, s1.y);
    }
    ctx.stroke();

    ctx.strokeStyle = themeColor === "white" ? "rgba(9,105,218,0.45)" : "rgba(139,148,158,0.35)";
    ctx.lineWidth = 2;
    for (const w of wires) {
        const pts = w.points || [];
        if (pts.length < 2) {
            continue;
        }
        ctx.beginPath();
        const p0 = worldToScreen(pts[0].x, pts[0].y);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < pts.length; i += 1) {
            const p = worldToScreen(pts[i].x, pts[i].y);
            ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        for (const p of pts) {
            const s = worldToScreen(p.x, p.y);
            ctx.fillStyle = "#ef4444";
            ctx.beginPath();
            ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

function draw() {
    const theme = document.body.dataset.theme || "dark";
    ctx.fillStyle = theme === "white" ? "#f6f8fa" : "#0f1419";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const fg = theme === "white" ? "#1f2328" : "#e6edf3";

    drawGridAndWires(theme);
    const hiddenNodes = new Set();
    components.forEach((c) =>
        ["a", "b"].forEach((k) => {
            const t = getComponentTerminals(c, GRID_STEP)[k];
            if (t) {
                hiddenNodes.add(`${t.x}:${t.y}`);
            }
        })
    );
    for (const c of components) {
        const sel = selectedId === c.id;
        ctx.globalAlpha = 1;
        drawComponent(ctx, c, worldToScreen, GRID_STEP, sel ? "#58a6ff" : fg, hiddenNodes);
    }
}

function getProjectState() {
    return {
        zoom,
        offsetX,
        offsetY,
        theme: document.body.dataset.theme || "dark",
        components: components.map((c) => ({ ...c })),
        wires: wires.map((w) => ({
            ...w,
            points: (w.points || []).map((p) => ({ ...p }))
        }))
    };
}

async function handleSimulate() {
    try {
        const response = await fetch("/api/simulate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state: getProjectState(), gridStep: GRID_STEP })
        });
        const payload = await response.json();
        if (!payload.ok) {
            const lines = [
                "Simulation impossible.",
                ...(payload.errors || []),
                ...(payload.warnings || []).map((w) => `Avertissement : ${w}`)
            ];
            if (payload.diagnostics?.floatingNets?.length) {
                lines.push(`Flottants : ${payload.diagnostics.floatingNets.join(", ")}`);
            }
            setStatus("err", lines);
            console.error(payload);
            return;
        }

        const raw = payload.voltmeterValues || {};
        const msgs = [];
        components.forEach((c) => {
            if (c.type !== "voltmeter") {
                return;
            }
            const key = sanitizeMeterReference(c.reference, "VM");
            const v = raw[key];
            if (!Number.isFinite(v)) {
                return;
            }
            c.value = `${v.toFixed(3)} V`;
            msgs.push(`${c.reference || key} : ${c.value}`);
        });
        draw();
        const diag = payload.diagnostics;
        const lines = [
            "Simulation OK.",
            ...(payload.warnings || []).map((w) => `${w}`),
            ...(msgs.length ? msgs.map((m) => `Mesure : ${m}`) : ["(Aucune mesure voltmètre lisible.)"])
        ];
        if (diag?.sourceConnectedToGround === false) {
            lines.push("Diagnostic : source pas reliée à la masse ?");
        }
        setStatus(payload.warnings?.length ? "ok" : "ok", lines);
        console.log("NETLIST:\n" + payload.netlist);
        console.log("LOG:\n" + (payload.log || ""));
    } catch (e) {
        console.error(e);
        setStatus("err", [
            "Pas de réponse serveur.",
            "Lance « node server.js » à la racine du site OU « npm run start » dans Simulateur (port 3001)."
        ]);
    }
}

function setTool(name) {
    activeTool = name;
    wireDraftStart = null;
    componentDrag = null;
    document.querySelectorAll("[data-tool]").forEach((b) =>
        b.classList.toggle("active", b.dataset.tool === name)
    );
    canvas.style.cursor =
        activeTool === "select" ? "grab" : activeTool === "wire" ? "crosshair" : "crosshair";
}

function clearAll() {
    if (!window.confirm("Effacer tout le schéma ?")) {
        return;
    }
    components = [];
    wires = [];
    selectedId = null;
    wireDraftStart = null;
    draw();
    setStatus("", []);
}

canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const worldX = (sx - cx) / zoom - offsetX;
    const worldY = (sy - cy) / zoom - offsetY;
    const mult = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * mult));
    offsetX = (sx - cx) / newZoom - worldX;
    offsetY = (sy - cy) / newZoom - worldY;
    zoom = newZoom;
    draw();
});

canvas.addEventListener("mousedown", (e) => {
    if (e.button === 2) {
        isPanning = true;
        panStart = { x: e.clientX, y: e.clientY, ox: offsetX, oy: offsetY };
        componentDrag = null;
        return;
    }
    const rect = canvas.getBoundingClientRect();
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

    if (activeTool === "wire") {
        const s = snapToGrid(w.x, w.y);
        if (!wireDraftStart) {
            wireDraftStart = s;
            setStatus("", ["Fil : clic sur le deuxième point."]);
            componentDrag = null;
            return;
        }
        wires.push({
            id: crypto.randomUUID(),
            points: orthoWire(wireDraftStart, { x: w.x, y: w.y })
        });
        wireDraftStart = null;
        componentDrag = null;
        draw();
        return;
    }

    if (supportsComponent(activeTool)) {
        const s = snapToGrid(w.x, w.y);
        createComponent(activeTool, s.x, s.y);
        componentDrag = null;
        draw();
        return;
    }

    /* Selection : clic ou glisser-déposer pour déplacer */
    const hit = findComponentAt(w);
    selectedId = hit ? hit.id : null;
    if (hit) {
        componentDrag = { comp: hit, grabX: w.x - hit.x, grabY: w.y - hit.y };
        canvas.style.cursor = "grabbing";
    } else {
        componentDrag = null;
    }
    draw();
});

canvas.addEventListener("mousemove", (e) => {
    if (isPanning && panStart) {
        offsetX = panStart.ox + (e.clientX - panStart.x) / zoom;
        offsetY = panStart.oy + (e.clientY - panStart.y) / zoom;
        draw();
        return;
    }

    const rect = canvas.getBoundingClientRect();
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

    if (componentDrag && (e.buttons & 1)) {
        const { comp } = componentDrag;
        const prevX = comp.x;
        const prevY = comp.y;
        const nx = snapToGrid(w.x - componentDrag.grabX, w.y - componentDrag.grabY);
        comp.x = nx.x;
        comp.y = nx.y;
        rewiresAfterComponentMove(comp, prevX, prevY);
        draw();
        return;
    }

    if (activeTool === "select" && !componentDrag) {
        const hit = findComponentAt(w);
        canvas.style.cursor = hit ? "grab" : "crosshair";
    }
});

function refreshCanvasCursor() {
    canvas.style.cursor =
        activeTool === "select" ? "grab" : activeTool === "wire" ? "crosshair" : "crosshair";
}

canvas.addEventListener("mouseup", (e) => {
    if (e.button === 2) {
        isPanning = false;
        panStart = null;
        return;
    }
    componentDrag = null;
    refreshCanvasCursor();
});

window.addEventListener("mouseup", () => {
    if (componentDrag) {
        componentDrag = null;
        refreshCanvasCursor();
    }
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

document.querySelectorAll("[data-tool]").forEach((btn) => {
    btn.addEventListener("click", () => setTool(btn.dataset.tool));
});

document.querySelector(".toolbar").addEventListener("dragstart", (e) => {
    const btn = e.target.closest("[data-drag-tool][data-tool]");
    if (!btn?.dataset.tool) {
        return;
    }
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/sim-tool", btn.dataset.tool);
    e.dataTransfer.setData("text/plain", btn.dataset.tool);
});

canvas.addEventListener("dragover", (e) => {
    e.preventDefault();
    const ty = [...(e.dataTransfer.types || [])];
    if (ty.includes("text/sim-tool") || ty.includes("text/plain")) {
        e.dataTransfer.dropEffect = "copy";
    }
});

canvas.addEventListener("drop", (e) => {
    e.preventDefault();
    const tp = String(e.dataTransfer.getData("text/plain")).trim();
    const tool =
        e.dataTransfer.getData("text/sim-tool") ||
        tp ||
    if (!supportsComponent(tool)) {
        return;
    }
    const rect = canvas.getBoundingClientRect();
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const s = snapToGrid(w.x, w.y);
    createComponent(tool, s.x, s.y);
    draw();
});

document.getElementById("simulateBtn").addEventListener("click", () => handleSimulate());
document.getElementById("clearBtn").addEventListener("click", () => clearAll());

document.getElementById("rotateBtn").addEventListener("click", () => {
    const c = components.find((x) => x.id === selectedId);
    if (!c || c.type === "ground") {
        return;
    }
    c.rotation = (((c.rotation || 0) + 90) % 360 + 360) % 360;
    draw();
});

document.getElementById("editValueBtn").addEventListener("click", () => {
    const c = components.find((x) => x.id === selectedId);
    if (!c) {
        setStatus("", ["Selectionne un composant."]);
        return;
    }
    const promptText = prompt("Valeur (ex : 1000Ω, 4 V)", c.value || getDefaultValue(c.type));
    if (promptText == null || !promptText.trim()) {
        return;
    }
    c.value = promptText.trim();
    draw();
});

window.addEventListener("resize", () => {
    resizeCanvas();
    draw();
});

resizeCanvas();
draw();
refreshCanvasCursor();
setStatus("", [
    "Placement : clic sur la grille avec R / Source / Masse / Voltmètre, ou glisser-déposer un bouton sur le dessin.",
    "Déplacement : Mode Sélection puis glisser un composant (les extrémités de fils suivent).",
    "Molette : zoom. Clic droit + glisser : vue. Fil : deux points sur la grille."
]);
