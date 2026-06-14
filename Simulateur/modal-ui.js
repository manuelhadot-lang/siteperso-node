/** Affichage des modales sans bloquer la barre de menus. */

export function showModal(el) {
    if (!el) return;
    el.classList.add('is-open');
    el.classList.remove('hidden');
    el.style.removeProperty('display');
}

export function hideModal(el) {
    if (!el) return;
    el.classList.remove('is-open');
    el.classList.add('hidden');
    el.style.display = 'none';
}

export function initModalUi() {
    for (const el of document.querySelectorAll('.modal')) {
        if (!el.classList.contains('is-open')) hideModal(el);
    }
}
