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
import type { Component, DropdownComponent } from 'obsidian';
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

/** SC-489: a copy of `v` with every array and plain object duplicated and every other value kept by
 *  reference. Validation's `transform`s (trim, toLowerCase) assign into their parent container, so
 *  the copy must be deep over containers -- a shallow spread would still mutate `skills[]` items and
 *  `custom_skills[]` objects. Not `structuredClone` (undefined in the jest dom environment). */
function cloneContainers<T>(v: T): T {
	if (Array.isArray(v)) return v.map((item: unknown) => cloneContainers(item)) as T;
	if (v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
		const out: Record<string, unknown> = {};
		for (const [k, item] of Object.entries(v)) out[k] = cloneContainers(item);
		return out as T;
	}
	return v;
}

/** SC-488: the value of the leading "Default (…)" option of an OPTIONAL select. It means "this
 *  key is absent" and never reaches `working` or the written block. Non-empty so it can never
 *  collide with an enum value (same idea as SettingsTab's `__custom__` font option). */
const UNSET = '__dse-unset__';

/** An optional select's sentinel option, kept so `revalidate()` can relabel it in place. */
interface DefaultOption {
	field: FormField;
	dropdown: DropdownComponent;
	label: string;
}

class FormModal extends DseModal {
	/** What Save writes: the source plus only what the user changed. Never handed to validation. */
	private working: Record<string, unknown> = {};
	/** SC-489: a validated COPY of `working` (the schema's transforms applied -- `Chips` -> `chips`).
	 *  The preview and the "Default (…)" labels parse this, as the render pipeline does; Save does not. */
	private checked: Record<string, unknown> = {};
	private prefOverrides: Partial<DsePrefs> | undefined;
	/** SC-488: the "Default (…)" option of every optional select, relabelled on each revalidate.
	 *  (Replaces SC-483's untouchedSeeds/requiredKeys strip machinery: an optional select is never
	 *  seeded now, so there is nothing to strip at Save, and a required select is always written.) */
	private readonly defaultOptions: DefaultOption[] = [];
	/** Key order of the source body (prefs: popped), so a declared select key that goes Default ->
	 *  option again returns to its source position instead of the end of the block (SC-488 LOW-1). */
	private sourceKeyOrder: string[] = [];
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
		// Modal.onOpen()'s declared return type is `Promise<void> | void`; DseModal
		// doesn't override it (base is a no-op today) but the call is fire-and-forget
		// by design here, same as every other DseModal subclass that skips calling
		// super.onOpen() at all.
		void super.onOpen();
		this.setDseTitle(`Edit ${this.def.name}`);
		try {
			const parsed: unknown = parseYaml(this.source);
			const rawData = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
			// Critical 1: pop the reserved `prefs:` override map BEFORE it ever reaches
			// `working` (validation/def.parse never see it — same contract as the
			// pipeline's own extractPrefOverrides call).
			this.prefOverrides = extractPrefOverrides(rawData, this.cx.prefs);
			this.working = rawData;
			this.sourceKeyOrder = Object.keys(rawData);
		} catch {
			this.working = {};
		}
		const fields = fieldsFromSchema(this.def);
		this.rawMode = !this.def.schema || fields.length === 0;
		// SC-489: normalise a copy BEFORE the controls render, so a select can show the option an
		// un-normalised source value (`Chips`) normalises to.
		if (!this.rawMode) this.normalise();

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
				const options = field.enum ?? [];
				if (field.required) {
					// SC-488 D6: an absent REQUIRED key is invalid, so there is no "Default" option.
					// Seed the schema `default` when it is a real option, else the first option, and
					// write it back so validation and the preview see what the dropdown shows. A
					// required key is always written (the saved block must stay valid).
					const seed =
						field.default !== undefined && options.includes(field.default) ? field.default : options[0];
					if (current == null && seed !== undefined) this.working[field.key] = seed;
					const initial = current == null ? (seed ?? '') : this.displayValue(field.key, current, options);
					setting.addDropdown((d) => {
						for (const opt of options) d.addOption(opt, opt);
						d.setValue(initial).onChange(set);
					});
					break;
				}
				// SC-488 D1/D4/D5: an OPTIONAL select leads with a "Default (…)" option meaning the
				// key is absent. Nothing is seeded, so validation, the live preview and Save all see
				// the same data. A key present with null counts as absent (rendering `key:` null is
				// an error card); picking Default removes the key's line.
				if (current == null) delete this.working[field.key];
				const initial = current == null ? UNSET : this.displayValue(field.key, current, options);
				setting.addDropdown((d) => {
					d.addOption(UNSET, 'Default');
					for (const opt of options) d.addOption(opt, opt);
					d.setValue(initial).onChange((value) => {
						if (value === UNSET) delete this.working[field.key];
						else this.setKeyInSourceOrder(field.key, value);
						this.revalidate();
					});
					this.defaultOptions.push({ field, dropdown: d, label: 'Default' });
				});
				break;
			}
			case 'text':
			default:
				setting.addText((t) => t.setValue(current == null ? '' : scalarToString(current)).onChange(set));
				break;
		}
	}

	/** SC-489 D4: what a select shows for a present value. The raw value when it is an option; else the
	 *  normalised copy's value when THAT is an option (`Chips` shows `chips`); else the raw value (it
	 *  matches nothing, so the dropdown stays blank beside the validation error). `working` is left
	 *  alone, so an untouched `Chips` is still saved as `Chips`. */
	private displayValue(key: string, current: unknown, options: string[]): string {
		const raw = scalarToString(current);
		if (options.includes(raw)) return raw;
		const normalised = this.checked[key];
		return typeof normalised === 'string' && options.includes(normalised) ? normalised : raw;
	}

	/** Set `key`, putting a key that is new to `working` back at its source position: after every
	 *  present key that came before it in the source, before every key that came after it. A key the
	 *  source never had goes last. (Only matters on the stringify path; serializers own their order.) */
	private setKeyInSourceOrder(key: string, value: unknown): void {
		if (key in this.working) {
			this.working[key] = value;
			return;
		}
		const rank = (k: string): number => {
			const i = this.sourceKeyOrder.indexOf(k);
			return i < 0 ? Infinity : i;
		};
		const at = rank(key);
		const entries = Object.entries(this.working);
		let insertAt = entries.length;
		if (at !== Infinity) {
			const later = entries.findIndex(([k]) => rank(k) > at);
			if (later >= 0) insertAt = later;
		}
		entries.splice(insertAt, 0, [key, value]);
		this.working = Object.fromEntries(entries);
	}

	/** Current body text: raw textarea verbatim, else serialize(model)/stringify(working) —
	 *  re-emitting the popped `prefs:` map ahead of the body via the SAME withPrefOverrides
	 *  the pipeline uses (Critical 1), when this block carried one. Built from the raw `working`
	 *  (SC-489: validation's transforms never touch it), so Save writes what the source said plus
	 *  only what the user changed. The preview parses `checked` with this text as its body, the same
	 *  pair the render pipeline gives parse() for the saved block (normalised data, text as written). */
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
		// SC-483 r2: write no byte the user never typed. An empty object is '' (not `{}`), and the
		// trailing newline is trimmed (the host splice supplies the line break before the closing
		// fence; stamina-bar's serialize() trims the same way). The prefs: map keeps exactly one line
		// break between it and the body.
		const body = Object.keys(data).length === 0 ? '' : stringifyYaml(data);
		return (overrides ? stringifyYaml({ prefs: overrides }) + body : body).trimEnd();
	}

	/** SC-489: validate a fresh container clone of `working` and keep it as `checked`. The transforms
	 *  rewrite the clone only. */
	private normalise(): string[] {
		this.checked = cloneContainers(this.working);
		if (!this.def.schema) return [];
		const result = this.validation.validate(this.def.id, this.def.schema, this.checked);
		return result.errors.map((e) => `${e.path || 'root'}: ${e.message}`);
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
			messages = this.normalise();
		}
		this.saveDisabled = messages.length > 0;
		this.saveHandle?.setDisabled(this.saveDisabled);
		if (this.errorEl) this.errorEl.setText(messages.join('\n'));
		// Before renderPreview's `saveDisabled` early return: an unrelated invalid field must not
		// freeze the "Default (…)" labels (SC-488 D2).
		this.refreshDefaultLabels();
		this.renderPreview();
	}

	/** SC-488 D2 (generic, no per-element form code): the "Default (…)" label names the enum option
	 *  `v` for which `def.parse({...checked, key: v})` equals `def.parse(checked without key)` -- i.e.
	 *  what the block actually uses when the key is absent. Exactly one hit -> `Default (v)`; no hit ->
	 *  `Default (none)`; several hits -> `Default`. A parse() that throws keeps the previous label. */
	private refreshDefaultLabels(): void {
		for (const entry of this.defaultOptions) {
			try {
				const key = entry.field.key;
				const absent = { ...this.checked };
				delete absent[key];
				const signature = (data: Record<string, unknown>): string | undefined =>
					JSON.stringify(this.def.parse({ ...data }, stringifyYaml(data)));
				const base = signature(absent);
				const hits = (entry.field.enum ?? []).filter((v) => signature({ ...absent, [key]: v }) === base);
				const label = hits.length === 1 ? `Default (${hits[0]})` : hits.length === 0 ? 'Default (none)' : 'Default';
				if (label === entry.label) continue;
				const option = Array.from(entry.dropdown.selectEl.options).find((o) => o.value === UNSET);
				if (!option) continue;
				option.textContent = label;
				entry.label = label;
			} catch {
				// parse() slipped on the current data (or the dropdown is gone): keep the previous label.
			}
		}
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
			const model = this.def.parse(this.rawMode ? (parseYaml(this.rawText) ?? {}) : this.checked, this.currentBody());
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
		// SC-455: a host that already said why it could not write (its own Notice) is not repeated here.
		else if (!this.cx.host.lastWriteReported) new Notice("Draw Steel Elements: couldn't save — the block may have moved.");
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
