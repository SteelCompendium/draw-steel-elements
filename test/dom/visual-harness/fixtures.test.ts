// test/dom/visual-harness/fixtures.test.ts — F4 (Plan 11): every harness fixture mounts
// through the REAL pipeline with NO error card. This is the fixtures' validity gate (the
// Playwright camera is the visual gate; this one runs in CI with the suite). Importing the
// entry under jest is safe: `obsidian` maps to the test mock, `.md` imports go through
// rawTextTransformer, and the browser boot is guarded on a #mount element jsdom lacks.
import { ElementPipeline } from '../../../src/framework/pipeline';
import { createElementRegistry } from '../../../src/framework/registry';
import { registerFrameworkElementDefinitions } from 'main';
import { FIXTURES, makeHarnessDeps, makeHarnessHost } from '../../../visual-harness/entry';

const registry = createElementRegistry();
registerFrameworkElementDefinitions(registry);

describe('F4 visual-harness fixtures', () => {
	test('every FIXTURES key is a registered element id', () => {
		for (const id of Object.keys(FIXTURES)) {
			expect(registry.get(id)).toBeDefined();
		}
	});

	// Task 4 replaces this with the full 11-element equality assertion.
	test('FIXTURES covers feature (Task 3 scaffold)', () => {
		expect(Object.keys(FIXTURES)).toContain('feature');
	});

	for (const [id, fixtures] of Object.entries(FIXTURES)) {
		for (const [name, source] of Object.entries(fixtures)) {
			test(`${id}/${name} mounts with no error card`, async () => {
				const def = registry.get(id)!;
				const { deps } = makeHarnessDeps();
				const pipeline = new ElementPipeline(deps);
				const container = document.createElement('div');
				document.body.appendChild(container);
				const host = makeHarnessHost(container, { readonly: false, language: def.aliases[0] });
				await pipeline.run(def, source, host);
				expect(container.querySelector('.dse-error-card')).toBeNull();
				expect(container.firstElementChild).not.toBeNull();
				container.remove();
			});
		}
	}
});
