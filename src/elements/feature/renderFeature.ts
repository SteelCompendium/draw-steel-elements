// Plan 09 Task 5 (D2 §3.6) — renderFeature: the REUSABLE feature/ability card grammar.
//
// This is the grammar Task 6 (Statblock/Featureblock) consumes when it retires the
// legacy Features/FeatureView sub-view tree — until then that tree stays in place for
// its remaining consumers, and THIS renderer serves the standalone Feature element.
//
// The emitted DOM (all classes GLOBAL, like the legacy .ds-feature-* block, because
// statblock/featureblock will embed them with no [data-dse-element="feature"] ancestor):
//
//   .dse-feature[data-dse-act]           ← the action-type spine root (+ .indent-N)
//     .dse-head                          ← kit cardHead: crest · Ability/Trait eyebrow ·
//                                            name(heading) · cost · ability_type
//     .dse-feature__flavor               ← italic flavor
//     .dse-feature__meta                 ← Keywords/Type/Distance/Target
//       .dse-feature__meta-chips         ←   band 1: Keywords + Type chips
//       .dse-feature__meta-rail          ←   band 2: boxed Distance/Target rail
//                                            (both `display: contents` in Legacy)
//     .dse-section--trigger              ← titled "Trigger" panel
//     per effect: .dse-section (title = name (+cost), body = effect md)
//                 .dse-pr (kit powerRollPanel, STATIC — features are not selectable)
//                 .dse-feature__nested > .dse-feature… (recursion, heading level +1)
//
// [data-dse-act] + the --dse-act ELEMENT-SET ALIAS (--dse-act: var(--dse-act-<type>))
// carry the Steel-only action accent: the Legacy base maps every --dse-act-* token to
// `none` and the CSS consumes the alias as a background, so the accent fails safe to
// monochrome — and an unmappable action type sets neither attribute nor alias.
//
// SC-10 Task 2: cardHead's crest + left-eyebrow slots are THEME-AGNOSTIC DOM — the
// crest <span> (kit/crest.ts) and the "Ability"/"Trait" kind-noun eyebrow mount in
// EVERY theme; styles-source.css's unscoped base neutralizes both (`.dse-crest` is
// already unconditionally `display:none`; a feature-scoped `.dse-head__eyebrow`
// hide rule keeps the newly-filled eyebrow invisible there too), so Legacy's look
// is unchanged and only the Steel skin layer reveals them.
//
// Markdown renders through the caller-supplied `renderMd` callback ONLY (ML-1): the
// element passes its view-parented this.renderMarkdown, so this module never imports
// Obsidian's MarkdownRenderer or app surface. `owner` is forwarded to the kit for
// signature uniformity (static widgets register no listeners).
import type { Component } from 'obsidian';
import type { Effect } from 'steel-compendium-sdk';
import { cardHead, powerRollPanel } from '@/framework/kit';
import type { PowerRollRow, RenderMdCallback } from '@/framework/kit';
import { FeatureConfig } from '@model/FeatureConfig';
import { attachRollControls } from './rollController';
import type { FeatureRollHooks } from './rollController';

/** D2 §3.6's action-type spine vocabulary (matches the --dse-act-* token family). */
export type ActionType = 'main' | 'maneuver' | 'triggered' | 'move' | 'none' | 'trait' | 'villain';

/**
 * SC-10 Task 8 / SC-102: the book's "none" placeholder for an unset field is a
 * LONE DASH, not an empty string (steel-etl's own convention — statblock_page.go
 * gates on `usage != "-"`, keyword_filter.go likewise). Treated as ABSENT
 * everywhere a real value is required.
 */
function isDashPlaceholder(value: string): boolean {
	return /^[-–—]+$/.test(value.trim());
}

/**
 * SC-231 (owner ruling, decisions.md 2026-09-25): the site
 * (`steel-ability-cards.css` `.sc-ability__chip`) renders one chip per keyword;
 * the plugin used to join the whole array into ONE comma-separated string and
 * markdown-render it as a single node, so Steel could only ever draw one chip no
 * matter how many keywords the feature had. This does NOT render twice and does
 * NOT duplicate any element — it splits the SINGLE markdown render `el` already
 * holds into one `.dse-feature__kw` span per comma-separated keyword, with each
 * ", " kept as its own `.dse-feature__kw-sep` span between them. `el`'s total
 * textContent is unchanged (the exact same characters, just re-grouped into
 * spans no unscoped rule styles) — that is what keeps Legacy and print reading
 * the identical inline run byte-for-byte; an EARLIER shape that called the
 * markdown renderer once PER keyword instead moved frozen print bytes two
 * different ways (a real renderer's per-call trailing whitespace, and
 * cross-boundary glyph kerning from a genuinely re-rendered text run) — see the
 * ledger for both failed attempts.
 *
 * A real markdown renderer wraps even one line in a block element (Obsidian's
 * own renderer, and the visual harness's `marked` shim, both do this) PLUS a
 * trailing whitespace-only text-node sibling after it (`marked.parse('Attack,
 * Weapon')` -> `"<p>Attack, Weapon</p>\n"`, and that "\n" survives as `el`'s
 * own second child) — the wrapper is `el`'s only ELEMENT child, tolerating any
 * number of whitespace-only text siblings around it, not literally `el`'s only
 * child of any kind. This splits the wrapper's OWN children and promotes the
 * resulting chip/separator spans to be `el`'s direct children (dropping the
 * wrapper and any whitespace sibling both — the wrapper rendered as pure
 * inline pass-through, `.dse-md-inline > p` a few hundred lines down, so losing
 * it changes nothing visually). The jest mock (test/mocks/obsidian-core.ts)
 * appends a bare text node with no wrapper at all; that text node is split the
 * same way.
 *
 * A comma INSIDE an element is never a split point — only a top-level TEXT node
 * is — so a keyword that is itself a markdown link (its raw href/label text
 * never contains a literal comma — SCC codes/URLs don't use one) is moved
 * whole, as one atomic unit, into its own chip: every link ends up rendered
 * EXACTLY ONCE, never cloned into a hidden duplicate.
 */
function chipifyKeywords(el: HTMLElement): void {
	const doc = el.ownerDocument;
	const elementChildren = Array.from(el.children);
	const onlyWhitespaceSiblings = Array.from(el.childNodes).every(
		(n) => n.nodeType === Node.ELEMENT_NODE || !(n.textContent ?? '').trim(),
	);
	const wrapper = elementChildren.length === 1 && onlyWhitespaceSiblings ? elementChildren[0] : null;
	const source = Array.from(wrapper ? wrapper.childNodes : el.childNodes);

	const groups: ChildNode[][] = [[]];
	for (const node of source) {
		if (node.nodeType === Node.TEXT_NODE) {
			const pieces = (node.textContent ?? '').split(',');
			pieces.forEach((piece, i) => {
				if (i > 0) groups.push([]);
				if (piece.length > 0) groups[groups.length - 1].push(doc.createTextNode(piece));
			});
		} else {
			groups[groups.length - 1].push(node);
		}
	}

	// Trim a leading/trailing whitespace-only sliver off each group's edge text
	// node (the space after a joining ", " lands at the START of the NEXT
	// group) and drop any group left empty (a trailing comma, or the dash-
	// placeholder's own single "-"/"--" entry never reaches this function at
	// all — see the call site's kwEmpty guard).
	const chips = groups
		.map((group) => {
			const g = [...group];
			if (g[0]?.nodeType === Node.TEXT_NODE) {
				g[0].textContent = (g[0].textContent ?? '').replace(/^\s+/, '');
				if (!g[0].textContent) g.shift();
			}
			const last = g[g.length - 1];
			if (last?.nodeType === Node.TEXT_NODE) {
				last.textContent = (last.textContent ?? '').replace(/\s+$/, '');
				if (!last.textContent) g.pop();
			}
			return g;
		})
		.filter((group) => group.length > 0);

	el.replaceChildren();
	chips.forEach((group, i) => {
		if (i > 0) el.createSpan({ cls: 'dse-feature__kw-sep', text: ', ' });
		const chip = el.createSpan({ cls: 'dse-feature__kw' });
		for (const node of group) chip.appendChild(node);
	});
}

/** Markdown link → its display text ("[Villain Action](scc.v1:…)" → "Villain Action").
 *  Mirrors steel-etl's `mdLinkRe` / `linkText` (ability_cards.go) verbatim. */
const MD_LINK_RE = /\[([^\]]*)\]\(([^)]*)\)/g;

/**
 * SC-102 fix round (H-1): the SHIPPED villain signal is `cost`, not `ability_type`.
 * steel-etl emits every villain action as `cost: "Villain Action N"` + the lone-dash
 * `usage: "-"` and NO `ability_type` at all (the string `ability_type: Villain` does
 * not occur anywhere in data-unified; all 156 dash-usage features in the books are
 * villain-by-cost). The site — the parity reference — keys off exactly this cost
 * prefix: `sbActionKind` (statblock_page.go) and `fbFeatureAction`
 * (featureblock_page.go) both do `HasPrefix(lower(trim(linkText(cost))), "villain
 * action")`, stripping links first because a resolved cost can read
 * "[Villain Action](scc.v1:…) 3". This is that check, verbatim.
 *
 * LEGACY VAULTS (data-unified history, verified): this cost shape arrived with the
 * 2026-07-16 regen. Compendium content synced BEFORE that carries villain actions as
 * BODY MARKDOWN only — a `> ☠️ **Name ([Villain Action](scc…) N)**` blockquote callout
 * with no structured YAML feature at all — so there is nothing here to classify and
 * nothing to parse: those notes keep rendering as prose, exactly as they do today. No
 * intermediate shape ever existed (`usage: Villain` / `ability_type: Villain` have zero
 * hits anywhere in that history), so cost + ability_type cover the whole structured
 * universe. A compendium re-sync (which 7.0.0 already asks for) brings the structured
 * shape, and with it the spine and crest.
 */
function isVillainCost(cost: string | undefined): boolean {
	return (cost ?? '')
		.replace(MD_LINK_RE, '$1')
		.trim()
		.toLowerCase()
		.startsWith('villain action');
}

export interface RenderFeatureOptions {
	/** aria-level for the cardHead name heading. Default 3; nested abilities get +1. */
	headingLevel?: number;
	/** D5 (Plan 14): roll interactivity hooks. ABSENT ⇒ output byte-identical to
	 *  the pre-D5 grammar (the fidelity bar); present ⇒ each rolling effect gains
	 *  a roll controller. Built by featureRollHooks(cx) in the element views. */
	roll?: FeatureRollHooks;
	/** SC-10 Task 5: featureblock's per-option glyph. When true, the cardHead's
	 *  leading column carries the SDK's OWN `Feature.icon` glyph verbatim (the
	 *  site's `fb__feat-icon` — a literal emoji classifier: ⭐ passive, ☠ villain,
	 *  🔳 area, …; steel-etl's featureblock_page.go does the exact same thing —
	 *  embeds `f.Icon` raw, no derived icon) in a theme-agnostic `.dse-fb__feat-icon`
	 *  span, REPLACING the act-derived Lucide crest (crestIconFor) for this list —
	 *  matching the site, which never falls back to an act glyph inside a
	 *  featureblock. Absent icon ⇒ no crest AND no glyph (site parity: an
	 *  icon-less option gets an empty leading column, not an invented one).
	 *  Only featureblock/view.ts sets this; every other renderFeatureList caller
	 *  keeps the pre-existing act-based crest untouched. */
	featBlockIcon?: boolean;
}

/**
 * Maps a feature's action type onto the [data-dse-act] spine vocabulary. Traits are
 * their own accent; otherwise the usage line (falling back to ability_type) decides.
 * Returns undefined when nothing maps — the caller then sets NO attribute/alias, so
 * the accent fails safe (D2 §3.6).
 *
 * SC-102 root cause: this used `usage ?? ability_type`, but villain actions in the
 * books carry the lone-dash placeholder `usage: "-"` — TRUTHY, so `??` short-circuited
 * and the villain descriptor was never read, leaving villain cards with no spine and no
 * crest. A dash-only usage is the book's "no usage line", so it must fall THROUGH.
 *
 * SC-102 fix round (H-1): what it falls through TO is `cost` first (the shipped
 * steel-etl shape — see isVillainCost above), then `ability_type` (hand-authored notes —
 * no real corpus ability carries a VILLAIN-SHAPED `ability_type` (corpus values are
 * Signature / Signature Ability / Triggered / Free-strike), and every corpus feature that
 * carries one also has a real usage line — so this rung never decides for shipped content,
 * only for fixtures/hand-authored blocks; see visual-harness's `feature-villain` fixture
 * and src/elements/hero/view.ts's `abilityActionLabel`). Precedence is otherwise untouched:
 * a REAL usage still wins over both — pinned by test/dom/elements/feature.test.ts's inline-
 * config `SC-102/SC-236` precedence test (SC-236 round 2 deleted the stray
 * `ability_type: Villain Action 1` line that used to make `feature/example.yaml` itself
 * demonstrate this precedence; that file is now a plain main-action example with no
 * ability_type field, and its frozen shots move only when its DOM actually changes).
 */
export function actionTypeOf(config: FeatureConfig): ActionType | undefined {
	if (config.feature.isTrait()) return 'trait';
	const usage = (config.feature.usage ?? '').trim();
	// L-2: an EMPTY/whitespace usage also falls through here (pre-SC-102 it
	// short-circuited to undefined); no corpus feature carries one, so no live effect.
	const realUsage = usage && !isDashPlaceholder(usage) ? usage : '';
	// H-1: with no real usage line, a "Villain Action N" cost decides — the shape the
	// pipeline actually emits, and the one the site itself classifies on.
	if (!realUsage && isVillainCost(config.feature.cost)) return 'villain';
	const source = (realUsage || (config.feature.ability_type ?? '')).toLowerCase();
	if (!source) return undefined;
	// Order matters: "Move action" / "No action" / "Triggered action" / "Villain
	// Action 1" all contain "action", so the generic main-action match must come
	// LAST — a villain branch placed after it would be dead code.
	if (source.includes('villain')) return 'villain';
	if (source.includes('maneuver')) return 'maneuver';
	if (source.includes('trigger')) return 'triggered';
	if (source.includes('move')) return 'move';
	if (source.includes('no action')) return 'none';
	if (source.includes('action')) return 'main';
	return undefined;
}

/**
 * SC-10 Task 2: the cardHead crest's glyph, keyed to the SAME action-type spine
 * `actionTypeOf` already computes (person/sword/etc — Lucide thin-line per
 * DESIGN.md Iconography "Material thin-line second"; glyph-font-parity with the
 * site's DrawSteelGlyphs codepoints is explicitly NOT required, plan Task 2).
 * Undefined (unmappable action type) -> kit/crest.ts degrades to no crest at all,
 * in EVERY theme — the same fail-safe the act spine itself already follows.
 */
export function crestIconFor(act: ActionType | undefined): string | undefined {
	switch (act) {
		case 'main':
			return 'sword';
		case 'maneuver':
			return 'user';
		case 'triggered':
			return 'zap';
		case 'move':
			return 'footprints';
		case 'none':
			return 'circle-dashed';
		case 'trait':
			return 'star';
		case 'villain':
			// SC-102 (S-3): the site's own villain classifier glyph is ☠
			// (v2/docs/javascripts/ability-cards.js) — Lucide's `skull` is its
			// thin-line twin (already used by Conditions.ts 'dead' + the solo
			// role crest, so it is a known-good name in Obsidian's icon set).
			return 'skull';
		default:
			return undefined;
	}
}

/**
 * SC-10 Task 2: the cardHead left-eyebrow kind-noun (DESIGN.md "Card header
 * system" fill guideline — "…is a ___"). The SDK's Feature model carries no
 * generic third "Feature" bucket (`feature_type` is Ability/Trait/Subtrait, and
 * `isTrait()` is itself the "no combat rigor" heuristic `actionTypeOf` already
 * keys its own 'trait' act-type off) — so this binary mirrors that existing
 * split rather than gating on the `ability_type` STRING field, which is often
 * absent on genuine abilities (e.g. a Main-action power-roll ability with no
 * villain-action/echelon descriptor still IS an Ability).
 */
export function kindNounOf(config: FeatureConfig): 'Ability' | 'Trait' {
	return config.feature.isTrait() ? 'Trait' : 'Ability';
}

/**
 * Title-cases a metadata slug ("black-ash" -> "Black Ash"), matching steel-etl's
 * `titleCase` (`build.go:1681`, always fed a `strings.ReplaceAll(v, "-", " ")`
 * value by every caller this ports) — capitalizes the first letter of each
 * space/hyphen-separated word, lowercasing nothing else.
 */
function titleCaseSlug(value: string): string {
	return value
		.split(/[\s-]+/)
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');
}

/** A non-empty, trimmed string metadata field, or undefined (absent/blank/non-string). */
function metaStr(metadata: Record<string, unknown>, key: string): string | undefined {
	const v = metadata[key];
	return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/**
 * SC-232 W1 (r7 survey b1, b4, b5, b8): the cardHead left-deck provenance line,
 * ported from steel-etl's `abilityOrigin` (`ability_cards.go:135-145`, class ·
 * subclass) and `traitSource`/`traitOrigin` (`trait_cards.go:563-591`, class /
 * ancestry / kit (+ a `feature_source` qualifier, "summoner" excluded) · subclass
 * — same priority order as the Go source, `class` first). Reads ONLY
 * `feature.metadata` (the by-SCC sync's own field, already on the model but never
 * read by any head composer before this ticket — SC-165's "Dead slot" note):
 * metadata-driven only this round, so a fixture without `metadata` renders no
 * left-deck at all, and 0 frozen print lines move (no frozen fixture carries
 * `metadata`).
 *
 * An ability's source is `class`, falling back to `kit` (survey b8, the
 * kit-signature ability's `metadata.kit` — the site reaches the same "Panther"
 * text via a DIFFERENT code path, an inline `originOverride` its kit page passes
 * around `abilityOrigin` entirely, but the by-SCC fence this reads carries no
 * `class` for a signature ability, so `kit` is an unambiguous fallback, never a
 * second source competing with `class`). A trait or plain feature's source
 * follows the site's own three-field priority.
 */
export function leftDeckOf(config: FeatureConfig): string | undefined {
	const metadata = config.feature.metadata;
	if (!metadata || typeof metadata !== 'object') return undefined;

	const isAbility = kindNounOf(config) === 'Ability';
	let source: string | undefined;
	if (isAbility) {
		source = metaStr(metadata, 'class') ?? metaStr(metadata, 'kit');
		if (source) source = titleCaseSlug(source);
	} else {
		for (const key of ['class', 'ancestry', 'kit']) {
			const v = metaStr(metadata, key);
			if (v) {
				source = titleCaseSlug(v);
				break;
			}
		}
		const featureSource = metaStr(metadata, 'feature_source');
		if (featureSource && featureSource !== 'summoner' && source) {
			source = `${source} ${titleCaseSlug(featureSource)}`;
		}
	}

	const subclass = metaStr(metadata, 'subclass');
	if (subclass) {
		const titledSubclass = titleCaseSlug(subclass);
		return source ? `${source} · ${titledSubclass}` : titledSubclass;
	}
	return source;
}

/**
 * Renders a list of features into a `.dse-feature__nested` container (the legacy
 * FeaturesView equivalent). Exported for Task 6's statblock/featureblock feature lists.
 */
export function renderFeatureList(
	parent: HTMLElement,
	configs: FeatureConfig[],
	owner: Component,
	renderMd: RenderMdCallback,
	opts: RenderFeatureOptions = {},
): HTMLElement | null {
	if (!configs || configs.length === 0) return null;
	const listEl = parent.createDiv({ cls: 'dse-feature__nested' });
	for (const config of configs) {
		renderFeature(listEl, config, owner, renderMd, opts);
	}
	return listEl;
}

/** Mounts one feature/ability card into `parent` and returns its `.dse-feature` root. */
export function renderFeature(
	parent: HTMLElement,
	config: FeatureConfig,
	owner: Component,
	renderMd: RenderMdCallback,
	opts: RenderFeatureOptions = {},
): HTMLElement {
	const feature = config.feature;
	const level = opts.headingLevel ?? 3;
	const rootEl = parent.createDiv({ cls: 'dse-feature' });

	// Nested-ability indentation: F1 preserves the legacy .indent-N contract.
	if (config.indent) rootEl.addClass(`indent-${config.indent}`);

	// The action-type spine (Steel-only accent; see the file header).
	const act = actionTypeOf(config);
	// D5: per-feature ordinal of rolling effects — keys the session slots.
	let rollableIndex = 0;
	if (act) {
		rootEl.setAttribute('data-dse-act', act);
		rootEl.style.setProperty('--dse-act', `var(--dse-act-${act})`);
	}

	/** Markdown into `el` via the caller's renderMd (fire-and-forget, like the kit).
	 *  `dashFix` ports the legacy FeatureView.renderMD quirk: a bare "-" field renders
	 *  as "--" so it doesn't parse as an empty markdown list. */
	const md = (raw: string, el: HTMLElement, dashFix = false): void => {
		el.addClass('dse-md-inline');
		void renderMd(dashFix && raw === '-' ? '--' : raw, el);
	};

	/** SC-231: like `md()`, but ALSO splits the rendered result into one
	 *  `.dse-feature__kw` chip span per comma-separated keyword once the async
	 *  render settles (`chipifyKeywords` — a single render, never a duplicate;
	 *  see its own doc comment). `renderMd` is `ElementView.renderMarkdown`,
	 *  always a Promise, but the type is `void | Promise<void>` (kit callers may
	 *  pass a sync stub) — chipify immediately in that fallback case. */
	const mdThenChipify = (raw: string, el: HTMLElement, dashFix = false): void => {
		el.addClass('dse-md-inline');
		const result = renderMd(dashFix && raw === '-' ? '--' : raw, el);
		if (result && typeof result.then === 'function') {
			void result.then(() => chipifyKeywords(el));
		} else {
			chipifyKeywords(el);
		}
	};

	/** A titled .dse-section panel (Effect / Trigger / Special / …). The title carries
	 *  NO baked-in colon — Legacy paints today's "Title: body" via CSS ::after. */
	const section = (
		parentEl: HTMLElement,
		title: string | undefined,
		bodyMd: string | undefined,
		modifier?: string,
	): HTMLElement => {
		const sectionEl = parentEl.createEl('section', {
			cls: 'dse-section' + (modifier ? ` dse-section--${modifier}` : ''),
		});
		if (title) sectionEl.createSpan({ cls: 'dse-section__title', text: title });
		if (bodyMd) md(bodyMd, sectionEl.createSpan({ cls: 'dse-section__body' }), modifier === 'trigger');
		return sectionEl;
	};

	// -- cardHead (§3.6 slot mapping): name = the heading; cost -> right eyebrow chip;
	// ability_type -> right primary chip. Slots mount empty and fill via renderMd so
	// SDK text renders exactly as the legacy markdown path did.
	//
	// SC-10 Task 2 (theme-agnostic DOM — both the crest <span> and the filled
	// left-eyebrow mount in EVERY theme; the unscoped base neutralizes both via CSS, see
	// styles-source.css): leftEyebrow = the "Ability"/"Trait"/"Feature" kind-noun
	// (site's "◆ ABILITY" eyebrow, SC-232 W8); crest = a Lucide glyph keyed to the
	// SAME act spine below. SC-232 W1: leftDeck = the provenance line (class/
	// ancestry/kit (+subclass), `leftDeckOf` above), metadata-driven and THEME-AGNOSTIC
	// DOM like the eyebrow — Legacy hides it (see the `.dse-feature .dse-head__deck--left`
	// rule at the top of styles-source.css) and Steel reveals + styles it (SC-232 rule
	// group). Neither slot invents wording the SDK data doesn't already imply.
	if (feature.name || feature.cost || feature.ability_type) {
		// SC-10 Task 5: inside a featureblock, the SDK's own icon glyph (if any)
		// REPLACES the act-based crest entirely (site parity — see the option
		// doc comment above); every other caller keeps today's crestIconFor(act).
		const featIcon = opts.featBlockIcon ? feature.icon?.trim() || undefined : undefined;
		const leftDeckText = leftDeckOf(config);
		const head = cardHead(
			rootEl,
			{
				leftEyebrow: kindNounOf(config),
				name: '',
				leftDeck: leftDeckText ? '' : undefined,
				rightEyebrow: feature.cost ? '' : undefined,
				rightPrimary: feature.ability_type ? '' : undefined,
				crest: opts.featBlockIcon ? undefined : { icon: crestIconFor(act), size: 'lg' },
				level,
			},
			owner,
		);
		if (featIcon) {
			const iconEl = head.rootEl.createSpan({ cls: 'dse-fb__feat-icon', text: featIcon });
			head.rootEl.prepend(iconEl);
		}
		if (feature.name) md(feature.name, head.nameEl, true);
		if (leftDeckText) md(leftDeckText, head.slots.leftDeck!, true);
		if (feature.cost) md(String(feature.cost).trim(), head.slots.rightEyebrow!, true);
		if (feature.ability_type) md(feature.ability_type.trim(), head.slots.rightPrimary!, true);
	}

	// -- flavor --
	if (feature.flavor) {
		md(feature.flavor, rootEl.createDiv({ cls: 'dse-feature__flavor' }).createSpan(), true);
	}

	// -- meta grid: Keywords / Type / Distance / Target. Labels ship in the DOM (the
	// §3.6 target shows them); the Legacy base HIDES the key spans so today's
	// label-less look is unchanged until D3's Steel layer reveals them.
	if (feature.keywords || feature.usage || feature.distance || feature.target) {
		const metaEl = rootEl.createDiv({ cls: 'dse-feature__meta' });
		// SC-121 B-1: the meta region is TWO bands, matching the site's ability card
		// (steel-ability-cards.css): a wrapping chip row (.sc-ability__kw — Keywords,
		// plus the plugin's extra Type classifier) over the boxed 2-col spec rail
		// (.sc-ability__rail — Distance/Targets). The bands are THEME-AGNOSTIC DOM
		// (mounted in every theme, like every other slot here) and are `display: contents`
		// in the Legacy base, which hands the four cells straight back to
		// .dse-feature__meta's own 2-col grid — so Legacy's placement, and its pixels,
		// are byte-unchanged (LEGACY-FREEZE). Print rides the base too (every Steel meta
		// rule is :not([data-dse-print="on"])), so *--steel-print.png is unchanged as well.
		let chipsEl: HTMLElement | undefined;
		let railEl: HTMLElement | undefined;
		const band = (which: 'chips' | 'rail'): HTMLElement => {
			if (which === 'chips')
				return (chipsEl ??= metaEl.createSpan({ cls: 'dse-feature__meta-chips' }));
			return (railEl ??= metaEl.createSpan({ cls: 'dse-feature__meta-rail' }));
		};
		// SC-10 Task 8 polish: a lone dash is the book's "none" placeholder (site:
		// statblock_page.go `usage != "-"`, keyword_filter.go) — never a real value.
		// The --empty modifier is THEME-AGNOSTIC DOM (mounted in every theme, like
		// every other slot here); Steel drops the whole chip (styles-source.css),
		// Legacy has no rule keying off it so its existing unlabeled dash text is
		// pixel-unchanged (LEGACY-FREEZE).
		const isEmptyValue = isDashPlaceholder;
		// SC-231: `chipify`, when true, renders the value through `mdThenChipify`
		// instead of the ordinary `md()` — the SAME single render call (never a
		// second one, never a duplicate element), split into per-keyword chip
		// spans once it settles. See `chipifyKeywords`'s own doc comment for why
		// this is what keeps Legacy/print byte-identical.
		const cell = (
			modifier: string,
			label: string,
			value: string,
			which: 'chips' | 'rail',
			isEmpty = false,
			chipify = false,
		): void => {
			const cellEl = band(which).createSpan({
				cls:
					`dse-feature__meta-cell dse-feature__meta-cell--${modifier}` +
					(isEmpty ? ' dse-feature__meta-cell--empty' : ''),
			});
			cellEl.createSpan({ cls: 'dse-feature__meta-key', text: label });
			const valueEl = cellEl.createSpan({ cls: 'dse-feature__meta-value' });
			if (chipify) mdThenChipify(value, valueEl, true);
			else md(value, valueEl, true);
		};
		// `feature.keywords` is typed `string[]`, but this element has no schema (the
		// SDK reader is the validator — see definition.ts's `parse` comment), so a
		// hand-typed `ds-feature` fence with no YAML list syntax (`keywords: Attack,
		// Weapon`) parses to a bare STRING at runtime — `.join`/`.length`/`.every`
		// below would throw on it. Wrapping it as a one-entry array costs nothing:
		// `chipifyKeywords` already splits on a literal comma at the rendered-DOM
		// level, so the single raw string still ends up as clean discrete chips.
		const keywords = Array.isArray(feature.keywords)
			? feature.keywords
			: typeof feature.keywords === 'string'
				? [feature.keywords]
				: feature.keywords;
		if (keywords) {
			const kwEmpty = keywords.length === 0 || keywords.every(isEmptyValue);
			cell('keywords', 'Keywords', keywords.length > 0 ? keywords.join(', ') : '', 'chips', kwEmpty, !kwEmpty);
		}
		if (feature.usage) cell('type', 'Type', feature.usage, 'chips', isEmptyValue(feature.usage));
		if (feature.distance) cell('distance', 'Distance', feature.distance, 'rail');
		if (feature.target) cell('target', 'Target', feature.target, 'rail');
	}

	// -- trigger: a titled section, before the effects (legacy order). --
	if (feature.trigger) section(rootEl, 'Trigger', feature.trigger, 'trigger');

	// -- effects (the legacy EffectView coverage: name/cost/effect/roll/tiers/crit/
	// nested features, in that order) --
	for (const effect of feature.effects ?? []) {
		renderEffect(rootEl, effect);
	}

	return rootEl;

	function renderEffect(parentEl: HTMLElement, effect: Effect): void {
		// Named/plain effect text -> a titled .dse-section; the effect's roll panel and
		// nested features mount INSIDE it (the legacy per-effect container semantics).
		// Title composition is UNCHANGED (byte-stable in every theme — statblock's own
		// example.yaml already exercises the cost-only, no-name shape, so touching this
		// would drift statblock's Legacy shots, out of Task 3's scope/LEGACY-FREEZE).
		const cost = effect.cost ? ` (${String(effect.cost).trim()})` : '';
		const title = (effect.name ? effect.name + cost : cost).trim();
		// The keyword-spend clause (Draw Steel's "Spend X [Resource]:" grammar — RR
		// "Spend Heroic Resource", steel-etl's own labelRe detects it the same way,
		// ability_cards.go: `strings.HasPrefix(strings.ToLower(label), "spend")`) gets
		// its own modifier so Steel can render the site's dashed enhancement box
		// (styles-source.css `.dse-section--spend`), keyed off the RAW cost field (not
		// the composed, possibly-parenthesized title) — theme-agnostic DOM; the base has
		// no unscoped rule keying off it, so the class is inert there (today's "Title:
		// body" line, unchanged).
		const isSpend = !!effect.cost && /^spend\b/i.test(String(effect.cost).trim());
		const hostEl =
			title || effect.effect
				? section(parentEl, title || undefined, effect.effect, isSpend ? 'spend' : undefined)
				: parentEl;

		// Power roll: one STATIC kit panel per rolling effect (no radiogroup — features
		// are not selectable; tier outcomes flow through the renderMd callback). The
		// head carries the block's OWN roll wording verbatim, or nothing (head: false)
		// — the kit's default "Power Roll" caption would invent words the data doesn't
		// have. dse-md-inline on the head keeps the callback-rendered <p> inline (the
		// same treatment the md() helper gives every other markdown target here).
		const rows: PowerRollRow[] = [];
		if (effect.tier1) rows.push({ tier: 'low', md: effect.tier1 });
		if (effect.tier2) rows.push({ tier: 'mid', md: effect.tier2 });
		if (effect.tier3) rows.push({ tier: 'high', md: effect.tier3 });
		if (effect.crit) rows.push({ tier: 'crit', md: effect.crit });
		if (effect.roll || rows.length > 0) {
			const handle = powerRollPanel(
				hostEl,
				{ rows, renderMd, head: effect.roll?.trim() || false },
				owner,
			);
			handle.headEl?.addClass('dse-md-inline');
			// D5 (Plan 14): the roller layers ONTO the static panel when hooks are
			// supplied (rollingEnabled) — attribute channel only, no DOM change to the
			// rows themselves; without hooks this branch is byte-identical to before.
			if (opts.roll) {
				attachRollControls({
					hostEl,
					panel: handle,
					rollExpr: effect.roll ?? undefined,
					mainActionDefault: act === 'main',
					abilityName: feature.name ?? 'power roll',
					effectIndex: rollableIndex,
					hooks: opts.roll,
					owner,
				});
			}
			rollableIndex++;
		}

		if (effect.features && effect.features.length > 0) {
			// D5: nested abilities inherit the hooks (single shared blockKey). Each
			// nested feature gets its own renderFeature frame — that resets the
			// rollableIndex ordinal, so every nested feature shares the parent's
			// blockKey ordinal space: the parent's rolling effect 0 and a nested
			// feature's effect 0 land on the SAME session slot (and nested siblings
			// collide with each other likewise); acceptable for best-effort dice
			// state (F1 §4.3 key drift is already documented) — not a bug.
			renderFeatureList(hostEl, FeatureConfig.allFrom(effect.features), owner, renderMd, {
				...opts,
				headingLevel: Math.min(level + 1, 6),
			});
		}
	}
}
