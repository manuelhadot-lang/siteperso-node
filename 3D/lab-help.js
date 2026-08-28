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
      <li><strong>F2</strong> / clic droit → <strong>Renommer…</strong> / double-clic sur le nom dans le panneau Scène — renommer l’objet (mémorisé avec Ctrl+S)</li>
      <li><strong>Double-clic</strong> (vue 3D) — cadrer la caméra sur l’objet</li>
      <li><strong>G</strong> déplacer · <strong>R</strong> tourner · <strong>E</strong> échelle</li>
      <li><strong>C</strong> — placer un cube</li>
      <li><strong>Suppr</strong> / <strong>Retour arrière</strong> — supprimer la sélection (objets, ou triangles si une sélection △ est active)</li>
      <li><strong>Ctrl+C</strong> / <strong>Ctrl+V</strong> — copier / coller la sélection</li>
      <li><strong>Ctrl+Z</strong> / <strong>Ctrl+Y</strong> — annuler / rétablir</li>
      <li><strong>Échap</strong> — quitter un outil / revenir à la vue d’ensemble depuis le FPS</li>
    </ul>
  </section>

  <section class="lab-help__section">
    <h3 class="lab-help__heading">Textures</h3>
    <ul class="lab-help__list">
      <li>Panneau <strong>Textures</strong> : choisissez <strong>Objet complet</strong>, <strong>Face</strong> ou <strong>Triangles</strong>.</li>
      <li><strong>Objet complet</strong> — déposez une vignette sur l’objet (couleur / normal / spéculaire).</li>
      <li><strong>Face</strong> — cliquez une face (surbrillance), <strong>clic droit</strong> pour vider, puis déposez une texture. <strong>Suppr</strong> retire cette face.</li>
      <li><strong>Triangles</strong> — glissez pour sélectionner des △, <strong>clic droit</strong> pour vider la sélection, puis déposez la texture, ou <strong>Suppr</strong> / <strong>Suppr △</strong> pour les retirer de la géométrie.</li>
      <li><strong>Tile / Off.</strong> n’affectent que le <em>dernier</em> dépôt (objet, face ou lot de triangles).</li>
      <li><strong>Réflexion</strong> (menu objet) : curseur continu — 0 mat, 0,25–0,35 parquet ciré, 1 miroir. Bouton <strong>Ciré</strong> pour un vernis léger.</li>
      <li><strong>Ctrl+Z</strong> annule la sélection △ (en mode Triangles), puis texture / peinture / scène…</li>
      <li><strong>Charger…</strong> pour vos images (onglet Perso). Peinture optionnelle dans le volet dédié.</li>
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
    <h3 class="lab-help__heading">Architecture</h3>
    <ul>
      <li>Sous-menu Architecture : Pièce unique, L, U, Patio. Menu objet : ailes (L/U), taille de cour (Patio), étages (1–100) pour toutes. Toits L/U/Patio = empreinte exacte. La 1ʳᵉ pièce place l’avatar au centre (FPS).</li>
      <li>Clic sur un mur : le menu Architecture ne montre que les portes / fenêtres de cette face (étage inclus). Plinthes activables par étage. Pas de lissage dans ce menu.</li>
      <li><strong>Ajouter une porte / fenêtre</strong> pose un trou avec encadrement et battant (ou vitre). Cliquez la porte/fenêtre dans la vue pour la sélectionner seule (gizmo G/R/E) — le mur ne bouge pas. Dans la liste : <strong>Remplacer par un GLB…</strong>, <strong>Modèle simple</strong>, <strong>Trou seul</strong>, ou × pour supprimer. Les curseurs Largeur/Hauteur/Offset règlent le trou dans le mur.</li>
      <li>L’ajout est refusé si le mur/étage n’a plus assez d’espace libre (écart min. entre ouvertures).</li>
      <li>Les ouvertures laissent un passage libre (collisions) — entrez en mode FPS pour vérifier.</li>
      <li><strong>Textures</strong> : mode Objet (pièce entière), Face (une face de panneau), Triangles (sélection — tile aligné sur plusieurs panneaux). Tile objet = répétitions/m.</li>
    </ul>
    <h3 class="lab-help__heading">Tubulure</h3>
    <ul class="lab-help__list">
      <li>Icône tube dans Complexes — longueur / rayon / paroi libres, orientation à tout angle (gizmo).</li>
      <li>Menu contextuel : prolonger un bout, coudes préréglés, apparence matériau (couleur, métal, texture…).</li>
    </ul>
  </section>

  <section class="lab-help__section">
    <h3 class="lab-help__heading">Barque</h3>
    <ul class="lab-help__list">
      <li>Icône barque dans Complexes — coque bordée, plancher, bancs et avirons, bois texturé.</li>
      <li>Posée sur un océan, elle suit la houle (pilonnement, tangage, roulis) : le joueur tient debout dedans.</li>
      <li>Le gizmo règle position et cap ; la hauteur reste pilotée par les vagues.</li>
      <li>Menu objet : <strong>Remplacer l’apparence (importer)…</strong> pour un modèle .glb tout en gardant la flottaison ; ou <strong>Faire flotter comme une barque</strong> sur un cube / sphère / import.</li>
    </ul>
  </section>

  <section class="lab-help__section">
    <h3 class="lab-help__heading">Avatar</h3>
    <ul class="lab-help__list">
      <li>Bouton <strong>Avatar</strong> dans la barre — un anneau rouge suit la souris ; clic pour y téléporter le joueur (passe en FPS).</li>
      <li>Clic droit sur un objet / une barque → <strong>Placer l’avatar ici</strong>.</li>
      <li><strong>Échap</strong> annule le mode placement.</li>
    </ul>
  </section>

  <section class="lab-help__section">
    <h3 class="lab-help__heading">Import GLB</h3>
    <ul class="lab-help__list">
      <li>Panneau gauche <strong>Objets chargés</strong> : <strong>Renommer</strong> (ou double-clic sur le nom), puis <strong>Placer</strong> / glisser dans la vue.</li>
      <li>Clic droit → <strong>Outils mesh</strong> (replié) : perforer, épaissir, séparer les pièces, extraire ou <strong>supprimer les triangles</strong>. S’ouvre tout seul sur un import ou en mode Triangles.</li>
      <li>Clic droit sur un objet → <strong>Exporter en GLB</strong> pour télécharger ce modèle (couleurs, textures, verre).</li>
      <li>Ajoute une épaisseur (défaut 2 cm) pour fermer les coques CAD ouvertes (portes, panneaux…) sans passer par Blender. Les micro-fissures sont soudées avant pour éviter des rayures sur la surface.</li>
      <li>Couleurs, verre, métal et textures sont capturés sur chaque pièce du modèle à l’enregistrement (Ctrl+S) et restaurés à l’ouverture.</li>
    </ul>
  </section>

  <section class="lab-help__section">
    <h3 class="lab-help__heading">Dynamique (physique)</h3>
    <ul class="lab-help__list">
      <li>Clic droit → <strong>Dynamique (physique)</strong> : vrai corps solide (gravité 9,81 m/s², inertia, frottement).</li>
      <li>Une <strong>sphère</strong> rebondit et <strong>roule</strong> si on la pousse (avatar ou choc). Un <strong>ballon allongé</strong> (sphère étirée / import type rugby) rebondit de travers selon le point de contact.</li>
      <li>Un <strong>cube</strong> qui tombe sur une arête <strong>bascule</strong> d’un côté ; les objets se <strong>percutent</strong> et peuvent s’empiler.</li>
      <li>Les objets dynamiques <strong>collisionnent entre eux</strong> et avec les autres props (cubes, imports). La case <strong>Collisions</strong> ne concerne que l’avatar.</li>
      <li><strong>Masse (kg)</strong> : P = m·g. Plus c’est lourd, moins l’avatar le déplace. La chute libre verticale ne dépend pas de m (Galilée).</li>
      <li><strong>Rebond (e)</strong> : 0 = s’arrête, 0,4 = moyen, 1 = idéal.</li>
      <li>Pendant un déplacement au gizmo, la physique de cet objet est en pause.</li>
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
