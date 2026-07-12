// Plan 15 Task 5 (D9 §3.1) — schema → form-field descriptors. Pure: reads def.schema (via the
// shared ./schemaShape resolver — root + allOf + $ref, the SAME resolution Task 4's
// autocomplete uses, so ds-skills/ds-stam's `allOf: [{$ref: component-wrapper}, {properties:
// {...}}]` schemas yield their real properties here too, no second resolver) and
// def.authoring.fields, emitting one FormField per visible property, applying
// label/widget/order/hidden overrides with schema fallbacks. The modal (FormModal.ts) turns
// these into controls. Complex nodes (array/object/$ref) fall back to a YAML textarea widget
// (v1; rich nested editors deferred — Post-plan).
import type { AuthoringFieldHint, ElementDefinition, FormWidget } from '@/framework/registry';
import { shapeFromSchemaYaml, type RawSchemaNode } from './schemaShape';

export interface FormField {
	key: string;
	label: string;
	widget: FormWidget;
	help?: string;
	enum?: string[];
	order: number;
}

/** property name → sentence-case label ("max_stamina" → "Max stamina"). */
function labelize(key: string): string {
	const spaced = key.replace(/[_-]+/g, ' ').trim();
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function widgetFor(node: RawSchemaNode): FormWidget {
	if (Array.isArray(node.enum)) return 'select';
	switch (node.type) {
		case 'integer':
		case 'number':
			return 'number';
		case 'boolean':
			return 'toggle';
		case 'string':
			return 'text';
		default:
			return 'textarea'; // array/object/$ref/unknown → raw-YAML sub-editor (v1)
	}
}

export function fieldsFromSchema(def: ElementDefinition): FormField[] {
	if (!def.schema) return [];
	const shape = shapeFromSchemaYaml(def.schema);
	const props = shape?.properties;
	if (!props || typeof props !== 'object') return [];
	const overrides: Record<string, AuthoringFieldHint> = def.authoring?.fields ?? {};

	const fields: FormField[] = [];
	let i = 0;
	for (const key of Object.keys(props)) {
		const o = overrides[key] ?? {};
		if (o.hidden) continue;
		const node = props[key] ?? {};
		fields.push({
			key,
			label: o.label ?? labelize(key),
			widget: o.widget ?? widgetFor(node),
			help: o.help ?? node.description,
			enum: Array.isArray(node.enum) ? node.enum.map(String) : undefined,
			order: o.order ?? i,
		});
		i++;
	}
	return fields.sort((a, b) => a.order - b.order);
}
