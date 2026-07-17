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
});
