// SC-408 (P2b) — shared setup for the stamina-surface logic matrices (L1 jsdom layer).
//
// Not a test file (jest's testMatch is *.test.ts). It carries the two pieces every matrix
// suite needs and that the older suites each re-declare privately:
//   * a direct StaminaEditModal builder + the selectors for its kit controls, and
//   * a real-pipeline host/deps builder for the ds-stamina / ds-hero / ds-initiative entry
//     points (same service wiring as stamina-bar.test.ts / staminaRecoveries.test.ts).
import { StaminaBar } from '@model/StaminaBar';
import { StaminaEditModal } from '@views/StaminaEditModal';
import type { StaminaEditModalOptions } from '@views/StaminaEditModal';
import type { ElementPipelineDeps } from '../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../src/framework/host/BlockHost';
import { createThemeService } from '../../src/framework/seams/theme';
import { createPreferenceStore } from '../../src/framework/seams/prefs';
import type { PrefsStorage } from '../../src/framework/seams/prefs';
import { createRollService } from '../../src/framework/roll/service';
import { createReferenceService } from '../../src/framework/seams/refs';
import { createValidationService } from '../../src/framework/validation';
import { createSessionStore } from '../../src/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { DSE_PREF_DESCRIPTORS } from '../../src/prefs/catalog';
import { FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from 'main';
import { App, Plugin } from '../mocks/obsidian';

// ---------------------------------------------------------------- modal level

export interface ModalSpec {
	max: number;
	current: number;
	temp?: number;
	isHero?: boolean;
	recoveries?: number;
	recoveries_max?: number;
	opts?: StaminaEditModalOptions;
	name?: string;
}

/** Open a StaminaEditModal over a fresh StaminaBar and return the live handles. */
export function openStaminaModal(spec: ModalSpec) {
	const app = new App();
	const bar = new StaminaBar(
		false,
		false,
		spec.max,
		spec.current,
		spec.temp ?? 0,
		1,
		'default',
		spec.recoveries,
		spec.recoveries_max,
	);
	const updateCallback = jest.fn();
	const modal = new StaminaEditModal(app as any, bar, spec.isHero ?? true, spec.name ?? 'Probe', updateCallback, spec.opts);
	modal.open();
	const content = (modal as any).contentEl as HTMLElement;
	return { modal: modal as any, bar, content, updateCallback };
}

/** The kit iconButton carrying the given accessible name (throws when absent). */
export function btn(content: HTMLElement, label: string): HTMLButtonElement {
	const el = content.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
	if (!el) throw new Error(`no button [aria-label="${label}"]`);
	return el;
}

/** Spend Recovery's aria-label is dynamic (it becomes the disabled-reason tooltip), so it
 *  is found by its stable icon. Null when the caller suppressed the control. */
export function spendRecoveryBtn(content: HTMLElement): HTMLButtonElement | null {
	return content.querySelector<HTMLButtonElement>('button:has([data-icon="syringe"])');
}

/** The footer's primary (accent) action button — dynamic "Gain N Stamina…" text. */
export function applyBtn(content: HTMLElement): HTMLButtonElement {
	const el = content.querySelector<HTMLButtonElement>('.dse-modal__footer .dse-btn--accent');
	if (!el) throw new Error('no footer accent action button');
	return el;
}

export function applyInput(content: HTMLElement): HTMLInputElement {
	return content.querySelector<HTMLInputElement>('.dse-sedit__apply-input')!;
}

/** The Stamina stepper's text input (the first stepper) / the Temporary Stamina one. */
export function staminaInput(content: HTMLElement): HTMLInputElement {
	return content.querySelectorAll<HTMLElement>('.dse-stepper')[0].querySelector<HTMLInputElement>('.dse-stepper__input')!;
}
export function tempInput(content: HTMLElement): HTMLInputElement {
	return content.querySelectorAll<HTMLElement>('.dse-stepper')[1].querySelector<HTMLInputElement>('.dse-stepper__input')!;
}

/** Type into a stepper input and commit with Enter (the kit stepper's commit gesture). */
export function typeCommit(input: HTMLInputElement, value: string): void {
	input.value = value;
	input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
}

/** Put `amount` in the Apply box and press Damage / Healing. */
export function pressDamage(content: HTMLElement, amount: string | number): void {
	applyInput(content).value = String(amount);
	btn(content, 'Damage').click();
}
export function pressHealing(content: HTMLElement, amount: string | number): void {
	applyInput(content).value = String(amount);
	btn(content, 'Healing').click();
}

/** The label the Apply button shows for a pending (stamina, temp) change — spelled out
 *  here (not read from the implementation) so a wording regression fails the matrix. */
export function expectedApplyLabel(stamina: number, temp: number): string {
	const parts: string[] = [];
	if (stamina < 0) parts.push(`Lose ${-stamina} Stamina`);
	else if (stamina > 0) parts.push(`Gain ${stamina} Stamina`);
	if (temp < 0) parts.push(`Lose ${-temp} Temp Stamina`);
	else if (temp > 0) parts.push(`Gain ${temp} Temp Stamina`);
	return parts.length ? parts.join(' and ') : 'No Stamina Change';
}

// ------------------------------------------------------------ pipeline level

export function makeHost(lang: string, overrides: Partial<BlockHost> = {}) {
	const replaceSource = jest.fn(async (_newSource: string) => true);
	const containerEl = document.createElement('div');
	document.body.appendChild(containerEl);
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language: lang, lineStart: 0, lineEnd: 30 }),
		replaceSource,
		blockKey: () => `Note.md::${lang}::0`,
		...overrides,
	};
	return host as BlockHost & { containerEl: HTMLElement; replaceSource: typeof replaceSource };
}

/** Real service instances (stamina-bar.test.ts convention). */
export function makeDeps(prefOverrides: Record<string, unknown> = {}): ElementPipelineDeps {
	const app = new App();
	app.vault.setFile('Media/token_1.png', '');
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async (k: string) => prefOverrides[k] as any, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	prefs.describe(DSE_PREF_DESCRIPTORS);
	const theme = createThemeService(prefs, plugin as any);
	const refs = createReferenceService(app as any, DEFAULT_SETTINGS);
	const validation = createValidationService();
	for (const { id, schema } of FRAMEWORK_V2_DEPENDENCY_SCHEMAS) {
		validation.addDependencySchema(id, schema);
	}
	return {
		app: app as any,
		plugin: plugin as any,
		settings: DEFAULT_SETTINGS,
		theme,
		prefs,
		refs,
		validation,
		session: createSessionStore(),
		roll: createRollService(prefs),
	};
}

/** The most recently opened modal container (the obsidian-mock Modal appends to body). */
export const lastModal = (): HTMLElement => document.body.lastElementChild as HTMLElement;

/** Last YAML the host was asked to write, or null. */
export function lastWrite(host: { replaceSource: jest.Mock }): string | null {
	return (host.replaceSource.mock.calls.at(-1)?.[0] as string | undefined) ?? null;
}
