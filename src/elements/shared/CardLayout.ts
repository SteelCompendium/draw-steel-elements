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
// see RefUnwrapView.mountBase). `useSourceBody`/`omitWhenSource` are the flags Task 9's
// wiring reads once a display def is actually wrapped with withReference; no such
// definition exists yet, so `this.source` is always undefined in production today. This
// task lands the flags and the FULL pure-model render path (including how `rows` react to
// hybrid mode being active) — the row-omission behavior already works correctly whenever
// setSource() is called, which the displayCard.test.ts hybrid-mode tests exercise directly.
// What's deliberately a stub: rendering the resolved file's body text itself. That's
// TODO(Task 9) — see onMount's body section below — because the double-render-guard shape
// (which of the source body's own headings/rows would collide with `rows`) isn't decided
// yet; rendering nothing in that branch for now is a correct, honest no-op rather than a
// half-built guess.
import type { Feature } from 'steel-compendium-sdk';
import { ElementView } from '@/framework/view';
import type { RenderContext } from '@/framework/context';
import { renderFeatureList } from '@/elements/feature/renderFeature';
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

		// Hybrid mode is "a RefSource has been threaded in" — true only once Task 9 wires a
		// display def through withReference + RefUnwrapView; always false today.
		const hybrid = this.source !== undefined;
		const useSource = hybrid && this.layout.useSourceBody !== false;

		// Inline body text, computed here (rather than down in the body section below) so
		// the flavor/row duplication guard above can compare against it — only when it will
		// actually render: in hybrid mode `body` never renders inline (Task 9 renders the
		// source body instead per useSourceBody), so there's nothing for `flavor`/rows to
		// duplicate and `omitWhenSource` alone governs row suppression there, untouched by
		// this guard.
		const bodyMd = !useSource ? this.layout.body?.(model) : undefined;
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

		// Body: pure-model path (this task) — the inline `body` field, when the layout
		// carries one and (in hybrid mode) `useSourceBody` doesn't claim it. `bodyMd`/
		// `useSource` were computed above (the duplication guard needs them too).
		//
		// TODO(Task 9): when `hybrid && useSource`, render `this.source!.body` (the
		// resolved compendium file's markdown) instead of the inline `body` — the by-SCC
		// hybrid render this task's flags exist for. Left as a deliberate no-op here (not a
		// half-built `this.source!.body` render) — the double-render-guard interaction with
		// `omitWhenSource` rows is Task 9's design to make, and `this.source` is never set
		// in production yet, so this branch is currently unreachable outside direct tests.
		if (!useSource) {
			if (bodyMd && bodyMd.trim()) {
				await this.renderMarkdown(bodyMd, card.createDiv({ cls: 'dse-card__body' }));
			}
		}
	}
}
