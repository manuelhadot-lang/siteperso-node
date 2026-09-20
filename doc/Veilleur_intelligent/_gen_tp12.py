# -*- coding: utf-8 -*-
"""Génère TP1 et TP2 (simples) alignés sur le schéma KiCad Veilleur Intelligent."""
from fpdf import FPDF
from fpdf.enums import XPos, YPos

FONT = r"C:\Windows\Fonts\DejaVuSans.ttf"
FONT_B = r"C:\Windows\Fonts\DejaVuSans-Bold.ttf"
OUT_DIR = r"doc\Veilleur_intelligent"


class TP(FPDF):
    def __init__(self, titre_court):
        super().__init__(format="A4")
        self.titre_court = titre_court
        self.alias_nb_pages()
        self.set_auto_page_break(auto=True, margin=16)
        self.add_font("DejaVu", "", FONT)
        self.add_font("DejaVu", "B", FONT_B)

    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("DejaVu", "", 8)
        self.set_text_color(90, 90, 90)
        self.cell(0, 6, self.titre_court, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(1)

    def footer(self):
        self.set_y(-12)
        self.set_font("DejaVu", "", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 8, f"Page {self.page_no()}/{{nb}}  —  Schéma KiCad : Schema.kicad_sch", align="C")

    def title_block(self, num, titre, duree):
        self.set_font("DejaVu", "B", 16)
        self.set_text_color(15, 76, 129)
        self.multi_cell(0, 8, f"TP{num} — {titre}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_font("DejaVu", "", 10)
        self.set_text_color(60, 60, 60)
        self.multi_cell(
            0,
            5.5,
            "Projet : Veilleur de nuit intelligent  |  1ère STI2D  |  "
            f"Durée : {duree}  |  Support : schéma KiCad « Veilleur Intelligent »",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )
        self.ln(2)

    def heading(self, text):
        self.set_font("DejaVu", "B", 11)
        self.set_text_color(20, 90, 140)
        self.ln(1)
        self.multi_cell(0, 6.5, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(0.5)

    def p(self, text):
        self.set_font("DejaVu", "", 10)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 5.4, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(0.8)

    def bullets(self, items):
        self.set_font("DejaVu", "", 10)
        self.set_text_color(30, 30, 30)
        for t in items:
            self.cell(5, 5.4, "•")
            self.multi_cell(0, 5.4, t, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    def code(self, src):
        self.set_font("DejaVu", "", 8)
        self.set_fill_color(245, 245, 245)
        self.set_text_color(20, 20, 20)
        for line in src.strip("\n").splitlines():
            safe = line.replace("—", "-").replace("→", "->").replace("’", "'")
            self.cell(0, 4.1, "  " + safe, new_x=XPos.LMARGIN, new_y=YPos.NEXT, fill=True)
        self.ln(2)

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
            for w, cell in zip(widths, row):
                self.cell(w, 5.8, cell, border=1, fill=True)
            self.ln()
            fill = not fill
        self.ln(1)

    def note(self, text):
        self.set_fill_color(255, 248, 230)
        self.set_font("DejaVu", "B", 9)
        self.set_text_color(120, 80, 0)
        self.multi_cell(0, 5.5, "Note", fill=True, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_font("DejaVu", "", 9)
        self.set_text_color(60, 40, 0)
        self.multi_cell(0, 5.2, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(1)


def draw_led_schema(pdf):
    """Schéma partiel TP1 d'après KiCad (U1, R3, D1)."""
    x0, y0 = 25, pdf.get_y() + 2
    pdf.set_draw_color(40, 40, 40)
    pdf.set_line_width(0.3)
    # U1 box
    pdf.rect(x0, y0, 42, 28)
    pdf.set_font("DejaVu", "B", 8)
    pdf.set_text_color(15, 76, 129)
    pdf.set_xy(x0 + 2, y0 + 2)
    pdf.cell(38, 4, "U1 ESP32 uPesy")
    pdf.set_font("DejaVu", "", 8)
    pdf.set_text_color(30, 30, 30)
    pdf.set_xy(x0 + 2, y0 + 10)
    pdf.cell(38, 4, "GPIO0  (broche droite)")
    pdf.set_xy(x0 + 2, y0 + 16)
    pdf.cell(38, 4, "GND")
    # wire GPIO0 -> R3
    pdf.line(x0 + 42, y0 + 12, x0 + 55, y0 + 12)
    # R3
    pdf.rect(x0 + 55, y0 + 8, 22, 8)
    pdf.set_xy(x0 + 55, y0 + 9.5)
    pdf.cell(22, 5, "R3 220Ω", align="C")
    pdf.line(x0 + 77, y0 + 12, x0 + 90, y0 + 12)
    # LED D1 (cathode side from R3) — schéma KiCad : K vers R3, A vers GND
    pdf.line(x0 + 90, y0 + 8, x0 + 90, y0 + 16)
    pdf.line(x0 + 90, y0 + 8, x0 + 98, y0 + 12)
    pdf.line(x0 + 90, y0 + 16, x0 + 98, y0 + 12)
    pdf.line(x0 + 98, y0 + 8, x0 + 98, y0 + 16)
    pdf.set_xy(x0 + 100, y0 + 6)
    pdf.cell(20, 4, "D1 LED")
    pdf.set_xy(x0 + 100, y0 + 10)
    pdf.cell(30, 4, "K ← — → A")
    pdf.line(x0 + 98, y0 + 12, x0 + 112, y0 + 12)
    pdf.line(x0 + 112, y0 + 12, x0 + 112, y0 + 24)
    pdf.line(x0 + 20, y0 + 24, x0 + 112, y0 + 24)
    pdf.line(x0 + 20, y0 + 24, x0 + 20, y0 + 28)
    # GND symbol
    pdf.line(x0 + 16, y0 + 28, x0 + 24, y0 + 28)
    pdf.line(x0 + 17.5, y0 + 30, x0 + 22.5, y0 + 30)
    pdf.line(x0 + 19, y0 + 32, x0 + 21, y0 + 32)
    pdf.set_xy(x0 + 26, y0 + 26)
    pdf.cell(20, 4, "GND")
    # connect U1 GND
    pdf.line(x0 + 21, y0 + 28, x0 + 21, y0 + 22)
    pdf.set_y(y0 + 38)


def draw_ldr_schema(pdf):
    """Pont diviseur R1(LDR)+R2 d'après KiCad."""
    x0, y0 = 35, pdf.get_y() + 2
    pdf.set_draw_color(40, 40, 40)
    pdf.set_font("DejaVu", "", 8)
    pdf.set_text_color(30, 30, 30)
    # 3V3
    pdf.set_xy(x0 + 28, y0)
    pdf.cell(20, 4, "+3,3 V", align="C")
    pdf.line(x0 + 38, y0 + 5, x0 + 38, y0 + 10)
    # R1 LDR
    pdf.rect(x0 + 28, y0 + 10, 20, 10)
    pdf.set_xy(x0 + 28, y0 + 12)
    pdf.cell(20, 6, "R1 LDR", align="C")
    pdf.line(x0 + 38, y0 + 20, x0 + 38, y0 + 26)
    # midpoint junction
    pdf.ellipse(x0 + 36.5, y0 + 25, 3, 3, style="F")
    pdf.set_fill_color(40, 40, 40)
    pdf.ellipse(x0 + 36.5, y0 + 25, 3, 3, style="F")
    pdf.set_draw_color(40, 40, 40)
    pdf.line(x0 + 38, y0 + 26.5, x0 + 70, y0 + 26.5)
    pdf.set_xy(x0 + 72, y0 + 24)
    pdf.cell(50, 5, "→ GPIO34 (ADC) sur U1")
    # R2
    pdf.line(x0 + 38, y0 + 28, x0 + 38, y0 + 32)
    pdf.rect(x0 + 28, y0 + 32, 20, 10)
    pdf.set_xy(x0 + 28, y0 + 34)
    pdf.cell(20, 6, "R2 10 kΩ", align="C")
    pdf.line(x0 + 38, y0 + 42, x0 + 38, y0 + 48)
    pdf.line(x0 + 34, y0 + 48, x0 + 42, y0 + 48)
    pdf.line(x0 + 35.5, y0 + 50, x0 + 40.5, y0 + 50)
    pdf.set_xy(x0 + 44, y0 + 46)
    pdf.cell(15, 5, "GND")
    pdf.set_y(y0 + 56)


def gen_tp1():
    pdf = TP("TP1 — LED sur ESP32 (schéma KiCad)")
    pdf.add_page()
    pdf.title_block(1, "Allumer une LED avec l'ESP32", "2 h")

    pdf.heading("1. Objectif")
    pdf.p(
        "Prendre en main la carte uPesy ESP32 Wroom Low Power (U1), "
        "réaliser le branchement LED du schéma KiCad, puis téléverser "
        "un programme qui fait clignoter la LED."
    )

    pdf.heading("2. Matériel (repères du schéma KiCad)")
    pdf.table(
        ["Repère", "Composant", "Rôle"],
        [
            ["U1", "uPesy ESP32 Low Power", "Carte de traitement"],
            ["D1", "LED", "Voyant"],
            ["R3", "Résistance 220 Ω (ou 330 Ω)", "Protection de la LED"],
            ["—", "Câble USB-C (données)", "Alim. + programmation"],
            ["—", "Plaquette d'essai", "Montage"],
        ],
        [22, 70, 91],
    )

    pdf.heading("3. Câblage d'après le schéma KiCad")
    pdf.p(
        "Sur le schéma « Veilleur Intelligent », la LED D1 est pilotée par GPIO0 "
        "via la résistance R3. Le montage du fichier KiCad est le suivant "
        "(LED en logique inverse : la LED s'allume quand GPIO0 est à l'état bas) :"
    )
    pdf.bullets(
        [
            "R3 : une extrémité sur GPIO0 (U1), l'autre sur la cathode (K) de D1.",
            "D1 : anode (A) reliée à GND.",
            "Alimentation de la carte par USB-C (pas besoin d'alimenter la plaquette en 5 V).",
        ]
    )
    draw_led_schema(pdf)
    pdf.note(
        "Orientation LED : le côté plat (cathode K) côté R3 / GPIO0. "
        "Ne jamais brancher la LED sans résistance."
    )

    pdf.heading("4. Configuration Arduino IDE")
    pdf.bullets(
        [
            "Installer le support « esp32 » (Espressif) via le gestionnaire de cartes.",
            "Carte : « uPesy ESP32 Wroom DevKit » si disponible, sinon « ESP32 Dev Module ».",
            "Port COM correspondant à la carte ; moniteur série à 115200 bauds.",
        ]
    )

    pdf.add_page()
    pdf.heading("5. Programme à téléverser")
    pdf.code(
        """
// TP1 — Blink LED D1 sur GPIO0 (schéma KiCad Veilleur Intelligent)
const int PIN_LED = 0;   // GPIO0 → R3 → D1

void setup() {
  pinMode(PIN_LED, OUTPUT);
  Serial.begin(115200);
  Serial.println("TP1 pret - LED sur GPIO0");
}

void loop() {
  // LED allumee quand GPIO0 = LOW (montage KiCad)
  digitalWrite(PIN_LED, LOW);
  Serial.println("LED ON");
  delay(500);

  digitalWrite(PIN_LED, HIGH);
  Serial.println("LED OFF");
  delay(500);
}
"""
    )

    pdf.heading("6. Démarche")
    pdf.bullets(
        [
            "Réaliser le câblage U1 / R3 / D1 en suivant le schéma.",
            "Téléverser le programme et ouvrir le moniteur série.",
            "Vérifier que la LED clignote (≈ 1 fois / seconde).",
            "Modifier les délais (200 ms / 1000 ms) et observer.",
            "Option : inverser LOW/HIGH dans le code et conclure sur le sens du montage.",
        ]
    )

    pdf.heading("7. À retenir")
    pdf.bullets(
        [
            "Sur cette carte Low Power, il n'y a pas de LED utilisateur sur GPIO2 : on utilise D1 externe.",
            "GPIO0 sert ici de sortie pour la LED (repère du schéma KiCad).",
            "L'ESP32 travaille en 3,3 V : ne pas appliquer 5 V sur un GPIO.",
        ]
    )

    out = f"{OUT_DIR}\\TP1_LED_ESP32.pdf"
    pdf.output(out)
    print("written", out)


def gen_tp2():
    pdf = TP("TP2 — LDR et mesure (schéma KiCad)")
    pdf.add_page()
    pdf.title_block(2, "Mesurer la luminosité avec une LDR", "2 h")

    pdf.heading("1. Objectif")
    pdf.p(
        "Réaliser le pont diviseur photorésistance du schéma KiCad (R1 + R2), "
        "mesurer la tension au multimètre, puis lire la valeur numérique "
        "avec l'ADC de l'ESP32."
    )

    pdf.heading("2. Matériel (repères du schéma KiCad)")
    pdf.table(
        ["Repère", "Composant", "Rôle"],
        [
            ["U1", "uPesy ESP32 Low Power", "Traitement + ADC 12 bits"],
            ["R1", "LDR03 (photorésistance)", "Capteur de luminosité"],
            ["R2", "Résistance 10 kΩ", "Pont diviseur avec R1"],
            ["—", "Multimètre", "Mesure de tension"],
            ["—", "Fils + plaquette", "Montage"],
        ],
        [22, 70, 91],
    )

    pdf.heading("3. Câblage d'après le schéma KiCad")
    pdf.p(
        "Le schéma KiCad prévoit un pont diviseur entre +3,3 V et GND : "
        "R1 (LDR) côté +3,3 V, R2 (10 kΩ) côté GND. "
        "Le point milieu (jonction R1–R2) est la tension à mesurer."
    )
    pdf.bullets(
        [
            "R1 (LDR) entre +3,3 V (broche 3V3 de U1) et le point milieu.",
            "R2 (10 kΩ) entre le point milieu et GND.",
            "Point milieu → GPIO34 de U1 (entrée analogique seule, adaptée à l'ADC).",
            "Masse commune : GND de la carte et du pont.",
        ]
    )
    draw_ldr_schema(pdf)
    pdf.note(
        "GPIO34 est une entrée seule (pas de sortie). "
        "Ne pas utiliser GPIO35 (mesure batterie sur la carte Low Power). "
        "Tout le pont doit être alimenté en 3,3 V, jamais en 5 V."
    )

    pdf.add_page()
    pdf.heading("4. Mesures multimètre (avant de programmer)")
    pdf.p(
        "Mesure la tension au point milieu (par rapport à GND) dans trois situations. "
        "Complète le tableau :"
    )
    pdf.table(
        ["Situation", "U milieu (V)", "Observation"],
        [
            ["Lumière forte (lampe / fenêtre)", "", ""],
            ["Lumière faible (ombre avec la main)", "", ""],
            ["Transition (limite jour / nuit)", "", ""],
        ],
        [70, 40, 73],
    )

    pdf.heading("5. Programme — lecture ADC")
    pdf.p(
        "Sur ESP32, analogRead() renvoie une valeur de 0 à 4095 (ADC 12 bits), "
        "pour une tension d'environ 0 à 3,3 V."
    )
    pdf.code(
        """
// TP2 — Lecture LDR (R1) via pont avec R2 — GPIO34 (schema KiCad)
const int PIN_LDR = 34;

void setup() {
  Serial.begin(115200);
  Serial.println("TP2 pret - lecture GPIO34");
}

void loop() {
  int brut = analogRead(PIN_LDR);           // 0 .. 4095
  float tension = (brut / 4095.0) * 3.3;    // estimation en volts

  Serial.print("ADC=");
  Serial.print(brut);
  Serial.print("   U=");
  Serial.print(tension, 2);
  Serial.println(" V");
  delay(300);
}
"""
    )

    pdf.heading("6. Démarche")
    pdf.bullets(
        [
            "Câbler R1 + R2 + U1 selon le schéma (point milieu sur GPIO34).",
            "Mesurer U au multimètre (tableau ci-dessus).",
            "Téléverser le programme et comparer ADC / tension affichée aux mesures.",
            "Repérer si la valeur ADC augmente ou diminue quand la lumière augmente "
            "(cela dépend du sens LDR / R2 sur le pont).",
            "Choisir une valeur de seuil « limite jour / nuit » pour le prochain TP.",
        ]
    )

    pdf.heading("7. À retenir")
    pdf.bullets(
        [
            "R1 = LDR (capteur), R2 = résistance fixe du pont (schéma KiCad).",
            "L'ADC de l'ESP32 code la tension sur 12 bits (0–4095).",
            "Un seuil numérique se choisit à partir de tes mesures, pas au hasard.",
        ]
    )

    out = f"{OUT_DIR}\\TP2_LDR_mesure.pdf"
    pdf.output(out)
    print("written", out)


if __name__ == "__main__":
    gen_tp1()
    gen_tp2()
