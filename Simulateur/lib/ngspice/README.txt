Fichiers ngspice / XSPICE pour le simulateur
==========================================

Pour les bascules D et le CD4511 (BCD → 7 segments) en mode XSPICE, copiez ici :

  digital.cm

Ce fichier se trouve dans une installation ngspice avec XSPICE, par exemple :

  - Windows (MSYS2 / installer) : share/ngspice/digital.cm
  - Linux : /usr/lib/ngspice/digital.cm ou /usr/share/ngspice/digital.cm

Placez aussi l'exécutable ngspice COMPILE AVEC XSPICE dans Simulateur/bin/ :
  ngspice.exe ou ngspice_con.exe (+ DLL dans Simulateur/lib/ si besoin).

Verifiez avec : npm run check-ngspice
  « XSPICE dans le binaire : oui » = test devhelp d_dff (pas seulement ngspice -v).
  Certaines builds ngspice-46 listent les modeles XSPICE dans devhelp sans afficher
  le mot XSPICE dans « ngspice -v » — c'est normal si check-ngspice affiche oui.
  Sans devhelp d_dff, le simulateur repasse sur le modele B (sources comportementales).

Sans digital.cm OU sans binaire XSPICE, les bascules D utilisent l'ancien modele (sources B).
Le CD4511 n'est simule qu'avec XSPICE (d_dlatch + d_genlut).

Test CD4511 : node Simulateur/Engine/logic-cd4511-xspice.test.mjs
