/**
 * Mode perforation : soustraire un objet d’un autre (trous).
 * @param {{
 *   csgBtn: HTMLButtonElement,
 *   viewport: HTMLElement,
 *   showStatus: (msg: string) => void,
 *   getSelectedObject: () => import("three").Object3D | null,
 *   pickLabObjectAt: (clientX: number, clientY: number) => import("three").Object3D | null,
 *   canPerforate: (object: import("three").Object3D | null) => boolean,
 *   performSubtract: (target: import("three").Object3D, cutter: import("three").Object3D) => void,
 * }} options
 */
export function initCsgTool(options) {
    const {
        csgBtn,
        viewport,
        showStatus,
        getSelectedObject,
        pickLabObjectAt,
        canPerforate,
        performSubtract,
    } = options;

    /** @type {import("three").Object3D | null} */
    let csgTarget = null;

    function isPickMode() {
        return !!csgTarget;
    }

    function syncUi() {
        csgBtn.classList.toggle("is-active", isPickMode());
        csgBtn.setAttribute("aria-pressed", isPickMode() ? "true" : "false");
        viewport.classList.toggle("lab-viewport--csg-pick", isPickMode());
    }

    function cancelPickMode() {
        csgTarget = null;
        syncUi();
    }

    function startPickMode(target) {
        csgTarget = target;
        syncUi();
        showStatus("Perforer — clic gauche sur l’objet à soustraire (Échap pour annuler)");
    }

    function tryStartFromSelection() {
        const selected = getSelectedObject();
        if (!selected || !canPerforate(selected)) {
            showStatus("Sélectionnez d’abord l’objet à perforer");
            return;
        }
        if (isPickMode() && csgTarget === selected) {
            cancelPickMode();
            showStatus("Mode perforation annulé");
            return;
        }
        startPickMode(selected);
    }

    function handleCanvasClick(clientX, clientY) {
        if (!csgTarget) return false;

        const cutter = pickLabObjectAt(clientX, clientY);
        if (!cutter || !canPerforate(cutter)) {
            showStatus("Cliquez un autre objet à soustraire");
            return true;
        }
        if (cutter === csgTarget) {
            showStatus("Choisissez un objet différent du corps");
            return true;
        }

        performSubtract(csgTarget, cutter);
        cancelPickMode();
        return true;
    }

    csgBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        tryStartFromSelection();
    });

    return {
        isPickMode,
        cancelPickMode,
        handleCanvasClick,
        startPickMode,
    };
}
