/* SC-191 — montage overhaul DESIGN ROUND. Rendered mocks, not production code.
 *
 * WHY A SEPARATE PAGE RATHER THAN A HIDDEN PREF. Scott asked for ideas and pictures
 * BEFORE implementation, and the constraint on this round is that the default
 * rendering — and therefore the 196-file freeze baseline — cannot move. A mock page
 * that lives outside `visual-harness/entry.ts`'s manifest cannot add a capture id,
 * cannot add a fixture, and cannot touch `styles-source.css`, so the freeze is safe
 * BY CONSTRUCTION rather than by care. It still renders inside the real environment:
 * Obsidian's vendored variables (`../vars.css`) plus the compiled plugin sheet
 * (`../dist/harness.css`), under the same `data-dse-element` / `data-dse-theme`
 * root attributes `ElementPipeline` stamps — so every `--dse-*` token, the card
 * plate recipe, `.dse-head`, `.dse-crest` and the type-size role scale resolve
 * exactly as they would in the plugin.
 *
 * RULES GROUND TRUTH (workspace `reference/`, read-only):
 *   reference/draw-steel-agent-reference.md:89-98 "Montage Tests"
 *   reference/draw-steel-reference.md:252-254    "Montage Tests"
 *     - lasts 2 rounds by default; each hero gets ONE action per round: make a
 *       test, assist, or use an ability;
 *     - a hero can't reuse the same skill within a montage test;
 *     - the Director sets a success limit and a failure limit from difficulty and
 *       party size;
 *     - three outcomes: TOTAL SUCCESS (successes hit the success limit), PARTIAL
 *       SUCCESS (time or failures run out but successes exceed failures by 2+),
 *       TOTAL FAILURE otherwise;
 *     - total success and hard partial success award Victories.
 *   Having an applicable skill grants +2 (agent-reference:66).
 * Every derived number below traces to one of those lines — see `derive()`.
 */
(function () {
	'use strict';

	/* ------------------------------------------------------------------ */
	/*  Tiny DOM helper (this page has no Obsidian `createDiv` sugar)      */
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

	/* Lucide-shaped inline glyphs. The real element would call Obsidian's `setIcon`;
	   a static page has no Lucide bundle, so these are transcriptions of the same
	   icons at the same 24-grid / 2px-stroke geometry. */
	const ICON = {
		check: '<path d="M20 6 9 17l-5-5"/>',
		x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
		plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
		flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
		hourglass:
			'<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22"/><path d="M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2"/>',
		mountain: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>',
		skull:
			'<circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><path d="M8 20v2h8v-2"/><path d="m12.5 17-.5-1-.5 1h1z"/><path d="M16 20a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20"/>',
		trophy:
			'<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
		users:
			'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
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
	/*  The mock model                                                     */
	/* ------------------------------------------------------------------ */
	/* Deliberately the "one from Total Success" state Scott named on the ticket:
	   5/6 successes, 2/3 failures, on the LAST of three rounds. Five heroes so a
	   round column really does have to hold several markers (round 1 holds five). */
	const M = {
		title: 'Cross the Ashfall Wastes',
		description:
			'Forty miles of volcanic waste, and the ashfall is three days behind them. ' +
			'The heroes have to find the pass, keep the mules alive, and reach the Cinder ' +
			'Gate before the sky closes over it.',
		rounds: 3,
		success_limit: 6,
		failure_limit: 3,
		current_round: 3,
		participants: [
			{ name: 'Kira', short: 'KI' },
			{ name: 'Bram', short: 'BR' },
			{ name: 'Osric', short: 'OS' },
			{ name: 'Yenna', short: 'YE' },
			{ name: 'Talin', short: 'TA' },
		],
		/* One entry = one hero's action in one round. `assist` consumes the hero's
		   action (rules: test / assist / use an ability) but adds no tally — which is
		   exactly why "actions left" and "successes needed" are different numbers. */
		entries: [
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
		],
	};

	/* ------------------------------------------------------------------ */
	/*  Derived rules state — every line cites the rule it comes from      */
	/* ------------------------------------------------------------------ */
	function derive(m) {
		const successes = m.entries.filter((e) => e.result === 'success').length;
		const failures = m.entries.filter((e) => e.result === 'failure').length;
		const party = m.participants.length;

		// "Lasts 2 rounds (default)" — rounds is Director-set; the current round is
		// inclusive, so round 3 of 3 means ONE round remains.
		const roundsLeft = Math.max(0, m.rounds - m.current_round + 1);
		// "Each hero gets one action per round" — an upper bound on how many more
		// TESTS can be made, since an assist or an ability use spends the same action
		// and produces no tally. Reported as a ceiling, never as a promise.
		const actionsLeft = roundsLeft * party - m.entries.filter((e) => e.round === m.current_round).length;
		// "Total success (hit success limit)".
		const toTotal = Math.max(0, m.success_limit - successes);
		// The montage ends when failures reach the failure limit OR time runs out.
		const failuresSpare = Math.max(0, m.failure_limit - failures);
		// "Partial success (time/failures run out but successes exceed failures by 2+)".
		const margin = successes - failures;
		const partialHeld = margin >= 2;
		// Reachability: Total Success needs `toTotal` more successes and there are at
		// most `actionsLeft` tests left in the montage.
		const totalReachable = toTotal <= actionsLeft;

		let band = 'failure';
		if (toTotal === 0) band = 'total';
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
			// The "announce it" state: one success from Total Success, and it is still
			// reachable. Carried as its own attribute so shape/label, not just colour,
			// can react to it.
			brink: toTotal === 1 && totalReachable,
		};
	}

	const BAND_WORD = { total: 'Total Success', partial: 'Partial Success', failure: 'Total Failure' };
	const BAND_ICON = { total: 'trophy', partial: 'flag', failure: 'skull' };

	function entriesFor(m, round) {
		return m.entries.filter((e) => e.round === round);
	}
	function entriesForHero(m, name) {
		return m.entries.filter((e) => e.who === name);
	}

	/* ------------------------------------------------------------------ */
	/*  Shared parts                                                       */
	/* ------------------------------------------------------------------ */

	/** The real kit `cardHead` DOM (src/framework/kit/cardHead.ts), hand-built. */
	function head(parent, m, d, crestIcon) {
		const wrap = el(parent, 'div', 'mtx__head');
		const h = el(wrap, 'div', 'dse-head');

		const crest = el(h, 'span', 'dse-crest dse-crest--lg');
		crest.setAttribute('aria-hidden', 'true');
		const glyph = el(crest, 'span', 'dse-crest__glyph');
		icon(glyph, crestIcon);

		el(h, 'span', 'dse-head__eyebrow dse-head__eyebrow--left dse-head__eyebrow--line', 'Montage Test');
		const name = el(h, 'span', 'dse-head__primary dse-head__primary--left dse-head__primary--line', m.title);
		attr(name, { role: 'heading', 'aria-level': '2' });
		el(
			h,
			'span',
			'dse-head__deck dse-head__deck--left dse-head__deck--line',
			d.party + ' heroes · one action each per round',
		);

		el(h, 'span', 'dse-head__eyebrow dse-head__eyebrow--right dse-head__eyebrow--chip', 'Round ' + m.current_round + ' / ' + m.rounds);
		el(h, 'span', 'dse-head__primary dse-head__primary--right dse-head__primary--chip', d.successes + ' / ' + m.success_limit + ' successes');
		el(h, 'span', 'dse-head__deck dse-head__deck--right dse-head__deck--chip', d.failures + ' / ' + m.failure_limit + ' failures');
		return wrap;
	}

	/** The montage's own description — a Director's brief, above the instrument. */
	function brief(parent, m) {
		if (!m.description) return null;
		const b = el(parent, 'div', 'mtx__brief');
		el(b, 'p', 'mtx__brief-text', m.description);
		return b;
	}

	/**
	 * The rules readout. THE point of this band: the montage's three thresholds are
	 * Director-set numbers that a player never sees the shape of, so the card states
	 * (a) what would happen if the montage ended on this beat, (b) the distance to
	 * each threshold, and (c) the rule each distance comes from, in words.
	 */
	function verdict(parent, m, d, opts) {
		opts = opts || {};
		const v = el(parent, 'div', 'mtx-verdict');
		attr(v, { 'data-band': d.band, 'data-brink': d.brink ? 'on' : 'off' });

		const now = el(v, 'div', 'mtx-verdict__now');
		const crest = el(now, 'span', 'mtx-verdict__crest');
		crest.setAttribute('aria-hidden', 'true');
		icon(crest, BAND_ICON[d.band]);
		const words = el(now, 'div', 'mtx-verdict__words');
		el(words, 'span', 'mtx-verdict__eyebrow', 'If it ended now');
		el(words, 'span', 'mtx-verdict__word', BAND_WORD[d.band]);

		const stats = el(v, 'div', 'mtx-verdict__stats');
		function stat(value, label, kind) {
			const s = el(stats, 'div', 'mtx-stat');
			attr(s, { 'data-kind': kind });
			el(s, 'span', 'mtx-stat__value', value);
			el(s, 'span', 'mtx-stat__label', label);
			return s;
		}
		stat(d.toTotal, d.toTotal === 1 ? 'success from Total' : 'successes from Total', 'success');
		stat(d.failuresSpare, d.failuresSpare === 1 ? 'failure to spare' : 'failures to spare', 'failure');
		stat(d.actionsLeft, 'hero actions left', 'actions');

		if (!opts.noRules) {
			const rules = el(v, 'div', 'mtx-verdict__rules');
			el(
				rules,
				'span',
				'mtx-verdict__rule',
				'Total Success at ' + m.success_limit + ' successes.',
			);
			el(
				rules,
				'span',
				'mtx-verdict__rule',
				'Ends at ' + m.failure_limit + ' failures or after round ' + m.rounds + '.',
			);
			el(
				rules,
				'span',
				'mtx-verdict__rule',
				'Partial Success needs successes to lead failures by 2 — currently +' + d.margin + '.',
			);
		}

		if (d.brink) {
			const alert = el(v, 'div', 'mtx-verdict__alert');
			el(alert, 'span', 'mtx-verdict__alert-mark', '◆');
			el(alert, 'span', 'mtx-verdict__alert-text', 'One success from Total Success');
		}
		return v;
	}

	/**
	 * One marker. THE colourblind contract, four redundant channels, colour last:
	 *   1. POSITION  — above the axis (success) vs below it (failure).
	 *   2. SILHOUETTE— the tile is chamfered on the face pointing AWAY from the axis,
	 *                  so a success tile is a roof and a failure tile is a keel.
	 *   3. MATERIAL  — success is raised and polished; failure is a recessed engraved
	 *                  hatch (the same "engraved reserve" gesture the stamina gauge
	 *                  uses for the dying zone); an assist is a hollow ring.
	 *   4. GLYPH     — ✓ / ✕ / + drawn as a real icon, not a coloured dot.
	 * Colour (`--dse-turn-done` / `--dse-danger`) is the fifth channel and carries
	 * nothing on its own.
	 */
	function marker(parent, entry, opts) {
		opts = opts || {};
		const mk = el(parent, 'span', 'mtx-mark');
		attr(mk, {
			'data-kind': entry.result,
			title: entry.who + ' · ' + entry.skill + ' · ' + entry.result,
		});
		const g = el(mk, 'span', 'mtx-mark__glyph');
		icon(g, entry.result === 'success' ? 'check' : entry.result === 'failure' ? 'x' : 'plus');
		if (opts.who !== false) {
			// THE ATTRIBUTION SLOT. There is no party model today, so this is whatever
			// `by:` said — a free-text name. A future ds-party binding fills the same box.
			el(mk, 'span', 'mtx-mark__who', short(entry.who));
		}
		if (opts.skill) el(mk, 'span', 'mtx-mark__skill', entry.skill);
		return mk;
	}
	function short(name) {
		const p = M.participants.filter((x) => x.name === name)[0];
		return p ? p.short : name.slice(0, 2).toUpperCase();
	}

	/** A vertical slot track: `limit` engraved slots, `filled` of them struck. */
	function slotTrack(parent, filled, limit, kind, dir) {
		const t = el(parent, 'div', 'mtx-slots');
		attr(t, { 'data-kind': kind, 'data-dir': dir });
		for (let i = 0; i < limit; i++) {
			const s = el(t, 'span', 'mtx-slots__slot');
			// dir 'up' fills from the axis outward, so the nearest slot is index 0.
			const idx = dir === 'up' ? limit - 1 - i : i;
			attr(s, { 'data-filled': idx < filled ? 'on' : 'off' });
			if (idx === limit - 1) attr(s, { 'data-goal': 'on' });
		}
		return t;
	}

	/* ------------------------------------------------------------------ */
	/*  CANDIDATE A — "The Muster Rail"                                    */
	/*  Scott's sketch, forged: rounds along a horizontal engraved rail,   */
	/*  successes stacked above it, failures below, and a TOTAL column     */
	/*  past a heavy bulkhead carrying the two goal tracks.                */
	/* ------------------------------------------------------------------ */
	function candidateA(root, m) {
		const d = derive(m);
		const c = el(root, 'div', 'mtx mtx--a');
		head(c, m, d, 'mountain');
		brief(c, m);

		const railWrap = el(c, 'div', 'mtx-rail__wrap');
		const rail = el(railWrap, 'div', 'mtx-rail');

		// Gutter: the lane labels. These are what make "above = success" readable
		// without ever consulting colour, and they are the first thing to shrink.
		const gut = el(rail, 'div', 'mtx-rail__gutter');
		const gu = el(gut, 'span', 'mtx-rail__lane mtx-rail__lane--up');
		el(gu, 'span', 'mtx-rail__lane-mark', '▲');
		el(gu, 'span', 'mtx-rail__lane-word', 'Successes');
		// The word lives in a CHILD span: at sidebar width the word stands down but the
		// grid CELL must not, or `grid-auto-flow: column` reflows every later cell by one
		// lane and the whole rail shears (observed in round 1's 300px shot).
		const gax = el(gut, 'span', 'mtx-rail__axis-label');
		el(gax, 'span', 'mtx-rail__lane-word', 'Round');
		const gd = el(gut, 'span', 'mtx-rail__lane mtx-rail__lane--down');
		el(gd, 'span', 'mtx-rail__lane-mark', '▼');
		el(gd, 'span', 'mtx-rail__lane-word', 'Failures');

		for (let r = 1; r <= m.rounds; r++) {
			const col = el(rail, 'div', 'mtx-col');
			attr(col, {
				'data-state': r < m.current_round ? 'past' : r === m.current_round ? 'current' : 'future',
			});
			const rows = entriesFor(m, r);
			const up = el(col, 'div', 'mtx-col__up');
			rows.filter((e) => e.result === 'success').forEach((e) => marker(up, e));
			const ax = el(col, 'div', 'mtx-col__axis');
			el(ax, 'span', 'mtx-col__num', r);
			const down = el(col, 'div', 'mtx-col__down');
			rows.filter((e) => e.result === 'failure').forEach((e) => marker(down, e));
			// Assists spend an action but tally nothing — shown as a quiet foot count so
			// the column's "who acted" total reconciles with the party size.
			const assists = rows.filter((e) => e.result === 'assist').length;
			if (assists > 0) {
				const a = el(down, 'span', 'mtx-col__assists');
				el(a, 'span', 'mtx-col__assists-n', assists);
				el(a, 'span', 'mtx-col__assists-w', assists === 1 ? 'assist' : 'assists');
			}
		}

		// The TOTAL column, behind a real bulkhead — the same two-tone edge the stamina
		// gauge uses for its zero bulkhead, because this is the same kind of boundary:
		// everything left of it is history, everything right of it is the goal.
		const tally = el(rail, 'div', 'mtx-col mtx-col--tally');
		const tup = el(tally, 'div', 'mtx-col__up');
		slotTrack(tup, d.successes, m.success_limit, 'success', 'up');
		const tax = el(tally, 'div', 'mtx-col__axis');
		el(tax, 'span', 'mtx-col__num mtx-col__num--total', 'Total');
		const tdown = el(tally, 'div', 'mtx-col__down');
		slotTrack(tdown, d.failures, m.failure_limit, 'failure', 'down');

		verdict(c, m, d);
		return c;
	}

	/* ------------------------------------------------------------------ */
	/*  CANDIDATE B — "The Twin Channel"                                   */
	/*  The 2-axis idea re-assigned: the horizontal axis is PROGRESS       */
	/*  TOWARD EACH LIMIT (not time), the vertical axis is which track,    */
	/*  and time becomes a third, quiet channel. History moves below the   */
	/*  instrument as a per-round ledger band.                             */
	/* ------------------------------------------------------------------ */
	function candidateB(root, m) {
		const d = derive(m);
		const c = el(root, 'div', 'mtx mtx--b');
		head(c, m, d, 'hourglass');
		brief(c, m);

		const inst = el(c, 'div', 'mtx-inst');
		attr(inst, { 'data-brink': d.brink ? 'on' : 'off' });

		function channel(kind, filled, limit, word, tail) {
			const ch = el(inst, 'div', 'mtx-ch');
			attr(ch, { 'data-kind': kind });
			const label = el(ch, 'span', 'mtx-ch__label');
			el(label, 'span', 'mtx-ch__mark', kind === 'success' ? '▲' : kind === 'failure' ? '▼' : '◆');
			el(label, 'span', 'mtx-ch__word', word);
			const track = el(ch, 'div', 'mtx-ch__track');
			for (let i = 0; i < limit; i++) {
				const s = el(track, 'span', 'mtx-ch__slot');
				attr(s, { 'data-filled': i < filled ? 'on' : 'off' });
				if (i === limit - 1) attr(s, { 'data-goal': 'on' });
				if (kind === 'round' && i === m.current_round - 1) attr(s, { 'data-now': 'on' });
			}
			const read = el(ch, 'span', 'mtx-ch__read');
			el(read, 'span', 'mtx-ch__count', (kind === 'round' ? m.current_round : filled) + '/' + limit);
			el(read, 'span', 'mtx-ch__tail', tail);
			return ch;
		}

		channel('success', d.successes, m.success_limit, 'Successes', d.toTotal === 1 ? '1 from Total Success' : d.toTotal + ' from Total Success');
		channel('failure', d.failures, m.failure_limit, 'Failures', d.failuresSpare + ' before it ends');
		// Filled = rounds ALREADY SPENT. The round in play is its own state (`data-now`),
		// not a filled cell — "3/3 filled" would read as a montage that is already over.
		channel('round', m.current_round - 1, m.rounds, 'Rounds', 'round ' + m.current_round + ' in play \u00b7 up to ' + d.actionsLeft + ' actions left');

		verdict(c, m, d);

		// The history: one band per round, markers inline with their skill. Reads as a
		// ledger, not a chart — so a round with five entries just gets a longer line.
		const led = el(c, 'div', 'mtx-ledger');
		el(led, 'div', 'mtx-ledger__head', 'The Montage So Far');
		for (let r = 1; r <= m.rounds; r++) {
			const band = el(led, 'div', 'mtx-ledger__round');
			attr(band, {
				'data-state': r < m.current_round ? 'past' : r === m.current_round ? 'current' : 'future',
			});
			const tag = el(band, 'span', 'mtx-ledger__tag');
			el(tag, 'span', 'mtx-ledger__tag-w', 'Round');
			el(tag, 'span', 'mtx-ledger__tag-n', r);
			const line = el(band, 'div', 'mtx-ledger__line');
			const rows = entriesFor(m, r);
			if (rows.length === 0) {
				el(line, 'span', 'mtx-ledger__empty', 'No hero has acted yet — ' + m.participants.length + ' actions available');
			} else {
				rows.forEach((e) => marker(line, e, { skill: true }));
			}
		}
		return c;
	}

	/* ------------------------------------------------------------------ */
	/*  CANDIDATE C — "The Muster Board"                                   */
	/*  The other true 2-axis reading: heroes down, rounds across. Every   */
	/*  cell is one hero's action in one round, so attribution is the      */
	/*  layout rather than an annotation, and the "can't reuse a skill"    */
	/*  rule gets a per-hero ledger column. Totals live on the edges,      */
	/*  with the goal tracks in the bottom-right corner.                   */
	/* ------------------------------------------------------------------ */
	function candidateC(root, m) {
		const d = derive(m);
		const c = el(root, 'div', 'mtx mtx--c');
		head(c, m, d, 'users');
		brief(c, m);

		const board = el(c, 'div', 'mtx-board');
		// `repeat(var(--n), …)` is not legal CSS, so the expanded track list is computed
		// here and handed to the sheet as one custom property (the sanctioned
		// `setProperty('--dse-*'…)` geometry seam, D2 §5 — no inline colour, no inline px).
		const cols = ['auto'];
		for (let r = 0; r < m.rounds; r++) cols.push('minmax(4.6em, 1fr)');
		cols.push('auto', 'minmax(0, 1.4fr)');
		board.style.setProperty('--mtx-cols', cols.join(' '));

		// Header row
		el(board, 'div', 'mtx-board__corner', 'Hero');
		for (let r = 1; r <= m.rounds; r++) {
			const h = el(board, 'div', 'mtx-board__rhead');
			attr(h, { 'data-state': r === m.current_round ? 'current' : r < m.current_round ? 'past' : 'future' });
			el(h, 'span', 'mtx-board__rhead-w', 'Rd');
			el(h, 'span', 'mtx-board__rhead-n', r);
		}
		el(board, 'div', 'mtx-board__thead', 'Tally');
		el(board, 'div', 'mtx-board__shead', 'Skills used (each only once)');

		// One row per hero
		m.participants.forEach((p) => {
			const rowEntries = entriesForHero(m, p.name);
			const nameCell = el(board, 'div', 'mtx-board__name');
			el(nameCell, 'span', 'mtx-board__mono', p.short);
			el(nameCell, 'span', 'mtx-board__who', p.name);

			for (let r = 1; r <= m.rounds; r++) {
				const e = rowEntries.filter((x) => x.round === r)[0];
				const cell = el(board, 'div', 'mtx-board__cell');
				attr(cell, {
					'data-kind': e ? e.result : 'none',
					'data-state': r === m.current_round ? 'current' : 'past',
					// Read back by the narrow layout's ::before, where the column header
					// that used to say which round this is no longer exists.
					'data-round': r,
				});
				if (e) {
					const g = el(cell, 'span', 'mtx-mark__glyph');
					icon(g, e.result === 'success' ? 'check' : e.result === 'failure' ? 'x' : 'plus');
					el(cell, 'span', 'mtx-board__skill', e.skill);
				} else {
					el(cell, 'span', 'mtx-board__pending', r === m.current_round ? 'to act' : '—');
				}
			}

			const t = el(board, 'div', 'mtx-board__total');
			el(t, 'span', 'mtx-board__total-s', rowEntries.filter((x) => x.result === 'success').length);
			el(t, 'span', 'mtx-board__total-sep', '·');
			el(t, 'span', 'mtx-board__total-f', rowEntries.filter((x) => x.result === 'failure').length);

			const sk = el(board, 'div', 'mtx-board__skills');
			rowEntries.forEach((x) => el(sk, 'span', 'mtx-board__chip', x.skill));
		});

		// Foot row: per-round tallies, then the goal corner.
		el(board, 'div', 'mtx-board__footlab', 'Round tally');
		for (let r = 1; r <= m.rounds; r++) {
			const rows = entriesFor(m, r);
			const f = el(board, 'div', 'mtx-board__foot');
			attr(f, { 'data-state': r === m.current_round ? 'current' : 'past' });
			const s = el(f, 'span', 'mtx-board__foot-s');
			el(s, 'span', 'mtx-board__foot-m', '▲');
			el(s, 'span', 'mtx-board__foot-n', rows.filter((x) => x.result === 'success').length);
			const fa = el(f, 'span', 'mtx-board__foot-f');
			el(fa, 'span', 'mtx-board__foot-m', '▼');
			el(fa, 'span', 'mtx-board__foot-n', rows.filter((x) => x.result === 'failure').length);
		}
		const goal = el(board, 'div', 'mtx-board__goal');
		attr(goal, { 'data-brink': d.brink ? 'on' : 'off' });
		function goalRow(kind, mark, filled, limit) {
			const g = el(goal, 'div', 'mtx-board__goalrow');
			attr(g, { 'data-kind': kind });
			el(g, 'span', 'mtx-board__goalmark', mark);
			const track = el(g, 'div', 'mtx-board__goaltrack');
			for (let i = 0; i < limit; i++) {
				const s = el(track, 'span', 'mtx-ch__slot');
				attr(s, { 'data-filled': i < filled ? 'on' : 'off' });
				if (i === limit - 1) attr(s, { 'data-goal': 'on' });
			}
			el(g, 'span', 'mtx-board__goalnum', filled + '/' + limit);
			return g;
		}
		goalRow('success', '▲', d.successes, m.success_limit);
		goalRow('failure', '▼', d.failures, m.failure_limit);

		verdict(c, m, d);
		return c;
	}

	/* ------------------------------------------------------------------ */
	/*  Boot                                                               */
	/* ------------------------------------------------------------------ */
	const BUILDERS = { a: candidateA, b: candidateB, c: candidateC };

	function boot() {
		const q = new URLSearchParams(window.location.search);
		const cand = (q.get('cand') || 'a').toLowerCase();
		const bg = q.get('bg') === 'light' ? 'light' : 'dark';
		const width = Number(q.get('width'));

		document.body.classList.remove('theme-dark', 'theme-light');
		document.body.classList.add(bg === 'light' ? 'theme-light' : 'theme-dark');

		const mount = document.getElementById('mount');
		mount.innerHTML = '';
		mount.style.width = Number.isFinite(width) && width > 0 ? width + 'px' : '820px';

		// The exact root attributes ElementPipeline stamps (framework/pipeline.ts:456)
		// plus the theme seam's data-dse-theme, so every Steel-scoped rule applies.
		const root = el(mount, 'div', null);
		attr(root, { 'data-dse-element': 'montage', 'data-dse-theme': 'steel' });

		const build = BUILDERS[cand];
		if (!build) throw new Error('unknown candidate: ' + cand);
		build(root, M);

		window.__sc191Done = { cand: cand, bg: bg };
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
	else boot();
})();
