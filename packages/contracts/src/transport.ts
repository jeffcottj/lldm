import { Type, type Static } from "@sinclair/typebox";
import { CheckPreviewTransportMessageSchema } from "./checks.js";

export const TransportMessageSchema = Type.Union([
  CheckPreviewTransportMessageSchema,
]);

export type TransportMessage = Static<typeof TransportMessageSchema>;
