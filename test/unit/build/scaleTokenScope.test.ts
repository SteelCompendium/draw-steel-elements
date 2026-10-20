import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { DSE_PREF_DESCRIPTORS } from '../../../src/prefs/catalog';

/**
 * SC-372 — the three text-size knobs (small / large / control) must reach the `--dse-fs-*` role
 * tokens.
 *
 * Why this is a SOURCE-TEXT suite: jsdom resolves no `var()` cascade, so the behaviour itself
 * (a stamped 1.2 turns the card name from 20px into 24px) is pinned by the real-browser
 * `text scale OK` gate in `visual-harness/shoot.mjs`. What jsdom CAN pin is the structural cause of
 * the bug: a `var(--dse-fs-*-scale)` inside a custom property substitutes on the element the
 * property is DECLARED on, so the `calc(<r>em * var(--dse-fs-large-scale))` tokens declared only
 * on `:root` flattened to `calc(<r>em * 1)` before the inline stamp on an element root could
 * ever apply. The fix declares them on `:root` AND on every root the prefs seam stamps, in ONE
 * rule (one source of truth). These tests fail on `develop` (`f8693b5`): there the tokens sit in
 * a plain `:root { }` block and no `:is([data-dse-element], .dse-modal)` rule declares them.
 */

const root = path.join(__dirname, '..', '..', '..');
const rawCss = fs.readFileSync(path.join(root, 'styles-source.css'), 'utf8');
/** Comments stripped first: several comments in the sheet quote selectors and token names. */
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every innermost `selector { declarations }` rule. The token rules are top-level, so the text
 *  before the `{` is exactly their selector list. */
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
	selector: m[1].replace(/\s+/g, ' ').trim(),
	body: m[2],
}));

/** `--dse-fs-<name>: <value>;` declarations in a rule body. */
function fsDecls(body: string): { name: string; value: string }[] {
	return [...body.matchAll(/(?:^|[\s;])(--dse-fs-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => ({
		name: m[1],
		value: m[2].trim(),
	}));
}

const SCALE_REF = /var\(--dse-fs-(small|large|control)-scale\)/;
const SCALE_DEPENDENT = [
	'--dse-fs-heading', '--dse-fs-subheading', '--dse-fs-numeral',
	'--dse-fs-h1', '--dse-fs-h2', '--dse-fs-h3', '--dse-fs-h4', '--dse-fs-h5', '--dse-fs-h6',
	'--dse-fs-control',
	'--dse-fs-secondary', '--dse-fs-label', '--dse-fs-caption', '--dse-fs-micro',
];
/** The three kinds of root prefs.reflect() / prefs.reflectCss() stamp, plus the unstamped default:
 *  an element root, a DseModal dialog, and (SC-422) a `.dse-fs-root` chrome root. */
const SHARED_SELECTOR = ':root, :is([data-dse-element], .dse-modal, .dse-fs-root)';
/** The inner rule of a registry entry (styles-source.css "SC-372: EACH TEXT-SIZE KNOB APPLIES ONCE"):
 *  inside a registered consumer of knob K, the K roles are plain em ratios, so the knob applies once. */
const ONCE_SELECTOR = '& > *, &::before, &::after, & :is([data-dse-element], .dse-modal, .dse-fs-root)';

describe('SC-372: scale-dependent --dse-fs-* tokens resolve on the root that carries the stamp', () => {
	const declaring = rules.filter((r) => fsDecls(r.body).some((d) => SCALE_REF.test(d.value)));

	it('exactly one rule declares them, and its selector list is :root plus every stamped root', () => {
		expect(declaring.map((r) => r.selector)).toEqual([SHARED_SELECTOR]);
	});

	it('that rule declares all 14 scale-dependent tokens, each over its own knob', () => {
		const decls = fsDecls(declaring[0].body);
		expect(decls.map((d) => d.name).sort()).toEqual([...SCALE_DEPENDENT].sort());
		const knob = (name: string) => decls.find((d) => d.name === name)!.value.match(SCALE_REF)![1];
		for (const n of ['heading', 'subheading', 'numeral', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
			expect(knob(`--dse-fs-${n}`)).toBe('large');
		}
		expect(knob('--dse-fs-control')).toBe('control');
		for (const n of ['secondary', 'label', 'caption', 'micro']) expect(knob(`--dse-fs-${n}`)).toBe('small');
	});

	it('every other declaration of one is in a "applies once" registry rule (SC-372 F1), never a stray rule', () => {
		for (const name of SCALE_DEPENDENT) {
			const sites = rules.filter((r) => fsDecls(r.body).some((d) => d.name === name));
			expect(sites.length).toBeGreaterThanOrEqual(1);
			expect(sites[0].selector).toBe(SHARED_SELECTOR);
			for (const extra of sites.slice(1)) expect(extra.selector).toBe(ONCE_SELECTOR);
		}
	});

	it('each registry rule re-declares the FULL token set of exactly one knob, each at its token rule\'s own em ratio', () => {
		const tokenDecls = fsDecls(declaring[0].body);
		const coefficient = (name: string) => tokenDecls.find((d) => d.name === name)!.value.match(/calc\(([\d.]+)em \*/)![1] + 'em';
		const knobOf = (name: string) => tokenDecls.find((d) => d.name === name)!.value.match(SCALE_REF)![1];
		const registry = rules.filter((r) => r.selector === ONCE_SELECTOR);
		expect(registry.length).toBeGreaterThanOrEqual(1);
		const knobsSeen: string[] = [];
		for (const r of registry) {
			const decls = fsDecls(r.body);
			const knobs = new Set(decls.map((d) => knobOf(d.name)));
			expect([...knobs]).toHaveLength(1);
			const knob = [...knobs][0];
			knobsSeen.push(knob);
			const full = tokenDecls.filter((t) => t.value.includes(`var(--dse-fs-${knob}-scale)`)).map((t) => t.name);
			expect(decls.map((d) => d.name).sort()).toEqual(full.sort());
			for (const d of decls) expect(d.value).toBe(coefficient(d.name));
		}
		// One registry rule per knob that has nested consumers today (small, control); large has none yet.
		expect(knobsSeen.sort()).toEqual(['control', 'small']);
	});

	it('the three multipliers themselves stay on plain :root (the default every unstamped root inherits)', () => {
		for (const knob of ['small', 'large', 'control']) {
			const sites = rules.filter((r) => fsDecls(r.body).some((d) => d.name === `--dse-fs-${knob}-scale`));
			expect(sites.map((r) => r.selector)).toEqual([':root']);
			expect(fsDecls(sites[0].body).find((d) => d.name === `--dse-fs-${knob}-scale`)!.value).toBe('1');
		}
	});

	it('the knobs the tokens multiply by are exactly the css vars the catalog stamps', () => {
		const stamped = DSE_PREF_DESCRIPTORS.flatMap((d) => (d.css?.varName.endsWith('-scale') && d.css.varName.startsWith('--dse-fs-') ? [d.css.varName] : []));
		expect(stamped.sort()).toEqual(['--dse-fs-control-scale', '--dse-fs-large-scale', '--dse-fs-small-scale']);
		const referenced = new Set(fsDecls(declaring[0].body).map((d) => `--dse-fs-${d.value.match(SCALE_REF)![1]}-scale`));
		expect([...referenced].sort()).toEqual(stamped.sort());
	});

	it('the selector keys on the three things the stampers put on a root: data-dse-element (pipeline), .dse-modal (DseModal), .dse-fs-root (chrome)', () => {
		const pipeline = fs.readFileSync(path.join(root, 'src/framework/pipeline.ts'), 'utf8');
		const modal = fs.readFileSync(path.join(root, 'src/framework/kit/managedModal.ts'), 'utf8');
		expect(pipeline).toMatch(/root\.setAttribute\('data-dse-element', def\.id\)/);
		expect(pipeline).toMatch(/cx\.prefs\.reflect\(root, view\)/);
		expect(modal).toMatch(/this\.dialogEl\(\)\.addClass\('dse-modal'\)/);
		expect(modal).toMatch(/prefs\.reflectCss\(this\.dialogEl\(\), this\.lifecycle\)/);
		// SC-422: the chrome stamp is ONE helper (class + reflectCss), and its class is the selector's third member.
		const helper = fs.readFileSync(path.join(root, 'src/framework/kit/textScaleRoot.ts'), 'utf8');
		expect(helper).toMatch(/TEXT_SCALE_ROOT_CLS = 'dse-fs-root'/);
		expect(helper).toMatch(/rootEl\.addClass\(TEXT_SCALE_ROOT_CLS\)/);
		expect(helper).toMatch(/prefs\?\.reflectCss\(rootEl, owner\)/);
	});

	it('every chrome surface stamps through that helper, onto the root that holds its text, with a Component owner (SC-422)', () => {
		const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
		// Compendium search modal: a SuggestModal, so its OWN Component is loaded in onOpen / unloaded in onClose.
		const search = read('src/authoring/CompendiumSearchModal.ts');
		expect(search).toMatch(/stampTextScaleRoot\(this\.modalEl \?\? this\.containerEl, prefsForApp\(this\.app\), this\.prefsOwner\)/);
		expect(search).toMatch(/this\.prefsOwner\.load\(\)/);
		expect(search).toMatch(/this\.prefsOwner\.unload\(\)/);
		// Settings preview: the wrapper holding the caption AND the stage, owned by the per-mount Component.
		const preview = read('src/views/SettingsPreview.ts');
		expect(preview).toMatch(/stampTextScaleRoot\(wrap, textScale\.prefs, textScale\.owner\)/);
		expect(preview).toMatch(/buildPreviewPanel\(containerEl, \{ prefs: fw\.services\.prefs, owner \}\)/);
		// Sidebar: the .dse-sidebar container (header + empty message), owned by the view.
		const sidebar = read('src/framework/sidebar/DseSidebarView.ts');
		expect(sidebar).toMatch(/stampTextScaleRoot\(el, this\.services\.prefs, this\)/);
		// No other source file adds the class or stamps by hand: the helper stays the only door.
		for (const file of ['src/authoring/CompendiumSearchModal.ts', 'src/views/SettingsPreview.ts', 'src/framework/sidebar/DseSidebarView.ts']) {
			expect(read(file)).not.toMatch(/reflectCss\(/);
		}
	});
});
