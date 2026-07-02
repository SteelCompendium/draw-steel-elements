import Ajv2019 from 'ajv/dist/2019';
import { createValidationService } from '../../../src/framework/validation';
import type { ValidationService } from '../../../src/framework/validation';
import componentWrapperSchema from '../../../src/model/schemas/ComponentWrapperSchema.yaml';
import staminaBarSchema from '../../../src/model/schemas/StaminaBarSchema.yaml';
import skillsSchema from '../../../src/model/schemas/SkillsSchema.yaml';

const COMPONENT_WRAPPER_ID = 'https://steelcompendium.io/schemas/component-wrapper-1.0.0';

// F1 §5: plugin-scoped ValidationService. `addDependencySchema` registers shared
// $ref schemas once at load; `validate(elementId, yamlSchema, data)` compiles the
// element schema on first use and caches the compiled validator per elementId.
describe('T-1 (Plan 02): ValidationService (F1 §5)', () => {
	let service: ValidationService;

	beforeEach(() => {
		service = createValidationService();
		// main.ts registers this dependency schema at plugin startup (mirrors
		// JsonSchemaValidator.initializeSchemaRegistry usage in stamina-bar.test.ts);
		// StaminaBarSchema $refs it via allOf.
		service.addDependencySchema(COMPONENT_WRAPPER_ID, componentWrapperSchema);
	});

	test('valid data validates cleanly', () => {
		const result = service.validate('stamina-bar', staminaBarSchema, {
			max_stamina: 20,
			current_stamina: 15,
			temp_stamina: 5,
		});
		expect(result).toEqual({ valid: true, errors: [] });
	});

	test('missing required field returns the real composed errorMessage', () => {
		const result = service.validate('stamina-bar', staminaBarSchema, { current_stamina: 5 });
		expect(result.valid).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
		expect(
			result.errors.some((e) => /max_stamina is required - please specify the maximum stamina value/.test(e.message)),
		).toBe(true);
	});

	test('invalid enum value returns path + composed message', () => {
		const result = service.validate('stamina-bar', staminaBarSchema, { max_stamina: 20, style: 'neon' });
		expect(result.valid).toBe(false);
		const styleError = result.errors.find((e) => e.path === 'style');
		expect(styleError).toBeDefined();
		expect(styleError?.message).toMatch(/must be equal to one of the allowed values/);
	});

	test('$ref through addDependencySchema is enforced (component-wrapper collapsible field)', () => {
		const result = service.validate('stamina-bar', staminaBarSchema, { max_stamina: 20, collapsible: 'yes' });
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => /collapsible must be true or false/.test(e.message))).toBe(true);
	});

	test('without addDependencySchema, the $ref cannot resolve and validate throws', () => {
		const bareService = createValidationService();
		expect(() => bareService.validate('stamina-bar-bare', staminaBarSchema, { max_stamina: 20 })).toThrow();
	});

	test('compile-once: validating the same elementId twice compiles the schema once', () => {
		const compileSpy = jest.spyOn(Ajv2019.prototype, 'compile');
		try {
			const first = service.validate('stamina-bar', staminaBarSchema, { max_stamina: 20 });
			const second = service.validate('stamina-bar', staminaBarSchema, { max_stamina: 30, current_stamina: 10 });
			expect(first.valid).toBe(true);
			expect(second.valid).toBe(true);
			expect(compileSpy).toHaveBeenCalledTimes(1);
		} finally {
			compileSpy.mockRestore();
		}
	});

	test('compile-once is per elementId: a different elementId (different schema) compiles again', () => {
		// Uses a schema with a different $id (Skills) to isolate "does the cache key
		// off elementId" from AJV's own duplicate-$id guard (compiling two distinct
		// parsed objects sharing one $id on the same instance throws in AJV itself).
		const compileSpy = jest.spyOn(Ajv2019.prototype, 'compile');
		try {
			service.validate('stamina-bar', staminaBarSchema, { max_stamina: 20 });
			service.validate('skills', skillsSchema, { skills: ['climb'] });
			expect(compileSpy).toHaveBeenCalledTimes(2);
		} finally {
			compileSpy.mockRestore();
		}
	});
});
