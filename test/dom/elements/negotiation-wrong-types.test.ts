// SC-638 — what the negotiation card does with values the Director typed by hand that are not the type it expects, through the REAL
// ElementPipeline over a real ReadingModeBlockHost + FakeVault (and, once, the sidebar's host): a number where text is expected is shown
// as text and written back as typed, a wrong-shaped structure is a plain error card that writes nothing, and the ending follows the seal.
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import { SidebarBlockHost } from '../../../src/framework/host/SidebarBlockHost';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import { createRollService } from '../../../src/framework/roll/service';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { Component } from 'obsidian';
import { App, Plugin, Menu, parseYaml, makeFakeContext } from '../../mocks/obsidian';
import { makeFakeApp, seedNote } from '../../fakes/fakeObsidian';
import { negotiationElement } from '../../../src/elements/negotiation/definition';

function makeDeps(): ElementPipelineDeps {
	const app = new App();
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	return {
		app: app as any,
		plugin: plugin as any,
		settings: DEFAULT_SETTINGS,
		theme: createThemeService(prefs, plugin as any),
		prefs,
		refs: createReferenceService(app as any, DEFAULT_SETTINGS),
		validation: createValidationService(),
		session: createSessionStore(),
		roll: createRollService(prefs),
	};
}

const OFFERS = 'i5: five\ni4: four\ni3: three\ni2: two\ni1: one\ni0: zero';
const ABOVE = '# Session 4\n\nABOVE: the **innkeeper** scene, `inline code`, a [[link]] and a rule\n\n---\n\n';
const BETWEEN = '\nBETWEEN the two negotiations\n\n';
const BELOW = '\nBELOW: closing prose\n\n- a list\n- of things\n';
const fence = (body: string): string => '```ds-negotiation\n' + body + '\n```\n';
const bodyOf = (note: string, n: number): string => [...note.matchAll(/```ds-negotiation\n([\s\S]*?)\n```/g)][n][1];
/** The note with the body of the n-th negotiation fence blanked out: what must be byte-identical after anything happens to it. */
const outside = (note: string, n: number): string => {
	let i = -1;
	return note.replace(/```ds-negotiation\n([\s\S]*?)\n```/g, (all) => (++i === n ? '```ds-negotiation\n@@\n```' : all));
};

/** Block `n` of `note` through a real ReadingModeBlockHost over a real FakeVault (fake timers; `flush()` lands the debounced write). */
async function mountBlock(note: string, n = 0) {
	jest.useFakeTimers();
	const app = new App();
	app.vault.setFile('Note.md', note);
	const plugin = new Plugin(app);
	const ctx = makeFakeContext(app, 'Note.md', n);
	document.body.appendChild(ctx.el);
	const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-negotiation');
	await new ElementPipeline(makeDeps()).run(negotiationElement, bodyOf(note, n), host);
	const root = ctx.el;
	const flush = (): Promise<void> => jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS + 50);
	const content = (): string => app.vault.getContent('Note.md')!;
	return { root, flush, content };
}

afterEach(() => {
	jest.useRealTimers();
	document.body.innerHTML = '';
	Menu.lastMenu = null;
});

const ctl = (root: HTMLElement, id: string, nth = 0): HTMLElement => root.querySelectorAll(`[data-dse-control="${id}"]`)[nth] as HTMLElement;
const seal = (root: HTMLElement, id: 'patience' | 'interest', value: number): HTMLElement =>
	root.querySelector(`[data-dse-control="negotiation.${id}.seal"][data-value="${value}"]`) as HTMLElement;
const checked = (root: HTMLElement, id: 'patience' | 'interest'): number[] =>
	Array.from(root.querySelectorAll<HTMLElement>(`[data-dse-control="negotiation.${id}.seal"]`)).filter((s) => s.getAttribute('aria-checked') === 'true').map((s) => Number(s.dataset.value));
const endedOf = (root: HTMLElement): string | null => root.querySelector('.dse-nt')!.getAttribute('data-ended');
const errorOf = (root: HTMLElement): string | null => root.querySelector('.dse-error-card-message')?.textContent ?? null;
const RAW_JS = /is not a function|Cannot read properties|undefined|_[a-z]\./;
const flushAfter = (flush: () => Promise<void>, act: () => void): Promise<void> => {
	act();
	return flush();
};

/** A block whose typed values are numbers / booleans where the negotiation reads text. */
const TYPED = [
	'name: 2024', 'initial_interest: 3', 'initial_patience: 3', 'current_interest: 3', 'current_patience: 3',
	'motivations:', '  - name: 5', '    reason: 42', '    hasBeenAppealedTo: true', '  - name: Peace', '    reason: true',
	'pitfalls:', '  - name: 7', '    reason: 1.5',
	'currentArgument:', '  motivationsUsed: [5]', '  pitfallsUsed: []', '  lieUsed: false', '  sameArgumentUsed: false', '  reusedMotivation: true',
	'i5: five', 'i4: four', 'i3: 33', 'i2: two', 'i1: one', 'i0: zero',
].join('\n');
const TYPED_NOTE = ABOVE + fence(TYPED) + BELOW;

describe('SC-638 R1: a number or boolean typed where text is expected is shown as text', () => {
	test('the name (2024), a motivation named 5 with reason 42, a pitfall named 7 and an offer typed as 33 all draw, with no error card', async () => {
		const { root } = await mountBlock(TYPED_NOTE);
		expect(root.querySelector('.dse-error-card')).toBeNull();
		expect(root.querySelector('.dse-nt__head')!.textContent).toContain('2024');
		const names = Array.from(root.querySelectorAll('.dse-nt__dos-name')).map((e) => e.textContent);
		expect(names).toEqual(['5', 'Peace', '7']);
		expect(Array.from(root.querySelectorAll('.dse-nt__dos-reason')).map((e) => e.textContent)).toEqual(['42', 'true', '1.5']);
		expect(root.textContent).toContain('33');
		expect(root.textContent).not.toMatch(RAW_JS);
	});

	test('`motivationsUsed: [5]` is the pressed chip of the motivation named 5, and that motivation is spent, so the Reuse box is available', async () => {
		const { root } = await mountBlock(TYPED_NOTE);
		const chips = Array.from(root.querySelectorAll('[data-dse-control="negotiation.appeal.motivation"]'));
		expect(chips.map((c) => c.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
		const reuse = ctl(root, 'negotiation.mod.reuse') as HTMLInputElement;
		expect(reuse.disabled).toBe(false);
		expect(reuse.checked).toBe(true);
	});
});

describe('SC-638 R2: what the card did not change is written back as typed', () => {
	test('a Patience seal clicked writes name: 2024, name: 5, reason: 42, `motivationsUsed: [5]` and the typed offer as the user typed them, and leaves the note around it byte-identical', async () => {
		const { root, flush, content } = await mountBlock(TYPED_NOTE);
		await flushAfter(flush, () => seal(root, 'patience', 1).click());
		const after = content();
		expect(bodyOf(after, 0)).not.toBe(TYPED);
		expect(bodyOf(after, 0)).toMatch(/^name: 2024$/m);
		const w = parseYaml(bodyOf(after, 0)) as any;
		expect(w.current_patience).toBe(1);
		expect(w.motivations[0]).toMatchObject({ name: 5, reason: 42, hasBeenAppealedTo: true });
		expect(w.motivations[1]).toMatchObject({ name: 'Peace', reason: true });
		expect(w.pitfalls[0]).toMatchObject({ name: 7, reason: 1.5 });
		expect(w.currentArgument.motivationsUsed).toEqual([5]);
		expect(w.i3).toBe(33);
		expect(outside(after, 0)).toBe(outside(TYPED_NOTE, 0));
	});

	test('a text value that looks like a number stays text: `name: "2024"` is never turned into a number', async () => {
		const note = ABOVE + fence(TYPED.replace('name: 2024', 'name: "2024"')) + BELOW;
		const { root, flush, content } = await mountBlock(note);
		await flushAfter(flush, () => seal(root, 'patience', 1).click());
		expect((parseYaml(bodyOf(content(), 0)) as any).name).toBe('2024');
	});

	test('pressing the chip of the motivation named 5 takes `5` off the argument and puts it back; Complete Argument spends it and keeps its typed name', async () => {
		const { root, flush, content } = await mountBlock(TYPED_NOTE);
		const chip = ctl(root, 'negotiation.appeal.motivation', 0);
		await flushAfter(flush, () => chip.click());
		expect((parseYaml(bodyOf(content(), 0)) as any).currentArgument.motivationsUsed).toEqual([]);
		await flushAfter(flush, () => chip.click());
		expect((parseYaml(bodyOf(content(), 0)) as any).currentArgument.motivationsUsed).toEqual([5]);
		ctl(root, 'negotiation.tier.row', 3).click();
		await flushAfter(flush, () => ctl(root, 'negotiation.complete').click());
		const w = parseYaml(bodyOf(content(), 0)) as any;
		expect(w.motivations[0]).toMatchObject({ name: 5, reason: 42, hasBeenAppealedTo: true });
		expect(w.currentArgument.motivationsUsed).toEqual([]);
		expect(w.name).toBe(2024);
	});

	test('`motivationsUsed: [5, "5"]` is written back as typed (the number and the quoted text apart), and pressing the chip of the motivation named 5 takes both of them off', async () => {
		const body = 'name: n\ninitial_interest: 3\ninitial_patience: 3\nmotivations:\n  - name: 5\n    reason: r\n' + OFFERS + '\ncurrentArgument:\n  motivationsUsed: [5, "5"]';
		const { root, flush, content } = await mountBlock(ABOVE + fence(body) + BELOW);
		await flushAfter(flush, () => seal(root, 'patience', 1).click());
		expect((parseYaml(bodyOf(content(), 0)) as any).currentArgument.motivationsUsed).toEqual([5, '5']);
		await flushAfter(flush, () => ctl(root, 'negotiation.appeal.motivation', 0).click());
		expect((parseYaml(bodyOf(content(), 0)) as any).currentArgument?.motivationsUsed ?? []).toEqual([]); // one press clears the chip: both entries go
		expect(ctl(root, 'negotiation.appeal.motivation', 0).getAttribute('aria-pressed')).toBe('false');
	});

	test('chip clicks on `motivationsUsed: [5, 7]`: toggling the chip of 5 off and on writes [7, 5], both still numbers', async () => {
		const body = 'name: n\ninitial_interest: 3\ninitial_patience: 3\nmotivations:\n  - name: 5\n    reason: r\n  - name: 7\n    reason: s\n' + OFFERS + '\ncurrentArgument:\n  motivationsUsed: [5, 7]';
		const { root, flush, content } = await mountBlock(ABOVE + fence(body) + BELOW);
		await flushAfter(flush, () => ctl(root, 'negotiation.appeal.motivation', 0).click());
		expect((parseYaml(bodyOf(content(), 0)) as any).currentArgument.motivationsUsed).toEqual([7]);
		await flushAfter(flush, () => ctl(root, 'negotiation.appeal.motivation', 0).click());
		expect((parseYaml(bodyOf(content(), 0)) as any).currentArgument.motivationsUsed).toEqual([7, 5]);
	});

	test('a Director\'s own key and a typed value are both kept by the same write (SC-637 alongside)', async () => {
		const note = ABOVE + fence('note_to_self: keep me\n' + TYPED) + BELOW;
		const { root, flush, content } = await mountBlock(note);
		await flushAfter(flush, () => seal(root, 'interest', 4).click());
		const w = parseYaml(bodyOf(content(), 0)) as any;
		expect(w.note_to_self).toBe('keep me');
		expect(w.name).toBe(2024);
		expect(w.current_interest).toBe(4);
	});

	test('two blocks in one note: a typed block writes as typed and the malformed block next to it is untouched, and the other way round', async () => {
		const bad = fence('name: Bad\nmotivations:\n  - Legacy\n') ;
		const note = ABOVE + bad + BETWEEN + fence(TYPED) + BELOW;
		const second = await mountBlock(note, 1);
		await flushAfter(second.flush, () => seal(second.root, 'patience', 2).click());
		const after = second.content();
		expect(bodyOf(after, 0)).toBe(bodyOf(note, 0)); // the malformed block's text is unchanged
		expect(bodyOf(after, 1)).toMatch(/^name: 2024$/m);
		expect((parseYaml(bodyOf(after, 1)) as any).current_patience).toBe(2);
		expect(outside(after, 1)).toBe(outside(note, 1));

		const first = await mountBlock(note, 0);
		expect(errorOf(first.root)).toBe("Invalid data: 'motivations' item 1 must be an object.");
		await first.flush();
		expect(first.content()).toBe(note);
	});
});

describe('SC-638 R3: a wrong-shaped structure is a plain error card that writes nothing', () => {
	const BAD: Array<[string, string, string]> = [
		['motivations: "foo"', 'motivations: foo', "Invalid data: 'motivations' field must be a list."],
		['pitfalls: "foo"', 'pitfalls: foo', "Invalid data: 'pitfalls' field must be a list."],
		['pitfalls: {a: 1}', 'pitfalls:\n  a: 1', "Invalid data: 'pitfalls' field must be a list."],
		['a blank item under motivations', 'motivations:\n  -\n  - name: Peace', "Invalid data: 'motivations' item 1 must be an object."],
		['`- Legacy` instead of `- name: Legacy`', 'motivations:\n  - name: Peace\n  - Legacy', "Invalid data: 'motivations' item 2 must be an object."],
		['a pitfall that is a number', 'pitfalls:\n  - 3', "Invalid data: 'pitfalls' item 1 must be an object."],
		['currentArgument: hello', 'currentArgument: hello', "Invalid data: 'currentArgument' field must be an object."],
		['currentArgument: { motivationsUsed: "Peace" }', 'currentArgument:\n  motivationsUsed: Peace', "Invalid data: 'currentArgument.motivationsUsed' field must be a list."],
		['currentArgument: { pitfallsUsed: {a: 1} }', 'currentArgument:\n  pitfallsUsed:\n    a: 1', "Invalid data: 'currentArgument.pitfallsUsed' field must be a list."],
		['a map as the name', 'name: {a: 1}', "Invalid data: 'name' must be text."],
		['a map as a motivation name', 'motivations:\n  - name: {a: 1}', "Invalid data: 'motivations' item 1 'name' must be text."],
		['a list as a motivation reason', 'motivations:\n  - name: A\n    reason: [x]', "Invalid data: 'motivations' item 1 'reason' must be text."],
		['a map as an offer', 'i3:\n  a: 1', "Invalid data: 'i3' must be text."],
	];

	test.each(BAD)('%s: the card says what is wrong, has no control to write with, and the note is untouched', async (_label, wrong, message) => {
		const offers = wrong.startsWith('i3') ? OFFERS.replace('i3: three\n', '') : OFFERS; // the wrong value is the i3 line itself
		const note = ABOVE + fence(`initial_interest: 3\ninitial_patience: 3\n${wrong}\n${offers}`) + BELOW;
		const { root, flush, content } = await mountBlock(note);
		expect(errorOf(root)).toBe(message);
		expect(root.querySelector('.dse-error-card-title')!.textContent).toBe('Negotiation tracker: failed to render (render)');
		expect(root.querySelector('[data-dse-error-stage]')!.getAttribute('data-dse-error-stage')).toBe('render');
		expect(root.textContent).not.toMatch(RAW_JS);
		expect(root.querySelectorAll('[data-dse-control]')).toHaveLength(0);
		await flush();
		expect(content()).toBe(note); // byte-identical: nothing was written
	});

	test.each([
		['text (`hello`)', 'hello'],
		['a list', '- a\n- b'],
		['a number', '42'],
	])('a block that is %s is a plain error, has no control, and the note is untouched', async (_label, body) => {
		const note = ABOVE + fence(body) + BELOW;
		const { root, flush, content } = await mountBlock(note);
		expect(errorOf(root)).toBe('Invalid data: the block must be a map of keys.');
		expect(root.querySelector('.dse-error-card-title')!.textContent).toBe('Negotiation tracker: failed to render (render)');
		expect(root.querySelectorAll('[data-dse-control]')).toHaveLength(0);
		await flush();
		expect(content()).toBe(note);
	});

	test.each([
		['nothing', ''],
		['whitespace', '   \n  '],
		['only a comment', '# a note to self'],
	])('an empty block (%s) is still refused, as before (SC-493), with a plain message, no control, and the note untouched', async (_label, body) => {
		const note = ABOVE + fence(body) + BELOW;
		const { root, flush, content } = await mountBlock(note);
		expect(errorOf(root)).toBe('Invalid data: the block is empty.');
		expect(root.textContent).not.toMatch(RAW_JS);
		expect(root.querySelectorAll('[data-dse-control]')).toHaveLength(0);
		await flush();
		expect(content()).toBe(note);
	});

	test('a YAML syntax error is still its own message, in its own stage', async () => {
		const note = fence('name: [unclosed\n');
		const { root } = await mountBlock(note);
		expect(root.querySelector('.dse-error-card-title')!.textContent).toMatch(/failed to render \(parse\)/);
		expect(errorOf(root)).not.toMatch(/^Invalid data/); // the YAML error path is the pipeline's own, unchanged
	});

	test('null keeps today\'s meaning: `motivations:` with nothing under it is an empty list', async () => {
		const { root } = await mountBlock(fence(`initial_interest: 3\ninitial_patience: 3\nmotivations:\npitfalls:\ncurrentArgument:\n${OFFERS}`));
		expect(root.querySelector('.dse-error-card')).toBeNull();
		expect(root.querySelector('[data-dse-control="negotiation.appeal.motivation"]')).toBeNull();
	});
});

describe('SC-638 R4: the ending follows the seal', () => {
	const standing = async (interest: string, patience: string) => {
		const { root } = await mountBlock(fence(`name: n\ninitial_interest: 3\ninitial_patience: 3\ncurrent_interest: ${interest}\ncurrent_patience: ${patience}\n${OFFERS}`));
		return { interest: checked(root, 'interest'), patience: checked(root, 'patience'), ended: endedOf(root), band: root.querySelector('.dse-nt__end-label')?.textContent ?? null };
	};

	test.each([
		['0.4', '3', [0], [3], 'hostile'],
		['0.5', '3', [1], [3], null],
		['4.4', '3', [4], [3], null],
		['4.5', '3', [5], [3], 'deal'],
		['banana', '3', [0], [3], 'hostile'],
		['"3"', '3', [3], [3], null],
		['3', 'banana', [3], [0], 'final'],
		['3', '0.4', [3], [0], 'final'],
		['3', '0.5', [3], [1], null],
		['9', '3', [5], [3], 'deal'],
	])('Interest %s, Patience %s: seals %p / %p and the ending %p (the seal drawn is the seal the ending reads)', async (interest, patience, interestSeals, patienceSeals, ended) => {
		const s = await standing(interest, patience);
		expect([s.interest, s.patience, s.ended]).toEqual([interestSeals, patienceSeals, ended]);
		expect(s.band !== null).toBe(ended !== null);
	});

	test('0.4 Interest is over: Complete Argument is off and the hint says so', async () => {
		const { root } = await mountBlock(fence(`name: n\ninitial_interest: 3\ninitial_patience: 3\ncurrent_interest: 0.4\n${OFFERS}`));
		expect((ctl(root, 'negotiation.complete') as HTMLButtonElement).disabled).toBe(true);
		expect(root.querySelector('.dse-nt__complete-hint')!.textContent).toMatch(/negotiation is over/);
	});
});

describe('SC-638: the sidebar reads the block the way the card does', () => {
	async function sidebar(body: string) {
		jest.useFakeTimers();
		const { app, vault } = makeFakeApp();
		const file = seedNote(vault, 'Note.md', ['# Notes', '', '```ds-negotiation', body, '```', '', 'tail'].join('\n'));
		const owner = new Component();
		owner.load();
		const containerEl = document.createElement('div');
		document.body.appendChild(containerEl);
		const host = new SidebarBlockHost({ app } as any, file, 'ds-negotiation', 'abc123', null, containerEl, owner, () => {}, () => {}, () => {});
		await host.refresh();
		await new ElementPipeline(makeDeps()).run(negotiationElement, body, host);
		return { containerEl, vault, text: (): string => vault.text('Note.md')! };
	}

	test('a typed block in the sidebar is written back as typed by a seal click', async () => {
		const { containerEl, text } = await sidebar(TYPED + '\n_dse_anchor: abc123');
		seal(containerEl, 'patience', 1).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS + 50);
		const written = parseYaml(/```ds-negotiation\n([\s\S]*?)\n```/.exec(text())![1]) as any;
		expect(written.name).toBe(2024);
		expect(written.motivations[0]).toMatchObject({ name: 5, reason: 42 });
		expect(written.current_patience).toBe(1);
		expect(written._dse_anchor).toBe('abc123');
	});

	test('a malformed block in the sidebar is the same plain error card and the note is not written', async () => {
		const body = 'name: The Duke\nmotivations:\n  - Legacy\n_dse_anchor: abc123';
		const { containerEl, text } = await sidebar(body);
		const before = text();
		expect(errorOf(containerEl)).toBe("Invalid data: 'motivations' item 1 must be an object.");
		expect(containerEl.querySelectorAll('[data-dse-control]')).toHaveLength(0);
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS + 50);
		expect(text()).toBe(before);
		expect(before).toContain('  - Legacy');
	});
});
