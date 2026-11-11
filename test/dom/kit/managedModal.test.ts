// Plan 08 Task 3 (D2 §2.6) — kit/managedModal: DseModal (extends Obsidian Modal) with
// setDseTitle → aria-labelledby, a scrollable .dse-modal__body, a footer of Task-2
// iconButtons (REAL <button>s with the REAL disabled property — CB-8 in modals), and
// initial focus to the first control; plus openManagedModal(owner, factory) which
// registers the F1 §4.5 view-unload-closes-modal contract via owner.register().
// Escape-close + focus trap stay Obsidian Modal defaults (not reimplemented here).
import { DseModal, openManagedModal } from '../../../src/framework/kit/managedModal';
import { stepper } from '../../../src/framework/kit/stepper';
import { consumeEscapeAt } from '../../../src/framework/kit/escapeConsumer';
import { attachObsidianKeymap, pressEscape } from '../_obsidianKeymap';
import { createPreferenceStore, registerPrefsForApp } from '../../../src/framework/seams/prefs';
import type { PrefDescriptor, PreferenceStore, PrefsStorage } from '../../../src/framework/seams/prefs';
import { DSE_PREF_DESCRIPTORS } from '../../../src/prefs/catalog';
import { createThemeService, registerThemeServiceForApp } from '../../../src/framework/seams/theme';
import type { ThemeServiceInternal } from '../../../src/framework/seams/theme';
import { App, Component, Scope } from '../../mocks/obsidian';
import * as fs from 'fs';
import * as path from 'path';

// SC-337: real Obsidian's owner Component (a view/plugin) is always loaded by its parent
// by the time it opens a managed modal — a loaded fixture is the faithful default, since
// an unloaded Component's unload() is now a guarded no-op (SC-340 fix-round-1).
function fakeOwner(): any {
	const owner = new Component();
	owner.load();
	return owner;
}

function makeModal(app: any = new App() as any): DseModal {
	return new DseModal(app);
}

// -------------------------------------------------- theme-stamping test helpers

/** In-memory fake standing in for the injected saveData-like storage backend
 *  (mirrors test/dom/framework/seams.test.ts's makeStorage). */
function makeStorage(initial?: Record<string, unknown>): PrefsStorage {
	let data: Record<string, unknown> | undefined = initial;
	return {
		async get() {
			return data as any;
		},
		async set(prefs: any) {
			data = prefs;
		},
	};
}

/** Prefs-backed ThemeService (mirrors seams.test.ts's makeTheme), registered against
 *  `app` so DseModal.open() can find it via themeServiceForApp(this.app). */
function makeRegisteredTheme(app: any, initial?: Record<string, unknown>): ThemeServiceInternal {
	const prefs = createPreferenceStore(makeStorage(initial));
	const pluginOwner = fakeOwner();
	pluginOwner.load();
	const theme = createThemeService(prefs, pluginOwner);
	registerThemeServiceForApp(app, theme);
	return theme;
}

/** setActive persists via a fire-and-forget prefs.set (notify lands after the async
 *  storage write) — settle those microtasks before asserting fan-out effects. */
async function flushAsync(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

// ---------------------------------------------------- SC-112 prefs-css test helpers

/** Same widen-cast convention as test/dom/framework/seams.test.ts: exercise a
 *  test-only css-bearing key without augmenting the real DsePrefs interface. */
type WidePreferenceStore = {
	set(key: string, value: unknown): Promise<void>;
	describe(descriptors: readonly PrefDescriptor[]): void;
};
function widen(store: PreferenceStore): WidePreferenceStore {
	return store as unknown as WidePreferenceStore;
}

/** css-only descriptor (mirrors a real font pref: default `''` → `toCss` returns
 *  `null`, i.e. "remove the override"; any other value passes through as-is). */
function fontTitleDescriptor(attr?: string): PrefDescriptor {
	return {
		key: 'fontTitle',
		default: '',
		attr,
		css: { varName: '--dse-font-title', toCss: (v: unknown) => (v === '' ? null : String(v)) },
	} as unknown as PrefDescriptor;
}

/** PreferenceStore registered against `app` (mirrors makeRegisteredTheme above) —
 *  DseModal.open() looks it up via prefsForApp(this.app) to call reflectCss(). */
function makeRegisteredPrefs(app: any, descriptor: PrefDescriptor = fontTitleDescriptor()): WidePreferenceStore {
	const store = createPreferenceStore(makeStorage());
	const wide = widen(store);
	wide.describe([descriptor]);
	registerPrefsForApp(app, store);
	return wide;
}

/** SC-230: the REAL shipped catalog (mirrors fontPrefs.smoke.test.ts's makeStore),
 *  not a fake descriptor — proves the pref-stamping side of the text/card-scale
 *  diagnosis works generically for the shipped textScale/cardScale descriptors,
 *  same mechanism the fontTitle tests above already pin. */
function makeRegisteredRealPrefs(app: any): PreferenceStore {
	const store = createPreferenceStore(makeStorage());
	store.describe(DSE_PREF_DESCRIPTORS);
	registerPrefsForApp(app, store);
	return store;
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('Plan 08 Task 3: kit/managedModal (D2 §2.6)', () => {
	describe('structure', () => {
		test('the dialog root gains .dse-modal and the body is a .dse-modal__body inside contentEl', () => {
			const modal = makeModal();
			expect(modal.containerEl.hasClass('dse-modal')).toBe(true);
			expect(modal.body.hasClass('dse-modal__body')).toBe(true);
			expect(modal.contentEl.contains(modal.body)).toBe(true);
		});

		test('section() creates a .dse-modal__section panel inside the body', () => {
			const modal = makeModal();
			const section = modal.section();
			expect(section.hasClass('dse-modal__section')).toBe(true);
			expect(modal.body.contains(section)).toBe(true);
		});
	});

	describe('setDseTitle — aria-labelledby → the title (§4.3)', () => {
		test('sets the title text, ids it, and points aria-labelledby at it', () => {
			const modal = makeModal();
			modal.setDseTitle('Edit Stamina');

			expect(modal.titleEl.textContent).toBe('Edit Stamina');
			expect(modal.titleEl.hasClass('dse-modal__title')).toBe(true);
			expect(modal.titleEl.id).not.toBe('');
			expect(modal.containerEl.getAttribute('aria-labelledby')).toBe(modal.titleEl.id);
		});

		test('re-titling updates the text but keeps the SAME id (aria wiring stays valid)', () => {
			const modal = makeModal();
			modal.setDseTitle('First');
			const id = modal.titleEl.id;
			modal.setDseTitle('Second');
			expect(modal.titleEl.textContent).toBe('Second');
			expect(modal.titleEl.id).toBe(id);
			expect(modal.containerEl.getAttribute('aria-labelledby')).toBe(id);
		});

		test('two modals get DISTINCT title ids', () => {
			const a = makeModal();
			const b = makeModal();
			a.setDseTitle('A');
			b.setDseTitle('B');
			expect(a.titleEl.id).not.toBe(b.titleEl.id);
		});

		// SC-230 r3 (LOW-1): the title text lives in its own span so styles-source.css's
		// `.dse-modal__title-text` rule can multiply Obsidian's own (version-dependent)
		// title font-size by --dse-text-scale without ever touching `.modal-title` itself.
		test('the title text is wrapped in a single .dse-modal__title-text span, not written directly onto titleEl', () => {
			const modal = makeModal();
			modal.setDseTitle('Conditions');

			const span = modal.titleEl.querySelector('.dse-modal__title-text');
			expect(span).not.toBeNull();
			expect(span?.textContent).toBe('Conditions');
			expect(modal.titleEl.children.length).toBe(1);
		});

		test('re-titling replaces the span in place (no stray extra spans accumulate)', () => {
			const modal = makeModal();
			modal.setDseTitle('First');
			modal.setDseTitle('Second');

			expect(modal.titleEl.querySelectorAll('.dse-modal__title-text').length).toBe(1);
			expect(modal.titleEl.querySelector('.dse-modal__title-text')?.textContent).toBe('Second');
		});
	});

	describe('footer — Task-2 iconButtons: REAL <button>s with REAL disabled (CB-8)', () => {
		test('builds a .dse-modal__footer of real buttons after the body', () => {
			const modal = makeModal();
			const onCancel = jest.fn();
			const onApply = jest.fn();

			const handles = modal.footer([
				{ label: 'Cancel', text: 'Cancel', variant: 'ghost', onClick: onCancel },
				{ label: 'Apply', text: 'Apply', variant: 'accent', onClick: onApply },
			]);

			const footerEl = modal.contentEl.querySelector('.dse-modal__footer')!;
			expect(footerEl).not.toBeNull();
			// Footer follows the body in DOM order.
			expect(modal.body.compareDocumentPosition(footerEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

			const buttons = footerEl.querySelectorAll('button.dse-btn');
			expect(buttons).toHaveLength(2);
			expect(handles).toHaveLength(2);
			expect(handles[0].buttonEl).toBeInstanceOf(HTMLButtonElement);
			expect(handles[1].buttonEl).toBeInstanceOf(HTMLButtonElement);

			handles[1].buttonEl.click();
			expect(onApply).toHaveBeenCalledTimes(1);
			expect(onCancel).not.toHaveBeenCalled();
		});

		test('disabled is the REAL property: a disabled footer button never fires, setDisabled(false) re-arms it', () => {
			const modal = makeModal();
			const onApply = jest.fn();
			const [apply] = modal.footer([
				{ label: 'Apply', text: 'Apply', disabled: true, onClick: onApply },
			]);

			expect(apply.buttonEl.disabled).toBe(true);
			apply.buttonEl.click();
			expect(onApply).not.toHaveBeenCalled();

			apply.setDisabled(false);
			expect(apply.buttonEl.disabled).toBe(false);
			apply.buttonEl.click();
			expect(onApply).toHaveBeenCalledTimes(1);
		});

		test('calling footer() again REBUILDS the row in place (no duplicate footers)', () => {
			const modal = makeModal();
			modal.footer([{ label: 'One', text: 'One', onClick: () => {} }]);
			modal.footer([
				{ label: 'Two', text: 'Two', onClick: () => {} },
				{ label: 'Three', text: 'Three', onClick: () => {} },
			]);

			const footers = modal.contentEl.querySelectorAll('.dse-modal__footer');
			expect(footers).toHaveLength(1);
			expect(footers[0].querySelectorAll('button')).toHaveLength(2);
		});
	});

	describe('open — initial focus to the first control (§2.6)', () => {
		test('open() focuses the first control in the content (body before footer)', () => {
			const modal = makeModal();
			const input = modal.body.createEl('input', { type: 'text' });
			modal.footer([{ label: 'Apply', text: 'Apply', onClick: () => {} }]);

			modal.open();

			expect(document.activeElement).toBe(input);
			modal.close();
		});

		test('with no body controls, the first footer button takes focus', () => {
			const modal = makeModal();
			modal.body.createEl('p', { text: 'Are you sure?' });
			const [cancel] = modal.footer([{ label: 'Cancel', text: 'Cancel', onClick: () => {} }]);

			modal.open();

			expect(document.activeElement).toBe(cancel.buttonEl);
			modal.close();
		});

		test('disabled controls are skipped for initial focus', () => {
			const modal = makeModal();
			const [apply, cancel] = modal.footer([
				{ label: 'Apply', text: 'Apply', disabled: true, onClick: () => {} },
				{ label: 'Cancel', text: 'Cancel', onClick: () => {} },
			]);
			void apply;

			modal.open();

			expect(document.activeElement).toBe(cancel.buttonEl);
			modal.close();
		});
	});

	describe('openManagedModal — the F1 §4.5 view-unload-closes-modal contract', () => {
		test('opens the modal and returns it', () => {
			const owner = fakeOwner();
			const modal = openManagedModal(owner, () => makeModal());
			expect(modal).toBeInstanceOf(DseModal);
			expect(document.body.contains(modal.containerEl)).toBe(true);
			owner.unload();
		});

		test('owner.unload() closes the modal (onClose fires, DOM removed)', () => {
			const owner = fakeOwner();
			const modal = openManagedModal(owner, () => makeModal());
			const onClose = jest.spyOn(modal, 'onClose');

			owner.unload();

			expect(document.body.contains(modal.containerEl)).toBe(false);
			expect(onClose).toHaveBeenCalledTimes(1);
		});

		test('close is idempotent: user-closed first, the unload teardown does NOT re-close', () => {
			const owner = fakeOwner();
			const modal = openManagedModal(owner, () => makeModal());
			const onClose = jest.spyOn(modal, 'onClose');

			modal.close(); // the user dismissed it (Escape / a footer button)
			expect(onClose).toHaveBeenCalledTimes(1);

			owner.unload(); // teardown fires modal.close() again
			expect(onClose).toHaveBeenCalledTimes(1); // STILL once
		});

		test('closing detaches footer button listeners (modal-scoped lifecycle)', () => {
			const owner = fakeOwner();
			const onApply = jest.fn();
			const modal = openManagedModal(owner, () => {
				const m = makeModal();
				m.footer([{ label: 'Apply', text: 'Apply', onClick: onApply }]);
				return m;
			});
			const applyEl = modal.contentEl.querySelector<HTMLButtonElement>('button.dse-btn')!;

			modal.close();
			applyEl.click();

			expect(onApply).not.toHaveBeenCalled();
			owner.unload();
		});
	});

	describe('theme stamping (SC-104 / FOLLOWUPS #31)', () => {
		test('open() stamps data-dse-theme on the dialog root from the app-registered ThemeService', () => {
			const app = new App() as any;
			makeRegisteredTheme(app);
			const modal = makeModal(app);

			modal.open();

			expect(modal.containerEl.getAttribute('data-dse-theme')).toBe('steel');
			modal.close();
		});

		test('a live theme change re-stamps the open modal (onChange fan-out, D3 §2.2)', async () => {
			const app = new App() as any;
			const theme = makeRegisteredTheme(app);
			const modal = makeModal(app);
			modal.open();
			expect(modal.containerEl.getAttribute('data-dse-theme')).toBe('steel');

			theme.setActive('parchment');
			await flushAsync();

			expect(modal.containerEl.getAttribute('data-dse-theme')).toBe('parchment');
			modal.close();
		});

		test('close() tears down the re-stamp subscription (modal-scoped lifecycle)', async () => {
			const app = new App() as any;
			const theme = makeRegisteredTheme(app);
			const modal = makeModal(app);
			modal.open();
			modal.close(); // unloads this.lifecycle, which owns apply()'s onChange unsubscribe

			theme.setActive('parchment');
			await flushAsync();

			// Stayed at the value from when it was open — never re-stamped after close.
			expect(modal.containerEl.getAttribute('data-dse-theme')).toBe('steel');
		});

		test('no registered ThemeService for the app: open() is a graceful no-op (no attribute, no throw)', () => {
			const app = new App() as any; // deliberately never registered
			const modal = makeModal(app);

			expect(() => modal.open()).not.toThrow();
			expect(modal.containerEl.hasAttribute('data-dse-theme')).toBe(false);
			modal.close();
		});
	});

	describe('prefs css stamping (SC-112 / Plan 23 Task 2) — the reflectCss() twin of theme stamping', () => {
		test('open() stamps a css-bearing pref as an inline custom property on the dialog root', async () => {
			const app = new App() as any;
			const prefs = makeRegisteredPrefs(app);
			await prefs.set('fontTitle', 'Georgia');
			const modal = makeModal(app);

			modal.open();

			expect(modal.containerEl.style.getPropertyValue('--dse-font-title')).toBe('Georgia');
			modal.close();
		});

		test('SC-230 diagnosis: open() stamps the REAL textScale/cardScale prefs on the dialog root (rules out "not stamped" — the miss was the CSS consumer scope, not this mechanism)', async () => {
			const app = new App() as any;
			const prefs = makeRegisteredRealPrefs(app);
			await prefs.set('textScale', 1.4);
			await prefs.set('cardScale', 1.2);
			const modal = makeModal(app);

			modal.open();

			expect(modal.containerEl.style.getPropertyValue('--dse-text-scale')).toBe('1.4');
			expect(modal.containerEl.style.getPropertyValue('--dse-card-scale')).toBe('1.2');
			modal.close();
		});

		test('open() stamps the css var but NEVER the data-dse-* attr, even for a descriptor carrying both', async () => {
			const app = new App() as any;
			const prefs = makeRegisteredPrefs(app, fontTitleDescriptor('font-title'));
			await prefs.set('fontTitle', 'Georgia');
			const modal = makeModal(app);

			modal.open();

			expect(modal.containerEl.style.getPropertyValue('--dse-font-title')).toBe('Georgia');
			// Modals go through reflectCss(), not reflect() — attrs like data-dse-density
			// are pipeline-owned and must never reach a modal.
			expect(modal.containerEl.hasAttribute('data-dse-font-title')).toBe(false);
			modal.close();
		});

		test('a live pref change re-stamps the open modal (subscription fan-out, same as theme)', async () => {
			const app = new App() as any;
			const prefs = makeRegisteredPrefs(app);
			const modal = makeModal(app);
			modal.open();
			expect(modal.containerEl.style.getPropertyValue('--dse-font-title')).toBe('');

			await prefs.set('fontTitle', 'Georgia');
			expect(modal.containerEl.style.getPropertyValue('--dse-font-title')).toBe('Georgia');

			await prefs.set('fontTitle', ''); // back to default → removeProperty
			expect(modal.containerEl.style.getPropertyValue('--dse-font-title')).toBe('');
			modal.close();
		});

		test('close() tears down the re-stamp subscription (modal-scoped lifecycle)', async () => {
			const app = new App() as any;
			const prefs = makeRegisteredPrefs(app);
			const modal = makeModal(app);
			modal.open();
			modal.close(); // unloads this.lifecycle, which owns reflectCss()'s subscription

			await prefs.set('fontTitle', 'Georgia');

			// Stayed at the value from when it was open — never re-stamped after close.
			expect(modal.containerEl.style.getPropertyValue('--dse-font-title')).toBe('');
		});

		test('no registered PreferenceStore for the app: open() is a graceful no-op (no style write, no throw)', () => {
			const app = new App() as any; // deliberately never registered
			const modal = makeModal(app);

			expect(() => modal.open()).not.toThrow();
			expect(modal.containerEl.style.cssText).toBe('');
			modal.close();
		});
	});
});

// SC-334: `.dse-modal__body` is a scroll box, and a scroll box clips whatever paints outside
// its padding box — including the shared focus ring (outline 2px + outline-offset 2px), which
// sits 4px OUTSIDE a field. With no padding, "Set limits…"'s first input lost the top of its
// ring. jsdom cannot lay this out, so the real-Obsidian camera (obsidian-camera.mjs, "FOCUS
// RING CLIPPED BY THE MODAL BODY") is the geometric gate; this pins the declarations it
// depends on, and that the padding covers the ring's full reach and is exactly cancelled by
// the negative margin (so no field moves).
describe('SC-334: the modal body leaves room for the focus ring', () => {
	const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');
	const px = (v: string): number => Number(/^(-?\d+(?:\.\d+)?)px$/.exec(v.trim())?.[1] ?? NaN);

	test('`.dse-modal__body` pads by at least the ring reach and cancels it with an equal negative margin', () => {
		const body = /\n\.dse-modal__body \{([^}]*)\}/.exec(sheet);
		expect(body).not.toBeNull();
		const padding = /padding:\s*([^;]+);/.exec(body![1])?.[1] ?? '';
		const margin = /margin:\s*([^;]+);/.exec(body![1])?.[1] ?? '';
		expect(body![1]).toMatch(/overflow-y:\s*auto;/);

		const ring = /outline:\s*(\d+)px solid var\(--dse-focus-ring\);\s*outline-offset:\s*(\d+)px;/.exec(sheet);
		expect(ring).not.toBeNull();
		const reach = Number(ring![1]) + Number(ring![2]);
		expect(px(padding)).toBeGreaterThanOrEqual(reach);
		expect(px(margin)).toBe(-px(padding));
	});
});

// SC-431: Obsidian's Keymap runs the modal Scope from a window CAPTURE listener, before the focused
// field's own keydown handler, so a field's stopPropagation() cannot keep the modal open. The
// DseModal's Escape handler therefore consults the focused field first. These tests route keys
// through a stand-in Keymap (test/dom/_obsidianKeymap.ts) so that ordering is real.
describe('SC-431: Escape backs out of a draft first inside a DseModal', () => {
	function openWithStepper() {
		const owner = fakeOwner();
		const onChange = jest.fn();
		let inputEl!: HTMLInputElement;
		const modal = openManagedModal(owner, () => {
			const m = makeModal();
			const handle = stepper(m.body, { value: 15, min: 0, max: 20, editable: true, label: 'Stamina', onChange }, m.lifecycle);
			inputEl = handle.rootEl.querySelector<HTMLInputElement>('input.dse-stepper__input')!;
			return m;
		});
		attachObsidianKeymap(modal);
		const onClose = jest.spyOn(modal, 'onClose');
		const bubbled = jest.fn();
		modal.containerEl.addEventListener('keydown', bubbled);
		inputEl.focus();
		return { owner, modal, inputEl, onChange, onClose, bubbled };
	}

	test('Escape on a dirty draft reverts only the draft: the modal stays open, nothing commits, the key is swallowed', () => {
		const { modal, inputEl, onChange, onClose, bubbled } = openWithStepper();
		inputEl.value = '12';

		const notPrevented = pressEscape(inputEl);

		expect(inputEl.value).toBe('15');
		expect(onClose).not.toHaveBeenCalled();
		expect(document.body.contains(modal.containerEl)).toBe(true);
		expect(onChange).not.toHaveBeenCalled();
		expect(notPrevented).toBe(false); // preventDefault'd
		expect(bubbled).not.toHaveBeenCalled(); // and stopped before it reached the modal's own tree
		modal.close();
	});

	test('a second Escape (the draft is now clean) closes the modal', () => {
		const { modal, inputEl, onClose } = openWithStepper();
		inputEl.value = '12';
		pressEscape(inputEl);
		expect(onClose).not.toHaveBeenCalled();

		pressEscape(inputEl);

		expect(onClose).toHaveBeenCalledTimes(1);
		expect(document.body.contains(modal.containerEl)).toBe(false);
	});

	test('Escape on a clean draft closes the modal without committing anything', () => {
		const { modal, inputEl, onChange, onClose } = openWithStepper();

		pressEscape(inputEl);

		expect(onClose).toHaveBeenCalledTimes(1);
		expect(document.body.contains(modal.containerEl)).toBe(false);
		expect(onChange).not.toHaveBeenCalled();
	});

	test('Escape from a control with no draft (a footer button) still closes the modal', () => {
		const { modal, onClose } = openWithStepper();
		const [apply] = modal.footer([{ label: 'Apply', text: 'Apply', onClick: jest.fn() }]);

		pressEscape(apply.buttonEl);

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	test('an Escape another handler already consumed (defaultPrevented) neither cancels a draft nor closes the modal', () => {
		const { modal, inputEl, onClose } = openWithStepper();
		inputEl.value = '12';
		const evt = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
		evt.preventDefault();

		modal.onEscapeKey(evt);

		expect(inputEl.value).toBe('12');
		expect(onClose).not.toHaveBeenCalled();
		modal.close();
	});

	test('after the modal closes its field is no longer an Escape consumer (the registry entry is torn down with the modal lifecycle)', () => {
		const { modal, inputEl, onChange } = openWithStepper();
		modal.close();
		inputEl.value = '12';

		// Asked directly: a keydown on the closed modal's detached input never reaches any window
		// listener, so dispatching one would pass even with the teardown deleted.
		expect(consumeEscapeAt(inputEl)).toBe(false);

		expect(inputEl.value).toBe('12'); // not reverted
		expect(onChange).not.toHaveBeenCalled();
	});

	test('reopening a fresh modal registers a fresh consumer: draft-first holds on the second open too', () => {
		const first = openWithStepper();
		first.modal.close();
		const second = openWithStepper();
		second.inputEl.value = '12';

		pressEscape(second.inputEl);

		expect(second.inputEl.value).toBe('15');
		expect(second.onClose).not.toHaveBeenCalled();
		second.modal.close();
	});
});

// SC-595: a modal opened from a hover preview keeps the preview (and so itself) alive. Obsidian's page-preview popover hides
// itself on any non-default-prevented `click` that reaches its window and is not inside the popover; the stand-in here is a
// `window` bubble spy. `app.keymap` is the jest mock's scope stack (`FakeKeymap`).
describe('SC-595: a modal opened from a hover preview', () => {
	let windowClicks: jest.Mock;
	let documentClicks: jest.Mock;

	beforeEach(() => {
		windowClicks = jest.fn();
		documentClicks = jest.fn();
		window.addEventListener('click', windowClicks);
		document.addEventListener('click', documentClicks);
	});
	afterEach(() => {
		window.removeEventListener('click', windowClicks);
		document.removeEventListener('click', documentClicks);
		document.body.innerHTML = '';
	});

	/** The opener's element, inside a `.popover.hover-popover` (or not). */
	function openerEl(inPreview: boolean): HTMLElement {
		const el = document.createElement('div');
		if (inPreview) {
			const popover = document.body.appendChild(document.createElement('div'));
			popover.className = 'popover hover-popover';
			popover.appendChild(el);
		} else {
			document.body.appendChild(el);
		}
		return el;
	}

	/** A modal with a textarea, an Obsidian-shaped toggle (`ToggleComponent`'s DOM) and a Save button, opened from `anchor`. */
	function openFrom(anchor: HTMLElement | undefined, app: any = new App()) {
		const owner = fakeOwner();
		let textarea!: HTMLTextAreaElement;
		let checkbox!: HTMLInputElement;
		const modal = openManagedModal(
			owner,
			() => {
				const m = makeModal(app);
				textarea = m.body.createEl('textarea');
				const label = m.body.createEl('label', { cls: 'checkbox-container' });
				checkbox = label.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
				m.footer([{ label: 'Save', text: 'Save', onClick: () => {} }]);
				return m;
			},
			anchor,
		);
		const save = modal.containerEl.querySelector<HTMLButtonElement>('button[aria-label="Save"]')!;
		return { owner, modal, textarea, checkbox, save, app };
	}

	const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));
	/** The delays Obsidian 1.15.1's page-preview popover waits before it pushes its scope (its click-to-edit helper: 10 ms, 150 ms on text).
	 *  LITERALS on purpose: a test built from the production constant would shrink with it (r5 MEDIUM-1: `[10]` alone passed every test). */
	const POPOVER_PUSH_DELAYS_MS = [10, 150];
	/** Past the popover's last push and the modal's last re-push (150 ms), with margin. */
	const pastRepush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 200));

	test('a click inside never reaches a window bubble listener (the popover\'s hide), a document listener still sees it', () => {
		const { textarea, save } = openFrom(openerEl(true));

		textarea.click();
		save.click();

		expect(windowClicks).not.toHaveBeenCalled();
		expect(documentClicks).toHaveBeenCalledTimes(2);
	});

	test('the click is stopped, never default-prevented: an Obsidian-shaped label.checkbox-container > input still toggles and fires change', () => {
		const { checkbox } = openFrom(openerEl(true));
		const changed = jest.fn();
		checkbox.addEventListener('change', changed);
		let prevented: boolean | null = null;
		document.addEventListener('click', (e) => (prevented = e.defaultPrevented));

		checkbox.click();

		expect(prevented).toBe(false);
		expect(checkbox.checked).toBe(true);
		expect(changed).toHaveBeenCalledTimes(1);
		expect(windowClicks).not.toHaveBeenCalled();
	});

	test('a click OUTSIDE the modal (the popover itself, another element) still reaches the window', () => {
		const anchor = openerEl(true);
		openFrom(anchor);

		anchor.click();

		expect(windowClicks).toHaveBeenCalledTimes(1);
	});

	test('control: opened from an element that is not in a hover preview, nothing changes: the click reaches the window and no scope is re-pushed', async () => {
		const { app, modal, textarea } = openFrom(openerEl(false));
		const later = new Scope();
		app.keymap.pushScope(later);

		textarea.click();
		await pastRepush();

		expect(windowClicks).toHaveBeenCalledTimes(1);
		expect(app.keymap.top).toBe(later);
		modal.close();
	});

	test('control: no anchor at all behaves like a modal outside a preview', () => {
		const { textarea } = openFrom(undefined);
		textarea.click();
		expect(windowClicks).toHaveBeenCalledTimes(1);
	});

	test('after close (and the one task the guard outlives it) the guard is gone: the same container, attached again, lets a click through', async () => {
		const { modal, textarea } = openFrom(openerEl(true));
		modal.close();
		await settle(); // the guard outlives close() by one task (the closing click), then it goes
		document.body.appendChild(modal.containerEl);

		textarea.click();

		expect(windowClicks).toHaveBeenCalledTimes(1);
	});

	test('a modal opened from a modal that is anchored in a preview inherits the anchor (FreeHealConfirmModal)', () => {
		const { modal } = openFrom(openerEl(true));
		expect(modal.anchor?.closest('.hover-popover')).not.toBeNull();
		const child = openManagedModal(modal.lifecycle, () => makeModal(), modal.anchor);
		const textarea = child.body.createEl('textarea');

		textarea.click();

		expect(windowClicks).not.toHaveBeenCalled();
	});

	test('a click on a control the modal REDRAWS in its own click handler (the target is detached when the click reaches the document) never reaches the window', () => {
		const owner = fakeOwner();
		const modal = openManagedModal(
			owner,
			() => {
				const m = makeModal();
				const list = m.body.createDiv();
				const draw = (): void => {
					list.empty();
					list.createEl('button', { text: 'cog' }).addEventListener('click', draw);
				};
				draw();
				return m;
			},
			openerEl(true),
		);

		modal.body.querySelector('button')!.click();

		expect(modal.containerEl.isConnected).toBe(true);
		expect(windowClicks).not.toHaveBeenCalled();
	});

	test('the click that CLOSES the modal (Cancel, backdrop shape) never reaches the window; once the guard is gone a click outside does, so the preview can be dismissed', async () => {
		const anchor = openerEl(true);
		const owner = fakeOwner();
		let modal!: DseModal;
		openManagedModal(owner, () => (modal = makeModal()), anchor);
		modal.footer([{ label: 'Cancel', text: 'Cancel', onClick: () => modal.close() }]);

		modal.containerEl.querySelector<HTMLButtonElement>('button[aria-label="Cancel"]')!.click();
		expect(document.body.contains(modal.containerEl)).toBe(false);
		expect(windowClicks).not.toHaveBeenCalled();

		await settle();
		anchor.click(); // a later click elsewhere is Obsidian's to handle again
		expect(windowClicks).toHaveBeenCalledTimes(1);
	});

	test('a nested confirmation: Confirm closes the child; the click never reaches the window and the parent stays open', () => {
		const { modal: parent } = openFrom(openerEl(true));
		let child!: DseModal;
		openManagedModal(parent.lifecycle, () => (child = makeModal()), parent.anchor);
		child.footer([{ label: 'Confirm', text: 'Confirm', onClick: () => child.close() }]);

		child.containerEl.querySelector<HTMLButtonElement>('button[aria-label="Confirm"]')!.click();

		expect(document.body.contains(child.containerEl)).toBe(false);
		expect(document.body.contains(parent.containerEl)).toBe(true);
		expect(windowClicks).not.toHaveBeenCalled();
	});

	describe('keymap scope', () => {
		/** The popover as Obsidian draws it: its click-to-edit helper is a bubble listener on the embed container (so it runs AFTER the
		 *  opener's own handler) and pushes the popover's scope from a timer it arms there, 10 ms or 150 ms later. */
		test.each(POPOVER_PUSH_DELAYS_MS.map((ms) => [ms]))('opened from a click, the popover arms its %i ms push after the opener has opened the modal: the modal is on top whatever the order of the two re-pushes', async (ms) => {
			const app: any = new App();
			const anchor = openerEl(true);
			const popover = new Scope();
			const button = anchor.appendChild(document.createElement('button'));
			let modal!: DseModal;
			button.addEventListener('click', () => {
				modal = openManagedModal(fakeOwner(), () => makeModal(app), anchor);
			});
			anchor.addEventListener('click', () => {
				setTimeout(() => app.keymap.pushScope(popover), ms);
			});

			button.click();
			await new Promise((resolve) => setTimeout(resolve, ms + 40));
			if (ms < 150) expect(app.keymap.top).toBe(modal.scope);
			await pastRepush();

			expect(app.keymap.top).toBe(modal.scope);
			modal.close();
			expect(app.keymap.top).toBe(popover);
		});

		test('a child opened from the parent while the parent\'s re-pushes are still due stays on top: the parent does not bury it', () => {
			jest.useFakeTimers();
			try {
				const { app, modal: parent } = openFrom(openerEl(true));
				jest.advanceTimersByTime(100); // the parent's 10 ms re-push is done, its 150 ms one is still due
				let child!: DseModal;
				openManagedModal(parent.lifecycle, () => (child = makeModal(app)), parent.anchor);

				jest.advanceTimersByTime(100); // t = 200: the parent's 150 ms re-push fired, the child's own 150 ms one (t = 250) has not

				expect(app.keymap.top).toBe(child.scope);
				child.close();
				parent.close();
			} finally {
				jest.useRealTimers();
			}
		});

		test('the modal\'s window is not the active one when the re-push is due: nothing is pushed onto the other window\'s stack', async () => {
			const { app, modal } = openFrom(openerEl(true));
			const popover = new Scope();
			app.keymap.pushScope(popover);
			const real = (globalThis as any).activeWindow;
			(globalThis as any).activeWindow = {};
			try {
				await pastRepush();
			} finally {
				(globalThis as any).activeWindow = real;
			}

			expect(app.keymap.top).toBe(popover);
			modal.close();
		});


		/** The popover's helper timer was armed BEFORE the modal opened (a modal opened outside a click, or later than the click): its push is
		 *  due at `ms`, the modal's re-pushes are armed after it, so the one at the same delay fires after the popover's push. */
		test.each(POPOVER_PUSH_DELAYS_MS.map((ms) => [ms]))('the popover pushes its scope above the modal\'s at %i ms: the modal\'s goes back on top at that same tick, and the popover\'s is on top again after close', (ms) => {
			jest.useFakeTimers();
			try {
				const app: any = new App();
				const popover = new Scope();
				setTimeout(() => app.keymap.pushScope(popover), ms);
				const { modal } = openFrom(openerEl(true), app);

				jest.advanceTimersByTime(ms - 1);
				expect(app.keymap.top).toBe(modal.scope); // the popover has not pushed yet
				jest.advanceTimersByTime(1);

				expect(app.keymap.top).toBe(modal.scope);
				expect(app.keymap.scopes).toEqual([popover, modal.scope]);
				modal.close();
				expect(app.keymap.top).toBe(popover);
				expect(app.keymap.scopes).toEqual([popover]);
			} finally {
				jest.useRealTimers();
			}
		});

		test('closed before the deferred re-push runs: nothing is pushed back for the closed modal', async () => {
			const { app, modal } = openFrom(openerEl(true));
			const popover = new Scope();
			app.keymap.pushScope(popover);

			modal.close();
			await pastRepush();

			expect(app.keymap.scopes).toEqual([popover]);
		});
	});
});
