# -*- coding: utf-8 -*-
"""Génère la fiche de présentation élève — Veilleur intelligent (ESP32)."""
from fpdf import FPDF
from fpdf.enums import XPos, YPos

FONT = r"C:\Windows\Fonts\DejaVuSans.ttf"
FONT_B = r"C:\Windows\Fonts\DejaVuSans-Bold.ttf"
OUT = r"doc\Veilleur_intelligent\Fiche_eleve_Veilleur_intelligent.pdf"


class Fiche(FPDF):
    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("DejaVu", "", 8)
        self.set_text_color(80, 80, 80)
        self.cell(
            0,
            6,
            "1ère STI2D — Présentation : Veilleur de nuit intelligent (ESP32)",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )
        self.ln(2)

    def footer(self):
        self.set_y(-12)
        self.set_font("DejaVu", "", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 8, f"Page {self.page_no()}/{{nb}}", align="C")

    def h2(self, text):
        self.set_font("DejaVu", "B", 11)
        self.set_text_color(20, 90, 140)
        self.ln(1)
        self.multi_cell(0, 7, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(1)

    def body(self, text):
        self.set_font("DejaVu", "", 10)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 5.5, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(1)

    def bullet(self, text):
        self.set_font("DejaVu", "", 10)
        self.set_text_color(30, 30, 30)
        self.cell(6, 5.5, "•")
        self.multi_cell(0, 5.5, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    def box(self, title, lines):
        self.set_fill_color(232, 240, 248)
        self.set_font("DejaVu", "B", 10)
        self.set_text_color(15, 76, 129)
        self.multi_cell(0, 6, title, fill=True, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_font("DejaVu", "", 10)
        self.set_text_color(30, 30, 30)
        for line in lines:
            self.multi_cell(0, 5.5, line, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(2)


def main():
    pdf = Fiche(format="A4")
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.add_font("DejaVu", "", FONT)
    pdf.add_font("DejaVu", "B", FONT_B)

    # --- Page 1 ---
    pdf.add_page()
    pdf.set_font("DejaVu", "B", 18)
    pdf.set_text_color(15, 76, 129)
    pdf.multi_cell(0, 9, "Le veilleur de nuit intelligent", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("DejaVu", "", 11)
    pdf.set_text_color(60, 60, 60)
    pdf.multi_cell(0, 6, "Fiche de présentation — 1ère STI2D", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.multi_cell(
        0,
        6,
        "Carte uPesy ESP32 Wroom Low Power — montage sur plaquette d'essai",
        new_x=XPos.LMARGIN,
        new_y=YPos.NEXT,
    )
    pdf.ln(3)

    pdf.h2("1. Contexte")
    pdf.body(
        "Dans une salle ou un couloir, on souhaite qu'une LED s'allume automatiquement "
        "quand il fait sombre, et qu'un bip sonore signale le passage en mode « nuit » "
        "(veille / sécurité). Une version connectée pourra ensuite afficher l'état sur "
        "le réseau local."
    )
    pdf.body(
        "Fonction principale : alerter et éclairer automatiquement en cas de faible luminosité."
    )

    pdf.h2("2. Objectifs du projet")
    for t in [
        "Découvrir la chaîne d'information : capteur → traitement → actionneur.",
        "Réaliser un schéma de principe et un montage sur plaquette.",
        "Mesurer et calibrer un seuil de luminosité (ADC ESP32 : 0 à 4095).",
        "Programmer le comportement avec Arduino IDE (C++).",
        "Présenter et démontrer le prototype.",
    ]:
        pdf.bullet(t)

    pdf.h2("3. Fonctionnement attendu")
    for t in [
        "La LED s'allume sous un seuil de luminosité calibré.",
        "Le buzzer émet un bip court uniquement à la bascule jour → nuit.",
        "Le système fonctionne en continu sans intervention.",
        "(Option) Un message d'état est accessible en Wi-Fi sur le réseau de la salle.",
    ]:
        pdf.bullet(t)

    pdf.h2("4. Matériel par binôme")
    pdf.set_font("DejaVu", "B", 9)
    pdf.set_fill_color(15, 76, 129)
    pdf.set_text_color(255, 255, 255)
    for w, h in [(70, "Élément"), (18, "Qté"), (95, "Rôle")]:
        pdf.cell(w, 6, h, border=1, fill=True)
    pdf.ln()
    pdf.set_font("DejaVu", "", 9)
    pdf.set_text_color(30, 30, 30)
    rows = [
        ("Plaquette d'essai (breadboard)", "1", "Support de montage"),
        ("uPesy ESP32 Wroom Low Power", "1", "Traitement + alimentation 3,3 V"),
        ("Câble USB-C (données)", "1", "Alimentation + programmation"),
        ("LDR (photorésistance)", "1", "Capteur de luminosité"),
        ("Résistance 10 kΩ", "1", "Pont diviseur avec LDR"),
        ("LED (blanche / jaune)", "1", "Actionneur lumière"),
        ("Résistance 220 Ω (ou 330 Ω)", "1", "Protection LED"),
        ("Buzzer actif 3,3 V / 5 V", "1", "Actionneur sonore"),
        ("Fils de connexion", "~12", "Liaisons"),
        ("Potentiomètre 10 kΩ (séance 3)", "1", "Réglage du seuil"),
        ("Bouton poussoir (option)", "1", "Mode silencieux"),
    ]
    fill = False
    for a, b, c in rows:
        pdf.set_fill_color(240, 245, 250) if fill else pdf.set_fill_color(255, 255, 255)
        pdf.cell(70, 5.5, a, border=1, fill=True)
        pdf.cell(18, 5.5, b, border=1, fill=True, align="C")
        pdf.cell(95, 5.5, c, border=1, fill=True)
        pdf.ln()
        fill = not fill

    pdf.ln(2)
    pdf.box(
        "Point de vigilance — logique 3,3 V",
        [
            "L'ESP32 fonctionne en 3,3 V. Le pont diviseur LDR doit être alimenté en 3V3 (pas en 5 V).",
            "Ne jamais appliquer 5 V sur un GPIO.",
            "Sur la carte Low Power : pas de LED intégrée sur GPIO2 ; GPIO35 réservé ;",
            "GPIO34 / 36 / 39 = entrées seules (pas de sortie).",
        ],
    )

    # --- Page 2 ---
    pdf.add_page()
    pdf.h2("5. Broches du projet")
    pdf.set_font("DejaVu", "B", 9)
    pdf.set_fill_color(15, 76, 129)
    pdf.set_text_color(255, 255, 255)
    for w, h in [(55, "Signal"), (28, "GPIO"), (100, "Remarque")]:
        pdf.cell(w, 6, h, border=1, fill=True)
    pdf.ln()
    pdf.set_font("DejaVu", "", 9)
    pdf.set_text_color(30, 30, 30)
    for a, b, c in [
        ("LDR (milieu du pont)", "GPIO34", "Entrée analogique seule (ADC1)"),
        ("LED", "GPIO18", "Sortie numérique"),
        ("Buzzer actif", "GPIO19", "Sortie numérique"),
        ("Potentiomètre (seuil)", "GPIO32", "Entrée analogique (amélioration)"),
        ("Bouton silencieux", "GPIO23", "Entrée + pull-up interne (option)"),
    ]:
        pdf.cell(55, 5.5, a, border=1)
        pdf.cell(28, 5.5, b, border=1, align="C")
        pdf.cell(100, 5.5, c, border=1)
        pdf.ln()
    pdf.ln(2)
    pdf.body(
        "Selon le sens de câblage de la LDR, la valeur ADC augmente ou diminue avec la lumière. "
        "Le test dans le programme (luminosité < seuil ou > seuil) s'adapte en conséquence."
    )
    pdf.body(
        "Conseil montage : placer l'ESP32 à une extrémité de la plaquette, laisser libres "
        "les boutons EN / BOOT, et vérifier l'orientation de la LED (cathode = côté plat → GND)."
    )

    pdf.h2("6. Organisation (3 semaines — 6 séances de 2 h)")
    pdf.set_font("DejaVu", "B", 9)
    pdf.set_fill_color(15, 76, 129)
    pdf.set_text_color(255, 255, 255)
    for w, h in [(22, "Sem."), (80, "Séance A (2 h)"), (81, "Séance B (2 h)")]:
        pdf.cell(w, 6, h, border=1, fill=True)
    pdf.ln()
    pdf.set_font("DejaVu", "", 9)
    pdf.set_text_color(30, 30, 30)
    for a, b, c in [
        ("S1", "Analyser & spécifier", "Découvrir l'ESP32 & l'IDE"),
        ("S2", "Monter & mesurer", "Programmer le comportement"),
        ("S3", "Améliorer (seuil / Wi-Fi)", "Finaliser & présenter"),
    ]:
        pdf.cell(22, 6, a, border=1, align="C")
        pdf.cell(80, 6, b, border=1)
        pdf.cell(81, 6, c, border=1)
        pdf.ln()
    pdf.ln(3)

    pdf.h2("7. Déroulement des séances")
    pdf.set_font("DejaVu", "B", 10)
    pdf.set_text_color(15, 76, 129)
    pdf.multi_cell(0, 6, "Semaine 1", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.body(
        "Analyser le besoin, identifier capteur / traitement / actionneurs, "
        "produire un schéma fonctionnel et un schéma de principe. Puis prendre en main "
        "la carte ESP32, Arduino IDE et le moniteur série (115200 bauds), "
        "avec une LED externe sur GPIO18."
    )
    pdf.set_font("DejaVu", "B", 10)
    pdf.set_text_color(15, 76, 129)
    pdf.multi_cell(0, 6, "Semaine 2", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.body(
        "Réaliser le pont diviseur LDR + 10 kΩ en 3V3, mesurer jour / nuit, "
        "lire l'ADC sur GPIO34 et choisir un seuil. Programmer ensuite l'allumage "
        "de la LED et le bip uniquement à la bascule jour → nuit."
    )
    pdf.set_font("DejaVu", "B", 10)
    pdf.set_text_color(15, 76, 129)
    pdf.multi_cell(0, 6, "Semaine 3", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.body(
        "Améliorer le prototype : seuil réglable au potentiomètre, éventuellement "
        "mode silencieux ou affichage d'état en Wi-Fi (SoftAP). Finaliser le montage "
        "et présenter une démonstration du système."
    )

    pdf.h2("8. Chaîne d'information")
    pdf.set_font("DejaVu", "B", 9)
    pdf.set_fill_color(15, 76, 129)
    pdf.set_text_color(255, 255, 255)
    for w, h in [(40, "Bloc"), (70, "Composant"), (73, "GPIO / alim.")]:
        pdf.cell(w, 6, h, border=1, fill=True)
    pdf.ln()
    pdf.set_font("DejaVu", "", 9)
    pdf.set_text_color(30, 30, 30)
    for a, b, c in [
        ("Capteur", "LDR + résistance 10 kΩ", "GPIO34 / 3V3"),
        ("Traitement", "uPesy ESP32 Low Power", "—"),
        ("Actionneur 1", "LED + 220 Ω", "GPIO18"),
        ("Actionneur 2", "Buzzer actif", "GPIO19"),
    ]:
        pdf.cell(40, 7, a, border=1)
        pdf.cell(70, 7, b, border=1)
        pdf.cell(73, 7, c, border=1)
        pdf.ln()

    pdf.ln(4)
    pdf.set_font("DejaVu", "", 9)
    pdf.set_text_color(100, 100, 100)
    pdf.multi_cell(
        0,
        5,
        "Document de présentation — séquence début d'année 1ère STI2D.",
        new_x=XPos.LMARGIN,
        new_y=YPos.NEXT,
    )

    pdf.output(OUT)
    print("written", OUT)


if __name__ == "__main__":
    main()
