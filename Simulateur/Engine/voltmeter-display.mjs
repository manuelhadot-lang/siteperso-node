/**
 * Affichage voltmètre : quantification 0/Vhi pour la logique, tensions négatives conservées.
 * @param {number} v
 * @param {number[]|null} [samples] échantillons .tran (détection signal logique unipolaire)
 */
export function quantizeVoltmeterReading(v, samples) {
    if (typeof v !== "number" || !Number.isFinite(v)) return v;
    const vals = Array.isArray(samples) ? samples.filter(Number.isFinite) : [];
    if (vals.length >= 4) {
        const maxV = Math.max(...vals);
        const minV = Math.min(...vals);
        // Uniquement signaux unipolaires (0 / Vhi) — pas AC ni DC négatif.
        if (maxV - minV > 1.5 && minV >= -0.5) {
            const vhi = maxV >= 3 ? maxV : 5;
            const vlo = minV <= 0.5 ? 0 : minV;
            return v >= vhi / 2 ? vhi : vlo;
        }
    }
    if (Math.abs(v) >= 4) return Math.round(v * 10) / 10;
    if (v >= 0 && v <= 0.5) return 0;
    return v;
}
