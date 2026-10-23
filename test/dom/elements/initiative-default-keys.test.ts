// SC-485 — ds-initiative stops writing default keys the user never wrote.
//
// The SC-466 / SC-482 contract: a key ABSENT from the parsed source whose value at write time still
// equals the default parse filled in is omitted; every authored key is written (even at its default);
// an absent key whose value changed is written (an absent `instances` list WHOLE, SC-482 FU1); key
// ORDER is unchanged, so a fully-authored block serializes byte-identically to the legacy writer.
// Every case below drives the REAL ElementPipeline, a real DOM action and the `replaceSource`
// argument - the exact bytes that would land in the note. Squad pool unit (C22/C23), statblock
// refs (C12, M04: the snapshot is re-taken after resolveRefs) and plugin-built output (M03) included.
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import { DSE_PREF_DESCRIPTORS } from '../../../src/prefs/catalog';
import { createRollService } from '../../../src/framework/roll/service';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin, parseYaml, stringifyYaml } from '../../mocks/obsidian';
import { initiativeElement } from '../../../src/elements/initiative/definition';
import { parse, serialize } from '../../../src/elements/initiative/model';
import type { EncounterData } from '../../../src/elements/initiative/model';
import { resolveInitiativeRefs } from '../../../src/elements/initiative/resolveRefs';
import { parseEncounterData } from '@drawSteelAdmonition/EncounterData';
import squad from '../../fixtures/initiative/squad.yaml';
import statblockRefs from '../../fixtures/initiative/statblock-refs.yaml';

function makeEnv(): { deps: ElementPipelineDeps; app: App } {
	const app = new App();
	app.vault.setFile('Media/token_1.png', '');
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	prefs.describe(DSE_PREF_DESCRIPTORS);
	const theme = createThemeService(prefs, plugin as any);
	return {
		deps: {
			app: app as any,
			plugin: plugin as any,
			settings: DEFAULT_SETTINGS,
			theme,
			prefs,
			refs: createReferenceService(app as any, DEFAULT_SETTINGS),
			validation: createValidationService(),
			session: createSessionStore(),
			roll: createRollService(prefs),
		},
		app,
	};
}

function seedStatblockNotes(app: App): void {
	const dsNote = (lines: string[]): string => ['```ds-statblock', ...lines, '```'].join('\n');
	app.vault.setFile('Frodo Baggins.md', dsNote(['name: Frodo Baggins', 'stamina: "80"', 'image: images/frodo.png']));
	app.vault.setFile('DS Compendium/Samwise Gamgee.md', dsNote(['name: Samwise Gamgee', 'stamina: 90', 'image: images/sam.png']));
	app.vault.setFile('Bestiary/Orc Warrior.md', dsNote(['name: Orc Warrior', 'stamina: "40"']));
	app.vault.setFile('Goblin.md', dsNote(['name: Goblin', 'stamina: "4"', 'with_captain: "+2 bonus to Stamina"']));
	app.vault.setFile('Goblin Captain.md', dsNote(['name: Goblin Captain', 'stamina: "40"', 'image: images/captain.png']));
}

function makeHost() {
	const replaceSource = jest.fn(async (_s: string) => true);
	const containerEl = document.createElement('div');
	return {
		mode: 'reading' as RenderMode,
		sourcePath: 'Encounter.md',
		containerEl,
		canPersist: true,
		addChild: (c: unknown) => c,
		getBlockInfo: () => ({ language: 'ds-initiative', lineStart: 0, lineEnd: 30 }),
		replaceSource,
		blockKey: () => 'Encounter.md::ds-initiative::0',
	} as unknown as BlockHost & { containerEl: HTMLElement; replaceSource: typeof replaceSource };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const settle = async () => {
	for (let i = 0; i < 6; i++) await Promise.resolve();
	await sleep(PERSIST_DEBOUNCE_MS + 60);
};
const lastModal = (): HTMLElement => document.body.lastElementChild as HTMLElement;
const q = (root: HTMLElement, sel: string, n = 0): HTMLElement => {
	const el = root.querySelectorAll<HTMLElement>(sel)[n];
	if (!el) throw new Error(`no ${sel}[${n}]`);
	return el;
};
function damageVia(modalEl: HTMLElement, amount: number): void {
	(modalEl.querySelector('.dse-sedit__apply-input') as HTMLInputElement).value = String(amount);
	(modalEl.querySelector('button[aria-label="Damage"]') as HTMLElement).click();
	(modalEl.querySelector('.dse-modal__footer .dse-btn--accent') as HTMLElement).click();
}
function healVia(modalEl: HTMLElement, amount: number): void {
	(modalEl.querySelector('.dse-sedit__apply-input') as HTMLInputElement).value = String(amount);
	(modalEl.querySelector('button[aria-label="Healing"]') as HTMLElement).click();
	(modalEl.querySelector('.dse-modal__footer .dse-btn--accent') as HTMLElement).click();
}

/** Mounts `src` through the real pipeline; `act` runs on the rendered root; resolves every write, in order. */
async function drive(
	src: string,
	act: (root: HTMLElement) => Promise<void> | void,
	opts: { refs?: boolean } = {},
): Promise<{ writes: string[]; host: ReturnType<typeof makeHost>; root: HTMLElement; deps: ElementPipelineDeps }> {
	const { deps, app } = makeEnv();
	if (opts.refs) seedStatblockNotes(app);
	const host = makeHost();
	await new ElementPipeline(deps).run(initiativeElement, src, host);
	await settle();
	const root = host.containerEl.firstElementChild as HTMLElement;
	const err = root.querySelector('.dse-error-card');
	if (err) throw new Error('error card: ' + err.textContent);
	await act(root);
	await settle();
	await settle();
	document.querySelectorAll('.modal-container, .dse-modal').forEach((el) => el.remove());
	return { writes: host.replaceSource.mock.calls.map((c) => c[0] as string), host, root, deps };
}
const lastWrite = (writes: string[]): string => {
	if (writes.length === 0) throw new Error('nothing was written');
	return writes[writes.length - 1];
};

const heroTurn = (root: HTMLElement) => q(root, '.dse-init__group--heroes .dse-init__turn').click();
const groupTurn = (root: HTMLElement) => q(root, '.dse-init__group--enemies .dse-init__turn').click();
const damageGoblinOne = (root: HTMLElement) => {
	q(root, '.dse-init__detail .dse-init__stamina').click();
	damageVia(lastModal(), 3);
};

/** The ticket's repro: one hero, one group, one creature (amount 2). */
const REPRO = `heroes:
  - name: Ash
    max_stamina: 20
enemy_groups:
  - name: Goblins
    creatures:
      - name: Goblin
        max_stamina: 10
        amount: 2`;

/** The legacy writer's bytes for a ref-free source: every key parse fills in, now present ("fully authored"). */
const legacyBytes = async (src: string): Promise<string> =>
	stringifyYaml(await parseEncounterData(src, new App() as any, DEFAULT_SETTINGS)).trim();

afterEach(() => {
	document.body.innerHTML = '';
});

describe('SC-485: a write adds no default key the user never wrote', () => {
	test('C01 the ticket repro: toggling the hero writes ONLY has_taken_turn: true', async () => {
		const { writes } = await drive(REPRO, heroTurn);
		expect(writes).toHaveLength(1);
		expect(lastWrite(writes)).toBe(REPRO.replace('    max_stamina: 20', '    max_stamina: 20\n    has_taken_turn: true'));
	});

	test('C02 toggling the hero twice lands back on the source bytes (an absent key back at its default is dropped)', async () => {
		const { writes } = await drive(REPRO, async (root) => {
			heroTurn(root);
			await settle();
			heroTurn(root);
		});
		expect(writes).toHaveLength(2);
		expect(writes[0]).toContain('has_taken_turn: true');
		expect(writes[1]).toBe(REPRO);
	});

	test('C03 toggling the group writes only the group has_taken_turn', async () => {
		const { writes } = await drive(REPRO, groupTurn);
		// A key parse added to the group lands after its authored keys (class order, unchanged).
		expect(lastWrite(writes)).toBe(`${REPRO}\n    has_taken_turn: true`);
	});

	test('C05 damaging the hero writes only its current_stamina (temp_stamina, conditions, isHero stay out)', async () => {
		const { writes } = await drive(REPRO, (root) => {
			q(root, '.dse-init__group--heroes .dse-init__stamina').click();
			damageVia(lastModal(), 5);
		});
		expect(lastWrite(writes)).toBe(REPRO.replace('    max_stamina: 20', '    max_stamina: 20\n    current_stamina: 15'));
	});

	test('C04 damaging one goblin writes the WHOLE instances list (every generated key, SC-482 FU1)', async () => {
		const { writes } = await drive(REPRO, damageGoblinOne);
		expect(lastWrite(writes)).toBe(
			`${REPRO}
        instances:
          - id: 1
            current_stamina: 7
            temp_stamina: 0
            conditions: []
          - id: 2
            current_stamina: 10
            temp_stamina: 0
            conditions: []`,
		);
	});

	test('C24 damage then heal back to full drops the instances list again (it returns to the parse snapshot)', async () => {
		const { writes } = await drive(REPRO, async (root) => {
			damageGoblinOne(root);
			await settle();
			await settle();
			q(root, '.dse-init__detail .dse-init__stamina').click();
			healVia(lastModal(), 3);
		});
		expect(writes).toHaveLength(2);
		expect(writes[0]).toContain('current_stamina: 7');
		expect(writes[1]).toBe(REPRO);
	});

	test('C06/C07 malice is written whole once it moves, and dropped again at 0', async () => {
		const up = (root: HTMLElement) => q(root, '.dse-init__malice .dse-stepper__btn[aria-label^="Increase"]').click();
		const down = (root: HTMLElement) => q(root, '.dse-init__malice .dse-stepper__btn[aria-label^="Decrease"]').click();
		const one = await drive(REPRO, up);
		expect(lastWrite(one.writes)).toBe(`${REPRO}\nmalice:\n  value: 1`);
		const two = await drive(REPRO, async (root) => {
			up(root);
			await settle();
			down(root);
		});
		expect(two.writes).toHaveLength(2);
		expect(two.writes[1]).toBe(REPRO);
	});

	test('C08 Advance round writes round: 2 and nothing else new', async () => {
		const { writes } = await drive(REPRO, (root) => q(root, '.dse-init__round-advance').click());
		expect(lastWrite(writes)).toBe(`${REPRO}\nround: 2`);
	});

	test('C09 Reset encounter on an untouched block writes back the source bytes', async () => {
		const { writes } = await drive(REPRO, (root) => {
			q(root, '.dse-chrome [data-dse-chrome-item="initiative-reset-encounter"]').click();
			(lastModal().querySelector('button[aria-label="Yes, Reset"]') as HTMLElement).click();
		});
		expect(lastWrite(writes)).toBe(REPRO);
	});

	test('C25 damage, Reset, then a hero toggle on the same view writes just the toggle (no instances)', async () => {
		const { writes } = await drive(REPRO, async (root) => {
			damageGoblinOne(root);
			await settle();
			await settle();
			q(root, '.dse-chrome [data-dse-chrome-item="initiative-reset-encounter"]').click();
			(lastModal().querySelector('button[aria-label="Yes, Reset"]') as HTMLElement).click();
			await settle();
			await settle();
			heroTurn(root);
		});
		expect(lastWrite(writes)).toBe(REPRO.replace('    max_stamina: 20', '    max_stamina: 20\n    has_taken_turn: true'));
	});

	test('a fully-authored block (the legacy writer\'s bytes) keeps every key: only the touched line changes', async () => {
		const authored = await legacyBytes(REPRO);
		expect(authored).toContain('isHero: true');
		const { writes } = await drive(authored, heroTurn);
		expect(lastWrite(writes)).toBe(authored.replace('has_taken_turn: false', 'has_taken_turn: true'));
	});

	test('C19 an AUTHORED isHero under heroes is still written (as the true parse sets), an absent one is not', async () => {
		const src = REPRO.replace('max_stamina: 20', 'max_stamina: 20\n    isHero: false');
		const { writes } = await drive(src, heroTurn);
		const hero = (parseYaml(lastWrite(writes)) as any).heroes[0];
		expect(hero.isHero).toBe(true);
		expect(hero.has_taken_turn).toBe(true);
		const plain = await drive(REPRO, heroTurn);
		expect(lastWrite(plain.writes)).not.toContain('isHero');
	});

	test('C16/C17 authored ids-only instances: a toggle writes none of their keys, damage writes only the changed one', async () => {
		const src = `${REPRO}\n        instances:\n          - id: 1\n          - id: 2`;
		const toggled = await drive(src, heroTurn);
		expect(lastWrite(toggled.writes)).toBe(src.replace('    max_stamina: 20', '    max_stamina: 20\n    has_taken_turn: true'));
		const hit = await drive(src, damageGoblinOne);
		expect(lastWrite(hit.writes)).toBe(src.replace('          - id: 1\n', '          - id: 1\n            current_stamina: 7\n'));
	});

	test('C20 a block the encounter builder wrote is a source like any other: its keys stay, only the toggle is added', async () => {
		const built = `heroes: []
enemy_groups:
  - name: Goblin
    is_squad: false
    creatures:
      - name: Goblin
        amount: 2
        max_stamina: 10
        isHero: false
malice:
  value: 0`;
		const { writes } = await drive(built, groupTurn);
		expect(lastWrite(writes)).toBe(built.replace('        isHero: false\n', '        isHero: false\n    has_taken_turn: true\n'));
	});

	test('M03 a model the plugin built itself (never parsed) serializes whole, as before', () => {
		const built: EncounterData = {
			heroes: [],
			enemy_groups: [
				{
					name: 'Goblin',
					is_squad: false,
					creatures: [{ name: 'Goblin', amount: 2, max_stamina: 10, isHero: false, statblock: 'scc.v1:x' } as any],
				},
			],
			malice: { value: 0 },
		} as EncounterData;
		expect(serialize(built)).toBe(stringifyYaml(built).trim());
		expect(serialize(built)).toContain('isHero: false');
		expect(serialize(built)).toContain('malice:\n  value: 0');
	});
});

describe('SC-485: statblock-merged fields follow the statblock (D1 omit)', () => {
	test('C12 a hero/creature that only names a statblock writes no merged name / max_stamina / image / current_stamina', async () => {
		const { writes } = await drive(statblockRefs, heroTurn, { refs: true });
		// Parsed, the written block IS the source plus the one toggled key (quotes around plain scalars are cosmetic).
		const expected = parseYaml(statblockRefs) as any;
		expected.heroes[0].has_taken_turn = true;
		expect(parseYaml(lastWrite(writes))).toEqual(expected);
	});

	test('C13 damaging a statblock-only hero writes its current_stamina but still no merged max_stamina / name', async () => {
		const { writes } = await drive(
			statblockRefs,
			(root) => {
				q(root, '.dse-init__group--heroes .dse-init__stamina').click();
				damageVia(lastModal(), 5);
			},
			{ refs: true },
		);
		const hero = (parseYaml(lastWrite(writes)) as any).heroes[0];
		expect(hero).toEqual({ statblock: 'Frodo Baggins', current_stamina: 75 });
	});

	test('M04 the snapshot is re-taken after resolveRefs: merged keys are not "changed" values', async () => {
		const { deps, app } = makeEnv();
		seedStatblockNotes(app);
		const src = 'heroes:\n  - statblock: "Frodo Baggins"\nenemy_groups: []';
		const model = await resolveInitiativeRefs(parse(parseYaml(src), src), deps.refs);
		expect(model.heroes[0]).toMatchObject({ name: 'Frodo Baggins', max_stamina: 80, current_stamina: 80 });
		expect(serialize(model)).toBe('heroes:\n  - statblock: Frodo Baggins\nenemy_groups: []');
	});
});

describe('SC-485: the squad pool unit (pool + captain-bonus trio are written all-or-nothing)', () => {
	test('C14 an ordinary squad: a group toggle writes no pool and no trio (an undefined trio key is untouched)', async () => {
		const { writes } = await drive(squad, groupTurn);
		const out = parseYaml(lastWrite(writes)) as any;
		expect(out.enemy_groups[0].has_taken_turn).toBe(true);
		expect(out.enemy_groups[0].minion_stamina_pool).toBeUndefined();
		for (const key of ['minion_stamina_pool', 'minion_stamina_pool_max', 'captain_bonus_active', 'captain_bonus_n']) {
			expect(lastWrite(writes)).not.toContain(key);
		}
	});

	test('C15 an ordinary squad: pool damage + a kill writes the pool and the whole instances list, no trio', async () => {
		const { writes } = await drive(squad, (root) => {
			q(root, '.dse-init__cell').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
			const m = lastModal();
			const inputs = m.querySelectorAll<HTMLInputElement>('.dse-sedit__apply-input');
			inputs[0].value = '4';
			inputs[1].value = '1';
			(m.querySelector('button[aria-label="Apply Damage"]') as HTMLElement).click();
			const cb = m.querySelector('.dse-minion__check') as HTMLInputElement;
			cb.checked = true;
			cb.dispatchEvent(new Event('change'));
			(m.querySelector('.dse-modal__footer .dse-btn--accent') as HTMLElement).click();
		});
		const out = (parseYaml(lastWrite(writes)) as any).enemy_groups[0];
		expect(out.minion_stamina_pool).toBe(16);
		expect(out.creatures[0].instances.filter((i: any) => i.isDead).map((i: any) => i.id)).toEqual([1]);
		expect(lastWrite(writes)).not.toContain('captain_bonus');
	});

	const poolDamage = (root: HTMLElement) => {
		q(root, '.dse-init__group--enemies .dse-init__cell').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		const m = lastModal();
		const inputs = m.querySelectorAll<HTMLInputElement>('.dse-sedit__apply-input');
		inputs[0].value = '6';
		inputs[1].value = '1';
		(m.querySelector('button[aria-label="Apply Damage"]') as HTMLElement).click();
		const cb = m.querySelector('.dse-minion__check') as HTMLInputElement;
		cb.checked = true;
		cb.dispatchEvent(new Event('change'));
		(m.querySelector('.dse-modal__footer .dse-btn--accent') as HTMLElement).click();
	};
	const readout = (root: HTMLElement) =>
		[...root.querySelectorAll('.dse-init__group--enemies .dse-init__stamina')].map((n) => n.textContent);

	const BORN_REFS = `heroes: []
enemy_groups:
  - name: Goblin Squad
    is_squad: true
    creatures:
      - statblock: "Goblin"
        amount: 3
        squad_role: minion
      - statblock: "Goblin Captain"
        amount: 1
        squad_role: captain`;
	const BORN_FREE = `heroes: []
enemy_groups:
  - name: Goblin Squad
    is_squad: true
    creatures:
      - name: Goblin
        max_stamina: 4
        amount: 3
        squad_role: minion
        with_captain: "+2 bonus to Stamina"
      - name: Goblin Captain
        max_stamina: 40
        amount: 1
        squad_role: captain`;

	test.each([
		['C22 born-captained from statblock refs', BORN_REFS, true],
		['C23 born-captained, ref-free with_captain', BORN_FREE, false],
	])('%s: a pool write brings the trio out with it, and the re-parsed readout equals the live one', async (_name, src, refs) => {
		const live = await drive(src, poolDamage, { refs });
		const out = lastWrite(live.writes);
		const minion = (parseYaml(out) as any).enemy_groups[0].creatures[0];
		expect(minion).toMatchObject({ minion_stamina_pool_max: 18, captain_bonus_active: true, captain_bonus_n: 2 });
		expect((parseYaml(out) as any).enemy_groups[0].minion_stamina_pool).toBeDefined();
		// What the user saw right after the write...
		const liveReadout = readout(live.root);
		// ...is what the note shows after a reload (the bonus is not lost: 12/18 (6), never 12/12 (4)).
		const reloaded = await drive(out, () => {}, { refs });
		expect(readout(reloaded.root)).toEqual(liveReadout);
		expect(liveReadout).toContain('12/18 (6)');
		expect(readout(reloaded.root)).not.toContain('12/12 (4)');
	});

	test('C21 the same born-captained squad, untouched by a pool write: a group toggle writes no pool and no trio', async () => {
		const { writes } = await drive(BORN_REFS, groupTurn, { refs: true });
		const out = lastWrite(writes);
		for (const key of ['minion_stamina_pool', 'minion_stamina_pool_max', 'captain_bonus_active', 'captain_bonus_n']) {
			expect(out).not.toContain(key);
		}
	});
});
