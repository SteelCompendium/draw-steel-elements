import type { Config } from 'jest';

// Path aliases mirror tsconfig.json `paths` (+ baseUrl-resolved bare `main`).
// Longest-prefix entries must come before the catch-all `@/`.
//
// T-10 fix: moduleNameMapper is matched in object-key insertion order, first match
// wins (Jest docs: "the order in which the mocks are defined matters"). `.css$` MUST
// come before the `@drawSteelComponents/(.*)$` / catch-all `@/(.*)$` prefix aliases,
// or a CSS import under one of those prefixes would resolve via the prefix alias
// (matched first) instead of the identity-obj-proxy stub.
//
// D1 Task 4 (Plan 03): Vue is gone — the `.vue$` -> vueStub.ts entry that lived here
// (F3 §4.5) is removed along with the stub file.
const aliases: Record<string, string> = {
	// The obsidian npm package is types-only; all runtime goes to the mock.
	'^obsidian$': '<rootDir>/test/mocks/obsidian.ts',
	// main.ts imports ./styles-source.css; identity-obj-proxy is already installed.
	'\\.css$': 'identity-obj-proxy',
	'^@model/(.*)$': '<rootDir>/src/model/$1',
	'^@utils/(.*)$': '<rootDir>/src/utils/$1',
	'^@views/(.*)$': '<rootDir>/src/views/$1',
	'^@drawSteelAdmonition/(.*)$': '<rootDir>/src/drawSteelAdmonition/$1',
	'^@drawSteelComponents/(.*)$': '<rootDir>/src/drawSteelComponents/$1',
	'^@/(.*)$': '<rootDir>/src/$1',
	'^main$': '<rootDir>/main.ts',
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
			setupFiles: ['<rootDir>/test/setup/polyfills.ts'],
		},
		{
			displayName: 'dom',
			testEnvironment: 'jsdom',
			testMatch: ['<rootDir>/test/dom/**/*.test.ts'],
			moduleNameMapper: aliases,
			transform: transform as any,
			setupFiles: ['<rootDir>/test/setup/polyfills.ts', '<rootDir>/test/setup/dom-setup.ts'],
		},
	],
};

export default config;
