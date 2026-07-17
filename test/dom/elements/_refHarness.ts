// test/dom/elements/_refHarness.ts — D6 Task 4 shared harness for reference-capable
// element DOM tests (reused by Tasks 5-9): a REAL App/vault + SccResolver +
// CompendiumIndex + SccRefProvider wired together, matching the production
// main.ts wiring, so `pipeline.run(wrappedDef, 'scc.v1:...', host)` exercises the
// whole D6 reference stack against real md-dse fixtures — no stubs standing in for
// the resolution machinery itself (test/dom/elements/refUnwrapView.test.ts already
// covers the degrade ladder with stubs; this harness is for end-to-end proof against
// real elements + real fixtures).
import * as fs from 'fs';
import * as path from 'path';
import type { ElementPipelineDeps } from '@/framework/pipeline';
import type { BlockHost, RenderMode } from '@/framework/host/BlockHost';
import { createThemeService } from '@/framework/seams/theme';
import { createPreferenceStore } from '@/framework/seams/prefs';
import type { PrefsStorage } from '@/framework/seams/prefs';
import { createRollService } from '@/framework/roll/service';
import { createReferenceService } from '@/framework/seams/refs';
import { createValidationService } from '@/framework/validation';
import { createSessionStore } from '@/framework/session';
import { DSE_PREF_DESCRIPTORS } from '@/prefs/catalog';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { SccResolver } from '@/refs/SccResolver';
import { SccRefProvider } from '@/refs/SccRefProvider';
import { createCompendiumIndex } from '@/services/CompendiumIndex';
import type { CompendiumIndex } from '@/services/CompendiumIndex';
import { App, Plugin } from '../../mocks/obsidian';

/** Real md-dse fixtures root (frontmatter + a ds-* block each — F2 OD-1(A) shape). */
export const MD_DSE_FIXTURES = path.join(__dirname, '../../fixtures/md-dse');

export function makeHost(language = 'ds-statblock'): BlockHost & { containerEl: HTMLElement } {
	const containerEl = document.createElement('div');
	return {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child) => child,
		getBlockInfo: () => ({ language, lineStart: 0, lineEnd: 1 }),
		replaceSource: async () => true,
		blockKey: () => `Note.md::${language}::0`,
	};
}

export interface CompendiumHarness {
	app: App;
	plugin: Plugin;
	vault: App['vault'];
	resolver: SccResolver;
	index: CompendiumIndex;
	deps: ElementPipelineDeps;
}

/** Builds the full pipeline deps bundle with a LIVE SccResolver + CompendiumIndex,
 *  the SccRefProvider registered on `refs` (so `@path`/`[[wikilink]]` AND `scc:`
 *  bodies both resolve through the same real stack main.ts wires in production),
 *  and both threaded onto the RenderContext (`sccAnchors`/`compendium`). Load
 *  fixtures into `.vault` (via `loadMdDseFixture` below) before rendering. */
export function makeCompendiumDeps(): CompendiumHarness {
	const app = new App();
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	// statblock/feature/featureblock views read prefs (e.g. `rollingEnabled`) that
	// only the full catalog describes — matching statblock.test.ts/feature.test.ts's
	// own makeDeps() convention, not the bare-descriptor pattern horizontal-rule.test.ts
	// and refUnwrapView.test.ts use for their trivial stub views.
	prefs.describe(DSE_PREF_DESCRIPTORS);
	const theme = createThemeService(prefs, plugin as any);
	const refs = createReferenceService(app as any, DEFAULT_SETTINGS);
	const validation = createValidationService();
	const session = createSessionStore();
	const resolver = new SccResolver(app as any, DEFAULT_SETTINGS);
	const index = createCompendiumIndex(app as any, resolver);
	refs.register(new SccRefProvider(app as any, resolver));

	const deps: ElementPipelineDeps = {
		app: app as any,
		plugin: plugin as any,
		settings: DEFAULT_SETTINGS,
		theme,
		prefs,
		refs,
		validation,
		session,
		roll: createRollService(prefs),
		sccAnchors: resolver,
		compendium: index,
	};
	return { app, plugin, vault: app.vault, resolver, index, deps };
}

/** Load a real md-dse fixture from disk into the harness's vault. Defaults to the
 *  path a fresh sync would produce (`compendiumDestinationDirectory` + `relPath`,
 *  mirroring SccResolver.resolve()'s fast path) — pass `vaultPath` to place it
 *  somewhere else (e.g. testing the frontmatter-index fallback, or a `@path`/
 *  `[[wikilink]]` target outside the managed compendium directory). Returns the raw
 *  file content so callers can also extract its ds-* block text (see
 *  `extractDsBlockText`). */
export function loadMdDseFixture(vault: App['vault'], relPath: string, vaultPath?: string): string {
	const abs = path.join(MD_DSE_FIXTURES, relPath);
	const content = fs.readFileSync(abs, 'utf8');
	const dest = vaultPath ?? `${DEFAULT_SETTINGS.compendiumDestinationDirectory}/${relPath}`;
	(vault as any).setFile(dest, content);
	return content;
}

/** Extract the first ds-* fenced block's RAW TEXT — mirrors typeAdapters.ts's
 *  extractFirstDsBlockText / SccResolver's block regex exactly, so a test can build
 *  an "inline" block body that is byte-identical to a fixture's own ds-* payload
 *  (the whole point of the by-SCC == inline golden-render comparison). Test-only:
 *  production code never needs this from raw content directly. */
export function extractDsBlockText(content: string): string {
	const match = /^([`~]{3,})ds-[\w-]+\s*\n([\s\S]+?)\n^\1/m.exec(content);
	if (!match) throw new Error('fixture has no ds-* block');
	return match[2];
}
