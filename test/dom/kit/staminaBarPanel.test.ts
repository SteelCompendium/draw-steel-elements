// D7 Task 1 (spec §2.1/§2.3) — kit/StaminaBarPanel: the `.dse-stamina` render core
// lifted from stamina-bar/view.ts's private renderBar/updateBarDisplay. This test
// pins the shared core's own DOM/behavior contract (the stamina-bar element test
// suite, test/dom/elements/stamina-bar.test.ts, pins that the ELEMENT still produces
// the exact same DOM through this core — unmodified by this task).
import { renderStaminaBar, updateStaminaBar } from '../../../src/framework/kit/StaminaBarPanel';
import { Component } from '../../mocks/obsidian';
import * as obsidian from '../../mocks/obsidian';

// Same convention as iconButton.test.ts: the mock Component's runtime shape
// (registerDomEvent/register/unload) is what matters, not structural tsc satisfaction.
function fakeOwner(): any {
	return new Component();
}

/** Numeric value of a --dse-* percentage custom property on an element. */
function dseVar(el: HTMLElement, prop: string): number {
	const raw = el.style.getPropertyValue(prop);
	if (raw === '') throw new Error(`no ${prop} custom property set`);
	return parseFloat(raw);
}

describe('D7 Task 1: kit/StaminaBarPanel — renderStaminaBar', () => {
	test('renders .dse-stamina with track/fill/temp/threshold/pill children and correct fill geometry', () => {
		const root = document.createElement('div');
		const bar = renderStaminaBar(
			root,
			{ current: 15, temp: 5, max: 20 },
			{ canPersist: true },
		)!;

		expect(bar).not.toBeNull();
		expect(bar.hasClass('dse-stamina')).toBe(true);
		// no owner/handler supplied: writable, but a click does nothing, so it is not marked clickable (SC-498)
		expect(bar.hasClass('dse-stamina--clickable')).toBe(false);
		expect(bar.style.getPropertyValue('--dse-bar-h')).toBe('1em');

		// max=20, current=15, temp=5 -> dyingStamina=10, totalStamina=30.
		const fill = bar.querySelector('.dse-stamina__fill') as HTMLElement;
		expect(dseVar(fill, '--dse-fill')).toBeCloseTo(((15 + 10) / 30) * 100, 2);
		expect(fill.getAttribute('data-state')).toBe('healthy');

		const temp = bar.querySelector('.dse-stamina__temp') as HTMLElement;
		expect(dseVar(temp, '--dse-temp-fill')).toBeCloseTo((5 / 30) * 100, 2);

		const track = bar.querySelector('.dse-stamina__track') as HTMLElement;
		expect(dseVar(track, '--dse-zone')).toBeCloseTo((10 / 30) * 100, 2);

		const thresholds = bar.querySelectorAll('.dse-stamina__threshold');
		expect(thresholds).toHaveLength(2);
		expect(thresholds[0].textContent).toBe('Dying');
		expect(thresholds[1].textContent).toBe('Winded');

		const pill = bar.querySelector('.dse-stamina__num .dse-stamina__pill') as HTMLElement;
		expect(pill.textContent).toBe('(15/20 + 5)');
	});

	test('height opt feeds --dse-bar-h; omitted defaults to 1', () => {
		const root = document.createElement('div');
		const bar = renderStaminaBar(root, { current: 1, temp: 0, max: 2 }, { canPersist: true, height: 3 })!;
		expect(bar.style.getPropertyValue('--dse-bar-h')).toBe('3em');
	});

	test('temp <= 0: pill omits the "+ N" suffix', () => {
		const root = document.createElement('div');
		const bar = renderStaminaBar(root, { current: 15, temp: 0, max: 20 }, { canPersist: true })!;
		const pill = bar.querySelector('.dse-stamina__num .dse-stamina__pill') as HTMLElement;
		expect(pill.textContent).toBe('(15/20)');
	});

	test('current <= 0: [data-state="dying"]; below half max: [data-state="winded"]', () => {
		const root1 = document.createElement('div');
		const dying = renderStaminaBar(root1, { current: 0, temp: 0, max: 20 }, { canPersist: true })!;
		expect(dying.querySelector('.dse-stamina__fill')!.getAttribute('data-state')).toBe('dying');

		const root2 = document.createElement('div');
		const winded = renderStaminaBar(root2, { current: 5, temp: 0, max: 20 }, { canPersist: true })!;
		expect(winded.querySelector('.dse-stamina__fill')!.getAttribute('data-state')).toBe('winded');
	});

	test('FOLLOWUPS #27a: current === floor(max/2) (exactly half): [data-state="winded"], not "healthy" (RR §8 "at half Stamina max OR BELOW"; matches the winded badge\'s <= convention, StaminaBar.isWinded)', () => {
		const root = document.createElement('div');
		const bar = renderStaminaBar(root, { current: 10, temp: 0, max: 20 }, { canPersist: true })!;
		expect(bar.querySelector('.dse-stamina__fill')!.getAttribute('data-state')).toBe('winded');
	});

	test('FOLLOWUPS #28 LOW: max=0 (full-degrade, no authored max) renders a defined empty bar, never a NaN width', () => {
		const root = document.createElement('div');
		const bar = renderStaminaBar(root, { current: 0, temp: 0, max: 0 }, { canPersist: false })!;

		const fill = bar.querySelector('.dse-stamina__fill') as HTMLElement;
		const temp = bar.querySelector('.dse-stamina__temp') as HTMLElement;
		const track = bar.querySelector('.dse-stamina__track') as HTMLElement;
		const pill = bar.querySelector('.dse-stamina__num .dse-stamina__pill') as HTMLElement;

		expect(fill.style.getPropertyValue('--dse-fill')).toBe('0%');
		expect(temp.style.getPropertyValue('--dse-temp-fill')).toBe('0%');
		expect(track.style.getPropertyValue('--dse-zone')).toBe('0%');
		for (const el of [fill, temp, track]) {
			expect(el.getAttribute('style') ?? '').not.toMatch(/NaN/);
		}
		// SC-132 (review L6): 'healthy', NOT 'dying'. `max = 0` is the FULL-DEGRADE case
		// this test exists for — every reference failed and no `max_stamina` was authored
		// — and `current <= 0` is trivially true there, so the old answer dressed an
		// UNCONFIGURED block in the whole dying treatment: red frame, red ground, a skull
		// crest and the word DYING, for a hero the plugin simply could not resolve. That
		// was invisible before SC-132 (the Legacy fill's `data-state` only tints a bar
		// nobody can read at 0 width) and became loud the moment the Steel cluster started
		// paying attention to it. A bar with no maximum is not dying; state is undefined
		// there, and 'healthy' is the quiet answer. The NaN/geometry half of this test —
		// the actual FOLLOWUPS #28 subject — is unchanged above.
		expect(fill.getAttribute('data-state')).toBe('healthy');
		expect(pill.textContent).toBe('(0/0)');
	});

	test('canPersist: false — no clickable modifier, applies the read-only tooltip, no click listener registered', () => {
		const root = document.createElement('div');
		const owner = fakeOwner();
		const registerSpy = jest.spyOn(owner, 'registerDomEvent');
		const onClick = jest.fn();

		const bar = renderStaminaBar(root, { current: 1, temp: 0, max: 2 }, {
			canPersist: false,
			owner,
			onClick,
			readOnlyTooltip: 'Read-only in this context',
		})!;

		expect(bar.hasClass('dse-stamina--clickable')).toBe(false);
		// Real Obsidian's setTooltip stamps `aria-label` (FOLLOWUPS #27-fix-round
		// finding 1), not `data-tooltip`.
		expect(bar.getAttribute('aria-label')).toBe('Read-only in this context');
		expect(registerSpy).not.toHaveBeenCalled();
	});

	test('canPersist: true — registers the click listener via the owner Component', () => {
		const root = document.createElement('div');
		const owner = fakeOwner();
		const registerSpy = jest.spyOn(owner, 'registerDomEvent');
		const onClick = jest.fn();

		const bar = renderStaminaBar(root, { current: 1, temp: 0, max: 2 }, {
			canPersist: true,
			owner,
			onClick,
		})!;

		expect(registerSpy).toHaveBeenCalledWith(bar, 'click', expect.any(Function));
		bar.querySelector<HTMLElement>('.dse-stamina__track')!.click();
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	// SC-492: the chrome panel is mounted inside the bar's cluster plate, so a chrome
	// button's click bubbles to the bar. The bar's handler must leave it alone.
	test('canPersist: true — a click that comes from inside .dse-chrome is not the bar\'s click', () => {
		const root = document.createElement('div');
		const onClick = jest.fn();
		const bar = renderStaminaBar(root, { current: 1, temp: 0, max: 2 }, {
			canPersist: true,
			owner: fakeOwner(),
			onClick,
		})!;
		const chromeBtn = bar.querySelector('.dse-stamina__cluster')!.createDiv({ cls: 'dse-chrome' }).createEl('button');

		chromeBtn.click();

		expect(onClick).not.toHaveBeenCalled();
	});

	// —— SC-498: the keyboard path (the bar is one tab stop; Enter/Space open it like a click) ——

	function keydown(target: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
		const evt = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
		target.dispatchEvent(evt);
		return evt;
	}

	function keyboardBar(onClick = jest.fn(), extra: Record<string, unknown> = {}) {
		const root = document.createElement('div');
		document.body.appendChild(root);
		const bar = renderStaminaBar(root, { current: 31, temp: 0, max: 48 }, {
			canPersist: true,
			owner: fakeOwner(),
			onClick,
			...extra,
		})!;
		return { root, bar, onClick };
	}

	afterEach(() => {
		document.body.innerHTML = '';
	});

	test('SC-498: a clickable bar is exactly one tab stop, named for what it does, and takes focus', () => {
		const { bar } = keyboardBar();

		expect(bar.getAttribute('tabindex')).toBe('0');
		// role="group", not "button": the chrome panel's real <button>s live inside the bar, and a
		// role="button" ancestor would flatten them out of the accessibility tree.
		expect(bar.getAttribute('role')).toBe('group');
		expect(bar.getAttribute('aria-label')).toBe('Edit Stamina: 31 of 48');
		// The key cue a role="button" would have carried (a group says nothing about being operable).
		expect(bar.getAttribute('aria-description')).toBe('Press Enter or Space to open the Stamina editor');
		// One stop: nothing else in the bar's own markup is focusable (the chrome panel's buttons are
		// native <button>s mounted later by the framework, not tabindex'd here).
		expect(bar.querySelectorAll('[tabindex]')).toHaveLength(0);
		bar.focus();
		expect(document.activeElement).toBe(bar);
	});

	test('SC-498: Enter on the focused bar opens it like a click, once, and is handled', () => {
		const { bar, onClick } = keyboardBar();

		const evt = keydown(bar, 'Enter');

		expect(onClick).toHaveBeenCalledTimes(1);
		expect(evt.defaultPrevented).toBe(true);
	});

	test('SC-498: Space opens it too, and preventDefault stops the page scrolling', () => {
		const { bar, onClick } = keyboardBar();

		const evt = keydown(bar, ' ');

		expect(onClick).toHaveBeenCalledTimes(1);
		expect(evt.defaultPrevented).toBe(true);
	});

	test('SC-498: other keys, modified Enter/Space and auto-repeat do nothing', () => {
		const { bar, onClick } = keyboardBar();

		keydown(bar, 'a');
		keydown(bar, 'Tab');
		keydown(bar, 'Enter', { ctrlKey: true });
		keydown(bar, ' ', { metaKey: true });
		keydown(bar, 'Enter', { repeat: true });

		expect(onClick).not.toHaveBeenCalled();
	});

	test('SC-498: Enter/Space on a chrome button inside the bar are left to the button (no open, not swallowed)', () => {
		const { bar, onClick } = keyboardBar();
		const chromeBtn = bar.querySelector('.dse-stamina__cluster')!.createDiv({ cls: 'dse-chrome' }).createEl('button');

		const enter = keydown(chromeBtn, 'Enter');
		const space = keydown(chromeBtn, ' ');

		expect(onClick).not.toHaveBeenCalled();
		// the browser's own button activation (a click) must still happen
		expect(enter.defaultPrevented).toBe(false);
		expect(space.defaultPrevented).toBe(false);
	});

	test('SC-498: a mouse click elsewhere on the bar still opens it', () => {
		const { bar, onClick } = keyboardBar();

		bar.querySelector<HTMLElement>('.dse-stamina__track')!.click();

		expect(onClick).toHaveBeenCalledTimes(1);
	});

	test('SC-498: no tab stop wherever a click would not open it (read-only, no handler, keyboard: false)', () => {
		const readOnly = document.createElement('div');
		const ro = renderStaminaBar(readOnly, { current: 1, temp: 0, max: 2 }, {
			canPersist: false,
			owner: fakeOwner(),
			onClick: jest.fn(),
			readOnlyTooltip: 'Read-only in this context',
		})!;
		const noHandler = renderStaminaBar(document.createElement('div'), { current: 1, temp: 0, max: 2 }, {
			canPersist: true,
			owner: fakeOwner(),
		})!;
		const optedOut = keyboardBar(jest.fn(), { keyboard: false });

		for (const bar of [ro, noHandler, optedOut.bar]) {
			expect(bar.hasAttribute('tabindex')).toBe(false);
			expect(bar.hasAttribute('role')).toBe(false);
		}
		// the read-only bar keeps its tooltip as its only label
		expect(ro.getAttribute('aria-label')).toBe('Read-only in this context');
		// keyboard: false leaves the mouse path alone
		optedOut.bar.querySelector<HTMLElement>('.dse-stamina__track')!.click();
		expect(optedOut.onClick).toHaveBeenCalledTimes(1);
		keydown(optedOut.bar, 'Enter');
		expect(optedOut.onClick).toHaveBeenCalledTimes(1);
	});

	test('SC-498: the bar is marked clickable (pointer cursor) only when a handler exists', () => {
		const make = (opts: Record<string, unknown>) =>
			renderStaminaBar(document.createElement('div'), { current: 1, temp: 0, max: 2 }, { canPersist: true, ...opts } as never)!;

		expect(make({ owner: fakeOwner(), onClick: jest.fn() }).hasClass('dse-stamina--clickable')).toBe(true);
		expect(make({ owner: fakeOwner() }).hasClass('dse-stamina--clickable')).toBe(false); // no handler
		expect(make({ onClick: jest.fn() }).hasClass('dse-stamina--clickable')).toBe(false); // no owner to register on
		expect(make({ owner: fakeOwner(), onClick: jest.fn(), canPersist: false }).hasClass('dse-stamina--clickable')).toBe(false);
	});

	test('SC-498: the accessible name follows targeted updates (current / max / temp)', () => {
		const { bar } = keyboardBar();

		updateStaminaBar(bar, { current: 12, temp: 4, max: 48 });

		expect(bar.getAttribute('aria-label')).toBe('Edit Stamina: 12 of 48, 4 temporary');
	});

	// —— SC-183: the `gauge` render option (the initiative tracker's creature/pool bars) ——

	test('gauge: { dyingZone: false } builds the cluster gauge WITHOUT the hero dying reserve (data-zone="off"), and updateStaminaBar keeps that geometry', () => {
		const root = document.createElement('div');
		const bar = renderStaminaBar(root, { current: 10, temp: 0, max: 40 }, {
			canPersist: true,
			gauge: { dyingZone: false },
		})!;

		const gauge = bar.querySelector('.dse-stamina__cluster > .dse-stamina__gauge') as HTMLElement;
		expect(gauge.getAttribute('data-zone')).toBe('off');
		// No reserve: the zero bulkhead collapses onto the channel's left edge.
		expect(dseVar(gauge, '--dse-zone')).toBe(0);
		expect(dseVar(gauge, '--dse-pour-w')).toBeCloseTo((10 / 40) * 100, 2);

		// The targeted update must RE-DERIVE dyingZone from the gauge itself (its
		// data-zone attr), not silently reapply the hero default — the regression this
		// pins: an update that assumed { dyingZone: true } would recompute the pour on a
		// zone-shifted ruler and the bar would jump on the first edit.
		updateStaminaBar(bar, { current: 20, temp: 0, max: 40 });
		expect(dseVar(gauge, '--dse-zone')).toBe(0);
		expect(dseVar(gauge, '--dse-pour-w')).toBeCloseTo(50, 2);
	});

	test('gauge: ticks render as --tick graduations at the given channel fractions (the minion-pool cell mini)', () => {
		const root = document.createElement('div');
		const bar = renderStaminaBar(root, { current: 9, temp: 0, max: 20 }, {
			canPersist: true,
			gauge: { dyingZone: false, ticks: [0.25, 0.5, 0.75] },
		})!;
		const ticks = bar.querySelectorAll<HTMLElement>('.dse-stamina__gidx--tick');
		expect(ticks.length).toBe(3);
		expect(ticks[0].style.getPropertyValue('--dse-tick-x')).toBe('25%');
		expect(ticks[2].style.getPropertyValue('--dse-tick-x')).toBe('75%');
	});

	test('gauge option omitted — the pre-SC-183 hero default is unchanged (dying reserve present)', () => {
		const root = document.createElement('div');
		const bar = renderStaminaBar(root, { current: 10, temp: 0, max: 20 }, { canPersist: true })!;
		const gauge = bar.querySelector('.dse-stamina__cluster > .dse-stamina__gauge') as HTMLElement;
		expect(gauge.getAttribute('data-zone')).toBeNull();
		expect(dseVar(gauge, '--dse-zone')).toBeGreaterThan(0);
	});

	test("style: 'sheet' renders the notice instead of the bar, and returns null", () => {
		const root = document.createElement('div');
		const bar = renderStaminaBar(root, { current: 1, temp: 0, max: 2 }, {
			canPersist: true,
			style: 'sheet',
		});

		expect(bar).toBeNull();
		expect(root.querySelector('.dse-stamina')).toBeNull();
		const notice = root.querySelector('.dse-stamina__notice') as HTMLElement;
		expect(notice.textContent).toBe('Sheet style is not implemented, use default style');
	});

	test('SC-5: the only inline styles are --dse-* custom properties', () => {
		const root = document.createElement('div');
		renderStaminaBar(root, { current: 15, temp: 5, max: 20 }, { canPersist: true });

		for (const el of Array.from(root.querySelectorAll<HTMLElement>('[style]'))) {
			for (const decl of el.getAttribute('style')!.split(';')) {
				if (decl.trim() === '') continue;
				expect(decl.trim()).toMatch(/^--dse-/);
			}
		}
	});
});

describe('D7 Task 1: kit/StaminaBarPanel — updateStaminaBar (targeted, no rebuild)', () => {
	test('mutates the fill/temp/zone/pill nodes IN PLACE — root identity + child identity stable', () => {
		const root = document.createElement('div');
		const bar = renderStaminaBar(root, { current: 15, temp: 5, max: 20 }, { canPersist: true })!;
		const fillBefore = bar.querySelector('.dse-stamina__fill');
		const tempBefore = bar.querySelector('.dse-stamina__temp');
		const pillBefore = bar.querySelector('.dse-stamina__num .dse-stamina__pill');

		updateStaminaBar(bar, { current: 20, temp: 0, max: 20 });

		// Same element identities — no DOM rebuild.
		expect(bar.querySelector('.dse-stamina__fill')).toBe(fillBefore);
		expect(bar.querySelector('.dse-stamina__temp')).toBe(tempBefore);
		expect(bar.querySelector('.dse-stamina__num .dse-stamina__pill')).toBe(pillBefore);

		const fill = bar.querySelector('.dse-stamina__fill') as HTMLElement;
		expect(dseVar(fill, '--dse-fill')).toBeCloseTo(100, 2);
		expect(fill.getAttribute('data-state')).toBe('healthy');
		const pill = bar.querySelector('.dse-stamina__num .dse-stamina__pill') as HTMLElement;
		expect(pill.textContent).toBe('(20/20)');
	});
});

describe('SC-196 round 3 — the cluster temp plate is color-only otherwise (§4.7)', () => {
	test('temp > 0: the "+N" badge gets an on-hover tooltip naming it, and the same word in aria-label', () => {
		const root = document.createElement('div');
		const spy = jest.spyOn(obsidian, 'setTooltip');
		const bar = renderStaminaBar(root, { current: 15, temp: 4, max: 20 }, { canPersist: true })!;
		const tempEl = bar.querySelector('.dse-stamina__ctemp') as HTMLElement;
		expect(tempEl.textContent).toBe('+4');
		expect(spy).toHaveBeenCalledWith(tempEl, 'Temporary Stamina: 4');
		expect(tempEl.getAttribute('aria-label')).toBe('Temporary Stamina: 4');
	});

	test('temp == 0: no badge text and no tooltip/aria-label', () => {
		const root = document.createElement('div');
		const bar = renderStaminaBar(root, { current: 15, temp: 0, max: 20 }, { canPersist: true })!;
		const tempEl = bar.querySelector('.dse-stamina__ctemp') as HTMLElement;
		expect(tempEl.textContent).toBe('');
		expect(tempEl.hasAttribute('aria-label')).toBe(false);
	});

	test('updateStaminaBar clears the tooltip in place when temp drops back to 0', () => {
		const root = document.createElement('div');
		const bar = renderStaminaBar(root, { current: 15, temp: 4, max: 20 }, { canPersist: true })!;
		const tempEl = bar.querySelector('.dse-stamina__ctemp') as HTMLElement;
		expect(tempEl.getAttribute('aria-label')).toBe('Temporary Stamina: 4');

		updateStaminaBar(bar, { current: 19, temp: 0, max: 20 });
		expect(tempEl.textContent).toBe('');
		expect(tempEl.hasAttribute('aria-label')).toBe(false);
	});
});
