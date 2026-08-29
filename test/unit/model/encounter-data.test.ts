import {
	parseEncounterData,
	captainOfSquad,
	minionCreatures,
	minionPoolOf,
	parseWithCaptainStamina,
	withCaptainStaminaN,
	isCaptainDown,
	captainStaminaBonus,
	minionPoolMaxOf,
	initMinionPool,
	applyCaptainBonusTransition,
} from '@drawSteelAdmonition/EncounterData';
import type { Creature, EnemyGroup } from '@drawSteelAdmonition/EncounterData';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App } from '../../mocks/obsidian';
import quickStart from '../../fixtures/initiative/quick-start.yaml';
import squad from '../../fixtures/initiative/squad.yaml';

const parse = (source: string) => parseEncounterData(source, new App() as any, DEFAULT_SETTINGS);

describe('T-1: parseEncounterData — happy path', () => {
	test('heroes get defaults: current_stamina→max, temp→0, turn=false, isHero, [] conditions', async () => {
		const data = await parse(quickStart);
		const frodo = data.heroes[0];
		expect(frodo.name).toBe('Frodo Baggins');
		expect(frodo.max_stamina).toBe(80);
		expect(frodo.current_stamina).toBe(80);
		expect(frodo.temp_stamina).toBe(0);
		expect(frodo.has_taken_turn).toBe(false);
		expect(frodo.isHero).toBe(true);
		expect(frodo.conditions).toEqual([]);
	});

	test('string and object conditions normalize to Condition objects', async () => {
		const data = await parse(squad);
		expect(data.heroes[0].conditions).toEqual([
			{ key: 'grabbed', color: undefined, effect: undefined },
			{ key: 'bleeding', color: 'crimson', effect: undefined },
		]);
	});

	test('SC-186: a hand-authored duration field passes through the legacy hero-condition normalizer', async () => {
		const src = [
			'heroes:',
			'  - name: Frodo',
			'    max_stamina: 80',
			'    conditions:',
			'      - key: bleeding',
			'        duration: save-ends',
			'enemy_groups: []',
			'malice:',
			'  value: 0',
		].join('\n');
		const data = await parse(src);
		expect(data.heroes[0].conditions).toEqual([
			{ key: 'bleeding', color: undefined, effect: undefined, duration: 'save-ends' },
		]);
	});

	test('creature instances auto-created with 1-based ids and full stamina', async () => {
		const data = await parse(quickStart);
		const orc = data.enemy_groups[0].creatures[0];
		expect(orc.isHero).toBe(false);
		expect(orc.instances).toHaveLength(4);
		expect(orc.instances!.map((i) => i.id)).toEqual([1, 2, 3, 4]);
		expect(orc.instances![0]).toMatchObject({ current_stamina: 40, temp_stamina: 0, conditions: [] });
		const troll = data.enemy_groups[0].creatures[1];
		expect(troll.instances).toHaveLength(1);
	});

	test('squad minion pool initializes to max_stamina × amount; minion instances carry no stamina', async () => {
		const data = await parse(squad);
		const group = data.enemy_groups[0];
		expect(group.is_squad).toBe(true);
		expect(group.minion_stamina_pool).toBe(20); // 4 stamina × 5 minions
		const minion = group.creatures[0];
		expect(minion.instances).toHaveLength(5);
		expect(minion.instances![0].current_stamina).toBeUndefined();
		expect(minion.instances![0].conditions).toEqual([]);
		const captain = group.creatures[1];
		expect(captain.instances![0].current_stamina).toBe(40);
	});

	test('missing malice defaults to { value: 0 }; provided malice is kept', async () => {
		expect((await parse(squad)).malice).toEqual({ value: 0 });
		expect((await parse(quickStart)).malice.value).toBe(5);
	});
});

describe('T-2: parseEncounterData — error surface (user-facing message contract)', () => {
	test('non-object input', async () => {
		await expect(parse('just a string')).rejects.toThrow('The input must be a YAML object.');
	});

	test('missing heroes', async () => {
		await expect(parse('enemy_groups: []')).rejects.toThrow(
			"Invalid data: 'heroes' field is missing or is not a list.",
		);
	});

	test('missing enemy_groups', async () => {
		await expect(parse('heroes: []')).rejects.toThrow(
			"Invalid data: 'enemy_groups' field is missing or is not a list.",
		);
	});

	test('hero missing name', async () => {
		await expect(parse('heroes:\n  - max_stamina: 10\nenemy_groups: []')).rejects.toThrow(
			"Hero at index 0 is missing the 'name' field.",
		);
	});

	test('hero missing max_stamina', async () => {
		await expect(parse('heroes:\n  - name: Frodo\nenemy_groups: []')).rejects.toThrow(
			"Hero 'Frodo' is missing or has an invalid 'max_stamina' field.",
		);
	});

	test('invalid condition shape', async () => {
		const yaml = [
			'heroes:',
			'  - name: Frodo',
			'    max_stamina: 10',
			'    conditions:',
			'      - 5',
			'enemy_groups: []',
		].join('\n');
		await expect(parse(yaml)).rejects.toThrow("Invalid condition format for hero 'Frodo'.");
	});

	const squadYaml = (creatures: string) =>
		['heroes: []', 'enemy_groups:', '  - name: Squad', '    is_squad: true', '    creatures:', creatures].join('\n');

	// SC-183 r3 / GH #67 — this used to be "squad with more than two creatures" (a
	// rejection). Supporting several squads in one group IS the issue, so the same input
	// is now the feature: two squads plus a captain parse, and each squad gets its OWN
	// pool. The captain, naming no squad, leads the first (the pre-#67 meaning of an
	// unattached captain, preserved).
	test('GH #67: two minion squads plus a captain in one group parse, with a pool each', async () => {
		const creatures = [
			'      - {name: A, max_stamina: 4, amount: 1, squad_role: minion}',
			'      - {name: B, max_stamina: 4, amount: 3, squad_role: minion}',
			'      - {name: C, max_stamina: 40, amount: 1, squad_role: captain}',
		].join('\n');
		const data = await parse(squadYaml(creatures));
		const [a, b, c] = data.enemy_groups[0].creatures;
		expect(minionPoolOf(data.enemy_groups[0], a)).toBe(4);
		expect(minionPoolOf(data.enemy_groups[0], b)).toBe(12);
		// Neither squad's pool leaked onto the GROUP: with more than one squad the group
		// field stays unset, so nothing can silently share a pool.
		expect(data.enemy_groups[0].minion_stamina_pool).toBeUndefined();
		expect(captainOfSquad(data.enemy_groups[0], a)).toBe(c);
		expect(captainOfSquad(data.enemy_groups[0], b)).toBeUndefined();
	});

	test('squad creature missing squad_role', async () => {
		const creatures = '      - {name: A, max_stamina: 4, amount: 1}';
		await expect(parse(squadYaml(creatures))).rejects.toThrow(
			"Creature 'A' in squad 'Squad' must have a 'squad_role' of 'minion' or 'captain'.",
		);
	});

	test('squad creature with invalid squad_role value', async () => {
		const creatures = '      - {name: A, max_stamina: 4, amount: 1, squad_role: boss}';
		await expect(parse(squadYaml(creatures))).rejects.toThrow(
			"Creature 'A' in squad 'Squad' has an invalid 'squad_role' value.",
		);
	});

	// SC-183 r3 / GH #67 — also inverted: two minion creature types used to be rejected
	// ("can have only one minion creature type"); they are now two squads.
	test('GH #67: two minion creature types are two squads, not an error', async () => {
		const creatures = [
			'      - {name: A, max_stamina: 4, amount: 2, squad_role: minion}',
			'      - {name: B, max_stamina: 4, amount: 2, squad_role: minion}',
		].join('\n');
		const data = await parse(squadYaml(creatures));
		expect(minionCreatures(data.enemy_groups[0]).map((c) => c.name)).toEqual(['A', 'B']);
	});

	test('GH #67: a captain naming a squad that is not in the group is rejected', async () => {
		const creatures = [
			'      - {name: A, max_stamina: 4, amount: 2, squad_role: minion}',
			'      - {name: B, max_stamina: 4, amount: 2, squad_role: minion}',
			'      - {name: C, max_stamina: 40, amount: 1, squad_role: captain, captain_of: Nobody}',
		].join('\n');
		await expect(parse(squadYaml(creatures))).rejects.toThrow(
			"Captain 'C' in squad 'Squad' names a 'captain_of' minion ('Nobody') that is not in this group.",
		);
	});

	test('GH #67: two captains on the SAME squad are still rejected (the rules\u2019 own cap)', async () => {
		const creatures = [
			'      - {name: A, max_stamina: 4, amount: 2, squad_role: minion}',
			'      - {name: C, max_stamina: 40, amount: 1, squad_role: captain}',
			'      - {name: D, max_stamina: 40, amount: 1, squad_role: captain}',
		].join('\n');
		await expect(parse(squadYaml(creatures))).rejects.toThrow(
			"Squad 'Squad' can have at most one captain creature.",
		);
	});

	test("GH #67: 'attached' is a valid squad_role (what a relieved captain becomes)", async () => {
		const creatures = [
			'      - {name: A, max_stamina: 4, amount: 2, squad_role: minion}',
			'      - {name: D, max_stamina: 40, amount: 1, squad_role: attached}',
		].join('\n');
		const data = await parse(squadYaml(creatures));
		expect(data.enemy_groups[0].creatures[1].squad_role).toBe('attached');
	});

	test('squad without any minions', async () => {
		const creatures = '      - {name: Cap, max_stamina: 40, amount: 1, squad_role: captain}';
		await expect(parse(squadYaml(creatures))).rejects.toThrow(
			"Squad 'Squad' must have at least one minion creature.",
		);
	});

	test('non-numeric malice value', async () => {
		const yaml = ['heroes: []', 'enemy_groups: []', 'malice:', '  value: very high'].join('\n');
		await expect(parse(yaml)).rejects.toThrow("Invalid data: 'malice.value' must be a number.");
	});
});

describe('T-3 (SC-195): the "With Captain" Stamina bonus — pure helpers', () => {
	/** A one-squad group: `minion` (with the given `with_captain`/`with_captain_stamina`)
	 *  plus one captain, alive unless `captainAlive` is false. Mirrors the shape
	 *  `parseEncounterData`/the sync split materialize (instances present, isHero set). */
	function makeSquad(opts: {
		withCaptain?: string;
		withCaptainStamina?: number;
		captainAlive?: boolean;
		perMinion?: number;
		amount?: number;
		noCaptain?: boolean;
	} = {}): { group: EnemyGroup; minion: Creature; captain: Creature } {
		const amount = opts.amount ?? 5;
		const minion: Creature = {
			name: 'Goblin',
			max_stamina: opts.perMinion ?? 4,
			amount,
			isHero: false,
			squad_role: 'minion',
			with_captain: opts.withCaptain,
			with_captain_stamina: opts.withCaptainStamina,
			instances: Array.from({ length: amount }, (_, i) => ({ id: i + 1, conditions: [] })),
		};
		const captain: Creature = {
			name: 'Goblin Captain',
			max_stamina: 40,
			amount: 1,
			isHero: false,
			squad_role: 'captain',
			instances: [
				{ id: 1, current_stamina: opts.captainAlive === false ? 0 : 40, temp_stamina: 0, conditions: [] },
			],
		};
		const group: EnemyGroup = {
			name: 'Squad',
			is_squad: true,
			creatures: opts.noCaptain ? [minion] : [minion, captain],
		};
		return { group, minion, captain };
	}

	describe('parseWithCaptainStamina — the anchored corpus-shape parser', () => {
		test.each([
			['+2 bonus to Stamina', 2],
			['+3 bonus to Stamina', 3],
			['+4 bonus to Stamina', 4],
			['+6 bonus to Stamina', 6],
			// case/whitespace-insensitive, per the ticket's exact wording.
			['+4 BONUS TO STAMINA', 4],
			['  +4 bonus to Stamina  ', 4],
			['+4 bonus to stamina', 4],
		])('%s -> %i', (raw, n) => {
			expect(parseWithCaptainStamina(raw)).toBe(n);
		});

		// Every OTHER shape in the corpus (Monsters/Heroes/Summoner's non-Stamina With
		// Captain values) is a silent no-op — undefined, never a throw.
		test.each([
			'-',
			'Gain an edge on strikes',
			'+2 bonus to speed',
			'+5 bonus to ranged distance',
			'+1 damage bonus to strikes',
			'+2 damage bonus to strikes',
			'+3 bonus to speed',
			'+3 damage bonus to strikes',
			'+4 damage bonus to strikes',
			'+2 bonus to melee distance',
			'+4 bonus to speed',
			'+1 bonus to speed',
			'Lightning spread increases by 1 square',
			'Have a double edge on strikes',
			'+4 bonus to ranged distance',
			'+3 bonus to melee distance',
			'+2 bonus to forced movement distance',
			'+1 bonus to strikes',
			'Strike damage +2', // the statblock fixture's own example shape
		])('%s -> undefined (silent no-op)', (raw) => {
			expect(parseWithCaptainStamina(raw)).toBeUndefined();
		});

		test('undefined input -> undefined', () => {
			expect(parseWithCaptainStamina(undefined)).toBeUndefined();
		});

		test('a non-positive N never parses (defensive — not in the real corpus)', () => {
			expect(parseWithCaptainStamina('+0 bonus to Stamina')).toBeUndefined();
		});
	});

	describe('withCaptainStaminaN — explicit override wins over the parsed statblock string', () => {
		test('override present, no statblock string: uses the override', () => {
			const { minion } = makeSquad({ withCaptainStamina: 5 });
			expect(withCaptainStaminaN(minion)).toBe(5);
		});

		test('statblock string present, no override: parses it', () => {
			const { minion } = makeSquad({ withCaptain: '+4 bonus to Stamina' });
			expect(withCaptainStaminaN(minion)).toBe(4);
		});

		test('BOTH present: the explicit YAML override wins', () => {
			const { minion } = makeSquad({ withCaptain: '+4 bonus to Stamina', withCaptainStamina: 2 });
			expect(withCaptainStaminaN(minion)).toBe(2);
		});

		test('neither present, or an unparseable statblock string: undefined', () => {
			expect(withCaptainStaminaN(makeSquad().minion)).toBeUndefined();
			expect(withCaptainStaminaN(makeSquad({ withCaptain: 'Gain an edge on strikes' }).minion)).toBeUndefined();
		});
	});

	describe('isCaptainDown', () => {
		test('every instance at <= 0: down', () => {
			const { captain } = makeSquad({ captainAlive: false });
			expect(isCaptainDown(captain)).toBe(true);
		});

		test('at least one instance above 0: not down', () => {
			const { captain } = makeSquad({ captainAlive: true });
			expect(isCaptainDown(captain)).toBe(false);
		});

		test('no instances materialized yet (parse-time ordering window): treated as ALIVE, not down', () => {
			const captain: Creature = { name: 'Cap', max_stamina: 40, amount: 1, isHero: false, squad_role: 'captain' };
			expect(isCaptainDown(captain)).toBe(false);
		});

		test('an instance with current_stamina still undefined (unfilled mid-parse): treated as ALIVE', () => {
			const captain: Creature = {
				name: 'Cap',
				max_stamina: 40,
				amount: 1,
				isHero: false,
				squad_role: 'captain',
				instances: [{ id: 1, conditions: [] }], // current_stamina intentionally absent
			};
			expect(isCaptainDown(captain)).toBe(false);
		});
	});

	describe('captainStaminaBonus — the gate (no captain / down captain -> 0)', () => {
		test('no captain bound: 0', () => {
			const { group, minion } = makeSquad({ withCaptainStamina: 4, noCaptain: true });
			expect(captainStaminaBonus(group, minion)).toBe(0);
		});

		test('captain bound and alive: N', () => {
			const { group, minion } = makeSquad({ withCaptainStamina: 4, captainAlive: true });
			expect(captainStaminaBonus(group, minion)).toBe(4);
		});

		test('captain bound but down: 0 (down reads as "no captain", Monsters.md "While…")', () => {
			const { group, minion } = makeSquad({ withCaptainStamina: 4, captainAlive: false });
			expect(captainStaminaBonus(group, minion)).toBe(0);
		});

		test.each([2, 3, 4, 6])('N=%i from the corpus resolves through captainStaminaBonus', (n) => {
			const { group, minion } = makeSquad({ withCaptainStamina: n, captainAlive: true });
			expect(captainStaminaBonus(group, minion)).toBe(n);
		});
	});

	describe('minionPoolMaxOf — C1 (original count, never alive; the modal-vs-row divergence fix)', () => {
		test('no persisted max: derives from max_stamina x amount', () => {
			const { minion } = makeSquad({ perMinion: 4, amount: 5 });
			expect(minionPoolMaxOf(minion)).toBe(20);
		});

		test('a persisted max (post-transition) wins over the formula', () => {
			const { minion } = makeSquad({ perMinion: 4, amount: 5 });
			minion.minion_stamina_pool_max = 36;
			expect(minionPoolMaxOf(minion)).toBe(36);
		});

		test('never shrinks when minions die (the formula ignores instance.isDead entirely)', () => {
			const { minion } = makeSquad({ perMinion: 4, amount: 5 });
			minion.instances!.forEach((i) => (i.isDead = true));
			expect(minionPoolMaxOf(minion)).toBe(20); // still amount (5), not alive (0)
		});
	});

	describe('initMinionPool — squad-creation-time init', () => {
		test('no captain: plain max_stamina x amount, no bonus keys materialized', () => {
			const { group, minion } = makeSquad({ withCaptainStamina: 4, noCaptain: true, perMinion: 4, amount: 5 });
			initMinionPool(group, minion);
			expect(minionPoolOf(group, minion)).toBe(20);
			expect(minion.minion_stamina_pool_max).toBeUndefined();
			expect(minion.captain_bonus_active).toBeUndefined();
		});

		test('a live captain: bakes N into BOTH current and max, stamps the flag', () => {
			const { group, minion } = makeSquad({ withCaptainStamina: 4, captainAlive: true, perMinion: 4, amount: 5 });
			initMinionPool(group, minion);
			expect(minionPoolOf(group, minion)).toBe(40); // (4 + 4) x 5
			expect(minion.minion_stamina_pool_max).toBe(40);
			expect(minion.captain_bonus_active).toBe(true);
		});

		test('a DOWN captain at init: no bonus (same as no captain)', () => {
			const { group, minion } = makeSquad({ withCaptainStamina: 4, captainAlive: false, perMinion: 4, amount: 5 });
			initMinionPool(group, minion);
			expect(minionPoolOf(group, minion)).toBe(20);
			expect(minion.captain_bonus_active).toBeUndefined();
		});
	});

	describe('applyCaptainBonusTransition — edge-triggered, N x ALIVE count, clamped at 0', () => {
		test('promote (bonus turns ON): current and max both rise by N x alive', () => {
			// A live, bound captain (as `promoteCaptain` just produced), but the squad's
			// pool is still at its pre-promote (uncaptained) value/flag — exactly the
			// state view.ts's promote handler hands to this function.
			const { group, minion } = makeSquad({ withCaptainStamina: 4, captainAlive: true, perMinion: 9, amount: 6 });
			minion.minion_stamina_pool = 54; // 9 x 6, uncaptained
			minion.captain_bonus_active = false;

			const moved = applyCaptainBonusTransition(group, minion);
			expect(moved).toBe(true);
			expect(minionPoolOf(group, minion)).toBe(78); // 54 + (4 x 6 alive)
			expect(minionPoolMaxOf(minion)).toBe(78);
			expect(minion.captain_bonus_active).toBe(true);
		});

		test('relieve / captain-death (bonus turns OFF): current and max both fall by N x alive', () => {
			const { group, minion } = makeSquad({ withCaptainStamina: 4, captainAlive: false, perMinion: 9, amount: 6 });
			minion.captain_bonus_active = true;
			minion.minion_stamina_pool_max = 78;
			minion.minion_stamina_pool = 78;

			const moved = applyCaptainBonusTransition(group, minion);
			expect(moved).toBe(true);
			expect(minionPoolOf(group, minion)).toBe(54); // 78 - (4 x 6 alive)
			expect(minionPoolMaxOf(minion)).toBe(54);
			expect(minion.captain_bonus_active).toBe(false);
		});

		test('healed-captain re-application: a down captain healed back above 0 (still bound) turns the bonus back ON', () => {
			const { group, minion, captain } = makeSquad({ withCaptainStamina: 4, captainAlive: false, perMinion: 9, amount: 6 });
			minion.captain_bonus_active = true;
			minion.minion_stamina_pool_max = 78;
			minion.minion_stamina_pool = 78;
			applyCaptainBonusTransition(group, minion); // captain-death: down to 54/54, flag false

			captain.instances![0].current_stamina = 5; // healed back above 0, still bound
			const moved = applyCaptainBonusTransition(group, minion);
			expect(moved).toBe(true);
			expect(minionPoolOf(group, minion)).toBe(78); // fully re-applied — no deaths occurred
			expect(minionPoolMaxOf(minion)).toBe(78);
			expect(minion.captain_bonus_active).toBe(true);
		});

		test('promote-then-relieve with an unchanged alive count is a NO-OP net (B1)', () => {
			const { group, minion, captain } = makeSquad({
				withCaptainStamina: 4,
				captainAlive: true,
				perMinion: 9,
				amount: 6,
			});
			minion.minion_stamina_pool = 54; // pre-promote: plain, uncaptained value
			minion.captain_bonus_active = false;

			applyCaptainBonusTransition(group, minion); // "promote": bonus turns on
			expect(minionPoolOf(group, minion)).toBe(78);
			expect(minion.captain_bonus_active).toBe(true);

			// "relieve": the squad no longer has ANY captain bound.
			group.creatures = group.creatures.filter((c) => c !== captain);
			applyCaptainBonusTransition(group, minion);
			expect(minionPoolOf(group, minion)).toBe(54); // net zero — back to the pre-promote value
			expect(minionPoolMaxOf(minion)).toBe(54);
			expect(minion.captain_bonus_active).toBe(false);
		});

		test('clamps current at 0 rather than going negative; max is never clamped', () => {
			const { group, minion } = makeSquad({ withCaptainStamina: 4, captainAlive: false, perMinion: 9, amount: 6 });
			// 5 of 6 already dead, current nearly spent.
			minion.instances!.slice(0, 5).forEach((i) => (i.isDead = true));
			minion.captain_bonus_active = true;
			minion.minion_stamina_pool_max = 78;
			minion.minion_stamina_pool = 1;

			const moved = applyCaptainBonusTransition(group, minion);
			expect(moved).toBe(true);
			// 1 - (4 x 1 alive) would be -3; clamped to 0. Max moves the full -4.
			expect(minionPoolOf(group, minion)).toBe(0);
			expect(minionPoolMaxOf(minion)).toBe(74);
		});

		test('a flag that already matches the live state is a no-op (idempotent re-read)', () => {
			const { group, minion } = makeSquad({ withCaptainStamina: 4, captainAlive: true, perMinion: 9, amount: 6 });
			minion.captain_bonus_active = true;
			minion.minion_stamina_pool_max = 78;
			minion.minion_stamina_pool = 78;
			expect(applyCaptainBonusTransition(group, minion)).toBe(false);
			expect(minionPoolOf(group, minion)).toBe(78);
			expect(minionPoolMaxOf(minion)).toBe(78);
		});
	});
});
