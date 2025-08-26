// Type declarations for YAML files loaded as text
declare module '*.yaml' {
  const content: string;
  export default content;
}

declare module '*.yml' {
  const content: string;
  export default content;
}
