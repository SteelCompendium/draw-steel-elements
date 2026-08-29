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
// Plan 24 / SC-100 Task 2 — the optional composition seam: `CardLayout<M>` carries an
// optional `steel` slot (`SteelCardComposition<M>`, below). Absent (10 of the 11 display
// families) => `renderBase()`, which is the PRE-EXISTING onMount body moved verbatim
// (same statements, same order — the base DOM cannot drift, because it isn't a copy, it's
// the same code relocated). Present (`kitLayout.steel` only, so far) => `renderSteel()`,
// a generic composition renderer driven by band data, no new view code per family.
//
// SC-144 — this used to be a THEME-conditional seam: `computeBranch()` also required
// `cx.theme.active === 'steel'`, so a layout with a composition still rendered the base
// DOM under the legacy theme (or any other non-steel id), and the view kept a
// `cx.theme.onChange` subscription to swap branches live when the user flipped the
// picker. With the legacy theme dropped, Steel is the only theme, the branch is a pure
// property of the LAYOUT, and it can no longer change over a view's lifetime — so the
// subscription, its re-entrancy guard and the tear-down/re-render path are all gone. What
// remains is worth keeping: `renderBranch()` still tracks the created `.dse-card` node in
// `cardEl`, because SC-145's authoring pencil anchors to it (see authoringAnchor()).
//
// One consequence to know about: a hand-set snippet theme id in data.json (the DseThemeId
// union is still open, D3 §6) now gets the STEEL composition where it previously fell
// back to the base DOM. Only the kit card is affected — it is the sole opted-in layout.
import type { Component } from 'obsidian';
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
	 * view-lifecycle-bound helper (`this.renderMarkdown`) the base branch uses — pass
	 * markdown through it (not raw text) so scc-anchor rewriting and owned-child
	 * bookkeeping stay uniform between the two branches. `owner` (Task 3, SC-100) is the
	 * mounted `DisplayCardView` itself — a band that needs to recurse through the shared
	 * `renderFeature`/`renderFeatureList` grammar (e.g. kit's Signature Ability band, the
	 * same real-feature-card mechanism the base branch's `features` slot uses) needs a
	 * `Component` owner for THAT grammar's own child registration; existing band literals
	 * that don't need it can simply omit the third parameter (TS function-type
	 * compatibility — Task 2's own contract test band does exactly this).
	 */
	render: (
		container: HTMLElement,
		renderMarkdown: (markdown: string, el: HTMLElement) => Promise<void>,
		owner: Component,
	) => void | Promise<void>;
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
	/**
	 * SC-120 Batch B (design §3.3): cardHead's right-rail EYEBROW slot (top of the right
	 * rail — e.g. treasure's `rarity`, "Rare"). Optional, same additive contract as
	 * `rightPrimary`/`rightDeck` below: a composition that omits it renders the head
	 * exactly as before. Renders with the `chip` style (`cardHead.ts`'s default for the
	 * right column), which the generic base geometry already styles
	 * (`.dse-head__eyebrow--chip`, `styles-source.css`) — no new CSS needed.
	 */
	rightEyebrow?: (m: M, source?: RefSource) => string | undefined;
	/**
	 * SC-120 Batch A (design §3.1): cardHead's right-rail primary/deck slots — e.g. class's
	 * `primary_characteristics` (joined) over the quiet "primary characteristics" caption.
	 * Optional; a composition that omits both (every family before class) renders the head
	 * exactly as before — `cardHead()`'s `mountSlot` already treats an `undefined` text as a
	 * gap, so this is additive, not a behavior change for kit/ancestry/perk/condition/rule.
	 */
	rightPrimary?: (m: M, source?: RefSource) => string | undefined;
	/** See `rightPrimary` above — cardHead's right-rail DECK slot (the quiet caption line
	 *  under `rightPrimary`). Styled as a caption, not a second chip, by the Steel-scoped
	 *  `.dse-head__deck--right` rule (styles-source.css, design §4.1 item 2). */
	rightDeck?: (m: M, source?: RefSource) => string | undefined;
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
	 * Optional Steel composition (Plan 24 / SC-100). Absent (10 of the 11 display
	 * families) => `DisplayCardView` never takes the `renderSteel()` branch, so behavior
	 * is IDENTICAL to before this field existed. Presence of this slot is now the WHOLE
	 * branch rule (SC-144 — see the file header).
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
// Exported (SC-120 Batch C round-3 review, LOW-1) so a Steel composition's own band-level
// dedup guard (perk's Prerequisites band, layouts.ts) can reuse the SAME threshold
// `renderBase()`'s row guard uses below, instead of a second hand-copied magic number that
// could drift from it.
export const DUPLICATE_ROW_MIN_LENGTH = 20;

/**
 * SC-120 Batch A (design doc §5.1): the link/emphasis-stripping HALF of
 * `normalizeForDuplicateCheck`, pulled out on its own so `plainText()` (below) — which
 * needs the same markdown removal but must PRESERVE case/whitespace — shares one regex
 * pair with the duplicate-check normalizer instead of carrying a second, driftable copy.
 * Site parity: mirrors steel-etl's own `stripMD`/`inlineMD` split (`cards.go`).
 */
export function stripInlineMarkdown(s: string): string {
	return s
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // markdown links -> link text
		.replace(/[*_`]/g, ''); // emphasis/code markers
}

/**
 * Exported (Task 3, SC-100): kit's Steel composition (`layouts.ts`) needs the SAME
 * flavor/body duplicate-text check for its own headless flavor band — a card-family
 * concern, so it lives in the layout's `bands()` closure, not duplicated view logic here
 * — rather than re-deriving an equivalent normalize routine that could drift from this one.
 */
export function normalizeForDuplicateCheck(s: string): string {
	return stripInlineMarkdown(s).replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * SC-120 Batch A (design doc §5.1): strips markdown links/emphasis but PRESERVES case —
 * required by `statTiles()` values, which are `setText`-only (no markdown rendering,
 * `statTiles.ts:54`), unlike `normalizeForDuplicateCheck` (above), which also lowercases
 * and collapses whitespace for comparison purposes and is therefore unusable for DISPLAY.
 * First consumer: class's three potency tiles (`layouts.ts`), whose real values are always
 * `"[Reason](scc.v1:…) − 2"` — the site strips the link the same way (rendered value reads
 * "Reason − 2"). Trims the result (a leading/trailing space can survive link removal at a
 * string's edge) but otherwise leaves whitespace/casing alone.
 */
export function plainText(s: string): string {
	return stripInlineMarkdown(s).trim();
}

/**
 * SC-120 Batch C round-3 review, LOW-2: the single word-casing helper both `layouts.ts`
 * (perk's `${titleCase(perk_group)} Perk` eyebrow) and `displayFamily.ts` (rule's humanized
 * last `type` segment, `genericLayout.steel.eyebrow`) need. Previously duplicated as two
 * near-identical functions with two different split charsets (`layouts.ts`'s `[\s_-]+` vs
 * `displayFamily.ts`'s `[._-]`) — a later casing-edge fix (acronyms, `d&d`-style tokens)
 * landing in one and not the other was the exact drift risk the review flagged. This regex
 * is the UNION of both original charsets, so neither existing consumer's behavior changes:
 * perk_group values never carry a literal `.`, and `type` segments never carry whitespace.
 */
export function titleCase(s: string): string {
	return s
		.split(/[\s._-]+/)
		.filter(Boolean)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');
}

/**
 * SC-120 Batch B (design §5.2): matches a whole line that begins at column 0 with `**` and
 * whose bold run carries a MANDATORY colon, either inside it (`**Skills:**`, every real
 * corpus shape) or immediately after it (`**Skills**:`, accepted defensively). Shared by
 * `stripLabeledLines` below AND `layouts.ts`'s `stripCareerBodyLabels` (Batch A), which
 * this generalizes — group 1 matches the inside-colon shape, group 2 the outside-colon
 * shape; both are plain (unnamed) groups, since named capture groups require ES2018+ and
 * this repo's tsc `target` is ES6 (CLAUDE.md's "Target ES2018" describes the esbuild
 * OUTPUT target, not tsc's own type-check target — Batch A round-5 review LOW-1/LOW-2's
 * fix round hit this the first time).
 */
const LABELED_LINE_RE = /^\*\*(.+?):\*\*|^\*\*(.+?)\*\*:/;

/**
 * SC-120 Batch B fix round 2 (owner ruling 22(ii), r7 review HIGH-1): a GLOBAL sibling of
 * `LABELED_LINE_RE` — same two alternatives, same mandatory colon — used to find EVERY
 * bold-labeled segment within a single physical line, not just the leading one. Real
 * corpus shape (`treasure/1st-echelon/consumable/portable-cloud.md`): a line can pack a
 * label the composition owns together with an unrelated second bold-labeled segment on the
 * SAME line (`**[Item Prerequisite](…):** An ounce of undead flesh. **Thunderhead
 * Cloud:** …` — a whole treasure-variant paragraph). Whole-line stripping deleted the
 * second segment outright; segment-aware stripping removes only the matched label's own
 * span and preserves everything else on the line, verbatim, by construction — no value
 * comparison needed (ruling 22(ii)'s explicit simplification).
 */
const LABELED_SEGMENT_RE = /\*\*(.+?):\*\*|\*\*(.+?)\*\*:/g;

/**
 * SC-120 Batch B fix round 2: exposes the single-line "does this RAW line begin with a
 * labeled bold run, and if so which label (normalized)" test that `stripLabeledLines`
 * itself uses, for a consumer that needs to LOCATE a labeled line without stripping the
 * whole body (treasure's Effect-rider absorption, `layouts.ts`, owner ruling 23(a)).
 * Normalizes via `normalizeForDuplicateCheck` (LOW-2 — link/emphasis-stripped, whitespace-
 * collapsed, lowercased), the same normalization `stripLabeledLines`'s own `wanted` set now
 * uses, so a caller comparing against a plain lowercased label string can no longer drift
 * from what `stripLabeledLines` itself considers a match.
 */
export function matchLabeledLine(line: string): string | undefined {
	const m = LABELED_LINE_RE.exec(line);
	const captured = m?.[1] ?? m?.[2];
	return captured !== undefined ? normalizeForDuplicateCheck(captured) : undefined;
}

/**
 * SC-120 Batch B (design §5.2): generalizes the label-matching core of Batch A's
 * `stripCareerBodyLabels` (`layouts.ts`) — a career-only helper — into a shared function
 * every Steel composition using body policy (B) can call directly: career, treasure,
 * title, complication, culture. `stripCareerBodyLabels` itself is refactored to call this
 * (plus its own career-only lead-in-sentence pass), rather than keeping two copies of the
 * bold-label-matching loop that could drift (Batch B brief, explicitly naming this
 * consolidation).
 *
 * **Callers are responsible for BAND-GATING `labels`** (owner ruling 22(i), r7 review
 * HIGH-2): pass only the labels whose replacing band/value actually rendered THIS call —
 * never an unconditional "every label this family might ever own" list. A label whose
 * band did not render is never stripped, so its body line survives (duplication, never
 * deletion — ruling 22(iii)) instead of vanishing with no structural replacement.
 *
 * Matches ONLY a whole line that (i) begins at column 0 with `**` (an indented
 * continuation line under a list item never matches — Batch A round-5 review LOW-2: the
 * match runs against the RAW line, never the trimmed one), (ii) whose bold run's plain
 * text (link/emphasis stripped via `normalizeForDuplicateCheck`) case-insensitively equals
 * one of `labels` — the labels themselves are markdown LINKS in real data
 * (`**[Item Prerequisite](…):** …`, `**[Renown](…):** +1`), so the match is on the bold
 * run's LINK TEXT, not the raw line — with a MANDATORY colon (Batch A round-5 review
 * LOW-1: a bold-led PROSE sentence with no colon at all, e.g. "**Wealth** is a measure
 * of…", is never mistaken for a labeled line). `labels` itself is now run through
 * `normalizeForDuplicateCheck` too (fix round 2, LOW-2), not a bare `toLowerCase()` — a
 * label carrying a markdown link/extra whitespace (treasure's data-derived per-tier
 * labels, `${key} Level`, or a multi-link label like "Project Roll Characteristic") now
 * compares on the SAME normalization the captured text goes through, so the two sides can
 * never silently drift apart.
 *
 * **Segment-aware, not whole-line (fix round 2, ruling 22(ii)):** once a line's LEADING
 * label is wanted, the line is split into every bold-labeled segment it carries (via
 * `LABELED_SEGMENT_RE`) and ONLY the segments whose own label is wanted are dropped —
 * every other segment on the same physical line (a second, unrelated bold-labeled
 * paragraph sharing the line) survives verbatim, concatenated back together. A line with
 * exactly one segment behaves exactly as before (the whole line drops when wanted, is kept
 * whole otherwise). Swallows a single immediately-following blank line only when the ENTIRE
 * line was consumed (every segment dropped) — never a following paragraph, so a table or a
 * rider paragraph (treasure's "Additionally, …" after `**Effect:**`) always survives.
 *
 * **First occurrence only (fix round 2, extending ruling 22(iii)'s "duplication over
 * deletion" to a REPEATED label, not just a packed line):** each wanted label is dropped at
 * most ONCE across the whole document — the occurrence a caller's structural band actually
 * rendered is always the first one in reading order (real corpus data never repeats a label
 * before its "canonical" occurrence). A repeat of the SAME label further down — real corpus
 * shape, `portable-cloud.md` carries three `**[Item Prerequisite](…):**` lines for three
 * distinct treasure variants — is a DIFFERENT value with nothing structural covering it, so
 * it is left in the body untouched (whole line, or whole segment on a packed line) rather
 * than silently deleted for merely sharing a label with the one the band already rendered.
 * Still no value comparison (ruling 22(ii)'s stated simplification survives) — this tracks
 * OCCURRENCE COUNT per label, never the label's text content.
 */
export function stripLabeledLines(md: string, labels: string[]): string {
	const wanted = new Set(labels.map((l) => normalizeForDuplicateCheck(l)));
	const consumed = new Set<string>();
	const lines = md.split('\n');
	const kept: string[] = [];
	let skipBlankAfter = false;
	for (const line of lines) {
		if (skipBlankAfter) {
			skipBlankAfter = false;
			if (line.trim() === '') continue; // swallow ONE blank line right after a stripped line
		}
		const leadingCaptured = matchLabeledLine(line);
		if (leadingCaptured === undefined || !wanted.has(leadingCaptured)) {
			kept.push(line);
			continue;
		}
		// The line's leading label is wanted — split into every bold-labeled segment on
		// this physical line and keep only the ones whose OWN label is not wanted, OR
		// already consumed by an earlier occurrence (ruling 22(ii)/(iii)). `matchAll`
		// clones the (global, stateless-per-call) regex internally, so reusing
		// `LABELED_SEGMENT_RE` across lines/calls is safe.
		const segments = [...line.matchAll(LABELED_SEGMENT_RE)];
		const survivors: string[] = [];
		for (let i = 0; i < segments.length; i++) {
			const captured = segments[i][1] ?? segments[i][2];
			const start = segments[i].index;
			const end = i + 1 < segments.length ? segments[i + 1].index : line.length;
			const normalizedCaptured = captured !== undefined ? normalizeForDuplicateCheck(captured) : undefined;
			if (normalizedCaptured !== undefined && wanted.has(normalizedCaptured) && !consumed.has(normalizedCaptured)) {
				consumed.add(normalizedCaptured); // drop this segment -- its label's FIRST occurrence
				continue;
			}
			survivors.push(line.slice(start, end));
		}
		const remainder = survivors.join('').trim();
		if (remainder) {
			kept.push(remainder);
		} else {
			skipBlankAfter = true;
		}
	}
	return kept
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
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
	 * The `.dse-card` node this view most recently created — tracked because SC-145's
	 * authoring pencil anchors to it (authoringAnchor(), below), not to root. Set at the
	 * end of every `renderBranch()` call; only ever undefined before the first render
	 * has completed.
	 */
	private cardEl?: HTMLElement;

	constructor(
		cx: RenderContext,
		private readonly layout: CardLayout<M>,
	) {
		super(cx);
	}

	setSource(source: RefSource): void {
		this.source = source;
	}

	/**
	 * SC-145: the visible card frame here is `.dse-card` (a child of root, not root
	 * itself — see renderBase/renderSteel below, both `root.createDiv({ cls:
	 * 'dse-card' })`), so the generic authoring pencil must anchor to THAT node, not
	 * root, or it renders as a stray sibling below/outside the card's border. Falls
	 * back to `rootEl` only in the defensive case the pipeline ever asked before the
	 * first render completed (cardEl unset) — never true in production (mount() always
	 * runs onMount, which always sets cardEl, before the pipeline reads this).
	 */
	authoringAnchor(): HTMLElement {
		return this.cardEl ?? this.rootEl;
	}

	protected async onMount(root: HTMLElement, model: M): Promise<void> {
		await this.renderBranch(root, model);
	}

	/** Render the branch this layout selects and track the `.dse-card` it created. */
	private async renderBranch(root: HTMLElement, model: M): Promise<void> {
		this.cardEl = this.computeBranch() === 'steel'
			? await this.renderSteel(root, model)
			: await this.renderBase(root, model);
	}

	/** The single branch-selection rule (SC-144): a layout that opted into a Steel
	 *  composition gets it, every other layout gets the base DOM. This is a static
	 *  property of the layout — it cannot change over a mounted view's lifetime, which
	 *  is why this view registers no theme subscription and needs no re-render path. */
	private computeBranch(): 'base' | 'steel' {
		return this.layout.steel ? 'steel' : 'base';
	}

	/**
	 * The canonical (and, for every layout without a `steel` composition, ONLY) render
	 * path — moved verbatim from the pre-Task-2 `onMount` body (same statements, same
	 * order), so this DOM cannot drift: it isn't a copy of the old logic, it IS the old
	 * logic, relocated. Returns the created `.dse-card` node so the caller can track it.
	 */
	private async renderBase(root: HTMLElement, model: M): Promise<HTMLElement> {
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
				// SC-120 Batch A/B: composition-sourced right-rail slots (default undefined,
				// same "an omitted slot is a GAP" contract cardHead already has) — additive
				// for every composition that doesn't supply them (kit/ancestry/perk/
				// condition/rule/career), so their rendered head is byte-for-byte unchanged.
				rightEyebrow: composition.rightEyebrow?.(model, this.source),
				rightPrimary: composition.rightPrimary?.(model, this.source),
				rightDeck: composition.rightDeck?.(model, this.source),
				crest: crestIcon ? { icon: crestIcon, size: crestSize } : undefined,
			},
			this,
		);

		for (const band of composition.bands(model, this.source)) {
			const bandEl = card.createDiv({ cls: 'dse-card__band' });
			if (band.head) bandEl.createDiv({ cls: 'dse-card__band-head', text: band.head });
			await band.render(bandEl, (markdown, el) => this.renderMarkdown(markdown, el), this);
		}

		return card;
	}
}
