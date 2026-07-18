// D7 Task 6 (spec §4.5, OD-3) — ds-tokens model: parse + byte-stable serialize for the
// canonical, PARTY-WIDE Hero Tokens pool (RR §7 "Tests": "Hero Tokens: Spend to reroll
// any test." — AR "Hero Tokens": "Awarded by the Director for risk-taking, dramatic
// play, and heroic moments. Spent to reroll any test."). BRAND NEW element (no legacy
// predecessor); mirrors resource/model.ts's convention exactly (parse copies through
// only authored keys, serialize is a pure projection).
//
// OD-3 (canonicalization, not a rules citation): the plan designates this element as
// the ONE canonical party pool a table keeps; `ds-party` (D8) also carries a
// `hero_tokens` stepper on its own pool field for that tracker's own convenience, and
// the two are DELIBERATELY NOT wired together by this task (no cross-block sync) — a
// future `ds-hero` flagship reads this block through read-only via `state.tokens_ref`
// (Task 9, deferred cross-note live sync). This element does not know about ds-party at
// all; it is a fully self-contained persisted block.
import { stringifyYaml } from 'obsidian';

export interface TokenPoolModel {
	/** Optional display label for this pool (e.g. a session/table name, spec §4.5's
	 *  `"Session 12 party pool"`). Absent = the view falls back to a generic label. */
	label?: string;
	/** The party's current Hero Token count. Required — every ds-tokens block authors a
	 *  value. Floor 0 at the UI (view.ts's stepper `min: 0`) — tokens are spent, never
	 *  negative. */
	tokens: number;
}

export function parse(input: unknown, _raw: string): TokenPoolModel {
	if (typeof input !== 'object' || input === null) {
		throw new Error('The input must be a YAML object.');
	}
	const data = input as Record<string, unknown>;
	if (typeof data.tokens !== 'number') {
		throw new Error("ds-tokens requires a numeric 'tokens' field.");
	}
	const model: TokenPoolModel = { tokens: data.tokens };
	if (typeof data.label === 'string') model.label = data.label;
	return model;
}

/** Field order (label, tokens) matches the schema's own property order and the spec
 *  §4.5 example (`label:` then `tokens:`) — an absent `label` is simply never assigned
 *  onto `dto`, so stringifyYaml (keepUndefined: false by default) omits it entirely,
 *  the same convention as resource/model.ts's class/type/min/max. */
export function serialize(model: TokenPoolModel): string {
	const dto: Record<string, unknown> = {};
	if (model.label !== undefined) dto.label = model.label;
	dto.tokens = model.tokens;
	return stringifyYaml(dto).trim();
}
