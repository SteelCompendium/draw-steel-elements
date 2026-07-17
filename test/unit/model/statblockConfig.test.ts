import { StatblockConfig, applyLegacyStatblockKeys } from "@model/StatblockConfig";

describe("OD-4 legacy ds-sb key shim", () => {
    let warnSpy: jest.SpyInstance;
    beforeEach(() => { warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {}); });
    afterEach(() => { warnSpy.mockRestore(); });

    test("legacy roles/ancestry still parse, with a deprecation warning", () => {
        const legacyYaml = [
            "name: Old Homebrew Goblin",
            "level: 1",
            "roles:",
            "  - Horde",
            "  - Controller",
            "ancestry:",
            "  - Goblin",
            "  - Humanoid",
            "ev: \"3\"",
        ].join("\n");
        const config = StatblockConfig.readYaml(legacyYaml);
        expect(config.statblock.organization).toBe("Horde");
        expect(config.statblock.role).toBe("Controller");
        expect(config.statblock.keywords).toEqual(["Goblin", "Humanoid"]);
        expect((config.statblock as any).roles).toBeUndefined();
        expect((config.statblock as any).ancestry).toBeUndefined();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("deprecated"));
    });

    test("classification matches the SDK organization-name set", () => {
        expect(applyLegacyStatblockKeys({ roles: ["Solo"] }))
            .toMatchObject({ organization: "Solo", role: "" });
        expect(applyLegacyStatblockKeys({ roles: ["Ambusher"] }))
            .toMatchObject({ organization: "", role: "Ambusher" });
        expect(applyLegacyStatblockKeys({ roles: ["minion", "Hexer"] }))
            .toMatchObject({ organization: "minion", role: "Hexer" });
    });

    test("modern keys pass through untouched, no warning", () => {
        const modern = { name: "X", role: "Controller", organization: "Horde", keywords: ["Goblin"] };
        expect(applyLegacyStatblockKeys({ ...modern })).toEqual(modern);
        const config = StatblockConfig.readYaml(
            "name: X\nrole: Controller\norganization: Horde\nkeywords:\n  - Goblin");
        expect(config.statblock.role).toBe("Controller");
        expect(warnSpy).not.toHaveBeenCalled();
    });

    test("modern keys win when both are present (legacy key ignored per-axis)", () => {
        const out = applyLegacyStatblockKeys({ role: "Controller", roles: ["Solo"], ancestry: ["Goblin"] });
        expect(out.role).toBe("Controller");
        expect(out.roles).toBeUndefined();
        expect(out.keywords).toEqual(["Goblin"]);
    });

    // F1 fix-round-1: classification must mirror the SDK MarkdownStatblockReader's
    // last-wins-per-axis loop (data-sdk-npm/src/io/markdown/MarkdownStatblockReader.ts:130-141),
    // not accumulate-and-join, for lists with more than one entry on the same axis.
    test("multi-entry same-axis lists: last entry wins per axis (matches SDK reader)", () => {
        expect(applyLegacyStatblockKeys({ roles: ["Horde", "Elite"] }))
            .toMatchObject({ organization: "Elite", role: "" });
        expect(applyLegacyStatblockKeys({ roles: ["Controller", "Ambusher"] }))
            .toMatchObject({ organization: "", role: "Ambusher" });
    });

    // F3 fix-round-1: a malformed non-array legacy key (bare scalar) must not silently
    // drop the author's data — coerce to a one-entry list before classification.
    test("scalar (non-array) legacy roles is coerced to a one-entry list, not dropped", () => {
        expect(applyLegacyStatblockKeys({ roles: "Horde" }))
            .toMatchObject({ organization: "Horde", role: "" });
        const config = StatblockConfig.readYaml("name: X\nlevel: 1\nroles: Horde\nev: \"3\"");
        expect(config.statblock.organization).toBe("Horde");
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("deprecated"));
    });

    test("scalar (non-array) legacy ancestry is coerced to a one-entry list, not dropped", () => {
        expect(applyLegacyStatblockKeys({ ancestry: "Goblin" }))
            .toMatchObject({ keywords: ["Goblin"] });
    });
});
