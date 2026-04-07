// JSON Schema interface for better type safety
interface JSONSchema {
  $schema?: string;
  $id?: string;
  title?: string;
  description?: string;
  type?: string | string[];
  properties?: Record<string, any>;
  required?: string[];
  allOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  $ref?: string;
  items?: JSONSchema;
  additionalProperties?: boolean | JSONSchema;
  unevaluatedProperties?: boolean | JSONSchema;
  enum?: any[];
  const?: any;
  default?: any;
  errorMessage?: string | Record<string, any>;
  definitions?: Record<string, JSONSchema>;
  [key: string]: any; // Allow additional schema properties
}

// More specific typing for schema files
declare module '*Schema.yaml' {
  const content: JSONSchema;
  export default content;
}

declare module '*schema.yaml' {
  const content: JSONSchema;
  export default content;
}

// General YAML files as JSON objects
declare module '*.yaml' {
  const content: Record<string, any>;
  export default content;
}

declare module '*.yml' {
  const content: Record<string, any>;
  export default content;
}
