import * as path from "path";
import { SccResolver } from "@/refs/SccResolver";
import { DEFAULT_SETTINGS, DSESettings } from "@model/Settings";
import { makeFakeApp, loadFixtureIntoVault, fakeTFile } from "../../fakes/fakeObsidian";

const FIXTURES = path.join(__dirname, "../../fixtures/md-dse");
const GOBLIN_CODE = "mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker";
const TURN_CODE = "mcdm.heroes.v1/rule.combat/turn";

function setup(settingsOverride: Partial<DSESettings> = {}) {
    const { app, vault, metadataCache } = makeFakeApp();
    const settings: DSESettings = { ...DEFAULT_SETTINGS, ...settingsOverride };
    loadFixtureIntoVault(vault, metadataCache,
        path.join(FIXTURES, "monster/goblin/statblock/goblin-stinker.md"),
        "DS Compendium/monster/goblin/statblock/goblin-stinker.md");
    loadFixtureIntoVault(vault, metadataCache,
        path.join(FIXTURES, "rule/combat/turn.md"),
        "DS Compendium/rule/combat/turn.md");
    return { app, vault, metadataCache, settings, resolver: new SccResolver(app, settings) };
}

describe("SccResolver resolution order (F2 §4.2)", () => {
    test("1. path derivation: freshly synced compendium resolves O(1)", () => {
        const { resolver } = setup();
        const result = resolver.resolve(`scc.v1:${GOBLIN_CODE}`);
        expect(result).toEqual({
            kind: "vault",
            file: expect.objectContaining({ path: "DS Compendium/monster/goblin/statblock/goblin-stinker.md" }),
            linkpath: "DS Compendium/monster/goblin/statblock/goblin-stinker.md",
        });
    });

    test("bare scc: prefix and #format fragment behave identically", () => {
        const { resolver } = setup();
        expect(resolver.resolve(`scc:${TURN_CODE}`).kind).toBe("vault");
        expect(resolver.resolve(`scc.v1:${TURN_CODE}#json`).kind).toBe("vault");
    });

    test("2. frontmatter index: a moved compendium file still resolves by code", () => {
        const { app, vault, metadataCache, settings } = setup();
        // Simulate the user moving the note out of the derived location.
        const content = vault.text("DS Compendium/rule/combat/turn.md")!;
        vault.files.delete("DS Compendium/rule/combat/turn.md");
        vault.setText("My Notes/moved-turn.md", content);
        metadataCache.frontmatter.delete("DS Compendium/rule/combat/turn.md");
        metadataCache.frontmatter.set("My Notes/moved-turn.md", { scc: TURN_CODE });
        const resolver = new SccResolver(app, settings);
        const result = resolver.resolve(`scc.v1:${TURN_CODE}`);
        expect(result.kind).toBe("vault");
        expect((result as any).linkpath).toBe("My Notes/moved-turn.md");
    });

    test("index also catches homebrew declaring an scc identity", () => {
        const { app, vault, metadataCache, settings } = setup();
        vault.setText("Homebrew/my-goblin.md", "---\nscc: homebrew.mine.v1/monster/my-goblin\n---\nhi");
        metadataCache.frontmatter.set("Homebrew/my-goblin.md", { scc: "homebrew.mine.v1/monster/my-goblin" });
        const resolver = new SccResolver(app, settings);
        expect(resolver.resolve("scc:homebrew.mine.v1/monster/my-goblin").kind).toBe("vault");
    });

    test("3. web fallback when code is locally missing (toggle on, default)", () => {
        const { resolver } = setup();
        expect(resolver.resolve("scc.v1:mcdm.heroes.v1/class/shadow")).toEqual({
            kind: "web",
            url: "https://steelcompendium.io/scc/mcdm.heroes.v1/class/shadow/",
        });
    });

    test("4. unresolved when web fallback is off", () => {
        const { resolver } = setup({ sccWebFallback: false });
        expect(resolver.resolve("scc.v1:mcdm.heroes.v1/class/shadow")).toEqual({
            kind: "unresolved", code: "mcdm.heroes.v1/class/shadow",
        });
    });

    test("future scheme version is unresolved even when the item exists locally", () => {
        const { resolver } = setup();
        expect(resolver.resolve(`scc.v2:${GOBLIN_CODE}`).kind).toBe("unresolved");
    });

    test("index maintenance: delete + rename handlers keep codes resolving", () => {
        const { app, vault, metadataCache, settings } = setup();
        const resolver = new SccResolver(app, settings);
        // Seed the index (first miss-path resolve touches it).
        resolver.resolve("scc:not.a.real.v1/thing/x");
        // Rename: move the goblin file, update the cache, notify the resolver.
        const oldPath = "DS Compendium/monster/goblin/statblock/goblin-stinker.md";
        const newPath = "Elsewhere/goblin.md";
        const content = vault.text(oldPath)!;
        vault.files.delete(oldPath);
        vault.setText(newPath, content);
        const fm = metadataCache.frontmatter.get(oldPath)!;
        metadataCache.frontmatter.delete(oldPath);
        metadataCache.frontmatter.set(newPath, fm);
        resolver.handleRename(fakeTFile(newPath), oldPath);
        const result = resolver.resolve(`scc.v1:${GOBLIN_CODE}`);
        expect(result.kind).toBe("vault");
        expect((result as any).linkpath).toBe(newPath);
        // Delete: notify, and the code now falls through to web.
        vault.files.delete(newPath);
        metadataCache.frontmatter.delete(newPath);
        resolver.handleDelete(fakeTFile(newPath));
        expect(resolver.resolve(`scc.v1:${GOBLIN_CODE}`).kind).toBe("web");
    });

    test("handleChanged: a changed scc frontmatter value re-indexes the file under its new code", () => {
        const { app, vault, metadataCache, settings } = setup();
        // Move the turn note out of its derived path so resolution depends on the index.
        const content = vault.text("DS Compendium/rule/combat/turn.md")!;
        vault.files.delete("DS Compendium/rule/combat/turn.md");
        vault.setText("My Notes/moved-turn.md", content);
        metadataCache.frontmatter.delete("DS Compendium/rule/combat/turn.md");
        metadataCache.frontmatter.set("My Notes/moved-turn.md", { scc: TURN_CODE });
        const resolver = new SccResolver(app, settings);
        // Seed the index and confirm the old code resolves via it first.
        expect(resolver.resolve(`scc.v1:${TURN_CODE}`).kind).toBe("vault");

        // Now the user edits the note's frontmatter to declare a different scc code.
        const NEW_CODE = "homebrew.mine.v1/rule/renamed-turn";
        metadataCache.frontmatter.set("My Notes/moved-turn.md", { scc: NEW_CODE });
        resolver.handleChanged(fakeTFile("My Notes/moved-turn.md"));

        // The old code no longer resolves via the index (falls through to web).
        expect(resolver.resolve(`scc.v1:${TURN_CODE}`).kind).toBe("web");
        // The new code resolves to the same file.
        const result = resolver.resolve(`scc.v1:${NEW_CODE}`);
        expect(result.kind).toBe("vault");
        expect((result as any).linkpath).toBe("My Notes/moved-turn.md");
    });

    test("handleChanged: scc frontmatter removed entirely evicts the file from the index", () => {
        const { app, vault, metadataCache, settings } = setup();
        const content = vault.text("DS Compendium/rule/combat/turn.md")!;
        vault.files.delete("DS Compendium/rule/combat/turn.md");
        vault.setText("My Notes/moved-turn.md", content);
        metadataCache.frontmatter.delete("DS Compendium/rule/combat/turn.md");
        metadataCache.frontmatter.set("My Notes/moved-turn.md", { scc: TURN_CODE });
        const resolver = new SccResolver(app, settings);
        expect(resolver.resolve(`scc.v1:${TURN_CODE}`).kind).toBe("vault");

        // The user strips the scc frontmatter key entirely.
        metadataCache.frontmatter.set("My Notes/moved-turn.md", {});
        resolver.handleChanged(fakeTFile("My Notes/moved-turn.md"));

        expect(resolver.resolve(`scc.v1:${TURN_CODE}`).kind).toBe("web");
    });

    test("a folder sitting at the derived path is a miss, not a false vault resolution", () => {
        const { app, vault, settings } = setup();
        // GOBLIN_CODE derives to "DS Compendium/monster/goblin/statblock/goblin-stinker.md".
        // Delete the real file and put an (empty) folder at that exact path instead.
        const derivedPath = "DS Compendium/monster/goblin/statblock/goblin-stinker.md";
        vault.files.delete(derivedPath);
        vault.folders.add(derivedPath);
        const resolver = new SccResolver(app, settings);
        // Falls through path-derivation (folder, not TFile) and the index (never indexed),
        // landing on the web fallback rather than incorrectly resolving to the folder.
        expect(resolver.resolve(`scc.v1:${GOBLIN_CODE}`)).toEqual({
            kind: "web",
            url: `https://steelcompendium.io/scc/${GOBLIN_CODE}/`,
        });
    });
});
