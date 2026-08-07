import { Type, type Static } from "@sinclair/typebox";
import { CharacterFoundationSchema } from "./characters.js";
import { strictObject } from "./envelopes.js";
import { StarterLoadoutIdSchema } from "./ids.js";
import { SignificantGearSelectionSlotsSchema } from "./domains/playable-characters.js";
import { SchemaVersionSchema } from "./versions.js";

export const StarterLoadoutSchema = strictObject({
  schema_version: SchemaVersionSchema,
  record_kind: Type.Literal("starter_loadout"),
  starter_loadout_id: StarterLoadoutIdSchema,
  foundation: CharacterFoundationSchema,
  significant_gear: SignificantGearSelectionSlotsSchema,
});

export type StarterLoadout = Static<typeof StarterLoadoutSchema>;
