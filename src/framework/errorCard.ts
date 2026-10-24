// F1 §3.8 — the one error card every element failure is drawn with, and the staged error that tells it
// which stage failed. Lives here (not in pipeline.ts) so a caller that only needs to DRAW the card -- the
// block edit form's preview, SC-510 -- does not import the whole pipeline (which imports the form).
// pipeline.ts re-exports all three names, so every existing import is unchanged.
import type { ElementDefinition } from './registry';
import type { ValidationResult } from './validation';

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
