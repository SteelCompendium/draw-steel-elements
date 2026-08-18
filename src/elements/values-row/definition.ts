// Plan 07 Task 5 / F1 §6 step 2 — Values Row: one of the final two elements of the D-wave
// migration (paired with Characteristics; they share one CSS block), retiring the legacy
// ValuesRowProcessor. After this pair, RegisterElements.ts registers nothing.
//
// Trivial static: no schema (the model's own parse is the validator, same as legacy), no
// serialize (nothing persists), no ref resolution (autoResolveRefs stays false — the block
// body is self-contained YAML). `parse` consumes the pipeline's pre-parsed PLAIN data
// (KeyValuePairs.parse) — NOT the raw text; there is no SDK reader here (contrast
// feature/definition.ts).
//
// `noClickShield: true` preserves the legacy behavior exactly — ValuesRowProcessor (unlike
// CharacteristicsProcessor et al.) never armed the capture-phase mousedown/pointerdown
// shield, so opting out keeps behavior byte-identical rather than introducing a new
// listener no user-facing bug ever required (same rationale as horizontal-rule).
import type { ElementDefinition } from '@/framework/registry';
import type { ElementChrome } from '@/framework/chrome/types';
import { KeyValuePairs } from '@model/KeyValuePairs';
import { ValuesRowElementView } from './view';
import valuesRowExample from './example.yaml';

/**
 * SC-169 ROLLOUT wave 2 — a values row is already one line, so its folded form saves no
 * height; it opts in for CONSISTENCY (every card-like element carries the same panel, and
 * the panel is where the edit affordance and every future item live). The detail is the
 * pair count, worded for the same reason party's is.
 */
const valuesRowChrome: ElementChrome<KeyValuePairs> = {
	summary: ({ model }) => ({
		label: 'Values',
		detail: `${model.values.length} ${model.values.length === 1 ? 'value' : 'values'}`,
	}),
};

export const valuesRowElement: ElementDefinition<KeyValuePairs> = {
	id: 'values-row',
	name: 'Values row',
	aliases: ['ds-vr', 'ds-value-row', 'ds-values-row'],
	shape: 'static',
	parse: (data) => KeyValuePairs.parse(data),
	autoResolveRefs: false,
	noClickShield: true,
	createView: (cx) => new ValuesRowElementView(cx),
	chrome: valuesRowChrome,
	authoring: { example: valuesRowExample },
};
