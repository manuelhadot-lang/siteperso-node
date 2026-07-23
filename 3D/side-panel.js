/** Panneau latéral rétractable et sections repliables (Objets, Lumières). */

export function initSidePanel() {
    const panel = document.getElementById("lab-side-panel");
    const toggle = document.getElementById("lab-panel-toggle");
    if (!panel || !toggle) return null;

    function setPanelOpen(open) {
        panel.classList.toggle("lab-side-panel--collapsed", !open);
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
        toggle.textContent = open ? "‹" : "›";
        toggle.title = open ? "Replier le panneau" : "Déplier le panneau";
    }

    /**
     * @param {Element} section
     * @param {boolean} open
     */
    function setSectionOpen(section, open) {
        const sectionToggle = section.querySelector(".lab-side-panel__section-toggle");
        section.classList.toggle("lab-side-panel__section--open", open);
        section.classList.toggle("lab-side-panel__section--collapsed", !open);
        if (sectionToggle) {
            sectionToggle.setAttribute("aria-expanded", open ? "true" : "false");
            sectionToggle.title = open ? "Replier" : "Déplier";
        }
    }

    toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        setPanelOpen(panel.classList.contains("lab-side-panel--collapsed"));
    });

    panel.querySelectorAll(".lab-side-panel__section-toggle").forEach((sectionToggle) => {
        sectionToggle.addEventListener("click", (e) => {
            e.stopPropagation();
            const section = sectionToggle.closest(".lab-side-panel__section");
            if (!section) return;
            const open = section.classList.contains("lab-side-panel__section--open");
            setSectionOpen(section, !open);
        });
    });

    // Volets fermés au démarrage
    panel.querySelectorAll(".lab-side-panel__section").forEach((section) => {
        setSectionOpen(section, false);
    });

    setPanelOpen(true);
    return panel;
}
