import Ajv2019 from 'ajv/dist/2019';
import addKeywords from 'ajv-keywords';
import addErrors from 'ajv-errors';
import { parseYaml } from 'obsidian';

// Type alias for convenience
type AjvInstance = InstanceType<typeof Ajv2019>;

export interface ValidationError {
    message: string;
    path: string;
    value?: any;
}

export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
}

// Singleton AJV instance with all schemas registered
let globalAjv: AjvInstance | null = null;
let registeredSchemas: Array<{ id: string, schema: object | string }> = [];

/**
 * Initialize the global AJV instance with all schemas
 * This should be called once during plugin startup
 */
export function initializeSchemaRegistry(schemas: Array<{ id: string, schema: object | string }>): void {
    registeredSchemas = [...schemas]; // Store schemas for later use
}

/**
 * Create a fresh AJV instance with all registered schemas
 */
function createFreshAjvInstance(): AjvInstance {
    const ajv = new Ajv2019({ 
        allErrors: true,
        strict: false // Allow modern features
    });
    addKeywords(ajv);
    addErrors(ajv);
    
    // Register dependency schemas
    for (const { id, schema } of registeredSchemas) {
        try {
            const parsedSchema = typeof schema === 'string' ? parseYaml(schema) : schema;
            ajv.addSchema(parsedSchema, id);
        } catch (error: any) {
            console.warn(`Failed to register schema ${id}:`, error.message);
        }
    }
    
    return ajv;
}

/**
 * Get the global AJV instance (creates a basic one if not initialized)
 */
function getAjvInstance(): AjvInstance {
    if (!globalAjv) {
        globalAjv = createFreshAjvInstance();
    }
    return globalAjv;
}

/**
 * Reset the schema registry (useful for testing or plugin reload)
 */
export function resetSchemaRegistry(): void {
    globalAjv = null;
    registeredSchemas = [];
}

/**
 * Generic JSON Schema validator using AJV with keywords support
 * Creates a fresh AJV instance for each validation to avoid conflicts
 */
export function validateJsonSchema(data: any, schema: object): ValidationResult {
    const ajv = createFreshAjvInstance();
    
    const validate = ajv.compile(schema);
    
    const isValid = validate(data);
    
    if (isValid) {
        return { valid: true, errors: [] };
    }

    const errors: ValidationError[] = [];
    
    if (validate.errors) {
        validate.errors.forEach((error: any) => {
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
            // Try JSON first
            if (isJsonString(schema)) {
                parsedSchema = JSON.parse(schema);
            } else {
                // Assume YAML and parse it
                try {
                    parsedSchema = parseYaml(schema);
                } catch (yamlError: any) {
                    throw new Error(`Failed to parse schema as YAML: ${yamlError.message}`);
                }
            }
            
            // Validate that we got an object
            if (typeof parsedSchema !== 'object' || parsedSchema === null) {
                throw new Error(`Schema must be an object, got ${typeof parsedSchema}`);
            }
        } else {
            parsedSchema = schema;
        }
        
        // Parse data if it's a string  
        let parsedData: any;
        if (typeof data === 'string') {
            if (isJsonString(data)) {
                parsedData = JSON.parse(data);
            } else {
                try {
                    parsedData = parseYaml(data);
                } catch (yamlError: any) {
                    throw new Error(`Failed to parse data as YAML: ${yamlError.message}`);
                }
            }
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

/**
 * Creates schema registration entries for common schemas
 * Call this once during plugin startup to register all schemas
 */
export function createSchemaRegistry() {
    return {
        componentWrapper: {
            id: "https://steelcompendium.io/schemas/component-wrapper-1.0.0",
            // This will be populated in main.ts with the actual schema
        }
    };
}
