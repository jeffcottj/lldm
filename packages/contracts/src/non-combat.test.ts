import { describe, expect, it } from "vitest";
import {
  validateChallengeState,
  validateRitualState,
  validateRitualStartEligibility,
  validateSocialState,
  validateSocialStateTransition,
} from "./index.js";

function challenge(): Record<string, unknown> {
  return {
    schema_version: 1,
    record_kind: "challenge_state",
    challenge_id: "challenge_stormglass_001",
    definition: {
      content_definition_id: "content_challenge_stormglass_001",
      definition_revision: 1,
    },
    progress: { current: 0, maximum: 4 },
    danger: { current: 0, maximum: 3 },
    tie_rule: "resolved_with_cost",
    status: "active",
  };
}

function social(): Record<string, unknown> {
  return {
    schema_version: 1,
    record_kind: "social_state",
    npc_actor_id: "actor_mara_001",
    definition: {
      content_definition_id: "content_social_mara_001",
      definition_revision: 1,
    },
    motives: [
      {
        text: "Keep the river district supplied.",
        visibility: "public",
      },
    ],
    fears: [
      {
        text: "The old sluice will fail under another surge.",
        visibility: "host_control",
      },
    ],
    stance: "guarded",
    leverage: [],
    leverage_capacity: 2,
    hard_limits: [
      {
        social_limit_id: "social_limit_abandon_001",
        statement: {
          text: "Mara will not abandon the district.",
          visibility: "host_control",
        },
      },
    ],
  };
}

function ritual(): Record<string, unknown> {
  return {
    schema_version: 1,
    record_kind: "ritual_state",
    ritual_id: "ritual_echo_bridge_001",
    definition: {
      content_definition_id: "content_ritual_echo_bridge_001",
      definition_revision: 1,
    },
    status: "preparing",
    requirements: [{ kind: "participant_count", minimum: 2 }],
    costs: [
      { kind: "exertion", amount: 1 },
      { kind: "supply", amount: 1 },
    ],
    contributor_ids: [],
    paid_cost_count: 0,
    target: { kind: "place", place_tag: "the divided bridge" },
  };
}

describe("challenge contracts", () => {
  it("enforces bounded tracks and lifecycle status", () => {
    expect(validateChallengeState(challenge()).success).toBe(true);

    const overflow = challenge();
    overflow.progress = { current: 5, maximum: 4 };
    const overflowResult = validateChallengeState(overflow);
    expect(overflowResult.success).toBe(false);
    if (!overflowResult.success) {
      expect(
        overflowResult.issues.some(
          ({ code }) => code === "challenge.progress_overflow",
        ),
      ).toBe(true);
    }

    const closedAsActive = challenge();
    closedAsActive.progress = { current: 4, maximum: 4 };
    const lifecycle = validateChallengeState(closedAsActive);
    expect(lifecycle.success).toBe(false);
    if (!lifecycle.success) {
      expect(
        lifecycle.issues.some(
          ({ code }) => code === "challenge.lifecycle_mismatch",
        ),
      ).toBe(true);
    }
  });

  it("requires an explicit tie rule when both tracks fill", () => {
    const tied = challenge();
    tied.progress = { current: 4, maximum: 4 };
    tied.danger = { current: 3, maximum: 3 };
    tied.status = "resolved_with_cost";
    expect(validateChallengeState(tied).success).toBe(true);
  });
});

describe("social contracts", () => {
  it("bounds leverage and preserves visibility-bearing hard limits", () => {
    expect(validateSocialState(social()).success).toBe(true);

    const overflow = social();
    overflow.leverage_capacity = 0;
    overflow.leverage = [
      {
        leverage_id: "leverage_gate_001",
        label: "A repaired floodgate",
        visibility: "seat_private",
      },
    ];
    const result = validateSocialState(overflow);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.issues.some(({ code }) => code === "social.leverage_overflow"),
      ).toBe(true);
    }
  });

  it("rejects hard-limit override regardless of a requested stance", () => {
    const previous = social();
    const next = social();
    next.stance = "aligned";
    next.hard_limits = [
      {
        social_limit_id: "social_limit_abandon_001",
        statement: {
          text: "Mara can now be compelled to abandon the district.",
          visibility: "host_control",
        },
      },
    ];
    const result = validateSocialStateTransition(previous, next);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.issues.some(({ code }) => code === "social.hard_limit_override"),
      ).toBe(true);
    }
  });
});

describe("ritual contracts", () => {
  it("requires declared costs before ready or resolution state", () => {
    expect(validateRitualState(ritual()).success).toBe(true);
    const unpaid = ritual();
    unpaid.status = "ready";
    unpaid.paid_cost_count = 1;
    const result = validateRitualState(unpaid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.issues.some(({ code }) => code === "ritual.unpaid_cost"),
      ).toBe(true);
    }
  });

  it("rejects paid-cost overflow", () => {
    const overpaid = ritual();
    overpaid.paid_cost_count = 3;
    const result = validateRitualState(overpaid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.issues.some(({ code }) => code === "ritual.cost_overflow"),
      ).toBe(true);
    }
  });

  it("rejects unmet requirements and unpayable costs before resolution", () => {
    const result = validateRitualStartEligibility({
      requirements_met: false,
      costs_payable: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.map(({ code }) => code).sort()).toEqual([
        "ritual.unmet_requirements",
        "ritual.unpayable_cost",
      ]);
    }
  });
});
