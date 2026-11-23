// SC-439 — filed negotiation bugs as `test.failing`: each encodes the CORRECT behaviour with its ticket in the title, passes while the bug
// exists and FAILS once it is fixed (remove the marker then). None is open now: SC-641 (K08, K09) is fixed and those are plain tests. The real-Obsidian twins are the `knownBug` markers in
// e2e/specs/negotiation/ (integrity, focus, wrong-values). Each marker asserts only what its ticket rules, never a specific fix or default (SC-641's ruling IS a default, so K08 / K09 assert it).
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

/** Mount `body` in a note through a real ReadingModeBlockHost over a real FakeVault (fake timers; `flush()` lands the debounced write). */
async function mount(body: string) {
	jest.useFakeTimers();
	const app = new App();
	app.vault.setFile('Note.md', '# T\n\n```ds-negotiation\n' + body + '\n```\n');
	const plugin = new Plugin(app);
	const ctx = makeFakeContext(app, 'Note.md', 0);
	document.body.appendChild(ctx.el);
	const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-negotiation');
	await new ElementPipeline(makeDeps()).run(negotiationElement, body, host);
	const root = (): HTMLElement => host.containerEl.firstElementChild as HTMLElement;
	const flush = (): Promise<void> => jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS + 50);
	const raw = (): string => app.vault.getContent('Note.md')!;
	const written = (): any => parseYaml(/```ds-negotiation\n([\s\S]*?)\n```/.exec(app.vault.getContent('Note.md')!)![1]);
	return { root, flush, written, raw };
}

const OFFERS = 'i5: five\ni4: four\ni3: three\ni2: two\ni1: one\ni0: zero\n';
const sealOf = (root: HTMLElement, id: 'patience' | 'interest', value: number): HTMLElement =>
	root.querySelector(`[data-dse-control="negotiation.${id}.seal"][data-value="${value}"]`) as HTMLElement;
const checked = (root: HTMLElement, id: 'patience' | 'interest'): number[] =>
	Array.from(root.querySelectorAll<HTMLElement>(`[data-dse-control="negotiation.${id}.seal"]`)).filter((s) => s.getAttribute('aria-checked') === 'true').map((s) => Number(s.dataset.value));

afterEach(() => {
	jest.useRealTimers();
	document.body.innerHTML = '';
	Menu.lastMenu = null;
});

describe('SC-439 filed bugs', () => {
	test('[K03] a number as the name does not leave a raw JavaScript error on the card', async () => {
		const { root } = await mount('name: 2024\ninitial_interest: 3\ninitial_patience: 3\n' + OFFERS);
		expect(root().textContent).not.toMatch(/is not a function|Cannot read properties|undefined/);
	});

	test('[K04] a fractional Interest (0.4) is drawn on the seal that agrees with the ending: seal 0 only while the negotiation is over', async () => {
		const { root } = await mount('name: x\ninitial_interest: 3\ninitial_patience: 3\ncurrent_interest: 0.4\n' + OFFERS);
		const seals = checked(root(), 'interest');
		expect(seals).toHaveLength(1);
		const ended = root().querySelector('.dse-nt')!.getAttribute('data-ended');
		expect(seals[0] === 0).toBe(ended === 'hostile');
	});

	test('[K05] Reset negotiation, chosen from the focused options button, leaves keyboard focus inside the card', async () => {
		const { root, flush } = await mount('name: x\ninitial_interest: 3\ninitial_patience: 3\ncurrent_patience: 1\n' + OFFERS);
		const menu = root().querySelector<HTMLElement>('[data-dse-control="negotiation.menu"]')!;
		menu.focus();
		menu.click();
		Menu.lastMenu!.items[0].onClickCallback!();
		await flush();
		expect(root().contains(document.activeElement)).toBe(true);
	});

	// SC-640: same-named entries share ONE chip and the card says so; a nameless entry is labelled "Unnamed Motivation" / "Unnamed Pitfall".
	const chipTexts = (root: HTMLElement, id: string): string[] =>
		Array.from(root.querySelectorAll(`[data-dse-control="${id}"]`)).map((c) => (c.textContent ?? '').replace(/[◆◇]/g, '').trim());
	const notices = (root: HTMLElement): string[] =>
		Array.from(root.querySelectorAll('[data-note="shared-name"]')).map((n) => n.textContent ?? '');

	test('[K06] two motivations with the same name: one appeal chip with its name to read, and a notice that it stands for both', async () => {
		const { root } = await mount(
			'name: x\ninitial_interest: 3\ninitial_patience: 3\nmotivations:\n  - name: Peace\n    reason: a\n  - name: Peace\n    reason: b\n' + OFFERS,
		);
		expect(chipTexts(root(), 'negotiation.appeal.motivation')).toEqual(['Peace']);
		const note = root().querySelector('.dse-nt__appeals-group .dse-nt__why');
		expect(note?.textContent).toBe('Peace is listed twice; this chip stands for both.');
		expect(root().querySelectorAll('[data-dse-control="negotiation.spent"]')).toHaveLength(2); // the dossier keeps both rows
	});

	test('[K07] a motivation with no name: its appeal chip is labelled "Unnamed Motivation" and announced as "Appeal to Unnamed Motivation"', async () => {
		const { root } = await mount('name: x\ninitial_interest: 3\ninitial_patience: 3\nmotivations:\n  - name: Peace\n    reason: a\n  - reason: b\n' + OFFERS);
		const chips = Array.from(root().querySelectorAll('[data-dse-control="negotiation.appeal.motivation"]'));
		expect(chips.map((c) => c.getAttribute('aria-label'))).toEqual(['Appeal to Peace', 'Appeal to Unnamed Motivation']);
		expect(chipTexts(root(), 'negotiation.appeal.motivation')).toEqual(['Peace', 'Unnamed Motivation']);
	});

	// SC-641 (ruled by Scott): a block that leaves Interest out opens at 2 (a live negotiation); Reset falls back to the defaults, Interest 2 / Patience 5,
	// and writes nothing new into the note.
	test('[K08] a block that declares no Interest opens at Interest 2 / Patience 5, not already ended', async () => {
		const { root } = await mount('name: A quick haggle');
		expect(root().querySelector('.dse-nt')!.hasAttribute('data-ended')).toBe(false);
		expect(checked(root(), 'interest')).toEqual([2]);
		expect(checked(root(), 'patience')).toEqual([5]);
	});

	test('[K09] Reset on a block that declares only its current standing lands on Interest 2 / Patience 5, not ended', async () => {
		const { root, flush } = await mount('name: x\ncurrent_interest: 3\ncurrent_patience: 2\n' + OFFERS);
		expect(checked(root(), 'interest')).toEqual([3]); // live to begin with
		expect(checked(root(), 'patience')).toEqual([2]);
		root().querySelector<HTMLElement>('[data-dse-control="negotiation.menu"]')!.click();
		Menu.lastMenu!.items[0].onClickCallback!();
		await flush();
		expect(root().querySelector('.dse-nt')!.hasAttribute('data-ended')).toBe(false);
		expect(checked(root(), 'interest')).toEqual([2]);
		expect(checked(root(), 'patience')).toEqual([5]);
	});

	test('[K09b] Reset of a current-only block writes the standings back as typed and adds no initial_* key', async () => {
		const { root, flush, raw } = await mount('name: x\ncurrent_interest: 3\ncurrent_patience: 2\n' + OFFERS);
		root().querySelector<HTMLElement>('[data-dse-control="negotiation.menu"]')!.click();
		Menu.lastMenu!.items[0].onClickCallback!();
		await flush();
		expect(raw()).toBe('# T\n\n```ds-negotiation\nname: x\ncurrent_patience: 5\ncurrent_interest: 2\n' + OFFERS + '```\n');
		expect(raw()).not.toMatch(/initial_/);
	});

	test('[K09c] Reset of a name-only block adds no key: the note is byte-identical', async () => {
		const { root, flush, raw } = await mount('name: A quick haggle');
		const before = raw();
		root().querySelector<HTMLElement>('[data-dse-control="negotiation.menu"]')!.click();
		Menu.lastMenu!.items[0].onClickCallback!();
		await flush();
		expect(raw()).toBe(before);
		expect(checked(root(), 'interest')).toEqual([2]);
	});

	test('[K10] two pitfalls with the same name: one mention chip with its name to read, and a notice that it stands for both', async () => {
		const { root } = await mount(
			'name: x\ninitial_interest: 3\ninitial_patience: 3\npitfalls:\n  - name: Power\n    reason: a\n  - name: Power\n    reason: b\n' + OFFERS,
		);
		expect(chipTexts(root(), 'negotiation.appeal.pitfall')).toEqual(['Power']);
		expect(notices(root())).toContain('Power is listed twice; this chip stands for both.');
		expect(root().querySelectorAll('.dse-nt__dossier-col[data-kind="pitfall"] .dse-nt__dos')).toHaveLength(2); // the dossier keeps both rows
	});

	// The power roll counts only what the card shows as chosen. Each case asserts that the tiers shown are the tiers of what the card SHOWS as
	// chosen (the pressed chips' names and the modifier boxes). The reference is the same block with exactly what the card shows as its argument.
	const tiersOf = (root: HTMLElement): string[] =>
		Array.from(root.querySelectorAll('[data-dse-control="negotiation.tier.row"] .dse-pr__text')).map((e) => e.textContent ?? '');
	const BASE = 'name: x\ninitial_interest: 3\ninitial_patience: 3\nmotivations:\n  - name: Peace\n    reason: a\npitfalls:\n  - name: Power\n    reason: b\n';
	/** The argument the card shows, as YAML: pressed chips by name and the three boxes as drawn. */
	const shownArgument = (root: HTMLElement): string => {
		const names = (id: string): string[] =>
			Array.from(root.querySelectorAll(`[data-dse-control="${id}"]`))
				.filter((c) => c.getAttribute('aria-pressed') === 'true')
				.map((c) => c.querySelector('.dse-nt__chip-text')?.textContent ?? '');
		const box = (w: string): boolean => root.querySelector<HTMLInputElement>(`[data-dse-control="negotiation.mod.${w}"]`)!.checked;
		return (
			'currentArgument:\n' +
			`  motivationsUsed: ${JSON.stringify(names('negotiation.appeal.motivation'))}\n` +
			`  pitfallsUsed: ${JSON.stringify(names('negotiation.appeal.pitfall'))}\n` +
			`  lieUsed: ${box('lie')}\n  sameArgumentUsed: ${box('same')}\n  reusedMotivation: ${box('reuse')}\n`
		);
	};
	/** Mount `stray`, read its tiers and what it shows, then mount a block holding exactly what was shown and read its tiers. */
	const tiersAgreeWithTheCard = async (stray: string): Promise<{ shown: string[]; reference: string[] }> => {
		const first = await mount(stray);
		const shown = tiersOf(first.root());
		const argument = shownArgument(first.root());
		document.body.innerHTML = '';
		const second = await mount(BASE + argument + OFFERS);
		return { shown, reference: tiersOf(second.root()) };
	};

	test('[K11] an argument entry naming a motivation the block no longer has: the tiers shown are those of the chips shown', async () => {
		const { shown, reference } = await tiersAgreeWithTheCard(BASE + 'currentArgument:\n  motivationsUsed:\n    - Ghost\n' + OFFERS);
		expect(shown).toEqual(reference);
	});

	test('[K12] an argument entry naming a pitfall the block no longer has: the tiers shown are those of the chips shown', async () => {
		const { shown, reference } = await tiersAgreeWithTheCard(BASE + 'currentArgument:\n  pitfallsUsed:\n    - Ghost\n' + OFFERS);
		expect(shown).toEqual(reference);
	});

	test('[K13] a hand-typed reusedMotivation with no spent motivation appealed to: the tiers shown are those of the Reuse box shown', async () => {
		const { shown, reference } = await tiersAgreeWithTheCard(BASE + 'currentArgument:\n  motivationsUsed:\n    - Peace\n  reusedMotivation: true\n' + OFFERS);
		expect(shown).toEqual(reference);
	});

	// Complete Argument and the Same Argument box read the same shown-as-chosen state as the tiers. Tier rows are low, mid, high, crit: High is
	// +1 Interest with 0 Patience under a Motivation and +1 Interest with -1 Patience without one.
	const control = (root: HTMLElement, id: string, nth = 0): HTMLElement => root.querySelectorAll<HTMLElement>(`[data-dse-control="${id}"]`)[nth];
	/** The standing a write leaves (a track that did not move is not written: it is still the initial one). */
	const standing = (w: any): number[] => [w.current_interest ?? w.initial_interest, w.current_patience ?? w.initial_patience];
	const completeAtHigh = async (m: Awaited<ReturnType<typeof mount>>): Promise<any> => {
		control(m.root(), 'negotiation.tier.row', 2).click();
		control(m.root(), 'negotiation.complete').click();
		await m.flush();
		return m.written();
	};

	test('an argument entry naming a motivation the block no longer has: Complete Argument at High writes the no-motivation Interest and Patience and clears the entry', async () => {
		const m = await mount(BASE + 'currentArgument:\n  motivationsUsed:\n    - Ghost\n' + OFFERS);
		const w = await completeAtHigh(m);
		expect(standing(w)).toEqual([4, 2]);
		expect(w.currentArgument.motivationsUsed).toEqual([]);
	});

	test('an argument entry naming a pitfall the block no longer has: Complete Argument at High writes the no-pitfall Interest and Patience and clears the entry', async () => {
		const m = await mount(BASE + 'currentArgument:\n  pitfallsUsed:\n    - Ghost\n' + OFFERS);
		const w = await completeAtHigh(m);
		expect(standing(w)).toEqual([4, 2]);
		expect(w.currentArgument.pitfallsUsed).toEqual([]);
	});

	test('an argument entry naming a motivation the block no longer has: Same Argument is not greyed out, and drawing the card writes nothing', async () => {
		const m = await mount(BASE + 'currentArgument:\n  motivationsUsed:\n    - Ghost\n' + OFFERS);
		const same = control(m.root(), 'negotiation.mod.same') as HTMLInputElement;
		expect(same.disabled).toBe(false);
		expect(same.closest('label')!.classList.contains('is-disabled')).toBe(false);
		expect(same.closest('label')!.querySelector('.dse-nt__why')).toBeNull();
		const before = m.raw();
		await m.flush();
		expect(m.raw()).toBe(before); // the note is byte-identical: the stray entry stays until the user's own action writes the argument
		expect(m.written().currentArgument.motivationsUsed).toEqual(['Ghost']);
	});

	test('an argument entry naming a motivation the block has: its pressed chip still greys out Same Argument and still counts in the tiers', async () => {
		const m = await mount(BASE + 'currentArgument:\n  motivationsUsed:\n    - Peace\n' + OFFERS);
		expect((control(m.root(), 'negotiation.mod.same') as HTMLInputElement).disabled).toBe(true);
		const w = await completeAtHigh(m);
		expect(standing(w)).toEqual([4, 3]);
	});

	test('a hand-typed reusedMotivation with no spent motivation appealed to: the Reuse box is drawn unchecked and greyed out, and Complete Argument at High writes the motivation Interest and Patience, not the reuse ones', async () => {
		const m = await mount(BASE + 'currentArgument:\n  motivationsUsed:\n    - Peace\n  reusedMotivation: true\n' + OFFERS);
		const reuse = control(m.root(), 'negotiation.mod.reuse') as HTMLInputElement;
		expect({ checked: reuse.checked, disabled: reuse.disabled }).toEqual({ checked: false, disabled: true });
		const w = await completeAtHigh(m);
		expect(standing(w)).toEqual([4, 3]);
	});

	const box = (m: Awaited<ReturnType<typeof mount>>, id: string): { checked: boolean; disabled: boolean } => {
		const b = control(m.root(), `negotiation.mod.${id}`) as HTMLInputElement;
		return { checked: b.checked, disabled: b.disabled };
	};
	const MOTIVATION_TIERS = ['-1 Patience', '+1 Interest, -1 Patience', '+1 Interest', '+1 Interest'];
	const SAME_TIERS = Array(4).fill('-1 Interest, -1 Patience');

	test('a stale sameArgumentUsed in the note with a motivation chosen: Same Argument is drawn unchecked and greyed out, the tiers are the motivation ones, and the note is not written', async () => {
		const m = await mount(BASE + 'currentArgument:\n  motivationsUsed:\n    - Peace\n  sameArgumentUsed: true\n' + OFFERS);
		expect(box(m, 'same')).toEqual({ checked: false, disabled: true });
		expect(tiersOf(m.root())).toEqual(MOTIVATION_TIERS);
		const before = m.raw();
		await m.flush();
		expect(m.raw()).toBe(before);
	});

	test('checking Same Argument, pressing a motivation and pressing it again: Same Argument is drawn unchecked while the motivation is chosen, checked again after, and the roll follows', async () => {
		const m = await mount(BASE + OFFERS);
		const peace = control(m.root(), 'negotiation.appeal.motivation');
		control(m.root(), 'negotiation.mod.same').click();
		expect(box(m, 'same')).toEqual({ checked: true, disabled: false });
		expect(tiersOf(m.root())).toEqual(SAME_TIERS);
		peace.click();
		expect(box(m, 'same')).toEqual({ checked: false, disabled: true });
		expect(tiersOf(m.root())).toEqual(MOTIVATION_TIERS);
		await m.flush();
		expect(m.written().currentArgument).toMatchObject({ motivationsUsed: ['Peace'], sameArgumentUsed: true }); // the stored flag is untouched
		peace.click();
		expect(box(m, 'same')).toEqual({ checked: true, disabled: false });
		expect(tiersOf(m.root())).toEqual(SAME_TIERS);
		const w = await completeAtHigh(m);
		expect(standing(w)).toEqual([2, 2]); // the Same Argument table: -1 Interest, -1 Patience
		expect(w.currentArgument?.sameArgumentUsed ?? false).toBe(false); // Complete ends the argument and its flags (a cleared argument may be left out)
	});
});
