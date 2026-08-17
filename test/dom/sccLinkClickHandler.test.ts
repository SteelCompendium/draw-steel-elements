/** @jest-environment jsdom */
// SC-135 phase 1 — jsdom coverage for src/refs/sccLinkClickHandler.ts. Mirrors the
// stubResolver convention from test/dom/rewriteSccAnchors.test.ts.
import {
	handleSccLinkEvent,
	attachSccLinkClickHandling,
	registerSccLinkClickHandling,
	SccClickActions,
} from '@/refs/sccLinkClickHandler';
import { SccAnchorResolver } from '@/refs/rewriteSccAnchors';
import { SccResolution } from '@/refs/SccResolver';
import { fakeTFile } from '../fakes/fakeObsidian';
// Plugin from the mock directly (not 'obsidian') — the real obsidian.d.ts's Plugin is
// abstract (tsc TS2511 on `new Plugin()`); the mock's is concrete. Same convention as
// test/dom/framework/reading-mode-host.test.ts / sidebarScc.test.ts.
import { Plugin } from '../mocks/obsidian';

function stubResolver(map: Record<string, SccResolution>): SccAnchorResolver {
	return {
		resolve: jest.fn((raw: string) => map[raw] ?? { kind: 'unresolved', code: raw }),
	};
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

const VAULT_HREF = 'scc.v1:mcdm.heroes.v1/rule.combat/turn';
const WEB_HREF = 'scc.v1:mcdm.heroes.v1/class/shadow';

function resolverFixture(): SccAnchorResolver {
	return stubResolver({
		[VAULT_HREF]: {
			kind: 'vault',
			file: fakeTFile('DS Compendium/rule/combat/turn.md'),
			linkpath: 'DS Compendium/rule/combat/turn.md',
		},
		[WEB_HREF]: { kind: 'web', url: 'https://steelcompendium.io/scc/mcdm.heroes.v1/class/shadow/' },
	});
}

function anchorContainer(doc: Document, href: string, text = 'link'): HTMLAnchorElement {
	const a = doc.createElement('a');
	a.setAttribute('href', href);
	a.textContent = text;
	// A nested span so closest('a') traversal is actually exercised, not just a direct hit.
	const span = doc.createElement('span');
	span.textContent = text;
	a.appendChild(span);
	doc.body.appendChild(a);
	return a;
}

/** Builds a MouseEvent whose `target` is `el` WITHOUT going through dispatchEvent — for
 *  tests that call handleSccLinkEvent directly (not through a registered listener). Real
 *  `target` is normally only set by the dispatch machinery; direct-call tests need it
 *  stamped by hand. The nested <span> inside anchorContainer is the target, exercising
 *  closest('a') exactly as a real click on the anchor's rendered text would. */
function clickOn(el: HTMLElement, type = 'click', opts: MouseEventInit = {}): MouseEvent {
	const evt = new MouseEvent(type, { bubbles: true, cancelable: true, ...opts });
	Object.defineProperty(evt, 'target', { value: el.querySelector('span') ?? el });
	return evt;
}

describe('handleSccLinkEvent (SC-135 phase 1)', () => {
	test('vault resolution calls openVault with the resolved linkpath', () => {
		const resolver = resolverFixture();
		const actions = stubActions();
		const anchor = anchorContainer(document, VAULT_HREF);
		const handled = handleSccLinkEvent(clickOn(anchor), resolver, actions);

		expect(handled).toBe(true);
		expect(actions.vaultCalls).toEqual([{ linkpath: 'DS Compendium/rule/combat/turn.md', newLeaf: false }]);
		anchor.remove();
	});

	test('web resolution calls openWeb with the resolved URL and the anchor\'s own window', () => {
		const resolver = resolverFixture();
		const actions = stubActions();
		const anchor = anchorContainer(document, WEB_HREF);
		handleSccLinkEvent(clickOn(anchor), resolver, actions);

		expect(actions.webCalls).toEqual([
			{ url: 'https://steelcompendium.io/scc/mcdm.heroes.v1/class/shadow/', win: window },
		]);
		anchor.remove();
	});

	test('unresolved calls notifyUnresolved with the resolver-provided code', () => {
		// stubResolver's fallback (like rewriteSccAnchors.test.ts's) echoes the raw href for
		// any target not in its map — SccResolution.code is whatever the resolver hands back,
		// which for the REAL SccResolver is always the normalized bare code (SccResolver.test.ts
		// covers that separately); this test only asserts handleSccLinkEvent forwards it as-is.
		const resolver = resolverFixture();
		const actions = stubActions();
		const href = 'scc.v2:mcdm.heroes.v1/rule.combat/turn';
		const anchor = anchorContainer(document, href);
		handleSccLinkEvent(clickOn(anchor), resolver, actions);

		expect(actions.unresolvedCalls).toEqual([href]);
		anchor.remove();
	});

	test('non-scc anchors are left untouched (not handled, resolver never called)', () => {
		const resolver = resolverFixture();
		const actions = stubActions();
		const anchor = anchorContainer(document, 'https://example.com');
		const evt = clickOn(anchor);
		const handled = handleSccLinkEvent(evt, resolver, actions);

		expect(handled).toBe(false);
		expect(evt.defaultPrevented).toBe(false);
		expect(resolver.resolve).not.toHaveBeenCalled();
		anchor.remove();
	});

	test('a click with no anchor ancestor is left untouched', () => {
		const resolver = resolverFixture();
		const actions = stubActions();
		const div = document.createElement('div');
		document.body.appendChild(div);
		const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
		Object.defineProperty(evt, 'target', { value: div });
		const handled = handleSccLinkEvent(evt, resolver, actions);

		expect(handled).toBe(false);
		div.remove();
	});

	test('preventDefault + stopImmediatePropagation are called on a handled scc click', () => {
		const resolver = resolverFixture();
		const actions = stubActions();
		const anchor = anchorContainer(document, VAULT_HREF);
		const evt = clickOn(anchor);
		const stopSpy = jest.spyOn(evt, 'stopImmediatePropagation');
		handleSccLinkEvent(evt, resolver, actions);

		expect(evt.defaultPrevented).toBe(true);
		expect(stopSpy).toHaveBeenCalledTimes(1);
		anchor.remove();
	});

	describe('modifier + middle-click semantics (Keymap.isModEvent)', () => {
		test('Ctrl/Cmd-click opens in a new tab', () => {
			const resolver = resolverFixture();
			const actions = stubActions();
			const anchor = anchorContainer(document, VAULT_HREF);
			handleSccLinkEvent(clickOn(anchor, 'click', { ctrlKey: true }), resolver, actions);

			expect(actions.vaultCalls[0].newLeaf).toBe('tab');
			anchor.remove();
		});

		test('Ctrl/Cmd+Alt-click opens in a split', () => {
			const resolver = resolverFixture();
			const actions = stubActions();
			const anchor = anchorContainer(document, VAULT_HREF);
			handleSccLinkEvent(clickOn(anchor, 'click', { ctrlKey: true, altKey: true }), resolver, actions);

			expect(actions.vaultCalls[0].newLeaf).toBe('split');
			anchor.remove();
		});

		test('Ctrl/Cmd+Alt+Shift-click opens in a new window', () => {
			const resolver = resolverFixture();
			const actions = stubActions();
			const anchor = anchorContainer(document, VAULT_HREF);
			handleSccLinkEvent(
				clickOn(anchor, 'click', { ctrlKey: true, altKey: true, shiftKey: true }),
				resolver,
				actions,
			);

			expect(actions.vaultCalls[0].newLeaf).toBe('window');
			anchor.remove();
		});

		test('a middle-click (auxclick, button 1) opens in a new tab', () => {
			const resolver = resolverFixture();
			const actions = stubActions();
			const anchor = anchorContainer(document, VAULT_HREF);
			const handled = handleSccLinkEvent(clickOn(anchor, 'auxclick', { button: 1 }), resolver, actions);

			expect(handled).toBe(true);
			expect(actions.vaultCalls[0].newLeaf).toBe('tab');
			anchor.remove();
		});
	});
});

describe('attachSccLinkClickHandling (SC-135 phase 1 §2 — popout safety)', () => {
	test('a click on a real Plugin/Component-attached document is intercepted', () => {
		const plugin = new Plugin();
		plugin.load();
		const resolver = resolverFixture();
		const actions = stubActions();
		attachSccLinkClickHandling(plugin, document, resolver, actions);

		const anchor = anchorContainer(document, VAULT_HREF);
		anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

		expect(actions.vaultCalls).toHaveLength(1);
		anchor.remove();
		plugin.unload();
	});

	test('works against a SECOND document (a popout window has its own) — proves this is not hardcoded to the global document', () => {
		const popoutDoc = document.implementation.createHTMLDocument('popout');
		const plugin = new Plugin();
		plugin.load();
		const resolver = resolverFixture();
		const actions = stubActions();
		attachSccLinkClickHandling(plugin, popoutDoc, resolver, actions);

		// Same href clicked in the MAIN document must NOT be caught by the popout's listener.
		const mainActions = stubActions();
		attachSccLinkClickHandling(plugin, document, resolver, mainActions);
		const mainAnchor = anchorContainer(document, VAULT_HREF);
		mainAnchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		expect(mainActions.vaultCalls).toHaveLength(1);
		expect(actions.vaultCalls).toHaveLength(0);

		// The popout's own anchor IS caught by its own listener.
		const popoutAnchor = anchorContainer(popoutDoc, VAULT_HREF);
		popoutAnchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		expect(actions.vaultCalls).toHaveLength(1);

		mainAnchor.remove();
		plugin.unload();
	});

	test('detaches cleanly on plugin unload — a click afterwards is no longer intercepted', () => {
		const plugin = new Plugin();
		plugin.load();
		const resolver = resolverFixture();
		const actions = stubActions();
		attachSccLinkClickHandling(plugin, document, resolver, actions);
		plugin.unload();

		const anchor = anchorContainer(document, VAULT_HREF);
		anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

		expect(actions.vaultCalls).toHaveLength(0);
		anchor.remove();
	});

	test('capture-phase beats a competing bubble-phase listener via stopImmediatePropagation', () => {
		const plugin = new Plugin();
		plugin.load();
		const resolver = resolverFixture();
		const actions = stubActions();
		attachSccLinkClickHandling(plugin, document, resolver, actions);

		const anchor = anchorContainer(document, VAULT_HREF);
		const competing = jest.fn();
		// Registered directly on the anchor, bubble phase — simulates Obsidian's own
		// external-link confirmation, which our capture-phase document listener must beat.
		anchor.addEventListener('click', competing);
		anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

		expect(actions.vaultCalls).toHaveLength(1);
		expect(competing).not.toHaveBeenCalled();
		anchor.remove();
		plugin.unload();
	});

	test('capture-phase beats a competing CAPTURE-phase listener registered closer to the target', () => {
		const plugin = new Plugin();
		plugin.load();
		const resolver = resolverFixture();
		const actions = stubActions();
		attachSccLinkClickHandling(plugin, document, resolver, actions);

		const anchor = anchorContainer(document, VAULT_HREF);
		const competing = jest.fn();
		// Registered on document.body (a descendant of document) in CAPTURE phase — dispatch
		// still visits document before document.body, so our document-level listener must
		// still run first and stop this one.
		document.body.addEventListener('click', competing, { capture: true });
		anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

		expect(actions.vaultCalls).toHaveLength(1);
		expect(competing).not.toHaveBeenCalled();
		document.body.removeEventListener('click', competing, { capture: true });
		anchor.remove();
		plugin.unload();
	});

	test('a non-scc click is NOT intercepted — normal Obsidian/browser handling proceeds', () => {
		const plugin = new Plugin();
		plugin.load();
		const resolver = resolverFixture();
		const actions = stubActions();
		attachSccLinkClickHandling(plugin, document, resolver, actions);

		const anchor = anchorContainer(document, 'https://example.com');
		const passthrough = jest.fn();
		anchor.addEventListener('click', passthrough);
		anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

		expect(actions.vaultCalls).toHaveLength(0);
		expect(passthrough).toHaveBeenCalledTimes(1);
		anchor.remove();
		plugin.unload();
	});
});

describe('registerSccLinkClickHandling (SC-135 phase 1 §2 — wiring)', () => {
	function fakeLeaf(doc?: Document) {
		return { getContainer: () => ({ doc }) };
	}

	test('attaches to the main window document', () => {
		const plugin = new Plugin();
		plugin.load();
		const resolver = resolverFixture();
		const actions = stubActions();
		const workspace = fakeWorkspace();

		registerSccLinkClickHandling(plugin, workspace, resolver, actions);
		const anchor = anchorContainer(document, VAULT_HREF);
		anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

		expect(actions.vaultCalls).toHaveLength(1);
		anchor.remove();
		plugin.unload();
	});

	test('attaches to a popout window ALREADY open at registration time (dev-reload edge case)', () => {
		const plugin = new Plugin();
		plugin.load();
		const resolver = resolverFixture();
		const actions = stubActions();
		const popoutDoc = document.implementation.createHTMLDocument('popout');
		const workspace = fakeWorkspace([
			fakeLeaf(popoutDoc),
			fakeLeaf(popoutDoc), // a second leaf in the SAME popout — must dedupe.
			fakeLeaf(undefined), // the main-window split has no `.doc` — must no-op.
		]);

		registerSccLinkClickHandling(plugin, workspace, resolver, actions);
		const anchor = anchorContainer(popoutDoc, VAULT_HREF);
		anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

		expect(actions.vaultCalls).toHaveLength(1);
		plugin.unload();
	});

	/** A workspace fake that records each `on(name, cb)` registration by name, so a test can
	 *  fire 'window-open'/'window-close' the way Obsidian would. */
	function fakeWorkspace(leaves: Array<{ getContainer: () => { doc?: Document } }> = []) {
		const callbacks: Record<string, (win: { doc: Document }) => unknown> = {};
		return {
			callbacks,
			containerEl: document.body,
			on: jest.fn((name: string, cb: any) => {
				callbacks[name] = cb;
				return { fake: `eventref:${name}` };
			}),
			iterateAllLeaves: jest.fn((cb: any) => {
				for (const leaf of leaves) cb(leaf);
			}),
		};
	}

	test('registers a window-open listener and attaches to a FUTURE popout when it fires', () => {
		const plugin = new Plugin();
		plugin.load();
		const resolver = resolverFixture();
		const actions = stubActions();
		const workspace = fakeWorkspace();
		const registerEventSpy = jest.spyOn(plugin, 'registerEvent');

		registerSccLinkClickHandling(plugin, workspace, resolver, actions);
		expect(workspace.on).toHaveBeenCalledWith('window-open', expect.any(Function));
		expect(registerEventSpy).toHaveBeenCalledWith({ fake: 'eventref:window-open' });

		// A click in the popout BEFORE window-open fires is not caught yet.
		const popoutDoc = document.implementation.createHTMLDocument('popout');
		const preAnchor = anchorContainer(popoutDoc, VAULT_HREF);
		preAnchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		expect(actions.vaultCalls).toHaveLength(0);

		// Simulate Obsidian firing 'window-open' for the new popout.
		workspace.callbacks['window-open']({ doc: popoutDoc });

		preAnchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		expect(actions.vaultCalls).toHaveLength(1);
		plugin.unload();
	});

	// SC-135 fix round 1 — review finding L-6. Per-window listener ownership: a closed popout
	// must stop being referenced when it closes, not merely when the plugin unloads.
	describe('per-window teardown (SC-135 fix round 1, finding L-6)', () => {
		test('registers a window-close listener alongside window-open', () => {
			const plugin = new Plugin();
			plugin.load();
			const workspace = fakeWorkspace();
			const registerEventSpy = jest.spyOn(plugin, 'registerEvent');

			registerSccLinkClickHandling(plugin, workspace, resolverFixture(), stubActions());

			expect(workspace.on).toHaveBeenCalledWith('window-close', expect.any(Function));
			expect(registerEventSpy).toHaveBeenCalledWith({ fake: 'eventref:window-close' });
			plugin.unload();
		});

		test('window-close detaches THAT popout\'s listeners and leaves the main window working', () => {
			const plugin = new Plugin();
			plugin.load();
			const resolver = resolverFixture();
			const actions = stubActions();
			const workspace = fakeWorkspace();
			registerSccLinkClickHandling(plugin, workspace, resolver, actions);

			const popoutDoc = document.implementation.createHTMLDocument('popout');
			workspace.callbacks['window-open']({ doc: popoutDoc });
			const popoutAnchor = anchorContainer(popoutDoc, VAULT_HREF);
			popoutAnchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
			expect(actions.vaultCalls).toHaveLength(1);

			workspace.callbacks['window-close']({ doc: popoutDoc });

			// The popout's listeners are gone — a click there is no longer intercepted.
			popoutAnchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
			expect(actions.vaultCalls).toHaveLength(1);

			// ...and the main window is untouched by that teardown.
			const mainAnchor = anchorContainer(document, VAULT_HREF);
			mainAnchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
			expect(actions.vaultCalls).toHaveLength(2);

			mainAnchor.remove();
			plugin.unload();
		});

		test('a window closed and re-opened attaches again (the dedupe entry was released, not stuck)', () => {
			const plugin = new Plugin();
			plugin.load();
			const resolver = resolverFixture();
			const actions = stubActions();
			const workspace = fakeWorkspace();
			registerSccLinkClickHandling(plugin, workspace, resolver, actions);

			const popoutDoc = document.implementation.createHTMLDocument('popout');
			workspace.callbacks['window-open']({ doc: popoutDoc });
			workspace.callbacks['window-close']({ doc: popoutDoc });
			workspace.callbacks['window-open']({ doc: popoutDoc });

			const anchor = anchorContainer(popoutDoc, VAULT_HREF);
			anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

			// Exactly one — re-attached, and not double-attached.
			expect(actions.vaultCalls).toHaveLength(1);
			plugin.unload();
		});

		test('window-close for a window that was never attached is a no-op', () => {
			const plugin = new Plugin();
			plugin.load();
			const actions = stubActions();
			const workspace = fakeWorkspace();
			registerSccLinkClickHandling(plugin, workspace, resolverFixture(), actions);

			const strayDoc = document.implementation.createHTMLDocument('never-attached');
			expect(() => workspace.callbacks['window-close']({ doc: strayDoc })).not.toThrow();

			// The main window still works.
			const mainAnchor = anchorContainer(document, VAULT_HREF);
			mainAnchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
			expect(actions.vaultCalls).toHaveLength(1);
			mainAnchor.remove();
			plugin.unload();
		});

		test('plugin unload still detaches EVERY window that is left attached', () => {
			const plugin = new Plugin();
			plugin.load();
			const resolver = resolverFixture();
			const actions = stubActions();
			const workspace = fakeWorkspace();
			registerSccLinkClickHandling(plugin, workspace, resolver, actions);

			const popoutDoc = document.implementation.createHTMLDocument('popout');
			workspace.callbacks['window-open']({ doc: popoutDoc });

			plugin.unload();

			const mainAnchor = anchorContainer(document, VAULT_HREF);
			mainAnchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
			const popoutAnchor = anchorContainer(popoutDoc, VAULT_HREF);
			popoutAnchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

			expect(actions.vaultCalls).toHaveLength(0);
			mainAnchor.remove();
		});
	});
});
