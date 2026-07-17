// src/refs/SccResolver.ts — SCC (Steel Compendium Classification) code utilities (F2 §4).
//
// Task 3 scope: pure functions only (normalizeSccTarget, sccToFilePath). Kept free of any
// `obsidian` import on purpose — these run in the `unit` jest project (node env, no DOM),
// and Tasks 4+ layer the stateful `SccResolver` class (which does need App/TFile/etc.) on
// top of them in a later commit.

/**
 * Strip the `scc:`/`scc.v1:` prefix and any `#format` fragment (F2 §4.1).
 * Returns the bare code ("source/type/item"), or null when the target is not an
 * SCC reference this plugin may resolve — including any future `scc.vN:` version,
 * which must NEVER silently bind to current content (spec v1.1 mandate).
 */
export function normalizeSccTarget(raw: string): string | null {
    // [\s\S] instead of `.` + the `s` (dotAll) flag: this repo's tsconfig targets ES6,
    // and the dotAll flag needs ES2018+ (tsc TS1501) — [\s\S] matches any char, newlines
    // included, without it.
    const match = /^scc(?:\.v(\d+))?:([\s\S]*)$/.exec(raw.trim());
    if (!match) return null;
    if (match[1] !== undefined && match[1] !== "1") return null;
    const code = match[2].split("#")[0].trim();
    return code.length > 0 ? code : null;
}

/**
 * Mirror of steel-etl `internal/output/generator.go:SCCToFilePath`: drop the source
 * segment (first slash-separated part), expand dots to path separators in the rest,
 * append the extension. The unified Browse tree guarantees path ≡ this derivation.
 *
 * Go's version uses `filepath.Join(pathParts...)`, which is documented to ignore empty
 * path elements ("Empty elements are ignored", https://pkg.go.dev/path/filepath#Join) —
 * a stray leading/trailing dot in a code segment (e.g. "rule." or ".turn") produces an
 * empty fragment when dot-split, and Go's Join silently drops it rather than emitting a
 * double slash or a leading slash. A naive `.join("/")` here would NOT do that, so empty
 * fragments are filtered before joining to keep this an exact mirror (see
 * test/unit/refs/sccCode.test.ts "Go-mirror edge cases").
 *
 * One deliberate divergence: Go returns the sentinel path `"unknown" + ext` for a
 * degenerate code (no `/`, or nothing left after dropping the source segment); this
 * mirror returns `null` instead so callers (SccResolver) can fall through to the
 * frontmatter index / web fallback rather than resolving to a bogus vault path.
 */
export function sccToFilePath(code: string, ext = ".md"): string | null {
    const parts = code.split("/");
    if (parts.length < 2) return null;
    const pathParts: string[] = [];
    for (const part of parts.slice(1)) {
        for (const segment of part.split(".")) pathParts.push(segment);
    }
    if (pathParts.length === 0) return null;
    pathParts[pathParts.length - 1] += ext;
    const nonEmpty = pathParts.filter((segment) => segment.length > 0);
    return nonEmpty.length > 0 ? nonEmpty.join("/") : null;
}

// (SccResolver class added in a later task — Task 4.)
