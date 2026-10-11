# -*- coding: utf-8 -*-
"""Fiche simple : les fonctions en C++ (paramètres + return) — Veilleur Intelligent."""
from fpdf import FPDF
from fpdf.enums import XPos, YPos

FONT = r"C:\Windows\Fonts\DejaVuSans.ttf"
FONT_B = r"C:\Windows\Fonts\DejaVuSans-Bold.ttf"
OUT = r"doc\Veilleur_intelligent\Fiche_fonctions_Cpp_1ere_STI2D.pdf"


class Fiche(FPDF):
    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("DejaVu", "", 8)
        self.set_text_color(90, 90, 90)
        self.cell(
            0,
            6,
            "1ère STI2D — Fonctions en C++ (paramètres et return)",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )
        self.ln(1)

    def footer(self):
        self.set_y(-12)
        self.set_font("DejaVu", "", 8)
        self.set_text_color(120, 120, 120)
        self.cell(
            0,
            8,
            f"Page {self.page_no()}/{{nb}}  —  Projet Veilleur intelligent",
            align="C",
        )

    def h2(self, text):
        self.set_font("DejaVu", "B", 11)
        self.set_text_color(20, 90, 140)
        self.ln(1.5)
        self.multi_cell(0, 6.5, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(0.5)

    def p(self, text):
        self.set_font("DejaVu", "", 10)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 5.4, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(0.6)

    def bullet(self, text):
        self.set_font("DejaVu", "", 10)
        self.set_text_color(30, 30, 30)
        self.cell(5, 5.4, chr(0x2022))
        self.multi_cell(0, 5.4, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    def code(self, src):
        self.set_font("DejaVu", "", 8.5)
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
            self.cell(
                0, 4.2, "  " + safe, new_x=XPos.LMARGIN, new_y=YPos.NEXT, fill=True
            )
        self.ln(2)

    def note(self, text):
        self.set_fill_color(255, 248, 230)
        self.set_font("DejaVu", "B", 9)
        self.set_text_color(120, 80, 0)
        self.multi_cell(0, 5.5, "A retenir", fill=True, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_font("DejaVu", "", 9)
        self.set_text_color(60, 40, 0)
        self.multi_cell(0, 5.2, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
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
            for w, cell in zip(widths, row):
                self.cell(w, 5.8, cell, border=1, fill=True)
            self.ln()
            fill = not fill
        self.ln(1)


def main():
    pdf = Fiche(format="A4")
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.add_font("DejaVu", "", FONT)
    pdf.add_font("DejaVu", "B", FONT_B)

    pdf.add_page()
    pdf.set_font("DejaVu", "B", 17)
    pdf.set_text_color(15, 76, 129)
    pdf.multi_cell(0, 8, "Les fonctions en C++", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("DejaVu", "", 11)
    pdf.set_text_color(60, 60, 60)
    pdf.multi_cell(
        0,
        6,
        "Fiche simple — paramètres (attributs) et return  |  1ère STI2D  |  Veilleur intelligent",
        new_x=XPos.LMARGIN,
        new_y=YPos.NEXT,
    )
    pdf.ln(2)

    pdf.h2("1. A quoi sert une fonction ?")
    pdf.p(
        "Une fonction est un bloc de code que l'on peut réutiliser. "
        "On lui donne un nom, on peut lui envoyer des valeurs (paramètres), "
        "et elle peut renvoyer un résultat avec return."
    )
    pdf.bullet("Evite de recopier le même code plusieurs fois.")
    pdf.bullet("Rend le programme plus clair (une tâche = une fonction).")
    pdf.bullet("Utile sur ESP32 : lire un capteur, allumer une LED, calculer une valeur…")
    pdf.ln(1)

    pdf.h2("2. Forme générale")
    pdf.code(
        """
type_retour  nomFonction(type1 param1, type2 param2) {
  // instructions
  return resultat;   // obligatoire si type_retour n'est pas void
}
"""
    )
    pdf.table(
        ["Element", "Role"],
        [
            ["type_retour", "Type de la valeur renvoyee (int, float, bool...)"],
            ["nomFonction", "Nom choisi pour appeler la fonction"],
            ["parametres", "Valeurs recues a l'appel (entre parentheses)"],
            ["return", "Renvoie le resultat au programme qui a appele"],
        ],
        [40, 140],
    )

    pdf.h2("3. Exemple sans paramètre, avec return")
    pdf.p("La fonction lit une entrée analogique et renvoie la valeur mesurée.")
    pdf.code(
        """
int lireLuminosite() {
  int valeur = analogRead(34);  // pin LDR
  return valeur;                // on renvoie le resultat
}

void setup() {
  Serial.begin(115200);
}

void loop() {
  int lux = lireLuminosite();   // appel : on recupere le return
  Serial.println(lux);
  delay(500);
}
"""
    )
    pdf.note(
        "lireLuminosite() renvoie un int. On stocke ce resultat dans lux grâce au return."
    )

    pdf.h2("4. Exemple avec paramètres (attributs)")
    pdf.p(
        "Les paramètres sont les valeurs passées à la fonction lors de l'appel. "
        "On les appelle aussi arguments ou attributs de la fonction."
    )
    pdf.code(
        """
// a et b sont les parametres
int addition(int a, int b) {
  int somme = a + b;
  return somme;
}

void loop() {
  int resultat = addition(3, 5);  // 3 et 5 = valeurs envoyees
  // resultat vaut 8
}
"""
    )
    pdf.bullet("a et b : noms des paramètres dans la définition.")
    pdf.bullet("3 et 5 : valeurs réellement envoyées à l'appel.")
    pdf.bullet("return somme : renvoie le calcul vers resultat.")
    pdf.ln(1)

    pdf.h2("5. Fonction qui ne renvoie rien : void")
    pdf.p(
        "Si la fonction fait une action sans renvoyer de valeur, "
        "on utilise le type void. Dans ce cas, pas de return de valeur "
        "(ou return; tout seul pour sortir)."
    )
    pdf.code(
        """
void allumerLed(int pin) {
  pinMode(pin, OUTPUT);
  digitalWrite(pin, HIGH);
  // pas de return de valeur
}

void loop() {
  allumerLed(2);   // allume la LED sur la broche 2
}
"""
    )

    pdf.h2("6. Lien avec le projet Veilleur")
    pdf.p("Exemples utiles pour le veilleur intelligent :")
    pdf.code(
        """
bool estNuit(int seuil) {
  int lux = analogRead(34);
  return lux < seuil;   // true si sombre, false sinon
}

void gererAlarme(bool alerte) {
  if (alerte) {
    digitalWrite(2, HIGH);  // LED / buzzer
  } else {
    digitalWrite(2, LOW);
  }
}

void loop() {
  bool nuit = estNuit(1500);
  gererAlarme(nuit);
  delay(200);
}
"""
    )

    pdf.h2("7. Erreurs fréquentes")
    pdf.bullet("Oublier return alors que le type n'est pas void.")
    pdf.bullet("Mauvaise correspondance des types (ex. renvoyer un float déclaré int).")
    pdf.bullet("Appeler la fonction avec le mauvais nombre de paramètres.")
    pdf.bullet("Confondre le nom du paramètre et la valeur envoyée à l'appel.")
    pdf.ln(1)

    pdf.note(
        "Une fonction = un nom + éventuellement des paramètres + un type de retour. "
        "return sert a renvoyer le resultat a celui qui a appele la fonction."
    )

    pdf.output(OUT)
    print("OK ->", OUT)


if __name__ == "__main__":
    main()
