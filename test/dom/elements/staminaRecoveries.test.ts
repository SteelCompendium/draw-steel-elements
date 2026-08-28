// D7 Task 4 (spec §4.2) — ds-stamina Recoveries / Winded extension: ADDITIVE optional
// `recoveries`/`recoveries_max` fields on the existing StaminaBar model, rendered by the
// SAME element (not a new one) only when `recoveries_max` is present.
//
// HARD INVARIANT (this suite does NOT re-test it, it is proven by the UNMODIFIED
// test/dom/elements/stamina-bar.test.ts byte-compat describe block): a block with no
// recoveries* fields never materializes them on serialize, and the pre-existing
// stamina-bar behavior/DOM is untouched. This suite covers the NEW, additive surface
// only: the recoveries pip row, the Catch Breath control, and the winded/dying badge.
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import { createRollService } from '../../../src/framework/roll/service';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Notice, Plugin } from '../../mocks/obsidian';
import { staminaBarElement } from '../../../src/elements/stamina-bar/definition';
import { DSE_PREF_DESCRIPTORS } from '../../../src/prefs/catalog';
import { FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from 'main';

/** The documented example block (docs/stamina-bar.md) plus the NEW recoveries fields. */
const RECOVERIES_YAML = [
	'max_stamina: 48',
	'current_stamina: 31',
	'temp_stamina: 0',
	'recoveries: 6',
	'recoveries_max: 10',
].join('\n');

/** The legacy shape: no recoveries* fields at all. */
const LEGACY_YAML = ['max_stamina: 20', 'current_stamina: 15', 'temp_stamina: 5'].join('\n');

function makeHost(overrides: Partial<BlockHost> = {}) {
	const replaceSource = jest.fn(async (_newSource: string) => true);
	const containerEl = document.createElement('div');
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language: 'ds-stam', lineStart: 0, lineEnd: 4 }),
		replaceSource,
		blockKey: () => 'Note.md::ds-stam::0',
		...overrides,
	};
	return host as BlockHost & { containerEl: HTMLElement; replaceSource: typeof replaceSource };
}

/** Real service instances, same convention as stamina-bar.test.ts's makeDeps(). */
function makeDeps(): ElementPipelineDeps {
	const app = new App();
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	prefs.describe(DSE_PREF_DESCRIPTORS);
	const theme = createThemeService(prefs, plugin as any);
	const refs = createReferenceService(app as any, DEFAULT_SETTINGS);
	const validation = createValidationService();
	for (const { id, schema } of FRAMEWORK_V2_DEPENDENCY_SCHEMAS) {
		validation.addDependencySchema(id, schema);
	}
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

/** Numeric value of a --dse-* percentage custom property on an element. */
function dseVar(el: HTMLElement, prop: string): number {
	const raw = el.style.getPropertyValue(prop);
	if (raw === '') throw new Error(`no ${prop} custom property set`);
	return parseFloat(raw);
}

afterEach(() => {
	document.body.innerHTML = '';
	jest.useRealTimers();
});

describe('D7 Task 4: ds-stamina Recoveries / Winded — additive, gated on recoveries_max', () => {
	test('legacy shape (no recoveries*): renders no pip row and no Catch Breath button', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(staminaBarElement, LEGACY_YAML, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelector('.dse-stamina-rec')).toBeNull();
		expect(root.querySelector('.dse-stamina-rec__pip')).toBeNull();
		expect(root.querySelector('button[aria-label="Catch Breath"]')).toBeNull();
	});

	test('recoveries_max present: renders 10 pips, 6 filled, plus a Catch Breath button', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(staminaBarElement, RECOVERIES_YAML, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const pips = root.querySelectorAll('.dse-stamina-rec__pip');
		expect(pips).toHaveLength(10);
		const filled = root.querySelectorAll('.dse-stamina-rec__pip--filled');
		expect(filled).toHaveLength(6);
		expect(root.querySelector('button[aria-label="Catch Breath"]')).not.toBeNull();
	});

	test('winded badge shows when current <= floor(max/2) (RR §8); hidden when healthy', async () => {
		const pipeline = new ElementPipeline(makeDeps());

		// max 48 -> winded threshold floor(48/2)=24. current 31 > 24: healthy, no badge.
		const healthyHost = makeHost();
		await pipeline.run(staminaBarElement, RECOVERIES_YAML, healthyHost);
		const healthyRoot = healthyHost.containerEl.firstElementChild as HTMLElement;
		const healthyStatus = healthyRoot.querySelector('.dse-stamina-rec__status') as HTMLElement;
		expect(healthyStatus.hidden).toBe(true);

		// current 24 (== threshold): winded, per "at half Stamina max OR BELOW".
		const windedHost = makeHost();
		await pipeline.run(
			staminaBarElement,
			['max_stamina: 48', 'current_stamina: 24', 'recoveries: 6', 'recoveries_max: 10'].join('\n'),
			windedHost,
		);
		const windedRoot = windedHost.containerEl.firstElementChild as HTMLElement;
		const windedStatus = windedRoot.querySelector('.dse-stamina-rec__status') as HTMLElement;
		expect(windedStatus.hidden).toBe(false);
		expect(windedStatus.getAttribute('data-state')).toBe('winded');
		expect(windedStatus.textContent).toBe('Winded');

		// current 0: dying (takes priority over winded).
		const dyingHost = makeHost();
		await pipeline.run(
			staminaBarElement,
			['max_stamina: 48', 'current_stamina: 0', 'recoveries: 6', 'recoveries_max: 10'].join('\n'),
			dyingHost,
		);
		const dyingRoot = dyingHost.containerEl.firstElementChild as HTMLElement;
		const dyingStatus = dyingRoot.querySelector('.dse-stamina-rec__status') as HTMLElement;
		expect(dyingStatus.hidden).toBe(false);
		expect(dyingStatus.getAttribute('data-state')).toBe('dying');
		expect(dyingStatus.textContent).toBe('Dying');
	});

	test('Catch Breath: heals floor(48/3)=16 stamina, decrements recoveries, refreshes bar+pips in place, and persists', async () => {
		jest.useFakeTimers();
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(staminaBarElement, RECOVERIES_YAML, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const bar = root.querySelector('.dse-stamina') as HTMLElement;
		const fill = bar.querySelector('.dse-stamina__fill') as HTMLElement;
		const pill = bar.querySelector('.dse-stamina__num .dse-stamina__pill') as HTMLElement;
		const fillBefore = dseVar(fill, '--dse-fill');
		const catchBreathBtn = root.querySelector('button[aria-label="Catch Breath"]') as HTMLButtonElement;

		catchBreathBtn.click();

		// current 31 -> 31 + floor(48/3)=16 -> 47; recoveries 6 -> 5. Targeted update: the
		// SAME fill/pill nodes, no rebuild.
		expect(bar.querySelector('.dse-stamina__fill')).toBe(fill);
		expect(pill.textContent).toBe('(47/48)');
		expect(dseVar(fill, '--dse-fill')).not.toBe(fillBefore);
		const filledPips = root.querySelectorAll('.dse-stamina-rec__pip--filled');
		expect(filledPips).toHaveLength(5);

		expect(host.replaceSource).not.toHaveBeenCalled(); // still inside the debounce window
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			[
				'collapsible: true',
				'collapse_default: false',
				'max_stamina: 48',
				'current_stamina: 47',
				'temp_stamina: 0',
				'recoveries: 5',
				'recoveries_max: 10',
				'height: 1',
				'style: default',
			].join('\n'),
		);
	});

	test('Catch Breath is disabled (real `disabled` property) when no recoveries remain', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(
			staminaBarElement,
			['max_stamina: 48', 'current_stamina: 31', 'recoveries: 0', 'recoveries_max: 10'].join('\n'),
			host,
		);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const catchBreathBtn = root.querySelector('button[aria-label="Catch Breath"]') as HTMLButtonElement;
		expect(catchBreathBtn.disabled).toBe(true);
	});

	test('Catch Breath is disabled while dying (RR §8: "Can\'t Catch Breath")', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(
			staminaBarElement,
			['max_stamina: 48', 'current_stamina: 0', 'recoveries: 6', 'recoveries_max: 10'].join('\n'),
			host,
		);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const catchBreathBtn = root.querySelector('button[aria-label="Catch Breath"]') as HTMLButtonElement;
		expect(catchBreathBtn.disabled).toBe(true);
	});

	test('canPersist: false — Catch Breath is real-disabled and clicking it writes nothing', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost({ canPersist: false });

		await pipeline.run(staminaBarElement, RECOVERIES_YAML, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		// canPersist: false stamps the read-only reason as Catch Breath's OWN aria-label
		// (native setTooltip's side effect — FOLLOWUPS #27-fix-round finding 1's class of
		// bug), so it's found by its stable icon here, not the (now-replaced) label text.
		const catchBreathBtn = root.querySelector('button:has([data-icon="wind"])') as HTMLButtonElement;
		expect(catchBreathBtn.disabled).toBe(true);

		document.body.appendChild(host.containerEl);
		try {
			catchBreathBtn.click();
			expect(host.replaceSource).not.toHaveBeenCalled();
		} finally {
			document.body.removeChild(host.containerEl);
		}
	});

	test('editing stamina via the modal refreshes the winded/dying badge and Catch Breath disabled state too', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		// current 31, max 48: healthy at mount.
		await pipeline.run(staminaBarElement, RECOVERIES_YAML, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const bar = root.querySelector('.dse-stamina') as HTMLElement;
		const status = root.querySelector('.dse-stamina-rec__status') as HTMLElement;
		expect(status.hidden).toBe(true);

		bar.click();
		const modalEl = document.body.lastElementChild as HTMLElement;
		const killBtn = modalEl.querySelector('button[aria-label="Kill"]') as HTMLButtonElement;
		killBtn.click();
		const applyBtn = modalEl.querySelector('.dse-modal__footer .dse-btn--accent') as HTMLButtonElement;
		applyBtn.click();

		// Kill drops current_stamina to the negative death floor -> dying.
		expect(status.hidden).toBe(false);
		expect(status.getAttribute('data-state')).toBe('dying');
		const catchBreathBtn = root.querySelector('button[aria-label="Catch Breath"]') as HTMLButtonElement;
		expect(catchBreathBtn.disabled).toBe(true);
	});
});

/* ==================================================================== */
/*  SC-132 — Model M: the markers are a VALUE CONTROL                    */
/* ==================================================================== */
/*
   Scott approved this model in comment 59638cd9 on the strength of two arguments, and
   both are what these tests actually pin:

     * SET, not toggle. RAW loses recoveries in MULTIPLES ("the target loses 1d3
       Recoveries"), so a toggle would need three clicks for one monster rider.
     * The two EDGES behave the way a reader predicts — the last available marker spends
       exactly one, the first spent marker restores exactly one — so no click is a no-op
       and neither end of the row is a trap.

   Plus the answer to "I dont want a missclick to be super punishing": every mutation
   posts an undo toast, and clicking Undo puts the model back.
*/

/** All markers in the strip, in DOM order. */
function pips(root: HTMLElement): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>('.dse-stamina-rec__pip'));
}

async function mountRecoveries(overrides: {
	yaml?: string;
	popover?: boolean;
	canPersist?: boolean;
} = {}) {
	const deps = makeDeps();
	if (overrides.popover) await deps.prefs.set('staminaRecoveryPopover', true);
	const pipeline = new ElementPipeline(deps);
	const host = makeHost(overrides.canPersist === false ? { canPersist: false } : {});
	await pipeline.run(staminaBarElement, overrides.yaml ?? RECOVERIES_YAML, host);
	const root = host.containerEl.firstElementChild as HTMLElement;
	return { root, host, deps };
}

describe('SC-132 Model M: a marker click SETS the count', () => {
	test('clicking the LAST AVAILABLE marker spends exactly one (6 -> 5)', async () => {
		const { root } = await mountRecoveries();
		pips(root)[5].click(); // 0-based: the 6th marker, the last filled one
		expect(pips(root).filter((p) => p.hasClass('dse-stamina-rec__pip--filled')).length).toBe(5);
	});

	test('clicking the FIRST SPENT marker restores exactly one (6 -> 7)', async () => {
		const { root } = await mountRecoveries();
		pips(root)[6].click(); // the 7th marker, the first empty one
		expect(pips(root).filter((p) => p.hasClass('dse-stamina-rec__pip--filled')).length).toBe(7);
	});

	test('a distant marker sets the count in ONE click, in either direction', async () => {
		const { root } = await mountRecoveries();
		pips(root)[1].click(); // spend four at once (the 1d3-Recoveries case, and worse)
		expect(pips(root).filter((p) => p.hasClass('dse-stamina-rec__pip--filled')).length).toBe(1);
		pips(root)[9].click(); // …and back to full
		expect(pips(root).filter((p) => p.hasClass('dse-stamina-rec__pip--filled')).length).toBe(10);
	});

	test('the two edge cells: marker 1 empties the pool and refills it', async () => {
		const { root } = await mountRecoveries();
		pips(root)[0].click(); // 6 -> 0 (index 0 < 6, so the target IS 0)
		expect(pips(root).filter((p) => p.hasClass('dse-stamina-rec__pip--filled')).length).toBe(0);
		pips(root)[0].click(); // 0 -> 1 (index 0 is now spent, so the target is 1)
		expect(pips(root).filter((p) => p.hasClass('dse-stamina-rec__pip--filled')).length).toBe(1);
	});

	test('the change persists through the SAME debounced write path as every other edit', async () => {
		jest.useFakeTimers();
		const { root, host } = await mountRecoveries();
		pips(root)[5].click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toContain('recoveries: 5');
	});

	test('the row is ONE keyboard value control, not ten tab stops', async () => {
		const { root } = await mountRecoveries();
		const row = root.querySelector<HTMLElement>('.dse-stamina-rec__pips')!;
		expect(row.getAttribute('role')).toBe('slider');
		expect(row.getAttribute('tabindex')).toBe('0');
		expect(row.getAttribute('aria-valuenow')).toBe('6');
		expect(row.getAttribute('aria-valuemax')).toBe('10');
		expect(pips(root).every((p) => !p.hasAttribute('tabindex'))).toBe(true);

		row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
		expect(row.getAttribute('aria-valuenow')).toBe('5');
		row.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
		expect(row.getAttribute('aria-valuenow')).toBe('10');
		row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
		expect(row.getAttribute('aria-valuenow')).toBe('0');
	});

	test('the tooltip carries the fraction on every form, including where the eyebrow stands down', async () => {
		const { root } = await mountRecoveries();
		const row = root.querySelector<HTMLElement>('.dse-stamina-rec__pips')!;
		expect(row.getAttribute('aria-valuetext')).toBe('Recoveries: 6 / 10');
		pips(root)[5].click();
		expect(row.getAttribute('aria-valuetext')).toBe('Recoveries: 5 / 10');
	});

	test('read-only (canPersist false): the markers are inert and clicking one writes nothing', async () => {
		jest.useFakeTimers();
		const { root, host } = await mountRecoveries({ canPersist: false });
		const row = root.querySelector<HTMLElement>('.dse-stamina-rec__pips')!;
		expect(row.getAttribute('aria-disabled')).toBe('true');
		expect(row.hasAttribute('tabindex')).toBe(false);

		pips(root)[1].click();
		expect(pips(root).filter((p) => p.hasClass('dse-stamina-rec__pip--filled')).length).toBe(6);
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
		expect(host.replaceSource).not.toHaveBeenCalled();
	});

	test('markers are grouped in FOURS for countability (G4), and the first marker never starts a group', async () => {
		const { root } = await mountRecoveries();
		const starts = pips(root)
			.map((p, i) => (p.getAttribute('data-grp') === 'start' ? i : -1))
			.filter((i) => i >= 0);
		expect(starts).toEqual([4, 8]);
	});
});

describe('SC-132: the undo toast', () => {
	beforeEach(() => {
		Notice.notices.length = 0;
		Notice.last = null;
	});

	test('a marker edit posts a toast naming the change, and Undo restores the count', async () => {
		const { root } = await mountRecoveries();
		pips(root)[1].click(); // 6 -> 1 (index 1 is still available, so it spends down TO it)

		expect(Notice.notices[Notice.notices.length - 1]).toContain('Recoveries: 6 → 1');
		const undo = Notice.last!.noticeEl!.querySelector<HTMLElement>('.dse-undo-notice__action')!;
		expect(undo).not.toBeNull();

		undo.click();
		expect(pips(root).filter((p) => p.hasClass('dse-stamina-rec__pip--filled')).length).toBe(6);
	});

	test('Undo is spent once: a second click cannot undo the undo', async () => {
		const { root } = await mountRecoveries();
		pips(root)[1].click();
		const undo = Notice.last!.noticeEl!.querySelector<HTMLElement>('.dse-undo-notice__action')!;
		undo.click();
		undo.click();
		expect(pips(root).filter((p) => p.hasClass('dse-stamina-rec__pip--filled')).length).toBe(6);
	});

	test('Catch Breath posts a toast too, and Undo restores BOTH the recovery and the Stamina', async () => {
		const { root } = await mountRecoveries();
		const before = root.querySelector('.dse-stamina__ccur')!.textContent;
		root.querySelector<HTMLButtonElement>('button:has([data-icon="wind"])')!.click();

		expect(root.querySelector('.dse-stamina__ccur')!.textContent).not.toBe(before);
		expect(Notice.notices[Notice.notices.length - 1]).toContain('Caught breath');

		Notice.last!.noticeEl!.querySelector<HTMLElement>('.dse-undo-notice__action')!.click();
		expect(root.querySelector('.dse-stamina__ccur')!.textContent).toBe(before);
		expect(pips(root).filter((p) => p.hasClass('dse-stamina-rec__pip--filled')).length).toBe(6);
	});

	// L1 (review): each toast closes over the value BEFORE its own change, so a stack of
	// them is a stack of stale snapshots — undoing the second of three would write a count
	// that was never adjacent to the current state.
	test('only ONE undo is ever live: a new change dismisses the previous toast', async () => {
		const { root } = await mountRecoveries();
		pips(root)[3].click(); // 6 -> 3
		const first = Notice.last!;
		pips(root)[0].click(); // 3 -> 0
		const second = Notice.last!;

		expect(second).not.toBe(first);
		expect(first.isHidden).toBe(true);
		expect(second.isHidden).toBe(false);
		// The live one undoes the LAST change, back to the state just before it.
		second.noticeEl!.querySelector<HTMLElement>('.dse-undo-notice__action')!.click();
		expect(pips(root).filter((p) => p.hasClass('dse-stamina-rec__pip--filled')).length).toBe(3);
	});

	// SC-205 — the Undo affordance must stay a NON-`button` element, and that is a load-
	// bearing constraint rather than a stylistic one.
	//
	// Obsidian's app.css reaches plugin controls through TYPE selectors — `button`,
	// `button:not(.clickable-icon)`, `button:hover`, `button:focus-visible`,
	// `button[disabled]`. Everything the plugin renders as a real `<button>` therefore wears
	// the host's height, box-shadow, colour and cursor unless this sheet re-grounds it, which
	// is the whole SC-203 "PLUGIN-WIDE HOST RE-GROUNDING" block at the foot of
	// styles-source.css and the whole point of `assertBtnHostLeak`.
	//
	// A notice is the one place none of that protection exists: Obsidian renders it OUTSIDE
	// any `[data-dse-element]` root, and the re-grounding block is anchored on
	// `:is([data-dse-element], .dse-modal)`. So an `<a role="button">` here is not an
	// accessibility flourish — it is the only reason this control escapes the host leak set
	// entirely. Turning it into a `<button>` would silently hand it Obsidian's 30px
	// `--input-height` and five-layer `--input-shadow`, in a spot no gate is watching.
	test('the Undo affordance is not a <button>: a notice sits outside the host re-grounding', async () => {
		const { root } = await mountRecoveries();
		pips(root)[1].click();
		const undo = Notice.last!.noticeEl!.querySelector<HTMLElement>('.dse-undo-notice__action')!;

		expect(undo).not.toBeNull();
		expect(undo.tagName).toBe('A');
		expect(undo.tagName).not.toBe('BUTTON');
		expect(undo.closest('button')).toBeNull();
		// …and it still reads and behaves as a button for everyone who is not app.css.
		expect(undo.getAttribute('role')).toBe('button');
		expect(undo.getAttribute('tabindex')).toBe('0');
	});

	test('a no-op click posts nothing (there is nothing to undo)', async () => {
		const { root } = await mountRecoveries();
		// Model M has no no-op MARKER, so the no-op has to come from the keyboard's floor.
		const row = root.querySelector<HTMLElement>('.dse-stamina-rec__pips')!;
		row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })); // 6 -> 0
		Notice.notices.length = 0;
		row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); // already 0
		expect(Notice.notices).toHaveLength(0);
	});
});

describe('SC-132: the ALT stepper popover is a SETTING, off by default', () => {
	test('default (off): a marker click commits directly and no popover is built', async () => {
		const { root } = await mountRecoveries();
		pips(root)[5].click();
		expect(root.querySelector('.dse-stamina-rec__pop')).toBeNull();
		expect(pips(root).filter((p) => p.hasClass('dse-stamina-rec__pip--filled')).length).toBe(5);
	});

	test('on: a marker click opens the popover and changes NOTHING until a control in it is used', async () => {
		const { root } = await mountRecoveries({ popover: true });
		pips(root)[1].click();

		const pop = root.querySelector<HTMLElement>('.dse-stamina-rec__pop')!;
		expect(pop).not.toBeNull();
		// The whole point of the ALT editor: a stray click is structurally incapable of
		// changing anything.
		expect(pips(root).filter((p) => p.hasClass('dse-stamina-rec__pip--filled')).length).toBe(6);
		expect(pop.querySelector('.dse-stamina-rec__pop-val')!.textContent).toBe('6 / 10');

		pop.querySelector<HTMLButtonElement>('button[aria-label="Spend a recovery"]')!.click();
		expect(pips(root).filter((p) => p.hasClass('dse-stamina-rec__pip--filled')).length).toBe(5);
		pop.querySelector<HTMLButtonElement>('button[aria-label="Restore a recovery"]')!.click();
		expect(pips(root).filter((p) => p.hasClass('dse-stamina-rec__pip--filled')).length).toBe(6);
	});

	// M5 (review): the setting's premise is "a stray input cannot change anything", and a
	// stray arrow key is a stray input. A version that intercepted the mouse and let the
	// keyboard commit straight through would be the setting only half-on.
	test('on: the KEYBOARD is gated too — a value key opens the popover instead of committing', async () => {
		const { root } = await mountRecoveries({ popover: true });
		const row = root.querySelector<HTMLElement>('.dse-stamina-rec__pips')!;
		for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
			row.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
			expect({ key, value: row.getAttribute('aria-valuenow') }).toEqual({ key, value: '6' });
		}
		expect(root.querySelector('.dse-stamina-rec__pop')).not.toBeNull();
		// …and the popover's own controls still do the edit, so the keyboard is gated, not
		// disabled: those are real buttons in the tab order.
		root.querySelector<HTMLButtonElement>('button[aria-label="Spend a recovery"]')!.click();
		expect(row.getAttribute('aria-valuenow')).toBe('5');
	});

	test('off: the keyboard commits directly (the shipped default is unchanged)', async () => {
		const { root } = await mountRecoveries();
		const row = root.querySelector<HTMLElement>('.dse-stamina-rec__pips')!;
		row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
		expect(row.getAttribute('aria-valuenow')).toBe('5');
		expect(root.querySelector('.dse-stamina-rec__pop')).toBeNull();
	});

	test('on: a click outside the strip dismisses the popover', async () => {
		const { root } = await mountRecoveries({ popover: true });
		document.body.appendChild(root);
		pips(root)[1].click();
		expect(root.querySelector('.dse-stamina-rec__pop')).not.toBeNull();

		document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(root.querySelector('.dse-stamina-rec__pop')).toBeNull();
	});
});
