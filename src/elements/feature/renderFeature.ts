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
//     .dse-head                          ← kit cardHead: name(heading) · cost · ability_type
//     .dse-feature__flavor               ← italic flavor
//     .dse-feature__meta                 ← Keywords/Type/Distance/Target grid
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
export type ActionType = 'main' | 'maneuver' | 'triggered' | 'move' | 'none' | 'trait';

export interface RenderFeatureOptions {
	/** aria-level for the cardHead name heading. Default 3; nested abilities get +1. */
	headingLevel?: number;
	/** D5 (Plan 14): roll interactivity hooks. ABSENT ⇒ output byte-identical to
	 *  the pre-D5 grammar (the fidelity bar); present ⇒ each rolling effect gains
	 *  a roll controller. Built by featureRollHooks(cx) in the element views. */
	roll?: FeatureRollHooks;
}

/**
 * Maps a feature's action type onto the [data-dse-act] spine vocabulary. Traits are
 * their own accent; otherwise the usage line (falling back to ability_type) decides.
 * Returns undefined when nothing maps — the caller then sets NO attribute/alias, so
 * the accent fails safe (D2 §3.6).
 */
export function actionTypeOf(config: FeatureConfig): ActionType | undefined {
	if (config.feature.isTrait()) return 'trait';
	const source = (config.feature.usage ?? config.feature.ability_type ?? '').toLowerCase();
	if (!source) return undefined;
	// Order matters: "Move action" / "No action" / "Triggered action" all contain
	// "action", so the generic main-action match must come LAST.
	if (source.includes('maneuver')) return 'maneuver';
	if (source.includes('trigger')) return 'triggered';
	if (source.includes('move')) return 'move';
	if (source.includes('no action')) return 'none';
	if (source.includes('action')) return 'main';
	return undefined;
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
	if (feature.name || feature.cost || feature.ability_type) {
		const head = cardHead(
			rootEl,
			{
				name: '',
				rightEyebrow: feature.cost ? '' : undefined,
				rightPrimary: feature.ability_type ? '' : undefined,
				level,
			},
			owner,
		);
		if (feature.name) md(feature.name, head.nameEl, true);
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
		const cell = (modifier: string, label: string, value: string): void => {
			const cellEl = metaEl.createSpan({
				cls: `dse-feature__meta-cell dse-feature__meta-cell--${modifier}`,
			});
			cellEl.createSpan({ cls: 'dse-feature__meta-key', text: label });
			md(value, cellEl.createSpan({ cls: 'dse-feature__meta-value' }), true);
		};
		if (feature.keywords) {
			cell('keywords', 'Keywords', feature.keywords.length > 0 ? feature.keywords.join(', ') : '');
		}
		if (feature.usage) cell('type', 'Type', feature.usage);
		if (feature.distance) cell('distance', 'Distance', feature.distance);
		if (feature.target) cell('target', 'Target', feature.target);
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
		const cost = effect.cost ? ` (${String(effect.cost).trim()})` : '';
		const title = (effect.name ? effect.name + cost : cost).trim();
		const hostEl =
			title || effect.effect ? section(parentEl, title || undefined, effect.effect) : parentEl;

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
				headingLevel: Math.min(level + 1, 6),
				roll: opts.roll,
			});
		}
	}
}
