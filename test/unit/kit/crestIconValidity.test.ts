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
// kebab-case id (e.g. "book-open").
//
// SC-120 Batch B (owner ruling 14, "MUST be tightened in Batch B"): the round-2/round-3
// version of this test resolved against `lucide`'s PACKAGE EXPORT NAMES (PascalCase), which
// keep DEPRECATED ALIASES alongside each icon's canonical name (e.g. both `AlertOctagon`
// AND `OctagonAlert` resolve to the exact same icon) — so a crest id that names a
// deprecated alias passed the old check even though it isn't the icon's real/current name.
// Complication's crest, `octagon-alert`, is exactly the id class this misses: it IS
// canonical, but `alert-octagon` (the alias) would ALSO have passed the old test.
//
// Tightened resolution: Lucide ships one ESM module PER ICON, named by the icon's
// CANONICAL kebab-case id (`node_modules/lucide/dist/esm/icons/<id>.mjs`) — every
// deprecated alias is a re-export of that same file under an ADDITIONAL name in
// `iconsAndAliases.mjs`, never a file of its own (verified directly against the installed
// package, v1.24.0: `dist/esm/icons/octagon-alert.mjs` exists; `dist/esm/icons/
// alert-octagon.mjs` does not — `iconsAndAliases.mjs` has
// `export { default as AlertOctagon, default as OctagonAlert } from
// './icons/octagon-alert.mjs'`). So resolving against the per-icon FILE's existence,
// keyed by the id's own kebab-case spelling, checks canonicalness directly rather than
// going through the alias-blind export-name lookup. A deprecated alias id therefore FAILS
// this check even though it still renders in a real (older) Obsidian — which is the whole
// point of tightening it now, before a shipped crest quietly depends on an alias Lucide
// could someday drop.
import { ancestryLayout, conditionLayout, perkLayout, kitLayout, careerLayout, classLayout } from '@/elements/display/layouts';
import { treasureLayout, titleLayout, complicationLayout, cultureLayout } from '@/elements/display/layouts';
import { genericLayout } from '@/elements/display/displayFamily';
import type { CardLayout } from '@/elements/shared/CardLayout';
import * as fs from 'fs';
import * as path from 'path';

const LUCIDE_ICONS_DIR = path.join(path.dirname(require.resolve('lucide/package.json')), 'dist', 'esm', 'icons');

/** Canonical iff Lucide ships a per-icon ESM module named exactly `<kebabId>.mjs` — a
 *  deprecated alias is only ever a re-export from a DIFFERENT file, never a file of its
 *  own (see the file-header note above for the verified package-layout fact). */
function resolves(kebabId: string): boolean {
	return fs.existsSync(path.join(LUCIDE_ICONS_DIR, `${kebabId}.mjs`));
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
	// SC-120 Batch A
	{ name: 'careerLayout (briefcase)', layout: careerLayout },
	{ name: 'classLayout (shield)', layout: classLayout },
	// SC-120 Batch B
	{ name: 'treasureLayout (package)', layout: treasureLayout },
	{ name: 'titleLayout (crown)', layout: titleLayout },
	{ name: 'complicationLayout (octagon-alert)', layout: complicationLayout },
	{ name: 'cultureLayout (map)', layout: cultureLayout },
];

describe('SC-120 Batch C/B, owner rulings 2 and 14: every layout.steel crestIcon resolves to a CANONICAL Lucide icon (not merely a deprecated alias)', () => {
	test.each(STEEL_LAYOUTS)('$name', ({ layout }) => {
		expect(layout.steel).toBeDefined();
		const icon = layout.steel!.crestIcon({} as any, undefined);
		expect(icon).toBeDefined();
		expect(resolves(icon!)).toBe(true);
	});

	test('sanity: a made-up icon id does NOT resolve (proves the check above is not a tautology)', () => {
		expect(resolves('not-a-real-lucide-icon-xyz')).toBe(false);
	});

	// Owner ruling 14: the whole point of the tightening. Under the OLD (export-name)
	// check both `octagon-alert` and its deprecated alias `alert-octagon` resolved,
	// because `lucide`'s PascalCase export table lists both names against the same icon.
	// The tightened, canonical-file-backed check must tell them apart.
	test("owner ruling 14's regression proof: 'octagon-alert' (complication's canonical crest) resolves, but its deprecated alias 'alert-octagon' does NOT", () => {
		expect(resolves('octagon-alert')).toBe(true);
		expect(resolves('alert-octagon')).toBe(false);
	});
});
