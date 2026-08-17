/** @jest-environment jsdom */
// SC-135 phase 1b + fix round 1 — BEHAVIOURAL coverage for the CM6 editor extension,
// driven through a real `EditorView` with the real `@codemirror/{state,view}` packages.
//
// This file used to hold two smoke assertions ("returns something truthy", "returns a fresh
// object") and delegate everything real to the pure functions plus a one-shot manual
// Xvfb run. Review finding M-2: that left the event-plumbing seam untested, and finding
// H-1 (middle-click firing twice) lived in exactly that seam. A real EditorView IS drivable
// in this project's jsdom `dom` runner; the only two accommodations needed are:
//
//  1. `view.posAtCoords` is stubbed — jsdom has no layout, so every rect is zero and CM6
//     cannot map real coordinates to a document offset. Stubbing it is honest: it is the
//     ONE thing under test that jsdom genuinely cannot provide, and its real behaviour is
//     what the Xvfb end-to-end run covers. Everything downstream of it (doc.lineAt, the
//     link scan, the reveal gating, preventDefault, the action routing, and how many times
//     any of it happens) is real here.
//  2. `editorLivePreviewField` is swapped for a REAL `StateField`. The shipped obsidian
//     mock exports an inert `{}`, and `EditorState.field({}, false)` returns `undefined` —
//     so without this swap EVERY test silently sees `livePreview === false`, i.e. Source
//     mode, and the Live Preview branch would never be exercised at all.
//
// Note the deliberate omission: there is no "the extension is a fresh object each call"
// test. It could never fail (`Prec.highest(...)` allocates a new wrapper every time) and
// the "no shared mutable state" guarantee it claimed was not even true at the time —
// `sccLinkAtPos`'s link regex was a module-level `/g` object. That regex is now built per
// call, and the property is pinned where it lives, in sccLinkAtPos.test.ts.
import { EditorState, EditorSelection, StateField, Prec } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

// Must be declared before the jest.mock factory runs (hoisted); `StateField.define` has no
// dependency on the module under test, so evaluating it this early is safe.
const LIVE_PREVIEW_FIELD = StateField.define<boolean>({
	create: () => true,
	update: (value) => value,
});

jest.mock('obsidian', () => ({
	...jest.requireActual('obsidian'),
	editorLivePreviewField: LIVE_PREVIEW_FIELD,
}));

import { createSccLinkCm6Extension } from '@/refs/sccLinkCm6';
import { attachSccLinkClickHandling, SccClickActions } from '@/refs/sccLinkClickHandler';
import { SccAnchorResolver } from '@/refs/rewriteSccAnchors';
import { SccResolution } from '@/refs/SccResolver';
import { fakeTFile } from '../fakes/fakeObsidian';

const CODE = 'mcdm.heroes.v1/rule.world/vasloria';
const HREF = `scc.v1:${CODE}`;
const LINKPATH = 'DS Compendium/rule/world/vasloria.md';

// Line 0 is padding so a cursor "off the link's line" is expressible; the link sits on the
// last line, mirroring the note the Xvfb end-to-end run used.
const DOC = ['padding line', '', `Click this: [test](${HREF}) and see.`].join('\n');

/** Absolute document offset of `sub` (+ `delta`), in the same coordinate space CM6 uses. */
function offsetOf(sub: string, delta = 1): number {
	return DOC.indexOf(sub) + delta;
}
const INSIDE_LINK = offsetOf('[test]');
const LINK_LINE_START = offsetOf('Click this', 0);

function stubResolver(resolution: SccResolution = { kind: 'vault', file: fakeTFile(LINKPATH), linkpath: LINKPATH }): SccAnchorResolver {
	return { resolve: jest.fn(() => resolution) };
}

function stubActions(): SccClickActions & {
	vaultCalls: Array<{ linkpath: string; newLeaf: unknown }>;
	webCalls: Array<{ url: string; win: Window }>;
	unresolvedCalls: string[];
} {
	const vaultCalls: Array<{ linkpath: string; newLeaf: unknown }> = [];
	const webCalls: Array<{ url: string; win: Window }> = [];
	const unresolvedCalls: string[] = [];
	return {
		vaultCalls,
		webCalls,
		unresolvedCalls,
		openVault(linkpath, newLeaf) {
			vaultCalls.push({ linkpath, newLeaf });
		},
		openWeb(url, win) {
			webCalls.push({ url, win });
		},
		notifyUnresolved(code) {
			unresolvedCalls.push(code);
		},
	};
}

interface ViewOpts {
	/** false = Source mode (the field is simply absent, exactly as in a Source-mode editor). */
	livePreview?: boolean;
	/** Cursor offsets. The first is the main range. Default: offset 0, i.e. off the link line. */
	cursors?: number[];
	extension: ReturnType<typeof createSccLinkCm6Extension>;
	/** Stubbed posAtCoords result. Default: inside the link. */
	posAtCoords?: number | null;
	/** Records whether the event survived past the extension (see `downstream` below). */
	downstream?: string[];
}

/**
 * "Did the extension decline this event?" — asked the way CM6 itself answers it.
 *
 * `evt.defaultPrevented` cannot answer it: when the extension correctly returns false, CM6's
 * own selection handling takes the event and calls `preventDefault()` itself, so the flag is
 * true either way. What actually distinguishes the two cases is CM6's documented contract —
 * "the first handler to return true ... no other handlers or built-in behavior will be
 * activated" — so a handler sitting BEHIND the extension runs if and only if the extension
 * let the event through.
 */
function downstreamObserver(log: string[]) {
	return Prec.lowest(
		EditorView.domEventHandlers({
			mousedown() {
				log.push('downstream');
				return false;
			},
		}),
	);
}

const views: EditorView[] = [];

// jsdom implements no layout, and `Range` has no getClientRects at all. Whenever the
// extension correctly DECLINES a mousedown, CM6's own selection machinery takes over and
// measures the text — which throws in jsdom and would fail the very tests that assert we
// stayed out of the way. Give Range a zero-sized rect so that path completes harmlessly.
// This affects only CM6's internals; nothing under test reads a rect (posAtCoords, the one
// place real geometry would matter, is stubbed per view).
const ZERO_RECT = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
beforeAll(() => {
	const proto = Range.prototype as unknown as Record<string, unknown>;
	proto.getClientRects = (): unknown => [ZERO_RECT];
	proto.getBoundingClientRect = (): unknown => ZERO_RECT;
});

function mkView(opts: ViewOpts): EditorView {
	const extensions: Extension[] = [opts.extension];
	if (opts.livePreview !== false) extensions.push(LIVE_PREVIEW_FIELD);
	if (opts.downstream) extensions.push(downstreamObserver(opts.downstream));
	// Without this facet CM6 collapses any selection down to its main range at state
	// construction — so a multi-cursor test would silently become a single-cursor one.
	extensions.push(EditorState.allowMultipleSelections.of(true));
	const cursors = opts.cursors ?? [0];
	const state = EditorState.create({
		doc: DOC,
		selection: EditorSelection.create(
			cursors.map((c) => EditorSelection.cursor(c)),
			0,
		),
		extensions,
	});
	const parent = document.createElement('div');
	document.body.appendChild(parent);
	const view = new EditorView({ state, parent });
	const pos = opts.posAtCoords === undefined ? INSIDE_LINK : opts.posAtCoords;
	(view as unknown as { posAtCoords: () => number | null }).posAtCoords = () => pos;
	views.push(view);
	return view;
}

/** Dispatches a real MouseEvent at the editor's content DOM, where CM6 binds its handlers. */
function fire(view: EditorView, type: string, init: MouseEventInit = {}): MouseEvent {
	const evt = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
	view.contentDOM.dispatchEvent(evt);
	return evt;
}

afterEach(() => {
	// jsdom has no layout, so whenever the extension declines to handle a mousedown CM6's own
	// selection machinery runs and throws on getClientRects. That is CM6 hitting jsdom's
	// limits, not our code failing — jsdom reports it as an unhandled listener exception and
	// dispatchEvent still returns normally, so it cannot corrupt an assertion. Views are torn
	// down here rather than per-test so no test has to remember.
	for (const view of views.splice(0)) view.destroy();
	document.body.innerHTML = '';
});

describe('createSccLinkCm6Extension — Live Preview gestures (SC-135 phase 1b)', () => {
	test('folded link (no cursor on its line): a plain click follows it, exactly once, and consumes the event', () => {
		const actions = stubActions();
		const downstream: string[] = [];
		const view = mkView({ downstream, extension: createSccLinkCm6Extension(stubResolver(), actions) });

		const evt = fire(view, 'mousedown', { button: 0 });

		expect(actions.vaultCalls).toEqual([{ linkpath: LINKPATH, newLeaf: false }]);
		expect(evt.defaultPrevented).toBe(true);
		// Nothing behind it ran: no stray cursor placement, and Obsidian's own external-link
		// confirmation never gets the chance to fire.
		expect(downstream).toEqual([]);
	});

	test('raw syntax showing (cursor on the link line): a plain click does NOT follow, and the event stays available for cursor placement', () => {
		const actions = stubActions();
		const downstream: string[] = [];
		const view = mkView({
			cursors: [LINK_LINE_START],
			downstream,
			extension: createSccLinkCm6Extension(stubResolver(), actions),
		});

		fire(view, 'mousedown', { button: 0 });

		expect(actions.vaultCalls).toHaveLength(0);
		// The extension returned false, so the click reached everything behind it — which is
		// what places the cursor in a real editor.
		expect(downstream).toEqual(['downstream']);
	});

	test('raw syntax showing: a Ctrl/Cmd-click DOES follow, in a new tab', () => {
		const actions = stubActions();
		const view = mkView({
			cursors: [LINK_LINE_START],
			extension: createSccLinkCm6Extension(stubResolver(), actions),
		});

		fire(view, 'mousedown', { button: 0, ctrlKey: true });

		expect(actions.vaultCalls).toEqual([{ linkpath: LINKPATH, newLeaf: 'tab' }]);
	});

	test('L-3 regression: a SECONDARY multi-cursor on the link line counts as revealed', () => {
		const actions = stubActions();
		// Main cursor at 0 (off the link line), secondary cursor ON the link line. Obsidian
		// reveals raw syntax when ANY cursor is on the line, so a plain click must place the
		// cursor, not navigate. Reading only `selection.main` used to miss this and follow.
		const view = mkView({
			cursors: [0, LINK_LINE_START],
			extension: createSccLinkCm6Extension(stubResolver(), actions),
		});

		fire(view, 'mousedown', { button: 0 });

		expect(actions.vaultCalls).toHaveLength(0);
	});
});

describe('createSccLinkCm6Extension — Source mode (SC-135 phase 1b)', () => {
	test('a plain click does NOT follow (Source mode never folds, so raw syntax is always showing)', () => {
		const actions = stubActions();
		const view = mkView({ livePreview: false, extension: createSccLinkCm6Extension(stubResolver(), actions) });

		fire(view, 'mousedown', { button: 0 });

		expect(actions.vaultCalls).toHaveLength(0);
	});

	test('a Ctrl/Cmd-click DOES follow', () => {
		const actions = stubActions();
		const view = mkView({ livePreview: false, extension: createSccLinkCm6Extension(stubResolver(), actions) });

		fire(view, 'mousedown', { button: 0, ctrlKey: true });

		expect(actions.vaultCalls).toEqual([{ linkpath: LINKPATH, newLeaf: 'tab' }]);
	});
});

describe('createSccLinkCm6Extension — one physical click, one navigation (SC-135 fix round 1)', () => {
	test('H-1 regression: a MIDDLE click navigates exactly ONCE across the whole mousedown+auxclick pair', () => {
		const actions = stubActions();
		const view = mkView({ extension: createSccLinkCm6Extension(stubResolver(), actions) });

		// Exactly what a browser emits for one middle click: mousedown on press, auxclick on
		// release. preventDefault() on the mousedown does NOT suppress the auxclick, so an
		// extension handling both runs its side effects twice and opens two tabs. This is
		// why createSccLinkCm6Extension registers `mousedown` only.
		fire(view, 'mousedown', { button: 1 });
		fire(view, 'auxclick', { button: 1 });

		expect(actions.vaultCalls).toEqual([{ linkpath: LINKPATH, newLeaf: 'tab' }]);
	});

	test('a LEFT click navigates exactly once across the whole mousedown+click pair', () => {
		const actions = stubActions();
		const view = mkView({ extension: createSccLinkCm6Extension(stubResolver(), actions) });

		fire(view, 'mousedown', { button: 0 });
		fire(view, 'click', { button: 0 });

		expect(actions.vaultCalls).toHaveLength(1);
	});

	test('no double-handling with phase 1\'s document-level DOM delegator also attached', () => {
		const actions = stubActions();
		const owner = {
			registerDomEvent(el: Document, type: string, cb: (evt: MouseEvent) => void, options?: any) {
				el.addEventListener(type, cb as EventListener, options);
			},
		};
		// Both mechanisms live at once, exactly as main.ts wires them.
		attachSccLinkClickHandling(owner, document, stubResolver(), actions);
		const view = mkView({ extension: createSccLinkCm6Extension(stubResolver(), actions) });

		fire(view, 'mousedown', { button: 0 });
		fire(view, 'click', { button: 0 });

		// The CM6 path fires on mousedown against raw document text; the DOM path needs an
		// <a href="scc..."> that CM6 never renders. Exactly one of them can ever act.
		expect(actions.vaultCalls).toHaveLength(1);
	});
});

describe('createSccLinkCm6Extension — non-events (SC-135 phase 1b)', () => {
	test('a right-click is ignored entirely (the context menu must still work)', () => {
		const actions = stubActions();
		const view = mkView({ extension: createSccLinkCm6Extension(stubResolver(), actions) });

		fire(view, 'mousedown', { button: 2 });

		expect(actions.vaultCalls).toHaveLength(0);
	});

	test('a click CM6 cannot map to a document position is a clean no-op', () => {
		const actions = stubActions();
		const view = mkView({ posAtCoords: null, extension: createSccLinkCm6Extension(stubResolver(), actions) });

		fire(view, 'mousedown', { button: 0 });

		expect(actions.vaultCalls).toHaveLength(0);
	});

	test('a click on the line but outside any link does not follow', () => {
		const actions = stubActions();
		const resolver = stubResolver();
		const view = mkView({
			posAtCoords: offsetOf('and see.'),
			extension: createSccLinkCm6Extension(resolver, actions),
		});

		fire(view, 'mousedown', { button: 0 });

		expect(actions.vaultCalls).toHaveLength(0);
		expect(resolver.resolve).not.toHaveBeenCalled();
	});
});

describe('createSccLinkCm6Extension — resolution branches (SC-135 phase 1b)', () => {
	test('a web resolution opens the redirect on the CLICKED editor\'s own window (popout-safe)', () => {
		const actions = stubActions();
		const url = 'https://steelcompendium.io/scc/mcdm.heroes.v1/rule.world/vasloria/';
		const view = mkView({
			extension: createSccLinkCm6Extension(stubResolver({ kind: 'web', url }), actions),
		});

		fire(view, 'mousedown', { button: 0 });

		expect(actions.webCalls).toHaveLength(1);
		expect(actions.webCalls[0].url).toBe(url);
		expect(actions.webCalls[0].win).toBe(view.dom.ownerDocument.defaultView);
	});

	test('an unresolved code shows a notice instead of navigating', () => {
		const actions = stubActions();
		const view = mkView({
			extension: createSccLinkCm6Extension(stubResolver({ kind: 'unresolved', code: CODE }), actions),
		});

		fire(view, 'mousedown', { button: 0 });

		expect(actions.unresolvedCalls).toEqual([CODE]);
		expect(actions.vaultCalls).toHaveLength(0);
	});
});

describe('createSccLinkCm6Extension — the Prec.highest requirement (SC-135 phase 1b)', () => {
	// Obsidian's core editor registers its own mousedown handling at normal precedence and
	// is present before any plugin's extension. CM6's contract: "the first handler to return
	// true will be assumed to have handled that event, and no other handlers or built-in
	// behavior will be activated." Without Prec.highest our handler is simply never reached —
	// silently, with no error anywhere. These two tests pin both halves of that.
	function coreLikeHandler(log: string[]) {
		return EditorView.domEventHandlers({
			mousedown() {
				log.push('core');
				return true; // what Obsidian's own handler does for an ordinary click
			},
		});
	}

	test('WITHOUT Prec.highest, a core-like normal-precedence handler declared first swallows the event', () => {
		const log: string[] = [];
		const actions = stubActions();
		const unwrapped = EditorView.domEventHandlers({
			mousedown() {
				log.push('scc');
				return true;
			},
		});
		const state = EditorState.create({
			doc: DOC,
			extensions: [coreLikeHandler(log), unwrapped, LIVE_PREVIEW_FIELD],
		});
		const parent = document.createElement('div');
		document.body.appendChild(parent);
		const view = new EditorView({ state, parent });
		views.push(view);

		fire(view, 'mousedown', { button: 0 });

		expect(log).toEqual(['core']); // the scc handler never ran
		expect(actions.vaultCalls).toHaveLength(0);
	});

	test('WITH Prec.highest, the real extension runs ahead of that same handler and follows the link', () => {
		const log: string[] = [];
		const actions = stubActions();
		const state = EditorState.create({
			doc: DOC,
			selection: EditorSelection.create([EditorSelection.cursor(0)], 0),
			extensions: [
				coreLikeHandler(log),
				createSccLinkCm6Extension(stubResolver(), actions),
				LIVE_PREVIEW_FIELD,
			],
		});
		const parent = document.createElement('div');
		document.body.appendChild(parent);
		const view = new EditorView({ state, parent });
		(view as unknown as { posAtCoords: () => number | null }).posAtCoords = () => INSIDE_LINK;
		views.push(view);

		fire(view, 'mousedown', { button: 0 });

		expect(actions.vaultCalls).toEqual([{ linkpath: LINKPATH, newLeaf: false }]);
		expect(log).toEqual([]); // and it stopped the core-like handler, as intended
	});

	test('the extension really is wrapped at highest precedence, not merely declared first', () => {
		const log: string[] = [];
		const actions = stubActions();
		// Registration order reversed: the core-like handler is declared LAST. Precedence,
		// not declaration order, must still put the scc extension in front.
		const state = EditorState.create({
			doc: DOC,
			selection: EditorSelection.create([EditorSelection.cursor(0)], 0),
			extensions: [
				createSccLinkCm6Extension(stubResolver(), actions),
				coreLikeHandler(log),
				LIVE_PREVIEW_FIELD,
			],
		});
		const parent = document.createElement('div');
		document.body.appendChild(parent);
		const view = new EditorView({ state, parent });
		(view as unknown as { posAtCoords: () => number | null }).posAtCoords = () => INSIDE_LINK;
		views.push(view);

		fire(view, 'mousedown', { button: 0 });

		expect(actions.vaultCalls).toHaveLength(1);
		expect(log).toEqual([]);
	});
});
