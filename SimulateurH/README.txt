Simulateur H — application Windows
==================================

Prérequis
---------
- Node.js 20 ou plus récent
- ngspice_con.exe dans Simulateur/bin/ (bundle ngspice Windows)

Lancer en développement
-----------------------
  cd SimulateurH
  npm install
  npm start

Construire l'installateur Windows (.exe)
----------------------------------------
  cd SimulateurH
  npm install
  npm run dist

Les fichiers générés se trouvent dans SimulateurH/dist/
  - Simulateur H Setup x.x.x.exe  (installateur NSIS)
  - Simulateur H x.x.x.exe        (version portable)

Notes
-----
- L'application embarque le dossier Simulateur/ (interface + moteur SPICE).
- Le serveur local écoute sur http://127.0.0.1:43721/ (port modifiable via SIMULATEUR_H_PORT).
- Pour régénérer tools/simulate-standalone-server.cjs après modification de server.js :
    node tools/build-standalone-server.cjs
