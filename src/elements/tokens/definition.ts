// D7 Task 6 (spec §4.5, OD-3) — ds-tokens ElementDefinition: the canonical, party-wide
// Hero Tokens pool a table keeps ONE of. Self-contained — no cross-block wiring to
// ds-party's own hero_tokens stepper or to a future ds-hero's `state.tokens_ref`
// read-through (Task 9 owns that wiring; this task ships only the canonical block).
import type { ElementDefinition } from '@/framework/registry';
import tokensSchemaYaml from './schema.yaml';
import tokensExample from './example.yaml';
import { parse, serialize } from './model';
import type { TokenPoolModel } from './model';
import { TokenPoolContainer } from './view';

export const tokensElement: ElementDefinition<TokenPoolModel> = {
	id: 'hero-tokens',
	name: 'Hero Tokens',
	aliases: ['ds-tokens'],
	shape: 'persisted',
	schema: tokensSchemaYaml,
	autoResolveRefs: false, // self-contained pool: label/tokens are plain values, no refs
	parse,
	serialize,
	createView: (cx) => new TokenPoolContainer(cx),
	authoring: { example: tokensExample },
};
