/**
 * Référence des commandes par bibliothèque Arduino — affichée dans la fenêtre flottante.
 * simSupported : interprété par le simulateur (LCD, GPIO, délais…).
 */

/** @typedef {{ sig: string; desc: string; simSupported?: boolean }} LibCommand */

/** @type {{ id: string; match: RegExp; title: string; header?: string; ctor?: string; note?: string; commands: LibCommand[] }[]} */
export const ARDUINO_LIB_DOCS = [
    {
        id: "liquidcrystal_i2c",
        match: /liquid\s*crystal/i,
        title: "LiquidCrystal I2C",
        header: "#include <LiquidCrystal_I2C.h>",
        ctor: "LiquidCrystal_I2C lcd(0x3E, 16, 2);  // adresse Grove Seeed",
        note: "Compatible Grove LCD 16×2 (PCF8574). Relier SDA→A4, SCL→A5, 5 V et GND.",
        commands: [
            { sig: "lcd.init()", desc: "Initialise l’afficheur HD44780 (4 bits via I²C).", simSupported: true },
            { sig: "lcd.begin(cols, rows)", desc: "Alias de init() avec taille optionnelle.", simSupported: true },
            { sig: "lcd.backlight()", desc: "Rétroéclairage ON.", simSupported: true },
            { sig: "lcd.noBacklight()", desc: "Rétroéclairage OFF.", simSupported: true },
            { sig: "lcd.clear()", desc: "Efface l’écran.", simSupported: true },
            { sig: "lcd.home()", desc: "Curseur en (0, 0).", simSupported: true },
            { sig: "lcd.setCursor(col, row)", desc: "Position du curseur (colonne, ligne).", simSupported: true },
            { sig: 'lcd.print("texte")', desc: "Affiche une chaîne ou un nombre.", simSupported: true },
            { sig: 'lcd.print(F("texte"))', desc: "Chaîne en mémoire programme (FLASH).", simSupported: true },
            { sig: "lcd.write(byte)", desc: "Écrit un caractère (code ASCII).", simSupported: true },
            { sig: "delay(ms)", desc: "Pause en millisecondes (animation LCD en simulation).", simSupported: true },
            { sig: "lcd.scrollDisplayLeft()", desc: "Décale l’affichage d’une colonne vers la gauche.", simSupported: true },
            { sig: "lcd.scrollDisplayRight()", desc: "Décale l’affichage d’une colonne vers la droite.", simSupported: true },
            { sig: "lcd.cursor() / noCursor()", desc: "Curseur clignotant.", simSupported: false },
            { sig: "lcd.blink() / noBlink()", desc: "Clignotement du curseur.", simSupported: false },
            { sig: "lcd.createChar(id, data[])", desc: "Caractère personnalisé CGRAM.", simSupported: false },
        ],
    },
    {
        id: "wire",
        match: /^wire$/i,
        title: "Wire (I²C)",
        header: "#include <Wire.h>",
        note: "Requis pour la compilation LiquidCrystal_I2C. Le bus I²C est modélisé automatiquement si le LCD Grove est câblé.",
        commands: [
            { sig: "Wire.begin()", desc: "Initialise le maître I²C (UNO : A4=SDA, A5=SCL).", simSupported: false },
            { sig: "Wire.beginTransmission(addr)", desc: "Début de transmission vers l’esclave.", simSupported: false },
            { sig: "Wire.write(data)", desc: "Octet à envoyer.", simSupported: false },
            { sig: "Wire.endTransmission()", desc: "Fin de transmission.", simSupported: false },
            { sig: "Wire.requestFrom(addr, n)", desc: "Lecture de n octets.", simSupported: false },
            { sig: "Wire.read()", desc: "Lit un octet reçu.", simSupported: false },
        ],
    },
    {
        id: "dht_sensor",
        match: /\bDHT\b|dht\.h/i,
        title: "DHT sensor library",
        header: "#include <DHT.h>",
        ctor: "#define DHTPIN 2\n#define DHTTYPE DHT22\nDHT dht(DHTPIN, DHTTYPE);",
        note: "Grove DHT22 : DATA→broche digitale UNO, VCC→5V, GND. La broche NC n’est pas utilisée.",
        commands: [
            { sig: "dht.begin()", desc: "Initialise le capteur.", simSupported: true },
            { sig: "dht.readTemperature()", desc: "Température en °C (simulation).", simSupported: true },
            { sig: "dht.readHumidity()", desc: "Humidité relative en % (simulation).", simSupported: true },
            { sig: "dht.read()", desc: "Lecture brute (non simulée).", simSupported: false },
        ],
    },
    {
        id: "grove_rgb_lcd",
        match: /grove.*lcd.*rgb|rgb_lcd/i,
        title: "Grove — LCD RGB Backlight",
        header: "#include <rgb_lcd.h>",
        ctor: "rgb_lcd lcd;",
        note: "Bibliothèque Seeed pour l’écran RGB (même câblage I²C que le Grove 16×2).",
        commands: [
            { sig: "lcd.begin(cols, rows, charsize)", desc: "Initialisation.", simSupported: true },
            { sig: "lcd.setRGB(r, g, b)", desc: "Couleur du rétroéclairage RGB (0–255).", simSupported: true },
            { sig: "lcd.scrollDisplayLeft()", desc: "Décale l’affichage d’une colonne vers la gauche.", simSupported: true },
            { sig: "lcd.scrollDisplayRight()", desc: "Décale l’affichage d’une colonne vers la droite.", simSupported: true },
            { sig: "lcd.setCursor / print / clear", desc: "Comme LiquidCrystal (texte 16×2).", simSupported: true },
        ],
    },
    {
        id: "serial_uart",
        match: /\bserial\b/i,
        title: "Serial (UART)",
        note: "UART matériel UNO : TX = broche D1, RX = broche D0. Menu Mesures → Moniteur série.",
        commands: [
            { sig: "Serial.begin(baud)", desc: "Initialise le port série (ex. 9600).", simSupported: true },
            { sig: 'Serial.print("texte")', desc: "Écrit dans le moniteur série (sans retour ligne).", simSupported: true },
            { sig: "Serial.println(val)", desc: "Écrit avec saut de ligne.", simSupported: true },
            { sig: "Serial.write(byte)", desc: "Envoie un octet brut.", simSupported: true },
            { sig: "Serial.available()", desc: "Nombre d’octets reçus sur RX (D0).", simSupported: true },
            { sig: "Serial.read()", desc: "Lit un octet (-1 si aucune donnée).", simSupported: true },
        ],
    },
    {
        id: "arduino_core",
        match: /^(arduino|avr|standard)$/i,
        title: "Arduino (noyau AVR)",
        note: "Fonctions de base du sketch — sorties GPIO simulées sur broches digitales.",
        commands: [
            { sig: "pinMode(pin, OUTPUT)", desc: "Configure une broche en sortie.", simSupported: true },
            { sig: "pinMode(pin, INPUT)", desc: "Configure une broche en entrée.", simSupported: true },
            { sig: "digitalWrite(pin, HIGH|LOW)", desc: "Niveau logique sur une sortie.", simSupported: true },
            { sig: "digitalRead(pin)", desc: "Lit une entrée digitale (boutons, interrupteurs).", simSupported: true },
            { sig: "analogRead(pin)", desc: "Lit une entrée analogique A0–A5 (0–1023, tension du circuit).", simSupported: true },
            { sig: "analogWrite(pin, val)", desc: "PWM — partiel selon broche.", simSupported: false },
            { sig: "delay(ms)", desc: "Pause bloquante.", simSupported: true },
            { sig: "delayMicroseconds(us)", desc: "Pause courte.", simSupported: false },
            { sig: "millis() / micros()", desc: "Temps écoulé depuis le démarrage.", simSupported: false },
        ],
    },
];

/**
 * @param {string} libName
 * @returns {typeof ARDUINO_LIB_DOCS[0] | null}
 */
export function resolveArduinoLibDoc(libName) {
    const n = String(libName || "").trim();
    if (!n) return null;
    for (const doc of ARDUINO_LIB_DOCS) {
        if (doc.match.test(n)) return doc;
    }
    if (/i2c/i.test(n) && /lcd/i.test(n)) {
        return ARDUINO_LIB_DOCS.find((d) => d.id === "liquidcrystal_i2c") ?? null;
    }
    return null;
}
