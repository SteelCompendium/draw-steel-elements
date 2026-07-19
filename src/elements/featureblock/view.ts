// Plan 09 Task 6a (D2 §3.7) — FeatureblockElementView on the D2 kit card grammar.
//
// Re-cast from the legacy FeatureblockView sub-view tree (HeaderView +
// FeatureblockStatsView + HR + FeaturesView) onto the site's Forged Band card:
//
//   .dse-fb[data-dse-role][data-dse-fb-stats]   ← the card root (role tint + stat layout)
//     .dse-head                                 ← kit cardHead (§3.7 slot fill below)
//     .dse-fb__flavor                           ← italic flavor (markdown)
//     .dse-fb__stats > .dse-fb__stat            ← the loose-stat header (label/value cells)
//     .dse-hr (kit divider, ornament)           ← the legacy ◆ rule before the features
//     .dse-feature__nested > .dse-feature…      ← Task 5's renderFeatureList (shared grammar)
//     .dse-fb__band--adv[data-level]            ← Level>0 advancement runs (mirrors the site)
//
// §3.7 cardHead fill from the SDK's ONE type field (`featureblock_type`): when it
// carries a combat-role word ("Hazard Hexer") it is the role/category → right-primary
// (role-tinted); otherwise it IS the kind-noun ("Malice Features" / "Dynamic Terrain" /
// "Fixture") → left-eyebrow. Exactly one slot carries it, verbatim — no invented words,
// no duplication. Level → right-eyebrow chip, EV → right-deck chip (legacy wording:
// "Level N" / "EV X").
//
// Role tint: [data-dse-role="<role>"] + the --dse-role ELEMENT-SET ALIAS
// (--dse-role: var(--dse-role-<role>)) — the same fails-safe pattern as renderFeature's
// data-dse-act. Unmapped types set NEITHER (grey/monochrome fallback); in Legacy every
// --dse-role-* token is the muted grey, so the accent is Steel-only (OD-2). The role
// vocabulary + application live in the SHARED roleTint helper (extracted for T6b —
// statblock tints from its SDK roles line with the same map).
//
// This IS the featureblock render-subsystem evolution the workspace memory
// (featureblock-refactor-in-flight) tracks — built cleanly on the kit grammar, not
// entangled with the legacy builders. The legacy FeatureblockView + sub-views stay in
// the codebase UNTOUCHED — since T6b they are element-dead code; Task 10 retires them.
//
// Static + SDK-backed: no persistence, no interactive controls. All markdown renders
// through this.renderMarkdown (owner-parented, ML-1) passed to the kit/renderer as the
// renderMd callback.
import type { Feature } from 'steel-compendium-sdk';
import { ElementView } from '@/framework/view';
import type { RenderContext } from '@/framework/context';
import { cardHead, divider } from '@/framework/kit';
import type { RenderMdCallback } from '@/framework/kit';
import { renderFeatureList } from '@/elements/feature/renderFeature';
import { featureRollHooks } from '@/elements/feature/rollController';
import { applyRoleTint } from '@/elements/roleTint';
import { FeatureConfig } from '@model/FeatureConfig';
import type { FeatureblockConfig } from '@model/FeatureblockConfig';

/** A feature's advancement level: the untyped `level` field the SDK reader preserves
 *  on the Feature object (fixture/retainer advancement tiers). 0 = the main flow. */
function featureLevelOf(feature: Feature): number {
	const raw = (feature as Feature & { level?: unknown }).level;
	const n = typeof raw === 'number' ? raw : Number(raw);
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export class FeatureblockElementView extends ElementView<FeatureblockConfig> {
	constructor(cx: RenderContext) {
		super(cx);
		// D5 roll-pref re-mount — see FeatureElementView's constructor comment.
		const remount = (): void => {
			if (this.rootEl) void this.update(this.model);
		};
		cx.prefs.subscribe('rollingEnabled', this, remount);
		cx.prefs.subscribe('rollClickToRoll', this, remount);
	}

	protected onMount(root: HTMLElement, model: FeatureblockConfig): void {
		const fb = model.featureblock;
		const renderMd: RenderMdCallback = (md, el) => this.renderMarkdown(md, el);

		const card = root.createDiv({ cls: 'dse-fb' });
		// Stat-layout hook (D4 owns the pref; static default = grid, like the site).
		card.setAttribute('data-dse-fb-stats', 'grid');

		const typeText = fb.featureblock_type?.trim() || undefined;
		const role = applyRoleTint(card, typeText);

		// -- cardHead (§3.7 fill; legacy header wording preserved verbatim) --
		cardHead(
			card,
			{
				leftEyebrow: role ? undefined : typeText,
				name: fb.name ?? '',
				rightEyebrow: fb.level !== undefined ? `Level ${fb.level}` : undefined,
				rightPrimary: role ? typeText : undefined,
				rightDeck: fb.ev !== undefined ? `EV ${fb.ev}` : undefined,
				level: 2, // the block heading; nested feature cards default to 3
			},
			this,
		);

		// -- flavor (markdown, owner-parented) --
		if (fb.flavor) {
			void renderMd(fb.flavor, card.createDiv({ cls: 'dse-fb__flavor' }));
		}

		this.renderStats(card, model);
		this.renderFeatures(card, model, renderMd);
	}

	/** The loose-stat header: Stamina/Size first (the legacy fixed row), then the named
	 *  stats — label/value cells, verbatim text; the "label: " colon is CSS-owned. */
	private renderStats(card: HTMLElement, model: FeatureblockConfig): void {
		const fb = model.featureblock;
		const pairs: Array<[string, string]> = [];
		if (fb.stamina) pairs.push(['Stamina', String(fb.stamina)]);
		if (fb.size) pairs.push(['Size', String(fb.size)]);
		for (const stat of fb.stats ?? []) {
			pairs.push([stat.name, stat.value]);
		}
		if (pairs.length === 0) return;

		const statsEl = card.createDiv({ cls: 'dse-fb__stats' });
		for (const [label, value] of pairs) {
			const cell = statsEl.createDiv({ cls: 'dse-fb__stat' });
			cell.createSpan({ cls: 'dse-fb__stat-l', text: label });
			cell.createSpan({ cls: 'dse-fb__stat-v', text: value });
		}
	}

	/** The feature list on Task 5's shared grammar. Contiguous Level>0 runs wrap in a
	 *  .dse-fb__band--adv advancement band (mirrors the site's fb__band--adv); level-0
	 *  features render in the main flow. Typical blocks carry no levels → no bands. */
	private renderFeatures(
		card: HTMLElement,
		model: FeatureblockConfig,
		renderMd: RenderMdCallback,
	): void {
		const features = model.featureblock.features;
		if (!features || features.length === 0) return;

		// The legacy ◆ rule between the stat header and the features, as the kit
		// divider (Legacy-faithful ornament; Steel re-skins via tokens).
		divider(card, { axis: 'h', ornament: true }, this);

		type Run = { level: number; features: Feature[] };
		const runs: Run[] = [];
		for (const feature of features) {
			const level = featureLevelOf(feature);
			const last = runs[runs.length - 1];
			if (last && last.level === level) last.features.push(feature);
			else runs.push({ level, features: [feature] });
		}

		for (const run of runs) {
			let host = card;
			if (run.level > 0) {
				host = card.createDiv({ cls: 'dse-fb__band--adv' });
				host.setAttribute('data-level', String(run.level));
				host.createDiv({ cls: 'dse-fb__adv-head', text: `Level ${run.level} Advancement` });
			}
			renderFeatureList(host, FeatureConfig.allFrom(run.features), this, renderMd, {
				roll: featureRollHooks(this.cx),
				// SC-10 Task 5: featureblock options carry the SDK's own icon glyph
				// (site's fb__feat-icon) instead of the generic act-based crest.
				featBlockIcon: true,
			});
		}
	}
}
