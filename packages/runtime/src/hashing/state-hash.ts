import {
  canonicalJson,
  type GameState,
  type StateHash,
  taggedSha256,
  validateGameState,
} from "@lldm/contracts";

export function canonicalStateJson(state: GameState): string {
  const validated = validateGameState(state);
  if (!validated.success) {
    throw new Error("Mechanical state failed canonical hash validation.");
  }
  return canonicalJson(validated.value);
}

export function hashGameState(state: GameState): StateHash {
  return taggedSha256(canonicalStateJson(state)) as StateHash;
}
