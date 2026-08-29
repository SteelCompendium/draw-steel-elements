// test/unit/elements/cardLayoutHelpers.test.ts — SC-120 Batch A (design §5.1): direct unit
// coverage for the shared helpers extracted this batch. `stripInlineMarkdown`/`plainText`
// live in CardLayout.ts (shared with `normalizeForDuplicateCheck`, "one regex pair, not two
// that can drift" — design §5.1); `languageCount` lives in layouts.ts (design §3.2, next to
// `kitBonusValue`).
//
// SC-120 Batch B (design §5.2) adds `stripLabeledLines` (CardLayout.ts, shared by career/
// treasure/title/complication/culture) and `bodyLabeledLine` (layouts.ts, culture's
// Skill Options fallback) coverage below, verified against BOTH the harness fixtures'
// shape and VERBATIM real corpus body text (`v2/docs/Browse/**` in this worktree, copied
// exactly — not paraphrased) per the batch brief.
import { stripInlineMarkdown, plainText, normalizeForDuplicateCheck, stripLabeledLines } from '@/elements/shared/CardLayout';
import { languageCount, bodyLabeledLine } from '@/elements/display/layouts';

describe('SC-120 Batch A: stripInlineMarkdown / plainText (CardLayout.ts)', () => {
	test('strips a markdown link to its link text', () => {
		expect(stripInlineMarkdown('[Reason](scc.v1:mcdm.heroes.v1/rule.character/reason)')).toBe('Reason');
	});

	test('strips emphasis/code markers', () => {
		expect(stripInlineMarkdown('*Quick Build:* `Lead`')).toBe('Quick Build: Lead');
	});

	test('plainText: real class potency value — link stripped, case and spacing preserved', () => {
		const raw = '[Reason](scc.v1:mcdm.heroes.v1/rule.character/reason) − 2';
		expect(plainText(raw)).toBe('Reason − 2');
	});

	test('plainText: preserves case (does NOT lowercase, unlike normalizeForDuplicateCheck)', () => {
		expect(plainText('[Reason](scc.v1:...)')).toBe('Reason');
		expect(normalizeForDuplicateCheck('[Reason](scc.v1:...)')).toBe('reason');
	});

	test('plainText: trims edge whitespace left behind by link removal', () => {
		expect(plainText('  [Reason](scc.v1:...)  ')).toBe('Reason');
	});

	test('normalizeForDuplicateCheck: unaffected by the stripInlineMarkdown extraction (regression)', () => {
		expect(normalizeForDuplicateCheck('  **[Renown](scc.v1:...):**  +1  ')).toBe('renown: +1');
	});
});

describe('SC-120 Batch A: languageCount (layouts.ts, design §3.2 — ports careerLanguageCount)', () => {
	test('strips a trailing " language" suffix, then emits the NUMERAL (owner ruling 18 — the tile-value face renders a capital "O" as a digit zero)', () => {
		expect(languageCount('One language')).toBe('1');
	});

	test('strips a trailing " languages" suffix (plural), then emits the numeral', () => {
		expect(languageCount('Two languages')).toBe('2');
	});

	test('is case-insensitive on both the suffix and the count word', () => {
		expect(languageCount('Three LANGUAGES')).toBe('3');
		expect(languageCount('four languages')).toBe('4');
	});

	test('covers every count word one..ten', () => {
		const cases: [string, string][] = [
			['One language', '1'],
			['Two languages', '2'],
			['Three languages', '3'],
			['Four languages', '4'],
			['Five languages', '5'],
			['Six languages', '6'],
			['Seven languages', '7'],
			['Eight languages', '8'],
			['Nine languages', '9'],
			['Ten languages', '10'],
		];
		for (const [input, expected] of cases) expect(languageCount(input)).toBe(expected);
	});

	test('falls back to the suffix-stripped STRING when the leading word is not a recognized count word (owner ruling 18\'s stated fallback)', () => {
		expect(languageCount('A couple languages')).toBe('A couple');
	});

	test('falls back to the whole string when there is no recognized suffix AND no recognized count word (site parity: never empties a non-empty input)', () => {
		expect(languageCount('None')).toBe('None');
	});

	test('undefined/empty input -> "" (statTiles() owns the dash fallback for a genuinely absent field)', () => {
		expect(languageCount(undefined)).toBe('');
		expect(languageCount('')).toBe('');
		expect(languageCount('   ')).toBe('');
	});
});

describe('SC-120 Batch B: stripLabeledLines (CardLayout.ts, design §5.2)', () => {
	test('strips a plain bold-labeled line (no link) and the label list is case-insensitive', () => {
		const md = '**Benefit:** You gain a thing.\n\n**Drawback:** You lose a thing.';
		expect(stripLabeledLines(md, ['benefit', 'DRAWBACK'])).toBe('');
	});

	test('matches on the bold run\'s LINK TEXT, not the raw line — a single link inside the bold run', () => {
		const md = '**[Item Prerequisite](scc.v1:mcdm.heroes.v1/rule.downtime/item-prerequisite):** A pint of blue ichor.';
		expect(stripLabeledLines(md, ['Item Prerequisite'])).toBe('');
	});

	test('matches a bold run spanning TWO adjacent links, whose stripped text joins with one space', () => {
		const md =
			'**[Project Roll](scc.v1:...) [Characteristic](scc.v1:...):** [Reason](scc.v1:...) or [Intuition](scc.v1:...)';
		expect(stripLabeledLines(md, ['Project Roll Characteristic'])).toBe('');
	});

	test('the colon is MANDATORY — a bold-led PROSE sentence with no colon at all survives (Batch A round-5 review LOW-1, inherited)', () => {
		const md = "**Wealth** is a measure of your character's buying power.";
		expect(stripLabeledLines(md, ['Wealth'])).toBe(md);
	});

	test('an indented continuation line under a list item is NOT stripped (Batch A round-5 review LOW-2, inherited) — the match runs against the RAW line, not the trimmed one', () => {
		const md = '- An item\n    **Perk:** One perk described inline under the bullet.';
		expect(stripLabeledLines(md, ['Perk'])).toBe(md);
	});

	test('strips the ONE labeled line plus a single following blank line, never a following paragraph', () => {
		const md = '**Effect:** A short effect.\n\nAdditionally, something else happens that must survive.';
		expect(stripLabeledLines(md, ['Effect'])).toBe('Additionally, something else happens that must survive.');
	});

	test('a table immediately after a labeled line survives untouched (it never itself starts with a matching bold label)', () => {
		const md = '**Effect:** Choose one:\n\n| d6 | Option |\n|----|----|\n| 1 | Thing |';
		expect(stripLabeledLines(md, ['Effect'])).toBe('| d6 | Option |\n|----|----|\n| 1 | Thing |');
	});

	test('an unmatched label leaves the body untouched', () => {
		const md = 'Just prose, no labels at all.';
		expect(stripLabeledLines(md, ['Effect', 'Benefit'])).toBe(md);
	});

	// Verified against REAL corpus body text, copied verbatim from this worktree's
	// v2/docs/Browse/** (per the batch brief) — not paraphrased, not a hand-rolled
	// approximation of the shape.
	describe('against real corpus bodies (v2/docs/Browse/**, verbatim)', () => {
		test('treasure/3rd-echelon/trinket/bracers-of-strife.md: every labeled line is stripped, the flavor and the trailing rider-in-the-same-sentence survive', () => {
			const body = [
				'*Each of these metallic blue bracers is oversized.*',
				'',
				'**Keywords:** Arms, Magic',
				'',
				'**[Item Prerequisite](../../../rule/downtime/item-prerequisite.md):** The severed hand of a giant',
				'',
				'**[Project Source](../../../rule/downtime/project-source.md):** Texts or lore in Yllyric',
				'',
				'**[Project Roll](../../../rule/downtime/project-roll.md) [Characteristic](../../../rule/character/characteristic.md):** [Reason](../../../rule/character/reason.md) or [Intuition](../../../rule/character/intuition.md)',
				'',
				'**Project Goal:** 450',
				'',
				'**Effect:** While you wear them in combat, these bracers magically double the size of your hands and any [melee](../../../rule/combat/melee.md) weapons you wield, automatically compensating for the extra weight. You gain a +2 damage bonus for any weapon ability that deals rolled damage, and a +1 bonus to the distance you push any target with any weapon ability. This damage bonus adds to the damage bonus granted by other treasures.',
			].join('\n');
			const labels = ['Keywords', 'Item Prerequisite', 'Project Source', 'Project Roll Characteristic', 'Project Goal', 'Effect'];
			const stripped = stripLabeledLines(body, labels);
			expect(stripped).toBe('*Each of these metallic blue bracers is oversized.*');
		});

		test('treasure/leveled/armor/grand-scarab.md: the 1st/5th/9th Level tier lines strip, each rider paragraph (its own "Additionally, ..." sentence lives IN the same line here, so it stays with the band content, not the body)', () => {
			const body = [
				'*The blue-purple carapace and wings of a gigantic scarab beetle have been formed into an ornate breastplate.*',
				'',
				'**Keywords:** Magic, Medium Armor',
				'',
				'**[Item Prerequisite](../../../rule/downtime/item-prerequisite.md):** A giant scarab beetle carapace',
				'',
				'**[Project Source](../../../rule/downtime/project-source.md):** Texts or lore in Phaedran',
				'',
				'**[Project Roll](../../../rule/downtime/project-roll.md) [Characteristic](../../../rule/character/characteristic.md):** [Might](../../../rule/character/might.md), [Reason](../../../rule/character/reason.md), or [Intuition](../../../rule/character/intuition.md)',
				'',
				'**Project Goal:** 450',
				'',
				"**1st Level:** While you wear this armor, you gain a +6 bonus to Stamina and you can fly. If you don't end your turn on the ground, you fall.",
				'',
				"**5th Level:** The armor's bonus to Stamina increases to +12. Additionally, you no longer need to end your turn on the ground to avoid falling.",
				'',
				"**9th Level:** The armor's bonus to Stamina increases to +21. Additionally, if you fly any distance before making a strike, that strike gains an edge.",
			].join('\n');
			const labels = [
				'Keywords',
				'Item Prerequisite',
				'Project Source',
				'Project Roll Characteristic',
				'Project Goal',
				'1st Level',
				'5th Level',
				'9th Level',
			];
			const stripped = stripLabeledLines(body, labels);
			expect(stripped).toBe(
				'*The blue-purple carapace and wings of a gigantic scarab beetle have been formed into an ornate breastplate.*',
			);
		});

		test('title/marshal.md: Echelon/Prerequisite/Effect strip, the bullet-list benefits (a separate paragraph after Effect) survive', () => {
			const body = [
				"*I said you had twenty-four hours to leave town. That was... what, about twenty-four hours ago?*",
				'',
				'**Echelon:** 1st',
				'',
				'**Prerequisite:** You join an organization that hunts criminals.',
				'',
				'**Effect:** Choose one of the following benefits:',
				'',
				'- *Guess It\'s the Hard Way Then:* When combat begins, you halve the first damage you take.',
				'- *Heedless Pursuer:* You can spend a free maneuver to deal yourself damage and ignore difficult terrain.',
			].join('\n');
			const stripped = stripLabeledLines(body, ['Echelon', 'Prerequisite', 'Effect']);
			expect(stripped).toBe(
				[
					"*I said you had twenty-four hours to leave town. That was... what, about twenty-four hours ago?*",
					'',
					"- *Guess It's the Hard Way Then:* When combat begins, you halve the first damage you take.",
					'- *Heedless Pursuer:* You can spend a free maneuver to deal yourself damage and ignore difficult terrain.',
				].join('\n'),
			);
		});

		test('complication/wodewalker.md: Benefit/Drawback strip, the un-italicized flavor paragraph survives untouched', () => {
			const body = [
				'You were dying in the wode, collapsing while starving and wounded. When you woke, you discovered that a group of green elementalists had saved your life.',
				'',
				'**Benefit:** Your recovery value increases by an amount equal to your highest characteristic score.',
				'',
				'**Drawback:** You have fire weakness 5.',
			].join('\n');
			const stripped = stripLabeledLines(body, ['Benefit', 'Drawback']);
			expect(stripped).toBe(
				'You were dying in the wode, collapsing while starving and wounded. When you woke, you discovered that a group of green elementalists had saved your life.',
			);
		});
	});
});

describe('SC-120 Batch B: bodyLabeledLine (layouts.ts, design §3.6 — ports the site\'s bodyLabeledLine)', () => {
	test('extracts the value after an exact "**Label:**" prefix, trimmed', () => {
		const md = 'Some prose.\n\n**Skill Options:** One skill from the interpersonal or intrigue skill groups.';
		expect(bodyLabeledLine(md, 'Skill Options')).toBe('One skill from the interpersonal or intrigue skill groups.');
	});

	test('undefined when the label line is absent', () => {
		expect(bodyLabeledLine('Just prose.', 'Skill Options')).toBeUndefined();
	});

	test('undefined for undefined input', () => {
		expect(bodyLabeledLine(undefined, 'Skill Options')).toBeUndefined();
	});

	// Verified against culture/bureaucratic.md (v2/docs/Browse/culture/bureaucratic.md),
	// verbatim — including the nested italic "(*Quick Build:* ...)" parenthetical, which
	// must NOT be mistaken for a second labeled line (it is mid-line, not `**`-bold-led).
	test('culture/bureaucratic.md: extracts the real Skill Options sentence, nested Quick Build parenthetical intact', () => {
		const body = [
			'[Bureaucratic](bureaucratic.md) cultures are steeped in official leadership and formally recorded laws.',
			'',
			'**Skill Options:** One skill from the [interpersonal](../skill/interpersonal/index.md) or [intrigue](../skill/intrigue/index.md) skill groups. (*Quick Build:* [Persuade](../skill/interpersonal/persuade.md).)',
		].join('\n');
		expect(bodyLabeledLine(body, 'Skill Options')).toBe(
			'One skill from the [interpersonal](../skill/interpersonal/index.md) or [intrigue](../skill/intrigue/index.md) skill groups. (*Quick Build:* [Persuade](../skill/interpersonal/persuade.md).)',
		);
	});
});
