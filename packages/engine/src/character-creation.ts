import {
  type CharacterFoundation,
  type ValidationResult,
  validateCharacterFoundation,
} from "@lldm/contracts";

export const STARTING_ATTRIBUTE_ALLOCATION = Object.freeze([
  2, 1, 1, 0,
] as const);
export const STARTING_DISCIPLINE_ALLOCATION = Object.freeze([
  2, 1, 1, 1, 0, 0, 0, 0,
] as const);

export function validateStartingCharacter(
  character: CharacterFoundation,
): ValidationResult<CharacterFoundation> {
  return validateCharacterFoundation(character);
}
