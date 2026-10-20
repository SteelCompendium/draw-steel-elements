// visual-harness/chromeSurfaces.ts — SC-422. The plugin's CHROME surfaces that sit outside every
// element root and every DseModal, mounted through their REAL production code so the in-run
// `text scale OK` gate (shoot.mjs) can measure them in a real browser: the Compendium search
// modal's rows, the settings preview caption, and the sidebar view's header + empty message.
//
// Selected by the `surface=` URL param (entry.ts → mountFromParams). Never part of the shot
// manifest: no PNG is written for these pages, so no frozen byte can move — they exist for the
// gate, which needs a stamped chrome root to be able to FAIL when the stamp is removed.
import type { ElementPipeline } from '../src/framework/pipeline';
import type { ElementPipelineDeps } from '../src/framework/pipeline';
import type { ElementRegistry } from '../src/framework/registry';
import { CompendiumSearchModal } from '../src/authoring/CompendiumSearchModal';
import { DseSidebarView } from '../src/framework/sidebar/DseSidebarView';
import type { DseSidebarServices } from '../src/framework/sidebar/DseSidebarView';
import { mountSettingsPreview } from '../src/views/SettingsPreview';
import type { CompendiumEntry, CompendiumIndex } from '../src/services/CompendiumIndex';
import { Component, WorkspaceLeaf } from '../test/mocks/obsidian-core';

export const CHROME_SURFACES = ['search-modal', 'search-modal-empty', 'settings-preview', 'sidebar', 'sidebar-empty'] as const;
export type ChromeSurface = (typeof CHROME_SURFACES)[number];

export function isChromeSurface(raw: string | undefined): raw is ChromeSurface {
	return raw !== undefined && (CHROME_SURFACES as readonly string[]).includes(raw);
}

const SAMPLE_ENTRIES = [
	{ scc: 'mcdm.heroes.v1/kit/panther', type: 'kit', name: 'Panther', source: 'mcdm.heroes.v1' },
	{
		scc: 'mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker',
		type: 'monster.goblin.statblock',
		name: 'Goblin Stinker',
		source: 'mcdm.monsters.v1',
	},
] as unknown as CompendiumEntry[];

/** A just-enough CompendiumIndex: `available` picks the result list vs the empty-index sync row. */
function fakeIndex(available: boolean): CompendiumIndex {
	return { available, query: () => SAMPLE_ENTRIES } as unknown as CompendiumIndex;
}

async function waitFor(what: string, ok: () => boolean, errors: string[], ms = 4000): Promise<void> {
	const deadline = Date.now() + ms;
	while (Date.now() < deadline) {
		if (ok()) return;
		await new Promise((r) => setTimeout(r, 25));
	}
	errors.push(`chrome surface: timed out waiting for ${what}`);
}

export async function mountChromeSurface(
	surface: ChromeSurface,
	ctx: { deps: ElementPipelineDeps; pipeline: ElementPipeline; registry: ElementRegistry; mount: HTMLElement; errors: string[] },
): Promise<void> {
	const { deps, pipeline, registry, mount, errors } = ctx;
	if (surface === 'search-modal' || surface === 'search-modal-empty') {
		// The mock SuggestModal renders no rows itself (real Obsidian does): drive renderSuggestion
		// into its result container exactly as the real chooser would, under the dialog root.
		const modal = new CompendiumSearchModal(deps.app as never, fakeIndex(surface === 'search-modal'), () => {});
		modal.open();
		for (const entry of modal.getSuggestions('')) {
			modal.renderSuggestion(entry, modal.resultContainerEl.createDiv({ cls: 'suggestion-item' }));
		}
		return;
	}
	if (surface === 'settings-preview') {
		const owner = new Component();
		owner.load();
		// mountSettingsPreview only reads plugin.frameworkV2.{registry,pipeline,services.prefs}.
		const plugin = { frameworkV2: { registry, pipeline, services: deps } };
		mountSettingsPreview(mount, plugin as never, owner as never, 'statblock');
		await waitFor('the preview statblock', () => mount.querySelector('.dse-settings-preview [data-dse-element] .dse-sb') !== null, errors);
		return;
	}
	// Sidebar: the real view, a real pinned counter (header + a nested element root) or none (empty state).
	const app = deps.app as unknown as { vault: { setFile(p: string, c: string): void }; workspace: unknown };
	const services = {
		app: deps.app,
		plugin: deps.plugin,
		pipeline,
		registry,
		refs: deps.refs,
		validation: deps.validation,
		prefs: deps.prefs,
	} as unknown as DseSidebarServices;
	const view = new DseSidebarView(new WorkspaceLeaf(app.workspace as never) as never, services);
	view.load();
	mount.appendChild(view.containerEl);
	await (view as unknown as { onOpen(): Promise<void> }).onOpen();
	if (surface === 'sidebar') {
		app.vault.setFile('Pinned.md', ['```ds-counter', 'current_value: 3', '_dse_anchor: chrome1', '```'].join('\n'));
		view.addPanel({ filePath: 'Pinned.md', alias: 'ds-counter', anchorId: 'chrome1' });
		await waitFor('the pinned counter', () => mount.querySelector('.dse-sidebar__panel [data-dse-element="counter"]') !== null, errors);
	}
}
