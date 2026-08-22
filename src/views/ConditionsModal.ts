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
//     all), and outside-close is a single DOCUMENT-level `mousedown` listener instead of
//     `focusout` (belt and braces — catches a real click-away without depending on focus
//     timing).
import type { App } from 'obsidian';
import { setIcon } from 'obsidian';
import type { Condition, ConditionHolder } from '@drawSteelAdmonition/EncounterData';
import { ConditionManager, ConditionConfig } from '@utils/Conditions';
import { DseModal, iconButton } from '@/framework/kit';
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
		// SC-186 fix-round HIGH-2: a single DOCUMENT-level mousedown, registered once for
		// the modal's lifetime, is the outside-close mechanism — not `focusout` (which a
		// real browser can fire on the input from a mousedown on a non-focusable target,
		// racing an in-progress pick). Item picks (below) preventDefault() their own
		// mousedown so focus never leaves the input in the first place; this listener is
		// the belt-and-braces catch for an ACTUAL click away from the whole add control.
		// activeDocument (not the global `document`) — popout-window compatibility: a
		// modal opened while a popout window is focused must listen on THAT window's
		// document, not always the main one (obsidianmd/prefer-active-doc).
		this.lifecycle.registerDomEvent(activeDocument, 'mousedown', (evt: MouseEvent) => {
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
			this.closeAdd();
		});

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
	 *  same row across a chip click. */
	private focusRowCog(index: number): void {
		const rows = this.listEl.querySelectorAll<HTMLElement>('.dse-condal__row');
		rows[index]?.querySelector<HTMLButtonElement>('.dse-condal__act')?.focus();
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
		this.focusRowCog(index);
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
		this.focusRowCog(index);
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
		this.focusRowCog(index);
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
		const comboId = `dse-condal-combo-${++condalComboIdCounter}`;
		const menuId = `${comboId}-menu`;

		const box = this.addWrapEl.createDiv({ cls: 'dse-condal__combobox' });
		const searchIcon = box.createSpan({ cls: 'dse-condal__search' });
		setIcon(searchIcon, 'search');

		const input = box.createEl('input', { cls: 'dse-condal__input' });
		input.type = 'text';
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
