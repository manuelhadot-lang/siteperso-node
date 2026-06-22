Simulateur H — application Windows
==================================

Prérequis (machine de build uniquement)
---------------------------------------
- Windows 10/11 x64
- Node.js 20 ou plus récent
- Connexion Internet (une fois, pour préparer le bundle Arduino)
- ngspice_con.exe + DLL dans Simulateur/bin/ (bundle ngspice Windows)

Contenu embarqué dans l'installateur (poste élève / prof)
---------------------------------------------------------
- Simulateur complet + ngspice
- arduino-cli + cores AVR et ESP32-C3 (compilation et téléversement USB)
- Bibliothèques Arduino courantes (DHT, LCD I2C, Adafruit GFX/ST7735/TSL2591)
- Aucune installation séparée requise après setup

Lancer en développement
-----------------------
  cd SimulateurH
  npm install
  npm start

Construire l'installateur Windows
---------------------------------
Depuis la racine du dépôt :

  .\scripts\build-simulateur-h.ps1

Le script télécharge arduino-cli et installe les cores si nécessaire, puis lance electron-builder.

Préparer le bundle Arduino manuellement :

  npm run prepare-arduino-bundle

Fichiers générés dans SimulateurH/dist-out/ :
  - Simulateur H-Setup-x.x.x.exe     Assistant d'installation (NSIS, français)
  - Simulateur H-x.x.x-x64.exe       Application installée
  - Simulateur H-x.x.x-Portable-x64.exe   Version portable

Installateur NSIS (utilisateur final)
-------------------------------------
1. Double-clic sur Simulateur H-Setup-x.x.x.exe
2. Assistant en français
3. Raccourci Bureau + menu Démarrer
4. Brancher UNO ou XIAO ESP32-C3 en USB → éditeur Arduino → Téléverser USB

Notes
-----
- Serveur local : http://127.0.0.1:43721/ (port : SIMULATEUR_H_PORT)
- Premier lancement : copie des cores vers %AppData% (quelques minutes, une seule fois)
- Pilotes USB carte (CH340/CP2102) : parfois requis une fois par Windows (drivers Windows Update)
- Pour régénérer simulate-server.cjs : node tools/build-standalone-server.cjs
