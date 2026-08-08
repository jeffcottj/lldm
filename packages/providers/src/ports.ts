import type { NarrationBrief, NarrationSelection } from "@lldm/contracts";

export interface TextProviderPort {
  select(input: NarrationBrief): Promise<NarrationSelection>;
}
