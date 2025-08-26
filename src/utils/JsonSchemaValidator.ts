import Ajv from 'ajv';
import addKeywords from 'ajv-keywords';
import addErrors from 'ajv-errors';
import { parseYaml } from 'obsidian';

export interface ValidationError {
    message: string;
    path: string;
    value?: any;
}

export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
}

/**
 * Generic JSON Schema validator using AJV with keywords support
 * Can be used with any JSON schema for validation
 */
export function validateJsonSchema(data: any, schema: object): ValidationResult {
    const ajv = new Ajv({ allErrors: true });
    addKeywords(ajv); // Add support for additional keywords like 'transform'
    addErrors(ajv);   // Add support for custom error messages
    
    const validate = ajv.compile(schema);
    
    const isValid = validate(data);
    
    if (isValid) {
        return { valid: true, errors: [] };
    }

    const errors: ValidationError[] = [];
    
    if (validate.errors) {
        validate.errors.forEach(error => {
            const path = error.instancePath || error.schemaPath || 'root';
            const message = error.message || 'Unknown validation error';
            
            errors.push({
                message: `${error.keyword}: ${message}`,
                path: path.replace(/^\//, ''), // Remove leading slash
                value: error.data
            });
        });
    }

    return {
        valid: false,
        errors
    };
}

/**
 * Validates data against a YAML schema
 * Parses YAML schema first, then validates data against it
 */
export function validateYamlAsJsonSchema(data: any, yamlSchema: string): ValidationResult {
    try {
        const schema = parseYaml(yamlSchema);
        return validateJsonSchema(data, schema);
    } catch (error: any) {
        return {
            valid: false,
            errors: [{
                message: `YAML schema parsing error: ${error.message}`,
                path: 'schema',
                value: yamlSchema
            }]
        };
    }
}
