// Plan 08 Task 3 (D2 §2.6) — kit/managedModal: the accessible modal base. Replaces
// Modal.vue + ModalProcessor and unifies the 5 DOM modals: a styled, lifecycle-correct
// Obsidian Modal with a standard title (aria-labelledby), a scrollable body, and a
// footer of Task-2 iconButtons — REAL <button>s with the REAL disabled property, which
// fixes CB-8 inside modals. Escape-close and the focus trap are Obsidian Modal
// defaults and are deliberately NOT reimplemented here; DSE adds only the initial
// focus to the first control (§2.6).
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

let titleCounter = 0;

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
		return (this.modalEl as HTMLElement | undefined) ?? this.containerEl;
	}

	/**
	 * Sets the modal title and wires aria-labelledby → it (§4.3). Named setDseTitle
	 * (not setTitle) so it never shadows Obsidian's own Modal.setTitle.
	 */
	setDseTitle(text: string): this {
		this.titleEl.setText(text);
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

	open(): void {
		if (this.dseOpen) return;
		this.dseOpen = true;
		this.lifecycle.load();
		super.open();
		// §2.6: initial focus to the first control. Escape + the focus trap stay
		// Obsidian Modal defaults — only the entry focus is DSE's.
		this.contentEl.querySelector<HTMLElement>(FOCUSABLE)?.focus();
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
export function openManagedModal<T extends DseModal>(owner: Component, factory: () => T): T {
	const modal = factory();
	owner.register(() => modal.close());
	modal.open();
	return modal;
}
