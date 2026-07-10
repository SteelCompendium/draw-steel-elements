// visual-harness/esbuild.mjs — F4 harness build (Plan 11). Separate from the plugin's
// esbuild.config.mjs (which is watch/production oriented and must stay untouched):
// browser platform, bare `obsidian` aliased to the shim, fixtures inlined as text.
// entry.ts's import graph reaches main.ts, whose `import "./styles-source.css"` makes
// esbuild emit dist/harness.css alongside dist/harness.js — the page's plugin styles.
import esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

await esbuild.build({
	entryPoints: [path.join(repoRoot, 'visual-harness/entry.ts')],
	bundle: true,
	outfile: path.join(repoRoot, 'visual-harness/dist/harness.js'),
	format: 'iife',
	platform: 'browser',
	target: 'es2018',
	alias: { obsidian: path.join(repoRoot, 'visual-harness/shim/obsidian.ts') },
	loader: { '.yaml': 'text', '.md': 'text' },
	logLevel: 'info',
});
