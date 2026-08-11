// src/elements/scc/definition.ts — SC-149: `ds-scc`, the ONE public catch-all reference
// element. Scott's pre-release ruling (2026-08-10): the ten typed display elements
// (`ds-kit`, `ds-culture`, `ds-class`, …) are not a public-facing commitment worth
// maintaining — *"a minimal, catch-all codeblock is something we can maintain long-term
// and we leave it at that … `ds-scc` also has the benefit of being a bit more generic in
// case the entity doesnt get rendered as a card."*
//
// Contract, deliberately tiny:
//
//   ```ds-scc
//   mcdm.heroes.v1/kit/panther
//   ```
//
// The body is an SCC code and nothing else (optionally `scc.v1:`-prefixed). No inline
// YAML, no `[[wikilink]]`, no `@path`, no bare slug — every other body shape is a plain
// error card explaining the one accepted form (`parseSccBody` below). That strictness IS
// the feature: the block promises exactly one thing ("render this synced-compendium
// entry"), so nothing about the plugin's internal YAML shapes leaks into a user's note
// and the rendered output stays free to change.
//
// Everything under the hood is REUSED, not forked: `withReference`/`RefUnwrapView` own
// resolution + the degrade ladder (unsynced compendium / unknown code / web fallback),
// `CompendiumIndex.getEntity().model()` owns "this SCC `type` maps to this SDK model" via
// TYPE_ADAPTERS, and the per-type CARD is whichever existing element already renders that
// family — dispatched through `baseForSccType` below.
import type { ElementDefinition } from '@/framework/registry';
import { withReference } from '@/elements/shared/withReference';
import type { RefOrInline } from '@/elements/shared/withReference';
import { normalizeSccTarget } from '@/refs/SccResolver';
import { adapterForType } from '@/services/typeAdapters';
import { statblockElement } from '@/elements/statblock/definition';
import { featureElement } from '@/elements/feature/definition';
import { featureblockElement } from '@/elements/featureblock/definition';
import {
	kitElement,
	conditionElement,
	treasureElement,
	ancestryElement,
	cultureElement,
	careerElement,
	classElement,
	titleElement,
	perkElement,
	complicationElement,
	ruleElement,
} from '@/elements/display';
import sccExample from './example.yaml';

/** `id`/`name` — `name` heads every error card (`<name>: failed to render (…)`) and the
 *  D9 insert command (`Insert Draw Steel: <name>`). */
export const SCC_ELEMENT_ID = 'scc';
export const SCC_ELEMENT_NAME = 'SCC reference';
export const SCC_ALIAS = 'ds-scc';

/**
 * A bare SCC code: two or more `/`-separated segments (`source/type/item`, e.g.
 * `mcdm.heroes.v1/feature.ability.fury.level-1/gouge`). Deliberately "2 or more" rather
 * than "exactly 3": `sccToFilePath` (SccResolver.ts) only requires a source segment plus
 * a remainder, so a future deeper code stays renderable instead of being rejected by a
 * regex nobody remembered to widen. Whitespace/newlines are excluded by construction,
 * which is what makes inline YAML (a mapping, or any multi-line body) unmatchable.
 * (Fix round N-1: the trailing segments' char class is `*`, not `+`, so a legitimate
 * one-character segment — none exist in today's 2975-code registry, but nothing forbids
 * one — is not refused as "not a full SCC code".)
 */
const SCC_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)+$/;

const WHAT_IT_TAKES =
	'`ds-scc` renders a synced-compendium entry; its body must be a single SCC code, e.g. `mcdm.heroes.v1/kit/panther`.';

/** The one hint every refusal carries: where to get a correct block from. */
export const SCC_INSERT_HINT = 'Run "Insert Draw Steel: compendium reference" to search the compendium and write the block for you.';

/** An inline SCC link — `[Panther](scc.v1:<code>)`, which is exactly what the insert
 *  modal's Shift action writes into PROSE. Pasting one into a `ds-scc` block is the most
 *  likely wrong body there is (fix round M-3), so it gets its own message naming the code
 *  it already contains, rather than the generic "not a full SCC code". */
const INLINE_LINK_RE = /^\[[^\]]*\]\(\s*(scc(?:\.v\d+)?:[^)\s]+)\s*\)$/;

/**
 * Block body -> bare SCC code, or throw a user-facing Error. The def below catches that
 * and presents the message in a friendly notice card (L-1); it is thrown rather than
 * returned so the function stays usable — and testable — as a plain validator.
 * Exported because the message set IS the element's public contract (see
 * test/dom/elements/sccElement.test.ts).
 *
 * Fix round M-3: this now really does see EVERY body. The pipeline used to run
 * `parseYaml(source)` first and error-card a failure with the YAML parser's own words, so
 * a backticked code, a pasted inline link, a tab-indented code or a pasted fence never got
 * here; `ds-scc` sets `parseHandlesRawBody` (registry.ts) to take ownership of those.
 *
 * `scc.v1:`-prefixed bodies go through `normalizeSccTarget` — the same canonical
 * normalizer inline `scc.v1:` links use — so an unsupported future version (`scc.v2:`)
 * is refused here exactly as it is refused everywhere else, and a trailing `#anchor` is
 * dropped rather than rejected.
 */
export function parseSccBody(raw: string): string {
	const trimmed = raw.trim();
	if (trimmed.length === 0) {
		throw new Error(`Empty block. ${WHAT_IT_TAKES}`);
	}
	if (trimmed.startsWith('[[') || trimmed.startsWith('@')) {
		throw new Error(
			`Wikilink and @path references are not supported here — ${WHAT_IT_TAKES} ` +
				'Use "Draw Steel: Insert compendium reference" to paste the code for an entry.',
		);
	}
	const inlineLink = INLINE_LINK_RE.exec(trimmed);
	if (inlineLink) {
		throw new Error(
			`That is an inline link, not a block body — write just the code: \`${inlineLink[1].replace(/^scc(\.v\d+)?:/, '')}\`. ` +
				'(An inline link belongs in a sentence, not in a `ds-scc` block.)',
		);
	}
	if (/^[`~]/.test(trimmed)) {
		throw new Error(
			`Remove the backticks — a \`ds-scc\` block body is the bare code, with no code fence or quoting around it. ${WHAT_IT_TAKES}`,
		);
	}
	if (/^scc(\.v\d+)?:/.test(trimmed)) {
		const code = normalizeSccTarget(trimmed);
		if (code === null) {
			throw new Error(`\`${trimmed}\` is not a supported SCC reference (only \`scc:\`/\`scc.v1:\` codes resolve).`);
		}
		if (!SCC_CODE_RE.test(code)) throw new Error(`\`${code}\` is not a full SCC code. ${WHAT_IT_TAKES}`);
		return code;
	}
	if (/\s/.test(trimmed)) {
		// Covers a multi-line body (inline YAML, a pasted fence) AND a single line with
		// stray internal whitespace — one message either way, since "the body is one code"
		// is the same rule. Leading/trailing whitespace was already trimmed above, so an
		// indented code still resolves.
		throw new Error(
			trimmed.includes('\n')
				? `This block has more than one line. ${WHAT_IT_TAKES}`
				: `\`${trimmed}\` is not a full SCC code. ${WHAT_IT_TAKES}`,
		);
	}
	if (!SCC_CODE_RE.test(trimmed)) {
		throw new Error(`\`${trimmed}\` is not a full SCC code. ${WHAT_IT_TAKES}`);
	}
	return trimmed;
}

/**
 * SCC `type` -> the element definition that renders it. Keyed on the canonical alias
 * `TYPE_ADAPTERS` already assigns each family (`typeAdapters.ts`'s `alias` field), so
 * this table adds NO second type-matching regex — `adapterForType` stays the single
 * source of truth for "which family is this `type`," and the map below only answers
 * "which view draws that family."
 *
 * Every value is a `.base` — the INLINE-model def each reference-capable element wraps
 * (withReference's `ReferenceElement`). Mounting the wrapper instead would re-enter
 * reference resolution on an already-resolved model.
 *
 * Statblock/feature/featureblock codes therefore render through their REAL views (the
 * same card `ds-sb`/`ds-ft`/`ds-fb` produce), not a downgraded placeholder: the model
 * `CompendiumIndex` hands back for those types already IS a `StatblockConfig`/
 * `FeatureConfig`/`FeatureblockConfig`, so this costs one map entry each.
 */
const BASE_BY_ALIAS: Record<string, ElementDefinition<unknown>> = {
	'ds-statblock': statblockElement.base,
	'ds-feature': featureElement.base,
	'ds-featureblock': featureblockElement.base,
	'ds-kit': kitElement.base,
	'ds-condition': conditionElement.base,
	'ds-treasure': treasureElement.base,
	'ds-ancestry': ancestryElement.base,
	'ds-culture': cultureElement.base,
	'ds-career': careerElement.base,
	'ds-class': classElement.base,
	'ds-title': titleElement.base,
	'ds-perk': perkElement.base,
	'ds-complication': complicationElement.base,
	'ds-rule': ruleElement.base,
};

/**
 * The renderer for a resolved entity's SCC `type`, or undefined when this plugin has none
 * — RefUnwrapView then shows "no renderer in this plugin" instead of half-rendering.
 *
 * This is a REAL user-visible outcome, not a theoretical branch, and it is only ever as
 * correct as `TYPE_ADAPTERS`' family scopes: a type the adapters don't claim gets that
 * card even if the plugin could obviously render it. SC-141 is exactly that — the feature
 * adapter matched only `feature*` while the corpus emits 716 `ability`/`trait` codes, so
 * every one of them would land here. Widening a family regex in `typeAdapters.ts` is what
 * fixes such a case; nothing in this file needs to change, and nothing here should be read
 * as a guarantee that the situation cannot arise.
 */
export function baseForSccType(type: string): ElementDefinition<unknown> | undefined {
	const alias = adapterForType(type)?.alias;
	return alias === undefined ? undefined : BASE_BY_ALIAS[alias];
}

/** The wrapped base. Its `parse` is never reached (the exported def below replaces it
 *  with the strict one, which only ever returns `{kind:'ref'}` or `{kind:'invalid'}`) and
 *  neither is its `createView` (RefUnwrapView mounts a `baseForSccType` def instead) — but
 *  it carries the id/name the framework stamps and the D9 authoring example. */
const sccBase: ElementDefinition<never> = {
	id: SCC_ELEMENT_ID,
	name: SCC_ELEMENT_NAME,
	aliases: [SCC_ALIAS],
	shape: 'static',
	autoResolveRefs: false,
	parse: (_data, raw) => {
		throw new Error(`Unsupported block body. ${WHAT_IT_TAKES}`);
	},
	createView: () => {
		throw new Error(`Unsupported block body. ${WHAT_IT_TAKES}`);
	},
	authoring: { example: sccExample },
};

export const sccElement: ElementDefinition<RefOrInline<never>> = {
	...withReference(sccBase, {
		// Bare-slug sugar is unreachable: `parse` below rejects anything that isn't a full
		// code, so `RefUnwrapView.toCode` always takes its "already a full code" branch and
		// never consults this scope. Declared (matching nothing) rather than omitted, since
		// the option is required.
		sccType: /^$/,
		baseForType: baseForSccType,
		// L-1: refusals and unresolved codes are a routine user experience for THIS element
		// (a code that isn't synced yet, a body pasted from the wrong place), so they get a
		// plain-language notice card instead of "SCC reference: failed to render (render)".
		friendlyErrors: true,
	}),
	// M-3: this def reads the RAW body and owns every message about it, so the pipeline must
	// hand over bodies that aren't valid YAML too (a pasted inline link, a backticked code)
	// instead of error-carding them with the YAML parser's words.
	parseHandlesRawBody: true,
	// STRICT: the body is a code, or it is a notice card. Unlike every other
	// reference-capable element there is no inline-YAML branch to fall through to, so this
	// replaces withReference's own ref-or-inline `parse` outright. A refusal is RETURNED
	// (not thrown) so the view presents it — see RefOrInline's `invalid` variant.
	parse: (_data, raw) => {
		try {
			return { kind: 'ref', raw: parseSccBody(raw) };
		} catch (error) {
			return { kind: 'invalid', message: error instanceof Error ? error.message : String(error), hint: SCC_INSERT_HINT };
		}
	},
};
