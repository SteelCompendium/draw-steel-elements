/* SC-191 ROUND 2 — visual treatments of Candidate C ("The Muster Board").
 *
 * WHAT CHANGED SINCE ROUND 1. Scott picked C's STRUCTURE (heroes down, rounds across:
 * "its easy to figure out how to use this design and it merges the data and structure
 * together") and rejected its LOOK ("super ugly and stale"). He also ruled the
 * "skills used" column out ("the data is readable in the other columns") and asked
 * that the interaction affordances be designed IN, not bolted on later.
 *
 * So this file builds ONE board — one DOM, one information architecture — and paints it
 * six ways via a single `data-treat` attribute on the card root. That is deliberate:
 * if the treatments shared no DOM they would be six designs, and the question on the
 * table is which SKIN fits the structure Scott already chose. Every difference between
 * the six screenshots is a CSS difference.
 *
 * WHY A SEPARATE PAGE (unchanged from round 1). A mock outside `visual-harness/entry.ts`'s
 * manifest cannot add a capture id, cannot add a fixture and cannot touch
 * `styles-source.css`, so the print freeze is safe BY CONSTRUCTION. It still renders in
 * the real environment: Obsidian's vendored variables (`../vars.css`) plus the compiled
 * plugin sheet (`../dist/harness.css`), under the same `data-dse-element`/`data-dse-theme`
 * root attributes `ElementPipeline` stamps.
 *
 * RULES GROUND TRUTH (workspace `reference/`, read-only) — citations carried over from
 * round 1's report, not re-derived:
 *   reference/draw-steel-agent-reference.md:89-98 · reference/draw-steel-reference.md:252-254
 *     - lasts 2 rounds by default; each hero gets ONE action per round (test / assist /
 *       use an ability); a hero can't reuse a skill within the montage; the Director sets
 *       a success limit and a failure limit; three outcomes — TOTAL SUCCESS (successes hit
 *       the success limit), PARTIAL SUCCESS (time or failures run out but successes exceed
 *       failures by 2+), TOTAL FAILURE; total + hard partial award Victories.
 *   reference/draw-steel-agent-reference.md:66 — an applicable skill grants +2.
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
	   two rounds of design are directly comparable. */
	const HISTORY = [
		{ round: 1, who: 'Kira', result: 'success', skill: 'Nature' },
		{ round: 1, who: 'Bram', result: 'success', skill: 'Endurance' },
		{ round: 1, who: 'Osric', result: 'failure', skill: 'Climb' },
		{ round: 1, who: 'Yenna', result: 'success', skill: 'Lead' },
		{ round: 1, who: 'Talin', result: 'success', skill: 'Navigate' },
		{ round: 2, who: 'Kira', result: 'success', skill: 'Alertness' },
		{ round: 2, who: 'Bram', result: 'failure', skill: 'Lift' },
		{ round: 2, who: 'Osric', result: 'assist', skill: 'Search' },
		{ round: 2, who: 'Yenna', result: 'assist', skill: 'Persuade' },
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

		return {
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

	/** The real kit `cardHead` DOM (src/framework/kit/cardHead.ts), hand-built. */
	function head(parent, m, d) {
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
		el(h, 'span', 'mt2-sheet__eyebrow', mode === 'edit' ? 'Correct' : 'Record');
		el(h, 'span', 'mt2-sheet__title', mode === 'edit' ? 'Bram · Round 2' : 'New action');

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
		field('Skill', function (b) {
			const inp = el(b, 'div', 'mt2-sheet__input', mode === 'edit' ? 'Lift' : 'Insight');
			attr(inp, { 'data-placeholder': 'off' });
			el(b, 'span', 'mt2-sheet__note', mode === 'edit' ? 'already used by Bram — reuse is not allowed' : 'optional · +2 when applicable');
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
		el(b, 'div', 'mt2-board__corner', 'Hero');
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
		m.participants.forEach(function (p) {
			const rows = entriesForHero(m, p.name);

			const nameCell = el(b, 'div', 'mt2-board__name');
			attr(nameCell, { 'data-hero': p.name });
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
					role: 'button',
					tabindex: '0',
					'aria-label': e
						? p.name + ', round ' + r + ': ' + e.result + ' with ' + e.skill + ' — edit'
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
					// THE CORRECTION AFFORDANCE. Hover/focus-revealed on desktop; the whole
					// cell is the tap target on touch, so nothing is gesture-only.
					const pip = el(cell, 'span', 'mt2-cell__pip');
					attr(pip, { 'aria-hidden': 'true' });
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
			if (lane) el(b, 'div', 'mt2-board__addcell');

			const t = el(b, 'div', 'mt2-board__total');
			attr(t, { 'data-hero': p.name });
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

		/* --- the ghost "add a hero" row -------------------------------- */
		// Same argument as the add-a-round lane: the control sits where the thing it makes
		// would appear. `participants[]` already exists in the model, so this is a real
		// buildable action, not a promise.
		if (lane) {
			const addrow = el(b, 'div', 'mt2-board__addrow');
			attr(addrow, { role: 'button', tabindex: '0', 'aria-label': 'Add a hero' });
			icon(el(addrow, 'span', 'mt2-board__addglyph'), 'userplus');
			el(addrow, 'span', 'mt2-board__addword', 'Add a hero');
		}

		/* --- foot: per-round tallies ----------------------------------- */
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
		attr(c, { 'data-treat': opts.treat, 'data-state': opts.state, 'data-complete': d.complete ? 'on' : 'off' });
		head(c, m, d);
		brief(c, m);
		board(c, m, d, opts);
		progress(c, m, d);
		verdict(c, m, d);
		actionBar(c, m, d, opts);
		if (opts.sheet) sheet(c, m, opts.sheet);
		return c;
	}

	/* ------------------------------------------------------------------ */
	/*  Boot                                                               */
	/* ------------------------------------------------------------------ */
	function boot() {
		const q = new URLSearchParams(window.location.search);
		const treat = (q.get('treat') || 'set').toLowerCase();
		const stateKey = (q.get('state') || 'mid').toLowerCase();
		const bg = q.get('bg') === 'light' ? 'light' : 'dark';
		const width = Number(q.get('width'));
		const menu = q.get('menu') === 'on';
		const sheetMode = q.get('sheet') || null;

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
			treat: treat,
			state: stateKey,
			menu: menu,
			sheet: sheetMode,
			// Pin the correction affordance open on the entry Scott's ticket case names:
			// Bram's round-2 Lift, recorded as a failure, about to become a success.
			hoverCell: stateKey === 'mid' ? { who: 'Bram', round: 2 } : null,
		});

		window.__sc191r2Done = { treat: treat, state: stateKey, bg: bg };
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
	else boot();
})();
