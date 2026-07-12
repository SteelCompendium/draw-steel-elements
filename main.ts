import {App, Notice, Plugin} from 'obsidian';
import {DseSettingTab} from "@views/SettingsTab";
import {DSESettings, migrateSettings} from "@model/Settings";
import {CompendiumDownloader} from "@utils/CompendiumDownloader";
import { registerElements } from '@/utils/RegisterElements';
import { initializeSchemaRegistry, resetSchemaRegistry } from '@utils/JsonSchemaValidator';
import componentWrapperSchemaYaml from '@model/schemas/ComponentWrapperSchema.yaml';
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
import { registerInsertCommands } from '@/authoring/insert';
import { DsElementSuggest } from '@/authoring/suggest';
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

/** One dependency schema entry for `ValidationService.addDependencySchema` (F1 §5). */
export interface DependencySchema {
	id: string;
	schema: string;
}

/**
 * F1 §5 — the shared `component-wrapper` dependency schema (`collapsible` /
 * `collapse_default`), registered once at load; element schemas `$ref` it, same as the
 * legacy `initializeSchemaRegistry` call below registers it for the legacy validator.
 * Exported (not inlined) so Task 10's test can pass a deliberately malformed
 * substitute to `initializeElementFrameworkV2` without needing to fake the real
 * schema file.
 */
export const FRAMEWORK_V2_DEPENDENCY_SCHEMAS: readonly DependencySchema[] = [
	{
		id: "https://steelcompendium.io/schemas/component-wrapper-1.0.0",
		schema: componentWrapperSchemaYaml,
	},
];

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
 * (CompendiumDownloader, settings tab, etc. — see the Task 10 test).
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
	const pipeline = new ElementPipeline({ app, plugin, settings, theme, prefs, refs, validation, session, roll });

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
 * registers nothing. Kept as a standalone function (same rationale as
 * `initializeElementFrameworkV2`) so it is testable without the full plugin lifecycle.
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
}

export default class DrawSteelAdmonitionPlugin extends Plugin {
    settings: DSESettings;
    /** F1 (Plan 02, Task 10) scaffold + D1 (migrated elements): framework v2 service
     *  bundle + registry (populated via `registerFrameworkElementDefinitions` — the
     *  single source of truth for which elements have migrated) + pipeline. Undefined
     *  before `onload` runs and after `onunload` drops it. */
    frameworkV2?: ElementFrameworkV2;

    /** D4: the debounced saveData adapter behind the PreferenceStore; flushed on unload. */
    private prefsStorage?: FlushablePrefsStorage;

	readonly githubOwner = "steelCompendium";
	readonly githubRepo = "data-md-dse";

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

        // F1 (Plan 02, Task 10): construct the framework v2 bundle alongside the
        // legacy path above. Coexistence, not replacement — see the function doc.
        this.prefsStorage = createSaveDataPrefsStorage(this);
        const frameworkV2 = initializeElementFrameworkV2(
            this.app,
            this,
            this.settings,
            this.frameworkV2DependencySchemas(),
            this.prefsStorage,
        );
        this.frameworkV2 = frameworkV2;

        // D1 Task 1 (F1 §2.3 "incremental migration switch"): populate the framework
        // registry with migrated element definitions, then wire Obsidian's
        // registerMarkdownCodeBlockProcessor for each of their aliases. ADDITIVE — the
        // legacy registerElements(this) call above still owns every not-yet-migrated
        // element.
        registerFrameworkElementDefinitions(frameworkV2.registry);
        registerFrameworkElements(this, frameworkV2);

        // D9 (Plan 15 Task 3): authoring scaffolders — one Insert command per element and a
        // /ds EditorSuggest, both pure loops over the registry (no per-element code). Editor
        // surfaces only: insert-at-cursor, never a rewrite.
        registerInsertCommands(this, frameworkV2.registry);
        this.registerEditorSuggest(new DsElementSuggest(this.app, frameworkV2.registry));

        this.addCommand({
            id: 'download-data-md-dse',
            name: 'Download Compendium',
            callback: () => this.downloadAndExtractRelease(),
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

    async downloadAndExtractRelease() {
        return new CompendiumDownloader(this.app, this.githubOwner, this.githubRepo, undefined)
            .downloadAndExtractRelease(this.settings.compendiumReleaseTag, this.settings.compendiumDestinationDirectory);
    }

    async loadSettings() {
        this.settings = migrateSettings(await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
