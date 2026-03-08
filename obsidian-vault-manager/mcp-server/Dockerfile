FROM node:20-alpine3.21

WORKDIR /app

COPY package.json .
RUN npm install --production

COPY server.js .

ENV PORT=3001
EXPOSE ${PORT}

CMD ["node", "server.js"]
