/** Tuilage canvas : redimensionnement et remplissage répété aligné. */

/**
 * @param {CanvasImageSource} source
 * @returns {number}
 */
function sourceWidth(source) {
    if ("naturalWidth" in source && source.naturalWidth) return source.naturalWidth;
    if ("videoWidth" in source && source.videoWidth) return source.videoWidth;
    return source.width || 1;
}

/**
 * @param {CanvasImageSource} source
 * @returns {number}
 */
function sourceHeight(source) {
    if ("naturalHeight" in source && source.naturalHeight) return source.naturalHeight;
    if ("videoHeight" in source && source.videoHeight) return source.videoHeight;
    return source.height || 1;
}

/**
 * Redimensionne une image en tuile carrée, sans filtre flou (évite les bandes visibles).
 * @param {CanvasImageSource} source
 * @param {number} [size=256]
 * @returns {HTMLCanvasElement}
 */
export function prepareTileSource(source, size = 256) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;
    // Lissage uniquement si on réduit une source plus grande (meilleure netteté de près).
    const sw = sourceWidth(source);
    const sh = sourceHeight(source);
    ctx.imageSmoothingEnabled = sw > size || sh > size;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, size, size);
    return canvas;
}

/**
 * Remplit une zone avec une texture répétée, alignée sur une phase monde.
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} source
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {number} tilePx
 * @param {number} [phaseX=0]
 * @param {number} [phaseY=0]
 */
export function fillRepeatingTexture(
    ctx,
    source,
    x,
    y,
    width,
    height,
    tilePx,
    phaseX = 0,
    phaseY = 0
) {
    if (tilePx <= 0 || width <= 0 || height <= 0) return;

    const pattern = ctx.createPattern(source, "repeat");
    if (!pattern) return;

    const sw = sourceWidth(source);
    const sh = sourceHeight(source);
    const sx = tilePx / sw;
    const sy = tilePx / sh;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x - phaseX, y - phaseY);
    ctx.scale(sx, sy);
    ctx.fillStyle = pattern;
    ctx.fillRect(phaseX / sx, phaseY / sy, width / sx + 2, height / sy + 2);
    ctx.restore();
}
