// test/dom/visual-harness/fixtures.test.ts — F4 (Plan 11): every harness fixture mounts
// through the REAL pipeline with NO error card. This is the fixtures' validity gate (the
// Playwright camera is the visual gate; this one runs in CI with the suite). Importing the
// entry under jest is safe: `obsidian` maps to the test mock, `.md` imports go through
// rawTextTransformer, and the browser boot is guarded on a #mount element jsdom lacks.
import { ElementPipeline } from '../../../src/framework/pipeline';
import { createElementRegistry } from '../../../src/framework/registry';
import {
	FIXTURES,
	makeHarnessDeps,
	makeHarnessHost,
	mountFromParams,
	registerHarnessElementDefinitions,
} from '../../../visual-harness/entry';

// SC-149: the HARNESS registry, not the public one — `registerHarnessElementDefinitions`
// is what `mountFromParams` itself uses, and it adds the ten internal display-family
// definitions the public registry no longer carries (see its doc comment in entry.ts).
const registry = createElementRegistry();
registerHarnessElementDefinitions(registry);

// SC-149: registered elements that deliberately have NO browser fixture. `ds-scc` renders
// nothing without a synced compendium and the harness has no `cx.compendium`, so every
// body it could be given produces an error card — which `mountFromParams` correctly counts
// as a failed shot. Its coverage lives in test/dom/elements/sccElement.test.ts, which has a
// real CompendiumIndex over the md-dse fixtures.
const NO_FIXTURE_IDS = ['scc'];

describe('F4 visual-harness fixtures', () => {
	test('every FIXTURES key is a registered element id', () => {
		for (const id of Object.keys(FIXTURES)) {
			expect(registry.get(id)).toBeDefined();
		}
	});

	test('FIXTURES covers every registered element (bar the documented exclusions)', () => {
		const registered = registry
			.all()
			.map((d) => d.id)
			.filter((id) => !NO_FIXTURE_IDS.includes(id))
			.sort();
		expect(Object.keys(FIXTURES).sort()).toEqual(registered);
	});

	// SC-149: the ten typed display elements are gone from the PUBLIC registry but must
	// stay photographable — every one of them owns frozen shot names (and a line in the
	// frozen gallery), so losing their harness registration would silently drop coverage
	// rather than fail loudly.
	test('the ten internal display-family elements are still mountable in the harness registry', () => {
		for (const id of ['kit', 'condition', 'treasure', 'ancestry', 'culture', 'career', 'class', 'title', 'perk', 'complication']) {
			expect(registry.get(id)).toBeDefined();
		}
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

// shoot.mjs trusts window.__dseHarnessDone.errors (populated by mountFromParams) as its
// pass/fail signal for the whole sweep — nothing else exercised that aggregation. This
// pins the error seam: an unknown element surfaces in `errors`, a happy-path mount stays
// clean and actually renders, and the bg param stamps the right theme-* class on <body>.
describe('mountFromParams error seam', () => {
	let mount: HTMLDivElement;

	beforeEach(() => {
		mount = document.createElement('div');
		mount.id = 'mount';
		document.body.appendChild(mount);
	});

	afterEach(() => {
		mount.remove();
	});

	test('unknown element resolves with a non-empty errors array naming it', async () => {
		const { errors } = await mountFromParams(document, {
			element: 'nope',
			fixture: 'default',
			theme: 'legacy',
			bg: 'dark',
			print: false,
			readonly: false,
			gallery: false,
		});
		expect(errors.length).toBeGreaterThan(0);
		expect(errors.join('\n')).toContain('nope');
	});

	test('happy-path element resolves with no errors and renders into #mount', async () => {
		const { errors } = await mountFromParams(document, {
			element: 'feature',
			fixture: 'default',
			theme: 'legacy',
			bg: 'dark',
			print: false,
			readonly: false,
			gallery: false,
		});
		expect(errors).toEqual([]);
		expect(mount.firstElementChild).not.toBeNull();
	});

	test('bg param stamps the matching theme-dark/theme-light class on <body>', async () => {
		await mountFromParams(document, {
			element: 'feature',
			fixture: 'default',
			theme: 'legacy',
			bg: 'dark',
			print: false,
			readonly: false,
			gallery: false,
		});
		expect(document.body.classList.contains('theme-dark')).toBe(true);
		expect(document.body.classList.contains('theme-light')).toBe(false);

		await mountFromParams(document, {
			element: 'feature',
			fixture: 'default',
			theme: 'legacy',
			bg: 'light',
			print: false,
			readonly: false,
			gallery: false,
		});
		expect(document.body.classList.contains('theme-light')).toBe(true);
		expect(document.body.classList.contains('theme-dark')).toBe(false);
	});
});
