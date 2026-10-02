/* SC-379 — negotiation tracker overhaul, ROUND 1 DESIGN CANDIDATES. Rendered mocks, not
 * production code: nothing here is imported by main.ts, nothing touches entry.ts's
 * manifest, so no capture id, fixture or frozen print byte can move.
 *
 * Query: ?cand=A|B|C  &state=default|learn|ended  &bg=dark|light  &width=<px>
 *
 *   A  "Offer Ladder"    — one column; the Interest ladder is the spine of the card,
 *                          Patience is a pip meter in the head band; kit tabs below;
 *                          a Motivations/Pitfalls dossier at the foot.
 *   B  "Console"         — two panes: STANDING on the left (Interest and Patience as two
 *                          IDENTICAL notch gauges + the current offer), the ARGUMENT on the
 *                          right (kit tabs); each tier row projects where it would land.
 *   C  "Standing Board"  — one board, rows = the values 5..0, with an Interest column (the
 *                          six outcomes) and a Patience column side by side, so both values
 *                          read as positions on ONE scale; the dossier rows carry the
 *                          appeal/mention toggles (no second checkbox list), and the
 *                          Learn test folds under the dossier.
 *
 * Every candidate shows the SAME content and affordances the shipped element has
 * (src/elements/negotiation/view.ts + the four sub-views): name, Patience 0–5, Interest
 * 0–5 with its six outcome lines, Make an Argument (appeals, pitfalls, three modifiers,
 * the computed selectable power roll, Complete Argument), Learn Motivation/Pitfall (intro
 * + static 3-tier roll), Motivations (with "already appealed to"), Pitfalls, the ⋮ menu.
 * The persisted YAML shape (example.yaml) is untouched: every state below is expressible
 * in today's NegotiationData. The Frodo data is example.yaml verbatim.
 */
(function () {
	'use strict';

	const Q = new URLSearchParams(location.search);
	const CAND = (Q.get('cand') || 'A').toUpperCase();
	const STATE = Q.get('state') || 'default';
	const BG = Q.get('bg') === 'light' ? 'light' : 'dark';
	const WIDTH = Number(Q.get('width')) || 760;

	document.body.className = BG === 'light' ? 'theme-light' : 'theme-dark';
	const mount = document.getElementById('mount');
	mount.style.width = WIDTH + 'px';

	/* ------------------------------------------------------------------ */
	/*  The model — example.yaml verbatim + the round's three states       */
	/* ------------------------------------------------------------------ */
	function model(state) {
		const m = {
			name: 'Convincing Frodo to remember the taste of strawberries',
			interest: 3,
			patience: 3,
			motivations: [
				{ name: 'Higher Authority', reason: "It's Frodo's duty to destroy the ring", spent: false },
				{ name: 'Peace', reason: 'The Shire is life', spent: true },
			],
			pitfalls: [{ name: 'Power', reason: 'The ring is too powerful to ignore' }],
			arg: { motivationsUsed: ['Higher Authority'], pitfallsUsed: [], lie: false, same: false, reused: false },
			offers: {
				5: 'Remembers the taste of strawberries and cream!',
				4: 'Remembers the taste of strawberries',
				3: 'Remembers the taste of unripe strawberries',
				2: 'Remembers the smell of strawberries',
				1: "Doesn't remember the taste of strawberries",
				0: "Thinks you're after the ring; becomes hostile",
			},
			selected: 'mid',
			tab: state === 'learn' ? 'learn' : 'argument',
		};
		if (state === 'ended') {
			// Patience ran out after two arguments: both motivations now spent, the
			// current argument reset (exactly what completeArgument() leaves behind).
			m.patience = 0;
			m.motivations[0].spent = true;
			m.arg = { motivationsUsed: [], pitfallsUsed: [], lie: false, same: false, reused: false };
			m.selected = null;
		}
		return m;
	}
	const M = model(STATE);

	/* Ended = the book's three stop conditions (Interest 0 or 5, Patience 0). Pure
	   derivation from current_interest/current_patience — no model change. */
	function ending(m) {
		if (m.interest >= 5) return { kind: 'deal', label: 'Negotiation over', text: 'Interest reached 5 — the NPC agrees:' };
		if (m.interest <= 0) return { kind: 'hostile', label: 'Negotiation over', text: 'Interest fell to 0 — the NPC ends it:' };
		if (m.patience <= 0)
			return { kind: 'final', label: 'Final offer', text: 'Patience is spent — the NPC makes a final offer at Interest ' + m.interest + ':' };
		return null;
	}

	/* ArgumentPowerRoll.build, ported verbatim (src/model/ArgumentPowerRolls.ts). */
	function roll(m) {
		const usedMot = m.arg.motivationsUsed.length > 0;
		const usedPit = m.arg.pitfallsUsed.length > 0;
		let r;
		if (usedPit) r = [[-1, -1], [-1, -1], [-1, -1], [-1, -1]];
		else if (m.arg.reused) r = [[0, -1], [0, -1], [0, -1], [0, -1]];
		else if (usedMot) r = [[0, -1], [1, -1], [1, 0], [1, 0]];
		else if (m.arg.same) r = [[-1, -1], [-1, -1], [-1, -1], [-1, -1]];
		else r = [[-1, -1], [0, -1], [1, -1], [1, 0]];
		if (m.arg.lie) r = r.map(([i, p]) => [i <= 0 ? i - 1 : i, p]);
		const fmt = ([i, p]) => {
			const parts = [];
			if (i) parts.push((i > 0 ? '+' : '') + i + ' Interest');
			if (p) parts.push((p > 0 ? '+' : '') + p + ' Patience');
			return parts.length ? parts.join(', ') : 'No effect';
		};
		const tiers = ['low', 'mid', 'high', 'crit'];
		return r.map((d, k) => ({ tier: tiers[k], delta: d, md: fmt(d) }));
	}

	/* ------------------------------------------------------------------ */
	/*  DOM helpers + kit-markup replicas (same classes the kit emits)      */
	/* ------------------------------------------------------------------ */
	function el(parent, tag, cls, text) {
		const n = document.createElement(tag);
		if (cls) n.className = cls;
		if (text !== undefined && text !== null) n.textContent = String(text);
		if (parent) parent.appendChild(n);
		return n;
	}
	function attrs(n, map) {
		for (const k of Object.keys(map)) if (map[k] !== undefined && map[k] !== null && map[k] !== false) n.setAttribute(k, map[k] === true ? '' : String(map[k]));
		return n;
	}
	function icon(parent, name, cls) {
		const wrap = el(parent, 'span', cls || 'n3-ico');
		wrap.setAttribute('data-icon', name);
		wrap.setAttribute('aria-hidden', 'true');
		wrap.innerHTML =
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
			(window.N3_ICONS[name] || '') +
			'</svg>';
		return wrap;
	}
	/* kit iconButton */
	function btn(parent, o) {
		const b = el(parent, 'button', 'dse-btn' + (o.variant ? ' dse-btn--' + o.variant : '') + (o.text ? '' : ' dse-btn--icon') + (o.cls ? ' ' + o.cls : ''));
		attrs(b, { type: 'button', 'aria-label': o.label, disabled: o.disabled });
		if (o.icon) icon(b, o.icon, 'dse-btn__icon');
		if (o.text) el(b, 'span', 'dse-btn__text', o.text);
		return b;
	}
	/* kit cardHead (+ crest), with the head row's ⋮ menu beside it */
	function headRow(parent, o) {
		const row = el(parent, 'div', 'n3-headrow');
		const h = el(row, 'div', 'dse-head');
		const crest = el(h, 'span', 'dse-crest dse-crest--lg');
		crest.setAttribute('aria-hidden', 'true');
		icon(crest, 'handshake', 'dse-crest__glyph');
		el(h, 'span', 'dse-head__eyebrow dse-head__eyebrow--left dse-head__eyebrow--line', 'Negotiation');
		attrs(el(h, 'span', 'dse-head__primary dse-head__primary--left dse-head__primary--line', M.name), { role: 'heading', 'aria-level': 2 });
		if (o && o.rightEyebrow) el(h, 'span', 'dse-head__eyebrow dse-head__eyebrow--right dse-head__eyebrow--chip', o.rightEyebrow);
		btn(row, { icon: 'more-vertical', label: 'Negotiation options', variant: 'ghost', cls: 'n3-menu' });
		return row;
	}
	/* kit tabs */
	function tabs(parent, specs, selected) {
		const root = el(parent, 'div', 'dse-tabs n3-tabs');
		const list = attrs(el(root, 'div', 'dse-tabs__list'), { role: 'tablist' });
		const panels = {};
		specs.forEach((s, i) => {
			const on = s.id === selected;
			const t = attrs(el(list, 'button', 'dse-tabs__tab'), { type: 'button', role: 'tab', 'aria-selected': String(on), tabindex: on ? 0 : -1, id: 'n3-tab-' + i });
			icon(t, s.icon, 'dse-tabs__icon');
			el(t, 'span', 'dse-tabs__label', s.label);
		});
		specs.forEach((s, i) => {
			const p = attrs(el(root, 'div', 'dse-tabs__panel'), { role: 'tabpanel', 'aria-labelledby': 'n3-tab-' + i, hidden: s.id !== selected });
			panels[s.id] = p;
		});
		return panels;
	}
	/* kit powerRollPanel (selectable → radiogroup of button rows; static → div rows).
	   `project` is candidate B's new per-row projection readout (a kit option it would add). */
	const BADGE = { low: ['t1', '≤11'], mid: ['t2', '12-16'], high: ['t3', '17+'], crit: ['crit', 'crit'] };
	function powerRoll(parent, o) {
		const root = el(parent, 'div', 'dse-pr' + (o.cls ? ' ' + o.cls : ''));
		el(root, 'div', 'dse-pr__head', 'Power Roll + Reason, Intuition, or Presence');
		const rows = el(root, 'div', 'dse-pr__rows');
		if (o.selectable) attrs(rows, { role: 'radiogroup', 'aria-label': 'Argument test result' });
		for (const r of o.rows) {
			const row = o.selectable ? el(rows, 'button', 'dse-pr__row') : el(rows, 'div', 'dse-pr__row');
			row.setAttribute('data-tier', r.tier);
			if (o.selectable) {
				const on = o.selected === r.tier;
				attrs(row, { type: 'button', role: 'radio', 'aria-checked': String(on), tabindex: on || (!o.selected && r.tier === 'low') ? 0 : -1 });
			}
			const b = el(row, 'span', 'dse-pr__badge dse-pr__badge--' + BADGE[r.tier][0]);
			el(b, 'span', 'dse-pr__badge-text', BADGE[r.tier][1]);
			const text = el(row, 'span', 'dse-pr__text');
			el(text, 'p', null, r.md);
			if (o.project) o.project(row, r);
			if (o.selectable && o.selected === r.tier) {
				const mark = el(row, 'span', 'n3-chosen');
				icon(mark, 'check');
				el(mark, 'span', null, 'chosen');
			}
		}
		return root;
	}
	/* kit collapsible */
	function collapsible(parent, title, open, hint) {
		const root = el(parent, 'div', 'dse-collapse n3-collapse');
		if (open) root.setAttribute('data-open', '');
		const h = attrs(el(root, 'button', 'dse-collapse__header'), { type: 'button', 'aria-expanded': String(!!open) });
		icon(h, 'chevron-right', 'dse-collapse__chevron');
		el(h, 'span', 'dse-collapse__title', title);
		if (hint) el(h, 'span', 'n3-collapse__hint', hint);
		const region = attrs(el(root, 'div', 'dse-collapse__region'), { hidden: !open });
		return region;
	}
	/* shipped .dse-optchip — the pressed-chip grammar montage + the Conditions modal use */
	function chip(parent, o) {
		const c = attrs(el(parent, 'button', 'dse-optchip n3-chip' + (o.cls ? ' ' + o.cls : '')), {
			type: 'button',
			'aria-pressed': String(!!o.pressed),
			'aria-label': o.label,
			disabled: o.disabled,
		});
		if (o.glyph) el(c, 'span', 'n3-chip__glyph', o.glyph);
		if (o.icon) icon(c, o.icon, 'n3-chip__icon');
		if (o.pressed && o.check !== false) icon(c, 'check', 'n3-chip__check');
		el(c, 'span', 'n3-chip__text', o.text);
		if (o.note) el(c, 'span', 'n3-chip__note', o.note);
		return c;
	}
	/* themed Steel checkbox row (SC-121 D-3) for the three argument modifiers */
	function checkRow(parent, text, o) {
		const l = el(parent, 'label', 'n3-check' + (o.disabled ? ' is-disabled' : ''));
		attrs(el(l, 'input'), { type: 'checkbox', checked: o.checked, disabled: o.disabled });
		el(l, 'span', null, text);
		if (o.why) el(l, 'span', 'n3-check__why', o.why);
		return l;
	}
	function label(parent, text, cls) {
		return el(parent, 'div', 'n3-label' + (cls ? ' ' + cls : ''), text);
	}

	/* The motivation / pitfall glyph pair: a SHAPE pair, never a hue pair.
	   ◆ = a motivation still open · ◇ = a motivation already appealed to (spent) ·
	   the Lucide triangle-alert = a pitfall. */
	const MOT = '◆';
	const MOT_SPENT = '◇';

	/* ------------------------------------------------------------------ */
	/*  Shared argument-tab pieces                                         */
	/* ------------------------------------------------------------------ */
	const INTRO =
		'If the heroes want to learn one of the NPC’s motivations or pitfalls, a hero can make the following test while interacting with the NPC during the negotiation. After this test is made, the heroes can’t make another test to determine the same NPC’s motivations or pitfalls until they make an argument to the NPC or the negotiation ends.';
	const LEARN = [
		{ tier: 'low', md: 'The hero learns no information regarding the NPC’s motivations or pitfalls, and the NPC realizes the hero is trying to read them and becomes annoyed. As a consequence, the NPC’s patience is reduced by 1.' },
		{ tier: 'mid', md: 'The hero learns no information regarding the NPC’s motivations or pitfalls.' },
		{ tier: 'high', md: 'The hero learns one of the NPC’s motivations or pitfalls (their choice).' },
	];
	function learnPanel(parent) {
		const w = el(parent, 'div', 'n3-learn');
		el(w, 'p', 'n3-learn__intro', INTRO);
		powerRoll(w, { rows: LEARN, selectable: false });
	}
	function modifiers(parent, m) {
		const box = el(parent, 'div', 'n3-mods');
		label(box, 'Modifiers');
		const reusable = m.arg.motivationsUsed.some((n) => (m.motivations.find((x) => x.name === n) || {}).spent);
		checkRow(box, 'Reuses a Motivation that has already been appealed to', {
			checked: reusable && m.arg.reused,
			disabled: !reusable,
			why: reusable ? null : 'only when a spent Motivation is appealed to',
		});
		checkRow(box, 'NPC caught a lie and is offended', { checked: m.arg.lie });
		const usesMot = m.arg.motivationsUsed.length > 0;
		checkRow(box, 'Argument has already been made (w/o Motivation)', {
			checked: m.arg.same,
			disabled: usesMot,
			why: usesMot ? 'not while a Motivation is appealed to' : null,
		});
		return box;
	}
	function completeFooter(parent, m) {
		const f = el(parent, 'div', 'n3-complete');
		const armed = !!m.selected;
		el(f, 'span', 'n3-complete__hint', armed ? 'Applies the chosen tier to Interest and Patience' : 'Choose the test result to complete the argument');
		btn(f, { icon: 'messages-square', text: 'Complete Argument', label: 'Complete Argument', variant: armed ? 'accent' : undefined, disabled: !armed });
	}
	function endBand(parent, m, cls) {
		const e = ending(m);
		if (!e) return null;
		const band = el(parent, 'div', 'n3-end' + (cls ? ' ' + cls : ''));
		band.setAttribute('data-kind', e.kind);
		icon(band, 'flag', 'n3-end__flag');
		const body = el(band, 'div', 'n3-end__body');
		el(body, 'div', 'n3-end__label', e.label);
		const t = el(body, 'div', 'n3-end__text');
		el(t, 'span', null, e.text + ' ');
		el(t, 'strong', null, M.offers[m.interest]);
		return band;
	}

	/* Dossier — Motivations and Pitfalls as two labelled, shape-keyed lists.
	   opts.appeal: C puts the CURRENT-ARGUMENT toggles on these rows (no second list). */
	function dossier(parent, m, opts) {
		opts = opts || {};
		const d = el(parent, 'div', 'n3-dossier' + (opts.cls ? ' ' + opts.cls : ''));
		const mc = el(d, 'section', 'n3-dossier__col');
		const mh = el(mc, 'div', 'n3-dossier__head');
		el(mh, 'span', 'n3-dossier__glyph n3-glyph--mot', MOT);
		label(mh, 'Motivations');
		el(mh, 'span', 'n3-dossier__count', m.motivations.filter((x) => !x.spent).length + ' of ' + m.motivations.length + ' open');
		for (const mot of m.motivations) {
			const row = el(mc, 'div', 'n3-dos' + (mot.spent ? ' is-spent' : ''));
			el(row, 'span', 'n3-dos__glyph n3-glyph--mot', mot.spent ? MOT_SPENT : MOT);
			const tx = el(row, 'div', 'n3-dos__text');
			el(tx, 'span', 'n3-dos__name', mot.name);
			el(tx, 'span', 'n3-dos__reason', mot.reason);
			const acts = el(row, 'div', 'n3-dos__acts');
			if (opts.appeal) {
				const on = m.arg.motivationsUsed.includes(mot.name);
				chip(acts, { text: on ? 'Appealed' : 'Appeal', pressed: on, label: 'Appeal to ' + mot.name + ' in this argument', cls: 'n3-chip--appeal' });
			}
			chip(acts, {
				text: mot.spent ? 'Spent' : 'Mark spent',
				pressed: mot.spent,
				label: mot.name + ' has already been appealed to',
				cls: 'n3-chip--spent',
			});
		}
		const pc = el(d, 'section', 'n3-dossier__col');
		const ph = el(pc, 'div', 'n3-dossier__head');
		icon(ph, 'triangle-alert', 'n3-dossier__glyph n3-glyph--pit');
		label(ph, 'Pitfalls');
		el(ph, 'span', 'n3-dossier__count', m.pitfalls.length + ' known');
		for (const pit of m.pitfalls) {
			const row = el(pc, 'div', 'n3-dos n3-dos--pit');
			icon(row, 'triangle-alert', 'n3-dos__glyph n3-glyph--pit');
			const tx = el(row, 'div', 'n3-dos__text');
			el(tx, 'span', 'n3-dos__name', pit.name);
			el(tx, 'span', 'n3-dos__reason', pit.reason);
			if (opts.appeal) {
				const acts = el(row, 'div', 'n3-dos__acts');
				const on = m.arg.pitfallsUsed.includes(pit.name);
				chip(acts, { text: on ? 'Mentioned' : 'Mention', pressed: on, label: 'Mention ' + pit.name + ' in this argument', cls: 'n3-chip--mention' });
			}
		}
		return d;
	}

	/* The appeal/mention chip rows A and B put in the argument tab. */
	function appealChips(parent, m) {
		const g = el(parent, 'div', 'n3-appeals');
		const a = el(g, 'div', 'n3-appeals__group');
		const ah = el(a, 'div', 'n3-appeals__head');
		el(ah, 'span', 'n3-glyph--mot', MOT);
		label(ah, 'Appeals to Motivation');
		const ac = el(a, 'div', 'n3-chiprow');
		for (const mot of m.motivations) {
			chip(ac, {
				glyph: mot.spent ? MOT_SPENT : MOT,
				text: mot.name,
				note: mot.spent ? 'spent' : null,
				pressed: m.arg.motivationsUsed.includes(mot.name),
				label: 'Appeal to ' + mot.name,
				cls: 'n3-chip--mot' + (mot.spent ? ' is-spent' : ''),
			});
		}
		const p = el(g, 'div', 'n3-appeals__group');
		const ph = el(p, 'div', 'n3-appeals__head');
		icon(ph, 'triangle-alert', 'n3-glyph--pit');
		label(ph, 'Mentions Pitfall');
		const pcr = el(p, 'div', 'n3-chiprow');
		for (const pit of m.pitfalls) {
			chip(pcr, { icon: 'triangle-alert', text: pit.name, pressed: m.arg.pitfallsUsed.includes(pit.name), label: 'Mention ' + pit.name, cls: 'n3-chip--pit' });
		}
		return g;
	}

	/* ------------------------------------------------------------------ */
	/*  A — OFFER LADDER                                                   */
	/* ------------------------------------------------------------------ */
	function buildA(root, m) {
		const c = el(root, 'div', 'n3 n3a');
		headRow(c);

		// Patience — a pip meter: a "0" floor stop + five pips. Filled metal = patience
		// left, hollow dashed = spent. A radiogroup (arrow keys move, Space/Enter sets).
		const pat = el(c, 'div', 'n3a-pat');
		const pl = el(pat, 'div', 'n3a-pat__label');
		icon(pl, 'hourglass');
		label(pl, 'Patience');
		const pips = attrs(el(pat, 'div', 'n3a-pips'), { role: 'radiogroup', 'aria-label': 'Patience' });
		for (let i = 0; i <= 5; i++) {
			const p = attrs(el(pips, 'button', 'n3a-pip' + (i === 0 ? ' n3a-pip--floor' : '')), {
				type: 'button',
				role: 'radio',
				'aria-checked': String(i === m.patience),
				'aria-label': 'Patience ' + i,
				tabindex: i === m.patience ? 0 : -1,
				'data-filled': i > 0 && i <= m.patience ? 'on' : 'off',
			});
			el(p, 'span', 'n3a-pip__n', i);
		}
		const ro = el(pat, 'div', 'n3a-pat__readout');
		el(ro, 'span', 'n3a-pat__value', m.patience);
		el(ro, 'span', 'n3a-pat__of', '/ 5');

		// Interest — the offer ladder. Rungs are a radiogroup; the current rung is a
		// raised plate with a teal ring AND a solid seal AND the word "now" (three
		// channels, none of them hue alone).
		const lad = el(c, 'div', 'n3a-ladder');
		const lh = el(lad, 'div', 'n3a-ladder__head');
		label(lh, 'Interest');
		el(lh, 'span', 'n3a-ladder__hint', 'what the NPC will agree to');
		const rungs = attrs(el(lad, 'div', 'n3a-rungs'), { role: 'radiogroup', 'aria-label': 'Interest' });
		const end = ending(m);
		for (let i = 5; i >= 0; i--) {
			const cur = i === m.interest;
			const r = attrs(el(rungs, 'button', 'n3a-rung'), {
				type: 'button',
				role: 'radio',
				'aria-checked': String(cur),
				tabindex: cur ? 0 : -1,
				'data-side': i > m.interest ? 'above' : i < m.interest ? 'below' : 'current',
			});
			el(r, 'span', 'n3a-seal', i);
			el(r, 'span', 'n3a-rung__text', m.offers[i]);
			if (cur) {
				const tag = el(r, 'span', 'n3a-now');
				if (end) icon(tag, 'flag');
				el(tag, 'span', null, end ? (end.kind === 'final' ? 'final offer' : 'outcome') : 'now');
			}
		}

		endBand(c, m);

		const panels = tabs(
			c,
			[
				{ id: 'argument', label: 'Make an Argument', icon: 'message-circle' },
				{ id: 'learn', label: 'Learn Motivation/Pitfall', icon: 'help-circle' },
			],
			m.tab,
		);
		const arg = el(panels.argument, 'div', 'n3-arg');
		appealChips(arg, m);
		modifiers(arg, m);
		powerRoll(arg, { rows: roll(m), selectable: true, selected: m.selected, cls: 'n3-roll' });
		completeFooter(arg, m);
		learnPanel(panels.learn);

		dossier(c, m);
	}

	/* ------------------------------------------------------------------ */
	/*  B — CONSOLE                                                        */
	/* ------------------------------------------------------------------ */
	function gauge(parent, o) {
		const g = el(parent, 'div', 'n3b-gauge');
		const top = el(g, 'div', 'n3b-gauge__top');
		const lab = el(top, 'div', 'n3b-gauge__label');
		icon(lab, o.icon);
		label(lab, o.label);
		const val = el(top, 'div', 'n3b-gauge__value');
		el(val, 'span', 'n3b-gauge__n', o.value);
		el(val, 'span', 'n3b-gauge__of', '/ 5');
		const track = attrs(el(g, 'div', 'n3b-track'), { role: 'radiogroup', 'aria-label': o.label });
		for (let i = 0; i <= 5; i++) {
			attrs(el(track, 'button', 'n3b-notch', i), {
				type: 'button',
				role: 'radio',
				'aria-checked': String(i === o.value),
				'aria-label': o.label + ' ' + i,
				tabindex: i === o.value ? 0 : -1,
				'data-filled': i <= o.value ? 'on' : 'off',
				'data-end': i === 0 ? 'floor' : null,
			});
		}
		return g;
	}
	function buildB(root, m) {
		const c = el(root, 'div', 'n3 n3b');
		headRow(c);
		const end = ending(m);
		const panes = el(c, 'div', 'n3b-panes');

		// LEFT — standing
		const left = el(panes, 'section', 'n3b-pane n3b-pane--standing');
		label(left, 'Standing', 'n3b-pane__title');
		gauge(left, { label: 'Interest', icon: 'handshake', value: m.interest });
		const offer = el(left, 'div', 'n3b-offer' + (end ? ' is-ended' : ''));
		const oh = el(offer, 'div', 'n3b-offer__head');
		if (end) icon(oh, 'flag');
		label(oh, end ? end.label : 'Current offer');
		el(oh, 'span', 'n3b-offer__n', 'Interest ' + m.interest);
		el(offer, 'div', 'n3b-offer__text', m.offers[m.interest]);
		const all = collapsible(left, 'All six outcomes', WIDTH > 420, null);
		const ol = el(all, 'ol', 'n3b-outcomes');
		for (let i = 5; i >= 0; i--) {
			const li = el(ol, 'li', 'n3b-outcome' + (i === m.interest ? ' is-current' : ''));
			el(li, 'span', 'n3b-outcome__n', i);
			el(li, 'span', 'n3b-outcome__t', m.offers[i]);
			if (i === m.interest) el(li, 'span', 'n3b-outcome__tag', end ? (end.kind === 'final' ? 'final offer' : 'outcome') : 'now');
		}
		gauge(left, { label: 'Patience', icon: 'hourglass', value: m.patience });

		// RIGHT — the argument
		const right = el(panes, 'section', 'n3b-pane n3b-pane--argument');
		const panels = tabs(
			right,
			[
				{ id: 'argument', label: 'Make an Argument', icon: 'message-circle' },
				{ id: 'learn', label: 'Learn Motivation/Pitfall', icon: 'help-circle' },
			],
			m.tab,
		);
		const arg = el(panels.argument, 'div', 'n3-arg');
		appealChips(arg, m);
		modifiers(arg, m);
		powerRoll(arg, {
			rows: roll(m),
			selectable: true,
			selected: m.selected,
			cls: 'n3-roll n3b-roll',
			// NEW kit option: each tier row projects where it would land.
			project: (row, r) => {
				const ni = Math.max(0, Math.min(5, m.interest + r.delta[0]));
				const np = Math.max(0, Math.min(5, m.patience + r.delta[1]));
				const pj = el(row, 'span', 'n3b-proj');
				el(pj, 'span', 'n3b-proj__arrow', '→');
				el(pj, 'span', null, 'I' + ni);
				el(pj, 'span', 'n3b-proj__sep', '·');
				el(pj, 'span', null, 'P' + np);
			},
		});
		completeFooter(arg, m);
		learnPanel(panels.learn);

		dossier(c, m);
	}

	/* ------------------------------------------------------------------ */
	/*  C — STANDING BOARD                                                 */
	/* ------------------------------------------------------------------ */
	function buildC(root, m) {
		const c = el(root, 'div', 'n3 n3c');
		headRow(c);
		const end = ending(m);

		// ONE board: rows are the values 5..0. Column 2 = Interest (the six outcomes),
		// column 3 = Patience. Each column is its own radiogroup (arrow keys run DOWN
		// the column); the shared row key is the scale both values are read against.
		const board = el(c, 'div', 'n3c-board');
		const hk = el(board, 'div', 'n3c-th n3c-th--key');
		hk.setAttribute('aria-hidden', 'true');
		const hi = el(board, 'div', 'n3c-th n3c-th--int');
		icon(hi, 'handshake');
		label(hi, 'Interest');
		el(hi, 'span', 'n3c-th__v', m.interest);
		board.setAttribute('data-patience', String(m.patience));
		const hp = el(board, 'div', 'n3c-th n3c-th--pat');
		const hpl = el(hp, 'div', 'n3c-th__line');
		icon(hpl, 'hourglass');
		label(hpl, 'Patience');
		el(hp, 'span', 'n3c-th__v', m.patience);
		for (let i = 5; i >= 0; i--) {
			const last = i === 0 ? 'on' : 'off';
			const key = el(board, 'div', 'n3c-key', i);
			key.setAttribute('data-last', last);
			const curI = i === m.interest;
			const ic = attrs(el(board, 'button', 'n3c-int'), {
				type: 'button',
				role: 'radio',
				'aria-checked': String(curI),
				'aria-label': 'Interest ' + i,
				tabindex: curI ? 0 : -1,
				'data-side': i > m.interest ? 'above' : i < m.interest ? 'below' : 'current',
				'data-last': last,
			});
			el(ic, 'span', 'n3c-int__text', m.offers[i]);
			if (curI) {
				const tag = el(ic, 'span', 'n3c-tag');
				if (end) icon(tag, 'flag');
				el(tag, 'span', null, end ? (end.kind === 'final' ? 'final offer' : 'outcome') : 'now');
			}
			const curP = i === m.patience;
			const pc = attrs(el(board, 'button', 'n3c-pat'), {
				type: 'button',
				role: 'radio',
				'aria-checked': String(curP),
				'aria-label': 'Patience ' + i,
				tabindex: curP ? 0 : -1,
				'data-filled': i > 0 && i <= m.patience ? 'on' : 'off',
				'data-floor': i === 0 ? 'on' : 'off',
				'data-last': last,
			});
			el(pc, 'span', 'n3c-pat__cell');
		}

		endBand(c, m);

		// The argument — the dossier IS the appeal surface (no second checkbox list).
		const sec = el(c, 'section', 'n3c-argument');
		const sh = el(sec, 'div', 'n3c-sec-head');
		icon(sh, 'message-circle');
		el(sh, 'span', 'n3c-sec-title', 'Make an Argument');
		dossier(sec, m, { appeal: true, cls: 'n3c-dossier' });
		modifiers(sec, m);
		powerRoll(sec, { rows: roll(m), selectable: true, selected: m.selected, cls: 'n3-roll' });
		completeFooter(sec, m);

		// Learn — folded under the argument, beside the dossier it fills in.
		const lr = collapsible(c, 'Learn Motivation/Pitfall', m.tab === 'learn', 'test · reveals one on 17+');
		learnPanel(lr);
	}

	const root = attrs(el(mount, 'div', 'dse-chrome-anchor'), {
		'data-dse-element': 'negotiation',
		'data-dse-theme': 'steel',
		'data-dse-print': 'off',
		'data-dse-reduce-motion': 'false',
		'data-n3': CAND,
	});
	({ A: buildA, B: buildB, C: buildC }[CAND] || buildA)(root, M);
	window.__n3Done = true;
})();
