/** Compteur de visites du site — 1 hit max / 12 h (serveur), affichage unique. */
async function chargerCompteur() {
    try {
        const hit = await fetch("/api/counter/hit", {
            method: "POST",
            credentials: "same-origin",
            headers: { Accept: "application/json" },
        });
        const data = hit.ok ? await hit.json() : null;
        const count = data && typeof data.count === "number"
            ? data.count
            : (await (await fetch("/api/counter")).json()).count;

        const top = document.getElementById("visit-number");
        const bottom = document.getElementById("visit-count");
        if (top) top.innerText = String(count);
        if (bottom) bottom.innerText = String(count);
    } catch (err) {
        console.error("Erreur compteur:", err);
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", chargerCompteur);
} else {
    chargerCompteur();
}
