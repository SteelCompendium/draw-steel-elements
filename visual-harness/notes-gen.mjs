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

// -- SC-121 Batch 4 harness-coverage notes (catalog D-5 / D-6) ------------------------
// Two extra generated notes the obsidian camera's new specials need. Same convention as
// by-scc-kit.md below: harness-only, git-ignored with the rest of Harness/, and NOT an
// element's authoring example (example.yaml stays the single-sourced D9 example).

// D-5's stamina/Spend Recovery modal capture needs a stamina block that actually HAS
// recoveries: src/elements/stamina-bar/example.yaml deliberately carries none (the
// pre-D7-Task-4 legacy shape), so the modal's Spend Recovery quick action would be
// permanently disabled and the state D-5 names could never be shot. Figures mirror the
// hero example's (max 48 / recoveries 6 of 10) so the modal shows a mid-fight hero.
fs.writeFileSync(
	path.join(outDir, 'modal-stamina.md'),
	`# modal-stamina\n\n\`\`\`ds-stam\nmax_stamina: 48\ncurrent_stamina: 22\ntemp_stamina: 0\nrecoveries_max: 10\nrecoveries: 6\n\`\`\`\n`,
);
console.log('wrote Harness/modal-stamina.md (stamina block WITH recoveries — Spend Recovery modal state)');

// D-6's canvas read-only capture. Canvas TEXT nodes are the quarantined path
// (ctx.sourcePath === '' -> canPersist false -> data-dse-readonly); two interactive
// elements side by side, at fixed coordinates so the capture's clip is deterministic.
const CANVAS_NOTE = 'canvas';
const canvasNode = (id, text, x, width, height) => ({
	id,
	type: 'text',
	text,
	styleAttributes: {},
	x,
	y: 0,
	width,
	height,
});
fs.writeFileSync(
	path.join(outDir, `${CANVAS_NOTE}.canvas`),
	JSON.stringify(
		{
			nodes: [
				canvasNode(
					'dsecanvasstam0001',
					'```ds-stam\nmax_stamina: 48\ncurrent_stamina: 22\nrecoveries_max: 10\nrecoveries: 6\n```',
					0,
					480,
					260,
				),
				canvasNode(
					'dsecanvascond0001',
					'```ds-conditions\nconditions:\n  - key: bleeding\n    effect: save ends\n  - key: slowed\n    effect: EoT\n```',
					520,
					420,
					260,
				),
			],
			edges: [],
			metadata: {},
		},
		null,
		'\t',
	) + '\n',
);
console.log(`wrote Harness/${CANVAS_NOTE}.canvas (2 interactive elements in canvas TEXT nodes — read-only quarantine)`);

// SC-102 fix round (task-3 review M-1) — the corpus-shaped villain statblock, so the REAL
// Obsidian ground truth also renders what steel-etl emits (`cost: Villain Action N` +
// `usage: '-'`, no ability_type) and not only the plugin's hand-authored `ability_type`
// shape. Single-sourced with the browser fixture + the DOM catcher:
// test/fixtures/statblock/villain-corpus.yaml (visual-harness/entry.ts FIXTURES.statblock
// 'villain-corpus'; test/dom/elements/statblock.test.ts). Harness-only, like the notes
// above — statblock's example.yaml stays the single-sourced D9 authoring example.
const VILLAIN_CORPUS_NOTE = 'statblock-villain-corpus';
const villainCorpusBody = fs.readFileSync(
	path.join(repo, 'test', 'fixtures', 'statblock', 'villain-corpus.yaml'),
	'utf8',
);
fs.writeFileSync(
	path.join(outDir, `${VILLAIN_CORPUS_NOTE}.md`),
	`# ${VILLAIN_CORPUS_NOTE}\n\n\`\`\`${aliases['statblock']}\n${villainCorpusBody.replace(/\n?$/, '\n')}\`\`\`\n`,
);
console.log(`wrote Harness/${VILLAIN_CORPUS_NOTE}.md (corpus-shaped villain statblock — cost + dash usage)`);

const BY_SCC_KIT_NOTE = 'by-scc-kit';
fs.writeFileSync(
	path.join(outDir, `${BY_SCC_KIT_NOTE}.md`),
	`# ${BY_SCC_KIT_NOTE}\n\n\`\`\`ds-kit\nscc.v1:mcdm.heroes.v1/kit/panther\n\`\`\`\n`,
);
console.log(`wrote Harness/${BY_SCC_KIT_NOTE}.md (by-SCC ds-kit reference -> nested ds-feature recursion proof)`);
