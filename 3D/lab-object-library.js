/** Bibliothèque Objets chargés — liste mémoire + sélecteur fichier créé au clic. */
import { labPrompt } from "./lab-dialog.js";

export const OBJLIB_DRAG_MIME = "application/x-lab-objlib";

const DB_NAME = "lab3d-object-library";
const DB_STORE = "models";
const DB_VERSION = 2;

const TAB_PERSO = "perso";
const DOMAIN_OPTIONS = [
    { id: TAB_PERSO, label: "Perso" },
    { id: "meubles", label: "Meubles" },
    { id: "props", label: "Props" },
    { id: "vehicules", label: "Véhicules" },
    { id: "archi", label: "Architecture" },
    { id: "divers", label: "Divers" },
];

const ACCEPT =
    ".glb,.gltf,.fbx,.obj,.stl,.dae,.ply,model/gltf-binary,model/gltf+json,application/octet-stream";

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   format: string,
 *   domain: string,
 *   buffer?: ArrayBuffer,
 *   file?: File,
 *   byteLength?: number,
 *   updatedAt: number,
 * }} ObjectLibraryAsset
 */

function makeId() {
    return `obj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatFromName(name) {
    const lower = String(name || "").toLowerCase();
    if (lower.endsWith(".glb")) return "glb";
    if (lower.endsWith(".gltf")) return "gltf";
    if (lower.endsWith(".fbx")) return "fbx";
    if (lower.endsWith(".obj")) return "obj";
    if (lower.endsWith(".stl")) return "stl";
    if (lower.endsWith(".dae")) return "dae";
    if (lower.endsWith(".ply")) return "ply";
    if (lower.endsWith(".blend")) return "blend";
    const m = lower.match(/\.([a-z0-9]+)$/);
    return m?.[1] || "glb";
}

function readBuffer(file) {
    if (file?.arrayBuffer) return file.arrayBuffer();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (reader.result instanceof ArrayBuffer) resolve(reader.result);
            else reject(new Error("Lecture impossible"));
        };
        reader.onerror = () => reject(new Error("Lecture impossible"));
        reader.readAsArrayBuffer(file);
    });
}

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(DB_STORE)) {
                const store = db.createObjectStore(DB_STORE, { keyPath: "id" });
                store.createIndex("domain", "domain", { unique: false });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB indisponible"));
    });
}

async function listAssets() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const req = tx.objectStore(DB_STORE).getAll();
        req.onsuccess = () => {
            const rows = /** @type {ObjectLibraryAsset[]} */ (req.result || []);
            rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            resolve(rows);
        };
        req.onerror = () => reject(req.error);
    });
}

async function putAsset(asset) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).put(asset);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("Quota IndexedDB"));
    });
}

async function deleteAsset(id) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * @param {string} id
 * @returns {Promise<ObjectLibraryAsset | null>}
 */
export async function getObjectLibraryAsset(id) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const req = tx.objectStore(DB_STORE).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

/**
 * Ouvre le sélecteur dans le même geste utilisateur (input éphémère hors panneau).
 * @param {(files: File[]) => void} onFiles
 */
function pickFilesNow(onFiles) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPT;
    input.multiple = true;
    input.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;";
    document.body.appendChild(input);

    let done = false;
    const finish = (files) => {
        if (done) return;
        done = true;
        input.remove();
        onFiles(files);
    };

    input.addEventListener(
        "change",
        () => {
            finish([...(input.files || [])]);
        },
        { once: true }
    );
    input.addEventListener(
        "cancel",
        () => {
            finish([]);
        },
        { once: true }
    );

    // Certains navigateurs n’émettent pas « cancel »
    window.setTimeout(() => {
        if (!done && !input.isConnected) finish([]);
    }, 120000);

    input.click();
}

/**
 * @param {{
 *   root: HTMLElement,
 *   viewport?: HTMLElement | null,
 *   showStatus?: (msg: string) => void,
 *   onSpawnAsset?: (asset: ObjectLibraryAsset, clientX?: number, clientY?: number) => Promise<void> | void,
 * }} options
 */
export function initObjectLibrary(options) {
    const { root, viewport, showStatus: showStatusOpt, onSpawnAsset: onSpawnOpt } = options || {};
    if (!root) {
        console.error("[lab-objlib] root manquant");
        return null;
    }

    const grid =
        root.querySelector("[data-objlib-grid]") ||
        document.querySelector("#lab-section-objlib [data-objlib-grid]") ||
        document.querySelector(".lab-objlib__grid");
    const tabsHost =
        root.querySelector("[data-objlib-tabs]") ||
        document.querySelector("#lab-section-objlib [data-objlib-tabs]");
    const addBtn =
        root.querySelector("[data-objlib-add]") ||
        document.querySelector("#lab-section-objlib [data-objlib-add]");
    const placeBtn = /** @type {HTMLButtonElement | null} */ (
        root.querySelector("[data-objlib-place]") ||
            document.querySelector("#lab-section-objlib [data-objlib-place]")
    );
    const renameBtn = /** @type {HTMLButtonElement | null} */ (
        root.querySelector("[data-objlib-rename]") ||
            document.querySelector("#lab-section-objlib [data-objlib-rename]")
    );
    const deleteBtn = /** @type {HTMLButtonElement | null} */ (
        root.querySelector("[data-objlib-delete]") ||
            document.querySelector("#lab-section-objlib [data-objlib-delete]")
    );
    const domainSelect = /** @type {HTMLSelectElement | null} */ (
        root.querySelector("[data-objlib-domain]") ||
            document.querySelector("#lab-section-objlib [data-objlib-domain]")
    );
    const statusLine =
        root.querySelector("[data-objlib-status]") ||
        document.querySelector("#lab-section-objlib [data-objlib-status]");
    const staticInput = /** @type {HTMLInputElement | null} */ (
        document.getElementById("lab-objlib-file") ||
            root.querySelector("[data-objlib-file]") ||
            document.querySelector("[data-objlib-file]")
    );

    /** @type {(msg: string) => void} */
    let showStatus = typeof showStatusOpt === "function" ? showStatusOpt : () => {};
    /** @type {((asset: ObjectLibraryAsset, clientX?: number, clientY?: number) => Promise<void> | void) | undefined} */
    let onSpawnAsset = onSpawnOpt;

    /** @type {ObjectLibraryAsset[]} */
    let assets = [];
    let activeTab = TAB_PERSO;
    /** @type {string | null} */
    let selectedId = null;
    let syncingDomainSelect = false;

    const notify = (msg) => {
        console.info("[lab-objlib]", msg);
        /* Pas de bandeau texte dans le panneau — uniquement erreurs critiques en viewport. */
        if (
            msg &&
            /erreur|impossible|introuvable|illisible|blend|quota|échec/i.test(msg)
        ) {
            showStatus?.(msg);
        }
    };

    function selectedAsset() {
        return assets.find((a) => a.id === selectedId) || null;
    }

    function readDomain() {
        const v = domainSelect?.value || TAB_PERSO;
        return DOMAIN_OPTIONS.some((d) => d.id === v) ? v : TAB_PERSO;
    }

    function setDomain(domain) {
        if (!domainSelect) return;
        syncingDomainSelect = true;
        domainSelect.value = domain;
        syncingDomainSelect = false;
    }

    function assetsForTab(tab) {
        return assets.filter((a) => (a.domain || TAB_PERSO) === (tab || TAB_PERSO));
    }

    function syncButtons() {
        const ok = !!selectedAsset();
        placeBtn?.toggleAttribute("disabled", !ok);
        renameBtn?.toggleAttribute("disabled", !ok);
        deleteBtn?.toggleAttribute("disabled", !ok);
    }

    function markSelected(id) {
        selectedId = id;
        if (grid) {
            for (const el of grid.querySelectorAll(".lab-objlib__card")) {
                el.classList.toggle("is-selected", el.dataset.objId === id);
            }
        }
        syncButtons();
    }

    /** @param {ObjectLibraryAsset} asset */
    function persistAsset(asset) {
        return putAsset({
            id: asset.id,
            name: asset.name,
            format: asset.format,
            domain: asset.domain,
            buffer: asset.buffer,
            byteLength: asset.byteLength,
            updatedAt: asset.updatedAt,
        });
    }

    function sanitizeLibraryName(raw) {
        return String(raw || "")
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 80);
    }

    /** @param {ObjectLibraryAsset} [asset] */
    async function renameAsset(asset) {
        const target = asset || selectedAsset();
        if (!target) return;
        markSelected(target.id);
        const raw = await labPrompt("Nouveau nom dans la liste (avant de placer) :", {
            title: "Renommer l’objet chargé",
            defaultValue: target.name,
            confirmLabel: "Renommer",
            cancelLabel: "Annuler",
        });
        if (raw == null) return;
        const next = sanitizeLibraryName(raw);
        if (!next || next === target.name) return;
        target.name = next;
        target.updatedAt = Date.now();
        renderGrid();
        void persistAsset(target).catch(() => {});
    }

    function revealSection() {
        const section = root.closest(".lab-side-panel__section");
        if (!section) return;
        section.classList.add("lab-side-panel__section--open");
        section.classList.remove("lab-side-panel__section--collapsed");
        section.querySelector(".lab-side-panel__section-toggle")?.setAttribute("aria-expanded", "true");
        const panel = document.getElementById("lab-side-panel");
        panel?.classList.remove("lab-side-panel--collapsed");
    }

    function renderTabs() {
        if (!tabsHost) return;
        tabsHost.replaceChildren();
        for (const opt of DOMAIN_OPTIONS) {
            const count = assetsForTab(opt.id).length;
            const btn = document.createElement("button");
            btn.type = "button";
            btn.classList.toggle("is-active", opt.id === activeTab);
            btn.textContent = count ? `${opt.label} (${count})` : opt.label;
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                activeTab = opt.id;
                selectedId = null;
                setDomain(opt.id);
                renderTabs();
                renderGrid();
            });
            tabsHost.appendChild(btn);
        }
    }

    function renderGrid() {
        if (!grid) {
            notify("Erreur : zone liste introuvable");
            return;
        }
        const list = assetsForTab(activeTab);
        syncButtons();
        grid.replaceChildren();

        if (!list.length) {
            const empty = document.createElement("p");
            empty.className = "lab-objlib__empty";
            empty.textContent = "Aucun objet — utilisez Charger…";
            grid.appendChild(empty);
            return;
        }

        for (const asset of list) {
            const card = document.createElement("button");
            card.type = "button";
            card.className = "lab-objlib__card" + (asset.id === selectedId ? " is-selected" : "");
            card.dataset.objId = asset.id;
            card.draggable = true;
            card.title = `${asset.name} — glisser ou Placer · double-clic sur le nom pour renommer`;

            const label = document.createElement("span");
            label.className = "lab-objlib__card-label";
            label.textContent = asset.name;
            label.title = "Double-clic pour renommer";

            card.append(label);

            card.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                setDomain(asset.domain || TAB_PERSO);
                markSelected(asset.id);
            });

            label.addEventListener("dblclick", (e) => {
                e.preventDefault();
                e.stopPropagation();
                markSelected(asset.id);
                void renameAsset(asset);
            });

            card.addEventListener("dblclick", (e) => {
                e.preventDefault();
                e.stopPropagation();
                markSelected(asset.id);
                void spawnSelected(asset.id);
            });

            card.addEventListener("dragstart", (e) => {
                selectedId = asset.id;
                const payload = JSON.stringify({ kind: "lab-object", id: asset.id });
                e.dataTransfer?.setData(OBJLIB_DRAG_MIME, payload);
                e.dataTransfer?.setData("text/plain", payload);
                if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
                card.classList.add("is-dragging");
                viewport?.classList.add("lab-viewport--objdrop");
            });
            card.addEventListener("dragend", () => {
                card.classList.remove("is-dragging");
                viewport?.classList.remove("lab-viewport--objdrop", "lab-viewport--drop");
            });

            grid.appendChild(card);
        }
    }

    /**
     * @param {File[]} files
     */
    async function addFiles(files) {
        const list = [...(files || [])].filter(Boolean);
        if (!list.length) return;

        const domain = readDomain();
        activeTab = domain;
        setDomain(domain);
        revealSection();

        let added = 0;
        /** @type {ObjectLibraryAsset | null} */
        let last = null;

        for (const file of list) {
            const format = formatFromName(file.name);
            if (format === "blend") {
                notify(`${file.name} : exportez en GLB/FBX depuis Blender`);
                continue;
            }
            const name = String(file.name || "Objet").replace(/\.[^.]+$/, "") || "Objet";
            /** @type {ObjectLibraryAsset} */
            const asset = {
                id: makeId(),
                name,
                format,
                domain,
                file,
                byteLength: Number(file.size) || 0,
                updatedAt: Date.now(),
            };
            assets.unshift(asset);
            selectedId = asset.id;
            last = asset;
            added += 1;
        }

        // Affichage immédiat — avant toute lecture / IndexedDB
        renderTabs();
        renderGrid();

        if (!added || !last) return;

        for (const asset of assets.slice(0, added).reverse()) {
            try {
                if (!asset.buffer && asset.file) {
                    asset.buffer = (await readBuffer(asset.file)).slice(0);
                    asset.byteLength = asset.buffer.byteLength;
                }
                await persistAsset(asset);
            } catch (err) {
                console.warn("[lab-objlib] persist (objet déjà visible)", err);
            }
        }
        renderGrid();
    }

    async function resolveAsset(id) {
        const mem = assets.find((a) => a.id === id) || null;
        if (mem?.buffer || mem?.file) return mem;
        try {
            const fresh = await getObjectLibraryAsset(id);
            if (!fresh) return mem;
            const idx = assets.findIndex((a) => a.id === id);
            if (idx >= 0) {
                assets[idx] = { ...fresh, file: mem?.file, buffer: fresh.buffer || mem?.buffer };
                return assets[idx];
            }
            return fresh;
        } catch {
            return mem;
        }
    }

    /**
     * @param {string} [forceId]
     * @param {number} [clientX]
     * @param {number} [clientY]
     */
    async function spawnSelected(forceId, clientX, clientY) {
        const asset =
            (forceId ? assets.find((a) => a.id === forceId) : null) ||
            selectedAsset() ||
            assetsForTab(activeTab)[0] ||
            assets[0] ||
            null;

        if (!asset) {
            notify("Liste vide — Charger… d’abord");
            return;
        }
        selectedId = asset.id;
        syncButtons();

        if (!onSpawnAsset) {
            notify("Éditeur 3D pas prêt — réessayez dans 1 s");
            return;
        }

        try {
            const full = (await resolveAsset(asset.id)) || asset;
            if (!full.buffer && full.file) {
                full.buffer = (await readBuffer(full.file)).slice(0);
            }
            if (!full.buffer) throw new Error("Fichier illisible — rechargez-le");
            await onSpawnAsset(full, clientX, clientY);
        } catch (error) {
            console.error("[lab-objlib] spawn", error);
            notify(error instanceof Error ? error.message : "Placement impossible");
        }
    }

    // Label[for=lab-objlib-file] : le navigateur ouvre le picker tout seul.
    // Ne PAS preventDefault (sinon le dialogue ne s’ouvre jamais).
    addBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        revealSection();
    });

    const fileInput =
        staticInput ||
        /** @type {HTMLInputElement | null} */ (document.getElementById("lab-objlib-file"));

    function onFileInputChange(input) {
        const files = [...(input.files || [])];
        input.value = "";
        if (files.length) void addFiles(files);
    }

    fileInput?.addEventListener("change", () => onFileInputChange(fileInput));

    if (typeof window !== "undefined") {
        window.__LAB_OBJLIB__ = {
            addFiles,
            get assets() {
                return assets;
            },
        };
    }

    // Fichiers reçus par le script inline HTML avant le module
    const pending = typeof window !== "undefined" ? window.__LAB_OBJLIB_PENDING__ : null;
    if (Array.isArray(pending) && pending.length) {
        const batch = pending.splice(0, pending.length);
        void addFiles(batch);
    }

    placeBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        void spawnSelected(selectedId || undefined);
    });

    renameBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        void renameAsset();
    });

    deleteBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const asset = selectedAsset();
        if (!asset) return;
        void deleteAsset(asset.id)
            .catch(() => {})
            .finally(() => {
                assets = assets.filter((a) => a.id !== asset.id);
                selectedId = null;
                renderTabs();
                renderGrid();
            });
    });

    domainSelect?.addEventListener("change", () => {
        if (syncingDomainSelect) return;
        const domain = readDomain();
        const sel = selectedAsset();
        if (sel) {
            sel.domain = domain;
            sel.updatedAt = Date.now();
            activeTab = domain;
            void persistAsset(sel).catch(() => {});
            renderTabs();
            renderGrid();
            return;
        }
        activeTab = domain;
        selectedId = null;
        renderTabs();
        renderGrid();
    });

    // Drop fichiers OS → liste
    const browser = root.querySelector(".lab-objlib__browser");
    for (const el of [grid, browser].filter(Boolean)) {
        el.addEventListener("dragover", (event) => {
            if (!event.dataTransfer?.types?.includes("Files")) return;
            event.preventDefault();
            el.classList.add("is-drop-target");
        });
        el.addEventListener("dragleave", () => el.classList.remove("is-drop-target"));
        el.addEventListener("drop", (event) => {
            const files = [...(event.dataTransfer?.files || [])];
            el.classList.remove("is-drop-target");
            if (!files.length) return;
            event.preventDefault();
            event.stopPropagation();
            void addFiles(files);
        });
    }

    // Drop carte → scène
    const dropTarget =
        viewport?.querySelector?.("canvas") ||
        viewport ||
        document.querySelector("#lab-viewport canvas") ||
        document.getElementById("lab-viewport");

    if (dropTarget) {
        dropTarget.addEventListener("dragover", (event) => {
            const types = event.dataTransfer?.types ? [...event.dataTransfer.types] : [];
            if (types.includes("application/x-lab-texlib")) return;
            if (!types.includes(OBJLIB_DRAG_MIME) && !types.includes("text/plain")) return;
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
            viewport?.classList.add("lab-viewport--drop");
        });
        dropTarget.addEventListener("drop", (event) => {
            const types = event.dataTransfer?.types ? [...event.dataTransfer.types] : [];
            if (types.includes("application/x-lab-texlib")) return;
            const raw =
                event.dataTransfer?.getData(OBJLIB_DRAG_MIME) ||
                event.dataTransfer?.getData("text/plain") ||
                "";
            if (!raw.includes("lab-object")) return;
            let id = "";
            try {
                const parsed = JSON.parse(raw);
                if (parsed?.kind !== "lab-object") return;
                id = parsed.id || "";
            } catch {
                return;
            }
            if (!id) return;
            event.preventDefault();
            event.stopPropagation();
            viewport?.classList.remove("lab-viewport--drop", "lab-viewport--objdrop");
            void spawnSelected(id, event.clientX, event.clientY);
        });
    }

    // Charger IndexedDB sans écraser la mémoire
    void (async () => {
        try {
            const rows = await listAssets();
            const byId = new Map(assets.map((a) => [a.id, a]));
            for (const row of rows) {
                if (!row?.id) continue;
                const prev = byId.get(row.id);
                byId.set(row.id, prev ? { ...row, buffer: row.buffer || prev.buffer, file: prev.file } : row);
            }
            assets = [...byId.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        } catch (err) {
            console.warn("[lab-objlib] IDB", err);
        }
        renderTabs();
        renderGrid();
    })();

    revealSection();
    renderTabs();
    renderGrid();

    return {
        refresh: async () => {
            renderTabs();
            renderGrid();
        },
        addFiles,
        getSelected: selectedAsset,
        bind(next) {
            if (typeof next?.showStatus === "function") showStatus = next.showStatus;
            if (typeof next?.onSpawnAsset === "function") onSpawnAsset = next.onSpawnAsset;
        },
    };
}
