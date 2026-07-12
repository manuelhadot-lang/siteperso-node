/** Panneau latéral droit — liste des éléments de la scène. */
import { createSceneRegistry } from "./lab-scene-registry.js";
import {
    bindIntensitySliderWheel,
    LIGHT_INTENSITY_MAX,
    LIGHT_INTENSITY_STEP,
} from "./lab-lights.js";

export { createSceneRegistry };

/**
 * @param {HTMLElement | null} panel
 */
export function initScenePanel(panel) {
    const toggle = document.getElementById("lab-scene-panel-toggle");
    const listEl = document.getElementById("lab-scene-list");
    if (!panel || !toggle || !listEl) return null;

    const registry = createSceneRegistry();

    function setOpen(open) {
        panel.classList.toggle("lab-scene-panel--collapsed", !open);
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
        toggle.textContent = open ? "›" : "‹";
        toggle.title = open ? "Replier le panneau scène" : "Déplier le panneau scène";
    }

    toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        setOpen(panel.classList.contains("lab-scene-panel--collapsed"));
    });

    /** @param {import("./lab-scene-registry.js").SceneRegistryItem[]} items */
    function renderList(items) {
        listEl.innerHTML = "";

        if (!items.length) {
            const empty = document.createElement("li");
            empty.className = "lab-scene-list__empty";
            empty.textContent = "Aucun élément";
            listEl.appendChild(empty);
            return;
        }

        for (const item of items) {
            const row = document.createElement("li");
            row.className = "lab-scene-list__item";
            row.dataset.id = item.id;

            const visibleInput = document.createElement("input");
            visibleInput.type = "checkbox";
            visibleInput.className = "lab-scene-list__visible";
            visibleInput.checked = item.getVisible();
            visibleInput.title = "Afficher / masquer";
            visibleInput.setAttribute("aria-label", `Visibilité ${item.label}`);
            visibleInput.addEventListener("click", (e) => e.stopPropagation());
            visibleInput.addEventListener("change", () => {
                registry.setVisible(item.id, visibleInput.checked);
            });

            row.appendChild(visibleInput);

            if (item.getShadow && item.setShadow) {
                const shadowInput = document.createElement("input");
                shadowInput.type = "checkbox";
                shadowInput.className = "lab-scene-list__shadow";
                shadowInput.checked = item.getShadow();
                shadowInput.title = "Ombres (projeter / recevoir)";
                shadowInput.setAttribute("aria-label", `Ombres ${item.label}`);
                shadowInput.addEventListener("click", (e) => e.stopPropagation());
                shadowInput.addEventListener("change", () => {
                    registry.setShadow(item.id, shadowInput.checked);
                });
                row.appendChild(shadowInput);
            } else {
                const shadowSpacer = document.createElement("span");
                shadowSpacer.className = "lab-scene-list__shadow-spacer";
                shadowSpacer.setAttribute("aria-hidden", "true");
                row.appendChild(shadowSpacer);
            }

            const labelBtn = document.createElement("button");
            labelBtn.type = "button";
            labelBtn.className = "lab-scene-list__label";
            labelBtn.textContent = item.label;
            labelBtn.addEventListener("click", () => {
                registry.selectItem(item.id);
            });

            row.appendChild(labelBtn);

            if (item.onDelete) {
                const deleteBtn = document.createElement("button");
                deleteBtn.type = "button";
                deleteBtn.className = "lab-scene-list__delete";
                deleteBtn.title = "Supprimer";
                deleteBtn.setAttribute("aria-label", `Supprimer ${item.label}`);
                deleteBtn.textContent = "×";
                deleteBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    registry.deleteItem(item.id);
                });
                row.appendChild(deleteBtn);
            }

            if (item.getIntensity && item.setIntensity) {
                const intensityWrap = document.createElement("label");
                intensityWrap.className = "lab-scene-list__intensity";
                intensityWrap.title = "Intensité lumineuse";

                const slider = document.createElement("input");
                slider.type = "range";
                slider.min = "0";
                slider.max = String(LIGHT_INTENSITY_MAX);
                slider.step = String(LIGHT_INTENSITY_STEP);
                slider.value = String(item.getIntensity());

                const valueOut = document.createElement("span");
                valueOut.className = "lab-scene-list__intensity-value";
                valueOut.textContent = Number(slider.value).toFixed(2);

                const applyIntensity = (value) => {
                    registry.setIntensity(item.id, value);
                    valueOut.textContent = value.toFixed(2);
                };

                slider.addEventListener("click", (e) => e.stopPropagation());
                slider.addEventListener("input", () => {
                    applyIntensity(Number(slider.value));
                });
                bindIntensitySliderWheel(slider, applyIntensity);

                intensityWrap.appendChild(slider);
                intensityWrap.appendChild(valueOut);
                row.appendChild(intensityWrap);
            }

            listEl.appendChild(row);
        }
    }

    registry.subscribe(renderList);
    setOpen(true);

    return registry;
}
