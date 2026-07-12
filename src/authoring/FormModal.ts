// Plan 15 Task 5 (D9 §3.2) — the generic Form editor. ONE modal for every element: schema
// fields → Setting controls (schemaless → a raw-YAML textarea, OD-4b), a working object,
// live validation via ValidationService (Save disabled while invalid — OD-6), a live
// preview built with def.createView (torn down with the modal), and Save through
// host.replaceSource — the SAME write path persisted elements use (OD-D9-12: no parallel
// writer). No per-element form code.
import { Setting, parseYaml, stringifyYaml } from 'obsidian';
import type { RenderContext } from '@/framework/context';
import type { ElementDefinition } from '@/framework/registry';
import type { ValidationService } from '@/framework/validation';
import { DseModal } from '@/framework/kit/managedModal';
import { fieldsFromSchema, type FormField } from './formModel';

class FormModal extends DseModal {
	private working: Record<string, unknown> = {};
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
			const parsed = parseYaml(this.source);
			this.working = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
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
					t.setValue(current == null ? '' : String(current)).onChange((v) => set(v === '' ? undefined : Number(v))),
				);
				break;
			case 'select':
				setting.addDropdown((d) => {
					for (const opt of field.enum ?? []) d.addOption(opt, opt);
					d.setValue(current == null ? (field.enum?.[0] ?? '') : String(current)).onChange(set);
				});
				break;
			case 'text':
			default:
				setting.addText((t) => t.setValue(current == null ? '' : String(current)).onChange(set));
				break;
		}
	}

	/** Current body text: raw textarea verbatim, else serialize(model)/stringify(working). */
	private currentBody(): string {
		if (this.rawMode) return this.rawText;
		const data = this.working;
		if (this.def.serialize) {
			try {
				return this.def.serialize(this.def.parse(data, stringifyYaml(data)));
			} catch {
				return stringifyYaml(data);
			}
		}
		return stringifyYaml(data);
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
			const view = this.def.createView(this.cx);
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

	/** Write the current body through the one persisted write path. No-op when invalid. */
	async save(): Promise<void> {
		if (this.saveDisabled) return;
		const ok = await this.cx.host.replaceSource(this.currentBody());
		if (ok) this.close();
	}
}

/** Open the form editor for a block. Returns the modal (tests drive save()/canSave()). */
export function openFormEditor(
	cx: RenderContext,
	def: ElementDefinition,
	source: string,
	validation: ValidationService,
): FormModal {
	const modal = new FormModal(cx, def, source, validation);
	modal.open();
	return modal;
}
