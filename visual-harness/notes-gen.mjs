#!/usr/bin/env node
// visual-harness/notes-gen.mjs — F5 (Plan 12): FIXTURES → demo-vault Harness notes.
// One note per element: heading + a fenced block (primary alias) with the default fixture
// body verbatim. demo-vault/Harness/ is git-ignored and regenerated every camera run.
// D9 (Plan 15 Task 2): fixture bodies are single-sourced from each element's own
// authoring.example on disk (src/elements/<id>/example.yaml OR, for the D6 display-family
// elements, src/elements/display/<id>/example.yaml — see the two-location probe below),
// not a separate fixtures tree. Plain node (no TS): primary aliases from aliases.json
// (CI-pinned against the registry by aliases.test.ts).
//
// D6 Task 11 also seeds a small real compendium subtree (demo-vault/DS Compendium/,
// git-ignored like Harness/) plus one extra Harness note with a by-SCC ds-kit reference —
// see the "compendium subtree + by-SCC ground-truth note" section below, and
// obsidian-camera.mjs's dedicated recursion capture for why.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const aliases = JSON.parse(fs.readFileSync(path.join(dir, 'aliases.json'), 'utf8'));
const elementsDir = path.join(repo, 'src', 'elements');
const outDir = path.join(repo, 'demo-vault', 'Harness');

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// Two possible homes for an element's example.yaml: flat (src/elements/<id>/) for every
// pre-D6 element, nested (src/elements/display/<id>/) for the 11 D6 displayFamily()/
// genericCard() elements (kit/condition/treasure/ancestry/culture/career/class/title/
// perk/complication/rule) — they share one parent directory (src/elements/display/) whose
// own top level has no example.yaml of its own.
//
// D7 (plan-18) exception: the registered element `id` (aliases.json key, registry identity,
// pinned by aliases.test.ts/fixtures.test.ts) is the canonical name and is NOT always the
// source directory's basename — two hero-suite elements were given longer, spec-faithful
// ids (`heroic-resource`, `hero-tokens`) than their directories (`resource/`, `tokens/`),
// which every production import site (main.ts, view.ts cross-imports, ~10 test files) and
// visual-harness/entry.ts already use verbatim. Renaming the directories to match would
// ripple across all of those; instead this harness-only lookup bridges id -> dirname for
// the known exceptions, same spirit as the flat/nested probe above.
const DIRNAME_OVERRIDES = {
	'heroic-resource': 'resource',
	'hero-tokens': 'tokens',
};
function examplePathFor(id) {
	const dirName = DIRNAME_OVERRIDES[id] ?? id;
	const flat = path.join(elementsDir, dirName, 'example.yaml');
	if (fs.existsSync(flat)) return flat;
	const nested = path.join(elementsDir, 'display', dirName, 'example.yaml');
	if (fs.existsSync(nested)) return nested;
	return null;
}

const ids = Object.keys(aliases).filter((id) => examplePathFor(id) !== null);
for (const id of ids) {
	const alias = aliases[id];
	if (!alias) {
		console.error(`no primary alias for element '${id}' in aliases.json`);
		process.exit(1);
	}
	const body = fs.readFileSync(examplePathFor(id), 'utf8');
	const fenced = body.length ? '```' + alias + '\n' + body.replace(/\n?$/, '\n') + '```\n' : '```' + alias + '\n```\n';
	fs.writeFileSync(path.join(outDir, `${id}.md`), `# ${id}\n\n${fenced}`);
	console.log(`wrote Harness/${id}.md (${alias})`);
}
if (ids.length !== Object.keys(aliases).length) {
	console.error(`element dirs with example.yaml (${ids.length}) != aliases (${Object.keys(aliases).length})`);
	process.exit(1);
}
console.log(`${ids.length} notes generated`);

// -- compendium subtree + by-SCC ground-truth note (D6 Task 11) -----------------------
// The unit-test suite (test/dom/elements/displayFamily.test.ts + _refHarness.ts) proves
// by-SCC hybrid rendering against a MOCKED vault + a stubbed MarkdownRenderer — it cannot
// prove that the nested `ds-feature` code block INSIDE a resolved compendium file's real
// body actually recurses through Obsidian's OWN markdown pipeline into a second, nested
// element card (Task 9 review note: "real recursion deferred to Task 11 obsidian
// verification"). This seeds a few REAL md-dse fixtures (already vetted — identical bytes
// to test/fixtures/md-dse/, which is itself copied verbatim from data-unified) at their
// derived managed-root paths (DEFAULT_SETTINGS.compendiumDestinationDirectory = "DS
// Compendium"; src/refs/SccResolver.ts's sccToFilePath), so a by-SCC `ds-kit` block
// resolves against a REAL vault file whose body embeds a real `ds-feature` block
// (kit/panther.md's "Devastating Rush" signature ability).
const compendiumSeedSrc = path.join(repo, 'test', 'fixtures', 'md-dse');
const compendiumDestRoot = path.join(repo, 'demo-vault', 'DS Compendium');
const COMPENDIUM_SEED_FILES = [
	'kit/panther.md', // required: the by-SCC note below references this; its body embeds
	// a nested ds-feature block (signature ability) — the recursion proof.
	'condition/bleeding.md', // subtree breadth (a second type family alongside kit)
	'rule/combat/turn.md', // subtree breadth (a rule glossary entry)
];
fs.rmSync(compendiumDestRoot, { recursive: true, force: true });
for (const rel of COMPENDIUM_SEED_FILES) {
	const src = path.join(compendiumSeedSrc, rel);
	const dest = path.join(compendiumDestRoot, rel);
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	fs.copyFileSync(src, dest);
}
console.log(`seeded ${COMPENDIUM_SEED_FILES.length} compendium fixture(s) into DS Compendium/`);

const BY_SCC_KIT_NOTE = 'by-scc-kit';
fs.writeFileSync(
	path.join(outDir, `${BY_SCC_KIT_NOTE}.md`),
	`# ${BY_SCC_KIT_NOTE}\n\n\`\`\`ds-kit\nscc.v1:mcdm.heroes.v1/kit/panther\n\`\`\`\n`,
);
console.log(`wrote Harness/${BY_SCC_KIT_NOTE}.md (by-SCC ds-kit reference -> nested ds-feature recursion proof)`);
