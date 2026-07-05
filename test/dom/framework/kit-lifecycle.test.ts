// Plan 05 Task 1 (kit hardening) — per-cycle listener/modal-close teardown.
//
// The bug (survey §5): componentWrapper's renderBody() runs at mount and again on every
// expand; each pass invoked options.renderContent(contentEl) with only the LONG-LIVED view
// Component available to bind listeners to. bodyEl.empty() clears DOM but does NOT release
// Component.registerDomEvent/register handles, so every collapse↔expand cycle stacked one
// more set of live registrations on the view — released only at view unload. Separately,
// StaminaBarView.openEditModal() registered a fresh `this.register(() => modal.close())`
// on EVERY bar click; N opens ⇒ N pending closers all firing on unload.
//
// The contract under test (the fix): renderContent(contentEl, contentOwner) — contentOwner
// is a fresh child Component per render cycle (owner.addChild), unloaded via
// owner.removeChild before the next renderBody pass, so content-internal registrations
// live exactly one expand cycle. The wrapper's own eye-toggle stays view-lifetime on
// `owner` (unchanged). Stamina-bar holds exactly ONE pending modal closer regardless of
// how many times the modal was opened, and unload still closes an open modal (F1 §4.5).
import { mountComponentWrapper } from '../../../src/framework/kit/componentWrapper';
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin, Component, Modal } from '../../mocks/obsidian';
import { staminaBarElement } from '../../../src/elements/stamina-bar/definition';
import type { StaminaBarView } from '../../../src/elements/stamina-bar/view';
import { FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from 'main';

// Same convention as component-wrapper.test.ts / seams.test.ts: the mock Component's
// self-referencing generics don't structurally satisfy the real `obsidian` Component type
// under tsc; the owner is only ever used for its real runtime shape.
function fakeOwner(): any {
	const owner = new Component();
	// Production views are loaded (host.addChild → render-child load) before a user can
	// interact; load the owner so kit-added child Components go through the real
	// load/unload lifecycle rather than the mock's unguarded teardown.
	owner.load();
	return owner;
}

describe('Plan 05 Task 1: componentWrapper content registrations are per-cycle (contentOwner)', () => {
	const CYCLES = 5;

	/** Mounts a wrapper whose renderContent registers ONE register() subscription and ONE
	 *  registerDomEvent on a target that outlives the content DOM (document.body) — the two
	 *  registration kinds the survey flagged as accumulating per expand. */
	function mountCountingWrapper(owner: any) {
		const counters = { registered: 0, live: 0 };
		const domSpy = jest.fn();
		const handle = mountComponentWrapper(document.createElement('div'), owner, {
			componentName: 'Widget',
			collapsible: true,
			collapsed: false,
			renderContent: (contentEl, contentOwner) => {
				contentEl.createDiv({ cls: 'payload' });
				counters.registered++;
				counters.live++;
				contentOwner.register(() => counters.live--);
				// Accumulation here is user-visible: a leaked listener on a long-lived
				// target fires once per leaked cycle. A FRESH closure per render (as real
				// content code produces) — addEventListener dedupes identical references,
				// so reusing `domSpy` directly would mask the accumulation.
				contentOwner.registerDomEvent(document.body, 'click', (event: Event) => domSpy(event));
			},
			onToggle: () => {},
		});
		const eye = handle.wrapperEl.querySelector('.ds-kit-eye-indicator') as HTMLElement;
		return { handle, eye, counters, domSpy };
	}

	test(`${CYCLES} collapse↔expand cycles leave exactly ONE live registration, not ${CYCLES + 1}`, () => {
		const owner = fakeOwner();
		const { eye, counters, domSpy } = mountCountingWrapper(owner);

		for (let i = 0; i < CYCLES; i++) {
			eye.click(); // collapse — must unload the previous cycle's contentOwner
			eye.click(); // expand — fresh contentOwner, fresh registrations
		}

		expect(counters.registered).toBe(CYCLES + 1); // renderContent DID run on every expand…
		expect(counters.live).toBe(1); // …but only the LAST cycle's registrations are live

		document.body.click();
		expect(domSpy).toHaveBeenCalledTimes(1); // one live body listener, not CYCLES+1

		owner.unload();
	});

	test('collapsing releases the content registrations immediately (not at view unload)', () => {
		const owner = fakeOwner();
		const { eye, counters, domSpy } = mountCountingWrapper(owner);
		expect(counters.live).toBe(1);

		eye.click(); // collapse

		expect(counters.live).toBe(0);
		document.body.click();
		expect(domSpy).not.toHaveBeenCalled();

		owner.unload();
	});

	test('owner.unload() releases the last cycle; the eye toggle itself stays view-lifetime across cycles', () => {
		const owner = fakeOwner();
		const { handle, eye, counters, domSpy } = mountCountingWrapper(owner);

		eye.click();
		eye.click();
		// The wrapper's own eye toggle is registered on `owner` (view-lifetime) and must
		// survive content-owner teardown cycles.
		expect(handle.isCollapsed()).toBe(false);
		expect(counters.live).toBe(1);

		owner.unload();

		expect(counters.live).toBe(0);
		document.body.click();
		expect(domSpy).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------------
// Stamina-bar modal-close accumulation — driven through the REAL ElementPipeline with
// real framework services (same convention as stamina-bar.test.ts).

const BASIC_YAML = ['max_stamina: 20', 'current_stamina: 15', 'temp_stamina: 5'].join('\n');

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

function makeDeps(): ElementPipelineDeps {
	const app = new App();
	const plugin = new Plugin(app);
	const theme = createThemeService();
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
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
	};
}

describe('Plan 05 Task 1 (carried onto D2/Task 3): stamina-bar modal-close does not accumulate per bar click', () => {
	test('N open→close cycles + one left open: unload fires exactly ONE real close (F1 §4.5 still closes the open modal)', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const addChild = jest.fn((child: unknown) => child);
		const hostWithSpy = { ...host, addChild };

		await pipeline.run(staminaBarElement, BASIC_YAML, hostWithSpy as BlockHost);
		const view = addChild.mock.calls[0][0] as StaminaBarView;
		const root = host.containerEl.firstElementChild as HTMLElement;
		const bar = root.querySelector('.dse-stamina') as HTMLElement;

		// Three user open→close cycles (Apply closes the modal). The unified Task-3
		// modal's apply button is REAL-disabled at "No Stamina Change" (CB-8), so each
		// cycle makes a change first (alternating Kill / Full Heal keeps it non-zero).
		for (let i = 0; i < 3; i++) {
			bar.click();
			const modalEl = document.body.lastElementChild as HTMLElement;
			expect(modalEl.classList.contains('modal-container')).toBe(true);
			const quick = i % 2 === 0 ? 'Kill' : 'Full Heal';
			(modalEl.querySelector(`button[aria-label="${quick}"]`) as HTMLElement).click();
			(modalEl.querySelector('.dse-modal__footer .dse-btn--accent') as HTMLElement).click();
			expect(document.body.contains(modalEl)).toBe(false);
		}
		// …then a fourth open left OPEN at unload time.
		bar.click();
		const openModalEl = document.body.lastElementChild as HTMLElement;
		expect(openModalEl.classList.contains('modal-container')).toBe(true);

		const closeSpy = jest.spyOn(Modal.prototype, 'close');
		try {
			view.unload();

			// F1 §4.5 still holds: the modal that is actually open IS closed on unload…
			expect(document.body.contains(openModalEl)).toBe(false);
			// …and exactly ONE close reaches Modal.close. The guarantee's carrier moved
			// in Task 3: openManagedModal registers one closer per open, but DseModal's
			// idempotent close() (dseOpen guard) makes the three already-closed modals'
			// closers no-ops that never reach Modal.close — the historical "N pending
			// closers all re-firing real closes on unload" bug stays dead.
			expect(closeSpy).toHaveBeenCalledTimes(1);
		} finally {
			closeSpy.mockRestore();
		}
	});
});
