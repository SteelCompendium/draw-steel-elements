// SC-191 impl spec §D "Log an action… sheet (new + correct)" — the kit `managedModal`
// (`openManagedModal`, the SC-186 `ConditionsModal` precedent) that replaces the
// pre-SC-191 record form. Reached three ways, all touch-safe: a cell socket, a row's
// "Log an action" chip, or the bottom "Log an action…" button — every caller hands this
// modal a `SheetMode` (view.ts owns turning a click into one) and gets back a plain
// `{hero, round, result, skill?, note?}` through `onSubmit`; the model MUTATION
// (delta-write, §B.3) lives in model.ts and is applied by the caller, never by this
// modal — same separation ConditionsPanel keeps from ConditionsModal (spec §D: "rendering
// never writes").
//
// SC-334 (Scott, verbatim): "remove the "success starts at" row and the "roll" row" and
// "remove the ability to change the hero and round. Those values should be determined when
// opening the modal and represented in the title of the modal (as they already are). The
// behavior to change the hero and round in the modal is confusing and not needed." So the
// sheet is THREE fields now: Result, Skill (plus the live skill-reuse warning, Draw Steel
// Heroes:21286), Note (multi-line, optional, Scott's SC-191 round-3 ask verbatim). The hero
// and round are fixed by whatever opened the sheet (a cell, a row's button, the bar) and are
// stated once, in the title. The difficulty tiers the hint used to repeat are still one tap
// away in the card's own "Test tiers" strip. Footer: Remove (danger, edit only) · Cancel
// (ghost) · Log/Save (accent) — spec §D's own footer line.
import type { App } from 'obsidian';
import { setIcon } from 'obsidian';
import { DseModal } from '@/framework/kit';
import type { IconButtonHandle } from '@/framework/kit';
import type { MontageEntry, MontageModel, MontageResult } from './model';
import { wouldReuseSkill, isKnownMontageResult } from './model';

/** What opened the sheet — view.ts is the only place a DOM click turns into one of
 *  these. `new` pre-fills an empty socket (hero + the round it was opened for); `edit`
 *  pre-fills an EXISTING entry (identity = object reference, so the caller's own
 *  `correctMontageEntry`/`removeMontageEntry` can find it again without a re-search). */
export type SheetMode = { kind: 'new'; hero: string; round: number } | { kind: 'edit'; entry: MontageEntry };

const RESULT_CHIPS: { value: MontageResult; label: string; icon: string }[] = [
	{ value: 'success', label: 'Success', icon: 'check' },
	{ value: 'failure', label: 'Failure', icon: 'x' },
	{ value: 'assist', label: 'Assist', icon: 'circle-plus' },
];

export interface LogActionModalOptions {
	model: MontageModel;
	mode: SheetMode;
	/** Log (new mode) or Save (edit mode) — the caller applies the mutation. */
	onSubmit: (entry: MontageEntry) => void;
	/** Remove — present (and the footer button rendered) only in edit mode. */
	onRemove?: () => void;
}

/** "a failure" / "an assist" — the edit sub-line's indefinite article (fix round 3,
 *  review-2 M-4, mirroring mock6.js's own "recorded as a failure with Lift"). Only
 *  ever called on the three known result words; an unrecognised typo never reaches
 *  edit's sub-line text at all (`selectedResult` stays `undefined` for it, so the
 *  commit button — and this string — never gets exercised for that case). */
function article(result: string): string {
	return /^[aeiou]/i.test(result) ? 'an' : 'a';
}

/** A labeled sheet field row — mirrors `.dse-cond-field`'s label+control shape under
 *  the montage's own class namespace (spec §D: "the new block owns `.dse-mt__*`
 *  wholesale"). */
function field(parent: HTMLElement, label: string): HTMLElement {
	const row = parent.createDiv({ cls: 'dse-mt__sheet-field' });
	row.createSpan({ cls: 'dse-mt__sheet-label', text: label });
	return row.createDiv({ cls: 'dse-mt__sheet-control' });
}

export class LogActionModal extends DseModal {
	private readonly model: MontageModel;
	private readonly mode: SheetMode;
	private readonly onSubmitCb: (entry: MontageEntry) => void;
	private readonly onRemoveCb: (() => void) | undefined;

	/** SC-334: fixed at open — the sheet has no Hero/Round controls any more, so these are
	 *  never reassigned (a correction keeps the entry's own hero and round). */
	private readonly hero: string;
	private readonly round: number;
	private selectedResult: MontageResult | undefined;
	private skillValue: string;
	private noteValue: string;

	private commitBtn!: IconButtonHandle;
	private skillWarnEl!: HTMLElement;
	private resultChipEls: HTMLButtonElement[] = [];

	constructor(app: App, opts: LogActionModalOptions) {
		super(app);
		this.model = opts.model;
		this.mode = opts.mode;
		this.onSubmitCb = opts.onSubmit;
		this.onRemoveCb = opts.onRemove;

		if (this.mode.kind === 'edit') {
			const e = this.mode.entry;
			this.hero = e.hero;
			this.round = e.round;
			this.selectedResult = isKnownMontageResult(e.result) ? e.result : undefined;
			this.skillValue = e.skill ?? '';
			this.noteValue = e.note ?? '';
		} else {
			this.hero = this.mode.hero;
			this.round = this.mode.round;
			// New records default to Success (mock6.js's own sheet() default) — the common
			// case, one tap away from correct either way.
			this.selectedResult = 'success';
			this.skillValue = '';
			this.noteValue = '';
		}
	}

	onOpen(): void {
		const editing = this.mode.kind === 'edit';
		// FIX ROUND 3 (review-2 M-4): the TITLE names the row the sheet will WRITE — the
		// mock's own subject line (mock6.js:1508-1524, "Kira · round 3" / "Bram · round
		// 2") — not a repeat of the eyebrow. "Naming it in the title is what makes a
		// pre-filled dialog safe: you can see what it will change before you change
		// anything" (the mock's own comment). SC-334: with the Hero/Round chips gone, the
		// title is now the ONLY place the sheet states who and which round it writes.
		this.setDseTitle(`${this.hero} · round ${this.round}`);
		this.dseModalRoot().addClass('dse-mt__sheet');

		const head = this.body.createDiv({ cls: 'dse-mt__sheet-head' });
		head.createSpan({ cls: 'dse-mt__sheet-eyebrow', text: editing ? 'Correct' : 'Log an action' });
		head.createSpan({
			cls: 'dse-mt__sheet-sub',
			text:
				this.mode.kind === 'edit'
					? `recorded as ${article(this.mode.entry.result)} ${this.mode.entry.result}${this.mode.entry.skill ? ' with ' + this.mode.entry.skill : ''}`
					: this.newModeSub(),
		});

		this.renderResultField();
		this.renderSkillField();
		this.renderNoteField();

		const buttons = [];
		if (editing && this.onRemoveCb) {
			buttons.push({
				icon: 'trash',
				label: 'Remove this action',
				text: 'Remove',
				variant: 'danger' as const,
				onClick: () => {
					this.onRemoveCb?.();
					this.close();
				},
			});
		}
		buttons.push({ label: 'Cancel', text: 'Cancel', variant: 'ghost' as const, onClick: () => this.close() });
		const commitLabel = editing ? 'Save' : 'Log';
		buttons.push({
			icon: 'check',
			label: commitLabel,
			text: commitLabel,
			variant: 'accent' as const,
			onClick: () => this.commit(),
		});
		const handles = this.footer(buttons);
		this.commitBtn = handles[handles.length - 1];
		this.refreshValidity();
	}

	/** The dialog box element `DseModal` themes — same private-ish accessor shape as
	 *  `managedModal.ts`'s own `dialogEl()`, needed here only to hang the sheet's own
	 *  class on it for CSS scoping. */
	private dseModalRoot(): HTMLElement {
		return this.modalEl ?? this.containerEl;
	}

	/** SC-334: the new-mode sub-line used to read "next hero yet to act in the round in
	 *  play" for EVERY new sheet — true only when the bar's `Log an action…` opened it. A
	 *  cell or a row's own button can open it for any hero, and a past-round cell (SC-299
	 *  R-2) for an earlier round; with the Hero/Round chips gone the head is the only
	 *  context the sheet gives, so it now says which kind of round this is instead. */
	private newModeSub(): string {
		if (this.round === this.model.current_round) return 'the round in play';
		return this.round < this.model.current_round ? 'a round already played' : 'a round still to come';
	}

	// ---------------------------------------------------------------------- Result

	private renderResultField(): void {
		const control = field(this.body, 'Result');
		const group = control.createDiv({ cls: 'dse-durseg' });
		group.setAttribute('role', 'group');
		group.setAttribute('aria-label', 'Result');
		this.resultChipEls = [];
		for (const rc of RESULT_CHIPS) {
			// Each result chip carries its own glyph, not just its word (colourblind rule:
			// shape + words carry every state, colour only reinforces — the SAME check/x/
			// ringed-plus vocabulary the board's own cell seals use, RESULT_ICON in
			// BoardView.ts).
			const chip = group.createEl('button', { cls: 'dse-optchip dse-mt__sheet-resultchip' });
			chip.setAttribute('type', 'button');
			chip.setAttribute('data-kind', rc.value);
			chip.setAttribute('aria-label', rc.label);
			setIcon(chip.createSpan({ cls: 'dse-mt__sheet-chipglyph' }), rc.icon);
			chip.createSpan({ text: rc.label });
			this.lifecycle.registerDomEvent(chip, 'click', () => {
				this.selectedResult = rc.value;
				this.reflectResult();
				this.refreshValidity();
			});
			this.resultChipEls.push(chip);
		}
		this.reflectResult();
	}

	private reflectResult(): void {
		this.resultChipEls.forEach((chip, i) => {
			chip.setAttribute('aria-pressed', String(RESULT_CHIPS[i].value === this.selectedResult));
		});
	}

	// ---------------------------------------------------------------------- Skill

	private renderSkillField(): void {
		const control = field(this.body, 'Skill');
		const input = control.createEl('input', { cls: 'dse-mt__sheet-input', type: 'text' });
		input.value = this.skillValue;
		input.setAttribute('placeholder', 'Which skill? (Optional)');
		input.setAttribute('aria-label', 'Skill used');
		this.lifecycle.registerDomEvent(input, 'input', () => {
			this.skillValue = input.value;
			this.refreshSkillWarning();
		});
		// FIX ROUND 3 (review-2 L-4): the mock's own skill hint (mock6.js:1607,
		// "optional · +2 when applicable") — the one rule a Director needs while choosing
		// the skill. `.dse-mt__sheet-hint`, NOT `.dse-mt__sheet-warn`
		// (round 4/5's own distinction, re-affirmed by L-4's fix: this is guidance, not a
		// violation — the warn slot is reserved for the skill-reuse rule actually firing).
		control.createSpan({ cls: 'dse-mt__sheet-hint', text: 'optional · +2 when applicable' });
		this.skillWarnEl = control.createDiv({ cls: 'dse-mt__sheet-warn' });
		this.skillWarnEl.setAttribute('role', 'alert');
		this.refreshSkillWarning();
	}

	/** The skill-reuse rule (Draw Steel Heroes:21286) — a WARNING, never a block (AGENT
	 *  94/spec §4.1: "warn, never block"). Excludes this entry's own prior contribution
	 *  when editing, so correcting a note back onto its own unchanged skill never warns
	 *  against itself (model.ts's `wouldReuseSkill`). */
	private refreshSkillWarning(): void {
		const skill = this.skillValue.trim();
		const excluding = this.mode.kind === 'edit' ? this.mode.entry : undefined;
		const reused = skill !== '' && wouldReuseSkill(this.model, this.hero, skill, excluding);
		this.skillWarnEl.setText(reused ? `${this.hero} already used ${skill} in this montage — reuse is not allowed` : '');
		// D2 §5: shown/hidden via the `hidden` ATTRIBUTE, never inline display (the
		// `.dse-sedit__warn` convention, StaminaEditModal.ts).
		this.skillWarnEl.hidden = !reused;
	}

	// ---------------------------------------------------------------------- Note

	private renderNoteField(): void {
		const control = field(this.body, 'Note');
		// FIX ROUND 3: a single class in `cls` — `test/unit/build/inputHostCoverage.test.ts`
		// (SC-202) extracts `cls:` as one class-name token, and a space-separated compound
		// string here made it search for the literal (invalid) selector text
		// ".dse-mt__sheet-input dse-mt__sheet-note" instead of two classes. Functionally
		// identical either way — `.addClass` after creation.
		const textarea = control.createEl('textarea', { cls: 'dse-mt__sheet-input' });
		textarea.addClass('dse-mt__sheet-note');
		textarea.value = this.noteValue;
		textarea.setAttribute('placeholder', 'A consequence to remember later…');
		textarea.setAttribute('aria-label', 'Note');
		textarea.rows = 3;
		this.lifecycle.registerDomEvent(textarea, 'input', () => {
			this.noteValue = textarea.value;
		});
		control.createSpan({ cls: 'dse-mt__sheet-hint', text: 'optional · shown in the outcome band' });
	}

	// ---------------------------------------------------------------------- commit

	/** Log/Save is disabled until a Result is chosen (the hero and round are fixed at open)
	 *  — the one case that starts unresolved is an EDIT of an entry whose `result` is an
	 *  unrecognised Director typo (model.ts's `isKnownMontageResult`), which pre-fills no
	 *  chip on purpose rather than silently guessing one. FIX ROUND 3 (review-2 M-1,
	 *  guard 2 of 2 — guard 1 is BoardView.ts's own row-chip `complete` gate): the round
	 *  bound is `1..this.model.rounds`, not merely `> 0` — the sheet can be opened for a
	 *  round that no longer has a board column at all (BoardView's per-row chip used to
	 *  stay live after `End round N` on a complete montage, targeting
	 *  `current_round === rounds + 1`; even with that fixed, this is the second,
	 *  independent guard so the commit can never write a round the board has no column
	 *  for, whatever opened it). SC-334: with the Round chips gone the round can no longer
	 *  be corrected INSIDE the sheet, so an out-of-range round simply leaves Log/Save
	 *  disabled — the sheet can only be cancelled, never write it. */
	private refreshValidity(): void {
		const valid =
			this.hero !== '' &&
			this.round >= 1 &&
			this.round <= this.model.rounds &&
			this.selectedResult !== undefined;
		this.commitBtn?.setDisabled(!valid);
	}

	private commit(): void {
		if (this.selectedResult === undefined) return; // defensive — the button is disabled
		const skill = this.skillValue.trim();
		const note = this.noteValue.trim();
		const entry: MontageEntry = { hero: this.hero, round: this.round, result: this.selectedResult };
		if (skill) entry.skill = skill;
		if (note) entry.note = note;
		this.onSubmitCb(entry);
		this.close();
	}
}
