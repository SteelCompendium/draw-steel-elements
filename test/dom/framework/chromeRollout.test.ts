// SC-169 ROUND 3 — the ROLLOUT, as an executable table.
//
// Round 2 shipped the framework and put it on three elements. This round opts in every
// card-like element in the plugin, and the thing most likely to rot is not the machinery
// (chrome.test.ts pins that) but the SUMMARIES: thirty-one one-line forms, each written by
// hand against a different model, each easy to break with an innocuous model rename and
// impossible to notice because a wrong summary still renders.
//
// So the summary line of every opted-in element is pinned here, against the SAME harness
// fixture the visual sweep photographs — one source of truth for the picture, the docs table
// and this assertion. A `collapsed: true` prefix is what forces the line to be painted;
// `mountChrome` calls `summary()` lazily, at collapse time, so this exercises the real path a
// reader takes rather than a direct call to the slot.
//
// The grammar the framework owns is `LABEL: Name (detail)` — uppercase label from CSS, the
// colon and parens from mountChrome. Expectations below are the CONCATENATED text content of
// `.dse-chrome-summary__text`, i.e. exactly what a reader sees minus the CSS uppercasing.
import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { ElementPipeline } from '@/framework/pipeline';
import { createElementRegistry } from '@/framework/registry';
import { FIXTURES, makeHarnessDeps, makeHarnessHost, registerHarnessElementDefinitions } from '../../../visual-harness/entry';

const registry = createElementRegistry();
registerHarnessElementDefinitions(registry);

/**
 * [element id, fixture name, the collapsed line].
 *
 * Every element that declares a `chrome` slot AND has a harness fixture appears exactly
 * once — the completeness check at the bottom of this file enforces that, so adding an
 * element without deciding on its summary fails here rather than shipping a blank line.
 */
const SUMMARIES: [id: string, fixture: string, line: string][] = [
	// ---- wave 1: the reference-capable card families -------------------------------
	['statblock', 'default', 'Statblock: Human Bandit Chief'],
	['feature', 'default', 'Feature: Coverage Strike'],
	['featureblock', 'default', 'Featureblock: Angulotl Malice (3)'],
	['kit', 'default', 'Kit: Panther'],
	['condition', 'default', 'Condition: Bleeding'],
	['treasure', 'default', 'Treasure: Color Cloak (Blue)'],
	['ancestry', 'default', 'Ancestry: Human'],
	['culture', 'default', 'Culture: Urban'],
	['career', 'default', 'Career: Politician'],
	['class', 'default', 'Class: Tactician'],
	['title', 'default', 'Title: Back From the Grave'],
	['perk', 'default', 'Perk: Familiar'],
	['complication', 'default', 'Complication: Chosen One'],
	['rule', 'default', 'Rule'],
	// ---- wave 2: the hero suite and the GM trackers ---------------------------------
	['hero', 'default', 'Hero: Torin Stonefist'],
	['stamina-bar', 'default', 'Stamina (15/20)'],
	['conditions', 'default', 'Conditions (3)'],
	['heroic-resource', 'default', 'Resource: Ferocity (4)'],
	['surges', 'default', 'Surges (2)'],
	['hero-tokens', 'default', 'Hero tokens: Session 12 party pool (3)'],
	['skills', 'default', 'Skills (3 selected)'],
	['encounter', 'default', 'Encounter: Ambush at the ford (EV 0)'],
	['montage', 'default', 'Montage: Cross the Ashfall Wastes (round 1 · 0/5)'],
	['project', 'default', 'Project: Craft Teleportation Platform (340/1500)'],
	['party', 'default', 'Party (2 heroes)'],
	['initiative', 'default', 'Initiative (round 1 · 2v1)'],
	['counter', 'default', 'Counter: Health (10/20)'],
	['characteristics', 'default', 'Characteristics (2/1/0/-1/3)'],
	['values-row', 'default', 'Values (3 values)'],
	['negotiation', 'default', 'Negotiation: Convincing Frodo to remember the taste of strawberries (Interest 3 · Patience 3)'],
];

/**
 * `ds-rule` is the one element whose body is RAW MARKDOWN rather than a YAML mapping
 * (genericCard, D6 Task 8 / OD-D6-7), so it cannot carry an authored `collapsed:` line at
 * all — prefixing one turns the body into invalid YAML and the block error-cards. That is a
 * property of the body grammar, not of chrome (a `prefs:` line has always been equally
 * impossible there), and it is the same shape as the known `ds-scc` gap: the reachable
 * collapse is the USER's, which is session-persisted. So this row seeds the session instead
 * — the identical code path `mountChrome` takes when a reader clicks collapse.
 */
const SESSION_COLLAPSE_ONLY = new Set(['rule']);

async function collapsedLine(id: string, fixture: string): Promise<string> {
	const def = registry.get(id)!;
	const { deps } = makeHarnessDeps();
	const container = document.createElement('div');
	document.body.appendChild(container);
	try {
		const host = makeHarnessHost(container, { readonly: false, language: def.aliases[0] });
		const viaSession = SESSION_COLLAPSE_ONLY.has(id);
		if (viaSession) deps.session.set(host.blockKey(), 'chrome.collapsed', true);
		const body = viaSession ? FIXTURES[id][fixture] : `collapsed: true\n${FIXTURES[id][fixture]}`;
		await new ElementPipeline(deps).run(def, body, host);
		const root = container.firstElementChild as HTMLElement;
		expect(root.querySelector('.dse-error-card')).toBeNull();
		expect(root.getAttribute('data-dse-collapsed')).toBe('on');
		return root.querySelector('.dse-chrome-summary__text')?.textContent ?? '';
	} finally {
		container.remove();
	}
}

describe('SC-169 round 3 — every opted-in element collapses to its documented one-liner', () => {
	test.each(SUMMARIES)('%s/%s', async (id, fixture, line) => {
		expect(await collapsedLine(id, fixture)).toBe(line);
	});

	// The anti-rot half. Without this the table above is a list someone can quietly fall
	// behind: a new element opts into chrome, nobody adds a row, and its collapsed form ships
	// unreviewed. `ds-scc` is the one documented absence — it has no harness fixture at all
	// (no compendium to resolve against; see visual-harness/fixtures.test.ts's NO_FIXTURE_IDS),
	// and its summary is covered end to end in sccElement.test.ts against real md-dse files.
	// The rollout's one real visual defect, and the rule that fixes it. Roughly half the newly
	// opted-in families paint their card plate on the ROOT (the shared card-ground selector
	// list in styles-source.css — feature, featureblock, counter and all six GM trackers)
	// rather than on a nested node, and the root is the one node collapse cannot hide. Before
	// the fix their collapsed form was the summary bar nested inside a still-painted,
	// still-padded plate: a double frame on nine elements. jsdom applies no stylesheet, so the
	// rule itself is what gets pinned — the same technique the print-absence gate uses.
	test('a collapsed element is ONE bar: the root stops painting its own plate', () => {
		const css = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');
		const selector =
			`[data-dse-theme='steel']:not([data-dse-print="on"])[data-dse-chrome][data-dse-collapsed='on'] {`;
		const start = css.indexOf(selector);
		expect(start).toBeGreaterThan(-1);
		const block = css.slice(start, css.indexOf('}', start));
		for (const decl of ['padding: 0 !important', 'background: none !important', 'border-color: transparent !important', 'box-shadow: none !important']) {
			expect(block).toContain(decl);
		}
	});

	test('the table covers EVERY chrome-bearing element the harness can mount', () => {
		const covered = new Set(SUMMARIES.map(([id]) => id));
		const expected = registry
			.all()
			.filter((d) => d.chrome !== undefined && d.id !== 'scc')
			.map((d) => d.id)
			.sort();
		expect([...covered].sort()).toEqual(expected);
	});
});
