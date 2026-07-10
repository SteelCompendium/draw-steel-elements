// F4 (Plan 11): fixture imports — esbuild loads .md as text; jest via rawTextTransformer.
declare module '*.md' {
	const text: string;
	export default text;
}
