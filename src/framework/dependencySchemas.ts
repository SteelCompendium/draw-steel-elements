// F1 §5 / D9 Task 4 (schema $ref resolution) — the shared `component-wrapper` dependency
// schema, factored out of main.ts so it has exactly one owner that BOTH main.ts (plugin
// wiring: ValidationService.addDependencySchema) and src/authoring/schemaSuggest.ts
// (autocomplete: resolving allOf/$ref for property-shape lookup) can import without a
// cycle. main.ts imports DsSchemaSuggest (via schemaSuggest.ts), so schemaSuggest.ts
// cannot import FRAMEWORK_V2_DEPENDENCY_SCHEMAS from main.ts directly — that would be
// main.ts -> schemaSuggest.ts -> main.ts. Extracting the constant here (main.ts now
// re-exports it for backward compatibility with existing `import { ... } from 'main'`
// call sites in tests/visual-harness) breaks the cycle while keeping a single source.
import componentWrapperSchemaYaml from '@model/schemas/ComponentWrapperSchema.yaml';

/** One dependency schema entry for `ValidationService.addDependencySchema` (F1 §5). */
export interface DependencySchema {
	id: string;
	schema: string;
}

/**
 * F1 §5 — the shared `component-wrapper` dependency schema (`collapsible` /
 * `collapse_default`), registered once at load; element schemas `$ref` it, same as the
 * legacy `initializeSchemaRegistry` call registers it for the legacy validator.
 * Exported (not inlined) so tests can pass a deliberately malformed substitute to
 * `initializeElementFrameworkV2` without needing to fake the real schema file, and so
 * `DsSchemaSuggest` can resolve `$ref`s against the same data (D9 Task 4).
 */
export const FRAMEWORK_V2_DEPENDENCY_SCHEMAS: readonly DependencySchema[] = [
	{
		id: 'https://steelcompendium.io/schemas/component-wrapper-1.0.0',
		schema: componentWrapperSchemaYaml,
	},
];
