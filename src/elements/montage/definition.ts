// D8 Task 6 (spec §4) — Montage Test tracker on Framework v2. Persisted shape; NO
// compendium dep, NO schema (a brand-new element with no legacy predecessor to match —
// same convention as encounter/negotiation/counter: validation is skipped by the
// pipeline when schema is omitted, F1 §2.4 step 3).
import type { ElementDefinition } from '@/framework/registry';
import type { ElementChrome } from '@/framework/chrome/types';
import type { MontageModel } from './model';
import { parse, serialize } from './model';
import { MontageView } from './view';
import montageExample from './example.yaml';

/**
 * SC-169 ROLLOUT wave 2 — a tracker whose state is a race between two tallies. The folded
 * line carries the round plus the success track against its limit
 * ("MONTAGE: Cross the Gap (round 2 · 3/6)"); failures are deliberately left to the open
 * card, because two fractions on one line stop being scannable.
 */
const montageChrome: ElementChrome<MontageModel> = {
	summary: ({ model }) => ({
		label: 'Montage',
		name: model.title || undefined,
		detail: `round ${model.current_round} \u00b7 ${model.successes}/${model.success_limit}`,
	}),
};

export const montageElement: ElementDefinition<MontageModel> = {
	id: 'montage',
	name: 'Montage Test tracker',
	aliases: ['ds-montage'],
	shape: 'persisted',
	autoResolveRefs: false, // self-contained tracker, no external refs
	parse,
	serialize,
	createView: (cx) => new MontageView(cx),
	chrome: montageChrome,
	authoring: { example: montageExample },
};
