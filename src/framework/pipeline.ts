// F1 §2.4 (render pipeline & lifecycle) / §3.8 (renderErrorCard) — the integration
// keystone: ties parse -> validate -> resolve refs -> create view -> mount together
// behind ONE error boundary. This is the "declare, don't wire" payoff (F1 §2.1) — an
// element author supplies an ElementDefinition (Task 8); everything else (RenderContext
// construction, validation, ref resolution, the click shield, theme/pref stamping,
// lifecycle wiring, error rendering) is this file's job. Task 10 wires ElementPipeline
// instances into Obsidian via ElementRegistry + registerMarkdownCodeBlockProcessor.
import { Component, parseYaml } from 'obsidian';
import type { App, Plugin } from 'obsidian';
import type { DSESettings } from '@model/Settings';
import type { ElementDefinition } from './registry';
import { createRenderContext } from './context';
import { registerAfterRender } from './view';
import type { BlockHost } from './host/BlockHost';
import type { ThemeService } from './seams/theme';
import type { PreferenceStore } from './seams/prefs';
import type { ReferenceService } from './seams/refs';
import type { RollService } from './roll/service';
import type { ValidationService, ValidationResult } from './validation';
import type { SessionStore } from './session';
import type { SccAnchorResolver } from '@/refs/rewriteSccAnchors';
import type { CompendiumIndex } from '@/services/CompendiumIndex';
import type { DsePrefs } from './seams/prefs';
import { extractPrefOverrides, applyPrefOverrides, withPrefOverrides } from './prefOverrides';
import { watchPrintMedia } from './printMedia';
import {
	extractCollapseKeys,
	peelLeadingCollapseKeys,
	resolveCollapseState,
	withCollapseKeys,
	withPeeledKeys,
} from './chrome/collapsedKey';
import type { CollapseKeys } from './chrome/collapsedKey';
import { ensureCollapseInvariant, mountChrome } from './chrome/mountChrome';
import type { ChromeMenuItem } from './chrome/types';
import { iconButton } from './kit/iconButton';
import { openFormEditor } from '@/authoring/FormModal';
import { ANCHOR_KEY } from './sidebar/anchor';

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

/**
 * SC-169 round 2 — the same defensive read `isAuthoringControlsOn` needs, for the two
 * collapse preferences. Several test harnesses build a bare PreferenceStore that describes
 * only the BUILTIN theme descriptor, and `PreferenceStore.get()` throws for an undescribed
 * key (§3.6), so a strict read here would break every such harness on every render. "Not
 * registered" resolves to the catalog's own default for that key.
 */
function readCollapsePref(
	prefs: PreferenceStore,
	key: 'collapsibleDefault' | 'collapseDefault',
	fallback: boolean,
): boolean {
	if (!prefs.descriptors().some((d) => d.key === key)) return fallback;
	return prefs.get(key) === true;
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

/**
 * D7 Task 10 (plan-18, spec §5) found bug: `sendToSidebar` stamps a `_dse_anchor: <id>`
 * line directly into a block's raw YAML body (`sidebar/anchor.ts`), entirely independent
 * of any element's own schema. Every schema'd persisted element built so far
 * (hero/resource/tokens/roll/surges/conditions) declares `additionalProperties: false` at
 * the document root (F1 §5's own convention) — which would hard-fail AJV validation the
 * FIRST time such an element is ever sent to the sidebar (`ds-hero` is that first time;
 * the elements already proven in the sidebar — initiative/encounter/montage/project/party
 * — have NO schema at all, so none of them ever hit this). This is a framework-level gap,
 * not a per-element one: any future schema'd element would hit it identically the day
 * it's first sidebar-mounted.
 *
 * The fix excludes `_dse_anchor` from what SCHEMA VALIDATION sees only — a shallow clone,
 * never mutating `rawData` itself (unlike `extractPrefOverrides`, which permanently pops
 * `prefs:` before BOTH validation and `def.parse`). `def.parse` still receives the
 * unmodified `rawData` AND the untouched raw `source` text, so an element whose `parse()`
 * passes `_dse_anchor` through as an ordinary field (e.g. initiative's passthrough parse)
 * keeps working exactly as before, and `ds-hero`'s own raw-TEXT `defnRaw` splice
 * (`elements/hero/model.ts`) never looks at the parsed `data` object for the anchor at
 * all — only the schema gate was too narrow.
 *
 * LATENT EDGE (review round 2): if a future schema explicitly declares `_dse_anchor` as a
 * real property, this exclusion would silently hide it from validation, matching the class
 * of the `prefs:` reserved-key convention (D4 §1.3). This is acceptable: `_dse_anchor` is
 * framework-owned (author a different field name for any element-specific semantic needs).
 */
function dataForSchemaValidation(rawData: unknown): unknown {
	if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) return rawData;
	const record = rawData as Record<string, unknown>;
	if (!Object.prototype.hasOwnProperty.call(record, ANCHOR_KEY)) return rawData;
	const rest = { ...record };
	delete rest[ANCHOR_KEY];
	return rest;
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

/** The dependencies `prepareModel` needs from the pipeline's service bundle — a narrow
 *  slice (not the full `ElementPipelineDeps`/`RenderContext`), so a caller that only has
 *  these four things (SidebarPanel.handleExternalChange, D8 Task 3 spec §1.6) doesn't
 *  need to construct a whole RenderContext just to refresh a model. */
export interface PrepareModelDeps {
	prefs: PreferenceStore;
	refs: ReferenceService;
	validation: ValidationService;
	/** `BlockHost.sourcePath` — only consulted for `def.autoResolveRefs`. */
	sourcePath: string;
}

/** `prepareModel`'s result: the parsed/validated/ref-resolved model, plus whatever
 *  per-block `prefs:` override bag `extractPrefOverrides` popped off the raw data (F1
 *  §2.4 doesn't render/serialize — that's step 6, left to each caller). */
export interface PreparedModel<M> {
	readonly model: M;
	readonly prefOverrides: Partial<DsePrefs> | undefined;
	/** SC-169: the three reserved collapse keys as authored, plus exactly which of them
	 *  were popped out of the block body (the serializer wrapper's re-emit list). */
	readonly collapseKeys: CollapseKeys;
}

/**
 * Review round 1 (Task 3 finding #2): F1 §2.4 steps 2-5 — parse -> pop the reserved
 * `prefs:` key -> validate -> resolve refs -> `def.parse` — extracted from
 * `ElementPipeline.run` into its own exported function so a second caller
 * (SidebarPanel.handleExternalChange, D8 Task 3 spec §1.6) can run the EXACT same logic
 * instead of hand-copying it. The hand-copy that predated this (SidebarPanel's own
 * `refreshModel`) silently dropped `extractPrefOverrides` (finding #1, MEDIUM) — a
 * duplicated slice of pipeline logic that could only ever drift back out of sync with
 * this file. There is now one source of truth; `run()` below is the only other caller.
 *
 * Every step still runs through `runStage`/`runStageAsync`, so a thrown error carries
 * the same `ElementStageError` stage tag callers already rely on. An invalid schema
 * result is THROWN (not rendered) rather than handled here — step 6 (render/persist) and
 * error presentation are caller concerns: `run()`'s catch renders it via
 * `renderErrorCard` exactly as before (`isValidationResult` recognizes a raw
 * `ValidationResult` thrown as-is, no wrapping needed), while SidebarPanel's caller
 * treats any throw here as "can't refresh in place" and falls back to a full remount.
 */
export async function prepareModel<M>(
	def: ElementDefinition<M>,
	source: string,
	deps: PrepareModelDeps,
): Promise<PreparedModel<M>> {
	const { prefs, refs, validation, sourcePath } = deps;

	// Step 2: parse (F1 §2.4.1). Parse failure -> propagate (tagged "parse"); the whole-
	// block-reference rescue mirrors run()'s own comment above `parseYaml` verbatim.
	let rawData: unknown;
	// SC-169 fix round 1 (M-1): the body `def.parse` finally sees. Only ever differs from
	// `source` when the collapse-key rescue below fires — i.e. for a body YAML could not
	// parse UNTIL the framework's own leading key lines were peeled off it.
	let bodySource = source;
	let peeledKeys: Record<string, boolean> = {};
	try {
		rawData = runStage<unknown>('parse', () => parseYaml(source));
	} catch (error) {
		// SC-169 FIX ROUND 1 (M-1) — the PROSE/REFERENCE-body rescue, tried first because
		// it is the only branch that can turn a hard parse failure into a normal render.
		//
		// `collapsed:`/`collapsible:`/`collapse_default:` are documented as "a top-level
		// line you write in the block", and on a mapping body they are popped out of the
		// PARSED data. A body that is not a mapping has no parsed data to pop them from:
		// `collapsed: true` followed by prose (`ds-rule`) or by a bare SCC code (`ds-scc`,
		// or any whole-block `scc.v1:` reference) is a mapping key followed by a scalar,
		// which YAML rejects outright — so following the documentation error-carded the
		// block. Peel the leading key lines off the SOURCE and re-parse what is left; the
		// keys are recorded exactly as if they had been popped, and `def.parse` receives
		// the body the author actually meant to write.
		//
		// Strictly a rescue: a body that already parses never reaches this catch, so every
		// YAML-mapping element keeps byte-identical behaviour. If the re-parse also fails
		// the ORIGINAL error is what propagates — the peel must never rewrite the message a
		// user sees for an unrelated syntax mistake.
		const peel = peelLeadingCollapseKeys(source);
		const peeledTrimmed = peel.source.trim();
		let rescued = false;
		if (Object.keys(peel.peeled).length > 0) {
			try {
				rawData = parseYaml(peel.source);
				rescued = true;
			} catch {
				/* not a collapse-key problem after all — fall through to the ladder below */
			}
		}
		if (rescued) {
			bodySource = peel.source;
			peeledKeys = peel.peeled;
		} else if (def.acceptsWholeBlockRef && peeledTrimmed.startsWith('@') && !peeledTrimmed.includes('\n')) {
			// The peel applies to this arm too, so `collapsed: true` above an `@path` body
			// behaves like `collapsed: true` above any other body.
			rawData = peeledTrimmed;
			bodySource = peel.source;
			peeledKeys = peel.peeled;
		} else if (def.parseHandlesRawBody) {
			// SC-149 fix round (M-3): this def's parse reads `raw` and owns its own error
			// messages, so an unparseable body is its business, not a pipeline failure.
			// `data` is undefined — exactly what such a parse already ignores.
			// SC-169 fix round 1: it still gets the PEELED body — the framework's own keys
			// are never part of "the body this def owns", and `ds-scc`'s message about what
			// a legal body looks like should describe what the author wrote, not what the
			// author wrote plus a framework line.
			rawData = undefined;
			bodySource = peel.source;
			peeledKeys = peel.peeled;
		} else {
			throw error;
		}
	}

	// D4 §1.3 (Plan 13): pop the reserved per-block `prefs:` map BEFORE schema
	// validation (schemas never see the reserved key) and before def.parse (it never
	// enters the semantic model).
	const prefOverrides = extractPrefOverrides(rawData, prefs);

	// SC-169: the three reserved top-level collapse keys (`collapsed:`, `collapsible:`,
	// `collapse_default:`) — the AUTHORED whole-element collapse contract. Popped here for
	// exactly the reasons `prefs:` is: schemas (six of them `additionalProperties: false`)
	// never see them, and they never enter any semantic model. The exception is a definition
	// that declares `collapseKeysOwnedByModel` — `ds-stamina`/`ds-skills`, where
	// `collapsible:`/`collapse_default:` are real ComponentWrapper model fields; there the
	// framework READS them without removing them, which is what keeps an existing note's
	// `collapse_default: true` working (and byte-stable) after SC-169. See collapsedKey.ts.
	// `collapsible:`/`collapse_default:` are claimed only for a CHROME-BEARING element whose
	// own model does not own them. A definition without the slot is left completely alone
	// (`ds-skills` keeps parsing its ComponentWrapper pair exactly as before); `ds-stamina`
	// has the slot AND owns them, so they are read in place rather than removed.
	const claimLegacyKeys = def.chrome !== undefined && def.collapseKeysOwnedByModel !== true;
	// SC-169 fix round 1 (M-1): fold in anything the non-mapping-body rescue above peeled
	// off the source text. `withPeeledKeys` is a no-op for every body that parses.
	const collapseKeys = withPeeledKeys(extractCollapseKeys(rawData, claimLegacyKeys), peeledKeys);

	// Step 3: validate (F1 §2.4.2). Invalid -> throw the ValidationResult itself
	// (self-describing to renderErrorCard — no ElementStageError tag needed, same as
	// run()'s original early-return-then-renderErrorCard, just routed through the
	// caller's own catch instead of an inline return).
	if (def.schema) {
		const schema = def.schema;
		// D7 Task 10 found bug (dataForSchemaValidation's own doc) — validate a clone with
		// the sidebar's `_dse_anchor` key excluded, never `rawData` itself.
		const forValidation = dataForSchemaValidation(rawData);
		const result = runStage('schema', () => validation.validate(def.id, schema, forValidation ?? null));
		// The ValidationResult is deliberately thrown as-is (not wrapped in an Error) — it is
		// self-describing to renderErrorCard via isValidationResult() below, matching the
		// `error: Error | ValidationResult` contract documented at this function's top.
		// eslint-disable-next-line @typescript-eslint/only-throw-error -- see comment above (SC-136/FOLLOWUPS #61)
		if (!result.valid) throw result;
	}

	// Steps 4-5 (F1 §2.4.3 PROSE — not the simplified §2.2 diagram): resolveRefs takes
	// the MODEL, so a declared def.resolveRefs runs def.parse FIRST; an explicit
	// autoResolveRefs: true instead resolves the RAW data BEFORE def.parse runs.
	// autoResolveRefs is opt-in (default OFF) — omitting both resolveRefs and
	// autoResolveRefs skips reference resolution entirely.
	let model: M;
	if (def.resolveRefs) {
		const resolveRefs = def.resolveRefs;
		model = runStage('render', () => def.parse(rawData, bodySource));
		model = await runStageAsync('reference', () => resolveRefs(model, refs));
	} else if (def.autoResolveRefs === true) {
		const resolved = await runStageAsync('reference', () => refs.resolveDeep(rawData, sourcePath));
		model = runStage('render', () => def.parse(resolved, bodySource));
	} else {
		model = runStage('render', () => def.parse(rawData, bodySource));
	}

	return { model, prefOverrides, collapseKeys };
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
			validation,
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
			// Steps 2-5 (F1 §2.4.1-§2.4.3): parse -> pop the reserved `prefs:` key ->
			// validate -> resolve refs -> def.parse. Extracted to prepareModel() (above) so
			// SidebarPanel.handleExternalChange (D8 Task 3 spec §1.6) can share this EXACT
			// logic instead of hand-copying it (review round 1, finding #2 — the hand-copy
			// that predated this silently dropped extractPrefOverrides, finding #1). An
			// invalid schema result is thrown by prepareModel and caught by this try's own
			// catch below, which renders it via renderErrorCard exactly as the old inline
			// early-return did (isValidationResult recognizes a raw ValidationResult however
			// it arrives).
			const { model, prefOverrides, collapseKeys } = await prepareModel(def, source, {
				prefs,
				refs: cx.refs,
				validation,
				sourcePath: host.sourcePath,
			});

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
			// SC-170: real @media print (Obsidian's Ctrl-P / "Export to PDF") must render
			// the SAME print scheme as the on-screen preview twin. Registered LAST, after
			// reflect() and the per-block pins, so its stamp is the one that survives while
			// the page is on paper; it restores whatever they set on afterprint.
			//
			// The ordering is load-bearing, not stylistic: watchPrintMedia snapshots the
			// CURRENT data-dse-print value to restore later, and stamps immediately if the
			// root is born under print media. Run it BEFORE prefs.reflect() and that
			// snapshot is `null` while reflect() then overwrites the print stamp with the
			// `printPreview` value — i.e. paper would silently go back to the screen scheme.
			//
			// SC-170 review (L-1) — why the ERROR-CARD path below does NOT need this. A
			// prepareModel failure escapes to the catch before cx.theme.apply() ever runs,
			// so that root carries no data-dse-theme. theme.apply is the single writer of
			// that attribute and it only ever stamps an element's own root (never
			// document.body — seams/theme.ts), and all ~297 Steel rule blocks are prefixed
			// with [data-dse-theme='steel']. Measured on the built sheet: an error-card root
			// matches 0 of the 418 Steel-scoped selectors, and under real print media it
			// already resolves the neutral print values (--dse-card-bg none, --dse-border
			// #ccc, --dse-radius 0, --dse-bevel none, --dse-surface #fff, --dse-fg #000)
			// from the @media print block at (0,4,0). There is no Steel plate on an error
			// card to strip. A failure LATER (inside view.mount) is already covered — the
			// watcher is registered before mount.
			watchPrintMedia(root, view);
			if (def.serialize) {
				let serialize = def.serialize;
				// SC-169: a block carrying a reserved collapse key must not lose it either —
				// same round-trip hazard, same wrapper shape. Applied BEFORE the prefs
				// wrapper, so the emitted body reads `prefs:` … `collapsed:` … body. Only the
				// keys actually POPPED are re-emitted: a `ds-stamina` whose own model still
				// owns `collapse_default:` serializes it itself, and re-emitting would
				// duplicate the line.
				if (Object.keys(collapseKeys.popped).length > 0) {
					serialize = withCollapseKeys(serialize, collapseKeys.popped);
				}
				// D4: a block carrying prefs: must not lose it when replaceSource
				// rewrites the body from serialize(model).
				view.setSerializer(prefOverrides ? withPrefOverrides(serialize, prefOverrides) : serialize);
			}
			// SC-169 FIX ROUND 1 (H-1) — everything below this line is PIPELINE-owned DOM
			// appended into DOM the VIEW owns, so it has to be re-appended every time the
			// view rebuilds itself (`ElementView.update()` → `rootEl.empty()` + `onMount`).
			// Registered as the view's afterRender hook BEFORE mount — so a rebuild
			// triggered from inside `onMount` is covered too — and called once explicitly
			// after mount for the first render. See `ElementView.setAfterRender`.
			//
			// Everything the hook needs is read LAZILY, at call time: `view.authoringAnchor()`
			// (a brand-new node after every rebuild), the current model (passed in), and the
			// `authoringControls` pref (which may have flipped since mount — indeed flipping
			// a pref is one of the things that triggers a rebuild).
			let chromeOwner: Component | undefined;
			let pencilEl: HTMLElement | undefined;

			const mountPipelineChrome = (current: M): void => {
				// One Component per (re)mount, owned by the view: unloading it detaches every
				// listener the previous panel registered, so a long-lived view that rebuilds
				// many times does not accumulate handlers on detached nodes. `removeChild` is
				// a no-op when the default update() path already unloaded it.
				if (chromeOwner) view.removeChild(chromeOwner);
				pencilEl?.remove();
				pencilEl = undefined;
				// Defensive: a hypothetical `onUpdate` that rebuilds WITHOUT emptying root
				// would otherwise leave the old nodes behind and we would mount a second set.
				root.querySelectorAll('.dse-chrome, .dse-chrome-summary').forEach((n) => n.remove());
				chromeOwner = new Component();
				view.addChild(chromeOwner);

				// D9 (Plan 15 Task 5): opt-in reading-mode edit affordance. Default OFF
				// (authoringControls) ⇒ this branch never runs ⇒ rendered DOM is unchanged.
				// Gated on canPersist (never on embeds/exports); writes go through the SAME
				// host.replaceSource path (no parallel writer). D7 Task 9: also gated on
				// `!def.noAuthoringButton` — `ds-hero` opts out because it mounts its OWN
				// "Edit definition" header affordance (same openFormEditor/schema, placed next
				// to `[respite]` per spec §3.2, not a redundant trailing pencil).
				// SC-145: mounted into `view.authoringAnchor()`, NOT unconditionally `root` —
				// see that method's doc (framework/view.ts) for why a bare `root` target left
				// the button visually outside the card for every view whose visible card frame
				// is a nested child div (the D6 display-family `.dse-card` / statblock's
				// `.dse-sb`) rather than root itself.
				// SC-169: the edit affordance's GATE is unchanged; only its LOCATION moves when
				// the element opted into chrome.
				const showEdit = cx.host.canPersist && !def.noAuthoringButton && isAuthoringControlsOn(prefs);
				mountChromeFor(current, showEdit, chromeOwner);
				// H-1's safety net, run after EVERY render including the first: the collapsed
				// attribute and the one-line bar must never exist apart. See its doc comment.
				ensureCollapseInvariant(root);
			};

			// SC-169: the standard menu panel + whole-element collapse. Opt-in via the
			// `chrome` slot; a def without it renders exactly the DOM it rendered before.
			// When chrome IS present it OWNS the edit affordance — the pencil becomes a panel
			// item instead of a card-corner button, so there is never a second one. That
			// relocation is invisible to the print freeze: `[data-dse-print="on"] .dse-btn
			// { display: none }` (styles-source.css, print rule 4) already hides the
			// card-corner pencil on paper — which is why `statblock--steel-print.png` and
			// `statblock-edit-btn--steel-print.png` carry the SAME hash in the freeze baseline.
			const mountChromeFor = (current: M, showEdit: boolean, owner: Component): void => {
				if (def.chrome) {
					const chrome = def.chrome;
					const ctx = { model: current, def: { id: def.id, name: def.name } };
					// SC-169 round 2 (ruling 2): block keys > the two global collapse preferences
					// > the built-in defaults, the same three-tier ladder D4 §1.3 gave the
					// ComponentWrapper pair. `collapsibleDefault` defaults true and
					// `collapseDefault` defaults false, so an install that has touched neither
					// gets exactly the prototype's behaviour.
					const { collapsible, collapsedDefault } = resolveCollapseState(collapseKeys, {
						collapsibleDefault: readCollapsePref(prefs, 'collapsibleDefault', true),
						collapseDefault: readCollapsePref(prefs, 'collapseDefault', false),
					});
					mountChrome(
						{
							root,
							anchor: view.authoringAnchor(),
							chrome,
							ctx,
							persist: { session, blockKey: host.blockKey(), slot: 'chrome' },
							collapsedDefault,
							// SC-169 fix round 1 (L-1): the author's key AND the element's own
							// per-model veto. ANDed, so the veto can only ever remove the control
							// — see ElementChrome.collapsible.
							collapsible: collapsible && (chrome.collapsible?.(ctx) ?? true),
							summary: () => view.chromeSummary(),
							pipelineItems: showEdit
								? [
										{
											id: 'edit',
											icon: 'pencil',
											label: `Edit ${def.name}`,
											onClick: () => openFormEditor(view, cx, def, source, this.deps.validation),
										} satisfies ChromeMenuItem,
									]
								: [],
						},
						owner,
					);
				} else if (showEdit) {
					// D9 (Plan 15 Task 5) / SC-145: mounted into `view.authoringAnchor()`, NOT
					// unconditionally `root` — see that method's doc (framework/view.ts) for why a
					// bare `root` target left the button visually outside the card for every view
					// whose visible card frame is a nested child div.
					pencilEl = iconButton(
						view.authoringAnchor(),
						{
							icon: 'pencil',
							label: `Edit ${def.name}`,
							variant: 'ghost',
							onClick: () => openFormEditor(view, cx, def, source, this.deps.validation),
						},
						owner,
					).buttonEl;
				}
			};

			// SC-169 fix round 1 (H-1): registered BEFORE mount, so even a rebuild kicked off
			// from inside `onMount` re-attaches the panel. Keyed on ROOT, not on the view —
			// see framework/view.ts's AFTER_RENDER note for why (a `ds-scc`/`ds-statblock`
			// body re-renders through a CHILD view mounted onto this same root).
			registerAfterRender(root, () => mountPipelineChrome(view.currentModel()));
			host.addChild(view);
			await runStageAsync('render', () => view.mount(root, model));
			// The first render's leg. `update()` runs the hook itself from here on.
			mountPipelineChrome(model);
		} catch (error) {
			// ONE error boundary for the whole pipeline (F1 §2.4) — no per-element
			// try/catch. renderErrorCard always clears root first, so a render-stage
			// failure partway through onMount never leaves a half-mounted element behind
			// the error card.
			renderErrorCard(root, def, error);
		}
	}
}
