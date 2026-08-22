// visual-harness/mocks/sc186-build.mjs — bundles the SC-186 design-option mock
// page (sc186-entry.mjs → dist/sc186-mocks.js + .css). Separate from the harness
// build on purpose: nothing here touches entry.ts, the shot manifest, or any
// element render — `npm run shots` output is byte-identical with or without it.
// Usage: node visual-harness/mocks/sc186-build.mjs
import esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

await esbuild.build({
	entryPoints: [path.join(repoRoot, 'visual-harness/mocks/sc186-entry.mjs')],
	bundle: true,
	outfile: path.join(repoRoot, 'visual-harness/dist/sc186-mocks.js'),
	format: 'iife',
	platform: 'browser',
	target: 'es2018',
	logLevel: 'info',
});
