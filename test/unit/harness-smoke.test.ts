// Proves the unit project runs: path aliases resolve and .yaml imports are raw text.
import { DEFAULT_SETTINGS } from '@model/Settings';
import staminaBarSchema from '@model/schemas/StaminaBarSchema.yaml';

describe('harness smoke (unit project)', () => {
	test('tsconfig path aliases resolve at runtime', () => {
		expect(DEFAULT_SETTINGS.compendiumDestinationDirectory).toBe('DS Compendium');
	});

	test('.yaml imports load as raw text (esbuild yamlLoaderPlugin parity)', () => {
		expect(typeof staminaBarSchema).toBe('string');
		expect(staminaBarSchema).toContain('max_stamina is required');
	});
});
