// src/views/settingsShell.ts — SC-131: the settings navigation shell.
//
// ONE mechanism, four render modes over ONE model. The settings tab had grown into a
// single ~4000px scroll page (6 descriptor-driven pref groups + 3 hand-written
// operational sections), and SC-123's 18 display-parity settings would roughly double
// it. Rather than three throwaway prototypes, the candidates Scott picks from are three
// render modes of the same `NavSection[]` model — so whichever one ships, the code that
// ships is the code that was screenshotted.
//
//   'off'      today's layout, verbatim: every section stacked, no nav. Kept as the
//              CONTRAST baseline for the decision pack (and as a trivial fallback).
//   'tabs'     candidate A — one tab per section, active tab persisted per session.
//   'sections' candidate B — every section a collapsed <details> + a sticky mini-nav
//              that scrolls to and expands its target. Section bodies render LAZILY on
//              first expand.
//   'search'   candidate C — the 'tabs' bar plus a filter field. Empty query is exactly
//              'tabs'; a non-empty query hides the bar and lists every matching row
//              across ALL sections under its own section heading.
//
// The model is deliberately dumb: a section is a label, an optional reset handler and an
// ordered row list; a row is searchable text plus a `render(container)` thunk. Pref rows
// get their thunk from the descriptor loop, operational rows from hand-written closures —
// so search covers the WHOLE tab, not just the generated half. Rows with no `label` are
// chrome (an intro paragraph, the sync status line): they render in the unfiltered modes
// and are never a search hit.
//
// Invariants this shell must not break (SC-131 constraints):
//   - a section's reset handler always resets its FULL member list, including rows the
//     current view is not showing (advanced rows, filtered-out rows);
//   - Advanced disclosures stay inside their own section;
//   - live-apply is untouched — every row's own onChange still calls prefs.set().
import { Setting } from 'obsidian';

export type SettingsNavMode = 'off' | 'tabs' | 'sections' | 'search';

/** The shipped mode. SC-131 evidence session: flipped per candidate to shoot A/B/C
 *  against identical content, then pinned to Scott's pick (the losers get deleted).
 *  NOT a user setting — one mode ships. */
export const SETTINGS_NAV_MODE: SettingsNavMode = 'search';

/** Modes in which more than one section is on screen at once — the live preview renders
 *  at most once per view, so in these the caller hands `renderPreview` to exactly one
 *  section (Statblock display) instead of to every preview-affecting one. */
export const MULTI_SECTION_MODES: readonly SettingsNavMode[] = ['off', 'sections'];

export interface NavRow {
	/** Search key AND the "this is a real setting" marker. Omit for chrome. */
	label?: string;
	/** Secondary search key (the row's help text). */
	help?: string;
	/** Renders behind the section's "Advanced" disclosure in the unfiltered modes.
	 *  A search hit is shown directly — hiding a matched row would read as a broken
	 *  search. */
	advanced?: boolean;
	render(container: HTMLElement): void;
}

export interface NavSection {
	/** Stable id (used for the active-tab memory and as a DOM hook). */
	id: string;
	label: string;
	/** The heading's rotate-ccw extra button. Resets the section's FULL member list. */
	onReset?: () => void;
	rows: readonly NavRow[];
	/** Rendered after the section's rows, unfiltered views only. */
	renderPreview?: (container: HTMLElement) => void;
}

export interface ShellOptions {
	mode: SettingsNavMode;
	sections: readonly NavSection[];
	/** Session-scoped active tab id (null / unknown ⇒ the first section). */
	activeId: string | null;
	/** Session-scoped filter text ('search' mode only). */
	query: string;
	onActiveChange(id: string): void;
	onQueryChange(query: string): void;
	/** Called immediately before every body (re)render: unloads the previous render's
	 *  mounted children (the live preview) and recreates the owner. */
	recycle(): void;
	/** Rendered once at the very bottom, in every mode (the reset-all button). */
	renderFooter?(container: HTMLElement): void;
}

/** Case-insensitive substring over label + help + the owning section's label, so
 *  "typography" finds every font row and "font" finds the Typography rows. */
function rowMatches(row: NavRow, section: NavSection, needle: string): boolean {
	if (!row.label) return false;
	return `${row.label} ${row.help ?? ''} ${section.label}`.toLowerCase().includes(needle);
}

function renderHeading(container: HTMLElement, section: NavSection): void {
	const setting = new Setting(container).setName(section.label).setHeading();
	if (!section.onReset) return;
	setting.addExtraButton((button) =>
		button
			.setIcon('rotate-ccw')
			.setTooltip('Reset this section to defaults')
			.onClick(() => section.onReset?.()),
	);
}

/** Primary rows in order, then the advanced ones behind one collapsed disclosure —
 *  the SC-112 Task 8 shape, unchanged. */
function renderRows(container: HTMLElement, rows: readonly NavRow[]): void {
	for (const row of rows) if (!row.advanced) row.render(container);
	const advanced = rows.filter((row) => row.advanced);
	if (!advanced.length) return;
	const details = container.createEl('details', { cls: 'dse-settings-advanced' });
	details.createEl('summary', { text: 'Advanced' });
	for (const row of advanced) row.render(details);
}

function renderWholeSection(container: HTMLElement, section: NavSection): void {
	renderHeading(container, section);
	renderRows(container, section.rows);
	section.renderPreview?.(container);
}

export function renderSettingsShell(containerEl: HTMLElement, options: ShellOptions): void {
	const { mode, sections } = options;
	if (!sections.length) {
		options.renderFooter?.(containerEl);
		return;
	}
	const shell = containerEl.createDiv({ cls: `dse-settings-shell dse-settings-shell--${mode}` });

	if (mode === 'off') {
		options.recycle();
		for (const section of sections) renderWholeSection(shell, section);
		options.renderFooter?.(shell);
		return;
	}

	if (mode === 'sections') {
		renderCollapsibleSections(shell, options);
		options.renderFooter?.(shell);
		return;
	}

	renderTabbedShell(shell, options);
	options.renderFooter?.(shell);
}

// —— candidate B: collapsed <details> per section + a sticky mini-nav ——
function renderCollapsibleSections(shell: HTMLElement, options: ShellOptions): void {
	options.recycle();
	const nav = shell.createDiv({ cls: 'dse-settings-mininav' });
	const body = shell.createDiv({ cls: 'dse-settings-body' });
	for (const section of options.sections) {
		const details = body.createEl('details', {
			cls: 'dse-settings-section',
			attr: { 'data-section-id': section.id },
		}) as HTMLDetailsElement;
		details.createEl('summary', { cls: 'dse-settings-section__summary', text: section.label });
		const sectionBody = details.createDiv({ cls: 'dse-settings-section__body' });
		let filled = false;
		const fill = (): void => {
			if (filled) return;
			filled = true;
			renderWholeSection(sectionBody, section);
		};
		// Real browsers fire `toggle` on both user clicks and programmatic `.open = true`;
		// jsdom fires it for neither, so the mini-nav below calls fill() itself. fill() is
		// idempotent, so the double call is harmless where the event DOES fire.
		details.addEventListener('toggle', () => {
			if (details.open) fill();
		});
		const jump = nav.createEl('button', {
			cls: 'dse-settings-mininav__item',
			text: section.label,
			attr: { type: 'button', 'data-section-id': section.id },
		});
		jump.addEventListener('click', () => {
			details.open = true;
			fill();
			details.scrollIntoView?.({ block: 'start' });
		});
	}
}

// —— candidates A ('tabs') and C ('search') ——
function renderTabbedShell(shell: HTMLElement, options: ShellOptions): void {
	const { sections } = options;
	let activeId = sections.some((section) => section.id === options.activeId)
		? (options.activeId as string)
		: sections[0].id;
	let query = options.mode === 'search' ? options.query : '';

	let input: HTMLInputElement | null = null;
	if (options.mode === 'search') {
		const wrap = shell.createDiv({ cls: 'dse-settings-search' });
		input = wrap.createEl('input', {
			cls: 'dse-settings-search__input',
			attr: {
				type: 'search',
				placeholder: 'Search settings…',
				'aria-label': 'Search settings',
			},
		}) as HTMLInputElement;
		input.value = query;
	}

	const nav = shell.createDiv({ cls: 'dse-settings-nav', attr: { role: 'tablist' } });
	const tabs = new Map<string, HTMLElement>();
	for (const section of sections) {
		const tab = nav.createEl('button', {
			cls: 'dse-settings-nav__tab',
			text: section.label,
			attr: { type: 'button', role: 'tab', 'data-section-id': section.id },
		});
		tabs.set(section.id, tab);
		tab.addEventListener('click', () => {
			if (activeId === section.id) return;
			activeId = section.id;
			options.onActiveChange(section.id);
			paintTabs();
			renderBody();
		});
	}
	const paintTabs = (): void => {
		for (const [id, tab] of tabs) {
			const active = id === activeId;
			tab.toggleClass('is-active', active);
			tab.setAttribute('aria-selected', String(active));
		}
	};

	const body = shell.createDiv({ cls: 'dse-settings-body' });

	const renderBody = (): void => {
		options.recycle();
		body.empty();
		const needle = query.trim().toLowerCase();
		const filtering = options.mode === 'search' && needle !== '';
		nav.toggleClass('dse-hidden', filtering);
		if (!filtering) {
			const section = sections.find((candidate) => candidate.id === activeId) ?? sections[0];
			renderWholeSection(body, section);
			return;
		}
		// Filtered: every matching row across every section, under its own heading, with
		// the section's reset button still attached (it still resets the full member list —
		// its tooltip says so). Advanced hits render inline; hiding a match behind a
		// disclosure is how a search earns a reputation for being broken.
		const groups = sections
			.map((section) => ({
				section,
				matched: section.rows.filter((row) => rowMatches(row, section, needle)),
			}))
			.filter((group) => group.matched.length > 0);
		const hits = groups.reduce((total, group) => total + group.matched.length, 0);
		if (hits === 0) {
			body.createEl('p', {
				cls: 'dse-settings-empty',
				text: `No settings match “${query.trim()}”.`,
			});
			return;
		}
		body.createEl('p', {
			cls: 'dse-settings-count',
			text: `${hits} setting${hits === 1 ? '' : 's'} in ${groups.length} section${groups.length === 1 ? '' : 's'}.`,
		});
		for (const { section, matched } of groups) {
			renderHeading(body, section);
			for (const row of matched) row.render(body);
		}
	};

	input?.addEventListener('input', () => {
		query = input?.value ?? '';
		options.onQueryChange(query);
		// Only the body is rebuilt — the input element is never touched, so the caret and
		// focus survive every keystroke.
		renderBody();
	});

	paintTabs();
	renderBody();
}
