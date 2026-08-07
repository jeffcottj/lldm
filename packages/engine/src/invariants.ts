import {
  type GameState,
  type ValidationResult,
  validateGameState,
} from "@lldm/contracts";

export function validateStateInvariants(
  state: unknown,
): ValidationResult<GameState> {
  return validateGameState(state);
}

export function assertStateInvariants(state: unknown): GameState {
  const result = validateStateInvariants(state);
  if (!result.success) {
    const detail = result.issues
      .map(({ path, code }) => `${path}:${code}`)
      .join(", ");
    throw new Error(`Invalid mechanical state: ${detail}`);
  }
  return result.value;
}
