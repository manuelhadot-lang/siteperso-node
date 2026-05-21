FROM node:20-bookworm-slim

# Installe ngspice pour la route /api/simulate (paquet Debian, pas le bundle Windows du dépôt).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ngspice \
    && rm -rf /var/lib/apt/lists/* \
    && test -x /usr/bin/ngspice

# Le serveur lit NGSPICE en priorité : on force le binaire de l’image Linux (évite Simulateur/bin/*.exe).
ENV NGSPICE=/usr/bin/ngspice

WORKDIR /app

# Dépendances Node (légitime même si Render est en mode « Dockerfile » :
# npm install tourne pendant docker build, pas sur ta machine.)
COPY package*.json ./
RUN npm install --omit=dev

# Copie le code applicatif
COPY . .

# digital.cm : requis pour bascules D en XSPICE (d_dff). Simulateur/lib est dans .dockerignore,
# donc on le prend depuis l’installation apt ngspice (pas depuis le dépôt Git).
RUN mkdir -p Simulateur/lib/ngspice \
    && DIG=$(find /usr/lib/ngspice /usr/share/ngspice -name 'digital.cm' 2>/dev/null | head -n1) \
    && test -n "$DIG" \
    && cp "$DIG" Simulateur/lib/ngspice/digital.cm

ENV NODE_ENV=production
# ADMIN_USER + ADMIN_PASS : à définir uniquement dans Render → Environment (secrets).
# Ne pas les copier dans ce fichier (sinon exposition dans l’historique Git / registry).
EXPOSE 3000

# Vérifications build (équivalent npm run check-ngspice côté XSPICE)
RUN "$NGSPICE" -v
RUN test -f Simulateur/lib/ngspice/digital.cm
RUN "$NGSPICE" -v 2>&1 | grep -qi xspice

CMD ["npm", "start"]