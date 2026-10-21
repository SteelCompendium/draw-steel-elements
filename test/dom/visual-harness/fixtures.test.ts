// test/dom/visual-harness/fixtures.test.ts — F4 (Plan 11): every harness fixture mounts
// through the REAL pipeline with NO error card. This is the fixtures' validity gate (the
// Playwright camera is the visual gate; this one runs in CI with the suite). Importing the
// entry under jest is safe: `obsidian` maps to the test mock, `.md` imports go through
// rawTextTransformer, and the browser boot is guarded on a #mount element jsdom lacks.
import { ElementPipeline } from '../../../src/framework/pipeline';
import { isExperimental } from '../../../src/framework/experimental';
import { createElementRegistry } from '../../../src/framework/registry';
import {
	attachHarnessCompendium,
	FIXTURES,
	FIXTURE_COMPENDIUM,
	HARNESS_COMPENDIUM,
	harnessCompendiumModeFor,
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
// nothing without a compendium, and the harness mounts with none by default, so every body
// it could be given renders the "Compendium not installed" NOTICE (`.dse-ref-notice`, not an
// error card) — which `mountFromParams` counts as a failed shot since SC-362. SC-469 owns
// its fixtures; its coverage until then lives in test/dom/elements/sccElement.test.ts, which
// has a real CompendiumIndex over the md-dse fixtures.
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
				// SC-362: the compendium the fixture declares (none, for every pre-existing one).
				attachHarnessCompendium(deps, FIXTURE_COMPENDIUM[`${id}/${name}`] ?? 'none');
				const pipeline = new ElementPipeline(deps);
				const container = document.createElement('div');
				document.body.appendChild(container);
				const host = makeHarnessHost(container, { readonly: false, language: def.aliases[0] });
				await pipeline.run(def, source, host);
				expect(container.querySelector('.dse-error-card')).toBeNull();
				// A reference that did not resolve renders a notice, not an error card.
				expect(container.querySelector('.dse-ref-notice')).toBeNull();
				expect(container.firstElementChild).not.toBeNull();
				container.remove();
			});
		}
	}
});

// SC-362 — the harness compendium: by-SCC fixtures resolve to their REAL card, undeclared
// fixtures keep the old no-compendium mount (their frozen DOM must not move), and an
// unresolved by-SCC shot fails the gate instead of photographing a notice.
describe('harness compendium (SC-362)', () => {
	async function render(id: string, name: string, mode: Parameters<typeof attachHarnessCompendium>[1]) {
		const def = registry.get(id)!;
		const { deps } = makeHarnessDeps();
		attachHarnessCompendium(deps, mode);
		const container = document.createElement('div');
		document.body.appendChild(container);
		await new ElementPipeline(deps).run(
			def,
			FIXTURES[id][name],
			makeHarnessHost(container, { readonly: false, language: def.aliases[0] }),
		);
		return { deps, container };
	}

	test('rule/by-scc resolves to the real card: eyebrow "Combat", title "Opportunity Attacks"', async () => {
		const { container } = await render('rule', 'by-scc', FIXTURE_COMPENDIUM['rule/by-scc']);
		expect(container.querySelector('.dse-error-card, .dse-ref-notice')).toBeNull();
		expect(container.querySelector('.dse-head__eyebrow--left')?.textContent?.trim()).toBe('Combat');
		expect(container.querySelector('.dse-head__primary--left')?.textContent?.trim()).toBe('Opportunity Attacks');
		container.remove();
	});

	test('condition/by-scc resolves to the real Bleeding card', async () => {
		const { container } = await render('condition', 'by-scc', FIXTURE_COMPENDIUM['condition/by-scc']);
		expect(container.querySelector('.dse-error-card, .dse-ref-notice')).toBeNull();
		expect(container.querySelector('.dse-head__primary--left')?.textContent?.trim()).toBe('Bleeding');
		container.remove();
	});

	test('only the by-SCC fixtures declare a compendium; every other fixture mounts with neither service', () => {
		expect(Object.keys(FIXTURE_COMPENDIUM).sort()).toEqual(['condition/by-scc', 'rule/by-scc']);
		for (const [id, fixtures] of Object.entries(FIXTURES)) {
			for (const name of Object.keys(fixtures)) {
				if (FIXTURE_COMPENDIUM[`${id}/${name}`]) continue;
				const { deps } = makeHarnessDeps();
				attachHarnessCompendium(deps, harnessCompendiumModeFor([{ element: id, fixture: name }]));
				expect(deps.compendium).toBeUndefined();
				expect(deps.sccAnchors).toBeUndefined();
			}
		}
	});

	test('the mode of a stack or gallery is the shared mode, else none (an undeclared fixture is never rewired)', () => {
		const rule = { element: 'rule', fixture: 'by-scc' };
		expect(harnessCompendiumModeFor([rule])).toBe('fixtures');
		expect(harnessCompendiumModeFor([rule, { element: 'condition', fixture: 'by-scc' }])).toBe('fixtures');
		expect(harnessCompendiumModeFor([rule, { element: 'feature', fixture: 'default' }])).toBe('none');
		expect(harnessCompendiumModeFor([])).toBe('none');
		// A fixture name an element lacks falls back to its default (mountOne does the same).
		expect(harnessCompendiumModeFor([{ element: 'feature', fixture: 'by-scc' }])).toBe('none');
	});

	test('anchors-only wires the resolver without the index (the SC-469 not-installed seam)', async () => {
		const { deps, container } = await render('rule', 'by-scc', 'anchors-only');
		expect(deps.sccAnchors).toBeDefined();
		expect(deps.compendium).toBeUndefined();
		expect(container.querySelector('.dse-error-card, .dse-ref-notice')).not.toBeNull();
		container.remove();
	});

	test('the seeded set is exactly the two frozen cards', () => {
		expect(Object.keys(HARNESS_COMPENDIUM).sort()).toEqual([
			'condition/bleeding.md',
			'rule/combat/opportunity-attack.md',
		]);
	});

	describe('mountFromParams reports an unresolved reference', () => {
		let mount: HTMLDivElement;
		beforeEach(() => {
			mount = document.createElement('div');
			mount.id = 'mount';
			document.body.appendChild(mount);
		});
		afterEach(() => {
			mount.remove();
		});
		const params = (element: string, fixture: string) => ({
			element,
			fixture,
			theme: 'steel' as const,
			bg: 'dark' as const,
			print: false,
			readonly: false,
			gallery: false,
		});

		test('a resolved by-SCC mount is clean', async () => {
			expect((await mountFromParams(document, params('rule', 'by-scc'))).errors).toEqual([]);
			expect((await mountFromParams(document, params('condition', 'by-scc'))).errors).toEqual([]);
		});

		test('a by-SCC code that is not seeded (web card) fails the mount', async () => {
			const original = HARNESS_COMPENDIUM['rule/combat/opportunity-attack.md'];
			delete HARNESS_COMPENDIUM['rule/combat/opportunity-attack.md'];
			try {
				const { errors } = await mountFromParams(document, params('rule', 'by-scc'));
				expect(errors.join('\n')).toContain('reference notice');
			} finally {
				HARNESS_COMPENDIUM['rule/combat/opportunity-attack.md'] = original;
			}
		});

		test('a by-SCC fixture mounted with no compendium fails the mount', async () => {
			// A stack mixing a declared and an undeclared fixture gets mode none, so the by-SCC
			// card cannot resolve. A typed family (`ds-rule`) with no compendium renders an ERROR
			// card ("Compendium not installed"), which the pre-existing error-card check reports;
			// this does not exercise the `.dse-ref-notice` guard (the web-card test above does).
			const { errors } = await mountFromParams(document, {
				...params('rule', 'by-scc'),
				stack: [
					{ element: 'rule', fixture: 'by-scc' },
					{ element: 'feature', fixture: 'default' },
				],
			});
			expect(errors.length).toBeGreaterThan(0);
			expect(errors.join('\n')).toContain('error card');
		});
	});
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

// SC-202 r6c (option C) — `applyRealPrintCascade`'s own DOM chain, and its selection
// (`matchMedia('print')`, not a query flag — see `mountFromParams`'s own comment for why).
// Same convention `test/dom/framework/print-media.test.ts` already uses for the PLUGIN
// side of this: jsdom's own `matchMedia` never matches anything unless a test installs a
// controllable driver, so a direct `mountFromParams` caller gets the screen-cascade branch
// by default (proven below) and the realprint branch only when this test drives it.
function installMatchMedia(initial = false) {
	const state = { matches: initial };
	const original = (window as unknown as { matchMedia?: unknown }).matchMedia;
	(window as unknown as { matchMedia: unknown }).matchMedia = (media: string) => ({
		media,
		get matches() {
			return media === 'print' ? state.matches : false;
		},
		addEventListener: () => {},
		removeEventListener: () => {},
	});
	return {
		setMatches: (m: boolean) => {
			state.matches = m;
		},
		restore: () => {
			(window as unknown as { matchMedia?: unknown }).matchMedia = original;
		},
	};
}

describe('mountFromParams realprint cascade (SC-202 r6c, option C)', () => {
	let mount: HTMLDivElement;
	let driver: ReturnType<typeof installMatchMedia>;

	beforeEach(() => {
		mount = document.createElement('div');
		mount.id = 'mount';
		document.body.appendChild(mount);
		driver = installMatchMedia(false);
	});

	afterEach(() => {
		// Remove #mount's OWN wrap shell(s) too, not just #mount itself — otherwise an
		// orphaned, now-empty `.print`/`.markdown-preview-view` div is left attached to
		// `document.body` for the NEXT test in this file to trip over.
		document.getElementById('mount')?.closest('[data-dse-harness-wrap]')?.remove();
		mount.remove();
		driver.restore();
	});

	const params = (extra: Partial<Parameters<typeof mountFromParams>[1]> = {}) => ({
		element: 'feature',
		fixture: 'default',
		theme: 'steel' as const,
		bg: 'dark' as const,
		print: false,
		readonly: false,
		gallery: false,
		...extra,
	});

	test('screen media (matchMedia print not matching): the SCREEN single-div wrap, marked "screen"', async () => {
		await mountFromParams(document, params({ sheet: true }));
		const wrap = document.getElementById('mount')!.parentElement!;
		expect(wrap.getAttribute('data-dse-harness-wrap')).toBe('screen');
		expect(wrap.classList.contains('markdown-preview-view')).toBe(true);
		expect(wrap.classList.contains('markdown-rendered')).toBe(true);
		// The screen wrap carries the reading-pane classes real print/export never builds.
		expect(wrap.classList.contains('node-insert-event')).toBe(true);
	});

	test('print media (matchMedia print matching): the .print > .markdown-preview-view nested wrap, marked "realprint"', async () => {
		driver.setMatches(true);
		await mountFromParams(document, params({ bg: 'dark' }));
		const inner = document.getElementById('mount')!.parentElement!;
		const outer = inner.parentElement!;
		expect(outer.className).toBe('print');
		expect(outer.getAttribute('data-dse-harness-wrap')).toBe('realprint');
		expect(inner.classList.contains('markdown-preview-view')).toBe(true);
		expect(inner.classList.contains('markdown-rendered')).toBe(true);
		// Real export's own wrapper carries NONE of the reading-pane-only classes.
		expect(inner.classList.contains('node-insert-event')).toBe(false);
		expect(inner.classList.contains('show-indentation-guide')).toBe(false);
	});

	test('real print forces theme-light UNCONDITIONALLY, even from a dark combo', async () => {
		driver.setMatches(true);
		await mountFromParams(document, params({ bg: 'dark' }));
		expect(document.body.classList.contains('theme-light')).toBe(true);
		expect(document.body.classList.contains('theme-dark')).toBe(false);
	});

	test('switching media between navigations on the same doc never leaves both shapes applied (idempotent unwrap)', async () => {
		await mountFromParams(document, params({ sheet: true })); // screen shape
		driver.setMatches(true);
		await mountFromParams(document, params({ bg: 'dark' })); // realprint shape
		const inner = document.getElementById('mount')!.parentElement!;
		const outer = inner.parentElement!;
		expect(outer.getAttribute('data-dse-harness-wrap')).toBe('realprint');
		// No leftover screen-shape marker anywhere in #mount's OWN ancestor chain (a
		// document-wide query would also catch other tests' own, separately-cleaned-up,
		// orphaned wrap shells — this scopes to the one #mount this test actually drives).
		expect(mount.closest('[data-dse-harness-wrap="screen"]')).toBeNull();
		// …and the reverse direction: back to screen media unwraps the realprint shape.
		driver.setMatches(false);
		await mountFromParams(document, params({ sheet: true }));
		expect(mount.closest('[data-dse-harness-wrap="realprint"]')).toBeNull();
		expect(mount.closest('.print')).toBeNull();
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

// SC-411: the docs GIF runner's two harness hooks. Defaults must stay as they were, or an
// `npm run shots` capture would move: the harness renders with the release gate ON unless
// `experimental=0` asks otherwise, and the host's replaceSource still resolves true.
describe('SC-411 docs GIF harness hooks', () => {
	const base = { element: 'feature', fixture: 'default', theme: 'steel', bg: 'dark', print: false, readonly: false, gallery: false } as const;
	let mount: HTMLDivElement;

	beforeEach(() => {
		mount = document.createElement('div');
		mount.id = 'mount';
		document.body.appendChild(mount);
	});

	afterEach(() => {
		mount.remove();
	});

	test('experimental=0 switches the gate OFF for that mount; absent (the default) leaves it ON', async () => {
		expect(parseParams('?element=feature').experimental).toBeUndefined();
		expect(parseParams('?element=feature&experimental=0').experimental).toBe(false);
		await mountFromParams(document, { ...base, experimental: false });
		expect(isExperimental()).toBe(false);
		await mountFromParams(document, { ...base });
		expect(isExperimental()).toBe(true);
	});

	test('the host counts replaceSource calls on window.__dseHarnessWrites and still resolves true', async () => {
		const host = makeHarnessHost(document.createElement('div'), { readonly: false, language: 'ds-counter' });
		delete window.__dseHarnessWrites;
		await expect(host.replaceSource('a')).resolves.toBe(true);
		await host.replaceSource('b');
		expect(window.__dseHarnessWrites).toBe(2);
	});
});
