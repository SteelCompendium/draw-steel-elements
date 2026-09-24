// test/unit/services/typeAdapters.test.ts — SC-272: the `rule.*` `genericNoteAdapter`
// (typeAdapters.ts) derives `GenericNote.type` from the file's OWN `scc:` code's type
// segment (e.g. `mcdm.heroes.v1/rule.combat/gouge` -> `rule.combat`) when the frontmatter
// `type:` is itself still bare, instead of always carrying the bare frontmatter value
// verbatim — the real corpus's 163 rule files all carry `type: rule`, so before this
// fix `GenericNote.type` (and therefore the by-SCC card eyebrow, displayFamily.ts) could
// never be anything but the literal "rule"/"Rule". This file pins the adapter's OWN
// derivation logic directly (no full ElementPipeline needed); the end-to-end eyebrow
// render through a real fixture is covered by test/dom/elements/ruleCard.test.ts.
import { adapterForType } from "@/services/typeAdapters";
import type { GenericNote } from "@/services/typeAdapters";
import { makeFakeApp, seedNote } from "../../fakes/fakeObsidian";
import type { FakeVault, FakeMetadataCache } from "../../fakes/fakeObsidian";

const RULE_BODY = "The rule's own text.";

/** Seeds a synthetic rule note (no fixture file on disk needed) with the given
 *  frontmatter and returns the resolved TFile handle for `adapter.fromFile`. */
function seedRule(
	vault: FakeVault,
	metadataCache: FakeMetadataCache,
	path: string,
	frontmatter: Record<string, unknown>,
) {
	const file = seedNote(vault, path, RULE_BODY);
	metadataCache.frontmatter.set(path, frontmatter);
	return file;
}

describe("SC-272: genericNoteAdapter derives GenericNote.type from scc: (typeAdapters.ts)", () => {
	test("bare frontmatter type + a scc: code with a namespaced group -> type is the scc group, not the bare frontmatter value", async () => {
		const { vault, metadataCache, app } = makeFakeApp();
		const file = seedRule(vault, metadataCache, "rule/dice/power-roll.md", {
			type: "rule",
			scc: "mcdm.heroes.v1/rule.dice/power-roll",
			item_name: "Power Roll",
		});
		const adapter = adapterForType("rule")!;
		const note = (await adapter.fromFile(app, file)) as GenericNote;
		expect(note.type).toBe("rule.dice");
		expect(note.name).toBe("Power Roll");
	});

	test("no scc: field at all -> falls back to the bare frontmatter type, unchanged from before this fix", async () => {
		const { vault, metadataCache, app } = makeFakeApp();
		const file = seedRule(vault, metadataCache, "rule/general/no-scc.md", {
			type: "rule",
			item_name: "No Scc",
		});
		const adapter = adapterForType("rule")!;
		const note = (await adapter.fromFile(app, file)) as GenericNote;
		expect(note.type).toBe("rule");
	});

	test("malformed scc: (no second /-segment) -> falls back to the bare frontmatter type", async () => {
		const { vault, metadataCache, app } = makeFakeApp();
		const file = seedRule(vault, metadataCache, "rule/general/malformed.md", {
			type: "rule",
			scc: "mcdm.heroes.v1",
			item_name: "Malformed",
		});
		const adapter = adapterForType("rule")!;
		const note = (await adapter.fromFile(app, file)) as GenericNote;
		expect(note.type).toBe("rule");
	});

	test("scc: type segment is itself bare (\"rule\", no dot) -> derived type is still \"rule\" (same eyebrow as the no-scc fallback)", async () => {
		const { vault, metadataCache, app } = makeFakeApp();
		const file = seedRule(vault, metadataCache, "rule/general/bare-segment.md", {
			type: "rule",
			scc: "mcdm.heroes.v1/rule/bare-segment",
			item_name: "Bare Segment",
		});
		const adapter = adapterForType("rule")!;
		const note = (await adapter.fromFile(app, file)) as GenericNote;
		expect(note.type).toBe("rule");
	});

	test("an explicit frontmatter type: already more specific than bare \"rule\" wins over a conflicting scc: group — today's pre-SC-272 behavior for that case is unchanged", async () => {
		const { vault, metadataCache, app } = makeFakeApp();
		const file = seedRule(vault, metadataCache, "rule/dice/hand-authored.md", {
			type: "rule.dice",
			scc: "mcdm.heroes.v1/rule.combat/hand-authored",
			item_name: "Hand Authored",
		});
		const adapter = adapterForType("rule")!;
		const note = (await adapter.fromFile(app, file)) as GenericNote;
		expect(note.type).toBe("rule.dice");
	});

	// SC-272 fix round 2 (review LOW-1) — a hand-authored or miscopied `type: rule` note
	// can carry a `scc:` code from a DIFFERENT family (adapter dispatch keys off the
	// frontmatter `type:`, CompendiumIndex.ts, so `genericNoteAdapter` still claims it).
	// Before this fix, `sccTypeSegment` handed back that foreign segment verbatim — a
	// `feature.trait.…` or bare `kit` scc leaked into the rule eyebrow as "Level 1"/"Kit".
	test.each<[string, string]>([
		["foreign multi-segment family (feature.trait…)", "mcdm.heroes.v1/feature.trait.fury.level-1/x"],
		["foreign bare-slug family (kit)", "mcdm.heroes.v1/kit/x"],
	])("scc: from a %s on a type: rule note falls back to the bare frontmatter type, not the foreign segment", async (_label, scc) => {
		const { vault, metadataCache, app } = makeFakeApp();
		const file = seedRule(vault, metadataCache, "rule/general/foreign-scc.md", {
			type: "rule",
			scc,
			item_name: "Foreign Scc",
		});
		const adapter = adapterForType("rule")!;
		const note = (await adapter.fromFile(app, file)) as GenericNote;
		expect(note.type).toBe("rule");
	});

	// SC-272 fix round 2 (review LOW-2) — a malformed `scc:` type segment with a trailing
	// dot (`rule.`) used to survive `sccTypeSegment` as the literal string `"rule."`;
	// `genericLayout.steel.eyebrow`'s `split('.').pop()` then returned `""` instead of
	// falling back to "Rule", so the eyebrow rendered EMPTY rather than absent-or-"Rule".
	// The same `RULE_SCC_SEGMENT_RE` gate LOW-1 uses rejects this segment too.
	test("scc: type segment with a trailing dot (\"rule.\") falls back to the bare frontmatter type, not the empty string", async () => {
		const { vault, metadataCache, app } = makeFakeApp();
		const file = seedRule(vault, metadataCache, "rule/general/trailing-dot.md", {
			type: "rule",
			scc: "mcdm.heroes.v1/rule./trailing-dot",
			item_name: "Trailing Dot",
		});
		const adapter = adapterForType("rule")!;
		const note = (await adapter.fromFile(app, file)) as GenericNote;
		expect(note.type).toBe("rule");
	});
});
