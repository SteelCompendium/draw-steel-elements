// SC-466 — a write to a ds-stamina / ds-stamina-bar block changes only the fields the action
// touched. StaminaBar.parse fills defaults into own properties (collapsible true,
// collapse_default false, current/temp 0, height 1, style "default") and serialize() used to
// stringify the whole instance, so the first Damage on `max_stamina` + `current_stamina`
// also wrote collapsible / collapse_default / temp_stamina / height / style. The rule now: a
// key ABSENT from the source whose value at write time still equals the parser's default is
// not written; every key the source declared is, byte-for-byte in the old class order.
//
// Driven through the real ElementPipeline + a real ReadingModeBlockHost over the FakeVault, so
// the assertions are on the NOTE (what a user's file holds), not on a mock replaceSource.
import { ElementPipeline } from '../../../src/framework/pipeline';
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { App, Notice, Plugin, makeFakeContext } from '../../mocks/obsidian';
import { staminaBarElement } from '../../../src/elements/stamina-bar/definition';
import { serialize } from '../../../src/elements/stamina-bar/model';
import { StaminaBar } from '@model/StaminaBar';
import { applyBtn, lastModal, makeDeps, makeHost, lastWrite, pressDamage, tempInput, typeCommit } from '../_staminaHarness';

const NOTE = 'Note.md';

interface Mounted {
	app: App;
	root: HTMLElement;
	note: () => string;
}

/** A note holding the given blocks (lang + body), with text above and below. */
function noteOf(blocks: { lang: string; body: string }[]): string {
	const fences = blocks.map((b) => `\`\`\`${b.lang}\n${b.body}\n\`\`\``);
	return ['# Session notes', '', 'Before text.', '', fences.join('\n\ntext between\n\n'), '', 'After text.'].join('\n');
}

/** Run block `index` of `note` through the real pipeline on a real ReadingModeBlockHost. */
async function mount(app: App, note: string, index: number, lang: string, body: string): Promise<Mounted> {
	app.vault.setFile(NOTE, note);
	const plugin = new Plugin(app);
	const ctx = makeFakeContext(app, NOTE, index);
	const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, lang);
	await new ElementPipeline(makeDeps()).run(staminaBarElement, body, host);
	const root = host.containerEl.firstElementChild as HTMLElement;
	return { app, root, note: () => app.vault.getContent(NOTE)! };
}

/** Open the stamina modal from the bar, press Damage `n`, Apply, and wait out the write debounce. */
async function damage(m: Mounted, n: number): Promise<void> {
	(m.root.querySelector('.dse-stamina') as HTMLElement).click();
	pressDamage(lastModal(), n);
	applyBtn(lastModal()).click();
	await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
}

/** The body of fence `index` (0-based) in `note`. */
function bodyOf(note: string, index: number): string {
	const bodies = [...note.matchAll(/```ds-[\w-]+\n([\s\S]*?)\n```/g)].map((m) => m[1]);
	return bodies[index];
}

beforeEach(() => {
	jest.useFakeTimers();
});
afterEach(() => {
	document.body.innerHTML = '';
	jest.useRealTimers();
	Notice.notices.length = 0;
	Notice.last = null;
});

describe('SC-466: a write adds no default keys the user never wrote', () => {
	test('REPRO: max_stamina + current_stamina only, a plain Damage writes exactly those two keys', async () => {
		const body = 'max_stamina: 20\ncurrent_stamina: 15';
		const m = await mount(new App(), noteOf([{ lang: 'ds-stamina-bar', body }]), 0, 'ds-stamina-bar', body);
		await damage(m, 3);
		expect(bodyOf(m.note(), 0)).toBe('max_stamina: 20\ncurrent_stamina: 12');
	});

	test('a fully-authored block (every key, incl. collapsible: false, style: default, height: 1) is byte-identical to the old output after a Damage', async () => {
		const body = [
			'collapsible: false',
			'collapse_default: false',
			'max_stamina: 20',
			'current_stamina: 15',
			'temp_stamina: 0',
			'height: 1',
			'style: default',
		].join('\n');
		const m = await mount(new App(), noteOf([{ lang: 'ds-stamina-bar', body }]), 0, 'ds-stamina-bar', body);
		await damage(m, 3);
		expect(bodyOf(m.note(), 0)).toBe(body.replace('current_stamina: 15', 'current_stamina: 12'));
	});

	test('an authored collapse_default: true alone survives a write; the chrome collapse still starts on and toggles without writing', async () => {
		const body = 'max_stamina: 20\ncurrent_stamina: 15\ncollapse_default: true';
		const m = await mount(new App(), noteOf([{ lang: 'ds-stamina-bar', body }]), 0, 'ds-stamina-bar', body);
		expect(m.root.getAttribute('data-dse-collapsed')).toBe('on');

		await damage(m, 3);
		// Class order (collapse_default before the stamina fields) is unchanged from before SC-466.
		expect(bodyOf(m.note(), 0)).toBe('collapse_default: true\nmax_stamina: 20\ncurrent_stamina: 12');
		expect(m.root.getAttribute('data-dse-collapsed')).toBe('on');

		const writes = m.app.vault.modifyCalls.length;
		(m.root.querySelector('[data-dse-chrome-item="collapse"]') as HTMLButtonElement).click();
		expect(m.root.getAttribute('data-dse-collapsed')).toBeNull();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(m.app.vault.modifyCalls.length).toBe(writes); // collapse is session state, never a note write
	});

	test('temp_stamina absent: a Damage that leaves it 0 keeps it absent; a temp-stamina gain writes it', async () => {
		const body = 'max_stamina: 20\ncurrent_stamina: 15';
		const m = await mount(new App(), noteOf([{ lang: 'ds-stamina-bar', body }]), 0, 'ds-stamina-bar', body);
		await damage(m, 3);
		expect(bodyOf(m.note(), 0)).not.toContain('temp_stamina');

		(m.root.querySelector('.dse-stamina') as HTMLElement).click();
		typeCommit(tempInput(lastModal()), '4');
		applyBtn(lastModal()).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(bodyOf(m.note(), 0)).toBe('max_stamina: 20\ncurrent_stamina: 12\ntemp_stamina: 4');
	});

	test('current_stamina absent: a Damage writes it', async () => {
		const body = 'max_stamina: 20';
		const m = await mount(new App(), noteOf([{ lang: 'ds-stamina-bar', body }]), 0, 'ds-stamina-bar', body);
		await damage(m, 3);
		expect(bodyOf(m.note(), 0)).toBe('max_stamina: 20\ncurrent_stamina: -3');
	});

	test('recoveries / recoveries_max / _dse_anchor behave as before: written in place by Catch Breath, nothing else added', async () => {
		const body = 'max_stamina: 30\ncurrent_stamina: 12\nrecoveries: 3\nrecoveries_max: 6\n_dse_anchor: abc123';
		const m = await mount(new App(), noteOf([{ lang: 'ds-stamina-bar', body }]), 0, 'ds-stamina-bar', body);
		(m.root.querySelector('button:has([data-icon="wind"])') as HTMLButtonElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(bodyOf(m.note(), 0)).toBe(
			'max_stamina: 30\ncurrent_stamina: 22\nrecoveries: 2\nrecoveries_max: 6\n_dse_anchor: abc123',
		);
	});

	test('two stamina-bar blocks in one note: the minimal one and the fully-authored one each write their own shape', async () => {
		const minimal = 'max_stamina: 20\ncurrent_stamina: 15';
		const full = [
			'collapsible: true',
			'collapse_default: false',
			'max_stamina: 10',
			'current_stamina: 8',
			'temp_stamina: 0',
			'height: 1',
			'style: default',
		].join('\n');
		const note = noteOf([
			{ lang: 'ds-stamina-bar', body: minimal },
			{ lang: 'ds-stamina-bar', body: full },
		]);
		const app = new App();
		const first = await mount(app, note, 0, 'ds-stamina-bar', minimal);
		const second = await mount(app, app.vault.getContent(NOTE)!, 1, 'ds-stamina-bar', full);
		await damage(first, 3);
		await damage(second, 2);
		const out = app.vault.getContent(NOTE)!;
		expect(bodyOf(out, 0)).toBe('max_stamina: 20\ncurrent_stamina: 12');
		expect(bodyOf(out, 1)).toBe(full.replace('current_stamina: 8', 'current_stamina: 6'));
	});

	test.each(['ds-stamina', 'ds-stamina-bar'])('the %s alias writes the same minimal body and keeps its own fence word', async (lang) => {
		const body = 'max_stamina: 20\ncurrent_stamina: 15';
		const m = await mount(new App(), noteOf([{ lang, body }]), 0, lang, body);
		await damage(m, 3);
		expect(m.note()).toContain(`\`\`\`${lang}\nmax_stamina: 20\ncurrent_stamina: 12\n\`\`\``);
	});

	test('content above and below the fence is untouched', async () => {
		const body = 'max_stamina: 20\ncurrent_stamina: 15';
		const before = noteOf([{ lang: 'ds-stamina-bar', body }]);
		const m = await mount(new App(), before, 0, 'ds-stamina-bar', body);
		await damage(m, 3);
		expect(m.note()).toBe(before.replace('current_stamina: 15', 'current_stamina: 12'));
	});
});

describe('SC-466: blocks the plugin builds itself keep the whole-instance output', () => {
	test('serialize() of a StaminaBar that was never parsed from a source still writes every key', () => {
		const built = new StaminaBar(false, false, 20, 15, 0, 1);
		expect(serialize(built)).toBe(
			'collapsible: false\ncollapse_default: false\nmax_stamina: 20\ncurrent_stamina: 15\ntemp_stamina: 0\nheight: 1\nstyle: default',
		);
	});
});

describe('SC-466: presence survives every writer of the block (in-place mutation of the parsed instance)', () => {
	const RECOV = 'max_stamina: 30\ncurrent_stamina: 12\nrecoveries: 3\nrecoveries_max: 6';

	async function mountMock(yaml: string) {
		const host = makeHost('ds-stamina-bar');
		await new ElementPipeline(makeDeps()).run(staminaBarElement, yaml, host);
		return { host, root: host.containerEl.firstElementChild as HTMLElement };
	}

	test('a Recoveries marker click writes only the keys the block declared', async () => {
		const { host, root } = await mountMock(RECOV);
		(root.querySelectorAll('.dse-stamina-rec__pip')[5] as HTMLElement).click(); // 3 -> 6
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(lastWrite(host)).toBe('max_stamina: 30\ncurrent_stamina: 12\nrecoveries: 6\nrecoveries_max: 6');
	});

	test('the undo toast (Catch Breath, then Undo) writes the pre-change shape, still without defaults', async () => {
		const { host, root } = await mountMock(RECOV);
		(root.querySelector('button:has([data-icon="wind"])') as HTMLButtonElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(lastWrite(host)).toBe('max_stamina: 30\ncurrent_stamina: 22\nrecoveries: 2\nrecoveries_max: 6');

		Notice.last!.noticeEl!.querySelector<HTMLElement>('.dse-undo-notice__action')!.click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(lastWrite(host)).toBe('max_stamina: 30\ncurrent_stamina: 12\nrecoveries: 3\nrecoveries_max: 6');
	});

	test('the Recoveries popover editor goes through the same write path', async () => {
		const deps = makeDeps();
		await deps.prefs.set('staminaRecoveryPopover', true);
		const host = makeHost('ds-stamina-bar');
		await new ElementPipeline(deps).run(staminaBarElement, RECOV, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		(root.querySelectorAll('.dse-stamina-rec__pip')[0] as HTMLElement).click(); // opens the popover, no write
		root.querySelector<HTMLButtonElement>('button[aria-label="Spend a recovery"]')!.click(); // 3 -> 2
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(lastWrite(host)).toBe('max_stamina: 30\ncurrent_stamina: 12\nrecoveries: 2\nrecoveries_max: 6');
	});
});
