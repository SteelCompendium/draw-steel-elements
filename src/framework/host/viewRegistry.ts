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

export interface ViewRegistryEntry {
	readonly view: Component;
	readonly host: ReadingModeBlockHost;
	readonly root: HTMLElement;
	/** Bodies this view wrote, oldest first; each one is a ticket for one rebuild. */
	tickets: Array<{ body: string; at: number }>;
	/** True between a successful claim() and finishClaim(). */
	claiming: boolean;
	released: boolean;
	/** Why the entry was released (diagnostics; the gate reads it). */
	releasedBy: string | null;
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

	/** Record a claim ticket for `body` (called by the host BEFORE Vault.process). */
	noteWrite(entry: ViewRegistryEntry, body: string): void {
		if (entry.released) return;
		const at = this.now();
		entry.tickets = entry.tickets.filter((ticket) => at - ticket.at < CLAIM_WINDOW_MS);
		entry.tickets.push({ body, at });
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
			const index = entry.tickets.findIndex((t) => at - t.at < CLAIM_WINDOW_MS && normalizeBody(t.body) === wanted);
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
