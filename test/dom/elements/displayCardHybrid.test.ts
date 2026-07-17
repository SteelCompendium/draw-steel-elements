// test/dom/elements/displayCardHybrid.test.ts — D6 Task 9 (spec §2.3, §9): the hybrid
// by-SCC render — frontmatter-driven chrome (title/badges/rows) PLUS the resolved source
// file's own markdown body, rendered end-to-end through the REAL `kitElement` (displayFamily)
// + REAL `kit/panther.md` md-dse fixture (same harness convention as displayFamily.test.ts /
// Task 4's _refHarness.ts), not a hand-rolled stand-in layout — this is the "does the real
// production wiring behave" suite Task 5/6's unit-style displayCard.test.ts intentionally
// left for later.
//
// Four claims (brief Step 1 (a)-(d)):
//   (a) frontmatter-driven rows (Stamina/Speed/Stability/Melee damage bonuses) render in
//       by-SCC mode — proving hybrid mode doesn't just show the source body and go quiet on
//       the model-driven chrome.
//   (b) the resolved source body — including its nested ```ds-feature fence (the kit's
//       Signature Ability, which by-SCC mode's frontmatter-only model construction can NOT
//       otherwise surface: frontmatterAdapter builds `Kit` from frontmatter alone, and
//       `signature_ability` isn't a frontmatter key for a compendium kit file — it only
//       exists as a nested fence in the body) — reaches `renderMarkdown` in the card's body
//       region. IMPORTANT ceiling, not glossed over: this repo's jest MarkdownRenderer mock
//       (test/mocks/obsidian-core.ts) appends markdown as an inert text node — it does NOT
//       execute Obsidian's real code-block postprocessors, so it can never actually turn
//       that nested fence into a real `[data-dse-element="feature"]` card the way real
//       Obsidian does. What jest CAN prove — the fence's raw text reaching renderMarkdown,
//       and the body region existing — is asserted below; true recursion into a rendered
//       nested card is real-Obsidian-only (Task 11's obsidian-shots) and isn't wired up for
//       by-SCC blocks even there today (visual-harness/notes-gen.mjs generates no `scc:`
//       reference notes as of this task) — flagged in the task report, not faked here.
//   (c) a model-driven row flagged `omitWhenSource` is suppressed in by-SCC mode but renders
//       in inline mode — the flag firing independently of the Task 7 duplicate-text guard
//       (picked a short bonus value so the duplicate-text guard's own length floor can't be
//       the thing doing the suppressing).
//   (d) the depth guard (RefUnwrapView.ts's module-level `IN_FLIGHT_REFS`): a synthetic
//       `kit/self-ref.md` fixture whose own body whole-block-references itself. The jest
//       MarkdownRenderer mock's inability to execute code-block processors (see (b) above)
//       means real markdown-driven recursion can't be triggered from jest at all — so this
//       drives the SAME reentrancy the real processor chain would (a second resolution of
//       the identical code, in the identical block, while the first is still in flight) by
//       wrapping `compendium.getEntity` to recursively invoke the SAME pipeline+host before
//       resolving — the most faithful thing achievable without a real Obsidian instance.
import { ElementPipeline } from '@/framework/pipeline';
import { kitElement } from '@/elements/display';
import { displayFamily } from '@/elements/display/displayFamily';
import { kitLayout } from '@/elements/display/layouts';
import type { CardLayout } from '@/elements/shared/CardLayout';
import type { Kit } from 'steel-compendium-sdk';
import kitExample from '@/elements/display/kit/example.yaml';
import { makeHost, makeCompendiumDeps, loadMdDseFixture } from './_refHarness';

const KIT_CODE = 'mcdm.heroes.v1/kit/panther';
const KIT_REL = 'kit/panther.md';
const SELF_REF_CODE = 'mcdm.heroes.v1/kit/self-ref';
const SELF_REF_REL = 'kit/self-ref.md';

function rowByLabel(card: HTMLElement, label: string): HTMLElement | null {
	return (
		(Array.from(card.querySelectorAll('.dse-card__row')).find(
			(r) => r.querySelector('.dse-card__row-label')?.textContent === label,
		) as HTMLElement | undefined) ?? null
	);
}

describe('D6 Task 9: hybrid by-SCC render — frontmatter chrome + source body (spec §2.3, §9)', () => {
	test('(a) frontmatter-driven rows render in by-SCC mode', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, KIT_REL);
		const host = makeHost('ds-kit');

		await new ElementPipeline(deps).run(kitElement, `scc.v1:${KIT_CODE}`, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		const card = root.querySelector('.dse-card') as HTMLElement;
		expect(card.querySelector('.dse-card__title')?.textContent).toBe('Panther');

		const stamina = rowByLabel(card, 'Stamina');
		expect(stamina?.querySelector('.dse-card__row-value')?.textContent).toContain('+6 per');
		const speed = rowByLabel(card, 'Speed');
		expect(speed?.querySelector('.dse-card__row-value')?.textContent).toBe('+1');
		const stability = rowByLabel(card, 'Stability');
		expect(stability?.querySelector('.dse-card__row-value')?.textContent).toBe('+1');
		const meleeDamage = rowByLabel(card, 'Melee damage');
		expect(meleeDamage?.querySelector('.dse-card__row-value')?.textContent).toBe('+0/+0/+4');
	});

	test('(b) the resolved source body — including its nested ```ds-feature fence — reaches renderMarkdown; real nested-card recursion is real-Obsidian-only (jest mock can\'t execute code-block processors)', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, KIT_REL);
		const host = makeHost('ds-kit');

		await new ElementPipeline(deps).run(kitElement, `scc.v1:${KIT_CODE}`, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const card = root.querySelector('.dse-card') as HTMLElement;
		const body = card.querySelector('.dse-card__body');
		expect(body).not.toBeNull();

		// The kit model's by-SCC construction is frontmatter-only (frontmatterAdapter),
		// and `signature_ability` is not a frontmatter key in the real fixture — so the
		// ONLY place "Devastating Rush" (the signature ability) can come from here is the
		// resolved file's BODY reaching renderMarkdown, fence and all.
		expect(body?.textContent).toContain('Devastating Rush');
		expect(body?.textContent).toContain('```ds-feature');
		expect(body?.textContent).toContain('feature_type: ability');

		// What jest genuinely CANNOT prove (documented, not faked): the mock
		// MarkdownRenderer.render (test/mocks/obsidian-core.ts) appends markdown as an
		// inert text node — it never invokes a code-block processor — so the fence above
		// never actually becomes a real nested element here. Assert that ceiling
		// explicitly rather than silently skip it.
		expect(body?.querySelector('[data-dse-element="feature"]')).toBeNull();
	});

	test('(c) an omitWhenSource row renders inline but is suppressed by-SCC (independent of the duplicate-text guard — value is short)', async () => {
		// A test-only sibling of the real kitLayout with one extra row flagged
		// omitWhenSource, sourced from `melee_damage_bonus` — present, short ("+0/+0/+4"
		// inline / real panther fixture alike), well under the Task 7 duplicate-text
		// guard's DUPLICATE_ROW_MIN_LENGTH floor, so any suppression proven here is the
		// omitWhenSource flag itself, not a text-duplicate coincidence.
		const testLayout: CardLayout<Kit> = {
			...kitLayout,
			rows: [
				...(kitLayout.rows ?? []),
				{ label: 'OmitTest', value: (m) => m.melee_damage_bonus, omitWhenSource: true },
			],
		};
		const testKitElement = displayFamily<Kit>({
			id: 'kit-hybrid-omit-test',
			aliases: ['ds-kit-hybrid-omit-test'],
			name: 'Kit Hybrid Omit Test',
			type: 'kit',
			layout: testLayout,
			example: kitExample,
		});

		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, KIT_REL);

		const inlineHost = makeHost('ds-kit-hybrid-omit-test');
		await new ElementPipeline(deps).run(testKitElement, kitExample, inlineHost);
		const inlineRoot = inlineHost.containerEl.firstElementChild as HTMLElement;
		expect(inlineRoot.querySelectorAll('.dse-error-card')).toHaveLength(0);
		const inlineRow = rowByLabel(inlineRoot.querySelector('.dse-card') as HTMLElement, 'OmitTest');
		expect(inlineRow?.querySelector('.dse-card__row-value')?.textContent).toBe('+0/+0/+4');

		const hybridHost = makeHost('ds-kit-hybrid-omit-test');
		await new ElementPipeline(deps).run(testKitElement, `scc.v1:${KIT_CODE}`, hybridHost);
		const hybridRoot = hybridHost.containerEl.firstElementChild as HTMLElement;
		expect(hybridRoot.querySelectorAll('.dse-error-card')).toHaveLength(0);
		const hybridCard = hybridRoot.querySelector('.dse-card') as HTMLElement;
		expect(hybridCard.querySelector('.dse-card__title')?.textContent).toBe('Panther');
		expect(rowByLabel(hybridCard, 'OmitTest')).toBeNull();
	});

	test('(d) depth guard: a code already resolving in the SAME block is refused, not infinitely recursed', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, SELF_REF_REL);
		const host = makeHost('ds-kit');
		const pipeline = new ElementPipeline(deps);

		// See file header (d): jest's MarkdownRenderer mock can't execute code-block
		// processors, so `kit/self-ref.md`'s own nested ```ds-kit self-reference fence
		// can never actually re-enter the pipeline from a real render in this harness.
		// This wraps compendium.getEntity to trigger that same reentrancy directly — a
		// second resolution of the identical code, on the identical host (so
		// RefUnwrapView sees the identical blockKey), synchronously nested inside the
		// first resolution's own in-flight window — the most faithful simulation of what
		// the real code-block processor chain would do, achievable without real Obsidian.
		const realGetEntity = deps.compendium!.getEntity.bind(deps.compendium);
		let triggeredRecursion = false;
		(deps.compendium as any).getEntity = async (code: string) => {
			if (code === SELF_REF_CODE && !triggeredRecursion) {
				triggeredRecursion = true;
				await pipeline.run(kitElement, `scc.v1:${code}`, host);
			}
			return realGetEntity(code);
		};

		await pipeline.run(kitElement, `scc.v1:${SELF_REF_CODE}`, host);

		expect(triggeredRecursion).toBe(true);
		const roots = Array.from(host.containerEl.children) as HTMLElement[];
		// Root #0: the OUTER call's root div (created before the recursive inner call),
		// filled in only once the inner call (and the guard refusal inside it) settles —
		// it resolves normally, proving a refused inner recursion doesn't corrupt the
		// outer resolution.
		expect(roots[0].querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(roots[0].querySelector('.dse-card__title')?.textContent).toBe('Self Ref');

		// Root #1: the INNER (recursive, same blockKey + same code) call's root div —
		// refused by the depth guard instead of recursing further.
		const innerMessage = roots[1].querySelector('.dse-error-card-message');
		expect(innerMessage?.textContent).toMatch(/nesting too deep/i);
		expect(roots[1].querySelector('.dse-card')).toBeNull();
	});

	test('(e) the Task 7 duplicate-text guard suppresses frontmatter flavor when it\'s a duplicate of the source body\'s lead', async () => {
		// The real panther fixture's frontmatter `flavor` field is nearly identical to
		// the body's opening paragraph. In by-SCC mode, the duplicate-text guard
		// (normalizeForDuplicateCheck / DUPLICATE_ROW_MIN_LENGTH) should suppress the
		// flavor (which becomes a row) as a near-duplicate of the rendered body's lead
		// text. This test asserts `.dse-card__flavor` is absent, proving the guard fires
		// on this real-content path.
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, KIT_REL);
		const host = makeHost('ds-kit');

		await new ElementPipeline(deps).run(kitElement, `scc.v1:${KIT_CODE}`, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		const card = root.querySelector('.dse-card') as HTMLElement;
		expect(card.querySelector('.dse-card__title')?.textContent).toBe('Panther');

		// Assert the flavor is absent (suppressed by the duplicate-text guard), not
		// just a missing element — confirm the body is present to prove the guard
		// ran and made a decision, not that the entire card failed to render.
		expect(card.querySelector('.dse-card__flavor')).toBeNull();
		expect(card.querySelector('.dse-card__body')).not.toBeNull();
	});
});
