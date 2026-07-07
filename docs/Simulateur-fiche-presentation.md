# Simulateur de Circuits STI2D — Fiche de présentation

> **Versions web :** [Simulateur/presentation.html](../Simulateur/presentation.html) · **PDF :** `/Simulateur/fiche-presentation.pdf`  
> Régénérer le PDF : `npm run docs:simulateur-presentation-pdf`

**Public visé :** direction, collègues, partenaires pédagogiques  
**Auteur :** option SIN — LGT Saint-Erembert  
**Versions :** site web (`/Simulateur/`) + application Windows **Simulateur H**

---

## En une phrase

Un environnement **français**, **tout-en-un**, qui relie le schéma électrique, la simulation SPICE, la programmation Arduino/ESP32 et (en version bureau) le téléversement sur carte réelle — conçu pour les programmes **STI2D / SIN**.

---

## Le problème adressé

En STI2D, l'élève doit enchaîner plusieurs outils disparates :

| Besoin pédagogique | Outils classiques | Limite |
|--------------------|-------------------|--------|
| Schéma + câblage | Fritzing, Tinkercad | Peu ou pas de SPICE réel |
| Simulation analogique | LTspice, Proteus | Courbe d'apprentissage, pas orienté lycée |
| Arduino / ESP32 | Wokwi, IDE Arduino | Peu de lien avec l'analogique et les composants STI2D |
| Logique combinatoire / séquentielle | Logisim | Déconnecté du reste du montage |
| Téléversement USB en classe | IDE + drivers + cores | Installation longue, support difficile |

**Résultat :** perte de temps, friction technique, moins de temps sur la compréhension physique.

---

## La proposition

### Simulateur web (gratuit pour les élèves du lycée)

- Accessible depuis le portail STI2D (`/Simulateur/`)
- Schéma interactif (glisser-déposer, grille, cartouche, impression A4)
- Simulation **ngspice** (courant continu, transitoire, analyse fréquentielle)
- Microcontrôleurs : **Arduino UNO**, **ESP32-C3**, **ESP32 DevKit**
- Éditeur de sketch intégré, moniteur série
- Capteurs et afficheurs : Grove DHT22, BMP280, TSL2591, LCD I2C, TFT ST7735, matrice 8×8, bargraph
- Logique : portes, bascules D/JK, **CD4511**, **74HC90** (XSPICE)
- Mesures : voltmètre, ampèremètre, ohmmètre, oscilloscope, analyse de Bode
- Mécanique / puissance : moteur DC, servo, **L293D**, **IR2104**, LM7805, transistors

### Simulateur H (application Windows)

- Installateur ou version portable (sans Node.js ni arduino-cli à installer)
- **ngspice** + **arduino-cli** + cores AVR et ESP32-C3 embarqués
- Téléversement **USB** sur carte réelle (UNO, ESP32-C3)
- Fonctionne hors ligne après le premier lancement
- Cible : salles de TP, postes élèves, autres établissements (licence)

---

## Ce qui différencie l'outil

| Critère | Tinkercad / Wokwi | Notre simulateur |
|---------|-------------------|------------------|
| Interface en français | Partiel | **Oui, natif** |
| SPICE analogique réel | Limité / absent | **ngspice** |
| CD4511, 74HC90, Bode | Rare | **Intégré** |
| Drivers moteur (L293D, IR2104) | Rare | **Intégré** |
| Lien avec cours / quiz / projets du lycée | Non | **Oui (même portail)** |
| Pack Windows clé en main + USB | Non | **Simulateur H** |
| Tests automatisés (82+) | — | **Oui** |

---

## Bénéfices pour l'établissement

1. **Moins de temps perdu** en installation et en changement d'outil en TP.
2. **Montée en compétence progressive** : du schéma simple à l'Arduino, puis au matériel réel.
3. **Continuité numérique** entre cours théoriques, simulation et réalisation physique.
4. **Ressource réutilisable** par d'autres enseignants STI2D (partage de circuits JSON).
5. **Potentiel de valorisation** : outil développé en interne, diffusable à d'autres lycées.

---

## Modèle de diffusion envisagé

| Public | Accès | Rémunération |
|--------|-------|--------------|
| Élèves du LGT Saint-Erembert | Gratuit (site + Simulateur H) | — |
| Autres établissements / particuliers | Simulateur H payant ou licence établissement | Oui (à définir avec la direction) |
| Visiteurs externes du site | Contenu public, soutien ou affiliation | Optionnel |

*Note : toute commercialisation doit être validée avec la direction si le développement a mobilisé des moyens de l'établissement.*

---

## Indicateurs de maturité technique

- ~**50 types de composants** dans les menus
- ~**131 modules** moteur de simulation
- **82 tests** automatisés
- Déploiement **Render** (web) + **electron-builder** (Windows)
- Documentation intégrée (fiches broches par composant)

---

## Besoins pour aller plus loin

- [ ] Accord formel de la direction sur la diffusion / commercialisation externe
- [ ] Banque de circuits TP prêts à l'emploi (au-delà des 3 fichiers actuels)
- [x] Page de présentation publique sur le portail (`/Simulateur/presentation.html`)
- [ ] Support de premier niveau (FAQ, canal mail)

---

## Accès

- Simulateur en ligne : `/Simulateur/`
- Fiche de présentation : `/Simulateur/presentation.html`
- PDF : `/Simulateur/fiche-presentation.pdf`
- Application Windows : dossier `SimulateurH/` (build Windows)

---

## Phrases d'accroche

> « En un seul outil, l'élève câble, simule, programme et — avec Simulateur H — téléverse sur la carte qu'il aura en TP. »

> « C'est pensé pour le programme STI2D français, pas pour remplacer Proteus en industrie, mais pour que nos élèves passent moins de temps sur les outils et plus sur la physique. »

> « Les circuits sont enregistrables en JSON : un TP préparé une fois peut être distribué à toute la classe en un clic. »

---

*Document généré pour le projet siteperso-node — Simulateur STI2D.*
