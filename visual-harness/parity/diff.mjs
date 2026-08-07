// visual-harness/parity/diff.mjs — compare plugin-inventory against the site baseline.
//
// THE CONTRACT (SC-110): exit 0 iff **0 GAPs and 0 undeclared WARNs**.
// A WARN means "the comparison did not happen" — a broken selector, an unparseable
// value, a missing capture. Those used to be printed and ignored, which let a pair go
// silently blind while the gate stayed green. Now the only thing that keeps a finding
// from failing the run is an explicit entry in selector-map.json's `declaredDeferrals`,
// which must name the pair, the rule, a workspace FOLLOWUPS number or Linear ticket, and
// a one-line rationale — and which fails the run if it stops matching anything.
//
// All validation + comparison lives in ./compare.cjs (unit-tested by
// test/unit/parity/compare.test.ts). This file is I/O and the exit code.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import parity from './compare.cjs';

const { validateMap, checkBaselineCoverage, compare } = parity;

const dir = path.dirname(fileURLToPath(import.meta.url));
const site = JSON.parse(fs.readFileSync(path.join(dir, 'baseline', 'site-inventory.json'), 'utf8'));
const plug = JSON.parse(fs.readFileSync(path.join(dir, 'plugin-inventory.json'), 'utf8'));
const map = JSON.parse(fs.readFileSync(path.join(dir, 'selector-map.json'), 'utf8'));

const die = (lines) => {
	console.error(`\n${lines.join('\n')}\n`);
	process.exit(1);
};

const mapErrors = validateMap(map);
if (mapErrors.length)
	die(['selector-map.json is not a valid parity contract:', ...mapErrors.map((e) => `  - ${e}`)]);

const staleErrors = checkBaselineCoverage(site, map);
if (staleErrors.length) die(staleErrors);

const { rows, counts, deadDeclarations } = compare({ site, plug, map });

const sect = (sev, title) => {
	const hits = rows.filter((r) => r.sev === sev);
	if (!hits.length) return [];
	return [
		`## ${title} (${hits.length})`,
		'',
		...hits.map(
			(r) =>
				`- **${r.sev}** \`${r.pair.id}\` [${r.scheme}] (${r.pair.site} → ${r.pair.plugin}): ${r.msg}` +
				(r.why ? `\n  - _declared:_ ${r.why}` : ''),
		),
		'',
	];
};

const out = [
	'# Steel parity report',
	'',
	`Site baseline captured: ${site.capturedAt}`,
	`Plugin sampled: ${plug.capturedAt}`,
	'',
	`**${counts.gap} gap(s), ${counts.warn} undeclared warning(s), ${counts.declared} declared deferral(s).**`,
	'',
	'Gate contract: exit 0 iff 0 gaps AND 0 undeclared warnings. A declared deferral is an',
	'explicit entry in selector-map.json `declaredDeferrals` citing its FOLLOWUPS/ticket number.',
	'',
	`Schemes compared: ${parity.SCHEMES.join(', ')}.`,
	'',
	...sect('GAP', 'Gaps — a real difference; fix styles-source.css'),
	...sect('WARN', 'Undeclared warnings — the comparison did not happen; fix the map or the CSS'),
	...sect('DECLARED', 'Declared deferrals — filed, rationale below'),
].join('\n');
fs.writeFileSync(path.join(dir, 'parity-report.md'), out);
console.log(out);

if (deadDeclarations.length)
	die([
		'DEAD DECLARATION(S): selector-map.json declares deferrals that matched NOTHING in this run.',
		'The finding they excuse is gone (fixed, renamed, or the pair changed). Delete them:',
		...deadDeclarations.map((d) => `  - ${d.pair}:${d.rule}${d.scheme ? `[${d.scheme}]` : ''} — ${d.why}`),
	]);

if (counts.gap || counts.warn)
	die([
		`parity FAILED: ${counts.gap} gap(s), ${counts.warn} undeclared warning(s). See parity-report.md.`,
		'Close a gap by fixing styles-source.css — never by deleting a pair, loosening a tolerance,',
		'or adding a declaredDeferral for something CSS can fix.',
	]);

process.exit(0);
