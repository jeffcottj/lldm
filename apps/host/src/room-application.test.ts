import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ClientCommand,
  type ClientCommandIntent,
  PROTOCOL_VERSION,
  SCHEMA_VERSION,
} from "@lldm/contracts";
import { migrateSqliteDatabase } from "@lldm/runtime";
import { afterEach, describe, expect, it } from "vitest";
import type { HostConfig } from "./config.js";
import { FakeRelayClient } from "./relay/fake.js";
import { RoomApplication } from "./room-application.js";
import { buildHostServer } from "./server.js";

const directories: string[] = [];

function fixture() {
  const dataPath = mkdtempSync(join(tmpdir(), "lldm-host-phase2-"));
  directories.push(dataPath);
  const databasePath = join(dataPath, "lldm.sqlite");
  migrateSqliteDatabase({
    database_path: databasePath,
    committed_at: "2026-08-07T21:00:00.000Z",
  });
  const config: HostConfig = {
    bind: "127.0.0.1",
    port: 3210,
    database_path: databasePath,
    data_path: dataPath,
    web_assets_path: join(dataPath, "missing-web-assets"),
    public_pwa_url: "https://relay.invalid",
    relay_url: "https://relay.invalid",
    relay_credential: "fake-relay-credential-phase2",
    room_lifetime_seconds: 3_600,
    rehearsal_enabled: true,
    test_mode: true,
  };
  return { dataPath, databasePath, config, relay: new FakeRelayClient() };
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function clientCommand(input: {
  readonly room_id: string;
  readonly connection_id: string;
  readonly participant_id?: string;
  readonly view_revision: number;
  readonly key: string;
  readonly intent: ClientCommandIntent;
  readonly seat_id?: string;
}): ClientCommand {
  return {
    schema_version: SCHEMA_VERSION,
    protocol_version: PROTOCOL_VERSION,
    client_command_id: `client_command_host_${input.key}` as never,
    room_id: input.room_id as never,
    connection_id: input.connection_id as never,
    ...(input.participant_id === undefined
      ? {}
      : { participant_id: input.participant_id as never }),
    ...(input.seat_id === undefined ? {} : { seat_id: input.seat_id as never }),
    expected_view_revision: input.view_revision,
    intent: input.intent,
  };
}

describe("Fastify appliance and durable room composition", () => {
  it("serves only the local TV lifecycle and forbids normal fixed-seed creation", async () => {
    const { config, relay } = fixture();
    const host = await buildHostServer({
      config: { ...config, test_mode: false },
      relay,
    });
    await expect(
      host.server
        .inject({ method: "GET", url: "/healthz" })
        .then(({ json }) => json()),
    ).resolves.toMatchObject({ status: "alive", ready: true });
    const forbidden = await host.server.inject({
      method: "POST",
      url: "/api/tv/runs",
      payload: { mode: "normal", fixture_seed_hex: "0".repeat(64) },
    });
    expect(forbidden.statusCode).toBe(400);
    expect(forbidden.json()).toMatchObject({ status: "fixed_seed_forbidden" });
    const created = await host.server.inject({
      method: "POST",
      url: "/api/tv/runs",
      payload: { mode: "normal" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ fallback_code: "F00001" });
    const diagnostics = await host.server.inject({
      method: "GET",
      url: "/api/diagnostics",
    });
    expect(JSON.stringify(diagnostics.json())).not.toContain("credential");
    expect(JSON.stringify(diagnostics.json())).not.toContain("invite_secret");
    const tv = await host.server.inject({ method: "GET", url: "/tv" });
    expect(tv.statusCode).toBe(200);
    expect(tv.body).toContain("LLDM is starting");
    await host.close();
  });

  it("bootstraps the first host, claims three rehearsal heroes, materializes only those heroes, and resumes replay", async () => {
    const { config, relay } = fixture();
    let application = new RoomApplication(config, relay);
    const created = await application.createRun("rehearsal", "11".repeat(32));
    const participantId = "participant_host_phase2_001";
    const connectionId = "connection_host_phase2_001";
    const binding = {
      room_id: created.relay_room_id as never,
      connection_id: connectionId as never,
      participant_id: participantId as never,
    };
    let state = application.roomForRelay(created.relay_room_id)!;
    const joined = await application.submitClient(
      clientCommand({
        room_id: created.relay_room_id,
        connection_id: connectionId,
        view_revision: 0,
        key: "join_phase2_001",
        intent: { kind: "request_join", payload: { display_name: "River" } },
      }),
      binding,
    );
    expect(joined.status).toBe("accepted");
    state = application.roomForRelay(created.relay_room_id)!;
    const bootstrapped = await application.submitClient(
      clientCommand({
        room_id: created.relay_room_id,
        connection_id: connectionId,
        view_revision: state.view_revision,
        key: "bootstrap_phase2_001",
        intent: {
          kind: "recover_player_host",
          payload: { proof: created.host_bootstrap_proof },
        },
      }),
      binding,
    );
    expect(bootstrapped.status).toBe("accepted");

    for (let index = 0; index < 3; index += 1) {
      state = application.roomForRelay(created.relay_room_id)!;
      const seat = state.seats[index]!;
      const result = await application.submitClient(
        clientCommand({
          room_id: created.relay_room_id,
          connection_id: connectionId,
          participant_id: participantId,
          view_revision: state.view_revision,
          key: `claim_phase2_00${index + 1}`,
          seat_id: seat.seat_id,
          intent: {
            kind: "claim_hero",
            payload: {
              seat_id: seat.seat_id,
              starter_loadout_id: seat.starter_loadout_id,
            },
          },
        }),
        binding,
      );
      expect(result.status).toBe("accepted");
    }
    state = application.roomForRelay(created.relay_room_id)!;
    const started = await application.submitClient(
      clientCommand({
        room_id: created.relay_room_id,
        connection_id: connectionId,
        participant_id: participantId,
        view_revision: state.view_revision,
        key: "start_phase2_001",
        intent: { kind: "start_run", payload: {} },
      }),
      binding,
    );
    expect(started.status).toBe("accepted");
    state = application.roomForRelay(created.relay_room_id)!;
    expect(state.status).toBe("active");
    expect(state.mechanical_revision).toBeGreaterThanOrEqual(3);
    const deliveries = application.participantDelivery(
      created.room_session_id,
      participantId as never,
      0,
      true,
    );
    const snapshot = deliveries[0];
    if (
      snapshot?.delivery_kind !== "snapshot" ||
      snapshot.view.view_kind !== "participant_private"
    )
      throw new Error("Private snapshot missing.");
    expect(snapshot.view.assigned_seats).toHaveLength(3);
    expect(
      snapshot.view.assigned_seats.every(
        ({ mechanical }) => mechanical.payload.character !== null,
      ),
    ).toBe(true);
    expect(
      JSON.stringify(
        application.publicDelivery(created.room_session_id, 0, true),
      ),
    ).not.toContain("submission_nonce");
    const beforeChoiceRevision = state.view_revision;
    const choice = await application.submitClient(
      clientCommand({
        room_id: created.relay_room_id,
        connection_id: connectionId,
        participant_id: participantId,
        view_revision: state.view_revision,
        key: "party_choice_phase2_001",
        intent: {
          kind: "record_party_choice",
          payload: { option_id: "guided_option_enter_controls_001" as never },
        },
      }),
      binding,
    );
    expect(choice.status).toBe("accepted");
    const privateAfterChoice = application.participantDelivery(
      created.room_session_id,
      participantId as never,
      beforeChoiceRevision,
      false,
    );
    const privateBytes = JSON.stringify(privateAfterChoice);
    expect(privateBytes).toContain("strain lines point away");
    expect(
      JSON.stringify(
        application.publicDelivery(
          created.room_session_id,
          beforeChoiceRevision,
          false,
        ),
      ),
    ).not.toContain("strain lines point away");
    expect(
      JSON.stringify(
        application.playerHostDelivery(
          created.room_session_id,
          participantId as never,
          beforeChoiceRevision,
          false,
        ),
      ),
    ).not.toContain("strain lines point away");

    state = application.roomForRelay(created.relay_room_id)!;
    expect(state.current_beat_id).toBe("guided_beat_optional_spark_001");
    const activeSeat = state.seats[0]!;
    const simulatedApproach = await application.submitClient(
      clientCommand({
        room_id: created.relay_room_id,
        connection_id: connectionId,
        participant_id: participantId,
        view_revision: state.view_revision,
        key: "optional_spark_declined_001",
        seat_id: activeSeat.seat_id,
        intent: {
          kind: "choose_spark",
          payload: { seat_id: activeSeat.seat_id, invoke_spark: false },
        },
      }),
      binding,
    );
    expect(simulatedApproach.status).toBe("accepted");
    state = application.roomForRelay(created.relay_room_id)!;
    expect(state.current_beat_id).toBe("guided_beat_challenge_001");

    const challenge = await application.submitClient(
      clientCommand({
        room_id: created.relay_room_id,
        connection_id: connectionId,
        participant_id: participantId,
        view_revision: state.view_revision,
        key: "challenge_route_001",
        seat_id: activeSeat.seat_id,
        intent: {
          kind: "choose_guided_option",
          payload: {
            seat_id: activeSeat.seat_id,
            option_id: "guided_option_challenge_route_001" as never,
          },
        },
      }),
      binding,
    );
    expect(challenge.status).toBe("accepted");
    state = application.roomForRelay(created.relay_room_id)!;
    expect(state.current_beat_id).toBe("guided_beat_ritual_001");

    const ritual = await application.submitClient(
      clientCommand({
        room_id: created.relay_room_id,
        connection_id: connectionId,
        participant_id: participantId,
        view_revision: state.view_revision,
        key: "ritual_reverse_001",
        seat_id: activeSeat.seat_id,
        intent: {
          kind: "choose_guided_option",
          payload: {
            seat_id: activeSeat.seat_id,
            option_id: "guided_option_ritual_reverse_001" as never,
          },
        },
      }),
      binding,
    );
    expect(ritual.status).toBe("accepted");
    state = application.roomForRelay(created.relay_room_id)!;
    expect(state.current_beat_id).toBe("guided_beat_combat_001");

    const withdrawal = await application.submitClient(
      clientCommand({
        room_id: created.relay_room_id,
        connection_id: connectionId,
        participant_id: participantId,
        view_revision: state.view_revision,
        key: "combat_withdrawal_001",
        intent: { kind: "withdraw_combat", payload: {} },
      }),
      binding,
    );
    expect(withdrawal.status).toBe("accepted");
    const completedDelivery = application.publicDelivery(
      created.room_session_id,
      0,
      true,
    )[0];
    if (
      completedDelivery?.delivery_kind !== "snapshot" ||
      completedDelivery.view.view_kind !== "public_tv"
    )
      throw new Error("Completed public snapshot missing.");
    expect(completedDelivery.view.current_beat_id).toBe(
      "guided_beat_conclusion_withdrawal_001",
    );
    expect(completedDelivery.view.room_status).toBe("completed");
    const finalRoomRevision = completedDelivery.view.room_revision;
    const finalMechanicalRevision = completedDelivery.view.mechanical_revision;
    application.close();

    application = new RoomApplication(config, relay);
    const resumed = await application.resume(created.room_session_id);
    expect(resumed.state.room_revision).toBe(finalRoomRevision);
    expect(resumed.state.mechanical_revision).toBe(finalMechanicalRevision);
    expect(resumed.state.conclusion).toBe("withdrawal");
    expect(resumed.recovered).toHaveLength(0);
    application.close();
  });

  it("transfers and recovers player-host authority while preserving seat reconnect state", async () => {
    const { config, relay } = fixture();
    const application = new RoomApplication(config, relay);
    const created = await application.createRun("rehearsal", "33".repeat(32));
    const identities = [
      {
        participantId: "participant_transfer_alpha_001",
        connectionId: "connection_transfer_alpha_001",
      },
      {
        participantId: "participant_transfer_beta_001",
        connectionId: "connection_transfer_beta_001",
      },
    ];
    const send = async (
      index: number,
      key: string,
      intent: ClientCommandIntent,
      seatId?: string,
    ) => {
      const identity = identities[index];
      const current = application.roomForRelay(created.relay_room_id);
      if (identity === undefined || current === null)
        throw new Error("Transfer-room identity or state is missing.");
      return await application.submitClient(
        clientCommand({
          room_id: created.relay_room_id,
          connection_id: identity.connectionId,
          participant_id: identity.participantId,
          view_revision: current.view_revision,
          key,
          intent,
          ...(seatId === undefined ? {} : { seat_id: seatId }),
        }),
        {
          room_id: created.relay_room_id as never,
          connection_id: identity.connectionId as never,
          participant_id: identity.participantId as never,
        },
      );
    };

    expect(
      (
        await send(0, "transfer_join_alpha", {
          kind: "request_join",
          payload: { display_name: "Alpha" },
        })
      ).status,
    ).toBe("accepted");
    expect(
      (
        await send(0, "transfer_bootstrap_alpha", {
          kind: "recover_player_host",
          payload: { proof: created.host_bootstrap_proof },
        })
      ).status,
    ).toBe("accepted");
    expect(
      (
        await send(1, "transfer_join_beta", {
          kind: "request_join",
          payload: { display_name: "Beta" },
        })
      ).status,
    ).toBe("accepted");
    expect(
      (
        await send(0, "transfer_approve_beta", {
          kind: "approve_participant",
          payload: {
            participant_id: identities[1]?.participantId as never,
          },
        })
      ).status,
    ).toBe("accepted");
    const beta = identities[1];
    if (beta === undefined) throw new Error("Beta identity is missing.");
    const firstApproval = await application.approveRelayParticipant(
      created.relay_room_id,
      beta.participantId as never,
      beta.connectionId,
    );
    expect(firstApproval.reconnect_token).toContain(beta.participantId);

    for (let index = 0; index < 2; index += 1) {
      const current = application.roomForRelay(created.relay_room_id);
      const seat = current?.seats[index];
      if (seat === undefined) throw new Error("Transfer-room seat is missing.");
      expect(
        (
          await send(
            index,
            `transfer_claim_${index}`,
            {
              kind: "claim_hero",
              payload: {
                seat_id: seat.seat_id,
                starter_loadout_id: seat.starter_loadout_id,
              },
            },
            seat.seat_id,
          )
        ).status,
      ).toBe("accepted");
    }
    expect(
      (
        await send(0, "transfer_to_beta", {
          kind: "transfer_player_host",
          payload: { participant_id: beta.participantId as never },
        })
      ).status,
    ).toBe("accepted");
    expect(
      application.roomForRelay(created.relay_room_id)
        ?.player_host_participant_id,
    ).toBe(beta.participantId);
    expect(
      (
        await send(0, "former_host_suspend", {
          kind: "suspend_run",
          payload: {},
        })
      ).status,
    ).toBe("rejected");

    const recoveryCode = application.issueHostRecoveryCode(
      created.room_session_id,
    );
    expect(
      (
        await send(0, "recover_alpha", {
          kind: "recover_player_host",
          payload: { proof: recoveryCode },
        })
      ).status,
    ).toBe("accepted");
    expect(
      (
        await send(1, "reuse_recovery_code", {
          kind: "recover_player_host",
          payload: { proof: recoveryCode },
        })
      ).status,
    ).toBe("rejected");

    application.noteParticipantConnection(
      created.relay_room_id,
      beta.participantId as never,
      false,
    );
    expect(
      application
        .roomForRelay(created.relay_room_id)
        ?.recoveries.some(({ status }) => status === "grace"),
    ).toBe(true);
    const replacementConnection = "connection_transfer_beta_002";
    const replacementApproval = await application.approveRelayParticipant(
      created.relay_room_id,
      beta.participantId as never,
      replacementConnection,
    );
    expect(replacementApproval.connection_id).toBe(replacementConnection);
    application.noteParticipantConnection(
      created.relay_room_id,
      beta.participantId as never,
      true,
    );
    expect(
      application.roomForRelay(created.relay_room_id)?.recoveries,
    ).toHaveLength(0);
    application.close();
  });

  for (const partySize of [3, 4, 5] as const) {
    it(`runs the normal ${partySize}-participant room through its authored combat variant`, async () => {
      const { config, relay } = fixture();
      const application = new RoomApplication(config, relay);
      const created = await application.createRun(
        "normal",
        partySize.toString(16).padStart(2, "0").repeat(32),
      );
      const participants = Array.from({ length: partySize }, (_, index) => ({
        participantId: `participant_normal_${partySize}_${index + 1}`,
        connectionId: `connection_normal_${partySize}_${index + 1}`,
      }));
      const send = async (
        participantIndex: number,
        key: string,
        intent: ClientCommandIntent,
        seatId?: string,
      ) => {
        const identity = participants[participantIndex];
        const current = application.roomForRelay(created.relay_room_id);
        if (identity === undefined || current === null)
          throw new Error("Normal-room test identity or state is missing.");
        const binding = {
          room_id: created.relay_room_id as never,
          connection_id: identity.connectionId as never,
          participant_id: identity.participantId as never,
        };
        return await application.submitClient(
          clientCommand({
            room_id: created.relay_room_id,
            connection_id: identity.connectionId,
            participant_id: identity.participantId,
            view_revision: current.view_revision,
            key: `${partySize}_${key}`,
            intent,
            ...(seatId === undefined ? {} : { seat_id: seatId }),
          }),
          binding,
        );
      };

      expect(
        (
          await send(0, "join_host", {
            kind: "request_join",
            payload: { display_name: "Host Player" },
          })
        ).status,
      ).toBe("accepted");
      expect(
        (
          await send(0, "bootstrap_host", {
            kind: "recover_player_host",
            payload: { proof: created.host_bootstrap_proof },
          })
        ).status,
      ).toBe("accepted");

      for (let index = 1; index < partySize; index += 1) {
        const participant = participants[index];
        if (participant === undefined)
          throw new Error("Normal-room participant is missing.");
        expect(
          (
            await send(index, `join_${index}`, {
              kind: "request_join",
              payload: { display_name: `Player ${index + 1}` },
            })
          ).status,
        ).toBe("accepted");
        expect(
          (
            await send(0, `approve_${index}`, {
              kind: "approve_participant",
              payload: { participant_id: participant.participantId as never },
            })
          ).status,
        ).toBe("accepted");
        await application.approveRelayParticipant(
          created.relay_room_id,
          participant.participantId as never,
          participant.connectionId,
        );
      }

      for (let index = 0; index < partySize; index += 1) {
        const current = application.roomForRelay(created.relay_room_id);
        const seat = current?.seats[index];
        if (seat === undefined) throw new Error("Starter seat is missing.");
        expect(
          (
            await send(
              index,
              `claim_${index}`,
              {
                kind: "claim_hero",
                payload: {
                  seat_id: seat.seat_id,
                  starter_loadout_id: seat.starter_loadout_id,
                },
              },
              seat.seat_id,
            )
          ).status,
        ).toBe("accepted");
      }

      const unclaimed = application.roomForRelay(created.relay_room_id)?.seats[
        partySize
      ];
      if (unclaimed === undefined)
        throw new Error("One starter must remain available.");
      const secondSeat = await send(
        0,
        "normal_second_seat",
        {
          kind: "claim_hero",
          payload: {
            seat_id: unclaimed.seat_id,
            starter_loadout_id: unclaimed.starter_loadout_id,
          },
        },
        unclaimed.seat_id,
      );
      expect(secondSeat).toMatchObject({
        status: "rejected",
        code: "normal_mode_seat_limit",
      });

      expect(
        (await send(0, "start", { kind: "start_run", payload: {} })).status,
      ).toBe("accepted");
      for (let index = 0; index < partySize; index += 1) {
        const participant = participants[index];
        if (participant === undefined)
          throw new Error("Participant projection identity is missing.");
        const delivery = application.participantDelivery(
          created.room_session_id,
          participant.participantId as never,
          0,
          true,
        )[0];
        if (
          delivery?.delivery_kind !== "snapshot" ||
          delivery.view.view_kind !== "participant_private"
        )
          throw new Error("Normal participant snapshot is missing.");
        expect(delivery.view.assigned_seats).toHaveLength(1);
        expect(delivery.view.supply).toBe(partySize);
        expect(
          application.participantDelivery(
            created.room_session_id,
            participant.participantId as never,
            delivery.view.view_revision,
          ),
        ).toEqual([]);
      }

      expect(
        (
          await send(0, "opening_choice", {
            kind: "record_party_choice",
            payload: {
              option_id: "guided_option_enter_controls_001" as never,
            },
          })
        ).status,
      ).toBe("accepted");
      const activeSeat = application.roomForRelay(created.relay_room_id)
        ?.seats[0];
      if (activeSeat === undefined)
        throw new Error("Active guided seat is missing.");
      expect(
        (
          await send(
            0,
            "optional_spark",
            {
              kind: "choose_spark",
              payload: { seat_id: activeSeat.seat_id, invoke_spark: false },
            },
            activeSeat.seat_id,
          )
        ).status,
      ).toBe("accepted");
      expect(
        (
          await send(
            0,
            "challenge",
            {
              kind: "choose_guided_option",
              payload: {
                seat_id: activeSeat.seat_id,
                option_id: "guided_option_challenge_route_001" as never,
              },
            },
            activeSeat.seat_id,
          )
        ).status,
      ).toBe("accepted");
      expect(
        (
          await send(
            0,
            "ritual",
            {
              kind: "choose_guided_option",
              payload: {
                seat_id: activeSeat.seat_id,
                option_id: "guided_option_ritual_reverse_001" as never,
              },
            },
            activeSeat.seat_id,
          )
        ).status,
      ).toBe("accepted");

      const publicCombat = application.publicDelivery(
        created.room_session_id,
        0,
        true,
      )[0];
      if (
        publicCombat?.delivery_kind !== "snapshot" ||
        publicCombat.view.view_kind !== "public_tv"
      )
        throw new Error("Public combat snapshot is missing.");
      expect(publicCombat.view.current_beat_id).toBe("guided_beat_combat_001");
      expect(publicCombat.view.mechanical.payload.combat?.combat_id).toBe(
        `combat_floodgate_party_${partySize}_001`,
      );
      expect(
        publicCombat.view.mechanical.payload.combat?.participants,
      ).toHaveLength(partySize + 2);
      expect(publicCombat.view.map_layout).not.toBeNull();

      expect(
        (
          await send(0, "withdraw", {
            kind: "withdraw_combat",
            payload: {},
          })
        ).status,
      ).toBe("accepted");
      const final = application.publicDelivery(
        created.room_session_id,
        0,
        true,
      )[0];
      if (
        final?.delivery_kind !== "snapshot" ||
        final.view.view_kind !== "public_tv"
      )
        throw new Error("Completed normal-room snapshot is missing.");
      expect(final.view.room_status).toBe("completed");
      expect(final.view.current_beat_id).toBe(
        "guided_beat_conclusion_withdrawal_001",
      );
      application.close();
    });
  }
});
