# 1. Utilisation d'une image officielle Node.js (version LTS)
FROM node:20-slim

# 2. Installation d'ngspice et des dépendances système obligatoires
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    ngspice \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Installer arduino-cli (Linux amd64) — curl requis (absent de node:20-slim)
ARG ARDUINO_CLI_VERSION=1.2.0
RUN curl -fsSL \
    "https://downloads.arduino.cc/arduino-cli/arduino-cli_${ARDUINO_CLI_VERSION}_Linux_64bit.tar.gz" \
    | tar -xz -C /usr/local/bin arduino-cli \
    && chmod +x /usr/local/bin/arduino-cli \
    && /usr/local/bin/arduino-cli version
# Core Arduino UNO (avr) — indispensable pour compiler
ENV ARDUINO_DIRECTORIES_DATA=/opt/arduino-data
RUN mkdir -p "$ARDUINO_DIRECTORIES_DATA" \
    && /usr/local/bin/arduino-cli config init --dest-dir "$ARDUINO_DIRECTORIES_DATA" \
    && /usr/local/bin/arduino-cli core update-index \
    && /usr/local/bin/arduino-cli core install arduino:avr \
    && /usr/local/bin/arduino-cli core install esp32:esp32
ENV ARDUINO_CLI=/usr/local/bin/arduino-cli
ENV ARDUINO_CORES_PREINSTALLED=arduino:avr,esp32:esp32
# Bibliothèques Grove / capteurs / affichage — évite les téléchargements à la 1ère compilation
RUN /usr/local/bin/arduino-cli lib install \
    "LiquidCrystal I2C" \
    "DHT sensor library" \
    "Adafruit GFX Library" \
    "Adafruit BusIO" \
    "Adafruit Unified Sensor" \
    "Adafruit ST7735 and ST7789 Library" \
    "Adafruit TSL2591 Library" \
    "Adafruit BMP280 Library" \
    || true

# 3. Définition du répertoire de travail dans le conteneur
WORKDIR /app

# 4. Copie des fichiers de configuration NPM pour installer les modules
COPY package*.json ./

# Installer uniquement les dépendances de production pour alléger l'image
RUN npm ci --only=production

# 5. Copie de l'intégralité du code source du projet
COPY . .

# BMP280 : lien vers Library Manager si absent du dépôt (.dockerignore exclut le submodule)
RUN rm -rf arduino-libraries/libraries/Adafruit_BMP280_Library \
    && mkdir -p arduino-libraries/libraries \
    && BMP280_DATA=$(find "$ARDUINO_DIRECTORIES_DATA/libraries" -maxdepth 1 -type d -iname '*bmp280*' 2>/dev/null | head -n1) \
    && if [ -z "$BMP280_DATA" ] || [ ! -f "$BMP280_DATA/Adafruit_BMP280.h" ]; then \
         /usr/local/bin/arduino-cli lib install "Adafruit BMP280 Library" || true; \
         BMP280_DATA=$(find "$ARDUINO_DIRECTORIES_DATA/libraries" -maxdepth 1 -type d -iname '*bmp280*' 2>/dev/null | head -n1); \
       fi \
    && if [ -n "$BMP280_DATA" ] && [ -f "$BMP280_DATA/Adafruit_BMP280.h" ]; then \
         ln -s "$BMP280_DATA" arduino-libraries/libraries/Adafruit_BMP280_Library; \
       else \
         echo "⚠ Adafruit BMP280 Library non installée — compilation BMP280 via Library Manager au runtime."; \
       fi

# 6. ÉTAPE DE SÉCURISATION DU RECONSTRUISEUR XSPICE (Ton correctif d'erreur)
# Recherche le fichier original 'digital.cm' installé par le paquet ngspice sur Linux,
# crée le sous-répertoire attendu par ton server.js, et y copie le modèle de code.
RUN mkdir -p Simulateur/lib/ngspice \
    && DIG=$(find /usr/lib /usr/share /var/lib -name 'digital.cm' 2>/dev/null | head -n1) \
    && if [ -n "$DIG" ]; then \
         cp "$DIG" Simulateur/lib/ngspice/digital.cm; \
         echo "✓ Module digital.cm localisé et configuré avec succès."; \
       else \
         echo "⚠ Attention : Le fichier digital.cm système n'a pas été trouvé pendant le build. Il sera généré dynamiquement au runtime si nécessaire."; \
       fi

# 7. Définition de la variable d'environnement pour que le serveur sache où appeler ngspice sur Linux
ENV NODE_ENV=production
ENV NGSPICE=/usr/bin/ngspice

# 8. Exposition du port de ton application (par défaut 3000 comme configuré dans ton server.js)
EXPOSE 3000

# 9. Commande de démarrage du serveur
CMD ["node", "server.js"]