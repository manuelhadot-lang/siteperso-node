/** Compteur de visites — 1 hit max / 12 h (anti-abus serveur). */
export async function initSimulatorVisitCounter() {
    const countEl = document.getElementById("sim-visit-count");
    if (!countEl) return;
    try {
        const res = await fetch("/api/simulator/counter/hit", {
            method: "POST",
            credentials: "same-origin",
            headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        countEl.textContent = String(data.count ?? "—");
    } catch {
        try {
            const res = await fetch("/api/simulator/counter");
            const data = await res.json();
            countEl.textContent = String(data.count ?? "—");
        } catch {
            countEl.textContent = "—";
            const badge = document.getElementById("sim-visit-badge");
            if (badge) badge.title = "Compteur indisponible (mode hors ligne)";
        }
    }
}
