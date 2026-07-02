// D1 Task 3 (Plan 03) / F1 §6 step "Stamina Bar" — model.ts: parse(data, raw) wraps the
// existing @model/StaminaBar class VERBATIM (F3 "keep, renderer-agnostic" — same convention
// as elements/skills/model.ts). The pipeline already validated `data` against
// StaminaBarSchema.yaml (def.schema, F1 §2.4 step 3) before calling this, so
// StaminaBar.parse can construct the typed model directly — no re-validation, matching the
// legacy StaminaBar.parseYaml's post-validate parse step, now centralized in the pipeline.
// `raw` (the block's original source text) is unused: StaminaBar has no SDK reader that
// needs it.
//
// serialize(model): the BYTE-COMPAT boundary (D1 spec §"Step 3"/F1 §6). The legacy write
// path (CodeBlocks.updateStaminaBar -> updateCodeBlock -> updateMarkdownCodeBlock) does
// exactly `stringifyYaml(data).trim()` where `data` IS the StaminaBar class instance
// (CodeBlocks.updateStaminaBar(app, data: StaminaBar, ctx)) — reusing the SAME class
// instance shape here (rather than building a fresh DTO) is itself the compatibility
// guarantee: field set + insertion order (collapsible, collapse_default, max_stamina,
// current_stamina, temp_stamina, height, style) fall out of StaminaBar's own constructor
// assignment order, unchanged. `.trim()` matches the legacy writer exactly and is also
// required by ReadingModeBlockHost.replaceSource, which does
// `newSource.split('\n')` — an untrimmed trailing "\n" from stringifyYaml would otherwise
// splice in a spurious blank line before the closing fence.
import { stringifyYaml } from 'obsidian';
import { StaminaBar } from '@model/StaminaBar';

export function parse(data: unknown, _raw: string): StaminaBar {
	return StaminaBar.parse(data as any);
}

export function serialize(model: StaminaBar): string {
	return stringifyYaml(model).trim();
}
