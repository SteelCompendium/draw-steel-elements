// SC-406 — the 7.0.0 release gate, surface by surface, with the switch OFF (the shipped
// state), each against a control with it ON. The switch module / catalog / settings
// round-trip live in test/unit/framework/experimental.test.ts; the Settings pages in
// test/dom/views/settings-tab.test.ts; the initiative Conditions modal in
// test/dom/elements/initiative.test.ts.
//
// The suites run with the switch ON (test/setup/experimental-on.ts); every OFF test opts out
// explicitly — either `setExperimental(false)` or, for the REAL onload(), by handing the
// plugin a data.json without the key (onload re-reads it).
import { ElementPipeline } from '@/framework/pipeline';
import type { BlockHost, RenderMode } from '@/framework/host/BlockHost';
import { DsElementSuggest } from '@/authoring/suggest';
import { registerInsertCommands } from '@/authoring/insert';
import { isExperimental, setExperimental } from '@/framework/experimental';
import { VIEW_TYPE_DSE_SIDEBAR } from '@/framework/sidebar/DseSidebarView';
import { createElementRegistry } from '@/framework/registry';
import { extractPrefOverrides } from '@/framework/prefOverrides';
import { counterElement } from '@/elements/counter/definition';
import { encounterElement } from '@/elements/encounter/definition';
import { montageElement } from '@/elements/montage/definition';
import { partyElement } from '@/elements/party/definition';
import { conditionsElement } from '@/elements/conditions/definition';
import { projectElement } from '@/elements/project/definition';
import { resourceElement } from '@/elements/resource/definition';
import { surgesElement } from '@/elements/surges/definition';
import { tokensElement } from '@/elements/tokens/definition';
import { rollElement } from '@/elements/roll/definition';
import { heroElement } from '@/elements/hero/definition';
import DrawSteelAdmonitionPlugin, { registerFrameworkElementDefinitions } from 'main';
import { App, Plugin, makeFakeContext, flushAsync } from '../../mocks/obsidian';
import { makeCompendiumDeps } from '../elements/_refHarness';

const DEFERRED = [
	encounterElement, projectElement, partyElement, conditionsElement, resourceElement,
	surgesElement, tokensElement, rollElement, heroElement,
];
const DEFERRED_ALIASES = ['ds-encounter', 'ds-project', 'ds-party', 'ds-conditions', 'ds-resource', 'ds-surges', 'ds-tokens', 'ds-roll', 'ds-hero'];

async function loadPlugin(data: Record<string, unknown> | null) {
	const app = new App();
	const plugin = new DrawSteelAdmonitionPlugin(app as never, { id: 'draw-steel-elements', version: 'test' } as never);
	if (data !== null) plugin.loadData = async () => data;
	const ribbon = jest.spyOn(plugin, 'addRibbonIcon' as never);
	const registerView = jest.spyOn(plugin, 'registerView' as never);
	await plugin.onload();
	const commandIds = ((plugin as unknown as { commands: { id: string }[] }).commands).map((c) => c.id);
	return { app, plugin, ribbon, registerView, commandIds };
}

function makeHost(language: string, overrides: Partial<BlockHost> = {}) {
	const containerEl = document.createElement('div');
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language, lineStart: 0, lineEnd: 1 }),
		replaceSource: jest.fn(async () => true),
		blockKey: () => `Note.md::${language}::0`,
		...overrides,
	};
	return host as BlockHost & { containerEl: HTMLElement };
}

describe('SC-406 — the deferred elements', () => {
	test('exactly the nine named in the ticket carry `deferred`; ds-scc, ds-montage and the 6.0.2 set do not', () => {
		const registry = createElementRegistry();
		registerFrameworkElementDefinitions(registry);
		const deferred = registry.all().filter((d) => d.deferred).map((d) => d.aliases[0]).sort();
		expect(deferred).toEqual([...DEFERRED_ALIASES].sort());
		expect(registry.get('ds-scc')?.deferred).toBeUndefined();
		expect(registry.get('ds-montage')?.deferred).toBeUndefined();
	});

	test.each(DEFERRED.map((d) => [d.aliases[0], d] as const))(
		'off: %s renders the inert "not available in this release" card, not the element',
		async (alias, def) => {
			setExperimental(false);
			const { deps } = makeCompendiumDeps();
			const host = makeHost(alias);
			await new ElementPipeline(deps).run(def, def.authoring?.example ?? '', host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			expect(host.containerEl.children).toHaveLength(1);
			expect(root.querySelector('.dse-deferred-card')?.textContent).toBe(`${alias} is not available in this release.`);
			// stamped "deferred" (so no element-scoped CSS reaches it); the real id rides along
			expect(root.getAttribute('data-dse-element')).toBe('deferred');
			expect(root.getAttribute('data-dse-deferred')).toBe(def.id);
			// inert: nothing to click, type into or follow, and no error card either
			expect(root.querySelector('button, a, input, textarea, select, [tabindex], [role="button"]')).toBeNull();
			expect(root.querySelector('.dse-error-card')).toBeNull();
			expect(root.querySelector('.dse-chrome')).toBeNull();
		},
	);

	test.each(DEFERRED.map((d) => [d.aliases[0], d] as const))(
		'on: %s renders as it always did (no card)',
		async (alias, def) => {
			expect(isExperimental()).toBe(true);
			const { deps } = makeCompendiumDeps();
			const host = makeHost(alias);
			await new ElementPipeline(deps).run(def, def.authoring?.example ?? '', host);
			const root = host.containerEl.firstElementChild as HTMLElement;
			expect(root.getAttribute('data-dse-element')).toBe(def.id);
			expect(root.querySelector('.dse-deferred-card')).toBeNull();
		},
	);

	test('off: the shipping elements are untouched (ds-counter and ds-montage still render)', async () => {
		setExperimental(false);
		const { deps } = makeCompendiumDeps();
		const counterHost = makeHost('ds-counter');
		await new ElementPipeline(deps).run(counterElement, 'current_value: 3\n', counterHost);
		expect(counterHost.containerEl.querySelector('[data-dse-element="counter"]')).not.toBeNull();
		const montageHost = makeHost('ds-montage');
		await new ElementPipeline(deps).run(montageElement, montageElement.authoring?.example ?? '', montageHost);
		expect(montageHost.containerEl.querySelector('[data-dse-element="montage"]')).not.toBeNull();
		expect(document.querySelector('.dse-deferred-card')).toBeNull();
	});

	test('off: opening a deferred block through the REAL processor leaves the note\'s bytes unchanged — no write, no anchor, no state', async () => {
		const { app, plugin } = await loadPlugin({});
		const source = 'party: {}\nmonsters: []';
		const note = '# Session\n\n```ds-encounter\n' + source + '\n```\n\nprose\n';
		app.vault.setFile('Note.md', note);
		const ctx = makeFakeContext(app, 'Note.md');
		const handler = (plugin as unknown as { registeredProcessors: Map<string, (s: string, el: HTMLElement, c: unknown) => Promise<void>> })
			.registeredProcessors.get('ds-encounter')!;
		await handler(source, ctx.el, ctx);

		const card = ctx.el.querySelector('.dse-deferred-card') as HTMLElement;
		expect(card.textContent).toBe('ds-encounter is not available in this release.');
		// poke it: a click / press on the card must not reach a writer either
		for (const type of ['pointerdown', 'mousedown', 'click']) card.dispatchEvent(new MouseEvent(type, { bubbles: true }));
		await new Promise((resolve) => setTimeout(resolve, 600)); // past PERSIST_DEBOUNCE_MS
		await flushAsync();

		expect((app.vault as unknown as { modifyCalls: unknown[] }).modifyCalls).toHaveLength(0);
		expect(app.vault.getContent('Note.md')).toBe(note);
		expect(note).not.toContain('_dse_anchor');
		// nothing registered for it: no live view, no claim ticket
		expect(plugin.viewRegistry!.liveEntries()).toHaveLength(0);
	});
});

describe('SC-406 — discovery surfaces', () => {
	test('off: the Insert commands and `/ds` list leave out the nine; ds-scc and ds-montage stay', async () => {
		const { app, plugin, commandIds } = await loadPlugin({});
		for (const def of DEFERRED) expect(commandIds).not.toContain(`insert-${def.id}`);
		expect(commandIds).toEqual(expect.arrayContaining(['insert-scc', 'insert-montage', 'insert-counter', 'insert-statblock']));
		expect(commandIds.filter((id) => id.startsWith('insert-') && !id.startsWith('insert-compendium'))).toHaveLength(13);

		const suggest = new DsElementSuggest(app as never, plugin.frameworkV2!.registry);
		const listed = suggest.getSuggestions({ query: '' } as never).map((d) => d.aliases[0]);
		for (const alias of DEFERRED_ALIASES) expect(listed).not.toContain(alias);
		expect(listed).toEqual(expect.arrayContaining(['ds-scc', 'ds-montage']));
		// a filtered query cannot find one either
		expect(suggest.getSuggestions({ query: 'encounter' } as never)).toEqual([]);
	});

	test('on: all of them are offered again, except ds-hero (its own SC-190 `hidden`)', async () => {
		const { app, plugin, commandIds } = await loadPlugin({ experimental: true });
		for (const def of DEFERRED.filter((d) => d !== heroElement)) expect(commandIds).toContain(`insert-${def.id}`);
		expect(commandIds).not.toContain('insert-hero');
		const listed = new DsElementSuggest(app as never, plugin.frameworkV2!.registry)
			.getSuggestions({ query: '' } as never).map((d) => d.aliases[0]);
		expect(listed).toContain('ds-encounter');
		expect(listed).not.toContain('ds-hero');
	});

	test('registerInsertCommands honours the switch at registration time', () => {
		const registry = createElementRegistry();
		registerFrameworkElementDefinitions(registry);
		const ids = (): string[] => {
			const plugin = new Plugin(new App());
			registerInsertCommands(plugin as never, registry);
			return plugin.commands.map((c: { id: string }) => c.id);
		};
		setExperimental(false);
		expect(ids()).not.toContain('insert-party');
		setExperimental(true);
		expect(ids()).toContain('insert-party');
	});
});

describe('SC-406 — the sidebar', () => {
	test('off: no view type, ribbon icon, open/send/send-initiative commands, and no encounter hand-off', async () => {
		const { ribbon, registerView, commandIds } = await loadPlugin({});
		expect(registerView.mock.calls.map((c) => c[0])).not.toContain(VIEW_TYPE_DSE_SIDEBAR);
		expect(ribbon).not.toHaveBeenCalled();
		for (const id of ['open-dse-sidebar', 'send-block-to-sidebar', 'send-initiative-to-sidebar']) {
			expect(commandIds).not.toContain(id);
		}
		// the rest of the command set is intact
		expect(commandIds).toEqual(expect.arrayContaining(['sync-compendium', 'migrate-compendium-layout']));
	});

	test('on: the view type, ribbon icon and all three commands are registered', async () => {
		const { ribbon, registerView, commandIds } = await loadPlugin({ experimental: true });
		expect(registerView.mock.calls.map((c) => c[0])).toContain(VIEW_TYPE_DSE_SIDEBAR);
		expect(ribbon).toHaveBeenCalledTimes(1);
		for (const id of ['open-dse-sidebar', 'send-block-to-sidebar', 'send-initiative-to-sidebar']) {
			expect(commandIds).toContain(id);
		}
	});

	test('off: a shipping block\'s menu has no "Pin to sidebar"; on: it does', async () => {
		const pinIds = async (): Promise<(string | null)[]> => {
			const { deps } = makeCompendiumDeps();
			const host = makeHost('ds-counter');
			await new ElementPipeline(deps).run(counterElement, 'current_value: 3\n', host);
			return Array.from(host.containerEl.querySelectorAll('.dse-chrome [data-dse-chrome-item]'))
				.map((el) => el.getAttribute('data-dse-chrome-item'));
		};
		setExperimental(false);
		expect(await pinIds()).toEqual(['collapse']);
		setExperimental(true);
		expect(await pinIds()).toEqual(['pin', 'collapse']);
	});

	test('off: a sidebar-mounted host offers no "Unpin from sidebar"; on: it does', async () => {
		const ids = async (): Promise<(string | null)[]> => {
			const { deps } = makeCompendiumDeps();
			const host = makeHost('ds-counter', { mode: 'sidebar' as RenderMode, requestRemoval: () => {} });
			await new ElementPipeline(deps).run(counterElement, 'current_value: 3\n', host);
			return Array.from(host.containerEl.querySelectorAll('.dse-chrome [data-dse-chrome-item]'))
				.map((el) => el.getAttribute('data-dse-chrome-item'));
		};
		setExperimental(false);
		expect(await ids()).not.toContain('unpin');
		setExperimental(true);
		expect(await ids()).toContain('unpin');
	});
});

describe('SC-406 — pref catalog, legacy alias, settings round-trip', () => {
	test('off: `authoringControls` / `printPreview` are not described; a per-block `prefs:` naming them is rejected with the existing warning', async () => {
		const { plugin } = await loadPlugin({});
		const prefs = plugin.frameworkV2!.services.prefs;
		const keys = prefs.descriptors().map((d) => d.key as string);
		expect(keys).not.toContain('authoringControls');
		expect(keys).not.toContain('printPreview');
		expect(keys).toContain('reduceMotion');

		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
		const bag = extractPrefOverrides({ prefs: { printPreview: 'on', authoringControls: true, reduceMotion: true } }, prefs);
		expect(bag).toEqual({ reduceMotion: true });
		expect(warn).toHaveBeenCalledWith('Draw Steel Elements: ignoring unknown per-block pref "printPreview".');
		expect(warn).toHaveBeenCalledWith('Draw Steel Elements: ignoring unknown per-block pref "authoringControls".');
		warn.mockRestore();
	});

	test('on: both are described, and a per-block override for printPreview is accepted', async () => {
		const { plugin } = await loadPlugin({ experimental: true });
		const prefs = plugin.frameworkV2!.services.prefs;
		const keys = prefs.descriptors().map((d) => d.key as string);
		expect(keys).toEqual(expect.arrayContaining(['authoringControls', 'printPreview']));
		expect(extractPrefOverrides({ prefs: { printPreview: 'on' } }, prefs)).toEqual({ printPreview: 'on' });
	});

	test('the legacy `download-data-md-dse` alias is gone with the switch on AND off (removed, not gated)', async () => {
		for (const data of [{}, { experimental: true }]) {
			const { commandIds } = await loadPlugin(data);
			expect(commandIds).not.toContain('download-data-md-dse');
			expect(commandIds).toContain('sync-compendium');
		}
	});

	test('a settings save round-trips `experimental` untouched (and still does not invent it when absent)', async () => {
		const saved: Record<string, unknown>[] = [];
		const run = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
			const { plugin } = await loadPlugin(data);
			plugin.saveData = async (d: never) => { saved.push(JSON.parse(JSON.stringify(d))); };
			await plugin.frameworkV2!.services.prefs.set('reduceMotion', true);
			(plugin as unknown as { prefsStorage: { flush(): void } }).prefsStorage.flush();
			await flushAsync();
			return saved[saved.length - 1];
		};
		const withKey = await run({ experimental: true, viewAdoption: false });
		expect(withKey.experimental).toBe(true);
		expect(withKey.viewAdoption).toBe(false);
		expect((withKey.prefs as Record<string, unknown>).reduceMotion).toBe(true);
		const without = await run({});
		expect(Object.prototype.hasOwnProperty.call(without, 'experimental')).toBe(false);
	});

	test('onload reads the key once: absent / false / "true" ⇒ off, `true` ⇒ on', async () => {
		for (const [data, expected] of [[{}, false], [{ experimental: false }, false], [{ experimental: 'true' }, false], [{ experimental: true }, true]] as const) {
			await loadPlugin(data as Record<string, unknown>);
			expect(isExperimental()).toBe(expected);
		}
	});
});
