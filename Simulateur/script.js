const canvas = document.getElementById('schematicCanvas');
const ctx = canvas.getContext('2d');
const toolLabel = document.getElementById('tool-name');
const coordsLabel = document.getElementById('coords');
const runBtn = document.getElementById('runBtn');

let width, height;
let scale = 1.0;
let offset = { x: 0, y: 0 };
let isDragging = false;
let lastMousePos = { x: 0, y: 0 };
let currentTool = "selection";

const GRID_SIZE = 50;

function init() {
    window.addEventListener('resize', resize);
    canvas.addEventListener('contextmenu', e => e.preventDefault()); // Désactiver clic droit menu

    // Souris : Déplacement et Placement
    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 2) { // Clic droit pour déplacer la vue
            isDragging = true;
            lastMousePos = { x: e.clientX, y: e.clientY };
        } else if (e.button === 0) { // Clic gauche pour agir
            handleAction(e.clientX, e.clientY);
        }
    });

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', () => isDragging = false);
    canvas.addEventListener('wheel', handleZoom, { passive: false });

    resize();
    draw();
}

// Changer d'outil depuis le menu
function setTool(tool) {
    currentTool = tool;
    toolLabel.innerText = `Outil : ${tool.charAt(0).toUpperCase() + tool.slice(1)}`;
}

function showHelp() {
    alert("🚀 ASTUCES :\n\n- Clic Droit : Déplacer la vue\n- Molette : Zoomer / Dézoomer\n- Clic Gauche : Placer un composant (aimanté sur la grille)");
}

function handleAction(mx, my) {
    // Calcul de la position réelle sur la grille (Snap to Grid)
    const worldX = Math.round(((mx - offset.x) / scale) / GRID_SIZE) * GRID_SIZE;
    const worldY = Math.round(((my - offset.y) / scale) / GRID_SIZE) * GRID_SIZE;
    
    console.log(`Action : ${currentTool} à [${worldX}, ${worldY}]`);
}

function resize() {
    width = window.innerWidth;
    height = window.innerHeight - 40;
    canvas.width = width;
    canvas.height = height;
    draw();
}

function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    drawGrid();
    drawOrigin();

    ctx.restore();
}

function drawGrid() {
    const left = -offset.x / scale;
    const top = -offset.y / scale;
    const right = (width - offset.x) / scale;
    const bottom = (height - offset.y) / scale;

    ctx.beginPath();
    ctx.strokeStyle = '#1a1a1a'; // Quadrillage discret
    ctx.lineWidth = 1 / scale;

    for (let x = Math.floor(left / GRID_SIZE) * GRID_SIZE; x < right; x += GRID_SIZE) {
        ctx.moveTo(x, top); ctx.lineTo(x, bottom);
    }
    for (let y = Math.floor(top / GRID_SIZE) * GRID_SIZE; y < bottom; y += GRID_SIZE) {
        ctx.moveTo(left, y); ctx.lineTo(right, y);
    }
    ctx.stroke();
}

function drawOrigin() {
    ctx.beginPath();
    ctx.strokeStyle = '#333';
    ctx.arc(0, 0, 5/scale, 0, Math.PI * 2);
    ctx.stroke();
}

function handleMouseMove(e) {
    const worldX = Math.round((e.clientX - offset.x) / scale);
    const worldY = Math.round((e.clientY - offset.y) / scale);
    coordsLabel.innerText = `X: ${worldX}, Y: ${worldY}`;

    if (isDragging) {
        offset.x += e.clientX - lastMousePos.x;
        offset.y += e.clientY - lastMousePos.y;
        lastMousePos = { x: e.clientX, y: e.clientY };
        draw();
    }
}

function handleZoom(e) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = scale * factor;

    if (newScale > 0.2 && newScale < 5) {
        // Zoom centré sur la souris
        offset.x = e.clientX - (e.clientX - offset.x) * factor;
        offset.y = e.clientY - (e.clientY - offset.y) * factor;
        scale = newScale;
        draw();
    }
}

// Appel à ton API de simulation (ton server.js existant)
runBtn.addEventListener('click', async () => {
    runBtn.innerText = "⚡ Simulation...";
    const netlist = "V1 1 0 12\nR1 1 0 1k\n.op\n.end"; // Simulation de test

    try {
        const res = await fetch('/api/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state: netlist })
        });
        const data = await res.json();
        alert(data.ok ? "Simulation terminée !\nRésultats disponibles dans la console F12." : "Erreur.");
    } catch (e) { alert("Erreur serveur."); }
    
    runBtn.innerText = "🚀 Lancer la Simulation";
});

init();