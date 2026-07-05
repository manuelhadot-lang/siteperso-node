/** Compteur de visites — appelle GET /api/simulator/counter au chargement. */
export async function initSimulatorVisitCounter() {
    const countEl = document.getElementById("sim-visit-count");
    if (!countEl) return;
    try {
        const res = await fetch("/api/simulator/counter");
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        countEl.textContent = String(data.count ?? "—");
    } catch {
        countEl.textContent = "—";
        const badge = document.getElementById("sim-visit-badge");
        if (badge) badge.title = "Compteur indisponible (mode hors ligne)";
    }
}
