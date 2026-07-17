import { ReferenceResolver } from "@utils/ReferenceResolver";
import { DEFAULT_SETTINGS } from "@model/Settings";
import { makeFakeApp } from "../../fakes/fakeObsidian";

const GOBLIN_CODE = "mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker";

/** Post-OD-1(A) md-dse statblock shape: frontmatter + ds-sb block (F2 §3.3). */
const DS_SB_FILE = `---
scc: ${GOBLIN_CODE}
type: statblock
---

\`\`\`ds-sb
name: Goblin Stinker
level: 1
role: Controller
organization: Horde
keywords:
  - Goblin
  - Humanoid
ev: "3"
\`\`\`
`;

function setup() {
    const { app, vault, metadataCache } = makeFakeApp();
    const settings = { ...DEFAULT_SETTINGS };
    return { app, vault, metadataCache, settings, resolver: new ReferenceResolver(app, settings) };
}

describe("ReferenceResolver scc branch (F2 §4.3c)", () => {
    test("scc.v1: reference resolves to the file's ds-* block YAML", async () => {
        const { vault, metadataCache, resolver } = setup();
        vault.setText("DS Compendium/monster/goblin/statblock/goblin-stinker.md", DS_SB_FILE);
        metadataCache.frontmatter.set(
            "DS Compendium/monster/goblin/statblock/goblin-stinker.md",
            { scc: GOBLIN_CODE, type: "statblock" });
        const data = await resolveString(resolver, `scc.v1:${GOBLIN_CODE}`);
        expect(data.name).toBe("Goblin Stinker");
        expect(data.role).toBe("Controller");
        expect(data.organization).toBe("Horde");
    });

    test("bare scc: prefix works identically", async () => {
        const { vault, resolver } = setup();
        vault.setText("DS Compendium/monster/goblin/statblock/goblin-stinker.md", DS_SB_FILE);
        const data = await resolveString(resolver, `scc:${GOBLIN_CODE}`);
        expect(data.name).toBe("Goblin Stinker");
    });

    test("scc miss throws an actionable error (not the legacy wall of text)", async () => {
        const { resolver } = setup();
        await expect(resolveString(resolver, "scc.v1:mcdm.monsters.v1/monster/nope"))
            .rejects.toThrow(/SCC reference .* could not be resolved .* Sync the compendium/);
    });

    test("target file without a ds-* block names the file and its frontmatter type", async () => {
        const { vault, metadataCache, resolver } = setup();
        // NOTE: the on-disk goblin-stinker.md fixture now carries a ds-sb block (OD-1(A)
        // landed after this brief was written — see f2-execution-notes.md delta #1), so it
        // can no longer stand in for a "not yet re-synced" file. Hand-author that shape
        // instead: frontmatter (with `type`) but no ds-* block, e.g. a stale pre-OD-1 sync.
        const NO_BLOCK_FILE = `---\nscc: ${GOBLIN_CODE}\ntype: statblock\n---\n\nGoblin Stinker (plain rendered markdown, no ds-sb block).\n`;
        vault.setText("DS Compendium/monster/goblin/statblock/goblin-stinker.md", NO_BLOCK_FILE);
        metadataCache.frontmatter.set(
            "DS Compendium/monster/goblin/statblock/goblin-stinker.md",
            { scc: GOBLIN_CODE, type: "statblock" });
        await expect(resolveString(resolver, `scc.v1:${GOBLIN_CODE}`))
            .rejects.toThrow(/goblin-stinker\.md.*frontmatter type: statblock/);
    });

    test("legacy @path and nested-object walking are unchanged", async () => {
        const { vault, resolver } = setup();
        vault.setText("Creatures/goblin.md", DS_SB_FILE);
        const resolved = await resolver.resolveReferences(
            { creature: { statblock: "@Creatures/goblin" } });
        expect(resolved.creature.statblock.name).toBe("Goblin Stinker");
    });
});

async function resolveString(resolver: ReferenceResolver, ref: string): Promise<any> {
    return await resolver.resolveReferences(ref);
}
