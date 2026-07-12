/** Catalogue des montages dans /exemples (Fichier → Exemples). */
import { showModal, hideModal } from "./modal-ui.js";

let loadCircuit = null;
let setDisplayName = null;

export function initExamplesPanel({ loadCircuit: onLoadCircuit, setDisplayName: onSetDisplayName } = {}) {
    loadCircuit = onLoadCircuit;
    setDisplayName = onSetDisplayName;
    const modal = document.getElementById("examples-modal");
    const listEl = document.getElementById("examples-list");
    const statusEl = document.getElementById("examples-status");
    if (!modal || !listEl) return;

    document.getElementById("btn-examples")?.addEventListener("click", () => {
        openExamplesModal(modal, listEl, statusEl);
    });
    document.getElementById("close-examples")?.addEventListener("click", () => hideModal(modal));
    window.addEventListener("click", (e) => {
        if (e.target === modal) hideModal(modal);
    });
}

async function openExamplesModal(modal, listEl, statusEl) {
    showModal(modal);
    listEl.innerHTML = "";
    statusEl.textContent = "Chargement de la liste…";
    try {
        const res = await fetch("/api/simulator/examples");
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (!data.categories?.length) {
            statusEl.textContent = "Aucun exemple trouvé (dossier exemples/ vide).";
            return;
        }
        statusEl.textContent = "Choisissez un montage, puis lancez la simulation.";
        for (const cat of data.categories) {
            const section = document.createElement("section");
            section.className = "examples-category";
            const title = document.createElement("h3");
            title.textContent = cat.label;
            section.appendChild(title);
            const ul = document.createElement("ul");
            ul.className = "examples-category__list";
            for (const ex of cat.examples) {
                const li = document.createElement("li");
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "examples-item__btn";
                btn.textContent = ex.name;
                btn.title = ex.id;
                btn.addEventListener("click", () => loadExample(ex.url, ex.name, modal, statusEl));
                li.appendChild(btn);
                ul.appendChild(li);
            }
            section.appendChild(ul);
            listEl.appendChild(section);
        }
    } catch (err) {
        statusEl.textContent = `Impossible de charger les exemples : ${err?.message || err}`;
    }
}

async function loadExample(url, name, modal, statusEl) {
    if (!loadCircuit) return;
    statusEl.textContent = `Ouverture de « ${name} »…`;
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setDisplayName?.(name);
        loadCircuit(await res.text());
        hideModal(modal);
    } catch (err) {
        statusEl.textContent = `Erreur : ${err?.message || err}`;
    }
}

/** ?example=Arduino/LED_cligno.json */
export async function loadExampleFromQueryParam(loadCircuitFn) {
    const raw = new URLSearchParams(window.location.search).get("example");
    if (!raw || !/^[^/\\]+\/[^/\\]+\.json$/i.test(raw)) return;
    try {
        const res = await fetch(`/exemples/${raw.split("/").map(encodeURIComponent).join("/")}`);
        if (!res.ok) throw new Error(String(res.status));
        loadCircuitFn(await res.text());
    } catch (err) {
        console.warn("Chargement exemple URL:", err);
    }
}
