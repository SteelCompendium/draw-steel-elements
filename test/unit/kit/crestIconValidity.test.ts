// test/unit/kit/crestIconValidity.test.ts — SC-120 Batch C, owner ruling 2 (binding):
// every `crestIcon` a `layout.steel` composition names must resolve to a REAL icon in the
// Lucide set Obsidian bundles, or `crest()` (src/framework/kit/crest.ts) silently renders
// nothing — a crest that resolves to nothing is a failure, not a cosmetic gap, and it is
// NOT caught by any DOM test: the jest mock's setIcon (test/mocks/obsidian-core.ts) stamps
// whatever string it's given verbatim, valid or not (see test/dom/kit/crest.test.ts's own
// "renders a .dse-crest <span> holding the setIcon glyph" — it only proves the STRING was
// passed through, never that Obsidian's real icon registry has anything to show for it).
//
// This plugin bundles `lucide` (package.json dependency) at build time, and Obsidian's own
// icon registry is backed by that same Lucide icon set — `setIcon(el, id)` takes the
// kebab-case id (e.g. "book-open"), which corresponds 1:1 to the package's PascalCase
// named export (e.g. `BookOpen`). Verified against the codebase's own established
// kebab-case vocabulary (`crestIconForRole`, statblock/view.ts; kitLayout's 'backpack') —
// every one of those already resolves via the same toPascalCase(id) lookup this test uses,
// so the mapping is the right one to gate future crest ids with, not a test-only guess.
import { ancestryLayout, conditionLayout, perkLayout, kitLayout } from '@/elements/display/layouts';
import { genericLayout } from '@/elements/display/displayFamily';
import type { CardLayout } from '@/elements/shared/CardLayout';

// eslint-disable-next-line @typescript-eslint/no-var-requires -- same require-a-.cjs-ish
// package convention as test/unit/parity/compare.test.ts; `lucide`'s package.json has no
// usable ESM default for a plain `import`.
const lucide = require('lucide') as Record<string, unknown>;

/** Lucide's package export names are PascalCase (e.g. "BookOpen"); Obsidian's setIcon (and
 *  this plugin's own crest()/CrestOptions) take the kebab-case id (e.g. "book-open"). */
function toPascalCase(kebabId: string): string {
	return kebabId
		.split('-')
		.filter(Boolean)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join('');
}

function resolves(kebabId: string): boolean {
	return toPascalCase(kebabId) in lucide;
}

/**
 * Every `CardLayout` carrying a Steel composition, across the codebase — kept as a literal
 * list (not a registry scan) so a future composition that forgets to add itself here is a
 * visible test-authoring gap, not a silent one. Each entry's own band/eyebrow/DOM shape is
 * exercised by kitSteel.test.ts / displaySteelBatchC.test.ts already; this file's only job
 * is the crest id's real-world validity, which no DOM test can see under the jest mock.
 */
const STEEL_LAYOUTS: { name: string; layout: CardLayout<any> }[] = [
	{ name: 'kitLayout (backpack)', layout: kitLayout },
	{ name: 'ancestryLayout (users)', layout: ancestryLayout },
	{ name: 'conditionLayout (zap)', layout: conditionLayout },
	{ name: 'perkLayout (gem)', layout: perkLayout },
	{ name: 'genericLayout / ds-rule (book-open)', layout: genericLayout },
];

describe('SC-120 Batch C, owner ruling 2: every layout.steel crestIcon resolves in the bundled Lucide set', () => {
	test.each(STEEL_LAYOUTS)('$name', ({ layout }) => {
		expect(layout.steel).toBeDefined();
		const icon = layout.steel!.crestIcon({} as any, undefined);
		expect(icon).toBeDefined();
		expect(resolves(icon!)).toBe(true);
	});

	test('sanity: a made-up icon id does NOT resolve (proves the check above is not a tautology)', () => {
		expect(resolves('not-a-real-lucide-icon-xyz')).toBe(false);
	});
});
