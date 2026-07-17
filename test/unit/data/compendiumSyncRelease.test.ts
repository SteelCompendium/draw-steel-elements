// F2 Task 10 — the network half of CompendiumSyncService: release metadata fetch
// (requestUrl, migrated off the legacy request()), asset download, JSZip extraction
// into the incoming-set map, and orchestration into applySync (Task 9). Unit-only
// (node project): every network call flows through the injected `requestUrlFn`
// (Task 9's forward-compat ctor param) — jest never touches a real network.
import JSZip from "jszip";
import * as fs from "fs";
import * as path from "path";
// Notice.notices (mock-only static introspection field) isn't on the real obsidian
// npm package's ambient types (tsc — unlike ts-jest's moduleNameMapper — resolves
// bare `obsidian` imports against the REAL package); import the mock directly, same
// convention as test/dom/framework/plugin-wiring.test.ts.
import { Notice } from "../../mocks/obsidian";
import { CompendiumSyncService, SyncOptions, COMPENDIUM_SOURCE, COMPENDIUM_FORMAT } from "@/data/CompendiumSyncService";
import { ManifestStore } from "@/data/manifest";
import { makeFakeApp } from "../../fakes/fakeObsidian";

const OPTIONS: SyncOptions = { root: "DS Compendium", locale: "en" };

async function zipOf(entries: Record<string, string>): Promise<ArrayBuffer> {
	const zip = new JSZip();
	for (const [p, content] of Object.entries(entries)) zip.file(p, content);
	return await zip.generateAsync({ type: "arraybuffer" });
}

function githubFake(zipBuffer: ArrayBuffer, tag = "v4.20260701T120000") {
	const releaseJson = {
		tag_name: tag,
		assets: [
			{ name: "md-dse-unified-en.zip", url: "https://api.github.com/assets/1" },
			{ name: "other.zip", url: "https://api.github.com/assets/2" },
		],
	};
	return jest.fn(async (params: any) => {
		if (params.url.includes("/releases/")) {
			return { status: 200, json: releaseJson, arrayBuffer: new ArrayBuffer(0), text: "" } as any;
		}
		if (params.url === "https://api.github.com/assets/1") {
			return { status: 200, json: null, arrayBuffer: zipBuffer, text: "" } as any;
		}
		return { status: 404, json: null, arrayBuffer: new ArrayBuffer(0), text: "" } as any;
	});
}

describe("CompendiumSyncService.sync (release download path)", () => {
	test("repo constants point at the data-unified release contract", () => {
		expect(COMPENDIUM_SOURCE).toBe("SteelCompendium/data-unified");
		expect(COMPENDIUM_FORMAT).toBe("md-dse");
	});

	test("latest release: fetch -> unzip -> applySync -> report + manifest", async () => {
		const { app, vault } = makeFakeApp();
		const zip = await zipOf({ "rule/combat/turn.md": "turn!", "class/shadow.md": "shadow!" });
		const fetchFake = githubFake(zip);
		const store = new ManifestStore(app, "draw-steel-elements");
		const service = new CompendiumSyncService(app, store, fetchFake);
		const report = await service.sync(OPTIONS);
		expect(report.releaseTag).toBe("v4.20260701T120000");
		expect(report.created.sort()).toEqual(["class/shadow.md", "rule/combat/turn.md"]);
		expect(vault.text("DS Compendium/class/shadow.md")).toBe("shadow!");
		// Latest endpoint was used (no tag configured):
		expect(fetchFake.mock.calls[0][0].url)
			.toBe("https://api.github.com/repos/SteelCompendium/data-unified/releases/latest");
		// Asset downloaded as a binary octet-stream:
		expect(fetchFake.mock.calls[1][0].headers.Accept).toBe("application/octet-stream");
	});

	test("pinned tag uses the /tags/ endpoint", async () => {
		const { app } = makeFakeApp();
		const fetchFake = githubFake(await zipOf({ "a.md": "a" }), "v4.pinned");
		const service = new CompendiumSyncService(
			app, new ManifestStore(app, "draw-steel-elements"), fetchFake);
		await service.sync({ ...OPTIONS, releaseTag: "v4.pinned" });
		expect(fetchFake.mock.calls[0][0].url)
			.toBe("https://api.github.com/repos/SteelCompendium/data-unified/releases/tags/v4.pinned");
	});

	test("missing locale asset produces an actionable error", async () => {
		const { app } = makeFakeApp();
		const fetchFake = githubFake(await zipOf({ "a.md": "a" }));
		const service = new CompendiumSyncService(
			app, new ManifestStore(app, "draw-steel-elements"), fetchFake);
		await expect(service.sync({ ...OPTIONS, locale: "fr" }))
			.rejects.toThrow(/md-dse-unified-fr\.zip/);
	});

	test("HTTP failure surfaces status and URL", async () => {
		const { app } = makeFakeApp();
		const fetchFake = jest.fn(async () =>
			({ status: 403, json: null, arrayBuffer: new ArrayBuffer(0), text: "" } as any));
		const service = new CompendiumSyncService(
			app, new ManifestStore(app, "draw-steel-elements"), fetchFake);
		await expect(service.sync(OPTIONS)).rejects.toThrow(/HTTP 403/);
	});

	test("asset download HTTP failure is reported distinctly from a metadata failure", async () => {
		const { app } = makeFakeApp();
		const releaseJson = {
			tag_name: "v4.new",
			assets: [{ name: "md-dse-unified-en.zip", url: "https://api.github.com/assets/1" }],
		};
		const fetchFake = jest.fn(async (params: any) => {
			if (params.url.includes("/releases/")) {
				return { status: 200, json: releaseJson, arrayBuffer: new ArrayBuffer(0), text: "" } as any;
			}
			return { status: 500, json: null, arrayBuffer: new ArrayBuffer(0), text: "" } as any;
		});
		const service = new CompendiumSyncService(
			app, new ManifestStore(app, "draw-steel-elements"), fetchFake);
		await expect(service.sync(OPTIONS)).rejects.toThrow(/Asset download failed.*HTTP 500/);
	});

	test("an empty downloaded asset is rejected before extraction", async () => {
		const { app } = makeFakeApp();
		const releaseJson = {
			tag_name: "v4.new",
			assets: [{ name: "md-dse-unified-en.zip", url: "https://api.github.com/assets/1" }],
		};
		const fetchFake = jest.fn(async (params: any) => {
			if (params.url.includes("/releases/")) {
				return { status: 200, json: releaseJson, arrayBuffer: new ArrayBuffer(0), text: "" } as any;
			}
			return { status: 200, json: null, arrayBuffer: new ArrayBuffer(0), text: "" } as any;
		});
		const service = new CompendiumSyncService(
			app, new ManifestStore(app, "draw-steel-elements"), fetchFake);
		await expect(service.sync(OPTIONS)).rejects.toThrow(/empty/);
	});

	test("checkForUpdates compares latest tag against the manifest without downloading", async () => {
		const { app } = makeFakeApp();
		const fetchFake = githubFake(await zipOf({ "a.md": "a" }), "v4.two");
		const store = new ManifestStore(app, "draw-steel-elements");
		const service = new CompendiumSyncService(app, store, fetchFake);
		expect(await service.checkForUpdates())
			.toEqual({ installedTag: null, latestTag: "v4.two", upToDate: false });
		await service.sync(OPTIONS);
		fetchFake.mockClear();
		expect(await service.checkForUpdates())
			.toEqual({ installedTag: "v4.two", latestTag: "v4.two", upToDate: true });
		expect(fetchFake).toHaveBeenCalledTimes(1); // metadata only — no asset download
	});

	test("F2 review MUST-FIX #2: rejectedPaths (path-traversal defense) are surfaced in the sync summary Notice + console.warn payload", async () => {
		const { app } = makeFakeApp();
		// Note: a ".." segment can't survive round-tripping through JSZip's OWN writer
		// (zip.file('../evil.md', …) gets path-cleaned to 'evil.md' on write — verified
		// against this repo's jszip; only a non-JSZip-authored archive would carry a raw
		// ".." entry). A leading-slash entry survives the round-trip unchanged and is
		// exactly as unsafe (isUnsafeRelativePath, CompendiumSyncService.ts:313-316),
		// so it stands in here for "the zip carried an unsafe path".
		const zip = await zipOf({ "safe.md": "official", "/abs.md": "pwned" });
		const fetchFake = githubFake(zip, "v4.rejected");
		const service = new CompendiumSyncService(
			app, new ManifestStore(app, "draw-steel-elements"), fetchFake);
		Notice.notices.length = 0;
		const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const report = await service.sync(OPTIONS);
			expect(report.rejectedPaths).toEqual(["/abs.md"]);
			expect(report.created).toEqual(["safe.md"]);
			// Folded into the SAME skip-count notice as skippedConflicts/keptModified —
			// before the fix, a rejected path was silently dropped from both this count
			// and the console payload below.
			expect(Notice.notices.some((n) => n.includes("1 file(s) skipped"))).toBe(true);
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("sync skipped these paths"),
				expect.objectContaining({ rejectedUnsafePaths: ["/abs.md"] }));
		} finally {
			warnSpy.mockRestore();
		}
	});

	test("real fixture files round-trip through a real JSZip archive (network-free integration check)", async () => {
		const { app, vault } = makeFakeApp();
		const fixtureRoot = path.join(__dirname, "../../fixtures/md-dse");
		const fixtures: Record<string, string> = {
			"rule/combat/turn.md": fs.readFileSync(path.join(fixtureRoot, "rule/combat/turn.md"), "utf8"),
			"monster/goblin/statblock/goblin-stinker.md":
				fs.readFileSync(path.join(fixtureRoot, "monster/goblin/statblock/goblin-stinker.md"), "utf8"),
			"feature/fury/level-1/growing-ferocity.md":
				fs.readFileSync(path.join(fixtureRoot, "feature/fury/level-1/growing-ferocity.md"), "utf8"),
		};
		const zip = await zipOf(fixtures);
		const fetchFake = githubFake(zip, "v4.fixtures");
		const service = new CompendiumSyncService(
			app, new ManifestStore(app, "draw-steel-elements"), fetchFake);
		const report = await service.sync(OPTIONS);
		expect(report.created.sort()).toEqual(Object.keys(fixtures).sort());
		for (const [relativePath, content] of Object.entries(fixtures)) {
			expect(vault.text(`DS Compendium/${relativePath}`)).toBe(content);
		}
	});
});
