import type { Config } from 'jest';

// Path aliases mirror tsconfig.json `paths` (+ baseUrl-resolved bare `main`).
// Longest-prefix entries must come before the catch-all `@/`.
const aliases: Record<string, string> = {
	'^@model/(.*)$': '<rootDir>/src/model/$1',
	'^@utils/(.*)$': '<rootDir>/src/utils/$1',
	'^@views/(.*)$': '<rootDir>/src/views/$1',
	'^@drawSteelAdmonition/(.*)$': '<rootDir>/src/drawSteelAdmonition/$1',
	'^@drawSteelComponents/(.*)$': '<rootDir>/src/drawSteelComponents/$1',
	'^@/(.*)$': '<rootDir>/src/$1',
	'^main$': '<rootDir>/main.ts',
	// Vue SFCs: out of scope until D1 (F3 §4.5) — stub them.
	'\\.vue$': '<rootDir>/test/mocks/vueStub.ts',
	// main.ts imports ./styles-source.css; identity-obj-proxy is already installed.
	'\\.css$': 'identity-obj-proxy',
};

const transform = {
	// diagnostics MUST stay off: the repo's type-check is failing today (F3 TS-1,
	// e.g. `ctx.el` in src/utils/CodeBlocks.ts). CI runs tsc separately.
	'^.+\\.ts$': [
		'ts-jest',
		{
			diagnostics: false,
			tsconfig: {
				module: 'commonjs',
				target: 'ES2018',
				lib: ['ES2018', 'DOM'],
				esModuleInterop: true,
			},
		},
	],
	// .yaml imports are raw text, matching esbuild's yamlLoaderPlugin.
	'^.+\\.ya?ml$': '<rootDir>/test/mocks/rawTextTransformer.js',
} as const;

const config: Config = {
	projects: [
		{
			displayName: 'unit',
			testEnvironment: 'node',
			testMatch: ['<rootDir>/test/unit/**/*.test.ts'],
			moduleNameMapper: aliases,
			transform: transform as any,
		},
		{
			displayName: 'dom',
			testEnvironment: 'jsdom',
			testMatch: ['<rootDir>/test/dom/**/*.test.ts'],
			moduleNameMapper: aliases,
			transform: transform as any,
		},
	],
};

export default config;
