// D3 TEMPORARY review/dev affordances — the two command-palette commands added to main.ts
// so the maintainer can A/B the themes + print layout during review. D4's settings picker
// replaces both commands; DELETE this test file alongside them.
//
// The obsidian mock's Plugin.addCommand is a no-op, so we spy on it to capture the command
// objects registered during onload(), then invoke their callbacks directly. This exercises
// the callbacks end-to-end (real ThemeService, real prefs defaults, real Notice recorder).
import DrawSteelAdmonitionPlugin from 'main';
import { App, Notice } from '../../mocks/obsidian';

function makePlugin(app: App): DrawSteelAdmonitionPlugin {
	return new DrawSteelAdmonitionPlugin(app as any, { id: 'draw-steel-elements', version: 'test' } as any);
}

/** Pull a command's callback out of the addCommand spy calls by its id. */
function commandCallback(addCommandSpy: jest.SpyInstance, id: string): () => void {
	const call = addCommandSpy.mock.calls.find(([cmd]) => cmd?.id === id);
	if (!call) throw new Error(`command "${id}" was not registered`);
	return call[0].callback as () => void;
}

describe('D3 temporary review commands (main.ts)', () => {
	afterEach(() => {
		Notice.notices.length = 0;
		document.body.innerHTML = '';
	});

	test('dse-cycle-theme flips the theme via the ThemeService (setActive persists + reflows) and notifies', async () => {
		const app = new App();
		const plugin = makePlugin(app);
		const addCommandSpy = jest.spyOn(plugin, 'addCommand');
		await plugin.onload();

		const theme = plugin.frameworkV2!.services.theme;
		// Default theme is Steel (BUILTIN_DESCRIPTORS / DEFAULT_THEME_ID).
		expect(theme.active).toBe('steel');

		const cycle = commandCallback(addCommandSpy, 'dse-cycle-theme');

		cycle();
		expect(theme.active).toBe('legacy'); // setActive drove the pref synchronously
		expect(Notice.notices).toContain('Draw Steel Elements theme: legacy');

		cycle();
		expect(theme.active).toBe('steel'); // cycles back
		expect(Notice.notices).toContain('Draw Steel Elements theme: steel');
	});

	test('dse-toggle-print-preview toggles data-dse-print on currently-rendered roots and notifies', async () => {
		const app = new App();
		const plugin = makePlugin(app);
		const addCommandSpy = jest.spyOn(plugin, 'addCommand');
		await plugin.onload();

		const rootA = document.createElement('div');
		rootA.setAttribute('data-dse-element', 'statblock');
		const rootB = document.createElement('div');
		rootB.setAttribute('data-dse-element', 'feature');
		document.body.append(rootA, rootB);

		const toggle = commandCallback(addCommandSpy, 'dse-toggle-print-preview');

		toggle();
		expect(rootA.dataset.dsePrint).toBe('on');
		expect(rootB.dataset.dsePrint).toBe('on');
		expect(Notice.notices).toContain('Draw Steel Elements print preview: on');

		toggle();
		expect(rootA.dataset.dsePrint).toBeUndefined();
		expect(rootB.dataset.dsePrint).toBeUndefined();
		expect(Notice.notices).toContain('Draw Steel Elements print preview: off');
	});
});
