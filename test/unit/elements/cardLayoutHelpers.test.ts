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

	describe('SC-120 Batch B fix round 2 (owner rulings 22-24)', () => {
		test('HIGH-2: a label whose band did not render (band-gating is the CALLER\'s job — an unwanted label is never stripped) survives in the body untouched, even though the label text matches a family label the composition owns elsewhere', () => {
			const md = '**Item Prerequisite:** A pint of blue ichor, soul chalk\n\n**Project Source:** Licensing agreements in Anjali';
			// Caller passes an EMPTY gated list (as if neither field's band rendered) --
			// `stripLabeledLines` itself has no opinion on which labels are "the family's",
			// it only strips what it's told to.
			expect(stripLabeledLines(md, [])).toBe(md);
		});

		test('HIGH-1: segment-aware — a packed line carrying a wanted label AND an unrelated second bold-labeled segment strips only the wanted segment, preserving the second segment verbatim', () => {
			const md =
				'**[Item Prerequisite](scc.v1:...):** An ounce of undead flesh. **Thunderhead Cloud:** Small lightning bolts arc around the black cloud in this sphere.';
			expect(stripLabeledLines(md, ['Item Prerequisite'])).toBe(
				'**Thunderhead Cloud:** Small lightning bolts arc around the black cloud in this sphere.',
			);
		});

		test("real corpus regression (r7 review HIGH-1): treasure/1st-echelon/consumable/portable-cloud.md's packed line — the Thunderhead Cloud variant (name + full rules paragraph) survives; the model's OWN Item Prerequisite value (the first occurrence) still strips", () => {
			const md = [
				'**[Item Prerequisite](../../../rule/downtime/item-prerequisite.md):** A cup of rainwater from a sacred fey grove, plus an optional prerequisite (see below)',
				'',
				'Enterprising mages within various thieves\' guilds have developed variations of the Portable Cloud.',
				'',
				'**Noxious Cloud:** Filled with a green or putrid yellow haze, this sphere spreads a choking, foul-smelling mist when broken.',
				'',
				'**[Item Prerequisite](../../../rule/downtime/item-prerequisite.md):** An ounce of undead flesh. **Thunderhead Cloud:** Small lightning bolts arc around the black cloud in this sphere, which creates a 3 cube of cloud and lightning when broken.',
				'',
				'**[Item Prerequisite](../../../rule/downtime/item-prerequisite.md):** A spool of copper wire.',
			].join('\n');
			const stripped = stripLabeledLines(md, ['Item Prerequisite']);
			// The FIRST occurrence (the model's own value, duplicated by the Prerequisite
			// band elsewhere) is gone.
			expect(stripped).not.toContain('A cup of rainwater');
			// Every label-shaped line NOT in the wanted set survives untouched.
			expect(stripped).toContain('**Noxious Cloud:** Filled with a green or putrid yellow haze');
			// The packed line's Thunderhead Cloud segment survives (segment-aware, HIGH-1).
			expect(stripped).toContain('**Thunderhead Cloud:** Small lightning bolts arc around the black cloud');
			// First-occurrence-only (ruling 22(iii) extended): the REPEAT "Item
			// Prerequisite" occurrences (the packed line's own segment, and the standalone
			// third line) are NOT deleted merely for sharing a label with the first —
			// they are different values with nothing structural covering them.
			expect(stripped).toContain('An ounce of undead flesh');
			expect(stripped).toContain('A spool of copper wire');
		});

		test('LOW-2: the label set is normalized the SAME way the captured text is (extra whitespace / an emphasis marker in the label itself still matches)', () => {
			const md = '**1st  Level:** The bonus increases.';
			// A data-derived label with a stray double space would never match a bare
			// `.toLowerCase()` comparison, but DOES match once both sides run through
			// `normalizeForDuplicateCheck` (which collapses whitespace too).
			expect(stripLabeledLines(md, ['1st  Level'])).toBe('');
			expect(stripLabeledLines(md, ['1st Level'])).toBe('');
		});

		test('LOW-3: an orphaned label-only line (no value on the same line) strips the label line but the value paragraph below survives — duplication, never deletion, when nothing ties the two together positionally', () => {
			const md = '**Effect:**\n\nThe effect text lives in its own paragraph below the bare label.';
			expect(stripLabeledLines(md, ['Effect'])).toBe(
				'The effect text lives in its own paragraph below the bare label.',
			);
		});
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

	test('fix round 2, LOW-1: an INDENTED label line (nested under a list item) is not matched — the same column-0 requirement stripLabeledLines/matchLabeledLine enforce, so the two helpers can never disagree into a double-render', () => {
		const md = '- An item\n    **Skill Options:** One skill described inline under the bullet.';
		expect(bodyLabeledLine(md, 'Skill Options')).toBeUndefined();
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
