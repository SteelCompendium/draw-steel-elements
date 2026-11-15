// SC-662 (OOS-1): a persisted element's save has to carry the sidebar's `_dse_anchor` line through, or the pinned block stops being
// addressable the moment the view first writes it (the panel degrades to "Backing block not found"; SidebarBlockHost's header says every
// persisted element has the passthrough). ds-conditions did not. This sweeps every persisted element: its curated example plus an anchor line
// goes through parse -> serialize and the anchor must come out.
import { parseYaml } from '../../mocks/obsidian';
import { createElementRegistry } from '../../../src/framework/registry';
import { registerFrameworkElementDefinitions } from 'main';

const registry = createElementRegistry();
registerFrameworkElementDefinitions(registry);
const persisted = registry
	.all()
	.filter((def) => def.shape === 'persisted' && def.serialize !== undefined);

describe('SC-662: every persisted element writes the `_dse_anchor` line back', () => {
	test('the sweep covers the persisted elements (a new one is picked up automatically)', () => {
		expect(persisted.map((d) => d.id).sort()).toEqual(
			['conditions', 'counter', 'encounter', 'hero', 'hero-tokens', 'heroic-resource', 'initiative', 'montage', 'negotiation', 'party', 'project', 'stamina-bar', 'surges'].sort(),
		);
	});

	test.each(persisted.map((d) => [d.id, d] as const))('%s: parse -> serialize keeps `_dse_anchor`', (_id, def) => {
		const example = def.authoring?.example ?? '';
		const body = `${example.replace(/^_dse_anchor:.*\n?/gm, '').trimEnd()}\n_dse_anchor: swp123`; // (some examples carry an anchor already)
		const model = def.parse(parseYaml(body), body);
		const out = def.serialize!(model);
		expect(String((parseYaml(out) as Record<string, unknown>)._dse_anchor)).toBe('swp123');
	});
});
