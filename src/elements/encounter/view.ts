// D8 Task 4 (spec §2) — EncounterView: resolves each monster row live via
// cx.compendium.getStatblock (the D6 seam — never re-parses statblock files itself),
// computes budget/ratio/band/victory-payout through budget.ts's pure math, renders the
// roster + summary, rewrites the `_computed` display cache (spec §2.5: "recompute
// wins"), and offers the two OD-5 hand-off actions.
//
// READ-ONLY (F1 §4.4, cx.host.canPersist === false): the roster/summary render exactly
// the same either way (they are pure display, no write path) — the only canPersist-gated
// UI is the two hand-off action buttons, omitted entirely when read-only (no dead-end
// write affordance), matching every other persisted element's convention (initiative's
// action bar, negotiation's Reset menu).
import { Notice, TFile } from 'obsidian';
import type { Statblock } from 'steel-compendium-sdk';
import { ElementView } from '@/framework/view';
import { buttonRow, cardHead } from '@/framework/kit';
import { normalizeSccTarget } from '@/refs/SccResolver';
import type { EncounterComputed, EncounterModel, EncounterRow } from './model';
import { computeEncounter, rowEv } from './budget';
import { serialize as serializeInitiative } from '../initiative/model';
import type { EncounterData, EnemyGroup } from '../initiative/model';

/** One resolved (or degraded) roster row — the shape buildRoster/buildEncounterData
 *  share, so "excluded from EV" and "excluded from hand-off" are the SAME filter
 *  (spec §2's binding note: unresolved rows are never silently dropped, but they never
 *  contribute stats either). */
type RowResolution =
	| { kind: 'resolved'; row: EncounterRow; statblock: Statblock }
	| { kind: 'unresolved'; row: EncounterRow; reason: string };

type ResolvedRow = Extract<RowResolution, { kind: 'resolved' }>;

/** Task 4 review round 1, Finding 2 (MEDIUM): spec §2.3/2.4's captain hand-off. A
 *  `squad: captain` row has no schema field of its own to name the minion squad it
 *  leads (spec §2.5's schema doesn't add one — a gap this task inherits, not
 *  introduces), so pairing is by ADJACENCY in `monsters[]`: a minion row claims the
 *  nearest unclaimed captain row immediately after it, else immediately before it (in
 *  that order) — "grouping same-name/adjacent minion+captain rows," the review's own
 *  suggested fix. Every minion row (paired or not) becomes a `'squad'` group so a lone
 *  minion row keeps producing `is_squad: true` (unchanged prior behavior — see the
 *  hand-off DOM test). A `squad: captain` row that never gets claimed is a `
 *  'orphan-captain'` group: still resolved, still counted in EV, but flagged with a
 *  visible roster note and handed off as an ordinary solo monster (never a silent,
 *  inert `squad_role` field on a non-squad group). */
type GroupedRow =
	| { kind: 'plain'; entry: RowResolution }
	| { kind: 'squad'; minion: ResolvedRow; captain?: ResolvedRow }
	| { kind: 'orphan-captain'; entry: ResolvedRow };

function groupRows(resolved: RowResolution[]): GroupedRow[] {
	const isCaptainRow = (i: number): boolean => {
		const entry = resolved[i];
		return entry !== undefined && entry.kind === 'resolved' && entry.row.squad === 'captain';
	};

	// Pass 1: claim adjacency pairs left-to-right (prefer the following row, then the
	// preceding row); a captain already claimed by an earlier minion can't be claimed
	// again by a later one.
	const captainClaimedBy = new Map<number, number>(); // captain index -> minion index
	const minionCaptain = new Map<number, number>(); // minion index -> captain index
	for (let i = 0; i < resolved.length; i++) {
		const entry = resolved[i];
		if (entry.kind !== 'resolved' || entry.row.squad === 'captain') continue;
		if (!isMinionRow(entry.row, entry.statblock)) continue;
		let captainIndex: number | null = null;
		if (isCaptainRow(i + 1) && !captainClaimedBy.has(i + 1)) captainIndex = i + 1;
		else if (isCaptainRow(i - 1) && !captainClaimedBy.has(i - 1)) captainIndex = i - 1;
		if (captainIndex !== null) {
			captainClaimedBy.set(captainIndex, i);
			minionCaptain.set(i, captainIndex);
		}
	}

	// Pass 2: emit one GroupedRow per input row, in original order, skipping captain
	// rows that were claimed (they render as part of their minion's 'squad' group).
	const grouped: GroupedRow[] = [];
	for (let i = 0; i < resolved.length; i++) {
		const entry = resolved[i];
		if (entry.kind === 'resolved' && entry.row.squad === 'captain') {
			if (captainClaimedBy.has(i)) continue;
			grouped.push({ kind: 'orphan-captain', entry });
			continue;
		}
		if (entry.kind === 'resolved' && isMinionRow(entry.row, entry.statblock)) {
			const captainIndex = minionCaptain.get(i);
			grouped.push({
				kind: 'squad',
				minion: entry,
				captain: captainIndex !== undefined ? (resolved[captainIndex] as ResolvedRow) : undefined,
			});
			continue;
		}
		grouped.push({ kind: 'plain', entry });
	}
	return grouped;
}

/** Hand-off target D8 Task 10 wires in (sendToSidebar bound to the production
 *  DseSidebarServices bundle, main.ts). Kept as a late-bound MODULE hook rather than a
 *  new RenderContext field: RenderContext (framework/context.ts) is out of this task's
 *  file scope, and DseSidebarServices needs the plugin's live ElementPipeline/
 *  ElementRegistry instances that a per-block RenderContext doesn't carry (they exist
 *  only inside main.ts's onload closure — see framework/sidebar/registration.ts).
 *  Defaults to null so "Open in sidebar" is never a silent no-op before Task 10 lands:
 *  the button still creates the tracker block and tells the user how to finish the
 *  hand-off by hand. */
type SidebarHandoff = (filePath: string, alias: string, cursorLine?: number) => Promise<void>;
let sidebarHandoff: SidebarHandoff | null = null;

/** Wired by Task 10 (main.ts) to `(filePath, alias, line) => sendToSidebar(dseSidebarServices, filePath, alias, line)`. */
export function setEncounterSidebarHandoff(fn: SidebarHandoff | null): void {
	sidebarHandoff = fn;
}

const NOT_INSTALLED = 'Compendium not installed — run "Sync compendium" to resolve this row.';
const NOT_SYNCED = 'Compendium not synced — run "Sync compendium" to resolve this row.';
const NOT_RESOLVED = 'Unresolved — sync compendium.';

export class EncounterView extends ElementView<EncounterModel> {
	protected async onMount(root: HTMLElement, model: EncounterModel): Promise<void> {
		const container = root.createDiv({ cls: 'dse-enc' });
		const canPersist = this.cx.host.canPersist;

		const resolved = await this.resolveRows(model.monsters);
		const computed = computeEncounter(
			resolved
				.filter((r): r is Extract<RowResolution, { kind: 'resolved' }> => r.kind === 'resolved')
				.map((r) => ({ count: r.row.count, ev: r.statblock.ev })),
			model.party,
		);

		this.buildHead(container, model, computed);
		this.buildParty(container, model.party);
		this.buildRoster(container, resolved);
		this.buildSummary(container, computed);
		this.buildActions(container, resolved, canPersist);

		await this.syncComputed(model, computed);
	}

	// ------------------------------------------------------------------ resolution

	/** spec §2.1: resolve every row in parallel via cx.compendium.getStatblock — the
	 *  builder never parses statblock files itself. Rows carrying `scc.v1:`-prefixed
	 *  codes (spec §2.5's own schema) are normalized to the bare "source/type/item"
	 *  form CompendiumIndex.getEntry/getStatblock key on (SccResolver's index is keyed
	 *  bare — see CompendiumIndex.ts's getEntry, which calls codeToPath(code) with NO
	 *  prefix stripping of its own). Binding note: `available === false` and a null
	 *  per-row resolution are both VISIBLE degrade rows, never silent.
	 *
	 *  Task 4 review round 1, Finding 4 (LOW): `Promise.allSettled` (not `Promise.all`)
	 *  — a single row whose `getStatblock` THROWS (a malformed statblock file can throw
	 *  inside `StatblockConfig.readYaml`'s `parseYaml`/`modelDTOAdapter`) degrades ONLY
	 *  that row, matching the design intent stated throughout this file ("excluded from
	 *  EV… never silently dropped, never all-or-nothing") rather than rejecting the
	 *  whole roster and handing the pipeline a generic error card. */
	private async resolveRows(rows: EncounterRow[]): Promise<RowResolution[]> {
		const index = this.cx.compendium;
		if (!index) {
			return rows.map((row) => ({ kind: 'unresolved', row, reason: NOT_INSTALLED }));
		}
		if (!index.available) {
			return rows.map((row) => ({ kind: 'unresolved', row, reason: NOT_SYNCED }));
		}
		const settled = await Promise.allSettled(
			rows.map(async (row): Promise<RowResolution> => {
				const bareCode = normalizeSccTarget(row.code) ?? row.code;
				const statblock = await index.getStatblock(bareCode);
				if (!statblock) return { kind: 'unresolved', row, reason: NOT_RESOLVED };
				return { kind: 'resolved', row, statblock };
			}),
		);
		return settled.map((result, i) =>
			result.status === 'fulfilled' ? result.value : { kind: 'unresolved', row: rows[i], reason: resolveErrorReason(result.reason) },
		);
	}

	// ------------------------------------------------------------------------ build

	private buildHead(container: HTMLElement, model: EncounterModel, computed: EncounterComputed): void {
		const head = container.createDiv({ cls: 'dse-enc__head' });
		cardHead(
			head,
			{
				leftEyebrow: model.label ? 'Encounter' : undefined,
				name: model.label?.trim() || 'Encounter',
				rightEyebrow: computed.band ? `Difficulty: ${capitalize(computed.band)}` : undefined,
				rightPrimary: computed.budget !== null ? `EV ${computed.spent_ev} / ${computed.budget}` : `EV ${computed.spent_ev}`,
				level: 2,
			},
			this,
		);
	}

	private buildParty(container: HTMLElement, party: EncounterModel['party']): void {
		const bits: string[] = [];
		if (party.hero_count !== undefined) bits.push(`${party.hero_count} heroes`);
		if (party.hero_level !== undefined) bits.push(`level ${party.hero_level}`);
		if (party.victories !== undefined) bits.push(`${party.victories} victories`);
		if (party.party_ref) bits.push(party.party_ref);
		if (bits.length === 0) return;
		container.createDiv({ cls: 'dse-enc__party', text: bits.join(' · ') });
	}

	private buildRoster(container: HTMLElement, resolved: RowResolution[]): void {
		const section = container.createDiv({ cls: 'dse-enc__roster' });
		section.createEl('h3', { cls: 'dse-enc__roster-heading', text: 'Monsters' });

		if (resolved.length === 0) {
			section.createDiv({ cls: 'dse-enc__empty', text: 'No monsters yet — add rows to this block.' });
			return;
		}

		const table = section.createEl('table', { cls: 'dse-enc__table' });
		const headRow = table.createEl('thead').createEl('tr');
		['Name', 'Role', 'Organization', 'Count', 'EV'].forEach((label) => {
			headRow.createEl('th', { text: label });
		});

		const tbody = table.createEl('tbody');
		for (const group of groupRows(resolved)) {
			if (group.kind === 'plain') {
				this.renderRosterRow(tbody, group.entry);
			} else if (group.kind === 'orphan-captain') {
				this.renderRosterRow(
					tbody,
					group.entry,
					'Orphan captain — no adjacent minion row to lead; hands off as a solo monster, not a squad.',
				);
			} else {
				this.renderRosterRow(tbody, group.minion, group.captain ? `Squad captain: ${group.captain.statblock.name}.` : undefined);
				if (group.captain) {
					this.renderRosterRow(tbody, group.captain, `Squad captain for ${group.minion.statblock.name}.`);
				}
			}
		}
	}

	/** One roster `<tr>` (5 cells: Name/Role/Organization/Count/EV) for a resolved row,
	 *  or the degrade cell for an unresolved one. `note`, when given, adds a SECOND
	 *  visible row underneath (Task 4 review round 1, Finding 2) — used for the two
	 *  squad-adjacency cases (a captain-bearing minion row, a captain row itself, or an
	 *  orphan captain) so squad association and orphan status are always shown, never a
	 *  silent/inert field. */
	private renderRosterRow(tbody: HTMLElement, entry: RowResolution, note?: string): void {
		const tr = tbody.createEl('tr', { cls: 'dse-enc__row' });
		if (entry.kind === 'resolved') {
			const sb = entry.statblock;
			tr.createEl('td', { text: sb.name, cls: 'dse-enc__cell-name' });
			tr.createEl('td', { text: sb.role ?? '' });
			tr.createEl('td', { text: sb.organization ?? '' });
			tr.createEl('td', { text: String(entry.row.count) });
			tr.createEl('td', { text: String(rowEv(entry.row.count, sb.ev)) });
		} else {
			tr.addClass('dse-enc__row--degraded');
			const cell = tr.createEl('td', { attr: { colspan: '5' } });
			cell.createSpan({ cls: 'dse-enc__degrade', text: `${entry.row.code} — ${entry.reason}` });
		}
		if (note) {
			tr.addClass('dse-enc__row--squad');
			const noteRow = tbody.createEl('tr', { cls: 'dse-enc__row-note' });
			const cell = noteRow.createEl('td', { attr: { colspan: '5' } });
			cell.createSpan({ cls: 'dse-enc__note', text: note });
		}
	}

	private buildSummary(container: HTMLElement, computed: EncounterComputed): void {
		const bar = container.createDiv({ cls: 'dse-enc__summary' });
		bar.createDiv({ cls: 'dse-enc__stat', text: `Spent EV: ${computed.spent_ev}` });

		if (computed.budget === null) {
			bar.createDiv({
				cls: 'dse-enc__stat dse-enc__stat--warn',
				text: 'Budget unset — configure in settings.',
			});
			return;
		}

		bar.createDiv({ cls: 'dse-enc__stat', text: `Budget: ${computed.budget}` });
		bar.createDiv({ cls: 'dse-enc__stat', text: `Ratio: ${computed.ratio!.toFixed(2)}` });
		const bandEl = bar.createDiv({
			cls: 'dse-enc__stat dse-enc__band',
			text: `Difficulty: ${capitalize(computed.band!)}`,
		});
		bandEl.setAttribute('data-band', computed.band!);
		bar.createDiv({ cls: 'dse-enc__stat dse-enc__vp', text: `On victory: +${computed.victories}` });
	}

	/** OD-5: both hand-off targets. Omitted entirely when !canPersist (F1 §4.4). */
	private buildActions(container: HTMLElement, resolved: RowResolution[], canPersist: boolean): void {
		if (!canPersist) return;
		const bar = buttonRow(
			container,
			[
				{
					icon: 'file-plus',
					text: 'Create tracker block',
					label: 'Create initiative tracker block',
					onClick: () => void this.handleCreateTrackerBlock(resolved),
				},
				{
					icon: 'panel-right',
					text: 'Open in sidebar',
					label: 'Open initiative tracker in sidebar',
					onClick: () => void this.handleOpenInSidebar(resolved),
				},
			],
			this,
		);
		bar.rowEl.addClass('dse-enc__actions');
	}

	// ------------------------------------------------------------------ _computed

	/** spec §2.5: "the view recomputes from live `ev` on every mount and rewrites it;
	 *  treat divergence as recompute wins." Guarded by computedEqual so a re-render with
	 *  UNCHANGED inputs never rewrites identical bytes back into the note (no persist
	 *  churn, no self-echo write for nothing). */
	private async syncComputed(model: EncounterModel, computed: EncounterComputed): Promise<void> {
		if (computedEqual(model._computed, computed)) return;
		model._computed = computed;
		if (!this.cx.host.canPersist) return;
		await this.persist();
	}

	// ------------------------------------------------------------------- hand-off

	/** spec §2.4: builder rows -> `EncounterData.enemy_groups[]`, carrying the SCC ref
	 *  (never inlined stats) so the tracker stays LIVE. Unresolved rows are excluded
	 *  (same filter as EV — spec: "the builder never parses statblock files itself"; a
	 *  row this view couldn't resolve has nothing to hand off).
	 *
	 *  Task 4 review round 1, Finding 2 (MEDIUM): a `'squad'` group (see `groupRows`)
	 *  emits ONE `enemy_group` with `is_squad: true` and up to two `creatures[]`
	 *  entries — the minion (`squad_role: 'minion'`, `amount: count`) plus, when
	 *  adjacency-paired, the captain (`squad_role: 'captain'`, `amount: count` —
	 *  usually 1) — matching the exact shape `parseEncounterData` validates (≤2
	 *  creatures, one minion type, ≤1 captain). An `'orphan-captain'` group still hands
	 *  off (a resolved row is never dropped) but as an ORDINARY solo group
	 *  (`is_squad: false`, no `squad_role`) — never an inert `squad_role: 'captain'` on
	 *  a group the initiative tracker would otherwise ignore. */
	private buildEncounterData(resolved: RowResolution[]): EncounterData {
		const enemy_groups: EnemyGroup[] = [];
		const soloGroup = (entry: ResolvedRow): EnemyGroup => {
			const sb = entry.statblock;
			const bareCode = normalizeSccTarget(entry.row.code) ?? entry.row.code;
			return {
				name: sb.name,
				is_squad: false,
				creatures: [
					{
						name: sb.name,
						amount: entry.row.count,
						max_stamina: parseInt(sb.stamina, 10) || 0,
						isHero: false,
						statblock: `scc.v1:${bareCode}`,
					},
				],
			};
		};

		for (const group of groupRows(resolved)) {
			if (group.kind === 'plain') {
				if (group.entry.kind !== 'resolved') continue;
				enemy_groups.push(soloGroup(group.entry));
				continue;
			}
			if (group.kind === 'orphan-captain') {
				enemy_groups.push(soloGroup(group.entry));
				continue;
			}
			// 'squad': the minion always anchors the group; the captain (if adjacency-
			// paired) rides along as a second creatures[] entry.
			const minionSb = group.minion.statblock;
			const minionCode = normalizeSccTarget(group.minion.row.code) ?? group.minion.row.code;
			const creatures: EnemyGroup['creatures'] = [
				{
					name: minionSb.name,
					amount: group.minion.row.count,
					max_stamina: parseInt(minionSb.stamina, 10) || 0,
					isHero: false,
					squad_role: 'minion',
					statblock: `scc.v1:${minionCode}`,
				},
			];
			if (group.captain) {
				const captainSb = group.captain.statblock;
				const captainCode = normalizeSccTarget(group.captain.row.code) ?? group.captain.row.code;
				creatures.push({
					name: captainSb.name,
					amount: group.captain.row.count,
					max_stamina: parseInt(captainSb.stamina, 10) || 0,
					isHero: false,
					squad_role: 'captain',
					statblock: `scc.v1:${captainCode}`,
				});
			}
			enemy_groups.push({ name: minionSb.name, is_squad: true, creatures });
		}
		return { heroes: [], enemy_groups, malice: { value: 0 } };
	}

	/** Writes/appends a `ds-initiative` block into the CURRENT note (host.sourcePath).
	 *  spec §2.4 says "a chosen note" — this task scopes "chosen" to the note the
	 *  encounter block already lives in (no note-picker UI exists anywhere in this
	 *  codebase yet; building one is out of this task's scope — a reasonable Task 10+
	 *  follow-up). Appends at end-of-file via the atomic Vault.process read-modify-write
	 *  (F1 §3.4/§4.2 pattern), never touching the encounter block itself. Returns the
	 *  note's path on success, null (with a visible Notice — never silent) otherwise.
	 *
	 *  Task 4 review round 1, Finding 5 (LOW): `vault.process` wrapped in try/catch — an
	 *  I/O failure now surfaces a Notice instead of an unhandled promise rejection,
	 *  matching every other "never silent" branch in this method. */
	private async writeTrackerBlock(resolved: RowResolution[]): Promise<string | null> {
		const filePath = this.cx.host.sourcePath;
		const file = this.cx.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			new Notice('Draw Steel Elements: cannot locate this note to create a tracker block.');
			return null;
		}
		const data = this.buildEncounterData(resolved);
		const body = serializeInitiative(data);
		const fenced = `\n\n\`\`\`ds-initiative\n${body}\n\`\`\`\n`;
		try {
			await this.cx.app.vault.process(file, (content) => content.replace(/\s*$/, '') + fenced);
		} catch (e) {
			new Notice(`Draw Steel Elements: failed to write the initiative tracker block — ${errorMessage(e)}`);
			return null;
		}
		new Notice('Draw Steel Elements: initiative tracker block created at the end of this note.');
		return filePath;
	}

	private async handleCreateTrackerBlock(resolved: RowResolution[]): Promise<void> {
		await this.writeTrackerBlock(resolved);
	}

	/** Task 4 review round 1, Finding 5 (LOW): `sidebarHandoff` wrapped in try/catch —
	 *  a rejection (I/O failure, a broken Task-10-wired hook) now surfaces a Notice
	 *  instead of an unhandled promise rejection. The tracker block has already been
	 *  written by this point (writeTrackerBlock above), so this failure is scoped to
	 *  "couldn't open it in the sidebar," not "lost the tracker." */
	private async handleOpenInSidebar(resolved: RowResolution[]): Promise<void> {
		const filePath = await this.writeTrackerBlock(resolved);
		if (filePath === null) return;
		if (!sidebarHandoff) {
			new Notice(
				'Draw Steel Elements: tracker block created — open the Draw Steel sidebar and use ' +
					'"Send block to sidebar" on it to pin it (sidebar hand-off not wired in this build).',
			);
			return;
		}
		try {
			await sidebarHandoff(filePath, 'ds-initiative');
		} catch (e) {
			new Notice(`Draw Steel Elements: tracker block created, but opening it in the sidebar failed — ${errorMessage(e)}`);
		}
	}
}

// ------------------------------------------------------------------------- helpers

/** spec §2.3: "The `role: 'MINION'` from the statblock auto-flags the row as
 *  squad-eligible." The SDK Statblock field that actually carries the "Minion" value
 *  is `organization` (MINION/HORDE/PLATOON/ELITE/SOLO/LEADER — recon §9, D8 spec §2.1)
 *  — `role` on the SDK model is the COMBAT role (Controller/Brute/…), a different axis.
 *  Treated here as the spec's prose using "role" informally for the organization field
 *  (matching v2's own sc-encounter-core.js `isMinion`, which also tests `organization`).
 *  An explicit `row.squad` always wins over the auto-detected default. */
function isMinionRow(row: EncounterRow, statblock: Statblock): boolean {
	if (row.squad) return row.squad === 'minion';
	return /minion/i.test(statblock.organization ?? '');
}

function capitalize(s: string): string {
	return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function computedEqual(a: EncounterComputed | undefined, b: EncounterComputed): boolean {
	if (!a) return false;
	return a.spent_ev === b.spent_ev && a.budget === b.budget && a.ratio === b.ratio && a.band === b.band && a.victories === b.victories;
}

/** Task 4 review round 1, Finding 4: a `Promise.allSettled` rejection reason -> a
 *  visible per-row degrade message (same NOT_INSTALLED/NOT_SYNCED/NOT_RESOLVED family). */
function resolveErrorReason(reason: unknown): string {
	return `Failed to resolve — ${errorMessage(reason)}`;
}

/** Task 4 review round 1, Finding 5: a normalized message for a Notice, from either a
 *  real Error or any other thrown value. */
function errorMessage(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}
