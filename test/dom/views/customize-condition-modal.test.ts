// Plan 09 Task 8 (D2 §3.x) — CustomizeConditionModal on the kit managedModal. The
// native <input type="color"> STAYS (§3.x); the preview icon is colored through the
// VALIDATED --dse-condition-color scoped property (applyConditionColor, OD-8/SD-2) —
// never el.style.color (the legacy preview's SC-5 site, eviction-map
// CustomizeConditionModal.ts:80). Constructor signature (app, conditionData,
// conditionConfig, onUpdate) unchanged for its ConditionSelectModal caller.
import * as fs from 'fs';
import * as path from 'path';
import { CustomizeConditionModal } from '@views/CustomizeConditionModal';
import type { Condition } from '@drawSteelAdmonition/EncounterData';
import { App } from '../../mocks/obsidian';
import { styleGuardFindings } from '../kit/styleGuard';

const CONFIG = { key: 'bleeding', displayName: 'Bleeding', iconName: 'droplet' };

function makeModal(conditionData: Condition) {
	const onUpdate = jest.fn();
	const modal = new CustomizeConditionModal(new App() as any, conditionData, CONFIG, onUpdate);
	modal.open();
	const container = (modal as any).containerEl as HTMLElement;
	const colorInput = container.querySelector('input[type="color"]') as HTMLInputElement;
	const effectSelect = container.querySelector('select') as HTMLSelectElement;
	const preview = container.querySelector('.dse-cust__preview') as HTMLElement;
	return { modal, onUpdate, container, colorInput, effectSelect, preview };
}

function footerBtn(container: HTMLElement, label: string): HTMLButtonElement {
	const el = container.querySelector<HTMLButtonElement>(
		`.dse-modal__footer button[aria-label="${label}"]`,
	);
	if (!el) throw new Error(`no footer button [aria-label="${label}"]`);
	return el;
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('Task 8 (D2 §3.x): CustomizeConditionModal — managedModal scaffold', () => {
	test('is a kit DseModal: .dse-modal, aria-labelledby → the title, real footer <button>s', () => {
		const { container } = makeModal({ key: 'bleeding' });
		expect(container.classList.contains('dse-modal')).toBe(true);
		const titleEl = container.querySelector('.dse-modal__title') as HTMLElement;
		expect(titleEl.textContent).toBe('Customize Condition');
		expect(container.getAttribute('aria-labelledby')).toBe(titleEl.id);
		expect(footerBtn(container, 'Cancel').tagName).toBe('BUTTON');
		expect(footerBtn(container, 'Save').tagName).toBe('BUTTON');
	});

	test('KEEPS the native <input type="color">, defaulting to white when uncustomized', () => {
		const { colorInput } = makeModal({ key: 'bleeding' });
		expect(colorInput).not.toBeNull();
		expect(colorInput.value).toBe('#ffffff');
	});

	test('an existing hex color pre-fills the color input', () => {
		const { colorInput } = makeModal({ key: 'bleeding', color: '#ff0000' });
		expect(colorInput.value).toBe('#ff0000');
	});

	test('the effect dropdown offers static + the 5 effects, pre-selecting the current one', () => {
		const { effectSelect } = makeModal({ key: 'bleeding', effect: 'glow' });
		const values = Array.from(effectSelect.options).map((o) => o.value);
		expect(values).toEqual(['static', 'blink', 'glow', 'glow-pulse', 'breathing', 'blur-pulse']);
		expect(effectSelect.value).toBe('glow');
	});
});

describe('Task 8 (OD-8/SD-2): the preview rides the VALIDATED --dse-condition-color', () => {
	test('the preview renders the condition icon and reflects the CURRENT customization on open', () => {
		const { preview } = makeModal({ key: 'bleeding', color: '#ff0000', effect: 'glow' });
		expect(preview.getAttribute('data-icon')).toBe('droplet');
		expect(preview.style.getPropertyValue('--dse-condition-color')).toBe('#ff0000');
		expect(preview.classList.contains('condition-effect-glow')).toBe(true);
	});

	test('an INVALID stored color is rejected: no property set, falls back to the CSS var() default', () => {
		const { preview } = makeModal({ key: 'bleeding', color: 'not a color' });
		expect(preview.style.getPropertyValue('--dse-condition-color')).toBe('');
	});

	test('picking a color updates the preview property — NEVER el.style.color (SC-5)', () => {
		const { colorInput, preview } = makeModal({ key: 'bleeding' });
		colorInput.value = '#00ff00';
		colorInput.dispatchEvent(new Event('change'));
		expect(preview.style.getPropertyValue('--dse-condition-color')).toBe('#00ff00');
		expect(preview.style.color).toBe('');
	});

	test('changing the effect swaps the preview effect class', () => {
		const { effectSelect, preview } = makeModal({ key: 'bleeding', effect: 'glow' });
		effectSelect.value = 'blink';
		effectSelect.dispatchEvent(new Event('change'));
		expect(preview.classList.contains('condition-effect-glow')).toBe(false);
		expect(preview.classList.contains('condition-effect-blink')).toBe(true);
	});
});

describe('Task 8: save / cancel behavior (legacy callback contract)', () => {
	test('Save hands the edited condition to onUpdate and closes', () => {
		const { container, colorInput, effectSelect, onUpdate } = makeModal({ key: 'bleeding' });
		colorInput.value = '#0000ff';
		colorInput.dispatchEvent(new Event('change'));
		effectSelect.value = 'breathing';
		effectSelect.dispatchEvent(new Event('change'));

		footerBtn(container, 'Save').click();
		expect(onUpdate).toHaveBeenCalledTimes(1);
		expect(onUpdate).toHaveBeenCalledWith({ key: 'bleeding', color: '#0000ff', effect: 'breathing' });
		expect(document.body.contains(container)).toBe(false);
	});

	test('Save does NOT mutate the caller-owned condition object (constructor copies)', () => {
		const original: Condition = { key: 'bleeding' };
		const { container, colorInput } = makeModal(original);
		colorInput.value = '#0000ff';
		colorInput.dispatchEvent(new Event('change'));
		footerBtn(container, 'Save').click();
		expect(original).toEqual({ key: 'bleeding' });
	});

	test('Cancel closes without calling onUpdate', () => {
		const { container, onUpdate } = makeModal({ key: 'bleeding' });
		footerBtn(container, 'Cancel').click();
		expect(onUpdate).not.toHaveBeenCalled();
		expect(document.body.contains(container)).toBe(false);
	});
});

describe('Task 8: source + CSS hygiene', () => {
	test('the view imports the kit + the shared color helper and passes the style guard', () => {
		const src = fs.readFileSync(
			path.join(__dirname, '../../../src/views/CustomizeConditionModal.ts'),
			'utf8',
		);
		expect(src).toMatch(/from '@\/framework\/kit'/);
		expect(src).toMatch(/applyConditionColor/);
		// comment-stripped like the guard itself (the header COMMENT names the ban)
		const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
		expect(code).not.toMatch(/\.style\.color/);
		// The ONE exemption: the color INPUT's initial swatch value is form-control
		// DATA, not styling — the named constant line is blanked before the scan.
		const scanned = src.replace(/^.*COLOR_INPUT_DEFAULT.*$/gm, '');
		expect(styleGuardFindings(scanned)).toEqual([]);
	});

	test('CSS: the preview is colored via var(--dse-condition-color, var(--dse-fg-muted)); the legacy modal block is evicted', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');
		expect(sheet).toMatch(
			/\.dse-cust__preview[^}]*color:\s*var\(--dse-condition-color,\s*var\(--dse-fg-muted\)\)/,
		);
		expect(sheet).not.toMatch(/\.customize-condition-modal/);
		expect(sheet).not.toMatch(/\.customize-condition-body/);
		expect(sheet).not.toMatch(/\.customize-condition-preview/);
		// The condition-effect animation classes are SHARED with the tracker — kept.
		expect(sheet).toMatch(/\.condition-effect-glow/);
	});
});
