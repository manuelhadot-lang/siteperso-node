# -*- coding: utf-8 -*-
"""Génère 4 quiz (20 Q, 3 réponses, 1 bonne) sur les fiches C++ et systèmes microprogrammés."""
from __future__ import annotations

import json
from copy import deepcopy
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QUIZZES = ROOT / "quizzes.json"


def Q(text, answers, correct):
    assert len(answers) == 3 and correct in (0, 1, 2)
    return {"text": text, "answers": answers, "correct": correct, "image": None}


# ---------------------------------------------------------------------------
# Éval. n°1 — bases C++ + câblé / microcontrôleur
# ---------------------------------------------------------------------------
QUIZ1 = [
    Q("En C++, chaque instruction se termine en général par :",
      ["deux-points :", "point-virgule ;", "virgule ,"], 1),
    Q("Un commentaire sur une ligne commence par :",
      ["/*", "//", "#"], 1),
    Q("La fonction exécutée une seule fois au démarrage est :",
      ["loop()", "setup()", "main()"], 1),
    Q("La fonction répétée sans arrêt sur Arduino / ESP32 est :",
      ["setup()", "init()", "loop()"], 2),
    Q("Le mot-clé void devant setup() signifie que la fonction :",
      ["renvoie un entier", "ne renvoie pas de valeur", "est obligatoire"], 1),
    Q("Dans un système câblé, pour changer le comportement il faut :",
      ["téléverser un nouveau programme", "recâbler / modifier le matériel", "changer uniquement la RAM"], 1),
    Q("Dans un système microprogrammé, on change le comportement en :",
      ["recâblant les composants", "téléversant un nouveau programme", "changeant l’horloge uniquement"], 1),
    Q("La chaîne d'information typique est :",
      ["actionneur -> programme -> capteur", "capteur -> entrée -> programme -> sortie -> actionneur", "programme -> capteur -> actionneur"], 1),
    Q("Un microcontrôleur réunit sur une puce :",
      ["uniquement le processeur", "processeur, mémoires et périphériques", "uniquement la RAM"], 1),
    Q("Un microprocesseur, contrairement au microcontrôleur :",
      ["contient déjà flash et EEPROM", "est surtout l’unité de calcul (mémoires / E-S à part)", "ne peut pas exécuter de programme"], 1),
    Q("GPIO signifie :",
      ["entrée analogique uniquement", "entrée-sortie à usage général", "générateur de tension"], 1),
    Q("Sur un Arduino Uno, le niveau logique haut vaut environ :",
      ["3,3 V", "5 V", "12 V"], 1),
    Q("Sur un ESP32, le niveau logique haut vaut environ :",
      ["5 V", "3,3 V", "1,8 V"], 1),
    Q("Le langage distingue les majuscules : n et N sont :",
      ["la même variable", "deux variables différentes", "interdits"], 1),
    Q("Un bloc d’instructions est entouré par :",
      ["parenthèses ( )", "accolades { }", "crochets [ ]"], 1),
    Q("L’algorithme décrit la méthode :",
      ["uniquement en C++", "en français, sans détail de langage", "uniquement en binaire"], 1),
    Q("setup() sert typiquement à :",
      ["lire les capteurs en boucle", "préparer les broches et la liaison série", "éteindre la carte"], 1),
    Q("Un actionneur typique est :",
      ["un bouton poussoir", "une LED ou un moteur", "une photorésistance"], 1),
    Q("Un capteur typique est :",
      ["un moteur", "une LED", "un bouton ou une LDR"], 2),
    Q("Le processeur exécute les instructions :",
      ["toutes en même temps", "l’une après l’autre", "uniquement au téléversement"], 1),
]

# ---------------------------------------------------------------------------
# Éval. n°2 — variables, const, if + cartes / IDE
# ---------------------------------------------------------------------------
QUIZ2 = [
    Q("Une variable est stockée principalement en :",
      ["flash", "RAM", "EEPROM uniquement"], 1),
    Q("Le type int sert à stocker :",
      ["un décimal", "un entier", "un texte long"], 1),
    Q("Le type float sert à stocker :",
      ["un entier uniquement", "un nombre décimal", "vrai ou faux"], 1),
    Q("Le type bool peut valoir :",
      ["seulement 0 à 255", "true ou false", "uniquement des lettres"], 1),
    Q("En C++, le point décimal s’écrit :",
      ["avec une virgule : 3,3", "avec un point : 3.3", "avec un slash : 3/3"], 1),
    Q("const int SEUIL = 25; signifie que SEUIL :",
      ["peut être modifié librement", "ne doit plus être modifié par le programme", "est stocké uniquement en RAM volatile"], 1),
    Q("On préfère const à #define car :",
      ["#define est plus précis", "const a un type visible et détecte les erreurs", "#define est obligatoire sur ESP32"], 1),
    Q("Le symbole = sert à :",
      ["comparer deux valeurs", "affecter (ranger) une valeur", "déclarer un type"], 1),
    Q("Le symbole == sert à :",
      ["affecter une valeur", "comparer l’égalité", "incrémenter"], 1),
    Q("Dans un if, écrire if (n = 3) :",
      ["compare n à 3", "range 3 dans n (affectation)", "est une erreur de syntaxe toujours"], 1),
    Q("Arduino Uno : horloge typique :",
      ["240 MHz", "16 MHz", "1 MHz"], 1),
    Q("ESP32 : horloge pouvant atteindre :",
      ["16 MHz", "240 MHz", "1 GHz"], 1),
    Q("Flash (programme) sur Arduino Uno : environ :",
      ["4 Mo", "32 Ko", "2 Ko"], 1),
    Q("analogRead sur Uno renvoie typiquement un code de :",
      ["0 à 4095", "0 à 1023", "0 à 255"], 1),
    Q("analogRead sur ESP32 renvoie typiquement un code de :",
      ["0 à 1023", "0 à 4095", "0 à 100"], 1),
    Q("Dans l’IDE Arduino, « Vérifier » sert à :",
      ["écrire en flash", "compiler / détecter les erreurs", "ouvrir le Wi-Fi"], 1),
    Q("« Téléverser » sert à :",
      ["afficher le moniteur uniquement", "écrire le programme dans la flash", "effacer la RAM définitivement"], 1),
    Q("Le fichier croquis se termine en général par :",
      [".cpp uniquement", ".ino", ".exe"], 1),
    Q("Le dossier du croquis doit :",
      ["porter un nom quelconque", "porter le même nom que le fichier .ino", "s’appeler toujours Arduino"], 1),
    Q("Ne jamais appliquer à une broche ESP32 :",
      ["3,3 V", "5 V", "0 V"], 1),
]

# ---------------------------------------------------------------------------
# Éval. n°3 — for / while + mémoires + E/S
# ---------------------------------------------------------------------------
QUIZ3 = [
    Q("for (int i = 0; i < 4; i++) exécute le bloc :",
      ["3 fois", "4 fois", "5 fois"], 1),
    Q("Dans ce for, les valeurs prises par i sont :",
      ["1, 2, 3, 4", "0, 1, 2, 3", "0, 1, 2, 3, 4"], 1),
    Q("On utilise plutôt for quand :",
      ["on ne connaît pas le nombre de tours", "on connaît le nombre de tours", "on attend un capteur sans compter"], 1),
    Q("On utilise plutôt while quand :",
      ["on compte exactement 10 tours", "on répète jusqu’à un changement / condition", "setup() doit boucler"], 1),
    Q("Si la condition d’un while est fausse dès le début :",
      ["le bloc s’exécute une fois", "le bloc ne s’exécute jamais", "la carte redémarre"], 1),
    Q("Dans un while qui attend une mesure, il faut :",
      ["ne jamais relire le capteur", "relire le capteur dans la boucle", "utiliser uniquement delay"], 1),
    Q("La mémoire flash : hors tension :",
      ["perd le programme", "conserve le programme", "conserve uniquement les variables"], 1),
    Q("La RAM : hors tension :",
      ["conserve les variables", "perd son contenu", "stocke le programme définitivement"], 1),
    Q("Sur Arduino Uno, un réglage à garder hors tension va souvent en :",
      ["RAM", "EEPROM", "registre d’horloge"], 1),
    Q("Sur ESP32, l’équivalent « réglage conservé » s’appelle souvent :",
      ["ROM cassée", "NVS", "SRAM vidéo"], 1),
    Q("pinMode(p, OUTPUT) :",
      ["lit une tension", "configure la broche en sortie", "ouvre le moniteur série"], 1),
    Q("digitalWrite(p, HIGH) impose :",
      ["toujours 12 V", "un niveau haut (5 V ou 3,3 V selon la carte)", "une lecture analogique"], 1),
    Q("digitalRead(p) lit :",
      ["une tension en volts exacts", "un niveau haut ou bas", "un fichier .ino"], 1),
    Q("analogRead(p) renvoie :",
      ["directement des volts", "un code entier (pas des volts)", "un booléen"], 1),
    Q("delay(500) :",
      ["attend 500 s", "attend 500 ms et fige le programme", "accélère la boucle"], 1),
    Q("Entre entiers, 5 / 2 vaut :",
      ["2,5", "2", "0"], 1),
    Q("5 / 2.0 vaut :",
      ["2", "2.5", "0"], 1),
    Q("i++ est équivalent à :",
      ["i = i - 1", "i = i + 1", "i == 1"], 1),
    Q("Une variable déclarée dans un bloc { } :",
      ["existe partout dans le fichier", "n’existe que dans ce bloc", "est toujours const"], 1),
    Q("Après coupure d’alimentation :",
      ["variables RAM et programme flash disparaissent", "le programme flash reste, les variables RAM disparaissent", "tout reste en RAM"], 1),
]

# ---------------------------------------------------------------------------
# Éval. n°4 — exemples, pièges, ADC, série
# ---------------------------------------------------------------------------
QUIZ4 = [
    Q("Sur Uno, pleine échelle analogique typique :",
      ["3,3 V -> 0 a 4095", "5 V -> 0 a 1023", "12 V -> 0 a 255"], 1),
    Q("Sur ESP32, pleine échelle analogique typique :",
      ["5 V -> 0 a 1023", "3,3 V -> 0 a 4095", "3,3 V -> 0 a 1023"], 1),
    Q("Plus le nombre de bits ADC est grand :",
      ["moins la mesure est fine", "plus l’échelon de tension est fin", "plus la RAM disparaît"], 1),
    Q("Serial.begin(9600) :",
      ["compile le programme", "ouvre la liaison série à 9600 bauds", "téléverse en flash"], 1),
    Q("Si le moniteur série n’est pas à la même vitesse que Serial.begin :",
      ["rien ne change", "les caractères sont illisibles", "la carte fond"], 1),
    Q("Deux vitesses série courantes :",
      ["120 et 240", "9600 et 115200", "1 et 2"], 1),
    Q("Ordre typique :",
      ["Téléverser -> Vérifier -> écrire le code", "Écrire -> Vérifier -> Téléverser -> setup puis loop", "loop -> setup -> téléverser"], 1),
    Q("Au démarrage, après téléversement :",
      ["loop() puis jamais setup()", "setup() une fois, puis loop() sans fin", "uniquement le moniteur série"], 1),
    Q("Piège fréquent : écrire dans un if :",
      ["n == 3", "n = 3 à la place de n == 3", "n != 3"], 1),
    Q("Piège fréquent dans un while :",
      ["augmenter le compteur / relire l’entrée", "oublier d’augmenter le compteur ou de relire l’entrée", "utiliser des accolades"], 1),
    Q("Compter un tour de trop vient souvent de :",
      ["i < 4", "utiliser <= au lieu de <", "i++"], 1),
    Q("Vouloir faire SEUIL = 30 alors que SEUIL est const :",
      ["est accepté", "est refusé par le compilateur", "efface la flash"], 1),
    Q("Sur ESP32, les broches 34 à 39 sont souvent :",
      ["sorties PWM uniquement", "entrées seules (pas de sortie)", "alimentations 5 V"], 1),
    Q("Câble USB « charge seule » (sans données) empêche surtout :",
      ["d’alimenter la carte", "de téléverser / communiquer", "d’allumer une LED externe"], 1),
    Q("Dans l’exemple « au-dessus du seuil, clignoter 3 fois », le for fait :",
      ["1 clignotement", "3 clignotements", "une attente infinie"], 1),
    Q("Le C++ du cours est :",
      ["interprété ligne à ligne comme MicroPython", "compilé en langage machine", "exécuté dans Excel"], 1),
    Q("MicroPython sur ESP32 :",
      ["est le langage principal de ce cours", "est interprété, ce n’est pas le langage du cours", "remplace forcément le C++"], 1),
    Q("Le bootloader est :",
      ["un fichier Excel", "un petit programme déjà en flash qui démarre la carte", "une résistance de pull-up"], 1),
    Q("PWM (analogWrite sur Uno) sert notamment à :",
      ["mesurer une tension précise en volts", "doser une LED ou un moteur en hachant le signal", "changer la tension d’alimentation USB"], 1),
    Q("À retenir : variables en RAM, programme en :",
      ["EEPROM uniquement", "flash", "moniteur série"], 1),
]


def make_quiz(qid, title, questions):
    return {
        "id": qid,
        "title": title,
        "questions": deepcopy(questions),
        "date": date.today().isoformat(),
        "published": False,
    }


def main():
    data = json.loads(QUIZZES.read_text(encoding="utf-8"))
    # backup
    bak = QUIZZES.with_suffix(".json.bak_avant_cpp_micro")
    bak.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    new = {
        "quiz_cpp_micro_1": make_quiz(
            "quiz_cpp_micro_1",
            "Éval. n°1 — C++ & systèmes microprogrammés (bases)",
            QUIZ1,
        ),
        "quiz_cpp_micro_2": make_quiz(
            "quiz_cpp_micro_2",
            "Éval. n°2 — C++ & systèmes microprogrammés (variables, cartes, IDE)",
            QUIZ2,
        ),
        "quiz_cpp_micro_3": make_quiz(
            "quiz_cpp_micro_3",
            "Éval. n°3 — C++ & systèmes microprogrammés (boucles, mémoires, E/S)",
            QUIZ3,
        ),
        "quiz_cpp_micro_4": make_quiz(
            "quiz_cpp_micro_4",
            "Éval. n°4 — C++ & systèmes microprogrammés (ADC, série, pièges)",
            QUIZ4,
        ),
    }

    for qid, quiz in new.items():
        assert len(quiz["questions"]) == 20, qid
        for i, q in enumerate(quiz["questions"]):
            assert len(q["answers"]) == 3, (qid, i)
            assert q["correct"] in (0, 1, 2), (qid, i)

    data.update(new)
    QUIZZES.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Backup:", bak.name)
    print("Ajouté:", ", ".join(new.keys()))
    for qid, quiz in new.items():
        print(f"  {qid}: {quiz['title']} — {len(quiz['questions'])} questions")
    print("Total quiz dans le fichier:", len(data))


if __name__ == "__main__":
    main()
