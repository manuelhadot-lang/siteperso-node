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

ENV NODE_ENV=production
# ADMIN_USER + ADMIN_PASS : à définir uniquement dans Render → Environment (secrets).
# Ne pas les copier dans ce fichier (sinon exposition dans l’historique Git / registry).
EXPOSE 3000

# Vérification : même binaire que NGSPICE
RUN "$NGSPICE" -v

CMD ["npm", "start"]