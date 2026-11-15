// SC-640 — same-named and nameless motivations / pitfalls on the card, through the REAL ElementPipeline over a real ReadingModeBlockHost +
// FakeVault: one chip per distinct name (trimmed, case-insensitive) with a plain notice that it stands for the entries sharing the name,
// each dossier row's own Spent, Complete spending every entry of a name, and a nameless entry that is labelled, works and is never written
// as the label.
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import { createRollService } from '../../../src/framework/roll/service';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin, Menu, parseYaml, makeFakeContext } from '../../mocks/obsidian';
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
const HEAD = 'name: x\ninitial_interest: 3\ninitial_patience: 3\n';
const ABOVE = '# Session 4\n\nABOVE: the **innkeeper** scene, `inline code`, a [[link]] and a rule\n\n---\n\n';
const BETWEEN = '\nBETWEEN the two negotiations\n\n';
const BELOW = '\nBELOW: closing prose\n\n- a list\n- of things\n';
const fence = (body: string): string => '```ds-negotiation\n' + body + '\n```\n';
const bodyOf = (note: string, n: number): string => [...note.matchAll(/```ds-negotiation\n([\s\S]*?)\n```/g)][n][1];
const outside = (note: string, n: number): string => {
	let i = -1;
	return note.replace(/```ds-negotiation\n([\s\S]*?)\n```/g, (all) => (++i === n ? '```ds-negotiation\n@@\n```' : all));
};
const TWO_PEACE = 'motivations:\n  - name: Peace\n    reason: a\n  - name: Peace\n    reason: b\n';
const block = (body: string): string => HEAD + body + OFFERS;

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
	const written = (k = n): any => parseYaml(bodyOf(content(), k));
	return { root, flush, content, written };
}
const mount = (body: string) => mountBlock(ABOVE + fence(block(body)) + BELOW);

afterEach(() => {
	jest.useRealTimers();
	document.body.innerHTML = '';
	Menu.lastMenu = null;
});

const all = (root: HTMLElement, id: string): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>(`[data-dse-control="${id}"]`));
const ctl = (root: HTMLElement, id: string, nth = 0): HTMLElement => all(root, id)[nth];
const textOf = (el: HTMLElement): string => (el.textContent ?? '').replace(/[◆◇]/g, '').trim();
const notices = (root: HTMLElement, scope = ''): string[] =>
	Array.from(root.querySelectorAll(`${scope} [data-note="shared-name"]`)).map((n) => n.textContent ?? '');
const click = async (m: { flush: () => Promise<void> }, el: HTMLElement): Promise<void> => {
	el.click();
	await m.flush();
};
const tiersOf = (root: HTMLElement): string[] => Array.from(root.querySelectorAll('[data-dse-control="negotiation.tier.row"] .dse-pr__text')).map((e) => e.textContent ?? '');

describe('SC-640: entries sharing a name share one chip, and the card says so', () => {
	test('two motivations named Higher Authority: ONE chip, one notice under it, and BOTH dossier rows with the same kind of note', async () => {
		const { root } = await mount('motivations:\n  - name: Higher Authority\n    reason: a\n  - name: Higher Authority\n    reason: b\n');
		expect(all(root, 'negotiation.appeal.motivation').map(textOf)).toEqual(['Higher Authority']);
		expect(notices(root, '.dse-nt__appeals-group')).toEqual(['Higher Authority is listed twice; this chip stands for both.']);
		expect(Array.from(root.querySelectorAll('.dse-nt__dos-name')).map((e) => e.textContent)).toEqual(['Higher Authority', 'Higher Authority']);
		expect(Array.from(root.querySelectorAll('.dse-nt__dos-reason')).map((e) => e.textContent)).toEqual(['a', 'b']);
		expect(all(root, 'negotiation.spent')).toHaveLength(2);
		expect(notices(root, '.dse-nt__dossier-col[data-kind="motivation"]')).toEqual(['Higher Authority is listed twice; the Argument chip stands for both.']);
	});

	test('Power and power are the same motivation: one chip (the first spelling) and the notice', async () => {
		const { root } = await mount('motivations:\n  - name: Power\n  - name: power\n');
		expect(all(root, 'negotiation.appeal.motivation').map(textOf)).toEqual(['Power']);
		expect(notices(root)).toContain('Power is listed twice; this chip stands for both.');
	});

	test('three entries of a name say "three times"; two different duplicated names each get their line', async () => {
		const { root } = await mount('motivations:\n  - name: Peace\n  - name: Peace\n  - name: Peace\n  - name: Legacy\n  - name: legacy\n');
		expect(all(root, 'negotiation.appeal.motivation').map(textOf)).toEqual(['Peace', 'Legacy']);
		expect(notices(root, '.dse-nt__appeals-group')).toEqual([
			'Peace is listed three times; this chip stands for all three.',
			'Legacy is listed twice; this chip stands for both.',
		]);
	});

	test('a name that is listed once draws no notice anywhere', async () => {
		const { root } = await mount('motivations:\n  - name: Peace\n  - name: Legacy\npitfalls:\n  - name: Power\n');
		expect(notices(root)).toEqual([]);
	});

	test('two pitfalls named Power: ONE chip with its name and the notice (the dossier keeps both rows)', async () => {
		const { root } = await mount('pitfalls:\n  - name: Power\n    reason: a\n  - name: power\n    reason: b\n');
		expect(all(root, 'negotiation.appeal.pitfall').map(textOf)).toEqual(['Power']);
		expect(notices(root, '.dse-nt__appeals-group')).toEqual(['Power is listed twice; this chip stands for both.']);
		expect(root.querySelectorAll('.dse-nt__dossier-col[data-kind="pitfall"] .dse-nt__dos')).toHaveLength(2);
		expect(notices(root, '.dse-nt__dossier-col[data-kind="pitfall"]')).toEqual(['Power is listed twice; the Argument chip stands for both.']);
	});

	test('the notice is on a read-only host too, and the chips are real-disabled', async () => {
		jest.useFakeTimers();
		const containerEl = document.createElement('div');
		const host = {
			mode: 'reading' as RenderMode, sourcePath: 'Note.md', containerEl, canPersist: false, addChild: (c: unknown) => c,
			getBlockInfo: () => ({ language: 'ds-nt', lineStart: 0, lineEnd: 20 }), replaceSource: jest.fn(async () => true), blockKey: () => 'Note.md::ds-nt::0',
		} as unknown as BlockHost & { replaceSource: jest.Mock };
		await new ElementPipeline(makeDeps()).run(negotiationElement, block(TWO_PEACE + 'pitfalls:\n  - name: Power\n  - name: Power\n'), host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(notices(root, '.dse-nt__appeals-group')).toEqual(['Peace is listed twice; this chip stands for both.', 'Power is listed twice; this chip stands for both.']);
		expect(notices(root, '.dse-nt__dossier-col')).toHaveLength(2);
		for (const chip of root.querySelectorAll<HTMLButtonElement>('.dse-nt__chip')) expect(chip.disabled).toBe(true);
		ctl(root, 'negotiation.appeal.motivation').click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
		expect(host.replaceSource).not.toHaveBeenCalled();
	});
});

describe('SC-640: each dossier row has its own Spent; the merged chip follows them', () => {
	test('the SECOND same-named row\'s Spent flips only the second entry in the note, and the merged chip is drawn spent', async () => {
		const m = await mount(TWO_PEACE);
		await click(m, ctl(m.root, 'negotiation.spent', 1));
		const w = m.written();
		expect(w.motivations[0].hasBeenAppealedTo).not.toBe(true);
		expect(w.motivations[1].hasBeenAppealedTo).toBe(true);
		expect(Array.from(m.root.querySelectorAll('.dse-nt__dos')).map((r) => r.classList.contains('is-spent'))).toEqual([false, true]);
		expect(textOf(ctl(m.root, 'negotiation.spent', 0))).toBe('Mark spent');
		expect(textOf(ctl(m.root, 'negotiation.spent', 1))).toBe('Spent');
		expect(m.root.querySelector('.dse-nt__dossier-count')!.textContent).toBe('1 of 2 open');
		const chip = ctl(m.root, 'negotiation.appeal.motivation');
		expect(chip.classList.contains('is-spent')).toBe(true);
		expect(chip.textContent).toContain('spent');
	});

	test('the FIRST row\'s Spent flips only the first entry; un-spending it again flips it back', async () => {
		const m = await mount(TWO_PEACE);
		await click(m, ctl(m.root, 'negotiation.spent', 0));
		expect(m.written().motivations.map((x: any) => x.hasBeenAppealedTo === true)).toEqual([true, false]);
		await click(m, ctl(m.root, 'negotiation.spent', 0));
		expect(m.written().motivations.map((x: any) => x.hasBeenAppealedTo === true)).toEqual([false, false]);
		expect(ctl(m.root, 'negotiation.appeal.motivation').classList.contains('is-spent')).toBe(false);
	});

	test('a name with one spent entry: appealing to the merged chip is a reuse (the Reuse box is available and checked)', async () => {
		const m = await mount('motivations:\n  - name: Peace\n  - name: Peace\n    hasBeenAppealedTo: true\n');
		const reuse = ctl(m.root, 'negotiation.mod.reuse') as HTMLInputElement;
		expect(reuse.disabled).toBe(true);
		await click(m, ctl(m.root, 'negotiation.appeal.motivation'));
		expect(reuse.disabled).toBe(false);
		expect(reuse.checked).toBe(true);
		expect(m.written().currentArgument.reusedMotivation).toBe(true);
	});

	test('Complete Argument spends EVERY entry of the chosen name, and nothing else', async () => {
		const m = await mount(TWO_PEACE + '  - name: Legacy\n');
		await click(m, ctl(m.root, 'negotiation.appeal.motivation', 0));
		ctl(m.root, 'negotiation.tier.row', 2).click();
		await click(m, ctl(m.root, 'negotiation.complete'));
		const w = m.written();
		expect(w.motivations.map((x: any) => x.hasBeenAppealedTo === true)).toEqual([true, true, false]);
		expect(w.currentArgument?.motivationsUsed ?? []).toEqual([]); // the cleared argument is the default, so it may not be written at all
		expect(Array.from(m.root.querySelectorAll('.dse-nt__dos')).map((r) => r.classList.contains('is-spent'))).toEqual([true, true, false]);
		expect(m.root.querySelector('.dse-nt__dossier-count')!.textContent).toBe('1 of 3 open');
	});
});

describe('SC-640: casing and spaces are ignored when a chosen entry is matched', () => {
	const PEACE = 'motivations:\n  - name: Higher Authority\npitfalls:\n  - name: Power\n';

	test('`motivationsUsed: [" higher authority "]` presses the Higher Authority chip; un-pressing removes that entry; pressing writes the entry\'s spelling', async () => {
		const m = await mount(PEACE + 'currentArgument:\n  motivationsUsed: [" higher authority "]\n');
		const chip = ctl(m.root, 'negotiation.appeal.motivation');
		expect(chip.getAttribute('aria-pressed')).toBe('true');
		await click(m, chip);
		expect(chip.getAttribute('aria-pressed')).toBe('false');
		expect(m.written().currentArgument.motivationsUsed).toEqual([]);
		await click(m, chip);
		expect(chip.getAttribute('aria-pressed')).toBe('true');
		expect(m.written().currentArgument.motivationsUsed).toEqual(['Higher Authority']);
	});

	test('`pitfallsUsed: [POWER]` presses the Power chip; un-pressing removes it', async () => {
		const m = await mount(PEACE + 'currentArgument:\n  pitfallsUsed: [POWER]\n');
		const chip = ctl(m.root, 'negotiation.appeal.pitfall');
		expect(chip.getAttribute('aria-pressed')).toBe('true');
		await click(m, chip);
		expect(m.written().currentArgument.pitfallsUsed).toEqual([]);
		await click(m, chip);
		expect(m.written().currentArgument.pitfallsUsed).toEqual(['Power']);
	});

	test('a differently-cased chosen entry counts for the roll exactly as the same-cased one does, and greys out Same Argument', async () => {
		const typed = await mount(PEACE + 'currentArgument:\n  motivationsUsed: [" higher AUTHORITY"]\n  sameArgumentUsed: true\n');
		const tiers = tiersOf(typed.root);
		expect((ctl(typed.root, 'negotiation.mod.same') as HTMLInputElement).disabled).toBe(true);
		document.body.innerHTML = '';
		const plain = await mount(PEACE + 'currentArgument:\n  motivationsUsed: [Higher Authority]\n  sameArgumentUsed: true\n');
		expect(tiers).toEqual(tiersOf(plain.root));
		const without = await mount(PEACE + 'currentArgument:\n  sameArgumentUsed: true\n');
		expect(tiers).not.toEqual(tiersOf(without.root)); // the entry really is counted
	});

	test('Complete Argument at High with a differently-cased chosen entry spends the motivation and writes the with-motivation standing', async () => {
		const m = await mount(PEACE + 'currentArgument:\n  motivationsUsed: [higher authority]\n');
		ctl(m.root, 'negotiation.tier.row', 2).click();
		await click(m, ctl(m.root, 'negotiation.complete'));
		const w = m.written();
		expect(w.motivations[0].hasBeenAppealedTo).toBe(true);
		expect([w.current_interest ?? w.initial_interest, w.current_patience ?? w.initial_patience]).toEqual([4, 3]);
	});
});

describe('SC-640: a nameless entry is labelled, works, and is never written as the label', () => {
	const NAMELESS = 'motivations:\n  - name: Peace\n    reason: a\n  - reason: b\npitfalls:\n  - name: Power\n  - reason: c\n';

	test('the chip, the dossier name and every tooltip / aria-label say "Unnamed Motivation" / "Unnamed Pitfall"', async () => {
		const { root } = await mount(NAMELESS);
		const mot = all(root, 'negotiation.appeal.motivation')[1];
		expect(textOf(mot)).toBe('Unnamed Motivation');
		expect(mot.getAttribute('aria-label')).toBe('Appeal to Unnamed Motivation');
		const pit = all(root, 'negotiation.appeal.pitfall')[1];
		expect(textOf(pit)).toBe('Unnamed Pitfall');
		expect(pit.getAttribute('aria-label')).toBe('Mention Unnamed Pitfall');
		expect(Array.from(root.querySelectorAll('.dse-nt__dos-name')).map((e) => e.textContent)).toEqual(['Peace', 'Unnamed Motivation', 'Power', 'Unnamed Pitfall']);
		expect(ctl(root, 'negotiation.spent', 1).getAttribute('aria-label')).toBe('Mark Unnamed Motivation as already appealed to.');
		expect(notices(root)).toEqual([]); // one nameless entry is not a duplicate
	});

	test('its chip toggles: the note gets the empty string, never the label, and the entry stays nameless', async () => {
		const m = await mount(NAMELESS);
		const chip = all(m.root, 'negotiation.appeal.motivation')[1];
		await click(m, chip);
		expect(chip.getAttribute('aria-pressed')).toBe('true');
		let w = m.written();
		expect(w.currentArgument.motivationsUsed).toEqual(['']);
		expect(m.content()).not.toContain('Unnamed');
		expect(w.motivations[1].name ?? '').toBe('');
		const pit = all(m.root, 'negotiation.appeal.pitfall')[1];
		await click(m, pit);
		expect(pit.getAttribute('aria-pressed')).toBe('true');
		w = m.written();
		expect(w.currentArgument.pitfallsUsed).toEqual(['']);
		expect(m.content()).not.toContain('Unnamed');
		await click(m, chip);
		expect(chip.getAttribute('aria-pressed')).toBe('false');
		expect(m.written().currentArgument.motivationsUsed).toEqual([]);
	});

	test('it round-trips: a note holding `motivationsUsed: [""]` draws that chip pressed, and the chip counts as chosen for the roll', async () => {
		const chosen = await mount(NAMELESS + 'currentArgument:\n  motivationsUsed: [""]\n  pitfallsUsed: [""]\n');
		expect(all(chosen.root, 'negotiation.appeal.motivation').map((c) => c.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
		expect(all(chosen.root, 'negotiation.appeal.pitfall').map((c) => c.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
		const tiers = tiersOf(chosen.root);
		document.body.innerHTML = '';
		const none = await mount(NAMELESS);
		expect(tiers).not.toEqual(tiersOf(none.root));
	});

	test('two nameless motivations / pitfalls merge into one "Unnamed" chip and say so', async () => {
		const { root } = await mount('motivations:\n  - reason: a\n  - reason: b\npitfalls:\n  - reason: c\n  - name: "  "\n    reason: d\n  - reason: e\n');
		expect(all(root, 'negotiation.appeal.motivation').map(textOf)).toEqual(['Unnamed Motivation']);
		expect(all(root, 'negotiation.appeal.pitfall').map(textOf)).toEqual(['Unnamed Pitfall']);
		expect(notices(root, '.dse-nt__appeals-group')).toEqual([
			'2 Motivations have no name; this chip stands for both of them.',
			'3 Pitfalls have no name; this chip stands for all of them.',
		]);
		expect(notices(root, '.dse-nt__dossier-col[data-kind="motivation"]')).toEqual(['2 Motivations have no name; the Argument chip stands for both of them.']);
		expect(all(root, 'negotiation.spent')).toHaveLength(2);
	});
});

describe('SC-640: nothing else is disturbed', () => {
	test('SC-638: `motivationsUsed: [5]` on a block with two motivations named 5 stays the number 5 when something else is written', async () => {
		const m = await mount('motivations:\n  - name: 5\n  - name: 5\ncurrentArgument:\n  motivationsUsed: [5]\n');
		expect(ctl(m.root, 'negotiation.appeal.motivation').getAttribute('aria-pressed')).toBe('true');
		await click(m, m.root.querySelector<HTMLElement>('[data-dse-control="negotiation.patience.seal"][data-value="1"]')!);
		expect(m.written().currentArgument.motivationsUsed).toEqual([5]);
		expect(m.written().current_patience).toBe(1);
	});

	test('text above and below the block survives a chip write and a Spent write byte for byte', async () => {
		const note = ABOVE + fence(block(TWO_PEACE)) + BELOW;
		const m = await mountBlock(note);
		await click(m, ctl(m.root, 'negotiation.appeal.motivation'));
		await click(m, ctl(m.root, 'negotiation.spent', 1));
		expect(outside(m.content(), 0)).toBe(outside(note, 0));
		expect(m.written().motivations.map((x: any) => x.hasBeenAppealedTo === true)).toEqual([false, true]);
	});

	test('two negotiation blocks in one note do not cross-talk: a write in the second leaves the first block\'s text alone', async () => {
		const first = block(TWO_PEACE);
		const second = block(TWO_PEACE.replace(/Peace/g, 'Legacy'));
		const note = ABOVE + fence(first) + BETWEEN + fence(second) + BELOW;
		const m = await mountBlock(note, 1);
		await click(m, ctl(m.root, 'negotiation.appeal.motivation'));
		await click(m, ctl(m.root, 'negotiation.spent', 0));
		expect(bodyOf(m.content(), 0)).toBe(first);
		expect(outside(m.content(), 1)).toBe(outside(note, 1));
		const w = m.written(1);
		expect(w.currentArgument.motivationsUsed).toEqual(['Legacy']);
		expect(w.motivations.map((x: any) => x.hasBeenAppealedTo === true)).toEqual([true, false]);
	});
});
