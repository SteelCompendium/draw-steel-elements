/** @jest-environment jsdom */
import { rewriteSccAnchors, SccAnchorResolver } from "@/refs/rewriteSccAnchors";
import { SccResolution } from "@/refs/SccResolver";
import { fakeTFile } from "../fakes/fakeObsidian";

function stub(map: Record<string, SccResolution>): SccAnchorResolver {
    return { resolve: (raw) => map[raw] ?? { kind: "unresolved", code: raw } };
}
function anchor(href: string): HTMLElement {
    const root = document.createElement("div");
    root.innerHTML = `<a href="${href}">link</a>`;
    return root;
}

const CODE = "mcdm.heroes.v1/class/shadow";

describe("rewriteSccAnchors data-scc stamping (OD-D6-2a)", () => {
    test("vault anchor carries data-scc with the bare code", () => {
        const root = anchor(`scc.v1:${CODE}`);
        rewriteSccAnchors(root, stub({
            [`scc.v1:${CODE}`]: { kind: "vault", file: fakeTFile("x.md"), linkpath: "x.md" },
        }));
        expect(root.querySelector("a")!.getAttribute("data-scc")).toBe(CODE);
    });
    test("web anchor carries data-scc with the bare code", () => {
        const root = anchor(`scc:${CODE}`);
        rewriteSccAnchors(root, stub({
            [`scc:${CODE}`]: { kind: "web", url: `https://steelcompendium.io/scc/${CODE}/` },
        }));
        expect(root.querySelector("a")!.getAttribute("data-scc")).toBe(CODE);
    });
    test("unresolved span is unchanged (no data-scc, still a span)", () => {
        const root = anchor(`scc.v1:${CODE}`);
        rewriteSccAnchors(root, stub({ [`scc.v1:${CODE}`]: { kind: "unresolved", code: CODE } }));
        expect(root.querySelector("a")).toBeNull();
        expect(root.querySelector("span.ds-scc-unresolved")).not.toBeNull();
    });
});
