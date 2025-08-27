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
 * Validates YAML data against a YAML schema
 * Parses both the YAML data and YAML schema first, then validates
 */
export function validateYamlWithYamlSchema(yamlData: any, yamlSchema: string): ValidationResult {
    try {
        const schema = parseYaml(yamlSchema);
        const data = parseYaml(yamlData);
        return validateJsonSchema(data, schema);
    } catch (error: any) {
        return {
            valid: false,
            errors: [{
                message: `YAML parsing error: ${error.message}`,
                path: 'schema',
                value: error.message.includes('schema') ? yamlSchema : yamlData
            }]
        };
    }
}

/**
 * Validates JSON data against a YAML schema
 * Parses the YAML schema first, then validates JSON data against it
 */
export function validateJsonWithYamlSchema(data: any, yamlSchema: string): ValidationResult {
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

/**
 * Validates JSON data against a JSON schema
 * Parses both the JSON data and JSON schema first, then validates
 */
export function validateJsonWithJsonSchema(jsonData: string, jsonSchema: string): ValidationResult {
    try {
        const schema = JSON.parse(jsonSchema);
        const data = JSON.parse(jsonData);
        return validateJsonSchema(data, schema);
    } catch (error: any) {
        return {
            valid: false,
            errors: [{
                message: `JSON parsing error: ${error.message}`,
                path: 'schema',
                value: error.message.includes('schema') ? jsonSchema : jsonData
            }]
        };
    }
}

/**
 * Validates YAML data against a JSON schema
 * Parses YAML data and JSON schema first, then validates
 */
export function validateYamlWithJsonSchema(yamlData: string, jsonSchema: string): ValidationResult {
    try {
        const schema = JSON.parse(jsonSchema);
        const data = parseYaml(yamlData);
        return validateJsonSchema(data, schema);
    } catch (error: any) {
        return {
            valid: false,
            errors: [{
                message: `Parsing error: ${error.message}`,
                path: 'schema',
                value: error.message.includes('JSON') ? jsonSchema : yamlData
            }]
        };
    }
}

/**
 * Universal validation function that automatically detects data and schema formats
 * Supports any combination of YAML/JSON data with YAML/JSON schemas
 */
export function validateDataWithSchema(data: string | object, schema: string | object): ValidationResult {
    try {
        // Handle already parsed objects
        if (typeof data === 'object' && typeof schema === 'object') {
            return validateJsonSchema(data, schema);
        }
        
        // Parse schema if it's a string
        let parsedSchema: object;
        if (typeof schema === 'string') {
            parsedSchema = isJsonString(schema) ? JSON.parse(schema) : parseYaml(schema);
        } else {
            parsedSchema = schema;
        }
        
        // Parse data if it's a string  
        let parsedData: any;
        if (typeof data === 'string') {
            parsedData = isJsonString(data) ? JSON.parse(data) : parseYaml(data);
        } else {
            parsedData = data;
        }
        
        return validateJsonSchema(parsedData, parsedSchema);
        
    } catch (error: any) {
        return {
            valid: false,
            errors: [{
                message: `Auto-parsing error: ${error.message}`,
                path: 'auto-detect',
                value: error.message
            }]
        };
    }
}

/**
 * Helper function to detect if a string is valid JSON
 */
function isJsonString(str: string): boolean {
    try {
        JSON.parse(str);
        return true;
    } catch {
        return false;
    }
}
