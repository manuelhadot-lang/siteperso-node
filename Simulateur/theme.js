/** Thème de l’éditeur de schéma (sombre / clair). */

const PALETTES = {
    dark: {
        canvasBg: '#121212',
        grid: '#262626',
        ink: '#ffffff',
        inkMuted: '#aaaaaa',
        inkDim: '#9e9e9e',
        componentFill: '#1e1e1e',
        componentStroke: '#bdbdbd',
        strokeLight: '#cccccc',
        strokeMuted: '#666666',
        opampFill: '#d8d8d8',
        junctionStroke: '#ffffff',
        meterFill: '#2a3b4c',
        meterDisplayBg: '#0d1b1e',
        scopeBg: '#050a0e',
        scopeGrid: '#1a3a4a',
        scopeLabel: '#3a5a6a',
        wireDefault: '#00ffaa',
        ledSmoke: 'rgba(170, 170, 170, 0.75)',
    },
    light: {
        canvasBg: '#ffffff',
        grid: '#c8c8c8',
        ink: '#1a1a1a',
        inkMuted: '#555555',
        inkDim: '#666666',
        componentFill: '#ffffff',
        componentStroke: '#333333',
        strokeLight: '#333333',
        strokeMuted: '#555555',
        opampFill: '#e8e8e8',
        junctionStroke: '#1a1a1a',
        meterFill: '#e8eef2',
        meterDisplayBg: '#e8f5e9',
        scopeBg: '#f5f5f5',
        scopeGrid: '#bbbbbb',
        scopeLabel: '#666666',
        wireDefault: '#007755',
        ledSmoke: 'rgba(80, 80, 80, 0.75)',
    },
};

export const COLORS = { ...PALETTES.dark };
export let editorTheme = 'dark';
/** Affichage de la grille de l’éditeur de schéma. */
export let showGrid = true;

function applyCssTheme() {
    document.body.classList.toggle('theme-light', editorTheme === 'light');
    document.body.classList.toggle('theme-dark', editorTheme === 'dark');
    document.documentElement.style.setProperty('--canvas-bg', COLORS.canvasBg);
}

function updateThemeMenuMarks() {
    const darkBtn = document.getElementById('btn-theme-dark');
    const lightBtn = document.getElementById('btn-theme-light');
    if (darkBtn) darkBtn.textContent = editorTheme === 'dark' ? 'Sombre ✓' : 'Sombre';
    if (lightBtn) lightBtn.textContent = editorTheme === 'light' ? 'Clair ✓' : 'Clair';
}

function updateGridMenuMark() {
    const btn = document.getElementById('btn-toggle-grid');
    if (btn) btn.textContent = showGrid ? 'Grille ✓' : 'Grille (masquée)';
}

export function setShowGrid(visible) {
    showGrid = visible !== false;
    try { localStorage.setItem('sim-editor-grid', showGrid ? '1' : '0'); } catch (_) { /* ignore */ }
    updateGridMenuMark();
}

export function initEditorGrid() {
    let saved = true;
    try {
        const v = localStorage.getItem('sim-editor-grid');
        if (v === '0') saved = false;
    } catch (_) { /* ignore */ }
    setShowGrid(saved);
}

/** Réapplique les coches menu après normalisation des libellés. */
export function refreshEditorMenuMarks() {
    updateThemeMenuMarks();
    updateGridMenuMark();
}

export function setEditorTheme(theme) {
    editorTheme = theme === 'light' ? 'light' : 'dark';
    Object.assign(COLORS, PALETTES[editorTheme]);
    try { localStorage.setItem('sim-editor-theme', editorTheme); } catch (_) { /* ignore */ }
    applyCssTheme();
    updateThemeMenuMarks();
}

export function initEditorTheme() {
    let saved = 'dark';
    try { saved = localStorage.getItem('sim-editor-theme') || 'dark'; } catch (_) { /* ignore */ }
    setEditorTheme(saved === 'light' ? 'light' : 'dark');
}
