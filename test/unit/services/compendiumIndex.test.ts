import * as path from "path";
// Plugin is imported from the mock directly (not the bare 'obsidian' specifier): the real
// obsidian.d.ts declares Plugin abstract, so `new Plugin()` only type-checks against the
// concrete jest-free mock (established pattern -- see test/dom/authoring/insert.test.ts).
import { Plugin } from "../../mocks/obsidian";
import { createCompendiumIndex } from "@/services/CompendiumIndex";
import { SccResolver } from "@/refs/SccResolver";
import { DEFAULT_SETTINGS } from "@model/Settings";
import { makeFakeApp, loadFixtureIntoVault, fakeTFile, FakeVault, FakeMetadataCache } from "../../fakes/fakeObsidian";

const F = path.join(__dirname, "../../fixtures/md-dse");
const GOBLIN = "mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker";
const GOBLIN_PATH = "DS Compendium/monster/goblin/statblock/goblin-stinker.md";
const KIT = "mcdm.heroes.v1/kit/panther";
const KIT_PATH = "DS Compendium/kit/panther.md";
const COND = "mcdm.heroes.v1/condition/bleeding";
const COND_PATH = "DS Compendium/condition/bleeding.md";

function setup(empty = false) {
    const { app, vault, metadataCache } = makeFakeApp();
    if (!empty) {
        loadFixtureIntoVault(vault, metadataCache,
            path.join(F, "monster/goblin/statblock/goblin-stinker.md"), GOBLIN_PATH);
        loadFixtureIntoVault(vault, metadataCache, path.join(F, "kit/panther.md"), KIT_PATH);
        loadFixtureIntoVault(vault, metadataCache, path.join(F, "condition/bleeding.md"), COND_PATH);
    }
    const resolver = new SccResolver(app, DEFAULT_SETTINGS);
    return { app, vault, metadataCache, resolver, index: createCompendiumIndex(app, resolver) };
}

/** Seeds a minimal synthetic `condition`-type entry (frontmatter-family adapter, no
 *  ds-block vault read needed) -- used by the LRU eviction test to fill a small cache
 *  without depending on extra fixture files. Returns the entry's SCC code. */
function seedCondition(vault: FakeVault, metadataCache: FakeMetadataCache, id: string): string {
    const scc = `mcdm.heroes.v1/condition/${id}`;
    const p = `DS Compendium/condition/${id}.md`;
    vault.setText(p, "synthetic fixture body");
    metadataCache.frontmatter.set(p, {
        type: "condition",
        scc,
        item_name: id,
        name: id,
        source: "mcdm.heroes.v1",
    });
    return scc;
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

// Task 2 review fix round 1 -- cache/invalidation mechanics (previously zero coverage).
describe("CompendiumIndex model cache (review findings: race, LRU, scoped invalidation)", () => {
    test("getEntity().model() caches: a second call returns the SAME instance, not a re-parse", async () => {
        const { index } = setup();
        const entity = await index.getEntity(KIT);
        const first = await entity!.model();
        const second = await entity!.model();
        expect(second).toBe(first);
    });

    test("cache hits refresh recency (LRU, not FIFO): the touched entry survives, the untouched second-oldest evicts", async () => {
        const { app, vault, metadataCache } = makeFakeApp();
        const resolver = new SccResolver(app, DEFAULT_SETTINGS);
        const index = createCompendiumIndex(app, resolver, { cacheMax: 3 });
        const codeA = seedCondition(vault, metadataCache, "synth-a");
        const codeB = seedCondition(vault, metadataCache, "synth-b");
        const codeC = seedCondition(vault, metadataCache, "synth-c");
        const codeD = seedCondition(vault, metadataCache, "synth-d");

        // Fill the cap-3 cache in insertion order: A (oldest), B, C (newest).
        const modelA1 = await (await index.getEntity(codeA))!.model();
        const modelB1 = await (await index.getEntity(codeB))!.model();
        const modelC1 = await (await index.getEntity(codeC))!.model();

        // Touch A (a cache HIT) -- FIFO would leave it as the oldest; LRU moves it to
        // the most-recently-used end, so the order becomes B, C, A.
        const modelAHit = await (await index.getEntity(codeA))!.model();
        expect(modelAHit).toBe(modelA1);

        // Insert D: cap exceeded -> evicts whichever is now oldest. Under true LRU
        // that's B (the untouched second-oldest); under FIFO it would have been A.
        await (await index.getEntity(codeD))!.model();

        // Check the survivors FIRST: both are cache hits, so checking them doesn't
        // itself mutate the cache. Checking the evicted key (B) is deferred to last
        // because re-fetching it is a cache-MISS insert, which -- correctly, for a
        // cap-3 cache -- evicts whatever is then oldest; checking it earlier would
        // cascade a second eviction onto one of the entries we're still verifying.
        const modelA2 = await (await index.getEntity(codeA))!.model();
        const modelC2 = await (await index.getEntity(codeC))!.model();
        expect(modelA2).toBe(modelA1); // survived -- the hit entry
        expect(modelC2).toBe(modelC1); // survived -- newer than the eviction target

        const modelB2 = await (await index.getEntity(codeB))!.model();
        expect(modelB2).not.toBe(modelB1); // evicted -- re-parsed into a new instance
    });

    test("scoped invalidation: a vault event for file A does not evict the cached model for unrelated code B", async () => {
        const { vault, index } = setup();
        const plugin = new Plugin();
        index.registerWatchers(plugin as never);

        const kitModel1 = await (await index.getEntity(KIT))!.model();
        const condModel1 = await (await index.getEntity(COND))!.model();

        // Fire a "modify" event for the KIT file only.
        vault.emit("modify", fakeTFile(KIT_PATH));

        const kitModel2 = await (await index.getEntity(KIT))!.model();
        const condModel2 = await (await index.getEntity(COND))!.model();

        expect(kitModel2).not.toBe(kitModel1); // evicted -- re-parsed
        expect(condModel2).toBe(condModel1); // untouched -- still cached
    });

    test("cache-poisoning race: an invalidation firing mid-read is not silently re-cached by the read it raced", async () => {
        const { vault, index } = setup();
        const plugin = new Plugin();
        index.registerWatchers(plugin as never);

        // Gate goblin-stinker's read so it stays pending until we manually release it.
        const gate = vault.gateRead(GOBLIN_PATH);

        const entity = await index.getEntity(GOBLIN);
        // Not awaited: nested async calls (model -> adapter.fromFile ->
        // extractFirstDsBlockText -> vault.read) run synchronously up to their first
        // real await, so by the time this call returns, execution is already paused
        // inside vault.read()'s `await gate`.
        const modelPromise = entity!.model();

        // The invalidation lands WHILE the read is in flight.
        vault.emit("modify", fakeTFile(GOBLIN_PATH));
        gate.release();

        const firstModel = await modelPromise;
        expect(firstModel).toBeDefined();

        // The race means the result must NOT have been cached -- a second call re-reads
        // (a new object instance), rather than silently reintroducing the stale read.
        const secondModel = await entity!.model();
        expect(secondModel).not.toBe(firstModel);
    });

    test("getStatblock routes through the shared getEntity().model() path -- no duplicate parse", async () => {
        const { index, vault } = setup();
        const readSpy = jest.spyOn(vault, "read");

        // Warm the shared cache via getEntity().model() first.
        const entity = await index.getEntity(GOBLIN);
        await entity!.model();
        expect(readSpy).toHaveBeenCalledTimes(1);

        // getStatblock for the SAME code must hit the same cache, not re-read/re-parse.
        const sb = await index.getStatblock(GOBLIN);
        expect(sb!.name).toBe("Goblin Stinker");
        expect(readSpy).toHaveBeenCalledTimes(1); // unchanged -- no duplicate parse
    });

    test("getStatblock returns null for a non-statblock code without reading the file", async () => {
        const { index, vault } = setup();
        const readSpy = jest.spyOn(vault, "read");
        expect(await index.getStatblock(KIT)).toBeNull();
        expect(readSpy).not.toHaveBeenCalled();
    });
});
