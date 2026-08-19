// SC-169 FIX ROUND 1 — the three review findings, as executable regressions.
//
// H-1 (the blocker) — CHROME MUST SURVIVE A REBUILD.
//   Element chrome and the collapsed one-line bar are PIPELINE-owned DOM living inside
//   VIEW-owned DOM. `ElementView.update()`'s default path empties `rootEl` and re-runs
//   `onMount`, and the pipeline mounted chrome exactly once — so every rebuild destroyed
//   it. `data-dse-collapsed` lives on the root and SURVIVES `empty()`, so a collapsed
//   element came back with the attribute set, no summary bar, and every rebuilt child
//   hidden by the collapse rule: a zero-height invisible block with no expand control.
//   Reproduced in real Obsidian by collapsing a statblock and toggling "Enable dice
//   rolling" (statblock/feature/featureblock re-render themselves on that pref).
//   The fix is one framework hook (`ElementView.setAfterRender`), so these tests drive the
//   REAL rebuild triggers rather than the hook, and assert on what a reader would see.
//
// M-1 — the three collapse keys on a body that is NOT a YAML mapping (prose `ds-rule`,
//   a whole-block SCC reference) used to produce a YAML parse error card, even though the
//   docs invite exactly that line on "every element that draws a card".
//
// L-1 — a `ds-scc` block whose body is not a code renders a notice explaining what to
//   write instead; folding that to a nameless "SCC REFERENCE" bar would hide the only
//   thing worth reading, so the collapse control is withheld for that model.
import { describe, it, test, expect } from '@jest/globals';
import { ElementPipeline } from '@/framework/pipeline';
import type { ElementPipelineDeps } from '@/framework/pipeline';
import type { BlockHost, RenderMode } from '@/framework/host/BlockHost';
import { statblockElement } from '@/elements/statblock/definition';
import { featureElement } from '@/elements/feature/definition';
import { counterElement } from '@/elements/counter/definition';
import { sccElement } from '@/elements/scc/definition';
import { ruleElement } from '@/elements/display';
import {
	ensureCollapseInvariant,
	peelLeadingCollapseKeys,
	withPeeledKeys,
} from '@/framework/chrome';
import { makeCompendiumDeps, loadMdDseFixture, makeHost as makeRefHost } from '../elements/_refHarness';
import { FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from 'main';

function makeDeps(): ElementPipelineDeps {
	const { deps } = makeCompendiumDeps();
	for (const { id, schema } of FRAMEWORK_V2_DEPENDENCY_SCHEMAS) deps.validation.addDependencySchema(id, schema);
	return deps;
}

function makeHost(language: string, overrides: Partial<BlockHost> = {}) {
	const containerEl = document.createElement('div');
	return {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language, lineStart: 0, lineEnd: 1 }),
		replaceSource: async () => true,
		blockKey: () => `Note.md::${language}::0`,
		...overrides,
	} as BlockHost & { containerEl: HTMLElement };
}

const STATBLOCK_BODY = 'type: statblock\nname: Human Bandit Chief\nstamina: "10"\n';
const FEATURE_BODY = 'name: Coverage Strike\n';
const COUNTER_BODY = 'name: Health\ncurrent_value: 7\nmax_value: 20\nmin_value: 0\n';

/**
 * Lets a pref-change subscriber's fire-and-forget `void this.update(...)` finish. The
 * views call it without awaiting (they are event handlers), and `update()` awaits an async
 * `onMount`, so a single microtask tick is not enough — hence a real timer.
 */
const settle = () => new Promise((r) => setTimeout(r, 50));

/** What a reader can actually see and reach on a collapsed element. */
function collapsedState(root: HTMLElement) {
	const bar = root.querySelector<HTMLElement>(':scope > .dse-chrome-summary');
	return {
		attr: root.getAttribute('data-dse-collapsed'),
		bar: bar !== null,
		text: bar?.querySelector('.dse-chrome-summary__text')?.textContent ?? null,
		expand: root.querySelector('[data-dse-chrome-item="expand"]') !== null,
		panels: root.querySelectorAll('.dse-chrome').length,
		bars: root.querySelectorAll('.dse-chrome-summary').length,
	};
}

describe('SC-169 fix round 1, H-1 — chrome survives every rebuild path', () => {
	test('a COLLAPSED statblock stays collapsed, visible and expandable across a pref rebuild', async () => {
		// The exact real-Obsidian reproduction: an authored `collapsed: true` statblock, then
		// the user flips "Enable dice rolling". StatblockView subscribes to that pref and
		// calls `this.update(this.model)`, which empties root and re-mounts.
		const deps = makeDeps();
		const host = makeHost('ds-statblock');
		await new ElementPipeline(deps).run(statblockElement, `collapsed: true\n${STATBLOCK_BODY}`, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(collapsedState(root)).toMatchObject({ attr: 'on', bar: true, expand: true });

		await deps.prefs.set('rollingEnabled', true);
		await settle();

		// Before the fix: attr 'on', bar false, expand false — an invisible, unrecoverable block.
		expect(collapsedState(root)).toMatchObject({
			attr: 'on',
			bar: true,
			expand: true,
			text: 'Statblock: Human Bandit Chief',
			panels: 1,
			bars: 1,
		});
	});

	test('an EXPANDED element keeps its panel across a pref rebuild', async () => {
		const deps = makeDeps();
		const host = makeHost('ds-feature');
		await new ElementPipeline(deps).run(featureElement, FEATURE_BODY, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-chrome')).toHaveLength(1);

		await deps.prefs.set('rollClickToRoll', true);
		await settle();

		expect(root.querySelectorAll('.dse-chrome')).toHaveLength(1);
		expect(root.querySelector('[data-dse-chrome-item="collapse"]')).not.toBeNull();
	});

	test('a USER collapse (session, not authored) also survives a rebuild', async () => {
		const deps = makeDeps();
		const host = makeHost('ds-statblock');
		await new ElementPipeline(deps).run(statblockElement, STATBLOCK_BODY, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		root.querySelector<HTMLElement>('[data-dse-chrome-item="collapse"]')!.dispatchEvent(
			new MouseEvent('click', { bubbles: true }),
		);
		expect(root.getAttribute('data-dse-collapsed')).toBe('on');

		await deps.prefs.set('rollingEnabled', true);
		await settle();

		expect(collapsedState(root)).toMatchObject({ attr: 'on', bar: true, expand: true });
	});

	test('the collapsed element is still EXPANDABLE after the rebuild (not just present)', async () => {
		const deps = makeDeps();
		const host = makeHost('ds-statblock');
		await new ElementPipeline(deps).run(statblockElement, `collapsed: true\n${STATBLOCK_BODY}`, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		await deps.prefs.set('rollingEnabled', true);
		await settle();

		root.querySelector<HTMLElement>('[data-dse-chrome-item="expand"]')!.dispatchEvent(
			new MouseEvent('click', { bubbles: true }),
		);
		expect(root.hasAttribute('data-dse-collapsed')).toBe(false);
		expect(root.querySelector('.dse-sb')).not.toBeNull();
	});

	test('repeated rebuilds never accumulate a second panel or bar', async () => {
		// The re-mount unloads the previous chrome Component and clears its nodes, so a view
		// that rebuilds all day holds exactly one panel and one set of listeners.
		const deps = makeDeps();
		const host = makeHost('ds-statblock');
		await new ElementPipeline(deps).run(statblockElement, `collapsed: true\n${STATBLOCK_BODY}`, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		for (let i = 0; i < 6; i++) {
			await deps.prefs.set('rollingEnabled', i % 2 === 0);
			await settle();
		}
		expect(collapsedState(root)).toMatchObject({ attr: 'on', bar: true, panels: 1, bars: 1 });
	});

	test('SidebarPanel-shaped external change (view.update on the SAME instance) keeps chrome', async () => {
		// `SidebarPanel.handleExternalChange` re-parses the changed body and calls
		// `previous.update(model)` on the ALREADY-MOUNTED view instance — the same entry
		// point the trackers' own buttons use. Driven directly here so the contract is
		// pinned at the framework level rather than through one caller's plumbing.
		const deps = makeDeps();
		const host = makeHost('ds-counter');
		let captured: { update: (m: unknown) => Promise<void> } | undefined;
		await new ElementPipeline(deps).run(counterElement, `collapsed: true\n${COUNTER_BODY}`, {
			...host,
			addChild: (child: unknown) => {
				captured = child as { update: (m: unknown) => Promise<void> };
				return child;
			},
		} as BlockHost);
		const root = (host.containerEl as HTMLElement).firstElementChild as HTMLElement;
		expect(captured).toBeDefined();

		await captured!.update({ name: 'Health', current_value: 9, max_value: 20, min_value: 0 });

		expect(collapsedState(root)).toMatchObject({ attr: 'on', bar: true, expand: true, panels: 1, bars: 1 });
		expect(collapsedState(root).text).toBe('Counter: Health (9/20)');
	});

	test('a REFERENCE view (RefUnwrapView.onUpdate — the other update() branch) keeps chrome', async () => {
		const { vault, deps } = makeCompendiumDeps();
		for (const { id, schema } of FRAMEWORK_V2_DEPENDENCY_SCHEMAS) deps.validation.addDependencySchema(id, schema);
		loadMdDseFixture(vault, 'kit/panther.md');
		const host = makeRefHost('ds-scc');
		let captured: { update: (m: unknown) => Promise<void> } | undefined;
		await new ElementPipeline(deps).run(sccElement, 'scc.v1:mcdm.heroes.v1/kit/panther', {
			...host,
			addChild: (child: unknown) => {
				captured = child as { update: (m: unknown) => Promise<void> };
				return child;
			},
		} as BlockHost);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-chrome')).toHaveLength(1);

		await captured!.update({ kind: 'ref', raw: 'mcdm.heroes.v1/kit/panther' });

		// `RefUnwrapView` defines its own onUpdate (which also empties rootEl), so this is
		// the branch of update() that used to `return` before any hook could run.
		expect(root.querySelectorAll('.dse-chrome')).toHaveLength(1);
	});

	test('the D9 authoring pencil comes back too (the pre-SC-169 half of the same bug)', async () => {
		const deps = makeDeps();
		await deps.prefs.set('authoringControls', true);
		const host = makeHost('ds-feature');
		await new ElementPipeline(deps).run(featureElement, FEATURE_BODY, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('[data-dse-chrome-item="edit"]')).toHaveLength(1);

		await deps.prefs.set('rollingEnabled', true);
		await settle();

		expect(root.querySelectorAll('[data-dse-chrome-item="edit"]')).toHaveLength(1);
	});

	test('an authoringControls flip is itself honoured on the rebuild it triggers', async () => {
		// The hook reads the pref lazily, so the panel that comes back reflects the CURRENT
		// setting rather than the one in force at first mount.
		const deps = makeDeps();
		const host = makeHost('ds-statblock');
		await new ElementPipeline(deps).run(statblockElement, STATBLOCK_BODY, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelector('[data-dse-chrome-item="edit"]')).toBeNull();

		await deps.prefs.set('authoringControls', true);
		await deps.prefs.set('rollingEnabled', true);
		await settle();

		expect(root.querySelectorAll('[data-dse-chrome-item="edit"]')).toHaveLength(1);
	});
});

describe('SC-169 fix round 1, H-1 — the collapse invariant (last-resort safety net)', () => {
	it('clears a collapsed attribute that has no bar to go with it', () => {
		const root = document.createElement('div');
		root.setAttribute('data-dse-collapsed', 'on');
		ensureCollapseInvariant(root);
		expect(root.hasAttribute('data-dse-collapsed')).toBe(false);
	});

	it('leaves a properly collapsed element alone', () => {
		const root = document.createElement('div');
		root.setAttribute('data-dse-collapsed', 'on');
		root.createDiv({ cls: 'dse-chrome-summary' });
		ensureCollapseInvariant(root);
		expect(root.getAttribute('data-dse-collapsed')).toBe('on');
	});

	it('does not count a bar that belongs to a NESTED element', () => {
		// A `ds-scc` rendering a nested card could contain another element's bar; only
		// root's own direct child counts as "this element is showing its collapsed form".
		const root = document.createElement('div');
		root.setAttribute('data-dse-collapsed', 'on');
		root.createDiv().createDiv({ cls: 'dse-chrome-summary' });
		ensureCollapseInvariant(root);
		expect(root.hasAttribute('data-dse-collapsed')).toBe(false);
	});
});

describe('SC-169 fix round 1, M-1 — the collapse keys on a non-mapping body', () => {
	it('peels leading key lines and nothing else', () => {
		expect(peelLeadingCollapseKeys('collapsed: true\nprose here')).toEqual({
			source: 'prose here',
			peeled: { collapsed: true },
		});
		expect(peelLeadingCollapseKeys('collapsible: false\ncollapsed: true\nx')).toEqual({
			source: 'x',
			peeled: { collapsible: false, collapsed: true },
		});
		// Not leading -> not a directive. Prose is allowed to contain the word.
		expect(peelLeadingCollapseKeys('prose\ncollapsed: true')).toEqual({
			source: 'prose\ncollapsed: true',
			peeled: {},
		});
		// Not a boolean -> not a framework key line; left for whoever owns the body.
		expect(peelLeadingCollapseKeys('collapsed: maybe\nx')).toEqual({
			source: 'collapsed: maybe\nx',
			peeled: {},
		});
	});

	it('peeled keys win over the parsed-data reading and join the re-emit list', () => {
		expect(withPeeledKeys({ collapsed: false, popped: {} }, { collapsed: true })).toEqual({
			collapsible: undefined,
			collapsed: true,
			collapseDefault: undefined,
			popped: { collapsed: true },
		});
		// No-op when nothing was peeled — the mapping-body path is untouched.
		const keys = { collapsed: true, popped: { collapsed: true } };
		expect(withPeeledKeys(keys, {})).toBe(keys);
	});

	test('a PROSE body (ds-rule) honours `collapsed:` instead of error-carding', async () => {
		const deps = makeDeps();
		const host = makeHost('ds-rule');
		await new ElementPipeline(deps).run(ruleElement, 'collapsed: true\nSome rule prose.\n\nA second paragraph.\n', host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(collapsedState(root)).toMatchObject({ attr: 'on', bar: true, text: 'Rule' });
		// The key is gone from the rendered body — it was a directive, not content.
		expect(root.textContent).not.toContain('collapsed: true');
	});

	test('a prose body still renders normally with no key (no behaviour change)', async () => {
		const deps = makeDeps();
		const host = makeHost('ds-rule');
		await new ElementPipeline(deps).run(ruleElement, 'Some rule prose.\n\nA second paragraph.\n', host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(root.hasAttribute('data-dse-collapsed')).toBe(false);
	});

	test('a WHOLE-BLOCK REFERENCE body (ds-scc) can now be authored collapsed', async () => {
		// Round 3 shipped this as a documented limitation ("there is nowhere to put the
		// key"). The peel gives it somewhere: a leading framework line, exactly as on every
		// other element, and the code below it is still the whole body `ds-scc` requires.
		const { vault, deps } = makeCompendiumDeps();
		for (const { id, schema } of FRAMEWORK_V2_DEPENDENCY_SCHEMAS) deps.validation.addDependencySchema(id, schema);
		loadMdDseFixture(vault, 'kit/panther.md');
		const host = makeRefHost('ds-scc');
		await new ElementPipeline(deps).run(sccElement, 'collapsed: true\nscc.v1:mcdm.heroes.v1/kit/panther', host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(root.querySelectorAll('.dse-ref-notice')).toHaveLength(0);
		expect(collapsedState(root)).toMatchObject({ attr: 'on', bar: true, text: 'Kit: Panther' });
	});

	test('`collapsible: false` works on a reference body too', async () => {
		const { vault, deps } = makeCompendiumDeps();
		for (const { id, schema } of FRAMEWORK_V2_DEPENDENCY_SCHEMAS) deps.validation.addDependencySchema(id, schema);
		loadMdDseFixture(vault, 'kit/panther.md');
		const host = makeRefHost('ds-scc');
		await new ElementPipeline(deps).run(sccElement, 'collapsible: false\nscc.v1:mcdm.heroes.v1/kit/panther', host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(root.querySelector('[data-dse-chrome-item="collapse"]')).toBeNull();
	});

	test('a genuine syntax error still reports ITS OWN message, not the peel’s', async () => {
		// The peel must never rewrite an unrelated failure. `{` opens a flow mapping that is
		// never closed; the block is broken with or without the framework key.
		const deps = makeDeps();
		const host = makeHost('ds-statblock');
		await new ElementPipeline(deps).run(statblockElement, 'collapsed: true\nname: {unclosed\n', host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(1);
	});
});

describe('SC-169 fix round 1, L-1 — an invalid ds-scc body is never folded away', () => {
	test('a body that is not a code keeps its notice and offers no collapse control', async () => {
		const { deps } = makeCompendiumDeps();
		const host = makeRefHost('ds-scc');
		// Even with the session already saying "collapsed", the control (and the fold) are
		// withheld — otherwise reopening the note would hide the explanation permanently.
		deps.session.set(host.blockKey(), 'chrome.collapsed', true);
		await new ElementPipeline(deps).run(sccElement, 'not a code at all', host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		expect(root.querySelector('.dse-ref-notice__msg')?.textContent).toContain('is not a full SCC code');
		expect(root.hasAttribute('data-dse-collapsed')).toBe(false);
		expect(root.querySelector('[data-dse-chrome-item="collapse"]')).toBeNull();
		expect(root.querySelector('.dse-chrome-summary')).toBeNull();
	});

	test('a well-formed but UNRESOLVED reference keeps its collapse control', async () => {
		// The distinction that matters: the author's code is a real, nameable thing, so the
		// honest "SCC reference: <code>" line is worth folding. Only a body that is not a
		// reference at all loses the control.
		const { deps } = makeCompendiumDeps();
		const host = makeRefHost('ds-scc');
		deps.session.set(host.blockKey(), 'chrome.collapsed', true);
		await new ElementPipeline(deps).run(sccElement, 'scc.v1:mcdm.heroes.v1/kit/not-synced-yet', host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-collapsed')).toBe('on');
		expect(collapsedState(root).text).toContain('not-synced-yet');
	});
});
