// src/elements/shared/CardLayout.ts — D6 Task 5 (spec §2.4): the shared, declarative card
// frame every display element renders through — `data` (ten small CardLayout objects), not
// ten view classes. All markdown renders via `this.renderMarkdown` (owner-parented, ML-1;
// free scc-anchor rewriting, F2 §4.3(a), and nested `ds-*` blocks recurse through the
// pipeline). The pipeline stamps `data-dse-element` on the root (pipeline.ts) BEFORE
// createView runs — DisplayCardView renders its frame INTO that root and never re-stamps
// it (F1 §3.5 contract).
//
// By-SCC hybrid (§2.3/§2.4, Task 9): DisplayCardView implements SourceAware so
// RefUnwrapView can thread a resolved RefSource in via setSource() (called BEFORE mount —
// see RefUnwrapView.mountBase). `useSourceBody`/`omitWhenSource` are the flags every real
// displayFamily() def (kit/condition/treasure/…) is wrapped with withReference and wired
// through in production.
//
// Task 9 lands the actual source-body render: in hybrid mode (`this.source` set) with
// `useSourceBody !== false` (the default), the card's trailing body region renders
// `this.source.body` — the resolved compendium file's OWN markdown (frontmatter stripped
// by CompendiumIndex.getEntity().body(), everything else kept) — through `renderMarkdown`,
// instead of the layout's inline `body(model)`. This is what makes a kit's nested
// ```ds-feature block (its signature ability, authored in the compendium FILE's body, not
// its frontmatter — frontmatterAdapter's by-SCC model construction only reads frontmatter,
// so `model.signature_ability` is undefined in hybrid mode) show up at all in by-SCC mode:
// `renderMarkdown` recurses through Obsidian's real markdown pipeline, so a fenced ds-*
// block inside the source body mounts as a REAL nested DSE card there, in real Obsidian.
// (`body()` strips ONLY the frontmatter block — for a display-family file like kit, that
// leaves prose + nested ds-* fences with no wrapping "primary" block of its own; a ds-block
// -family file, by contrast, wraps its whole payload in a top-level fence matching its own
// type, which is a different family's concern, not this one's.)
//
// `bodyMd` below is computed as "whichever markdown will actually render as the body" —
// `this.source!.body` in hybrid+useSource mode, else `layout.body(model)` — BEFORE the
// flavor/row duplicate-slot guard runs, so that guard (D6 Task 7 review fix, below) applies
// uniformly in both modes: a flavor/row value that duplicates the REAL by-SCC source body
// is suppressed exactly like one duplicating the inline body. `omitWhenSource` rows are a
// separate, always-on-in-hybrid suppression (no duplicate-text check needed — the row is
// just never a candidate in hybrid mode at all).
//
// Plan 24 / SC-100 Task 2 — the theme-conditional composition seam (THE pattern every
// future theme-aware view uses, per the plan's Architecture section): `CardLayout<M>`
// gains an optional `steel` slot (`SteelCardComposition<M>`, below). Absent (every layout
// today) => zero behavior change: onMount always takes the `renderLegacy()` branch, which
// is the PRE-EXISTING onMount body moved verbatim (same statements, same order — the
// legacy DOM cannot drift, because it isn't a copy, it's the same code relocated). Present
// AND the active theme is 'steel' => `renderSteel()` (a generic composition renderer;
// Task 3 fills `kitLayout.steel` and the concrete equipment/stat-tile/signature bands — no
// new view code needed here, only band data). Any OTHER theme id — 'legacy' or a future
// open-union snippet id (`DseThemeId` is `'steel' | 'legacy' | (string & {})`) — takes
// `renderLegacy()` too: legacy is the canonical fallback for every non-steel theme, not
// just literal 'legacy'.
//
// A theme switch today is reflow-only (ThemeService.apply() just re-stamps the root's
// data-dse-theme attribute; see seams/theme.ts) — nothing re-renders a mounted view. This
// view adds that: when (and only when) `layout.steel` exists, it registers its OWN
// `cx.theme.onChange` subscription (owner-registered via `this.register`, so teardown is
// automatic and popout-safe) that recomputes the branch and, if it changed, tears down
// its own card subtree — unload the branch's owned children (renderMarkdown/nested feature
// views registered via `this.addChild`), remove the TRACKED `.dse-card` node — and
// re-renders. It deliberately never calls `rootEl.empty()`: the pipeline appends
// pipeline-owned siblings to root AFTER mount() returns (e.g. the authoring pencil,
// pipeline.ts), and emptying root would destroy those too.
import type { Feature } from 'steel-compendium-sdk';
import { ElementView } from '@/framework/view';
import type { RenderContext } from '@/framework/context';
import { renderFeatureList } from '@/elements/feature/renderFeature';
import { cardHead } from '@/framework/kit/cardHead';
import type { CrestSize } from '@/framework/kit/crest';
import { FeatureConfig } from '@model/FeatureConfig';
import type { RefSource, SourceAware } from './withReference';

/** A small tag on a card's head — tone picks the CSS accent (cardFrame section, styles-source.css). */
export interface Badge {
	text: string;
	tone?: 'keyword' | 'echelon' | 'rarity' | 'type';
}

export interface FieldRow<M> {
	label: string;
	value: (m: M) => string | undefined;
	/** Render `value` through `renderMarkdown` instead of plain text. */
	markdown?: boolean;
	/** By-SCC: suppress this row when the source body already contains it (§2.3 double-render guard). */
	omitWhenSource?: boolean;
}

/**
 * A single content band in a Steel composition (e.g. a kit's boxed "Equipment" panel or
 * "Kit Bonuses" stat-tile grid). The band's actual CONTENT is a per-card-type concern
 * (Task 3 supplies kit's equipment/stat-tile/signature bands via a dedicated builder
 * module) — this seam only knows how to mount whatever a band gives it: an optional
 * small-caps head label, then `render()`'s own DOM into a container already positioned
 * in the card.
 */
export interface SteelBand {
	/** Small-caps band-head label ("Equipment", "Kit Bonuses"). Omit for a headless band. */
	head?: string;
	/**
	 * Builds this band's content into `container`. `renderMarkdown` is the SAME
	 * view-lifecycle-bound helper (`this.renderMarkdown`) the legacy branch uses — pass
	 * markdown through it (not raw text) so scc-anchor rewriting and owned-child
	 * bookkeeping stay uniform between the two branches.
	 */
	render: (container: HTMLElement, renderMarkdown: (markdown: string, el: HTMLElement) => Promise<void>) => void | Promise<void>;
}

/**
 * The optional Steel-theme composition for a `CardLayout<M>` (Plan 24 / SC-100 Task 2's
 * seam; Task 3 is the first real consumer, via `kitLayout.steel`). Declarative, like the
 * rest of `CardLayout` — a card type opts in by providing this, with NO new view code:
 * `DisplayCardView.renderSteel()` (below) is generic over it.
 */
export interface SteelCardComposition<M> {
	/** cardHead's left-eyebrow slot (e.g. "Martial Kit"). */
	eyebrow: (m: M, source?: RefSource) => string | undefined;
	/** cardHead's crest icon id (a Lucide icon name, e.g. "backpack"); undefined omits
	 *  the crest entirely (crest() itself already degrades to nothing without one). */
	crestIcon: (m: M, source?: RefSource) => string | undefined;
	/**
	 * Review fix (Task 2 M1): crest() size ('md' | 'lg' — src/framework/kit/crest.ts).
	 * Optional; `renderSteel()` defaults to 'lg' (the tall card-header shield every
	 * current display card wants) when omitted, so existing/simple compositions don't
	 * need to specify it — but a future adopter that wants 'md' can, without touching
	 * `CardLayout.ts` again.
	 */
	crestSize?: (m: M, source?: RefSource) => CrestSize | undefined;
	/** Ordered content bands, rendered after the head (equipment / stat-tiles / features /
	 *  body policy — semantics owned by each band's own `render()`, not this seam). */
	bands: (m: M, source?: RefSource) => SteelBand[];
}

/** Declarative field-map for one display card type. See DisplayCardView for the renderer. */
export interface CardLayout<M> {
	title: (m: M) => string;
	subtitle?: (m: M) => string | undefined;
	badges?: (m: M) => Badge[];
	flavor?: (m: M) => string | undefined;
	rows?: FieldRow<M>[];
	/**
	 * Nested feature cards (e.g. a kit's signature ability): rendered as REAL feature
	 * cards through the shared `renderFeature`/`renderFeatureList` grammar
	 * (src/elements/feature/renderFeature.ts) — the same DOM-building mechanism
	 * featureblock/view.ts uses to recurse nested features — instead of a markdown/
	 * YAML round-trip. Rendered after `rows`, before `body`.
	 */
	features?: (m: M) => Feature[] | undefined;
	/** Inline-mode trailing markdown (usually m.content). */
	body?: (m: M) => string | undefined;
	/** By-SCC hybrid: render the resolved file body instead of `body`. Default true (Task 9). */
	useSourceBody?: boolean;
	/**
	 * Optional Steel-theme composition (Plan 24 / SC-100). Absent (every layout as of
	 * Task 2) => `DisplayCardView` never takes the `renderSteel()` branch, so behavior is
	 * IDENTICAL to before this field existed, in every theme. See the file header for the
	 * full branch/re-render contract.
	 */
	steel?: SteelCardComposition<M>;
}

// D6 Task 7 review fix (Finding 1/2, spec §9's stated mitigation shape: "CardLayout marks
// which fields the body already contains"): `content` is the canonical, full-prose field —
// `flavor`/rows are pre-pipeline extractions FROM the same source prose, so across the real
// corpus `content`'s lead paragraph is (at minimum a prefix of) `flavor` verbatim, and some
// rows' values (Benefit/Drawback/Effect/Prerequisite/Skills/Perk…) re-appear as labeled
// sentences further down. `flavor`/row values are plain text; `content` carries the same
// prose WITH markdown (links/emphasis) — so a byte-equality check misses every real case
// (verified directly against the corpus, see layouts.ts's file header). We therefore
// normalize both sides (strip markdown links/emphasis, collapse whitespace, lowercase) and
// compare — robust to those markdown/whitespace differences without ever touching `content`
// itself (content stays canonical; the DUPLICATE SLOT is what's suppressed). A minimum
// length guard on row values avoids false-positive suppression of short/generic strings
// (e.g. "One language") coincidentally appearing as a substring of a long body.
const DUPLICATE_ROW_MIN_LENGTH = 20;

function normalizeForDuplicateCheck(s: string): string {
	return s
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // markdown links -> link text
		.replace(/[*_`]/g, '') // emphasis/code markers
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

/**
 * The shared frame every display card mounts through: one class, driven entirely by a
 * `CardLayout<M>` (constructor arg — no subclassing per card type). `SourceAware` is the
 * by-SCC hybrid seam (§2.3): `setSource()` is a plain field write, called by RefUnwrapView
 * before `mount()`, so it is always settled by the time `onMount` reads `this.source`.
 */
export class DisplayCardView<M> extends ElementView<M> implements SourceAware {
	private source?: RefSource;

	/**
	 * The `.dse-card` node this view most recently created — tracked so a theme-change
	 * re-render can remove EXACTLY this node (never `rootEl.empty()`; see file header).
	 * Set at the end of every `renderBranch()` call; only ever undefined before the
	 * first render has completed.
	 */
	private cardEl?: HTMLElement;
	/** Which branch is currently mounted — compared against on every theme-change
	 *  notification so a same-branch fire (e.g. legacy -> some other non-steel snippet
	 *  id) is correctly a no-op rather than a needless rebuild. */
	private renderedBranch?: 'legacy' | 'steel';
	/**
	 * Review fix (Task 2 I1): `onMount` is RE-ENTERABLE — `ElementView.update()`'s default
	 * path (no `onUpdate` override here) is `unloadOwnedChildren(); rootEl.empty();
	 * onMount(rootEl, model)`, and `SidebarPanel.handleExternalChange` calls
	 * `previous.update(model)` directly on an already-mounted view as its live-preview
	 * refresh fast path. Without this guard, every re-entry into `onMount` would register
	 * ANOTHER `theme.onChange` closure — distinct closures never dedupe by content, so the
	 * listener count would grow unboundedly (1 -> 2 -> 3 -> ... across repeated updates),
	 * each one a permanent leak until the view itself unloads. Set true the first time the
	 * subscription is registered; checked (not re-derived) on every subsequent `onMount`
	 * re-entry, so exactly one subscription exists per view instance for its whole life.
	 */
	private themeChangeRegistered = false;

	constructor(
		cx: RenderContext,
		private readonly layout: CardLayout<M>,
	) {
		super(cx);
	}

	setSource(source: RefSource): void {
		this.source = source;
	}

	protected async onMount(root: HTMLElement, model: M): Promise<void> {
		await this.renderBranch(root, model);

		// Re-render on theme change (Task 2 Step 2): ONLY subscribe when this layout
		// actually HAS a Steel composition — a steel-less layout always takes the
		// renderLegacy() branch regardless of theme (byte-identical DOM in every theme,
		// invariant 1), so a subscription here could never do anything useful. Guarded by
		// `themeChangeRegistered` (review fix I1, above) so a re-entrant onMount (via
		// update()'s default rebuild path) never registers a second subscription — `root`
		// is safe to capture once here because ElementView.mount() assigns `this.rootEl`
		// exactly once and update() always re-invokes onMount against that SAME reference.
		if (this.layout.steel && !this.themeChangeRegistered) {
			this.themeChangeRegistered = true;
			this.register(
				this.cx.theme.onChange(() => {
					void this.onThemeChange(root);
				}),
			);
		}
	}

	/**
	 * Theme-change handler: recompute the branch for the now-active theme; re-render
	 * iff it differs from what's currently mounted. Registered via `this.register()` in
	 * onMount (above), so:
	 *  - it can never fire before the first render has run (it doesn't exist yet), and
	 *  - it is auto-unsubscribed on view unload (owner registration — the Obsidian
	 *    Component contract `this.register` relies on), so it can never fire after
	 *    unload either.
	 * The guard below asserts that ordering rather than silently tolerating a violation
	 * of it, so a future refactor that breaks it fails loudly instead of throwing a
	 * confusing NPE deep in DOM removal code.
	 */
	private async onThemeChange(root: HTMLElement): Promise<void> {
		if (!this.cardEl || !this.renderedBranch) {
			throw new Error('DisplayCardView.onThemeChange: fired before the first render completed');
		}
		if (this.computeBranch() === this.renderedBranch) return;

		// Tear down exactly this view's owned children (renderMarkdown embeds, nested
		// feature-card views registered via `this.addChild`) before discarding the DOM
		// they live in — leaving them registered would leak their listeners/timers.
		this.unloadOwnedChildren();
		this.cardEl.remove();
		await this.renderBranch(root, this.model);
	}

	/** Compute the branch, render it, and update the tracked cardEl/renderedBranch. */
	private async renderBranch(root: HTMLElement, model: M): Promise<void> {
		const branch = this.computeBranch();
		this.cardEl = branch === 'steel' ? await this.renderSteel(root, model) : await this.renderLegacy(root, model);
		this.renderedBranch = branch;
	}

	/** The single branch-selection rule (plan Architecture section, invariant-defining):
	 *  Steel ONLY when the active theme is literally 'steel' AND this layout opted in.
	 *  Every other theme id — 'legacy', or a future open-union snippet id — is legacy. */
	private computeBranch(): 'legacy' | 'steel' {
		return this.cx.theme.active === 'steel' && !!this.layout.steel ? 'steel' : 'legacy';
	}

	/**
	 * The canonical (and, until a layout opts into `steel`, ONLY) render path — moved
	 * verbatim from the pre-Task-2 `onMount` body (same statements, same order), so the
	 * legacy DOM cannot drift: it isn't a copy of the old logic, it IS the old logic,
	 * relocated. Returns the created `.dse-card` node so the caller can track it.
	 */
	private async renderLegacy(root: HTMLElement, model: M): Promise<HTMLElement> {
		const card = root.createDiv({ cls: 'dse-card' });
		const head = card.createDiv({ cls: 'dse-card__head' });
		head.createDiv({ cls: 'dse-card__title', text: this.layout.title(model) });

		const subtitle = this.layout.subtitle?.(model);
		if (subtitle) head.createDiv({ cls: 'dse-card__subtitle', text: subtitle });

		const badges = this.layout.badges?.(model) ?? [];
		if (badges.length) {
			const badgeRow = head.createDiv({ cls: 'dse-card__badges' });
			for (const b of badges) {
				badgeRow.createSpan({
					cls: `dse-card__badge dse-card__badge--${b.tone ?? 'type'}`,
					text: b.text,
				});
			}
		}

		// Hybrid mode is "a RefSource has been threaded in" (RefUnwrapView.mountBase calls
		// setSource() before mount whenever a by-SCC reference resolved to a vault file).
		const hybrid = this.source !== undefined;
		const useSource = hybrid && this.layout.useSourceBody !== false;

		// Whichever markdown will ACTUALLY render as this card's body — the resolved
		// source file's body in hybrid+useSource mode (Task 9), else the layout's inline
		// `body(model)`. Computed here (rather than down in the body section below) so the
		// flavor/row duplication guard right below can compare against it in BOTH modes.
		const bodyMd = useSource ? this.source!.body : this.layout.body?.(model);
		const normalizedBody = bodyMd && bodyMd.trim() ? normalizeForDuplicateCheck(bodyMd) : undefined;

		const flavor = this.layout.flavor?.(model);
		const flavorDuplicatesBody = !!(flavor && normalizedBody?.startsWith(normalizeForDuplicateCheck(flavor)));
		if (flavor && !flavorDuplicatesBody) {
			await this.renderMarkdown(flavor, card.createDiv({ cls: 'dse-card__flavor' }));
		}

		const rows = (this.layout.rows ?? []).filter((r) => !(hybrid && r.omitWhenSource));
		const rendered: Array<{ row: FieldRow<M>; value: string }> = [];
		for (const row of rows) {
			const value = row.value(model);
			if (value == null || value === '') continue;
			if (normalizedBody) {
				const normalizedValue = normalizeForDuplicateCheck(value);
				if (normalizedValue.length >= DUPLICATE_ROW_MIN_LENGTH && normalizedBody.includes(normalizedValue)) continue;
			}
			rendered.push({ row, value });
		}
		if (rendered.length) {
			const grid = card.createDiv({ cls: 'dse-card__rows' });
			for (const { row, value } of rendered) {
				const rowEl = grid.createDiv({ cls: 'dse-card__row' });
				rowEl.createSpan({ cls: 'dse-card__row-label', text: row.label });
				const valEl = rowEl.createSpan({ cls: 'dse-card__row-value' });
				if (row.markdown) {
					// The established inline-markdown idiom (renderFeature.ts's md()
					// helper): keeps the callback-rendered <p> inline with the label
					// instead of dropping to its own line (Task 6 review Finding 3).
					valEl.addClass('dse-md-inline');
					await this.renderMarkdown(value, valEl);
				} else {
					valEl.setText(value);
				}
			}
		}

		// Nested feature cards (e.g. a kit's signature ability): rendered through the
		// shared renderFeature/renderFeatureList grammar (Task 6 review Finding 4) —
		// real DOM feature cards, not a markdown/YAML round-trip.
		const features = this.layout.features?.(model) ?? [];
		if (features.length) {
			renderFeatureList(card, FeatureConfig.allFrom(features), this, (md, el) => this.renderMarkdown(md, el));
		}

		// Body (Task 9): `bodyMd` — computed above, alongside the duplication guard — is
		// already "whichever markdown should render here": `this.source!.body` in
		// hybrid+useSource mode, the layout's inline `body(model)` otherwise. Rendering it
		// through `renderMarkdown` is what makes a by-SCC hybrid card's nested ds-* blocks
		// (e.g. a kit's signature ability, authored in the source file's body) recurse into
		// real nested DSE cards in real Obsidian — MarkdownRenderer.render there re-enters
		// this plugin's registered code-block processors for any fenced block inside;
		// nothing else in this view has to know about that recursion.
		if (bodyMd && bodyMd.trim()) {
			await this.renderMarkdown(bodyMd, card.createDiv({ cls: 'dse-card__body' }));
		}

		return card;
	}

	/**
	 * Task 2's stub Steel render path: generic over `SteelCardComposition<M>`, so Task 3
	 * can flesh out `kitLayout.steel` (head eyebrow/crest + equipment/stat-tile/signature
	 * bands) as pure layout/band DATA, with no changes needed here. Root stays `.dse-card`
	 * (the plan's Global Constraints: `.dse-card` remains the Steel plate root — the sole
	 * `card-ref` parity pair depends on it). No layout provides `steel` as of Task 2, so
	 * this path is unreachable in production until Task 3 wires `kitLayout.steel` — it is
	 * exercised here only by Task 2's own contract tests, against a test-only layout.
	 */
	private async renderSteel(root: HTMLElement, model: M): Promise<HTMLElement> {
		const composition = this.layout.steel!;
		const card = root.createDiv({ cls: 'dse-card' });

		const crestIcon = composition.crestIcon(model, this.source);
		// Review fix (Task 2 M1): size is composition-sourced (defaulting to 'lg'), not a
		// hardcoded literal — a future adopter can vary it via SteelCardComposition.crestSize
		// without editing this view.
		const crestSize = composition.crestSize?.(model, this.source) ?? 'lg';
		cardHead(
			card,
			{
				name: this.layout.title(model),
				leftEyebrow: composition.eyebrow(model, this.source),
				crest: crestIcon ? { icon: crestIcon, size: crestSize } : undefined,
			},
			this,
		);

		for (const band of composition.bands(model, this.source)) {
			const bandEl = card.createDiv({ cls: 'dse-card__band' });
			if (band.head) bandEl.createDiv({ cls: 'dse-card__band-head', text: band.head });
			await band.render(bandEl, (markdown, el) => this.renderMarkdown(markdown, el));
		}

		return card;
	}
}
