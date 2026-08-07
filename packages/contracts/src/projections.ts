import { Type, type Static } from "@sinclair/typebox";
import { CheckPreviewProjectionSchema } from "./checks.js";

export const ProjectionSchema = Type.Union([CheckPreviewProjectionSchema]);

export type Projection = Static<typeof ProjectionSchema>;
