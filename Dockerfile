FROM node:24.19.0-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update \
  && apt-get install --yes --no-install-recommends g++ make python3 \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@11.13.1 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/cli/package.json apps/cli/package.json
COPY apps/host/package.json apps/host/package.json
COPY apps/relay/package.json apps/relay/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/content/package.json packages/content/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/engine/package.json packages/engine/package.json
COPY packages/providers/package.json packages/providers/package.json
COPY packages/runtime/package.json packages/runtime/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm typecheck && pnpm --filter @lldm/web build

FROM node:24.19.0-bookworm-slim AS appliance

ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update \
  && apt-get install --yes --no-install-recommends gosu \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@11.13.1 --activate \
  && groupadd --system --gid 10001 lldm \
  && useradd --system --uid 10001 --gid lldm --home-dir /var/lib/lldm lldm \
  && mkdir -p /app /var/lib/lldm \
  && chown -R lldm:lldm /var/lib/lldm
WORKDIR /app
COPY --from=build --chown=lldm:lldm /app /app
COPY --chmod=0755 deploy/appliance/container-entrypoint.sh /usr/local/bin/lldm-container-entrypoint
EXPOSE 3210
ENTRYPOINT ["lldm-container-entrypoint"]
CMD ["pnpm", "tsx", "apps/host/src/main.ts"]
