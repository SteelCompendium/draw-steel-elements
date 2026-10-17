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
		// `gallery: true` mounts every fixture, deferred ones included.
		expect(() => assertNoDeferredBrowserShots([{ out: 'all.png', source: 'browser', gallery: true }], repo)).toThrow(/all\.png -> gallery: true/);
	});

	// SC-411 (O8): a GIF scripts an interaction with an element, so a gif entry for a deferred element is
	// refused from EITHER source (the Obsidian half would animate the switch-OFF placeholder card), and a
	// gif entry that names no element cannot be checked at all.
	test('rejects a kind:gif entry for a deferred element from either source, and a gif entry with no element', () => {
		const gif = (over: Record<string, unknown>) => [{ out: 'x.gif', kind: 'gif', source: 'browser', element: 'initiative', steps: [{}], ...over }];
		expect(() => assertNoDeferredBrowserShots(gif({}), repo)).not.toThrow();
		expect(() => assertNoDeferredBrowserShots(gif({ source: 'obsidian', element: 'stamina-bar' }), repo)).not.toThrow();
		expect(() => assertNoDeferredBrowserShots(gif({ element: 'surges' }), repo)).toThrow(/x\.gif -> surges \(gif, browser\)/);
		expect(() => assertNoDeferredBrowserShots(gif({ source: 'obsidian', element: 'encounter' }), repo)).toThrow(/x\.gif -> encounter \(gif, obsidian\)/);
		expect(() => assertNoDeferredBrowserShots(gif({ element: undefined }), repo)).toThrow(/gif entry without an element/);
	});

	// SC-411 r4 (INFO-1): the reason in the message follows the source of the refused entry.
	test('the refusal message gives the reason that applies to the entry\'s source', () => {
		const msg = (shots: unknown[]) => {
			try {
				assertNoDeferredBrowserShots(shots, repo);
			} catch (e) {
				return (e as Error).message;
			}
			return '';
		};
		const gif = (over: Record<string, unknown>) => ({ out: 'x.gif', kind: 'gif', source: 'browser', element: 'surges', steps: [{}], ...over });
		const browser = msg([gif({})]);
		expect(browser).toMatch(/browser half renders with the experimental switch ON/);
		expect(browser).not.toMatch(/placeholder/);
		const obsidian = msg([gif({ source: 'obsidian' })]);
		expect(obsidian).toMatch(/Obsidian half runs with the switch OFF/);
		expect(obsidian).toMatch(/placeholder card/);
		expect(obsidian).not.toMatch(/switch ON/);
		expect(msg([gif({ element: undefined })])).toMatch(/must name its `element`/);
	});
});
