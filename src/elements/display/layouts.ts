// src/elements/display/layouts.ts — D6 Task 6 (spec §2): CardLayout<M> declarations for
// the first three display-family elements (kit/condition/treasure), driving Task 5's
// shared DisplayCardView frame. Field names/optionality verified against the LANDED SDK
// models (data-sdk-npm/src/model/{Kit,Condition,Treasure}.ts): every `*_bonus` field and
// Treasure.level are strings, not numbers.
import { stringifyYaml } from 'obsidian';
import type { Kit, Condition, Treasure, Feature } from 'steel-compendium-sdk';
import type { Badge, CardLayout } from '@/elements/shared/CardLayout';

/**
 * Kit's inline-mode trailing body: re-serializes the typed `signature_ability` Feature
 * model back into a `ds-feature` fenced block so it recurses through the real Obsidian
 * markdown pipeline (registered code-block processors) when rendered via
 * `this.renderMarkdown`. A nice-to-have for the inline/preview path only — the primary
 * by-SCC hybrid path renders the source file's OWN nested block instead (CardLayout.ts's
 * TODO(Task 9)). No dedicated Feature -> YAML serializer exists yet (FeatureConfig's
 * `toYaml` is commented out), so this goes straight through the SDK's own `toDTO()` +
 * Obsidian's `stringifyYaml` — the simplest correct path (task-6-brief.md).
 *
 * Note for test/harness environments: neither the jest `obsidian` mock's MarkdownRenderer
 * (appends raw markdown as a text node) nor the visual-harness browser shim's (plain
 * `marked.parse`, no code-block-processor recursion) actually re-renders this nested
 * fence as a live card — both degrade harmlessly (literal text / a `<pre><code>` block),
 * never an error. Only real Obsidian recurses it through the pipeline.
 */
function featureToYaml(feature: Feature): string {
	return stringifyYaml(feature.toDTO());
}

export const kitLayout: CardLayout<Kit> = {
	title: (m) => m.name,
	subtitle: (m) => m.kit_type,
	badges: (m) => [
		...(m.armor ?? []).map((a): Badge => ({ text: a, tone: 'keyword' })),
		...(m.weapon ?? []).map((w): Badge => ({ text: w, tone: 'keyword' })),
	],
	flavor: (m) => m.flavor,
	rows: [
		{ label: 'Stamina', value: (m) => m.stamina_bonus },
		{ label: 'Speed', value: (m) => m.speed_bonus },
		{ label: 'Stability', value: (m) => m.stability_bonus },
		{ label: 'Melee damage', value: (m) => m.melee_damage_bonus },
		{ label: 'Ranged damage', value: (m) => m.ranged_damage_bonus },
		{ label: 'Melee distance', value: (m) => m.melee_distance_bonus },
		{ label: 'Ranged distance', value: (m) => m.ranged_distance_bonus },
		{ label: 'Disengage', value: (m) => m.disengage_bonus },
		{ label: 'Equipment', value: (m) => m.equipment_text, markdown: true },
	],
	// Inline mode: render the signature ability from the model; by-SCC uses the source
	// body (Task 9 — currently a deliberate no-op per CardLayout.ts).
	body: (m) => (m.signature_ability ? '```ds-feature\n' + featureToYaml(m.signature_ability) + '\n```' : m.content),
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
