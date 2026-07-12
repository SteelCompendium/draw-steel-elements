// Plan 05 Task 5 (F1 §6 step 8) — Negotiation Tracker on Framework v2, retiring the legacy
// NegotiationTrackerProcessor. Persisted shape; parse/serialize are Task 4's byte-compat
// model wrappers around @model/NegotiationData.
import type { ElementDefinition } from '@/framework/registry';
import type { NegotiationData } from '@model/NegotiationData';
import { parse, serialize } from './model';
import { NegotiationView } from './view';
import negotiationExample from './example.yaml';

export const negotiationElement: ElementDefinition<NegotiationData> = {
	id: 'negotiation',
	name: 'Negotiation tracker',
	aliases: ['ds-nt', 'ds-negotiation', 'ds-negotiation-tracker'],
	shape: 'persisted',
	// Deliberately NO schema: the legacy element never had one (the processor parsed the
	// YAML straight into NegotiationData) — do not invent one here. Validation is skipped
	// by the pipeline when schema is omitted (F1 §2.4 step 3).
	autoResolveRefs: false, // self-contained tracker, no external refs (Plan 05 survey §7)
	parse,
	serialize,
	createView: (cx) => new NegotiationView(cx),
	authoring: { example: negotiationExample },
};
