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
import { normalizeForDuplicateCheck } from '@/elements/shared/CardLayout';
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

			// Flavor — the SAME duplicate-text guard renderLegacy applies (D6 Task 7
			// review fix), using the SAME "whichever markdown will actually render as the
			// trailing body" selection: the resolved source body in hybrid mode, else the
			// inline fallback `m.content` (this file's OWN `body` field's ternary, two
			// properties up — mirrored inline here rather than self-referenced, since a
			// band closure can't reach back into the object literal it's still being
			// constructed inside). Suppressing a knowingly-empty band here (rather than
			// pushing one that renders nothing) keeps `renderSteel()`'s generic
			// `.dse-card__band` wrapper from ever leaving a stray empty div in the DOM.
			const bodyForDedup = hybrid ? source!.body : m.signature_ability ? undefined : m.content;
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
			// (same mechanism the legacy `features` slot uses); hybrid mode has no
			// `signature_ability` frontmatter field, so it renders the resolved source
			// body instead (Equipment/Kit Bonuses sections stripped, fence kept — see
			// stripKitBodySections above) so the nested ```ds-feature fence can recurse
			// into a real card via renderMarkdown, exactly as it always has.
			if (hybrid || m.signature_ability) {
				bands.push({
					head: 'Signature Ability',
					render: (container, renderMarkdown, owner) => {
						if (hybrid) {
							const stripped = stripKitBodySections(source!.body);
							if (!stripped.trim()) return undefined;
							return renderMarkdown(stripped, container.createDiv({ cls: 'dse-card__body' }));
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
			// and without this flag renderLegacy() calls setText() on the joined value, so
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
