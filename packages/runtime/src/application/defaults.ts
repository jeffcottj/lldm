import { type EventId, type LegalActionId, sha256Hex } from "@lldm/contracts";
import { decideCommand } from "@lldm/engine";
import type {
  EngineDeciderPort,
  IdentityPort,
  ProjectionPort,
  SeedAccessPort,
} from "../ports/index.js";
import { drawHmacSha256V1 } from "../randomness/hmac-sha256-v1.js";

export const systemClock = {
  now: () => new Date().toISOString(),
};

export const deterministicIdentityPort: IdentityPort = {
  allocate(kind, transactionId, localIndex, stableKey = "") {
    const digest = sha256Hex(
      `${kind}\u0000${transactionId}\u0000${localIndex}\u0000${stableKey}`,
    ).slice(0, 32);
    const prefix =
      kind === "death_pending_check"
        ? "pending_check"
        : kind === "death_physical_roll_nonce"
          ? "physical_roll_nonce"
          : kind;
    return `${prefix}_${digest}`;
  },
};

export const storedSeedAccess: SeedAccessPort = {
  readSeed: (store, campaignId) => store.readCampaignSeed(campaignId),
};

export const hmacRandomPort = { draw: drawHmacSha256V1 };

export const authoritativeEngineDecider: EngineDeciderPort = {
  decide: decideCommand,
};

export const emptyProjectionPort: ProjectionPort = {
  project: () => [],
};

export function legalActionIdFrom(
  identity: IdentityPort,
  transactionId: Parameters<IdentityPort["allocate"]>[1],
  stableKey: string,
): LegalActionId {
  return identity.allocate(
    "legal_action",
    transactionId,
    0,
    stableKey,
  ) as LegalActionId;
}

export function eventIdFrom(
  identity: IdentityPort,
  transactionId: Parameters<IdentityPort["allocate"]>[1],
  transactionIndex: number,
): EventId {
  return identity.allocate("event", transactionId, transactionIndex) as EventId;
}
