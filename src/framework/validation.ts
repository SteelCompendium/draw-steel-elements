// F1 §5 — ValidationService (plugin-scoped AJV, compiled-and-cached-per-elementId).
//
// This ports the AJV setup from `src/utils/JsonSchemaValidator.ts` (2019 dialect via
// `ajv/dist/2019` + `ajv-keywords` + `ajv-errors`) into a plugin-scoped service:
//   - one AJV instance per ValidationService instance (created in `main.ts` onload,
//     dropped on plugin onunload — no module-global singleton, no manual reset);
//   - `addDependencySchema` registers shared $ref schemas (e.g. component-wrapper)
//     once at load, same as `initializeSchemaRegistry` did for the legacy singleton;
//   - `validate` compiles an element's schema on first use and caches the compiled
//     validator per `elementId`, fixing the recompile-per-call cost of
//     `JsonSchemaValidator.validateJsonSchema` (which built a fresh AJV instance and
//     recompiled on every single validation).
//
// Do NOT modify src/utils/JsonSchemaValidator.ts — it stays live for legacy elements
// until they migrate (Plan 02 migrates no element).
import Ajv2019 from 'ajv/dist/2019';
import addKeywords from 'ajv-keywords';
import addErrors from 'ajv-errors';
import { parseYaml } from 'obsidian';
import type { ValidateFunction } from 'ajv';

type AjvInstance = InstanceType<typeof Ajv2019>;

export interface ValidationError {
	message: string;
	path: string;
	value?: unknown;
}

export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
}

export interface ValidationService {
	/** Register shared $ref dependency schemas (e.g. component-wrapper) once at load. */
	addDependencySchema(id: string, yamlSchema: string): void;
	/**
	 * Compile-on-first-use, cached per element id thereafter (fixes the
	 * recompile-per-validation cost in JsonSchemaValidator.validateJsonSchema).
	 */
	validate(elementId: string, yamlSchema: string, data: unknown): ValidationResult;
}

class AjvValidationService implements ValidationService {
	private readonly ajv: AjvInstance;
	private readonly compiled = new Map<string, ValidateFunction>();

	constructor() {
		this.ajv = new Ajv2019({
			allErrors: true,
			strict: false, // allow modern features, matches legacy JsonSchemaValidator
		});
		addKeywords(this.ajv);
		addErrors(this.ajv);
	}

	addDependencySchema(id: string, yamlSchema: string): void {
		const schema = parseYaml(yamlSchema);
		this.ajv.addSchema(schema, id);
	}

	validate(elementId: string, yamlSchema: string, data: unknown): ValidationResult {
		let validateFn = this.compiled.get(elementId);
		if (!validateFn) {
			const schema = parseYaml(yamlSchema);
			validateFn = this.ajv.compile(schema);
			this.compiled.set(elementId, validateFn);
		}

		const isValid = validateFn(data);
		if (isValid) {
			return { valid: true, errors: [] };
		}

		const errors: ValidationError[] = (validateFn.errors ?? []).map((error) => {
			const path = error.instancePath || error.schemaPath || 'root';
			const message = error.message || 'Unknown validation error';
			return {
				message: `${error.keyword}: ${message}`,
				path: path.replace(/^\//, ''), // remove leading slash, matches legacy formatting
				value: error.data,
			};
		});

		return { valid: false, errors };
	}
}

/** Construct a fresh, plugin-scoped ValidationService. Drop the reference on unload. */
export function createValidationService(): ValidationService {
	return new AjvValidationService();
}
