FROM node:20-alpine

WORKDIR /app

RUN npm init -y && \
    npm install @modelcontextprotocol/server-filesystem express

COPY server.js .

EXPOSE 3001

CMD ["node", "server.js"]
