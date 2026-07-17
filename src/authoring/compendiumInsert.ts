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
import { typeToAlias } from '@/services/typeAdapters';
import { wrapFence } from './scaffold';
import { CompendiumSearchModal } from './CompendiumSearchModal';

/** Reference block (OD-D6-6 default): a fenced `ds-<alias>` block whose body is just the
 *  bare SCC code — live-updates with the compendium, smallest possible note.
 *
 *  **Adjudication (D6 Task 10):** The spec's own example (§4.3) shows the inserted body as
 *  a bare item slug (smallest note). We instead insert the full `entry.scc` triple
 *  (`source/type/item`), a deliberate deviation justified by the workspace's "codes are
 *  forever" principle: machine-inserted references prefer the unambiguous permanent code
 *  over slug brevity, since a slug can become ambiguous as the corpus grows. `detectWholeBlockRef`
 *  rule 2 (§1.3) handles this correctly: it detects `/` in the body and resolves the full code.
 *  This deviation is ratified and documented here. */
export function insertReferenceBlock(editor: Editor, entry: CompendiumEntry): void {
	const alias = typeToAlias(entry.type);
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

/** Full block (snapshot): the resolved entity's typed model, serialized to YAML, inline
 *  in a fenced `ds-<alias>` block — an editable copy that no longer live-updates, by
 *  design (the bridge to D9's authoring flow, spec §4.3). Falls back to the entity's raw
 *  source body for the model-less `rule.*` family (see extractDTO above). */
export async function insertFullBlock(editor: Editor, entity: CompendiumEntity): Promise<void> {
	const alias = typeToAlias(entity.type);
	const model = await entity.model();
	const dto = extractDTO(model);
	const body = dto === undefined ? (await entity.body()).trim() : stringifyYaml(dto).trimEnd();
	editor.replaceSelection(wrapFence(alias, body) + '\n');
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
 *  nothing sane to insert for a code that no longer resolves. */
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
				{ onSyncRequested, placeholder: 'Search the compendium… (inserts a full snapshot)' },
			).open();
		},
	});
}
