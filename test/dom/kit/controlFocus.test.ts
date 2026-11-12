// SC-588 — captureControlFocus / restoreControlFocus: keyboard focus survives a rebuild that empties the root.
// The helper's own rules (where focus lands, when it is left alone); the initiative tracker's five actions are in
// test/dom/elements/initiative-matrix.test.ts ([F]).
import { captureControlFocus, restoreControlFocus, controlSuccessor } from '../../../src/framework/kit/controlFocus';

let root: HTMLElement;

/** Replace the root's content with one button per id (what a whole-element rebuild does). */
function render(ids: string[]): HTMLButtonElement[] {
	root.replaceChildren();
	return ids.map((id) => {
		const b = document.createElement('button');
		b.setAttribute('data-dse-control', id);
		root.appendChild(b);
		return b;
	});
}
const btn = (id: string, n = 0): HTMLElement => root.querySelectorAll<HTMLElement>(`[data-dse-control="${id}"]`)[n];

beforeEach(() => {
	root = document.createElement('div');
	document.body.appendChild(root);
});
afterEach(() => {
	document.body.innerHTML = '';
});

describe('controlFocus (SC-588)', () => {
	test('the control that held focus is replaced and its successor (same id, same position) takes focus', () => {
		render(['a.row', 'a.row', 'a.row'])[1].focus();
		const focus = captureControlFocus(root);
		const [, second] = render(['a.row', 'a.row', 'a.row']);
		expect(document.activeElement).toBe(document.body);
		expect(restoreControlFocus(root, focus)).toBe(true);
		expect(document.activeElement).toBe(second);
	});

	test('a family names a control that changes id when used: Make captain is followed by Relieve captain', () => {
		const families = { 'x.make': 'x.captain', 'x.relieve': 'x.captain' };
		render(['x.make', 'other'])[0].focus();
		const focus = captureControlFocus(root, families);
		render(['x.relieve', 'other']);
		expect(restoreControlFocus(root, focus, families)).toBe(true);
		expect(document.activeElement).toBe(btn('x.relieve'));
	});

	test('a list that shrank hands focus to the last control of its id; a control that is gone hands it to the root, never <body>', () => {
		render(['a.row', 'a.row', 'a.row'])[2].focus();
		let focus = captureControlFocus(root);
		render(['a.row']);
		restoreControlFocus(root, focus);
		expect(document.activeElement).toBe(btn('a.row'));

		btn('a.row').focus();
		focus = captureControlFocus(root);
		render(['b.other']);
		expect(restoreControlFocus(root, focus)).toBe(true);
		expect(document.activeElement).toBe(root);
		expect(root.getAttribute('tabindex')).toBe('-1'); // focusable by script, not a new Tab stop
	});

	test('a focused node with no control id of its own is found through its control ancestor, and a node with none at all falls back to the root', () => {
		const [wrap] = render(['a.wrap']);
		const inner = document.createElement('span');
		inner.tabIndex = 0;
		wrap.appendChild(inner);
		inner.focus();
		const focus = captureControlFocus(root);
		render(['a.wrap']);
		restoreControlFocus(root, focus);
		expect(document.activeElement).toBe(btn('a.wrap'));

		const plain = document.createElement('span');
		plain.tabIndex = 0;
		root.replaceChildren(plain);
		plain.focus();
		const plainFocus = captureControlFocus(root);
		root.replaceChildren();
		restoreControlFocus(root, plainFocus);
		expect(document.activeElement).toBe(root);
	});

	test('nothing is captured when focus is outside the root or on <body>, so a rebuild raised from elsewhere moves no focus', () => {
		const outside = document.createElement('input');
		document.body.appendChild(outside);
		render(['a.row']);
		outside.focus();
		expect(captureControlFocus(root)).toBeNull();
		(document.activeElement as HTMLElement).blur();
		expect(captureControlFocus(root)).toBeNull();
		expect(restoreControlFocus(root, null)).toBe(false);
	});

	test('a restore leaves focus alone when the user (or a modal) has put it somewhere else since', () => {
		render(['a.row'])[0].focus();
		const focus = captureControlFocus(root);
		render(['a.row']);
		const elsewhere = document.createElement('input');
		document.body.appendChild(elsewhere);
		elsewhere.focus();
		expect(restoreControlFocus(root, focus)).toBe(false);
		expect(document.activeElement).toBe(elsewhere);
	});

	test('the keyboard ring follows what the old node showed: a pointer focus is restored without forcing one', () => {
		const spy = jest.spyOn(HTMLElement.prototype, 'focus');
		try {
			for (const ring of [true, false]) {
				render(['a.row'])[0].focus();
				const matches = jest.spyOn(Element.prototype, 'matches').mockReturnValue(ring); // capture reads only `:focus-visible`
				const focus = captureControlFocus(root);
				matches.mockRestore();
				render(['a.row']);
				spy.mockClear();
				restoreControlFocus(root, focus);
				expect(spy).toHaveBeenCalledWith(ring ? { preventScroll: true, focusVisible: true } : { preventScroll: true });
			}
		} finally {
			spy.mockRestore();
		}
	});
});

describe('controlSuccessor (SC-602): the lookup restoreControlFocus uses, without focusing anything', () => {
	test('the nth control of the family, the last when the list shrank, the root when there is none; it follows the family map', () => {
		const families = { 'x.make': 'x.captain', 'x.relieve': 'x.captain' };
		const [, second] = render(['a.row', 'a.row', 'a.row']);
		second.focus();
		const focus = captureControlFocus(root)!;
		const rows = render(['a.row', 'a.row', 'a.row']);
		expect(controlSuccessor(root, focus)).toBe(rows[1]);
		const [only] = render(['a.row']);
		expect(controlSuccessor(root, focus)).toBe(only);
		render(['b.other']);
		expect(controlSuccessor(root, focus)).toBe(root);

		render(['x.make'])[0].focus();
		const family = captureControlFocus(root, families)!;
		const [relieve] = render(['x.relieve']);
		expect(controlSuccessor(root, family, families)).toBe(relieve);
		expect(controlSuccessor(root, { family: null, nth: 0, ring: true })).toBe(root); // a focused node that carried no control id
	});

	test('it never focuses and never sets tabindex (the caller decides)', () => {
		render(['a.row'])[0].focus();
		const focus = captureControlFocus(root)!;
		render(['b.other']);
		(document.activeElement as HTMLElement).blur();
		const spy = jest.spyOn(HTMLElement.prototype, 'focus');
		try {
			expect(controlSuccessor(root, focus)).toBe(root);
			expect(spy).not.toHaveBeenCalled();
			expect(root.hasAttribute('tabindex')).toBe(false);
		} finally {
			spy.mockRestore();
		}
	});
});
