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
//   - the cog expands an inline sunken Icon / Duration / Color / Effect editor UNDER the row
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
// "write every control back on Save" step at all. `setEffect` MIGRATES any legacy
// effect-string duration into the first-class `duration` field before it overwrites
// `effect`; `setDuration` (SC-186 fix-round MED-1) does the symmetric cleanup — clearing a
// legacy duration-encoding `effect` string the moment the user makes an EXPLICIT duration
// choice (including "Until removed"), so that choice is never a silent no-op against a
// resolveDuration() fallback that's still reading the old text.
//
// SC-186 FIX ROUND (independent review, real-Chromium-measured findings):
//   HIGH-1 — the add-combobox's dropdown used to be `position: absolute`, which the
//     modal body's `overflow-y: auto` scroll container clipped entirely off-screen at
//     0/3/8 rows. It now renders in NORMAL FLOW below the combobox (own max-height +
//     overflow-y so it scrolls in place; see styles-source.css's `.dse-condal__menu`).
//   HIGH-2 — a real browser blurs the previously-focused `<input>` on `mousedown` even
//     when the mousedown target isn't itself focusable, which used to fire the (removed)
//     `focusout` auto-close BEFORE the item's `click` ever ran — a mouse pick silently
//     did nothing. Picks are now bound to the item's own `mousedown` with
//     `preventDefault()` (keeps focus in the input, so no blur/close races the pick at
//     all), and outside-close is a DOCUMENT-level pointer gesture instead of `focusout`
//     (belt and braces — catches a real click-away without depending on focus timing).
//     SC-474: that gesture is `mousedown` (arm) then `click` (close), not `mousedown`
//     alone — collapsing on the mousedown shrank and re-centred the modal under the
//     pointer, so the mouseup landed elsewhere and a click on a row's cog or a colour
//     swatch behind the open dropdown never fired. See the outside-close block in `onOpen`.
import type { App } from 'obsidian';
import { getIconIds, setIcon } from 'obsidian';
import type { Condition, ConditionHolder } from '@drawSteelAdmonition/EncounterData';
import { ConditionManager, ConditionConfig } from '@utils/Conditions';
import { DseModal, iconButton, setPressedState, stampControl } from '@/framework/kit';
import { registerEscapeConsumer } from '@/framework/kit/escapeConsumer';
import { applyConditionColor, applyConditionEffect, CONDITION_EFFECTS } from '@/elements/conditionColor';
import {
	resolveDuration,
	durationBadgeText,
	isLegacyDurationText,
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
const SWATCHES = [
	['Red', '#c0392b'], ['Amber', '#b9770e'], ['Green', '#1e8449'],
	['Blue', '#2874a6'], ['Purple', '#7d3c98'],
];

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

/** Module-scoped counter for the combobox's aria-controls/aria-activedescendant ids
 *  (SC-186 fix-round MED-4) — unique per combobox OPEN, matching managedModal.ts's
 *  own `titleCounter` convention for the same reason (never collide across instances). */
let condalComboIdCounter = 0;

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
	 *  pick, so rapid multi-add never tears down and rebuilds the `<input>`. */
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
		// SC-186 fix-round HIGH-2 + SC-474: outside-close is a DOCUMENT-level pointer gesture,
		// registered once for the modal's lifetime — not `focusout` (which a real browser can
		// fire on the input from a mousedown on a non-focusable target, racing an in-progress
		// pick). Item picks (below) preventDefault() their own mousedown so focus never leaves
		// the input in the first place; this is the belt-and-braces catch for an ACTUAL click
		// away from the whole add control.
		//
		// SC-474: the gesture is two-step. A primary-button `mousedown` outside only ARMS the
		// close (`outsideDown`); the dropdown collapses on the `click` that completes the
		// gesture. Closing on the mousedown itself shrank the modal and re-centred it between
		// the press and the release, so the click was dispatched to whatever now sat under the
		// pointer and missed the cog / swatch the user aimed at. The `click` listener is a
		// CAPTURE listener so the collapse (and its focus move to "+ Add condition") runs
		// BEFORE the target's own click handler — that handler then has the last word on
		// focus (SC-468: a swatch keeps focus), exactly the order the old mousedown-close
		// produced. The click's target was fixed at mouseup, so the DOM change cannot divert it.
		// A press that never turns into a click (a drag that ends elsewhere) is closed by the
		// fallback timer armed on `mouseup`; a right/middle press (no click follows it) closes
		// at once, as before; a press INSIDE the add control drops any stale armed close.
		// activeDocument (not the global `document`) — popout-window compatibility: a
		// modal opened while a popout window is focused must listen on THAT window's
		// document, not always the main one (obsidianmd/prefer-active-doc).
		let outsideDown = false;
		let settleTimer: { win: Window; id: number } | undefined;
		const disarm = (): void => {
			outsideDown = false;
			if (settleTimer) settleTimer.win.clearTimeout(settleTimer.id);
			settleTimer = undefined;
		};
		const closeIfArmed = (): void => {
			const armed = outsideDown;
			disarm();
			if (armed && this.addOpen) this.closeAdd();
		};
		this.lifecycle.register(disarm);
		this.lifecycle.registerDomEvent(activeDocument, 'mousedown', (evt: MouseEvent) => {
			disarm();
			if (!this.addOpen) return;
			// composedPath() (not target + .contains()) — a SUCCESSFUL pick mutates the
			// DOM (renderList()/comboReset() empty and rebuild the list/menu) during its
			// OWN mousedown handler, which runs before this document-level listener
			// (bubble order): by the time this callback runs, the picked item may already
			// be a DETACHED node, and `addWrapEl.contains(detachedNode)` is always false
			// — which would close the combobox right after every successful add.
			// composedPath() is captured at dispatch time and stays accurate regardless
			// of DOM mutations that happen mid-bubble.
			const path = typeof evt.composedPath === 'function' ? evt.composedPath() : [evt.target];
			if (path.includes(this.addWrapEl)) return; // inside the add control
			if (evt.button !== 0) this.closeAdd(); // no click follows a right/middle press
			else outsideDown = true;
		});
		// A click is dispatched in the same task as its mouseup, so a 0ms timer armed on mouseup
		// fires only if no click did (drag ended off the pressed element's ancestors, or elsewhere).
		this.lifecycle.registerDomEvent(activeDocument, 'mouseup', () => {
			const win = activeDocument.defaultView; // the window that owns the document the press happened in
			if (outsideDown && !settleTimer && win) settleTimer = { win, id: win.setTimeout(closeIfArmed, 0) };
		});
		this.lifecycle.registerDomEvent(activeDocument, 'click', closeIfArmed, true);

		this.renderList();
		this.renderAdd();

		this.footer([{ label: 'Done', text: 'Done', variant: 'accent', onClick: () => this.close() }]);
	}

	// ---------------------------------------------------------------- change emission

	/** The one path every mutation flows through: mirrors the normalized list onto the
	 *  caller's holder and hands a FRESH array to onChange (SC-186: apply live — every
	 *  add/delete/customize fires this, not just Done). Callers that also need to defer
	 *  the actual PERSIST until modal close (elements/conditions/panel.ts's
	 *  openAddModal — SC-186 fix-round HIGH-4) do so on THEIR side; this modal's own
	 *  contract is unchanged. */
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

	/** SC-186 fix-round MED-3: `renderList()` empties and rebuilds the whole list, which
	 *  otherwise dumps keyboard focus to `<body>` after every row interaction. Every
	 *  mutating method below re-focuses an EQUIVALENT control afterward — the row's cog
	 *  (its first `.dse-condal__act`) is the stable anchor for both row-level actions
	 *  (toggle/customize) and in-editor chip picks, since the editor stays open at the
	 *  same row across a chip click. SC-468: the cog stays the anchor for ROW-level actions
	 *  (toggle/remove) and is the FALLBACK for an in-editor pick whose own option can't be
	 *  found; a successful pick now keeps focus on the option itself (`focusPickedOption`). */
	private focusRowCog(index: number): void {
		const rows = this.listEl.querySelectorAll<HTMLElement>('.dse-condal__row');
		rows[index]?.querySelector<HTMLButtonElement>('.dse-condal__act')?.focus();
	}

	/** SC-468: after an in-editor pick, `renderList()` has rebuilt the editor, so the control
	 *  the user just pressed is gone. Put focus on its REBUILT twin (the option that is now
	 *  `aria-pressed`) so a keyboard user stays where they were in the group and can Tab on
	 *  to the next option; only fall back to the row's cog (the stable MED-3 anchor) when the
	 *  twin is not there — editor closed, or the row itself gone. The twin is found by its
	 *  `aria-label` (derived from the picked value) scoped to its `role="group"`, the same
	 *  re-find the icon picker does. Programmatic focus after a mouse click draws no
	 *  `:focus-visible` ring (e2e COND-E03), so pointer picks look as they did with the cog. */
	private focusPickedOption(index: number, group: string, label: string): void {
		const twin = this.editorEl(index)
			?.querySelector<HTMLElement>(`[role="group"][aria-label="${group}"]`)
			?.querySelectorAll<HTMLElement>('button');
		const option = twin && Array.from(twin).find((b) => b.getAttribute('aria-label') === label);
		if (option) option.focus();
		else this.focusRowCog(index);
	}

	/** SC-468: row `index`'s own inline editor — `renderList()` puts it right after its row —
	 *  or null when that row's editor is not open (never another row's). */
	private editorEl(index: number): HTMLElement | null {
		const rows = this.listEl.querySelectorAll<HTMLElement>('.dse-condal__row');
		const next = rows[index]?.nextElementSibling;
		return next?.classList.contains('dse-condal__editor') ? (next as HTMLElement) : null;
	}

	private renderRow(entry: Condition, index: number): void {
		const config = this.mgr.getAnyConditionByKey(entry.key);
		const displayName = config?.displayName ?? titleCaseConditionKey(entry.key);
		const iconName = entry.icon?.trim() || config?.iconName || FALLBACK_CONDITION_ICON;
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

		// SC-186 fix-round LOW-3: `.dse-condal__dur` (was `.dse-cond-item__dur` — the old
		// prefix belonged to the retired picker-row grammar and reads as a trap: a
		// styles-source.css deletion test scanning for that literal prefix would miss it
		// because `_` is a word character, so `\b` never fires after "item").
		const durationText = durationBadgeText(resolveDuration(entry));
		if (durationText) rowEl.createSpan({ cls: 'dse-condal__dur', text: durationText });
		if (entry.effect && (CONDITION_EFFECTS as readonly string[]).includes(entry.effect)) {
			rowEl.createSpan({ cls: 'dse-condal__dur', text: entry.effect });
		}

		iconButton(
			rowEl,
			{
				icon: 'cog',
				label: `Customize ${displayName}`,
				variant: 'ghost',
				pressed: isOpen,
				control: 'cond.edit',
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
		this.focusRowCog(index);
	}

	private removeAt(index: number): void {
		this.conditions.splice(index, 1);
		if (this.openEditorIndex !== null) {
			if (this.openEditorIndex === index) this.openEditorIndex = null;
			else if (this.openEditorIndex > index) this.openEditorIndex -= 1;
		}
		this.emitChange();
		this.renderList();
		// MED-3: focus the row that shifted into this slot; the previous row if this was
		// the last one; the add button if the list is now empty — never <body>.
		if (this.conditions.length === 0) {
			this.addWrapEl.querySelector<HTMLButtonElement>('.dse-condal__add')?.focus();
		} else {
			this.focusRowCog(Math.min(index, this.conditions.length - 1));
		}
	}

	// ------------------------------------------------------------- inline row editor

	private renderEditor(entry: Condition, index: number): void {
		const ed = this.listEl.createDiv({ cls: 'dse-condal__editor' });
		this.renderIconPicker(field(ed, 'Icon'), entry, index);
		this.renderDurationChips(field(ed, 'Duration'), entry, index);
		this.renderSwatches(field(ed, 'Color'), entry, index);
		this.renderEffectChips(field(ed, 'Effect'), entry, index);
	}

	private renderIconPicker(parent: HTMLElement, entry: Condition, index: number): void {
		const picker = parent.createDiv({ cls: 'dse-cond-icons' });
		const search = picker.createEl('input', { cls: 'dse-cond-icons__search', type: 'search', placeholder: 'Search icons…' });
		search.setAttribute('aria-label', 'Search condition icons');
		const grid = picker.createDiv({ cls: 'dse-cond-icons__grid' });
		grid.setAttribute('role', 'group');
		grid.setAttribute('aria-label', 'Condition icon');
		const defaults = this.mgr.getAnyConditionByKey(entry.key)?.iconName ?? FALLBACK_CONDITION_ICON;
		// Obsidian lists built-ins with a lucide- prefix; setIcon also accepts
		// the short names used by our catalog and authored YAML.
		const ids = [...new Set(getIconIds().map((id) => id.replace(/^lucide-/, '')))].sort();
		const render = (): void => {
			grid.empty();
			const add = (icon: string, label: string, value: string | undefined): void => {
				const button = grid.createEl('button', { cls: 'dse-optchip dse-cond-icons__choice' });
				button.type = 'button';
				button.setAttribute('aria-label', label);
				button.setAttribute('title', label);
				setPressedState(button, value === entry.icon);
				setIcon(button.createSpan(), icon);
				if (value === undefined) button.createSpan({ text: 'Default' });
				button.addEventListener('click', () => {
					if (value === undefined) delete entry.icon;
					else entry.icon = value;
					this.emitChange();
					// Keep the search and its query in place while updating the row preview.
					const glyph = this.listEl.querySelectorAll('.dse-condal__glyph')[index] as HTMLElement;
					setIcon(glyph, value ?? defaults);
					render();
					Array.from(grid.querySelectorAll<HTMLButtonElement>('button'))
						.find((b) => b.getAttribute('aria-label') === label)?.focus();
				});
			};
			add(defaults, 'Use default condition icon', undefined);
			const query = search.value.trim().toLowerCase().replace(/\s+/g, '-');
			const suggested = [...new Set([
				...this.mgr.getConditions().map((c) => c.iconName),
				'sparkles', 'skull', 'shield', 'flame', 'snowflake', 'eye-off', 'heart-crack',
			])].filter((id) => ids.includes(id));
			const matches = query ? ids.filter((id) => id.includes(query)) : suggested;
			const visible = matches.slice(0, 24);
			if (!query && entry.icon && !visible.includes(entry.icon)) visible.unshift(entry.icon);
			for (const id of visible) add(id, `Icon: ${id}`, id);
			if (matches.length === 0) grid.createSpan({ text: 'No matching icons.' });
			if (matches.length > 24) grid.createSpan({ text: 'Showing the first 24 matches. Refine your search for more.' });
		};
		this.lifecycle.registerDomEvent(search, 'input', render);
		render();
	}

	private renderDurationChips(parent: HTMLElement, entry: Condition, index: number): void {
		const group = parent.createDiv({ cls: 'dse-durseg' });
		group.setAttribute('role', 'group');
		group.setAttribute('aria-label', 'Duration');
		const active = resolveDuration(entry);
		for (const preset of DURATION_PRESETS) {
			const chip = group.createEl('button', { cls: 'dse-optchip', text: preset.label });
			chip.setAttribute('type', 'button');
			setPressedState(chip, preset.value === active);
			chip.setAttribute('aria-label', preset.label);
			stampControl(chip, 'cond.duration');
			this.lifecycle.registerDomEvent(chip, 'click', () => this.setDuration(index, preset.value));
		}
	}

	/** SC-186 fix-round MED-1 (widened in the micro-round, LOW-A): writing an EXPLICIT
	 *  duration (any preset, including "Until removed") also clears a legacy
	 *  duration-encoding `effect` string if one is present — symmetric with
	 *  `setEffect`'s migration. Without this, `resolveDuration` keeps reading the stale
	 *  `effect` text as a fallback, so "Until removed" against a hand-authored
	 *  `effect: "save ends"` condition was a silent no-op (the badge never changed) that
	 *  still fired a spurious write. LOW-A: the cleanup must run on EVERY explicit
	 *  duration write, not only when `entry.duration` started undefined — a condition
	 *  that already carries a first-class `duration` (e.g. `{effect:'eot',
	 *  duration:'save-ends'}`, hand-authored or written by a pre-fix build) still has a
	 *  DEAD legacy `effect` string riding along; picking a DIFFERENT duration preset
	 *  must clear it too, or `resolveDuration` falls back to it the instant `duration`
	 *  is later cleared via "Until removed". */
	private setDuration(index: number, value: ConditionDuration | undefined): void {
		const entry = this.conditions[index];
		if (isLegacyDurationText(entry.effect)) {
			entry.effect = undefined;
		}
		entry.duration = value;
		this.emitChange();
		this.renderList();
		const preset = DURATION_PRESETS.find((p) => p.value === value);
		if (preset) this.focusPickedOption(index, 'Duration', preset.label);
		else this.focusRowCog(index);
	}

	private renderSwatches(parent: HTMLElement, entry: Condition, index: number): void {
		const row = parent.createDiv({ cls: 'dse-swatches' });
		row.setAttribute('role', 'group');
		row.setAttribute('aria-label', 'Color');
		for (const [name, hex] of SWATCHES) {
			const sw = row.createEl('button', { cls: 'dse-swatch' });
			sw.setAttribute('type', 'button');
			sw.setAttribute('title', `${name} (${hex})`);
			sw.setAttribute('aria-label', `Color ${hex}`);
			stampControl(sw, 'cond.swatch');
			setPressedState(sw, hex === entry.color);
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
		// A preset hex (swatch click, or a custom pick that happens to equal one) lands on its
		// swatch; any other hex came from the custom <input type=color>, which stays focused.
		if (SWATCHES.some(([, h]) => h === hex)) this.focusPickedOption(index, 'Color', `Color ${hex}`);
		else this.focusCustomColor(index);
	}

	private focusCustomColor(index: number): void {
		const input = this.editorEl(index)
			?.querySelector<HTMLInputElement>('.dse-swatch--custom input[type="color"]');
		if (input) input.focus();
		else this.focusRowCog(index);
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
			setPressedState(chip, fx === active);
			chip.setAttribute('aria-label', fx);
			stampControl(chip, 'cond.effect');
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
		this.focusPickedOption(index, 'Effect', fx);
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
					control: 'cond.add',
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
		const comboId = `dse-condal-combo-${++condalComboIdCounter}`;
		const menuId = `${comboId}-menu`;

		const box = this.addWrapEl.createDiv({ cls: 'dse-condal__combobox' });
		const searchIcon = box.createSpan({ cls: 'dse-condal__search' });
		setIcon(searchIcon, 'search');

		const input = box.createEl('input', { cls: 'dse-condal__input' });
		input.type = 'text';
		stampControl(input, 'cond.input');
		// SC-186 fix-round MED-4: role="combobox" belongs on the INPUT (the WAI-ARIA
		// combobox pattern's editable element), not the wrapping div — aria-expanded/
		// aria-controls/aria-activedescendant all ride the same element.
		input.setAttribute('role', 'combobox');
		input.setAttribute('aria-expanded', 'true');
		input.setAttribute('aria-haspopup', 'listbox');
		input.setAttribute('aria-autocomplete', 'list');
		input.setAttribute('aria-controls', menuId);
		input.setAttribute('aria-label', 'Add condition');

		const menu = this.addWrapEl.createDiv({ cls: 'dse-condal__menu' });
		menu.id = menuId;
		menu.setAttribute('role', 'listbox');
		menu.setAttribute('aria-label', 'Matching conditions');

		let activeIndex = 0;
		const renderMenu = (): void => {
			const matches = this.matchesFor(input.value);
			activeIndex = Math.max(0, Math.min(activeIndex, matches.length - 1));
			menu.empty();
			let activeItemId: string | null = null;
			matches.forEach((match, i) => {
				// SC-186 fix-round MED-4: no `role="separator"` divider INSIDE the
				// listbox (its only valid children are `role="option"`) — the boundary
				// before the custom row is styled instead (`.dse-condal__menu-custom`'s
				// own top border in styles-source.css).
				const itemId = `${menuId}-item-${i}`;
				const item = menu.createDiv({
					cls: `dse-condal__menu-item${match.kind === 'custom' ? ' dse-condal__menu-custom' : ''}`,
				});
				item.id = itemId;
				item.setAttribute('role', 'option');
				const active = i === activeIndex;
				item.setAttribute('aria-selected', String(active));
				if (active) {
					item.addClass('dse-condal__menu-item--active');
					activeItemId = itemId;
				}
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
				// SC-186 fix-round HIGH-2: pick on `mousedown` + preventDefault(), NOT
				// `click`. A real browser blurs the currently-focused `<input>` on
				// mousedown even against a non-focusable target (jsdom does not
				// replicate this, which is why the original `click`-only binding read
				// as fine in tests but silently ate every real mouse pick — the
				// document-level outside-close fired first and tore the item down
				// before its `click` could ever run). preventDefault() here keeps focus
				// in the input, so neither that listener nor any blur races this pick.
				// SC-186 micro-round LOW-B: `evt.button !== 0` guard — a plain
				// `mousedown` fires for EVERY button, so without this a right-click
				// (button 2) or middle-click (button 1) picked the match too, and the
				// preventDefault() above additionally suppressed the right-click's own
				// context menu. Left-click only.
				this.lifecycle.registerDomEvent(item, 'mousedown', (evt: MouseEvent) => {
					if (evt.button !== 0) return;
					evt.preventDefault();
					this.pickMatch(match);
				});
			});
			input.setAttribute('aria-activedescendant', activeItemId ?? '');
		};

		this.lifecycle.registerDomEvent(input, 'input', () => {
			activeIndex = 0;
			renderMenu();
		});
		// SC-431: the keydown handler below cannot keep this modal open on Escape (Obsidian's
		// Scope runs first, in the window capture phase), so the dropdown also registers as an
		// Escape consumer: DseModal.onEscapeKey asks it before closing the modal. Dropdown open
		// -> close just the dropdown; nothing open -> false, and the modal closes as before.
		registerEscapeConsumer(
			input,
			() => {
				if (!this.addOpen) return false;
				this.closeAdd();
				return true;
			},
			this.lifecycle,
		);
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
				// SC-186 fix-round LOW-4: stopPropagation() so closing the DROPDOWN
				// doesn't ALSO close the whole MODAL — Obsidian's Scope closes the
				// modal on an unhandled Escape reaching it (precedent:
				// kit/stepper.ts's own draft-revert Escape handler).
				evt.stopPropagation();
				this.closeAdd();
			}
		});

		renderMenu();
		input.focus();
		// SC-186 micro-round INFO (finishes HIGH-1): the menu is in normal flow now
		// (HIGH-1), so at 8+ active rows the modal body can genuinely need to scroll to
		// show it — nudge it into view the moment it opens rather than leaving it below
		// the fold until the user scrolls manually.
		// Guarded: jsdom does not implement scrollIntoView (precedent:
		// framework/sidebar/SidebarPanel.ts).
		menu.scrollIntoView?.({ block: 'nearest' });

		this.comboReset = () => {
			input.value = '';
			activeIndex = 0;
			renderMenu();
			input.focus();
		};
	}

	/** Picks a known or custom match: adds the condition and applies live, then keeps
	 *  the combobox open (cleared + refocused) for rapid multi-add (spec: "type, Enter,
	 *  type, Enter"). Esc or an outside click — not a pick — is what collapses it.
	 *  SC-186 fix-round MED-2 (refined in the micro-round, LOW-D): never adds a
	 *  DUPLICATE key. The acknowledgment is `scrollIntoView` on the existing row, NOT
	 *  moving focus there — `focusRowCog` used to yank focus out of the input while the
	 *  combobox stayed visibly open, so keystrokes went nowhere and the matched row
	 *  could be off-screen with no cue why typing had stopped working. Focus and the
	 *  query text are left exactly where they were. */
	private pickMatch(match: Match): void {
		const key = match.kind === 'known' ? match.config.key : slugConditionKey(match.text);
		if (!key) return; // blank/punctuation-only custom text is a no-op
		const existingIndex = this.conditions.findIndex((c) => c.key === key);
		if (existingIndex !== -1) {
			const rows = this.listEl.querySelectorAll<HTMLElement>('.dse-condal__row');
			rows[existingIndex]?.scrollIntoView?.({ block: 'nearest' }); // guarded, see above
			return;
		}
		this.conditions.push({ key });
		this.emitChange();
		this.renderList();
		this.comboReset?.();
	}
}
