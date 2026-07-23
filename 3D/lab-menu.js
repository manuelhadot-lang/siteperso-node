/** Barre de menus (Fichier) du laboratoire 3D. */
import { preserveFullscreenDuring } from "./fullscreen.js";

/**
 * @param {{
 *   onNew?: () => void | Promise<void>,
 *   onOpen?: () => void | Promise<void>,
 *   onOpenDisk?: () => void | Promise<void>,
 *   onSave?: () => void | Promise<void>,
 *   onSaveAs?: () => void | Promise<void>,
 *   onSaveDisk?: () => void | Promise<void>,
 *   onClose?: () => void | Promise<void>,
 * }} handlers
 */
export function initFileMenu(handlers) {
    const menuRoot = document.querySelector('[data-menu="file"]');
    if (!menuRoot) return;

    const trigger = menuRoot.querySelector(".lab-menu__trigger");
    const panel = menuRoot.querySelector(".lab-menu__panel");
    if (!trigger || !panel) return;

    const actions = {
        new: handlers.onNew,
        open: handlers.onOpen,
        "open-disk": handlers.onOpenDisk,
        save: handlers.onSave,
        "save-as": handlers.onSaveAs,
        "save-disk": handlers.onSaveDisk,
        close: handlers.onClose,
    };

    function closePanel() {
        panel.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
    }

    function openPanel() {
        panel.hidden = false;
        trigger.setAttribute("aria-expanded", "true");
    }

    function togglePanel() {
        if (panel.hidden) openPanel();
        else closePanel();
    }

    trigger.addEventListener("click", (event) => {
        event.stopPropagation();
        togglePanel();
    });

    panel.querySelectorAll("[data-file-action]").forEach((item) => {
        item.addEventListener("click", (event) => {
            event.stopPropagation();
            const action = item.dataset.fileAction;
            closePanel();
            const handler = actions[action];
            if (handler) preserveFullscreenDuring(() => handler());
        });
    });

    document.addEventListener("click", () => closePanel());
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closePanel();
    });

    document.addEventListener("keydown", (event) => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
            return;
        }

        const mod = event.ctrlKey || event.metaKey;
        if (!mod) return;

        const key = event.key.toLowerCase();
        if (key === "n") {
            event.preventDefault();
            preserveFullscreenDuring(() => handlers.onNew?.());
        } else if (key === "o") {
            event.preventDefault();
            preserveFullscreenDuring(() => handlers.onOpen?.());
        } else if (key === "s" && event.shiftKey) {
            event.preventDefault();
            preserveFullscreenDuring(() => handlers.onSaveAs?.());
        } else if (key === "s") {
            event.preventDefault();
            preserveFullscreenDuring(() => handlers.onSave?.());
        } else if (event.code === "KeyW" && !event.shiftKey) {
            // Ctrl+W ferme (touche physique W uniquement — évite de voler Ctrl+Z AZERTY).
            event.preventDefault();
            preserveFullscreenDuring(() => handlers.onClose?.());
        }
    }, { capture: true });
}
