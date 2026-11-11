// Plan 08 Task 3 (D2 §2.6) — kit/managedModal: the accessible modal base. Replaces
// Modal.vue + ModalProcessor and unifies the 5 DOM modals: a styled, lifecycle-correct
// Obsidian Modal with a standard title (aria-labelledby), a scrollable body, and a
// footer of Task-2 iconButtons — REAL <button>s with the REAL disabled property, which
// fixes CB-8 inside modals. Escape-close and the focus trap are Obsidian Modal
// defaults and are deliberately NOT reimplemented here; DSE adds only the initial
// focus to the first control (§2.6) and (SC-431) a draft-first Escape: see onEscapeKey.
//
// F1 §4.5 (view-unload-closes-modal): openManagedModal(owner, factory) opens the
// modal AND registers owner.register(() => modal.close()) so the modal cannot outlive
// the view that opened it. close() is idempotent — a user dismissal followed by the
// unload teardown runs onClose exactly once.
//
// Modal (and Component for the modal-scoped lifecycle) come from `obsidian` — host
// framework, not elements; the kit⊥elements boundary is untouched.
import { Component, Modal } from 'obsidian';
import type { App } from 'obsidian';
import { iconButton } from './iconButton';
import type { IconButtonHandle, IconButtonOptions } from './iconButton';
import { themeServiceForApp } from '../seams/theme';
import { prefsForApp } from '../seams/prefs';
import { consumeEscapeAt } from './escapeConsumer';

let titleCounter = 0;

/** SC-595: the two delays Obsidian's page-preview popover waits (its click-to-edit helper: 10 ms, 150 ms when the click lands on text)
 *  before it pushes its own keymap scope. A modal opened from a hover preview re-pushes its scope after each, armed AFTER the helper's
 *  timer (see `keepHoverPreviewAlive`). */
export const HOVER_HELPER_DELAYS_MS: readonly number[] = [10, 150];

/** SC-595: the open modals that were opened from a hover preview, oldest first; only the newest re-pushes its keymap scope. */
const previewModals: DseModal[] = [];

/** First-control query for initial focus (§2.6): skips disabled + tabindex="-1". */
const FOCUSABLE =
	'button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
	'textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export class DseModal extends Modal {
	/** Scrollable content region (.dse-modal__body) — subclasses render into this. */
	readonly body: HTMLElement;

	/**
	 * Modal-scoped Component owning the footer buttons' listeners (and available to
	 * subclasses for their own kit widgets): loaded on open(), unloaded on close(),
	 * so every modal listener dies with the modal (F1 §4.5). One-shot — a closed
	 * modal is done, matching Obsidian's own contentEl teardown.
	 */
	readonly lifecycle: Component = new Component();

	private footerEl: HTMLElement | null = null;
	private dseOpen = false;
	private anchorEl: HTMLElement | null = null;

	constructor(app: App) {
		super(app);
		this.dialogEl().addClass('dse-modal');
		this.titleEl.addClass('dse-modal__title');
		this.body = this.contentEl.createDiv({ cls: 'dse-modal__body' });
	}

	/**
	 * The dialog box element: real Obsidian's modalEl (the `.modal` box); the F3 test
	 * harness mock only builds containerEl, so fall back to it.
	 */
	private dialogEl(): HTMLElement {
		return this.modalEl ?? this.containerEl;
	}

	/**
	 * SC-595: records the element this modal was opened from (the opener's block host element, `cx.host.containerEl`). When that
	 * element sits inside a hover preview (`.hover-popover`), open() keeps the preview alive for as long as the modal is open (see
	 * `keepHoverPreviewAlive`). Outside a preview nothing changes. Call before open(); `openManagedModal` takes it as its third
	 * argument.
	 */
	anchorTo(el: HTMLElement | null | undefined): this {
		this.anchorEl = el ?? null;
		return this;
	}

	/** The element passed to `anchorTo`, so a modal opened from this one (FreeHealConfirmModal) can inherit it. */
	get anchor(): HTMLElement | null {
		return this.anchorEl;
	}

	/**
	 * Sets the modal title and wires aria-labelledby → it (§4.3). Named setDseTitle
	 * (not setTitle) so it never shadows Obsidian's own Modal.setTitle.
	 *
	 * SC-230 r3 (LOW-1): the text is wrapped in a `.dse-modal__title-text` span rather
	 * than written directly onto `titleEl` (Obsidian's own `.modal-title`). `.modal-title`
	 * keeps its real, version-dependent absolute font-size untouched (`--font-ui-large` in
	 * the pinned 1.13.7 harness sheet, `--font-ui-medium` in installed 1.14.2 — a real,
	 * observed drift), and styles-source.css's `.dse-modal__title-text` rule multiplies
	 * whatever that inherited size turns out to be by --dse-text-scale — the title tracks
	 * text size like the rest of a modal's content without hardcoding either Obsidian
	 * token. `aria-labelledby` is unaffected: accessible-name computation walks all of
	 * titleEl's descendant text nodes, nested or not.
	 */
	setDseTitle(text: string): this {
		this.titleEl.empty();
		this.titleEl.createSpan({ cls: 'dse-modal__title-text', text });
		if (!this.titleEl.id) this.titleEl.id = `dse-modal-title-${++titleCounter}`;
		this.dialogEl().setAttribute('aria-labelledby', this.titleEl.id);
		return this;
	}

	/**
	 * Builds (or rebuilds, in place) the footer as a row of kit iconButtons — real
	 * <button>s with the real disabled property (CB-8). Returns the handles so
	 * callers can setDisabled/setLabel in place.
	 */
	footer(buttons: IconButtonOptions[]): IconButtonHandle[] {
		if (this.footerEl) this.footerEl.empty();
		else this.footerEl = this.contentEl.createDiv({ cls: 'dse-modal__footer' });
		const footerEl = this.footerEl;
		return buttons.map((opts) => iconButton(footerEl, opts, this.lifecycle));
	}

	/** A .dse-modal__section panel inside the body (side-by-side apply/quick-mod panels). */
	section(): HTMLElement {
		return this.body.createDiv({ cls: 'dse-modal__section' });
	}

	/**
	 * SC-431: Escape backs out first. Obsidian's Modal constructor registers
	 * `this.onEscapeKey` as its Escape handler on `this.scope`, and the Keymap runs that Scope
	 * from a `window` keydown CAPTURE listener, i.e. before the event reaches the focused field.
	 * A field's own `stopPropagation()` therefore cannot keep the modal open. So when the focused
	 * field has something to back out of (a kit `stepper` with a half-typed draft, the Conditions
	 * add-dropdown: each registers an Escape consumer, kit/escapeConsumer.ts), back out of just that
	 * and swallow the key; otherwise fall through to the host's close.
	 *
	 * `onEscapeKey` is not in obsidian.d.ts (it is the method the Modal constructor binds), hence
	 * the cast; the e2e scenario STAM-S06 fails if a host version stops calling it.
	 */
	onEscapeKey(evt: KeyboardEvent): void {
		if (!evt.defaultPrevented && consumeEscapeAt(evt.target)) {
			evt.preventDefault();
			evt.stopPropagation();
			return;
		}
		const host = (Modal.prototype as unknown as { onEscapeKey?: (evt: KeyboardEvent) => void }).onEscapeKey;
		if (host) host.call(this, evt);
		else if (!evt.defaultPrevented) {
			evt.preventDefault();
			this.close();
		}
	}

	open(): void {
		if (this.dseOpen) return;
		this.dseOpen = true;
		this.lifecycle.load();
		// SC-104 / FOLLOWUPS #31 (Gap A): modals are constructed with only `app` at
		// 6 of 7 call sites (no `cx`/`theme` in scope — design recon
		// .superpowers/sdd/sc104-modal-theming-design.md §1/§3), so look the live
		// ThemeService up by `this.app` via the seam's WeakMap registry rather than
		// threading it through every constructor. Graceful no-op when nothing is
		// registered (bare test/harness Apps) — zero behavior change there. apply()
		// stamps data-dse-theme on the dialog root AND re-stamps it for the
		// lifetime of `this.lifecycle` (torn down in close(), same as the footer/
		// body widget listeners), so a live theme switch while the modal is open
		// re-themes it for free (D3 §2.2's onChange fan-out).
		const theme = themeServiceForApp(this.app);
		if (theme) theme.apply(this.dialogEl(), this.lifecycle);
		// SC-112 (Plan 23 Task 2): mirrors the theme lookup immediately above via the
		// twin WeakMap<App, PreferenceStore> registry (seams/prefs.ts) — stamps
		// css-bearing prefs (font/scale custom properties) on the dialog root, kept
		// current for this.lifecycle's lifetime. Graceful no-op on a bare test/
		// harness App that never registered a store, same contract as the theme
		// lookup. Deliberately reflectCss(), not reflect() — modals must NOT receive
		// the attr-bearing prefs (e.g. data-dse-density is pipeline-owned).
		const prefs = prefsForApp(this.app);
		if (prefs) prefs.reflectCss(this.dialogEl(), this.lifecycle);
		super.open();
		if (this.anchorEl?.closest('.hover-popover')) this.keepHoverPreviewAlive();
		// §2.6: initial focus to the first control. Escape + the focus trap stay
		// Obsidian Modal defaults — only the entry focus is DSE's.
		this.contentEl.querySelector<HTMLElement>(FOCUSABLE)?.focus();
	}

	/**
	 * SC-595: this modal was opened from a hover preview. Obsidian's page-preview popover hides itself (and unloads the block the
	 * modal's owner view lives in, which closes the modal and loses what the user typed) on ANY `click` that reaches its window
	 * and is neither default-prevented nor inside the popover; the modal sits in `body`, so the first click inside it did that.
	 * Two things keep the preview, and so the modal, alive:
	 *
	 * 1. A click guard on the modal's own document, BUBBLE phase, stopping propagation of a click that went through this modal.
	 *    Every document-level listener still sees the click (RecoveriesStrip's click-outside, ConditionsModal's and
	 *    sccLinkClickHandler's capture listeners all run before or at the document); only window-level bubble listeners (the
	 *    popover's, an Obsidian Menu's click-outside) never get it. NEVER `preventDefault` instead: that is the popover's own
	 *    "belongs to me" convention, but it also cancels label and checkbox activation, so an Obsidian toggle
	 *    (`label.checkbox-container > input`) would stop toggling.
	 *    - `composedPath()`, not `target` + `contains()`: a control the modal redraws inside its own click handler
	 *      (ConditionsModal's "Add condition" and row controls, the pool's condition icons) is detached by the time the click
	 *      reaches the document, so `contains()` says no; the path is fixed when the event is dispatched. (ConditionsModal's own
	 *      click-outside listener has the same footgun and the same fix.)
	 *    - The guard outlives `close()` by one task. A click that CLOSES the modal (Cancel, Confirm, Apply, the backdrop, a nested
	 *      confirmation's buttons) runs `close()` at target phase, before the click reaches the document; with the guard gone at
	 *      once it reached the window, hid the preview and closed the parent modal (a free-heal Confirm lost the staged heal).
	 *      Only the guard is kept; every other listener of the modal still dies synchronously with `lifecycle`.
	 * 2. The popover pushes its own keymap scope above this modal's for the click that opened the modal, so Escape went to the
	 *    popover (and, in Live Preview, moved focus into the note behind the form). Put this modal's scope back on top, AFTER the
	 *    popover's push. The push is not made during the click: Obsidian's click-to-edit helper (a bubble listener on the embed
	 *    container, so it runs after the opener's own handler, which is what opened this modal) arms a 10 ms timer (150 ms when
	 *    the click lands on text) and pushes from it. Timers with the same delay fire in the order they were armed, so the
	 *    re-pushes are armed from a window-bubble listener for the opening click (it runs after the container's), one per delay:
	 *    the order holds by construction at any load, no margin (SC-598's `focusHoverPreviewNow` adds a 10 ms helper timer of its
	 *    own from the same listener, BEFORE `arm()`, so the order holds for it too). A modal opened outside a click (a delayed open, such as the
	 *    block edit form after a pending write) arms them at once: any helper timer was armed earlier. (Enter / Space on the
	 *    stamina bar and on a montage cell are not such opens: they click the opener, SC-597, so they take the branch above.) Skipped when a newer preview-opened modal is open (a parent
	 *    must not bury its child) or when this modal's window is not the active one (`pushScope` pushes onto the active
	 *    window's stack). After close, Modal.close's own popScope leaves the popover's scope on top, which is right: the
	 *    preview is still showing.
	 *
	 * Only for a modal opened from inside `.hover-popover`: nothing else needs it, and outside a preview a click inside a modal
	 * must reach the window as it always did.
	 */
	private keepHoverPreviewAlive(): void {
		const doc = this.containerEl.ownerDocument;
		const win = doc.defaultView ?? window;
		const guard = (evt: MouseEvent): void => {
			if (evt.composedPath().includes(this.containerEl)) evt.stopPropagation();
		};
		doc.addEventListener('click', guard);
		this.lifecycle.register(() => {
			win.setTimeout(() => doc.removeEventListener('click', guard), 0);
		});

		previewModals.push(this);
		this.lifecycle.register(() => {
			const i = previewModals.indexOf(this);
			if (i >= 0) previewModals.splice(i, 1);
		});
		const repush = (): void => {
			if (!this.dseOpen || previewModals[previewModals.length - 1] !== this || activeWindow !== win) return;
			this.app.keymap.popScope(this.scope);
			this.app.keymap.pushScope(this.scope);
		};
		const arm = (): void => {
			for (const ms of HOVER_HELPER_DELAYS_MS) {
				const id = win.setTimeout(repush, ms);
				this.lifecycle.register(() => win.clearTimeout(id));
			}
		};
		// `window.event` is the click being dispatched while a handler runs (deprecated in lib.dom, still how a modal learns it
		// was opened from one; a modal opened outside any event sees undefined).
		const opening = (win as unknown as { event?: Event }).event;
		if (opening?.type === 'click') {
			const onWindowBubble = (evt: Event): void => {
				if (evt !== opening) return;
				this.focusHoverPreviewNow(opening, win); // before arm(): the helper's timer, armed inside this dispatch, must precede the re-pushes
				arm();
			};
			win.addEventListener('click', onWindowBubble);
			this.lifecycle.register(() => win.removeEventListener('click', onWindowBubble));
		} else arm();
	}

	/**
	 * SC-598: a second click inside this modal soon after the click that opened it (a fast double-click on the stamina bar's
	 * numbers) closed the modal and the preview. Obsidian's window-CAPTURE click listener hides, 5 ms later, every shown preview
	 * that is not "focused" and does not contain the click; the document guard above cannot reach a window capture listener. A
	 * preview only becomes focused when its click-to-edit helper's timer runs: 10 ms after the opening click, 150 ms when that
	 * click landed on text. So, for a preview that is not focused yet (`.is-editing` absent), from the opening click's window
	 * BUBBLE phase (the helper has seen the click by then):
	 * 1. `preventDefault()` the opening click: the helper's timer for it then does nothing (its callback skips a default-prevented
	 *    event). Left alone it ran the preview's focus step at 150 ms and, if a second click had moved the focus off a button or
	 *    input by then, switched the preview into a source editor.
	 * 2. Send the helper ONE synthetic click from the anchor (bubbling, no coordinates, so never "on text"): it focuses the
	 *    preview 10 ms later. The anchor carries Obsidian's `interactive-child` class until then, so the helper's "open the
	 *    editor?" test says no whatever has the focus; the class comes off from a timer armed after the helper's.
	 * Called before `arm()`: the re-pushes (same delay, armed later) then fire after the helper's push, so this modal's scope
	 * stays above the preview's. Public API only: nothing private of the popover is touched.
	 * Residual (measured): a second press queued in full (down AND up) while the modal is still opening on a slow renderer is
	 * handled before the helper's timer and still closes everything, as it did before. A click that is not the opening click (a
	 * modal opened outside a click) is not touched.
	 */
	private focusHoverPreviewNow(opening: Event, win: typeof window): void {
		const anchor = this.anchorEl;
		const pop = anchor?.closest('.hover-popover');
		if (!anchor || !pop || pop.classList.contains('is-editing')) return;
		opening.preventDefault();
		const anchorWin = anchor.ownerDocument.defaultView ?? win;
		const added = !anchor.classList.contains('interactive-child');
		if (added) anchor.classList.add('interactive-child');
		anchor.dispatchEvent(new anchorWin.MouseEvent('click', { bubbles: true, cancelable: true, view: anchorWin }));
		if (added) win.setTimeout(() => anchor.classList.remove('interactive-child'), 10);
	}

	close(): void {
		if (!this.dseOpen) return; // idempotent — the §4.5 teardown may re-close
		this.dseOpen = false;
		this.lifecycle.unload(); // detach footer/body widget listeners with the modal
		super.close();
	}
}

/**
 * Opens the modal AND registers the F1 §4.5 view-unload-closes-modal contract:
 * `owner.register(() => modal.close())` — when the opening view unloads (file
 * closed, plugin unload, echo-rebuild teardown), the modal closes with it.
 */
export function openManagedModal<T extends DseModal>(owner: Component, factory: () => T, anchor?: HTMLElement | null): T {
	const modal = factory();
	if (anchor !== undefined) modal.anchorTo(anchor);
	owner.register(() => modal.close());
	modal.open();
	return modal;
}
