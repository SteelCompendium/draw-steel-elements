import * as path from "path";
import { SccResolver } from "@/refs/SccResolver";
import { DEFAULT_SETTINGS } from "@model/Settings";
import { makeFakeApp, loadFixtureIntoVault } from "../../fakes/fakeObsidian";

const FIXTURES = path.join(__dirname, "../../fixtures/md-dse");
const GOBLIN = "mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker";

function setup() {
    const { app, vault, metadataCache } = makeFakeApp();
    loadFixtureIntoVault(vault, metadataCache,
        path.join(FIXTURES, "monster/goblin/statblock/goblin-stinker.md"),
        "DS Compendium/monster/goblin/statblock/goblin-stinker.md");
    return new SccResolver(app, DEFAULT_SETTINGS);
}

describe("SccResolver public read seam (OD-D6-2a)", () => {
    test("entries() enumerates every frontmatter-scc code with its path", () => {
        const entries = setup().entries();
        expect(entries).toContainEqual({
            scc: GOBLIN,
            path: "DS Compendium/monster/goblin/statblock/goblin-stinker.md",
        });
    });
    test("entries() returns a copy — mutating it does not corrupt the resolver", () => {
        const resolver = setup();
        resolver.entries().push({ scc: "junk", path: "junk.md" });
        expect(resolver.codeToPath("junk")).toBeNull();
    });
    test("codeToPath resolves an indexed code, null for an unknown one", () => {
        const resolver = setup();
        expect(resolver.codeToPath(GOBLIN))
            .toBe("DS Compendium/monster/goblin/statblock/goblin-stinker.md");
        expect(resolver.codeToPath("mcdm.heroes.v1/class/nonesuch")).toBeNull();
    });
});
