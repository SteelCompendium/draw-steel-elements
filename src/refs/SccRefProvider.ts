import { App } from "obsidian";
import type { RefProvider, RefRequest, ResolvedRef } from "@/framework/seams/refs";
import { SccResolver, normalizeSccTarget } from "./SccResolver";
import { extractFirstDsBlock } from "@utils/ReferenceResolver";

const SCC_PREFIX = /^scc(\.v\d+)?:/;

/**
 * F2's side of the F1 §3.7 reference seam: resolves `scc:`/`scc.v1:` references to
 * the first ds-* block of the target compendium file. Claims ALL scc-prefixed
 * strings (including future scheme versions) so they never fall through to the
 * path-based providers; unsupported versions then fail with a clear message.
 * Structured data requires a vault hit — web fallback is a link-only affordance.
 */
export class SccRefProvider implements RefProvider {
    readonly kind = "scc";

    constructor(private app: App, private resolver: SccResolver) {}

    canResolve(raw: string): boolean {
        return SCC_PREFIX.test(raw.trim());
    }

    async resolve(req: RefRequest): Promise<ResolvedRef> {
        const code = normalizeSccTarget(req.raw);
        if (code === null) {
            throw new Error(
                `SCC reference (${req.raw.trim()}) uses an unsupported scheme version or is ` +
                `malformed. Only scc: / scc.v1: references are supported.`);
        }
        const resolution = this.resolver.resolve(req.raw);
        if (resolution.kind !== "vault") {
            throw new Error(
                `SCC reference (${req.raw.trim()}) is not available in this vault. ` +
                `Sync the compendium (Settings → Draw Steel Elements → Sync compendium).`);
        }
        const data = await extractFirstDsBlock(this.app, resolution.file);
        return { data, file: resolution.file, scc: code };
    }
}
