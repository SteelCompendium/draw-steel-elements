// F1 §3.1 — ElementShape / ElementDefinition<M> / ElementRegistry: the declarative element
// model. Each DSE element (stamina-bar, counter, statblock, …) is described by one
// ElementDefinition and registered once; the registry is a PURE in-memory id/alias → def
// lookup with NO Obsidian coupling. Wiring a registry's definitions into Obsidian's
// registerMarkdownCodeBlockProcessor is the pipeline's job (Task 9) / main.ts's job
// (Task 10) — this module must stay unit-testable without a real Plugin.
import type { RenderContext } from './context';
import type { ElementView } from './view';
import type { ReferenceService } from './seams/refs';

/** Strongest behavioral requirement an element makes — drives pipeline wiring (F1 §1.3). */
export type ElementShape = 'static' | 'interactive' | 'persisted';

/** Form control kind the schema-driven form maps a field to (D9). */
export type FormWidget = 'text' | 'textarea' | 'number' | 'toggle' | 'select';

/** Per-field UI override for the generated form; the schema is the fallback for each. */
export interface AuthoringFieldHint {
	label?: string;
	widget?: FormWidget;
	order?: number;
	hidden?: boolean;
	help?: string;
}

/**
 * D9 authoring-tool hints. Absence changes nothing (scaffold/form still derive from the
 * schema); presence enriches. Purely additive — this is the ONLY change D9 makes to an F1
 * interface (F1 reserved the slot at registry.ts as `authoring?: unknown`).
 */
export interface AuthoringHint {
	/** Curated starter block BODY (YAML, no fences). Overrides the schema-derived scaffold. */
	example?: string;
	/** SDK model this element parses — routes the (deferred) text importer. Declared now. */
	sdkModel?: 'statblock' | 'feature' | 'featureblock';
	/** Per-field UI overrides for the form; schema is the fallback for every field. */
	fields?: Record<string, AuthoringFieldHint>;
}

/**
 * Declarative definition of one DSE element type (F1 §3.1). Authored by element code
 * (`elements/<name>/definition.ts`) and passed to `ElementRegistry.register()` once at
 * plugin load.
 */
export interface ElementDefinition<M = unknown> {
	/** Stable machine id, kebab-case, never reused. e.g. "stamina-bar" */
	id: string;
	/** Human name for error cards / settings UI. Sentence case. e.g. "Stamina bar" */
	name: string;
	/** Code-block languages. First entry is canonical (used when rewriting blocks). */
	aliases: readonly [canonical: string, ...rest: string[]];
	/** Strongest behavioral requirement — drives pipeline wiring (§1.3). */
	shape: ElementShape;
	/** YAML-text JSON Schema (esbuild yaml-loader import). Omit ⇒ no validation. */
	schema?: string;
	/**
	 * Parsed-YAML data → typed model. `raw` is the original block text for
	 * SDK readers that consume text (Feature.read(new YamlReader(...), raw)).
	 * Throw Error with a user-facing message on bad input.
	 */
	parse(data: unknown, raw: string): M;
	/**
	 * Model → YAML block body for write-back. REQUIRED when shape === "persisted"
	 * (registry rejects the definition otherwise). Typically stringifyYaml(dto).
	 */
	serialize?(model: M): string;
	/** View factory; called once per mounted block instance. */
	createView(cx: RenderContext): ElementView<M>;
	/**
	 * Custom reference resolution. If omitted AND autoResolveRefs === true, the pipeline
	 * deep-resolves @path / [[wikilink]] / scc.vN: strings in the raw data BEFORE parse()
	 * via ReferenceService.resolveDeep. (Default is OFF — see autoResolveRefs.)
	 */
	resolveRefs?(model: M, refs: ReferenceService): Promise<M>;
	/** Opt IN (true) to whole-YAML deep ref-resolution. DEFAULT OFF (amended 2026-07-02;
	 *  was default-ON). Elements doing field-scoped resolution use a custom resolveRefs. */
	autoResolveRefs?: boolean;
	/** Suppress the reading-mode click shield. Default false (shield on). */
	noClickShield?: boolean;
	/**
	 * D7 Task 9 — suppress the pipeline's generic `authoringControls` "Edit <name>"
	 * pencil icon (`ElementPipeline.run`, appended after `view.mount()`). Default false
	 * (shown, mirroring `noClickShield`'s convention). `ds-hero` sets this: the sheet
	 * mounts its OWN "Edit definition" header affordance (next to `[respite]`, spec
	 * §3.2's mockup placement) that opens the SAME `openFormEditor`/schema — a second,
	 * generically-placed pencil at the end of `root` would be redundant and confusing on
	 * an already-composed sheet.
	 */
	noAuthoringButton?: boolean;
	/**
	 * D9 authoring-tool hints (curated example, importer sdk model, per-field form UI).
	 * Additive + optional — absence changes nothing; every tool falls back to the schema.
	 */
	authoring?: AuthoringHint;
	/**
	 * D6 Task 3 fix round 1 (spec §1.1) — set by `withReference()`. A bare `@path`
	 * whole-block reference is NOT valid YAML on its own (`yaml` — and Obsidian's real
	 * `parseYaml`, which wraps it — reserves a leading `@` on a plain scalar: "Plain
	 * value cannot start with reserved character @"), so the pipeline's parse stage
	 * (pipeline.ts step 2) needs to know a def can accept that raw string BEFORE
	 * `parseYaml` ever runs, and skip straight to `def.parse` with the trimmed source
	 * instead of error-carding. Narrowly scoped: false/absent for every def that hasn't
	 * opted in via `withReference`, so their `@`-leading bodies (there is no legitimate
	 * reason to write one) still error-card exactly as before.
	 */
	acceptsWholeBlockRef?: boolean;
}

/**
 * Pure in-memory registry of ElementDefinitions, indexed by both id and every alias (F1
 * §3.1). Storage only — deliberately decoupled from Obsidian's
 * registerMarkdownCodeBlockProcessor wiring (pipeline/main.ts territory), so it is
 * unit-testable without a real Plugin.
 */
export interface ElementRegistry {
	/**
	 * Validates and stores `def`. Throws a clear Error (rejecting the definition, not
	 * mutating registry state) when:
	 *  - `def.id` is already registered;
	 *  - any of `def.aliases` is already registered (to any def, under its id or an alias);
	 *  - `def.shape === "persisted"` and `def.serialize` is missing.
	 */
	register<M>(def: ElementDefinition<M>): void;
	/** Look up a definition by its id or by any of its registered aliases. */
	get(idOrAlias: string): ElementDefinition | undefined;
	/** All registered definitions, in registration order. */
	all(): readonly ElementDefinition[];
}

class DseElementRegistry implements ElementRegistry {
	private readonly byId = new Map<string, ElementDefinition>();
	private readonly byAlias = new Map<string, ElementDefinition>();
	private readonly registered: ElementDefinition[] = [];

	register<M>(def: ElementDefinition<M>): void {
		if (this.byId.has(def.id)) {
			throw new Error(`ElementRegistry.register(): duplicate element id "${def.id}" (already registered).`);
		}
		if (def.shape === 'persisted' && !def.serialize) {
			throw new Error(
				`ElementRegistry.register(): element "${def.id}" has shape "persisted" but no serialize() — ` +
					'serialize is required for persisted elements.',
			);
		}
		for (const alias of def.aliases) {
			const existing = this.byAlias.get(alias);
			if (existing) {
				throw new Error(
					`ElementRegistry.register(): duplicate alias "${alias}" — already registered to element ` +
						`"${existing.id}" (registering "${def.id}").`,
				);
			}
		}

		// All validation passed — store. Everything below is infallible, so a rejected
		// registration (thrown above) never partially mutates registry state.
		const definition = def as unknown as ElementDefinition;
		this.byId.set(def.id, definition);
		for (const alias of def.aliases) {
			this.byAlias.set(alias, definition);
		}
		this.registered.push(definition);
	}

	get(idOrAlias: string): ElementDefinition | undefined {
		return this.byId.get(idOrAlias) ?? this.byAlias.get(idOrAlias);
	}

	all(): readonly ElementDefinition[] {
		return this.registered.slice();
	}
}

/** Construct a fresh, empty ElementRegistry. */
export function createElementRegistry(): ElementRegistry {
	return new DseElementRegistry();
}
