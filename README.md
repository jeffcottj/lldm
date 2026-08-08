# LLDM

LLDM is a local-authority living-room role-playing game. Phase 2 provides a
deterministic Floodgate adventure for three to five browser players, a labeled
two-player multi-hero rehearsal mode, a shared TV presentation, physical dice
for pivotal checks, and an ephemeral Cloudflare relay. The TypeScript rules
engine and local SQLite event streams remain canonical; the relay stores no
gameplay payload.

## Local development

Use Node 24 and the repository-pinned pnpm version:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm verify
pnpm config:check
pnpm appliance:smoke
```

Run the web, relay, or host development entry points with `pnpm web:dev`,
`pnpm relay:dev`, and `pnpm host:dev`. Normal browser players use the relay's
HTTPS room URL; the host's loopback URL is for the appliance TV only.

## Appliance operation

Set `LLDM_PUBLIC_PWA_URL` and `LLDM_RELAY_URL` to the reviewed deployed Worker
URL. Install the matching relay-creation credential as a protected file outside
this repository; never put the credential in Compose, shell history, or source
control. Compose reads `/etc/lldm/relay_create_credential` by default, or the
absolute file named by `LLDM_RELAY_CREDENTIAL_SOURCE_FILE`:

```sh
sudo install -d -m 0700 /etc/lldm
sudo install -m 0600 /absolute/path/to/relay_create_credential /etc/lldm/relay_create_credential
```

Create and migrate the persistent database explicitly before normal startup:

```sh
docker compose build
docker compose run --rm host pnpm tsx apps/cli/src/main.ts db migrate --database /var/lib/lldm/lldm.sqlite
docker compose up -d
docker compose logs -f host
```

Open `http://127.0.0.1:3210/tv` on the attached TV. Choose a new normal room,
a two-player rehearsal, or the explicit `Resume Last Session` action. Stop the
host with `docker compose stop`; `docker compose down` preserves the named
`lldm-data` volume unless an operator explicitly removes that volume.

Compose publishes only `127.0.0.1:3210`. Phones must scan the TV's HTTPS relay
QR or enter its fallback code and must never connect to the appliance LAN
address. The host reports migration recovery instead of silently changing a
database.

Chromium kiosk assets live in `deploy/appliance`. Both installer scripts are
dry-run by default and print their exact changes:

```sh
scripts/appliance/install-kiosk.sh
sudo scripts/appliance/install-kiosk.sh --apply
scripts/appliance/uninstall-kiosk.sh
```

Run `pnpm appliance:smoke`, `docker compose config --quiet`, and `bash -n
scripts/appliance/*.sh` before appliance changes. Phase 6, not this phase, owns
production upgrade/rollback automation and comprehensive hardening.

The implementation roadmap and current evidence are in
[PRIMARY_PLAN.md](PRIMARY_PLAN.md); repository principles are in
[AGENTS.md](AGENTS.md), and generated Phase 2 boundaries are in
[docs/generated/phase-2-room-reference.md](docs/generated/phase-2-room-reference.md).

This repository is released under the [MIT License](LICENSE).
