#!/usr/bin/env node
// visual-harness/notes-gen.mjs — F5 (Plan 12): FIXTURES → demo-vault Harness notes.
// One note per element: heading + a fenced block (primary alias) with the default fixture
// body verbatim. demo-vault/Harness/ is git-ignored and regenerated every camera run.
// Plain node (no TS): fixture bodies come from the fixture files themselves; primary
// aliases from aliases.json (CI-pinned against the registry by aliases.test.ts).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const aliases = JSON.parse(fs.readFileSync(path.join(dir, 'aliases.json'), 'utf8'));
const fixturesDir = path.join(dir, 'fixtures');
const outDir = path.join(repo, 'demo-vault', 'Harness');

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const ids = fs.readdirSync(fixturesDir).filter((d) => fs.existsSync(path.join(fixturesDir, d, 'default.md')));
for (const id of ids) {
	const alias = aliases[id];
	if (!alias) {
		console.error(`no primary alias for element '${id}' in aliases.json`);
		process.exit(1);
	}
	const body = fs.readFileSync(path.join(fixturesDir, id, 'default.md'), 'utf8');
	const fenced = body.length ? '```' + alias + '\n' + body.replace(/\n?$/, '\n') + '```\n' : '```' + alias + '\n```\n';
	fs.writeFileSync(path.join(outDir, `${id}.md`), `# ${id}\n\n${fenced}`);
	console.log(`wrote Harness/${id}.md (${alias})`);
}
if (ids.length !== Object.keys(aliases).length) {
	console.error(`fixture dirs (${ids.length}) != aliases (${Object.keys(aliases).length})`);
	process.exit(1);
}
console.log(`${ids.length} notes generated`);
