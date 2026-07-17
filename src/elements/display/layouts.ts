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
// non-linking rows (Prerequisite/Project) are the control: real data confirms 0 links there,
// so they correctly stay plain. (2) Several spec fields are simply DEAD in the current
// corpus — Ancestry.{signature_trait_description,ancestry_points,purchased_traits} (0/12),
// Career.inciting_incidents (0/17), Class.heroic_resource (0/13), Title.benefits (0/66),
// Perk.{perk_group,prerequisites} (0/55), and every Culture row field (0/13) — kept as
// spec'd (future authoring may populate them) but they render as omitted rows against every
// fixture in the corpus today; not a bug.
import type { Ancestry, Culture, Career, Class, Title, Perk, Complication } from 'steel-compendium-sdk';
import type { Kit, Condition, Treasure } from 'steel-compendium-sdk';
import type { Badge, CardLayout } from '@/elements/shared/CardLayout';

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
	// the source body instead (Task 9 — currently a deliberate no-op per CardLayout.ts).
	body: (m) => (m.signature_ability ? undefined : m.content),
	useSourceBody: true,
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
			label: 'Project',
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
