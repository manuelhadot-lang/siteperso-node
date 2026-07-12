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
