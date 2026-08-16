// SC-156 — every SCC code shipped in the `ds-hero` starter example must resolve.
//
// `src/elements/hero/example.yaml` is what a user gets from `/ds` -> Hero sheet and from
// "Insert Draw Steel: Hero sheet". It shipped two ability codes containing a literal `...`
// ellipsis (`scc.v1:mcdm.heroes.v1/.../brute-strike`), so every inserted hero sheet started
// with two permanently broken ability rows — and that example is exactly where SC-141's
// bug report came from: Scott's test hero was seeded from it.
//
// Nothing caught it because the browser harness has no `cx.compendium` (visual-harness/
// entry.ts), so hero fixtures degrade those rows identically whether the code is real or
// nonsense — the shots looked the same either way. This test is the gate that closes that:
// it reads the SHIPPED example, pulls every `scc.v1:` code out of it, and resolves each one
// against a real CompendiumIndex over the real corpus bytes.
import fs from 'fs';
import path from 'path';
import { parseYaml } from 'obsidian';
import { makeCompendiumDeps, loadMdDseFixture, MD_DSE_FIXTURES } from './_refHarness';

const EXAMPLE = path.join(__dirname, '../../../src/elements/hero/example.yaml');

/** Every `scc.v1:`-prefixed code in the example, wherever it appears (scalars and lists). */
function codesIn(value: unknown, out: string[] = []): string[] {
	if (typeof value === 'string') {
		const m = /^scc(?:\.v\d+)?:(.+)$/.exec(value.trim());
		if (m) out.push(m[1]);
	} else if (Array.isArray(value)) {
		for (const v of value) codesIn(v, out);
	} else if (value && typeof value === 'object') {
		for (const v of Object.values(value)) codesIn(v, out);
	}
	return out;
}

/** `<type>/<...>/<item>` -> the md-dse fixture path the corpus ships it at. */
function fixtureRelPath(code: string): string {
	const [, ...rest] = code.split('/'); // drop the source segment (mcdm.heroes.v1)
	const [typeSeg, item] = [rest[0], rest[rest.length - 1]];
	return `${typeSeg.split('.').join('/')}/${item}.md`;
}

describe('SC-156 — the ds-hero starter example', () => {
	const raw = fs.readFileSync(EXAMPLE, 'utf8');
	const codes = codesIn(parseYaml(raw));

	it('contains no placeholder codes', () => {
		expect(codes.length).toBeGreaterThan(0);
		for (const code of codes) {
			// The exact shape that shipped: a literal ellipsis standing in for the real
			// type segment. Also catches any other empty segment.
			expect(code).not.toContain('...');
			expect(code.split('/').every((seg) => seg.length > 0)).toBe(true);
		}
	});

	it('ships only codes that resolve to a real compendium entry', () => {
		const { index, vault } = makeCompendiumDeps();
		const missingFixtures: string[] = [];
		for (const code of codes) {
			const rel = fixtureRelPath(code);
			if (!fs.existsSync(path.join(MD_DSE_FIXTURES, rel))) {
				missingFixtures.push(`${code} (no fixture at ${rel})`);
				continue;
			}
			loadMdDseFixture(vault, rel);
		}
		// A code with no corpus fixture is itself the failure this test exists to catch:
		// the example must not reference content the shipped corpus doesn't have.
		expect(missingFixtures).toEqual([]);

		for (const code of codes) {
			expect(index.getEntry(code)).not.toBeNull();
		}
	});

	it('resolves both ability codes to real, renderable abilities', async () => {
		const { index, vault } = makeCompendiumDeps();
		const abilities = (parseYaml(raw) as { abilities?: string[] }).abilities ?? [];
		expect(abilities).toHaveLength(2);

		for (const ref of abilities) {
			const code = ref.replace(/^scc(?:\.v\d+)?:/, '');
			loadMdDseFixture(vault, fixtureRelPath(code));
			const entity = await index.getEntity(code);
			expect(entity).not.toBeNull();
			// SC-141's class of failure: found, but no adapter claims the type, so nothing
			// renders. A starter example must clear that bar, not just exist.
			await expect(entity!.model()).resolves.toBeDefined();
		}
	});
});
