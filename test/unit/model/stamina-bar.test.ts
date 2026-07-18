import { StaminaBar } from '@model/StaminaBar';
import { Hero } from '@drawSteelAdmonition/EncounterData';
import { stringifyYaml } from '../../mocks/obsidian';
import { initializeSchemaRegistry, resetSchemaRegistry } from '@utils/JsonSchemaValidator';
import componentWrapperSchema from '@model/schemas/ComponentWrapperSchema.yaml';
import basic from '../../fixtures/stamina/basic.yaml';

// main.ts registers this dependency schema at plugin startup; StaminaBarSchema
// $refs it, so the test must register it too.
beforeAll(() => {
	initializeSchemaRegistry([
		{ id: 'https://steelcompendium.io/schemas/component-wrapper-1.0.0', schema: componentWrapperSchema },
	]);
});
afterAll(() => resetSchemaRegistry());

describe('T-6: StaminaBar.parseYaml', () => {
	test('valid input parses with all fields', () => {
		const bar = StaminaBar.parseYaml(basic);
		expect(bar.max_stamina).toBe(20);
		expect(bar.current_stamina).toBe(15);
		expect(bar.temp_stamina).toBe(5);
		expect(bar.height).toBe(1);
		expect(bar.style).toBe('default');
	});

	test('missing max_stamina throws the composed schema error', () => {
		expect(() => StaminaBar.parseYaml('current_stamina: 5')).toThrow(/max_stamina is required/);
		expect(() => StaminaBar.parseYaml('current_stamina: 5')).toThrow(/^Invalid YAML format: /);
	});

	test('non-integer max_stamina throws its custom errorMessage', () => {
		expect(() => StaminaBar.parseYaml('max_stamina: "a lot"')).toThrow(
			/max_stamina must be a whole, positive number/,
		);
	});

	test('invalid style enum is rejected', () => {
		expect(() => StaminaBar.parseYaml('max_stamina: 10\nstyle: neon')).toThrow(/Schema validation failed/);
	});

	// CB-15 (F3 §2.1, "suspected — verify intent"): a standalone bar with
	// current_stamina omitted defaults to 0 (an empty bar) — INCONSISTENT with
	// the initiative tracker's default-to-max (EncounterData.ts:158). Pinned
	// here as today's behavior; if CB-15 is resolved as "default to max",
	// update this expectation in the same commit as the fix.
	test('CB-15 pinned: omitted current_stamina defaults to 0, not max', () => {
		const bar = StaminaBar.parseYaml('max_stamina: 30');
		expect(bar.current_stamina).toBe(0);
		expect(bar.temp_stamina).toBe(0);
		expect(bar.height).toBe(1);
	});
});

// FOLLOWUPS #26: `_dse_anchor` passthrough (D8 spec §1.5) — StaminaBar is one of the
// three class-based persisted models (with Counter/NegotiationData) that previously
// dropped unknown top-level keys on parse -> serialize, so a sidebar-sent block's
// anchor line was lost the first time the block was persisted.
describe('FOLLOWUPS #26: _dse_anchor passthrough', () => {
	test('parse -> mutate -> serialize preserves an existing anchor byte-stable, emitted LAST', () => {
		const bar = StaminaBar.parseYaml(basic + '\n_dse_anchor: 4c19ff');
		expect(bar._dse_anchor).toBe('4c19ff');

		bar.current_stamina = 20;
		const out = stringifyYaml(bar).trim();

		expect(out.endsWith('\n_dse_anchor: 4c19ff')).toBe(true);
	});

	test('no anchor in the source: serialize never materializes the key', () => {
		const bar = StaminaBar.parseYaml(basic);
		expect(bar._dse_anchor).toBeUndefined();
		expect(stringifyYaml(bar).trim()).not.toMatch(/_dse_anchor/);
	});
});

describe('T-6: StaminaBar hero round-trip', () => {
	test('fromHero → mutate → updateHero writes back stamina fields', () => {
		const hero = {
			name: 'Frodo',
			max_stamina: 80,
			current_stamina: 42,
			temp_stamina: 3,
			isHero: true,
			conditions: [],
		} as unknown as Hero;
		const bar = StaminaBar.fromHero(hero);
		expect(bar.max_stamina).toBe(80);
		expect(bar.current_stamina).toBe(42);
		expect(bar.temp_stamina).toBe(3);
		bar.current_stamina = 50;
		bar.temp_stamina = 0;
		bar.updateHero(hero);
		expect(hero.current_stamina).toBe(50);
		expect(hero.temp_stamina).toBe(0);
		expect(hero.max_stamina).toBe(80);
	});
});
