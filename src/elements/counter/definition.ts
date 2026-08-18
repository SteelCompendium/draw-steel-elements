// Plan 07 Task 4 (F1 §6 step 7) — Counter on Framework v2, retiring the legacy
// CounterProcessor + Counter/CounterView. Persisted shape; parse/serialize are the
// byte-compat model wrappers around @model/Counter (see ./model.ts).
import type { ElementDefinition } from '@/framework/registry';
import type { ElementChrome } from '@/framework/chrome/types';
import type { Counter } from '@model/Counter';
import { parse, serialize } from './model';
import { CounterElementView } from './view';
import counterExample from './example.yaml';

/**
 * SC-169 ROLLOUT wave 2 — the author's own counter name plus its tally
 * ("COUNTER: Torches (3/5)"). An uncapped counter reports the current value alone rather
 * than an `x/undefined`.
 */
const counterChrome: ElementChrome<Counter> = {
	summary: ({ model }) => ({
		label: 'Counter',
		name: model.name || undefined,
		detail: model.max_value === undefined ? String(model.current_value) : `${model.current_value}/${model.max_value}`,
	}),
};

export const counterElement: ElementDefinition<Counter> = {
	id: 'counter',
	name: 'Counter',
	aliases: ['ds-ct', 'ds-counter'],
	shape: 'persisted',
	// Deliberately NO schema: the legacy element never had one (CounterProcessor parsed
	// the YAML straight into Counter) — do not invent one here. Validation is skipped by
	// the pipeline when schema is omitted (F1 §2.4 step 3). Same convention as negotiation.
	autoResolveRefs: false, // self-contained tally, no external refs
	parse,
	serialize,
	createView: (cx) => new CounterElementView(cx),
	chrome: counterChrome,
	authoring: { example: counterExample },
};
