async function chargerCompteur() {
    try {
        const response = await fetch('/api/counter');
        const data = await response.json();
        const element = document.getElementById('visit-count');
        if (element) {
            element.innerText = data.count;
        }
    } catch (err) {
        console.error("Erreur compteur:", err);
    }
}

// On lance le chargement dès que la page s'ouvre
window.onload = chargerCompteur;