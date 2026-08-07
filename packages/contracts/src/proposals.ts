import { Type, type Static } from "@sinclair/typebox";
import { ProposeCheckProposalSchema } from "./checks.js";

export const BoundedProposalSchema = Type.Union([ProposeCheckProposalSchema]);

export type BoundedProposal = Static<typeof BoundedProposalSchema>;
