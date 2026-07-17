import { CompendiumManifest, ManifestStore, MANIFEST_SCHEMA_VERSION, sha256Hex } from "@/data/manifest";
import { makeFakeApp } from "../../fakes/fakeObsidian";

const MANIFEST_PATH = ".obsidian/plugins/draw-steel-elements/compendium-manifest.json";

function sampleManifest(): CompendiumManifest {
    return {
        schemaVersion: MANIFEST_SCHEMA_VERSION,
        source: "SteelCompendium/data-unified",
        releaseTag: "v4.20260701T120000",
        locale: "en",
        format: "md-dse",
        root: "DS Compendium",
        syncedAt: "2026-07-01T12:00:00.000Z",
        files: { "class/shadow.md": "ab".repeat(32) },
    };
}

describe("sha256Hex", () => {
    test("matches a known SHA-256 vector", async () => {
        // sha256("abc")
        expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    });
    test("accepts ArrayBuffer and subarray views identically", async () => {
        const bytes = new TextEncoder().encode("xxabcxx").subarray(2, 5); // view onto "abc"
        expect(await sha256Hex(bytes)).toBe(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    });
});

describe("ManifestStore", () => {
    test("load returns null when no manifest exists", async () => {
        const { app } = makeFakeApp();
        expect(await new ManifestStore(app, "draw-steel-elements").load()).toBeNull();
    });

    test("save + load round-trips, atomically (no .tmp left behind)", async () => {
        const { app, vault } = makeFakeApp();
        const store = new ManifestStore(app, "draw-steel-elements");
        await store.save(sampleManifest());
        expect(await store.load()).toEqual(sampleManifest());
        expect(vault.adapter.store.has(MANIFEST_PATH)).toBe(true);
        expect(vault.adapter.store.has(MANIFEST_PATH + ".tmp")).toBe(false);
    });

    test("save overwrites an existing manifest", async () => {
        const { app } = makeFakeApp();
        const store = new ManifestStore(app, "draw-steel-elements");
        await store.save(sampleManifest());
        const second = { ...sampleManifest(), releaseTag: "v4.20260702T000000" };
        await store.save(second);
        expect((await store.load())!.releaseTag).toBe("v4.20260702T000000");
    });

    test("corrupt or wrong-schema manifests load as null (fail SAFE = unmanaged)", async () => {
        const { app, vault } = makeFakeApp();
        const store = new ManifestStore(app, "draw-steel-elements");
        vault.adapter.store.set(MANIFEST_PATH, "{not json");
        expect(await store.load()).toBeNull();
        vault.adapter.store.set(MANIFEST_PATH, JSON.stringify({ schemaVersion: 99 }));
        expect(await store.load()).toBeNull();
    });
});
