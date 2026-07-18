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
import { App, Plugin } from '../../mocks/obsidian';
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
		const catchBreathBtn = root.querySelector('button[aria-label="Catch Breath"]') as HTMLButtonElement;
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
