// Plan 08 Task 3 (D2 §2.4) — kit/tabs: accessible tablist. Replaces the negotiation
// .ds-nt-action-tab click-<div>s with the full role="tablist"/"tab"/"tabpanel" set:
// aria-selected + ROVING tabindex (only the selected tab is 0 — one Tab stop, §4.4),
// ArrowLeft/ArrowRight (wrapping) + Home/End move selection AND focus (selection
// follows focus, per the ARIA authoring pattern), and exactly one panel is visible —
// the rest carry the `hidden` ATTRIBUTE (never inline display, D2 §5).
//
// Selection persists via the same SessionPersist accessor as collapsible2 (no cx
// import — kit⊥elements): today the active tab is written into YAML purely to survive
// re-render; this demotes it to session state (F1 §4.3). Only real selection CHANGES
// are written — mounting never pollutes the store.
//
// F1 §4.5: all listeners are owner-bound (registerDomEvent).
import type { Component } from 'obsidian';
import { setIcon } from 'obsidian';
import type { SessionPersist } from './collapsible2';

export interface TabSpec {
	/** Stable tab id — the onSelect/select()/session currency (not a DOM id). */
	id: string;
	/** Visible tab label (also the accessible name via the button text). */
	label: string;
	/** Optional Lucide icon rendered before the label. */
	icon?: string;
}

export interface TabsOptions {
	tabs: TabSpec[];
	/** Initially selected tab id. A persisted session value (when valid) wins. */
	selected: string;
	/** Session round-trip for the selection (survives the echo-rebuild). */
	persist?: SessionPersist;
	/** Fired on USER selection changes only — never by select(). */
	onSelect?: (id: string) => void;
}

export interface TabsHandle {
	readonly rootEl: HTMLElement;
	readonly tablistEl: HTMLElement;
	/** Panels by tab id — callers render each tab's content into its panel. */
	readonly panels: Readonly<Record<string, HTMLElement>>;
	/** External update, in place. Persists (when configured); no onSelect, no focus steal. */
	select(id: string): void;
	getSelected(): string;
}

let tabsCounter = 0;

/** Mounts an accessible tablist + panels into `parent` (D2 §2.4). */
export function tabs(parent: HTMLElement, opts: TabsOptions, owner: Component): TabsHandle {
	const uid = `dse-tabs-${++tabsCounter}`;
	const rootEl = parent.createDiv({ cls: 'dse-tabs' });
	const tablistEl = rootEl.createDiv({ cls: 'dse-tabs__list' });
	tablistEl.setAttribute('role', 'tablist');

	const ids = opts.tabs.map((t) => t.id);
	const tabEls = new Map<string, HTMLButtonElement>();
	const panels: Record<string, HTMLElement> = {};

	opts.tabs.forEach((spec, i) => {
		const tabEl = tablistEl.createEl('button', { cls: 'dse-tabs__tab' }) as HTMLButtonElement;
		tabEl.setAttribute('type', 'button');
		tabEl.setAttribute('role', 'tab');
		// Index-based DOM ids: unique per mount, immune to non-id-safe tab ids.
		tabEl.id = `${uid}-tab-${i}`;
		tabEl.setAttribute('aria-controls', `${uid}-panel-${i}`);
		if (spec.icon) {
			const iconEl = tabEl.createSpan({ cls: 'dse-tabs__icon' });
			setIcon(iconEl, spec.icon);
		}
		tabEl.createSpan({ cls: 'dse-tabs__label', text: spec.label });
		tabEls.set(spec.id, tabEl);
	});

	// Panels live OUTSIDE the tablist (role="tablist" may only contain tabs).
	opts.tabs.forEach((spec, i) => {
		const panelEl = rootEl.createDiv({ cls: 'dse-tabs__panel' });
		panelEl.setAttribute('role', 'tabpanel');
		panelEl.id = `${uid}-panel-${i}`;
		panelEl.setAttribute('aria-labelledby', `${uid}-tab-${i}`);
		panels[spec.id] = panelEl;
	});

	const persisted = opts.persist?.session.get<string>(opts.persist.blockKey, opts.persist.slot);
	let selected =
		persisted !== undefined && tabEls.has(persisted)
			? persisted // a valid persisted selection wins…
			: tabEls.has(opts.selected)
				? opts.selected // …else the caller's choice…
				: (ids[0] ?? ''); // …else the first tab (stale persisted ids fall through too)

	/** Reflects `selected` onto every tab + panel in place (roving tabindex, §4.4). */
	function render(): void {
		for (const [id, tabEl] of tabEls) {
			const isSelected = id === selected;
			tabEl.setAttribute('aria-selected', String(isSelected));
			tabEl.setAttribute('tabindex', isSelected ? '0' : '-1');
			// The hidden ATTRIBUTE — never inline display (D2 §5).
			panels[id].hidden = !isSelected;
		}
	}
	render(); // initial mount: no session write

	/** The one selection-change path: no-ops on unknown ids and re-selection. */
	function change(id: string, write: { notify: boolean; focus: boolean }): void {
		if (!tabEls.has(id) || id === selected) return;
		selected = id;
		render();
		opts.persist?.session.set(opts.persist.blockKey, opts.persist.slot, id);
		if (write.focus) tabEls.get(id)?.focus(); // selection follows focus (§4.4)
		if (write.notify) opts.onSelect?.(id);
	}

	for (const [id, tabEl] of tabEls) {
		owner.registerDomEvent(tabEl, 'click', () => change(id, { notify: true, focus: false }));
	}

	owner.registerDomEvent(tablistEl, 'keydown', (evt: KeyboardEvent) => {
		if (ids.length === 0) return;
		const current = ids.indexOf(selected);
		let next: number;
		switch (evt.key) {
			case 'ArrowRight':
				next = (current + 1) % ids.length;
				break;
			case 'ArrowLeft':
				next = (current - 1 + ids.length) % ids.length;
				break;
			case 'Home':
				next = 0;
				break;
			case 'End':
				next = ids.length - 1;
				break;
			default:
				return; // unhandled keys pass through untouched
		}
		evt.preventDefault();
		change(ids[next], { notify: true, focus: true });
	});

	return {
		rootEl,
		tablistEl,
		panels,
		select: (id: string): void => change(id, { notify: false, focus: false }),
		getSelected: () => selected,
	};
}
