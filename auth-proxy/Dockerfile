FROM node:20-alpine3.21 AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package.json .
RUN npm install --omit=dev

FROM node:20-alpine3.21

WORKDIR /app
COPY --from=builder /app .
COPY src/ src/

ENV PORT=3000
EXPOSE ${PORT}

CMD ["node", "src/server.js"]
