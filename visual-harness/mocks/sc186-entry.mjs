// visual-harness/mocks/sc186-entry.mjs — SC-186 DESIGN-OPTION MOCKS (review
// candidates, NOT production code). Renders static, hand-built DOM for the three
// proposed condition-modal redesigns so they can be screenshot in the browser
// harness without touching any element render, the shot manifest, or the modals
// themselves:
//
//   ?option=a  — Option A: ONE modal; the picker grid grows an inline per-row
//                detail drawer (duration / color / effect) under the active row.
//   ?option=b  — Option B: ONE modal; two-pane "workbench" — condition list on
//                the left, a persistent detail pane on the right, staged-
//                conditions tray above the footer.
//   ?option=c  — Option C: TWO modals, both redesigned — the picker gains
//                per-row quick duration chips; the customize modal becomes a
//                forged surface (coin preview, sunken sections).
//   ?option=d  — Option D: ONE modal; vertical list of currently ACTIVE
//                conditions only (glyph + name + badges + delete), plus an
//                "Add condition" affordance that becomes an autocomplete
//                combobox (typed filtering over known conditions + an
//                "Add custom" row for novel strings).
//                &state=list|autocomplete|edit picks the captured moment.
//   &bg=dark|light — body theme class, same convention as the harness page.
//
// Honesty notes (mirrored in the SC-186 report): the DOM is hand-authored to
// match what the kit (iconButton/divider/DseModal) WOULD render — real classes,
// real ARIA, real Lucide icons — but no kit code runs and no behavior is wired.
// The Obsidian `.modal` box chrome is approximated by mock-only CSS
// (sc186-mock.css, `.mock-*` classes) because the harness deliberately does not
// vendor Obsidian's modal chrome. styles-source.css is bundled unmodified, so
// every `.dse-*` rule seen in the shots is the real shipped CSS.
import { icons, createElement as lucideCreateElement } from 'lucide';
import '../../styles-source.css';
import './sc186-mock.css';

/* ---------------------------------------------------------------- helpers -- */

function el(parent, tag, cls, text) {
	const node = document.createElement(tag);
	if (cls) node.className = cls;
	if (text !== undefined) node.textContent = text;
	parent.appendChild(node);
	return node;
}

function pascal(iconId) {
	return iconId
		.split('-')
		.map((s) => s.charAt(0).toUpperCase() + s.slice(1))
		.join('');
}

/** Real Lucide SVG into `host` — same mechanism as the harness shim's setIcon. */
function setIcon(host, iconId, size = 16) {
	const node = icons[pascal(iconId)];
	if (node) {
		const svg = lucideCreateElement(node);
		svg.setAttribute('width', String(size));
		svg.setAttribute('height', String(size));
		host.appendChild(svg);
	}
	host.setAttribute('data-icon', iconId);
}

/** Replicates kit iconButton's DOM (real <button>, .dse-btn grammar). */
function kitBtn(parent, opts) {
	const btn = el(parent, 'button', 'dse-btn');
	btn.setAttribute('type', 'button');
	if (opts.variant && opts.variant !== 'default') btn.classList.add(`dse-btn--${opts.variant}`);
	if (opts.icon) {
		const iconEl = el(btn, 'span', 'dse-btn__icon');
		setIcon(iconEl, opts.icon);
		if (opts.text === undefined) btn.classList.add('dse-btn--icon');
	}
	if (opts.text !== undefined) el(btn, 'span', 'dse-btn__text', opts.text);
	if (opts.pressed !== undefined) {
		btn.setAttribute('aria-pressed', String(opts.pressed));
		if (opts.pressed) btn.setAttribute('data-pressed', '');
	}
	btn.setAttribute('aria-label', opts.label ?? opts.text ?? opts.icon);
	if (opts.cls) btn.classList.add(...opts.cls.split(' '));
	return btn;
}

/** Kit divider (horizontal, no ornament) — matches kit/divider.ts markup. */
function dividerH(parent) {
	const root = el(parent, 'div', 'dse-hr');
	root.setAttribute('role', 'separator');
	el(root, 'span', 'dse-hr__line');
	return root;
}

/* ------------------------------------------------------------------- data -- */

const CONDITIONS = [
	{ key: 'bleeding', displayName: 'Bleeding', iconName: 'droplet' },
	{ key: 'dazed', displayName: 'Dazed', iconName: 'waves' },
	{ key: 'frightened', displayName: 'Frightened', iconName: 'ghost' },
	{ key: 'grabbed', displayName: 'Grabbed', iconName: 'hand' },
	{ key: 'prone', displayName: 'Prone', iconName: 'bed' },
	{ key: 'restrained', displayName: 'Restrained', iconName: 'navigation-off' },
	{ key: 'slowed', displayName: 'Slowed', iconName: 'snail' },
	{ key: 'weakened', displayName: 'Weakened', iconName: 'trending-down' },
];

const PSEUDO = [
	{ key: 'marked', displayName: 'Marked', iconName: 'locate-fixed' },
	{ key: 'used-triggered-action', displayName: 'Triggered Action Used', iconName: 'repeat' },
	{ key: 'covered', displayName: 'Covered', iconName: 'trees' },
	{ key: 'concealed', displayName: 'Concealed', iconName: 'cloud-fog' },
	{ key: 'dead', displayName: 'Dead', iconName: 'skull' },
	{ key: 'defending', displayName: 'Defending', iconName: 'shield' },
	{ key: 'dying', displayName: 'Dying', iconName: 'heart-crack' },
	{ key: 'falling', displayName: 'Falling', iconName: 'arrow-big-down-dash' },
	{ key: 'flanking', displayName: 'Flanking', iconName: 'minimize-2' },
	{ key: 'hidden', displayName: 'Hidden', iconName: 'locate-off' },
	{ key: 'high-ground', displayName: 'High Ground', iconName: 'layers' },
	{ key: 'invisible', displayName: 'Invisible', iconName: 'eye-off' },
	{ key: 'sneaking', displayName: 'Sneaking', iconName: 'more-horizontal' },
	{ key: 'unconscious', displayName: 'Unconscious', iconName: 'zap-off' },
	{ key: 'winded', displayName: 'Winded', iconName: 'wind' },
	{ key: 'taunted', displayName: 'Taunted', iconName: 'mouse-pointer-click' },
];

/** Duration vocabulary (panel badge vocabulary, spec §1.5). */
const DURATIONS = [
	{ key: 'none', label: 'Until removed', short: '—' },
	{ key: 'eot', label: 'End of Turn', short: 'EoT' },
	{ key: 'save-ends', label: 'Save Ends', short: 'SE' },
	{ key: 'eoe', label: 'End of Encounter', short: 'EoE' },
];

/** Preset swatches: the Steel action-type hues (semantic saturated color). */
const SWATCHES = ['#c0392b', '#b9770e', '#1e8449', '#2874a6', '#7d3c98'];

const EFFECTS = ['static', 'blink', 'glow', 'glow-pulse', 'breathing', 'blur-pulse'];

/* -------------------------------------------------------- shared builders -- */

function modalBox(stage, { title, width, cls }) {
	const modal = el(stage, 'div', `mock-modal dse-modal${cls ? ` ${cls}` : ''}`);
	modal.setAttribute('data-dse-theme', 'steel'); // what DseModal.open() stamps
	if (width) modal.style.width = `${width}px`;
	const closeBtn = el(modal, 'button', 'mock-modal-close');
	closeBtn.setAttribute('aria-label', 'Close');
	setIcon(closeBtn, 'x', 20);
	el(modal, 'div', 'dse-modal__title', title);
	const body = el(modal, 'div', 'dse-modal__body');
	return { modal, body };
}

function footer(modal, buttons) {
	const foot = el(modal, 'div', 'dse-modal__footer');
	for (const b of buttons) kitBtn(foot, b);
	return foot;
}

/** Segmented duration chip group (shared grammar across all three options). */
function durationChips(parent, { active, short }) {
	const group = el(parent, 'div', 'dse-durseg');
	group.setAttribute('role', 'group');
	group.setAttribute('aria-label', 'Duration');
	for (const d of DURATIONS) {
		if (short && d.key === 'none') continue; // row chips omit the default
		const chip = el(group, 'button', 'dse-optchip', short ? d.short : d.label);
		chip.setAttribute('type', 'button');
		chip.setAttribute('aria-pressed', String(d.key === active));
		chip.setAttribute('aria-label', d.label);
	}
	return group;
}

function swatchRow(parent, { active }) {
	const row = el(parent, 'div', 'dse-swatches');
	row.setAttribute('role', 'group');
	row.setAttribute('aria-label', 'Color');
	for (const hex of SWATCHES) {
		const sw = el(row, 'button', 'dse-swatch');
		sw.setAttribute('type', 'button');
		sw.setAttribute('aria-label', `Color ${hex}`);
		sw.setAttribute('aria-pressed', String(hex === active));
		sw.style.setProperty('--dse-swatch', hex);
	}
	const custom = el(row, 'label', 'dse-swatch dse-swatch--custom');
	custom.setAttribute('aria-label', 'Custom color');
	setIcon(custom, 'pipette', 13);
	const input = el(custom, 'input');
	input.setAttribute('type', 'color');
	input.setAttribute('aria-label', 'Custom condition color');
	return row;
}

function effectChips(parent, { active }) {
	const group = el(parent, 'div', 'dse-durseg');
	group.setAttribute('role', 'group');
	group.setAttribute('aria-label', 'Effect');
	for (const fx of EFFECTS) {
		const chip = el(group, 'button', 'dse-optchip', fx);
		chip.setAttribute('type', 'button');
		chip.setAttribute('aria-pressed', String(fx === active));
	}
	return group;
}

function field(parent, label) {
	const row = el(parent, 'div', 'dse-cond-field');
	el(row, 'span', 'dse-cond-field__label', label);
	return el(row, 'div', 'dse-cond-field__control');
}

/** A picker row (.dse-cond-item) — today's markup plus the option's extras. */
function condRow(list, cfg, opts = {}) {
	const row = el(list, 'div', 'dse-cond-item');
	row.setAttribute('role', 'option');
	row.setAttribute('aria-selected', String(!!opts.selected));
	if (opts.open) row.classList.add('dse-cond-item--open');
	const toggle = kitBtn(row, {
		icon: cfg.iconName,
		text: cfg.displayName,
		label: cfg.displayName,
		variant: 'ghost',
		pressed: !!opts.selected,
		cls: 'dse-cond-item__toggle',
	});
	if (opts.color) {
		const iconEl = toggle.querySelector('.dse-btn__icon');
		if (iconEl) iconEl.style.setProperty('--dse-condition-color', opts.color);
	}
	if (opts.durLabel) el(row, 'span', 'dse-cond-item__dur', opts.durLabel);
	if (opts.durChips) {
		const host = el(row, 'span', 'dse-cond-item__durset');
		durationChips(host, { active: opts.durChips, short: true });
	}
	kitBtn(row, {
		icon: 'cog',
		label: `Customize ${cfg.displayName}`,
		variant: 'ghost',
		cls: 'dse-cond-item__cog',
	});
	return row;
}

/* ------------------------------------------------------------- Option A --- */
/* One modal; the active row expands an inline drawer with duration / color /
   effect and a live preview. Selected rows summarize their duration inline.  */

function optionA(stage) {
	const { modal, body } = modalBox(stage, { title: 'Add Conditions', width: 640 });

	const list = el(body, 'div', 'dse-cond-list');
	list.setAttribute('role', 'listbox');
	list.setAttribute('aria-multiselectable', 'true');
	list.setAttribute('aria-label', 'Conditions');

	CONDITIONS.forEach((cfg, i) => {
		const isBleeding = cfg.key === 'bleeding';
		const isSlowed = cfg.key === 'slowed';
		condRow(list, cfg, {
			selected: isBleeding || isSlowed,
			open: isBleeding,
			color: isBleeding ? '#c0392b' : undefined,
			durLabel: isSlowed ? 'EoT' : undefined,
		});
		// The drawer breaks the two-column wrap after the active row's pair.
		if (i === 1) {
			const drawer = el(list, 'div', 'dse-cond-drawer');
			const preview = el(drawer, 'div', 'dse-cond-drawer__preview');
			const glyph = el(preview, 'span', 'dse-cond-drawer__glyph');
			glyph.style.setProperty('--dse-condition-color', '#c0392b');
			setIcon(glyph, 'droplet', 36);
			el(preview, 'span', 'dse-cond-drawer__name', 'Bleeding');
			const rows = el(drawer, 'div', 'dse-cond-drawer__rows');
			durationChips(field(rows, 'Duration'), { active: 'save-ends' });
			swatchRow(field(rows, 'Color'), { active: '#c0392b' });
			effectChips(field(rows, 'Effect'), { active: 'static' });
		}
	});

	dividerH(list);
	PSEUDO.forEach((cfg) => condRow(list, cfg, {}));

	footer(modal, [
		{ text: 'Cancel', label: 'Cancel' },
		{ text: 'Add 2 Conditions', label: 'Add 2 Conditions', variant: 'accent' },
	]);
}

/* ------------------------------------------------------------- Option B --- */
/* One modal; two-pane workbench: compact list left, persistent detail pane
   right, staged-conditions tray above the footer.                            */

function wbRow(list, cfg, opts = {}) {
	const row = el(list, 'div', 'dse-condwb__row');
	row.setAttribute('role', 'option');
	row.setAttribute('aria-selected', String(!!opts.staged));
	if (opts.focused) row.classList.add('dse-condwb__row--focused');
	const iconEl = el(row, 'span', 'dse-condwb__row-icon');
	if (opts.color) iconEl.style.setProperty('--dse-condition-color', opts.color);
	setIcon(iconEl, cfg.iconName, 18);
	el(row, 'span', 'dse-condwb__row-name', cfg.displayName);
	if (opts.dur) el(row, 'span', 'dse-cond-item__dur', opts.dur);
	if (opts.staged) {
		const check = el(row, 'span', 'dse-condwb__row-check');
		setIcon(check, 'check', 15);
	}
	return row;
}

function trayChip(tray, cfg, { color, dur }) {
	const chip = el(tray, 'span', 'dse-condwb-chip');
	const iconEl = el(chip, 'span', 'dse-condwb-chip__icon');
	if (color) iconEl.style.setProperty('--dse-condition-color', color);
	setIcon(iconEl, cfg.iconName, 15);
	el(chip, 'span', 'dse-condwb-chip__name', cfg.displayName);
	if (dur) el(chip, 'span', 'dse-cond-item__dur', dur);
	const x = el(chip, 'button', 'dse-condwb-chip__remove');
	x.setAttribute('type', 'button');
	x.setAttribute('aria-label', `Unstage ${cfg.displayName}`);
	setIcon(x, 'x', 13);
}

function optionB(stage) {
	const { modal, body } = modalBox(stage, { title: 'Add Conditions', width: 720 });

	const wb = el(body, 'div', 'dse-condwb');
	const list = el(wb, 'div', 'dse-condwb__list');
	list.setAttribute('role', 'listbox');
	list.setAttribute('aria-multiselectable', 'true');
	list.setAttribute('aria-label', 'Conditions');

	CONDITIONS.forEach((cfg) => {
		wbRow(list, cfg, {
			staged: cfg.key === 'bleeding' || cfg.key === 'slowed',
			focused: cfg.key === 'slowed',
			color: cfg.key === 'bleeding' ? '#c0392b' : undefined,
			dur: cfg.key === 'bleeding' ? 'Save Ends' : cfg.key === 'slowed' ? 'EoT' : undefined,
		});
	});
	dividerH(list);
	PSEUDO.forEach((cfg) => wbRow(list, cfg, {}));

	const detail = el(wb, 'div', 'dse-condwb__detail');
	const head = el(detail, 'div', 'dse-condwb__detail-head');
	const glyph = el(head, 'span', 'dse-cond-drawer__glyph');
	setIcon(glyph, 'snail', 30);
	const headText = el(head, 'div', 'dse-condwb__detail-title');
	el(headText, 'div', 'dse-custx__eyebrow', 'Condition');
	el(headText, 'div', 'dse-condwb__detail-name', 'Slowed');
	const rows = el(detail, 'div', 'dse-cond-drawer__rows');
	durationChips(field(rows, 'Duration'), { active: 'eot' });
	swatchRow(field(rows, 'Color'), { active: undefined });
	effectChips(field(rows, 'Effect'), { active: 'static' });

	const tray = el(body, 'div', 'dse-condwb__tray');
	el(tray, 'span', 'dse-cond-field__label', 'Adding');
	trayChip(tray, CONDITIONS[0], { color: '#c0392b', dur: 'Save Ends' });
	trayChip(tray, CONDITIONS[6], { dur: 'EoT' });

	footer(modal, [
		{ text: 'Cancel', label: 'Cancel' },
		{ text: 'Add 2 Conditions', label: 'Add 2 Conditions', variant: 'accent' },
	]);
}

/* ------------------------------------------------------------- Option C --- */
/* Two modals, both redesigned: picker rows gain quick duration chips when
   selected; the customize modal becomes a forged surface (coin preview,
   sunken Duration / Appearance sections).                                    */

function optionC(stage) {
	stage.classList.add('mock-stack');

	// Back: the picker, with per-row quick duration chips on selected rows.
	const { modal, body } = modalBox(stage, { title: 'Add Conditions', width: 640, cls: 'mock-modal--behind' });
	const list = el(body, 'div', 'dse-cond-list');
	list.setAttribute('role', 'listbox');
	list.setAttribute('aria-multiselectable', 'true');
	list.setAttribute('aria-label', 'Conditions');
	CONDITIONS.forEach((cfg) => {
		condRow(list, cfg, {
			selected: cfg.key === 'bleeding' || cfg.key === 'slowed',
			color: cfg.key === 'bleeding' ? '#c0392b' : undefined,
			durChips: cfg.key === 'bleeding' ? 'save-ends' : cfg.key === 'slowed' ? 'eot' : undefined,
		});
	});
	dividerH(list);
	PSEUDO.forEach((cfg) => condRow(list, cfg, {}));
	footer(modal, [
		{ text: 'Cancel', label: 'Cancel' },
		{ text: 'Add 2 Conditions', label: 'Add 2 Conditions', variant: 'accent' },
	]);

	// Front: the redesigned customize modal.
	const front = modalBox(stage, { title: 'Customize Condition', width: 440, cls: 'mock-modal--front' });
	const head = el(front.body, 'div', 'dse-custx__head');
	const coin = el(head, 'span', 'dse-custx__coin');
	coin.style.setProperty('--dse-condition-color', '#c0392b');
	setIcon(coin, 'droplet', 26);
	const headText = el(head, 'div', 'dse-custx__head-text');
	el(headText, 'div', 'dse-custx__eyebrow', 'Condition');
	el(headText, 'div', 'dse-custx__name', 'Bleeding');

	const durSection = el(front.body, 'div', 'dse-modal__section dse-custx__section');
	el(durSection, 'div', 'dse-custx__section-title', 'Duration');
	durationChips(durSection, { active: 'save-ends' });

	const lookSection = el(front.body, 'div', 'dse-modal__section dse-custx__section');
	el(lookSection, 'div', 'dse-custx__section-title', 'Appearance');
	swatchRow(field(lookSection, 'Color'), { active: '#c0392b' });
	effectChips(field(lookSection, 'Effect'), { active: 'glow' });

	footer(front.modal, [
		{ text: 'Cancel', label: 'Cancel' },
		{ text: 'Save', label: 'Save', variant: 'accent' },
	]);
}

/* ------------------------------------------------------------- Option D --- */
/* One modal; a vertical list of currently ACTIVE conditions only. Each row:
   colored glyph + name (+ "custom" tag for unregistered keys), at-a-glance
   duration/effect badges, a customize cog, and a delete button at the right
   edge. Below the list, "Add condition" — pressed, it becomes an autocomplete
   combobox whose dropdown filters known conditions as you type and always
   offers an "Add custom: <text>" row so custom statblock abilities work.
   Add/delete apply live; the footer is a single Done.                        */

/** Custom (unregistered) condition — gets the fallback glyph. */
const HEXED = { key: 'hexed', displayName: 'Hexed', iconName: 'circle-dashed' };

const ACTIVE_D = [
	{ cfg: CONDITIONS[0], color: '#c0392b', dur: 'Save Ends' }, // Bleeding
	{ cfg: CONDITIONS[6], dur: 'EoT' }, // Slowed
	{ cfg: HEXED, color: '#7d3c98', dur: 'EoE', fx: 'glow', custom: true },
];

/** An active-condition row: glyph, name, badges, cog + delete on the right. */
function alRow(list, entry, opts = {}) {
	const row = el(list, 'div', 'dse-condal__row');
	row.setAttribute('role', 'listitem');
	if (opts.open) row.classList.add('dse-condal__row--open');
	const glyph = el(row, 'span', 'dse-condal__glyph');
	if (entry.color) glyph.style.setProperty('--dse-condition-color', entry.color);
	setIcon(glyph, entry.cfg.iconName, 18);
	el(row, 'span', 'dse-condal__name', entry.cfg.displayName);
	if (entry.custom) el(row, 'span', 'dse-condal__tag', 'custom');
	if (entry.dur) el(row, 'span', 'dse-cond-item__dur', entry.dur);
	if (entry.fx) el(row, 'span', 'dse-cond-item__dur', entry.fx);
	kitBtn(row, {
		icon: 'cog',
		label: `Customize ${entry.cfg.displayName}`,
		variant: 'ghost',
		pressed: !!opts.open,
		cls: 'dse-condal__act',
	});
	kitBtn(row, {
		icon: 'trash-2',
		label: `Remove ${entry.cfg.displayName}`,
		variant: 'ghost',
		cls: 'dse-condal__act dse-condal__act--delete',
	});
	return row;
}

/** Inline editor panel under an open row (same field grammar as A/B). */
function alEditor(list, { dur, color, fx }) {
	const ed = el(list, 'div', 'dse-condal__editor');
	durationChips(field(ed, 'Duration'), { active: dur });
	swatchRow(field(ed, 'Color'), { active: color });
	effectChips(field(ed, 'Effect'), { active: fx });
	return ed;
}

function alMenuRow(menu, cfg, opts = {}) {
	const item = el(menu, 'div', 'dse-condal__menu-item');
	item.setAttribute('role', 'option');
	item.setAttribute('aria-selected', String(!!opts.active));
	if (opts.active) item.classList.add('dse-condal__menu-item--active');
	const ic = el(item, 'span', 'dse-condal__glyph');
	setIcon(ic, cfg.iconName, 16);
	el(item, 'span', 'dse-condal__menu-name', cfg.displayName);
	return item;
}

/** The add affordance: a dashed button, or (open) the combobox + dropdown. */
function alAdd(parent, { open }) {
	const wrap = el(parent, 'div', 'dse-condal__addwrap');
	if (!open) {
		kitBtn(wrap, {
			icon: 'plus',
			text: 'Add condition',
			label: 'Add condition',
			cls: 'dse-condal__add',
		});
		return;
	}
	const box = el(wrap, 'div', 'dse-condal__combobox');
	box.setAttribute('role', 'combobox');
	box.setAttribute('aria-expanded', 'true');
	box.setAttribute('aria-haspopup', 'listbox');
	const search = el(box, 'span', 'dse-condal__search');
	setIcon(search, 'search', 15);
	// Mock stand-in for the real <input>: typed text + a caret bar.
	const input = el(box, 'span', 'dse-condal__input', 'co');
	el(input, 'span', 'dse-condal__cursor');

	const menu = el(wrap, 'div', 'dse-condal__menu');
	menu.setAttribute('role', 'listbox');
	menu.setAttribute('aria-label', 'Matching conditions');
	alMenuRow(menu, PSEUDO[2], { active: true }); // Covered
	alMenuRow(menu, PSEUDO[3], {}); // Concealed
	alMenuRow(menu, PSEUDO[13], {}); // Unconscious
	dividerH(menu);
	const custom = el(menu, 'div', 'dse-condal__menu-item dse-condal__menu-custom');
	custom.setAttribute('role', 'option');
	custom.setAttribute('aria-selected', 'false');
	const plus = el(custom, 'span', 'dse-condal__glyph');
	setIcon(plus, 'plus', 16);
	const text = el(custom, 'span', 'dse-condal__menu-name');
	text.append('Add custom: ');
	el(text, 'strong', undefined, '“co”');
}

function optionD(stage, state) {
	const { modal, body } = modalBox(stage, { title: 'Conditions', width: 480 });

	const list = el(body, 'div', 'dse-condal__list');
	list.setAttribute('role', 'list');
	list.setAttribute('aria-label', 'Active conditions');
	for (const entry of ACTIVE_D) {
		const isEdit = state === 'edit' && entry.cfg.key === 'slowed';
		alRow(list, entry, { open: isEdit });
		if (isEdit) alEditor(list, { dur: 'eot', color: undefined, fx: 'static' });
	}

	alAdd(body, { open: state === 'autocomplete' });

	footer(modal, [{ text: 'Done', label: 'Done', variant: 'accent' }]);
}

/* ------------------------------------------------------------------ mount -- */

const q = new URLSearchParams(location.search);
document.body.classList.remove('theme-dark', 'theme-light');
document.body.classList.add(q.get('bg') === 'light' ? 'theme-light' : 'theme-dark');

const stage = document.getElementById('stage');
const option = (q.get('option') || 'a').toLowerCase();
if (option === 'a') optionA(stage);
else if (option === 'b') optionB(stage);
else if (option === 'd') optionD(stage, (q.get('state') || 'list').toLowerCase());
else optionC(stage);

document.body.setAttribute('data-sc186-ready', option);
