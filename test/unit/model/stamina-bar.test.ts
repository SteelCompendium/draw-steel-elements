import { StaminaBar } from '@model/StaminaBar';
import { Hero } from '@drawSteelAdmonition/EncounterData';
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
