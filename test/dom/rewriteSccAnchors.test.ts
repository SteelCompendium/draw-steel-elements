/** @jest-environment jsdom */
import { rewriteSccAnchors, sccPostProcessor, SccAnchorResolver } from "@/refs/rewriteSccAnchors";
import { SccResolution } from "@/refs/SccResolver";
import { fakeTFile } from "../fakes/fakeObsidian";

function stubResolver(map: Record<string, SccResolution>): SccAnchorResolver {
    return { resolve: jest.fn((raw: string) =>
        map[raw] ?? { kind: "unresolved", code: raw }) };
}

const VAULT_HREF = "scc.v1:mcdm.heroes.v1/rule.combat/turn";
const WEB_HREF = "scc.v1:mcdm.heroes.v1/class/shadow";
const V2_HREF = "scc.v2:mcdm.heroes.v1/rule.combat/turn";

function container(html: string): HTMLElement {
    const el = document.createElement("div");
    el.innerHTML = html;
    return el;
}

describe("rewriteSccAnchors (F2 §4.3a)", () => {
    const resolver = stubResolver({
        [VAULT_HREF]: {
            kind: "vault",
            file: fakeTFile("DS Compendium/rule/combat/turn.md"),
            linkpath: "DS Compendium/rule/combat/turn.md",
        },
        [WEB_HREF]: { kind: "web", url: "https://steelcompendium.io/scc/mcdm.heroes.v1/class/shadow/" },
    });

    // The `resolver` mock above is shared across every test in this block; clear its
    // call history between tests so "non-scc anchors are untouched" (below) only sees
    // calls made during its own run, not leftover history from earlier tests.
    beforeEach(() => {
        (resolver.resolve as jest.Mock).mockClear();
    });

    test("vault resolution becomes a native internal link", () => {
        const el = container(`<p><a href="${VAULT_HREF}">turn</a></p>`);
        rewriteSccAnchors(el, resolver);
        const anchor = el.querySelector("a")!;
        expect(anchor.classList.contains("internal-link")).toBe(true);
        expect(anchor.getAttribute("data-href")).toBe("DS Compendium/rule/combat/turn.md");
        expect(anchor.getAttribute("href")).toBe("DS Compendium/rule/combat/turn.md");
        expect(anchor.textContent).toBe("turn");
    });

    test("web resolution becomes an external steelcompendium.io anchor", () => {
        const el = container(`<p><a href="${WEB_HREF}">Shadow</a></p>`);
        rewriteSccAnchors(el, resolver);
        const anchor = el.querySelector("a")!;
        expect(anchor.classList.contains("ds-scc-web")).toBe(true);
        expect(anchor.getAttribute("href"))
            .toBe("https://steelcompendium.io/scc/mcdm.heroes.v1/class/shadow/");
        expect(anchor.getAttribute("rel")).toBe("noopener");
    });

    test("unresolved (incl. scc.v2:) unwraps to a styled span with tooltip", () => {
        const el = container(`<p><a href="${V2_HREF}">turn</a></p>`);
        rewriteSccAnchors(el, resolver);
        expect(el.querySelector("a")).toBeNull();
        const span = el.querySelector("span.ds-scc-unresolved")!;
        expect(span.textContent).toBe("turn");
        expect(span.getAttribute("title")).toBe("Unknown SCC code");
    });

    test("non-scc anchors are untouched", () => {
        const el = container(`<p><a href="https://example.com">x</a><a href="sccschemes.md">y</a></p>`);
        rewriteSccAnchors(el, resolver);
        expect(el.querySelectorAll("a")).toHaveLength(2);
        expect((resolver.resolve as jest.Mock)).not.toHaveBeenCalled();
    });

    test("rewrites multiple anchors in one pass", () => {
        const el = container(
            `<p><a href="${VAULT_HREF}">a</a> and <a href="${WEB_HREF}">b</a></p>`);
        rewriteSccAnchors(el, resolver);
        expect(el.querySelectorAll("a.internal-link")).toHaveLength(1);
        expect(el.querySelectorAll("a.ds-scc-web")).toHaveLength(1);
    });
});

describe("sccPostProcessor early exit (F2 §4.3b cost control)", () => {
    test("elements without scc anchors never touch the resolver", () => {
        const resolver = stubResolver({});
        const process = sccPostProcessor(resolver);
        process(container(`<p><a href="https://example.com">x</a> plain text</p>`));
        expect(resolver.resolve as jest.Mock).not.toHaveBeenCalled();
    });

    test("elements with scc anchors are rewritten", () => {
        const resolver = stubResolver({});
        const process = sccPostProcessor(resolver);
        const el = container(`<p><a href="scc:x.v1/rule/y">y</a></p>`);
        process(el);
        expect(el.querySelector("span.ds-scc-unresolved")).not.toBeNull();
    });
});

describe("post-processor as registered by main.ts", () => {
    test("the factory-produced processor is a plain (el) => void suitable for registerMarkdownPostProcessor", () => {
        const resolver = stubResolver({});
        const process = sccPostProcessor(resolver);
        expect(typeof process).toBe("function");
        expect(process.length).toBe(1);
        // And it is safe on a totally empty element:
        expect(() => process(document.createElement("div"))).not.toThrow();
    });
});
