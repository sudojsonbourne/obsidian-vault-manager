FROM node:20-alpine3.21

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY server.js .

ENV PORT=3001
EXPOSE ${PORT}

CMD ["node", "server.js"]
