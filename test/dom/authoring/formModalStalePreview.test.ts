// SC-510 -- the block edit form's live preview must always show the CURRENT box text.
//
// Every keystroke used to mount a fresh view into the one `.dse-form__preview` element, and
// `void view.mount(...)`. A mount still running from an earlier keystroke (a reference lookup
// reads a file) wrote into that element after it had been emptied for a later one, so typing
// `@Ref.md` one character at a time ended on "Reference file (Ref.m) not found". A mount that
// rejected was never handled either (SC-493 r1 review, LOW-3).
//
// Everything is the real path: the real pencil opens the real FormModal, the real feature /
// statblock / ds-scc element does the preview mount, the real ReferenceService resolves `@path`,
// and Save goes through the real ReadingModeBlockHost.replaceSource -> vault.process. The only
// thing made controllable is WHEN the reference lookup (or the compendium entity read) finishes,
// so each race below is deterministic instead of timing luck.
import { ElementPipeline } from '@/framework/pipeline';
import type { ElementDefinition } from '@/framework/registry';
import { ReadingModeBlockHost } from '@/framework/host/ReadingModeBlockHost';
import { featureElement } from '@/elements/feature/definition';
import { statblockElement } from '@/elements/statblock/definition';
import { sccElement } from '@/elements/scc/definition';
import featureExample from '@/elements/feature/example.yaml';
import statblockExample from '@/elements/statblock/example.yaml';
import { FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from 'main';
import { makeCompendiumDeps, loadMdDseFixture } from '../elements/_refHarness';
import { Plugin, makeFakeContext } from '../../mocks/obsidian';

const PATH = 'Note.md';
const KIT_CODE = 'mcdm.heroes.v1/kit/panther';

interface Case {
	name: string;
	def: ElementDefinition<any>;
	alias: string;
	/** The body the block starts with (the element's own authoring example). */
	source: string;
	/** What Ref.md's block is called, so the preview can be told apart from the block's own name. */
	refName: string;
	/** Ref.md's block, with refName in place of the example's name. */
	refBlock: string;
	/** A first block the element's reader cannot read (valid YAML, so the lookup succeeds and the MOUNT throws). */
	unreadable: string;
}

const featureRef = featureExample.trim().replace('name: Coverage Strike', 'name: Ref Strike');
const statblockRef = statblockExample.trim().replace('name: Human Bandit Chief', 'name: Ref Bandit');

const CASES: Case[] = [
	{ name: 'feature', def: featureElement, alias: 'ds-feature', source: featureExample.trim(), refName: 'Ref Strike', refBlock: featureRef, unreadable: '# only a comment' },
	{ name: 'statblock', def: statblockElement, alias: 'ds-statblock', source: statblockExample.trim(), refName: 'Ref Bandit', refBlock: statblockRef, unreadable: 'features: {a: 1}' },
];

const noteWith = (alias: string, body: string): string => ['# Note', '', 'Above.', '', '```' + alias, body, '```', '', 'After.'].join('\n');
const refNote = (alias: string, block: string): string => ['# Ref', '', '```' + alias, block, '```'].join('\n');

/** The body of the first ds-* fence of a note. */
function fenceBody(note: string, alias: string): string {
	const m = new RegExp('```' + alias + '\\n([\\s\\S]*?)\\n?```').exec(note);
	if (!m) throw new Error(`no ${alias} fence in:\n${note}`);
	return m[1];
}

/** Let every pending microtask AND timer-free promise chain finish. */
async function settle(): Promise<void> {
	for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/** Hold every `@path` lookup the form's preview makes until the test lets it go. */
function holdLookups(refs: { resolve: (raw: string, sourcePath: string) => Promise<any> }) {
	const real = refs.resolve.bind(refs);
	const held: Array<{ raw: string; release: () => void }> = [];
	let holding = true;
	refs.resolve = (raw: string, sourcePath: string) => {
		if (!holding) return real(raw, sourcePath);
		return new Promise((resolve) => {
			held.push({ raw, release: () => resolve(real(raw, sourcePath)) });
		});
	};
	return {
		held,
		/** Let one held lookup go, then give its mount time to finish. */
		async release(index: number): Promise<void> {
			held[index].release();
			await settle();
		},
		async releaseAll(order: number[] = held.map((_h, i) => i)): Promise<void> {
			for (const i of order) await this.release(i);
		},
		stopHolding(): void {
			holding = false;
		},
	};
}

async function setup(c: { def: ElementDefinition<any>; alias: string }, noteText: string) {
	const h = makeCompendiumDeps();
	await h.deps.prefs.set('authoringControls', true);
	for (const { id, schema } of FRAMEWORK_V2_DEPENDENCY_SCHEMAS) h.deps.validation.addDependencySchema(id, schema);
	// Every view the pipeline asks the def for, in order (the first is the block's own), with the element the
	// host says it lives in (`cx.host.containerEl`) and the element it was actually mounted into.
	const views: Array<{ _loaded: boolean; host: HTMLElement; root?: HTMLElement }> = [];
	const def = {
		...c.def,
		createView: (cx: any) => {
			const view = c.def.createView(cx) as any;
			const record = Object.assign(view, { host: cx.host.containerEl as HTMLElement, root: undefined as HTMLElement | undefined });
			const mount = view.mount.bind(view);
			view.mount = (root: HTMLElement, model: unknown) => {
				record.root = root;
				return mount(root, model);
			};
			views.push(record);
			return view;
		},
	} as ElementDefinition<any>;
	const pipeline = new ElementPipeline(h.deps);
	const plugin = new Plugin(h.app);
	h.app.vault.setFile(PATH, noteText);
	const render = async (source: string) => {
		const ctx = makeFakeContext(h.app, PATH);
		const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, c.alias);
		host.setMountedBody(source);
		await pipeline.run(def, source, host);
		return { host, el: ctx.el };
	};
	return { h, render, views };
}

function openForm(el: HTMLElement) {
	const edit = el.querySelector<HTMLElement>('.dse-btn[aria-label^="Edit "]');
	if (!edit) throw new Error('no Edit button on the rendered block');
	edit.click();
	const ta = document.querySelector<HTMLTextAreaElement>('.modal-container textarea.dse-form__raw');
	if (!ta) throw new Error('the edit form did not open the raw-YAML box');
	const save = document.querySelector<HTMLButtonElement>('.modal-container .dse-modal__footer button[aria-label="Save"]')!;
	const preview = document.querySelector<HTMLElement>('.modal-container .dse-form__preview')!;
	const type = (text: string) => {
		ta.value = text;
		ta.dispatchEvent(new Event('input'));
	};
	/** Type `text` one character at a time, as a keyboard does. */
	const typeSlowly = (text: string) => {
		for (let i = 1; i <= text.length; i++) type(text.slice(0, i));
	};
	const errors = () => document.querySelector('.modal-container .dse-form__errors')?.textContent ?? '';
	return { ta, save, preview, type, typeSlowly, errors };
}

/** A preview that shows `name` and nothing left over from any other keystroke. */
function expectOnlyRef(preview: HTMLElement, name: string): void {
	expect(preview.textContent).toContain(name);
	expect(preview.textContent).not.toMatch(/not found|Reference file/);
	expect(preview.querySelector('.dse-error-card, .dse-ref-notice')).toBeNull();
	expect(preview.getAttribute('data-dse-readonly')).toBe('true');
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe.each(CASES)('SC-510: typing @Ref.md into the $name edit form, one character at a time', (c) => {
	const withRef = async (noteText = noteWith(c.alias, c.source)) => {
		const s = await setup(c, noteText);
		s.h.app.vault.setFile('Ref.md', refNote(c.alias, c.refBlock));
		const { el } = await s.render(c.source);
		return { ...s, form: openForm(el) };
	};

	test('lookups that finish at their natural speed: the preview shows Ref.md and no error', async () => {
		const { form } = await withRef();
		form.typeSlowly('@Ref.md');
		await settle();
		expectOnlyRef(form.preview, c.refName);
	});

	test('every keystroke\'s lookup finishes after the last one, in typing order: only the latest shows', async () => {
		const { h, form } = await withRef();
		const hold = holdLookups(h.deps.refs as never);
		form.typeSlowly('@Ref.md');
		expect(hold.held.map((x) => x.raw)).toEqual(['@', '@R', '@Re', '@Ref', '@Ref.', '@Ref.m', '@Ref.md']);
		await hold.releaseAll();
		expectOnlyRef(form.preview, c.refName);
	});

	test('an earlier keystroke\'s lookup finishes AFTER the latest one: the preview still shows only the latest', async () => {
		const { h, form } = await withRef();
		const hold = holdLookups(h.deps.refs as never);
		form.typeSlowly('@Ref.md');
		const latest = hold.held.length - 1;
		await hold.release(latest);
		expectOnlyRef(form.preview, c.refName);
		// now every earlier one, newest to oldest, lands late
		await hold.releaseAll(Array.from({ length: latest }, (_v, i) => latest - 1 - i));
		expectOnlyRef(form.preview, c.refName);
	});

	test('clearing the box to an invalid one while a lookup is pending: the late mount does not resurrect a preview under the error', async () => {
		const { h, form } = await withRef();
		const hold = holdLookups(h.deps.refs as never);
		form.typeSlowly('@Ref.md');
		expect(form.preview.getAttribute('data-dse-readonly')).toBe('true');
		form.type('name: [unclosed'); // not YAML: Save off, the error shown, no preview
		expect(form.save.disabled).toBe(true);
		expect(form.errors()).not.toBe('');
		expect(form.preview.hasAttribute('data-dse-readonly')).toBe(false);
		expect(form.preview.children.length).toBe(0);
		await hold.releaseAll();
		expect(form.preview.children.length).toBe(0);
		expect(form.preview.textContent).toBe('');
		expect(form.preview.hasAttribute('data-dse-readonly')).toBe(false);
	});

	test('Save after the character-by-character typing writes exactly the box text, and the block renders Ref.md', async () => {
		const { h, render, form } = await withRef();
		form.typeSlowly('@Ref.md');
		await settle();
		expect(form.save.disabled).toBe(false);
		form.save.click();
		await settle();
		const note = h.app.vault.getContent(PATH)!;
		expect(fenceBody(note, c.alias)).toBe('@Ref.md');
		// the note text above and below the block is untouched
		expect(note.startsWith('# Note\n\nAbove.\n\n```' + c.alias + '\n')).toBe(true);
		expect(note.endsWith('\n```\n\nAfter.')).toBe(true);
		const again = await render('@Ref.md');
		await settle();
		expect(again.el.textContent).toContain(c.refName);
		expect(again.el.querySelector('.dse-error-card, .dse-ref-notice')).toBeNull();
	});

	test('the keystrokes before the last leave nothing mounted behind them (every earlier preview view is unloaded)', async () => {
		const { views, form } = await withRef();
		views.length = 0; // the block's own view is not a preview view
		form.typeSlowly('@Ref.md');
		await settle();
		expect(views.length).toBeGreaterThanOrEqual(7);
		const stillLoaded = views.filter((v) => v._loaded);
		expect(stillLoaded).toEqual([views[views.length - 1]]);
	});

	test('each preview view is mounted into its own slot inside the preview box, and the host says the same slot is its container', async () => {
		const { views, form } = await withRef();
		views.length = 0;
		form.typeSlowly('@Ref.md');
		await settle();
		for (const v of views) {
			expect(v.host).toBe(v.root);
			expect(v.host.classList.contains('dse-form__preview-slot')).toBe(true);
			expect(v.host).not.toBe(form.preview);
		}
		expect(new Set(views.map((v) => v.host)).size).toBe(views.length);
		const last = views[views.length - 1];
		expect(last.host.parentElement).toBe(form.preview);
		expect(form.preview.children.length).toBe(1);
		// the earlier ones were dropped from the page
		expect(views.slice(0, -1).every((v) => v.host.parentElement === null)).toBe(true);
	});
});

describe.each(CASES)('SC-510: the $name edit form when the mount itself fails', (c) => {
	// jest-circus fails a test on any unhandled promise rejection raised while it runs, so each test below
	// asserts "no unhandled rejection" by finishing green.
	test('a referenced block the element cannot read: the preview shows the same error card the real card shows, with no Read-only badge over it', async () => {
		const s = await setup(c, noteWith(c.alias, c.source));
		s.h.app.vault.setFile('Bad.md', refNote(c.alias, c.unreadable));
		const { el } = await s.render(c.source);
		const real = await s.render('@Bad.md');
		const realCard = real.el.querySelector('.dse-error-card')!;
		expect(realCard.textContent).toContain('failed to render (render)');
		const form = openForm(el);
		const hold = holdLookups(s.h.deps.refs as never);
		form.typeSlowly('@Bad.md');
		await hold.releaseAll();
		await settle();
		expect(form.preview.children.length).toBe(1);
		const card = form.preview.querySelector('.dse-error-card')!;
		expect(card).not.toBeNull();
		expect(card.textContent).toBe(realCard.textContent);
		expect(form.preview.querySelector(':scope > .dse-form__preview-slot > .dse-error-card')).toBe(card); // inside the current slot, not loose in the box
		expect(form.preview.hasAttribute('data-dse-readonly')).toBe(false); // the badge would cover the card
	});

	test('a rejection from a superseded keystroke arriving after a newer valid preview leaves the newer preview (and its badge) alone', async () => {
		const s = await setup(c, noteWith(c.alias, c.source));
		s.h.app.vault.setFile('Bad.md', refNote(c.alias, c.unreadable));
		s.h.app.vault.setFile('Ref.md', refNote(c.alias, c.refBlock));
		const { el } = await s.render(c.source);
		const form = openForm(el);
		const hold = holdLookups(s.h.deps.refs as never);
		form.typeSlowly('@Bad.md');
		form.type('@Ref.md');
		const bad = hold.held.findIndex((x) => x.raw === '@Bad.md');
		const latest = hold.held.length - 1;
		expect(hold.held[latest].raw).toBe('@Ref.md');
		await hold.release(latest);
		expectOnlyRef(form.preview, c.refName);
		await hold.release(bad); // its mount now rejects, late
		expectOnlyRef(form.preview, c.refName);
		await hold.releaseAll(hold.held.map((_x, i) => i).filter((i) => i !== bad && i !== latest));
		expectOnlyRef(form.preview, c.refName);
	});

	test('a self-referencing @Note.md raises no unhandled rejection however the lookups finish', async () => {
		// The note's FIRST ds block is itself a reference to the note: its text is `@Note.md`, which is not YAML.
		const noteText = ['# Note', '', '```' + c.alias, '@Note.md', '```', '', 'Above.', '', '```' + c.alias, c.source, '```'].join('\n');
		const s = await setup(c, noteText);
		const { el } = await s.render(c.source);
		const form = openForm(el);
		const hold = holdLookups(s.h.deps.refs as never);
		form.typeSlowly('@Note.md');
		await hold.releaseAll([...hold.held.keys()].reverse());
		expect(form.preview.children.length).toBe(1);
		expect(form.preview.textContent).toMatch(/Failed to parse YAML in Note\.md/);
		expect(form.preview.textContent).not.toMatch(/not found/);
	});
});

describe('SC-510: a ds-scc code in the edit form', () => {
	test('a valid code\'s slow entity read finishes after the box became a code that is not installed: the preview shows only that notice', async () => {
		const s = await setup({ def: sccElement, alias: 'ds-scc' }, noteWith('ds-scc', KIT_CODE));
		loadMdDseFixture(s.h.vault, 'kit/panther.md');
		const { el } = await s.render(KIT_CODE);
		await settle();
		const form = openForm(el);
		await settle();
		// hold the compendium's entity read
		const index = s.h.deps.compendium as unknown as { getEntity: (code: string) => Promise<unknown> };
		const real = index.getEntity.bind(index);
		const reads: Array<() => void> = [];
		index.getEntity = (code: string) => new Promise((resolve) => reads.push(() => resolve(real(code))));
		form.type(KIT_CODE); // the same valid code again: remounts, its entity read is held
		expect(reads.length).toBe(1);
		form.type(KIT_CODE + 'x'); // a code the vault does not hold: answered at once ("Not installed locally"), without an entity read
		expect(form.preview.textContent).toMatch(/Not installed locally/);
		for (const release of reads) {
			release();
			await settle();
		}
		expect(form.preview.textContent).toMatch(/Not installed locally/);
		expect(form.preview.textContent).not.toMatch(/Panther/i);
		expect(form.preview.querySelectorAll('.dse-ref-notice').length).toBe(1);
	});
});
