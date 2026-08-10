// SC-132 — the undo toast.
//
// Scott's brief for the recovery-marker interaction (Linear SC-132, comment 34b0085d):
// "I dont want a missclick to be super punishing though. I'm not really sure how to
// handle that. Maybe we just have an undo button pop up in a notification or something.
// I think ive heard thats the better UX design."
//
// He is right, and the reasoning is worth keeping: a confirmation dialog in FRONT of a
// one-click edit taxes the 999 correct clicks to protect the 1 wrong one. An escape
// hatch BEHIND it costs the correct clicks nothing.
//
// A `Notice` built from a DocumentFragment rather than a string, because the action has
// to be a real clickable node — obsidian renders a string message as text and there is
// no other supported way to put a control inside a notice.
import { Notice } from 'obsidian';

/** How long the undo stays reachable. Long enough to notice and act on, short enough
 *  that a stack of them never builds up during rapid bookkeeping. */
export const UNDO_NOTICE_MS = 8000;

export interface UndoNoticeHandle {
	readonly notice: Notice;
	/** The action node — the test seam, and what a keyboard user activates. */
	readonly undoEl: HTMLElement;
}

/**
 * Posts "<what> · Undo" into the workspace corner. `onUndo` runs at most once; the
 * notice dismisses itself the moment it does, so a double-click cannot undo twice.
 */
export function undoNotice(what: string, onUndo: () => void): UndoNoticeHandle {
	// Plain DOM, not obsidian's `createSpan`/`createEl` helpers: those are an
	// augmentation of `Node` that a DocumentFragment only carries inside a real obsidian
	// runtime, and a notice is one of the few places the plugin builds a fragment.
	const frag = document.createDocumentFragment();
	const textEl = document.createElement('span');
	textEl.textContent = what;
	const undoEl = document.createElement('a');
	undoEl.className = 'dse-undo-notice__action';
	undoEl.textContent = 'Undo';
	undoEl.setAttribute('role', 'button');
	undoEl.setAttribute('tabindex', '0');
	frag.appendChild(textEl);
	frag.appendChild(undoEl);
	const notice = new Notice(frag, UNDO_NOTICE_MS);
	let spent = false;
	const run = (evt: Event): void => {
		evt.preventDefault();
		evt.stopPropagation();
		if (spent) return;
		spent = true;
		onUndo();
		notice.hide();
	};
	// No `owner.registerDomEvent`: the listener's lifetime is the notice's, and the
	// notice is torn out of the DOM by obsidian itself when it expires or is dismissed —
	// there is no longer-lived component to leak into.
	undoEl.addEventListener('click', run);
	undoEl.addEventListener('keydown', (evt: KeyboardEvent) => {
		if (evt.key === 'Enter' || evt.key === ' ') run(evt);
	});
	return { notice, undoEl };
}
