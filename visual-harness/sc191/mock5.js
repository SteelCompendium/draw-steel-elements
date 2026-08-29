/* SC-191 ROUND 5 — equal-width tracks, the tier cheat sheet, the rename, no ghost lane.
 *
 * THE BASE. Scott ruled on round 4: "the `merged` design looks great." So `merged` is no
 * longer a variable either — it is the composition, and round 5 applies his four follow-up
 * asks to it. The one axis left open is WHERE THE CHEAT SHEET'S TOGGLE LIVES (`?cheat=`).
 *
 * THE ROUND-5 CONTROL. `?r5=off` renders the round-4 `merged` card verbatim. Every round-5
 * change — CSS *and* DOM — is gated on it, exactly as round 4 gated itself on
 * `dedupe !== 'before'`, so the before/after pair cannot be flattered by a stray fix. The
 * proof is a hash comparison against the round-4 shots Scott actually reviewed, reported in
 * §0 of the round-5 report.
 *
 * WHAT ROUND 5 CHANGES, one bullet of Scott's per item:
 *
 *  A. EQUAL-WIDTH TRACKS. "I want to tweak the two tracks so they are the same horizontal
 *     width: even if there are 5 cells in 'success' and 3 in 'failure', either one reaching
 *     max results in the end of the montage so they should be the same width. That means
 *     the cells for failure are going to be wider." Round 4 had fixed-width slots (so the
 *     3-slot failure bar was literally half the 6-slot success bar); round 5 makes the
 *     TRACK the fixed object and the slots divide it, which also puts both tail sentences
 *     on one common x. See round5.css §1.
 *
 *  B. THE TIER CHEAT SHEET, above the board. "My leading though is to additionally have a
 *     button that will open (expand) a stylized version of the test-outcome-per-difficulty
 *     information above the table that isnt super obtuse (like a cheat sheet)." Three
 *     difficulty rows x three roll bands, drawn in the board's own seal language, pinned
 *     once opened. `?cheat=handle` (recommended) and `?cheat=chip` are the two homes for
 *     its toggle. See CHEAT + cheatStrip() below.
 *
 *  C. THE SHEET'S TIER HINT. The sheet is the adjudication moment, so its Result field
 *     carries the one line that decides which chip to press. It is a HINT, not a warning —
 *     round 4 fixed exactly that bug (a benign hint painted in the warn slot) and round 5
 *     gives the hint its own class so it cannot regress into one.
 *
 *  D. THE RENAME. "The 'record' label on the button is really confusing though. Lets change
 *     that to something else." -> `Log an action…`, reconciled across every surface. The
 *     reasoning is in actionBar() below.
 *
 *  E. THE GHOST LANE IS GONE. "Some of the screenshots from this round had a '+' column to
 *     the left of the 'tally' column - what is that, why do we need it, can we remove it?"
 *     Removed from the DOM (not hidden — a `display:none` grid item desyncs from the track
 *     list). "Add a round" lives in the ⋯ overflow alone. See board().
 *
 * INHERITED AND SETTLED — not re-opened by this round: crest = none (Scott's explicit
 * ruling), seal = ink and space = centre (twice confirmed by implication), the note mark in
 * the cell's top-right, the collapsed-by-default foot panel and its side-scrolling tier
 * table at 300px, the crest-less hero cells, the "+" add-hero affordance in the Heroes
 * header cell, and `Record…`'s placement in the bottom action bar.
 *
 * WHAT ROUND 4 ADDED, and round 5 keeps:
 *
 *  1. PADDING / ALIGNMENT. "Still looks like there are a few padding issues on some of
 *     the header/footer rows. Also the edit button in a cell needs some padding/margin."
 *     Header row gets one true baseline; the cell's edit control becomes a real padded
 *     chip inset from the corner; the tracks stop stretching to a common width.
 *
 *  2. RULES GUIDANCE, collapsible and collapsed by default. "I think it would be nice to
 *     have some guidance available for how to run the montage, specifically the rules for
 *     montage test power roll tiers for the difficulties." See GUIDE below — every line of
 *     it is quoted or condensed from Draw Steel Heroes, cited inline.
 *
 *  3. PER-TEST NOTES. "Edit button should allow quick notes for a test… The footer portion
 *     that shows the outcome should list out these notes." The record/correct sheet gains a
 *     Note field; a noted cell carries a dog-eared page mark; the outcome band lists them.
 *
 *  4. DE-DUPLICATION. "The card has so many places that show the same information… I like
 *     the footer showing the outcome information. I also like the visual of the two tracker
 *     bars… Lets clean up the UI to avoid all the duplication." The progress band and the
 *     verdict band MERGE into one outcome band: the bars survive, inside the footer Scott
 *     kept, and the three other statements of the same totals (the head's two count chips,
 *     the board's round-tally foot row with its grand total, the bars' own numeric readout)
 *     are gone. `data-dedupe` on the card root is the one axis left open:
 *
 *       data-dedupe = merged   (recommended: one outcome band, bars kept)
 *                   | bars-off (the same band with the two bars removed)
 *                   | before   (round 3 verbatim — the labelled control)
 *
 *  5. THE RECORD SHEET, photographed. "Can you also give me a summary of what the 'record'
 *     button does (and let me see its UI if there is a dedicated modal or something)."
 *     `?sheet=record` / `?sheet=edit` render it open; round 3 had the parameter but never
 *     shot it, so Scott has never seen this surface.
 *
 * WHY A SEPARATE PAGE (unchanged from round 1). A mock outside `visual-harness/entry.ts`'s
 * manifest cannot add a capture id, cannot add a fixture and cannot touch
 * `styles-source.css`, so the print freeze is safe BY CONSTRUCTION. It still renders in
 * the real environment: Obsidian's vendored variables (`../vars.css`) plus the compiled
 * plugin sheet (`../dist/harness.css`), under the same `data-dse-element`/`data-dse-theme`
 * root attributes `ElementPipeline` stamps.
 *
 * RULES GROUND TRUTH — round 4 re-derived these from the BOOK, not from the condensed
 * agent reference, because the guidance panel is rules text a Director reads at the table.
 * Primary source: steel-etl/input/heroes/"Draw Steel Heroes.md".
 *   :20463  "Test Difficulty" + the Test Difficulty Outcomes table (the power-roll tiers).
 *   :21306  "Montage Test Difficulty" + the Montage Test Difficulty table (the LIMITS).
 *   :21302  "Limited Rounds" — 2 rounds by default; the Director may increase it.
 *   :21284  "Can't Use the Same Skill Twice" (the rule sentence is :21286).
 *   :21298  "Total Successes and Failures" — the success limit / failure limit contract.
 *   :21325  "Montage Test Outcomes"; the Victory awards are :21337 and :21343.
 *   :21184  "Assist a Test" — the assist is its OWN roll: <=11 bane, 12-16 edge, 17+ double edge.
 * Cross-checked against reference/draw-steel-agent-reference.md:66,89-98 and
 * reference/draw-steel-reference.md:252-254. ONE correction the cross-check produced: the
 * agent reference says "Total success and hard partial success award Victories", but the
 * book awards a Victory for partial success on a MODERATE montage too, and 2 Victories for
 * total success on a hard one. The panel states the book's numbers.
 */
(function () {
	'use strict';

	/* ------------------------------------------------------------------ */
	/*  Tiny DOM helpers                                                   */
	/* ------------------------------------------------------------------ */
	function el(parent, tag, cls, text) {
		const node = document.createElement(tag);
		if (cls) node.className = cls;
		if (text !== undefined && text !== null) node.textContent = String(text);
		if (parent) parent.appendChild(node);
		return node;
	}
	function attr(node, map) {
		for (const k of Object.keys(map)) {
			if (map[k] !== undefined && map[k] !== null) node.setAttribute(k, String(map[k]));
		}
		return node;
	}

	/* Lucide-shaped inline glyphs (a static page has no Lucide bundle; the real element
	   calls Obsidian's setIcon). Same 24-grid / 2px-stroke geometry. */
	const ICON = {
		check: '<path d="M20 6 9 17l-5-5"/>',
		x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
		plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
		/* ASSIST gets a RINGED plus, never the bare one. A bare `+` is already the "add"
		   glyph on three controls (Record…, add a round, add a hero), and round 2's first
		   cut proved the collision: an assist cell read as an empty slot with an add
		   button in it. The ring is the shape channel that separates "a hero spent their
		   action helping" from "make a new thing here". */
		assist: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12h7"/><path d="M12 8.5v7"/>',
		pencil:
			'<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
		undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
		next: '<path d="m9 18 6-6-6-6"/>',
		more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
		trash:
			'<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
		userplus:
			'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>',
		flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
		hourglass:
			'<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22"/><path d="M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2"/>',
		skull:
			'<circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><path d="M8 20v2h8v-2"/><path d="m12.5 17-.5-1-.5 1h1z"/><path d="M16 20a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20"/>',
		trophy:
			'<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
		dash: '<path d="M5 12h14"/>',
		/* The guidance disclosure's twisty. Points right when closed, down when open —
		   round4.css rotates the one glyph rather than swapping two, so the two states
		   cannot drift apart. */
		chevron: '<path d="m9 18 6-6-6-6"/>',
		/* A NOTE is a dog-eared page. Deliberately not a speech bubble (that reads as
		   "comment from someone else") and not an asterisk (which is a footnote marker,
		   i.e. "look elsewhere" — the opposite of "there is something recorded here"). */
		note: '<path d="M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M15 3v5h5"/>',
	};
	function icon(parent, name, cls) {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		attr(svg, {
			viewBox: '0 0 24 24',
			fill: 'none',
			stroke: 'currentColor',
			'stroke-width': '2',
			'stroke-linecap': 'round',
			'stroke-linejoin': 'round',
			class: 'svg-icon' + (cls ? ' ' + cls : ''),
			'aria-hidden': 'true',
		});
		svg.innerHTML = ICON[name] || '';
		if (parent) parent.appendChild(svg);
		return svg;
	}

	/* ------------------------------------------------------------------ */
	/*  The model + the three states that matter                           */
	/* ------------------------------------------------------------------ */
	const PARTY = [
		{ name: 'Kira', short: 'KI' },
		{ name: 'Bram', short: 'BR' },
		{ name: 'Osric', short: 'OS' },
		{ name: 'Yenna', short: 'YE' },
		{ name: 'Talin', short: 'TA' },
	];

	const BASE = {
		title: 'Cross the Ashfall Wastes',
		description:
			'Forty miles of volcanic waste, and the ashfall is three days behind them. ' +
			'The heroes have to find the pass, keep the mules alive, and reach the Cinder ' +
			'Gate before the sky closes over it.',
		rounds: 3,
		success_limit: 6,
		failure_limit: 3,
		participants: PARTY,
	};

	/* Round 1 + round 2 as recorded — the same history round 1's screenshots used, so the
	   two rounds of design are directly comparable.
	 *
	 * `note` is round 4's addition and Scott's own use case: "if a character makes a test
	 * and there is a consequence that the Director wants to take note of, they should be
	 * able to hit the edit button in the cell and type in something to remember later."
	 * Three of the ten entries carry one, which is roughly the real density — a note is
	 * for the thing you will otherwise forget, not for every roll. Two hang off failures
	 * (the book's own default consequence is "Malice in the next combat encounter" —
	 * Draw Steel Heroes:21282) and one hangs off an ASSIST, to prove the field is not
	 * failure-only. */
	const HISTORY = [
		{ round: 1, who: 'Kira', result: 'success', skill: 'Nature' },
		{ round: 1, who: 'Bram', result: 'success', skill: 'Endurance' },
		{
			round: 1,
			who: 'Osric',
			result: 'failure',
			skill: 'Climb',
			note: 'Turned an ankle on the scree — bane on his next Might test.',
		},
		{ round: 1, who: 'Yenna', result: 'success', skill: 'Lead' },
		{ round: 1, who: 'Talin', result: 'success', skill: 'Navigate' },
		{ round: 2, who: 'Kira', result: 'success', skill: 'Alertness' },
		{
			round: 2,
			who: 'Bram',
			result: 'failure',
			skill: 'Lift',
			note: 'Dropped the water cask. Mules are thirsty; +1 Malice next encounter.',
		},
		{ round: 2, who: 'Osric', result: 'assist', skill: 'Search' },
		{
			round: 2,
			who: 'Yenna',
			result: 'assist',
			skill: 'Persuade',
			note: 'Promised the drovers double pay at the Cinder Gate.',
		},
		{ round: 2, who: 'Talin', result: 'assist', skill: 'Track' },
	];

	/**
	 * THE THREE STATES. Round 1's report flagged that an un-started montage prints a bare
	 * "Total Failure" chip — technically what `montageOutcome` returns at 0/0, and a bug to
	 * every reader. `empty` is therefore a first-class state here with its own band.
	 */
	const STATES = {
		empty: { current_round: 1, entries: [], complete: false },
		mid: { current_round: 3, entries: HISTORY, complete: false },
		done: {
			current_round: 3,
			complete: true,
			entries: HISTORY.concat([
				{ round: 3, who: 'Kira', result: 'success', skill: 'Insight' },
				{ round: 3, who: 'Bram', result: 'assist', skill: 'Might' },
			]),
		},
	};

	/* ------------------------------------------------------------------ */
	/*  THE RULES GUIDANCE — collapsed by default                          */
	/* ------------------------------------------------------------------ */
	/* Scott asked for two things and told us twice to keep them small: "the rules for
	   montage test power roll tiers for the difficulties", and "maybe guidance on how to
	   set difficulties or something if thats in the rulebook. Again, that shouldnt take up
	   a bunch of screen real estate."
	 *
	 * THE TRAP THIS PANEL EXISTS TO DISARM. "Difficulty" means TWO different things in a
	 * montage test and the book uses the same three words for both:
	 *   - EACH INDIVIDUAL TEST has a difficulty (easy / medium / hard) that decides which
	 *     power-roll tier counts as a success. "The difficulty of each individual test in a
	 *     montage test is set by the Director and can vary from test to test."
	 *     (Draw Steel Heroes:21274, "Individual Tests in Montage Tests")
	 *   - THE MONTAGE AS A WHOLE has a difficulty (easy / moderate / hard) that decides the
	 *     success and failure LIMITS. (Draw Steel Heroes:21306)
	 * Presenting one table without the other is how a Director ends up setting a "hard
	 * montage" and then reading tiers off the hard-TEST row. The two blocks are therefore
	 * labelled by what they set, not by the word "difficulty".
	 *
	 * Every row below is the book's own wording, condensed only where a table cell demands
	 * it ("Success with a consequence" -> "success, consequence"). */
	const GUIDE = {
		tiers: {
			title: 'Each test',
			lede: 'The Director picks a difficulty per test; the power roll reads across.',
			head: ['Power roll', 'Easy', 'Medium', 'Hard'],
			rows: [
				['≤11', 'success, consequence', 'failure', 'failure, consequence'],
				['12–16', 'success', 'success, consequence', 'failure'],
				['17+', 'success, reward', 'success', 'success'],
				['nat 19–20', 'success, reward', 'success, reward', 'success, reward'],
			],
			/* Draw Steel Heroes:20480 — the sentence that makes the table countable at all. */
			foot: 'Any success counts toward the success limit; any failure counts toward the failure limit.',
		},
		limits: {
			title: 'The montage',
			lede: 'Success and failure limits, set before play.',
			head: ['Montage', '✓ limit', '✕ limit'],
			rows: [
				['Easy', '5', '5'],
				['Moderate', '6', '4'],
				['Hard', '7', '3'],
			],
			/* Draw Steel Heroes:21320 — the party-size adjustment. */
			foot: 'For five heroes. ±1 to both per hero over or under five, minimum 2.',
		},
		/* ROUND 5. When the cheat-sheet strip is pinned above the board, the panel must not
		   restate the same nine cells at full size one band lower — dedup is the standing
		   principle of round 4 and it does not stop applying because the duplicate is a
		   rules table. What the STRIP cannot carry is the book's fourth row, so that is
		   exactly what the panel keeps: one line, and a pointer to where the rest is. */
		pinned: {
			title: 'Each test',
			lede: 'The tier table is pinned above the board.',
			line: 'A natural 19 or 20 is always a success with a reward, at every difficulty.',
		},
		table: {
			title: 'At the table',
			bullets: [
				'Two rounds by default. Each hero acts once a round: a test, an assist, or an ability.',
				'No hero may use the same skill twice in one montage. An applicable skill grants +2.',
				'An assist is its own roll: ≤11 gives a bane, 12–16 an edge, 17+ a double edge.',
				'Hit the success limit → total success. Otherwise, at the failure limit or out of rounds: partial success if successes lead failures by 2, else total failure.',
				'Victories: total success 1 (easy or moderate) or 2 (hard); partial success 1 (moderate or hard).',
			],
		},
	};

	/* ------------------------------------------------------------------ */
	/*  ROUND 5 — THE TIER CHEAT SHEET                                     */
	/* ------------------------------------------------------------------ */
	/* Scott: "I have the feeling the 'Each test' section will want to be seen all the time
	   by a lot of Directors while the other rule information is a 'check it once at the
	   beginning and then close it' situation… My leading though is to additionally have a
	   button that will open (expand) a stylized version of the test-outcome-per-difficulty
	   information above the table that isnt super obtuse (like a cheat sheet)."
	 *
	 * SAME RULES TEXT, DIFFERENT INSTRUMENT. The foot panel's version is the book's table
	 * transcribed: four rows of power roll x three columns of difficulty, in words. This is
	 * a LOOKUP, and a lookup is indexed by the thing you already know. At the table the
	 * Director knows the difficulty first — they set it when they framed the test — and
	 * learns the roll second, so the strip is TRANSPOSED: one row per difficulty, read
	 * across to the band the roll landed in.
	 *
	 * IT IS DRAWN, NOT WRITTEN. Each cell is the board's own ink seal — a green ring with a
	 * check for a success, a red hatched press with an X for a failure — so the strip and
	 * the board speak one language and a Director who has learned to read a cell has already
	 * learned to read the cheat sheet. The rider ("with a consequence", "with a reward")
	 * rides beside the seal as a WORD, because a word is the strongest channel there is that
	 * is not colour, and Scott is colourblind. Nothing here is stated by hue alone: ring
	 * style (solid / pressed) plus glyph shape (check / X) plus the rider word carry it
	 * three times over, which is what the greyscale shot exists to prove.
	 *
	 * THE FOURTH ROW IS DELIBERATELY ABSENT. The book's "Natural 19 or 20" row is the same
	 * answer in all three columns, so as a row of the strip it is three identical cells
	 * saying one sentence — the definition of a cell that does not earn its width. It stays
	 * in the foot panel, and the panel's pinned form (GUIDE.pinned) states it in one line.
	 *
	 * Source, verbatim (Draw Steel Heroes:20471, the Test Difficulty Outcomes table):
	 *   <=11  | Success with a consequence | Failure | Failure with a consequence
	 *   12-16 | Success | Success with a consequence | Failure
	 *   17+   | Success with a reward | Success | Success
	 * transposed below, and the counting sentence (:20480) is the strip's footnote. */
	const CHEAT = {
		title: 'Test tiers',
		bands: ['≤11', '12–16', '17+'],
		rows: [
			{
				diff: 'Easy',
				cells: [
					{ kind: 'success', rider: 'consequence' },
					{ kind: 'success' },
					{ kind: 'success', rider: 'reward' },
				],
			},
			{
				diff: 'Medium',
				cells: [{ kind: 'failure' }, { kind: 'success', rider: 'consequence' }, { kind: 'success' }],
			},
			{
				diff: 'Hard',
				cells: [{ kind: 'failure', rider: 'consequence' }, { kind: 'failure' }, { kind: 'success' }],
			},
		],
		/* Draw Steel Heroes:20480 — the sentence that makes the strip countable, and the
		   reason a "success with a consequence" cell is not a half-success. */
		foot: 'Any success counts toward the success limit; any failure toward the failure limit.',
		/* Shown only at sidebar width, where the rider words are dropped for their initials
		   rather than side-scrolling the strip. */
		legend: 'c with a consequence · r with a reward',
	};
	/* The rider's narrow-width initial. One letter, in the mono face, in metal — never a
	   colour, and never the only channel: the legend line appears with it. */
	const RIDER_MARK = { consequence: 'c', reward: 'r' };

	/* ------------------------------------------------------------------ */
	/*  Derived rules state — each line cites the rule it comes from       */
	/* ------------------------------------------------------------------ */
	function derive(m) {
		const successes = m.entries.filter((e) => e.result === 'success').length;
		const failures = m.entries.filter((e) => e.result === 'failure').length;
		const party = m.participants.length;

		// "Lasts 2 rounds (default)" — Director-set; current_round is inclusive.
		const roundsLeft = Math.max(0, m.rounds - m.current_round + 1);
		// "Each hero gets one action per round" — a CEILING on remaining tests, since an
		// assist or an ability use spends the same action and produces no tally.
		const actionsLeft = m.complete
			? 0
			: roundsLeft * party - m.entries.filter((e) => e.round === m.current_round).length;
		const toTotal = Math.max(0, m.success_limit - successes);
		const failuresSpare = Math.max(0, m.failure_limit - failures);
		const margin = successes - failures;
		const partialHeld = margin >= 2;
		const totalReachable = toTotal <= actionsLeft;

		// The FOURTH band round 1 asked for: nothing recorded yet is not a Total Failure.
		let band = 'failure';
		if (m.entries.length === 0) band = 'pending';
		else if (toTotal === 0) band = 'total';
		else if (partialHeld) band = 'partial';

		// The Director's own marginalia, in the order they happened — the outcome band
		// lists them, so the ordering has to be the reading order of the board.
		const notes = m.entries
			.filter((e) => e.note)
			.slice()
			.sort((a, b) => a.round - b.round || m.participants.findIndex((p) => p.name === a.who) - m.participants.findIndex((p) => p.name === b.who));

		return {
			notes,
			successes,
			failures,
			party,
			roundsLeft,
			actionsLeft,
			toTotal,
			failuresSpare,
			margin,
			partialHeld,
			totalReachable,
			band,
			complete: !!m.complete,
			brink: toTotal === 1 && totalReachable && !m.complete,
		};
	}

	const BAND_WORD = {
		pending: 'Not started',
		total: 'Total Success',
		partial: 'Partial Success',
		failure: 'Total Failure',
	};
	const BAND_ICON = { pending: 'hourglass', total: 'trophy', partial: 'flag', failure: 'skull' };
	const RESULT_ICON = { success: 'check', failure: 'x', assist: 'assist' };

	function entryFor(m, who, round) {
		return m.entries.filter((e) => e.who === who && e.round === round)[0];
	}
	function entriesFor(m, round) {
		return m.entries.filter((e) => e.round === round);
	}
	function entriesForHero(m, who) {
		return m.entries.filter((e) => e.who === who);
	}

	/* ------------------------------------------------------------------ */
	/*  Shared card furniture                                              */
	/* ------------------------------------------------------------------ */

	/**
	 * The real kit `cardHead` DOM (src/framework/kit/cardHead.ts), hand-built.
	 *
	 * DEDUPE, PART 1 OF 3. Round 3's head carried three right-hand chips: the round, the
	 * successes and the failures. The last two are the first of the card's four statements
	 * of the same two numbers, and they are the WORST of the four — a chip at the top-right
	 * corner cannot show progress, only assert it, so "5 / 6 successes" needs the reader to
	 * do the subtraction the outcome band's track does by being one cell short.
	 *
	 * The ROUND chip stays, for a reason worth stating: it is not a tally. It is the only
	 * place the montage's length is written at sidebar width, where the board's round
	 * header row stands down entirely (round2.css @media 420px) and the columns that
	 * otherwise say "round 3 of 3" do not exist.
	 */
	function head(parent, m, d, opts) {
		const wrap = el(parent, 'div', 'mt2__head');
		const h = el(wrap, 'div', 'dse-head');

		const crest = el(h, 'span', 'dse-crest dse-crest--lg');
		crest.setAttribute('aria-hidden', 'true');
		icon(el(crest, 'span', 'dse-crest__glyph'), 'hourglass');

		el(h, 'span', 'dse-head__eyebrow dse-head__eyebrow--left dse-head__eyebrow--line', 'Montage Test');
		const name = el(h, 'span', 'dse-head__primary dse-head__primary--left dse-head__primary--line', m.title);
		attr(name, { role: 'heading', 'aria-level': '2' });
		el(
			h,
			'span',
			'dse-head__deck dse-head__deck--left dse-head__deck--line',
			d.party + ' heroes · one action each per round',
		);

		el(
			h,
			'span',
			'dse-head__eyebrow dse-head__eyebrow--right dse-head__eyebrow--chip',
			d.complete ? 'Complete' : 'Round ' + m.current_round + ' / ' + m.rounds,
		);
		if (opts.dedupe === 'before') {
			el(
				h,
				'span',
				'dse-head__primary dse-head__primary--right dse-head__primary--chip',
				d.successes + ' / ' + m.success_limit + ' successes',
			);
			el(
				h,
				'span',
				'dse-head__deck dse-head__deck--right dse-head__deck--chip',
				d.failures + ' / ' + m.failure_limit + ' failures',
			);
		}
		// ROUND 5, the `chip` alternative for the cheat sheet's toggle: a control in the
		// head's right stack, which costs no height at all when the strip is closed and
		// pays for it by opening a panel two bands away from the finger that opened it.
		if (opts.r5 && opts.cheatPlace === 'chip') {
			const t = el(h, 'button', 'mt5-headtoggle');
			attr(t, {
				type: 'button',
				'aria-expanded': opts.cheatOpen ? 'true' : 'false',
				'aria-label': 'Test tiers cheat sheet',
				'data-on': opts.cheatOpen ? 'on' : 'off',
			});
			el(t, 'span', 'mt5-headtoggle__text', 'Test tiers');
			icon(el(t, 'span', 'mt5-headtoggle__twisty'), 'chevron');
		}
		return wrap;
	}

	/** The Director's brief — description, above the board, free to wrap. */
	function brief(parent, m) {
		if (!m.description) return null;
		const b = el(parent, 'div', 'mt2__brief');
		el(b, 'p', 'mt2__brief-text', m.description);
		return b;
	}

	/** One countable slot track: `limit` engraved cells, `filled` of them struck. */
	function slotTrack(parent, filled, limit, kind) {
		const t = el(parent, 'div', 'mt2-track');
		attr(t, { 'data-kind': kind });
		for (let i = 0; i < limit; i++) {
			const s = el(t, 'span', 'mt2-track__slot');
			attr(s, { 'data-filled': i < filled ? 'on' : 'off' });
			if (i === limit - 1) attr(s, { 'data-goal': 'on' });
		}
		return t;
	}

	/**
	 * THE PROGRESS BAND — round 1's cramped "goal corner", given its own full-width row
	 * directly under the board. Same cross-footing idea (the board's tallies add up to
	 * these), more room, and it is now the one place the Director-set limits are drawn.
	 *
	 * The track's LENGTH always states the limit and only the FILL states progress, so
	 * "one success from Total Success" is literally one unfilled cell — no arithmetic and
	 * no colour needed to read it.
	 */
	function progress(parent, m, d) {
		const p = el(parent, 'div', 'mt2-progress');
		attr(p, { 'data-brink': d.brink ? 'on' : 'off' });

		function row(kind, glyph, word, filled, limit, tail) {
			const r = el(p, 'div', 'mt2-prog');
			attr(r, { 'data-kind': kind });
			const lab = el(r, 'span', 'mt2-prog__label');
			icon(el(lab, 'span', 'mt2-prog__glyph'), glyph);
			el(lab, 'span', 'mt2-prog__word', word);
			slotTrack(r, filled, limit, kind);
			const read = el(r, 'span', 'mt2-prog__read');
			el(read, 'span', 'mt2-prog__count', filled + '/' + limit);
			el(read, 'span', 'mt2-prog__tail', tail);
			return r;
		}

		row(
			'success',
			'check',
			'Successes',
			d.successes,
			m.success_limit,
			d.toTotal === 0 ? 'Total Success reached' : d.toTotal === 1 ? '1 from Total Success' : d.toTotal + ' from Total Success',
		);
		row(
			'failure',
			'x',
			'Failures',
			d.failures,
			m.failure_limit,
			d.failuresSpare === 1 ? '1 more ends it' : d.failuresSpare + ' more end it',
		);
		return p;
	}

	/**
	 * THE VERDICT BAND. The Director-set thresholds are numbers a reader never sees the
	 * shape of, so the card states (a) what would happen if the montage ended on this
	 * beat, (b) the distance to each threshold, and (c) the rule each distance comes
	 * from, in words. `pending` is a real band: 0/0 is not a Total Failure.
	 */
	function verdict(parent, m, d) {
		const v = el(parent, 'div', 'mt2-verdict');
		attr(v, { 'data-band': d.band, 'data-brink': d.brink ? 'on' : 'off' });

		const now = el(v, 'div', 'mt2-verdict__now');
		const crest = el(now, 'span', 'mt2-verdict__crest');
		crest.setAttribute('aria-hidden', 'true');
		icon(crest, BAND_ICON[d.band]);
		const words = el(now, 'div', 'mt2-verdict__words');
		el(words, 'span', 'mt2-verdict__eyebrow', d.complete ? 'Final result' : d.band === 'pending' ? 'This montage' : 'If it ended now');
		el(words, 'span', 'mt2-verdict__word', BAND_WORD[d.band]);

		const stats = el(v, 'div', 'mt2-verdict__stats');
		function stat(value, label, kind) {
			const s = el(stats, 'div', 'mt2-stat');
			attr(s, { 'data-kind': kind });
			el(s, 'span', 'mt2-stat__value', value);
			el(s, 'span', 'mt2-stat__label', label);
			return s;
		}
		if (d.complete) {
			stat(d.successes, 'successes', 'success');
			stat(d.failures, 'failures', 'failure');
			stat(m.rounds - m.current_round === 0 ? m.current_round : m.current_round, 'rounds used', 'actions');
		} else {
			stat(d.toTotal, d.toTotal === 1 ? 'success from Total' : 'successes from Total', 'success');
			stat(d.failuresSpare, d.failuresSpare === 1 ? 'failure to spare' : 'failures to spare', 'failure');
			stat(d.actionsLeft, 'hero actions left', 'actions');
		}

		const rules = el(v, 'div', 'mt2-verdict__rules');
		el(rules, 'span', 'mt2-verdict__rule', 'Total Success at ' + m.success_limit + ' successes.');
		el(rules, 'span', 'mt2-verdict__rule', 'Ends at ' + m.failure_limit + ' failures or after round ' + m.rounds + '.');
		if (d.complete) {
			el(rules, 'span', 'mt2-verdict__rule', 'Total Success awards Victories.');
		} else {
			el(
				rules,
				'span',
				'mt2-verdict__rule',
				'Partial Success needs successes to lead failures by 2 — currently ' + (d.margin >= 0 ? '+' : '') + d.margin + '.',
			);
		}

		if (d.brink) {
			const alert = el(v, 'div', 'mt2-verdict__alert');
			el(alert, 'span', 'mt2-verdict__alert-mark', '◆');
			el(alert, 'span', 'mt2-verdict__alert-text', 'One success from Total Success');
		}
		return v;
	}

	/**
	 * ═══ THE OUTCOME BAND — round 4's answer to the duplication ═══
	 *
	 * Scott: "Under the table there is a progress tracker and under that is an overall
	 * result footer. The card has so many places that show the same information… I like
	 * the footer showing the outcome information. I also like the visual of the two tracker
	 * bars for success/failure, but they may not be necessary. Lets clean up the UI to
	 * avoid all the duplication."
	 *
	 * Read literally that is a contradiction: he likes the footer, he likes the bars, and
	 * the bars and the footer are two bands saying one thing. The resolution is that the
	 * bars were never a second STATEMENT — they were the footer's missing INSTRUMENT,
	 * parked in a band of their own. So the two bands become one:
	 *
	 *   row 1   the verdict — crest, "if it ended now", the band word, and the one stat
	 *           that is not a tally (hero actions left / rounds used)
	 *   row 2   successes — label, track, and the distance IN WORDS
	 *   row 3   failures  — same
	 *   row 4   the one rule the band's own word depends on
	 *   row 5   the Director's notes
	 *   row 6   the brink alert, when one success from Total Success
	 *
	 * WHAT WAS DELETED, and what now states each fact exactly once:
	 *   successes so far ......... the success track's FILL              (was: head chip,
	 *                                                                     board grand cell,
	 *                                                                     track, "5/6" readout)
	 *   the success limit ........ the success track's LENGTH            (was: head chip,
	 *                                                                     "5/6", two rule lines)
	 *   distance to Total ........ the success track's tail sentence     (was: also a stat)
	 *   failures / spare ......... the failure track + its tail          (same three places)
	 *   round position ........... the head chip + the board's columns   (unchanged)
	 *
	 * The "5/6" and "2/3" numerals go with the rest: a track whose length is the limit and
	 * whose fill is progress already IS the fraction, drawn. Keeping the numeral beside it
	 * is the same duplication one scale smaller.
	 */
	function outcome(parent, m, d, opts) {
		const v = el(parent, 'div', 'mt2-verdict mt4-outcome');
		attr(v, { 'data-band': d.band, 'data-brink': d.brink ? 'on' : 'off', 'data-bars': opts.bars ? 'on' : 'off' });

		/* --- row 1: the verdict ------------------------------------- */
		const top = el(v, 'div', 'mt4-outcome__top');
		const now = el(top, 'div', 'mt2-verdict__now');
		const crest = el(now, 'span', 'mt2-verdict__crest');
		crest.setAttribute('aria-hidden', 'true');
		icon(crest, BAND_ICON[d.band]);
		const words = el(now, 'div', 'mt2-verdict__words');
		el(
			words,
			'span',
			'mt2-verdict__eyebrow',
			d.complete ? 'Final result' : d.band === 'pending' ? 'This montage' : 'If it ended now',
		);
		el(words, 'span', 'mt2-verdict__word', BAND_WORD[d.band]);

		// The single surviving stat. It is here because it is the only number on the card
		// that is neither a tally nor derivable by looking at the board: "one action each
		// per round" times the rounds still to come, minus what round 3 has already spent.
		const stats = el(top, 'div', 'mt2-verdict__stats');
		const s = el(stats, 'div', 'mt2-stat');
		attr(s, { 'data-kind': 'actions' });
		el(s, 'span', 'mt2-stat__value', d.complete ? m.current_round : d.actionsLeft);
		el(s, 'span', 'mt2-stat__label', d.complete ? 'rounds used' : 'hero actions left');

		/* --- rows 2-3: the tracks ----------------------------------- */
		if (opts.bars) {
			const bars = el(v, 'div', 'mt4-outcome__tracks');
			function row(kind, glyph, word, filled, limit, tail) {
				const r = el(bars, 'div', 'mt2-prog');
				attr(r, { 'data-kind': kind });
				const lab = el(r, 'span', 'mt2-prog__label');
				icon(el(lab, 'span', 'mt2-prog__glyph'), glyph);
				el(lab, 'span', 'mt2-prog__word', word);
				slotTrack(r, filled, limit, kind);
				el(r, 'span', 'mt2-prog__tail', tail);
				return r;
			}
			// THE TAILS ARE TENSED. A finished montage is not one failure away from
			// anything, so "1 more ends it" under a closed board is simply false — round 3
			// printed it and nobody caught it because the tail lived in a band nobody was
			// reading as part of the result. Merging the bands into the result is what made
			// it visible, which is a small argument for the merge on its own.
			row(
				'success',
				'check',
				'Successes',
				d.successes,
				m.success_limit,
				d.complete
					? d.toTotal === 0
						? 'the success limit, reached'
						: d.toTotal + ' short of the success limit'
					: d.toTotal === 0
						? 'Total Success reached'
						: d.toTotal === 1
							? '1 from Total Success'
							: d.toTotal + ' from Total Success',
			);
			row(
				'failure',
				'x',
				'Failures',
				d.failures,
				m.failure_limit,
				d.complete
					? d.failuresSpare === 0
						? 'the failure limit, reached'
						: d.failuresSpare === 1
							? '1 under the failure limit'
							: d.failuresSpare + ' under the failure limit'
					: d.failuresSpare === 0
						? 'the limit is reached'
						: d.failuresSpare === 1
							? '1 more ends it'
							: d.failuresSpare + ' more end it',
			);
		} else {
			// THE ALTERNATIVE Scott raised himself ("they may not be necessary"). With the
			// tracks gone the two distances have nowhere to be drawn, so they come back as
			// numerals — which is the honest cost of removing the bars, not a punishment.
			const bare = el(v, 'div', 'mt4-outcome__bare');
			function stat(value, label, kind) {
				const b = el(bare, 'div', 'mt2-stat');
				attr(b, { 'data-kind': kind });
				el(b, 'span', 'mt2-stat__value', value);
				el(b, 'span', 'mt2-stat__label', label);
				return b;
			}
			stat(d.successes + '/' + m.success_limit, d.toTotal === 1 ? '1 from Total Success' : d.toTotal + ' from Total Success', 'success');
			stat(d.failures + '/' + m.failure_limit, d.failuresSpare === 1 ? '1 more ends it' : d.failuresSpare + ' more end it', 'failure');
		}

		/* --- row 4: the one rule that is not already drawn ----------- */
		// Round 3 printed three rule lines here; two of them ("Total Success at 6
		// successes", "Ends at 3 failures or after round 3") are the limits, and the tracks
		// now state the limits by being that long. What survives is the rule the band's own
		// WORD depends on and which nothing else on the card can show: the 2-success margin
		// that separates Partial Success from Total Failure.
		const rules = el(v, 'div', 'mt2-verdict__rules');
		if (d.complete) {
			el(
				rules,
				'span',
				'mt2-verdict__rule',
				'Total Success awards 1 Victory on an easy or moderate montage, 2 on a hard one.',
			);
		} else {
			el(
				rules,
				'span',
				'mt2-verdict__rule',
				'Partial Success needs successes to lead failures by 2 — currently ' + (d.margin >= 0 ? '+' : '') + d.margin + '.',
			);
		}

		/* --- row 5: the Director's notes ---------------------------- */
		// Scott: "The footer portion that shows the outcome should list out these notes."
		// Each line re-states WHOSE test and WHICH round, because a note read at the end of
		// a montage has to be findable on the board again — and carries the result glyph,
		// so the list is scannable for "what went wrong" without reading a word.
		if (d.notes.length) {
			const box = el(v, 'div', 'mt4-notes');
			el(box, 'span', 'mt4-notes__head', 'Notes');
			const list = el(box, 'ul', 'mt4-notes__list');
			d.notes.forEach(function (e) {
				const li = el(list, 'li', 'mt4-note');
				attr(li, { 'data-kind': e.result });
				icon(el(li, 'span', 'mt4-note__glyph'), RESULT_ICON[e.result]);
				const who = el(li, 'span', 'mt4-note__who');
				el(who, 'span', 'mt4-note__hero', e.who);
				el(who, 'span', 'mt4-note__where', 'round ' + e.round + ' · ' + e.skill.toLowerCase());
				el(li, 'span', 'mt4-note__text', e.note);
			});
		}

		/* --- row 6: the brink -------------------------------------- */
		if (d.brink) {
			const alert = el(v, 'div', 'mt2-verdict__alert');
			el(alert, 'span', 'mt2-verdict__alert-mark', '◆');
			el(alert, 'span', 'mt2-verdict__alert-text', 'One success from Total Success');
		}
		return v;
	}

	/**
	 * ═══ ROUND 5 — THE TIER CHEAT-SHEET STRIP, above the board ═══
	 *
	 * WHERE THE TOGGLE LIVES is the one open axis of round 5, so both candidates are drawn
	 * rather than argued about:
	 *
	 *   cheat=handle  (RECOMMENDED) a full-width disclosure row sitting immediately above
	 *                 the board, in the card's existing summary-row idiom. Closed it is one
	 *                 1.9em row that already names its own contents ("easy · medium · hard");
	 *                 open, the strip drops down out of it, so the control and the thing it
	 *                 controls are the same object.
	 *   cheat=chip    no row at all when closed: a small `tiers` chip in the card head's
	 *                 right stack, under the round chip. Costs zero height closed, and opens
	 *                 a panel three bands away from the control that opened it.
	 *
	 * The argument for `handle` is in the round-5 report; the short form is that a
	 * disclosure whose content appears somewhere other than at its handle is precisely the
	 * clunkiness Scott anticipated ("Seems a little clunky"), and that `handle` reuses the
	 * foot panel's idiom so the card has ONE disclosure grammar instead of two.
	 *
	 * PINNED, NOT PEEKED. Once opened the strip stays open — it is the half of the rules
	 * Scott expects Directors to want visible "all the time", so it must survive the next
	 * thing the Director taps. In production that is a persisted per-element preference, the
	 * same shape as the chrome panel's collapse state (SC-169).
	 */
	function cheatStrip(parent, open, place) {
		const c = el(parent, 'div', 'mt5-cheat');
		attr(c, { 'data-open': open ? 'on' : 'off', 'data-place': place });

		// `handle` owns a summary row; `chip` puts its toggle in the head and renders only
		// the body here, so a closed `chip` strip is nothing at all.
		if (place === 'handle') {
			const sum = el(c, 'button', 'mt5-cheat__summary');
			attr(sum, { type: 'button', 'aria-expanded': open ? 'true' : 'false' });
			icon(el(sum, 'span', 'mt4-guide__twisty mt5-cheat__twisty'), 'chevron');
			el(sum, 'span', 'mt5-cheat__title', CHEAT.title);
			el(sum, 'span', 'mt5-cheat__hint', open ? 'pinned' : 'easy · medium · hard');
		}
		if (!open) return c;

		// One sunken well holds the grid AND its two footnotes, so the strip is a single
		// object laid on the card rather than a box with two loose lines under it.
		const body = el(c, 'div', 'mt5-cheat__body');
		const grid = el(body, 'div', 'mt5-cheat__grid');
		attr(grid, { role: 'table' });
		el(grid, 'span', 'mt5-cheat__corner', place === 'chip' ? CHEAT.title : '');
		CHEAT.bands.forEach(function (b) {
			el(grid, 'span', 'mt5-cheat__band', b);
		});
		CHEAT.rows.forEach(function (row) {
			el(grid, 'span', 'mt5-cheat__diff', row.diff);
			row.cells.forEach(function (cell) {
				const box = el(grid, 'span', 'mt5-cheat__cell');
				attr(box, { 'data-kind': cell.kind, 'data-rider': cell.rider || 'none' });
				const seal = el(box, 'span', 'mt5-seal');
				attr(seal, { 'data-kind': cell.kind, 'aria-hidden': 'true' });
				icon(seal, RESULT_ICON[cell.kind]);
				// The narrow-width initial rides the seal; the wide-width word sits beside
				// it. Both are in the DOM; round5.css shows exactly one of them per width,
				// so neither surface has to side-scroll and neither is ever ambiguous.
				if (cell.rider) el(seal, 'span', 'mt5-seal__rider', RIDER_MARK[cell.rider]);
				const word = el(box, 'span', 'mt5-cheat__word');
				el(word, 'span', 'mt5-cheat__kind', cell.kind);
				if (cell.rider) el(word, 'span', 'mt5-cheat__rider', 'with a ' + cell.rider);
			});
		});
		el(body, 'p', 'mt5-cheat__foot', CHEAT.foot);
		el(body, 'p', 'mt5-cheat__legend', CHEAT.legend);
		return c;
	}

	/**
	 * ═══ THE RULES GUIDANCE — collapsible, collapsed by default ═══
	 *
	 * Scott: "it would be nice to have some guidance available for how to run the montage,
	 * specifically the rules for montage test power roll tiers for the difficulties. This
	 * would likely take a bit of screen real-estate so maybe it should be collapable and
	 * collapsed by default."
	 *
	 * WHERE IT LIVES, and why not higher. It goes UNDER the action bar, at the very bottom
	 * of the card: it is reference, and reference sits below the instrument, never between
	 * the instrument and its controls. Collapsed it is one 2.1em row — less height than the
	 * round-tally row this change deleted, so the recommended composition is still shorter
	 * than round 3's even with the panel added.
	 *
	 * A real `<details>`/`<summary>` in production (native disclosure semantics, keyboard
	 * and screen-reader behaviour for free, and it prints EXPANDED, which is the correct
	 * behaviour for a rules panel on a printed card). The mock draws both states from a
	 * `data-open` attribute so a static screenshot can show either.
	 */
	function guide(parent, open, tiersPinned) {
		const g = el(parent, 'div', 'mt4-guide');
		attr(g, { 'data-open': open ? 'on' : 'off', 'data-pinned': tiersPinned ? 'on' : 'off' });

		const sum = el(g, 'button', 'mt4-guide__summary');
		attr(sum, { type: 'button', 'aria-expanded': open ? 'true' : 'false' });
		icon(el(sum, 'span', 'mt4-guide__twisty'), 'chevron');
		el(sum, 'span', 'mt4-guide__title', 'Running a montage test');
		// The summary's own hint has to stop advertising a table it no longer holds at full
		// size — dedup reaches the label, not only the block.
		el(sum, 'span', 'mt4-guide__hint', tiersPinned ? 'limits · outcomes · at the table' : 'test tiers · limits · outcomes');
		if (!open) return g;

		const body = el(g, 'div', 'mt4-guide__body');

		function block(spec, mod) {
			const s = el(body, 'section', 'mt4-gblock' + (mod ? ' mt4-gblock--' + mod : ''));
			el(s, 'h4', 'mt4-gblock__title', spec.title);
			if (spec.lede) el(s, 'p', 'mt4-gblock__lede', spec.lede);
			return s;
		}
		function table(host, spec) {
			const t = el(host, 'div', 'mt4-gtable');
			attr(t, { role: 'table' });
			// The same sanctioned geometry seam the board uses (D2 §5): the expanded track
			// list arrives as ONE custom property, never as an inline colour or px.
			t.style.setProperty('--mt4-gcols', 'auto ' + 'minmax(0, 1fr) '.repeat(spec.head.length - 1));
			spec.head.forEach(function (h, i) {
				const c = el(t, 'span', 'mt4-gtable__h', h);
				attr(c, { 'data-col': i === 0 ? 'key' : 'val' });
			});
			spec.rows.forEach(function (row) {
				row.forEach(function (cell, i) {
					const c = el(t, 'span', 'mt4-gtable__c', cell);
					attr(c, { 'data-col': i === 0 ? 'key' : 'val' });
				});
			});
			if (spec.foot) el(host, 'p', 'mt4-gblock__foot', spec.foot);
			return t;
		}

		// The table Scott named, first and full width: the power-roll tiers, per test
		// difficulty. This is the thing he will actually look at mid-montage.
		//
		// ROUND 5 — unless the cheat-sheet strip is already pinned above the board, in which
		// case restating all nine cells here at full size is the duplication round 4 spent
		// its whole budget removing. Pinned, this block shrinks to the one fact the strip
		// deliberately does not carry (the book's natural 19–20 row) plus a pointer.
		if (tiersPinned) {
			const stub = block(GUIDE.pinned, 'wide');
			stub.setAttribute('data-stub', 'on');
			el(stub, 'p', 'mt5-gstub__line', GUIDE.pinned.line);
		} else {
			const tiers = block(GUIDE.tiers, 'wide');
			table(tiers, GUIDE.tiers);
		}

		// The quick check he asked for — "Maybe guidance on how to set difficulties or
		// something if thats in the rulebook." It is, and it is a different table from the
		// one above, which is exactly the confusion worth pre-empting.
		const limits = block(GUIDE.limits);
		table(limits, GUIDE.limits);

		// Everything else that earned its place: five lines, each one a rule a Director
		// gets asked about mid-montage and cannot derive from the board.
		const tbl = block(GUIDE.table);
		const ul = el(tbl, 'ul', 'mt4-glist');
		GUIDE.table.bullets.forEach(function (b) {
			el(ul, 'li', 'mt4-glist__item', b);
		});
		return g;
	}

	/**
	 * THE PERSISTENT ACTION BAR — Scott's explicit ask ("if we need an add or clear button
	 * ... make sure its included in the design").
	 *
	 * PERSISTENT, not hover-revealed, on purpose: a montage is used at the table, often on
	 * a tablet, where there is no hover. Everything a Director does more than once a
	 * session is a real button that is visible without a gesture. The rare + destructive
	 * items (add a round, add a hero, clear) live behind the ⋯ overflow so the bar stays
	 * four controls wide at any width.
	 */
	function actionBar(parent, m, d, opts) {
		const bar = el(parent, 'div', 'mt2-bar');
		attr(bar, { 'data-complete': d.complete ? 'on' : 'off' });

		function btn(cls, glyph, text, variant) {
			const b = el(bar, 'button', 'dse-btn mt2-bar__btn' + (variant ? ' dse-btn--' + variant : '') + (cls ? ' ' + cls : ''));
			attr(b, { type: 'button', 'aria-label': text });
			if (glyph) icon(el(b, 'span', 'dse-btn__icon'), glyph);
			if (text) el(b, 'span', 'dse-btn__text', text);
			return b;
		}

		if (d.complete) {
			// A finished montage has no bookkeeping left — only "I closed it too early"
			// and "start over". Showing five dead controls would be the clutter Scott
			// called out, so the bar stands down to two.
			btn(null, 'undo', 'Reopen');
			btn(null, 'trash', 'Clear all', 'danger');
		} else {
			/* ═══ ROUND 5 — THE RENAME ═══
			 *
			 * Scott: "the 'record' label on the button is really confusing though. Lets
			 * change that to something else."
			 *
			 * WHAT IS ACTUALLY WRONG WITH "RECORD". Two things at once, which is why it
			 * reads as confusing rather than merely wrong. (1) It is a verb and a noun
			 * spelled the same way, sitting on a card whose whole subject is a set of
			 * records — so "Record" beside a board full of records parses as a LABEL for
			 * them before it parses as an instruction. (2) A button called Record, with a
			 * round glyph on it, is the universal control for starting an audio or video
			 * recording; the connotation arrives before the word is read.
			 *
			 * THE NOUN IS "ACTION", not "test". The sheet writes successes, failures AND
			 * assists, and an assist is not a test — the book gives it its own roll and it
			 * produces no tally (Draw Steel Heroes:21190). "Log a test…" and "Add a test…"
			 * would both mislabel a third of what this button does. The card already has a
			 * word for the thing: its own deck line says "one action each per round", and
			 * the per-row control's label has always been "…an action for <hero>". So the
			 * rename reconciles four surfaces onto one noun rather than inventing a fifth.
			 *
			 * THE VERB IS "LOG", not "add". "Add" is already spoken for three times on this
			 * card — add a round, add a hero, and the bare "+" glyph they share — and round
			 * 2 has a recorded bug from exactly that collision (an assist cell read as an
			 * empty slot with an add button in it). "Log" collides with nothing here, has
			 * no noun sense on this card, and is precisely what a Director is doing: writing
			 * down what just happened.
			 *
			 * The ellipsis stays. It is the convention for "this opens a dialog", and it is
			 * what separates this control from the cell sockets, which record in one tap
			 * with no dialog at all. */
			btn('mt2-bar__btn--primary', 'plus', opts.r5 ? 'Log an action…' : 'Record…', 'accent');
			btn(null, 'undo', 'Undo');
			btn(null, 'next', 'End round ' + m.current_round);
			const more = btn('dse-btn--icon mt2-bar__more', 'more', null);
			more.setAttribute('aria-label', 'More montage actions');
			el(more, 'span', 'mt2-sr', 'More');
		}

		// The ⋯ overflow, rendered OPEN in one screenshot so the placement of the rare
		// controls is visible rather than asserted.
		if (opts.menu) {
			const menu = el(bar, 'div', 'mt2-menu');
			attr(menu, { role: 'menu' });
			function item(glyph, text, danger) {
				const i = el(menu, 'div', 'mt2-menu__item' + (danger ? ' mt2-menu__item--danger' : ''));
				attr(i, { role: 'menuitem' });
				icon(el(i, 'span', 'mt2-menu__glyph'), glyph);
				el(i, 'span', 'mt2-menu__text', text);
				return i;
			}
			item('plus', 'Add a round');
			item('userplus', 'Add a hero');
			item('hourglass', 'Set limits…');
			item('trash', 'Clear all', true);
		}
		return bar;
	}

	/**
	 * THE RECORD / CORRECT SHEET. Scott's original ticket case — "that 13 was really a
	 * 17" — is an EDIT, and an edit needs somewhere to change who / round / result /
	 * skill together. In the plugin this is a kit `managedModal` (the SC-186
	 * ConditionsModal precedent); here it is drawn in place so the data-entry path is
	 * visible in a screenshot rather than described in prose.
	 *
	 * Reached three ways, all of them touch-safe: tap a cell, tap a row's record button,
	 * or tap `Record…` in the bar.
	 */
	function sheet(parent, m, mode, r5) {
		const scrim = el(parent, 'div', 'mt2-sheet__scrim');
		const s = el(scrim, 'div', 'mt2-sheet');
		// ROUND 5: every surface that said "record" now says "log". The edit mode's verb
		// stays "correct" — correcting a logged action is a different act from logging one,
		// and it is the act Scott's original ticket case names ("that 13 was really a 17").
		attr(s, {
			role: 'dialog',
			'aria-label': mode === 'edit' ? (r5 ? 'Correct a logged action' : 'Correct a recorded action') : r5 ? 'Log an action' : 'Record an action',
		});

		const h = el(s, 'div', 'mt2-sheet__head');
		el(h, 'span', 'mt2-sheet__eyebrow', mode === 'edit' ? 'Correct' : r5 ? 'Log an action' : 'Record an action');
		// The title names the row the sheet will WRITE, pre-filled — opened from `Record…`
		// it is the current round and the next hero who has not acted; opened from a cell
		// it is that cell. Naming it in the title is what makes a pre-filled dialog safe:
		// you can see what it will change before you change anything.
		el(h, 'span', 'mt2-sheet__title', mode === 'edit' ? 'Bram · round 2' : 'Kira · round 3');
		el(
			h,
			'span',
			'mt4-sheet__sub',
			mode === 'edit' ? 'recorded as a failure with Lift' : 'next hero yet to act in the round in play',
		);

		function field(label, body) {
			const f = el(s, 'div', 'mt2-sheet__field');
			el(f, 'span', 'mt2-sheet__label', label);
			const b = el(f, 'div', 'mt2-sheet__body');
			body(b);
			return f;
		}

		field('Hero', function (b) {
			PARTY.forEach(function (p) {
				const c = el(b, 'span', 'mt2-sheet__chip', p.name);
				if ((mode === 'edit' && p.name === 'Bram') || (mode !== 'edit' && p.name === 'Kira')) {
					attr(c, { 'data-on': 'on' });
				}
			});
		});
		field('Round', function (b) {
			for (let r = 1; r <= m.rounds; r++) {
				const c = el(b, 'span', 'mt2-sheet__chip', r);
				if ((mode === 'edit' && r === 2) || (mode !== 'edit' && r === m.current_round)) attr(c, { 'data-on': 'on' });
			}
		});
		field('Result', function (b) {
			[
				['success', 'Success'],
				['failure', 'Failure'],
				['assist', 'Assist'],
			].forEach(function (pair) {
				const c = el(b, 'span', 'mt2-sheet__chip mt2-sheet__chip--result');
				attr(c, { 'data-kind': pair[0] });
				icon(el(c, 'span', 'mt2-sheet__chipglyph'), RESULT_ICON[pair[0]]);
				el(c, 'span', 'mt2-sheet__chiptext', pair[1]);
				// The correction Scott named: Bram's round-2 Lift was recorded as a
				// failure and is being changed to a success.
				if (mode === 'edit' && pair[0] === 'success') attr(c, { 'data-on': 'on' });
				if (mode !== 'edit' && pair[0] === 'success') attr(c, { 'data-on': 'on' });
			});
			/* ═══ ROUND 5 — THE TIER HINT ═══
			 *
			 * The sheet is the ADJUDICATION MOMENT: the Director has a number and a
			 * difficulty and has to decide which of these three chips to press. That is the
			 * only question the cheat sheet answers, so the answer belongs here too — in the
			 * one line the decision actually needs, which is where each difficulty's SUCCESS
			 * starts. (The riders — consequence, reward — do not change which chip you press,
			 * so they stay upstairs on the strip.)
			 *
			 * IT MUST NOT READ AS A WARNING. `.mt2-sheet__note` is the warn slot (orange,
			 * italic) and round 4 already had to un-paint one benign hint out of it. Round 5
			 * does not reuse that class at all: `.mt5-sheet__tierhint` is its own element
			 * with its own quiet treatment, so the bug has nothing to regress through. */
			if (r5) {
				const hint = el(b, 'span', 'mt5-sheet__tierhint');
				el(hint, 'span', 'mt5-sheet__tierhint-lead', 'success starts at');
				// The three tiers are ONE group: if the line has to wrap, it wraps between
				// the lead and the group, never between "medium" and "hard".
				const tiers = el(hint, 'span', 'mt5-sheet__tiers');
				[
					['easy', '≤11'],
					['medium', '12–16'],
					['hard', '17+'],
				].forEach(function (pair) {
					const t = el(tiers, 'span', 'mt5-tierhint');
					el(t, 'span', 'mt5-tierhint__diff', pair[0]);
					el(t, 'span', 'mt5-tierhint__band', pair[1]);
				});
			}
		});
		/* THE SKILL FIELD. Two corrections to round 3's version, both of them the same
		   mistake — a pre-filled dialog must not assert things it cannot know.
		   (a) A NEW record arrives with no skill chosen. Round 3 pre-filled "Insight",
		       which is the Director's call, not the card's; the placeholder asks instead.
		   (b) The hint under it was painted in `.mt2-sheet__note`, which is the WARNING
		       slot (`--dse-warn`, italic). "optional · +2 when applicable" is not a
		       warning, and an orange italic line under an empty optional field reads as
		       "you did something wrong". Only the skill-REUSE rule, which is a real
		       violation of Draw Steel Heroes:21286, keeps the warning treatment. */
		field('Skill', function (b) {
			// The edit sheet demonstrates the reuse guard FIRING, and round 3's version of
			// that demo was incoherent: it showed "Lift" with "already used by Bram", when
			// the entry being edited IS Bram's Lift. Corrected to a skill he used in a
			// DIFFERENT round, which is the case the rule actually forbids
			// (Draw Steel Heroes:21286 — "An individual character can't use the same skill
			// more than once in a montage test").
			const inp = el(b, 'div', 'mt2-sheet__input', mode === 'edit' ? 'Endurance' : 'which skill?');
			attr(inp, { 'data-placeholder': mode === 'edit' ? 'off' : 'on' });
			el(
				b,
				'span',
				'mt2-sheet__note' + (mode === 'edit' ? '' : ' mt4-sheet__hint'),
				mode === 'edit' ? 'Bram already used Endurance in round 1 — reuse is not allowed' : 'optional · +2 when applicable',
			);
			return inp;
		});

		/* THE NOTE FIELD — Scott's round-3 ask, verbatim: "Edit button should allow quick
		   notes for a test. For example, if a character makes a test and there is a
		   consequence that the Director wants to take note of, they should be able to hit
		   the edit button in the cell and type in something to remember later."
		 *
		 * It is a MULTI-LINE field and it is last. Last because it is the only optional
		 * free-text on the sheet and everything above it can be answered by tapping;
		 * multi-line because the thing being typed is a sentence about a consequence, and a
		 * single-line input that scrolls sideways is where such sentences go to be lost.
		 *
		 * The placeholder is the use case in the Director's own words rather than "Note…",
		 * because an empty optional field with a generic label is a field nobody ever
		 * fills in. */
		field('Note', function (b) {
			const inp = el(
				b,
				'div',
				'mt2-sheet__input mt4-sheet__area',
				mode === 'edit' ? 'Dropped the water cask. Mules are thirsty; +1 Malice next encounter.' : '',
			);
			attr(inp, { 'data-placeholder': mode === 'edit' ? 'off' : 'on' });
			if (mode !== 'edit') inp.textContent = 'a consequence to remember later…';
			el(b, 'span', 'mt2-sheet__note mt4-sheet__hint', 'optional · shown in the outcome band');
			return inp;
		});

		const foot = el(s, 'div', 'mt2-sheet__foot');
		function fbtn(text, glyph, variant) {
			const b = el(foot, 'button', 'dse-btn' + (variant ? ' dse-btn--' + variant : ''));
			attr(b, { type: 'button', 'aria-label': text });
			if (glyph) icon(el(b, 'span', 'dse-btn__icon'), glyph);
			el(b, 'span', 'dse-btn__text', text);
			return b;
		}
		if (mode === 'edit') fbtn('Remove', 'trash', 'danger');
		fbtn('Cancel', null, 'ghost');
		// The commit button carries the same verb as the control that opened the sheet, which
		// is the whole point of reconciling the surfaces: you press `Log an action…` and the
		// thing that finishes the job says `Log`.
		fbtn(mode === 'edit' ? 'Save' : r5 ? 'Log' : 'Record', 'check', 'accent');
		return scrim;
	}

	/* ------------------------------------------------------------------ */
	/*  THE BOARD — one DOM, six skins                                     */
	/* ------------------------------------------------------------------ */
	/*  Columns:  Hero │ Rd 1 … Rd N │ (+) │ Tally
	 *  Rows:     header │ one per hero │ (+ hero) │ round tally foot
	 *
	 *  The "skills used" column of round 1 is GONE per Scott's ruling — each cell still
	 *  names the skill it used, which is where he said the data already was.
	 */
	function board(parent, m, d, opts) {
		const wrap = el(parent, 'div', 'mt2-boardwrap');
		const b = el(wrap, 'div', 'mt2-board');
		attr(b, { role: 'table', 'data-complete': d.complete ? 'on' : 'off' });

		// `repeat(var(--n), …)` is not legal CSS, so the expanded track list is computed
		// here and handed to the sheet as ONE custom property — the sanctioned
		// setProperty('--dse-*') geometry seam (D2 §5): no inline colour, no inline px.
		// ═══ ROUND 5 — THE GHOST LANE IS GONE ═══
		//
		// Scott: "Some of the screenshots from this round had a '+' column to the left of
		// the 'tally' column - what is that, why do we need it, can we remove it?"
		//
		// WHAT IT WAS: a 1.9em ghost column past the last round with a "+" in its head — the
		// add-a-round affordance, placed where the next round would physically go on the
		// theory that a Director extending the montage looks for the control at the end of
		// the row rather than in a menu.
		//
		// WHY IT GOES: the fact that Scott had to ask is the answer. It also failed on its
		// own terms three times over — it never reads as a column (round 4 had to draw it a
		// second hairline just to stop it being mistaken for part of the Tally column), it
		// stands down entirely at sidebar width so the menu is already the real path, and it
		// spends a permanent column of the board's width on the rarest control on the card.
		// "Add a round" now lives in the ⋯ overflow alone, beside "add a hero" and
		// "set limits", which is where the other once-a-session controls already are.
		//
		// REMOVED FROM THE DOM, not hidden: a `display:none` grid item still consumes a slot
		// in `--mt2-cols` and shears every later row by a column, which is the same footgun
		// the round-tally row's deletion documented. The track list and the cells must agree.
		const lane = !d.complete && !opts.r5;
		const cols = ['minmax(6.2em, auto)'];
		for (let r = 0; r < m.rounds; r++) cols.push('minmax(5.2em, 1fr)');
		if (lane) cols.push('1.9em'); // the ghost "add a round" lane
		cols.push('minmax(4.4em, auto)');
		b.style.setProperty('--mt2-cols', cols.join(' '));

		function roundState(r) {
			if (d.complete) return 'past';
			return r < m.current_round ? 'past' : r === m.current_round ? 'current' : 'future';
		}

		/* --- header row ------------------------------------------------ */
		// THE UNIVERSAL CHANGE. The "add a hero" row is gone; the affordance is a small +
		// button riding in the Heroes header cell, where it extends the column it belongs
		// to. It sits beside the label rather than at the cell's far edge so it reads as
		// "add to THIS column" and not as a stray control floating in the header band.
		// Still duplicated in the ⋯ overflow, which is the path at sidebar width where the
		// whole header row stands down.
		const corner = el(b, 'div', 'mt2-board__corner');
		el(corner, 'span', 'mt2-board__cornerword', 'Hero');
		const addHero = el(corner, 'button', 'mt2-board__addhero');
		attr(addHero, { type: 'button', 'aria-label': 'Add a hero', title: 'Add a hero' });
		if (opts.hover === 'addhero') attr(addHero, { 'data-hover': 'on' });
		icon(el(addHero, 'span', 'mt2-board__addglyph'), 'plus');
		for (let r = 1; r <= m.rounds; r++) {
			const h = el(b, 'div', 'mt2-board__rhead');
			attr(h, { 'data-state': roundState(r), 'data-round': r });
			el(h, 'span', 'mt2-rhead__pip');
			const t = el(h, 'span', 'mt2-rhead__title');
			el(t, 'span', 'mt2-rhead__w', 'Round');
			el(t, 'span', 'mt2-rhead__n', r);
			el(h, 'span', 'mt2-rhead__sub', roundState(r) === 'current' ? 'in play' : roundState(r) === 'past' ? 'done' : 'to come');
		}
		// THE ADD-A-ROUND AFFORDANCE, in place. A Director who extends the montage looks
		// for the control where the next round would go, not in a menu — so a slim ghost
		// lane sits past the last round with a + in its head. (It is duplicated in the ⋯
		// menu, because at 300px this lane stands down.)
		if (lane) {
			const addcol = el(b, 'div', 'mt2-board__addcol');
			attr(addcol, { role: 'button', 'aria-label': 'Add a round', title: 'Add a round' });
			icon(el(addcol, 'span', 'mt2-board__addglyph'), 'plus');
		}
		el(b, 'div', 'mt2-board__thead', 'Tally');

		/* --- one row per hero ------------------------------------------ */
		// DEDUPE, PART 2 OF 3 (see the foot below): with the round-tally foot row gone,
		// the LAST hero row's bottom hairline lands 1px inside the board's own frame and
		// reads as a doubled rule. The row that is last has to know it is last; there is
		// no CSS selector for "the last N grid children of a row" that survives the
		// optional add-a-round lane.
		const lastHero = m.participants[m.participants.length - 1];
		// Round-4 DOM additions are gated on this, not only round4.css's
		// `:not([data-dedupe='before'])` scope — see the note mark and the edit chip below.
		const r4 = opts.dedupe !== 'before';
		m.participants.forEach(function (p) {
			const rows = entriesForHero(m, p.name);
			const isLast = !!opts.noFoot && p.name === lastHero.name;

			const nameCell = el(b, 'div', 'mt2-board__name');
			attr(nameCell, { 'data-hero': p.name, 'data-lastrow': isLast ? 'on' : null });
			const cr = el(nameCell, 'span', 'mt2-crest');
			cr.setAttribute('aria-hidden', 'true');
			el(cr, 'span', 'mt2-crest__mono', p.short);
			el(nameCell, 'span', 'mt2-board__who', p.name);
			// The per-ROW record control: the touch/narrow path to the same sheet, and the
			// answer to "the current round column is off-screen on a phone".
			const rowAct = el(nameCell, 'button', 'dse-btn dse-btn--icon mt2-board__rowact');
			attr(rowAct, {
				type: 'button',
				'aria-label': (opts.r5 ? 'Log' : 'Record') + ' an action for ' + p.name,
				title: (opts.r5 ? 'Log' : 'Record') + ' for ' + p.name,
			});
			icon(el(rowAct, 'span', 'dse-btn__icon'), 'plus');

			for (let r = 1; r <= m.rounds; r++) {
				const e = entryFor(m, p.name, r);
				const st = roundState(r);
				const cell = el(b, 'div', 'mt2-board__cell');
				attr(cell, {
					'data-kind': e ? e.result : 'none',
					'data-state': st,
					'data-round': r,
					'data-hero': p.name,
					'data-lastrow': isLast ? 'on' : null,
					'data-noted': e && e.note ? 'on' : null,
					role: 'button',
					tabindex: '0',
					'aria-label': e
						? p.name +
							', round ' +
							r +
							': ' +
							e.result +
							' with ' +
							e.skill +
							(e.note ? '. Note: ' + e.note : '') +
							' — edit'
						: p.name + ', round ' + r + (opts.r5 ? ': nothing logged — log an action' : ': not recorded — record'),
				});
				// The mock pins hover/focus on two cells so a STATIC screenshot can show
				// affordances that are otherwise a gesture away.
				if (opts.hoverCell && opts.hoverCell.who === p.name && opts.hoverCell.round === r) {
					attr(cell, { 'data-hover': 'on' });
				}

				if (e) {
					const face = el(cell, 'span', 'mt2-cell__face');
					icon(el(face, 'span', 'mt2-cell__glyph'), RESULT_ICON[e.result]);
					el(face, 'span', 'mt2-cell__skill', e.skill);
					// THE NOTE MARK. A cell has no room for the note text (the widest cell
					// here is 5.2em), so what it carries is the FACT of a note: a dog-eared
					// page in the cell's top-left, mirroring the edit control top-right.
					// It is a permanent mark, not hover-revealed — "there is something
					// written here" has to be true when nobody is pointing at the card.
					// The note's text lives in the outcome band, which is Scott's ruling:
					// "The footer portion that shows the outcome should list out these notes."
					// `before` must reproduce round 3's DOM, not only its CSS — a control that
					// quietly gained a note mark and a <button> would flatter the comparison.
					if (e.note && r4) {
						const nm = el(cell, 'span', 'mt4-cell__notemark');
						attr(nm, { 'aria-hidden': 'true', title: e.note });
						icon(nm, 'note');
					}
					// THE CORRECTION / NOTE AFFORDANCE — the button Scott said "needs some
					// padding/margin". It was a bare 0.7em pencil glyph jammed 0.15em from
					// the cell's corner, overlapping the focus outline and offering a ~9px
					// tap target. It is now a real chip: its own ground, its own hairline,
					// inset from the corner, and 1.5em square (a 24px target at default
					// scale, growing to 1.9em on a coarse pointer). Hover/focus-revealed on
					// desktop; the whole cell is the tap target on touch, so nothing is
					// gesture-only.
					const pip = el(cell, r4 ? 'button' : 'span', 'mt2-cell__pip');
					attr(
						pip,
						r4
							? {
									type: 'button',
									'aria-label': (e.note ? 'Edit note for ' : 'Correct ') + p.name + ', round ' + r,
									title: e.note ? 'Edit result and note' : 'Correct or add a note',
								}
							: { 'aria-hidden': 'true' },
					);
					icon(pip, 'pencil');
				} else if (st === 'current') {
					// THE OPEN SOCKET — the empty cell IS the record control, and it says so
					// without a hover. One tap on ✓ / ✕ / + records the common case whole;
					// tapping the socket itself opens the sheet when the skill matters.
					const q = el(cell, 'span', 'mt2-cell__quick');
					const verb = opts.r5 ? 'Log' : 'Record';
					[
						['success', verb + ' a success'],
						['failure', verb + ' a failure'],
						['assist', verb + ' an assist'],
					].forEach(function (pair) {
						const qb = el(q, 'button', 'mt2-quick');
						attr(qb, { type: 'button', 'data-kind': pair[0], 'aria-label': pair[1] + ' for ' + p.name + ' in round ' + r });
						icon(el(qb, 'span', 'mt2-quick__glyph'), RESULT_ICON[pair[0]]);
					});
					el(cell, 'span', 'mt2-cell__hint', 'to act');
				} else {
					const face = el(cell, 'span', 'mt2-cell__face');
					icon(el(face, 'span', 'mt2-cell__glyph mt2-cell__glyph--none'), 'dash');
					el(face, 'span', 'mt2-cell__skill mt2-cell__skill--none', st === 'past' ? 'no action' : '');
				}
			}

			// the ghost add-round lane, continued down the body
			if (lane) attr(el(b, 'div', 'mt2-board__addcell'), { 'data-lastrow': isLast ? 'on' : null });

			const t = el(b, 'div', 'mt2-board__total');
			attr(t, { 'data-hero': p.name, 'data-lastrow': isLast ? 'on' : null });
			function tallyPart(kind, n) {
				const s = el(t, 'span', 'mt2-tally');
				attr(s, { 'data-kind': kind });
				icon(el(s, 'span', 'mt2-tally__glyph'), RESULT_ICON[kind]);
				el(s, 'span', 'mt2-tally__n', n);
				return s;
			}
			tallyPart('success', rows.filter((x) => x.result === 'success').length);
			tallyPart('failure', rows.filter((x) => x.result === 'failure').length);
		});

		/* --- (the ghost "add a hero" ROW is deleted — see the header) --- */

		/* --- foot: per-round tallies ----------------------------------- */
		/* DEDUPE, PART 2 OF 3. Scott: "The card has so many places that show the same
		   information (namely the success/failure/round tallies). We dont need all these
		   places showing that information."
		 *
		 * This ROW is where the duplication is worst, and it is worth being precise about
		 * why, because its two halves fail for different reasons:
		 *
		 *   - The per-round cells restate a column that is five cells tall and directly
		 *     above them. "4 ✓ 1 ✕" under a column you can count in one saccade is a
		 *     rounding error's worth of information for a full board row.
		 *   - The bottom-right GRAND cell ("✓5 ✕2") is a literal duplicate of the outcome
		 *     band's totals, one band lower, set in a LARGER type than anything else in the
		 *     board — so the loudest number on the working surface is the one number the
		 *     footer exists to state.
		 *
		 * Deleting the row (not hiding it: a `display:none` grid item desyncs from
		 * `--mt2-cols` and shears every later row by a column) takes the card from four
		 * statements of the running totals to one, and buys back ~2.6em of height.
		 *
		 * The per-hero TALLY COLUMN survives the same axe on purpose. It is not a duplicate
		 * of anything: who is carrying the montage and who has burned a failure appears
		 * nowhere else on the card, and unlike the round columns it is what a Director scans
		 * when deciding who should act next. */
		if (opts.noFoot) return wrap;

		el(b, 'div', 'mt2-board__footlab', 'Round tally');
		for (let r = 1; r <= m.rounds; r++) {
			const rows = entriesFor(m, r);
			const f = el(b, 'div', 'mt2-board__foot');
			attr(f, { 'data-state': roundState(r) });
			function footPart(kind, n) {
				const s = el(f, 'span', 'mt2-tally');
				attr(s, { 'data-kind': kind });
				icon(el(s, 'span', 'mt2-tally__glyph'), RESULT_ICON[kind]);
				el(s, 'span', 'mt2-tally__n', n);
				return s;
			}
			footPart('success', rows.filter((x) => x.result === 'success').length);
			footPart('failure', rows.filter((x) => x.result === 'failure').length);
		}
		if (lane) el(b, 'div', 'mt2-board__addfoot');
		const grand = el(b, 'div', 'mt2-board__grand');
		function grandPart(kind, n) {
			const s = el(grand, 'span', 'mt2-tally mt2-tally--grand');
			attr(s, { 'data-kind': kind });
			icon(el(s, 'span', 'mt2-tally__glyph'), RESULT_ICON[kind]);
			el(s, 'span', 'mt2-tally__n', n);
			return s;
		}
		grandPart('success', d.successes);
		grandPart('failure', d.failures);

		return wrap;
	}

	/* ------------------------------------------------------------------ */
	/*  The card                                                           */
	/* ------------------------------------------------------------------ */
	function buildCard(root, m, d, opts) {
		const c = el(root, 'div', 'mt2');
		// `data-treat='roster'` and the three round-3 axes are FIXED at the recommended
		// composite — round 4 iterates the decision, it does not re-open it. `data-dedupe`
		// is the one attribute still carrying a question.
		attr(c, {
			'data-treat': 'roster',
			'data-state': opts.state,
			'data-complete': d.complete ? 'on' : 'off',
			'data-crest': opts.crest,
			'data-seal': opts.seal,
			'data-space': opts.space,
			'data-dedupe': opts.dedupe,
			// ROUND 5's gate. round5.css is scoped entirely on this attribute, and every
			// round-5 DOM addition tests `opts.r5`, so `?r5=off` is round 4 verbatim — CSS
			// and DOM both. Round 4 learned the hard way that scoping the sheet alone is not
			// enough: a `<button>`'s UA padding leaked a 2.7% height change into its own
			// control.
			'data-r5': opts.r5 ? 'on' : 'off',
			'data-cheat': opts.r5 ? opts.cheatPlace : null,
		});
		head(c, m, d, opts);
		brief(c, m);
		// The strip goes between the brief and the board — Scott asked for it "above the
		// table", and above the table is also where a lookup belongs relative to the thing
		// you are looking things up FOR. The brief stays first because it is what the
		// montage IS; the strip is how to run it.
		if (opts.r5) cheatStrip(c, opts.cheatOpen, opts.cheatPlace);
		board(c, m, d, opts);
		if (opts.dedupe === 'before') {
			progress(c, m, d);
			verdict(c, m, d);
		} else {
			outcome(c, m, d, opts);
		}
		actionBar(c, m, d, opts);
		if (opts.dedupe !== 'before') guide(c, opts.guide, !!(opts.r5 && opts.cheatOpen));
		if (opts.sheet) sheet(c, m, opts.sheet, !!opts.r5);
		return c;
	}

	/* ------------------------------------------------------------------ */
	/*  Boot                                                               */
	/* ------------------------------------------------------------------ */
	/* THE ROUND-3 AXES ARE DECIDED. `crest=none` is Scott's explicit ruling; `seal=ink`
	 * and `space=centre` are the working assumption the decisions ledger records —
	 * every round-3 bullet he wrote responds to the composite that carried them, and the
	 * verdict was "Overall looking good". `?dedupe=before` still renders round 3's card
	 * verbatim (both bands, both head chips, the round-tally foot row) so the round-4
	 * cleanup is compared against a real control rather than a memory of one. */
	const AXES = { crest: 'none', seal: 'ink', space: 'centre' };

	function boot() {
		const q = new URLSearchParams(window.location.search);
		const axes = Object.assign({}, AXES);
		// merged (recommended) | bars-off (the alternative Scott floated) | before (round 3)
		const dedupe = (q.get('dedupe') || 'merged').toLowerCase();
		if (['merged', 'bars-off', 'before'].indexOf(dedupe) < 0) throw new Error('unknown dedupe: ' + dedupe);
		const stateKey = (q.get('state') || 'mid').toLowerCase();
		const bg = q.get('bg') === 'light' ? 'light' : 'dark';
		const width = Number(q.get('width'));
		const menu = q.get('menu') === 'on';
		const sheetMode = q.get('sheet') || null;
		// COLLAPSED BY DEFAULT, exactly as asked. `?guide=open` is the screenshot of the
		// other state; nothing else in the page opens it.
		const guideOpen = q.get('guide') === 'open';
		// ROUND 5's control. `?r5=off` renders round 4's `merged` card verbatim so the
		// before/after pair is a real pair. `before` (round 3) predates round 5 entirely and
		// can never carry it.
		const r5 = q.get('r5') !== 'off' && dedupe !== 'before';
		// WHERE THE CHEAT SHEET'S TOGGLE LIVES — the one open axis of this round.
		const cheatPlace = (q.get('cheat') || 'handle').toLowerCase();
		if (['handle', 'chip'].indexOf(cheatPlace) < 0) throw new Error('unknown cheat placement: ' + cheatPlace);
		// PINNED, NOT PEEKED: closed is the first-run state, and once opened it stays open.
		// `?strip=open` is the pinned screenshot.
		const cheatOpen = q.get('strip') === 'open';

		document.body.classList.remove('theme-dark', 'theme-light');
		document.body.classList.add(bg === 'light' ? 'theme-light' : 'theme-dark');
		// THE COLOURBLIND PROOF. Scott is colourblind, so "success and failure must be
		// legible without colour" is a requirement, not a nicety — and the honest way to
		// check it is to look at the design with every hue removed rather than to assert
		// that five channels exist. `?gray=on` renders exactly the same DOM through a
		// greyscale filter; if a shot survives that, colour is genuinely the last channel.
		document.getElementById('mount').style.filter = q.get('gray') === 'on' ? 'grayscale(1)' : '';

		const src = STATES[stateKey];
		if (!src) throw new Error('unknown state: ' + stateKey);
		const m = Object.assign({}, BASE, src);
		const d = derive(m);

		const mount = document.getElementById('mount');
		mount.innerHTML = '';
		mount.style.width = Number.isFinite(width) && width > 0 ? width + 'px' : '820px';

		// The exact root attributes ElementPipeline stamps (framework/pipeline.ts:456)
		// plus the theme seam's data-dse-theme, so every Steel-scoped rule applies.
		const root = el(mount, 'div', null);
		attr(root, { 'data-dse-element': 'montage', 'data-dse-theme': 'steel' });

		buildCard(root, m, d, {
			state: stateKey,
			menu: menu,
			sheet: sheetMode,
			crest: axes.crest,
			seal: axes.seal,
			space: axes.space,
			dedupe: dedupe,
			guide: guideOpen,
			r5: r5,
			cheatPlace: cheatPlace,
			cheatOpen: cheatOpen,
			// The two derived switches the dedupe axis drives.
			noFoot: dedupe !== 'before',
			bars: dedupe !== 'bars-off',
			hover: q.get('hover') || null,
			// Pin the correction affordance open on the entry Scott's ticket case names:
			// Bram's round-2 Lift, recorded as a failure, about to become a success — and
			// now also the cell that carries a note, so one shot shows the note mark, the
			// edit chip and the focus ring together.
			hoverCell: stateKey === 'mid' ? { who: 'Bram', round: 2 } : null,
		});

		window.__sc191r5Done = {
			dedupe: dedupe,
			axes: axes,
			state: stateKey,
			bg: bg,
			guide: guideOpen,
			r5: r5,
			cheat: cheatPlace,
			strip: cheatOpen,
		};
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
	else boot();
})();
