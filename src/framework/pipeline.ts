// F1 §2.4 (render pipeline & lifecycle) / §3.8 (renderErrorCard) — the integration
// keystone: ties parse -> validate -> resolve refs -> create view -> mount together
// behind ONE error boundary. This is the "declare, don't wire" payoff (F1 §2.1) — an
// element author supplies an ElementDefinition (Task 8); everything else (RenderContext
// construction, validation, ref resolution, the click shield, theme/pref stamping,
// lifecycle wiring, error rendering) is this file's job. Task 10 wires ElementPipeline
// instances into Obsidian via ElementRegistry + registerMarkdownCodeBlockProcessor.
import { parseYaml } from 'obsidian';
import type { App, Plugin } from 'obsidian';
import type { DSESettings } from '@model/Settings';
import type { ElementDefinition } from './registry';
import { createRenderContext } from './context';
import type { BlockHost } from './host/BlockHost';
import type { ThemeService } from './seams/theme';
import type { PreferenceStore } from './seams/prefs';
import type { ReferenceService } from './seams/refs';
import type { RollService } from './roll/service';
import type { ValidationService, ValidationResult } from './validation';
import type { SessionStore } from './session';
import type { SccAnchorResolver } from '@/refs/rewriteSccAnchors';
import type { CompendiumIndex } from '@/services/CompendiumIndex';
import { extractPrefOverrides, applyPrefOverrides, withPrefOverrides } from './prefOverrides';
import { iconButton } from './kit/iconButton';
import { openFormEditor } from '@/authoring/FormModal';

/** The four failure stages renderErrorCard can report (F1 §3.8). */
export type ErrorStage = 'parse' | 'schema' | 'reference' | 'render';

/**
 * F1 §3.8 fixes renderErrorCard's signature at `(root, def, error)` — no separate stage
 * parameter (the spec's own comment types `error` as `Error | ValidationResult`). A
 * ValidationResult is self-describing (always stage "schema"); for the other three
 * stages the single catch site in `ElementPipeline.run` needs some way to know which
 * step actually threw. This Error subclass carries that tag on the error object itself
 * instead of widening renderErrorCard's public signature. Exported so callers other than
 * the pipeline (and tests) can construct/inspect a staged error directly.
 */
export class ElementStageError extends Error {
	readonly stage: ErrorStage;
	readonly cause: unknown;

	constructor(stage: ErrorStage, cause: unknown) {
		super(cause instanceof Error ? cause.message : String(cause));
		this.name = 'ElementStageError';
		this.stage = stage;
		this.cause = cause;
	}
}

/**
 * D9 (Plan 15 Task 5): defensive read of the authoringControls pref. Production always
 * registers the full DSE_PREF_DESCRIPTORS catalog at plugin onload (main.ts), but several
 * existing test harnesses build a bare PreferenceStore (createPreferenceStore + only the
 * BUILTIN theme descriptor) to exercise a single element's pipeline in isolation — those
 * never describe() this pref. PreferenceStore.get() throws for an undescribed key (§3.6
 * contract), so a strict prefs.get() here would break every such harness on every render.
 * Treat "not registered" the same as "off" — matches the pref's own default and keeps the
 * pipeline robust against any caller that hasn't wired the full catalog.
 *
 * Minor fix (review round 1): a surgical `descriptors().some(...)` presence check —
 * `PreferenceStore.descriptors()` never throws (BUILTIN_DESCRIPTORS is always seeded in
 * the constructor), so there is no need to blanket try/catch prefs.get() and risk masking
 * an unrelated bug behind "pencil hidden".
 */
function isAuthoringControlsOn(prefs: PreferenceStore): boolean {
	if (!prefs.descriptors().some((d) => d.key === 'authoringControls')) return false;
	return prefs.get('authoringControls') === true;
}

/** Runs `fn`, tagging any thrown error with `stage` (unless already tagged). */
function runStage<T>(stage: ErrorStage, fn: () => T): T {
	try {
		return fn();
	} catch (cause) {
		throw cause instanceof ElementStageError ? cause : new ElementStageError(stage, cause);
	}
}

/** Async counterpart of runStage — also tags rejected promises (F1 §2.4: "any throw in
 *  steps 1-4 AND async rejections is caught once by the pipeline"). */
async function runStageAsync<T>(stage: ErrorStage, fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (cause) {
		throw cause instanceof ElementStageError ? cause : new ElementStageError(stage, cause);
	}
}

function isValidationResult(error: unknown): error is ValidationResult {
	return (
		typeof error === 'object' &&
		error !== null &&
		'valid' in error &&
		'errors' in error &&
		Array.isArray((error as ValidationResult).errors)
	);
}

/**
 * F1 §2.4 step 4 / §1.2 — capture-phase mousedown/pointerdown stop so a reading-mode
 * click inside an element never bubbles to Obsidian's "open this block for editing"
 * handling. Content-independent (armed on the bare root, before parse/validate/render
 * even run) so it also covers error cards; ports the legacy per-processor copy
 * (FeatureProcessor.ts et al.) verbatim as a framework default. Not tied to a
 * Component (there is no owning Component yet when this runs) — matches the legacy
 * plain addEventListener with no explicit removal; the listener is discarded with the
 * root element itself on re-render/teardown, same as today.
 */
function armClickShield(root: HTMLElement): void {
	const stop = (event: Event): void => {
		event.preventDefault();
		event.stopPropagation();
	};
	root.addEventListener('mousedown', stop, { capture: true });
	root.addEventListener('pointerdown', stop, { capture: true });
}

/**
 * F1 §3.8 — one visual + copy standard for all elements (replaces six hand-rolled
 * try/catch error divs): element name, failure stage, message, and for a
 * ValidationResult a `path: message` list. Built with createEl only (no innerHTML);
 * styled via classes/tokens (`dse-error-card`, `data-dse-error-stage`) rather than
 * inline styles (F1 §1.4 "no inline el.style.*").
 *
 * Idempotent: always clears `root` first, so a caller never needs to remember to empty
 * it beforehand (the pipeline relies on this to guarantee a render-stage failure never
 * leaves a half-mounted element behind the error card — F1 §2.4's single error boundary).
 */
export function renderErrorCard(root: HTMLElement, def: Pick<ElementDefinition, 'id' | 'name'>, error: unknown): void {
	root.empty();

	if (isValidationResult(error)) {
		root.setAttribute('data-dse-error-stage', 'schema');
		const card = root.createDiv({ cls: 'dse-error-card' });
		card.createEl('div', { cls: 'dse-error-card-title', text: `${def.name}: failed to render (schema)` });
		card.createEl('div', { cls: 'dse-error-card-message', text: 'The block did not match its schema:' });
		const list = card.createEl('ul', { cls: 'dse-error-card-list' });
		for (const e of error.errors) {
			list.createEl('li', { cls: 'dse-error-card-list-item', text: `${e.path}: ${e.message}` });
		}
		return;
	}

	const stage: ErrorStage = error instanceof ElementStageError ? error.stage : 'render';
	const message = error instanceof Error ? error.message : String(error);

	root.setAttribute('data-dse-error-stage', stage);
	const card = root.createDiv({ cls: 'dse-error-card' });
	card.createEl('div', { cls: 'dse-error-card-title', text: `${def.name}: failed to render (${stage})` });
	card.createEl('div', { cls: 'dse-error-card-message', text: message });
}

/** Services bundle ElementPipeline needs beyond app/plugin/settings (F1 §2.2's onload
 *  block: "services = { ThemeService, PreferenceStore, ReferenceService,
 *  ValidationService, SessionStore }"). */
export interface ElementPipelineServices {
	theme: ThemeService;
	prefs: PreferenceStore;
	refs: ReferenceService;
	validation: ValidationService;
	session: SessionStore;
	roll: RollService;
	/** F2 §4.3(a)/§4.4 fix wave — the live SccResolver (main.ts's plugin.sccResolver),
	 *  threaded into every RenderContext so ElementView.renderMarkdown can rewrite its
	 *  own scc.v1: anchors. Optional: harnesses/tests that don't care about scc links
	 *  omit it and renderMarkdown simply skips the rewrite pass. */
	sccAnchors?: SccAnchorResolver;
	/** D6 Task 3 (spec §1.2) — threaded into every RenderContext, symmetric with
	 *  sccAnchors, so RefUnwrapView can resolve whole-block references. Optional:
	 *  harnesses/tests that don't care about compendium references omit it and
	 *  RefUnwrapView degrades to a "compendium not installed" card. */
	compendium?: CompendiumIndex;
}

export interface ElementPipelineDeps extends ElementPipelineServices {
	app: App;
	plugin: Plugin;
	settings: Readonly<DSESettings>;
}

/**
 * F1 §2.4 — the render pipeline: parse -> validate -> resolve refs -> create view ->
 * mount, behind ONE error boundary (no per-element try/catch). One ElementPipeline is
 * constructed once (plugin onload, Task 10) with the service bundle; `run()` executes
 * once per rendered block instance.
 */
export class ElementPipeline {
	constructor(private readonly deps: ElementPipelineDeps) {}

	async run<M>(def: ElementDefinition<M>, source: string, host: BlockHost): Promise<void> {
		const { app, plugin, settings, theme, prefs, refs, validation, session, roll, sccAnchors, compendium } =
			this.deps;

		// Step 1 (F1 §2.4): build the RenderContext for this block instance.
		const cx = createRenderContext({
			app,
			plugin,
			settings,
			host,
			theme,
			prefs,
			refs,
			session,
			roll,
			sccAnchors,
			compendium,
		});

		// The root must exist before ANY step below: renderErrorCard (F1 §3.8) needs
		// somewhere to render even a step-2 YAML parse failure. data-dse-element is
		// stamped by the PIPELINE itself (F1 §3.5's contract — ThemeService only owns
		// data-dse-theme). When the host can't persist (e.g. Obsidian canvas), the root
		// is also stamped data-dse-readonly — the CSS-only "Read-only" badge in
		// styles-source.css hangs off that attribute; write-gating stays per-element.
		// The click shield is content-independent, so it is armed here
		// too, before parse/validate/render even run (covers error cards the same as
		// successful mounts, matching the legacy per-processor behavior it replaces).
		const root = host.containerEl.createDiv();
		root.setAttribute('data-dse-element', def.id);
		if (!host.canPersist) root.setAttribute('data-dse-readonly', 'true');
		if (!def.noClickShield) armClickShield(root);

		try {
			// Step 2: parse (F1 §2.4.1). Parse failure -> error card, stage "parse".
			//
			// Fix round 1 (D6 spec §1.1): a bare `@path` whole-block reference
			// (`@Homebrew/Fireball`) is not valid YAML on its own — the `yaml` package
			// (which Obsidian's real parseYaml wraps) reserves a leading `@` on a plain
			// scalar and throws "Plain value cannot start with reserved character @"
			// BEFORE detectWholeBlockRef ever gets a look at it. The narrowest possible
			// rescue: only when parseYaml throws, AND the def opted in
			// (`acceptsWholeBlockRef`, set by withReference()), AND the trimmed source is
			// a SINGLE LINE starting with `@` (the one YAML-reserved-character case that
			// differs from every other bare scalar, which already parses fine as a plain
			// string) — treat rawData as that trimmed string directly instead of
			// error-carding. Anything else (multi-line garbage, other malformed YAML, a
			// def that hasn't opted in) still error-cards exactly as before.
			let rawData: unknown;
			try {
				rawData = runStage('parse', () => parseYaml(source));
			} catch (error) {
				const trimmed = source.trim();
				if (def.acceptsWholeBlockRef && trimmed.startsWith('@') && !trimmed.includes('\n')) {
					rawData = trimmed;
				} else {
					throw error;
				}
			}

			// D4 §1.3 (Plan 13): pop the reserved per-block `prefs:` map BEFORE schema
			// validation (schemas never see the reserved key) and before def.parse
			// (it never enters the semantic model).
			const prefOverrides = extractPrefOverrides(rawData, prefs);

			// Step 3: validate (F1 §2.4.2). Invalid -> error card, stage "schema", one
			// `path: message` per error — returned directly (not thrown): a ValidationResult
			// is self-describing to renderErrorCard, no ElementStageError tag needed.
			if (def.schema) {
				const schema = def.schema;
				// D5 (Plan 14): parseYaml('') is undefined, which no JSON-Schema type
				// accepts — normalize to null so schemas can OPT IN to empty blocks via
				// type: ["object","null"] (ds-roll does). Schemas without "null" keep
				// erroring on empty sources exactly as before.
				const result = runStage('schema', () => validation.validate(def.id, schema, rawData ?? null));
				if (!result.valid) {
					renderErrorCard(root, def, result);
					return;
				}
			}

			// Steps 4-5 (F1 §2.4.3 PROSE — not the simplified §2.2 diagram): resolveRefs
			// takes the MODEL, so a declared def.resolveRefs runs def.parse FIRST; an
			// explicit autoResolveRefs: true instead resolves the RAW data BEFORE def.parse
			// runs. Hardening pass after F1's final review: autoResolveRefs is now OPT-IN
			// (default OFF) — omitting both resolveRefs and autoResolveRefs skips reference
			// resolution entirely; an element must ask for it explicitly, either bespoke
			// (resolveRefs) or the default deep-walk (autoResolveRefs: true).
			// def.parse() itself is bucketed under stage "render": F1 §3.8 defines exactly
			// four stages, and model construction isn't YAML syntax (parse), AJV (schema),
			// or reference resolution (reference) — it's part of building what step 6 renders.
			let model: M;
			if (def.resolveRefs) {
				const resolveRefs = def.resolveRefs;
				model = runStage('render', () => def.parse(rawData, source));
				model = await runStageAsync('reference', () => resolveRefs(model, cx.refs));
			} else if (def.autoResolveRefs === true) {
				const resolved = await runStageAsync('reference', () => cx.refs.resolveDeep(rawData, host.sourcePath));
				model = runStage('render', () => def.parse(resolved, source));
			} else {
				model = runStage('render', () => def.parse(rawData, source));
			}

			// Step 6: render (F1 §2.4.4). theme/prefs are stamped onto root BEFORE
			// view.mount() (which invokes onMount) so data-dse-theme / data-dse-<attr> are
			// present at first paint. def.serialize is wired into the view (Task 7's
			// injection point) so persist() works for shape:"persisted" elements.
			const view = runStage('render', () => def.createView(cx));
			cx.theme.apply(root, view);
			cx.prefs.reflect(root, view);
			// D4 §1.4: pinned AFTER reflect() — registration order makes the
			// override re-stamp last on any global change (OD-D4-3a).
			applyPrefOverrides(root, view, prefOverrides, cx.prefs);
			if (def.serialize) {
				const serialize = def.serialize;
				// D4: a block carrying prefs: must not lose it when replaceSource
				// rewrites the body from serialize(model).
				view.setSerializer(prefOverrides ? withPrefOverrides(serialize, prefOverrides) : serialize);
			}
			host.addChild(view);
			await runStageAsync('render', () => view.mount(root, model));

			// D9 (Plan 15 Task 5): opt-in reading-mode edit affordance. Default OFF
			// (authoringControls) ⇒ this branch never runs ⇒ rendered DOM is unchanged.
			// Gated on canPersist (never on embeds/exports); writes go through the SAME
			// host.replaceSource path (no parallel writer).
			if (cx.host.canPersist && isAuthoringControlsOn(prefs)) {
				iconButton(
					root,
					{
						icon: 'pencil',
						label: `Edit ${def.name}`,
						variant: 'ghost',
						onClick: () => openFormEditor(view, cx, def, source, this.deps.validation),
					},
					view,
				);
			}
		} catch (error) {
			// ONE error boundary for the whole pipeline (F1 §2.4) — no per-element
			// try/catch. renderErrorCard always clears root first, so a render-stage
			// failure partway through onMount never leaves a half-mounted element behind
			// the error card.
			renderErrorCard(root, def, error);
		}
	}
}
