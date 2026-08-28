/**
 * Icônes Lucide (MIT) — trait fin, rendu via currentColor.
 * https://lucide.dev
 */

const ICONS = {
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    'settings-2': '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
    zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13.5 10H20a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 10.5 14Z"/>',
    'circuit-board': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M11 9h4a2 2 0 0 0 2-2V5"/><path d="M9 15v-2a2 2 0 0 1 2-2h2"/><path d="M9 9v2"/><path d="M9 19v-2a2 2 0 0 1 2-2h2"/><path d="M15 15v2"/><path d="M15 5V3"/>',
    binary: '<rect x="14" y="14" width="4" height="6" rx="2"/><rect x="6" y="4" width="4" height="6" rx="2"/><path d="M6 20h4"/><path d="M14 10h4"/><path d="M6 14h2v6"/><path d="M14 4h2v6"/>',
    microchip: '<path d="M18 12h2"/><path d="M18 16h2"/><path d="M18 8h2"/><path d="M4 12h2"/><path d="M4 16h2"/><path d="M4 8h2"/><path d="M8 4h2"/><path d="M12 4h2"/><path d="M8 20h2"/><path d="M12 20h2"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
    'code-2': '<path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/>',
    lightbulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.2 3.2.6.6 1.2 1.1 1.8 1.8"/><path d="M9 18h6"/><path d="M10 22h4"/>',
    gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/><path d="m19 16-5.5-5.5"/>',
    'file-plus': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M9 15h6"/><path d="M12 18v-6"/>',
    'folder-open': '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
    save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
    'save-all': '<path d="M10 2v3a2 2 0 0 0 2 2h5"/><path d="M18 8v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"/><path d="M7 18h7"/><path d="M7 13h10"/><path d="M7 8h3"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    square: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
    battery: '<path d="M 10 10 V 8 a 2 2 0 0 1 2 -2 h 0 a 2 2 0 0 1 2 2 v 2"/><rect x="2" y="10" width="16" height="8" rx="2"/>',
    plug: '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>',
    minus: '<path d="M5 12h14"/>',
    timer: '<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>',
    waves: '<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
    activity: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
    resistor: '<path d="M6 16h12"/><path d="M6 8h12"/><path d="M8 8v8"/><path d="M16 8v8"/>',
    columns: '<rect width="4" height="16" x="6" y="4"/><rect width="4" height="16" x="14" y="4"/>',
    spring: '<path d="M4 12v-2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2"/><path d="M4 12v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M8 12v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M8 12v2a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    'sliders-vertical': '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/>',
    'toggle-right': '<rect width="20" height="12" x="2" y="6" rx="6" ry="6"/><circle cx="16" cy="12" r="2"/>',
    'circle-dot': '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/>',
    'volume-2': '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
    'rotate-cw': '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
    cpu: '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    'circle-slash': '<circle cx="12" cy="12" r="10"/><line x1="9" x2="15" y1="15" y2="9"/>',
    'plus-square': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/>',
    'square-minus': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 12h8"/>',
    merge: '<path d="m8 6 4-4 4 4"/><path d="M12 2v10.3a4 4 0 0 1-4 4H2"/><path d="m16 18 4 4 4-4"/><path d="M20 22v-10.3a4 4 0 0 0-4-4H8"/>',
    split: '<path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-4-4H2"/><path d="m16 3-4.5 4.5"/><path d="m8 3 4.5 4.5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    equal: '<line x1="5" x2="19" y1="9" y2="9"/><line x1="5" x2="19" y1="15" y2="15"/>',
    'flip-horizontal': '<path d="M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"/><path d="M12 20v2"/><path d="M12 14v2"/><path d="M12 8v2"/><path d="M12 2v2"/>',
    'repeat-2': '<path d="m2 9 3-3-3-3"/><path d="M13 18H7a2 2 0 0 1-2-2V6"/><path d="m22 15-3 3 3 3"/><path d="M11 6h6a2 2 0 0 1 2 2v10"/>',
    calculator: '<rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/>',
    'list-ordered': '<line x1="10" x2="21" y1="6" y2="6"/><line x1="10" x2="21" y1="12" y2="12"/><line x1="10" x2="21" y1="18" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
    thermometer: '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
    tablet: '<rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><line x1="12" x2="12.01" y1="18" y2="18"/>',
    'layout-grid': '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    signal: '<path d="M2 20h.01"/><path d="M7 20v-4"/><path d="M12 20v-8"/><path d="M17 20V8"/><path d="M22 20V4"/>',
    'line-chart': '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>',
    'trending-up': '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
    terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
    keyboard: '<path d="M10 8h.01"/><path d="M12 12h.01"/><path d="M14 8h.01"/><path d="M16 12h.01"/><path d="M18 8h.01"/><path d="M6 8h.01"/><path d="M7 16h10"/><path d="M8 12h.01"/><rect width="20" height="16" x="2" y="4" rx="2"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    'refresh-cw': '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    'package-check': '<path d="m16 16 2 2 4-4"/><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="m7.5 4.27 9 5.15"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" x2="12" y1="22" y2="12"/>',
    upload: '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    'circle-alert': '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
    search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
    'trash-2': '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
    send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
    'circle-help': '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    'book-open': '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
};

const COMPONENT_ICONS = {
    battery: 'battery',
    vcc: 'plug',
    gnd: 'minus',
    gimp: 'timer',
    gsin: 'waves',
    gsqr: 'activity',
    resistor: 'resistor',
    capacitor: 'columns',
    inductor: 'spring',
    diode: 'chevron-right',
    potentiometer: 'sliders-vertical',
    switch_spdt: 'toggle-right',
    push_button: 'circle-dot',
    speaker: 'volume-2',
    dc_motor: 'rotate-cw',
    servo_motor: 'settings-2',
    npn: 'cpu',
    nmos: 'zap',
    opamp: 'plus',
    lm386: 'volume-2',
    lm7805: 'battery',
    ir2104: 'cpu',
    l293d: 'microchip',
    logic_terminal: 'binary',
    not: 'circle-slash',
    and: 'plus-square',
    nand: 'square-minus',
    or: 'merge',
    nor: 'split',
    xor: 'x',
    xnor: 'equal',
    d_flipflop: 'flip-horizontal',
    jk_flipflop: 'repeat-2',
    cd4511: 'calculator',
    ic_74hc90: 'list-ordered',
    esp32_c3: 'microchip',
    esp32_devkit: 'cpu',
    esp32_upesy_lp: 'cpu',
    arduino_uno: 'cpu',
    grove_dht22: 'thermometer',
    grove_tsl2591: 'sun',
    grove_bmp280: 'gauge',
    grove_lcd16x2: 'monitor',
    joyit_tft18: 'tablet',
    led: 'lightbulb',
    ldr: 'sun',
    seg7: 'layout-grid',
    bargraph_dc10h: 'signal',
    matrix_8x8: 'grid-3x3',
    voltmeter: 'gauge',
    ammeter: 'zap',
    ohmmeter: 'equal',
    oscilloscope: 'line-chart',
    bode_analyzer: 'trending-up',
};

const SUBMENU_ICONS = {
    Transistors: 'cpu',
    AOP: 'plus',
    Portes: 'binary',
    Circuits: 'circuit-board',
    'Capteurs Grove': 'thermometer',
    Affichage: 'monitor',
};

const ELEMENT_ICONS = {
    'btn-commands': 'keyboard',
    'btn-toggle-grid': 'grid-3x3',
    'btn-theme-dark': 'moon',
    'btn-theme-light': 'sun',
    'menu-esp32-editor': 'code-2',
    'menu-arduino-editor': 'code-2',
    'menu-serial-monitor': 'terminal',
    'arduino-panel-doc': 'circle-help',
    'arduino-btn-refresh-ports': 'refresh-cw',
    'arduino-btn-compile': 'package-check',
    'arduino-btn-upload': 'upload',
    'arduino-btn-serial-monitor': 'terminal',
    'arduino-btn-show-errors': 'circle-alert',
    'arduino-lib-refresh': 'refresh-cw',
    'arduino-lib-search-btn': 'search',
    'serial-monitor-clear': 'trash-2',
    'serial-monitor-send': 'send',
};

/** @param {string} name @param {number} size @param {string} className */
export function lucideSvg(name, size = 16, className = 'lucide-icon') {
    const inner = ICONS[name];
    if (!inner) return '';
    return `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

function iconSizeFor(el) {
    if (el.classList.contains('menu-icon') || el.closest('.menu-icon')) return 18;
    if (el.classList.contains('btn-icon') || el.closest('.btn-icon')) return 13;
    if (el.classList.contains('arduino-btn--small')) return 14;
    if (el.classList.contains('arduino-btn')) return 15;
    return 15;
}

function mountIcon(el) {
    const name = el.getAttribute('data-icon');
    if (!name || el.querySelector('svg.lucide-icon')) return;
    el.insertAdjacentHTML('afterbegin', lucideSvg(name, iconSizeFor(el)));
}

function prepareIconElement(el, iconName, extraClass = '') {
    if (!iconName || !ICONS[iconName]) return;
    el.classList.add('dropdown-item--icon', ...extraClass.split(' ').filter(Boolean));
    el.setAttribute('data-icon', iconName);
    mountIcon(el);
}

/** Injecte les icônes dans menus, sous-menus et boutons Arduino. */
export function injectAllIcons() {
    document.querySelectorAll('.dropdown-item[data-component]').forEach((el) => {
        prepareIconElement(el, COMPONENT_ICONS[el.getAttribute('data-component') || '']);
    });

    document.querySelectorAll('.submenu-title').forEach((el) => {
        prepareIconElement(el, SUBMENU_ICONS[el.textContent.trim()]);
    });

    Object.entries(ELEMENT_ICONS).forEach(([id, iconName]) => {
        const el = document.getElementById(id);
        if (!el) return;
        const isArduino = id.startsWith('arduino-') || id.startsWith('serial-monitor-');
        prepareIconElement(el, iconName, isArduino ? 'arduino-btn--icon' : '');
    });

    document.querySelectorAll('[data-icon]').forEach(mountIcon);
}

export function injectMenuIcons() {
    injectAllIcons();
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectAllIcons);
    } else {
        injectAllIcons();
    }
}
