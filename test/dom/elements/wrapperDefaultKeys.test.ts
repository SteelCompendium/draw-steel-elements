// SC-482 — a write to a counter / project / montage / party / encounter / negotiation block
// changes only the fields the action touched. Each of those parsers fills defaults into the
// model (min_value 0, accrued 0, successes 0, members [], party {}, current_interest, ...) and
// serialize() used to stringify the whole model, so the first write added lines the user never
// wrote. The rule is SC-466's: a key ABSENT from the source whose value at write time still
// equals the default the parser filled in is not written; every key the source declared is,
// byte-for-byte in the old order.
//
// Driven through the real ElementPipeline + a real ReadingModeBlockHost over the FakeVault, so
// the assertions are on the NOTE (what a user's file holds), not on a mock replaceSource.
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { ElementDefinition } from '../../../src/framework/registry';
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { App, Plugin, makeFakeContext, parseYaml } from '../../mocks/obsidian';
import { counterElement } from '../../../src/elements/counter/definition';
import { projectElement } from '../../../src/elements/project/definition';
import { montageElement } from '../../../src/elements/montage/definition';
import { partyElement } from '../../../src/elements/party/definition';
import { encounterElement } from '../../../src/elements/encounter/definition';
import { negotiationElement } from '../../../src/elements/negotiation/definition';
import { parse as parseParty, serialize as serializeParty } from '../../../src/elements/party/model';
import { parse as parseEncounter, serialize as serializeEncounter } from '../../../src/elements/encounter/model';
import { Counter } from '@model/Counter';
import type { NegotiationData } from '@model/NegotiationData';
import { makeDeps } from '../_staminaHarness';
import { makeCompendiumDeps, loadMdDseFixture } from './_refHarness';

const NOTE = 'Note.md';
const GOBLIN = 'scc.v1:mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker';
const GOBLIN_REL = 'monster/goblin/statblock/goblin-stinker.md';
const GOBLIN_ROW = `  - code: "${GOBLIN}"\n    count: 6`;
const COMPUTED = '_computed:\n  spent_ev: 18\n  budget: null\n  ratio: null\n  band: null\n  victories: 1';

type Act = (root: HTMLElement) => void;

const click = (root: HTMLElement, selector: string): void => {
	const el = root.querySelector<HTMLElement>(selector);
	if (!el) throw new Error(`no ${selector}`);
	el.click();
};
const increase = (root: HTMLElement, scope = ''): void => click(root, `${scope} .dse-stepper__btn[aria-label^="Increase"]`.trim());
const compendiumDeps = (): ElementPipelineDeps => {
	const h = makeCompendiumDeps();
	loadMdDseFixture(h.vault, GOBLIN_REL);
	return h.deps;
};

const NT_MINIMAL =
	'name: Frodo\ninitial_patience: 5\ninitial_interest: 2\nmotivations:\n  - name: Power\n    reason: Wants it\npitfalls:\n  - name: Greed\n    reason: Hates it';
const NT_MINIMAL_OUT =
	'name: Frodo\ninitial_patience: 5\ncurrent_patience: 3\ninitial_interest: 2\nmotivations:\n  - name: Power\n    reason: Wants it\npitfalls:\n  - name: Greed\n    reason: Hates it';
// Every key spelled out (what the old plugin wrote into the note on the first change), patience at 3.
const NT_FULL = [
	'name: Frodo',
	'initial_patience: 5',
	'current_patience: 3',
	'initial_interest: 2',
	'current_interest: 2',
	'motivations:',
	'  - name: Power',
	'    reason: Wants it',
	'    hasBeenAppealedTo: false',
	'pitfalls:',
	'  - name: Greed',
	'    reason: Hates it',
	'currentArgument:',
	'  motivationsUsed: []',
	'  pitfallsUsed: []',
	'  lieUsed: false',
	'  sameArgumentUsed: false',
	'  reusedMotivation: false',
	'i5: Interest 5 result',
	'i4: Interest 4 result',
	'i3: Interest 3 result',
	'i2: Interest 2 result',
	'i1: Interest 1 result',
	'i0: Interest 0 result',
].join('\n');

interface Spec {
	name: string;
	def: ElementDefinition<any>;
	lang: string;
	deps: () => ElementPipelineDeps;
	/** A source that omits every defaulted key, the user action on it, and the body it must leave. */
	minimal: string;
	act: Act;
	minimalOut: string;
	/** The same block with every key spelled out, the action on it, and the body it must leave. */
	full: string;
	actFull: Act;
	fullOut: string;
	/** What serialize() gives back for each source, untouched (a re-parse, no user action). */
	minimalRoundTrip: string;
	fullRoundTrip: string;
}

const specs: Spec[] = [
	{
		name: 'counter',
		def: counterElement,
		lang: 'ds-counter',
		deps: makeDeps,
		minimal: 'name: Health\ncurrent_value: 10\nmax_value: 20',
		act: (root) => increase(root),
		minimalOut: 'max_value: 20\ncurrent_value: 11\nname: Health',
		full: 'max_value: 20\ncurrent_value: 10\nmin_value: 0\nname: Health\nvalue_height: 3\nname_height: 1',
		actFull: (root) => increase(root),
		fullOut: 'max_value: 20\ncurrent_value: 11\nmin_value: 0\nname: Health\nvalue_height: 3\nname_height: 1',
		minimalRoundTrip: 'max_value: 20\ncurrent_value: 10\nname: Health',
		fullRoundTrip: 'max_value: 20\ncurrent_value: 10\nmin_value: 0\nname: Health\nvalue_height: 3\nname_height: 1',
	},
	{
		name: 'project',
		def: projectElement,
		lang: 'ds-project',
		deps: makeDeps,
		minimal: 'goal_name: Forge a blade\ngoal_points: 100',
		act: (root) => addProjectRoll(root),
		minimalOut: 'goal_name: Forge a blade\ngoal_points: 100\naccrued: 14\nrolls:\n  - respite: 1\n    roll: 14\n    points: 14',
		full: 'goal_name: Forge a blade\ngoal_points: 100\naccrued: 0\nrolls: []\ncurrent_respite: 1',
		actFull: (root) => addProjectRoll(root),
		fullOut:
			'goal_name: Forge a blade\ngoal_points: 100\naccrued: 14\nrolls:\n  - respite: 1\n    roll: 14\n    points: 14\ncurrent_respite: 1',
		minimalRoundTrip: 'goal_name: Forge a blade\ngoal_points: 100',
		fullRoundTrip: 'goal_name: Forge a blade\ngoal_points: 100\naccrued: 0\nrolls: []\ncurrent_respite: 1',
	},
	{
		name: 'montage',
		def: montageElement,
		lang: 'ds-montage',
		deps: makeDeps,
		minimal: 'title: Escape the city\nsuccess_limit: 5\nfailure_limit: 3\nparticipants:\n  - name: Ash\n    skills_used: []',
		act: (root) => click(root, '[data-dse-chrome-item="montage-add-round"]'),
		minimalOut:
			'title: Escape the city\nrounds: 3\nsuccess_limit: 5\nfailure_limit: 3\nparticipants:\n  - name: Ash\n    skills_used: []',
		full: 'title: Escape the city\nrounds: 2\nsuccess_limit: 5\nfailure_limit: 3\nsuccesses: 0\nfailures: 0\nparticipants:\n  - name: Ash\n    skills_used: []\ncurrent_round: 1',
		actFull: (root) => click(root, '[data-dse-chrome-item="montage-add-round"]'),
		fullOut:
			'title: Escape the city\nrounds: 3\nsuccess_limit: 5\nfailure_limit: 3\nsuccesses: 0\nfailures: 0\nparticipants:\n  - name: Ash\n    skills_used: []\ncurrent_round: 1',
		minimalRoundTrip:
			'title: Escape the city\nsuccess_limit: 5\nfailure_limit: 3\nparticipants:\n  - name: Ash\n    skills_used: []',
		fullRoundTrip:
			'title: Escape the city\nrounds: 2\nsuccess_limit: 5\nfailure_limit: 3\nsuccesses: 0\nfailures: 0\nparticipants:\n  - name: Ash\n    skills_used: []\ncurrent_round: 1',
	},
	{
		name: 'party',
		def: partyElement,
		lang: 'ds-party',
		deps: makeDeps,
		minimal: 'party:\n  hero_tokens: 2',
		act: (root) => increase(root, '.dse-stepper[aria-label="Hero tokens"]'),
		minimalOut: 'party:\n  hero_tokens: 3',
		full: 'party:\n  hero_tokens: 2\nmembers: []',
		actFull: (root) => increase(root, '.dse-stepper[aria-label="Hero tokens"]'),
		fullOut: 'party:\n  hero_tokens: 3\nmembers: []',
		minimalRoundTrip: 'party:\n  hero_tokens: 2',
		fullRoundTrip: 'party:\n  hero_tokens: 2\nmembers: []',
	},
	{
		name: 'encounter',
		def: encounterElement,
		lang: 'ds-encounter',
		deps: compendiumDeps,
		// Writing on render: the view rewrites `_computed` the moment the block mounts.
		minimal: `monsters:\n${GOBLIN_ROW}`,
		act: () => {},
		minimalOut: `monsters:\n  - code: ${GOBLIN}\n    count: 6\n${COMPUTED}`,
		full: `party: {}\nmonsters:\n${GOBLIN_ROW}`,
		actFull: () => {},
		fullOut: `party: {}\nmonsters:\n  - code: ${GOBLIN}\n    count: 6\n${COMPUTED}`,
		minimalRoundTrip: `monsters:\n  - code: ${GOBLIN}\n    count: 6`,
		fullRoundTrip: `party: {}\nmonsters:\n  - code: ${GOBLIN}\n    count: 6`,
	},
	{
		name: 'negotiation',
		def: negotiationElement,
		lang: 'ds-negotiation',
		deps: makeDeps,
		minimal: NT_MINIMAL,
		act: (root) => click(root, '.dse-nt__patience .dse-track__slot[data-value="3"]'),
		minimalOut: NT_MINIMAL_OUT,
		full: NT_FULL,
		actFull: (root) => click(root, '.dse-nt__patience .dse-track__slot[data-value="1"]'),
		fullOut: NT_FULL.replace('current_patience: 3', 'current_patience: 1'),
		minimalRoundTrip: NT_MINIMAL,
		fullRoundTrip: NT_FULL,
	},
];

function addProjectRoll(root: HTMLElement): void {
	root.querySelector<HTMLInputElement>('.dse-prj__roll-input')!.value = '14';
	root.querySelector<HTMLInputElement>('.dse-prj__points-input')!.value = '14';
	click(root, '[aria-label="Add project roll"]');
}

// ---------------------------------------------------------------------------- harness

interface Mounted {
	root: HTMLElement;
	note: () => string;
}

/** Let the render-time write (encounter) and the debounced persist (everything else) land. */
async function settle(): Promise<void> {
	for (let i = 0; i < 3; i++) await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
}

/** A note holding the given blocks, with text above and below. */
function noteOf(blocks: { lang: string; body: string }[]): string {
	const fences = blocks.map((b) => `\`\`\`${b.lang}\n${b.body}\n\`\`\``);
	return ['# Session notes', '', 'Before text.', '', fences.join('\n\ntext between\n\n'), '', 'After text.'].join('\n');
}

/** The body of fence `index` (0-based) in `note`. */
function bodyOf(note: string, index: number): string {
	const bodies = [...note.matchAll(/```ds-[\w-]+\n([\s\S]*?)\n```/g)].map((m) => m[1]);
	return bodies[index];
}

/** Run block `index` of the note on a real ReadingModeBlockHost; the render-time write has landed on return. */
async function mount(app: App, spec: Spec, index: number, body: string): Promise<Mounted> {
	const plugin = new Plugin(app);
	const ctx = makeFakeContext(app, NOTE, index);
	const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, spec.lang);
	const running = new ElementPipeline(spec.deps()).run(spec.def, body, host);
	await settle();
	await running;
	const root = host.containerEl.firstElementChild as HTMLElement;
	expect(root.querySelector('.dse-error-card')).toBeNull();
	return { root, note: () => app.vault.getContent(NOTE)! };
}

function appWith(note: string): App {
	const app = new App();
	app.vault.setFile(NOTE, note);
	return app;
}

beforeEach(() => {
	jest.useFakeTimers();
});
afterEach(() => {
	document.body.innerHTML = '';
	jest.useRealTimers();
});

// -------------------------------------------------------------------------- the tests

describe.each(specs)('SC-482: $name — a write adds no default keys the user never wrote', (spec) => {
	test('REPRO: a minimal block, one user write, leaves only the keys the user wrote plus what the action changed', async () => {
		const app = appWith(noteOf([{ lang: spec.lang, body: spec.minimal }]));
		const m = await mount(app, spec, 0, spec.minimal);
		spec.act(m.root);
		await settle();
		expect(bodyOf(m.note(), 0)).toBe(spec.minimalOut);
	});

	test('a fully-authored block (every key, defaults spelled out) is byte-identical to the old output after the same write', async () => {
		const app = appWith(noteOf([{ lang: spec.lang, body: spec.full }]));
		const m = await mount(app, spec, 0, spec.full);
		spec.actFull(m.root);
		await settle();
		expect(bodyOf(m.note(), 0)).toBe(spec.fullOut);
	});

	test('two blocks of this type in one note: the minimal one and the fully-authored one each write their own shape', async () => {
		const app = appWith(noteOf([{ lang: spec.lang, body: spec.minimal }, { lang: spec.lang, body: spec.full }]));
		const first = await mount(app, spec, 0, spec.minimal);
		spec.act(first.root);
		await settle();
		const second = await mount(app, spec, 1, spec.full);
		spec.actFull(second.root);
		await settle();
		const out = app.vault.getContent(NOTE)!;
		expect(bodyOf(out, 0)).toBe(spec.minimalOut);
		expect(bodyOf(out, 1)).toBe(spec.fullOut);
	});

	test('content above and below the fence is untouched', async () => {
		const before = noteOf([{ lang: spec.lang, body: spec.minimal }]);
		const app = appWith(before);
		const m = await mount(app, spec, 0, spec.minimal);
		spec.act(m.root);
		await settle();
		expect(m.note()).toBe(before.replace(spec.minimal, spec.minimalOut));
	});

	test('a re-parse (external edit) recomputes which keys the source declared', () => {
		// The block is edited from "defaults omitted" to "defaults spelled out" and back: each
		// parse records its own source, nothing carries over from the previous one.
		const roundTrip = (body: string) => spec.def.serialize!(spec.def.parse(parseYaml(body), body));
		expect(roundTrip(spec.minimal)).toBe(spec.minimalRoundTrip);
		expect(roundTrip(spec.full)).toBe(spec.fullRoundTrip);
		expect(roundTrip(spec.minimal)).toBe(spec.minimalRoundTrip);
	});
});

describe('SC-482: counter — an absent key the user changed is written', () => {
	test('current_value absent: the first + writes it (the other defaults stay absent)', async () => {
		const body = 'name: Health\nmax_value: 20';
		const app = appWith(noteOf([{ lang: 'ds-counter', body }]));
		const m = await mount(app, specs[0], 0, body);
		increase(m.root);
		await settle();
		expect(bodyOf(m.note(), 0)).toBe('max_value: 20\ncurrent_value: 1\nname: Health');
	});

	test('an authored value_height: 0 still reads as the default 3 and is written as authored-present', async () => {
		const body = 'name: Health\ncurrent_value: 1\nvalue_height: 0';
		const app = appWith(noteOf([{ lang: 'ds-counter', body }]));
		const m = await mount(app, specs[0], 0, body);
		increase(m.root);
		await settle();
		expect(bodyOf(m.note(), 0)).toBe('current_value: 2\nname: Health\nvalue_height: 3');
	});
});

describe('SC-482: party and encounter — a default the user changed is written', () => {
	test('party: a member added to a block with no members key writes `members`', () => {
		const model = parseParty({ party: { hero_tokens: 2 } }, '');
		expect(serializeParty(model)).toBe('party:\n  hero_tokens: 2');
		model.members.push({ name: 'Doran' });
		expect(serializeParty(model)).toBe('party:\n  hero_tokens: 2\nmembers:\n  - name: Doran');
	});

	test('encounter: a party configured on a block with no party key writes `party`', () => {
		const model = parseEncounter({ monsters: [{ code: 'x', count: 1 }] }, '');
		expect(serializeEncounter(model)).toBe('monsters:\n  - code: x\n    count: 1');
		model.party.hero_count = 4;
		expect(serializeEncounter(model)).toBe('monsters:\n  - code: x\n    count: 1\nparty:\n  hero_count: 4');
	});
});

describe('SC-482: negotiation — each Motivation records its own absent keys', () => {
	const SRC = [
		'name: Frodo',
		'motivations:',
		'  - name: Power',
		'    reason: Wants it',
		'    hasBeenAppealedTo: false',
		'  - name: Peace',
		'    reason: Shire',
	].join('\n');

	test('a Motivation that declared hasBeenAppealedTo keeps it; one that did not does not', () => {
		const model = negotiationElement.parse(parseYaml(SRC), SRC) as NegotiationData;
		expect(negotiationElement.serialize!(model)).toBe(SRC);
	});

	test('marking a Motivation as already appealed to writes that key on that Motivation only', () => {
		const model = negotiationElement.parse(parseYaml(SRC), SRC) as NegotiationData;
		model.setMotivationUsed('Peace', true);
		expect(negotiationElement.serialize!(model)).toBe(SRC.replace('    reason: Shire', '    reason: Shire\n    hasBeenAppealedTo: true'));
	});

	test('a Motivation with no reason / a Pitfall with no name: the parser\'s empty string is not written', () => {
		const src = 'motivations:\n  - name: Power\npitfalls:\n  - reason: Greed';
		const model = negotiationElement.parse(parseYaml(src), src) as NegotiationData;
		expect(negotiationElement.serialize!(model)).toBe(src);
	});
});

describe('SC-482: blocks the plugin builds itself keep the whole-instance output', () => {
	test('serialize() of a Counter that was never parsed from a source still writes every key', () => {
		const built = new Counter(20, 10, 0, 'Health', 3, 1);
		expect(counterElement.serialize!(built)).toBe(
			'max_value: 20\ncurrent_value: 10\nmin_value: 0\nname: Health\nvalue_height: 3\nname_height: 1',
		);
	});
});
