/** @jest-environment jsdom */
// SC-135 phase 1b — light smoke coverage for the CM6 extension factory itself. The real
// click-routing logic lives in the pure functions (test/unit/refs/sccLinkAtPos.test.ts,
// no EditorView needed); constructing a full EditorView + driving real mousedown/posAtCoords
// through it is exactly what the Xvfb + real-Obsidian end-to-end check covers instead (see
// the SC-135 phase 1 report) — this test only pins that the factory builds a valid,
// non-throwing CM6 Extension shape suitable for `plugin.registerEditorExtension`.
import { createSccLinkCm6Extension } from '@/refs/sccLinkCm6';
import { SccAnchorResolver } from '@/refs/rewriteSccAnchors';
import type { SccClickActions } from '@/refs/sccLinkClickHandler';

function stubResolver(): SccAnchorResolver {
	return { resolve: jest.fn(() => ({ kind: 'unresolved', code: 'x' })) };
}
function stubActions(): SccClickActions {
	return { openVault: jest.fn(), openWeb: jest.fn(), notifyUnresolved: jest.fn() };
}

describe('createSccLinkCm6Extension (SC-135 phase 1b)', () => {
	test('builds without throwing and returns a truthy Extension', () => {
		const ext = createSccLinkCm6Extension(stubResolver(), stubActions());
		expect(ext).toBeTruthy();
	});

	test('is a fresh object each call (no shared mutable state leaking across plugin instances)', () => {
		const resolver = stubResolver();
		const actions = stubActions();
		const a = createSccLinkCm6Extension(resolver, actions);
		const b = createSccLinkCm6Extension(resolver, actions);
		expect(a).not.toBe(b);
	});
});
