# -*- coding: utf-8 -*-
"""TP2 Station météo — DHT22 et moniteur série, mise en page des fiches du site."""
import struct
from fpdf import FPDF
from fpdf.enums import XPos, YPos

FONT = r"C:\Windows\Fonts\DejaVuSans.ttf"
FONT_B = r"C:\Windows\Fonts\DejaVuSans-Bold.ttf"
FIG = r"doc\StationMeteoConnectee\_tp2_media"
OUT = r"doc\StationMeteoConnectee\TP2_DHT22_serie.pdf"


def png_size(path):
    with open(path, "rb") as f:
        sig = f.read(8)
        if sig != b"\x89PNG\r\n\x1a\n":
            raise ValueError(path)
        f.read(8)
        w, h = struct.unpack(">II", f.read(8))
    return w, h


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
            "TP2 — DHT22 et moniteur série  |  Station météo connectée",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )
        self.ln(1)

    def footer(self):
        self.set_y(-12)
        self.set_font("DejaVu", "", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 8, f"Page {self.page_no()}/{{nb}}  —  1ère STI2D  —  Barème : 25 pts", align="C")

    def ensure(self, h):
        if self.get_y() + h > self.h - 16:
            self.add_page()

    def h1(self, text):
        self.ensure(16)
        self.set_font("DejaVu", "B", 13)
        self.set_text_color(15, 76, 129)
        self.ln(1)
        self.multi_cell(0, 7, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(0.6)

    def h2(self, text):
        self.ensure(12)
        self.set_font("DejaVu", "B", 11)
        self.set_text_color(20, 90, 140)
        self.ln(1.2)
        self.multi_cell(0, 6.2, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(0.3)

    def p(self, text):
        self.set_font("DejaVu", "", 10)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 5.2, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(0.4)

    def bullets(self, items):
        self.set_font("DejaVu", "", 10)
        self.set_text_color(30, 30, 30)
        for t in items:
            self.cell(5, 5.2, "•")
            self.multi_cell(0, 5.2, t, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(0.4)

    def code(self, src):
        self.set_font("DejaVu", "", 8)
        self.set_fill_color(245, 245, 245)
        self.set_text_color(20, 20, 20)
        for line in src.strip("\n").splitlines():
            safe = line.replace("—", "-").replace("→", "->").replace("’", "'")
            self.cell(0, 4.0, "  " + safe, new_x=XPos.LMARGIN, new_y=YPos.NEXT, fill=True)
        self.ln(1.4)

    def note(self, text):
        self.set_fill_color(255, 248, 230)
        self.set_font("DejaVu", "B", 9)
        self.set_text_color(120, 80, 0)
        self.multi_cell(0, 5.2, "À retenir", fill=True, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_font("DejaVu", "", 9)
        self.set_text_color(60, 40, 0)
        self.multi_cell(0, 5.0, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(1)

    def blanks(self, n=2):
        self.ensure(n * 6.4 + 2)
        self.set_draw_color(190, 190, 190)
        for _ in range(n):
            y = self.get_y() + 5.2
            self.line(self.l_margin, y, self.w - self.r_margin, y)
            self.ln(6.2)
        self.ln(0.4)

    def question(self, text, lines=2):
        text_h = 5.4 * (len(text) // 90 + 1)
        self.ensure(text_h + lines * 6.4 + 3)
        self.set_font("DejaVu", "", 10)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 5.2, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        if lines:
            self.blanks(lines)

    def zone(self, h, label):
        self.ensure(h + 3)
        x = self.l_margin
        y = self.get_y() + 1
        w = self.w - self.l_margin - self.r_margin
        self.set_draw_color(170, 170, 170)
        self.set_fill_color(252, 252, 252)
        self.rect(x, y, w, h)
        self.set_xy(x + 2, y + 1.5)
        self.set_font("DejaVu", "", 8)
        self.set_text_color(130, 130, 130)
        self.cell(w - 4, 4, label)
        self.set_y(y + h + 3)

    def table(self, headers, rows, widths, row_h=6.2):
        self.set_font("DejaVu", "B", 9)
        self.set_fill_color(15, 76, 129)
        self.set_text_color(255, 255, 255)
        for w, h in zip(widths, headers):
            self.cell(w, 6.4, h, border=1, fill=True)
        self.ln()
        self.set_font("DejaVu", "", 9)
        self.set_text_color(30, 30, 30)
        fill = False
        for row in rows:
            if fill:
                self.set_fill_color(240, 245, 250)
            else:
                self.set_fill_color(255, 255, 255)
            for w, cell in zip(widths, row):
                self.cell(w, row_h, cell, border=1, fill=True)
            self.ln()
            fill = not fill
        self.ln(1)

    def figure(self, path, caption, w=170):
        pw, ph = png_size(path)
        h = w * ph / pw
        if self.get_y() + h + 12 > self.h - 16:
            self.add_page()
        self.image(path, x=self.l_margin, w=w)
        self.ln(1)
        self.set_font("DejaVu", "", 8)
        self.set_text_color(80, 80, 80)
        self.multi_cell(0, 4.2, caption, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(1.2)


def main():
    pdf = TP()
    pdf.add_page()

    pdf.set_font("DejaVu", "B", 16)
    pdf.set_text_color(15, 76, 129)
    pdf.multi_cell(
        0,
        8,
        "TP2 — Lecture du DHT22 et moniteur série",
        new_x=XPos.LMARGIN,
        new_y=YPos.NEXT,
    )
    pdf.set_font("DejaVu", "", 10)
    pdf.set_text_color(60, 60, 60)
    pdf.multi_cell(
        0,
        5.4,
        "Projet : Station météo connectée  |  1ère STI2D  |  Durée : 4 h  |  Carte : ESP32 uPesy Wroom",
        new_x=XPos.LMARGIN,
        new_y=YPos.NEXT,
    )
    pdf.ln(1)
    pdf.set_font("DejaVu", "", 10)
    pdf.set_text_color(30, 30, 30)
    pdf.cell(0, 6, "Nom : ____________________    Prénom : ____________________    Classe : __________", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(1)

    pdf.h2("Objectifs")
    pdf.bullets(
        [
            "Mesurer une température et une humidité avec un capteur DHT22.",
            "Installer et utiliser une bibliothèque Arduino dédiée à un capteur.",
            "Afficher les mesures sur le moniteur série, en simulation puis sur la carte.",
            "Relier un affichage série à une trame de bits (start, données, parité, stop).",
        ]
    )

    pdf.h2("Matériel")
    pdf.table(
        ["Élément", "Rôle"],
        [
            ["ESP32 uPesy Wroom + câble USB", "Carte et téléversement"],
            ["DHT22 (AM2302)", "Température et humidité"],
            ["Résistance de rappel + fils + platine", "Liaison DATA fiable"],
            ["Simulateur du site", "Essai du programme avant le câblage réel"],
        ],
        [78, 105],
    )

    pdf.h2("Barème")
    pdf.table(
        ["Partie", "Travail", "Pts"],
        [
            ["1", "Sonde au platine (loi, tableau, courbe)", "4"],
            ["2", "Trame numérique du DHT22", "1"],
            ["3", "Simulation : câblage, code, moniteur série", "10"],
            ["4", "Montage réel et téléversement", "5"],
            ["5", "Liaison série (débit, Tx/Rx, chronogramme)", "5"],
        ],
        [22, 145, 16],
    )

    pdf.h1("PARTIE 1 — Sonde résistive au platine")
    pdf.p(
        "Avant le capteur numérique, on étudie un modèle analogique. "
        "La résistance RS d'une sonde au platine varie avec la température θ selon :"
    )
    pdf.set_font("DejaVu", "B", 11)
    pdf.set_text_color(15, 76, 129)
    pdf.cell(0, 7, "RS = R0 (1 + a · θ)", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="C")
    pdf.ln(0.5)
    pdf.p(
        "R0 = 100 Ω et a = 3,85 × 10⁻³. La température θ est en °C. "
        "La sonde est placée dans un forage. À 100 m de profondeur, la température vaut 14 °C "
        "et ne change pas avec la saison. Au-delà, elle augmente de 4 °C tous les 100 m."
    )
    pdf.question("1. (1 pt) Indiquer l'unité de la constante a.", 2)
    pdf.question("2. (1 pt) Pour quelle température a-t-on RS = R0 ?", 2)
    pdf.p(
        "3. (1 pt) Compléter le tableau : température puis résistance RS "
        "aux profondeurs demandées. Le point de référence est 14 °C à 100 m."
    )
    pdf.table(
        ["Profondeur (m)", "1 000", "2 000", "2 500"],
        [
            ["Température θ (°C)", "", "", ""],
            ["RS (Ω)", "", "", ""],
        ],
        [46, 45, 45, 47],
        row_h=9,
    )
    pdf.ensure(165)
    pdf.question(
        "4. (1 pt) Tracer θ = f(RS) avec une dizaine de points. "
        "La caractéristique est-elle linéaire ? Justifier.",
        0,
    )
    pdf.zone(145, "Graphique et justification")

    pdf.add_page()
    pdf.h1("PARTIE 2 — Trame numérique du DHT22")
    pdf.p(
        "Le DHT22 (aussi appelé RHT03 ou AM2302) envoie une mesure sur un bus 1 fil. "
        "Une réponse utile contient 40 bits, dans cet ordre :"
    )
    pdf.table(
        ["Champ", "Taille", "Sens"],
        [
            ["Humidité relative", "16 bits", "Partie entière puis partie décimale"],
            ["Température", "16 bits", "Partie entière puis partie décimale"],
            ["Checksum", "8 bits", "Somme des quatre octets précédents"],
        ],
        [48, 28, 107],
    )
    pdf.p(
        "On divise l'entier 16 bits par 10 pour obtenir l'unité physique "
        "(%HR ou °C). Si le bit de poids fort de la température vaut 1, la température est négative. "
        "Le checksum reçu doit être égal aux 8 bits de poids faible de la somme des quatre octets de mesure. "
        "S'il diffère, la trame est rejetée."
    )
    pdf.note(
        "Exemple de la fiche technique : 0000 0010 1000 1100  0000 0001 0101 1111  1110 1110 "
        "donne 65,2 %HR et 35,1 °C. Le checksum 1110 1110 est bien la somme des quatre octets."
    )
    pdf.p("Trame à décoder (les 8 derniers bits sont à calculer) :")
    pdf.code("0000 0001 1111 0100    0000 0001 0001 1000    _ _ _ _  _ _ _ _")
    pdf.question(
        "5. (1 pt) Donner le checksum de cette trame et expliquer son rôle. "
        "En déduire la température et l'humidité obtenues.",
        4,
    )

    pdf.h1("PARTIE 3 — Câblage")
    pdf.p(
        "Le programme de départ lit le DHT22 sur la broche 2, c'est-à-dire GPIO2 de l'ESP32. "
        "La carte uPesy n'accepte pas le 5 V sur ses GPIO : le capteur est alimenté en 3,3 V."
    )
    pdf.figure(
        FIG + r"\image1.png",
        "Figure 1 — Brochage de l'ESP32 uPesy Wroom. Repérer GPIO2, 3V3 et GND.",
        w=175,
    )
    pdf.figure(
        FIG + r"\image2.png",
        "Figure 2 — Platine : DHT22, rappel de DATA vers 3,3 V, masse et alimentation.",
        w=165,
    )
    pdf.table(
        ["Broche DHT22", "Vers", "Remarque"],
        [
            ["VCC (broche 1)", "3V3", "Ne pas utiliser le 5 V de la carte"],
            ["DATA (broche 2)", "GPIO2", "Fil vert sur la photo"],
            ["NC (broche 3)", "rien", "Non connectée"],
            ["GND (broche 4)", "GND", "Masse commune"],
            ["Rappel", "DATA — 3V3", "Résistance entre DATA et 3,3 V"],
        ],
        [42, 38, 103],
    )
    pdf.note(
        "Dans le simulateur, le module s'appelle Grove DHT22. Ses broches sont, de haut en bas : "
        "VCC, DATA, NC, GND. Relier DATA à GPIO2, VCC à 3V3 et GND à GND. "
        "La résistance de rappel est déjà dans le module Grove : on ne l'ajoute pas dans le simulateur."
    )

    pdf.add_page()
    pdf.h1("PARTIE 4 — Bibliothèque et programme de départ")
    pdf.h2("4.1 Installer la bibliothèque")
    pdf.bullets(
        [
            "Ouvrir l'IDE Arduino.",
            "Ouvrir le gestionnaire de bibliothèques (icône des livres).",
            "Chercher DHT sensor library et l'installer si elle n'est pas déjà présente.",
            "La bibliothèque Adafruit Unified Sensor est demandée en dépendance : l'installer aussi.",
        ]
    )
    pdf.h2("4.2 Programme fourni")
    pdf.p(
        "Ce programme n'affiche que la température, une fois par seconde, à 9600 bauds."
    )
    pdf.code(
        """
#include <Wire.h>
#include <DHT.h>

// Capteur DHT22 sur la broche 2 (GPIO2)
DHT dht(2, DHT22);

void setup()
{
    Serial.begin(9600);
    dht.begin();
}

void loop()
{
    float temp = dht.readTemperature();
    Serial.println(temp);
    delay(1000);
}
"""
    )
    pdf.p(
        "dht.readTemperature() renvoie la température en °C. "
        "dht.readHumidity() renvoie l'humidité relative en %. "
        "setup() ne s'exécute qu'une fois ; loop() se répète."
    )

    pdf.h1("PARTIE 5 — Simulation")
    pdf.p(
        "Travail sur le simulateur du site (menu Arduino, capteur Grove DHT22, carte ESP32 uPesy). "
        "Montrer l'écran au professeur aux étapes notées."
    )
    pdf.question(
        "6. (1 pt) Réaliser le câblage décrit partie 3. Faire vérifier le schéma.",
        1,
    )
    pdf.question(
        "7. (2 pts) Coller le programme de départ, lancer la simulation et montrer "
        "le moniteur série.",
        2,
    )
    pdf.question("8. (1 pt) Quelle est la différence entre print et println ?", 3)
    pdf.question(
        "9. (1 pt) Comment modifier la température du DHT22 dans le simulateur ?",
        2,
    )
    pdf.ensure(55)
    pdf.p("10. (2 pts) Modifier le programme pour obtenir exactement cet affichage :")
    pdf.code("32.00 °C")
    pdf.p("Écrire le code modifié (la partie loop suffit si le reste ne change pas).")
    pdf.blanks(5)
    pdf.ensure(62)
    pdf.p(
        "11. (3 pts) Afficher aussi l'humidité, sous cette forme exacte "
        "(une grandeur par ligne) :"
    )
    pdf.code(
        """
température: 24.00 °C
humidité: 40.00 %
"""
    )
    pdf.p("Écrire le code qui produit cet affichage.")
    pdf.blanks(6)

    pdf.add_page()
    pdf.h1("PARTIE 6 — Montage réel")
    pdf.p("Le câblage est celui de la figure 2. Le programme est celui validé en simulation.")
    pdf.question(
        "12. (2 pts) Réaliser le montage sur la platine et joindre une photo nette "
        "(carte, DHT22, fils VCC / DATA / GND visibles).",
        2,
    )
    pdf.question(
        "13. (3 pts) Téléverser le programme complet dans l'ESP32. "
        "Ouvrir le moniteur série à 9600 bauds et montrer les lignes affichées.",
        2,
    )
    pdf.note(
        "Si le moniteur série affiche nan, vérifier l'alimentation 3,3 V, la masse, "
        "GPIO2, la résistance de rappel, puis attendre une seconde après dht.begin()."
    )

    pdf.h1("PARTIE 7 — Liaison série")
    pdf.question(
        "14. (1 pt) Dans setup(), Serial.begin(9600) fixe un nombre. "
        "À quoi correspond 9600 ?",
        2,
    )
    pdf.question("15. (1 pt) Quels sont les rôles des lignes Tx et Rx ?", 3)
    pdf.p(
        "Chaque caractère du moniteur série est un code ASCII. "
        "Par exemple, A majuscule vaut 65 en décimal, soit 41 en hexadécimal "
        "et 0100 0001 en binaire."
    )
    pdf.figure(
        FIG + r"\image7.png",
        "Figure 3 — Table ASCII. Le code décimal est indiqué devant chaque caractère.",
        w=175,
    )
    pdf.p(
        "Sur le fil, un caractère n'est pas envoyé seul. Une trame UART habituelle comporte "
        "un bit de start à 0, puis les 8 bits de donnée (poids faible en premier), "
        "un bit de parité, puis un bit de stop à 1. Au repos, la ligne vaut 1."
    )
    pdf.figure(
        FIG + r"\image8.png",
        "Figure 4 — Chronogramme d'un envoi série : start, 8 bits, parité, stop.",
        w=175,
    )
    pdf.add_page()
    pdf.question(
        "16. (1 pt) Quel caractère le chronogramme de la figure 4 envoie-t-il ? "
        "Détailler les 8 bits de donnée, du poids faible vers le poids fort.",
        4,
    )
    pdf.question(
        "17. (2 pts) Dessiner le chronogramme d'envoi de la lettre S majuscule "
        "(même format : start, 8 bits poids faible en tête, parité, stop).",
        0,
    )
    pdf.zone(95, "Chronogramme de S")

    pdf.h2("Bilan")
    pdf.p(
        "Tu dois pouvoir expliquer la chaîne complète : loi d'une sonde analogique, "
        "trame binaire du DHT22, câblage 3,3 V, bibliothèque, affichage série, "
        "puis le passage d'un caractère ASCII sur Tx."
    )

    pdf.output(OUT)
    print(OUT)


if __name__ == "__main__":
    main()
