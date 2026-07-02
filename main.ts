import {App, Notice, Plugin} from 'obsidian';
import {MyPluginSettingTab} from "@views/SettingsTab";
import {DEFAULT_SETTINGS, DSESettings} from "@model/Settings";
import {CompendiumDownloader} from "@utils/CompendiumDownloader";
import { registerElements } from '@/utils/RegisterElements';
import { initializeSchemaRegistry, resetSchemaRegistry } from '@utils/JsonSchemaValidator';
import componentWrapperSchemaYaml from '@model/schemas/ComponentWrapperSchema.yaml';
import "./styles-source.css";

// F1 (Plan 02, Task 10) — Element Framework v2 wiring. This is ADDITIVE alongside the
// legacy schema/registration paths above: no element migrates in this task, so the
// framework's ElementRegistry stays empty and Obsidian's markdown code-block
// processors remain entirely legacy-owned (registerElements(this), unchanged).
import { createValidationService } from '@/framework/validation';
import type { ValidationService } from '@/framework/validation';
import { createSessionStore } from '@/framework/session';
import type { SessionStore } from '@/framework/session';
import { createThemeService } from '@/framework/seams/theme';
import type { ThemeService } from '@/framework/seams/theme';
import { createPreferenceStore } from '@/framework/seams/prefs';
import type { PreferenceStore, PrefsStorage } from '@/framework/seams/prefs';
import { createReferenceService } from '@/framework/seams/refs';
import type { ReferenceService } from '@/framework/seams/refs';
import { createElementRegistry } from '@/framework/registry';
import type { ElementRegistry } from '@/framework/registry';
import { ElementPipeline } from '@/framework/pipeline';

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
 * **Coexistence:** this registers NO elements. `RegisterElements.ts` /
 * `registerElements(plugin)` remains the sole owner of every
 * `registerMarkdownCodeBlockProcessor` call until a later task migrates the first
 * element (F1 §2.3's "incremental migration switch") — the returned `registry` is
 * always empty here.
 */
export function initializeElementFrameworkV2(
	app: App,
	plugin: Plugin,
	settings: Readonly<DSESettings>,
	dependencySchemas: readonly DependencySchema[] = FRAMEWORK_V2_DEPENDENCY_SCHEMAS,
): ElementFrameworkV2 {
	const validation = createValidationService();
	const session = createSessionStore();
	const theme = createThemeService();
	// F1 §3.6 / OD-2: real persisted-storage wiring (merged under the plugin's saved
	// settings, under a `prefs` key) is D4 scope — F1's seam only needs a working
	// get/set pair, same convention the framework's own pipeline tests use.
	const prefsStorage: PrefsStorage = {
		get: async () => undefined,
		set: async () => {},
	};
	const prefs = createPreferenceStore(prefsStorage);
	const refs = createReferenceService(app, settings);

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
	const pipeline = new ElementPipeline({ app, plugin, settings, theme, prefs, refs, validation, session });

	return {
		services: { validation, session, theme, prefs, refs },
		registry,
		pipeline,
	};
}

export default class DrawSteelAdmonitionPlugin extends Plugin {
    settings: DSESettings;
    /** F1 (Plan 02, Task 10): framework v2 service bundle + empty registry + pipeline.
     *  Undefined before `onload` runs and after `onunload` drops it. No element
     *  migrates in this task — see `initializeElementFrameworkV2`'s doc comment. */
    frameworkV2?: ElementFrameworkV2;

	readonly githubOwner = "steelCompendium";
	readonly githubRepo = "data-md-dse";

    async onload() {
        console.log("Loading Draw Steel Elements Plugin.")

        // Initialize schema registry with all common schemas
        this.initializeSchemas();

        await this.loadSettings();
        this.addSettingTab(new MyPluginSettingTab(this.app, this));

        // Legacy registration path — UNCHANGED, runs exactly as it does today.
        registerElements(this);

        // F1 (Plan 02, Task 10): construct the framework v2 bundle alongside the
        // legacy path above. Coexistence, not replacement — see the function doc.
        this.frameworkV2 = initializeElementFrameworkV2(
            this.app,
            this,
            this.settings,
            this.frameworkV2DependencySchemas(),
        );

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
        this.frameworkV2 = undefined;

        console.log("Draw Steel Elements Plugin unloaded and schema registry reset");
    }

    async downloadAndExtractRelease() {
        return new CompendiumDownloader(this.app, this.githubOwner, this.githubRepo, undefined)
            .downloadAndExtractRelease(this.settings.compendiumReleaseTag, this.settings.compendiumDestinationDirectory);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
