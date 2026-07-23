/** Menu Description — aide clavier / souris / outils. */
import { labRichAlert } from "./lab-dialog.js";

const HELP_BODY = `
<div class="lab-help">
  <section class="lab-help__section">
    <h3 class="lab-help__heading">Modes de vue</h3>
    <ul class="lab-help__list">
      <li><strong>FPS</strong> — marcher au sol (ZQSD / WASD), regarder (clic gauche + glisser), <strong>Espace</strong> = saut, <strong>Maj</strong> = courir</li>
      <li><strong>Conception</strong> — orbite autour de l’objet sélectionné (comme Blender) : clic gauche + glisser pour tourner, molette pour zoomer (rapprochement très serré possible)</li>
      <li><strong>Vue d’ensemble</strong> — se déplacer librement en hauteur (ZQSD), molette pour avancer / reculer, clic gauche + glisser pour regarder</li>
    </ul>
  </section>

  <section class="lab-help__section">
    <h3 class="lab-help__heading">Sélection &amp; édition</h3>
    <ul class="lab-help__list">
      <li><strong>Clic gauche</strong> — sélectionner un objet</li>
      <li><strong>Ctrl + clic</strong> — ajouter / retirer de la sélection (multi-sélection)</li>
      <li><strong>Clic droit</strong> — menu contextuel de l’objet</li>
      <li><strong>Double-clic</strong> — cadrer la caméra sur l’objet</li>
      <li><strong>G</strong> déplacer · <strong>R</strong> tourner · <strong>E</strong> échelle</li>
      <li><strong>C</strong> — placer un cube</li>
      <li><strong>Suppr</strong> / <strong>Retour arrière</strong> — supprimer la sélection</li>
      <li><strong>Ctrl+C</strong> / <strong>Ctrl+V</strong> — copier / coller la sélection</li>
      <li><strong>Ctrl+Z</strong> / <strong>Ctrl+Y</strong> — annuler / rétablir</li>
      <li><strong>Échap</strong> — quitter un outil / revenir à la vue d’ensemble depuis le FPS</li>
    </ul>
  </section>

  <section class="lab-help__section">
    <h3 class="lab-help__heading">Texture Face</h3>
    <ul class="lab-help__list">
      <li>Activez <strong>Activer peinture face</strong>, puis peignez un cube (crayon, formes, décalcomanie…).</li>
      <li><strong>Texture face</strong> / <strong>Tex. pinceau</strong> — chargez une image à appliquer.</li>
      <li>Menu <strong>Face → Mode triangulation</strong> : glissez pour sélectionner des triangles (objets et terrain).</li>
      <li><strong>Appliquer △</strong> pose la texture sur la sélection ; <strong>Tile</strong> et <strong>Offset</strong> restent ajustables ensuite.</li>
      <li><strong>Ctrl+Z</strong> annule la dernière texture posée, puis les étapes de sélection.</li>
    </ul>
  </section>

  <section class="lab-help__section">
    <h3 class="lab-help__heading">Terrain</h3>
    <ul class="lab-help__list">
      <li><strong>Créer sur toute la grille</strong> puis sculptez (mamelon, montagne, cuvette, lisser, dessiner).</li>
      <li><strong>Clic gauche</strong> : sculpter · <strong>clic droit</strong> : tourner la caméra · <strong>molette</strong> : rayon du pinceau.</li>
      <li>Texture / normal map du sol, tile, intensité ; texture du pinceau pour peindre le relief.</li>
      <li>« Afficher le plateau » masque le sol gris d’origine (la collision FPS reste active).</li>
    </ul>
  </section>

  <section class="lab-help__section">
    <h3 class="lab-help__heading">Océan</h3>
    <ul class="lab-help__list">
      <li><strong>Créer un océan</strong> ajoute une surface d’eau animée (vagues Gerstner + reflets).</li>
      <li>Réglez couleur, opacité, hauteur / fréquence / vitesse des vagues, crêtes, écume, niveau et taille.</li>
      <li>Une skybox HDRI améliore encore les reflets.</li>
    </ul>
  </section>

  <section class="lab-help__section">
    <h3 class="lab-help__heading">Végétation</h3>
    <ul class="lab-help__list">
      <li>Types simples : Arbre, Buisson, Pin, Fleurs — ou <strong>Importer arbre .glb</strong> pour un modèle réaliste.</li>
      <li><strong>Placer</strong> : clic court sur le sol · <strong>Échap</strong> pour quitter.</li>
      <li>Option « Peindre le sol sous le végétal » et « Texture sol → pinceau » pour lier le sol au terrain.</li>
    </ul>
  </section>

  <section class="lab-help__section">
    <h3 class="lab-help__heading">Tubulure</h3>
    <ul class="lab-help__list">
      <li>Icône tube dans Complexes — longueur / rayon / paroi libres, orientation à tout angle (gizmo).</li>
      <li>Menu contextuel : prolonger un bout, coudes préréglés, apparence matériau (couleur, métal, texture…).</li>
    </ul>
  </section>

  <section class="lab-help__section">
    <h3 class="lab-help__heading">Fichiers</h3>
    <ul class="lab-help__list">
      <li><strong>Ctrl+N</strong> nouvelle scène · <strong>Ctrl+O</strong> ouvrir · <strong>Ctrl+S</strong> enregistrer</li>
      <li><strong>Ctrl+Maj+S</strong> enregistrer sous · <strong>Ctrl+W</strong> fermer</li>
    </ul>
  </section>

  <section class="lab-help__section">
    <h3 class="lab-help__heading">Souris (rappel)</h3>
    <ul class="lab-help__list">
      <li><strong>Molette</strong> — zoom (conception) ou déplacement avant/arrière (vue d’ensemble / FPS)</li>
      <li><strong>Glisser-déposer</strong> depuis le panneau Objets — placer sur la grille</li>
    </ul>
  </section>
</div>
`;

/**
 * Menu « Description » de la barre du haut.
 */
export function initHelpMenu() {
    const menuRoot = document.querySelector('[data-menu="help"]');
    if (!menuRoot) return;

    const trigger = menuRoot.querySelector(".lab-menu__trigger");
    const panel = menuRoot.querySelector(".lab-menu__panel");
    if (!trigger || !panel) return;

    function closePanel() {
        panel.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
    }

    trigger.addEventListener("click", (event) => {
        event.stopPropagation();
        const willOpen = panel.hidden;
        panel.hidden = !willOpen;
        trigger.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });

    panel.querySelectorAll("[data-help-action]").forEach((item) => {
        item.addEventListener("click", async (event) => {
            event.stopPropagation();
            const action = item.getAttribute("data-help-action");
            closePanel();
            if (action === "shortcuts") {
                await labRichAlert(HELP_BODY, { title: "Description — outils & raccourcis" });
            }
        });
    });

    document.addEventListener("click", () => closePanel());
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closePanel();
        if ((event.key === "F1" || event.key === "?") && !event.ctrlKey && !event.metaKey) {
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
                return;
            }
            event.preventDefault();
            void labRichAlert(HELP_BODY, { title: "Description — outils & raccourcis" });
        }
    });
}
