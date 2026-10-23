// SC-493 -- the one place that turns a block's body TEXT into the data `def.parse` receives:
// the YAML read plus the rescue ladder for a body YAML cannot read as a mapping. Extracted from
// `prepareModel` (pipeline.ts) so the render pipeline and the block edit form's raw-YAML box run
// the SAME code and cannot drift. (The form used to feed `parseYaml(raw) ?? {}` to `def.parse`
// while the pipeline fed it the bare `parseYaml(source)` -- an emptied box passed the form's
// check as `{}` and then rendered as an error card, because the pipeline hands the element
// `null`.)
//
// Deliberately NOT here: popping `prefs:` / the reserved collapse keys, schema validation and
// reference resolution. They need the preference store / validation service / reference
// service, and none of them can turn a null into an object or an object into a null.
import { parseYaml } from 'obsidian';
import type { ElementDefinition } from './registry';
import { peelLeadingCollapseKeys } from './chrome/collapsedKey';

/** What a block body reads as, before the pipeline pops `prefs:` / the collapse keys. */
export interface BlockBodyRead {
	/** `parseYaml(source)` as is -- `null` for an empty, whitespace-only or comment-only body (NOT `{}`);
	 *  `undefined` / the `@path` string only on the two rescue arms below. */
	rawData: unknown;
	/** The body `def.parse` finally sees. Only ever differs from `source` when the collapse-key
	 *  rescue fires -- i.e. for a body YAML could not parse UNTIL the framework's own leading key
	 *  lines were peeled off it. */
	bodySource: string;
	/** The reserved collapse keys the rescue peeled off the source text (empty for a body that parses). */
	peeledKeys: Record<string, boolean>;
}

/**
 * Step 2 of the render pipeline (F1 §2.4.1): parse the block body. A parse failure with no
 * rescue THROWS the original YAML error (the pipeline tags it "parse"; the form shows its message).
 * The whole-block-reference rescue mirrors `ElementPipeline.run`'s own comment verbatim.
 */
export function readBlockBody(
	def: Pick<ElementDefinition<unknown>, 'acceptsWholeBlockRef' | 'parseHandlesRawBody'>,
	source: string,
): BlockBodyRead {
	let rawData: unknown;
	// SC-169 fix round 1 (M-1): the body `def.parse` finally sees. Only ever differs from
	// `source` when the collapse-key rescue below fires — i.e. for a body YAML could not
	// parse UNTIL the framework's own leading key lines were peeled off it.
	let bodySource = source;
	let peeledKeys: Record<string, boolean> = {};
	try {
		rawData = parseYaml(source);
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
	return { rawData, bodySource, peeledKeys };
}
