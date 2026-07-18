import {App, Notice, Plugin, TFolder, normalizePath} from 'obsidian';
import type {Editor, MarkdownFileInfo, MarkdownView} from 'obsidian';
import {DseSettingTab} from "@views/SettingsTab";
import {LegacyCompendiumModal} from "@views/LegacyCompendiumModal";
import {DSESettings, migrateSettings} from "@model/Settings";
import {CompendiumSyncService, SyncOptions} from "@/data/CompendiumSyncService";
import {ManifestStore} from "@/data/manifest";
import { registerElements } from '@/utils/RegisterElements';
import { initializeSchemaRegistry, resetSchemaRegistry } from '@utils/JsonSchemaValidator';
import componentWrapperSchemaYaml from '@model/schemas/ComponentWrapperSchema.yaml';
import { FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from '@/framework/dependencySchemas';
import type { DependencySchema } from '@/framework/dependencySchemas';
import "./styles-source.css";

// F1 (Plan 02, Task 10) — Element Framework v2 wiring. ADDITIVE alongside the legacy
// schema/registration paths above: the framework's ElementRegistry + its own
// registerMarkdownCodeBlockProcessor wiring (registerFrameworkElements, D1 Task 1)
// coexist with the legacy registerElements(this) path below — Obsidian's markdown
// code-block processors are owned by BOTH paths at once, one alias at a time, as each
// element migrates (F1 §2.3 "incremental migration switch"). Horizontal Rule is the
// first migrated element (D1 Task 1, F1 §6 step 1): its ds-hr/ds-horizontal-rule
// aliases are removed from RegisterElements.ts and registered here instead.
import { createValidationService } from '@/framework/validation';
import type { ValidationService } from '@/framework/validation';
import { createSessionStore } from '@/framework/session';
import type { SessionStore } from '@/framework/session';
import { createThemeService } from '@/framework/seams/theme';
import type { ThemeService } from '@/framework/seams/theme';
import { createPreferenceStore } from '@/framework/seams/prefs';
import type { PreferenceStore, PrefsStorage } from '@/framework/seams/prefs';
import { DSE_PREF_DESCRIPTORS } from '@/prefs/catalog';
import { createReferenceService } from '@/framework/seams/refs';
import type { ReferenceService } from '@/framework/seams/refs';
import { createRollService } from '@/framework/roll/service';
import type { RollService } from '@/framework/roll/service';
import { createElementRegistry } from '@/framework/registry';
import type { ElementRegistry } from '@/framework/registry';
import { ElementPipeline } from '@/framework/pipeline';
import { registerFrameworkElements } from '@/framework/registerFrameworkElements';
import { registerDseSidebar, sendToSidebar } from '@/framework/sidebar/registration';
import { listFences } from '@/framework/sidebar/anchor';
import { registerInsertCommands } from '@/authoring/insert';
import { DsElementSuggest } from '@/authoring/suggest';
import { DsSchemaSuggest } from '@/authoring/schemaSuggest';
import { registerCompendiumInsertCommands } from '@/authoring/compendiumInsert';
import { createCompendiumIndex } from '@/services/CompendiumIndex';
import type { CompendiumIndex } from '@/services/CompendiumIndex';
import { horizontalRuleElement } from '@/elements/horizontal-rule/definition';
import { skillsElement } from '@/elements/skills/definition';
import { staminaBarElement } from '@/elements/stamina-bar/definition';
import { negotiationElement } from '@/elements/negotiation/definition';
import { initiativeElement } from '@/elements/initiative/definition';
import { featureElement } from '@/elements/feature/definition';
import { featureblockElement } from '@/elements/featureblock/definition';
import { statblockElement } from '@/elements/statblock/definition';
import { counterElement } from '@/elements/counter/definition';
import { valuesRowElement } from '@/elements/values-row/definition';
import { characteristicsElement } from '@/elements/characteristics/definition';
import { rollElement } from '@/elements/roll/definition';
import { displayElements } from '@/elements/display';
import { encounterElement } from '@/elements/encounter/definition';
import { montageElement } from '@/elements/montage/definition';
import { SccResolver } from '@/refs/SccResolver';
import { SccRefProvider } from '@/refs/SccRefProvider';
import { sccPostProcessor } from '@/refs/rewriteSccAnchors';
import type { SccAnchorResolver } from '@/refs/rewriteSccAnchors';

// `DependencySchema` + `FRAMEWORK_V2_DEPENDENCY_SCHEMAS` now live in
// `@/framework/dependencySchemas` (D9 Task 4): `DsSchemaSuggest` needs the same data to
// resolve `$ref`s for autocomplete, and importing it here would cycle back through
// schemaSuggest.ts's import of this file. Re-exported below so existing
// `import { FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from 'main'` call sites (tests,
// visual-harness) are unaffected.
export type { DependencySchema };
export { FRAMEWORK_V2_DEPENDENCY_SCHEMAS };

/** Service bundle F1 §2.2's onload block assembles: ValidationService, SessionStore,
 *  and the three seam defaults (ThemeService / PreferenceStore / ReferenceService). */
export interface ElementFrameworkV2Services {
	validation: ValidationService;
	session: SessionStore;
	theme: ThemeService;
	prefs: PreferenceStore;
	refs: ReferenceService;
	roll: RollService;
}

/** The framework v2 bundle constructed in `onload` and dropped in `onunload`. */
export interface ElementFrameworkV2 {
	services: ElementFrameworkV2Services;
	registry: ElementRegistry;
	pipeline: ElementPipeline;
}

/**
 * F1 §2.3 (registry wiring) / §5 (dependency-schema registration) — constructs the
 * framework v2 service bundle plus an empty `ElementRegistry` and an `ElementPipeline`
 * built from those services, and registers `dependencySchemas` into the new
 * `ValidationService`.
 *
 * A standalone factory (App/Plugin/settings in, bundle out) rather than inline in
 * `onload`, so it is directly unit-testable without driving the full plugin lifecycle
 * (compendium sync service, settings tab, etc.).
 *
 * **Resilience (Task-1 review requirement):** each dependency schema is registered
 * inside its own try/catch. A malformed schema must never crash plugin `onload` — it
 * degrades gracefully (console.warn + a user-visible `Notice`) instead of throwing,
 * and every other schema / the rest of the bundle is unaffected.
 *
 * **Coexistence:** this function itself registers NO elements — the returned `registry`
 * is always empty here; `onload()` populates it separately
 * (`registerFrameworkElementDefinitions`) and wires it into Obsidian
 * (`registerFrameworkElements`) as its own explicit steps, right after calling this
 * factory. `RegisterElements.ts` / `registerElements(plugin)` remains the owner of every
 * `registerMarkdownCodeBlockProcessor` call for elements NOT YET migrated (F1 §2.3's
 * "incremental migration switch" — `registerFrameworkElementDefinitions` below is the
 * single source of truth for which elements HAVE migrated).
 */
/** F1's original in-memory PrefsStorage stub — still the DEFAULT for
 *  initializeElementFrameworkV2 so tests/harnesses that don't care about
 *  persistence are unchanged. Production onload injects the real adapter below. */
export const IN_MEMORY_PREFS_STORAGE: PrefsStorage = {
	get: async () => undefined,
	set: async () => {},
};

/** PrefsStorage with an unload-time escape hatch for the trailing debounce. */
export interface FlushablePrefsStorage extends PrefsStorage {
	/** Write any pending debounced save NOW (fire-and-forget; onunload calls this). */
	flush(): void;
}

/**
 * D4 §5.2 — the real PrefsStorage: the store's sparse snapshot lands on
 * `plugin.settings.prefs` synchronously; the actual `saveData` write is DEBOUNCED
 * (250 ms trailing) so a preset batch-write or a toggle flurry costs one disk write.
 * Structural param (settings + saveSettings) keeps it unit-testable without a Plugin.
 */
export function createSaveDataPrefsStorage(
	plugin: { settings: DSESettings; saveSettings(): Promise<void> },
	debounceMs = 250,
): FlushablePrefsStorage {
	let timer: ReturnType<typeof setTimeout> | null = null;
	const write = (): void => {
		timer = null;
		plugin.saveSettings().catch((error) => {
			console.error('Draw Steel Elements: failed to save preferences', error);
		});
	};
	return {
		get: async () => plugin.settings.prefs,
		set: async (prefs) => {
			plugin.settings.prefs = prefs;
			if (timer !== null) clearTimeout(timer);
			timer = setTimeout(write, debounceMs);
		},
		flush: () => {
			if (timer === null) return;
			clearTimeout(timer);
			write();
		},
	};
}

export function initializeElementFrameworkV2(
	app: App,
	plugin: Plugin,
	settings: Readonly<DSESettings>,
	dependencySchemas: readonly DependencySchema[] = FRAMEWORK_V2_DEPENDENCY_SCHEMAS,
	prefsStorage: PrefsStorage = IN_MEMORY_PREFS_STORAGE,
	// F2 §4.3(a) fix wave: the live SccResolver, threaded into the pipeline's
	// ElementPipelineServices so every RenderContext carries it (view.ts's
	// renderMarkdown calls rewriteSccAnchors when present). Optional — undefined for
	// every test/harness caller that doesn't construct a SccResolver; the pipeline and
	// renderMarkdown both no-op the rewrite pass in that case.
	sccAnchors?: SccAnchorResolver,
	// D6 Task 11 (spec §6/§1.2): the typed-model CompendiumIndex, threaded into the
	// pipeline's ElementPipelineServices symmetric with sccAnchors above — every
	// RenderContext carries it as cx.compendium (RefUnwrapView/CardLayout's by-SCC
	// hybrid render, Task 3/9). Optional — undefined for every test/harness caller
	// that doesn't construct one; the pipeline and RefUnwrapView both degrade to a
	// "compendium not installed" card in that case.
	compendium?: CompendiumIndex,
): ElementFrameworkV2 {
	const validation = createValidationService();
	const session = createSessionStore();
	// D4 (Plan 13 Task 1): production injects the saveData-backed adapter
	// (createSaveDataPrefsStorage); the default stays in-memory for tests/harnesses.
	const prefs = createPreferenceStore(prefsStorage);
	// D4 (Plan 13 Task 2): the full preference catalog — every bundle (plugin,
	// tests, visual harness) gets the same descriptor set. describe() is
	// idempotent-safe for late persisted loads (persistedSnapshot re-apply).
	prefs.describe(DSE_PREF_DESCRIPTORS);
	// D3 §2.2 (Plan 10 Task 2): the ThemeService is PreferenceStore-backed — the
	// active theme IS the persisted `theme` pref. The plugin owns the service's
	// single long-lived upstream subscription, so prefs must be built first.
	const theme = createThemeService(prefs, plugin);
	const refs = createReferenceService(app, settings);
	// D5 (Plan 14 Task 2): the roll seam — native RNG by default; the rollerEngine
	// pref + live capability detection can delegate raw dice to the Dice Roller
	// plugin (framework/roll/diceBridge.ts). Constructed after prefs (it reads them).
	const roll = createRollService(prefs, app);

	for (const { id, schema } of dependencySchemas) {
		try {
			validation.addDependencySchema(id, schema);
		} catch (error) {
			console.warn(
				`Draw Steel Elements: failed to register framework dependency schema "${id}"; continuing without it.`,
				error,
			);
			new Notice(
				`Draw Steel Elements: a validation schema failed to load (${id}). Some elements may show reduced error detail.`,
			);
		}
	}

	const registry = createElementRegistry();
	const pipeline = new ElementPipeline({
		app, plugin, settings, theme, prefs, refs, validation, session, roll, sccAnchors, compendium,
	});

	return {
		services: { validation, session, theme, prefs, refs, roll },
		registry,
		pipeline,
	};
}

/**
 * D1 Task 1 (F1 §2.3 "incremental migration switch") — registers every Framework-v2
 * element definition into `registry`. The first entry is Horizontal Rule (F1 §6 step 1);
 * D1 Task 2 appends Skills (F1 §6 step 3, first *interactive* element); D1 Task 3 appends
 * Stamina Bar (F1 §6 step 4, first *persisted* element — and the last Vue element, so
 * after this registration no `.vue` file is imported anywhere at runtime); Plan 05 Task 5
 * appends Negotiation (F1 §6 step 8, retiring NegotiationTrackerProcessor); Plan 06 Task 5
 * appends Initiative (F1 §6 step 9, retiring InitiativeProcessor); Plan 07 Task 1 appends
 * Feature (F1 §6 step 5, retiring FeatureProcessor — its sub-views stay for
 * Featureblock/Statblock); Plan 07 Task 2 appends Featureblock (F1 §6 step 6, retiring
 * FeatureblockProcessor — its sub-views likewise stay for Statblock); Plan 07 Task 4
 * appends Counter (F1 §6 step 7, retiring CounterProcessor + the legacy
 * Counter/CounterView); Plan 07 Task 5 appends Values Row + Characteristics (F1 §6
 * step 2, retiring ValuesRowProcessor + CharacteristicsProcessor — their Views stay,
 * reused by the element views). With those two, the D-wave element migration is
 * COMPLETE: all 11 migrated elements are registered here and `RegisterElements.ts`
 * registers nothing. Plan 14 Task 5 appends Roll (D5 §5) — the 12th element and the
 * first NEW element born on the framework (not a migration); RegisterElements.ts still
 * registers nothing. D6 Task 6 (plan 16, spec §2) appends the first three
 * `displayFamily()` instances — Kit/Condition/Treasure — the 13th-15th elements and the
 * first reference-capable (`withReference`-wrapped) display-family elements.
 * Kept as a standalone function (same rationale as `initializeElementFrameworkV2`) so it
 * is testable without the full plugin lifecycle.
 */
export function registerFrameworkElementDefinitions(registry: ElementRegistry): void {
	registry.register(horizontalRuleElement);
	registry.register(skillsElement);
	registry.register(staminaBarElement);
	registry.register(negotiationElement);
	registry.register(initiativeElement);
	registry.register(featureElement);
	registry.register(featureblockElement);
	registry.register(statblockElement);
	registry.register(counterElement);
	registry.register(valuesRowElement);
	registry.register(characteristicsElement);
	registry.register(rollElement);
	for (const el of displayElements) registry.register(el);
	// D8 Task 4 (spec §2) — hard-gated on F2 OD-1 + D6 (both landed); the "Open in
	// sidebar" hand-off (spec §2.4/OD-5, encounter/view.ts's setEncounterSidebarHandoff
	// seam) is wired by Task 10 alongside the rest of the sidebar registration sweep.
	registry.register(encounterElement);
	// D8 Task 6 (spec §4) — Montage Test tracker: negotiation-sibling, no compendium dep,
	// no hard gate (unlike encounter's F2 OD-1 + D6 dependency).
	registry.register(montageElement);
}

export default class DrawSteelAdmonitionPlugin extends Plugin {
    settings: DSESettings;
    /** F1 (Plan 02, Task 10) scaffold + D1 (migrated elements): framework v2 service
     *  bundle + registry (populated via `registerFrameworkElementDefinitions` — the
     *  single source of truth for which elements have migrated) + pipeline. Undefined
     *  before `onload` runs and after `onunload` drops it. */
    frameworkV2?: ElementFrameworkV2;

    /** F2 §4.4: the SCC (Steel Compendium Classification) resolver backing
     *  SccRefProvider — kept as its own plugin field (not just closed over) because
     *  Task 12's post-processor reuses it directly. */
    sccResolver: SccResolver;

    /** F2 Task 10: the compendium manifest-diff bookkeeping (Task 8) and the
     *  network+zip sync engine (Task 9/10) that consumes it. Both plugin fields
     *  (not just closed over) so `syncCompendium`/`syncOptions` and any future
     *  Settings-tab operational section (Task 11) can reuse them directly. */
    manifestStore: ManifestStore;
    syncService: CompendiumSyncService;

    /** D6 Task 2/10/11 (spec §6): the typed-model accessor over `sccResolver`'s read seam,
     *  backing the render pipeline's `cx.compendium` seam (Task 3/9's by-SCC hybrid
     *  render), the compendium search modal + insert commands below, and D8's encounter
     *  builder later. Kept as its own plugin field for the same reason `sccResolver` is
     *  (a future consumer reusing it directly). Constructed right after `sccResolver`
     *  below — before `initializeElementFrameworkV2` — so it can be threaded into that
     *  call and reach every RenderContext. */
    compendiumIndex: CompendiumIndex;

    /** D4: the debounced saveData adapter behind the PreferenceStore; flushed on unload. */
    private prefsStorage?: FlushablePrefsStorage;

    async onload() {
        console.log("Loading Draw Steel Elements Plugin.")

        // Initialize schema registry with all common schemas
        this.initializeSchemas();

        await this.loadSettings();
        this.addSettingTab(new DseSettingTab(this.app, this));

        // Legacy registration path — now registers NOTHING (Plan 07 Task 5: all 11
        // elements are migrated onto Framework v2 and registered below). The call stays
        // until the F1 §6 step-10 cleanup deletes RegisterElements.ts entirely.
        registerElements(this);

        // F2 §4.4 (fix wave: constructed BEFORE initializeElementFrameworkV2, not after
        // — the pipeline built inside that call needs the resolver already in hand to
        // thread it into every RenderContext as cx.sccAnchors, F2 §4.3(a)). Watchers +
        // the RefProvider registration stay below, alongside the rest of the framework
        // v2 wiring they depend on.
        this.sccResolver = new SccResolver(this.app, this.settings);

        // D6 Task 11 (spec §6): CompendiumIndex depends only on app + sccResolver, so it
        // is constructed right here — before initializeElementFrameworkV2 — and threaded
        // into that call below as the `compendium` dep (mirrors sccAnchors just above).
        // registerWatchers() + the search-modal/insert-command registration stay below,
        // alongside the rest of the wiring that depends on frameworkV2/syncService.
        this.compendiumIndex = createCompendiumIndex(this.app, this.sccResolver);

        // F1 (Plan 02, Task 10): construct the framework v2 bundle alongside the
        // legacy path above. Coexistence, not replacement — see the function doc.
        this.prefsStorage = createSaveDataPrefsStorage(this);
        const frameworkV2 = initializeElementFrameworkV2(
            this.app,
            this,
            this.settings,
            this.frameworkV2DependencySchemas(),
            this.prefsStorage,
            this.sccResolver,
            this.compendiumIndex,
        );
        this.frameworkV2 = frameworkV2;

        // F2 Task 10: the compendium sync engine. ManifestStore is pure vault-file
        // bookkeeping (Task 8); CompendiumSyncService's default `requestUrlFn` param
        // is the real `requestUrl` (Task 9's forward-compat ctor stub, wired live here).
        this.manifestStore = new ManifestStore(this.app, this.manifest.id);
        this.syncService = new CompendiumSyncService(this.app, this.manifestStore);

        // F2 §4.4: the scc resolver's RefProvider, registered onto the framework's
        // ReferenceService (F1 §3.7 seam — see src/refs/SccRefProvider.ts). Later-
        // registered providers are consulted before built-ins, so this transparently
        // supersedes the seam's reserved "scc" placeholder.
        this.sccResolver.registerWatchers(this);
        frameworkV2.services.refs.register(new SccRefProvider(this.app, this.sccResolver));

        // F2 §4.3(b): vault-wide reading-mode pass rewriting scc.v1: anchors in
        // compendium note bodies. First line inside is a querySelector early-exit,
        // so non-compendium notes pay ~nothing. F1's pipeline may take ownership
        // of this registration later (F2 §4.4) — keep sccPostProcessor the seam.
        this.registerMarkdownPostProcessor(sccPostProcessor(this.sccResolver));

        // D1 Task 1 (F1 §2.3 "incremental migration switch"): populate the framework
        // registry with migrated element definitions, then wire Obsidian's
        // registerMarkdownCodeBlockProcessor for each of their aliases. ADDITIVE — the
        // legacy registerElements(this) call above still owns every not-yet-migrated
        // element.
        registerFrameworkElementDefinitions(frameworkV2.registry);
        registerFrameworkElements(this, frameworkV2);

        // D8 Task 2 (spec §1) — minimal wire proving the sidebar host/view registers
        // through production onload; full command/ribbon polish is Task 10.
        // D8 Task 3: refs/validation threaded in too, so SidebarPanel's in-place
        // onUpdate refresh (spec §1.6) is live in production, not just in a harness that
        // opts in — see DseSidebarServices's field doc.
        const dseSidebarServices = {
            app: this.app,
            plugin: this,
            pipeline: frameworkV2.pipeline,
            registry: frameworkV2.registry,
            refs: frameworkV2.services.refs,
            validation: frameworkV2.services.validation,
            prefs: frameworkV2.services.prefs,
        };
        registerDseSidebar(this, dseSidebarServices);

        // D8 Task 3 (spec §1's canonical use) — a thin, initiative-specific "send to
        // sidebar" affordance proving sendToSidebar(services, path, alias) end to end
        // through production wiring: the generic "Send block to sidebar" command
        // (registerDseSidebar, above) requires the cursor to sit inside the block, but the
        // running-session tracker is meant to be grabbed from anywhere in the note — so
        // this one only needs an active file, not a cursor position. Scans for whichever
        // of initiative's FOUR aliases (ds-it/ds-init/ds-initiative/ds-initiative-tracker)
        // actually appears in the note — hardcoding the canonical "ds-initiative" would
        // silently no-op on a note written with a different alias (e.g. the visual-harness
        // fixture uses ds-it); listFences' emptiness IS the signal, no extra plumbing
        // needed. Falls back to the canonical alias so sendToSidebar's own
        // "no matching block" no-op still applies when the note has none of them at all.
        // The full per-block context-menu sweep for every element is Task 10's job.
        this.addCommand({
            id: 'send-initiative-to-sidebar',
            name: 'Send initiative tracker to sidebar',
            editorCheckCallback: (checking: boolean, editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
                const file = ctx.file;
                if (!file) return false;
                if (!checking) {
                    void (async () => {
                        const content = await this.app.vault.cachedRead(file);
                        const alias =
                            initiativeElement.aliases.find((a) => listFences(content, a).length > 0) ??
                            initiativeElement.aliases[0];
                        await sendToSidebar(dseSidebarServices, file.path, alias, editor.getCursor().line);
                    })();
                }
                return true;
            },
        });

        // D9 (Plan 15 Task 3): authoring scaffolders — one Insert command per element and a
        // /ds EditorSuggest, both pure loops over the registry (no per-element code). Editor
        // surfaces only: insert-at-cursor, never a rewrite.
        registerInsertCommands(this, frameworkV2.registry);
        this.registerEditorSuggest(new DsElementSuggest(this.app, frameworkV2.registry));

        // D9 (Plan 15 Task 4): key/enum autocomplete inside an already-open ds-* fence —
        // the inverse trigger of DsElementSuggest above (that one suppresses itself inside
        // any fence; this one only fires inside a ds-* fence). Registered as a second,
        // independent EditorSuggest.
        this.registerEditorSuggest(new DsSchemaSuggest(this.app, frameworkV2.registry));

        // D6 Task 10/11 (spec §4): the compendium search modal + insert commands, over the
        // typed-model accessor constructed above (right after sccResolver) and already
        // threaded into the render pipeline as cx.compendium. Only needs syncService
        // (the "sync now" affordance inside the search modal's empty state), which is in
        // hand by this point.
        this.compendiumIndex.registerWatchers(this);
        registerCompendiumInsertCommands(this, this.compendiumIndex, this.syncService);

        this.addCommand({
            id: 'sync-compendium',
            name: 'Sync compendium',
            callback: () => this.syncCompendium(),
        });
        // Legacy alias: removing a command id silently drops any hotkey a user bound
        // to it. Keep for the 6.x cycle; remove in 7.0.0 (F2 §3.4).
        this.addCommand({
            id: 'download-data-md-dse',
            name: 'Sync compendium (legacy alias)',
            callback: () => this.syncCompendium(),
        });
    }

    /**
     * Dependency schemas registered into the framework v2 `ValidationService` at load
     * (F1 §5). Protected + overridable purely so tests can drive a malformed-schema
     * scenario through the REAL `onload` lifecycle (see the Task 10 test) — production
     * always uses `FRAMEWORK_V2_DEPENDENCY_SCHEMAS`.
     */
    protected frameworkV2DependencySchemas(): readonly DependencySchema[] {
        return FRAMEWORK_V2_DEPENDENCY_SCHEMAS;
    }

    /**
     * Initialize all JSON schemas for validation
     * This registers only dependency schemas that other schemas reference
     */
    private initializeSchemas() {
        const dependencySchemas = [
            {
                id: "https://steelcompendium.io/schemas/component-wrapper-1.0.0",
                schema: componentWrapperSchemaYaml
            }
            // Add more dependency schemas here as needed
            // Note: Don't register main schemas that are being validated directly
        ];
        
        initializeSchemaRegistry(dependencySchemas);
    }

    onunload() {
        // Reset schema registry to clean up global state
        resetSchemaRegistry();

        // F1 §4.5 cleanup semantics: SessionStore is the only framework v2 service
        // with explicit unload-time state to clear (plugin-scoped Map, "cleared when
        // the plugin unloads"). The rest (ValidationService/ThemeService/
        // PreferenceStore/ReferenceService/ElementRegistry/ElementPipeline) carry no
        // module-global state — they're constructed fresh in onload — so dropping the
        // reference is enough; no view is ever stored on the plugin (F1 §2.4 step 6).
        this.frameworkV2?.services.session.clear();
        // D4: don't lose a pref change made in the last 250 ms before unload.
        this.prefsStorage?.flush();
        this.prefsStorage = undefined;
        this.frameworkV2 = undefined;

        console.log("Draw Steel Elements Plugin unloaded and schema registry reset");
    }

    /** F2 Task 10 — the sync options derived from live settings; also Task 11's
     *  Settings-tab handle for a "sync now" affordance. */
    syncOptions(): SyncOptions {
        return {
            root: this.settings.compendiumDestinationDirectory,
            releaseTag: this.settings.compendiumReleaseTag || undefined,
            locale: this.settings.compendiumLocale,
        };
    }

    /**
     * F2 Task 10 — the command/settings-button entry point. OD-6: on a genuinely
     * first sync (no manifest yet) where the configured root already holds files,
     * offer the confirmed legacy-folder choice before touching anything; every other
     * call goes straight to `syncService.sync` (itself non-destructive by
     * construction — see CompendiumSyncService.applySync, Task 9).
     */
    async syncCompendium(): Promise<void> {
        const options = this.syncOptions();
        const manifest = await this.manifestStore.load();
        if (manifest === null) {
            const root = this.app.vault.getAbstractFileByPath(normalizePath(options.root));
            if (root instanceof TFolder && root.children.length > 0) {
                new LegacyCompendiumModal(this.app, options.root, async (trashOldRoot) => {
                    if (trashOldRoot) {
                        await this.app.fileManager.trashFile(root);
                    }
                    await this.syncService.sync(this.syncOptions());
                }).open();
                return;
            }
        }
        await this.syncService.sync(options);
    }

    async loadSettings() {
        this.settings = migrateSettings(await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
