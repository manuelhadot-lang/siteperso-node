/** Relief procédural : île montagneuse à contour irrégulier, descends sous le niveau de la mer. */

export const MOUNTAIN_ISLAND_SIZE_M = 500;

/**
 * Pseudo-aléatoire déterministe 2D → [0, 1].
 * @param {number} ix
 * @param {number} iz
 */
function hash2(ix, iz) {
    const s = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123;
    return s - Math.floor(s);
}

/**
 * Value noise bilinéaire.
 * @param {number} x
 * @param {number} z
 */
function valueNoise(x, z) {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const fx = x - x0;
    const fz = z - z0;
    const ux = fx * fx * (3 - 2 * fx);
    const uz = fz * fz * (3 - 2 * fz);
    const a = hash2(x0, z0);
    const b = hash2(x0 + 1, z0);
    const c = hash2(x0, z0 + 1);
    const d = hash2(x0 + 1, z0 + 1);
    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

/**
 * @param {number} x
 * @param {number} z
 * @param {number} [octaves]
 */
function fbm(x, z, octaves = 5) {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i += 1) {
        sum += amp * valueNoise(x * freq, z * freq);
        norm += amp;
        amp *= 0.5;
        freq *= 2.03;
    }
    return norm > 0 ? sum / norm : 0;
}

/**
 * Rayon de rivage (normalisé 0–1) selon l’angle — forme non carrée / organique.
 * @param {number} angle
 */
function shoreRadiusNorm(angle) {
    return (
        0.58 +
        0.13 * Math.sin(angle * 2 + 0.35) +
        0.09 * Math.cos(angle * 3 - 0.8) +
        0.06 * Math.sin(angle * 5 + 1.4) +
        0.045 * Math.cos(angle * 7 - 0.2) +
        0.03 * Math.sin(angle * 4 + 2.1)
    );
}

/**
 * @param {number} t
 * @param {number} a
 * @param {number} b
 */
function smoothstep(a, b, t) {
    const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
    return x * x * (3 - 2 * x);
}

/**
 * Hauteurs Y (m) pour un maillage (segments+1)².
 * Niveau 0 ≈ rivage ; intérieur montagneux ; hors contour → descente progressive sous la mer.
 *
 * @param {number} segments
 * @param {number} [sizeMeters]
 * @returns {number[]}
 */
export function generateMountainIslandHeights(segments, sizeMeters = MOUNTAIN_ISLAND_SIZE_M) {
    const segs = Math.max(8, Math.floor(segments) || 160);
    const size = Math.max(50, Number(sizeMeters) || MOUNTAIN_ISLAND_SIZE_M);
    const row = segs + 1;
    const half = size * 0.5;
    /** @type {number[]} */
    const heights = new Array(row * row);

    const peakScale = Math.min(118, size * 0.22);
    const maxDepth = -Math.min(42, size * 0.085);

    for (let j = 0; j < row; j += 1) {
        for (let i = 0; i < row; i += 1) {
            const x = (i / segs) * size - half;
            const z = (j / segs) * size - half;
            const nx = x / half;
            const nz = z / half;
            const angle = Math.atan2(nz, nx);
            const rNorm = Math.hypot(nx, nz);
            const shore = shoreRadiusNorm(angle);
            const signed = shore - rNorm;

            // 0 = mer, 1 = terre ferme
            const landMask = smoothstep(-0.1, 0.14, signed);

            // Relief intérieur (crêtes + mamelons)
            const n1 = fbm(nx * 2.4 + 3.1, nz * 2.4 - 1.7, 5);
            const n2 = fbm(nx * 5.2 - 2.0, nz * 5.2 + 4.3, 4);
            const ridge = Math.abs(n1 * 2 - 1);
            const dome = Math.pow(Math.max(0, signed / Math.max(0.2, shore)), 1.25);
            const landHeight =
                peakScale *
                dome *
                (0.22 + 0.55 * (1 - ridge) + 0.35 * n2) *
                (0.75 + 0.25 * landMask);

            // Plateforme côtière douce juste au-dessus / au niveau 0
            const beach = 1.8 * smoothstep(0.02, 0.18, signed) * (1 - smoothstep(0.2, 0.55, signed));

            // Hors île : pente sous-marine progressive vers les bords du terrain
            const seaT = smoothstep(0, 0.62, -signed);
            const cornerBoost = Math.pow(Math.max(0, rNorm - 0.95) / 0.5, 1.4);
            const seaDepth = maxDepth * (0.35 * seaT + 0.65 * Math.pow(seaT, 1.45)) - 6 * cornerBoost;

            const y = landMask * (landHeight + beach) + (1 - landMask) * seaDepth;
            heights[j * row + i] = y;
        }
    }

    return heights;
}
