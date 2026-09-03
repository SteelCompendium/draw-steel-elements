// SC-191 impl spec §I slice 2 — Montage Test tracker through the REAL ElementPipeline, on
// the settled `roster`/`merged` design (spec §A). HeadView (cardHead + crest/deck/round-chip
// + the UNCHANGED canPersist-gated Reset menu), the BoardView grid (Heroes × rounds × Tally,
// read from `model.entries`), and the OutcomeBandView (verdict/tracks/rule/notes/brink,
// including the `pending` band model.ts's montageOutcome now returns at 0/0). Replaces the
// pre-SC-191 steppers-and-record-form suite (RoundTrackView/ParticipantsView, both deleted
// this slice).
//
// SLICE 2 SCOPE: every board write affordance the settled design puts on a cell (the
// open-socket quick-record trio, the per-row "Log an action" button, the correction/
// note-edit chip) is rendered real-disabled — the sheet that wires them is slice 4's job
// (brief §2). Tests below assert the STUB shape (a real, aria-labelled, disabled control)
// rather than a working record path; `montage-strip*`/`montage-sheet-log`-shaped behavior
// (the cheat-sheet strip, the guide panel, the chrome menu's five items, cx.roll) is NOT
// covered here — those land with the slices that build them (spec §I).
import * as fs from 'fs';
import * as path from 'path';
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { createElementRegistry } from '../../../src/framework/registry';
import type { RollService } from '../../../src/framework/roll/service';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin, Notice, makeFakeContext } from '../../mocks/obsidian';
import { montageElement } from '../../../src/elements/montage/definition';
import { MontageView } from '../../../src/elements/montage/view';
import DrawSteelAdmonitionPlugin, { registerFrameworkElementDefinitions } from 'main';
import { styleGuardFindings } from '../kit/styleGuard';
import montageYaml from '../../../src/elements/montage/example.yaml';
import montageMidYaml from '../../../src/elements/montage/fixture-mid.yaml';
import montageDoneYaml from '../../../src/elements/montage/fixture-done.yaml';
import montageFailedYaml from '../../../src/elements/montage/fixture-failed.yaml';
import montageOldShapeYaml from '../../../src/elements/montage/fixture-old-shape.yaml';

const MT_ALIASES = ['ds-montage'] as const;

function makeHost(overrides: Partial<BlockHost> = {}) {
	const replaceSource = jest.fn(async (_newSource: string) => true);
	const containerEl = document.createElement('div');
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language: 'ds-montage', lineStart: 0, lineEnd: 12 }),
		replaceSource,
		blockKey: () => 'Note.md::ds-montage::0',
		...overrides,
	};
	return host as BlockHost & { containerEl: HTMLElement; replaceSource: typeof replaceSource };
}

/** Real service instances, same convention as counter.test.ts — montage declares no schema
 *  and has no compendium dep. `roll` is REQUIRED by ElementPipelineDeps but unused this
 *  slice (the roll-driven row lives in the slice-4 sheet, not the board). */
function makeDeps(): ElementPipelineDeps {
	const app = new App();
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	const theme = createThemeService(prefs, plugin as any);
	const refs = createReferenceService(app as any, DEFAULT_SETTINGS);
	const validation = createValidationService();
	const session = createSessionStore();
	const roll: RollService = { resolve: () => ({ total: 0, tier: 1 }) } as unknown as RollService;
	return {
		app: app as any,
		plugin: plugin as any,
		settings: DEFAULT_SETTINGS,
		theme,
		prefs,
		refs,
		validation,
		session,
		roll,
	};
}

async function renderMontage(
	source: string = montageYaml,
	hostOverrides: Partial<BlockHost> = {},
	depsOverrides: Partial<ElementPipelineDeps> = {},
) {
	const pipeline = new ElementPipeline({ ...makeDeps(), ...depsOverrides });
	const host = makeHost(hostOverrides);
	await pipeline.run(montageElement, source, host);
	const root = host.containerEl.firstElementChild as HTMLElement;
	return { host, root };
}

// -- kit-DOM accessors --
const heroRows = (root: HTMLElement) => Array.from(root.querySelectorAll('.dse-mt__board-name'));
const heroRow = (root: HTMLElement, name: string) =>
	heroRows(root).find((el) => el.querySelector('.dse-mt__board-who')?.textContent === name) as HTMLElement;
const cellFor = (root: HTMLElement, hero: string, round: number) =>
	root.querySelector(`.dse-mt__cell[data-hero="${hero}"][data-round="${round}"]`) as HTMLElement;
const tallyFor = (root: HTMLElement, hero: string) =>
	root.querySelector(`.dse-mt__board-total[data-hero="${hero}"]`) as HTMLElement;
const tallyN = (tally: HTMLElement, kind: 'success' | 'failure') =>
	tally.querySelector(`.dse-mt__tally[data-kind="${kind}"] .dse-mt__tally-n`)?.textContent;
const outcomeBand = (root: HTMLElement) => root.querySelector('.dse-mt__outcome') as HTMLElement;
const verdictWord = (root: HTMLElement) => outcomeBand(root).querySelector('.dse-mt__verdict-word') as HTMLElement;
const verdictEyebrow = (root: HTMLElement) =>
	outcomeBand(root).querySelector('.dse-mt__verdict-eyebrow') as HTMLElement;
const trackSlots = (root: HTMLElement, kind: 'success' | 'failure') =>
	Array.from(outcomeBand(root).querySelectorAll(`.dse-mt__track[data-kind="${kind}"] .dse-mt__track-slot`));
const progTail = (root: HTMLElement, kind: 'success' | 'failure') =>
	outcomeBand(root).querySelector(`.dse-mt__prog[data-kind="${kind}"] .dse-mt__prog-tail`)?.textContent;

describe('T-6: montage ElementDefinition (spec §4)', () => {
	test('id/name/aliases/shape match the brief; persisted with serialize, NO schema, no auto ref-resolution', () => {
		expect(montageElement.id).toBe('montage');
		expect(montageElement.name).toBe('Montage Test tracker');
		expect(montageElement.aliases).toEqual([...MT_ALIASES]);
		expect(montageElement.shape).toBe('persisted');
		expect(montageElement.schema).toBeUndefined();
		expect(montageElement.autoResolveRefs).toBe(false);
		expect(montageElement.serialize).toBeDefined();
	});

	test('createView returns a MontageView', () => {
		const deps = makeDeps();
		const host = makeHost();
		const cx = {
			app: deps.app,
			plugin: deps.plugin,
			settings: deps.settings,
			host,
			mode: host.mode,
			theme: deps.theme,
			prefs: deps.prefs,
			refs: deps.refs,
			session: deps.session,
		};
		expect(montageElement.createView(cx as any)).toBeInstanceOf(MontageView);
	});
});

describe('SC-191 slice 2: HeadView (cardHead + crest/deck/round-chip)', () => {
	test('root carries data-dse-element="montage" + theme; ONE .dse-mt', async () => {
		const { root } = await renderMontage();
		expect(root.getAttribute('data-dse-element')).toBe('montage');
		expect(root.getAttribute('data-dse-theme')).toBe('steel');
		expect(root.querySelectorAll('.dse-mt')).toHaveLength(1);
	});

	test('title, deck (party size + "one action each per round"), and the round chip render from the fixture', async () => {
		const { root } = await renderMontage();
		const name = root.querySelector('.dse-head__primary--left') as HTMLElement;
		expect(name.textContent).toBe('Cross the Ashfall Wastes');
		expect(root.querySelector('.dse-head__eyebrow--left')?.textContent).toBe('Montage Test');
		expect(root.querySelector('.dse-head__deck--left')?.textContent).toBe('1 hero · one action each per round');
		expect(root.querySelector('.dse-head__eyebrow--right')?.textContent).toBe('Round 1 / 2');
		expect(root.querySelector('.dse-crest__glyph')?.getAttribute('data-icon')).toBe('hourglass');
	});

	test('the round chip reads "Complete" once the montage is total-success, and the head crest switches to trophy', async () => {
		const { root } = await renderMontage(montageDoneYaml);
		expect(root.querySelector('.dse-head__eyebrow--right')?.textContent).toBe('Complete');
		expect(root.querySelector('.dse-crest__glyph')?.getAttribute('data-icon')).toBe('trophy');
	});

	test('an unnamed montage heads as plain "Montage Test" — no dangling colon, no duplicated eyebrow', async () => {
		const { root } = await renderMontage('success_limit: 5\nfailure_limit: 3');
		const name = root.querySelector('.dse-head__primary--left') as HTMLElement;
		expect(name.textContent).toBe('Montage Test');
		expect(root.querySelector('.dse-head__eyebrow--left')).toBeNull();
	});

	test('the description brief renders through ElementView.renderMarkdown into .dse-mt__brief; absent when unauthored', async () => {
		const { root } = await renderMontage(montageMidYaml);
		const brief = root.querySelector('.dse-mt__brief-text') as HTMLElement;
		expect(brief.textContent).toContain('Forty miles of volcanic waste');

		const { root: bare } = await renderMontage(montageYaml);
		expect(bare.querySelector('.dse-mt__brief')).toBeNull();
	});
});

describe('SC-191 slice 2: BoardView (Heroes × rounds × Tally, read from model.entries)', () => {
	test('one row per participant, one column per round — Kira × 2 rounds from the default fixture', async () => {
		const { root } = await renderMontage();
		expect(heroRows(root)).toHaveLength(1);
		expect(heroRow(root, 'Kira')).toBeDefined();
		expect(cellFor(root, 'Kira', 1)).toBeDefined();
		expect(cellFor(root, 'Kira', 2)).toBeDefined();
	});

	test('a past round WITH an entry renders the seal glyph + skill, no note mark', async () => {
		const { root } = await renderMontage(montageMidYaml);
		const cell = cellFor(root, 'Kira', 1);
		expect(cell.getAttribute('data-kind')).toBe('success');
		expect(cell.querySelector('.dse-mt__cell-glyph')?.getAttribute('data-icon')).toBe('check');
		expect(cell.querySelector('.dse-mt__cell-skill')?.textContent).toBe('Nature');
		expect(cell.querySelector('.dse-mt__cell-notemark')).toBeNull();
	});

	test('a NOTED entry carries the permanent dog-eared-page mark, titled with the note text', async () => {
		const { root } = await renderMontage(montageMidYaml);
		const cell = cellFor(root, 'Osric', 1);
		expect(cell.getAttribute('data-kind')).toBe('failure');
		expect(cell.getAttribute('data-noted')).toBe('on');
		const mark = cell.querySelector('.dse-mt__cell-notemark') as HTMLElement;
		expect(mark.getAttribute('data-icon')).toBe('sticky-note');
		expect(mark.getAttribute('title')).toContain('Turned an ankle');
	});

	test('an assist entry renders the ringed-plus glyph', async () => {
		const { root } = await renderMontage(montageMidYaml);
		const cell = cellFor(root, 'Osric', 2);
		expect(cell.getAttribute('data-kind')).toBe('assist');
		expect(cell.querySelector('.dse-mt__cell-glyph')?.getAttribute('data-icon')).toBe('circle-plus');
	});

	// Fix-round-1 M-1: the cell is `role="button" tabindex="0"` per spec §D — a plain `div`,
	// NOT a real `<button>` (which was a full `.dse-btn`: bordered, radiused, shadowed, and
	// `opacity:.5`-dimmed the cell's own recorded data). SLICE 4: on a READ-ONLY host the
	// cell stays `aria-disabled` (owner ruling I-6: explicit read-only states, never a
	// dead-end live control) — on a WRITABLE host `aria-disabled` is gone and a real click
	// opens the sheet.
	test('read-only host: the open socket stays `div[role=button][tabindex=0][aria-disabled=true]` — never a dead-end live control, never a real <button>', async () => {
		const { root } = await renderMontage(montageMidYaml, { canPersist: false });
		const cell = cellFor(root, 'Kira', 3);
		expect(cell.tagName).toBe('DIV');
		expect(cell.classList.contains('dse-btn')).toBe(false);
		expect(cell.getAttribute('role')).toBe('button');
		expect(cell.getAttribute('tabindex')).toBe('0');
		expect(cell.getAttribute('aria-disabled')).toBe('true');
		expect(cell.getAttribute('aria-label')).toBe('Kira, round 3: nothing logged — log an action');
		expect(cell.querySelector('.dse-mt__cell-hint')?.textContent).toBe('to act');
	});

	// Fix-round-1 M-1: a RECORDED cell is the same `div[role=button]` shape — never `.dse-btn`
	// chrome or `opacity:.5` dimming the seal/skill/note-mark it is displaying. SLICE 4:
	// read-only stays `aria-disabled`.
	test('read-only host: a recorded cell is also `div[role=button][tabindex=0][aria-disabled=true]`, never a real <button>', async () => {
		const { root } = await renderMontage(montageMidYaml, { canPersist: false });
		const cell = cellFor(root, 'Kira', 1);
		expect(cell.tagName).toBe('DIV');
		expect(cell.classList.contains('dse-btn')).toBe(false);
		expect(cell.getAttribute('role')).toBe('button');
		expect(cell.getAttribute('tabindex')).toBe('0');
		expect(cell.getAttribute('aria-disabled')).toBe('true');
	});

	// SLICE 4: on a writable host the open socket is a LIVE control — a click opens the
	// sheet pre-filled hero=Kira round=3 (spec §D "the cell itself… log an action"), and
	// `aria-disabled` is gone entirely (never present-but-false — absent, matching the
	// board's own read-only convention elsewhere).
	test('writable host: clicking the open socket opens the Log an action… sheet pre-filled for this hero/round, no aria-disabled', async () => {
		const { root } = await renderMontage(montageMidYaml);
		const cell = cellFor(root, 'Kira', 3);
		expect(cell.hasAttribute('aria-disabled')).toBe(false);
		cell.click();
		const modalEl = document.body.lastElementChild as HTMLElement;
		expect(modalEl.classList.contains('dse-mt__sheet')).toBe(true);
		const heroChips = Array.from(modalEl.querySelectorAll('.dse-mt__sheet-field .dse-optchip'));
		const kiraChip = heroChips.find((c) => c.textContent === 'Kira') as HTMLButtonElement;
		expect(kiraChip.getAttribute('aria-pressed')).toBe('true');
	});

	// SLICE 4: clicking a RECORDED cell opens the sheet in EDIT mode, pre-filled from the
	// existing entry — Scott's original ticket case ("that 13 was really a 17").
	test('writable host: clicking a recorded cell opens the sheet in edit mode, pre-filled from the entry, with Remove offered', async () => {
		const { root } = await renderMontage(montageMidYaml);
		const cell = cellFor(root, 'Kira', 1); // success · Nature (fixture-mid.yaml)
		cell.click();
		const modalEl = document.body.lastElementChild as HTMLElement;
		expect(modalEl.querySelector('.dse-modal__title')?.textContent).toBe('Correct a logged action');
		const skillInput = modalEl.querySelector('input[aria-label="Skill used"]') as HTMLInputElement;
		expect(skillInput.value).toBe('Nature');
		expect(modalEl.querySelector('button[aria-label="Remove this action"]')).not.toBeNull();
	});

	test('a FUTURE round with no entry renders a plain dash, never a button', async () => {
		const { root } = await renderMontage();
		const cell = cellFor(root, 'Kira', 2);
		expect(cell.tagName).toBe('DIV');
		expect(cell.querySelector('.dse-mt__cell-glyph--none')).not.toBeNull();
	});

	test('the tally column sums this hero\'s own entries — Kira 2✓/0✕, Osric 0✓/1✕ on the mid fixture', async () => {
		const { root } = await renderMontage(montageMidYaml);
		const kira = tallyFor(root, 'Kira');
		expect(tallyN(kira, 'success')).toBe('2');
		expect(tallyN(kira, 'failure')).toBe('0');
		const osric = tallyFor(root, 'Osric');
		expect(tallyN(osric, 'success')).toBe('0');
		expect(tallyN(osric, 'failure')).toBe('1');
	});

	test('a complete montage (done fixture) shows every past-round cell as "past" even in the last round, and stands the row-log control down', async () => {
		const { root } = await renderMontage(montageDoneYaml);
		expect(cellFor(root, 'Kira', 3).getAttribute('data-state')).toBe('past');
		// Yenna took no action in round 3 (montage ended at round 3's total success) — a
		// plain dash, never an open socket, once the montage is complete.
		const yennaR3 = cellFor(root, 'Yenna', 3);
		expect(yennaR3.tagName).toBe('DIV');
		expect(yennaR3.querySelector('.dse-mt__cell-skill--none')?.textContent).toBe('no action');
	});

	test('read-only host: "add a hero" and every per-row "Log an action" control are real, aria-labelled, and real-disabled', async () => {
		const { root } = await renderMontage(montageYaml, { canPersist: false });
		const addHero = root.querySelector('.dse-mt__board-addhero') as HTMLButtonElement;
		expect(addHero.tagName).toBe('BUTTON');
		expect(addHero.disabled).toBe(true);
		expect(addHero.getAttribute('aria-label')).toBe('Add a hero');

		const rowAct = heroRow(root, 'Kira').querySelector('.dse-mt__board-rowact') as HTMLButtonElement;
		expect(rowAct.disabled).toBe(true);
		expect(rowAct.getAttribute('aria-label')).toBe('Log an action for Kira');
	});

	// SLICE 4: on a writable host, "add a hero" opens the small add-hero modal — the SAME
	// action the ⋯ chrome item's "Add a hero" fires (spec §D: the board-corner "+" IS one
	// of the SC-169 chrome items).
	test('writable host: "add a hero" opens the add-hero modal; typing a name and confirming appends a roster entry and persists', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderMontage();
		const addHero = root.querySelector('.dse-mt__board-addhero') as HTMLButtonElement;
		expect(addHero.disabled).toBe(false);
		addHero.click();

		const modalEl = document.body.lastElementChild as HTMLElement;
		const input = modalEl.querySelector('input[aria-label="Hero\'s name"]') as HTMLInputElement;
		input.value = 'Osric';
		input.dispatchEvent(new Event('input'));
		(modalEl.querySelector('button[aria-label="Add"]') as HTMLButtonElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		const rebuilt = host.containerEl.firstElementChild as HTMLElement;
		expect(heroRows(rebuilt).map((el) => el.querySelector('.dse-mt__board-who')?.textContent)).toContain('Osric');
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		jest.useRealTimers();
	});

	// SLICE 4: the per-row control opens the sheet for THIS hero. With no entry yet for the
	// current round it is a NEW record (pre-filled hero+round); with one already logged it
	// is an EDIT of that entry — never a duplicate (spec §D: "the touch/narrow path to the
	// same sheet a cell socket opens").
	test('writable host: the per-row "Log an action" control opens the sheet for that hero — new mode when nothing is logged yet this round', async () => {
		const { root } = await renderMontage(montageMidYaml);
		const rowAct = heroRow(root, 'Bram').querySelector('.dse-mt__board-rowact') as HTMLButtonElement;
		expect(rowAct.disabled).toBe(false);
		rowAct.click();
		const modalEl = document.body.lastElementChild as HTMLElement;
		expect(modalEl.querySelector('.dse-modal__title')?.textContent).toBe('Log an action');
		const heroChips = Array.from(modalEl.querySelectorAll('.dse-mt__sheet-field .dse-optchip'));
		const bramChip = heroChips.find((c) => c.textContent === 'Bram') as HTMLButtonElement;
		expect(bramChip.getAttribute('aria-pressed')).toBe('true');
	});

	test('with no participants authored, the board renders an explanatory empty row instead of throwing', async () => {
		const { root } = await renderMontage('title: Empty Run\nsuccess_limit: 5\nfailure_limit: 3');
		expect(heroRows(root)).toHaveLength(0);
		expect(root.querySelector('.dse-mt__board-empty')?.textContent).toContain('No heroes yet');
	});

	// Fix-round-1 M-4: `role="table"` had no owned `role="row"`/`role="cell"` children — an
	// invalid ARIA mapping, worse than no role at all. Dropped entirely; the per-cell
	// aria-labels already carry hero/round/result. The tally's two bare numeral spans are
	// aria-hidden now — `.dse-mt__board-total`'s own aria-label is the one readable name.
	test('a11y (M-4): the board carries no role="table"; the per-hero tally has one readable aria-label and its numeral spans are aria-hidden', async () => {
		const { root } = await renderMontage(montageMidYaml);
		expect(root.querySelector('.dse-mt__board')?.getAttribute('role')).toBeNull();
		const kira = tallyFor(root, 'Kira');
		expect(kira.getAttribute('aria-label')).toBe('Kira: 2 successes, 0 failures');
		expect(kira.querySelectorAll('.dse-mt__tally[aria-hidden="true"]')).toHaveLength(2);

		const osric = tallyFor(root, 'Osric');
		expect(osric.getAttribute('aria-label')).toBe('Osric: 0 successes, 1 failure');
	});

	// Fix-round-1 L-6: a duplicate hero+round entry used to render ONE cell (`.find`, first
	// match) but tally BOTH (`.filter`, every match) — the two layers disagreed about how
	// many tests happened. `entriesForHero` now dedupes once, shared by both.
	test('L-6: a duplicate hero+round entry renders exactly one cell (first wins) AND is counted only once in the tally — board and tally agree', async () => {
		const { root } = await renderMontage(
			[
				'rounds: 1',
				'success_limit: 5',
				'failure_limit: 3',
				'participants:',
				'  - name: Kira',
				'    skills_used: []',
				'entries:',
				'  - hero: Kira',
				'    round: 1',
				'    result: success',
				'    skill: Nature',
				'  - hero: Kira', // duplicate hero+round — first (success) wins
				'    round: 1',
				'    result: failure',
				'current_round: 1',
			].join('\n'),
		);
		const cell = cellFor(root, 'Kira', 1);
		expect(cell.getAttribute('data-kind')).toBe('success');
		expect(cell.querySelector('.dse-mt__cell-skill')?.textContent).toBe('Nature');
		const kira = tallyFor(root, 'Kira');
		expect(tallyN(kira, 'success')).toBe('1');
		expect(tallyN(kira, 'failure')).toBe('0');
	});

	// Fix-round-1 L-2: an entry whose `result` is a Director typo — preserved through
	// parse→serialize (model.ts), never dropped — renders on the board exactly like
	// "nothing recorded" (`data-kind="none"`, the dash face), but its note is NOT lost: the
	// note mark still shows on the cell itself.
	test('L-2: an entry with an unrecognised result renders as `data-kind="none"` (the dash face), and its note mark still shows', async () => {
		const { root } = await renderMontage(
			[
				'rounds: 1',
				'success_limit: 5',
				'failure_limit: 3',
				'participants:',
				'  - name: Osric',
				'    skills_used: []',
				'entries:',
				'  - hero: Osric',
				'    round: 1',
				'    result: sucess', // typo — preserved, rendered as none
				'    note: Turned an ankle.',
				'current_round: 1',
			].join('\n'),
		);
		const cell = cellFor(root, 'Osric', 1);
		expect(cell.getAttribute('data-kind')).toBe('none');
		expect(cell.getAttribute('data-noted')).toBe('on');
		expect(cell.querySelector('.dse-mt__cell-notemark')?.getAttribute('title')).toBe('Turned an ankle.');
		expect(cell.querySelector('.dse-mt__cell-glyph--none')).not.toBeNull();
	});
});

describe('SC-191 slice 2: OutcomeBandView (verdict / equal-width tracks / rule / notes / brink)', () => {
	test('the `pending` band (model.ts\'s fourth band, fixed this slice): 0/0 reads "This montage" / "Not started", never Total Failure', async () => {
		const { root } = await renderMontage();
		expect(outcomeBand(root).getAttribute('data-band')).toBe('pending');
		expect(verdictEyebrow(root).textContent).toBe('This montage');
		expect(verdictWord(root).textContent).toBe('Not started');
	});

	// Fix-round-1 H-1: `montageOutcome` used to gate `partial` behind `exhausted`, which made
	// it unreachable while the montage is still live — the mid fixture (5/2, margin +3, not
	// yet exhausted) rendered "If it ended now / Total Failure" directly above its own rule
	// line "…lead failures by 2 — currently +3", contradicting itself. The approved mock
	// (`sc191-r5-tracks-mid-dark.png`) renders Partial Success for the same numbers.
	test('the live band on the mid fixture: "If it ended now" / "Partial Success" (margin +3, not yet exhausted) — the band word never contradicts its own rule line', async () => {
		const { root } = await renderMontage(montageMidYaml);
		expect(outcomeBand(root).getAttribute('data-band')).toBe('partial');
		expect(verdictEyebrow(root).textContent).toBe('If it ended now');
		expect(verdictWord(root).textContent).toBe('Partial Success');
		expect(root.querySelector('.dse-mt__verdict-rule')?.textContent).toBe(
			'Partial Success needs successes to lead failures by 2 — currently +3.',
		);
	});

	// Fix-round-1 I-8: a complete `partial` band states ITS OWN Victory rule, not the Total
	// Success sentence a complete band always printed before this fix.
	test('a complete `partial` band (rounds exhausted, margin +2) states the Partial Success Victory rule, not the Total Success one', async () => {
		const { root } = await renderMontage(
			[
				'rounds: 2',
				'success_limit: 6',
				'failure_limit: 9',
				'participants:',
				'  - name: Kira',
				'    skills_used: []',
				'successes: 5',
				'failures: 3',
				'current_round: 3', // past the last round -> exhausted
			].join('\n'),
		);
		expect(outcomeBand(root).getAttribute('data-band')).toBe('partial');
		expect(verdictEyebrow(root).textContent).toBe('Final result');
		const rule = root.querySelector('.dse-mt__verdict-rule')?.textContent;
		expect(rule).toBe('Partial Success awards 1 Victory on a moderate or hard montage.');
		expect(rule).not.toContain('Total Success');
	});

	test('the complete `total` band on the done fixture: "Final result" / "Total Success", tensed tails', async () => {
		const { root } = await renderMontage(montageDoneYaml);
		expect(outcomeBand(root).getAttribute('data-band')).toBe('total');
		expect(verdictEyebrow(root).textContent).toBe('Final result');
		expect(verdictWord(root).textContent).toBe('Total Success');
		// THE TAILS ARE TENSED (mock6.js:944-948, round 3's bug): a finished montage is not
		// "1 more ends it" away from anything.
		expect(progTail(root, 'success')).toBe('the success limit, reached');
		expect(progTail(root, 'failure')).toBe('1 under the failure limit');
		// Fix-round-1 I-8: the complete band's rule line states the outcome that actually
		// happened.
		expect(root.querySelector('.dse-mt__verdict-rule')?.textContent).toBe(
			'Total Success awards 1 Victory on an easy or moderate montage, 2 on a hard one.',
		);
	});

	// Fix-round-1 I-8: a complete `failure` band used to ALSO print the Total Success
	// Victory sentence (faithful to the mock's own bug, mock6.js:1011) — the reader saw a
	// reward rule for an outcome that didn't happen.
	test('the complete `failure` band on the failed fixture: failures at the limit, margin under 2, and its rule line states NO Victories — never the Total Success sentence', async () => {
		const { root } = await renderMontage(montageFailedYaml);
		expect(outcomeBand(root).getAttribute('data-band')).toBe('failure');
		expect(verdictEyebrow(root).textContent).toBe('Final result');
		const rule = root.querySelector('.dse-mt__verdict-rule')?.textContent;
		expect(rule).toBe('Total Failure — no Victories awarded.');
		expect(rule).not.toContain('Total Success');
	});

	// Fix-round-1 M-5: this jest/jsdom test can only assert SLOT COUNTS — jsdom has no
	// layout engine, so `getBoundingClientRect().width` is always 0 here and cannot gate
	// the actual equal-WIDTH ruling. The real width regression gate is
	// `assertMontageTrackWidths` in visual-harness/shoot.mjs (`npm run shots`'s
	// "montage track widths OK" line), a Playwright measurement on the `montage-mid`
	// capture — this test's name says what IT proves, not the ruling as a whole.
	test('track slot counts match `success_limit`/`failure_limit` exactly, and the goal slot marks the last one — the DOM-shape precondition the real width gate (shoot.mjs) depends on', async () => {
		const { root } = await renderMontage(montageMidYaml); // success_limit 6, failure_limit 3
		expect(trackSlots(root, 'success')).toHaveLength(6);
		expect(trackSlots(root, 'failure')).toHaveLength(3);
		// The goal slot (the limit itself) is marked on the LAST slot of each track.
		const successSlots = trackSlots(root, 'success');
		const failureSlots = trackSlots(root, 'failure');
		expect(successSlots[successSlots.length - 1].getAttribute('data-goal')).toBe('on');
		expect(failureSlots[failureSlots.length - 1].getAttribute('data-goal')).toBe('on');
	});

	test('the at-a-glance tail phrasing matches montageBandCopy exactly on the mid fixture', async () => {
		const { root } = await renderMontage(montageMidYaml);
		expect(progTail(root, 'success')).toBe('1 from Total Success');
		expect(progTail(root, 'failure')).toBe('1 more ends it');
	});

	test('the brink alert fires exactly one success from Total Success while still reachable, and only then', async () => {
		const { root: mid } = await renderMontage(montageMidYaml); // toTotal 1, brink
		expect(outcomeBand(mid).getAttribute('data-brink')).toBe('on');
		expect(mid.querySelector('.dse-mt__verdict-alert-text')?.textContent).toBe('One success from Total Success');

		const { root: done } = await renderMontage(montageDoneYaml); // complete — never a brink
		expect(outcomeBand(done).getAttribute('data-brink')).toBe('off');
		expect(done.querySelector('.dse-mt__verdict-alert')).toBeNull();
	});

	test("the Director's notes list every noted entry, in round/roster order, with the result glyph and the address back to the board", async () => {
		const { root } = await renderMontage(montageMidYaml);
		const items = Array.from(root.querySelectorAll('.dse-mt__note'));
		expect(items).toHaveLength(2);
		expect(items[0].querySelector('.dse-mt__note-hero')?.textContent).toBe('Osric');
		expect(items[0].querySelector('.dse-mt__note-where')?.textContent).toBe('round 1 · climb');
		expect(items[0].querySelector('.dse-mt__note-text')?.textContent).toContain('Turned an ankle');
		expect(items[0].querySelector('.dse-mt__note-glyph')?.getAttribute('data-icon')).toBe('x');
		expect(items[1].querySelector('.dse-mt__note-hero')?.textContent).toBe('Bram');
	});

	// Fix-round-1 L-4 follow-up (folded into slice 3 per the owner ruling, sc191-decisions.md
	// 2026-09-02): the sort-key fix (rosterIndex, not localeCompare — OutcomeBandView.ts's
	// buildNotes) landed in fix round 1, but `montageMidYaml`'s two notes are one-per-round,
	// so the old (alphabetical) and new (roster-order) keys coincidentally agreed there and
	// the test above passes either way. This fixture puts two notes on the SAME round with
	// heroes that sort oppositely by name vs. by roster position (Yenna is listed FIRST in
	// `participants`, but "Bram" < "Yenna" alphabetically) — a real regression gate for the
	// fix, not an implicit one.
	test('L-4: two same-round notes list in ROSTER order, not alphabetical order', async () => {
		const { root } = await renderMontage(
			[
				'rounds: 1',
				'success_limit: 5',
				'failure_limit: 3',
				'participants:',
				'  - name: Yenna',
				'    skills_used: []',
				'  - name: Bram',
				'    skills_used: []',
				'entries:',
				'  - hero: Bram',
				'    round: 1',
				'    result: failure',
				'    note: Bram note.',
				'  - hero: Yenna',
				'    round: 1',
				'    result: success',
				'    note: Yenna note.',
				'current_round: 1',
			].join('\n'),
		);
		const items = Array.from(root.querySelectorAll('.dse-mt__note'));
		expect(items).toHaveLength(2);
		// Roster order (Yenna, then Bram) — NOT alphabetical (Bram, then Yenna), which is
		// what `entries[]`'s own authored order (Bram first) also disagrees with, so this
		// fixture rules out both wrong sort keys at once.
		expect(items[0].querySelector('.dse-mt__note-hero')?.textContent).toBe('Yenna');
		expect(items[1].querySelector('.dse-mt__note-hero')?.textContent).toBe('Bram');
	});

	test('no notes on the default fixture: the notes block does not render at all', async () => {
		const { root } = await renderMontage();
		expect(root.querySelector('.dse-mt__notes')).toBeNull();
	});

	// Fix-round-1 L-2: a note attached to an entry with an unrecognised `result` still lists
	// in the band — OutcomeBandView reads `entries` directly and never filters by result
	// validity — with a neutral `data-kind="none"` glyph rather than the old fallback that
	// matched EVERY non-success/non-failure value (assist included, but also this).
	test('L-2: a note on an entry with an unrecognised result still lists in the band, with a neutral (none) glyph — never lost, never misread as assist', async () => {
		const { root } = await renderMontage(
			[
				'rounds: 1',
				'success_limit: 5',
				'failure_limit: 3',
				'participants:',
				'  - name: Osric',
				'    skills_used: []',
				'entries:',
				'  - hero: Osric',
				'    round: 1',
				'    result: sucess',
				'    note: Turned an ankle.',
				'current_round: 1',
			].join('\n'),
		);
		const items = Array.from(root.querySelectorAll('.dse-mt__note'));
		expect(items).toHaveLength(1);
		expect(items[0].getAttribute('data-kind')).toBe('none');
		expect(items[0].querySelector('.dse-mt__note-glyph')?.getAttribute('data-icon')).toBe('minus');
		expect(items[0].querySelector('.dse-mt__note-text')?.textContent).toBe('Turned an ankle.');
	});

	// Fix-round-1 L-1: a vacuous (0-default) limit renders a "no limit set" caption in the
	// track's own grid column instead of a `.dse-mt__track` with zero slot children (an
	// empty flex row — visually a blank gap beside a tail that already says the same thing).
	test('L-1: a vacuous limit (0, never authored) renders a "no limit set" caption instead of an empty track', async () => {
		const { root } = await renderMontage(
			['rounds: 2', 'success_limit: 0', 'failure_limit: 3', 'successes: 0', 'failures: 1', 'current_round: 1'].join('\n'),
		);
		expect(outcomeBand(root).querySelectorAll('.dse-mt__track-empty')).toHaveLength(1);
		expect(outcomeBand(root).querySelector('.dse-mt__track-empty')?.textContent).toBe('no limit set');
		expect(trackSlots(root, 'success')).toHaveLength(0);
		expect(progTail(root, 'success')).toBe('no success limit set');
		// The OTHER track (a real limit) is unaffected.
		expect(trackSlots(root, 'failure')).toHaveLength(3);
	});

	test("§B.4 migration proof: an old-shape block (successes: 4, no entries) renders an EMPTY board but the outcome band states the stored scalars truthfully — the honest 'provenance unknown' reading (§B.3)", async () => {
		const { root } = await renderMontage(montageOldShapeYaml);
		expect(heroRow(root, 'Kira').parentElement).toBe(root.querySelector('.dse-mt__board'));
		expect(cellFor(root, 'Kira', 1).querySelector('.dse-mt__cell-skill--none')).not.toBeNull();
		expect(trackSlots(root, 'success').filter((s) => s.getAttribute('data-filled') === 'on')).toHaveLength(4);
		expect(trackSlots(root, 'failure').filter((s) => s.getAttribute('data-filled') === 'on')).toHaveLength(2);
	});
});

// SLICE 4: the hand-rolled ⋯ Menu is gone — every ⋯ item now rides the SC-169 chrome
// panel (`ElementView.chromeItems()`). `chromeItem` below queries it the same way the
// framework's own chrome tests do (`[data-dse-chrome-item="<id>"]`) — real DOM in jsdom
// regardless of the panel's hover-reveal CSS.
const chromeItem = (root: HTMLElement, id: string) =>
	root.querySelector(`[data-dse-chrome-item="${id}"]`) as HTMLButtonElement | null;

describe('SC-191 fix round 2: the ⋯ chrome menu carries exactly FOUR items — no Clear all (ledger 2026-09-03)', () => {
	test('add a round / add a hero / set limits… / Reset progress render as real, aria-labelled chrome items; Clear all is NOT one of them', async () => {
		const { root } = await renderMontage(montageMidYaml);
		const ids = Array.from(root.querySelectorAll('.dse-chrome [data-dse-chrome-item]'))
			.map((el) => el.getAttribute('data-dse-chrome-item'))
			.filter((id): id is string => !!id && id.startsWith('montage-'));
		expect(ids.sort()).toEqual(
			['montage-add-hero', 'montage-add-round', 'montage-reset-progress', 'montage-set-limits'].sort(),
		);
		expect(chromeItem(root, 'montage-add-round')?.getAttribute('aria-label')).toBe('Add a round');
		expect(chromeItem(root, 'montage-add-hero')?.getAttribute('aria-label')).toBe('Add a hero');
		expect(chromeItem(root, 'montage-set-limits')?.getAttribute('aria-label')).toBe('Set limits…');
		expect(chromeItem(root, 'montage-reset-progress')?.getAttribute('aria-label')).toBe('Reset progress');
		expect(chromeItem(root, 'montage-clear-all')).toBeNull();
	});

	test('read-only host: none of the four montage ⋯ items render (F1 §4.4 — no dead-end panel item)', async () => {
		const { root } = await renderMontage(montageMidYaml, { canPersist: false });
		expect(chromeItem(root, 'montage-add-round')).toBeNull();
		expect(chromeItem(root, 'montage-add-hero')).toBeNull();
		expect(chromeItem(root, 'montage-set-limits')).toBeNull();
		expect(chromeItem(root, 'montage-reset-progress')).toBeNull();
	});

	test('"Add a round" extends `rounds` by one, rebuilds an extra round column, and persists', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderMontage(montageMidYaml); // rounds: 3
		chromeItem(root, 'montage-add-round')!.click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		const rebuilt = host.containerEl.firstElementChild as HTMLElement;
		expect(cellFor(rebuilt, 'Kira', 4)).toBeDefined();
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect((host.replaceSource as jest.Mock).mock.calls[0][0] as string).toContain('rounds: 4');
		jest.useRealTimers();
	});

	test('"Set limits…" opens a modal pre-filled with the current limits; saving new values persists them', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderMontage(montageMidYaml); // success_limit 6, failure_limit 3
		chromeItem(root, 'montage-set-limits')!.click();
		const modalEl = document.body.lastElementChild as HTMLElement;
		const successInput = modalEl.querySelector('input[aria-label="Success limit"]') as HTMLInputElement;
		const failureInput = modalEl.querySelector('input[aria-label="Failure limit"]') as HTMLInputElement;
		expect(successInput.value).toBe('6');
		expect(failureInput.value).toBe('3');
		successInput.value = '8';
		failureInput.value = '4';
		(modalEl.querySelector('button[aria-label="Save"]') as HTMLButtonElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		const written = (host.replaceSource as jest.Mock).mock.calls[0][0] as string;
		expect(written).toContain('success_limit: 8');
		expect(written).toContain('failure_limit: 4');
		jest.useRealTimers();
	});
});

describe('T-6: Reset progress (⋯ item) / Clear all (done-state bar) — clear successes/failures/round/skills_used/entries, keep config', () => {
	afterEach(() => {
		jest.useRealTimers();
		Notice.notices.length = 0;
	});

	function assertProgressCleared(rebuilt: HTMLElement, host: ReturnType<typeof makeHost>): void {
		expect(heroRows(rebuilt)).toHaveLength(5);
		// current_round reset to 1 -> round 1 is CURRENT again (an open socket), not a past
		// dash — entries are gone, so nothing is recorded there any more.
		expect(cellFor(rebuilt, 'Kira', 1).getAttribute('data-state')).toBe('current');
		expect(cellFor(rebuilt, 'Kira', 1).querySelector('.dse-mt__cell-hint')?.textContent).toBe('to act');
		expect(outcomeBand(rebuilt).getAttribute('data-band')).toBe('pending');
		// title/description/rounds/limits/participant roster survive the reset (config, not progress).
		expect((rebuilt.querySelector('.dse-head__primary--left') as HTMLElement).textContent).toBe(
			'Cross the Ashfall Wastes',
		);
		expect(rebuilt.querySelector('.dse-mt__brief-text')).not.toBeNull();
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		const written = (host.replaceSource as jest.Mock).mock.calls[0][0] as string;
		expect(written).not.toContain('entries:');
	}

	test('"Reset progress" (⋯ item, reachable on a LIVE montage) zeroes progress AND entries, rebuilds to the `pending` band, and persists', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderMontage(montageMidYaml); // not complete

		chromeItem(root, 'montage-reset-progress')!.click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(Notice.notices).toContain('Montage progress reset');
		assertProgressCleared(host.containerEl.firstElementChild as HTMLElement, host);
	});

	test('"Clear all" (the done-state bar\'s danger button, fix round 2) zeroes progress AND entries the same way, and persists', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderMontage(montageDoneYaml); // complete
		const clearAllBtn = root.querySelector('.dse-mt__actionrow button[aria-label="Clear all"]') as HTMLButtonElement;
		expect(clearAllBtn).not.toBeNull();
		clearAllBtn.click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(Notice.notices).toContain('Montage progress cleared');
		assertProgressCleared(host.containerEl.firstElementChild as HTMLElement, host);
	});
});

describe('SC-191 fix round 2: the bottom action bar (mock6.js `actionBar()`)', () => {
	test('LIVE state (not complete): `Log an action…` (accent) · `Undo` · `End round N`, in that DOM order, no Reopen/Clear all', async () => {
		const { root } = await renderMontage(montageMidYaml); // current_round 3, not complete
		const bar = root.querySelector('.dse-mt__actionrow') as HTMLElement;
		expect(bar.getAttribute('data-complete')).toBe('off');
		const buttons = Array.from(bar.querySelectorAll('button'));
		expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Log an action…', 'Undo', 'End round 3']);
		expect(buttons[0].classList.contains('dse-btn--accent')).toBe(true);
		expect(bar.querySelector('button[aria-label="Reopen"]')).toBeNull();
		expect(bar.querySelector('button[aria-label="Clear all"]')).toBeNull();
	});

	test('"Undo" is disabled with no entries logged yet, and enabled once one exists', async () => {
		const { root: bare } = await renderMontage(); // default fixture, no entries
		expect((bare.querySelector('.dse-mt__actionrow button[aria-label="Undo"]') as HTMLButtonElement).disabled).toBe(
			true,
		);
		const { root: mid } = await renderMontage(montageMidYaml); // has entries
		expect((mid.querySelector('.dse-mt__actionrow button[aria-label="Undo"]') as HTMLButtonElement).disabled).toBe(
			false,
		);
	});

	test('"Undo" removes the MOST RECENTLY LOGGED entry (last in entries[] order) and restores its tally/skill contribution, persists', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderMontage(montageMidYaml);
		// fixture-mid.yaml's LAST entry: Talin, round 2, assist, skill Track — an assist,
		// so undoing it must NOT move successes/failures (only the skill/entry list).
		(root.querySelector('.dse-mt__actionrow button[aria-label="Undo"]') as HTMLButtonElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		const written = (host.replaceSource as jest.Mock).mock.calls[0][0] as string;
		expect(written).toContain('successes: 5'); // unchanged (assist never tallies)
		expect(written).toContain('failures: 2'); // unchanged
		// Talin's round-2 assist is gone; Talin's round-1 success (an earlier log) survives.
		expect(written).not.toMatch(/hero: Talin\n\s*round: 2/);
		expect(written).toMatch(/hero: Talin\n\s*round: 1/);
		jest.useRealTimers();
	});

	test('"End round N" shows the round being ended, advances `current_round` by one, and persists — the sheet keeps logging into the new current round', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderMontage(montageMidYaml); // current_round: 3, rounds: 3
		const endBtn = root.querySelector('.dse-mt__actionrow button[aria-label="End round 3"]') as HTMLButtonElement;
		expect(endBtn).not.toBeNull();
		endBtn.click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		const written = (host.replaceSource as jest.Mock).mock.calls[0][0] as string;
		expect(written).toContain('current_round: 4');
		// Ending the last round with no limit reached exhausts the montage (model.ts's own
		// isExhausted: current_round > rounds) — the outcome band re-derives `complete`
		// live, no separate "mark complete" write.
		const rebuilt = host.containerEl.firstElementChild as HTMLElement;
		expect(outcomeBand(rebuilt).getAttribute('data-band')).not.toBe('pending');
		expect((rebuilt.querySelector('.dse-mt__actionrow') as HTMLElement).getAttribute('data-complete')).toBe('on');
		jest.useRealTimers();
	});

	test('COMPLETE state (success-limit reached, montage-done fixture): stands down to `Reopen` + danger `Clear all`, no Log/Undo/End round', async () => {
		const { root } = await renderMontage(montageDoneYaml);
		const bar = root.querySelector('.dse-mt__actionrow') as HTMLElement;
		expect(bar.getAttribute('data-complete')).toBe('on');
		expect(bar.querySelector('button[aria-label="Log an action…"]')).toBeNull();
		expect(bar.querySelector('button[aria-label="Undo"]')).toBeNull();
		expect(bar.querySelector(('button[aria-label^="End round"]'))).toBeNull();
		const clearAll = bar.querySelector('button[aria-label="Clear all"]') as HTMLButtonElement;
		expect(clearAll).not.toBeNull();
		expect(clearAll.classList.contains('dse-btn--danger')).toBe(true);
	});

	test('COMPLETE by a LIMIT (montage-done: success_limit reached): `Reopen` is NOT offered — a limit is final', async () => {
		const { root } = await renderMontage(montageDoneYaml);
		expect(root.querySelector('.dse-mt__actionrow button[aria-label="Reopen"]')).toBeNull();
	});

	test('COMPLETE by ROUNDS ONLY (no limit reached): `Reopen` IS offered, and extends `rounds` to make the montage live again', async () => {
		jest.useFakeTimers();
		// success_limit 6/failures under 3, current_round 4 > rounds 3 — exhausted by
		// rounds alone, matching the "End round N" test above's own end state.
		const { root, host } = await renderMontage(
			[
				'title: Reopen Case',
				'rounds: 3',
				'success_limit: 6',
				'failure_limit: 3',
				'successes: 4',
				'failures: 1',
				'participants:',
				'  - name: Kira',
				'    skills_used: []',
				'current_round: 4',
			].join('\n'),
		);
		const bar = root.querySelector('.dse-mt__actionrow') as HTMLElement;
		expect(bar.getAttribute('data-complete')).toBe('on');
		const reopenBtn = bar.querySelector('button[aria-label="Reopen"]') as HTMLButtonElement;
		expect(reopenBtn).not.toBeNull();
		reopenBtn.click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		const written = (host.replaceSource as jest.Mock).mock.calls[0][0] as string;
		expect(written).toContain('rounds: 4'); // extended — 4 == current_round again, live
		const rebuilt = host.containerEl.firstElementChild as HTMLElement;
		expect((rebuilt.querySelector('.dse-mt__actionrow') as HTMLElement).getAttribute('data-complete')).toBe('off');
		jest.useRealTimers();
	});

	test('read-only host: every bar button renders real-disabled, never omitted (owner ruling I-6)', async () => {
		const { root } = await renderMontage(montageMidYaml, { canPersist: false });
		const bar = root.querySelector('.dse-mt__actionrow') as HTMLElement;
		const buttons = Array.from(bar.querySelectorAll('button')) as HTMLButtonElement[];
		expect(buttons.length).toBeGreaterThan(0);
		for (const b of buttons) expect(b.disabled).toBe(true);
	});

	test('read-only + complete: the done-state bar buttons also render real-disabled', async () => {
		const { root } = await renderMontage(montageDoneYaml, { canPersist: false });
		const bar = root.querySelector('.dse-mt__actionrow') as HTMLElement;
		expect(bar.getAttribute('data-complete')).toBe('on');
		const clearAll = bar.querySelector('button[aria-label="Clear all"]') as HTMLButtonElement;
		expect(clearAll.disabled).toBe(true);
	});
});

describe('T-6: canPersist=false — read-only renders WITHOUT any live board/menu write affordance, zero writes (F1 §4.4)', () => {
	test('readonly badge attr; no montage ⋯ items; every board control stays real-disabled', async () => {
		const { root, host } = await renderMontage(montageMidYaml, { canPersist: false });

		expect(root.hasAttribute('data-dse-readonly')).toBe(true);
		expect(chromeItem(root, 'montage-reset-progress')).toBeNull();
		// The board renders identically read-only vs. read-write in SHAPE (every control is
		// a real-disabled stub, never omitted) — the assertion is that nothing throws and
		// nothing writes.
		expect(heroRows(root)).toHaveLength(5);
		expect(host.replaceSource).not.toHaveBeenCalled();
	});
});

describe('T-6: persisted write path through a REAL ReadingModeBlockHost + FakeVault (F1 §3.4/§4.2)', () => {
	test('Reset progress inside a ```ds-montage block -> exactly one Vault write; surrounding note bytes intact', async () => {
		jest.useFakeTimers();
		const app = new App();
		const note = ['# Session notes', '', 'Before text.', '', '```ds-montage', montageMidYaml.trimEnd(), '```', '', 'After text.'].join(
			'\n',
		);
		app.vault.setFile('Note.md', note);
		const plugin = new Plugin(app);
		const ctx = makeFakeContext(app, 'Note.md');
		const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-montage');
		const pipeline = new ElementPipeline(makeDeps());

		await pipeline.run(montageElement, montageMidYaml, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		chromeItem(root, 'montage-reset-progress')!.click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(app.vault.modifyCalls).toHaveLength(1);
		const updated = app.vault.getContent('Note.md')!;
		expect(updated.startsWith('# Session notes\n\nBefore text.\n\n```ds-montage\n')).toBe(true);
		expect(updated.endsWith('\n```\n\nAfter text.')).toBe(true);
		const body = updated.match(/```ds-montage\n([\s\S]*?)\n```/)?.[1];
		expect(body).toContain('successes: 0');
		expect(body).toContain('failures: 0');

		jest.useRealTimers();
		Notice.notices.length = 0;
	});

	test('spec §C integrity probe 2: TWO ds-montage blocks in one note do not cross-talk — resetting block A leaves block B\'s YAML byte-for-byte untouched', async () => {
		jest.useFakeTimers();
		const app = new App();
		const note = [
			'# Session notes',
			'',
			'```ds-montage',
			montageMidYaml.trimEnd(),
			'```',
			'',
			'```ds-montage',
			montageDoneYaml.trimEnd(),
			'```',
		].join('\n');
		app.vault.setFile('Note.md', note);
		const plugin = new Plugin(app);
		const ctxA = makeFakeContext(app, 'Note.md', 0);
		const ctxB = makeFakeContext(app, 'Note.md', 1);
		const hostA = new ReadingModeBlockHost(plugin as any, ctxA.el, ctxA as any, 'ds-montage');
		const hostB = new ReadingModeBlockHost(plugin as any, ctxB.el, ctxB as any, 'ds-montage');
		const pipeline = new ElementPipeline(makeDeps());

		await pipeline.run(montageElement, montageMidYaml, hostA);
		await pipeline.run(montageElement, montageDoneYaml, hostB);

		const rootA = hostA.containerEl.firstElementChild as HTMLElement;
		chromeItem(rootA, 'montage-reset-progress')!.click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(app.vault.modifyCalls).toHaveLength(1);
		const updated = app.vault.getContent('Note.md')!;
		// Block A (mid, reset) now reads 0/0; block B (done — total success) is untouched.
		const blocks = Array.from(updated.matchAll(/```ds-montage\n([\s\S]*?)\n```/g)).map((m) => m[1]);
		expect(blocks).toHaveLength(2);
		expect(blocks[0]).toContain('successes: 0');
		expect(blocks[0]).toContain('failures: 0');
		expect(blocks[1]).toBe(montageDoneYaml.trimEnd());

		jest.useRealTimers();
		Notice.notices.length = 0;
	});
});

describe('T-6: registered EXACTLY ONCE — framework registry owns ds-montage, RegisterElements.ts does not', () => {
	test('registerFrameworkElementDefinitions registers montage; the alias resolves to it', () => {
		const registry = createElementRegistry();
		registerFrameworkElementDefinitions(registry);

		expect(registry.get('montage')?.id).toBe('montage');
		for (const alias of MT_ALIASES) {
			expect(registry.get(alias)?.id).toBe('montage');
		}
	});

	test("through the REAL onload(): ds-montage gets exactly one registerMarkdownCodeBlockProcessor call", async () => {
		const app = new App();
		const plugin = new (DrawSteelAdmonitionPlugin as any)(app, { id: 'draw-steel-elements', version: 'test' });
		const registerSpy = jest.spyOn(plugin, 'registerMarkdownCodeBlockProcessor');

		await plugin.onload();

		const calls = registerSpy.mock.calls.filter(([language]: [string]) => language === 'ds-montage');
		expect(calls).toHaveLength(1);
		expect(plugin.frameworkV2!.registry.get('ds-montage')?.id).toBe('montage');

		registerSpy.mockRestore();
	});

	test('rendering a ds-montage block through the wired processor produces the kit montage DOM (end-to-end)', async () => {
		const app = new App();
		const plugin = new (DrawSteelAdmonitionPlugin as any)(app, { id: 'draw-steel-elements', version: 'test' });
		await plugin.onload();

		app.vault.setFile('Note.md', '```ds-montage\n' + montageYaml.trimEnd() + '\n```\n');
		const ctx = makeFakeContext(app, 'Note.md');
		const handler = (plugin as any).registeredProcessors.get('ds-montage');

		await handler(montageYaml, ctx.el, ctx);

		const root = ctx.el.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-element')).toBe('montage');
		expect(root.querySelector('.dse-mt')).not.toBeNull();
	});
});

describe('SC-191 slice 4: the Log an action… sheet — full write path (spec §C/§D)', () => {
	test('logging a NEW action: pick Failure, type an unused skill + a note, Log persists a delta write and the board/band reflect it', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderMontage(montageMidYaml); // successes 5, failures 2

		cellFor(root, 'Kira', 3).click(); // the open socket — new mode, hero=Kira round=3
		const modalEl = document.body.lastElementChild as HTMLElement;
		(modalEl.querySelector('.dse-optchip[data-kind="failure"]') as HTMLButtonElement).click();
		const skillInput = modalEl.querySelector('input[aria-label="Skill used"]') as HTMLInputElement;
		skillInput.value = 'Insight';
		skillInput.dispatchEvent(new Event('input'));
		const noteInput = modalEl.querySelector('textarea[aria-label="Note"]') as HTMLTextAreaElement;
		noteInput.value = 'Spotted a trap too late.';
		noteInput.dispatchEvent(new Event('input'));
		(modalEl.querySelector('button[aria-label="Log"]') as HTMLButtonElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		const rebuilt = host.containerEl.firstElementChild as HTMLElement;
		const cell = cellFor(rebuilt, 'Kira', 3);
		expect(cell.getAttribute('data-kind')).toBe('failure');
		expect(cell.querySelector('.dse-mt__cell-skill')?.textContent).toBe('Insight');
		const kira = tallyFor(rebuilt, 'Kira');
		expect(tallyN(kira, 'failure')).toBe('1'); // was 0
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		const written = (host.replaceSource as jest.Mock).mock.calls[0][0] as string;
		expect(written).toContain('failures: 3'); // 2 -> 3, a delta, not a recount
		expect(written).toContain('note: Spotted a trap too late.');
		jest.useRealTimers();
	});

	test('correcting an entry (success -> failure): Scott\'s ticket case — Save deltas BOTH tallies and persists', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderMontage(montageMidYaml); // Kira round 1: success/Nature

		cellFor(root, 'Kira', 1).click(); // recorded cell — edit mode
		const modalEl = document.body.lastElementChild as HTMLElement;
		(modalEl.querySelector('.dse-optchip[data-kind="failure"]') as HTMLButtonElement).click();
		(modalEl.querySelector('button[aria-label="Save"]') as HTMLButtonElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		const rebuilt = host.containerEl.firstElementChild as HTMLElement;
		expect(cellFor(rebuilt, 'Kira', 1).getAttribute('data-kind')).toBe('failure');
		const kira = tallyFor(rebuilt, 'Kira');
		expect(tallyN(kira, 'success')).toBe('1'); // was 2
		expect(tallyN(kira, 'failure')).toBe('1'); // was 0
		const written = (host.replaceSource as jest.Mock).mock.calls[0][0] as string;
		expect(written).toContain('successes: 4'); // 5 -> 4
		expect(written).toContain('failures: 3'); // 2 -> 3
		jest.useRealTimers();
	});

	test('Remove: undoes the tally/skill contribution, splices the entry out, and persists', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderMontage(montageMidYaml); // Osric round 1: failure/Climb, noted

		cellFor(root, 'Osric', 1).click();
		const modalEl = document.body.lastElementChild as HTMLElement;
		(modalEl.querySelector('button[aria-label="Remove this action"]') as HTMLButtonElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		const rebuilt = host.containerEl.firstElementChild as HTMLElement;
		expect(cellFor(rebuilt, 'Osric', 1).getAttribute('data-kind')).toBe('none');
		const osric = tallyFor(rebuilt, 'Osric');
		expect(tallyN(osric, 'failure')).toBe('0'); // was 1
		const written = (host.replaceSource as jest.Mock).mock.calls[0][0] as string;
		expect(written).toContain('failures: 1'); // 2 -> 1
		jest.useRealTimers();
	});

	test('§C integrity probe 5 through the REAL write path: an old-shape block (successes: 4, no entries) logs one action via the sheet and reads successes: 5 with a one-item entries list — not successes: 1', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderMontage(montageOldShapeYaml); // Kira round 2 open, successes: 4

		cellFor(root, 'Kira', 2).click();
		const modalEl = document.body.lastElementChild as HTMLElement;
		(modalEl.querySelector('button[aria-label="Log"]') as HTMLButtonElement).click(); // Success is the sheet's own default
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		const written = (host.replaceSource as jest.Mock).mock.calls[0][0] as string;
		expect(written).toContain('successes: 5');
		expect(written).toMatch(/entries:\n\s*- hero: Kira/);
		jest.useRealTimers();
	});

	test('the skill-reuse warning fires live while typing an already-used skill, and clears once the field no longer matches', async () => {
		const { root } = await renderMontage(montageMidYaml); // Kira has used Nature, Alertness
		cellFor(root, 'Kira', 3).click(); // new mode, hero pre-selected Kira
		const modalEl = document.body.lastElementChild as HTMLElement;
		const skillInput = modalEl.querySelector('input[aria-label="Skill used"]') as HTMLInputElement;
		const warnEl = modalEl.querySelector('.dse-mt__sheet-warn') as HTMLElement;
		expect(warnEl.hidden).toBe(true);

		skillInput.value = 'Nature';
		skillInput.dispatchEvent(new Event('input'));
		expect(warnEl.hidden).toBe(false);
		expect(warnEl.textContent).toContain('Kira already used Nature');

		skillInput.value = 'Insight';
		skillInput.dispatchEvent(new Event('input'));
		expect(warnEl.hidden).toBe(true);
	});

	test('the skill-reuse warning does NOT fire when correcting an entry back onto its own unchanged skill', async () => {
		const { root } = await renderMontage(montageMidYaml); // Kira round 1: success/Nature
		cellFor(root, 'Kira', 1).click(); // edit mode, pre-filled skill=Nature
		const modalEl = document.body.lastElementChild as HTMLElement;
		const warnEl = modalEl.querySelector('.dse-mt__sheet-warn') as HTMLElement;
		expect(warnEl.hidden).toBe(true); // the sheet pre-fills the skill input but never fires input — no warning on open
		const skillInput = modalEl.querySelector('input[aria-label="Skill used"]') as HTMLInputElement;
		expect(skillInput.value).toBe('Nature');
		// Re-typing the SAME text (the entry's own skill) must still not warn.
		skillInput.dispatchEvent(new Event('input'));
		expect(warnEl.hidden).toBe(true);
	});

	test('the roll affordance: with cx.roll present, Roll resolves a test and preselects the resulting chip', async () => {
		const roll = { resolve: () => ({ total: 14, tier: 2 }) } as unknown as RollService;
		const { root } = await renderMontage(montageMidYaml, {}, { roll });
		cellFor(root, 'Kira', 3).click();
		const modalEl = document.body.lastElementChild as HTMLElement;
		const rollBtn = modalEl.querySelector('.dse-mt__sheet-rollbtn') as HTMLButtonElement;
		expect(rollBtn).not.toBeNull();
		rollBtn.click();
		const successChip = modalEl.querySelector('.dse-optchip[data-kind="success"]') as HTMLButtonElement;
		expect(successChip.getAttribute('aria-pressed')).toBe('true');
		expect(modalEl.querySelector('.dse-mt__sheet-rollresult')?.textContent).toContain('tier 2');
	});

	test('the roll affordance is absent when cx.roll is undefined — cx.roll stays reachable but optional', async () => {
		const { root } = await renderMontage(montageMidYaml, {}, { roll: undefined });
		cellFor(root, 'Kira', 3).click();
		const modalEl = document.body.lastElementChild as HTMLElement;
		expect(modalEl.querySelector('.dse-mt__sheet-rollbtn')).toBeNull();
		// Manual entry still works with no roll service.
		expect(modalEl.querySelector('button[aria-label="Log"]')).not.toBeNull();
	});

	test('a11y: the dialog is labelled by its own visible title, and Log starts disabled when editing an entry with an unrecognised result', async () => {
		const { root } = await renderMontage(
			[
				'rounds: 1',
				'success_limit: 5',
				'failure_limit: 3',
				'participants:',
				'  - name: Osric',
				'    skills_used: []',
				'entries:',
				'  - hero: Osric',
				'    round: 1',
				'    result: sucess', // Director typo — preserved, unrecognised
				'current_round: 1',
			].join('\n'),
		);
		cellFor(root, 'Osric', 1).click();
		const modalEl = document.body.lastElementChild as HTMLElement;
		const titleEl = modalEl.querySelector('.dse-modal__title') as HTMLElement;
		expect(modalEl.getAttribute('aria-labelledby')).toBe(titleEl.id);
		expect(titleEl.textContent).toBe('Correct a logged action');
		// No result chip is pre-selected for an unrecognised value — Log stays disabled
		// until the Director makes an explicit choice.
		expect(modalEl.querySelectorAll('.dse-optchip[data-kind][aria-pressed="true"]')).toHaveLength(0);
		expect((modalEl.querySelector('button[aria-label="Save"]') as HTMLButtonElement).disabled).toBe(true);
		(modalEl.querySelector('.dse-optchip[data-kind="failure"]') as HTMLButtonElement).click();
		expect((modalEl.querySelector('button[aria-label="Save"]') as HTMLButtonElement).disabled).toBe(false);
	});
});

describe('SC-191 slice 2: source hygiene + CSS contract', () => {
	test('the view + montage sub-views pass the shared kit style guard (no inline color, no color literals)', () => {
		const files = [
			'../../../src/elements/montage/view.ts',
			'../../../src/elements/montage/HeadView.ts',
			'../../../src/elements/montage/BoardView.ts',
			'../../../src/elements/montage/OutcomeBandView.ts',
			'../../../src/elements/montage/LogActionModal.ts',
			'../../../src/elements/montage/ConfigModals.ts',
		];
		for (const file of files) {
			const src = fs.readFileSync(path.join(__dirname, file), 'utf8');
			expect(styleGuardFindings(src)).toEqual([]);
		}
	});

	test('CSS contract: a structural base tier + a Steel-only decoration tier, both scoped to .dse-mt, tokens only (spec §E)', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');
		const structural = sheet.match(/\[data-dse-element="montage"\]\s+\.dse-mt\s*\{[\s\S]*?\n\}\n\n\/\* -- Steel decoration tier/);
		expect(structural).not.toBeNull();
		expect(structural![0]).toMatch(/container-name:\s*dse-mt/);

		const steel = sheet.match(
			/\[data-dse-theme='steel'\]\[data-dse-element="montage"\]:not\(\[data-dse-print="on"\]\)\s+\.dse-mt\s*\{[\s\S]*?\n\}\n/,
		);
		expect(steel).not.toBeNull();
		expect(steel![0]).toMatch(/var\(--dse-turn-done\)/);
		expect(steel![0]).toMatch(/var\(--dse-danger\)/);
		expect(steel![0]).toMatch(/var\(--dse-vp\)/);
		// The four losing round-3 axes never ship: no variant attribute for crest, seal,
		// spacing or dedupe (spec §A: "no variant attributes at all").
		expect(sheet).not.toMatch(/\.dse-mt\[data-crest=/);
		expect(sheet).not.toMatch(/\.dse-mt\[data-seal=/);
		expect(sheet).not.toMatch(/\.dse-mt\[data-dedupe=/);
	});
});
