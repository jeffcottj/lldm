import {
  PROTOCOL_VERSION,
  type RelayApprovalResult,
  type RelayCreateRoomResult,
  SCHEMA_VERSION,
} from "@lldm/contracts";
import type { RelayClientPort } from "./client.js";

export class FakeRelayClient implements RelayClientPort {
  #counter = 0;
  connected = true;
  readonly approved = new Map<string, string>();

  async createRoom(input: {
    readonly lifetime_seconds: number;
  }): Promise<RelayCreateRoomResult> {
    if (!this.connected) throw new Error("Fake relay is disconnected.");
    this.#counter += 1;
    const roomId =
      `room_fake_${this.#counter.toString().padStart(3, "0")}` as RelayCreateRoomResult["room_id"];
    return {
      schema_version: SCHEMA_VERSION,
      protocol_version: PROTOCOL_VERSION,
      room_id: roomId,
      appliance_token: `fake.appliance.token.${this.#counter.toString().padStart(8, "0")}`,
      invite_secret: `fake.invite.secret.${this.#counter.toString().padStart(8, "0")}`,
      host_bootstrap_proof: `fake.bootstrap.proof.${this.#counter.toString().padStart(8, "0")}`,
      expires_at: new Date(
        Date.now() + input.lifetime_seconds * 1000,
      ).toISOString(),
      join_url: `https://relay.invalid/room/${roomId}`,
      fallback_code: `F${this.#counter.toString().padStart(5, "0")}`,
    };
  }

  async approve(input: {
    readonly room_id: string;
    readonly appliance_token: string;
    readonly connection_id: string;
    readonly participant_id: string;
  }): Promise<RelayApprovalResult> {
    if (!this.connected) throw new Error("Fake relay is disconnected.");
    this.approved.set(input.participant_id, input.connection_id);
    return {
      schema_version: SCHEMA_VERSION,
      protocol_version: PROTOCOL_VERSION,
      room_id: input.room_id as RelayApprovalResult["room_id"],
      participant_id:
        input.participant_id as RelayApprovalResult["participant_id"],
      connection_id:
        input.connection_id as RelayApprovalResult["connection_id"],
      reconnect_token: `fake.reconnect.token.${input.participant_id}`,
      expires_at: new Date(Date.now() + 43_200_000).toISOString(),
    };
  }

  async revoke(input: { readonly participant_id: string }): Promise<void> {
    this.approved.delete(input.participant_id);
  }
}
