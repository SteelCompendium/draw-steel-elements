// F2 Task 1 (§2.1 B1) — SDK 3.x removed Statblock.roles: string[] /
// Statblock.ancestry: string[] in favor of role: string, organization: string,
// keywords: string[]. statblockHeaderParts() (src/elements/statblock/view.ts) is the
// pure, unit-testable extraction of the header-derivation the view's cardHead fill
// and role tint both consume — see StatblockElementView.onMount.
import * as fs from 'fs';
import * as path from 'path';
import { StatblockConfig } from '@model/StatblockConfig';
import { statblockHeaderParts } from '@/elements/statblock/view';
import { roleOf } from '@/elements/roleTint';

const fixture = fs.readFileSync(
	path.join(__dirname, '../../fixtures/statblock/goblin-stinker.yaml'),
	'utf8',
);

describe('SDK 3.x statblock fields (F2 §2.1 B1)', () => {
	test('golden fixture parses with role/organization/keywords', () => {
		const config = StatblockConfig.readYaml(fixture);
		expect(config.statblock.name).toBe('Goblin Stinker');
		expect(config.statblock.level).toBe(1);
		expect(config.statblock.role).toBe('Controller');
		expect(config.statblock.organization).toBe('Horde');
		expect(config.statblock.keywords).toEqual(['Goblin', 'Humanoid']);
		expect(config.statblock.ev).toBe('3');
		expect(config.statblock.features).toHaveLength(3);
	});

	// SC-232 round 8b item 4 (W4): leftEyebrow is now the KIND-NOUN
	// (`statblockKindNoun`, ported from the site), not the keywords line —
	// keywords moved to leftDeck (the same slot feature/ability heads use for
	// provenance, SC-232 W1). This fixture carries no `metadata.scc`, so
	// leftEyebrow falls back to "Monster" (the site's own default).
	test("header parts render the 'Horde Controller' style line", () => {
		const config = StatblockConfig.readYaml(fixture);
		const parts = statblockHeaderParts(config.statblock);
		expect(parts.name).toBe('Goblin Stinker');
		expect(parts.rightEyebrow).toBe('Level 1');
		expect(parts.rightPrimary).toBe('Horde Controller');
		expect(parts.leftEyebrow).toBe('Monster');
		expect(parts.leftDeck).toBe('Goblin, Humanoid');
		expect(parts.rightDeck).toBe('EV 3');
		expect(parts.role).toBe('Controller');
	});

	test('header parts degrade gracefully when fields are absent', () => {
		const parts = statblockHeaderParts(
			StatblockConfig.readYaml('name: Nameless Thing').statblock,
		);
		expect(parts.name).toBe('Nameless Thing');
		expect(parts.rightEyebrow).toBe('Level N/A');
		expect(parts.rightPrimary).toBe('No Role');
		expect(parts.leftEyebrow).toBe('Monster');
		expect(parts.leftDeck).toBe('');
		expect(parts.rightDeck).toBe('EV N/A');
		expect(parts.role).toBeUndefined();
	});

	// SC-232 round 8b item 4 (W4): statblockKindNoun, exercised through
	// statblockHeaderParts's leftEyebrow (the function itself is file-local —
	// same black-box convention every other test in this file already uses).
	describe('leftEyebrow: the kind-noun bucketed from metadata.scc (ported statblockKindNoun)', () => {
		const kindNounFor = (scc: string): string =>
			statblockHeaderParts(
				StatblockConfig.readYaml(`name: X\nmetadata:\n  scc: ${scc}\n`).statblock,
			).leftEyebrow;

		test('a real monster SCC -> "Monster" (human-bandit-chief\'s own code)', () => {
			expect(kindNounFor('mcdm.monsters.v1/monster.human.statblock/human-bandit-chief')).toBe(
				'Monster',
			);
		});
		test('a companion SCC -> "Companion"', () => {
			expect(kindNounFor('mcdm.beastheart.v1/monster.companion.bear/bear')).toBe('Companion');
		});
		test('a retainer SCC -> "Retainer"', () => {
			expect(kindNounFor('mcdm.heroes.v1/monster.retainer.role/some-role')).toBe('Retainer');
		});
		test('a summoner SCC -> "Summon"', () => {
			expect(kindNounFor('mcdm.summoner.v1/monster.summoner.fixture/some-fixture')).toBe(
				'Summon',
			);
		});
		test('a rival SCC -> "Summon"', () => {
			expect(kindNounFor('mcdm.summoner.v1/monster.rival/some-rival')).toBe('Summon');
		});
		test('no metadata.scc at all -> "Monster" (the site\'s own default)', () => {
			expect(statblockHeaderParts(StatblockConfig.readYaml('name: X').statblock).leftEyebrow).toBe(
				'Monster',
			);
		});
	});

	// Review fix (task-1-review.md Critical finding): every real Leader-organization
	// statblock (30/30) and Solo-organization statblock (22/22) in production carries
	// role: "" — the site's own precedent (steel-etl statblock_page.go's
	// buildStatblockIsland: roleKey := role; if roleKey == "" { roleKey = org }) falls
	// back to organization so these ~52 boss/solo creatures still tint. `role` here
	// feeds applyRoleTint directly, so it must carry the same fallback.
	describe('role tint falls back to organization when role is empty (real Leader/Solo shape)', () => {
		test('organization: Leader, role: "" resolves the tint source to "Leader"', () => {
			const parts = statblockHeaderParts(
				StatblockConfig.readYaml('name: Boss\norganization: Leader\nrole: ""').statblock,
			);
			expect(parts.role).toBe('Leader');
			expect(roleOf(parts.role)).toBe('leader');
		});

		test('organization: Solo, role: "" resolves the tint source to "Solo"', () => {
			const parts = statblockHeaderParts(
				StatblockConfig.readYaml('name: Big Bad\norganization: Solo\nrole: ""').statblock,
			);
			expect(parts.role).toBe('Solo');
			expect(roleOf(parts.role)).toBe('solo');
		});

		test('a non-empty role still wins over organization (no fallback needed)', () => {
			const parts = statblockHeaderParts(
				StatblockConfig.readYaml(
					'name: Goblin Stinker\norganization: Horde\nrole: Controller',
				).statblock,
			);
			expect(parts.role).toBe('Controller');
			expect(roleOf(parts.role)).toBe('controller');
		});
	});
});
