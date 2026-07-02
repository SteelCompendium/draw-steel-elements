// D1 Task 2 (Plan 03) / F1 §6 step "Skills" — model.ts: parse(data, raw) wraps the
// existing @model/Skills class VERBATIM (F3 "keep, renderer-agnostic"). The pipeline
// already validated `data` against SkillsSchema.yaml (def.schema, F1 §2.4 step 3) before
// calling this, so Skills.parse can construct the typed model directly — no re-validation,
// matching the legacy Skills.parseYaml's post-validate parse step, now centralized in the
// pipeline. `raw` (the block's original source text) is unused: Skills has no SDK reader
// that needs it.
import { Skills } from '@model/Skills';

export function parse(data: unknown, _raw: string): Skills {
	return Skills.parse(data as any);
}
