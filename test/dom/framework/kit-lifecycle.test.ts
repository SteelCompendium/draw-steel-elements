// Plan 05 Task 1 (kit hardening) — modal-close teardown does not accumulate.
//
// The bug (survey §5, the surviving half): StaminaBarView.openEditModal() registered a
// fresh `this.register(() => modal.close())` on EVERY bar click; N opens ⇒ N pending
// closers all firing real closes on unload. The contract under test: exactly ONE real
// close reaches Modal.close on unload regardless of how many times the modal was opened,
// and unload still closes a modal that is actually open (F1 §4.5).
//
// (This file's other half — componentWrapper's per-cycle contentOwner registrations —
// was deleted with mountComponentWrapper itself in Plan 09 Task 10: every element now
// mounts the D2 kit `collapsible`, which hides its region instead of re-rendering it,
// so there is no per-expand render cycle left to leak.)
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
import { App, Plugin, Modal } from '../../mocks/obsidian';
import { staminaBarElement } from '../../../src/elements/stamina-bar/definition';
import type { StaminaBarView } from '../../../src/elements/stamina-bar/view';
import { FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from 'main';

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
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
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
