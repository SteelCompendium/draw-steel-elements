// SC-407 fix round 1 (LOW-4) — the docs-shots guard. The browser half of `npm run docs-shots`
// renders with the experimental switch ON, so a manifest entry for a deferred element would
// publish an unfinished feature. visual-harness/docs-deferred-guard.cjs refuses it, deriving
// the deferred set from the element definitions themselves.
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { deferredElementIds, assertNoDeferredBrowserShots } = require('../../../visual-harness/docs-deferred-guard.cjs');

const repo = path.resolve(__dirname, '../../..');

describe('SC-407 docs-shots deferred-element guard', () => {
	test('reads the nine deferred ids from the element definitions (not a hand-copied list)', () => {
		expect(deferredElementIds(repo)).toEqual(
			['conditions', 'encounter', 'hero', 'hero-tokens', 'heroic-resource', 'party', 'project', 'roll', 'surges'],
		);
	});

	test('rejects a browser entry (element or gallery id) for a deferred element; allows shipping ones and obsidian entries', () => {
		expect(() => assertNoDeferredBrowserShots([{ out: 'a.png', source: 'browser', element: 'statblock' }], repo)).not.toThrow();
		expect(() =>
			assertNoDeferredBrowserShots([{ out: 'a.png', source: 'browser', gallery: ['feature', 'initiative', 'statblock'] }], repo),
		).not.toThrow();
		expect(() => assertNoDeferredBrowserShots([{ out: 'x.png', source: 'obsidian', element: 'party' }], repo)).not.toThrow();
		expect(() => assertNoDeferredBrowserShots([{ out: 'p.png', source: 'browser', element: 'party' }], repo)).toThrow(/p\.png -> party/);
		expect(() =>
			assertNoDeferredBrowserShots([{ out: 'g.png', source: 'browser', gallery: ['statblock', 'surges'] }], repo),
		).toThrow(/g\.png -> surges/);
	});
});
