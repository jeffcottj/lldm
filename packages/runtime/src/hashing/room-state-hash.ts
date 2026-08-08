import {
  ROOM_STATE_SCHEMA_VERSION,
  type RoomState,
  type RoomStateHash,
  canonicalJson,
  taggedSha256,
  validateRoomState,
} from "@lldm/contracts";

export function canonicalRoomStateJson(state: RoomState): string {
  const validated = validateRoomState(state);
  if (!validated.success)
    throw new Error("Room state failed canonical validation.");
  if (validated.value.room_state_schema_version !== ROOM_STATE_SCHEMA_VERSION)
    throw new Error("Unsupported room-state schema version.");
  return canonicalJson(validated.value);
}

export function hashRoomState(state: RoomState): RoomStateHash {
  return taggedSha256(canonicalRoomStateJson(state)) as RoomStateHash;
}
