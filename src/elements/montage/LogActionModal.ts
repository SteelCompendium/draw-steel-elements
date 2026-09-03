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
// Five fields, in the mock's own order (mock6.js's `sheet()`): Hero, Round, Result (plus
// the round-5 tier hint and, new this slice, the roll affordance — spec §D "keep the
// capability by wiring the sheet's Result field to it"), Skill (plus the live skill-reuse
// warning, Draw Steel Heroes:21286), Note (multi-line, optional, Scott's round-3 ask
// verbatim). Footer: Remove (danger, edit only) · Cancel (ghost) · Log/Save (accent) —
// spec §D's own footer line.
import type { App } from 'obsidian';
import { setIcon } from 'obsidian';
import { DseModal, iconButton, tierBadge } from '@/framework/kit';
import type { IconButtonHandle } from '@/framework/kit';
import type { RollService } from '@/framework/roll/service';
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
	roll: RollService | undefined;
	/** Log (new mode) or Save (edit mode) — the caller applies the mutation. */
	onSubmit: (entry: MontageEntry) => void;
	/** Remove — present (and the footer button rendered) only in edit mode. */
	onRemove?: () => void;
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
	private readonly roll: RollService | undefined;
	private readonly onSubmitCb: (entry: MontageEntry) => void;
	private readonly onRemoveCb: (() => void) | undefined;

	private selectedHero: string;
	private selectedRound: number;
	private selectedResult: MontageResult | undefined;
	private skillValue: string;
	private noteValue: string;

	private commitBtn!: IconButtonHandle;
	private skillWarnEl!: HTMLElement;
	private heroChipEls: HTMLButtonElement[] = [];
	private roundChipEls: HTMLButtonElement[] = [];
	private resultChipEls: HTMLButtonElement[] = [];

	constructor(app: App, opts: LogActionModalOptions) {
		super(app);
		this.model = opts.model;
		this.mode = opts.mode;
		this.roll = opts.roll;
		this.onSubmitCb = opts.onSubmit;
		this.onRemoveCb = opts.onRemove;

		if (this.mode.kind === 'edit') {
			const e = this.mode.entry;
			this.selectedHero = e.hero;
			this.selectedRound = e.round;
			this.selectedResult = isKnownMontageResult(e.result) ? e.result : undefined;
			this.skillValue = e.skill ?? '';
			this.noteValue = e.note ?? '';
		} else {
			this.selectedHero = this.mode.hero;
			this.selectedRound = this.mode.round;
			// New records default to Success (mock6.js's own sheet() default) — the common
			// case, one tap away from correct either way.
			this.selectedResult = 'success';
			this.skillValue = '';
			this.noteValue = '';
		}
	}

	onOpen(): void {
		const editing = this.mode.kind === 'edit';
		this.setDseTitle(editing ? 'Correct a logged action' : 'Log an action');
		this.dseModalRoot().addClass('dse-mt__sheet');

		const head = this.body.createDiv({ cls: 'dse-mt__sheet-head' });
		head.createSpan({ cls: 'dse-mt__sheet-eyebrow', text: editing ? 'Correct' : 'Log an action' });
		head.createSpan({
			cls: 'dse-mt__sheet-sub',
			text: editing
				? 'change who / round / result / skill together — nothing writes until Save'
				: 'nothing writes until Log',
		});

		this.renderHeroField();
		this.renderRoundField();
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

	// ---------------------------------------------------------------------- Hero

	private renderHeroField(): void {
		const control = field(this.body, 'Hero');
		const group = control.createDiv({ cls: 'dse-durseg' });
		group.setAttribute('role', 'group');
		group.setAttribute('aria-label', 'Hero');
		this.heroChipEls = [];
		for (const p of this.model.participants ?? []) {
			const chip = group.createEl('button', { cls: 'dse-optchip', text: p.name });
			chip.setAttribute('type', 'button');
			chip.setAttribute('aria-label', p.name);
			this.lifecycle.registerDomEvent(chip, 'click', () => {
				this.selectedHero = p.name;
				this.reflectHero();
				this.refreshSkillWarning();
			});
			this.heroChipEls.push(chip);
		}
		this.reflectHero();
	}

	private reflectHero(): void {
		for (const chip of this.heroChipEls) {
			chip.setAttribute('aria-pressed', String(chip.textContent === this.selectedHero));
		}
	}

	// ---------------------------------------------------------------------- Round

	private renderRoundField(): void {
		const control = field(this.body, 'Round');
		const group = control.createDiv({ cls: 'dse-durseg' });
		group.setAttribute('role', 'group');
		group.setAttribute('aria-label', 'Round');
		this.roundChipEls = [];
		for (let r = 1; r <= this.model.rounds; r++) {
			const chip = group.createEl('button', { cls: 'dse-optchip', text: String(r) });
			chip.setAttribute('type', 'button');
			chip.setAttribute('aria-label', `Round ${r}`);
			this.lifecycle.registerDomEvent(chip, 'click', () => {
				this.selectedRound = r;
				this.reflectRound();
			});
			this.roundChipEls.push(chip);
		}
		this.reflectRound();
	}

	private reflectRound(): void {
		this.roundChipEls.forEach((chip, i) => {
			chip.setAttribute('aria-pressed', String(i + 1 === this.selectedRound));
		});
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

		// ROUND 5 — the tier hint (spec §A/§D): "the sheet is the adjudication moment", so
		// the one line the decision actually needs — where each difficulty's SUCCESS starts
		// — lives here, read-only rules text, never touching the model (spec §D "strip and
		// foot guide read nothing from the model" — this hint is cut from the same cloth).
		const hint = control.createDiv({ cls: 'dse-mt__sheet-tierhint' });
		hint.createSpan({ cls: 'dse-mt__sheet-tierhint-lead', text: 'success starts at' });
		const badges = hint.createDiv({ cls: 'dse-mt__sheet-tiers' });
		tierBadge(badges, 'low');
		tierBadge(badges, 'mid');
		tierBadge(badges, 'high');

		// The roll affordance (spec §D: "keep the capability by wiring the sheet's Result
		// field to it… when cx.roll exists"). A plain characteristic input + Roll button,
		// the same shape the pre-SC-191 ParticipantsView offered — never blocks manual
		// entry, only preselects a chip.
		if (this.roll) this.renderRollAffordance(control);
	}

	private reflectResult(): void {
		this.resultChipEls.forEach((chip, i) => {
			chip.setAttribute('aria-pressed', String(RESULT_CHIPS[i].value === this.selectedResult));
		});
	}

	private renderRollAffordance(control: HTMLElement): void {
		const row = control.createDiv({ cls: 'dse-mt__sheet-roll' });
		const charInput = row.createEl('input', { cls: 'dse-mt__sheet-rollchar', type: 'number' });
		charInput.value = '0';
		charInput.setAttribute('aria-label', 'Characteristic score for the roll');
		const resultEl = row.createSpan({ cls: 'dse-mt__sheet-rollresult' });
		resultEl.setAttribute('aria-live', 'polite');

		const rollBtn = iconButton(
			row,
			{
				icon: 'dices',
				label: 'Roll a test',
				text: 'Roll',
				variant: 'ghost',
				onClick: () => {
					if (!this.roll) return;
					const characteristic = Number(charInput.value) || 0;
					const skillBonus = this.skillValue.trim() !== '' ? 2 : 0;
					const result = this.roll.resolve({ mode: 'test', characteristic, skillBonus });
					const tier = result.tier ?? 1;
					const success = tier >= 2;
					this.selectedResult = success ? 'success' : 'failure';
					this.reflectResult();
					this.refreshValidity();
					resultEl.setText(`(${result.total}, tier ${tier}) — ${success ? 'success' : 'failure'}`);
				},
			},
			this.lifecycle,
		);
		rollBtn.buttonEl.addClass('dse-mt__sheet-rollbtn');
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
		const reused = skill !== '' && wouldReuseSkill(this.model, this.selectedHero, skill, excluding);
		this.skillWarnEl.setText(reused ? `${this.selectedHero} already used ${skill} in this montage — reuse is not allowed` : '');
		// D2 §5: shown/hidden via the `hidden` ATTRIBUTE, never inline display (the
		// `.dse-sedit__warn` convention, StaminaEditModal.ts).
		this.skillWarnEl.hidden = !reused;
	}

	// ---------------------------------------------------------------------- Note

	private renderNoteField(): void {
		const control = field(this.body, 'Note');
		const textarea = control.createEl('textarea', { cls: 'dse-mt__sheet-input dse-mt__sheet-note' });
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

	/** Log/Save is disabled until a Hero, a Round and a Result are all chosen — the one
	 *  case that starts unresolved is an EDIT of an entry whose `result` is an
	 *  unrecognised Director typo (model.ts's `isKnownMontageResult`), which pre-fills no
	 *  chip on purpose rather than silently guessing one. */
	private refreshValidity(): void {
		const valid = this.selectedHero !== '' && this.selectedRound > 0 && this.selectedResult !== undefined;
		this.commitBtn?.setDisabled(!valid);
	}

	private commit(): void {
		if (this.selectedResult === undefined) return; // defensive — the button is disabled
		const skill = this.skillValue.trim();
		const note = this.noteValue.trim();
		const entry: MontageEntry = { hero: this.selectedHero, round: this.selectedRound, result: this.selectedResult };
		if (skill) entry.skill = skill;
		if (note) entry.note = note;
		this.onSubmitCb(entry);
		this.close();
	}
}
