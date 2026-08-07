import {
  type CampaignId,
  type EventId,
  type LegalActionId,
  sha256Hex,
  type TransactionId,
} from "@lldm/contracts";
import {
  PHASE_1_CONTENT_MANIFEST_HASH,
  PHASE_1_DEFINITIONS,
} from "@lldm/content";
import { decideCommand } from "@lldm/engine";
import type {
  EngineDeciderPort,
  IdentityPort,
  ProjectionPort,
  SeedAccessPort,
} from "../ports/index.js";
import { drawHmacSha256V1 } from "../randomness/hmac-sha256-v1.js";
import { phase1ProjectionPort } from "./projections.js";

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

export const phase1ContentManifestPort = {
  resolve: (hash: string) =>
    hash === PHASE_1_CONTENT_MANIFEST_HASH
      ? {
          content_manifest_hash: PHASE_1_CONTENT_MANIFEST_HASH,
          definitions: PHASE_1_DEFINITIONS,
        }
      : null,
};

export { PHASE_1_CONTENT_MANIFEST_HASH };

export const emptyProjectionPort: ProjectionPort = {
  project: () => [],
};

export const authoritativeProjectionPort = phase1ProjectionPort;

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

export function legalActionIdForCampaign(
  identity: IdentityPort,
  campaignId: CampaignId,
  stableKey: string,
): LegalActionId {
  const scope =
    `transaction_legal_actions_${sha256Hex(campaignId).slice(0, 24)}` as TransactionId;
  return identity.allocate(
    "legal_action",
    scope,
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
