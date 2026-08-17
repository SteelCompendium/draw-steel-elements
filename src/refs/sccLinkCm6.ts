// src/refs/sccLinkCm6.ts — SC-135 phase 1b: a CodeMirror 6 editor extension that follows
// scc.v1: links in Live Preview and Source mode, where CM6 renders no `<a href>` DOM node
// for the DOM-delegated listener (src/refs/sccLinkClickHandler.ts) to intercept — confirmed
// against real Obsidian (see the SC-135 phase 1 report). This module owns the CM6-facing
// glue only; the position -> link lookup and the click-gating rule are pure functions in
// src/refs/sccLinkAtPos.ts, unit-tested without an EditorView.
//
// registerEditorExtension (main.ts) applies this globally to every markdown editor the app
// creates, main window and popouts alike — the same mechanism any CM6-extension-using
// plugin relies on, so no separate per-window attach/detach is needed here (contrast
// sccLinkClickHandler.ts's DOM listener, which does need that, because registerDomEvent is
// document-scoped).
import { EditorView } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { Keymap, editorLivePreviewField } from 'obsidian';
import { SccAnchorResolver } from './rewriteSccAnchors';
import type { SccClickActions } from './sccLinkClickHandler';
import { findSccLinkAtPos, shouldFollowOnClick } from './sccLinkAtPos';

/**
 * The mousedown body: locate an scc link under the pointer via CM6's own document model
 * (not the DOM), decide whether THIS click should follow it per Obsidian's reveal-state
 * convention, and if so resolve + preventDefault before Obsidian's own external-link path
 * ever sees it. Returns true when handled (CM6's domEventHandlers contract: a truthy return
 * suppresses CM6's own default handling of the event too, e.g. cursor placement from the
 * same mousedown).
 */
function handlePointerEvent(
	event: MouseEvent,
	view: EditorView,
	resolver: SccAnchorResolver,
	actions: SccClickActions,
): boolean {
	// Primary (left) or auxiliary (middle) button only — matches phase 1's DOM handler.
	if (event.button !== 0 && event.button !== 1) return false;

	const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
	if (pos === null) return false;

	const line = view.state.doc.lineAt(pos);
	const link = findSccLinkAtPos(line.text, line.from, pos);
	if (!link) return false;

	const livePreview = view.state.field(editorLivePreviewField, false) ?? false;
	// EVERY selection range, not just `.main` (SC-135 fix round 1, review finding L-3):
	// Obsidian reveals a line's raw markdown when ANY cursor sits on it, so reading only
	// the main range made a line held open by a SECONDARY multi-cursor look folded — and a
	// plain click there followed the link instead of placing the cursor, contradicting the
	// documented gesture rule.
	const lineRevealed = view.state.selection.ranges.some((range) => range.from <= line.to && range.to >= line.from);
	const modEvent = Keymap.isModEvent(event);
	const isModOrAux = modEvent !== false || event.button === 1;

	if (!shouldFollowOnClick({ livePreview, lineRevealed, isModOrAux })) return false;

	// Beat Obsidian's own external-link confirmation the same way phase 1's DOM handler
	// does — this fires before CM6's own default mousedown handling (cursor placement) or
	// Obsidian's link-follow logic gets a chance to run.
	event.preventDefault();
	event.stopPropagation();

	const resolution = resolver.resolve(link.href);
	if (resolution.kind === 'vault') {
		actions.openVault(resolution.linkpath, modEvent);
	} else if (resolution.kind === 'web') {
		const win = view.dom.ownerDocument.defaultView ?? window;
		actions.openWeb(resolution.url, win);
	} else {
		actions.notifyUnresolved(resolution.code);
	}
	return true;
}

/**
 * Builds the CM6 `Extension` to pass to `plugin.registerEditorExtension`.
 *
 * **`mousedown` ONLY — do not add an `auxclick` handler back.** (SC-135 fix round 1, review
 * finding H-1.) A middle click already arrives here as `mousedown` with `button === 1`, and
 * a browser then fires `auxclick` for the SAME physical click on release; `preventDefault()`
 * on the mousedown does not suppress it. This extension used to handle both, so every
 * middle-click ran the full side-effecting body twice and opened the target in TWO tabs.
 * `handlePointerEvent` is not idempotent — it calls `actions.openVault(...)` each time — so
 * the one-handler rule is what keeps middle-click single. Pinned by
 * test/dom/sccLinkCm6.test.ts's "middle-click ... exactly once" case.
 *
 * Wrapped in `Prec.highest` — CM6's own docs (`EditorView.domEventHandlers`): "such
 * functions are ordered by extension precedence, and the first handler to return true
 * will be assumed to have handled that event, and no other handlers or built-in behavior
 * will be activated." Obsidian's own core editor view plugin registers its mousedown
 * handling (cursor placement, its own link click routing) at normal/default precedence;
 * without `Prec.highest` here, that runs FIRST, returns `true` for an ordinary click, and
 * this handler never runs at all — confirmed empirically (real-Obsidian diagnostic: without
 * this, `posAtCoords`/`doc.lineAt`/the link regex all independently checked out fine in a
 * page-context probe, yet a real click produced no navigation whatsoever until this was
 * added). `Prec.highest` moves this ahead of Obsidian's own handler in the chain.
 */
export function createSccLinkCm6Extension(resolver: SccAnchorResolver, actions: SccClickActions): Extension {
	return Prec.highest(
		EditorView.domEventHandlers({
			mousedown(event, view) {
				return handlePointerEvent(event, view, resolver, actions);
			},
		}),
	);
}
