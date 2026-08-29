// src/elements/display/layouts.ts — D6 Task 6 (spec §2): CardLayout<M> declarations for
// the first three display-family elements (kit/condition/treasure), driving Task 5's
// shared DisplayCardView frame. Field names/optionality verified against the LANDED SDK
// models (data-sdk-npm/src/model/{Kit,Condition,Treasure}.ts): every `*_bonus` field and
// Treasure.level are strings, not numbers.
//
// Task 7 (spec §2): the remaining seven (ancestry/culture/career/class/title/perk/
// complication). Field names verified against data-sdk-npm/src/model/{Ancestry,Culture,
// Career,Class,Title,Perk,Complication}.ts AND cross-checked field-by-field against every
// real yaml in data-unified (not just the picked example) for two things the brief's draft
// got wrong: (1) `markdown: true` coverage — Career.skills/perk, Class.skills/*_potency,
// and Title.prerequisite all carry inline `[text](scc.v1:...)` links in real data (same
// Task 6 Finding 2 pattern) and were missing the flag; Title.benefits/Perk.prerequisites/
// Career.inciting_incidents/Culture.skill_options+quick_build_skill get it prophylactically
// (never populated in the corpus today, but structurally identical to fields that do carry
// links once populated — no downside, per kit's row-uniformity rationale). Treasure's
// Prerequisite row is the control: real data confirms 0 links there, so it correctly stays
// plain. (Task 7 originally put Project in that same "control" bucket; that was WRONG and
// SC-121 C-5 corrects it — `project_roll_characteristic` links its characteristics in every
// real treasure that has a project, and the row was printing the raw markdown source.)
// (2) Several spec fields are simply DEAD in the current
// corpus — Ancestry.{signature_trait_description,ancestry_points,purchased_traits} (0/12),
// Career.inciting_incidents (0/17), Class.heroic_resource (0/13), Title.benefits (0/66),
// Perk.{perk_group,prerequisites} (0/55), and every Culture row field (0/13) — kept as
// spec'd (future authoring may populate them) but they render as omitted rows against every
// fixture in the corpus today; not a bug.
import type { Ancestry, Culture, Career, Class, Title, Perk, Complication } from 'steel-compendium-sdk';
import type { Kit, Condition, Treasure } from 'steel-compendium-sdk';
import type { Badge, CardLayout, SteelBand } from '@/elements/shared/CardLayout';
import { normalizeForDuplicateCheck, DUPLICATE_ROW_MIN_LENGTH, titleCase, plainText } from '@/elements/shared/CardLayout';
import type { RefSource } from '@/elements/shared/withReference';
import { renderFeatureList } from '@/elements/feature/renderFeature';
import { FeatureConfig } from '@model/FeatureConfig';
import { statTiles } from '@/framework/kit/statTiles';

// Plan 24 / SC-100 Task 3 — kit's Steel composition helpers. Ported from steel-etl's
// `internal/site/kit_page.go`/`cards.go` (kitKind/kitBonus), verified against the LANDED
// Go source (Task 1's recon), not from memory.

/**
 * Ported from `kitKind` (kit_page.go) / `kitCard` (cards.go): sniff the signature
 * ability's keywords for "Psionic"/"Magic", else "Martial" — the plan's stated stand-in
 * until SC-116 emits a real `kit_type` field (the v2-site ticket 2 the same plan files).
 * Inline mode reads the model's own `signature_ability.keywords` array directly. Hybrid
 * mode has no such field — `signature_ability` isn't a frontmatter key (frontmatterAdapter
 * is frontmatter-only, Task 1 corpus fact) — so it sniffs the resolved source BODY
 * instead: every real kit's keyword list is literal, un-linked text inside the nested
 * ```ds-feature fence's `keywords:` YAML block (verified against the corpus — "Magic"/
 * "Psionic"/"Weapon" never appear wrapped in an `scc.v1:` link), so a case-sensitive
 * word-boundary search of the whole body finds the SAME text the site's narrower
 * keyword-line sniff would, without this file needing its own YAML-fence parser.
 */
function kitKindOf(m: Kit, source?: RefSource): 'Martial' | 'Magic' | 'Psionic' {
	const haystack = source ? source.body : (m.signature_ability?.keywords ?? []).join(' ');
	if (/\bPsionic\b/.test(haystack)) return 'Psionic';
	if (/\bMagic\b/.test(haystack)) return 'Magic';
	return 'Martial';
}

/**
 * Ported from `kitBonus` (kit_page.go): strip a trailing " per …" qualifier — the tile
 * grid's Stamina label carries "per Echelon" itself (hardcoded, like the site's own
 * `{stam, "Stamina per Echelon", ""}` — no OTHER bonus field has ever carried a qualifier
 * in the real corpus, Task 1 recon) — and return '' for an absent bonus. `statTiles()`
 * itself owns the '' -> "—" dash fallback (the primitive's fixed-slot semantics), so this
 * function only does the value-string transform, not the display fallback.
 */
function kitBonusValue(raw: string | undefined): string {
	const s = (raw ?? '').trim();
	if (!s) return '';
	const idx = s.toLowerCase().indexOf(' per ');
	return idx >= 0 ? s.slice(0, idx).trim() : s;
}

const KIT_BODY_STRIP_HEADING_RE = /^#{1,6}\s*(equipment|kit bonuses)\s*$/i;

/**
 * FIX ROUND 3 (owner ruling 18): the leading count WORD (`One`/`Two`/…), mapped to its
 * digit. Only the words the corpus is expected to ever carry are listed; an unrecognized
 * leading word falls back gracefully (see `languageCount` below) rather than throwing or
 * guessing.
 */
const COUNT_WORD_TO_DIGIT: Readonly<Record<string, string>> = {
	one: '1',
	two: '2',
	three: '3',
	four: '4',
	five: '5',
	six: '6',
	seven: '7',
	eight: '8',
	nine: '9',
	ten: '10',
};

/**
 * SC-120 Batch A (design §3.2/§5): ported from `careerLanguageCount` (steel-etl
 * cards.go) — the model's `language` field is a sentence ("One language"/"Two
 * languages"); career's tile shows just the leading count. Strips a trailing
 * " language"/" languages" suffix (case-insensitive), the same site-ported step as
 * before.
 *
 * FIX ROUND 3 (owner ruling 18): the stripped leading word is then mapped to its NUMERAL
 * ("One" -> "1"), not left as the word — in the tile-value face, a capital "O" reads as a
 * digit zero ("0ne"), an ambiguity no other tile value has (21, +9, +1, — are all
 * numeric/dash already). A deliberate divergence from the site tile's count WORD (the
 * site is a reference, not gospel — §0(c) of the design doc). Falls back to the
 * suffix-stripped STRING unchanged when the leading word isn't a recognized count word
 * (site parity's own "never returns empty for a non-empty input" contract, preserved for
 * whatever unexpected text a future corpus entry might carry) — `statTiles()` itself owns
 * the ''->'—' dash fallback for a genuinely absent field, same division of labor as
 * `kitBonusValue`.
 */
export function languageCount(raw: string | undefined): string {
	const s = (raw ?? '').trim();
	if (!s) return '';
	const low = s.toLowerCase();
	let stripped = s;
	for (const suf of [' languages', ' language']) {
		if (low.endsWith(suf)) {
			stripped = s.slice(0, s.length - suf.length).trim();
			break;
		}
	}
	return COUNT_WORD_TO_DIGIT[stripped.toLowerCase()] ?? stripped;
}

// SC-120 Batch C — shared helpers for the ancestry/perk/condition/rule Steel compositions
// (§3.7-§3.10 of the round-1 design doc). `titleCase` (used by perk's
// `${titleCase(perk_group)} Perk` eyebrow — `perk_group` is 0/55 in the corpus today, so
// this is exercised only by unit tests until real data populates it) is imported from
// CardLayout.ts, shared with displayFamily.ts's rule eyebrow (round-3 review LOW-2).

/**
 * Batch C's steel bands render explicitly — `renderSteel()` (CardLayout.ts) never reads
 * `layout.body`/`useSourceBody` itself, that's a `renderBase()`-only mechanism — so each
 * composition below re-derives "whichever markdown will actually render as body" the same
 * way its OWN `body` field's value would under `useSourceBody: true` (every one of
 * ancestry/perk/condition declares that default): the resolved source body in hybrid mode,
 * else the layout's own inline content. Mirrors kit's own inline `bodyForDedup` ternary
 * (three properties up) generalized to the (no-ternary) common case.
 */
function resolvedBodyMd(bodyFromModel: string | undefined, source: RefSource | undefined): string | undefined {
	return source ? source.body : bodyFromModel;
}

/**
 * Hybrid mode's Signature Ability band renders the resolved source file's own trailing
 * body — the ONLY place a by-SCC kit's nested ```ds-feature fence lives (frontmatter has
 * no `signature_ability` key) — but the Equipment/Kit Bonuses information is now shown
 * STRUCTURALLY by their own bands above, so this strips the matching HEADED sections back
 * out of that body first (Design §6) rather than showing them twice. Everything else is
 * untouched: the flavor-duplicate lead paragraph (the flavor band's own dedup guard,
 * below, handles that independently) and, load-bearing, the ```ds-feature fence itself —
 * `renderMarkdown` recursing that fence into a real nested Signature Ability card in real
 * Obsidian is the whole point of keeping it (the `by-scc-kit--obsidian-recursion` ground-
 * truth shot proves this path).
 *
 * Corpus fact (verified against every real md-dse kit fixture in data-unified, Task 1/3
 * recon): "Kit Bonuses" never actually appears in a real compendium file's BODY — those
 * bonuses are frontmatter-only fields, never body prose — so in practice this only ever
 * strips "Equipment". The second heading is matched per the plan's Design §6 wording
 * (defensively, for a hand-authored vault note that might still carry it), not because
 * real pipeline-generated data needs it.
 */
function stripKitBodySections(md: string): string {
	const lines = md.split('\n');
	const kept: string[] = [];
	let skipping = false;
	for (const line of lines) {
		if (KIT_BODY_STRIP_HEADING_RE.test(line.trim())) {
			skipping = true;
			continue;
		}
		if (skipping) {
			if (/^#{1,6}\s/.test(line) || line.trimStart().startsWith('```')) {
				skipping = false;
			} else {
				continue;
			}
		}
		kept.push(line);
	}
	return kept
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

export const kitLayout: CardLayout<Kit> = {
	title: (m) => m.name,
	subtitle: (m) => m.kit_type,
	badges: (m) => [
		...(m.armor ?? []).map((a): Badge => ({ text: a, tone: 'keyword' })),
		...(m.weapon ?? []).map((w): Badge => ({ text: w, tone: 'keyword' })),
	],
	flavor: (m) => m.flavor,
	// All *_bonus rows (and Equipment) carry `markdown: true` — 72% of real kits link an
	// inline SCC term (e.g. "+N per [echelon](scc.v1:...)") inside a bonus string (Task 6
	// review Finding 2); the rest render identically whether markdown or plain, so there's
	// no downside to covering every row uniformly.
	rows: [
		{ label: 'Stamina', value: (m) => m.stamina_bonus, markdown: true },
		{ label: 'Speed', value: (m) => m.speed_bonus, markdown: true },
		{ label: 'Stability', value: (m) => m.stability_bonus, markdown: true },
		{ label: 'Melee damage', value: (m) => m.melee_damage_bonus, markdown: true },
		{ label: 'Ranged damage', value: (m) => m.ranged_damage_bonus, markdown: true },
		{ label: 'Melee distance', value: (m) => m.melee_distance_bonus, markdown: true },
		{ label: 'Ranged distance', value: (m) => m.ranged_distance_bonus, markdown: true },
		{ label: 'Disengage', value: (m) => m.disengage_bonus, markdown: true },
		{ label: 'Equipment', value: (m) => m.equipment_text, markdown: true },
	],
	// Signature ability renders as a real feature card (Task 6 review Finding 4) through
	// DisplayCardView's shared renderFeature/renderFeatureList grammar — not a markdown/
	// YAML fence round-trip (which never actually recurses in jest or the visual harness,
	// and was unverified in real Obsidian too).
	features: (m) => (m.signature_ability ? [m.signature_ability] : undefined),
	// Inline mode: `content` is the kit's full page markdown — rows/`features` above
	// already cover its stat-bonus lines and signature ability, so render it as the
	// trailing body ONLY when there's no signature ability to avoid a double render
	// (mirrors the pre-fix ternary's intent, minus the YAML-fence dump). By-SCC uses
	// the source body instead (Task 9, implemented in CardLayout.ts).
	body: (m) => (m.signature_ability ? undefined : m.content),
	useSourceBody: true,

	// Plan 24 / SC-100 Task 3 — the Steel composition: the site's head grammar (backpack
	// crest + kind eyebrow) + boxed Equipment band + the 2x4 dash-aware stat-tile grid +
	// the kept (richer) signature-ability sub-render. Mirrors `renderKitPlate`
	// (kit_page.go) point-for-point (Design section, plan 24).
	steel: {
		eyebrow: (m, source) => `${kitKindOf(m, source)} Kit`,
		crestIcon: () => 'backpack',
		bands: (m, source) => {
			const hybrid = source !== undefined;
			const bands: SteelBand[] = [];

			// Flavor — the SAME duplicate-text guard renderBase applies (D6 Task 7
			// review fix), using the SAME "whichever markdown will actually render as the
			// trailing body" selection: the resolved source body in hybrid mode, else the
			// inline fallback `m.content` (this file's OWN `body` field's ternary, two
			// properties up — mirrored inline here rather than self-referenced, since a
			// band closure can't reach back into the object literal it's still being
			// constructed inside). Suppressing a knowingly-empty band here (rather than
			// pushing one that renders nothing) keeps `renderSteel()`'s generic
			// `.dse-card__band` wrapper from ever leaving a stray empty div in the DOM.
			const bodyForDedup = hybrid ? source.body : m.signature_ability ? undefined : m.content;
			const normalizedBody = bodyForDedup && bodyForDedup.trim() ? normalizeForDuplicateCheck(bodyForDedup) : undefined;
			const flavor = m.flavor;
			const flavorDuplicatesBody = !!(flavor && normalizedBody?.startsWith(normalizeForDuplicateCheck(flavor)));
			if (flavor && !flavorDuplicatesBody) {
				bands.push({
					render: (container, renderMarkdown) =>
						renderMarkdown(flavor, container.createDiv({ cls: 'dse-card__flavor' })),
				});
			}

			// Equipment — boxed panel, always rendered (site parity: an nbsp reserves the
			// box when a kit has no equipment_text, matching kit_page.go/cards.go).
			bands.push({
				head: 'Equipment',
				render: async (container, renderMarkdown) => {
					const equipEl = container.createDiv({ cls: 'dse-kit__equip' });
					const equip = (m.equipment_text ?? '').trim();
					if (equip) await renderMarkdown(equip, equipEl);
					else equipEl.setText(' ');
				},
			});

			// Kit Bonuses — two fixed rows of 4 tiles (ported kitBonus() dash/qualifier
			// semantics; labels are the site's own hardcoded set, kit_page.go:120-126).
			bands.push({
				head: 'Kit Bonuses',
				render: (container) => {
					statTiles(container, [
						{ value: kitBonusValue(m.stamina_bonus), label: 'Stamina per Echelon' },
						{ value: kitBonusValue(m.speed_bonus), label: 'Speed' },
						{ value: kitBonusValue(m.stability_bonus), label: 'Stability' },
						{ value: kitBonusValue(m.disengage_bonus), label: 'Disengage' },
					]);
					statTiles(container, [
						{ value: kitBonusValue(m.melee_damage_bonus), label: 'Melee Dmg', accent: 'dmg' },
						{ value: kitBonusValue(m.ranged_damage_bonus), label: 'Ranged Dmg', accent: 'dmg' },
						{ value: kitBonusValue(m.melee_distance_bonus), label: 'Melee Dist' },
						{ value: kitBonusValue(m.ranged_distance_bonus), label: 'Ranged Dist' },
					]);
				},
			});

			// Signature Ability — kept plugin-is-richer sub-render (Design §5): inline
			// mode renders the REAL feature card via the shared renderFeatureList grammar
			// (same mechanism the base `features` slot uses); hybrid mode has no
			// `signature_ability` frontmatter field, so it renders the resolved source
			// body instead (Equipment/Kit Bonuses sections stripped, fence kept — see
			// stripKitBodySections above) so the nested ```ds-feature fence can recurse
			// into a real card via renderMarkdown, exactly as it always has.
			// SC-120 Batch C §8 (Scott's ledger comment 1) — the empty-band-head guard: the
			// hybrid-mode emptiness test is hoisted OUT of render() and INTO the push
			// condition below, so a hand-authored note whose stripped body carries no
			// signature-ability content never gets a "SIGNATURE ABILITY" band-head painted
			// over empty space (renderSteel(), CardLayout.ts, creates the band wrapper + head
			// BEFORE render() runs — too late for render() to un-create them). Mirrors the
			// flavor band's own suppress-rather-than-push-empty rule three properties up.
			// stripKitBodySections now runs ONCE (not once per branch, as the old render()
			// closure did) — hoisting removes a duplicate call rather than adding one.
			const hybridSig = hybrid ? stripKitBodySections(source.body) : undefined;
			if (hybrid ? !!hybridSig?.trim() : !!m.signature_ability) {
				bands.push({
					head: 'Signature Ability',
					render: (container, renderMarkdown, owner) => {
						if (hybrid) {
							return renderMarkdown(hybridSig!, container.createDiv({ cls: 'dse-card__body' }));
						}
						renderFeatureList(container, FeatureConfig.allFrom([m.signature_ability!]), owner, renderMarkdown);
						return undefined;
					},
				});
			}

			return bands;
		},
	},
};

export const conditionLayout: CardLayout<Condition> = {
	title: (m) => m.name,
	badges: () => [{ text: 'Condition', tone: 'type' }],
	body: (m) => m.content,
	useSourceBody: true,

	// SC-120 Batch C §3.9 — LIGHT (head-only) composition: `Condition` is the thinnest
	// model in the SDK ({name, scc, content}) — nothing to band beyond body. The legacy
	// `badges` type-pill above is superseded by the eyebrow and simply not read on this
	// branch (renderSteel() never calls `layout.badges`).
	steel: {
		eyebrow: () => 'Condition',
		crestIcon: () => 'zap',
		bands: (m, source) => {
			const bodyMd = resolvedBodyMd(m.content, source);
			if (!bodyMd || !bodyMd.trim()) return [];
			return [
				{
					render: (container, renderMarkdown) => renderMarkdown(bodyMd, container.createDiv({ cls: 'dse-card__body' })),
				},
			];
		},
	},
};

export const treasureLayout: CardLayout<Treasure> = {
	title: (m) => m.name,
	subtitle: (m) =>
		[m.treasure_type, m.level != null ? `Level ${m.level}` : undefined].filter(Boolean).join(' · ') || undefined,
	badges: (m) => [
		...(m.echelon ? [{ text: `Echelon ${m.echelon}`, tone: 'echelon' as const }] : []),
		...(m.rarity ? [{ text: m.rarity, tone: 'rarity' as const }] : []),
		...(m.keywords ?? []).map((k): Badge => ({ text: k, tone: 'keyword' })),
	],
	rows: [
		{ label: 'Prerequisite', value: (m) => m.item_prerequisite },
		{
			// SC-121 C-5: `markdown: true` is REQUIRED here, not decorative.
			// `project_roll_characteristic` carries inline SCC links straight out of the
			// compendium data (every real treasure with a project has them — e.g.
			// "[Reason](scc.v1:mcdm.heroes.v1/rule.character/reason) or [Intuition](…)"),
			// and without this flag renderBase() calls setText() on the joined value, so
			// the whole link — brackets, parens, URI — printed verbatim in the card. The
			// file header's old claim that "Treasure's non-linking rows (Prerequisite/
			// Project) are the control: real data confirms 0 links there" was wrong for
			// Project specifically; Prerequisite remains genuinely link-free.
			label: 'Project',
			markdown: true,
			value: (m) =>
				[
					m.project_source,
					m.project_roll_characteristic,
					m.project_goal != null ? String(m.project_goal) : undefined,
				]
					.filter(Boolean)
					.join(' · ') || undefined,
		},
		// By-SCC: the source body already carries the leveled effects prose — suppress
		// the flat single `effect` row so it isn't shown twice (§2.3 double-render guard).
		{ label: 'Effect', value: (m) => m.effect, markdown: true, omitWhenSource: true },
	],
	body: (m) => m.content,
	useSourceBody: true,
};

export const ancestryLayout: CardLayout<Ancestry> = {
	title: (m) => m.name,
	flavor: (m) => m.flavor,
	rows: [
		{
			label: 'Signature trait',
			value: (m) =>
				m.signature_trait_name && m.signature_trait_description
					? `**${m.signature_trait_name}.** ${m.signature_trait_description}`
					: m.signature_trait_name,
			markdown: true,
		},
		{ label: 'Ancestry points', value: (m) => (m.ancestry_points != null ? String(m.ancestry_points) : undefined) },
		{
			label: 'Purchased traits',
			value: (m) => (m.purchased_traits ?? []).map((t) => `${t.name} (${t.cost})`).join(', ') || undefined,
		},
	],
	body: (m) => m.content,
	useSourceBody: true,

	// SC-120 Batch C §3.7 — LIGHT composition: crest + eyebrow do the heavy lifting (SC-121
	// C-1's worst case: bare title, no chip/box at all). Bands: Signature Trait ABOVE
	// flavor (site tile order, cards.go:369-378), body kept whole (policy A — an ancestry's
	// content is pure lore with no labeled lines to strip).
	steel: {
		eyebrow: () => 'Ancestry',
		crestIcon: () => 'users',
		bands: (m, source) => {
			const bands: SteelBand[] = [];

			// Signature Trait — the SAME "**name.** description" composition the legacy row
			// uses (signature_trait_description is 0/12 in the corpus today, so this renders
			// the name alone until real data populates the description).
			const sigTrait =
				m.signature_trait_name && m.signature_trait_description
					? `**${m.signature_trait_name}.** ${m.signature_trait_description}`
					: m.signature_trait_name;
			if (sigTrait) {
				bands.push({
					head: 'Signature Trait',
					render: (container, renderMarkdown) =>
						renderMarkdown(sigTrait, container.createDiv({ cls: 'dse-card__body' })),
				});
			}

			// Flavor — the SAME duplicate-vs-body guard kit's flavor band uses (§5's shared
			// rationale): suppressing a knowingly-empty band keeps renderSteel()'s generic
			// wrapper from leaving a stray empty div.
			const bodyForDedup = resolvedBodyMd(m.content, source);
			const normalizedBody = bodyForDedup && bodyForDedup.trim() ? normalizeForDuplicateCheck(bodyForDedup) : undefined;
			const flavor = m.flavor;
			const flavorDuplicatesBody = !!(flavor && normalizedBody?.startsWith(normalizeForDuplicateCheck(flavor)));
			if (flavor && !flavorDuplicatesBody) {
				bands.push({
					render: (container, renderMarkdown) =>
						renderMarkdown(flavor, container.createDiv({ cls: 'dse-card__flavor' })),
				});
			}

			// Body — policy (A) keep whole: no labeled lines to strip.
			const bodyMd = resolvedBodyMd(m.content, source);
			if (bodyMd && bodyMd.trim()) {
				bands.push({
					render: (container, renderMarkdown) => renderMarkdown(bodyMd, container.createDiv({ cls: 'dse-card__body' })),
				});
			}

			return bands;
		},
	},
};

export const cultureLayout: CardLayout<Culture> = {
	title: (m) => m.name,
	subtitle: (m) => m.culture_benefit_type,
	flavor: (m) => m.flavor,
	rows: [
		{ label: 'Environment', value: (m) => m.environment },
		{ label: 'Organization', value: (m) => m.organization },
		{ label: 'Upbringing', value: (m) => m.upbringing },
		{ label: 'Language', value: (m) => m.language },
		// Skill fields — same authorial shape as Career.skills/Class.skills (a "One skill
		// from the [X group](scc.v1:...) (*Quick Build:* [Y](scc.v1:...))" sentence), which
		// DO carry inline links wherever populated; flagged prophylactically (§ file header).
		{ label: 'Quick-build skill', value: (m) => m.quick_build_skill, markdown: true },
		{ label: 'Skill options', value: (m) => (m.skill_options ?? []).join(', ') || undefined, markdown: true },
	],
	body: (m) => m.content,
	useSourceBody: true,
};

/**
 * SC-120 Batch A (design §5.2's minimal, per-family shape — the FULL
 * `stripLabeledLines(md, labels)` generalization over every family's labels is Batch B's
 * job, not this one's; this is deliberately the narrowest private helper that satisfies
 * career alone, shaped so Batch B can lift it out and widen it without a rewrite).
 *
 * Strips a bold-labeled line the career composition's bands now render structurally
 * (Skills / Languages / Project Points / Renown / Wealth / Perk) — real corpus labels are
 * markdown LINKS (`**[Renown](scc.v1:...):** +1`, `**[Project Points](...):** 240`), so the
 * match is on the bold run's LINK TEXT, not the raw line. Mitigation against
 * over-stripping (design §5.2's stated risk): a line only matches when (i) it begins at
 * column 0 with `**` (FIX ROUND, round-5 review LOW-2: the label test now runs against
 * the RAW line, not the trimmed one — an indented continuation line, e.g.
 * `    **Perk:** …` under a list item, no longer matches, since a real labeled line in
 * this corpus always starts a paragraph at the left margin), (ii) the bold run carries a
 * colon — either inside it (`**Skills:**`, every real corpus shape) or immediately after
 * it (`**Skills**:`, accepted defensively; FIX ROUND, round-5 review LOW-1: the colon is
 * now MANDATORY, not optional — `**Wealth** is a measure of…`, a bold-LED PROSE sentence
 * with no colon at all, no longer matches just because its first word equals a label),
 * whose plain text (link/emphasis stripped) case-insensitively equals one of `LABELS`,
 * and (iii) only that ONE line plus a single immediately-following blank line is
 * removed, never a following paragraph (the d6 Inciting Incident table and the "think
 * about the following questions" prose start their own paragraphs and are never
 * bold-led, so they can never match this pattern).
 *
 * `Project Points` is NOT in the design doc's own label list (§3.2 names only Skills/
 * Languages/Renown/Wealth/Perk) — added here as a deliberate deviation: `project_points` IS
 * one of the composition's own 4 tile slots (the "Career Benefits" band above), and the
 * real corpus (`v2/docs/Browse/career/artisan.md`) carries a `**[Project
 * Points](...):** 240` body line the tile now duplicates exactly like the double-render
 * defect this effort's own ticket named for treasure — omitting it here would reintroduce
 * that defect for careers with project points. Owner ruling 15 accepted this deviation.
 *
 * FIX ROUND (round-5 review MED-1 / owner ruling 16): every real career's body also
 * carries a fixed lead-in sentence right above the labeled lines —
 * "You gain the following career benefits:" (verified: all 18 Browse careers carry this
 * exact string) — which policy (B) left orphaned once its labeled lines were gone,
 * directly above the d6 table. The composition's own `Career Benefits` band head is its
 * structural replacement, so it is stripped the same way (whole-line, normalized-text
 * match, one swallowed trailing blank).
 */
const CAREER_BODY_LABELS = ['Skills', 'Languages', 'Renown', 'Wealth', 'Perk', 'Project Points'];
/** FIX ROUND (round-5 review MED-1): exact normalized-text lines stripped alongside the
 *  bold labels above — not bold-led, so they need their own whole-line match rather than
 *  `CAREER_LABEL_LINE_RE`. */
const CAREER_LEAD_IN_LINES = new Set(['you gain the following career benefits:']);
/**
 * FIX ROUND (round-5 review LOW-1/LOW-2): two plain capture alternatives (named groups
 * are ES2018+; this repo's tsc `target` is ES6, CLAUDE.md's "Target ES2018" describes the
 * esbuild OUTPUT, not tsc's own type-check target) — group 1 matches the colon INSIDE the
 * bold run (`**Skills:**`, every real corpus shape); group 2 matches it immediately after
 * the closing `**` (`**Skills**:`, not currently produced by any real career, accepted
 * defensively per design §5.2's own "inside or outside" mitigation wording). Anchored at
 * the start of the STRING (not `trimmed`) by the caller now passing the raw line — see
 * LOW-2 above.
 */
const CAREER_LABEL_LINE_RE = /^\*\*(.+?):\*\*|^\*\*(.+?)\*\*:/;

function stripCareerBodyLabels(md: string): string {
	const wanted = new Set(CAREER_BODY_LABELS.map((l) => l.toLowerCase()));
	const lines = md.split('\n');
	const kept: string[] = [];
	let skipBlankAfter = false;
	for (const line of lines) {
		if (skipBlankAfter) {
			skipBlankAfter = false;
			if (line.trim() === '') continue; // swallow ONE blank line right after a stripped line
		}
		// LOW-2: matched against the RAW line — an indented continuation line's `**` does
		// not sit at column 0, so `^\*\*` correctly fails to match it.
		const m = CAREER_LABEL_LINE_RE.exec(line);
		const captured = m?.[1] ?? m?.[2];
		if (captured !== undefined && wanted.has(normalizeForDuplicateCheck(captured))) {
			skipBlankAfter = true;
			continue;
		}
		if (CAREER_LEAD_IN_LINES.has(normalizeForDuplicateCheck(line))) {
			skipBlankAfter = true;
			continue;
		}
		kept.push(line);
	}
	return kept
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

export const careerLayout: CardLayout<Career> = {
	title: (m) => m.name,
	flavor: (m) => m.flavor,
	badges: (m) => [
		...(m.renown != null ? [{ text: `Renown ${m.renown}`, tone: 'type' as const }] : []),
		...(m.wealth ? [{ text: `Wealth ${m.wealth}`, tone: 'type' as const }] : []),
	],
	rows: [
		// Real data: 18/17 careers link an inline skill-group/quick-build term inside
		// `skills` (e.g. politician's "[interpersonal skill group](scc.v1:...)").
		{
			label: 'Skills',
			value: (m) => [(m.skills ?? []).join(', '), m.skill_group].filter(Boolean).join('; ') || undefined,
			markdown: true,
		},
		{ label: 'Language', value: (m) => m.language },
		{ label: 'Project points', value: (m) => (m.project_points != null ? String(m.project_points) : undefined) },
		// Real data: 14/17 careers link a Quick Build perk name inside `perk`.
		{
			label: 'Perk',
			value: (m) => [m.perk, m.perk_group].filter(Boolean).join(' · ') || undefined,
			markdown: true,
		},
		{
			label: 'Inciting incidents',
			value: (m) => (m.inciting_incidents ?? []).map((i) => `${i.roll}: ${i.name ?? i.description}`).join('; ') || undefined,
			markdown: true,
			omitWhenSource: true,
		},
	],
	body: (m) => m.content,
	useSourceBody: true,

	// SC-120 Batch A §3.2 — FULL composition: a dash-filled 4-up "Career Benefits" tile row
	// (statTiles()'s exact fixed-slot-dash grammar) plus Skills/Perk markdown bands, ported
	// from the site's `careerCard` (cards.go:382-414). Body policy (B): strip the
	// bold-labeled lines the composition now renders structurally, matching on the
	// LABEL'S LINK TEXT (every real career links Renown/Wealth/Project Points to a rule
	// page, e.g. `**[Renown](scc.v1:...):** +1` — see `stripCareerBodyLabels` below).
	steel: {
		eyebrow: () => 'Career',
		crestIcon: () => 'briefcase',
		bands: (m, source) => {
			const bands: SteelBand[] = [];

			// Flavor — the same duplicate-vs-body guard every other composition's flavor
			// band uses (kit/ancestry/perk): suppress a knowingly-empty band rather than
			// push one that renders nothing.
			const bodyForDedup = resolvedBodyMd(m.content, source);
			const normalizedBody = bodyForDedup && bodyForDedup.trim() ? normalizeForDuplicateCheck(bodyForDedup) : undefined;
			const flavor = m.flavor;
			const flavorDuplicatesBody = !!(flavor && normalizedBody?.startsWith(normalizeForDuplicateCheck(flavor)));
			if (flavor && !flavorDuplicatesBody) {
				bands.push({
					render: (container, renderMarkdown) =>
						renderMarkdown(flavor, container.createDiv({ cls: 'dse-card__flavor' })),
				});
			}

			// Career Benefits — 4 fixed dash-filled tiles (cards.go:400-405). `languageCount`
			// reduces `language`'s sentence shape ("One language") to its count word;
			// `statTiles()` itself dash-fills '' -> '—' for project_points/renown/wealth,
			// which are sparse-but-live in the corpus (§1.3 of the design doc).
			bands.push({
				head: 'Career Benefits',
				render: (container) => {
					statTiles(container, [
						{ value: languageCount(m.language), label: 'Languages' },
						{ value: m.project_points != null ? String(m.project_points) : '', label: 'Project Pts' },
						{ value: m.renown != null ? String(m.renown) : '', label: 'Renown' },
						{ value: m.wealth ?? '', label: 'Wealth' },
					]);
				},
			});

			// Skills / Perk — the SAME markdown expressions the legacy rows above use, now
			// structural bands instead of a label/value grid row.
			const skillsText = [(m.skills ?? []).join(', '), m.skill_group].filter(Boolean).join('; ') || undefined;
			if (skillsText) {
				bands.push({
					head: 'Skills',
					render: (container, renderMarkdown) => renderMarkdown(skillsText, container.createDiv({ cls: 'dse-card__body' })),
				});
			}
			const perkText = [m.perk, m.perk_group].filter(Boolean).join(' · ') || undefined;
			if (perkText) {
				bands.push({
					head: 'Perk',
					render: (container, renderMarkdown) => renderMarkdown(perkText, container.createDiv({ cls: 'dse-card__body' })),
				});
			}

			// Body — policy (B): strip the bold-labeled lines the bands above now own.
			const bodyMd = resolvedBodyMd(m.content, source);
			if (bodyMd && bodyMd.trim()) {
				const stripped = stripCareerBodyLabels(bodyMd);
				if (stripped.trim()) {
					bands.push({
						render: (container, renderMarkdown) => renderMarkdown(stripped, container.createDiv({ cls: 'dse-card__body' })),
					});
				}
			}

			return bands;
		},
	},
};

export const classLayout: CardLayout<Class> = {
	title: (m) => m.name,
	subtitle: (m) => m.heroic_resource,
	flavor: (m) => m.flavor,
	badges: (m) => (m.primary_characteristics ?? []).map((c): Badge => ({ text: c, tone: 'keyword' })),
	rows: [
		{ label: 'Starting stamina', value: (m) => (m.starting_stamina != null ? String(m.starting_stamina) : undefined) },
		{ label: 'Stamina / level', value: (m) => (m.stamina_per_level != null ? String(m.stamina_per_level) : undefined) },
		{ label: 'Recoveries', value: (m) => (m.recoveries != null ? String(m.recoveries) : undefined) },
		// Real data: every class's potency fields are "[Characteristic](scc.v1:...) ± N".
		{
			label: 'Potencies',
			value: (m) => [m.weak_potency, m.average_potency, m.strong_potency].filter(Boolean).join(' / ') || undefined,
			markdown: true,
		},
		// Real data: `skills` is a single prose sentence that almost always links a skill
		// or skill-group term (same pattern as Career.skills).
		{
			label: 'Skills',
			value: (m) => [(m.skills ?? []).join(', '), m.skill_group].filter(Boolean).join('; ') || undefined,
			markdown: true,
		},
	],
	body: (m) => m.content,
	useSourceBody: true,

	// SC-120 Batch A §3.1 — FULL composition, the ticket's own headline example: ports the
	// site's ONE bespoke page composition, `.sc-classhead` (class_page.go:48-83). No
	// `subtitle`/`badges` here — `renderSteel()` never reads them; the right rail
	// (rightPrimary/rightDeck) carries the primary characteristics instead, matching the
	// site's `hMini`/`hLine` pair (class_page.go:68-70).
	steel: {
		eyebrow: () => 'Class',
		crestIcon: () => 'shield',
		// Site parity (class_page.go:67-70): rightPrimary/rightDeck are a PAIR — both
		// present or both absent, gated on the same non-empty `primary_characteristics`
		// check (beastheart classes carry none).
		rightPrimary: (m) => (m.primary_characteristics ?? []).join(' · ') || undefined,
		rightDeck: (m) => ((m.primary_characteristics ?? []).length ? 'primary characteristics' : undefined),
		bands: (m, source) => {
			const bands: SteelBand[] = [];

			// Flavor — the same duplicate-vs-body guard every other composition uses.
			const bodyForDedup = resolvedBodyMd(m.content, source);
			const normalizedBody = bodyForDedup && bodyForDedup.trim() ? normalizeForDuplicateCheck(bodyForDedup) : undefined;
			const flavor = m.flavor;
			const flavorDuplicatesBody = !!(flavor && normalizedBody?.startsWith(normalizeForDuplicateCheck(flavor)));
			if (flavor && !flavorDuplicatesBody) {
				bands.push({
					render: (container, renderMarkdown) =>
						renderMarkdown(flavor, container.createDiv({ cls: 'dse-card__flavor' })),
				});
			}

			// Basics — 3 fixed dash-filled tiles (class_page.go:151-166). The site OMITS an
			// absent cell (beastheart classes carry none of these fields); the plugin
			// dash-fills all three (SC-100 ruling 2 — a fixed grid reading uniformly is
			// itself information), a deliberate divergence the design doc calls out (§3.1).
			bands.push({
				head: 'Basics',
				render: (container) => {
					statTiles(container, [
						{ value: m.starting_stamina != null ? String(m.starting_stamina) : '', label: 'Starting stamina' },
						{ value: m.stamina_per_level != null ? `+${m.stamina_per_level}` : '', label: 'Stamina per level' },
						{ value: m.recoveries != null ? String(m.recoveries) : '', label: 'Recoveries' },
					]);
				},
			});

			// Potency — 3 fixed dash-filled tiles (class_page.go:170-185). `plainText()` is
			// REQUIRED here: every real potency value is
			// "[Characteristic](scc.v1:...) ± N" and statTiles() writes with setText (no
			// markdown rendering) — the site strips the link the same way (rendered value
			// reads "Reason − 2").
			bands.push({
				head: 'Potency',
				render: (container) => {
					statTiles(container, [
						{ value: m.weak_potency ? plainText(m.weak_potency) : '', label: 'Weak potency' },
						{ value: m.average_potency ? plainText(m.average_potency) : '', label: 'Average potency' },
						{ value: m.strong_potency ? plainText(m.strong_potency) : '', label: 'Strong potency' },
					]);
				},
			});

			// Skills — the same markdown expression the legacy row above uses.
			const skillsText = [(m.skills ?? []).join(', '), m.skill_group].filter(Boolean).join('; ') || undefined;
			if (skillsText) {
				bands.push({
					head: 'Skills',
					render: (container, renderMarkdown) => renderMarkdown(skillsText, container.createDiv({ cls: 'dse-card__body' })),
				});
			}

			// Body — policy (A) keep whole (design §3.1): the site's own class page repeats
			// every Basics value below the head too (site parity), and the
			// `### Tactician Advancement Table` further down is a real asset the
			// composition must not eat. No labeled-line stripping here.
			const bodyMd = resolvedBodyMd(m.content, source);
			if (bodyMd && bodyMd.trim()) {
				bands.push({
					render: (container, renderMarkdown) => renderMarkdown(bodyMd, container.createDiv({ cls: 'dse-card__body' })),
				});
			}

			return bands;
		},
	},
};

export const titleLayout: CardLayout<Title> = {
	title: (m) => m.name,
	flavor: (m) => m.flavor,
	badges: (m) => (m.echelon ? [{ text: `Echelon ${m.echelon}`, tone: 'echelon' as const }] : []),
	rows: [
		// Real data: 32/65 titles link an ancestry/rule term inside `prerequisite`.
		{ label: 'Prerequisite', value: (m) => m.prerequisite, markdown: true },
		{ label: 'Effect', value: (m) => m.effect, markdown: true, omitWhenSource: true },
		{ label: 'Benefits', value: (m) => (m.benefits ?? []).join('; ') || undefined, markdown: true },
	],
	body: (m) => m.content,
	useSourceBody: true,
};

export const perkLayout: CardLayout<Perk> = {
	title: (m) => m.name,
	subtitle: (m) => m.perk_group,
	flavor: (m) => m.flavor,
	rows: [{ label: 'Prerequisites', value: (m) => m.prerequisites, markdown: true }],
	body: (m) => m.content,
	useSourceBody: true,

	// SC-120 Batch C §3.8 — LIGHT (head-only) composition: both structured fields
	// (perk_group/prerequisites) are 0/55 in the corpus — head + body is the honest
	// ceiling. The Prerequisites band is declared prophylactically (same "kept as spec'd"
	// pattern the file header already applies to dead fields) — inert today, gated on
	// non-empty so a future populated corpus renders it with no further code change.
	steel: {
		eyebrow: (m) => (m.perk_group ? `${titleCase(m.perk_group)} Perk` : 'Perk'),
		crestIcon: () => 'gem',
		bands: (m, source) => {
			const bands: SteelBand[] = [];

			// Flavor — the SAME duplicate-vs-body guard kit's flavor band uses; in practice
			// suppressed against the body, since perk flavor is the body's lead sentence.
			const bodyForDedup = resolvedBodyMd(m.content, source);
			const normalizedBody = bodyForDedup && bodyForDedup.trim() ? normalizeForDuplicateCheck(bodyForDedup) : undefined;
			const flavor = m.flavor;
			const flavorDuplicatesBody = !!(flavor && normalizedBody?.startsWith(normalizeForDuplicateCheck(flavor)));
			if (flavor && !flavorDuplicatesBody) {
				bands.push({
					render: (container, renderMarkdown) =>
						renderMarkdown(flavor, container.createDiv({ cls: 'dse-card__flavor' })),
				});
			}

			// Prerequisites — gated on non-empty (0/55 today, so inert) AND the same
			// duplicate-vs-body guard renderBase()'s row uses (round-3 review LOW-1 / owner
			// ruling 11): a future populated corpus may lead the body with the exact labeled
			// sentence this band already renders structurally (the shape §5.2 documents for
			// every other family's labeled band) — suppress the structural band rather than
			// double-render it.
			if (m.prerequisites) {
				const normalizedValue = normalizeForDuplicateCheck(m.prerequisites);
				const duplicatesBody =
					normalizedValue.length >= DUPLICATE_ROW_MIN_LENGTH && !!normalizedBody?.includes(normalizedValue);
				if (!duplicatesBody) {
					bands.push({
						head: 'Prerequisites',
						render: (container, renderMarkdown) =>
							renderMarkdown(m.prerequisites!, container.createDiv({ cls: 'dse-card__body' })),
					});
				}
			}

			// Body — policy (C): the body is the card.
			const bodyMd = resolvedBodyMd(m.content, source);
			if (bodyMd && bodyMd.trim()) {
				bands.push({
					render: (container, renderMarkdown) => renderMarkdown(bodyMd, container.createDiv({ cls: 'dse-card__body' })),
				});
			}

			return bands;
		},
	},
};

export const complicationLayout: CardLayout<Complication> = {
	title: (m) => m.name,
	flavor: (m) => m.flavor,
	rows: [
		{ label: 'Benefit', value: (m) => m.benefit, markdown: true, omitWhenSource: true },
		{ label: 'Drawback', value: (m) => m.drawback, markdown: true, omitWhenSource: true },
	],
	body: (m) => m.content,
	useSourceBody: true,
};
