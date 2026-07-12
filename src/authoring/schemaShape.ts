// Plan 15 Task 4/5 (D9 §5.1/§3.1) — shared schema-shape resolver: walks a JSON-Schema-in-YAML
// node's `properties`/`required`/`allOf` (recursively) and `$ref` (resolved against
// FRAMEWORK_V2_DEPENDENCY_SCHEMAS — the SAME data ValidationService.addDependencySchema
// registers into AJV, main.ts onload) into one flat SchemaShape. Extracted from
// schemaSuggest.ts's original private mergeShape/resolveRef (Task 4 fix round 1) so
// formModel.ts (Task 5, schema → form fields) resolves the SAME allOf/$ref shapes property
// autocomplete already resolves, rather than a second hand-rolled resolver: ds-skills/ds-stam
// are `type: object` + `allOf: [{$ref: component-wrapper}, {properties: {...}}]` — their own
// properties live under allOf[1], not the schema root, so a direct `parsed.properties` read
// yields nothing for those two elements (see schemaSuggest.ts's file header for the original
// finding). Both DsSchemaSuggest and fieldsFromSchema import this module — no second resolver.
import { parseYaml } from 'obsidian';
import { FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from '@/framework/dependencySchemas';

/** Raw shape of a parsed JSON-Schema-in-YAML node, as far as the form/autocomplete readers
 *  care (a superset of both consumers' needs: type/enum/description for the form, plus
 *  properties/required/allOf/$ref for shape resolution). */
export interface RawSchemaNode {
	$ref?: string;
	type?: string;
	enum?: unknown[];
	description?: string;
	properties?: Record<string, RawSchemaNode | undefined>;
	required?: string[];
	allOf?: RawSchemaNode[];
}

export interface SchemaShape {
	properties: Record<string, RawSchemaNode | undefined>;
	required: string[];
}

let dependencySchemaCache: Map<string, RawSchemaNode> | null = null;

/** Lazily parsed, cached map of $ref id -> parsed schema node, sourced from the SAME
 *  FRAMEWORK_V2_DEPENDENCY_SCHEMAS data main.ts registers into the real AJV validator. */
function resolveRef(ref: string): RawSchemaNode | null {
	if (!dependencySchemaCache) {
		const map = new Map<string, RawSchemaNode>();
		for (const dep of FRAMEWORK_V2_DEPENDENCY_SCHEMAS) {
			try {
				map.set(dep.id, parseYaml(dep.schema) as RawSchemaNode);
			} catch {
				// A malformed dependency schema just isn't offered for $ref resolution;
				// mirrors ValidationService's per-schema try/catch resilience (F1 Task-1).
			}
		}
		dependencySchemaCache = map;
	}
	return dependencySchemaCache.get(ref) ?? null;
}

/** Merges `properties`/`required` from a schema node, every `allOf` entry (recursively so a
 *  nested allOf/$ref also resolves), and `$ref` targets (resolved via resolveRef) into
 *  `into`. Handles both `allOf: [{$ref: ...}, {properties: {...}}]` (ds-skills/ds-stam) and a
 *  plain `type: object` + `properties` schema (ds-roll). */
export function mergeShape(node: RawSchemaNode | null | undefined, into: SchemaShape): void {
	if (!node) return;
	if (node.$ref) {
		mergeShape(resolveRef(node.$ref), into);
	}
	if (node.properties) {
		Object.assign(into.properties, node.properties);
	}
	if (Array.isArray(node.required)) {
		for (const key of node.required) {
			if (!into.required.includes(key)) into.required.push(key);
		}
	}
	if (Array.isArray(node.allOf)) {
		for (const entry of node.allOf) mergeShape(entry, into);
	}
}

/** Parses a schema YAML string and resolves it (root + allOf + $ref) into a flat SchemaShape.
 *  Returns null on unparsable/malformed YAML — callers fall back accordingly. */
export function shapeFromSchemaYaml(schemaYaml: string): SchemaShape | null {
	try {
		const root = parseYaml(schemaYaml) as RawSchemaNode;
		const shape: SchemaShape = { properties: {}, required: [] };
		mergeShape(root, shape);
		return shape;
	} catch {
		return null;
	}
}
