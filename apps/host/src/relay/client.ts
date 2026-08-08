import {
  PROTOCOL_VERSION,
  type RelayApprovalResult,
  RelayApprovalResultSchema,
  type RelayCreateRoomResult,
  RelayCreateRoomResultSchema,
  SCHEMA_VERSION,
  validateValue,
} from "@lldm/contracts";

export interface RelayClientPort {
  createRoom(input: {
    readonly lifetime_seconds: number;
  }): Promise<RelayCreateRoomResult>;
  approve(input: {
    readonly room_id: string;
    readonly appliance_token: string;
    readonly connection_id: string;
    readonly participant_id: string;
  }): Promise<RelayApprovalResult>;
  revoke(input: {
    readonly room_id: string;
    readonly appliance_token: string;
    readonly participant_id: string;
  }): Promise<void>;
}

async function validatedJson(
  response: Response,
  schema: Parameters<typeof validateValue>[0],
) {
  if (!response.ok)
    throw new Error(
      `Relay request failed with safe HTTP status ${response.status}.`,
    );
  const value = validateValue(schema, await response.json());
  if (!value.success)
    throw new Error("Relay returned an incompatible response.");
  return value.value;
}

export class HttpRelayClient implements RelayClientPort {
  constructor(
    readonly baseUrl: string,
    readonly creationCredential: string,
  ) {}

  async createRoom(input: { readonly lifetime_seconds: number }) {
    return (await validatedJson(
      await fetch(`${this.baseUrl}/api/rooms`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-lldm-relay-secret": this.creationCredential,
        },
        body: JSON.stringify({
          schema_version: SCHEMA_VERSION,
          protocol_version: PROTOCOL_VERSION,
          requested_lifetime_seconds: input.lifetime_seconds,
        }),
      }),
      RelayCreateRoomResultSchema,
    )) as RelayCreateRoomResult;
  }

  async approve(input: {
    readonly room_id: string;
    readonly appliance_token: string;
    readonly connection_id: string;
    readonly participant_id: string;
  }) {
    return (await validatedJson(
      await fetch(
        `${this.baseUrl}/api/rooms/${encodeURIComponent(input.room_id)}/approve`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${input.appliance_token}`,
          },
          body: JSON.stringify({
            connection_id: input.connection_id,
            participant_id: input.participant_id,
          }),
        },
      ),
      RelayApprovalResultSchema,
    )) as RelayApprovalResult;
  }

  async revoke(input: {
    readonly room_id: string;
    readonly appliance_token: string;
    readonly participant_id: string;
  }): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/api/rooms/${encodeURIComponent(input.room_id)}/revoke`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${input.appliance_token}`,
        },
        body: JSON.stringify({ participant_id: input.participant_id }),
      },
    );
    if (!response.ok)
      throw new Error(
        `Relay revocation failed with safe HTTP status ${response.status}.`,
      );
  }
}
