// SC-443 — the insert paths as a matrix: every registered element x (insert command, /ds pick) x (experimental gate off, on).
// Each cell is one literal row so a new element, a changed alias or a flipped `deferred` flag fails here by name.
// The editor under test is a real CodeMirror 6 state (./_cmEditor), so the assertions are about the text a user is left with.
import { DsElementSuggest } from '../../../src/authoring/suggest';
import { DsSchemaSuggest } from '../../../src/authoring/schemaSuggest';
import { insertScaffold, registerInsertCommands } from '../../../src/authoring/insert';
import { buildScaffold } from '../../../src/authoring/scaffold';
import { createElementRegistry } from '../../../src/framework/registry';
import { setExperimental } from '../../../src/framework/experimental';
import { ElementPipeline } from '../../../src/framework/pipeline';
import { FRAMEWORK_V2_DEPENDENCY_SCHEMAS, registerFrameworkElementDefinitions } from 'main';
import { App, Plugin } from '../../mocks/obsidian';
import { loadMdDseFixture, makeCompendiumDeps, makeHost } from '../elements/_refHarness';
import { CmEditor } from './_cmEditor';

/** id, first alias (the fence the scaffold opens), shipped with the gate off?, has a schema (in-fence key completion)? */
const ELEMENTS: Array<[id: string, fence: string, shipped: boolean, schema: boolean]> = [
	['horizontal-rule', 'ds-hr', true, false],
	['skills', 'ds-skills', true, true],
	['stamina-bar', 'ds-stam', true, true],
	['negotiation', 'ds-nt', true, false],
	['initiative', 'ds-it', true, false],
	['feature', 'ds-ft', true, false],
	['featureblock', 'ds-fb', true, false],
	['statblock', 'ds-sb', true, false],
	['counter', 'ds-ct', true, false],
	['values-row', 'ds-vr', true, false],
	['characteristics', 'ds-char', true, false],
	['roll', 'ds-roll', false, true],
	['scc', 'ds-scc', true, false],
	['encounter', 'ds-encounter', false, false],
	['montage', 'ds-montage', true, false],
	['project', 'ds-project', false, false],
	['party', 'ds-party', false, false],
	['conditions', 'ds-conditions', false, true],
	['heroic-resource', 'ds-resource', false, true],
	['surges', 'ds-surges', false, true],
	['hero-tokens', 'ds-tokens', false, true],
	['hero', 'ds-hero', false, true], // hidden outright (SC-190): never advertised, gate or not
];

const registry = () => {
	const r = createElementRegistry();
	registerFrameworkElementDefinitions(r);
	return r;
};
const ctx = (query: string, editor: unknown = null) => ({ editor: editor as never, file: null as never, start: { line: 0, ch: 0 }, end: { line: 0, ch: 0 }, query });
const commandIds = (): string[] => {
	const plugin = new Plugin(new App()) as any;
	registerInsertCommands(plugin, registry());
	return plugin.commands.map((c: { id: string }) => c.id);
};
const dsIds = (): string[] =>
	new DsElementSuggest(new App() as any, registry()).getSuggestions(ctx('')).map((d) => d.id);

afterEach(() => setExperimental(true)); // the suite default (test/setup/experimental-on.ts)

describe('the registry table is the registry (a new element must get a row here)', () => {
	test('22 elements, in this order, with these first aliases', () => {
		expect(registry().all().map((d) => [d.id, d.aliases[0]])).toEqual(ELEMENTS.map(([id, fence]) => [id, fence]));
	});
});

describe('which elements the insert commands and /ds offer, gate off and on', () => {
	test('gate OFF: thirteen shipped elements (SC-406 defers eight, SC-190 hides ds-hero), same set in the palette and in /ds', () => {
		setExperimental(false);
		const shipped = ELEMENTS.filter(([, , s]) => s).map(([id]) => id);
		expect(shipped).toHaveLength(13);
		expect(commandIds()).toEqual(shipped.map((id) => `insert-${id}`));
		expect(dsIds()).toEqual(shipped);
	});

	test('gate ON: the eight deferred elements join both, ds-hero stays out of both', () => {
		setExperimental(true);
		const advertised = ELEMENTS.filter(([id]) => id !== 'hero').map(([id]) => id);
		expect(advertised).toHaveLength(21);
		expect(commandIds()).toEqual(advertised.map((id) => `insert-${id}`));
		expect(dsIds()).toEqual(advertised);
	});

	test('the command set is fixed when it is registered, /ds re-reads the gate on every call (the gate flips with a plugin reload, which re-registers both)', () => {
		setExperimental(true);
		const s = new DsElementSuggest(new App() as any, registry());
		const plugin = new Plugin(new App()) as any;
		registerInsertCommands(plugin, registry());
		setExperimental(false);
		expect(plugin.commands).toHaveLength(21); // registered with the gate on: a later flip does not unregister
		expect(s.getSuggestions(ctx('')).map((d) => d.id)).toHaveLength(13); // read at call time
	});

	test.each(ELEMENTS.filter(([, , , schema]) => schema))('%s: in-fence key completion follows the gate the same way (deferred = none while off)', (id, fence, shipped) => {
		const editor = new CmEditor('```' + fence + '\n');
		const s = new DsSchemaSuggest(new App() as any, registry());
		for (const [on, expectOffered] of [[false, shipped], [true, true]] as const) {
			setExperimental(on);
			// ds-hero is hidden but NOT deferred-off by the schema suggester (SC-406: "ON must stay exactly as it was"); with the gate off it is deferred too.
			expect({ id, on, offered: s.onTrigger({ line: 1, ch: 0 }, editor as never, null) !== null }).toEqual({ id, on, offered: expectOffered });
		}
	});
});

describe('every element: the insert command and the /ds pick leave the same text and the cursor on the first body character', () => {
	test.each(ELEMENTS)('%s (%s)', (id, fence) => {
		const def = registry().get(id)!;
		const scaffold = buildScaffold(def);
		expect(scaffold.text.startsWith('```' + fence + '\n')).toBe(true);
		expect(scaffold.text.endsWith('\n```')).toBe(true);
		expect(scaffold.text.slice(scaffold.cursorOffset - 1, scaffold.cursorOffset)).toBe('\n');

		const viaCommand = new CmEditor('');
		insertScaffold(viaCommand as never, def);
		expect(viaCommand.getValue()).toBe(scaffold.text);

		const viaSuggest = new CmEditor('/ds' + fence.slice(3));
		const s = new DsElementSuggest(new App() as any, registry());
		const info = s.onTrigger({ line: 0, ch: viaSuggest.getLine(0).length }, viaSuggest as never, null)!;
		s.context = { editor: viaSuggest as never, file: null as never, ...info };
		s.selectSuggestion(def, null as never);
		expect(viaSuggest.getValue()).toBe(scaffold.text);

		// both leave the cursor on the first character after the opening fence line: line 1, column 0
		for (const editor of [viaCommand, viaSuggest]) {
			expect(editor.getCursor()).toEqual({ line: 1, ch: 0 });
			expect(editor.getValue().slice(editor.offsetOf(editor.getCursor()))).toBe(scaffold.text.slice(scaffold.cursorOffset));
		}
	});
});

describe('every scaffold is a block the pipeline accepts (it renders as an element, not an error card)', () => {
	test.each(ELEMENTS.filter(([id]) => id !== 'hero'))('%s', async (id) => {
		const { deps, vault } = makeCompendiumDeps();
		for (const { id: ref, schema } of FRAMEWORK_V2_DEPENDENCY_SCHEMAS) deps.validation.addDependencySchema(ref, schema); // as main.ts onload does
		loadMdDseFixture(vault, 'kit/panther.md'); // the ds-scc scaffold's example code resolves with the fixture compendium present
		const def = registry().get(id)!;
		const body = buildScaffold(def).text.split('\n').slice(1, -1).join('\n');
		const host = makeHost(def.aliases[0]);
		await new ElementPipeline(deps).run(def as never, body, host as never);
		expect({ id, errorCard: host.containerEl.querySelector('[data-dse-error-stage]') !== null }).toEqual({ id, errorCard: false });
		expect(host.containerEl.querySelector('[data-dse-element]')).not.toBeNull();
	});
});
