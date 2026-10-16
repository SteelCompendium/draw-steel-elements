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
/** The two kinds of root prefs.reflect() / prefs.reflectCss() stamp, plus the unstamped default. */
const SHARED_SELECTOR = ':root, :is([data-dse-element], .dse-modal)';

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

	it('no other rule declares any of them (a second declaration would shadow or fork the first)', () => {
		for (const name of SCALE_DEPENDENT) {
			const sites = rules.filter((r) => fsDecls(r.body).some((d) => d.name === name));
			expect(sites.map((r) => r.selector)).toEqual([SHARED_SELECTOR]);
		}
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

	it('the selector keys on the two things the stampers put on a root: data-dse-element (pipeline) and .dse-modal (DseModal)', () => {
		const pipeline = fs.readFileSync(path.join(root, 'src/framework/pipeline.ts'), 'utf8');
		const modal = fs.readFileSync(path.join(root, 'src/framework/kit/managedModal.ts'), 'utf8');
		expect(pipeline).toMatch(/root\.setAttribute\('data-dse-element', def\.id\)/);
		expect(pipeline).toMatch(/cx\.prefs\.reflect\(root, view\)/);
		expect(modal).toMatch(/this\.dialogEl\(\)\.addClass\('dse-modal'\)/);
		expect(modal).toMatch(/prefs\.reflectCss\(this\.dialogEl\(\), this\.lifecycle\)/);
	});
});
