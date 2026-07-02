/**
 * T-10a: DOM render smoke for the biggest element (initiative tracker).
 *
 * ── F1 NOTE ─────────────────────────────────────────────────────────────
 * This file is the HARNESS TEMPLATE for F1 element tests (F3 §4.4): parse a
 * golden fixture → render into an extended jsdom div → assert structure →
 * simulate one interaction → assert exactly one vault write. F1's per-element
 * conformance suite parameterizes this shape; the obsidian mock carries
 * forward unchanged.
 * ────────────────────────────────────────────────────────────────────────
 */
import { InitiativeProcessor } from '@drawSteelAdmonition/initiativeProcessor';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin, makeFakeContext, flushAsync } from '../../mocks/obsidian';
import quickStart from '../../fixtures/initiative/quick-start.yaml';

async function renderTracker(source: string = quickStart) {
	const app = new App();
	// Seed the default token image so Images.resolveImageSourceOrDefault's
	// fallback resolves (avoids CB-14 unhandled rejections during render).
	app.vault.setFile('Media/token_1.png', '');
	const note = '# Encounter\n\n```ds-initiative\n' + source.trimEnd() + '\n```\n';
	app.vault.setFile('Encounter.md', note);
	const plugin = new Plugin(app) as any;
	plugin.settings = { ...DEFAULT_SETTINGS };
	const ctx = makeFakeContext(app, 'Encounter.md');
	const el = document.createElement('div');
	const processor = new InitiativeProcessor(plugin);
	await processor.postProcess(source, el, ctx as any);
	return { app, ctx, el };
}

describe('T-10a: InitiativeProcessor render smoke', () => {
	test('renders a hero row per hero and a group container per enemy group', async () => {
		const { el } = await renderTracker();
		expect(el.querySelector('.ds-init-container')).not.toBeNull();
		expect(el.querySelectorAll('.hero-container')).toHaveLength(2);
		// Scoped to .heroes-container: buildEnemyGroupRow always renders a
		// default-selected creature's detail row (e.g. "Orc #1"), which also
		// carries the .character-name class — real, correct app behavior, not
		// something this test (hero rows) should be asserting on.
		const names = [...el.querySelectorAll('.heroes-container .character-name')].map((n) => n.textContent);
		expect(names).toEqual(['Frodo Baggins', 'Samwise Gamgee']);
		expect(el.querySelectorAll('.enemy-group-container')).toHaveLength(1);
		expect(el.querySelector('.group-header h4')!.textContent).toBe('Mordor Forces');
	});

	test('renders the malice counter with the fixture value', async () => {
		const { el } = await renderTracker();
		expect(el.querySelector('.malice-text')!.textContent).toBe('Malice: 5');
	});

	test('clicking a hero turn indicator toggles state and fires exactly one vault write', async () => {
		const { app, el } = await renderTracker();
		expect(app.vault.modifyCalls).toHaveLength(0);
		const indicator = el.querySelector('.heroes-container .turn-indicator') as HTMLElement;
		indicator.click();
		await flushAsync();
		expect(app.vault.modifyCalls).toHaveLength(1);
		expect(app.vault.getContent('Encounter.md')).toContain('has_taken_turn: true');
	});

	test('a parse error renders the friendly error message instead of throwing', async () => {
		const { el } = await renderTracker('heroes: 5');
		const error = el.querySelector('.error-message');
		expect(error).not.toBeNull();
		expect(error!.textContent).toContain('failed to process the input config');
		expect(error!.textContent).toContain("'heroes' field is missing or is not a list");
	});
});
