// SC-652 -- a write keeps what the plugin cannot read. The first write to a block used to delete a `prefs:` map whose
// keys the plugin does not use (`prefs: {boardDensity: compact}`) and a `collapsed:` that is not true / false
// (`collapsed: yes`). Anything the framework removes from a block's data on read now comes back on write, by value:
// every `prefs:` key (applied, unknown, attr-less, css-bearing, per-block-false, gated) in the author's order, a
// `prefs:` that is not a map, and a non-boolean collapse key. Reading is unchanged: the key still warns, is still not
// applied, and `collapsed: yes` still means "not set".
//
// Driven through the real ElementPipeline + a real ReadingModeBlockHost over the FakeVault (the SC-482 harness), so
// the assertions are on the NOTE, across four element types: a plain chrome element (counter), a second one
// (montage), one whose model owns the legacy collapse pair (ds-stamina) and ds-hero, which splices its raw source back.
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { ElementDefinition } from '../../../src/framework/registry';
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import { claimsLegacyCollapseKeys } from '../../../src/framework/chrome/collapsedKey';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { App, Plugin, makeFakeContext, parseYaml } from '../../mocks/obsidian';
import { counterElement } from '../../../src/elements/counter/definition';
import { montageElement } from '../../../src/elements/montage/definition';
import { staminaBarElement } from '../../../src/elements/stamina-bar/definition';
import { heroElement } from '../../../src/elements/hero/definition';
import { applyBtn, btn, lastModal, makeDeps } from '../_staminaHarness';
import { makeCompendiumDeps, loadMdDseFixture } from './_refHarness';

const NOTE = 'Note.md';

const click = (root: HTMLElement, selector: string): void => {
	const el = root.querySelector<HTMLElement>(selector);
	if (!el) throw new Error(`no ${selector}`);
	el.click();
};

const HERO_BODY = `name: Torin Stonefist
level: 3
ancestry: scc.v1:mcdm.heroes.v1/ancestry/dwarf
class: scc.v1:mcdm.heroes.v1/class/fury
kits: [scc.v1:mcdm.heroes.v1/kit/mountain]
characteristics: { might: 2, agility: 2, reason: -1, intuition: 0, presence: 1 }
skills: [Endurance, Intimidate, Nature]
state:
  stamina: { current: 31, temp: 0 }
  resource: 4
  surges: 1
  recoveries: 6
  victories: 2`;

const heroDeps = (): ElementPipelineDeps => {
	const h = makeCompendiumDeps();
	for (const rel of ['class/fury.md', 'kit/mountain.md', 'ancestry/dwarf.md']) loadMdDseFixture(h.vault, rel);
	return h.deps;
};

interface Subject {
	name: string;
	def: ElementDefinition<any>;
	lang: string;
	deps: () => ElementPipelineDeps;
	/** A valid block body with none of the reserved keys. */
	body: string;
	/** One user write on the rendered block. */
	act: (root: HTMLElement) => void;
	/** What that write changed in the body. */
	changed: RegExp;
}

const subjects: Subject[] = [
	{
		name: 'counter',
		def: counterElement,
		lang: 'ds-counter',
		deps: makeDeps,
		body: 'name: Health\ncurrent_value: 10\nmax_value: 20',
		act: (root) => click(root, '.dse-stepper__btn[aria-label^="Increase"]'),
		changed: /^current_value: 11$/m,
	},
	{
		name: 'montage',
		def: montageElement,
		lang: 'ds-montage',
		deps: makeDeps,
		body: 'title: Escape the city\nsuccess_limit: 5\nfailure_limit: 3\nparticipants:\n  - name: Ash\n    skills_used: []',
		act: (root) => click(root, '[data-dse-chrome-item="montage-add-round"]'),
		changed: /^rounds: 3$/m,
	},
	{
		name: 'stamina bar (the model owns collapse_default:)',
		def: staminaBarElement,
		lang: 'ds-stamina-bar',
		deps: makeDeps,
		body: 'max_stamina: 20\ncurrent_stamina: 15\ntemp_stamina: 5',
		act: (root) => {
			click(root, '.dse-stamina');
			btn(lastModal(), 'Increase Stamina').click();
			applyBtn(lastModal()).click();
		},
		changed: /^current_stamina: 16$/m,
	},
	{
		name: 'hero (splices its raw text)',
		def: heroElement,
		lang: 'ds-hero',
		deps: heroDeps,
		body: HERO_BODY,
		act: (root) =>
			click(root, '[data-dse-hero-region="surges"] .dse-surge__stepper button[aria-label^="Increase"]'),
		changed: /^ {2}surges: 2$/m,
	},
];

/** Reserved lines the framework removes on read and the warning each one gets. */
const MIXED_PREFS = [
	'prefs:',
	'  boardDensity: compact', //  unknown / typo
	'  reduceMotion: true', //     applied
	'  collapseDefault: true', //  attr-less, behavioural
	'  textScale: 1.2', //         attr-less, css-bearing
	'  sbCharLine: one', //        perBlock: false
	'  printPreview: "on"', //     gated (SC-406)
	'  portraits: off', //         applied
].join('\n');
const kept: Array<{ label: string; text: string; warning: RegExp }> = [
	{ label: 'an unknown-only prefs map (the ticket example)', text: 'prefs:\n  boardDensity: compact', warning: /unknown per-block pref "boardDensity"/ },
	{ label: 'a prefs map with every kind of key', text: MIXED_PREFS, warning: /unknown per-block pref "boardDensity"/ },
	{ label: 'a scalar prefs value', text: 'prefs: compact', warning: /must be a map/ },
	{ label: 'a list prefs value', text: 'prefs: [a, b]', warning: /must be a map/ },
	{ label: 'a prefs with no value', text: 'prefs:', warning: /must be a map/ },
	{ label: 'collapsed: yes (the ticket example)', text: 'collapsed: yes', warning: /"collapsed:" key must be true or false/ },
	{ label: 'collapsed: 1', text: 'collapsed: 1', warning: /"collapsed:" key must be true or false/ },
	{ label: 'collapsed: "true"', text: 'collapsed: "true"', warning: /"collapsed:" key must be true or false/ },
];

// ---------------------------------------------------------------------------- harness

/** Let the debounced persist land. */
async function settle(): Promise<void> {
	for (let i = 0; i < 3; i++) await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
}

const noteOf = (blocks: Array<{ lang: string; body: string }>): string =>
	['# Session notes', '', 'Before text.', '', blocks.map((b) => `\`\`\`${b.lang}\n${b.body}\n\`\`\``).join('\n\ntext between\n\n'), '', 'After text.'].join('\n');

/** The body of fence `index` (0-based) in `note`. */
const bodyOf = (note: string, index: number): string =>
	[...note.matchAll(/```ds-[\w-]+\n([\s\S]*?)\n```/g)].map((m) => m[1])[index];

/** `note` with every fence body blanked: what is above, below and between the blocks. */
const outsideFences = (note: string): string => note.replace(/(```ds-[\w-]+\n)[\s\S]*?(\n```)/g, '$1$2');

const lineCount = (body: string, key: string): number => body.split('\n').filter((l) => new RegExp(`^${key}\\s*:`).test(l)).length;

interface Mounted {
	root: HTMLElement;
	note: () => string;
}

async function mount(app: App, subject: Subject, index: number, body: string): Promise<Mounted> {
	const plugin = new Plugin(app);
	const ctx = makeFakeContext(app, NOTE, index);
	const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, subject.lang);
	const running = new ElementPipeline(subject.deps()).run(subject.def, body, host);
	await settle();
	await running;
	const root = host.containerEl.firstElementChild as HTMLElement;
	expect(root.querySelector('.dse-error-card')).toBeNull();
	return { root, note: () => app.vault.getContent(NOTE)! };
}

function appWith(note: string): App {
	const app = new App();
	app.vault.setFile(NOTE, note);
	return app;
}

/** Render `body` as the only block of a note, do the user write, and return the written body. */
async function writeOnce(subject: Subject, body: string): Promise<string> {
	const app = appWith(noteOf([{ lang: subject.lang, body }]));
	const m = await mount(app, subject, 0, body);
	subject.act(m.root);
	await settle();
	return bodyOf(m.note(), 0);
}

let warn: jest.SpyInstance;
beforeEach(() => {
	jest.useFakeTimers();
	warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
	warn.mockRestore();
	document.body.innerHTML = '';
	jest.useRealTimers();
});

// -------------------------------------------------------------------------- the tests

describe.each(subjects)('SC-652: $name', (subject) => {
	const withKeys = (text: string): string => `${text}\n${subject.body}`;

	test.each(kept)('a write keeps $label, by value, once, and the write itself still lands', async ({ text, warning }) => {
		const written = await writeOnce(subject, withKeys(text));
		expect(written).toMatch(subject.changed);
		const wanted = parseYaml(text) as Record<string, unknown>;
		const got = parseYaml(written) as Record<string, unknown>;
		for (const key of Object.keys(wanted)) {
			expect(got[key]).toEqual(wanted[key]);
			expect(lineCount(written, key)).toBe(1);
		}
		expect(warn.mock.calls.some((c) => warning.test(String(c[0])))).toBe(true);
	});

	test('the author\'s prefs keys come back in the author\'s order', async () => {
		const written = await writeOnce(subject, withKeys(MIXED_PREFS));
		const wanted = parseYaml(MIXED_PREFS).prefs as Record<string, unknown>;
		expect(Object.keys(parseYaml(written).prefs as object)).toEqual(Object.keys(wanted));
	});

	test('nothing changes on screen: a block with a kept key renders as the same block without it, and the pref overrides still apply', async () => {
		// The collapse panels number their regions from a counter shared by the whole run: compare without the numbers.
		const shape = (el: HTMLElement): string => el.outerHTML.replace(/dse-collapse-region-\d+/g, 'dse-collapse-region-N');
		const bare = await mount(appWith(noteOf([{ lang: subject.lang, body: subject.body }])), subject, 0, subject.body);
		for (const text of ['prefs:\n  boardDensity: compact', 'prefs: compact', 'collapsed: yes', 'collapsed: "true"']) {
			const body = withKeys(text);
			const m = await mount(appWith(noteOf([{ lang: subject.lang, body }])), subject, 0, body);
			expect(shape(m.root)).toBe(shape(bare.root));
		}
		const mixed = withKeys(MIXED_PREFS);
		const m = await mount(appWith(noteOf([{ lang: subject.lang, body: mixed }])), subject, 0, mixed);
		expect(m.root.getAttribute('data-dse-reduce-motion')).toBe('true');
		expect(m.root.getAttribute('data-dse-portraits')).toBe('off');
		expect(m.root.hasAttribute('data-dse-board-density')).toBe(false);
	});

	test('the reserved keys keep today\'s place: prefs, then the collapse keys, then the body (a block with neither is untouched)', async () => {
		const plain = await writeOnce(subject, subject.body);
		expect(plain).toMatch(subject.changed);
		expect(plain).not.toMatch(/^(prefs|collapsed|collapsible|collapse_default)\s*:/m);
		const text = 'prefs:\n  boardDensity: compact\ncollapsed: yes';
		const written = await writeOnce(subject, withKeys(text));
		expect(written).toBe(`${text}\n${plain}`);
	});

	if (claimsLegacyCollapseKeys(subject.def)) {
		test.each([
			['collapsible: no', 'collapsible'],
			['collapse_default: 1', 'collapse_default'],
		])('%s (a key this element hands to the framework) is kept the same way', async (text, key) => {
			const written = await writeOnce(subject, withKeys(text));
			expect(written).toMatch(subject.changed);
			expect(parseYaml(written)[key]).toEqual(parseYaml(text)[key]);
			expect(lineCount(written, key)).toBe(1);
			expect(warn.mock.calls.some((c) => String(c[0]).includes(`"${key}:" key must be true or false`))).toBe(true);
		});
	}

	describe('integrity', () => {
		const TEXT = 'prefs:\n  boardDensity: compact\ncollapsed: yes';

		test('the text above, below and between blocks is untouched', async () => {
			const before = noteOf([{ lang: subject.lang, body: withKeys(TEXT) }]);
			const app = appWith(before);
			const m = await mount(app, subject, 0, withKeys(TEXT));
			subject.act(m.root);
			await settle();
			expect(m.note()).not.toBe(before);
			expect(outsideFences(m.note())).toBe(outsideFences(before));
		});

		test('two blocks of this kind in one note do not cross-talk', async () => {
			const first = withKeys(TEXT);
			const app = appWith(noteOf([{ lang: subject.lang, body: first }, { lang: subject.lang, body: subject.body }]));
			const a = await mount(app, subject, 0, first);
			subject.act(a.root);
			await settle();
			const b = await mount(app, subject, 1, subject.body);
			subject.act(b.root);
			await settle();
			const note = app.vault.getContent(NOTE)!;
			expect(parseYaml(bodyOf(note, 0)).prefs).toEqual({ boardDensity: 'compact' });
			expect(parseYaml(bodyOf(note, 0)).collapsed).toBe('yes');
			expect(bodyOf(note, 1)).toMatch(subject.changed);
			expect(bodyOf(note, 1)).not.toMatch(/prefs|collapsed|boardDensity/);
		});

		test('a hand edit to the kept line is what the next write keeps', async () => {
			const first = await writeOnce(subject, withKeys(TEXT));
			const edited = first.replace('boardDensity: compact', 'boardDensity: spacious').replace('collapsed: yes', 'collapsed: no');
			expect(edited).not.toBe(first);
			// Obsidian redraws the block from the edited note: a fresh pipeline run on the new body.
			const app = appWith(noteOf([{ lang: subject.lang, body: edited }]));
			const m = await mount(app, subject, 0, edited);
			subject.act(m.root);
			await settle();
			const written = bodyOf(m.note(), 0);
			expect(parseYaml(written).prefs).toEqual({ boardDensity: 'spacious' });
			expect(parseYaml(written).collapsed).toBe('no');
			expect(lineCount(written, 'prefs')).toBe(1);
			expect(lineCount(written, 'collapsed')).toBe(1);
		});

		test('a second write, on the same block and after a redraw from the written note, duplicates no reserved line', async () => {
			const app = appWith(noteOf([{ lang: subject.lang, body: withKeys(TEXT) }]));
			const m = await mount(app, subject, 0, withKeys(TEXT));
			subject.act(m.root);
			await settle();
			subject.act(m.root);
			await settle();
			const second = bodyOf(m.note(), 0);
			expect(lineCount(second, 'prefs')).toBe(1);
			expect(lineCount(second, 'collapsed')).toBe(1);
			const again = await mount(app, subject, 0, second);
			subject.act(again.root);
			await settle();
			const third = bodyOf(again.note(), 0);
			expect(lineCount(third, 'prefs')).toBe(1);
			expect(lineCount(third, 'collapsed')).toBe(1);
			expect(parseYaml(third).prefs).toEqual({ boardDensity: 'compact' });
			expect(parseYaml(third).collapsed).toBe('yes');
		});
	});
});

describe('SC-652: ds-hero (SC-514) -- more cases of the prefs wrapper never write a second prefs: line', () => {
	const hero = subjects.find((s) => s.lang === 'ds-hero')!;
	test.each([
		['an applied override', 'prefs:\n  reduceMotion: true'],
		['an unknown-only map', 'prefs:\n  boardDensity: compact'],
		['a scalar', 'prefs: compact'],
	])('%s: one prefs: line after a write', async (_label, text) => {
		const written = await writeOnce(hero, `${text}\n${hero.body}`);
		expect(written).toMatch(hero.changed);
		expect(lineCount(written, 'prefs')).toBe(1);
		expect(written.startsWith(text)).toBe(true);
	});
});
