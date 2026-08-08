import {
  type GuidedBeat,
  type GuidedPresentationManifest,
  type NarrationBrief,
  SCHEMA_VERSION,
} from "@lldm/contracts";
import {
  deterministicFallbackSentence,
  type TextProviderPort,
} from "@lldm/providers";

export async function selectNarration(input: {
  readonly provider: TextProviderPort;
  readonly manifest: GuidedPresentationManifest;
  readonly beat: GuidedBeat;
  readonly committed_fact_codes: readonly string[];
}): Promise<{
  readonly template_id: string;
  readonly text: string;
  readonly fallback_used: boolean;
}> {
  const templateId = `template_${input.beat.beat_id}`;
  const brief: NarrationBrief = {
    schema_version: SCHEMA_VERSION,
    committed_fact_codes: [...input.committed_fact_codes],
    allowed_template_ids: [templateId],
    fallback_text: input.beat.public_text.slice(0, 240),
  };
  try {
    const selection = await input.provider.select(brief);
    const template = input.manifest.narration_templates.find(
      ({ template_id }) => template_id === selection.template_id,
    );
    if (
      template === undefined ||
      !brief.allowed_template_ids.includes(selection.template_id)
    )
      throw new Error("Provider selected a disallowed template.");
    return {
      template_id: template.template_id,
      text: template.text,
      fallback_used: false,
    };
  } catch {
    return {
      template_id: templateId,
      text: deterministicFallbackSentence(brief),
      fallback_used: true,
    };
  }
}
