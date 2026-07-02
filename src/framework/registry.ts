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
	 * Custom reference resolution. Default (when omitted and autoResolveRefs !== false):
	 * pipeline deep-resolves @path / [[wikilink]] / scc.vN: strings in the raw data
	 * BEFORE parse() via ReferenceService.resolveDeep.
	 */
	resolveRefs?(model: M, refs: ReferenceService): Promise<M>;
	/** Set false to skip the default deep resolution (element handles refs itself). */
	autoResolveRefs?: boolean;
	/** Suppress the reading-mode click shield. Default false (shield on). */
	noClickShield?: boolean;
	/**
	 * Additive optional authoring-tool hint slot (D9 fills this contract; not specified by
	 * F1). Left untyped on purpose — F1 only needs the field to exist so downstream defs can
	 * start populating it without a breaking interface change later.
	 */
	authoring?: unknown;
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
