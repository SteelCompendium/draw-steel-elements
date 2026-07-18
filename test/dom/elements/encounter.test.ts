// D8 Task 4 (spec §2) — ds-encounter through the REAL ElementPipeline + a REAL
// CompendiumIndex (the D6 _refHarness convention: no stub standing in for resolution
// itself). Proves: live EV resolution via cx.compendium.getStatblock, the OD-2
// configured/unconfigured budget states, the unresolved-row degrade (excluded from EV,
// never silent), and the two OD-5 hand-off actions gated on canPersist.
import { Notice, parseYaml } from '../../mocks/obsidian';
import { ElementPipeline } from '@/framework/pipeline';
import type { BlockHost, RenderMode } from '@/framework/host/BlockHost';
import { encounterElement } from '@/elements/encounter/definition';
import { budgetTable, bandTable, victoryPayout } from '@/elements/encounter/budget';
import { setEncounterSidebarHandoff } from '@/elements/encounter/view';
import { makeHost, makeCompendiumDeps, loadMdDseFixture } from './_refHarness';
import { styleGuardFindings } from '../kit/styleGuard';
import * as fs from 'fs';
import * as path from 'path';

const GOBLIN_CODE = 'mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker';
const GOBLIN_REL = 'monster/goblin/statblock/goblin-stinker.md';
const UNKNOWN_CODE = 'mcdm.monsters.v1/monster.goblin.statblock/does-not-exist';
const SKITTERLING_CODE = 'mcdm.monsters.v1/monster.goblin.statblock/skitterling';
const SKITTERLING_REL = 'monster/goblin/statblock/skitterling.md';

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

describe('Task 4 review round 1, Finding 1 (CRITICAL): real-corpus Minion EV — reviewer\'s Skitterling repro', () => {
	test('8 Skitterlings @ "3 for four minions" (real skitterling.md, organization: Minion) spend EV 6, not 24', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, SKITTERLING_REL);
		const rows = `monsters:\n  - code: "scc.v1:${SKITTERLING_CODE}"\n    count: 8`;

		const host = makeHost('ds-encounter');
		await new ElementPipeline(deps).run(encounterElement, encounterBody({ partyYaml: CONFIGURED_PARTY, monstersYaml: rows }), host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		const row = root.querySelector('.dse-enc__row') as HTMLElement;
		expect(row.classList.contains('dse-enc__row--degraded')).toBe(false);
		const cells = Array.from(row.querySelectorAll('td')).map((td) => td.textContent);
		expect(cells).toEqual(['Skitterling', 'Hexer', 'Minion', '8', '6']); // ceil(8/4) × 3 = 6, NOT 8 × 3 = 24

		const summaryText = (root.querySelector('.dse-enc__summary') as HTMLElement).textContent ?? '';
		expect(summaryText).toContain('Spent EV: 6');
	});

	test('non-minion control on the same real corpus: goblin-stinker ("Horde", plain ev "3") still prices per-individual', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, GOBLIN_REL);
		const host = makeHost('ds-encounter');
		await new ElementPipeline(deps).run(encounterElement, encounterBody({ partyYaml: CONFIGURED_PARTY, monstersYaml: GOBLIN_ROW }), host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		const summaryText = (root.querySelector('.dse-enc__summary') as HTMLElement).textContent ?? '';
		expect(summaryText).toContain('Spent EV: 18'); // 6 × 3 — unaffected by the minion fix
	});
});

describe('Task 4 review round 1, Finding 2 (MEDIUM): captain squad hand-off (spec §2.3/2.4)', () => {
	test('an adjacent "squad: captain" row merges with its minion row into ONE enemy_group (is_squad: true, both creatures with squad_role)', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, SKITTERLING_REL);
		loadMdDseFixture(vault, GOBLIN_REL);
		const rows =
			`monsters:\n  - code: "scc.v1:${SKITTERLING_CODE}"\n    count: 8\n` +
			`  - code: "scc.v1:${GOBLIN_CODE}"\n    count: 1\n    squad: captain`;
		vault.setFile('Note.md', `\`\`\`ds-encounter\n${encounterBody({ partyYaml: CONFIGURED_PARTY, monstersYaml: rows })}\n\`\`\`\n`);

		const host = makeHost('ds-encounter');
		await new ElementPipeline(deps).run(encounterElement, encounterBody({ partyYaml: CONFIGURED_PARTY, monstersYaml: rows }), host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		// Roster shows a visible squad-pairing note (not a silent/inert field).
		const noteText = (root.querySelector('.dse-enc__row-note') as HTMLElement)?.textContent ?? '';
		expect(noteText).toMatch(/squad captain/i);
		expect(noteText).toContain('Goblin Stinker');

		const button = root.querySelector<HTMLButtonElement>('[aria-label="Create initiative tracker block"]')!;
		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();

		const noteContent = vault.getContent('Note.md') ?? '';
		const blockMatch = /```ds-initiative\n([\s\S]+?)\n```/.exec(noteContent);
		expect(blockMatch).not.toBeNull();
		const yaml = parseYaml(blockMatch![1]);
		expect(yaml.enemy_groups).toHaveLength(1); // merged, not two separate groups
		const group = yaml.enemy_groups[0];
		expect(group.is_squad).toBe(true);
		expect(group.creatures).toHaveLength(2);
		const minion = group.creatures.find((c: any) => c.squad_role === 'minion');
		const captain = group.creatures.find((c: any) => c.squad_role === 'captain');
		expect(minion).toBeDefined();
		expect(minion.amount).toBe(8);
		expect(minion.statblock).toBe('scc.v1:' + SKITTERLING_CODE);
		expect(captain).toBeDefined();
		expect(captain.amount).toBe(1);
		expect(captain.statblock).toBe('scc.v1:' + GOBLIN_CODE);
	});

	test('an orphan "squad: captain" row (no adjacent minion row) gets a visible roster note and hands off as an ordinary solo monster, never a silent inert squad_role', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, GOBLIN_REL);
		const rows = `monsters:\n  - code: "scc.v1:${GOBLIN_CODE}"\n    count: 1\n    squad: captain`;
		vault.setFile('Note.md', `\`\`\`ds-encounter\n${encounterBody({ partyYaml: CONFIGURED_PARTY, monstersYaml: rows })}\n\`\`\`\n`);

		const host = makeHost('ds-encounter');
		await new ElementPipeline(deps).run(encounterElement, encounterBody({ partyYaml: CONFIGURED_PARTY, monstersYaml: rows }), host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		const noteText = (root.querySelector('.dse-enc__row-note') as HTMLElement)?.textContent ?? '';
		expect(noteText).toMatch(/orphan captain/i);

		const button = root.querySelector<HTMLButtonElement>('[aria-label="Create initiative tracker block"]')!;
		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();

		const noteContent = vault.getContent('Note.md') ?? '';
		const blockMatch = /```ds-initiative\n([\s\S]+?)\n```/.exec(noteContent);
		const yaml = parseYaml(blockMatch![1]);
		expect(yaml.enemy_groups).toHaveLength(1);
		const group = yaml.enemy_groups[0];
		expect(group.is_squad).toBe(false);
		expect(group.creatures).toHaveLength(1);
		expect(group.creatures[0].squad_role).toBeUndefined(); // never an inert field on a non-squad group
	});
});

describe('Task 4 review round 1, Finding 4 (LOW): per-row isolation in resolveRows (Promise.allSettled)', () => {
	test('one row whose getStatblock THROWS degrades ONLY that row — the other row still resolves and counts toward EV', async () => {
		const { vault, deps, index } = makeCompendiumDeps();
		loadMdDseFixture(vault, GOBLIN_REL);
		loadMdDseFixture(vault, SKITTERLING_REL);

		// A Proxy (not object spread — `available` is a prototype GETTER that a plain
		// `{...index}` spread would silently drop, since spread only copies OWN
		// enumerable properties) that forwards everything except `getStatblock`, which
		// throws for exactly one code.
		const throwingIndex: typeof index = new Proxy(index, {
			get(target, prop, receiver) {
				if (prop === 'getStatblock') {
					return async (code: string) => {
						if (code === SKITTERLING_CODE) throw new Error('corrupt frontmatter');
						return target.getStatblock(code);
					};
				}
				return Reflect.get(target, prop, receiver);
			},
		});
		const brokenDeps = { ...deps, compendium: throwingIndex };

		const rows = `monsters:\n  - code: "scc.v1:${GOBLIN_CODE}"\n    count: 6\n  - code: "scc.v1:${SKITTERLING_CODE}"\n    count: 8`;
		const host = makeHost('ds-encounter');
		await new ElementPipeline(brokenDeps).run(encounterElement, encounterBody({ partyYaml: CONFIGURED_PARTY, monstersYaml: rows }), host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		// Never a whole-block crash / generic error card.
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);

		const rowsEls = Array.from(root.querySelectorAll('.dse-enc__row'));
		expect(rowsEls).toHaveLength(2);
		const degraded = rowsEls.find((tr) => tr.classList.contains('dse-enc__row--degraded'))!;
		expect(degraded.textContent).toContain(SKITTERLING_CODE);
		expect(degraded.textContent).toMatch(/failed to resolve/i);
		expect(degraded.textContent).toContain('corrupt frontmatter');

		const resolvedRow = rowsEls.find((tr) => !tr.classList.contains('dse-enc__row--degraded'))!;
		expect(resolvedRow.textContent).toContain('Goblin Stinker');

		// EV excludes the row whose resolution threw; only the goblin row counts.
		const summaryText = (root.querySelector('.dse-enc__summary') as HTMLElement).textContent ?? '';
		expect(summaryText).toContain('Spent EV: 18');
	});
});

describe('Task 4 review round 1, Finding 5 (LOW): try/catch + Notice around the hand-off write paths', () => {
	beforeEach(() => {
		Notice.notices.length = 0;
	});
	afterEach(() => {
		setEncounterSidebarHandoff(null);
	});

	test('a vault.process failure surfaces a Notice instead of an unhandled rejection', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, GOBLIN_REL);
		vault.setFile('Note.md', `\`\`\`ds-encounter\n${encounterBody({ partyYaml: CONFIGURED_PARTY, monstersYaml: GOBLIN_ROW })}\n\`\`\`\n`);
		const host = makeHost('ds-encounter');
		await new ElementPipeline(deps).run(encounterElement, encounterBody({ partyYaml: CONFIGURED_PARTY, monstersYaml: GOBLIN_ROW }), host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		(vault as any).process = async () => {
			throw new Error('disk full');
		};

		const button = root.querySelector<HTMLButtonElement>('[aria-label="Create initiative tracker block"]')!;
		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();

		expect(Notice.notices.some((n) => /failed to write/i.test(n) && n.includes('disk full'))).toBe(true);
	});

	test('a sidebarHandoff rejection surfaces a Notice (tracker block was still created)', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, GOBLIN_REL);
		vault.setFile('Note.md', `\`\`\`ds-encounter\n${encounterBody({ partyYaml: CONFIGURED_PARTY, monstersYaml: GOBLIN_ROW })}\n\`\`\`\n`);
		setEncounterSidebarHandoff(async () => {
			throw new Error('sidebar service unavailable');
		});
		const host = makeHost('ds-encounter');
		await new ElementPipeline(deps).run(encounterElement, encounterBody({ partyYaml: CONFIGURED_PARTY, monstersYaml: GOBLIN_ROW }), host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		const button = root.querySelector<HTMLButtonElement>('[aria-label="Open initiative tracker in sidebar"]')!;
		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();

		expect(Notice.notices.some((n) => /opening it in the sidebar failed/i.test(n) && n.includes('sidebar service unavailable'))).toBe(
			true,
		);
		// The tracker block itself was still written despite the sidebar failure.
		const noteContent = vault.getContent('Note.md') ?? '';
		expect(noteContent).toContain('```ds-initiative');
	});
});

describe('D8 Task 4: view source hygiene — the ONLY .style access is setProperty("--dse-*", …)', () => {
	test('shared kit style guard', () => {
		const src = fs.readFileSync(path.join(__dirname, '../../../src/elements/encounter/view.ts'), 'utf8');
		expect(styleGuardFindings(src)).toEqual([]);
	});
});
