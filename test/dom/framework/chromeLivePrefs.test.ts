// SC-644 — the settings "Collapsible by default", "Start collapsed" and "Show edit button on rendered
// blocks" reach a block that is ALREADY ON SCREEN. They used to be read only when a block's chrome was
// (re)mounted, so a flip took effect only after the note was reopened.
//
// What a reader sees is asserted (the Collapse button, the one-line bar, the pencil, the attribute), on the
// real pipeline with the real feature / counter definitions. The rulings (decisions ledger, SC-644):
//   O1  Collapsible by default OFF expands a collapsed block (a block with no Collapse control is never
//       stuck collapsed); ON again leaves it expanded; block keys still beat the preference.
//   O2  Start collapsed does not move a block already on screen; it applies to blocks drawn afterwards.
// A flip rebuilds the CHROME only: the body is not re-rendered, the collapsed state is carried, and the
// subscription goes with the view.
import { describe, it, test, expect, jest, afterEach } from '@jest/globals';
import { Component } from 'obsidian';
import { ElementPipeline } from '@/framework/pipeline';
import type { ElementPipelineDeps } from '@/framework/pipeline';
import type { ElementDefinition } from '@/framework/registry';
import type { BlockHost, RenderMode } from '@/framework/host/BlockHost';
import { featureElement } from '@/elements/feature/definition';
import { counterElement } from '@/elements/counter/definition';
import { watchPrefs } from '@/framework/livePrefs';
import { createPreferenceStore } from '@/framework/seams/prefs';
import { makeCompendiumDeps } from '../elements/_refHarness';
import { FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from 'main';

const FEATURE = 'name: Coverage Strike\n';
const COLLAPSE = '[data-dse-chrome-item="collapse"]';
const EXPAND = '[data-dse-chrome-item="expand"]';
const EDIT = '[data-dse-chrome-item="edit"]';

function makeDeps(): ElementPipelineDeps {
	const { deps } = makeCompendiumDeps();
	for (const { id, schema } of FRAMEWORK_V2_DEPENDENCY_SCHEMAS) deps.validation.addDependencySchema(id, schema);
	return deps;
}

interface Drawn {
	root: HTMLElement;
	host: BlockHost & { containerEl: HTMLElement };
	/** The view the pipeline handed to `host.addChild`, loaded (as Obsidian loads it) so `unload()` really unloads. */
	view: Component;
}

/** Draws one block through the real pipeline. `key` is the block's position (its session key). */
async function draw(
	deps: ElementPipelineDeps,
	def: ElementDefinition<any>,
	source: string,
	opts: { key?: number; canPersist?: boolean; attach?: boolean; container?: HTMLElement } = {},
): Promise<Drawn> {
	const containerEl = opts.container ?? document.createElement('div');
	if (opts.attach) document.body.appendChild(containerEl);
	let view: Component | undefined;
	const language = def.aliases[0] ?? def.id;
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: opts.canPersist ?? true,
		addChild: (child: Component) => {
			view = child;
			child.load();
			return child;
		},
		getBlockInfo: () => ({ language, lineStart: 0, lineEnd: 1 }),
		replaceSource: async () => true,
		blockKey: () => `Note.md::${language}::${opts.key ?? 0}`,
	} as unknown as BlockHost & { containerEl: HTMLElement };
	await new ElementPipeline(deps).run(def, source, host);
	return { root: containerEl.firstElementChild as HTMLElement, host, view: view! };
}

const click = (el: Element | null) => el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

/** What a reader can see and reach on the block's chrome. */
function chromeState(root: HTMLElement) {
	return {
		collapseButton: root.querySelector(COLLAPSE) !== null,
		bar: root.querySelector(':scope > .dse-chrome-summary') !== null,
		collapsedAttr: root.getAttribute('data-dse-collapsed'),
		pencil: root.querySelector(`${EDIT}, button[aria-label^="Edit "]`) !== null,
	};
}

/** A non-chrome element that still carries the card-corner pencil. */
const plainCounter = { ...counterElement, chrome: undefined } as ElementDefinition<any>;
const COUNTER = 'name: Health\ncurrent_value: 7\nmax_value: 20\nmin_value: 0\n';

afterEach(() => {
	document.body.replaceChildren();
	jest.restoreAllMocks();
});

describe('SC-644 — Collapsible by default reaches an open block', () => {
	it('OFF removes the Collapse control and the one-line bar from a block already on screen; ON puts them back', async () => {
		const deps = makeDeps();
		const { root } = await draw(deps, featureElement, FEATURE);
		expect(chromeState(root)).toMatchObject({ collapseButton: true, bar: true });

		await deps.prefs.set('collapsibleDefault', false);
		expect(chromeState(root)).toMatchObject({ collapseButton: false, bar: false });
		expect(root.querySelectorAll('.dse-chrome-summary')).toHaveLength(0);
		// The panel survives with the other items it carries (Pin to sidebar), exactly once.
		expect(root.querySelectorAll('.dse-chrome')).toHaveLength(1);

		await deps.prefs.set('collapsibleDefault', true);
		expect(chromeState(root)).toMatchObject({ collapseButton: true, bar: true, collapsedAttr: null });
		expect(root.querySelectorAll('.dse-chrome')).toHaveLength(1);
	});

	it('a block with nothing left for the panel to hold is left with no chrome marks at all, as a fresh render of it would be; ON puts them back', async () => {
		// canPersist false: no Pin item, so Collapse is the panel's only content.
		const deps = makeDeps();
		const { root } = await draw(deps, featureElement, FEATURE, { canPersist: false });
		expect(root.hasAttribute('data-dse-chrome')).toBe(true);

		await deps.prefs.set('collapsibleDefault', false);
		expect(root.querySelectorAll('.dse-chrome, .dse-chrome-summary')).toHaveLength(0);
		expect(root.hasAttribute('data-dse-chrome')).toBe(false);
		expect([root, ...Array.from(root.querySelectorAll('*'))].some((el) => el.classList.contains('dse-chrome-anchor'))).toBe(false);

		await deps.prefs.set('collapsibleDefault', true);
		expect(root.hasAttribute('data-dse-chrome')).toBe(true);
		expect(chromeState(root)).toMatchObject({ collapseButton: true, bar: true });
	});

	it('does NOT re-render the body: the same node is still there, and the Collapse control still collapses', async () => {
		const deps = makeDeps();
		const { root } = await draw(deps, featureElement, FEATURE);
		const body = root.firstElementChild as HTMLElement;
		body.setAttribute('data-probe', 'kept');

		await deps.prefs.set('collapsibleDefault', false);
		await deps.prefs.set('collapsibleDefault', true);

		expect(root.firstElementChild).toBe(body);
		expect(body.getAttribute('data-probe')).toBe('kept');
		click(root.querySelector(COLLAPSE));
		expect(chromeState(root)).toMatchObject({ bar: true, collapsedAttr: 'on' });
	});

	it('O1: OFF on a block the reader collapsed EXPANDS it; ON again leaves it expanded', async () => {
		const deps = makeDeps();
		const { root } = await draw(deps, featureElement, FEATURE);
		click(root.querySelector(COLLAPSE));
		expect(root.getAttribute('data-dse-collapsed')).toBe('on');

		await deps.prefs.set('collapsibleDefault', false);
		expect(chromeState(root)).toMatchObject({ collapsedAttr: null, bar: false, collapseButton: false });

		await deps.prefs.set('collapsibleDefault', true);
		// The reader's earlier toggle must not fold it again.
		expect(chromeState(root)).toMatchObject({ collapsedAttr: null, bar: true, collapseButton: true });
	});

	it('O1: OFF on a block the AUTHOR collapsed (`collapsed: true`) expands it too, and ON leaves it expanded', async () => {
		const deps = makeDeps();
		const { root } = await draw(deps, featureElement, `collapsed: true\n${FEATURE}`);
		expect(root.getAttribute('data-dse-collapsed')).toBe('on');

		await deps.prefs.set('collapsibleDefault', false);
		expect(chromeState(root)).toMatchObject({ collapsedAttr: null, bar: false });

		await deps.prefs.set('collapsibleDefault', true);
		expect(chromeState(root)).toMatchObject({ collapsedAttr: null, bar: true, collapseButton: true });
	});

	it('block keys beat the preference: `collapsible: true` keeps its Collapse control with the preference OFF, `collapsible: false` stays without it with the preference ON', async () => {
		const deps = makeDeps();
		await deps.prefs.set('collapsibleDefault', false);
		const keepsIt = await draw(deps, featureElement, `collapsible: true\n${FEATURE}`, { key: 1 });
		const lacksIt = await draw(deps, featureElement, `collapsible: false\n${FEATURE}`, { key: 2 });
		expect(chromeState(keepsIt.root).collapseButton).toBe(true);
		expect(chromeState(lacksIt.root).collapseButton).toBe(false);

		await deps.prefs.set('collapsibleDefault', true);
		expect(chromeState(keepsIt.root).collapseButton).toBe(true);
		expect(chromeState(lacksIt.root).collapseButton).toBe(false);
		await deps.prefs.set('collapsibleDefault', false);
		expect(chromeState(keepsIt.root).collapseButton).toBe(true);
		expect(chromeState(lacksIt.root).collapseButton).toBe(false);
	});

	it('reaches every block on screen, and one block that cannot rebuild does not stop the others or the save', async () => {
		const deps = makeDeps();
		const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
		// A block whose chrome breaks on its SECOND build (the rebuild), after drawing fine.
		let builds = 0;
		const fragile = {
			...featureElement,
			chrome: {
				...featureElement.chrome!,
				items: () => {
					if (++builds > 1) throw new Error('boom');
					return [];
				},
			},
		} as ElementDefinition<any>;
		const first = await draw(deps, featureElement, FEATURE, { key: 1 });
		const broken = await draw(deps, fragile, FEATURE, { key: 2 });
		const last = await draw(deps, featureElement, FEATURE, { key: 3 });
		click(broken.root.querySelector(COLLAPSE)); // collapsed when its rebuild fails

		await expect(deps.prefs.set('collapsibleDefault', false)).resolves.toBeUndefined();

		expect(chromeState(first.root).collapseButton).toBe(false);
		expect(chromeState(last.root).collapseButton).toBe(false);
		expect(error).toHaveBeenCalledWith(expect.stringContaining('collapsibleDefault'), expect.any(Error));
		// The failed rebuild took the one-line bar with it: the block must not stay collapsed with nothing to open it.
		expect(broken.root.getAttribute('data-dse-collapsed')).toBeNull();
		expect(broken.root.querySelector(':scope > .dse-chrome-summary')).toBeNull();
	});

	it('a rebuild leaves a block nested inside this one alone (it owns its own panel and one-line bar), whichever was drawn first', async () => {
		const deps = makeDeps();
		// Outer drawn first, the inner one afterwards (a fire-and-forget nested render).
		const outerFirst = await draw(deps, featureElement, FEATURE, { key: 10 });
		const slot = outerFirst.root.createDiv();
		const inner = await draw(deps, featureElement, 'name: Inner\n', { key: 11, container: slot });
		click(inner.root.querySelector(COLLAPSE));
		// Inner drawn first, then moved into an outer card drawn after it (an awaited nested render).
		const slot2 = document.createElement('div');
		const inner2 = await draw(deps, featureElement, 'name: Inner\n', { key: 12, container: slot2 });
		const outerLast = await draw(deps, featureElement, FEATURE, { key: 13 });
		(outerLast.root.firstElementChild as HTMLElement).appendChild(slot2);
		click(inner2.root.querySelector(COLLAPSE));

		await deps.prefs.set('authoringControls', true);

		for (const nested of [inner, inner2]) {
			expect(nested.root.getAttribute('data-dse-collapsed')).toBe('on');
			expect(nested.root.querySelector(':scope > .dse-chrome-summary')).not.toBeNull();
			expect(nested.root.querySelectorAll(':scope > .dse-chrome-anchor .dse-chrome, :scope > .dse-chrome').length).toBeGreaterThan(0);
		}
	});
});

describe('SC-644 — Start collapsed (O2: blocks drawn afterwards, not blocks already open)', () => {
	it('switched ON, a block already open stays expanded; a block drawn afterwards starts collapsed', async () => {
		const deps = makeDeps();
		const open = await draw(deps, featureElement, FEATURE, { key: 1 });
		expect(chromeState(open.root).collapsedAttr).toBeNull();

		await deps.prefs.set('collapseDefault', true);
		expect(chromeState(open.root)).toMatchObject({ collapsedAttr: null, collapseButton: true });

		const reopened = await draw(deps, featureElement, FEATURE, { key: 2 });
		expect(chromeState(reopened.root)).toMatchObject({ collapsedAttr: 'on', bar: true });
	});

	it('switched OFF, a block that started collapsed stays collapsed', async () => {
		const deps = makeDeps();
		await deps.prefs.set('collapseDefault', true);
		const open = await draw(deps, featureElement, FEATURE);
		expect(open.root.getAttribute('data-dse-collapsed')).toBe('on');

		await deps.prefs.set('collapseDefault', false);
		expect(chromeState(open.root)).toMatchObject({ collapsedAttr: 'on', bar: true });
	});

	it('the open block keeps its state through a LATER chrome rebuild (the preference is not re-read for it)', async () => {
		const deps = makeDeps();
		const expanded = await draw(deps, featureElement, FEATURE, { key: 1 });
		await deps.prefs.set('collapseDefault', true);
		// Any chrome rebuild: here the Edit pencil switching on and off (the preference is described by the catalog).
		await deps.prefs.set('authoringControls', true);
		await deps.prefs.set('authoringControls', false);
		expect(chromeState(expanded.root).collapsedAttr).toBeNull();

		// …and the other way round: collapsed by the preference, preference then off, then a rebuild.
		const deps2 = makeDeps();
		await deps2.prefs.set('collapseDefault', true);
		const collapsed = await draw(deps2, featureElement, FEATURE, { key: 1 });
		await deps2.prefs.set('collapseDefault', false);
		await deps2.prefs.set('authoringControls', true);
		expect(chromeState(collapsed.root)).toMatchObject({ collapsedAttr: 'on', bar: true });
	});

	it('the open block keeps its state when the VIEW re-renders itself (an unrelated remount)', async () => {
		const deps = makeDeps();
		const open = await draw(deps, featureElement, FEATURE);
		await deps.prefs.set('collapseDefault', true);
		// FeatureView re-renders itself on this preference and the pipeline mounts the chrome again.
		await deps.prefs.set('rollClickToRoll', true);
		await new Promise((r) => setTimeout(r, 50));
		expect(chromeState(open.root)).toMatchObject({ collapsedAttr: null, collapseButton: true });
		expect(open.root.querySelectorAll('.dse-chrome')).toHaveLength(1);
	});

	it('a block the reader collapsed stays collapsed through SEVERAL unrelated rebuilds and a re-render of the view, and still expands', async () => {
		const deps = makeDeps();
		const { root } = await draw(deps, featureElement, FEATURE);
		click(root.querySelector(COLLAPSE));
		await deps.prefs.set('authoringControls', true);
		expect(chromeState(root)).toMatchObject({ collapsedAttr: 'on', bar: true });
		await deps.prefs.set('authoringControls', false);
		expect(chromeState(root)).toMatchObject({ collapsedAttr: 'on', bar: true });
		// FeatureView re-renders itself on this preference and the pipeline mounts the chrome again.
		await deps.prefs.set('rollClickToRoll', true);
		await new Promise((r) => setTimeout(r, 50));
		expect(chromeState(root)).toMatchObject({ collapsedAttr: 'on', bar: true });
		click(root.querySelector(EXPAND));
		expect(chromeState(root)).toMatchObject({ collapsedAttr: null, collapseButton: true });
	});

	// O1 only expands the LIVE block. What a later draw does follows the ladder: block keys > preferences, and a reader toggle only if they made one.
	it('after O1 forced an expand, the note drawn again follows Start collapsed', async () => {
		const deps = makeDeps();
		await deps.prefs.set('collapseDefault', true);
		const live = await draw(deps, featureElement, FEATURE, { key: 20 });
		expect(chromeState(live.root).collapsedAttr).toBe('on');
		await deps.prefs.set('collapsibleDefault', false);
		await deps.prefs.set('collapsibleDefault', true);
		expect(chromeState(live.root).collapsedAttr).toBeNull(); // the live block stays expanded

		const again = await draw(deps, featureElement, FEATURE, { key: 20 }); // same block, drawn again
		expect(chromeState(again.root).collapsedAttr).toBe('on');
	});

	it('after O1 forced an expand, the note drawn again follows the block\'s own `collapsed: true`', async () => {
		const deps = makeDeps();
		const live = await draw(deps, featureElement, `collapsed: true\n${FEATURE}`, { key: 21 });
		await deps.prefs.set('collapsibleDefault', false);
		await deps.prefs.set('collapsibleDefault', true);
		expect(chromeState(live.root).collapsedAttr).toBeNull();

		const again = await draw(deps, featureElement, `collapsed: true\n${FEATURE}`, { key: 21 });
		expect(chromeState(again.root).collapsedAttr).toBe('on');
	});
});

describe('SC-644 — Show edit button on rendered blocks reaches an open block', () => {
	it('a chrome element: ON puts the pencil in its panel, OFF takes it out; the Collapse control is untouched', async () => {
		const deps = makeDeps();
		const { root } = await draw(deps, featureElement, FEATURE);
		expect(chromeState(root).pencil).toBe(false);

		await deps.prefs.set('authoringControls', true);
		expect(root.querySelectorAll(EDIT)).toHaveLength(1);
		expect(root.querySelector(`.dse-chrome ${EDIT}`)).not.toBeNull();
		expect(chromeState(root).collapseButton).toBe(true);

		await deps.prefs.set('authoringControls', false);
		expect(chromeState(root).pencil).toBe(false);
		expect(chromeState(root).collapseButton).toBe(true);
	});

	it('a non-chrome element: ON puts the card-corner pencil on it, OFF removes it, and never leaves two', async () => {
		const deps = makeDeps();
		const { root } = await draw(deps, plainCounter, COUNTER);
		const pencils = () => root.querySelectorAll('button[aria-label^="Edit "]').length;
		expect(pencils()).toBe(0);

		await deps.prefs.set('authoringControls', true);
		expect(pencils()).toBe(1);
		await deps.prefs.set('authoringControls', false);
		expect(pencils()).toBe(0);
		await deps.prefs.set('authoringControls', true);
		expect(pencils()).toBe(1);
	});

	it('a block drawn with the pencil keeps it when Collapse goes, loses it (and only it) when the pencil goes, and gets it back when switched ON again', async () => {
		const deps = makeDeps();
		await deps.prefs.set('authoringControls', true);
		const { root } = await draw(deps, featureElement, FEATURE);
		expect(root.querySelectorAll(EDIT)).toHaveLength(1);
		await deps.prefs.set('collapsibleDefault', false);
		expect(root.querySelectorAll(EDIT)).toHaveLength(1);
		expect(chromeState(root).collapseButton).toBe(false);
		await deps.prefs.set('authoringControls', false);
		expect(root.querySelector(EDIT)).toBeNull();
		await deps.prefs.set('authoringControls', true);
		expect(root.querySelectorAll(EDIT)).toHaveLength(1);
		expect(root.querySelectorAll('.dse-chrome')).toHaveLength(1);
	});

	it('never on a block that cannot persist (an embed or export), chrome or not, however the setting flips', async () => {
		const deps = makeDeps();
		const chromeEl = await draw(deps, featureElement, FEATURE, { canPersist: false, key: 1 });
		const plainEl = await draw(deps, plainCounter, COUNTER, { canPersist: false, key: 2 });
		await deps.prefs.set('authoringControls', true);
		expect(chromeEl.root.querySelector(EDIT)).toBeNull();
		expect(plainEl.root.querySelector('button[aria-label^="Edit "]')).toBeNull();
		// Its Collapse control still follows the other setting.
		await deps.prefs.set('collapsibleDefault', false);
		expect(chromeState(chromeEl.root).collapseButton).toBe(false);
	});

	it('never on an element that opts out of the generic pencil (`noAuthoringButton`, as ds-hero does)', async () => {
		const deps = makeDeps();
		const hero = { ...featureElement, noAuthoringButton: true } as ElementDefinition<any>;
		const { root } = await draw(deps, hero, FEATURE);
		await deps.prefs.set('authoringControls', true);
		expect(root.querySelector(EDIT)).toBeNull();
	});
});

describe('SC-644 — the subscription is the view\'s own', () => {
	it('after the view unloads, a flip does nothing and throws nothing (no leak into a dead block)', async () => {
		const deps = makeDeps();
		const live = await draw(deps, featureElement, FEATURE, { key: 1 });
		const gone = await draw(deps, featureElement, FEATURE, { key: 2 });
		gone.view.unload();
		const before = gone.root.innerHTML;

		await expect(deps.prefs.set('collapsibleDefault', false)).resolves.toBeUndefined();
		await expect(deps.prefs.set('authoringControls', true)).resolves.toBeUndefined();

		expect(gone.root.innerHTML).toBe(before);
		expect(chromeState(live.root)).toMatchObject({ collapseButton: false, pencil: true });
	});

	it('a rebuild leaves keyboard focus where it was', async () => {
		const deps = makeDeps();
		const { root } = await draw(deps, featureElement, FEATURE, { attach: true });
		const field = document.createElement('input');
		document.body.appendChild(field);
		field.focus();
		expect(document.activeElement).toBe(field);

		await deps.prefs.set('collapsibleDefault', false);
		await deps.prefs.set('authoringControls', true);

		expect(document.activeElement).toBe(field);
		expect(root.isConnected).toBe(true);
	});
});

describe('SC-644 — keyboard focus inside the block survives a rebuild', () => {
	const focusOf = () => document.activeElement as HTMLElement;

	it('the Collapse button the reader is on is focused again on the new panel', async () => {
		const deps = makeDeps();
		const { root } = await draw(deps, featureElement, FEATURE, { attach: true });
		const old = root.querySelector<HTMLElement>(COLLAPSE)!;
		old.focus();
		await deps.prefs.set('authoringControls', true);
		expect(old.isConnected).toBe(false);
		expect(focusOf()).toBe(root.querySelector(COLLAPSE));
	});

	it('the Edit pencil of a chrome element keeps focus while Collapse changes; when the pencil itself goes, the Collapse control takes it', async () => {
		const deps = makeDeps();
		await deps.prefs.set('authoringControls', true);
		const { root } = await draw(deps, featureElement, FEATURE, { attach: true });
		root.querySelector<HTMLElement>(EDIT)!.focus();
		await deps.prefs.set('collapsibleDefault', false);
		await deps.prefs.set('collapsibleDefault', true);
		expect(focusOf()).toBe(root.querySelector(EDIT));
		await deps.prefs.set('authoringControls', false);
		expect(focusOf()).toBe(root.querySelector(COLLAPSE));
	});

	it('the Expand button of a collapsed block keeps focus', async () => {
		const deps = makeDeps();
		const { root } = await draw(deps, featureElement, FEATURE, { attach: true });
		click(root.querySelector(COLLAPSE));
		root.querySelector<HTMLElement>(EXPAND)!.focus();
		await deps.prefs.set('authoringControls', true);
		expect(focusOf()).toBe(root.querySelector(EXPAND));
	});

	it('the card-corner pencil of a non-chrome element keeps focus; when it goes, focus stays inside the block', async () => {
		const deps = makeDeps();
		await deps.prefs.set('authoringControls', true);
		const { root } = await draw(deps, plainCounter, COUNTER, { attach: true });
		root.querySelector<HTMLElement>('button[aria-label^="Edit "]')!.focus();
		await deps.prefs.set('collapsibleDefault', false);
		expect(focusOf()).toBe(root.querySelector('button[aria-label^="Edit "]'));
		await deps.prefs.set('authoringControls', false);
		expect(root.contains(focusOf())).toBe(true);
		expect(focusOf()).not.toBe(document.body);
	});

	it('focus the reader has put elsewhere is never taken back', async () => {
		const deps = makeDeps();
		const field = document.createElement('input');
		document.body.appendChild(field);
		// A block whose chrome moves focus to the field while it is rebuilt (the reader going elsewhere mid-rebuild).
		let builds = 0;
		const grabby = {
			...featureElement,
			chrome: {
				...featureElement.chrome!,
				items: () => {
					if (++builds > 1) field.focus();
					return [];
				},
			},
		} as ElementDefinition<any>;
		const { root } = await draw(deps, grabby, FEATURE, { attach: true });
		root.querySelector<HTMLElement>(COLLAPSE)!.focus();
		await deps.prefs.set('authoringControls', true);
		expect(focusOf()).toBe(field);
	});

	it('focus on a control in a NESTED block is not this block\'s to restore', async () => {
		const deps = makeDeps();
		const outer = await draw(deps, featureElement, FEATURE, { key: 30, attach: true });
		const inner = await draw(deps, featureElement, 'name: Inner\n', { key: 31, container: outer.root.createDiv() });
		const innerCollapse = inner.root.querySelector<HTMLElement>(COLLAPSE)!;
		innerCollapse.focus();
		await deps.prefs.set('authoringControls', true);
		// The inner block rebuilt its own chrome and restored its own focus; the outer one did not move it onto its own button.
		expect(focusOf()).toBe(inner.root.querySelector(COLLAPSE));
	});
});

describe('SC-644 — watchPrefs (the reusable half)', () => {
	const owner = (): Component => {
		const c = new Component();
		c.load();
		return c;
	};

	test('tells the callback which key changed and its value, for every declared key and no other', async () => {
		const deps = makeDeps();
		const seen: unknown[] = [];
		watchPrefs(deps.prefs, owner(), ['collapsibleDefault', 'authoringControls'], (k, v) => seen.push([k, v]));
		await deps.prefs.set('collapsibleDefault', false);
		await deps.prefs.set('authoringControls', true);
		await deps.prefs.set('collapseDefault', true);
		expect(seen).toEqual([
			['collapsibleDefault', false],
			['authoringControls', true],
		]);
	});

	test('skips a key the store does not describe (a bare store, or the experimental gate off) instead of throwing, and stops on unload', async () => {
		const bare = createPreferenceStore({ get: async () => undefined, set: async () => {} });
		const o = owner();
		expect(() => watchPrefs(bare, o, ['authoringControls', 'collapsibleDefault'], () => undefined)).not.toThrow();

		const deps = makeDeps();
		const o2 = owner();
		const seen: string[] = [];
		watchPrefs(deps.prefs, o2, ['collapsibleDefault'], (k) => seen.push(k));
		await deps.prefs.set('collapsibleDefault', false);
		o2.unload();
		await deps.prefs.set('collapsibleDefault', true);
		expect(seen).toEqual(['collapsibleDefault']);
	});
});
