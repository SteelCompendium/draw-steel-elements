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

// —— SC-140: the manifest is OBSERVABLE, so a view showing it can stay current ——
describe("ManifestStore.onChange", () => {
    test("save notifies subscribers with the manifest it wrote", async () => {
        const { app } = makeFakeApp();
        const store = new ManifestStore(app, "draw-steel-elements");
        const seen: (CompendiumManifest | null)[] = [];
        store.onChange((manifest) => seen.push(manifest));
        await store.save(sampleManifest());
        expect(seen).toEqual([sampleManifest()]);
        // …and the notification comes AFTER the write landed — a subscriber that repaints
        // must never show a manifest the disk does not have.
        expect(await store.load()).toEqual(sampleManifest());
    });

    test("the returned unsubscribe stops further notifications", async () => {
        const { app } = makeFakeApp();
        const store = new ManifestStore(app, "draw-steel-elements");
        const listener = jest.fn();
        const unsubscribe = store.onChange(listener);
        await store.save(sampleManifest());
        unsubscribe();
        await store.save({ ...sampleManifest(), releaseTag: "v4.later" });
        expect(listener).toHaveBeenCalledTimes(1);
    });

    test("a throwing listener neither fails the save nor robs its fellows", async () => {
        const { app } = makeFakeApp();
        const store = new ManifestStore(app, "draw-steel-elements");
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        const survivor = jest.fn();
        store.onChange(() => { throw new Error("listener blew up"); });
        store.onChange(survivor);
        await expect(store.save(sampleManifest())).resolves.toBeUndefined();
        expect(survivor).toHaveBeenCalledTimes(1);
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });
});
