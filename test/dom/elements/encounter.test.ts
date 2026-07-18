// D8 Task 4 (spec §2) — ds-encounter through the REAL ElementPipeline + a REAL
// CompendiumIndex (the D6 _refHarness convention: no stub standing in for resolution
// itself). Proves: live EV resolution via cx.compendium.getStatblock, the OD-2
// configured/unconfigured budget states, the unresolved-row degrade (excluded from EV,
// never silent), and the two OD-5 hand-off actions gated on canPersist.
import { ElementPipeline } from '@/framework/pipeline';
import type { BlockHost, RenderMode } from '@/framework/host/BlockHost';
import { encounterElement } from '@/elements/encounter/definition';
import { budgetTable, bandTable, victoryPayout } from '@/elements/encounter/budget';
import { makeHost, makeCompendiumDeps, loadMdDseFixture } from './_refHarness';
import { styleGuardFindings } from '../kit/styleGuard';
import * as fs from 'fs';
import * as path from 'path';

const GOBLIN_CODE = 'mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker';
const GOBLIN_REL = 'monster/goblin/statblock/goblin-stinker.md';
const UNKNOWN_CODE = 'mcdm.monsters.v1/monster.goblin.statblock/does-not-exist';

/** A read-only variant of _refHarness's makeHost (canPersist: false) — proves the two
 *  hand-off actions are omitted, not merely disabled (F1 §4.4 "no dead-end write
 *  affordance" convention every other persisted element follows). */
function makeReadOnlyHost(): BlockHost & { containerEl: HTMLElement } {
	const containerEl = document.createElement('div');
	return {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: false,
		addChild: (child) => child,
		getBlockInfo: () => ({ language: 'ds-encounter', lineStart: 0, lineEnd: 1 }),
		replaceSource: async () => false,
		blockKey: () => 'Note.md::ds-encounter::0',
	};
}

function encounterBody(overrides: { partyYaml: string; monstersYaml: string; label?: string }): string {
	const lines = [overrides.partyYaml, overrides.monstersYaml];
	if (overrides.label) lines.push(`label: "${overrides.label}"`);
	return lines.join('\n');
}

const CONFIGURED_PARTY = 'party:\n  hero_count: 4\n  hero_level: 3';
const UNCONFIGURED_PARTY = 'party:\n  hero_count: 4\n  hero_level: 99';
const GOBLIN_ROW = `monsters:\n  - code: "scc.v1:${GOBLIN_CODE}"\n    count: 6`;

describe('D8 Task 4: ds-encounter — live EV via CompendiumIndex.getStatblock (spec §2)', () => {
	test('resolves the goblin row live, roster shows name/role/organization/count/EV, summary shows spent EV + a configured band/payout', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, GOBLIN_REL);

		const host = makeHost('ds-encounter');
		await new ElementPipeline(deps).run(encounterElement, encounterBody({ partyYaml: CONFIGURED_PARTY, monstersYaml: GOBLIN_ROW }), host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);

		const row = root.querySelector('.dse-enc__row') as HTMLElement;
		expect(row.classList.contains('dse-enc__row--degraded')).toBe(false);
		const cells = Array.from(row.querySelectorAll('td')).map((td) => td.textContent);
		expect(cells).toEqual(['Goblin Stinker', 'Controller', 'Horde', '6', '18']); // 6 × ev "3"

		const summaryText = (root.querySelector('.dse-enc__summary') as HTMLElement).textContent ?? '';
		expect(summaryText).toContain('Spent EV: 18');

		const budget = budgetTable(4, 3) as number;
		const ratio = 18 / budget;
		const band = bandTable(ratio);
		expect(summaryText).toContain(`Budget: ${budget}`);
		expect(summaryText).toContain(`Ratio: ${ratio.toFixed(2)}`);
		expect(summaryText).toContain(`Difficulty: ${band[0].toUpperCase()}${band.slice(1)}`);
		expect(summaryText).toContain(`On victory: +${victoryPayout(band)}`);
	});

	test('an unconfigured budget cell: spent EV still shows, difficulty read-out withheld with "unset — configure in settings" (OD-2 — tool stays useful)', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, GOBLIN_REL);

		const host = makeHost('ds-encounter');
		await new ElementPipeline(deps).run(encounterElement, encounterBody({ partyYaml: UNCONFIGURED_PARTY, monstersYaml: GOBLIN_ROW }), host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		const summaryText = (root.querySelector('.dse-enc__summary') as HTMLElement).textContent ?? '';
		expect(summaryText).toContain('Spent EV: 18');
		expect(summaryText).toContain('Budget unset — configure in settings.');
		expect(summaryText).not.toContain('Difficulty:');
	});

	test('an unresolvable code shows a visible per-row degrade and is excluded from spent EV (never silent)', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, GOBLIN_REL); // resolvable
		const rows = `monsters:\n  - code: "scc.v1:${GOBLIN_CODE}"\n    count: 6\n  - code: "scc.v1:${UNKNOWN_CODE}"\n    count: 2`;

		const host = makeHost('ds-encounter');
		await new ElementPipeline(deps).run(encounterElement, encounterBody({ partyYaml: CONFIGURED_PARTY, monstersYaml: rows }), host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		const trs = Array.from(root.querySelectorAll('.dse-enc__row'));
		expect(trs).toHaveLength(2);
		const degraded = trs.find((tr) => tr.classList.contains('dse-enc__row--degraded'))!;
		expect(degraded.textContent).toContain(UNKNOWN_CODE);
		expect(degraded.textContent).toMatch(/unresolved/i);

		// EV excludes the unresolved row: only the 6 × ev"3" goblin row counts.
		const summaryText = (root.querySelector('.dse-enc__summary') as HTMLElement).textContent ?? '';
		expect(summaryText).toContain('Spent EV: 18');
	});

	test('no compendium wired at all: every row degrades with a "not installed" message, never a crash', async () => {
		const { deps } = makeCompendiumDeps();
		const bareDeps = { ...deps, compendium: undefined };
		const host = makeHost('ds-encounter');
		await new ElementPipeline(bareDeps).run(encounterElement, encounterBody({ partyYaml: CONFIGURED_PARTY, monstersYaml: GOBLIN_ROW }), host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		const row = root.querySelector('.dse-enc__row') as HTMLElement;
		expect(row.classList.contains('dse-enc__row--degraded')).toBe(true);
		expect(row.textContent).toMatch(/not installed/i);
	});

	test('_computed is rewritten on render (recompute wins) and persisted', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, GOBLIN_REL);

		let written: string | null = null;
		const host: BlockHost & { containerEl: HTMLElement } = {
			...makeHost('ds-encounter'),
			replaceSource: async (s: string) => {
				written = s;
				return true;
			},
		};
		await new ElementPipeline(deps).run(encounterElement, encounterBody({ partyYaml: CONFIGURED_PARTY, monstersYaml: GOBLIN_ROW }), host);

		expect(written).not.toBeNull();
		expect(written as unknown as string).toContain('_computed:');
		expect(written as unknown as string).toContain('spent_ev: 18');
	});
});

describe('D8 Task 4: hand-off actions (OD-5) — exist and gated on canPersist', () => {
	test('both actions render when canPersist', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, GOBLIN_REL);
		const host = makeHost('ds-encounter');
		await new ElementPipeline(deps).run(encounterElement, encounterBody({ partyYaml: CONFIGURED_PARTY, monstersYaml: GOBLIN_ROW }), host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		expect(root.querySelector('[aria-label="Create initiative tracker block"]')).not.toBeNull();
		expect(root.querySelector('[aria-label="Open initiative tracker in sidebar"]')).not.toBeNull();
	});

	test('neither action renders when !canPersist (no dead-end write affordance, F1 §4.4)', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, GOBLIN_REL);
		const host = makeReadOnlyHost();
		await new ElementPipeline(deps).run(encounterElement, encounterBody({ partyYaml: CONFIGURED_PARTY, monstersYaml: GOBLIN_ROW }), host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		expect(root.querySelector('[aria-label="Create initiative tracker block"]')).toBeNull();
		expect(root.querySelector('[aria-label="Open initiative tracker in sidebar"]')).toBeNull();
	});

	test('"Create tracker block" appends a resolvable ds-initiative block to the current note (minion row -> squad shape)', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, GOBLIN_REL);
		// Explicit `squad: minion` override — goblin-stinker's real organization is
		// "Horde", not "Minion" (only some goblins are true Minion-org creatures), so
		// this exercises the row-level override path (spec §2.5: "squad … defaults from
		// resolved role" — an explicit value always wins over the auto-detected default).
		const minionRow = `monsters:\n  - code: "scc.v1:${GOBLIN_CODE}"\n    count: 6\n    squad: minion`;
		vault.setFile('Note.md', `\`\`\`ds-encounter\n${encounterBody({ partyYaml: CONFIGURED_PARTY, monstersYaml: minionRow })}\n\`\`\`\n`);

		const host = makeHost('ds-encounter');
		await new ElementPipeline(deps).run(encounterElement, encounterBody({ partyYaml: CONFIGURED_PARTY, monstersYaml: minionRow }), host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		const button = root.querySelector<HTMLButtonElement>('[aria-label="Create initiative tracker block"]')!;
		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();

		const noteContent = vault.getContent('Note.md') ?? '';
		expect(noteContent).toContain('```ds-initiative');
		expect(noteContent).toContain('statblock: scc.v1:' + GOBLIN_CODE);
		expect(noteContent).toContain('is_squad: true');
	});
});

describe('D8 Task 4: view source hygiene — the ONLY .style access is setProperty("--dse-*", …)', () => {
	test('shared kit style guard', () => {
		const src = fs.readFileSync(path.join(__dirname, '../../../src/elements/encounter/view.ts'), 'utf8');
		expect(styleGuardFindings(src)).toEqual([]);
	});
});
