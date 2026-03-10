FROM cloudflare/cloudflared:2025.2.1 AS upstream

FROM alpine:3.21
RUN apk add --no-cache wget
COPY --from=upstream /usr/local/bin/cloudflared /usr/local/bin/cloudflared
ENTRYPOINT ["cloudflared"]
