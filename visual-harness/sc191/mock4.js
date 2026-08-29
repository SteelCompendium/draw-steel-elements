/* SC-191 ROUND 4 — dedupe, padding, rules guidance, per-test notes.
 *
 * THE BASE. Round 3 asked three questions; Scott answered the first outright ("I think I
 * want hero name cells to not have any crests to save some space") and answered the other
 * two by implication ("Overall looking good" against the recommended composite). So the
 * three axes are FROZEN here at the round-3 recommendation —
 *
 *   crest = none · seal = ink · space = centre
 *
 * — and are no longer variables. round4.css layers on round3.css layers on round2.css,
 * so that composite is produced by the exact code path Scott reviewed rather than by a
 * re-implementation of it.
 *
 * WHAT ROUND 4 ADDS, one bullet of Scott's per item:
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
	function guide(parent, open) {
		const g = el(parent, 'div', 'mt4-guide');
		attr(g, { 'data-open': open ? 'on' : 'off' });

		const sum = el(g, 'button', 'mt4-guide__summary');
		attr(sum, { type: 'button', 'aria-expanded': open ? 'true' : 'false' });
		icon(el(sum, 'span', 'mt4-guide__twisty'), 'chevron');
		el(sum, 'span', 'mt4-guide__title', 'Running a montage test');
		el(sum, 'span', 'mt4-guide__hint', 'test tiers · limits · outcomes');
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
		const tiers = block(GUIDE.tiers, 'wide');
		table(tiers, GUIDE.tiers);

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
			btn('mt2-bar__btn--primary', 'plus', 'Record…', 'accent');
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
	function sheet(parent, m, mode) {
		const scrim = el(parent, 'div', 'mt2-sheet__scrim');
		const s = el(scrim, 'div', 'mt2-sheet');
		attr(s, { role: 'dialog', 'aria-label': mode === 'edit' ? 'Correct a recorded action' : 'Record an action' });

		const h = el(s, 'div', 'mt2-sheet__head');
		el(h, 'span', 'mt2-sheet__eyebrow', mode === 'edit' ? 'Correct' : 'Record an action');
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
		fbtn(mode === 'edit' ? 'Save' : 'Record', 'check', 'accent');
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
		// A FINISHED montage has no lane to add a round into, so the lane is not rendered
		// at all — neither the track nor its cells. Hiding grid items with `display:none`
		// instead (the first cut) removes them from auto-placement and shears every later
		// row by one column; the track list and the cells must agree.
		const lane = !d.complete;
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
			attr(rowAct, { type: 'button', 'aria-label': 'Record an action for ' + p.name, title: 'Record for ' + p.name });
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
						: p.name + ', round ' + r + ': not recorded — record',
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
					[
						['success', 'Record a success'],
						['failure', 'Record a failure'],
						['assist', 'Record an assist'],
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
		});
		head(c, m, d, opts);
		brief(c, m);
		board(c, m, d, opts);
		if (opts.dedupe === 'before') {
			progress(c, m, d);
			verdict(c, m, d);
		} else {
			outcome(c, m, d, opts);
		}
		actionBar(c, m, d, opts);
		if (opts.dedupe !== 'before') guide(c, opts.guide);
		if (opts.sheet) sheet(c, m, opts.sheet);
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

		window.__sc191r4Done = { dedupe: dedupe, axes: axes, state: stateKey, bg: bg, guide: guideOpen };
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
	else boot();
})();
