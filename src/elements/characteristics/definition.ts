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
import { Characteristics } from '@model/Characteristics';
import { CharacteristicsElementView } from './view';

export const characteristicsElement: ElementDefinition<Characteristics> = {
	id: 'characteristics',
	name: 'Characteristics',
	aliases: ['ds-char', 'ds-characteristics'],
	shape: 'static',
	parse: (data) => Characteristics.parse(data),
	autoResolveRefs: false,
	createView: (cx) => new CharacteristicsElementView(cx),
};
