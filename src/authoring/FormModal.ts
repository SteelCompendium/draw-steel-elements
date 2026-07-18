// Plan 15 Task 5 (D9 §3.2) — the generic Form editor. ONE modal for every element: schema
// fields → Setting controls (schemaless → a raw-YAML textarea, OD-4b), a working object,
// live validation via ValidationService (Save disabled while invalid — OD-6), a live
// preview built with def.createView (torn down with the modal), and Save through
// host.replaceSource — the SAME write path persisted elements use (OD-D9-12: no parallel
// writer). No per-element form code.
//
// Fix round 1 (review findings):
//  - Critical 1: the reserved per-block `prefs:` map is popped at open via the SAME
//    extractPrefOverrides the pipeline uses (src/framework/prefOverrides.ts), held aside
//    (never enters `working`/validation/def.parse — matches OD-D4-2), and re-emitted on
//    Save via the SAME withPrefOverrides wrapper — no second reimplementation.
//  - Critical 2: the live preview mounts through a PREVIEW BlockHost (canPersist: false,
//    replaceSource stubbed to resolve false) so it can never become a second write path.
//    The pipeline's own data-dse-readonly badge is stamped manually here because the
//    preview bypasses ElementPipeline.run entirely.
//  - Important 3: openFormEditor now routes through openManagedModal(owner, factory), so
//    the form closes automatically when the opening view unloads (F1 §4.5), like every
//    other DseModal consumer.
//  - Important 4: a false host.replaceSource() (the block moved/vanished) now surfaces a
//    Notice and leaves the modal open instead of silently closing on a write that never
//    happened.
import { Notice, Setting, parseYaml, stringifyYaml } from 'obsidian';
import type { Component } from 'obsidian';
import type { RenderContext } from '@/framework/context';
import type { BlockHost } from '@/framework/host/BlockHost';
import type { ElementDefinition } from '@/framework/registry';
import type { DsePrefs } from '@/framework/seams/prefs';
import type { ValidationService } from '@/framework/validation';
import { DseModal, openManagedModal } from '@/framework/kit/managedModal';
import { extractPrefOverrides, withPrefOverrides } from '@/framework/prefOverrides';
import { fieldsFromSchema, type FormField } from './formModel';

/** `renderField`'s non-textarea widgets (toggle/number/select/text) only ever read a
 *  scalar out of `working` -- the 'textarea' widget (array/object/$ref nodes) returns
 *  early above and never reaches these branches. `scalarToString` documents that
 *  pre-existing domain invariant explicitly (a named local narrows `unknown` to this
 *  type before stringifying), rather than changing what gets displayed for a value
 *  that violates it. Not inlined as `String(current as FormScalar)` at each call site:
 *  `String()`'s parameter is `any`, so `no-unnecessary-type-assertion` strips an
 *  inline cast there right back out, which reopens `no-base-to-string`'s complaint --
 *  routing through an explicitly `FormScalar`-typed local satisfies both. */
type FormScalar = string | number | boolean;

function scalarToString(value: unknown): string {
	const scalar: FormScalar = value as FormScalar;
	return String(scalar);
}

class FormModal extends DseModal {
	private working: Record<string, unknown> = {};
	private prefOverrides: Partial<DsePrefs> | undefined;
	private rawMode = false;
	private rawText = '';
	private saveDisabled = false;
	private errorEl: HTMLElement | null = null;
	private previewEl: HTMLElement | null = null;
	private previewView: { unload(): void } | null = null;
	private saveHandle: { setDisabled(disabled: boolean): void } | null = null;

	constructor(
		private readonly cx: RenderContext,
		private readonly def: ElementDefinition,
		private readonly source: string,
		private readonly validation: ValidationService,
	) {
		super(cx.app);
	}

	onOpen(): void {
		super.onOpen();
		this.setDseTitle(`Edit ${this.def.name}`);
		try {
			const parsed: unknown = parseYaml(this.source);
			const rawData = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
			// Critical 1: pop the reserved `prefs:` override map BEFORE it ever reaches
			// `working` (validation/def.parse never see it — same contract as the
			// pipeline's own extractPrefOverrides call).
			this.prefOverrides = extractPrefOverrides(rawData, this.cx.prefs);
			this.working = rawData;
		} catch {
			this.working = {};
		}
		const fields = fieldsFromSchema(this.def);
		this.rawMode = !this.def.schema || fields.length === 0;

		if (this.rawMode) {
			this.rawText = this.source;
			this.renderRaw();
		} else {
			for (const field of fields) this.renderField(field);
		}
		this.previewEl = this.body.createDiv({ cls: 'dse-form__preview' });
		this.errorEl = this.body.createDiv({ cls: 'dse-form__errors' });

		const [save] = this.footer([
			{ label: 'Save', icon: 'save', variant: 'accent', onClick: () => void this.save() },
			{ label: 'Cancel', icon: 'x', variant: 'ghost', onClick: () => this.close() },
		]);
		this.saveHandle = save;
		this.revalidate();
	}

	/** A full-width real <textarea> (not Setting.addTextArea) so raw YAML gets room. */
	private textarea(labelText: string, initial: string, onInput: (value: string) => void): void {
		this.body.createEl('label', { cls: 'dse-form__label', text: labelText });
		const ta = this.body.createEl('textarea', { cls: 'dse-form__raw' });
		ta.value = initial;
		this.lifecycle.registerDomEvent(ta, 'input', () => onInput(ta.value));
	}

	private renderRaw(): void {
		this.textarea('YAML', this.rawText, (value) => {
			this.rawText = value;
			this.revalidate();
		});
	}

	private renderField(field: FormField): void {
		const current = this.working[field.key];
		if (field.widget === 'textarea') {
			// Array/object/$ref nodes: a real YAML sub-editor (rich row editors deferred).
			this.textarea(field.label, current == null ? '' : stringifyYaml(current).trimEnd(), (value) => {
				try {
					this.working[field.key] = value === '' ? undefined : parseYaml(value);
				} catch {
					this.working[field.key] = value; // keep raw; validation flags it
				}
				this.revalidate();
			});
			return;
		}
		const setting = new Setting(this.body).setName(field.label);
		if (field.help) setting.setDesc(field.help);
		const set = (value: unknown): void => {
			this.working[field.key] = value;
			this.revalidate();
		};
		switch (field.widget) {
			case 'toggle':
				setting.addToggle((t) => t.setValue(current === true).onChange(set));
				break;
			case 'number':
				setting.addText((t) =>
					t.setValue(current == null ? '' : scalarToString(current)).onChange((v) => set(v === '' ? undefined : Number(v))),
				);
				break;
			case 'select': {
				// Minor fix: an implicit default (no value in `working` yet) is still
				// SHOWN as the first enum option — write it back to `working` immediately
				// so state matches display (validation/preview/Save all see what the user
				// sees), instead of silently staying undefined until the user touches it.
				const fallback = field.enum?.[0];
				const initial = current == null ? (fallback ?? '') : scalarToString(current);
				if (current == null && fallback !== undefined) this.working[field.key] = fallback;
				setting.addDropdown((d) => {
					for (const opt of field.enum ?? []) d.addOption(opt, opt);
					d.setValue(initial).onChange(set);
				});
				break;
			}
			case 'text':
			default:
				setting.addText((t) => t.setValue(current == null ? '' : scalarToString(current)).onChange(set));
				break;
		}
	}

	/** Current body text: raw textarea verbatim, else serialize(model)/stringify(working) —
	 *  re-emitting the popped `prefs:` map ahead of the body via the SAME withPrefOverrides
	 *  the pipeline uses (Critical 1), when this block carried one. */
	private currentBody(): string {
		if (this.rawMode) return this.rawText;
		const data = this.working;
		const overrides = this.prefOverrides;
		if (this.def.serialize) {
			const serialize = overrides ? withPrefOverrides(this.def.serialize, overrides) : this.def.serialize;
			try {
				return serialize(this.def.parse(data, stringifyYaml(data)));
			} catch {
				return this.stringifyWorking(data, overrides);
			}
		}
		return this.stringifyWorking(data, overrides);
	}

	private stringifyWorking(data: Record<string, unknown>, overrides: Partial<DsePrefs> | undefined): string {
		const body = stringifyYaml(data);
		return overrides ? stringifyYaml({ prefs: overrides }) + body : body;
	}

	private revalidate(): void {
		let messages: string[] = [];
		if (this.rawMode) {
			// No schema: the parse() reader is the validator (SDK-backed elements).
			try {
				this.def.parse(parseYaml(this.rawText) ?? {}, this.rawText);
			} catch (error) {
				messages = [error instanceof Error ? error.message : String(error)];
			}
		} else if (this.def.schema) {
			const result = this.validation.validate(this.def.id, this.def.schema, this.working);
			messages = result.errors.map((e) => `${e.path || 'root'}: ${e.message}`);
		}
		this.saveDisabled = messages.length > 0;
		this.saveHandle?.setDisabled(this.saveDisabled);
		if (this.errorEl) this.errorEl.setText(messages.join('\n'));
		this.renderPreview();
	}

	private renderPreview(): void {
		if (!this.previewEl) return;
		// Tear the previous preview view down (else every keystroke leaks a mounted view).
		if (this.previewView) {
			this.lifecycle.removeChild(this.previewView as never);
			this.previewView = null;
		}
		this.previewEl.empty();
		if (this.saveDisabled) return;
		try {
			const model = this.def.parse(this.rawMode ? (parseYaml(this.rawText) ?? {}) : this.working, this.currentBody());
			// Critical 2: the preview must NEVER become a second write path. Mount with a
			// PREVIEW host — canPersist: false (most elements, e.g. stamina-bar, already
			// gate their own click-to-edit affordance on this and simply won't attach a
			// listener) AND replaceSource stubbed to resolve false (belt and braces, for
			// any element that doesn't gate). The pipeline's own data-dse-readonly badge
			// (styles-source.css) is stamped by hand because the preview bypasses
			// ElementPipeline.run entirely — this IS the correct, honest affordance per
			// the explicit-read-only-indication rule.
			this.previewEl.setAttribute('data-dse-readonly', 'true');
			const previewHost: BlockHost = {
				mode: this.cx.host.mode,
				sourcePath: this.cx.host.sourcePath,
				containerEl: this.previewEl,
				canPersist: false,
				addChild: (child) => this.lifecycle.addChild(child),
				getBlockInfo: () => null,
				replaceSource: async () => false,
				blockKey: () => `${this.cx.host.blockKey()}::form-preview`,
			};
			const previewCx: RenderContext = { ...this.cx, host: previewHost, mode: previewHost.mode };
			const view = this.def.createView(previewCx);
			this.lifecycle.addChild(view); // torn down with the modal / next revalidate (F1 §4.5)
			this.previewView = view;
			void view.mount(this.previewEl, model);
		} catch {
			// A parse/mount slip in the preview must never break the form.
		}
	}

	/** Test/entry surface: is Save currently allowed? */
	canSave(): boolean {
		return !this.saveDisabled;
	}

	/** Write the current body through the one persisted write path. No-op when invalid.
	 *  Important 4: a false result (the block moved/vanished under us) surfaces a Notice
	 *  and leaves the modal open — no silent close on a write that never happened. */
	async save(): Promise<void> {
		if (this.saveDisabled) return;
		const ok = await this.cx.host.replaceSource(this.currentBody());
		if (ok) this.close();
		else new Notice("Draw Steel Elements: couldn't save — the block may have moved.");
	}
}

/**
 * Open the form editor for a block. Routes through openManagedModal(owner, factory) —
 * Important 3 — so the form closes automatically when `owner` (the view that opened it)
 * unloads (F1 §4.5), the same contract every other DseModal consumer honors. Returns the
 * modal (tests drive save()/canSave()).
 */
export function openFormEditor(
	owner: Component,
	cx: RenderContext,
	def: ElementDefinition,
	source: string,
	validation: ValidationService,
): FormModal {
	return openManagedModal(owner, () => new FormModal(cx, def, source, validation));
}
