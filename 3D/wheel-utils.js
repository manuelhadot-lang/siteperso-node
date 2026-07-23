/**
 * Normalise le delta molette (pixels / lignes / pages) pour un zoom fluide.
 * @param {WheelEvent} event
 */
export function normalizeWheelDelta(event) {
    let delta = event.deltaY;
    if (event.deltaMode === 1) delta *= 16;
    else if (event.deltaMode === 2) delta *= 800;
    return Math.max(-120, Math.min(120, delta));
}

/**
 * Facteur de zoom exponentiel à partir d'un WheelEvent.
 * @param {WheelEvent} event
 * @param {number} sensitivity
 */
export function wheelZoomFactor(event, sensitivity) {
    return Math.exp(-normalizeWheelDelta(event) * sensitivity);
}

/**
 * Molette proportionnelle au défilement — pas fin, sans quantifier au step natif du curseur.
 * @param {HTMLInputElement} slider
 * @param {(value: number) => void} onChange
 * @param {{ step?: number, wheelFactor?: number, shiftMultiplier?: number, precision?: number, host?: HTMLElement }} [opts]
 */
export function bindRangeSliderWheel(slider, onChange, opts = {}) {
    if (!slider) return;
    const step = opts.step ?? (Number(slider.step) || 0.01);
    const wheelFactor = opts.wheelFactor ?? 0.015;
    const shiftMultiplier = opts.shiftMultiplier ?? 2;
    const host = opts.host ?? slider;

    host.addEventListener(
        "wheel",
        (event) => {
            if (!host.contains(event.target) && event.target !== host) return;
            event.preventDefault();
            event.stopPropagation();
            const min = Number(slider.min);
            const max = Number(slider.max);
            const normalized = normalizeWheelDelta(event);
            const multiplier = event.shiftKey ? shiftMultiplier : 1;
            const delta = -(normalized / 120) * step * wheelFactor * multiplier;
            const next = Math.max(min, Math.min(max, Number(slider.value) + delta));
            const precision =
                opts.precision ??
                (step < 0.01 ? 4 : step < 0.1 ? 3 : step < 1 ? 2 : 1);
            const rounded = Number(next.toFixed(precision));
            if (rounded === Number(slider.value)) return;
            slider.value = String(rounded);
            onChange(rounded);
        },
        { passive: false }
    );
}
