FROM ghcr.io/openai/tunnel-client:v0.0.21@sha256:983df88cd56d49ae3863ae52b751d106c95aba8a03783c87ac2304b4e0cd154a AS tunnel

FROM node:26.13.0-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68 AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY src ./src
USER 1000:1000

FROM base AS client
COPY --from=tunnel /usr/bin/tunnel-client /usr/local/bin/tunnel-client
COPY --from=tunnel /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
HEALTHCHECK --interval=10s --timeout=5s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:8080/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["tunnel-client", "run", "--config", "/run/hermes/tunnel.yaml"]

FROM base AS source
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "src/adapters/serve.js"]
