// Plan 06 Task 2: initiative resolveRefs — bare-path `statblock` resolution on Framework v2.
//
// resolveInitiativeRefs(model, refs) reproduces the statblock handling Task 1's sync parse
// split off the legacy async parseEncounterData, in three load-bearing phases:
//   1. MERGE (EncounterData.ts:110-128 hero, :211-228 creature): resolve each string
//      `statblock` as a bare path (refs.resolveBarePath) and copy name / max_stamina
//      (legacy `+` coercion) / image ONLY-IF-UNSET; the statblock string stays on the model;
//      resolution errors re-throw the legacy "Failed to resolve … multiple instances …" hint.
//   2. VALIDATE ALL entries (ref-bearing or not) with the exact legacy messages —
//      hero name (:130), hero max_stamina (:133), creature name (:230), creature
//      max_stamina (:240).
//   3. Idempotently RE-APPLY the max_stamina-dependent fills parse skipped when max was
//      statblock-sourced: hero current/temp stamina, per-instance current/temp stamina
//      (regular + captain only), squad minion_stamina_pool (= max × amount).
//
// ORACLE: the UNCHANGED legacy parseEncounterData is run against the SAME fake vault as an
// independent oracle — resolveInitiativeRefs(parse(src)) must deep-equal the legacy
// materialization for ref-bearing input, and error messages must byte-equal legacy's
// wherever legacy behavior is preserved. (Deep-equality, not byte-equality: the merged
// name/max_stamina/image keys are APPENDED to ref-bearing entries where legacy inserted
// them before its own materialized keys — a value-neutral, ref-bearing-only key-order
// divergence; ref-free models must remain BYTE-identical, pinned below.)
//
// A DANGLING ref (file or ds-* block absent) throws from resolveBarePath with the legacy
// resolvePath message, which the merge wraps in the "multiple instances" hint — byte-equal
// to legacy. The ONE non-throwing miss is a ds-* block that parses to null: legacy
// truth-tested the parsed data and silently skipped the merge, preserved here.
import { parseYaml, App } from '../../mocks/obsidian';
import { parseEncounterData } from '@drawSteelAdmonition/EncounterData';
import type { EncounterData } from '@drawSteelAdmonition/EncounterData';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { createReferenceService } from '../../../src/framework/seams/refs';
import type { ReferenceService } from '../../../src/framework/seams/refs';
import { parse, serialize, minionPoolOf } from '../../../src/elements/initiative/model';
import { resolveInitiativeRefs } from '../../../src/elements/initiative/resolveRefs';
import quickStart from '../../fixtures/initiative/quick-start.yaml';
import squad from '../../fixtures/initiative/squad.yaml';
import statblockRefs from '../../fixtures/initiative/statblock-refs.yaml';

function makeEnv(): { app: App; refs: ReferenceService } {
	const app = new App();
	const refs = createReferenceService(app as any, DEFAULT_SETTINGS);
	return { app, refs };
}

/** Runs the model exactly the way the pipeline will: parse, then the reference stage. */
const parseLikePipeline = (source: string): EncounterData => parse(parseYaml(source), source);
const resolveLikePipeline = (source: string, refs: ReferenceService): Promise<EncounterData> =>
	resolveInitiativeRefs(parseLikePipeline(source), refs);

/** The UNCHANGED legacy materialization on the same vault, as an independent oracle. */
const legacyMaterialize = (source: string, app: App): Promise<EncounterData> =>
	parseEncounterData(source, app as any, DEFAULT_SETTINGS);

const errorMessageOf = async (p: Promise<unknown>): Promise<string> => {
	try {
		await p;
	} catch (e) {
		return (e as Error).message;
	}
	throw new Error('expected the promise to reject');
};

const dsNote = (lines: string[]): string => ['```ds-statblock', ...lines, '```'].join('\n');

/** Target notes for statblock-refs.yaml, spread across all findFile steps. */
function seedStatblockNotes(app: App): void {
	// steps 1-2: root
	app.vault.setFile(
		'Frodo Baggins.md',
		dsNote(['name: Frodo Baggins', 'stamina: "80"', 'image: images/frodo.png']),
	);
	// steps 3-4: compendium dir
	app.vault.setFile(
		'DS Compendium/Samwise Gamgee.md',
		dsNote(['name: Samwise Gamgee', 'stamina: 90', 'image: images/sam.png']),
	);
	// step 5: metadata-cache bare-name lookup — no image on purpose (stays unset)
	app.vault.setFile('Bestiary/Orc Warrior.md', dsNote(['name: Orc Warrior', 'stamina: "40"']));
	app.vault.setFile('Goblin.md', dsNote(['name: Goblin', 'stamina: "4"']));
	app.vault.setFile(
		'Goblin Captain.md',
		dsNote(['name: Goblin Captain', 'stamina: "40"', 'image: images/captain.png']),
	);
}

describe('T-2: statblock merge (only-if-unset, + coercion, statblock preserved)', () => {
	test('ref fixture deep-equals the legacy parseEncounterData materialization on the same vault', async () => {
		const { app, refs } = makeEnv();
		seedStatblockNotes(app);
		const model = await resolveLikePipeline(statblockRefs, refs);
		expect(model).toEqual(await legacyMaterialize(statblockRefs, app));
	});

	test('merge pins: ref-sourced fields fill only-if-unset; explicit local values win', async () => {
		const { app, refs } = makeEnv();
		seedStatblockNotes(app);
		const model = await resolveLikePipeline(statblockRefs, refs);

		const [frodo, sam] = model.heroes;
		// Everything from the ref, with legacy's `+resolved.stamina` string coercion.
		expect(frodo.name).toBe('Frodo Baggins');
		expect(frodo.max_stamina).toBe(80);
		expect(typeof frodo.max_stamina).toBe('number');
		expect(frodo.image).toBe('images/frodo.png');
		// Explicit local name wins; max/image still merged from the ref.
		expect(sam.name).toBe('Sam');
		expect(sam.max_stamina).toBe(90);
		expect(sam.image).toBe('images/sam.png');

		const orc = model.enemy_groups[0].creatures[0];
		expect(orc.name).toBe('Orc Warrior');
		expect(orc.max_stamina).toBe(40);
		expect(orc.image).toBeUndefined(); // ref supplied no image

		const captain = model.enemy_groups[1].creatures[1];
		expect(captain.name).toBe('Goblin Captain');
		expect(captain.max_stamina).toBe(44); // explicit local max wins over ref stamina "40"
		expect(captain.image).toBe('images/captain.png');
	});

	test('statblock strings are preserved on the model (they serialize back into the block)', async () => {
		const { app, refs } = makeEnv();
		seedStatblockNotes(app);
		const model = await resolveLikePipeline(statblockRefs, refs);
		expect(model.heroes.map((h) => h.statblock)).toEqual(['Frodo Baggins', 'Samwise Gamgee']);
		expect(model.enemy_groups[1].creatures.map((c) => c.statblock)).toEqual(['Goblin', 'Goblin Captain']);
		expect(serialize(model)).toContain('statblock: Frodo Baggins');
	});

	test('@ and [[ ]] statblock spellings still resolve (legacy resolveReferences dispatch); oracle-equal', async () => {
		const { app, refs } = makeEnv();
		seedStatblockNotes(app);
		const src = [
			'heroes:',
			'  - statblock: "@Frodo Baggins"',
			'  - statblock: "[[Goblin Captain]]"',
			'enemy_groups: []',
		].join('\n');
		const model = await resolveLikePipeline(src, refs);
		expect(model).toEqual(await legacyMaterialize(src, app));
		expect(model.heroes[0].name).toBe('Frodo Baggins');
		expect(model.heroes[1].max_stamina).toBe(40);
	});
});

describe('T-2: post-merge materialization (the fills parse deferred)', () => {
	test('hero + instance stamina and the minion pool materialize from the MERGED max', async () => {
		const { app, refs } = makeEnv();
		seedStatblockNotes(app);
		const model = await resolveLikePipeline(statblockRefs, refs);

		// Heroes: current ?? max, temp ?? 0 — from the ref-sourced max.
		expect(model.heroes[0]).toMatchObject({ current_stamina: 80, temp_stamina: 0 });
		expect(model.heroes[1]).toMatchObject({ current_stamina: 90, temp_stamina: 0 });

		// Regular creature instances: ids from parse, stamina filled post-merge.
		const orc = model.enemy_groups[0].creatures[0];
		expect(orc.instances!.map((i) => i.id)).toEqual([1, 2, 3, 4]);
		for (const instance of orc.instances!) {
			expect(instance.current_stamina).toBe(40);
			expect(instance.temp_stamina).toBe(0);
		}

		// Squad: pool = merged max × amount (parse's NaN-guard left it unset); minion
		// instances still carry NO per-instance stamina; captain instance uses its
		// explicit max.
		const squadGroup = model.enemy_groups[1];
		expect(squadGroup.minion_stamina_pool).toBe(4 * 5);
		const minion = squadGroup.creatures[0];
		expect(minion.instances).toHaveLength(5);
		expect(minion.instances![0].current_stamina).toBeUndefined();
		expect(minion.instances![0].temp_stamina).toBeUndefined();
		const captain = squadGroup.creatures[1];
		expect(captain.instances![0]).toMatchObject({ id: 1, current_stamina: 44, temp_stamina: 0 });
	});

	test('pre-existing instances of a ref creature: explicit stamina kept, unset filled from merged max (oracle-equal)', async () => {
		const { app, refs } = makeEnv();
		seedStatblockNotes(app);
		const src = [
			'heroes: []',
			'enemy_groups:',
			'  - name: Pack',
			'    creatures:',
			'      - statblock: "Orc Warrior"',
			'        amount: 2',
			'        instances:',
			'          - id: 1',
			'            current_stamina: 7',
			'          - id: 2',
			'malice:',
			'  value: 1',
		].join('\n');
		const model = await resolveLikePipeline(src, refs);
		expect(model).toEqual(await legacyMaterialize(src, app));
		const orc = model.enemy_groups[0].creatures[0];
		expect(orc.instances![0]).toMatchObject({ id: 1, current_stamina: 7, temp_stamina: 0 });
		expect(orc.instances![1]).toMatchObject({ id: 2, current_stamina: 40, temp_stamina: 0 });
	});

	test('ref model round-trips stably: serialize -> parse -> resolve -> serialize is byte-identical', async () => {
		const { app, refs } = makeEnv();
		seedStatblockNotes(app);
		const model = await resolveLikePipeline(statblockRefs, refs);
		const s1 = serialize(model);
		const m2 = await resolveLikePipeline(s1, refs);
		expect(m2).toEqual(model);
		expect(serialize(m2)).toBe(s1);
	});
});

describe('T-2: deferred validations fire with the EXACT legacy messages (ALL entries)', () => {
	test("hero name/max still unset after a merge that couldn't supply them (byte-equal to legacy)", async () => {
		const { app, refs } = makeEnv();
		// Block resolves but supplies no name -> the :130 message, byte-equal to legacy's.
		app.vault.setFile('Nameless.md', dsNote(['stamina: "10"']));
		const noName = 'heroes:\n  - statblock: "Nameless"\nenemy_groups: []';
		expect(await errorMessageOf(resolveLikePipeline(noName, refs))).toBe(
			await errorMessageOf(legacyMaterialize(noName, app)),
		);
		await expect(resolveLikePipeline(noName, refs)).rejects.toThrow(
			"Hero at index 0 is missing the 'name' field.",
		);

		// Block resolves but supplies no stamina -> the :133 message.
		app.vault.setFile('Stub Hero.md', dsNote(['name: Stub Hero']));
		const noMax = 'heroes:\n  - statblock: "Stub Hero"\nenemy_groups: []';
		expect(await errorMessageOf(resolveLikePipeline(noMax, refs))).toBe(
			await errorMessageOf(legacyMaterialize(noMax, app)),
		);
		await expect(resolveLikePipeline(noMax, refs)).rejects.toThrow(
			"Hero 'Stub Hero' is missing or has an invalid 'max_stamina' field.",
		);
	});

	test('creature name/max still unset after the merge (byte-equal to legacy)', async () => {
		const { app, refs } = makeEnv();
		app.vault.setFile('Nameless.md', dsNote(['stamina: "10"']));
		app.vault.setFile('Stub Orc.md', dsNote(['name: Stub Orc']));
		const creatureSrc = (statblock: string) =>
			['heroes: []', 'enemy_groups:', '  - name: G', '    creatures:', `      - statblock: "${statblock}"`, '        amount: 1'].join('\n');

		const noName = creatureSrc('Nameless');
		expect(await errorMessageOf(resolveLikePipeline(noName, refs))).toBe(
			await errorMessageOf(legacyMaterialize(noName, app)),
		);
		await expect(resolveLikePipeline(noName, refs)).rejects.toThrow(
			"Creature at index 0 in group 'G' is missing the 'name' field.",
		);

		const noMax = creatureSrc('Stub Orc');
		expect(await errorMessageOf(resolveLikePipeline(noMax, refs))).toBe(
			await errorMessageOf(legacyMaterialize(noMax, app)),
		);
		await expect(resolveLikePipeline(noMax, refs)).rejects.toThrow(
			"Creature 'Stub Orc' in group 'G' is missing or has an invalid 'max_stamina' field.",
		);
	});

	test('ref-FREE entries are validated too (the deferred checks moved here, byte-equal to legacy)', async () => {
		const { app, refs } = makeEnv();
		const cases = [
			'heroes:\n  - max_stamina: 10\nenemy_groups: []',
			'heroes:\n  - name: Frodo\nenemy_groups: []',
			'heroes: []\nenemy_groups:\n  - name: G\n    creatures:\n      - {max_stamina: 10, amount: 1}',
			'heroes: []\nenemy_groups:\n  - name: G\n    creatures:\n      - {name: Orc, amount: 1}',
		];
		for (const src of cases) {
			expect(await errorMessageOf(resolveLikePipeline(src, refs))).toBe(
				await errorMessageOf(legacyMaterialize(src, app)),
			);
		}
	});

	test('per-entry order matches legacy: name is reported before max_stamina', async () => {
		const { refs } = makeEnv();
		await expect(resolveLikePipeline('heroes:\n  - image: x.png\nenemy_groups: []', refs)).rejects.toThrow(
			"Hero at index 0 is missing the 'name' field.",
		);
	});
});

describe('T-2: resolution errors re-throw the legacy multi-line hint', () => {
	test('hero: malformed block YAML -> wrapped hint byte-equal to legacy', async () => {
		const { app, refs } = makeEnv();
		app.vault.setFile('Bad Note.md', dsNote(['foo: [1,']));
		const src = 'heroes:\n  - statblock: "Bad Note"\nenemy_groups: []';
		const message = await errorMessageOf(resolveLikePipeline(src, refs));
		expect(message).toBe(await errorMessageOf(legacyMaterialize(src, app)));
		expect(message).toContain('Failed to resolve hero statblock reference at index 0 (Bad Note):');
		expect(message).toContain('Failed to parse YAML in Bad Note.md:');
		expect(message).toContain(
			"Are there multiple instances of the 'Bad Note' file in your vault? If so, please specify the full path.",
		);
	});

	test('creature: malformed block YAML -> wrapped hint byte-equal to legacy', async () => {
		const { app, refs } = makeEnv();
		app.vault.setFile('Bad Note.md', dsNote(['foo: [1,']));
		const src = [
			'heroes: []',
			'enemy_groups:',
			'  - name: G',
			'    creatures:',
			'      - statblock: "Bad Note"',
			'        amount: 1',
		].join('\n');
		const message = await errorMessageOf(resolveLikePipeline(src, refs));
		expect(message).toBe(await errorMessageOf(legacyMaterialize(src, app)));
		expect(message).toContain('Failed to resolve creature statblock reference at index 0 (Bad Note):');
	});

	test('DANGLING ref (file not found) -> not-found error wrapped in the hint, byte-equal to legacy', async () => {
		const { app, refs } = makeEnv();
		const src = 'heroes:\n  - statblock: "Nope"\nenemy_groups: []';
		const message = await errorMessageOf(resolveLikePipeline(src, refs));
		expect(message).toBe(await errorMessageOf(legacyMaterialize(src, app)));
		expect(message).toContain('Failed to resolve hero statblock reference at index 0 (Nope):');
		expect(message).toContain('Reference file (Nope) not found in root, DS Compendium, or when searching the cache');
		expect(message).toContain(
			"Are there multiple instances of the 'Nope' file in your vault? If so, please specify the full path.",
		);
	});

	test('DANGLING ref (file exists, no ds-* block) -> no-block error wrapped in the hint, byte-equal to legacy', async () => {
		// Byte-equal as of Task 7 (F2 §4.4): refs.ts's resolveBarePath now shares
		// ReferenceResolver.ts's extractFirstDsBlock (via resolveByPath) instead of
		// carrying its own inlined ds-block error, so the frontmatter-type-aware
		// re-sync hint (added in Task 6) is identical on both paths.
		const { app, refs } = makeEnv();
		app.vault.setFile('Plain Note.md', '# no ds block here');
		const src = 'heroes:\n  - statblock: "Plain Note"\nenemy_groups: []';
		const message = await errorMessageOf(resolveLikePipeline(src, refs));
		expect(message).toBe(await errorMessageOf(legacyMaterialize(src, app)));
		expect(message).toContain('Failed to resolve hero statblock reference at index 0 (Plain Note):');
		expect(message).toContain(
			'No Draw Steel Elements code block (ds-*) found in Plain Note.md. If this is a compendium file, re-sync the compendium to get the latest format.',
		);
	});

	test('block that parses to NULL: merge skipped WITHOUT the hint; validation reports the field (byte-equal to legacy)', async () => {
		const { app, refs } = makeEnv();
		// Legacy truth-tested the parsed data (`if (resolved)`, EncounterData.ts:114): a
		// null-parsing block skips the merge silently, then the normal name validation fires.
		app.vault.setFile('Hollow.md', dsNote(['# comments only, parses to null']));
		const src = 'heroes:\n  - statblock: "Hollow"\nenemy_groups: []';
		const message = await errorMessageOf(resolveLikePipeline(src, refs));
		expect(message).toBe(await errorMessageOf(legacyMaterialize(src, app)));
		expect(message).toBe("Hero at index 0 is missing the 'name' field.");
		expect(message).not.toContain('Failed to resolve');
	});
});

describe('T-2: idempotency — ref-free models are BYTE-unchanged', () => {
	const midEncounter = [
		'heroes:',
		'  - name: Frodo',
		'    max_stamina: 80',
		'    current_stamina: 33',
		'    temp_stamina: 2',
		'    has_taken_turn: true',
		'    conditions:',
		'      - dazed',
		'enemy_groups:',
		'  - name: Pack',
		'    has_taken_turn: true',
		'    creatures:',
		'      - name: Wolf',
		'        max_stamina: 20',
		'        amount: 2',
		'        instances:',
		'          - id: 1',
		'            current_stamina: 7',
		'            conditions:',
		'              - bleeding',
		'          - id: 2',
		'malice:',
		'  value: 3',
	].join('\n');

	test.each([
		['quick-start', quickStart],
		['squad', squad],
		['mid-encounter', midEncounter],
	])('%s: resolveInitiativeRefs returns the same model, serialize-identical', async (_name, source) => {
		const { refs } = makeEnv(); // empty vault — nothing to resolve
		const model = parseLikePipeline(source);
		const before = serialize(model);
		const returned = await resolveInitiativeRefs(model, refs);
		expect(returned).toBe(model); // mutate-in-place contract, same reference back
		expect(serialize(returned)).toBe(before); // every re-applied fill was a no-op
		expect(returned).toEqual(parseLikePipeline(source)); // and deep-unchanged
	});

	test('explicit squad pool and stamina values survive untouched (guards are ??/== null)', async () => {
		const { refs } = makeEnv();
		const model = parseLikePipeline(squad);
		expect(model.enemy_groups[0].minion_stamina_pool).toBe(20);
		await resolveInitiativeRefs(model, refs);
		expect(model.enemy_groups[0].minion_stamina_pool).toBe(20); // NOT re-multiplied
		expect(model.heroes[0].current_stamina).toBe(120);
	});
});

// SC-134 review round 1, M5: pin resolveStatblockRef's routing PREDICATE directly (not
// just its end-to-end behavior), so a future widening of the SCC shape test (e.g. to the
// looser `/^scc/`, dropping the colon requirement) fails loudly here instead of silently
// misrouting a bare filename that happens to start with "scc". Spies on the REAL
// ReferenceService's resolve()/resolveBarePath() (stubbed to a no-op success so nothing
// throws) and asserts which one a given `statblock` string reaches — the dispatch itself,
// not the resolution outcome (that's covered elsewhere: the DOM round-trip tests in
// test/dom/elements/encounter.test.ts, and this file's bare-path/oracle tests above).
describe('T-2 / SC-134 M5: resolveStatblockRef routing predicate — scc:/scc.vN: only', () => {
	function spyRefs(): { refs: ReferenceService; resolveSpy: jest.SpyInstance; bareSpy: jest.SpyInstance } {
		const { refs } = makeEnv();
		const resolveSpy = jest.spyOn(refs, 'resolve').mockResolvedValue({ data: {} });
		const bareSpy = jest.spyOn(refs, 'resolveBarePath').mockResolvedValue({ data: {} });
		return { refs, resolveSpy, bareSpy };
	}

	const creatureSrcWith = (statblock: string): string =>
		[
			'heroes: []',
			'enemy_groups:',
			'  - name: G',
			'    creatures:',
			'      - name: Creature',
			'        max_stamina: 10',
			'        amount: 1',
			`        statblock: "${statblock}"`,
		].join('\n');

	test.each([
		['scc.v1:mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker', 'resolve'],
		['scc:mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker', 'resolve'],
		['scc-notes.md', 'resolveBarePath'],
		['scc.md', 'resolveBarePath'],
		['sccdragon', 'resolveBarePath'],
	])('creature statblock %s dispatches through %s()', async (statblock, which) => {
		const { refs, resolveSpy, bareSpy } = spyRefs();
		await resolveLikePipeline(creatureSrcWith(statblock), refs);
		if (which === 'resolve') {
			expect(resolveSpy).toHaveBeenCalledTimes(1);
			expect(bareSpy).not.toHaveBeenCalled();
		} else {
			expect(bareSpy).toHaveBeenCalledTimes(1);
			expect(resolveSpy).not.toHaveBeenCalled();
		}
	});

	test('hero statblock scc.v1: also dispatches through resolve() (resolveRefs.ts:89 — same routing, hero loop)', async () => {
		const { refs, resolveSpy, bareSpy } = spyRefs();
		const src = [
			'heroes:',
			'  - name: Hero',
			'    max_stamina: 10',
			'    statblock: "scc.v1:mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker"',
			'enemy_groups: []',
		].join('\n');
		await resolveLikePipeline(src, refs);
		expect(resolveSpy).toHaveBeenCalledTimes(1);
		expect(bareSpy).not.toHaveBeenCalled();
	});
});

// SC-195: the statblock merge grows a FOURTH only-if-unset field, `with_captain` — the
// raw "With Captain" grid-cell string, copied at BOTH merge sites (hero + creature) in
// lockstep with name/max_stamina/image. New coverage lives in its own vault (not
// `seedStatblockNotes`) so the existing byte/deep-equal-to-legacy tests above stay
// untouched: the legacy oracle never reads this field at all (that gap is the whole
// point of SC-195), so any note this suite's shared fixtures use must NOT grow it.
describe('T-2 / SC-195: with_captain merges only-if-unset, hero and creature alike', () => {
	const dsNote = (lines: string[]): string => ['```ds-statblock', ...lines, '```'].join('\n');

	test('creature: with_captain merges from the resolved statblock when unset locally', async () => {
		const { app, refs } = makeEnv();
		app.vault.setFile(
			'Hobgoblin Recruit.md',
			dsNote(['name: Hobgoblin Recruit', 'stamina: "9"', 'with_captain: "+4 bonus to Stamina"']),
		);
		const src = [
			'heroes: []',
			'enemy_groups:',
			'  - name: G',
			'    creatures:',
			'      - statblock: "Hobgoblin Recruit"',
			'        amount: 1',
			'malice:',
			'  value: 0',
		].join('\n');
		const model = await resolveLikePipeline(src, refs);
		expect(model.enemy_groups[0].creatures[0].with_captain).toBe('+4 bonus to Stamina');
	});

	test('creature: an explicit local with_captain wins over the resolved one', async () => {
		const { app, refs } = makeEnv();
		app.vault.setFile(
			'Hobgoblin Recruit.md',
			dsNote(['name: Hobgoblin Recruit', 'stamina: "9"', 'with_captain: "+4 bonus to Stamina"']),
		);
		const src = [
			'heroes: []',
			'enemy_groups:',
			'  - name: G',
			'    creatures:',
			'      - statblock: "Hobgoblin Recruit"',
			'        amount: 1',
			'        with_captain: "+2 bonus to Stamina"',
			'malice:',
			'  value: 0',
		].join('\n');
		const model = await resolveLikePipeline(src, refs);
		expect(model.enemy_groups[0].creatures[0].with_captain).toBe('+2 bonus to Stamina');
	});

	test('hero: with_captain merges too (symmetric with the creature loop, even though a hero never reads it back)', async () => {
		const { app, refs } = makeEnv();
		app.vault.setFile(
			'Captain Note.md',
			dsNote(['name: Captain Note', 'stamina: "10"', 'with_captain: "+2 bonus to Stamina"']),
		);
		const src = 'heroes:\n  - statblock: "Captain Note"\nenemy_groups: []';
		const model = await resolveLikePipeline(src, refs);
		expect(model.heroes[0].with_captain).toBe('+2 bonus to Stamina');
	});

	test('a resolved with_captain the parser does not recognize merges as a string but resolves to no Stamina bonus (silent)', async () => {
		const { app, refs } = makeEnv();
		app.vault.setFile(
			'Skirmisher.md',
			dsNote(['name: Skirmisher', 'stamina: "6"', 'with_captain: "Gain an edge on strikes"']),
		);
		const src = [
			'heroes: []',
			'enemy_groups:',
			'  - name: G',
			'    is_squad: true',
			'    creatures:',
			'      - statblock: "Skirmisher"',
			'        amount: 4',
			'        squad_role: minion',
			'malice:',
			'  value: 0',
		].join('\n');
		const model = await resolveLikePipeline(src, refs);
		const minion = model.enemy_groups[0].creatures[0];
		expect(minion.with_captain).toBe('Gain an edge on strikes');
		const { withCaptainStaminaN } = await import('@drawSteelAdmonition/EncounterData');
		expect(withCaptainStaminaN(minion)).toBeUndefined();
	});

	test('a FRESH ref-bearing captained squad bakes the bonus in at pool init (phase 3, post-merge)', async () => {
		const { app, refs } = makeEnv();
		app.vault.setFile(
			'Hobgoblin Recruit.md',
			dsNote(['name: Hobgoblin Recruit', 'stamina: "9"', 'with_captain: "+4 bonus to Stamina"']),
		);
		const src = [
			'heroes: []',
			'enemy_groups:',
			'  - name: G',
			'    is_squad: true',
			'    creatures:',
			'      - statblock: "Hobgoblin Recruit"',
			'        amount: 6',
			'        squad_role: minion',
			'      - name: Captain',
			'        max_stamina: 30',
			'        amount: 1',
			'        squad_role: captain',
			'malice:',
			'  value: 0',
		].join('\n');
		const model = await resolveLikePipeline(src, refs);
		const group = model.enemy_groups[0];
		const minion = group.creatures[0];
		// max_stamina was ONLY known after phase 1's merge, so the pool could only be
		// initialized in phase 3 — and initMinionPool's bonus-aware init still ran.
		expect(minion.max_stamina).toBe(9);
		expect(group.minion_stamina_pool).toBe(78); // (9 + 4) x 6
		expect(minion.minion_stamina_pool_max).toBe(78);
		expect(minion.captain_bonus_active).toBe(true);
	});

	// SC-195 fix round (MEDIUM-1, owner ruling) — this async parse path (the pipeline's
	// real reference stage) must reconcile an orphaned bonus flag too, not only the sync
	// split in model.ts's own phase-3 pass (T-3 in encounter-data.test.ts covers the pure
	// helper; this confirms it is actually WIRED into resolveInitiativeRefs's phase 3).
	test('M-1: a squad with the persisted flag true but NO bound captain at all un-winds through resolveInitiativeRefs too', async () => {
		const { refs } = makeEnv();
		const src = [
			'heroes: []',
			'enemy_groups:',
			'  - name: G',
			'    is_squad: true',
			'    creatures:',
			'      - name: Goblin',
			'        max_stamina: 9',
			'        amount: 6',
			'        squad_role: minion',
			'        with_captain_stamina: 999', // deliberately WRONG — proves the persisted N wins
			'        captain_bonus_n: 4',
			'        captain_bonus_active: true',
			'        minion_stamina_pool: 78',
			'        minion_stamina_pool_max: 78',
			'malice:',
			'  value: 0',
		].join('\n'); // no captain creature in the group at all
		const model = await resolveLikePipeline(src, refs);
		const group = model.enemy_groups[0];
		const minion = group.creatures[0];
		expect(minionPoolOf(group, minion)).toBe(54); // 78 - (4 x 6 alive), the PERSISTED N
		expect(minion.minion_stamina_pool_max).toBe(54);
		expect(minion.captain_bonus_active).toBe(false);
		expect(minion.captain_bonus_n).toBeUndefined();
	});
});
