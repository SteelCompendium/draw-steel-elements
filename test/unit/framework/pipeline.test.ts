import { createValidationService } from '../../../src/framework/validation';
import { prepareModel } from '../../../src/framework/pipeline';
import type { ValidationService } from '../../../src/framework/validation';
import type { PrepareModelDeps } from '../../../src/framework/pipeline';
import type { ElementDefinition } from '../../../src/framework/registry';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { App, Plugin } from '../../mocks/obsidian';
import { DEFAULT_SETTINGS } from '@model/Settings';

// D7 Task 10 / review fix round — regression tests for `dataForSchemaValidation`:
// the sidebar's `_dse_anchor` key is excluded from schema validation so
// `additionalProperties: false` schemas don't reject sidebar-anchored blocks, but
// OTHER unknown keys are still rejected (narrowness).
describe('D7 Task 10 (review round 2): anchor-key validation exclusion', () => {
	let validation: ValidationService;
	let deps: PrepareModelDeps;

	beforeEach(() => {
		validation = createValidationService();
		const app = new App();
		const plugin = new Plugin(app);
		const prefs = createPreferenceStore({
			get: async () => undefined,
			set: async () => {},
		});
		const refs = createReferenceService(app as any, DEFAULT_SETTINGS);
		deps = { prefs, refs, validation, sourcePath: 'Test.md' };
	});

	// A minimal schema with additionalProperties:false at the root, matching F1 §5's
	// convention (used by hero, resource, tokens, roll, surges, conditions).
	const restrictiveSchema = {
		$schema: 'https://json-schema.org/draft/2019-09/schema',
		$id: 'https://test.example.com/schemas/test-element-1.0.0',
		type: 'object',
		additionalProperties: false,
		required: ['name'],
		properties: {
			name: { type: 'string' },
		},
	};

	const elementId = 'test-element';
	const ANCHOR_KEY = '_dse_anchor';

	// Helper: a minimal ElementDefinition that accepts the raw data as-is (passthrough
	// parse) so we can test pure schema validation behavior without element-specific logic.
	function makeElementDef(): ElementDefinition<any> {
		return {
			id: elementId,
			name: 'Test Element',
			aliases: ['test-element'],
			shape: 'static',
			schema: JSON.stringify(restrictiveSchema),
			parse: (data: unknown): unknown => data, // passthrough
			createView: () => {
				throw new Error('not needed for this test');
			},
		};
	}

	test('(a) a schema\'d element with additionalProperties:false + _dse_anchor present passes validation', async () => {
		const def = makeElementDef();
		const rawYaml = `name: Test\n${ANCHOR_KEY}: abc123`;

		// prepareModel throws a ValidationResult if schema validation fails. If this
		// resolves without throwing, the validation passed.
		const result = await prepareModel(def, rawYaml, deps);
		// parse saw the full rawData including anchor
		expect(result.model).toEqual(expect.objectContaining({ name: 'Test', [ANCHOR_KEY]: 'abc123' }));
	});

	test('(b) a schema\'d element with additionalProperties:false + different unknown key is still REJECTED', async () => {
		const def = makeElementDef();
		const rawYaml = `name: Test\nbogus_key: should_fail`;

		// prepareModel throws a ValidationResult on schema errors. The catch should see
		// a ValidationResult with the bogus_key error.
		let thrownError: unknown;
		try {
			await prepareModel(def, rawYaml, deps);
		} catch (error) {
			thrownError = error;
		}

		expect(thrownError).toBeDefined();
		expect(thrownError).toHaveProperty('valid', false);
		expect(thrownError).toHaveProperty('errors');
		const errors = (thrownError as any).errors as Array<{ message?: string }>;
		expect(errors).toContainEqual(expect.objectContaining({
			message: expect.stringMatching(/must not have additional properties|additionalProperties/i),
		}));
	});
});
