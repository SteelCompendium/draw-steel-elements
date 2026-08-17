// D6 Task 10 (spec §4.1, §4.3) — the two compendium insert commands plus the standalone
// action functions the actions table describes. `insert-compendium-reference` opens the
// search modal with "reference block" as the default action (OD-D6-6);
// `insert-compendium-block` opens the same modal with "full block (snapshot)" as the
// default. Both are editor commands (editorCallback) — insert-at-cursor only, matching
// D9's insert-command convention (src/authoring/insert.ts), never a range-replace over
// existing content.
import { Notice, stringifyYaml } from 'obsidian';
import type { Editor, Plugin } from 'obsidian';
import type { CompendiumEntity, CompendiumEntry, CompendiumIndex } from '@/services/CompendiumIndex';
import type { CompendiumSyncService } from '@/data/CompendiumSyncService';
import { referenceAliasForType, snapshotAliasForType } from '@/services/typeAdapters';
import { wrapFence } from './scaffold';
import { CompendiumSearchModal } from './CompendiumSearchModal';

/** Reference block (OD-D6-6 default): a fenced block whose body is just the bare SCC code
 *  — live-updates with the compendium, smallest possible note. Since SC-149 the fence is
 *  `ds-scc` for everything except the three public typed families
 *  (statblock/feature/featureblock), which keep `ds-statblock`/`ds-feature`/
 *  `ds-featureblock` — see `referenceAliasForType`.
 *
 *  **Adjudication (D6 Task 10):** The spec's own example (§4.3) shows the inserted body as
 *  a bare item slug (smallest note). We instead insert the full `entry.scc` triple
 *  (`source/type/item`), a deliberate deviation justified by the workspace's "codes are
 *  forever" principle: machine-inserted references prefer the unambiguous permanent code
 *  over slug brevity, since a slug can become ambiguous as the corpus grows. Both fences
 *  handle that: `detectWholeBlockRef` rule 2 (§1.3) detects the `/` for the typed elements,
 *  and a full code is the ONLY form `ds-scc` accepts at all. */
export function insertReferenceBlock(editor: Editor, entry: CompendiumEntry): void {
	const alias = referenceAliasForType(entry.type);
	editor.replaceSelection(wrapFence(alias, entry.scc) + '\n');
}

/** Inline link: prose-friendly, renders via `rewriteSccAnchors` (F2 §4.3) and the D6 §5
 *  hover-preview once that lands. */
export function insertInlineLink(editor: Editor, entry: CompendiumEntry): void {
	editor.replaceSelection(`[${entry.name}](scc.v1:${entry.scc})`);
}

/**
 * `entity.model()` is deliberately opaque (`ElementModel = unknown`, typeAdapters.ts):
 * the frontmatter family (Kit/Ancestry/…/Condition) returns the SDK model itself, which
 * has `.toDTO()` directly (`SteelCompendiumModel`); the ds-block family (statblock/
 * feature/featureblock) instead returns a thin `*Config` wrapper (`StatblockConfig`/
 * `FeatureConfig`/`FeatureblockConfig`) around that same kind of SDK model, one property
 * level down. `undefined` covers the model-less family (`rule.*`'s `GenericNote` — no
 * SDK DTO exists at all, matching genericCard's own "the raw body IS the card content"
 * design, spec §3 / OD-D6-7) — the caller falls back to the resolved file's raw body.
 * (Since SC-149 only the three ds-block families can be snapshotted at all, so that
 * fallback is now a defensive path rather than the `rule.*` route it was written for.)
 */
function extractDTO(model: unknown): unknown {
	if (model == null || typeof model !== 'object') return undefined;
	const asToDTO = (model as { toDTO?: () => unknown }).toDTO;
	if (typeof asToDTO === 'function') return asToDTO.call(model);
	for (const key of ['statblock', 'feature', 'featureblock'] as const) {
		const wrapped = (model as Record<string, unknown>)[key];
		if (wrapped != null && typeof wrapped === 'object') {
			const wrappedToDTO = (wrapped as { toDTO?: () => unknown }).toDTO;
			if (typeof wrappedToDTO === 'function') return wrappedToDTO.call(wrapped);
		}
	}
	return undefined;
}

/**
 * SC-165 — the DTO keys a SNAPSHOT must not paste into a user's note.
 *
 * `metadata` is the SDK DTOs' transport/provenance slot (steel-etl fills it: `scc`,
 * `source`, and for a feature a mirror of the whole entry). NOTHING on the render path
 * reads it — the three views build their DOM from the model, and `Feature`/`Statblock`/
 * `Featureblock` only ever carry `metadata` back out again through `toDTO()`. In a
 * snapshot that makes it actively harmful rather than merely bulky: a synced feature file
 * repeats name/effects/flavor/target/action type under `metadata:`, so the pasted block
 * arrived at roughly double length carrying a second, DEAD copy of every value — edit
 * `metadata.name` and the card does not change, because the view reads the TOP-LEVEL
 * `name`. A silent-edit trap in the one feature whose whole purpose is "take it and edit
 * it" (spec §4.3, "the homebrew starting point").
 *
 * Deliberately a DENY list of one key, not an allow-list of live keys: the three
 * `partialFromModel`s (StatblockDTO/FeatureDTO/FeatureblockDTO) emit their model's own
 * render fields plus exactly this one, so an allow-list would silently DROP any field a
 * future SDK adds, while this list silently KEEPS it — the safe direction when the SDK
 * moves under us. Everything surviving here is a field the renderer reads (`type` is the
 * one constant: the SDK stamps it from `modelType()` and the DTO constructor overwrites
 * whatever a user types, but it is part of the documented block format and every
 * `example.yaml` opens with it, so it stays).
 *
 * SNAPSHOT OUTPUT ONLY. The synced compendium files keep their full DTO shape; the sync
 * format is not in question, only what gets pasted into a note as an editing base.
 */
const RENDER_INERT_SNAPSHOT_KEYS = ['metadata'] as const;

/**
 * Drops `RENDER_INERT_SNAPSHOT_KEYS` from a serialized-to-YAML-bound DTO. TOP LEVEL ONLY,
 * on purpose: the corpus never nests `metadata:` inside a `features:` entry (checked
 * across all of data-unified's md-dse output — zero indented `metadata:` lines), so a deep
 * walk would buy nothing while gaining the ability to reach into nested YAML that a user's
 * own homebrew might legitimately own. Non-objects pass through untouched so the
 * `dto === undefined` raw-body fallback below still fires.
 */
function trimSnapshotDTO(dto: unknown): unknown {
	if (dto == null || typeof dto !== 'object' || Array.isArray(dto)) return dto;
	const trimmed = { ...(dto as Record<string, unknown>) };
	for (const key of RENDER_INERT_SNAPSHOT_KEYS) delete trimmed[key];
	return trimmed;
}

/**
 * Full block (snapshot): the resolved entity's typed model, serialized to YAML, inline
 * in a fenced `ds-<alias>` block — an editable copy that no longer live-updates, by
 * design (the bridge to D9's authoring flow, spec §4.3). Trimmed to the fields the
 * renderer actually reads — see `RENDER_INERT_SNAPSHOT_KEYS`.
 *
 * SC-149: ONLY the three public typed families (statblock/feature/featureblock) can be
 * snapshotted. For anything else `snapshotAliasForType` returns null and this is a
 * no-op-with-a-Notice: dumping a display-family entry's internal YAML into a user's note
 * pins an unstable shape that then silently goes stale — exactly what Scott's ruling
 * removes. The command's own modal already filters those entries out (see
 * `registerCompendiumInsertCommands`); this guard covers every other caller.
 * Returns true when something was inserted.
 */
export async function insertFullBlock(editor: Editor, entity: CompendiumEntity): Promise<boolean> {
	const alias = snapshotAliasForType(entity.type);
	if (alias === null) {
		new Notice(
			`No snapshot for "${entity.name}" (${entity.type || 'unknown type'}) — use "Insert Draw Steel: compendium reference" instead.`,
		);
		return false;
	}
	const model = await entity.model();
	const dto = trimSnapshotDTO(extractDTO(model));
	const body = dto === undefined ? (await entity.body()).trim() : stringifyYaml(dto).trimEnd();
	editor.replaceSelection(wrapFence(alias, body) + '\n');
	return true;
}

/** Copy code: the bare `scc:<code>` form, for pasting elsewhere by hand. Best-effort —
 *  `navigator.clipboard` isn't guaranteed present in every Obsidian host (older mobile
 *  webviews); silently skips the write rather than throwing, but always surfaces the
 *  code via Notice so the action is never a silent no-op. */
export async function copyCode(entry: CompendiumEntry): Promise<void> {
	const text = `scc:${entry.scc}`;
	const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
	if (clipboard?.writeText) {
		await clipboard.writeText(text);
	}
	new Notice(`Copied ${text}`);
}

/** The subset of the plugin `registerCompendiumInsertCommands` needs: real `addCommand`
 *  (from `Plugin`) plus the existing `syncCompendium()` entry point (main.ts, F2 Task 10)
 *  the empty-index CTA reuses — see `CompendiumSearchModal`'s `onSyncRequested`. */
export interface CompendiumInsertHost extends Plugin {
	syncCompendium(): Promise<void>;
}

/**
 * The `insert-compendium-reference` command's `onChoose` body, factored out so its
 * modifier-key dispatch (spec §4.3's actions table, minus the full-block row — that one
 * has its own command) is directly unit-testable without reaching into an opened modal's
 * private state: default click/Enter -> reference block; Shift -> inline link; Ctrl/Cmd
 * -> copy code (fire-and-forget, doesn't touch the editor).
 */
export function dispatchReferenceChoice(
	editor: Editor,
	entry: CompendiumEntry,
	evt: Partial<MouseEvent & KeyboardEvent>,
): void {
	if (evt.shiftKey) {
		insertInlineLink(editor, entry);
	} else if (evt.ctrlKey || evt.metaKey) {
		void copyCode(entry);
	} else {
		insertReferenceBlock(editor, entry);
	}
}

/** The `insert-compendium-block` command's `onChoose` body: resolves the chosen entry to
 *  a full `CompendiumEntity` (needed for `.model()`/`.body()`) and inserts the snapshot.
 *  A miss (resolution raced a vault change between search and choice) is a silent no-op —
 *  nothing sane to insert for a code that no longer resolves. A non-snapshottable type
 *  (SC-149) is refused by `insertFullBlock` itself, with a Notice. */
export async function dispatchBlockChoice(
	editor: Editor,
	index: CompendiumIndex,
	entry: CompendiumEntry,
): Promise<void> {
	const entity = await index.getEntity(entry.scc);
	if (entity) await insertFullBlock(editor, entity);
}

/**
 * Registers `insert-compendium-reference` (default action: reference block) and
 * `insert-compendium-block` (default action: full-block snapshot) — spec §4.1's two
 * command surfaces. Both open the same `CompendiumSearchModal`; only the modal's
 * `onChoose` callback differs. Modifier-key secondary actions (spec §4.3's inline-link /
 * copy-code rows) are wired on the reference command only, cheaply, via the
 * choice event's modifier keys — Shift for inline link, Ctrl/Cmd for copy-code — rather
 * than a second action-chooser UI (deferred; the two commands + these two modifiers cover
 * the table without new UI surface).
 *
 * `syncService` isn't called directly here — the empty-index CTA goes through
 * `plugin.syncCompendium()` (F2 Task 10), which already owns this exact `syncService`
 * instance and layers on the OD-6 legacy-folder offer. It's accepted as a parameter to
 * match the spec's interface list (task-10-brief.md) so a future direct-service caller
 * doesn't need a signature change.
 */
export function registerCompendiumInsertCommands(
	plugin: CompendiumInsertHost,
	index: CompendiumIndex,
	_syncService: CompendiumSyncService,
): void {
	const onSyncRequested = () => plugin.syncCompendium();

	plugin.addCommand({
		id: 'insert-compendium-reference',
		name: 'Insert Draw Steel: compendium reference',
		editorCallback: (editor: Editor) => {
			new CompendiumSearchModal(
				plugin.app,
				index,
				(entry, evt) => dispatchReferenceChoice(editor, entry, evt),
				{ onSyncRequested },
			).open();
		},
	});

	plugin.addCommand({
		id: 'insert-compendium-block',
		name: 'Insert Draw Steel: compendium block (snapshot)',
		editorCallback: (editor: Editor) => {
			new CompendiumSearchModal(
				plugin.app,
				index,
				(entry) => void dispatchBlockChoice(editor, index, entry),
				{
					onSyncRequested,
					placeholder: 'Search statblocks, features and featureblocks… (inserts a full snapshot)',
					// SC-149: only the three snapshottable families are offered at all —
					// a user should never pick a kit here and get a Notice instead of a block.
					filter: (entry) => snapshotAliasForType(entry.type) !== null,
				},
			).open();
		},
	});
}
