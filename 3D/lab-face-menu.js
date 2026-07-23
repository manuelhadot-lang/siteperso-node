/** Menu Face — mode triangulation et sélection triangles. */

/**
 * @param {{
 *   isTriangulationMode: () => boolean,
 *   onToggleTriangulation: (next: boolean) => void,
 *   onClearTriangleSelection?: () => void,
 * }} handlers
 */
export function initFaceMenu(handlers) {
    const menuRoot = document.querySelector('[data-menu="face"]');
    if (!menuRoot) return;

    const trigger = menuRoot.querySelector(".lab-menu__trigger");
    const panel = menuRoot.querySelector(".lab-menu__panel");
    if (!trigger || !panel) return;

    const toggleItem = panel.querySelector('[data-face-action="toggle-triangulation"]');

    function closePanel() {
        panel.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
    }

    function refreshLabel() {
        if (!toggleItem) return;
        const enabled = !!handlers.isTriangulationMode();
        toggleItem.textContent = `Mode triangulation : ${enabled ? "ON" : "OFF"}`;
    }

    trigger.addEventListener("click", (event) => {
        event.stopPropagation();
        const willOpen = panel.hidden;
        panel.hidden = !willOpen;
        trigger.setAttribute("aria-expanded", willOpen ? "true" : "false");
        if (willOpen) refreshLabel();
    });

    panel.querySelectorAll("[data-face-action]").forEach((item) => {
        item.addEventListener("click", (event) => {
            event.stopPropagation();
            const action = item.getAttribute("data-face-action");
            closePanel();
            if (action === "toggle-triangulation") {
                const next = !handlers.isTriangulationMode();
                handlers.onToggleTriangulation(next);
                refreshLabel();
                return;
            }
            if (action === "clear-triangle-selection") {
                handlers.onClearTriangleSelection?.();
            }
        });
    });

    document.addEventListener("click", () => closePanel());
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closePanel();
    });

    refreshLabel();
}
