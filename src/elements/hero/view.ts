// D7 Task 9 (spec §3.2/§3.3, OD-5/6/8, recon delta 1/5/7) — HeroSheetView: the flagship
// sheet. Composes the extracted kit cores (Task 1: CharacteristicsGrid/StaminaBarPanel/
// conditionIcons), the standalone panels (Task 2/3/5: ConditionsPanel/ResourcePanel/
// SurgePanel), Task 8's view-level compendium resolution + derived stats, and the
// EXISTING `setCharacteristicProvider` roll bridge (recon delta 1: feature/view.ts:43 —
// the D7 spec's own `RollService.rollPower(req)` sketch is superseded by this, no new
// roll interface here). One model (`HeroModel`), one persist target — every region
// mutates `model.state` directly and calls `void this.persist()` (F1 §4.2's debounced
// write-behind); the state-scoped splice (Task 7) keeps the authored `hero:` definition
// byte-stable across every play edit.
//
// Container/presentational split (spec §2.1): Resource/Surges/Conditions reuse their
// REAL `HeroPanel<S>` cores (Task 2/3/5) exactly as their own standalone containers do —
// this view is just another `PanelHost`. Characteristics/Stamina have no HeroPanel
// wrapper (Task 1 only extracted raw render functions, spec §2.3's own fallback: "the
// kit's neutral {current,temp,max}/{might,...} shape, not a StaminaBar/StaminaBar-model
// panel class") — this view builds those two regions directly, mirroring
// StaminaBarView's own Task 4 recoveries/winded/Catch-Breath code (not reusable as-is:
// that view is bound to the STANDALONE `ds-stamina` model, not `HeroState`).
//
// Abilities (OD-5): compact rows, eagerly resolved to `FeatureConfig` at mount (SCC refs
// via `cx.compendium`, inline objects via `FeatureConfig.readYaml`) so the compact row
// can show a real name/cost/type and the cost/type `tabs` filter can classify them —
// but the HEAVY per-row DOM (the full ability card) stays lazy: only mounted on first
// expand, via a real `FeatureElementView` (`this.addChild` + `setCharacteristicProvider`
// + `.mount`), matching spec §3.3's "row -> expand -> the migrated Feature/Ability view".
// Each expanded card gets its OWN namespaced SessionStore view (distinct roll-bar/
// history slots per ability row, since `featureRollHooks` keys off a single blockKey and
// a per-row `renderFeature` call always restarts its own rollable-effect ordinal at 0).
// Surges are spent only by explicit player choice via the SurgePanel's own stepper
// (spec §1.4) — rolling never auto-decrements `state.surges`.
//
// Definition editor (recon delta 5): "Edit definition" reuses D9's `openFormEditor`
// directly (`cx.validation`, threaded through by this task — see framework/context.ts)
// with `def.authoring.fields.state.hidden` (definition.ts) so the form never surfaces a
// raw-YAML textarea for the play surface. The pipeline's OWN generic authoringControls
// pencil is suppressed for this element (`noAuthoringButton: true`, definition.ts) so
// there is exactly one, well-placed affordance (header, next to `[respite]`).
import { stringifyYaml } from 'obsidian';
import { ElementView } from '@/framework/view';
import type { RenderContext } from '@/framework/context';
import type { ElementDefinition } from '@/framework/registry';
import type { PanelHost } from '@/framework/kit';
import { iconButton, renderCharacteristicsGrid, renderStaminaBar, updateStaminaBar, stepper, tabs, tooltip } from '@/framework/kit';
import type { CharacteristicsValues, IconButtonHandle, StaminaBarValues, StepperHandle } from '@/framework/kit';
import { openFormEditor } from '@/authoring/FormModal';
import { FeatureConfig } from '@model/FeatureConfig';
import { actionTypeOf } from '@/elements/feature/renderFeature';
import { FeatureElementView } from '@/elements/feature/view';
import { ResourcePanel } from '@/elements/resource/panel';
import type { ResourceSlice } from '@/elements/resource/panel';
import { SurgePanel } from '@/elements/surges/panel';
import type { SurgeSlice } from '@/elements/surges/panel';
import { ConditionsPanel } from '@/elements/conditions/panel';
import type { CharacteristicProvider } from '@/framework/roll/binding';
import type { CharacteristicName } from '@/framework/roll/types';
import type { SessionStore } from '@/framework/session';
import { resolveHeroDefinition } from './resolve';
import type { ResolvedHeroDefinition } from './resolve';
import { deriveHeroStats } from './deriveHeroStats';
import type { DerivedStats } from './deriveHeroStats';
import { HeroModel } from './model';
import type { Condition, HeroStamina } from './model';
import { recoveryHealAmount } from '@model/StaminaBar';

const READ_ONLY_TOOLTIP = 'Read-only in this context';
// Matches TYPE_ADAPTERS' bare-feature scope (typeAdapters.ts) — abilities[] entries are
// resolved by THIS task (spec §3.5: "left unresolved... Task 9's job"), mirroring
// resolve.ts's ladder but for the `feature` family instead of class/ancestry/kit.
const FEATURE_TYPE_RE = /^feature($|\.)/;

interface AbilityEntry {
	raw: string | Record<string, unknown>;
	config?: FeatureConfig;
	issue?: string;
}

type AbilityTab = 'all' | 'signature' | 'heroic' | 'triggered';

interface AbilityRowHandle {
	rowEl: HTMLElement;
}

export class HeroSheetView extends ElementView<HeroModel> {
	private resolved: ResolvedHeroDefinition = { kits: [], issues: [] };
	private stats!: DerivedStats;
	private provider!: CharacteristicProvider;

	// -- stamina region --
	private staminaBarEl: HTMLElement | null = null;
	private staminaStepper: StepperHandle | null = null;
	private recPipsEl: HTMLElement | null = null;
	private recStatusEl: HTMLElement | null = null;
	private catchBreathHandle: IconButtonHandle | null = null;

	// -- panels (real HeroPanel<S> instances, §2.1) --
	private resourcePanel: ResourcePanel | null = null;
	private surgePanel: SurgePanel | null = null;
	private conditionsPanel: ConditionsPanel | null = null;
	private conditionsStatusEl: HTMLElement | null = null;

	// -- header --
	private respiteHandle: IconButtonHandle | null = null;

	// -- abilities --
	private abilities: AbilityEntry[] = [];
	private abilityRows: AbilityRowHandle[] = [];

	constructor(
		cx: RenderContext,
		private readonly def: ElementDefinition<HeroModel>,
	) {
		super(cx);
	}

	private get readOnly(): boolean {
		return !this.cx.host.canPersist;
	}

	protected async onMount(root: HTMLElement, model: HeroModel): Promise<void> {
		// Task 8's view-level resolution + derived stats (spec §3.5) — awaited here so
		// every region below renders off already-settled numbers/names; degrades per-ref
		// (resolved.issues), never throws (resolve.ts's own contract).
		this.resolved = await resolveHeroDefinition(model.defn, this.cx.compendium);
		this.stats = deriveHeroStats(model.defn, this.resolved);
		// Recon delta 1: the bridge feature/view.ts already defines — this sheet builds
		// the provider once from the AUTHORED characteristics (spec §3.1: characteristics
		// live in the definition, not derived) and hands it to every ability card.
		this.provider = { get: (ch: CharacteristicName) => model.defn.characteristics[ch] };
		// Abilities[] resolution is THIS task's job (spec §3.5) — eager for the compact
		// row's name/cost/type + the tabs filter; the heavy full-card DOM stays lazy
		// (renderAbilityRow's expand toggle).
		this.abilities = await Promise.all((model.defn.abilities ?? []).map((raw) => this.resolveAbility(raw)));

		// A dedicated child carries the `.dse-hero` class (the pipeline's own `root`
		// already carries `data-dse-element="hero"` — this mirrors every other element's
		// convention of scoping its CSS off a CHILD of the pipeline root, e.g.
		// ResourcePanel's `root.addClass('dse-res')` runs on the region div THIS view
		// creates and hands it, never on the pipeline root itself).
		const sheet = root.createDiv({ cls: 'dse-hero' });
		this.renderHeader(sheet, model);
		this.renderRefIssues(sheet);

		const grid = sheet.createDiv({ cls: 'dse-hero__grid' });
		this.renderCharacteristicsRegion(grid, model);
		this.renderStaminaRegion(grid, model);
		this.renderResourceRegion(grid, model);
		this.renderSurgeRegion(grid, model);
		this.renderConditionsRegion(grid, model);
		this.renderSkillsRegion(grid, model);
		this.renderAbilitiesRegion(sheet);
	}

	// ---------------------------------------------------------------- header

	private renderHeader(root: HTMLElement, model: HeroModel): void {
		const header = root.createDiv({ cls: 'dse-hero__header' });
		const titleWrap = header.createDiv({ cls: 'dse-hero__title' });
		titleWrap.createEl('h2', { cls: 'dse-hero__name', text: model.defn.name });

		// RR §13: echelon derives from level (1-3/4-6/7-9/10) — mirrors
		// deriveHeroStats.ts's private echelonForLevel (not exported; duplicated here as
		// the same 4-line citation rather than widening that file's exports for one call).
		const level = model.defn.level;
		const echelon = level >= 10 ? 4 : level >= 7 ? 3 : level >= 4 ? 2 : 1;
		const metaBits = [`Lvl ${level}`, `Echelon ${echelon}`];
		if (this.resolved.ancestry) metaBits.push(this.resolved.ancestry.name);
		titleWrap.createDiv({ cls: 'dse-hero__meta', text: metaBits.join(' · ') });

		const classBits: string[] = [];
		if (this.resolved.class) {
			classBits.push(model.defn.subclass ? `${this.resolved.class.name} (${model.defn.subclass})` : this.resolved.class.name);
		}
		if (this.resolved.kits.length > 0) {
			const noun = this.resolved.kits.length === 1 ? 'kit' : 'kits';
			classBits.push(`${this.resolved.kits.map((k) => k.name).join(', ')} ${noun}`);
		}
		if (classBits.length > 0) titleWrap.createDiv({ cls: 'dse-hero__class-line', text: classBits.join(' · ') });

		const actions = header.createDiv({ cls: 'dse-hero__actions' });
		this.respiteHandle = iconButton(
			actions,
			{
				icon: 'sparkles',
				label: 'Respite',
				text: 'Respite',
				variant: 'ghost',
				disabled: this.readOnly,
				tooltip: this.readOnly
					? READ_ONLY_TOOLTIP
					: 'Restore Stamina + Recoveries; clear Surges, temp Stamina, and end-of-encounter conditions',
				onClick: () => this.respite(),
			},
			this,
		);

		// Recon delta 5: reuse D9's openFormEditor for the definition half. Only shown
		// when writable (mirrors the pipeline's OWN generic affordance, which this
		// element suppresses via noAuthoringButton — definition.ts) and when the
		// authoringControls pref is on; degrades to absent (never a dead-end click) when
		// cx.validation isn't threaded (bare test/harness contexts).
		if (!this.readOnly && this.cx.validation && this.isAuthoringControlsOn()) {
			iconButton(
				actions,
				{
					icon: 'settings',
					label: 'Edit definition',
					variant: 'ghost',
					onClick: () => this.editDefinition(),
				},
				this,
			);
		}
	}

	/** Mirrors pipeline.ts's own defensive `isAuthoringControlsOn` (not exported): a
	 *  bare PreferenceStore that never `describe()`d the full catalog would throw on
	 *  `.get('authoringControls')` — treat "not registered" as "off". */
	private isAuthoringControlsOn(): boolean {
		if (!this.cx.prefs.descriptors().some((d) => d.key === 'authoringControls')) return false;
		return this.cx.prefs.get('authoringControls') === true;
	}

	private editDefinition(): void {
		if (this.readOnly || !this.cx.validation) return;
		// The FULL current source (defn + state), not just the definition text: the
		// form's `working` object is seeded from this whole parse, and `state` — hidden
		// from the FORM FIELDS (definition.ts's authoring.fields) but NOT stripped from
		// the schema — rides through untouched on Save (FormModal.ts's currentBody()
		// re-runs def.parse/def.serialize over `working`, which still carries the
		// original `state` value). Handing it only the defn half would instead make
		// HeroModel.parse seed FRESH DEFAULTS for state on Save — silently resetting
		// play state on every definition edit (task-7-review.md's flagged footgun).
		openFormEditor(this, this.cx, this.def, this.model.serializeStateSplice(), this.cx.validation);
	}

	private renderRefIssues(root: HTMLElement): void {
		if (this.resolved.issues.length === 0) return;
		const wrap = root.createDiv({ cls: 'dse-hero__issues' });
		for (const issue of this.resolved.issues) {
			const notice = wrap.createDiv({ cls: 'dse-hero-ref-issue', text: issue.reason });
			notice.setAttribute('data-field', issue.field);
			notice.setAttribute('data-code', issue.code);
		}
	}

	private respite(): void {
		if (this.readOnly) return;
		const model = this.model;
		const max = this.stats.maxStamina.value;
		if (max !== null) model.state.stamina.current = max;
		model.state.stamina.temp = 0;
		const recMax = this.stats.recoveriesMax.value;
		if (recMax !== null) model.state.recoveries = recMax;
		model.state.surges = 0;
		// spec §3.2/OD-8: clear end-of-encounter conditions only (save-ends/EoT survive
		// a respite — only EoE is scoped "clear" by the header action).
		model.state.conditions = (model.state.conditions ?? []).filter((c) => this.conditionDuration(c) !== 'eoe');

		this.refreshStaminaRegion(model);
		this.surgePanel?.updatePanel(this.surgeSlice(model));
		this.refreshConditionsRegion(model);
		void this.persist();
	}

	private conditionDuration(c: Condition): string {
		return (c.effect ?? '').trim().toLowerCase();
	}

	// ---------------------------------------------------------------- characteristics

	private renderCharacteristicsRegion(container: HTMLElement, model: HeroModel): void {
		const region = this.region(container, 'characteristics', 'Characteristics');
		const values: CharacteristicsValues = model.defn.characteristics;
		renderCharacteristicsGrid(region, values);
	}

	// ---------------------------------------------------------------- stamina

	private renderStaminaRegion(container: HTMLElement, model: HeroModel): void {
		const region = this.region(container, 'stamina', 'Stamina');

		this.staminaBarEl = renderStaminaBar(region, this.staminaValues(model), { canPersist: false });

		const stepperWrap = region.createDiv({ cls: 'dse-hero__stamina-stepper' });
		this.staminaStepper = stepper(
			stepperWrap,
			{
				value: model.state.stamina.current,
				min: this.stats.deathThreshold.value ?? undefined,
				max: this.stats.maxStamina.value ?? undefined,
				editable: !this.readOnly,
				integer: true,
				label: 'Stamina',
				onChange: (value) => this.applyStaminaChange({ current: value }),
			},
			this,
		);
		if (this.readOnly) {
			this.staminaStepper.rootEl.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
				btn.disabled = true;
			});
		}

		const recMax = this.stats.recoveriesMax.value;
		if (recMax !== null) this.renderRecoveries(region, model, recMax);
	}

	private staminaValues(model: HeroModel): StaminaBarValues {
		return { current: model.state.stamina.current, temp: model.state.stamina.temp, max: this.stats.maxStamina.value ?? 0 };
	}

	/** D7 Task 4's pattern (stamina-bar/view.ts renderRecoveries), re-expressed against
	 *  HeroState + deriveHeroStats instead of the standalone StaminaBar model — that
	 *  view can't be reused directly (it owns its own ElementView<StaminaBar>). */
	private renderRecoveries(container: HTMLElement, model: HeroModel, recMax: number): void {
		const wrap = container.createDiv({ cls: 'dse-stamina-rec' });
		this.recStatusEl = wrap.createDiv({ cls: 'dse-stamina-rec__status' });
		this.recPipsEl = wrap.createDiv({ cls: 'dse-stamina-rec__pips' });
		for (let i = 0; i < recMax; i++) this.recPipsEl.createDiv({ cls: 'dse-stamina-rec__pip' });

		this.catchBreathHandle = iconButton(
			wrap,
			{ icon: 'wind', label: 'Catch Breath', text: 'Catch Breath', onClick: () => this.catchBreath() },
			this,
		);
		if (this.readOnly) tooltip(this.catchBreathHandle.buttonEl, READ_ONLY_TOOLTIP);

		this.updateRecoveries(model);
	}

	private updateRecoveries(model: HeroModel): void {
		if (!this.recPipsEl || !this.recStatusEl || !this.catchBreathHandle) return;
		const remaining = model.state.recoveries ?? 0;
		this.recPipsEl.querySelectorAll<HTMLElement>('.dse-stamina-rec__pip').forEach((pip, i) => {
			pip.toggleClass('dse-stamina-rec__pip--filled', i < remaining);
		});

		const { dying, winded } = this.woundState(model);
		const state = dying ? 'dying' : winded ? 'winded' : null;
		this.recStatusEl.hidden = state === null;
		if (state) {
			this.recStatusEl.setText(state === 'dying' ? 'Dying' : 'Winded');
			this.recStatusEl.setAttribute('data-state', state);
		} else {
			this.recStatusEl.setText('');
			this.recStatusEl.removeAttribute('data-state');
		}
		this.catchBreathHandle.setDisabled(this.readOnly || dying || remaining <= 0);
	}

	/** RR §8: winded = at half Stamina max or below; dying = at 0 (implies winded too;
	 *  display takes dying priority — same convention as StaminaBar's isDying/isWinded). */
	private woundState(model: HeroModel): { dying: boolean; winded: boolean } {
		const current = model.state.stamina.current;
		const windedThreshold = this.stats.windedThreshold.value;
		const dying = current <= 0;
		const winded = windedThreshold !== null && current <= windedThreshold;
		return { dying, winded };
	}

	/** RR §8 "Catch Breath": -1 recovery, heal recoveryValue Stamina (clamped to max).
	 *  FOLLOWUPS #27-fix-round: the heal-amount math is the shared recoveryHealAmount
	 *  helper (also used by stamina-bar/view.ts's Catch Breath and StaminaEditModal's
	 *  Spend Recovery). */
	private catchBreath(): void {
		const model = this.model;
		const remaining = model.state.recoveries ?? 0;
		const { dying } = this.woundState(model);
		if (remaining <= 0 || dying) return; // defensive: the button is disabled too

		const max = this.stats.maxStamina.value ?? model.state.stamina.current;
		const recoveryValue = this.stats.recoveryValue.value ?? 0;
		model.state.recoveries = remaining - 1;
		model.state.stamina.current += recoveryHealAmount(recoveryValue, model.state.stamina.current, max);

		this.refreshStaminaRegion(model);
		void this.persist();
	}

	private applyStaminaChange(patch: Partial<HeroStamina>): void {
		Object.assign(this.model.state.stamina, patch);
		this.refreshStaminaRegion(this.model);
		void this.persist();
	}

	/** Targeted refresh (F1 §6): the bar/stepper/recoveries badge, PLUS the conditions
	 *  region's adjacent wound badge — a stamina change re-derives winded/dying, which
	 *  is surfaced next to the conditions strip (spec §3.2's layout puts WINDED● beside
	 *  the bar; this sheet also echoes it by the conditions area so "conditions" reads
	 *  as the hero's full status, not just the authored list). */
	private refreshStaminaRegion(model: HeroModel): void {
		if (this.staminaBarEl) updateStaminaBar(this.staminaBarEl, this.staminaValues(model));
		this.staminaStepper?.setValue(model.state.stamina.current);
		this.updateRecoveries(model);
		this.refreshConditionsRegion(model);
	}

	// ---------------------------------------------------------------- resource

	private renderResourceRegion(container: HTMLElement, model: HeroModel): void {
		const region = this.region(container, 'resource', 'Heroic Resource');
		const host: PanelHost = { readOnly: this.readOnly, roll: this.cx.roll };
		this.resourcePanel = new ResourcePanel(this.cx, host);
		this.addChild(this.resourcePanel);
		this.resourcePanel.mountPanel(region, this.resourceSlice(model), (patch) => {
			if (patch.current !== undefined) this.model.state.resource = patch.current;
			this.resourcePanel?.updatePanel(this.resourceSlice(this.model));
			void this.persist();
		});
	}

	private resourceSlice(model: HeroModel): ResourceSlice {
		const derived = this.stats.resource.value;
		return { type: derived.type, current: model.state.resource ?? 0, min: derived.min, gainHint: derived.gainHint };
	}

	// ---------------------------------------------------------------- surges

	private renderSurgeRegion(container: HTMLElement, model: HeroModel): void {
		const region = this.region(container, 'surges', 'Surges');
		const host: PanelHost = { readOnly: this.readOnly, roll: this.cx.roll };
		this.surgePanel = new SurgePanel(this.cx, host);
		this.addChild(this.surgePanel);
		this.surgePanel.mountPanel(region, this.surgeSlice(model), (patch) => {
			if (patch.surges !== undefined) this.model.state.surges = patch.surges;
			this.surgePanel?.updatePanel(this.surgeSlice(this.model));
			void this.persist();
		});
	}

	/** AR "Surges": each = +highest characteristic damage (spec §1.4). */
	private surgeSlice(model: HeroModel): SurgeSlice {
		const c = model.defn.characteristics;
		const highest = Math.max(c.might, c.agility, c.reason, c.intuition, c.presence);
		return { surges: model.state.surges ?? 0, highestCharacteristic: highest };
	}

	// ---------------------------------------------------------------- conditions

	private renderConditionsRegion(container: HTMLElement, model: HeroModel): void {
		const region = this.region(container, 'conditions', 'Conditions');
		this.conditionsStatusEl = region.createDiv({ cls: 'dse-hero__wound-badge' });
		const host: PanelHost = { readOnly: this.readOnly, roll: this.cx.roll };
		this.conditionsPanel = new ConditionsPanel(this.cx, host);
		this.addChild(this.conditionsPanel);
		this.conditionsPanel.mountPanel(region, model.state.conditions ?? [], (patch) => {
			const next = (patch as Condition[] | undefined) ?? [];
			this.model.state.conditions = next;
			this.conditionsPanel?.updatePanel(next);
			void this.persist();
		});
		this.refreshConditionsRegion(model);
	}

	/** recon delta 7: `model.state` (a `{conditions}` ConditionHolder) is handed to the
	 *  LOOSENED ConditionsPanel/AddConditionsModal (Task 2) verbatim — never conformed
	 *  to a fabricated Hero/CreatureInstance shape. */
	private refreshConditionsRegion(model: HeroModel): void {
		this.conditionsPanel?.updatePanel(model.state.conditions ?? []);
		if (!this.conditionsStatusEl) return;
		const { dying, winded } = this.woundState(model);
		this.conditionsStatusEl.setText(dying ? 'Dying' : winded ? 'Winded' : '');
		this.conditionsStatusEl.toggleClass('dse-hero__wound-badge--active', dying || winded);
	}

	// ---------------------------------------------------------------- skills

	private renderSkillsRegion(container: HTMLElement, model: HeroModel): void {
		const region = this.region(container, 'skills', 'Skills');
		// Decision (spec §2.3/plan-18 Task 9 brief): skills are display-oriented and out
		// of Task 1's extraction scope — rendered directly here, no SkillsPanel.
		const chips = region.createDiv({ cls: 'dse-hero__skill-chips' });
		for (const skill of model.defn.skills ?? []) {
			chips.createSpan({ cls: 'dse-hero__skill-chip', text: skill });
		}
	}

	// ---------------------------------------------------------------- abilities

	private renderAbilitiesRegion(root: HTMLElement): void {
		const region = this.region(root, 'abilities', 'Abilities');

		if (this.abilities.length === 0) {
			region.createDiv({ cls: 'dse-hero__abilities-empty', text: 'No abilities.' });
			return;
		}

		// OD-5: a cost/type tabs filter — a SELECTOR over one shared row list (not one
		// content panel per tab): each ability row is a single DOM node owning its own
		// lazy-mounted card, and the kit's one-panel-per-tab shape would otherwise force
		// duplicating that node into whichever tabs it matches.
		tabs(
			region,
			{
				tabs: [
					{ id: 'all', label: 'All' },
					{ id: 'signature', label: 'Signature' },
					{ id: 'heroic', label: 'Heroic' },
					{ id: 'triggered', label: 'Triggered' },
				],
				selected: 'all',
				persist: { session: this.cx.session, blockKey: this.cx.host.blockKey(), slot: 'abilities.tab' },
				onSelect: (id) => this.filterAbilityRows(id as AbilityTab),
			},
			this,
		);

		const listEl = region.createDiv({ cls: 'dse-hero__ability-list' });
		this.abilityRows = this.abilities.map((entry, index) => this.renderAbilityRow(listEl, entry, index));
	}

	private filterAbilityRows(tab: AbilityTab): void {
		this.abilityRows.forEach((row, i) => {
			const rowTab = this.abilityTab(this.abilities[i]);
			row.rowEl.hidden = !(tab === 'all' || rowTab === tab);
		});
	}

	/** spec §1.1: Signature (at-will) vs heroic (resource-costed) vs triggered (its own
	 *  action-type spine entry, renderFeature.ts's actionTypeOf). Unresolved entries
	 *  (no config) can't be classified — they stay visible only under "All". */
	private abilityTab(entry: AbilityEntry): AbilityTab | null {
		if (!entry.config) return null;
		if (actionTypeOf(entry.config) === 'triggered') return 'triggered';
		return entry.config.feature.cost ? 'heroic' : 'signature';
	}

	private renderAbilityRow(listEl: HTMLElement, entry: AbilityEntry, index: number): AbilityRowHandle {
		const rowEl = listEl.createDiv({ cls: 'dse-hero__ability-row' });
		const headEl = rowEl.createDiv({ cls: 'dse-hero__ability-row-head' });

		if (!entry.config) {
			headEl.createSpan({ cls: 'dse-hero__ability-name', text: this.abilityRawLabel(entry.raw) });
			rowEl.createDiv({ cls: 'dse-hero__ability-issue', text: entry.issue ?? 'Unresolved ability.' });
			return { rowEl };
		}

		const feature = entry.config.feature;
		const name = feature.name ?? '(unnamed ability)';
		headEl.createSpan({ cls: 'dse-hero__ability-name', text: name });
		if (feature.cost) headEl.createSpan({ cls: 'dse-hero__ability-cost', text: String(feature.cost) });
		if (feature.ability_type) headEl.createSpan({ cls: 'dse-hero__ability-type', text: feature.ability_type });

		const bodyEl = rowEl.createDiv({ cls: 'dse-hero__ability-body' });
		bodyEl.hidden = true;
		let mounted = false;
		const toggle = iconButton(
			headEl,
			{
				icon: 'chevron-down',
				label: `Expand ${name}`,
				variant: 'ghost',
				onClick: () => {
					const willShow = bodyEl.hidden;
					bodyEl.hidden = !willShow;
					toggle.setLabel(willShow ? `Collapse ${name}` : `Expand ${name}`);
					if (willShow && !mounted) {
						mounted = true;
						void this.mountAbilityCard(bodyEl, entry.config as FeatureConfig, index);
					}
				},
			},
			this,
		);
		toggle.buttonEl.addClass('dse-hero__ability-toggle');

		return { rowEl };
	}

	private abilityRawLabel(raw: string | Record<string, unknown>): string {
		if (typeof raw === 'string') return raw;
		return typeof raw.name === 'string' ? raw.name : '(inline ability)';
	}

	/** spec §3.5: `abilities[]` SCC codes are left unresolved by Task 8 and resolved
	 *  HERE, lazily per-row on expand — mirrors resolve.ts's ladder (never throws; every
	 *  failure mode becomes `issue`) but for the `feature` family. Called eagerly (in
	 *  parallel) for every entry at mount so the COMPACT row can show a name/cost/type —
	 *  only the full card's DOM stays deferred to first expand (mountAbilityCard). */
	private async resolveAbility(raw: string | Record<string, unknown>): Promise<AbilityEntry> {
		if (typeof raw === 'object') {
			try {
				return { raw, config: FeatureConfig.readYaml(stringifyYaml(raw)) };
			} catch (error) {
				return { raw, issue: error instanceof Error ? error.message : String(error) };
			}
		}
		const trimmed = raw.trim();
		const compendium = this.cx.compendium;
		if (!compendium || !compendium.available) {
			return { raw, issue: 'Compendium not installed — run "Sync compendium" to resolve this ability.' };
		}
		let code: string;
		if (/^scc(\.v\d+)?:/.test(trimmed)) {
			code = trimmed.replace(/^scc(\.v\d+)?:/, '').split('#')[0].trim();
		} else if (trimmed.includes('/')) {
			code = trimmed;
		} else {
			const candidates = compendium.resolveSlug(trimmed, FEATURE_TYPE_RE);
			if (candidates.length === 0) return { raw, issue: `No compendium entry matches "${trimmed}".` };
			if (candidates.length > 1) {
				return { raw, issue: `"${trimmed}" is ambiguous — paste a full code: ${candidates.join(', ')}` };
			}
			code = candidates[0];
		}
		try {
			const entity = await compendium.getEntity(code);
			if (!entity) return { raw, issue: `"${code}" not found in compendium — sync compendium?` };
			const parsed = await entity.model();
			if (!(parsed instanceof FeatureConfig)) {
				return { raw, issue: `"${entity.name}" found but is not an ability entry.` };
			}
			return { raw, config: parsed };
		} catch (error) {
			return { raw, issue: error instanceof Error ? error.message : String(error) };
		}
	}

	/** Mounts the REAL migrated Feature/Ability view (recon delta 1), lifecycle-parented
	 *  to this sheet (`this.addChild`, mirrors RefUnwrapView.mountBase), and hands it the
	 *  hero's CharacteristicProvider via the EXISTING bridge method — the sheet does not
	 *  reimplement featureRollHooks/renderFeature. */
	private async mountAbilityCard(body: HTMLElement, config: FeatureConfig, index: number): Promise<void> {
		const rowCx = this.abilityRenderContext(index);
		const view = new FeatureElementView(rowCx);
		this.addChild(view);
		view.setCharacteristicProvider(this.provider);
		await view.mount(body, config);
	}

	/** A per-row RenderContext: same services, except a NAMESPACED SessionStore (each
	 *  `renderFeature` call restarts its own rollable-effect ordinal at 0, so two ability
	 *  rows sharing the sheet's one blockKey would otherwise collide on
	 *  `roll.history.0`/`roll.lastInput.0`). `roll` passes through unwrapped — OD-6 ("the
	 *  sheet only supplies context and reacts") means the sheet does not react to roll
	 *  results at all; surges are spent only via the SurgePanel's own stepper. */
	private abilityRenderContext(index: number): RenderContext {
		const ns = `ability-${index}`;
		const baseSession = this.cx.session;
		const session: SessionStore = {
			get: (blockKey, slot) => baseSession.get(blockKey, `${ns}::${slot}`),
			set: (blockKey, slot, value) => baseSession.set(blockKey, `${ns}::${slot}`, value),
			clear: () => baseSession.clear(),
		};
		return { ...this.cx, session };
	}

	// ---------------------------------------------------------------- shared

	private region(container: HTMLElement, id: string, title: string): HTMLElement {
		const region = container.createDiv({ cls: `dse-hero__region dse-hero__region--${id}` });
		region.setAttribute('data-dse-hero-region', id);
		region.createEl('h3', { cls: 'dse-hero__region-title', text: title });
		return region;
	}
}
