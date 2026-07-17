// src/elements/display/layouts.ts — D6 Task 6 (spec §2): CardLayout<M> declarations for
// the first three display-family elements (kit/condition/treasure), driving Task 5's
// shared DisplayCardView frame. Field names/optionality verified against the LANDED SDK
// models (data-sdk-npm/src/model/{Kit,Condition,Treasure}.ts): every `*_bonus` field and
// Treasure.level are strings, not numbers.
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
