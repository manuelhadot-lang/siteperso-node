FROM node:20-bookworm-slim

# Installe ngspice pour la route /api/simulate
RUN apt-get update && apt-get install -y --no-install-recommends \
    ngspice \
    && rm -rf /var/lib/apt/lists/*

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

# Vérification rapide: ngspice doit être présent dans PATH
RUN ngspice -v

CMD ["npm", "start"]