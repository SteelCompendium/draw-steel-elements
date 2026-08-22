// SC-186 — ConditionsModal: the Option D "manager" modal that replaces the retired
// two-modal AddConditionsModal (ConditionSelectModal.ts) + CustomizeConditionModal.ts
// flow. One compact modal ("Conditions", 480px) that shows the FULL set of conditions
// currently on the actor, not a catalog to pick from:
//
//   - each active condition is a raised chip-row (glyph + name [+ dashed CUSTOM tag for
//     an unregistered key] + duration/effect badges + a customize cog + a delete/trash
//     button);
//   - a full-width dashed "+ Add condition" button swaps IN PLACE for a real combobox
//     (arrow keys + Enter, Escape closes) whose dropdown live-filters the known catalog
//     and always ends with an "Add custom: <text>" row, so any string a statblock
//     invents becomes a condition (`{ key: slug(text) }`);
//   - the cog expands an inline sunken Duration / Color / Effect editor UNDER the row
//     (no child modal, one open at a time);
//   - add/delete/customize all apply LIVE — `onChange` fires with the complete updated
//     list after every mutation. There is no staged tray and no Cancel; the footer is a
//     single Done. The list IS the state.
//
// Constructor: (app, holder, conditionManager, onChange) — `holder` mirrors the legacy
// ConditionHolder contract (recon delta 7, EncounterData.ts) so both existing entry
// points keep working unmodified: ds-conditions' standalone panel hands a minimal
// `{conditions}` holder (elements/conditions/panel.ts), and the initiative tracker hands
// a real `Hero | CreatureInstance` (elements/initiative/view.ts) — both structurally
// satisfy `ConditionHolder`.
//
// THE CLOBBERING FIX (by construction): the old CustomizeConditionModal wrote BOTH the
// color input and the effect <select> back unconditionally on Save, so an EoT/Save-Ends/
// EoE condition (duration only ever existed as free text in `effect`) always lost its
// duration the moment Customize was opened and saved (the select's options don't include
// duration strings, so it silently fell back to 'static'). Here, duration and effect are
// separate controls that each write ONLY their own field on their own click — there is no
// "write every control back on Save" step at all. `setEffect` additionally MIGRATES any
// legacy effect-string duration into the first-class `duration` field before it
// overwrites `effect`, so even a condition that has never been touched by this modal
// before keeps its duration the first time its visual effect is changed.
import type { App } from 'obsidian';
import { setIcon } from 'obsidian';
import type { Condition, ConditionHolder } from '@drawSteelAdmonition/EncounterData';
import { ConditionManager, ConditionConfig } from '@utils/Conditions';
import { DseModal, divider, iconButton } from '@/framework/kit';
import { applyConditionColor, applyConditionEffect, CONDITION_EFFECTS } from '@/elements/conditionColor';
import {
	resolveDuration,
	durationBadgeText,
	type ConditionDuration,
} from '@/elements/conditionDuration';
import { FALLBACK_CONDITION_ICON, titleCaseConditionKey, slugConditionKey } from '@/elements/conditionDisplay';

/** The duration segmented-control vocabulary (spec §1.5): 'none' is "until removed" —
 *  the only preset that clears `Condition.duration` rather than setting it. */
const DURATION_PRESETS: { value: ConditionDuration | undefined; label: string }[] = [
	{ value: undefined, label: 'Until removed' },
	{ value: 'eot', label: 'End of Turn' },
	{ value: 'save-ends', label: 'Save Ends' },
	{ value: 'eoe', label: 'End of Encounter' },
];

/** Preset color swatches: the existing action-type hues, not new brand colors. */
const SWATCHES = ['#c0392b', '#b9770e', '#1e8449', '#2874a6', '#7d3c98'];

/** 'static' clears `Condition.effect`; the rest are the shared CSS pulse vocabulary. */
const EFFECT_PRESETS = ['static', ...CONDITION_EFFECTS] as const;

const COLOR_INPUT_DEFAULT = '#ffffff';

type Match = { kind: 'known'; config: ConditionConfig } | { kind: 'custom'; text: string };

/** A labeled field row (`.dse-cond-field`) — shared grammar for Duration/Color/Effect. */
function field(parent: HTMLElement, label: string): HTMLElement {
	const row = parent.createDiv({ cls: 'dse-cond-field' });
	row.createSpan({ cls: 'dse-cond-field__label', text: label });
	return row.createDiv({ cls: 'dse-cond-field__control' });
}

export class ConditionsModal extends DseModal {
	private holder: ConditionHolder;
	private mgr: ConditionManager;
	private onChangeCb: (conditions: Condition[]) => void;
	private conditions: Condition[];
	private openEditorIndex: number | null = null;
	private addOpen = false;
	private listEl!: HTMLElement;
	private addWrapEl!: HTMLElement;
	/** Set while the combobox is open: clears + refocuses the SAME input/menu after a
	 *  pick, so rapid multi-add never tears down and rebuilds the `<input>` (which would
	 *  fire a real blur/focusout mid-pick and race the auto-close handler below). */
	private comboReset: (() => void) | null = null;

	constructor(
		app: App,
		holder: ConditionHolder,
		conditionManager: ConditionManager,
		onChange: (conditions: Condition[]) => void,
	) {
		super(app);
		this.holder = holder;
		this.mgr = conditionManager;
		this.onChangeCb = onChange;
		this.conditions = (holder.conditions ?? []).map((entry) =>
			typeof entry === 'string' ? { key: entry } : { ...entry },
		);
	}

	onOpen(): void {
		this.setDseTitle('Conditions');
		(this.modalEl ?? this.containerEl).addClass('dse-condal-modal');

		this.listEl = this.body.createDiv({ cls: 'dse-condal__list' });
		this.listEl.setAttribute('role', 'list');
		this.listEl.setAttribute('aria-label', 'Active conditions');

		this.addWrapEl = this.body.createDiv({ cls: 'dse-condal__addwrap' });
		// One listener for the life of the modal (not re-registered on every
		// renderAdd() rebuild): focusout bubbles, so it survives the combobox's DOM
		// being torn down and rebuilt on every keystroke-free re-render.
		this.lifecycle.registerDomEvent(this.addWrapEl, 'focusout', (evt: FocusEvent) => {
			if (!this.addOpen) return;
			const next = evt.relatedTarget as Node | null;
			if (next && this.addWrapEl.contains(next)) return; // focus moved WITHIN the wrap
			this.closeAdd();
		});

		this.renderList();
		this.renderAdd();

		this.footer([{ label: 'Done', text: 'Done', variant: 'accent', onClick: () => this.close() }]);
	}

	// ---------------------------------------------------------------- change emission

	/** The one path every mutation flows through: mirrors the normalized list onto the
	 *  caller's holder and hands a FRESH array to onChange (SC-186: apply live — every
	 *  add/delete/customize fires this, not just Done). */
	private emitChange(): void {
		this.holder.conditions = this.conditions;
		this.onChangeCb(this.conditions.map((c) => ({ ...c })));
	}

	// -------------------------------------------------------------------- active list

	private renderList(): void {
		this.listEl.empty();
		this.conditions.forEach((entry, index) => {
			this.renderRow(entry, index);
			if (this.openEditorIndex === index) this.renderEditor(entry, index);
		});
	}

	private renderRow(entry: Condition, index: number): void {
		const config = this.mgr.getAnyConditionByKey(entry.key);
		const displayName = config?.displayName ?? titleCaseConditionKey(entry.key);
		const iconName = config?.iconName ?? FALLBACK_CONDITION_ICON;
		const isOpen = this.openEditorIndex === index;

		const rowEl = this.listEl.createDiv({ cls: 'dse-condal__row' });
		rowEl.setAttribute('role', 'listitem');
		if (isOpen) rowEl.addClass('dse-condal__row--open');

		const glyph = rowEl.createSpan({ cls: 'dse-condal__glyph' });
		setIcon(glyph, iconName);
		applyConditionColor(glyph, entry.color);
		applyConditionEffect(glyph, entry.effect);

		rowEl.createSpan({ cls: 'dse-condal__name', text: displayName });
		if (!config) rowEl.createSpan({ cls: 'dse-condal__tag', text: 'custom' });

		const durationText = durationBadgeText(resolveDuration(entry));
		if (durationText) rowEl.createSpan({ cls: 'dse-cond-item__dur', text: durationText });
		if (entry.effect && (CONDITION_EFFECTS as readonly string[]).includes(entry.effect)) {
			rowEl.createSpan({ cls: 'dse-cond-item__dur', text: entry.effect });
		}

		iconButton(
			rowEl,
			{
				icon: 'cog',
				label: `Customize ${displayName}`,
				variant: 'ghost',
				pressed: isOpen,
				onClick: () => this.toggleEditor(index),
			},
			this.lifecycle,
		).buttonEl.addClass('dse-condal__act');

		iconButton(
			rowEl,
			{
				icon: 'trash-2',
				label: `Remove ${displayName}`,
				variant: 'ghost',
				onClick: () => this.removeAt(index),
			},
			this.lifecycle,
		).buttonEl.addClass('dse-condal__act', 'dse-condal__act--delete');
	}

	private toggleEditor(index: number): void {
		this.openEditorIndex = this.openEditorIndex === index ? null : index;
		this.renderList();
	}

	private removeAt(index: number): void {
		this.conditions.splice(index, 1);
		if (this.openEditorIndex !== null) {
			if (this.openEditorIndex === index) this.openEditorIndex = null;
			else if (this.openEditorIndex > index) this.openEditorIndex -= 1;
		}
		this.emitChange();
		this.renderList();
	}

	// ------------------------------------------------------------- inline row editor

	private renderEditor(entry: Condition, index: number): void {
		const ed = this.listEl.createDiv({ cls: 'dse-condal__editor' });
		this.renderDurationChips(field(ed, 'Duration'), entry, index);
		this.renderSwatches(field(ed, 'Color'), entry, index);
		this.renderEffectChips(field(ed, 'Effect'), entry, index);
	}

	private renderDurationChips(parent: HTMLElement, entry: Condition, index: number): void {
		const group = parent.createDiv({ cls: 'dse-durseg' });
		group.setAttribute('role', 'group');
		group.setAttribute('aria-label', 'Duration');
		const active = resolveDuration(entry);
		for (const preset of DURATION_PRESETS) {
			const chip = group.createEl('button', { cls: 'dse-optchip', text: preset.label });
			chip.setAttribute('type', 'button');
			chip.setAttribute('aria-pressed', String(preset.value === active));
			chip.setAttribute('aria-label', preset.label);
			this.lifecycle.registerDomEvent(chip, 'click', () => this.setDuration(index, preset.value));
		}
	}

	private setDuration(index: number, value: ConditionDuration | undefined): void {
		this.conditions[index].duration = value;
		this.emitChange();
		this.renderList();
	}

	private renderSwatches(parent: HTMLElement, entry: Condition, index: number): void {
		const row = parent.createDiv({ cls: 'dse-swatches' });
		row.setAttribute('role', 'group');
		row.setAttribute('aria-label', 'Color');
		for (const hex of SWATCHES) {
			const sw = row.createEl('button', { cls: 'dse-swatch' });
			sw.setAttribute('type', 'button');
			sw.setAttribute('aria-label', `Color ${hex}`);
			sw.setAttribute('aria-pressed', String(hex === entry.color));
			sw.style.setProperty('--dse-swatch', hex);
			this.lifecycle.registerDomEvent(sw, 'click', () => this.setColor(index, hex));
		}
		const custom = row.createEl('label', { cls: 'dse-swatch dse-swatch--custom' });
		custom.setAttribute('aria-label', 'Custom color');
		setIcon(custom, 'pipette');
		const input = custom.createEl('input', { type: 'color' });
		input.setAttribute('aria-label', 'Custom condition color');
		input.value = entry.color && /^#[0-9a-f]{6}$/i.test(entry.color) ? entry.color : COLOR_INPUT_DEFAULT;
		this.lifecycle.registerDomEvent(input, 'change', () => this.setColor(index, input.value));
	}

	private setColor(index: number, hex: string): void {
		this.conditions[index].color = hex;
		this.emitChange();
		this.renderList();
	}

	private renderEffectChips(parent: HTMLElement, entry: Condition, index: number): void {
		const group = parent.createDiv({ cls: 'dse-durseg' });
		group.setAttribute('role', 'group');
		group.setAttribute('aria-label', 'Effect');
		const active =
			entry.effect && (CONDITION_EFFECTS as readonly string[]).includes(entry.effect) ? entry.effect : 'static';
		for (const fx of EFFECT_PRESETS) {
			const chip = group.createEl('button', { cls: 'dse-optchip', text: fx });
			chip.setAttribute('type', 'button');
			chip.setAttribute('aria-pressed', String(fx === active));
			chip.setAttribute('aria-label', fx);
			this.lifecycle.registerDomEvent(chip, 'click', () => this.setEffect(index, fx));
		}
	}

	/** THE CLOBBERING FIX: migrate any legacy effect-string duration into the
	 *  first-class field BEFORE overwriting `effect` — see file header. */
	private setEffect(index: number, fx: string): void {
		const entry = this.conditions[index];
		if (entry.duration === undefined) {
			const legacy = resolveDuration(entry);
			if (legacy) entry.duration = legacy;
		}
		entry.effect = fx === 'static' ? undefined : fx;
		this.emitChange();
		this.renderList();
	}

	// --------------------------------------------------------- add: button / combobox

	private renderAdd(): void {
		this.addWrapEl.empty();
		this.comboReset = null;
		if (!this.addOpen) {
			const btn = iconButton(
				this.addWrapEl,
				{
					icon: 'plus',
					text: 'Add condition',
					label: 'Add condition',
					onClick: () => {
						this.addOpen = true;
						this.renderAdd();
					},
				},
				this.lifecycle,
			);
			btn.buttonEl.addClass('dse-condal__add');
			return;
		}
		this.renderCombobox();
	}

	private closeAdd(): void {
		this.addOpen = false;
		this.renderAdd();
		this.addWrapEl.querySelector<HTMLButtonElement>('.dse-condal__add')?.focus();
	}

	private matchesFor(query: string): Match[] {
		const q = query.trim().toLowerCase();
		const all = [...this.mgr.getConditions(), ...this.mgr.getPseudoConditions()];
		const known = q === '' ? all : all.filter((c) => c.displayName.toLowerCase().includes(q) || c.key.includes(q));
		const results: Match[] = known.map((config) => ({ kind: 'known', config }));
		if (q !== '') results.push({ kind: 'custom', text: query.trim() });
		return results;
	}

	private renderCombobox(): void {
		const box = this.addWrapEl.createDiv({ cls: 'dse-condal__combobox' });
		box.setAttribute('role', 'combobox');
		box.setAttribute('aria-expanded', 'true');
		box.setAttribute('aria-haspopup', 'listbox');

		const searchIcon = box.createSpan({ cls: 'dse-condal__search' });
		setIcon(searchIcon, 'search');

		const input = box.createEl('input', { cls: 'dse-condal__input' });
		input.type = 'text';
		input.setAttribute('role', 'searchbox');
		input.setAttribute('aria-autocomplete', 'list');
		input.setAttribute('aria-label', 'Add condition');

		const menu = this.addWrapEl.createDiv({ cls: 'dse-condal__menu' });
		menu.setAttribute('role', 'listbox');
		menu.setAttribute('aria-label', 'Matching conditions');

		let activeIndex = 0;
		const renderMenu = (): void => {
			const matches = this.matchesFor(input.value);
			activeIndex = Math.max(0, Math.min(activeIndex, matches.length - 1));
			menu.empty();
			matches.forEach((match, i) => {
				if (match.kind === 'custom' && matches.length > 1) divider(menu, { axis: 'h' });
				const item = menu.createDiv({
					cls: `dse-condal__menu-item${match.kind === 'custom' ? ' dse-condal__menu-custom' : ''}`,
				});
				item.setAttribute('role', 'option');
				const active = i === activeIndex;
				item.setAttribute('aria-selected', String(active));
				if (active) item.addClass('dse-condal__menu-item--active');
				const glyph = item.createSpan({ cls: 'dse-condal__glyph' });
				if (match.kind === 'known') {
					setIcon(glyph, match.config.iconName);
					item.createSpan({ cls: 'dse-condal__menu-name', text: match.config.displayName });
				} else {
					setIcon(glyph, 'plus');
					const nameEl = item.createSpan({ cls: 'dse-condal__menu-name' });
					nameEl.createSpan({ text: 'Add custom: ' });
					nameEl.createEl('strong', { text: `"${match.text}"` });
				}
				this.lifecycle.registerDomEvent(item, 'click', () => this.pickMatch(match));
			});
		};

		this.lifecycle.registerDomEvent(input, 'input', () => {
			activeIndex = 0;
			renderMenu();
		});
		this.lifecycle.registerDomEvent(input, 'keydown', (evt: KeyboardEvent) => {
			const matches = this.matchesFor(input.value);
			if (evt.key === 'ArrowDown') {
				evt.preventDefault();
				activeIndex = Math.min(activeIndex + 1, matches.length - 1);
				renderMenu();
			} else if (evt.key === 'ArrowUp') {
				evt.preventDefault();
				activeIndex = Math.max(activeIndex - 1, 0);
				renderMenu();
			} else if (evt.key === 'Enter') {
				evt.preventDefault();
				const match = matches[activeIndex];
				if (match) this.pickMatch(match);
			} else if (evt.key === 'Escape') {
				evt.preventDefault();
				this.closeAdd();
			}
		});

		renderMenu();
		input.focus();

		this.comboReset = () => {
			input.value = '';
			activeIndex = 0;
			renderMenu();
			input.focus();
		};
	}

	/** Picks a known or custom match: adds the condition and applies live, then keeps
	 *  the combobox open (cleared + refocused) for rapid multi-add (spec: "type, Enter,
	 *  type, Enter"). Esc or blur — not a pick — is what collapses it. Resets the SAME
	 *  input/menu in place (never tears down the combobox) — see `comboReset`'s doc. */
	private pickMatch(match: Match): void {
		const key = match.kind === 'known' ? match.config.key : slugConditionKey(match.text);
		if (!key) return; // blank/punctuation-only custom text is a no-op
		this.conditions.push({ key });
		this.emitChange();
		this.renderList();
		this.comboReset?.();
	}
}
