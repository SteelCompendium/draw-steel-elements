import * as path from "path";
import { createCompendiumIndex } from "@/services/CompendiumIndex";
import { SccResolver } from "@/refs/SccResolver";
import { DEFAULT_SETTINGS } from "@model/Settings";
import { makeFakeApp, loadFixtureIntoVault } from "../../fakes/fakeObsidian";

const F = path.join(__dirname, "../../fixtures/md-dse");
const GOBLIN = "mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker";
const KIT = "mcdm.heroes.v1/kit/panther";
const COND = "mcdm.heroes.v1/condition/bleeding";

function setup(empty = false) {
    const { app, vault, metadataCache } = makeFakeApp();
    if (!empty) {
        loadFixtureIntoVault(vault, metadataCache,
            path.join(F, "monster/goblin/statblock/goblin-stinker.md"),
            "DS Compendium/monster/goblin/statblock/goblin-stinker.md");
        loadFixtureIntoVault(vault, metadataCache,
            path.join(F, "kit/panther.md"), "DS Compendium/kit/panther.md");
        loadFixtureIntoVault(vault, metadataCache,
            path.join(F, "condition/bleeding.md"), "DS Compendium/condition/bleeding.md");
    }
    const resolver = new SccResolver(app, DEFAULT_SETTINGS);
    return { index: createCompendiumIndex(app, resolver) };
}

describe("CompendiumIndex (spec §6)", () => {
    test("available reflects whether any compendium code is indexed", () => {
        expect(setup(true).index.available).toBe(false);
        expect(setup().index.available).toBe(true);
    });

    test("getEntry returns a lightweight listing record (no file read)", () => {
        const entry = setup().index.getEntry(KIT)!;
        expect(entry.scc).toBe(KIT);
        expect(entry.type).toBe("kit");
        expect(entry.name).toBe("Panther");
        expect(entry.source).toBe("mcdm.heroes.v1");
    });

    test("getEntity().model() parses a frontmatter family (kit) via the SDK adapter", async () => {
        const entity = await setup().index.getEntity(KIT);
        const model = await entity!.model();
        expect((model as any).name).toBe("Panther");
        expect((model as any).stamina_bonus).toBeDefined();
    });

    test("getStatblock returns a typed SDK Statblock (D8 entry point)", async () => {
        const sb = await setup().index.getStatblock(GOBLIN);
        expect(sb!.name).toBe("Goblin Stinker");
        expect(sb!.role).toBe("Controller");
        expect(sb!.organization).toBe("Horde");
    });

    test("resolveSlug scopes candidates by type family (bare-slug sugar, §1.3)", () => {
        const index = setup().index;
        expect(index.resolveSlug("panther", /^kit$/)).toEqual([KIT]);
        expect(index.resolveSlug("bleeding", /^condition$/)).toEqual([COND]);
        // A kit slug does NOT match under a statblock scope.
        expect(index.resolveSlug("panther", /statblock/)).toEqual([]);
    });

    test("query fuzzy-matches item_name and honors type/source filters", () => {
        const index = setup().index;
        expect(index.query("panth").map((e) => e.scc)).toContain(KIT);
        expect(index.query("", { type: /^condition$/ }).map((e) => e.scc)).toEqual([COND]);
        expect(index.query("", { source: "mcdm.monsters.v1" }).map((e) => e.scc)).toEqual([GOBLIN]);
    });

    test("getEntity is null for an unknown code", async () => {
        expect(await setup().index.getEntity("mcdm.heroes.v1/kit/nonesuch")).toBeNull();
    });
});
