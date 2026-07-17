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

		const flavor = this.layout.flavor?.(model);
		if (flavor) await this.renderMarkdown(flavor, card.createDiv({ cls: 'dse-card__flavor' }));

		// Hybrid mode is "a RefSource has been threaded in" — true only once Task 9 wires a
		// display def through withReference + RefUnwrapView; always false today.
		const hybrid = this.source !== undefined;
		const rows = (this.layout.rows ?? []).filter((r) => !(hybrid && r.omitWhenSource));
		const rendered: Array<{ row: FieldRow<M>; value: string }> = [];
		for (const row of rows) {
			const value = row.value(model);
			if (value != null && value !== '') rendered.push({ row, value });
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
		// carries one and (in hybrid mode) `useSourceBody` doesn't claim it.
		//
		// TODO(Task 9): when `hybrid && useSource`, render `this.source!.body` (the
		// resolved compendium file's markdown) instead of the inline `body` — the by-SCC
		// hybrid render this task's flags exist for. Left as a deliberate no-op here (not a
		// half-built `this.source!.body` render) — the double-render-guard interaction with
		// `omitWhenSource` rows is Task 9's design to make, and `this.source` is never set
		// in production yet, so this branch is currently unreachable outside direct tests.
		const useSource = hybrid && this.layout.useSourceBody !== false;
		if (!useSource) {
			const bodyMd = this.layout.body?.(model);
			if (bodyMd && bodyMd.trim()) {
				await this.renderMarkdown(bodyMd, card.createDiv({ cls: 'dse-card__body' }));
			}
		}
	}
}
