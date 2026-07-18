// D6 Task 10 (spec §4.2) — the compendium search modal: fuzzy over `item_name` via
// CompendiumIndex.query (§6), with `type:`/`source:` prefix filters parsed out of the
// search text. The FIRST SuggestModal in this repo (test/mocks/obsidian-core.ts gained a
// minimal mock base in this same commit — see its doc comment).
//
// `cx`-free by design (binding note 2, task-10-brief.md): the modal takes the
// CompendiumIndex directly rather than a RenderContext, so it can be opened from a plain
// editor command with no pipeline/element machinery in scope.
import { SuggestModal } from 'obsidian';
import type { App, TFile } from 'obsidian';
import type { CompendiumEntry, CompendiumIndex } from '@/services/CompendiumIndex';

/** Sentinel `scc` value for the synthetic "Sync compendium" row (empty-index state, spec
 *  §4.2). Not a real code — never resolvable, never rendered as a result outside that one
 *  state — so a NUL-prefixed string can't collide with any real "source/type/item" code. */
const SYNC_CTA_SCC = '\u0000sync-compendium';

function syncCtaEntry(): CompendiumEntry {
	return {
		scc: SYNC_CTA_SCC,
		type: '',
		name: 'Sync compendium…',
		source: '',
		// Never dereferenced: renderSuggestion/onChooseSuggestion both branch on
		// isSyncCtaEntry() before touching any other field, including this one.
		// Intentional synthetic sentinel row; CompendiumEntry.file is non-optional
		// everywhere else in the app, and narrowing it to optional would ripple across
		// every real consumer for the sake of this one never-dereferenced placeholder.
		// eslint-disable-next-line obsidianmd/no-tfile-tfolder-cast
		file: undefined as unknown as TFile,
	};
}

/** True for the synthetic empty-index row `getSuggestions` returns in place of real
 *  results — checked before any `entry.file`/`entry.type` access. */
export function isSyncCtaEntry(entry: CompendiumEntry): boolean {
	return entry.scc === SYNC_CTA_SCC;
}

export interface CompendiumSearchModalOptions {
	placeholder?: string;
	/** Spec §4.2's empty-index CTA: called instead of the ctor's `onChoose` when the user
	 *  selects the synthetic "Sync compendium" row. Wired by compendiumInsert.ts to the
	 *  plugin's existing `syncCompendium()` (reuses the F2 settings action, per spec). */
	onSyncRequested?: () => void | Promise<void>;
}

/** `type:<value>` / `source:<value>` prefix tokens are stripped from the query text and
 *  turned into exact-match CompendiumIndex filters; whatever remains (trimmed, collapsed
 *  whitespace) is the fuzzy `item_name` text. Tokens may appear anywhere in the query and
 *  in either order. */
export function parseCompendiumQuery(query: string): {
	text: string;
	filters: { type?: string; source?: string };
} {
	const filters: { type?: string; source?: string } = {};
	const text = query
		.replace(/(^|\s)(type|source):(\S+)/gi, (_m, _pre, key: string, value: string) => {
			if (key.toLowerCase() === 'type') filters.type = value;
			else filters.source = value;
			return ' ';
		})
		.trim()
		.replace(/\s+/g, ' ');
	return { text, filters };
}

export class CompendiumSearchModal extends SuggestModal<CompendiumEntry> {
	constructor(
		app: App,
		private readonly index: CompendiumIndex,
		private readonly onChoose: (entry: CompendiumEntry, evt: MouseEvent | KeyboardEvent) => void,
		private readonly opts: CompendiumSearchModalOptions = {},
	) {
		super(app);
		this.setPlaceholder(opts.placeholder ?? 'Search the compendium…');
	}

	getSuggestions(query: string): CompendiumEntry[] {
		// D6 Task 10 binding note 4 (task-10-brief.md): reconciled against Task 2's own
		// `available` divergence (task-2-review.md) rather than gating on manifest
		// presence. Search is a pure read over the frontmatter index CompendiumIndex
		// already maintains — it works the moment ANY code is indexed, regardless of
		// whether that content arrived via an F2 sync (manifest) or was hand-authored/
		// left over from an older install. Manifest presence is a sync-provenance
		// question (F2's concern); "can I search" is an index-nonempty question — this
		// is the practical gate for that.
		if (!this.index.available) return [syncCtaEntry()];
		const { text, filters } = parseCompendiumQuery(query);
		return this.index.query(text, filters);
	}

	renderSuggestion(entry: CompendiumEntry, el: HTMLElement): void {
		el.addClass('dse-compendium-suggest');
		if (isSyncCtaEntry(entry)) {
			el.createDiv({ cls: 'dse-compendium-suggest__title', text: entry.name });
			el.createDiv({
				cls: 'dse-compendium-suggest__hint',
				text: 'No compendium indexed yet — select to sync.',
			});
			return;
		}
		const row = el.createDiv({ cls: 'dse-compendium-suggest__row' });
		row.createSpan({ cls: 'dse-compendium-suggest__name', text: entry.name });
		row.createSpan({ cls: 'dse-compendium-suggest__type', text: entry.type });
		row.createSpan({ cls: 'dse-compendium-suggest__source', text: entry.source });
		el.createEl('code', { cls: 'dse-compendium-suggest__code', text: entry.scc });
	}

	onChooseSuggestion(entry: CompendiumEntry, evt: MouseEvent | KeyboardEvent): void {
		if (isSyncCtaEntry(entry)) {
			void this.opts.onSyncRequested?.();
			return;
		}
		this.onChoose(entry, evt);
	}
}
