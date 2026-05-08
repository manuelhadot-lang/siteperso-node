FROM node:20-bookworm-slim

# Installe ngspice pour la route /api/simulate
RUN apt-get update && apt-get install -y --no-install-recommends \
    ngspice \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Installe d'abord les deps pour profiter du cache Docker
COPY package*.json ./
RUN npm install --omit=dev

# Copie le code applicatif
COPY . .

ENV NODE_ENV=production
EXPOSE 3000

# Vérification rapide: ngspice doit être présent dans PATH
RUN ngspice -v

CMD ["npm", "start"]