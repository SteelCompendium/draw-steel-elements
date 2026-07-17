import { normalizeSccTarget, sccToFilePath } from "@/refs/SccResolver";

describe("normalizeSccTarget (spec v1.1 grammar, F2 §4.1)", () => {
    const bare = "mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker";
    test("scc.v1: canonical form", () => {
        expect(normalizeSccTarget(`scc.v1:${bare}`)).toBe(bare);
    });
    test("bare scc: is the permanent implicit-v1 alias", () => {
        expect(normalizeSccTarget(`scc:${bare}`)).toBe(bare);
    });
    test("#format fragment is stripped before lookup", () => {
        expect(normalizeSccTarget(`scc.v1:${bare}#json`)).toBe(bare);
    });
    test("future scheme versions are refused — never bind to current content", () => {
        expect(normalizeSccTarget(`scc.v2:${bare}`)).toBeNull();
        expect(normalizeSccTarget(`scc.v99:${bare}`)).toBeNull();
    });
    test("non-scc strings and empty codes are refused", () => {
        expect(normalizeSccTarget("https://example.com")).toBeNull();
        expect(normalizeSccTarget("@Creatures/Goblin")).toBeNull();
        expect(normalizeSccTarget("scc:")).toBeNull();
        expect(normalizeSccTarget("scc.v1:#json")).toBeNull();
    });
    test("surrounding whitespace tolerated", () => {
        expect(normalizeSccTarget(`  scc:${bare}  `)).toBe(bare);
    });
});

describe("sccToFilePath (mirror of steel-etl generator.go SCCToFilePath)", () => {
    test("drops the source segment and expands dots", () => {
        expect(sccToFilePath("mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker"))
            .toBe("monster/goblin/statblock/goblin-stinker.md");
        expect(sccToFilePath("mcdm.heroes.v1/rule.combat/turn"))
            .toBe("rule/combat/turn.md");
        expect(sccToFilePath("mcdm.heroes.v1/feature.fury.level-1/growing-ferocity"))
            .toBe("feature/fury/level-1/growing-ferocity.md");
    });
    test("custom extension", () => {
        expect(sccToFilePath("mcdm.heroes.v1/class/shadow", ".yaml")).toBe("class/shadow.yaml");
    });
    test("degenerate codes return null", () => {
        expect(sccToFilePath("no-slashes")).toBeNull();
        expect(sccToFilePath("")).toBeNull();
    });

    // --- Go-mirror edge cases -------------------------------------------------
    // steel-etl's SCCToFilePath (internal/output/generator.go) builds the same
    // dot-expanded segment list, but joins them with filepath.Join, whose documented
    // behavior is "Empty elements are ignored" (https://pkg.go.dev/path/filepath#Join).
    // A naive `pathParts.join("/")` in TS does NOT drop empty segments, so a stray
    // leading/trailing dot in a code segment (an authoring typo, but one steel-etl
    // tolerates without producing a malformed path) would diverge: Go collapses the
    // double separator away, a naive TS join would leave it in (or a leading "/").
    // These cases pin the TS mirror to Go's actual on-disk output.
    test("a trailing dot in a segment does not leave a double slash (Go Join drops empty elements)", () => {
        // "rule." -> ["rule", ""] when dot-split; Go: filepath.Join("rule", "", "turn.md") = "rule/turn.md"
        expect(sccToFilePath("mcdm.heroes.v1/rule./turn")).toBe("rule/turn.md");
    });
    test("a leading dot in a segment does not leave a leading slash", () => {
        // ".turn" -> ["", "turn"] when dot-split; Go: filepath.Join("", "turn.md") = "turn.md"
        expect(sccToFilePath("mcdm.heroes.v1/.turn")).toBe("turn.md");
    });
    test("an empty slash segment (double slash in the code) does not leave a leading slash", () => {
        expect(sccToFilePath("mcdm.heroes.v1//item")).toBe("item.md");
    });
});
