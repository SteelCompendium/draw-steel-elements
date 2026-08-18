// Plan 07 Task 5 / F1 §6 step 2 — Characteristics: one of the final two elements of the
// D-wave migration (paired with Values Row; they share one CSS block), retiring the legacy
// CharacteristicsProcessor. After this pair, RegisterElements.ts registers nothing.
//
// Trivial static: no schema (the model's own parse is the validator, same as legacy), no
// serialize (nothing persists), no ref resolution (autoResolveRefs stays false — the block
// body is self-contained YAML). `parse` consumes the pipeline's pre-parsed PLAIN data
// (Characteristics.parse) — NOT the raw text; there is no SDK reader here (contrast
// feature/definition.ts).
//
// noClickShield stays UNSET (shield ON): the legacy CharacteristicsProcessor DID arm the
// capture-phase mousedown/pointerdown stop, so the pipeline's default shield is the
// byte-identical replacement (contrast values-row/definition.ts, whose processor never
// shielded).
import type { ElementDefinition } from '@/framework/registry';
import type { ElementChrome } from '@/framework/chrome/types';
import { Characteristics } from '@model/Characteristics';
import { CharacteristicsElementView } from './view';
import characteristicsExample from './example.yaml';

/**
 * SC-169 ROLLOUT wave 2 — the five scores ARE the element, and in Draw Steel they are
 * always read in one fixed order (Might, Agility, Reason, Intuition, Presence), so the
 * slash-separated line is the same line the open row shows, minus the headings:
 * "CHARACTERISTICS (2/1/0/2/-1)".
 */
const characteristicsChrome: ElementChrome<Characteristics> = {
	summary: ({ model }) => ({
		label: 'Characteristics',
		detail: [model.might, model.agility, model.reason, model.intuition, model.presence].join('/'),
	}),
};

export const characteristicsElement: ElementDefinition<Characteristics> = {
	id: 'characteristics',
	name: 'Characteristics',
	aliases: ['ds-char', 'ds-characteristics'],
	shape: 'static',
	parse: (data) => Characteristics.parse(data),
	autoResolveRefs: false,
	createView: (cx) => new CharacteristicsElementView(cx),
	chrome: characteristicsChrome,
	authoring: { example: characteristicsExample },
};
