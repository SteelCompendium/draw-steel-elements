// D8 Task 7 (spec §5.2) — project model: parse + byte-stable serialize. ds-project has NO
// legacy predecessor (same convention as encounter/montage, D8 Tasks 4/6), so there is no
// external byte-compat oracle to transcribe against — the contract is self-referential:
// parse only fills defaults (accrued/rolls/current_respite), never reorders a present
// key, so serialize(parse(x)) reproduces x's own bytes whenever x already carries the
// full field set in schema order.
import { parseYaml, stringifyYaml } from '../../mocks/obsidian';
import { parse, serialize, progressPercent, hasPendingBreakthroughRoll, BREAKTHROUGH_BONUS } from '../../../src/elements/project/model';
import type { ProjectModel } from '../../../src/elements/project/model';
import projectExample from '../../../src/elements/project/example.yaml';

const parseLikePipeline = (source: string): ProjectModel => parse(parseYaml(source), source);

describe('T-7: project model parse (spec §5.2 schema)', () => {
	test('parses the shipped example.yaml into the full schema', () => {
		const model = parseLikePipeline(projectExample);
		expect(model.goal_name).toBe('Craft Teleportation Platform');
		expect(model.goal_code).toBe('scc.v1:mcdm.heroes.v1/project/craft-teleportation-platform');
		expect(model.goal_points).toBe(1500);
		expect(model.accrued).toBe(340);
		expect(model.prerequisites).toEqual({
			item: 'planar lodestone',
			source: 'Aetheric Cartography (Old Vaslorian)',
		});
		expect(model.rolls).toEqual([
			{ respite: 1, roll: 14, points: 14 },
			{ respite: 2, roll: 20, points: 34, breakthrough: true },
		]);
		expect(model.current_respite).toBe(2);
		expect(model._dse_anchor).toBe('77aa10');
	});

	test('a minimal block materializes defaults ONLY for accrued(0)/rolls([])/current_respite(1) — goal_name/goal_code/goal_points/prerequisites/_dse_anchor stay OMITTED, never invented', () => {
		const model = parseLikePipeline('goal_name: "Build Airship"');
		expect(model.goal_code).toBeUndefined();
		expect(model.goal_points).toBeUndefined();
		expect(model.prerequisites).toBeUndefined();
		expect(model._dse_anchor).toBeUndefined();
		expect(model.accrued).toBe(0);
		expect(model.rolls).toEqual([]);
		expect(model.current_respite).toBe(1);
		expect(model.goal_name).toBe('Build Airship');

		const out = serialize(model);
		expect(out).not.toContain('goal_code:');
		expect(out).not.toContain('goal_points:');
		expect(out).not.toContain('prerequisites:');
		expect(out).not.toContain('_dse_anchor:');
	});

	test('a present value is never overridden by a default (accrued: 50 stays 50, current_respite: 3 stays 3)', () => {
		const model = parseLikePipeline('accrued: 50\ncurrent_respite: 3');
		expect(model.accrued).toBe(50);
		expect(model.current_respite).toBe(3);
	});
});

describe('T-7: serialize is byte-stable', () => {
	test('parse -> serialize on the shipped example.yaml matches a fresh stringifyYaml of the same parsed data', () => {
		const model = parseLikePipeline(projectExample);
		expect(serialize(model)).toBe(stringifyYaml(parseYaml(projectExample)).trim());
	});

	test('top-level key order is the schema order (goal_name, goal_code, goal_points, accrued, prerequisites, rolls, current_respite, _dse_anchor)', () => {
		const out = serialize(parseLikePipeline(projectExample));
		const topLevelKeys = out
			.split('\n')
			.filter((line) => /^\S/.test(line))
			.map((line) => line.split(':')[0]);
		expect(topLevelKeys).toEqual([
			'goal_name',
			'goal_code',
			'goal_points',
			'accrued',
			'prerequisites',
			'rolls',
			'current_respite',
			'_dse_anchor',
		]);
	});

	test('rolls[] with a breakthrough flag round-trips intact', () => {
		const out = serialize(parseLikePipeline(projectExample));
		expect(out).toContain('breakthrough: true');
		expect(out).toContain('roll: 20');
		expect(out).toContain('points: 34');
	});

	test('prerequisites round-trips intact', () => {
		const out = serialize(parseLikePipeline(projectExample));
		expect(out).toContain('item: planar lodestone');
		expect(out).toContain('source: Aetheric Cartography (Old Vaslorian)');
	});

	test('_dse_anchor round-trips', () => {
		const model = parseLikePipeline(projectExample);
		expect(model._dse_anchor).toBe('77aa10');
		expect(serialize(model)).toContain('_dse_anchor: 77aa10');
	});

	test('output is trimmed (no trailing/leading whitespace), matching every other persisted element', () => {
		const out = serialize(parseLikePipeline(projectExample));
		expect(out).not.toMatch(/\n$/);
		expect(out).not.toMatch(/^\s/);
	});

	test('round-trip stability: parse(serialize(parse(x))) deep-equals parse(x); serialize is stable on pass 2', () => {
		const m1 = parseLikePipeline(projectExample);
		const s1 = serialize(m1);
		const m2 = parseLikePipeline(s1);
		expect(m2).toEqual(m1);
		expect(serialize(m2)).toBe(s1);
	});
});

describe('T-7: progressPercent — accrued/goal_points, clamped, no divide-by-zero', () => {
	test('a normal fraction', () => {
		expect(progressPercent(340, 1500)).toBeCloseTo((340 / 1500) * 100);
	});

	test('undefined goalPoints -> null (never a fake percentage)', () => {
		expect(progressPercent(340, undefined)).toBeNull();
	});

	test('a zero/negative goalPoints -> null (never divide-by-zero)', () => {
		expect(progressPercent(0, 0)).toBeNull();
		expect(progressPercent(0, -10)).toBeNull();
	});

	test('clamps to [0, 100] even when accrued overshoots the goal', () => {
		expect(progressPercent(2000, 1500)).toBe(100);
	});
});

describe('T-7: hasPendingBreakthroughRoll — derived from the log, never a persisted flag', () => {
	const base: ProjectModel = { accrued: 0, rolls: [], current_respite: 1 };

	test('no rolls yet -> false', () => {
		expect(hasPendingBreakthroughRoll(base)).toBe(false);
	});

	test('the LAST roll has breakthrough:true -> true', () => {
		expect(
			hasPendingBreakthroughRoll({
				...base,
				rolls: [{ respite: 1, roll: 14, points: 14 }, { respite: 1, roll: 20, points: 40, breakthrough: true }],
			}),
		).toBe(true);
	});

	test('a subsequent non-breakthrough roll supersedes an earlier breakthrough -> false', () => {
		expect(
			hasPendingBreakthroughRoll({
				...base,
				rolls: [
					{ respite: 1, roll: 20, points: 40, breakthrough: true },
					{ respite: 1, roll: 10, points: 10 },
				],
			}),
		).toBe(false);
	});
});

describe('T-7: BREAKTHROUGH_BONUS — AGENT line 878 (+20 points)', () => {
	test('is 20', () => {
		expect(BREAKTHROUGH_BONUS).toBe(20);
	});
});
