import {
  NarrationBriefSchema,
  NarrationSelectionSchema,
  SCHEMA_VERSION,
  type NarrationBrief,
  type NarrationSelection,
  validateValue,
} from "@lldm/contracts";
import type { TextProviderPort } from "./ports.js";

export interface FakeTextProviderOptions {
  readonly delay_ms?: number;
  readonly fail?: boolean;
}

export class FakeTextProvider implements TextProviderPort {
  readonly #options: FakeTextProviderOptions;

  constructor(options: FakeTextProviderOptions = {}) {
    this.#options = options;
  }

  async select(input: NarrationBrief): Promise<NarrationSelection> {
    const brief = validateValue(NarrationBriefSchema, input);
    if (!brief.success) throw new Error("Narration brief failed validation.");
    if ((this.#options.delay_ms ?? 0) > 0) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, this.#options.delay_ms),
      );
    }
    if (this.#options.fail) throw new Error("Injected fake provider failure.");
    const selected = validateValue(NarrationSelectionSchema, {
      schema_version: SCHEMA_VERSION,
      template_id: brief.value.allowed_template_ids[0],
    });
    if (!selected.success) throw new Error("Fake selection failed validation.");
    return selected.value;
  }
}

export function deterministicFallbackSentence(input: NarrationBrief): string {
  return input.fallback_text;
}
