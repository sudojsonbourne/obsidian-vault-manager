FROM node:22-alpine

RUN apk add --no-cache procps \
    && npm install -g obsidian-headless

RUN mkdir -p /vault

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /vault

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
