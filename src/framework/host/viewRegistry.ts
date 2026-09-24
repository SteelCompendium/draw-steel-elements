// SC-340 (spec §6.1–§6.4) — the ViewRegistry: a plugin-scoped Component that OWNS every
// reading-mode ElementView, so a view can outlive the section it was drawn in.
//
// Why ownership lives here from the start: Obsidian's Component.removeChild always unloads
// (B8), so a view that was ever a child of the block's MarkdownRenderChild could never be
// rescued. The render child now only SIGNALS: when the host's CURRENT render child unloads,
// the host calls release(), which unloads the view (its registered flush-on-unload writes
// any pending body first — LIFO: it was registered first, so it runs last).
//
// Adoption (Task 4) adds claim tickets: host.replaceSource records the body it is about to
// write (noteWrite) BEFORE Vault.process, because Obsidian fires `modify` and runs the new
// section's code-block processor inside/just after it (B1, B2). The processor then asks
// claim(docId, sourcePath, source) whether a live view wrote exactly this body.
import { Component } from 'obsidian';
import type { ReadingModeBlockHost } from './ReadingModeBlockHost';
import { normalizeBody } from './ReadingModeBlockHost';

/** A write's claim ticket is valid this long (spec §6.2; the rebuild arrives ~5 ms after modify). */
export const CLAIM_WINDOW_MS = 3000;

/** One write's claim ticket: valid for CLAIM_WINDOW_MS, consumed by the rebuild it caused. */
export interface ClaimTicket {
	body: string;
	at: number;
}

export interface ViewRegistryEntry {
	readonly view: Component;
	readonly host: ReadingModeBlockHost;
	readonly root: HTMLElement;
	/** Bodies this view wrote, oldest first; each one is a ticket for one rebuild. */
	tickets: ClaimTicket[];
	/** True between a successful claim() and finishClaim(). */
	claiming: boolean;
	released: boolean;
	/** Why the entry was released (diagnostics; the gate reads it). */
	releasedBy: string | null;
}

/** The index of the NEWEST ticket (scanning from the end — tickets are oldest-first) that is
 *  still within CLAIM_WINDOW_MS of `at` and whose normalized body equals `wanted`. -1 if none.
 *  (Array.prototype.findLastIndex needs an ES2023 lib the project doesn't target — ES6/ES7.) */
function findLastMatchingTicketIndex(tickets: Array<{ body: string; at: number }>, at: number, wanted: string): number {
	for (let i = tickets.length - 1; i >= 0; i--) {
		if (at - tickets[i].at < CLAIM_WINDOW_MS && normalizeBody(tickets[i].body) === wanted) return i;
	}
	return -1;
}

export interface ViewRegistryStats {
	claims: number;
	misses: number;
	releases: number;
	ambiguous: number;
	collisions: number;
}

export class ViewRegistry extends Component {
	/** Kill switch (spec §6.6): false = claim() always misses = today's behaviour. */
	enabled: boolean;
	readonly stats: ViewRegistryStats = { claims: 0, misses: 0, releases: 0, ambiguous: 0, collisions: 0 };
	private readonly entries = new Set<ViewRegistryEntry>();
	private readonly now: () => number;

	constructor(options: { enabled: boolean; now?: () => number }) {
		super();
		this.enabled = options.enabled;
		this.now = options.now ?? (() => Date.now());
	}

	get size(): number {
		return this.entries.size;
	}

	liveEntries(): readonly ViewRegistryEntry[] {
		return [...this.entries];
	}

	/** Take ownership of a freshly mounted reading-mode view. */
	own(view: Component, host: ReadingModeBlockHost, root: HTMLElement): ViewRegistryEntry {
		const entry: ViewRegistryEntry = { view, host, root, tickets: [], claiming: false, released: false, releasedBy: null };
		this.entries.add(entry);
		host.attachEntry(entry);
		this.addChild(view);
		// SC-340 fix round 1 (Important-1): the host's render child can have unloaded WHILE
		// this view was still being built (prepareModel's refs/validation await outlives the
		// section it started under) — own() runs after that race is already lost, so check the
		// host's own record of it rather than relying on a release() that already happened.
		if (host.renderChildGone) this.release(entry, 'render-child-gone-before-own');
		return entry;
	}

	/** Record a claim ticket for `body` (called by the host BEFORE Vault.process). Returns
	 *  the ticket so the caller can drop it again (dropTicket) if the write turns out to
	 *  change nothing — see dropTicket's doc. */
	noteWrite(entry: ViewRegistryEntry, body: string): ClaimTicket {
		const at = this.now();
		const ticket: ClaimTicket = { body, at };
		if (entry.released) return ticket;
		entry.tickets = entry.tickets.filter((t) => at - t.at < CLAIM_WINDOW_MS);
		entry.tickets.push(ticket);
		return ticket;
	}

	/**
	 * SC-340 Task 4 review (carried fix): a write that changes nothing on disk ('abort',
	 * 'miss', or a spliced body identical to what was already there) causes no rebuild, so
	 * its ticket would otherwise linger up to CLAIM_WINDOW_MS and could let claim() hand
	 * this view to an unrelated rebuild of an identical-body TWIN block. Removes exactly
	 * that one ticket (by reference); a no-op if it was already consumed/expired/removed.
	 */
	dropTicket(entry: ViewRegistryEntry, ticket: ClaimTicket): void {
		const index = entry.tickets.indexOf(ticket);
		if (index >= 0) entry.tickets.splice(index, 1);
	}

	/**
	 * SC-340 §6.2: the ONE live, unclaimed view in this rendered document (docId) and file
	 * whose recent own write produced exactly `body`. Consumes that ticket and older ones.
	 */
	claim(docId: string, sourcePath: string, body: string): ViewRegistryEntry | null {
		if (!this.enabled) return null;
		const at = this.now();
		const wanted = normalizeBody(body);
		const hits: Array<{ entry: ViewRegistryEntry; index: number }> = [];
		for (const entry of this.entries) {
			if (entry.released || entry.claiming) continue;
			if (!(entry.view as unknown as { _loaded: boolean })._loaded) continue;
			if (entry.host.docId !== docId || entry.host.sourcePath !== sourcePath) continue;
			// Fix round 1 (M-2): spec §6.2 — "the entry with the newest ticket wins". Tickets
			// are oldest-first, so the LAST matching index is the newest matching ticket — a
			// coalesced rebuild for writes A, B, A must match the SECOND A, not the first
			// (findIndex would pick the oldest and leave ['B','A'] stranded live).
			const index = findLastMatchingTicketIndex(entry.tickets, at, wanted);
			if (index >= 0) hits.push({ entry, index });
		}
		if (hits.length === 0) {
			this.stats.misses++;
			return null;
		}
		if (hits.length > 1) this.stats.ambiguous++;
		hits.sort((a, b) => b.entry.tickets[b.index].at - a.entry.tickets[a.index].at);
		const { entry, index } = hits[0];
		entry.tickets.splice(0, index + 1);
		entry.claiming = true;
		this.stats.claims++;
		return entry;
	}

	finishClaim(entry: ViewRegistryEntry): void {
		entry.claiming = false;
	}

	/** Unload a view for real. Idempotent. Its registered flush-on-unload writes first. */
	release(entry: ViewRegistryEntry, reason: string): void {
		if (entry.released) return;
		entry.released = true;
		entry.releasedBy = reason;
		entry.claiming = false;
		this.entries.delete(entry);
		this.stats.releases++;
		this.removeChild(entry.view);
	}

	onunload(): void {
		// The children (views) were already unloaded, LIFO, before this runs.
		for (const entry of this.entries) {
			entry.released = true;
			entry.releasedBy = 'registry-unload';
		}
		this.entries.clear();
	}
}
