import { SccResolution } from "./SccResolver";

/** Structural seam so F1's pipeline and tests can pass any resolver (F2 §4.4). */
export interface SccAnchorResolver {
    resolve(rawTarget: string): SccResolution;
}

const SCC_PREFIX = /^scc(\.v\d+)?:/;

/**
 * F2 §4.3(a) — post-render DOM pass. Obsidian's MarkdownRenderer emits `scc.v1:` hrefs
 * as inert external anchors; rewrite each according to its resolution:
 *  - vault      → native internal link (Obsidian click handling + hover preview)
 *  - web        → https://steelcompendium.io/scc/{code}/ external anchor (.ds-scc-web)
 *  - unresolved → plain-text span (.ds-scc-unresolved, tooltip)
 */
export function rewriteSccAnchors(root: HTMLElement, resolver: SccAnchorResolver): void {
    const anchors = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href^="scc"]'));
    for (const anchor of anchors) {
        const href = anchor.getAttribute("href");
        if (href === null || !SCC_PREFIX.test(href)) continue; // e.g. href="sccschemes.md"
        const resolution = resolver.resolve(href);
        if (resolution.kind === "vault") {
            anchor.classList.remove("external-link");
            anchor.classList.add("internal-link");
            anchor.setAttribute("href", resolution.linkpath);
            anchor.setAttribute("data-href", resolution.linkpath);
            anchor.setAttribute("rel", "noopener");
            anchor.removeAttribute("target");
        } else if (resolution.kind === "web") {
            anchor.classList.add("ds-scc-web");
            anchor.setAttribute("href", resolution.url);
            anchor.setAttribute("rel", "noopener");
            anchor.setAttribute("target", "_blank");
        } else {
            const span = anchor.ownerDocument.createElement("span");
            span.className = "ds-scc-unresolved";
            span.setAttribute("title", "Unknown SCC code");
            span.textContent = anchor.textContent ?? "";
            anchor.replaceWith(span);
        }
    }
}

/**
 * F2 §4.3(b) — vault-wide reading-mode post-processor body. First line is the
 * cost-control early exit: near-zero for the overwhelming majority of renders.
 * Registered in main.ts (Task 12); F1's pipeline may lift this without change.
 */
export function sccPostProcessor(resolver: SccAnchorResolver): (el: HTMLElement) => void {
    return (el: HTMLElement) => {
        if (!el.querySelector('a[href^="scc"]')) return;
        rewriteSccAnchors(el, resolver);
    };
}
