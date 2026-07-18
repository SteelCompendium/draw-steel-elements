// D7 Task 8 (spec §3.5, recon d7-recon.md §6) — VIEW-LEVEL selective compendium
// resolution for ds-hero's definition refs (`class`/`ancestry`/`kits[]`).
//
// This deliberately mirrors RefUnwrapView's resolution seam (src/elements/shared/
// RefUnwrapView.ts), NOT `def.resolveRefs`/`cx.refs` — recon d7-recon.md §6: "HERO REF
// RESOLUTION POINT = VIEW-level via cx.compendium (mirror RefUnwrapView); def.resolveRefs
// only right for bare vault paths ... SccRefProvider throws on web/unresolved." A hero
// sheet needs the TYPED SDK model (Class/Kit/Ancestry, for deriveHeroStats' math), not a
// whole-block mount — so this is `cx.compendium.getEntity(code).model()` directly, with
// its own small degrade ladder (spec §3.5's per-ref "unresolved — sync compendium"
// notice), rather than reusing RefUnwrapView's whole-view classify-and-mount ladder
// (web/vault/unresolved via cx.sccAnchors) which answers a different question ("what do I
// mount") than this one ("what typed data do I have for the math").
//
// `abilities[]` SCC codes are explicitly OUT of scope here (spec §3.5: "left unresolved
// and rendered lazily per-row on expand" — Task 9's job, via the existing Feature/Ability
// sub-view + RefUnwrapView).
import { Ancestry, Class, Kit } from 'steel-compendium-sdk';
import type { CompendiumIndex } from '@/services/CompendiumIndex';
import type { HeroDefn } from './model';

/** Which definition field a resolution issue belongs to — the sheet (Task 9) groups
 *  per-ref degrade notices by this. `'kits'` covers every kit slot (0-2); the offending
 *  ref's own raw text is carried in `RefIssue.code` so a specific slot is still
 *  identifiable when there are two. */
export type RefField = 'class' | 'ancestry' | 'kits';

/** One unresolvable ref (spec §3.5 degrade): the slot stays `undefined` in
 *  `ResolvedHeroDefinition` and the sheet renders inline overrides + this notice instead
 *  of silently omitting the ref. */
export interface RefIssue {
	field: RefField;
	/** The raw authored ref text (or the normalized code, once known) that failed. */
	code: string;
	reason: string;
}

/** A successfully resolved ref: the bare SCC code, the entity's display name (for a
 *  notice/label), and the typed SDK model `deriveHeroStats` reads fields off of. */
export interface ResolvedEntity<T> {
	code: string;
	name: string;
	model: T;
}

export interface ResolvedHeroDefinition {
	class?: ResolvedEntity<Class>;
	ancestry?: ResolvedEntity<Ancestry>;
	/** Order-preserving w.r.t. `defn.kits` for every SLOT that resolved; an unresolved
	 *  slot is simply omitted (not a hole) — `deriveHeroStats` sums whatever resolved,
	 *  which is the correct partial-degrade behavior (spec §3.5: "still fully functional"). */
	kits: ResolvedEntity<Kit>[];
	issues: RefIssue[];
}

const NOT_INSTALLED_REASON = 'Compendium not installed — run "Sync compendium" to resolve this reference.';

/** Bare-slug -> code (scoped by type, via `index.resolveSlug`), `scc(.vN)?:`-prefixed ->
 *  strip to code, already-slashed -> already a full code. Mirrors
 *  `RefUnwrapView.toCode`/`codeFromRaw` (kept as a narrower local copy here, not a shared
 *  export, because this ladder additionally needs to hand back a message string rather
 *  than render a card). */
function normalizeCode(raw: string, typeScope: RegExp, index: CompendiumIndex): { code: string } | { reason: string } {
	const trimmed = raw.trim();
	if (/^scc(\.v\d+)?:/.test(trimmed)) {
		const code = trimmed.replace(/^scc(\.v\d+)?:/, '').split('#')[0].trim();
		return { code };
	}
	if (trimmed.includes('/')) return { code: trimmed };
	const candidates = index.resolveSlug(trimmed, typeScope);
	if (candidates.length === 1) return { code: candidates[0] };
	if (candidates.length === 0) return { reason: `No compendium entry matches "${trimmed}".` };
	return { reason: `"${trimmed}" is ambiguous — paste a full code: ${candidates.join(', ')}` };
}

/** Resolves ONE ref to its typed model, or an issue — never throws (every failure mode,
 *  including an unexpected `getEntity`/`model()` rejection, is caught and turned into a
 *  `RefIssue` here) so the `Promise.allSettled` in `resolveHeroDefinition` below is a
 *  defense-in-depth belt-and-suspenders layer, not the only thing standing between one
 *  bad ref and the whole resolution failing. */
async function resolveOne<T>(
	raw: string,
	field: RefField,
	typeScope: RegExp,
	typeLabel: string,
	isInstance: (model: unknown) => model is T,
	compendium: CompendiumIndex | undefined,
): Promise<{ entity?: ResolvedEntity<T>; issue?: RefIssue }> {
	try {
		if (!compendium || !compendium.available) {
			return { issue: { field, code: raw, reason: NOT_INSTALLED_REASON } };
		}
		const normalized = normalizeCode(raw, typeScope, compendium);
		if ('reason' in normalized) return { issue: { field, code: raw, reason: normalized.reason } };
		const { code } = normalized;
		const entity = await compendium.getEntity(code);
		if (!entity) {
			return { issue: { field, code, reason: `"${code}" not found in compendium — sync compendium?` } };
		}
		const model = await entity.model();
		if (model === undefined || !isInstance(model)) {
			return { issue: { field, code, reason: `"${entity.name}" found but is not a ${typeLabel} entry.` } };
		}
		return { entity: { code, name: entity.name, model } };
	} catch (error) {
		return { issue: { field, code: raw, reason: error instanceof Error ? error.message : String(error) } };
	}
}

const isClass = (m: unknown): m is Class => m instanceof Class;
const isAncestry = (m: unknown): m is Ancestry => m instanceof Ancestry;
const isKit = (m: unknown): m is Kit => m instanceof Kit;

// Matches the exact `frontmatterAdapter` registrations in typeAdapters.ts (single source
// of truth there; these are a deliberate narrow local mirror, not an import, because
// typeAdapters.ts doesn't export its per-type regexes individually — only the assembled
// TYPE_ADAPTERS list and STATBLOCK_TYPE_RE).
const CLASS_TYPE_RE = /^class$/;
const ANCESTRY_TYPE_RE = /^ancestry$/;
const KIT_TYPE_RE = /^kit$/;

interface TaskMeta {
	field: RefField;
}

/**
 * spec §3.5 / plan-18 Task 8 brief: resolves `defn.class`/`defn.ancestry`/`defn.kits[]`
 * against the compendium, in parallel, with per-ref isolation (`Promise.allSettled` —
 * one ref's failure never drops the others). Only STRING refs are resolution candidates
 * — an inline object (`defn.class`/`defn.ancestry` may be authored as inline data per
 * spec §3.1/Task 7) is left as-is and produces no issue; Task 8 only resolves compendium
 * refs, and the inline-data path is already fully handled by `defn` itself (the sheet
 * falls back to inline overrides, spec §3.5). `defn.abilities[]` is never touched here
 * (spec §3.5: resolved lazily per-row in Task 9).
 *
 * A slot that fails to resolve stays `undefined` (or, for `kits`, simply omitted from the
 * array) — never a thrown error — so the sheet can always render *something* (inline
 * overrides + a per-ref notice), matching spec §3.5's "still fully functional" mandate.
 */
export async function resolveHeroDefinition(
	defn: HeroDefn,
	compendium?: CompendiumIndex,
): Promise<ResolvedHeroDefinition> {
	const metas: TaskMeta[] = [];
	const promises: Promise<{ entity?: ResolvedEntity<unknown>; issue?: RefIssue }>[] = [];

	if (typeof defn.class === 'string') {
		metas.push({ field: 'class' });
		promises.push(resolveOne(defn.class, 'class', CLASS_TYPE_RE, 'class', isClass, compendium));
	}
	if (typeof defn.ancestry === 'string') {
		metas.push({ field: 'ancestry' });
		promises.push(resolveOne(defn.ancestry, 'ancestry', ANCESTRY_TYPE_RE, 'ancestry', isAncestry, compendium));
	}
	for (const raw of defn.kits ?? []) {
		metas.push({ field: 'kits' });
		promises.push(resolveOne(raw, 'kits', KIT_TYPE_RE, 'kit', isKit, compendium));
	}

	const settled = await Promise.allSettled(promises);

	let classEntity: ResolvedEntity<Class> | undefined;
	let ancestryEntity: ResolvedEntity<Ancestry> | undefined;
	const kitEntities: ResolvedEntity<Kit>[] = [];
	const issues: RefIssue[] = [];

	settled.forEach((outcome, i) => {
		const { field } = metas[i];
		if (outcome.status === 'rejected') {
			// Defense-in-depth only — resolveOne's own try/catch means this should be
			// unreachable in practice; kept so a future resolveOne regression degrades
			// (per-ref notice) instead of rejecting resolveHeroDefinition's own promise.
			issues.push({
				field,
				code: '(unknown)',
				reason: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
			});
			return;
		}
		const { entity, issue } = outcome.value;
		if (issue) issues.push(issue);
		if (!entity) return;
		if (field === 'class') classEntity = entity as ResolvedEntity<Class>;
		else if (field === 'ancestry') ancestryEntity = entity as ResolvedEntity<Ancestry>;
		else kitEntities.push(entity as ResolvedEntity<Kit>);
	});

	return { class: classEntity, ancestry: ancestryEntity, kits: kitEntities, issues };
}
