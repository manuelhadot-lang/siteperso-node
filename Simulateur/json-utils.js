/**
 * Parse JSON texte (fichiers circuit) — tolère BOM UTF-8 et espaces.
 */

import { DC10H_COLOR_IDS } from './bargraph-dc10h-layout.js';
import { normalizeBoardFqbn } from './esp32-c3-layout.js';

export function parseJsonText(raw) {
    if (raw == null) {
        throw new Error('Le fichier est vide.');
    }
    const text = String(raw).replace(/^\uFEFF/, '').trim();
    if (!text) {
        throw new Error('Le fichier est vide.');
    }
    try {
        return JSON.parse(text);
    } catch (e) {
        const detail = e instanceof SyntaxError ? e.message : String(e);
        throw new Error(`Syntaxe JSON invalide : ${detail}`);
    }
}

/** Normalise un objet exporté par le simulateur (ou exemple circuits/). */
export function normalizeCircuitPayload(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Format attendu : un objet JSON avec au minimum "components".');
    }
    if (data.components != null && !Array.isArray(data.components)) {
        throw new Error('Le champ "components" doit être un tableau.');
    }
    if (data.wires != null && !Array.isArray(data.wires)) {
        throw new Error('Le champ "wires" doit être un tableau.');
    }
    if (data.autoJunctions != null && !Array.isArray(data.autoJunctions)) {
        throw new Error('Le champ "autoJunctions" doit être un tableau.');
    }
    return {
        name: data.name,
        components: Array.isArray(data.components) ? data.components : [],
        wires: Array.isArray(data.wires) ? data.wires : [],
        autoJunctions: Array.isArray(data.autoJunctions) ? data.autoJunctions : [],
        counters:
            data.counters && typeof data.counters === 'object' && !Array.isArray(data.counters)
                ? data.counters
                : {},
    };
}

/** Valeurs par défaut et nettoyage des composants après chargement JSON. */
export function migrateLoadedComponents(components) {
    if (!Array.isArray(components)) return [];
    for (const comp of components) {
        if (!comp || typeof comp !== 'object') continue;
        if (comp.type === 'grove_lcd16x2') {
            if (comp.i2cAddress == null) comp.i2cAddress = 0x3e;
            comp.flipX = !!comp.flipX;
            delete comp.lcdDisplayCache;
        }
        if (comp.type === 'grove_dht22') {
            comp.flipX = !!comp.flipX;
            if (comp.temperature == null || !Number.isFinite(comp.temperature)) comp.temperature = 24;
            if (comp.humidity == null || !Number.isFinite(comp.humidity)) comp.humidity = 55;
        }
        if (comp.type === 'grove_tsl2591') {
            comp.flipX = !!comp.flipX;
            if (comp.i2cAddress == null) comp.i2cAddress = 0x29;
            if (comp.lux == null || !Number.isFinite(comp.lux)) comp.lux = 100;
        }
        if (comp.type === 'joyit_tft18') {
            comp.flipX = !!comp.flipX;
            delete comp.tftDisplayCache;
            delete comp.tftControlPins;
        }
        if (comp.type === 'bargraph_dc10h') {
            if (!comp.barColor || !DC10H_COLOR_IDS.includes(comp.barColor)) comp.barColor = 'red';
            comp.flipX = !!comp.flipX;
            comp.rotation = 0;
        }
        if (comp.type === 'arduino_uno' || comp.type === 'esp32_c3') {
            comp.fqbn = normalizeBoardFqbn(comp);
        }
    }
    return components;
}
