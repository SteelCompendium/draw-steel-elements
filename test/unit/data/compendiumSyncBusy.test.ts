// SC-243 — the compendium sync/check-for-updates busy lock: CompendiumSyncService's
// in-flight state (O1), the correctness guard that refuses a second concurrent run
// rather than just disabling a button (O3/B3), and the re-entrant token that lets
// main.syncCompendium hold the lock across its own prelude without `sync()` refusing
// itself (B3's "no self-deadlock/self-refusal" requirement). main.syncCompendium's own
// use of the lock is exercised in test/dom/framework (wherever the plugin-level
// onload/syncCompendium tests live) — this file is the service's own contract, unit
// (network-free, injected `requestUrlFn`) only.
import { zipSync, strToU8 } from "fflate";
import { Notice } from "../../mocks/obsidian";
import { CompendiumSyncService, SyncOptions, SYNC_BUSY_NOTICE } from "@/data/CompendiumSyncService";
import { ManifestStore } from "@/data/manifest";
import { makeFakeApp } from "../../fakes/fakeObsidian";

const OPTIONS: SyncOptions = { root: "DS Compendium", locale: "en" };

async function zipOf(entries: Record<string, string>): Promise<ArrayBuffer> {
	const files: Record<string, Uint8Array> = {};
	for (const [p, content] of Object.entries(entries)) files[p] = strToU8(content);
	const zipped = zipSync(files);
	return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
}

/** A fetchFake whose ASSET download (the second request) pauses on a promise the test
 *  controls — the standard way this suite simulates "a sync is genuinely in flight"
 *  without a real network (mirrors the brief's own evidence-script approach of stubbing
 *  the download to a never-resolving promise, but resolvable here so tests finish). */
function githubFakeGatedOnAsset(zipBuffer: ArrayBuffer, tag = "v4.gated") {
	let releaseAsset = { name: "md-dse-unified-en.zip", url: "https://api.github.com/assets/1" };
	let resolveAsset: (() => void) | null = null;
	const assetGate = new Promise<void>((resolve) => { resolveAsset = resolve; });
	const fetchFake = jest.fn(async (params: any) => {
		if (params.url.includes("/releases/")) {
			return {
				status: 200,
				json: { tag_name: tag, assets: [releaseAsset] },
				arrayBuffer: new ArrayBuffer(0), text: "",
			} as any;
		}
		await assetGate;
		return { status: 200, json: null, arrayBuffer: zipBuffer, text: "" } as any;
	});
	return { fetchFake, releaseUrl: releaseAsset.url, release: () => resolveAsset?.() };
}

/** A metadata fetchFake that pauses on a promise the test controls — used to simulate a
 *  genuinely in-flight checkForUpdates() call. */
function githubFakeGatedOnMetadata(tag = "v4.gated") {
	let resolveGate: (() => void) | null = null;
	const gate = new Promise<void>((resolve) => { resolveGate = resolve; });
	const fetchFake = jest.fn(async (params: any) => {
		await gate;
		return {
			status: 200,
			json: { tag_name: tag, assets: [{ name: "md-dse-unified-en.zip", url: "https://api.github.com/assets/1" }] },
			arrayBuffer: new ArrayBuffer(0), text: "",
		} as any;
	});
	return { fetchFake, release: () => resolveGate?.() };
}

function setup() {
	const { app } = makeFakeApp();
	const store = new ManifestStore(app, "draw-steel-elements");
	return { app, store };
}

describe("SC-243 — CompendiumSyncService busy lock", () => {
	beforeEach(() => {
		Notice.notices.length = 0;
	});

	test("idle by default: not busy, no in-flight kind", () => {
		const { app, store } = setup();
		const service = new CompendiumSyncService(app, store);
		expect(service.isBusy()).toBe(false);
		expect(service.currentBusy()).toBeNull();
	});

	test("beginOperation acquires the lock and reports its kind; a second acquire while held is refused; endOperation releases it", () => {
		const { app, store } = setup();
		const service = new CompendiumSyncService(app, store);

		const token = service.beginOperation("sync");
		expect(token).not.toBeNull();
		expect(service.isBusy()).toBe(true);
		expect(service.currentBusy()).toBe("sync");

		// O3: ANY kind is refused while ANY operation is held, not just the same kind.
		expect(service.beginOperation("sync")).toBeNull();
		expect(service.beginOperation("check")).toBeNull();

		service.endOperation(token!);
		expect(service.isBusy()).toBe(false);
		expect(service.currentBusy()).toBeNull();

		// The lock is reusable once released.
		const second = service.beginOperation("check");
		expect(second).not.toBeNull();
		expect(service.currentBusy()).toBe("check");
	});

	test("endOperation with a stale/foreign token is a harmless no-op — only the current holder's token clears the lock", () => {
		const { app, store } = setup();
		const service = new CompendiumSyncService(app, store);
		const token = service.beginOperation("sync");
		const foreign = Symbol("not the real token");
		service.endOperation(foreign);
		expect(service.isBusy()).toBe(true); // still held
		service.endOperation(token!);
		expect(service.isBusy()).toBe(false);
	});

	test("onBusyChange fires the kind on acquire and null on release; unsubscribe stops further notifications", () => {
		const { app, store } = setup();
		const service = new CompendiumSyncService(app, store);
		const seen: (string | null)[] = [];
		const unsubscribe = service.onBusyChange((kind) => seen.push(kind));

		const token = service.beginOperation("sync");
		expect(seen).toEqual(["sync"]);
		service.endOperation(token!);
		expect(seen).toEqual(["sync", null]);

		unsubscribe();
		service.beginOperation("check");
		expect(seen).toEqual(["sync", null]); // no third entry after unsubscribe
	});

	test("B3: a second bare sync() while one is genuinely in flight does NOT start a second run — exact-wording Notice, no second asset fetch, first run completes normally", async () => {
		const { app, store } = setup();
		const zip = await zipOf({ "a.md": "content" });
		const { fetchFake, release } = githubFakeGatedOnAsset(zip);
		const service = new CompendiumSyncService(app, store, fetchFake);

		Notice.notices.length = 0;
		const first = service.sync(OPTIONS); // pauses mid-flight on the asset download
		await Promise.resolve(); // let the release-metadata fetch resolve and beginOperation land
		await Promise.resolve();
		expect(service.isBusy()).toBe(true);

		const second = await service.sync(OPTIONS);
		expect(second).toBeNull(); // refused — no second run
		expect(Notice.notices).toContain(SYNC_BUSY_NOTICE);
		// Only ONE asset-download request happened (the second call never reached it).
		const assetCalls = fetchFake.mock.calls.filter((c) => !c[0].url.includes("/releases/"));
		expect(assetCalls).toHaveLength(1);

		release();
		const firstReport = await first;
		expect(firstReport).not.toBeNull();
		expect(firstReport!.created).toEqual(["a.md"]);
		expect(service.isBusy()).toBe(false); // cleared after the surviving run finishes
	});

	test("busy clears on a thrown sync error, not just on success", async () => {
		const { app, store } = setup();
		const fetchFake = jest.fn(async () => ({ status: 403, json: null, arrayBuffer: new ArrayBuffer(0), text: "" } as any));
		const service = new CompendiumSyncService(app, store, fetchFake);

		await expect(service.sync(OPTIONS)).rejects.toThrow(/HTTP 403/);
		expect(service.isBusy()).toBe(false);
		expect(service.currentBusy()).toBeNull();

		// The lock is usable again immediately — a failed run doesn't wedge it.
		expect(service.beginOperation("sync")).not.toBeNull();
	});

	test("B3's no-self-refusal path: sync(options, heldToken) runs under a token the caller already holds, without acquiring a second one or releasing it itself", async () => {
		const { app, store } = setup();
		const zip = await zipOf({ "a.md": "content" });
		const fetchFake = jest.fn(async (params: any) => {
			if (params.url.includes("/releases/")) {
				return { status: 200, json: { tag_name: "v4.held", assets: [{ name: "md-dse-unified-en.zip", url: "https://api.github.com/assets/1" }] }, arrayBuffer: new ArrayBuffer(0), text: "" } as any;
			}
			return { status: 200, json: null, arrayBuffer: zip, text: "" } as any;
		});
		const service = new CompendiumSyncService(app, store, fetchFake);

		// Mirrors main.syncCompendium: acquire BEFORE any prelude work, then hand the
		// same token into sync() — this must NOT be refused by sync()'s own guard.
		const token = service.beginOperation("sync");
		expect(token).not.toBeNull();

		const report = await service.sync(OPTIONS, token!);
		expect(report).not.toBeNull();
		expect(report!.created).toEqual(["a.md"]);

		// sync() did not release a token it did not acquire — the caller still owns it.
		expect(service.isBusy()).toBe(true);
		service.endOperation(token!);
		expect(service.isBusy()).toBe(false);
	});

	// SC-243 fix round 1 (review L2, probe P10): `heldToken ?? beginOperation(...)` used
	// to trust ANY defined token unconditionally — nullish coalescing only falls through
	// on null/undefined, so even a stale (already-released) or outright foreign token
	// skipped the guard entirely and ran a completely unguarded sync, including while a
	// DIFFERENT operation genuinely held the lock. `sync` now checks `heldToken ===
	// this.busyToken` before trusting it.
	test("L2: a stale or foreign heldToken is refused, not trusted unconditionally — no unguarded run while a different operation holds the lock", async () => {
		const { app, store } = setup();
		const fetchFake = jest.fn(async () => ({
			status: 200,
			json: { tag_name: "v4.x", assets: [{ name: "md-dse-unified-en.zip", url: "https://api.github.com/assets/1" }] },
			arrayBuffer: new ArrayBuffer(0), text: "",
		} as any));
		const service = new CompendiumSyncService(app, store, fetchFake);

		const staleToken = service.beginOperation("sync");
		expect(staleToken).not.toBeNull();
		service.endOperation(staleToken!); // released — now stale, held by no one

		// A genuinely different operation holds the lock.
		const checkToken = service.beginOperation("check");
		expect(checkToken).not.toBeNull();

		Notice.notices.length = 0;
		const result = await service.sync(OPTIONS, staleToken!);
		expect(result).toBeNull(); // refused — NOT run unguarded
		expect(Notice.notices).toContain(SYNC_BUSY_NOTICE);
		expect(fetchFake).not.toHaveBeenCalled(); // never reached the network at all
		expect(service.currentBusy()).toBe("check"); // the real holder is undisturbed

		service.endOperation(checkToken!);
	});

	test("checkForUpdates: guarded the same way — refused (Notice, null, no request made) while a sync is in flight; releases its own lock on completion", async () => {
		const { app, store } = setup();
		const zip = await zipOf({ "a.md": "content" });
		const { fetchFake, release } = githubFakeGatedOnAsset(zip);
		const service = new CompendiumSyncService(app, store, fetchFake);

		const syncPromise = service.sync(OPTIONS);
		await Promise.resolve();
		await Promise.resolve();
		expect(service.isBusy()).toBe(true);

		Notice.notices.length = 0;
		const result = await service.checkForUpdates();
		expect(result).toBeNull();
		expect(Notice.notices.some((n) => /already running/i.test(n))).toBe(true);

		// Let the in-flight sync finish so the test doesn't leak a pending promise.
		release();
		await syncPromise;
		expect(service.isBusy()).toBe(false);
	});

	test("checkForUpdates: succeeds when idle, toggling busy 'check' -> null around the call, and refuses a bare sync() started while IT is in flight", async () => {
		const { app, store } = setup();
		const { fetchFake, release } = githubFakeGatedOnMetadata("v4.check");
		const service = new CompendiumSyncService(app, store, fetchFake);

		const seen: (string | null)[] = [];
		service.onBusyChange((kind) => seen.push(kind));

		const checkPromise = service.checkForUpdates();
		await Promise.resolve();
		expect(service.currentBusy()).toBe("check");

		Notice.notices.length = 0;
		const refusedSync = await service.sync(OPTIONS);
		expect(refusedSync).toBeNull();
		expect(Notice.notices).toContain(SYNC_BUSY_NOTICE);

		release();
		const result = await checkPromise;
		expect(result).toEqual({ installedTag: null, latestTag: "v4.check", upToDate: false });
		expect(service.isBusy()).toBe(false);
		expect(seen).toEqual(["check", null]);
	});
});
