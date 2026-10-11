# -*- coding: utf-8 -*-
"""TP3 final — Veilleur intelligent avec potentiometre (theorie / simulation / pratique)."""
from fpdf import FPDF
from fpdf.enums import XPos, YPos

FONT = r"C:\Windows\Fonts\DejaVuSans.ttf"
FONT_B = r"C:\Windows\Fonts\DejaVuSans-Bold.ttf"
OUT = r"doc\Veilleur_intelligent\TP3_final.pdf"


class TP(FPDF):
    def __init__(self):
        super().__init__(format="A4")
        self.alias_nb_pages()
        self.set_auto_page_break(auto=True, margin=16)
        self.add_font("DejaVu", "", FONT)
        self.add_font("DejaVu", "B", FONT_B)

    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("DejaVu", "", 8)
        self.set_text_color(90, 90, 90)
        self.cell(
            0,
            6,
            "TP3 final — Veilleur intelligent (potentiometre)",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )
        self.ln(1)

    def footer(self):
        self.set_y(-12)
        self.set_font("DejaVu", "", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 8, f"Page {self.page_no()}/{{nb}}  —  1ere STI2D", align="C")

    def h1(self, text):
        self.set_font("DejaVu", "B", 14)
        self.set_text_color(15, 76, 129)
        self.ln(2)
        self.multi_cell(0, 7, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(1)

    def h2(self, text):
        self.set_font("DejaVu", "B", 11)
        self.set_text_color(20, 90, 140)
        self.ln(1.5)
        self.multi_cell(0, 6.5, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(0.4)

    def p(self, text):
        self.set_font("DejaVu", "", 10)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 5.3, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(0.5)

    def bullets(self, items):
        self.set_font("DejaVu", "", 10)
        self.set_text_color(30, 30, 30)
        for t in items:
            self.cell(5, 5.3, chr(0x2022))
            self.multi_cell(0, 5.3, t, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    def code(self, src):
        self.set_font("DejaVu", "", 8)
        self.set_fill_color(245, 245, 245)
        self.set_text_color(20, 20, 20)
        for line in src.strip("\n").splitlines():
            safe = (
                line.replace("—", "-")
                .replace("→", "->")
                .replace("’", "'")
                .replace("«", '"')
                .replace("»", '"')
            )
            self.cell(0, 4.0, "  " + safe, new_x=XPos.LMARGIN, new_y=YPos.NEXT, fill=True)
        self.ln(1.5)

    def note(self, text):
        self.set_fill_color(255, 248, 230)
        self.set_font("DejaVu", "B", 9)
        self.set_text_color(120, 80, 0)
        self.multi_cell(0, 5.3, "Note", fill=True, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_font("DejaVu", "", 9)
        self.set_text_color(60, 40, 0)
        self.multi_cell(0, 5.1, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(1)

    def table(self, headers, rows, widths):
        self.set_font("DejaVu", "B", 9)
        self.set_fill_color(15, 76, 129)
        self.set_text_color(255, 255, 255)
        for w, h in zip(widths, headers):
            self.cell(w, 6, h, border=1, fill=True)
        self.ln()
        self.set_font("DejaVu", "", 9)
        self.set_text_color(30, 30, 30)
        fill = False
        for row in rows:
            self.set_fill_color(240, 245, 250) if fill else self.set_fill_color(255, 255, 255)
            y0 = self.get_y()
            # simple single-line cells
            for w, cell in zip(widths, row):
                self.cell(w, 5.8, cell, border=1, fill=True)
            self.ln()
            fill = not fill
        self.ln(1)

    def draw_pot_schema(self):
        x0, y0 = 40, self.get_y() + 2
        self.set_draw_color(40, 40, 40)
        self.set_font("DejaVu", "", 8)
        self.set_text_color(30, 30, 30)
        self.set_xy(x0 + 30, y0)
        self.cell(25, 4, "+3,3 V", align="C")
        self.line(x0 + 42, y0 + 5, x0 + 42, y0 + 12)
        # pot body
        self.rect(x0 + 28, y0 + 12, 28, 28)
        self.set_xy(x0 + 28, y0 + 14)
        self.cell(28, 5, "POT 10 kΩ", align="C")
        self.set_xy(x0 + 28, y0 + 20)
        self.cell(28, 5, "(curseur)", align="C")
        # wiper
        self.line(x0 + 56, y0 + 26, x0 + 85, y0 + 26)
        self.set_xy(x0 + 87, y0 + 23)
        self.cell(55, 5, "-> GPIO32 (seuil ADC)")
        # bottom to GND
        self.line(x0 + 42, y0 + 40, x0 + 42, y0 + 50)
        self.line(x0 + 38, y0 + 50, x0 + 46, y0 + 50)
        self.line(x0 + 39.5, y0 + 52, x0 + 44.5, y0 + 52)
        self.set_xy(x0 + 48, y0 + 48)
        self.cell(15, 5, "GND")
        # labels left
        self.set_xy(x0 - 5, y0 + 10)
        self.cell(30, 4, "borne haute")
        self.set_xy(x0 - 5, y0 + 42)
        self.cell(30, 4, "borne basse")
        self.set_y(y0 + 60)


def main():
    pdf = TP()

    # ========== PAGE 1 — intro ==========
    pdf.add_page()
    pdf.set_font("DejaVu", "B", 17)
    pdf.set_text_color(15, 76, 129)
    pdf.multi_cell(0, 8, "TP3 final — Veilleur intelligent", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("DejaVu", "", 11)
    pdf.set_text_color(60, 60, 60)
    pdf.multi_cell(
        0,
        6,
        "Seuil reglable au potentiometre  |  1ere STI2D  |  Duree : 3 a 4 h",
        new_x=XPos.LMARGIN,
        new_y=YPos.NEXT,
    )
    pdf.ln(2)

    pdf.h2("Objectif du TP")
    pdf.p(
        "Finaliser le veilleur de nuit : la LED s'allume lorsque la luminosite "
        "passe sous un seuil, et ce seuil est regle par un potentiometre "
        "(plus besoin de modifier le code pour changer la sensibilite)."
    )
    pdf.p("Le TP comporte trois parties :")
    pdf.bullets(
        [
            "Partie 1 — Theorique : comprendre le potentiometre et le seuil.",
            "Partie 2 — Simulation : utiliser le simulateur SPICE du site.",
            "Partie 3 — Pratique : cablage ESP32 + programme final.",
        ]
    )

    pdf.h2("Competences visees")
    pdf.bullets(
        [
            "Modeliser un potentiometre comme pont diviseur reglable.",
            "Simuler une tension de seuil et la mesurer (voltmètre).",
            "Lire deux entrees ADC (LDR et potentiometre) sur ESP32.",
            "Programmer une comparaison et piloter une LED.",
        ]
    )

    pdf.h2("Materiel (partie pratique)")
    pdf.table(
        ["Element", "Quantite", "Role"],
        [
            ["uPesy ESP32 Low Power", "1", "Traitement + ADC"],
            ["LDR + resistance 10 kΩ", "1+1", "Capteur luminosite (TP2)"],
            ["Potentiometre 10 kΩ", "1", "Reglage du seuil"],
            ["LED + resistance 220 Ω", "1+1", "Indicateur nuit"],
            ["Plaquette + fils", "1", "Montage"],
            ["Cable USB-C (donnees)", "1", "Alim. + televersement"],
        ],
        [70, 25, 88],
    )

    # ========== PARTIE 1 ==========
    pdf.add_page()
    pdf.h1("PARTIE 1 — Theorique")

    pdf.h2("1.1 Role du potentiometre dans le projet")
    pdf.p(
        "Au TP2, le seuil jour/nuit etait un nombre fixe dans le programme "
        "(par exemple if (adc < 1500)). Avec un potentiometre, ce seuil devient "
        "une tension reglable : on tourne le bouton pour rendre le veilleur "
        "plus ou moins sensible a l'obscurite, sans recompiler."
    )

    pdf.h2("1.2 Le potentiometre = pont diviseur reglable")
    pdf.p(
        "Un potentiometre 10 kΩ a trois bornes : deux extremites (piste resistive "
        "complete) et un curseur (prise intermediaire). Branche entre +3,3 V et GND, "
        "le curseur fournit une tension Useuil entre 0 et 3,3 V selon sa position."
    )
    pdf.draw_pot_schema()
    pdf.p(
        "Si le curseur est au milieu (environ 50 %), Useuil ≈ 1,65 V. "
        "Si on le tourne vers +3,3 V, Useuil augmente ; vers GND, Useuil diminue."
    )

    pdf.h2("1.3 Lien avec l'ADC de l'ESP32")
    pdf.p(
        "L'ESP32 convertit chaque tension analogique en nombre entier de 0 a 4095 "
        "(ADC 12 bits). On lit donc deux voies :"
    )
    pdf.table(
        ["Signal", "GPIO", "Grandeur"],
        [
            ["LDR (point milieu du pont)", "GPIO34", "luminosite (adcLux)"],
            ["Curseur du potentiometre", "GPIO32", "seuil (adcSeuil)"],
        ],
        [80, 30, 73],
    )
    pdf.p("Idee du programme :")
    pdf.code(
        """
si  adcLux  <  adcSeuil   alors   LED = allumee   (nuit)
sinon                             LED = eteinte   (jour)
"""
    )
    pdf.note(
        "Selon le sens de cablage de la LDR, la valeur ADC peut augmenter "
        "ou diminuer avec la lumiere. Adapte alors le test (< ou >) d'apres "
        "tes mesures du TP2."
    )

    pdf.h2("1.4 Questions (a completer)")
    pdf.table(
        ["N°", "Question", "Reponse"],
        [
            ["1", "Combien de bornes a un potentiometre ?", ""],
            ["2", "Que mesure-t-on sur le curseur ?", ""],
            ["3", "Pourquoi alimenter le POT en 3,3 V ?", ""],
            ["4", "Que compare le programme final ?", ""],
        ],
        [12, 95, 76],
    )

    # ========== PARTIE 2 ==========
    pdf.add_page()
    pdf.h1("PARTIE 2 — Simulation (simulateur SPICE du site)")

    pdf.h2("2.1 Acceder au simulateur")
    pdf.bullets(
        [
            "Ouvre le site du cours, puis le Simulateur (menu /Simulateur/).",
            "Menu Fichier → Exemples → spice → potentiometre_seuil_3v3.json",
            "Ou construis le montage toi-meme (composants ci-dessous).",
        ]
    )

    pdf.h2("2.2 Montage a simuler")
    pdf.p("Objectif : visualiser la tension de seuil produite par le potentiometre.")
    pdf.table(
        ["Composant", "Reglage", "Connexion"],
        [
            ["Pile / source", "3,3 V", "+ vers borne haute du POT"],
            ["Potentiometre", "10 kΩ", "borne basse vers GND"],
            ["Voltmètre", "—", "+ sur curseur (wiper), - sur GND"],
            ["Masse (GND)", "—", "commune a la pile et au voltmetre"],
        ],
        [45, 35, 103],
    )
    pdf.p(
        "Dans le simulateur, utilise les fleches ◀ ▶ du potentiometre pour "
        "changer la position du curseur (0 % … 100 %), puis lance la simulation "
        "(.op / regime permanent) et lis la tension sur le voltmetre."
    )

    pdf.h2("2.3 Mesures a noter")
    pdf.table(
        ["Position curseur", "Useuil simulee (V)", "ADC estime (= U/3,3×4095)"],
        [
            ["≈ 0 % (vers GND)", "", ""],
            ["≈ 25 %", "", ""],
            ["≈ 50 %", "", ""],
            ["≈ 75 %", "", ""],
            ["≈ 100 % (vers 3,3 V)", "", ""],
        ],
        [55, 55, 73],
    )

    pdf.h2("2.4 Prolongement (optionnel)")
    pdf.p(
        "Ajoute un second pont : LDR + resistance 10 kΩ, avec un 2e voltmetre. "
        "Fais varier la luminosite (controle LDR du simulateur) et le curseur "
        "du potentiometre. Conclude : le veilleur s'active quand U_LDR passe "
        "sous (ou au-dessus de) Useuil."
    )
    pdf.note(
        "Le simulateur modelise le circuit electrique (tensions). "
        "La logique if/else et les GPIO seront programmes en partie 3 sur la carte."
    )

    pdf.h2("2.5 Questions simulation")
    pdf.bullets(
        [
            "A 50 %, Useuil est-elle proche de 1,65 V ? Pourquoi ?",
            "Si le voltmetre reste a 0 V : que verifier (masse, curseur, simulation) ?",
            "Quelle position du pot correspond a un seuil « sensible » (nuit rapidement) ?",
        ]
    )

    # ========== PARTIE 3 ==========
    pdf.add_page()
    pdf.h1("PARTIE 3 — Pratique (cablage et programme)")

    pdf.h2("3.1 Broches du projet final")
    pdf.table(
        ["Signal", "GPIO", "Remarque"],
        [
            ["LDR (milieu du pont)", "GPIO34", "Entree ADC seule (comme TP2)"],
            ["Curseur potentiometre", "GPIO32", "Entree ADC (seuil)"],
            ["LED (+ 220 Ω)", "GPIO18", "Sortie numerique"],
            ["Alimentation ponts", "3V3 / GND", "Jamais 5 V sur les GPIO"],
        ],
        [55, 30, 98],
    )

    pdf.h2("3.2 Cablage du potentiometre")
    pdf.bullets(
        [
            "Borne haute du POT → 3V3 de la carte ESP32.",
            "Borne basse du POT → GND.",
            "Curseur (borne centrale) → GPIO32.",
            "Conserver le pont LDR + 10 kΩ du TP2 sur GPIO34.",
            "LED : GPIO18 → resistance 220 Ω → anode LED ; cathode → GND "
            "(ou montage inverse si tu as suivi le schema KiCad GPIO0 : adapte le code).",
        ]
    )
    pdf.note(
        "Verifie qu'aucune broche 5 V n'alimente le pont LDR ou le potentiometre. "
        "GPIO34 et GPIO32 doivent recevoir entre 0 et 3,3 V uniquement."
    )

    pdf.h2("3.3 Programme a televerser")
    pdf.code(
        """
// TP3 final — Veilleur : seuil reglable au potentiometre
const int PIN_LDR = 34;   // luminosite
const int PIN_POT = 32;   // seuil
const int PIN_LED = 18;   // indicateur nuit

void setup() {
  pinMode(PIN_LED, OUTPUT);
  Serial.begin(115200);
  Serial.println("TP3 pret — seuil au potentiometre");
}

void loop() {
  int adcLux   = analogRead(PIN_LDR);   // 0..4095
  int adcSeuil = analogRead(PIN_POT);   // 0..4095

  // Adapte < ou > selon ton cablage LDR (voir TP2)
  bool nuit = (adcLux < adcSeuil);

  digitalWrite(PIN_LED, nuit ? HIGH : LOW);

  Serial.print("lux=");
  Serial.print(adcLux);
  Serial.print("  seuil=");
  Serial.print(adcSeuil);
  Serial.print("  => ");
  Serial.println(nuit ? "NUIT (LED ON)" : "JOUR (LED OFF)");
  delay(200);
}
"""
    )

    pdf.add_page()
    pdf.h2("3.4 Demarche experimentale")
    pdf.bullets(
        [
            "Realiser le cablage complet (LDR + POT + LED).",
            "Televerser le programme et ouvrir le moniteur serie (115200 bauds).",
            "Tourner le potentiometre : observer seuil=… qui change.",
            "Couvrir / decouvrir la LDR : verifier que la LED suit la comparaison.",
            "Regler un seuil confortable pour une transition jour → nuit realiste.",
            "Option : ajouter un buzzer sur GPIO19 qui bip seulement a la bascule "
            "(detecter le changement d'etat, pas un bip permanent).",
        ]
    )

    pdf.h2("3.5 Tableau de validation")
    pdf.table(
        ["Test", "Action", "Resultat attendu", "OK ?"],
        [
            ["A", "POT au min, lumiere forte", "LED eteinte (jour)", ""],
            ["B", "POT au min, LDR couverte", "LED allumee (nuit)", ""],
            ["C", "POT au max, LDR couverte", "Souvent LED eteinte", ""],
            ["D", "Tourner le POT a demi-obscurite", "Point de bascule bouge", ""],
        ],
        [12, 60, 70, 31],
    )

    pdf.h2("3.6 Compte rendu (a rendre)")
    pdf.bullets(
        [
            "Reponses partie 1 (questions theoriques).",
            "Tableau des tensions simulees (partie 2).",
            "Photo du montage + extrait du moniteur serie (partie 3).",
            "Conclusion : avantage d'un seuil au potentiometre vs seuil fixe dans le code.",
        ]
    )

    pdf.h2("3.7 A retenir")
    pdf.bullets(
        [
            "Le potentiometre fournit une tension de seuil reglable (0 … 3,3 V).",
            "On compare deux lectures ADC : luminosite (GPIO34) et seuil (GPIO32).",
            "Simuler d'abord (SPICE) aide a comprendre avant de cabler.",
            "Toujours travailler en 3,3 V sur les entrees analogiques ESP32.",
        ]
    )

    pdf.output(OUT)
    print("OK ->", OUT)


if __name__ == "__main__":
    main()
