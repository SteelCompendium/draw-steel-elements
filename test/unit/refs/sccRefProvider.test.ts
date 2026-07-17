import { SccRefProvider } from "@/refs/SccRefProvider";
import { SccResolver } from "@/refs/SccResolver";
import { DEFAULT_SETTINGS } from "@model/Settings";
import { makeFakeApp } from "../../fakes/fakeObsidian";

const GOBLIN_CODE = "mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker";
const DS_SB_FILE = `---
scc: ${GOBLIN_CODE}
type: statblock
---

\`\`\`ds-sb
name: Goblin Stinker
role: Controller
organization: Horde
\`\`\`
`;

function setup() {
    const { app, vault } = makeFakeApp();
    const settings = { ...DEFAULT_SETTINGS };
    const provider = new SccRefProvider(app, new SccResolver(app, settings));
    return { app, vault, provider };
}

describe("SccRefProvider (F1 §3.7 seam, F2 §4.4)", () => {
    test("kind and canResolve claim every scc-prefixed string (incl. future versions)", () => {
        const { provider } = setup();
        expect(provider.kind).toBe("scc");
        expect(provider.canResolve(`scc.v1:${GOBLIN_CODE}`)).toBe(true);
        expect(provider.canResolve(`scc:${GOBLIN_CODE}`)).toBe(true);
        expect(provider.canResolve(`scc.v2:${GOBLIN_CODE}`)).toBe(true); // claimed, then refused in resolve()
        expect(provider.canResolve("@Creatures/Goblin")).toBe(false);
        expect(provider.canResolve("[[Thorn Dragon]]")).toBe(false);
    });

    test("resolve returns data + file + bare scc identity", async () => {
        const { vault, provider } = setup();
        vault.setText("DS Compendium/monster/goblin/statblock/goblin-stinker.md", DS_SB_FILE);
        const resolved = await provider.resolve({
            raw: `scc.v1:${GOBLIN_CODE}`, kind: "scc", sourcePath: "Encounters/session1.md" });
        expect((resolved.data as any).name).toBe("Goblin Stinker");
        expect(resolved.file?.path).toBe("DS Compendium/monster/goblin/statblock/goblin-stinker.md");
        expect(resolved.scc).toBe(GOBLIN_CODE); // bare identity — prefix is reference form, not identity
    });

    test("non-vault resolutions throw (error card message upstream)", async () => {
        const { provider } = setup();
        await expect(provider.resolve({
            raw: "scc.v1:mcdm.heroes.v1/class/shadow", kind: "scc", sourcePath: "x.md" }))
            .rejects.toThrow(/not available in this vault/);
        await expect(provider.resolve({
            raw: `scc.v2:${GOBLIN_CODE}`, kind: "scc", sourcePath: "x.md" }))
            .rejects.toThrow(/scc\.v2/);
    });
});
