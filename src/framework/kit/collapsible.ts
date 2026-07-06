// Plan 08 Task 3 (D2 §2.3) — kit/collapsible: the ComponentWrapper replacement.
// A titled, optionally-collapsed region: the header is a REAL <button aria-expanded>
// wired to the region via aria-controls; the region hides via the `hidden` ATTRIBUTE
// (never inline display — D2 §5); the chevron (setIcon "chevron-right") rotates purely
// in CSS keyed to [data-open] on the root (prefers-reduced-motion-safe, §4.9).
//
// Originally shipped under a "2"-suffixed name while the D1 CollapsibleHeading port still
// owned `collapsible`; Plan 09 Task 10 deleted that old widget and renamed this one.
//
// Session persistence WITHOUT breaking kit⊥elements: the kit never imports cx — the
// caller hands over the SessionStore plus its own (blockKey, slot) address as
// `opts.persist` (the SessionPersist accessor, defined in framework/session next to
// SessionStore — both framework, not elements). Open-state then survives the
// echo-rebuild without polluting the note (F1 §4.3 — the session-state migration
// path for Skills groups). Only real state CHANGES are written — mounting never
// pollutes the store with defaults.
//
// F1 §4.5: the click listener is owner-bound (registerDomEvent).
import type { Component } from 'obsidian';
import { setIcon } from 'obsidian';
import type { SessionPersist } from '../session';

export interface CollapsibleOptions {
	/** Plain-text title rendered in the header. */
	title?: string;
	/** Caller-built title node mounted into the header instead of (or after) `title`. */
	titleEl?: HTMLElement;
	/** Initial expanded state. A persisted session value (when `persist` is set) wins. */
	open: boolean;
	/** Session round-trip for the open-state (survives the echo-rebuild). */
	persist?: SessionPersist;
	/** Fired with the NEW open state on USER toggles only — never by setOpen(). */
	onToggle?: (open: boolean) => void;
}

export interface CollapsibleHandle {
	readonly rootEl: HTMLElement;
	readonly headerEl: HTMLButtonElement;
	/** The collapsible region — callers render their content into this. */
	readonly contentEl: HTMLElement;
	/** External update, in place. Persists (when configured) but does NOT fire onToggle. */
	setOpen(open: boolean): void;
	isOpen(): boolean;
}

let regionCounter = 0;

/** Mounts a collapsible titled region into `parent` (D2 §2.3). */
export function collapsible(
	parent: HTMLElement,
	opts: CollapsibleOptions,
	owner: Component,
): CollapsibleHandle {
	const rootEl = parent.createDiv({ cls: 'dse-collapse' });

	const headerEl = rootEl.createEl('button', { cls: 'dse-collapse__header' }) as HTMLButtonElement;
	headerEl.setAttribute('type', 'button'); // never an implicit form submit

	const chevronEl = headerEl.createSpan({ cls: 'dse-collapse__chevron' });
	setIcon(chevronEl, 'chevron-right'); // rotation is CSS-only, keyed to [data-open]

	if (opts.title !== undefined) {
		headerEl.createSpan({ cls: 'dse-collapse__title', text: opts.title });
	}
	if (opts.titleEl) headerEl.appendChild(opts.titleEl);

	const contentEl = rootEl.createDiv({ cls: 'dse-collapse__region' });
	contentEl.id = `dse-collapse-region-${++regionCounter}`;
	headerEl.setAttribute('aria-controls', contentEl.id);

	let open =
		opts.persist?.session.get<boolean>(opts.persist.blockKey, opts.persist.slot) ?? opts.open;

	/** Reflects `open` onto the DOM in place; optionally persists / notifies. */
	function apply(next: boolean, write: { persist: boolean; notify: boolean }): void {
		open = next;
		headerEl.setAttribute('aria-expanded', String(next));
		// The hidden ATTRIBUTE (the property reflects to it) — never inline display (§2.3).
		contentEl.hidden = !next;
		if (next) rootEl.setAttribute('data-open', '');
		else rootEl.removeAttribute('data-open');
		if (write.persist && opts.persist) {
			opts.persist.session.set(opts.persist.blockKey, opts.persist.slot, next);
		}
		if (write.notify) opts.onToggle?.(next);
	}
	apply(open, { persist: false, notify: false }); // initial mount: no session write

	owner.registerDomEvent(headerEl, 'click', () => {
		apply(!open, { persist: true, notify: true });
	});

	return {
		rootEl,
		headerEl,
		contentEl,
		setOpen: (next: boolean): void => apply(next, { persist: true, notify: false }),
		isOpen: () => open,
	};
}
