// D8 Task 8 (spec §6) — Party tracker through the REAL ElementPipeline: cardHead ("Party"),
// per-member rows (name/deck/optional hero_ref link) with Victories/XP/Renown/Wealth
// steppers, derived follower-threshold (Renown) and echelon/wealth-bound (Wealth) hints,
// the party-wide "award N victories" / "Convert victories to XP (respite)" action bar
// (spec §6.2's own "fed from Encounter/Montage payouts"), the hero_tokens pool stepper,
// and canPersist gating (F1 §4.4). No schema, no compendium dep — real service instances,
// local makeDeps/makeHost (same harness shape as montage.test.ts/project.test.ts).
import * as fs from 'fs';
import * as path from 'path';
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import { createRenderContext } from '../../../src/framework/context';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { createElementRegistry } from '../../../src/framework/registry';
import { createRollService } from '../../../src/framework/roll/service';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin, Notice, parseYaml, makeFakeContext } from '../../mocks/obsidian';
import { partyElement } from '../../../src/elements/party/definition';
import { PartyView } from '../../../src/elements/party/view';
import DrawSteelAdmonitionPlugin, { registerFrameworkElementDefinitions } from 'main';
import { styleGuardFindings } from '../kit/styleGuard';
import partyYaml from '../../../src/elements/party/example.yaml';

const PARTY_ALIASES = ['ds-party'] as const;

function makeHost(overrides: Partial<BlockHost> = {}) {
	const replaceSource = jest.fn(async (_newSource: string) => true);
	const containerEl = document.createElement('div');
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language: 'ds-party', lineStart: 0, lineEnd: 12 }),
		replaceSource,
		blockKey: () => 'Note.md::ds-party::0',
		...overrides,
	};
	return host as BlockHost & { containerEl: HTMLElement; replaceSource: typeof replaceSource };
}

/** Real service instances, same convention as montage.test.ts/project.test.ts — party
 *  declares no schema and has no compendium/roll dep. */
function makeDeps(): ElementPipelineDeps {
	const app = new App();
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	const theme = createThemeService(prefs, plugin as any);
	const refs = createReferenceService(app as any, DEFAULT_SETTINGS);
	const validation = createValidationService();
	const session = createSessionStore();
	return {
		app: app as any,
		plugin: plugin as any,
		settings: DEFAULT_SETTINGS,
		theme,
		prefs,
		refs,
		validation,
		session,
		roll: createRollService(prefs),
	};
}

async function renderParty(source: string = partyYaml, hostOverrides: Partial<BlockHost> = {}) {
	const pipeline = new ElementPipeline(makeDeps());
	const host = makeHost(hostOverrides);
	await pipeline.run(partyElement, source, host);
	const root = host.containerEl.firstElementChild as HTMLElement;
	return { host, root };
}

/** PartyView.onMount is ASYNC (per-member hero_ref rendering awaits renderMarkdown even
 *  when the field is absent for most members) — a user-driven update() from a click
 *  handler is fire-and-forget (`void this.update(model)`), so its rebuild lands a few
 *  microtask ticks after click() returns. Same flush convention as project.test.ts's. */
async function flush(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

// -- kit-DOM accessors --
const partyNameEl = (root: HTMLElement) => root.querySelector('.dse-head__primary--left') as HTMLElement;
const memberRows = (root: HTMLElement) => Array.from(root.querySelectorAll('.dse-party__member'));
const memberEl = (root: HTMLElement, name: string) =>
	memberRows(root).find((el) => el.querySelector('.dse-party__member-name')?.textContent === name) as HTMLElement;
const deckText = (member: HTMLElement) => member.querySelector('.dse-party__member-deck')?.textContent ?? null;
const refEl = (member: HTMLElement) => member.querySelector('.dse-party__member-ref') as HTMLElement | null;
const statStepper = (member: HTMLElement, memberName: string, label: string) =>
	member.querySelector(`.dse-stepper[aria-label="${memberName}'s ${label}"]`) as HTMLElement;
const statPlus = (member: HTMLElement, memberName: string, label: string) =>
	statStepper(member, memberName, label).querySelector('[aria-label^="Increase"]') as HTMLButtonElement;
const statMinus = (member: HTMLElement, memberName: string, label: string) =>
	statStepper(member, memberName, label).querySelector('[aria-label^="Decrease"]') as HTMLButtonElement;
const statNumber = (member: HTMLElement, memberName: string, label: string): string => {
	const s = statStepper(member, memberName, label);
	const input = s.querySelector('.dse-stepper__input') as HTMLInputElement | null;
	return input ? input.value : ((s.querySelector('.dse-stepper__value') as HTMLElement).textContent ?? '');
};
const statHints = (member: HTMLElement) => Array.from(member.querySelectorAll('.dse-party__hint')).map((el) => el.textContent);
const awardInput = (root: HTMLElement) => root.querySelector('.dse-party__award-input') as HTMLInputElement | null;
const awardBtn = (root: HTMLElement) => root.querySelector('[aria-label="Award victories to the party"]') as HTMLButtonElement | null;
const convertBtn = (root: HTMLElement) =>
	root.querySelector('[aria-label="Convert victories to XP (respite)"]') as HTMLButtonElement | null;
const tokensStepper = (root: HTMLElement) => root.querySelector('.dse-stepper[aria-label="Hero tokens"]') as HTMLElement | null;
const tokensNumber = (root: HTMLElement): string => {
	const s = tokensStepper(root)!;
	const input = s.querySelector('.dse-stepper__input') as HTMLInputElement | null;
	return input ? input.value : ((s.querySelector('.dse-stepper__value') as HTMLElement).textContent ?? '');
};

describe('T-8: party ElementDefinition (spec §6)', () => {
	test('id/name/aliases/shape match the brief; persisted with serialize, NO schema, no auto ref-resolution', () => {
		expect(partyElement.id).toBe('party');
		expect(partyElement.aliases).toEqual([...PARTY_ALIASES]);
		expect(partyElement.shape).toBe('persisted');
		expect(partyElement.schema).toBeUndefined();
		expect(partyElement.autoResolveRefs).toBe(false);
		expect(partyElement.serialize).toBeDefined();
	});

	test('createView returns a PartyView', () => {
		const deps = makeDeps();
		const host = makeHost();
		const cx = createRenderContext({
			app: deps.app,
			plugin: deps.plugin,
			settings: deps.settings,
			host,
			theme: deps.theme,
			prefs: deps.prefs,
			refs: deps.refs,
			session: deps.session,
		});
		expect(partyElement.createView(cx)).toBeInstanceOf(PartyView);
	});
});

describe('T-8: party rendered through the REAL ElementPipeline (spec §6.2)', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('root carries data-dse-element="party" + theme; ONE .dse-party', async () => {
		const { root } = await renderParty();
		expect(root.getAttribute('data-dse-element')).toBe('party');
		expect(root.getAttribute('data-dse-theme')).toBe('steel');
		expect(root.querySelectorAll('.dse-party')).toHaveLength(1);
	});

	test('cardHead reads "Party"; both members from example.yaml render', async () => {
		const { root } = await renderParty();
		expect(partyNameEl(root).textContent).toBe('Party');
		expect(memberRows(root)).toHaveLength(2);
	});

	test('Kira renders her full deck line, hero_ref link, and every stat from the fixture', async () => {
		const { root } = await renderParty();
		const kira = memberEl(root, 'Kira');
		expect(deckText(kira)).toBe('Level 3 · Shadow · Wode Elf');
		expect(refEl(kira)?.textContent).toBe('[[Kira]]');
		expect(statNumber(kira, 'Kira', 'Victories')).toBe('1');
		expect(statNumber(kira, 'Kira', 'XP')).toBe('24');
		expect(statNumber(kira, 'Kira', 'Renown')).toBe('3');
		expect(statNumber(kira, 'Kira', 'Wealth')).toBe('1');
	});

	test('Doran (no xp/hero_ref) renders zeroed/absent stats with no link and no thrown error', async () => {
		const { root } = await renderParty();
		const doran = memberEl(root, 'Doran');
		expect(refEl(doran)).toBeNull();
		expect(statNumber(doran, 'Doran', 'XP')).toBe('0');
	});

	test('a member with only a name has no deck line and no ref link', async () => {
		const { root } = await renderParty('members:\n  - name: Solo');
		const solo = memberEl(root, 'Solo');
		expect(deckText(solo)).toBeNull();
		expect(refEl(solo)).toBeNull();
	});

	test('Renown 3 (Kira, from the fixture) shows the "1 follower" threshold hint (REF §11/§13)', async () => {
		const { root } = await renderParty();
		expect(statHints(memberEl(root, 'Kira'))).toContain('1 follower');
	});

	test('Renown 0 shows the "no followers yet" hint, never a fabricated fraction', async () => {
		const { root } = await renderParty('members:\n  - name: Solo\n    renown: 0');
		expect(statHints(memberEl(root, 'Solo'))).toContain('No followers yet (next at 3 Renown)');
	});

	test('a level-7 member shows the "3rd echelon" hint alongside the Wealth 1-6 bound', async () => {
		const { root } = await renderParty('members:\n  - name: Solo\n    level: 7');
		expect(statHints(memberEl(root, 'Solo'))).toContain('3rd echelon · Wealth 1-6');
	});

	test('an unset level shows only the Wealth 1-6 bound, no fabricated echelon', async () => {
		const { root } = await renderParty('members:\n  - name: Solo');
		expect(statHints(memberEl(root, 'Solo'))).toContain('Wealth 1-6');
		expect(statHints(memberEl(root, 'Solo')).some((h) => h?.includes('echelon'))).toBe(false);
	});

	test('the hero_tokens pool stepper reads 2 from example.yaml', async () => {
		const { root } = await renderParty();
		expect(tokensNumber(root)).toBe('2');
	});

	test('source hygiene: view.ts passes the shared kit style guard (no inline color, no color literals)', () => {
		const src = fs.readFileSync(path.join(__dirname, '../../../src/elements/party/view.ts'), 'utf8');
		expect(styleGuardFindings(src)).toEqual([]);
	});

	test('CSS contract: .dse-party scoped under [data-dse-element="party"], tokens only', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');
		const block = sheet.match(/\[data-dse-element="party"\]\s+\.dse-party\s*\{[\s\S]*?\n\}/);
		expect(block).not.toBeNull();
		expect(block![0]).toMatch(/var\(--dse-/);
	});
});

describe('T-8: per-member ± steppers mutate + persist (spec §6.2)', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('incrementing Victories for Doran only changes Doran, and persists', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderParty();

		statPlus(memberEl(root, 'Doran'), 'Doran', 'Victories').click();

		const rebuilt = host.containerEl.firstElementChild as HTMLElement;
		expect(statNumber(memberEl(rebuilt, 'Doran'), 'Doran', 'Victories')).toBe('2');
		expect(statNumber(memberEl(rebuilt, 'Kira'), 'Kira', 'Victories')).toBe('1');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toContain('victories: 2');
	});

	test('decrementing Victories cannot go below 0 (the minus button real-disables at the floor)', async () => {
		const { root } = await renderParty('members:\n  - name: Solo\n    victories: 0');
		expect(statMinus(memberEl(root, 'Solo'), 'Solo', 'Victories').disabled).toBe(true);
	});

	test('bumping Renown for Kira from 3 to 6 flips her follower hint from "1 follower" to "2 followers"', async () => {
		const { root } = await renderParty();
		const kira = memberEl(root, 'Kira');

		for (let i = 0; i < 3; i++) statPlus(kira, 'Kira', 'Renown').click();

		expect(statNumber(kira, 'Kira', 'Renown')).toBe('6');
		expect(statHints(kira)).toContain('2 followers');
	});

	test('Wealth is clamped to [1, 6] — incrementing past 6 real-disables the plus button', async () => {
		const { root } = await renderParty('members:\n  - name: Solo\n    wealth: 6');
		expect(statPlus(memberEl(root, 'Solo'), 'Solo', 'Wealth').disabled).toBe(true);
	});
});

describe('T-8: party-wide "award N victories" (spec §6.2, fed from Encounter/Montage payouts)', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('awarding 2 victories adds 2 to EVERY member, rebuilds, and persists', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderParty();

		awardInput(root)!.value = '2';
		awardBtn(root)!.click();
		await flush();

		const rebuilt = host.containerEl.firstElementChild as HTMLElement;
		expect(statNumber(memberEl(rebuilt, 'Kira'), 'Kira', 'Victories')).toBe('3');
		expect(statNumber(memberEl(rebuilt, 'Doran'), 'Doran', 'Victories')).toBe('3');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
	});

	test('an empty/zero award amount is a no-op (never writes a spurious change)', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderParty();

		awardInput(root)!.value = '0';
		awardBtn(root)!.click();
		await flush();

		expect(statNumber(memberEl(root, 'Kira'), 'Kira', 'Victories')).toBe('1');
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
		expect(host.replaceSource).not.toHaveBeenCalled();
	});
});

describe('T-8: "Convert victories to XP (respite)" (spec §6.1, OD-2(a) — tracks the event, never invents a rate)', () => {
	afterEach(() => {
		jest.useRealTimers();
		Notice.notices.length = 0;
	});

	test('zeroes EVERY member\'s victories and surfaces a Notice recording the conversion, without touching xp', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderParty();

		convertBtn(root)!.click();
		await flush();

		const rebuilt = host.containerEl.firstElementChild as HTMLElement;
		expect(statNumber(memberEl(rebuilt, 'Kira'), 'Kira', 'Victories')).toBe('0');
		expect(statNumber(memberEl(rebuilt, 'Doran'), 'Doran', 'Victories')).toBe('0');
		// XP is untouched by the conversion — the GM enters it manually (no rate exists).
		expect(statNumber(memberEl(rebuilt, 'Kira'), 'Kira', 'XP')).toBe('24');

		expect(Notice.notices.some((n) => n.includes('Converted 2 victories to XP at respite'))).toBe(true);
		expect(Notice.notices.some((n) => n.toLowerCase().includes('no rate is set'))).toBe(true);

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).not.toMatch(/victories: [1-9]/);
	});

	test('converting with no victories to convert still surfaces a Notice (never silently no-ops)', async () => {
		jest.useFakeTimers();
		const { root } = await renderParty('members:\n  - name: Solo\n    victories: 0');

		convertBtn(root)!.click();
		await flush();

		expect(Notice.notices.some((n) => n.includes('no victories to convert'))).toBe(true);
	});
});

describe('T-8: hero_tokens pool stepper (spec §6.2, table-wide pool — AGENT line 87)', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('incrementing hero_tokens persists under party.hero_tokens', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderParty();

		(tokensStepper(root)!.querySelector('[aria-label^="Increase"]') as HTMLButtonElement).click();

		const rebuilt = host.containerEl.firstElementChild as HTMLElement;
		expect(tokensNumber(rebuilt)).toBe('3');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toContain('hero_tokens: 3');
	});

	test('a block with no party.hero_tokens starts the pool at 0', async () => {
		const { root } = await renderParty('members:\n  - name: Solo');
		expect(tokensNumber(root)).toBe('0');
	});
});

describe('T-8: canPersist=false — read-only renders WITHOUT write affordances, zero writes (F1 §4.4)', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('readonly badge attr; steppers visible but real-disabled; no action bar; the roster still renders', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderParty(partyYaml, { canPersist: false });

		expect(root.hasAttribute('data-dse-readonly')).toBe(true);
		expect(memberRows(root)).toHaveLength(2);
		expect(statPlus(memberEl(root, 'Kira'), 'Kira', 'Victories').disabled).toBe(true);
		expect(statMinus(memberEl(root, 'Kira'), 'Kira', 'Victories').disabled).toBe(true);
		expect(awardBtn(root)).toBeNull();
		expect(convertBtn(root)).toBeNull();

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
		expect(host.replaceSource).not.toHaveBeenCalled();
	});
});

describe('T-8: registered EXACTLY ONCE — framework registry owns ds-party, RegisterElements.ts does not', () => {
	test('registerFrameworkElementDefinitions registers party; the alias resolves to it', () => {
		const registry = createElementRegistry();
		registerFrameworkElementDefinitions(registry);

		expect(registry.get('party')?.id).toBe('party');
		for (const alias of PARTY_ALIASES) {
			expect(registry.get(alias)?.id).toBe('party');
		}
	});

	test("through the REAL onload(): ds-party gets exactly one registerMarkdownCodeBlockProcessor call", async () => {
		const app = new App();
		const plugin = new (DrawSteelAdmonitionPlugin as any)(app, { id: 'draw-steel-elements', version: 'test' });
		const registerSpy = jest.spyOn(plugin, 'registerMarkdownCodeBlockProcessor');

		await plugin.onload();

		const calls = registerSpy.mock.calls.filter(([language]: [string]) => language === 'ds-party');
		expect(calls).toHaveLength(1);
		expect(plugin.frameworkV2!.registry.get('ds-party')?.id).toBe('party');

		registerSpy.mockRestore();
	});

	test('rendering a ds-party block through the wired processor produces the kit party DOM (end-to-end)', async () => {
		const app = new App();
		const plugin = new (DrawSteelAdmonitionPlugin as any)(app, { id: 'draw-steel-elements', version: 'test' });
		await plugin.onload();

		app.vault.setFile('Note.md', '```ds-party\n' + partyYaml.trimEnd() + '\n```\n');
		const ctx = makeFakeContext(app, 'Note.md');
		const handler = (plugin as any).registeredProcessors.get('ds-party');

		await handler(partyYaml, ctx.el, ctx);

		const root = ctx.el.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-element')).toBe('party');
		expect(root.querySelector('.dse-party')).not.toBeNull();
	});
});
