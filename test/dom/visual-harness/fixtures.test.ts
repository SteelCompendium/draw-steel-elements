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
	parseParams,
	registerHarnessElementDefinitions,
} from '../../../visual-harness/entry';

// SC-149: the HARNESS registry, not the public one — `registerHarnessElementDefinitions`
// is what `mountFromParams` itself uses, and it adds the eleven internal display-family
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

	// SC-149: the eleven display elements are gone from the PUBLIC registry but must
	// stay photographable — every one of them owns frozen shot names (and a line in the
	// frozen gallery), so losing their harness registration would silently drop coverage
	// rather than fail loudly.
	test('the eleven internal display-family elements are still mountable in the harness registry', () => {
		for (const id of ['kit', 'condition', 'treasure', 'ancestry', 'culture', 'career', 'class', 'title', 'perk', 'complication', 'rule']) {
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
			theme: 'steel',
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
			theme: 'steel',
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
			theme: 'steel',
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
			theme: 'steel',
			bg: 'light',
			print: false,
			readonly: false,
			gallery: false,
		});
		expect(document.body.classList.contains('theme-light')).toBe(true);
		expect(document.body.classList.contains('theme-dark')).toBe(false);
	});
});

// SC-144 — the theme axis was retired. `shoot.mjs` sweeps 3 combos (steel-dark,
// steel-light, steel-print) and no longer sends anything but `theme=steel`, so the
// harness's own default must be Steel: before SC-144 an omitted `theme=` param resolved
// to 'legacy', which would now silently shoot the wrong look.
//
// Review F1: the interesting cases are the ones where a naive default would DISAGREE with
// the clamp — a retired id and an outright bogus one. The first cut passed any non-empty
// value straight through, so `?theme=legacy` still stamped a legacy root; these pin that
// it cannot come back, at the parse level AND at the rendered root.
describe('parseParams theme (SC-144)', () => {
	test('an omitted or empty theme param defaults to steel', () => {
		expect(parseParams('?element=feature&bg=dark').theme).toBe('steel');
		expect(parseParams('').theme).toBe('steel');
		expect(parseParams('?theme=').theme).toBe('steel');
	});

	test('an explicit theme=steel is honoured', () => {
		expect(parseParams('?theme=steel').theme).toBe('steel');
	});

	test('the RETIRED id is clamped, not honoured: ?theme=legacy resolves to steel', () => {
		expect(parseParams('?theme=legacy').theme).toBe('steel');
		expect(parseParams('?element=feature&theme=legacy&bg=light').theme).toBe('steel');
	});

	test('any unrecognised id is clamped to steel (nothing else has a stylesheet here)', () => {
		expect(parseParams('?theme=garbage').theme).toBe('steel');
		expect(parseParams('?theme=parchment').theme).toBe('steel');
		expect(parseParams('?theme=STEEL').theme).toBe('steel'); // case-sensitive by design
	});
});

describe('mountFromParams stamps Steel regardless of the requested theme (SC-144 F1)', () => {
	let mount: HTMLDivElement;

	beforeEach(() => {
		mount = document.createElement('div');
		mount.id = 'mount';
		document.body.appendChild(mount);
	});

	afterEach(() => {
		mount.remove();
	});

	test.each(['legacy', 'garbage'])(
		'?theme=%s renders a root stamped data-dse-theme="steel"',
		async (requested) => {
			const { errors } = await mountFromParams(document, {
				...parseParams(`?element=feature&theme=${requested}&bg=dark`),
				fixture: 'default',
				print: false,
				readonly: false,
				gallery: false,
			});
			expect(errors).toEqual([]);
			// The element root is nested under the harness section wrapper (mountOne).
			const root = mount.querySelector('[data-dse-element]') as HTMLElement;
			expect(root).not.toBeNull();
			expect(root.getAttribute('data-dse-theme')).toBe('steel');
		},
	);
});
