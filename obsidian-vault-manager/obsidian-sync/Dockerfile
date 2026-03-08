FROM node:22-alpine3.21

RUN apk add --no-cache procps \
    && npm install -g obsidian-headless

RUN mkdir -p /vault /home/obsidian/.config && chown -R 1026:100 /home/obsidian

ENV HOME=/home/obsidian

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /vault

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
