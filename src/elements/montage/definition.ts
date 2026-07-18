// D8 Task 6 (spec §4) — Montage Test tracker on Framework v2. Persisted shape; NO
// compendium dep, NO schema (a brand-new element with no legacy predecessor to match —
// same convention as encounter/negotiation/counter: validation is skipped by the
// pipeline when schema is omitted, F1 §2.4 step 3).
import type { ElementDefinition } from '@/framework/registry';
import type { MontageModel } from './model';
import { parse, serialize } from './model';
import { MontageView } from './view';
import montageExample from './example.yaml';

export const montageElement: ElementDefinition<MontageModel> = {
	id: 'montage',
	name: 'Montage Test tracker',
	aliases: ['ds-montage'],
	shape: 'persisted',
	autoResolveRefs: false, // self-contained tracker, no external refs
	parse,
	serialize,
	createView: (cx) => new MontageView(cx),
	authoring: { example: montageExample },
};
