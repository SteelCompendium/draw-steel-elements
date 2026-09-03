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
import { App, Plugin, Menu, Notice, makeFakeContext } from '../../mocks/obsidian';
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

async function renderMontage(source: string = montageYaml, hostOverrides: Partial<BlockHost> = {}) {
	const pipeline = new ElementPipeline(makeDeps());
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
const menuBtn = (root: HTMLElement) => root.querySelector('.dse-mt__menu') as HTMLButtonElement | null;

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

describe('SC-191 slice 2: HeadView (cardHead + crest/deck/round-chip; the unchanged Reset menu)', () => {
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
	// `opacity:.5`-dimmed the cell's own recorded data). `aria-disabled`, not native
	// `disabled` — only a real form control has that property.
	test('the open socket in the round currently in play is `div[role=button][tabindex=0][aria-disabled=true]` — a stub, never a dead-end live control, never a real <button>', async () => {
		const { root } = await renderMontage(montageMidYaml);
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
	// chrome or `opacity:.5` dimming the seal/skill/note-mark it is displaying.
	test('a recorded cell is also `div[role=button][tabindex=0][aria-disabled=true]`, never a real <button>', async () => {
		const { root } = await renderMontage(montageMidYaml);
		const cell = cellFor(root, 'Kira', 1);
		expect(cell.tagName).toBe('DIV');
		expect(cell.classList.contains('dse-btn')).toBe(false);
		expect(cell.getAttribute('role')).toBe('button');
		expect(cell.getAttribute('tabindex')).toBe('0');
		expect(cell.getAttribute('aria-disabled')).toBe('true');
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

	test('STUBBED (slice 4 wires these): "add a hero" and every per-row "Log an action" control are real, aria-labelled, and real-disabled', async () => {
		const { root } = await renderMontage();
		const addHero = root.querySelector('.dse-mt__board-addhero') as HTMLButtonElement;
		expect(addHero.tagName).toBe('BUTTON');
		expect(addHero.disabled).toBe(true);
		expect(addHero.getAttribute('aria-label')).toBe('Add a hero');

		const rowAct = heroRow(root, 'Kira').querySelector('.dse-mt__board-rowact') as HTMLButtonElement;
		expect(rowAct.disabled).toBe(true);
		expect(rowAct.getAttribute('aria-label')).toBe('Log an action for Kira');
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

describe('T-6: reset menu — Reset progress clears successes/failures/round/skills_used/entries, keeps config', () => {
	afterEach(() => {
		jest.useRealTimers();
		Notice.notices.length = 0;
		Menu.lastMenu = null;
	});

	test('the options button opens exactly Reset progress; clicking it zeroes progress AND entries, rebuilds to the `pending` band, and persists', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderMontage(montageMidYaml);

		const button = menuBtn(root)!;
		expect(button.getAttribute('aria-label')).toBe('Montage options');
		button.click();
		const menu = Menu.lastMenu!;
		expect(menu.items).toHaveLength(1);
		expect(menu.items[0].title).toBe('Reset progress');

		menu.items[0].onClickCallback!();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(Notice.notices).toContain('Montage progress reset');
		const rebuilt = host.containerEl.firstElementChild as HTMLElement;
		expect(heroRows(rebuilt)).toHaveLength(5);
		// current_round reset to 1 -> round 1 is CURRENT again (an open, disabled socket),
		// not a past dash — entries are gone, so nothing is recorded there any more.
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
	});
});

describe('T-6: canPersist=false — read-only renders WITHOUT the Reset menu, zero writes (F1 §4.4)', () => {
	test('readonly badge attr; no menu; every board control was already stubbed-disabled', async () => {
		const { root, host } = await renderMontage(montageMidYaml, { canPersist: false });

		expect(root.hasAttribute('data-dse-readonly')).toBe(true);
		expect(menuBtn(root)).toBeNull();
		// The board renders identically read-only vs. read-write this slice (every control
		// is already a real-disabled stub) — the assertion is that nothing throws and
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
		menuBtn(root)!.click();
		Menu.lastMenu!.items[0].onClickCallback!();
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
		Menu.lastMenu = null;
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
		menuBtn(rootA)!.click();
		Menu.lastMenu!.items[0].onClickCallback!();
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
		Menu.lastMenu = null;
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

describe('SC-191 slice 2: source hygiene + CSS contract', () => {
	test('the view + montage sub-views pass the shared kit style guard (no inline color, no color literals)', () => {
		const files = [
			'../../../src/elements/montage/view.ts',
			'../../../src/elements/montage/HeadView.ts',
			'../../../src/elements/montage/BoardView.ts',
			'../../../src/elements/montage/OutcomeBandView.ts',
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
