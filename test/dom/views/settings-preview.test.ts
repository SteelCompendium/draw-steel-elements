// Plan 13 Task 6 (D4 §4.2) — the settings statblock preview is a REAL pipeline
// mount: reflected at first paint, live-reflowed by pref changes, torn down with
// the row that showed it.
//
// SC-131: the tab is declarative, so there is no display()/hide() pair any more. The
// preview is a `render` row, and its Component is released through obsidian's CLEANUP
// CONTRACT — whatever the render callback returns is stored as that row's cleanup and
// invoked when the row goes away (page navigation, settings close, re-render).
//
// That contract is the whole reason these tests drive `update()` + `renderTab()` +
// `closeTab()` rather than poking the tab directly: obsidian calls
// getSettingDefinitions() only from update() and re-renders from a CACHE, so a preview
// owned by the definitions build survives exactly one paint. See the reopen test below.
import fs from 'fs';
import path from 'path';
import DrawSteelAdmonitionPlugin from 'main';
import { DseSettingTab } from '@views/SettingsTab';
import {
	PREVIEW_STATBLOCK_YAML,
	PREVIEW_FEATUREBLOCK_YAML,
	PREVIEW_FEATURE_YAML,
} from '@views/SettingsPreview';
import { App, Setting, flushAsync } from '../../mocks/obsidian';

/* eslint-disable @typescript-eslint/no-explicit-any */

async function makeTab() {
	const app = new App();
	const plugin = new DrawSteelAdmonitionPlugin(app as never, { id: 'draw-steel-elements', version: 'test' } as never);
	await plugin.onload();
	const tab = new DseSettingTab(plugin.app as never, plugin);
	return { plugin, tab };
}

/** The preview's statblock root, or null when nothing is mounted. */
function previewRoot(tab: DseSettingTab): HTMLElement | null {
	return (tab.containerEl as HTMLElement).querySelector<HTMLElement>(
		'.dse-settings-preview [data-dse-element="statblock"]',
	);
}

/** Open the settings window: cache the definitions, then paint. */
async function open(tab: DseSettingTab): Promise<void> {
	(tab as any).update();
	(tab as any).renderTab();
	await flushAsync(3); // pipeline.run is async — let the mount land
}

/** Close it: obsidian invokes each rendered row's stored cleanup. */
function close(tab: DseSettingTab): void {
	(tab as any).closeTab();
}

beforeEach(() => {
	Setting.created.length = 0;
});

test('mounts a real statblock root (no error card, no read-only badge) with reflected defaults', async () => {
	const { tab } = await makeTab();
	await open(tab);
	const root = previewRoot(tab);
	expect(root).not.toBeNull();
	expect(root!.querySelector('.dse-sb')).not.toBeNull(); // fixture parsed & rendered
	expect(root!.hasAttribute('data-dse-error-stage')).toBe(false);
	expect((tab.containerEl as HTMLElement).querySelector('.dse-error-card')).toBeNull();
	expect(root!.hasAttribute('data-dse-readonly')).toBe(false);
	expect(root!.getAttribute('data-dse-density')).toBe('comfortable');
});

test('a pref change live-reflows the preview root in place (same node, new attr)', async () => {
	const { plugin, tab } = await makeTab();
	await open(tab);
	const root = previewRoot(tab);
	await plugin.frameworkV2!.services.prefs.set('sbDensity', 'compact');
	await flushAsync(1);
	expect(root!.getAttribute('data-dse-density')).toBe('compact');
});

test('closing the settings window unloads the preview owner: later pref changes no longer re-stamp the orphaned root', async () => {
	const { plugin, tab } = await makeTab();
	await open(tab);
	const root = previewRoot(tab);
	close(tab);
	await plugin.frameworkV2!.services.prefs.set('sbDensity', 'compact');
	await flushAsync(1);
	expect(root!.getAttribute('data-dse-density')).toBe('comfortable'); // dead subscription
});

// —— SC-131 C1 regression ——
// Obsidian calls getSettingDefinitions() ONLY from update(); re-opening the settings
// window replays the cached definitions. A preview whose Component was created during the
// definitions build (rather than per mount) is therefore alive for the first paint and
// dead for every one after — the preview silently vanishes for the rest of the session.
// This is the test that fails against that shape.
test('re-opening the settings window WITHOUT an update() still mounts the preview', async () => {
	const { tab } = await makeTab();
	await open(tab);
	expect(previewRoot(tab)).not.toBeNull();

	close(tab);
	// No update() here, deliberately: obsidian re-renders from its cache.
	(tab as any).renderTab();
	await flushAsync(3);
	expect(previewRoot(tab)).not.toBeNull();

	// And a third time, because "works twice" is the weaker claim.
	close(tab);
	(tab as any).renderTab();
	await flushAsync(3);
	expect(previewRoot(tab)).not.toBeNull();
});

test('each mount gets a live owner: a pref change after re-opening still reflows the NEW root', async () => {
	const { plugin, tab } = await makeTab();
	await open(tab);
	close(tab);
	(tab as any).renderTab();
	await flushAsync(3);
	const root = previewRoot(tab);
	expect(root).not.toBeNull();
	await plugin.frameworkV2!.services.prefs.set('sbDensity', 'compact');
	await flushAsync(1);
	expect(root!.getAttribute('data-dse-density')).toBe('compact');
});

test('preview subscriptions do not accumulate: the previous mount is released on re-render', async () => {
	const { plugin, tab } = await makeTab();
	await open(tab);
	const first = previewRoot(tab)!;
	close(tab);
	(tab as any).renderTab();
	await flushAsync(3);
	const second = previewRoot(tab)!;
	expect(second).not.toBe(first);
	await plugin.frameworkV2!.services.prefs.set('sbDensity', 'compact');
	await flushAsync(1);
	// Only the live mount re-stamps; the orphaned one stays frozen at its last value.
	expect(second.getAttribute('data-dse-density')).toBe('compact');
	expect(first.getAttribute('data-dse-density')).toBe('comfortable');
});

// ══════════════════════════════════════════════════════════════════════════════════════
// SC-187 — "the preview isn't working great": nested scrollbars, wasted space, unnatural
// ══════════════════════════════════════════════════════════════════════════════════════
//
// MEASURED BEFORE (obsidian 1.13.7 settings DOM + app.css, 1200x1000, this branch's
// evidence run — .superpowers/sdd/sc187/):
//   Statblock display   obsidian's .vertical-tab-content 938/1183  +  preview host 350/3646
//   Typography          obsidian's .vertical-tab-content 938/1426  +  preview host 350/3646
//   Featureblock        page did not scroll at all — the ONLY scrollbar was the preview's
// i.e. two scrollbars stacked on the two pages that scroll, and on the third page the one
// scrollbar on screen belonged to a settings preview. AFTER: 1 scroller on every page.
//
// The structural half of that is a CSS contract, so it is asserted against the SOURCE
// SHEET rather than against a screenshot: `max-height` + `overflow` on the preview host is
// precisely what made the second scroller, and `position: sticky` is what made it
// necessary. Both are banned here, permanently.

const SHEET = fs.readFileSync(
	path.join(__dirname, '../../../styles-source.css'),
	'utf8',
);

/** Every flat rule block in the sheet whose selector mentions the preview panel/row. */
function previewRules(): { selector: string; body: string }[] {
	const out: { selector: string; body: string }[] = [];
	const re = /(^|\n)([^\n{}]*dse-settings-preview[^\n{}]*)\{([^{}]*)\}/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(SHEET)) !== null) {
		const selector = m[2].trim();
		if (selector.startsWith('*') || selector.startsWith('/')) continue;
		out.push({ selector, body: m[3] });
	}
	return out;
}

describe('SC-187 — the settings pane has exactly ONE scroller', () => {
	test('the rule set is found at all (a parser that stopped matching would pass everything)', () => {
		const selectors = previewRules().map((r) => r.selector);
		expect(selectors.length).toBeGreaterThanOrEqual(4);
		expect(selectors).toContain('.dse-settings-preview-row');
		expect(selectors).toContain('.dse-settings-preview__stage');
	});

	test('NO preview rule declares overflow or a height cap — obsidian\'s .vertical-tab-content is the only scroller', () => {
		const offenders = previewRules().filter((r) =>
			/(^|[\s;])(overflow(-[xy])?|max-height|height)\s*:/.test(r.body),
		);
		expect(offenders.map((r) => r.selector)).toEqual([]);
	});

	test('the preview row does not float over the rows it previews (no sticky, no z-index, no lift)', () => {
		const row = previewRules().find((r) => r.selector === '.dse-settings-preview-row')!;
		expect(row.body).not.toMatch(/position\s*:\s*(sticky|fixed|absolute)/);
		expect(row.body).not.toMatch(/z-index\s*:/);
		for (const rule of previewRules()) expect(rule.body).not.toMatch(/box-shadow\s*:/);
	});

	test('every font-size in the preview panel is on the SC-185 role scale', () => {
		for (const rule of previewRules()) {
			for (const decl of rule.body.split(';')) {
				if (!/(^|\s)font-size\s*:/.test(decl)) continue;
				expect(decl).toMatch(/var\(\s*--dse-fs-/);
			}
		}
	});

	test('the settings block stays Obsidian-native chrome: no Steel theme gate, and unreachable from print', () => {
		// Deliberate, and the one correct place in this sheet for it — see the block
		// comment above the rules. The freeze safety is structural, not scoping: these
		// selectors can only match inside the plugin's own settings tab.
		for (const rule of previewRules()) {
			expect(rule.selector).not.toContain("data-dse-theme");
			expect(rule.selector).not.toContain('data-dse-element');
		}
	});
});

describe('SC-187 — the preview reads as a labelled, framed sample', () => {
	test('the panel is a caption plus a framed stage, and the element root mounts inside the stage', async () => {
		const { tab } = await makeTab();
		await open(tab);
		const panel = (tab.containerEl as HTMLElement).querySelector<HTMLElement>('.dse-settings-preview')!;
		expect(panel).not.toBeNull();
		const label = panel.querySelector<HTMLElement>('.dse-settings-preview__label')!;
		expect(label.textContent).toContain('Preview');
		// The hint states the relationship the layout implies (the panel is the last row).
		expect(label.textContent).toContain('above');
		const stage = panel.querySelector<HTMLElement>('.dse-settings-preview__stage')!;
		expect(stage.querySelector('[data-dse-element="statblock"]')).not.toBeNull();
		// …and the long-standing `.dse-settings-preview [data-dse-element]` address — used
		// by the other tests here and by visual-harness/settings-evidence.mjs — still holds.
		expect(panel.querySelector('[data-dse-element="statblock"]')).toBe(
			stage.querySelector('[data-dse-element]'),
		);
	});

	test('the sample does not pin a mini-header over the settings window (per-block sbSticky override)', async () => {
		// Uncapping the host makes the sample taller than the settings viewport, which is
		// exactly the condition SC-160's IntersectionObserver reveals the bar under — and
		// its scrollport here is the settings pane, so it would pin a creature name over
		// the settings rows. The shipped per-block override is the fix.
		expect(PREVIEW_STATBLOCK_YAML).toMatch(/prefs:\s*\n\s*sbSticky:\s*"off"/);
		const { tab } = await makeTab();
		await open(tab);
		expect(previewRoot(tab)!.getAttribute('data-dse-sb-sticky')).toBe('off');
	});
});

describe('SC-187 — the preview SUBJECTS are samples, not specimens', () => {
	/** Top-level `- type: feature` entries in a canned YAML string. */
	const featureCount = (yaml: string): number =>
		(yaml.match(/^ {2}- type: feature$/gm) ?? []).length;

	test('the statblock preview is abridged, and stays abridged', async () => {
		// 8 features (3646px rendered) was the root cause of the porthole. The cap is a
		// contract, not a coincidence: a future edit that pastes the full fixture back in
		// re-creates a settings page taller than four screens.
		expect(featureCount(PREVIEW_STATBLOCK_YAML)).toBeLessThanOrEqual(3);
		const { tab } = await makeTab();
		await open(tab);
		expect(previewRoot(tab)!.querySelectorAll('.dse-feature').length).toBeLessThanOrEqual(4);
	});

	test('…while still exercising every statblock setting that can move it', () => {
		// Each of these is what one row on the Statblock/Feature display pages needs in
		// order to visibly do anything. Dropping one silently turns a settings row into a
		// control with no preview, which is the failure this list exists to prevent.
		expect(PREVIEW_STATBLOCK_YAML).toContain('immunities:');   // Secondary stats
		expect(PREVIEW_STATBLOCK_YAML).toContain('might:');        // Characteristics / Boxed letter
		expect(PREVIEW_STATBLOCK_YAML).toContain('keywords:');     // Keyword display
		expect(PREVIEW_STATBLOCK_YAML).toContain('distance:');     // Distance + target
		expect(PREVIEW_STATBLOCK_YAML).toContain('roll: Power Roll'); // tier rendering
		expect(PREVIEW_STATBLOCK_YAML).toContain('Villain Action'); // Villain actions
		expect(PREVIEW_STATBLOCK_YAML).toContain('feature_type: trait');
		// Feature columns ("side-by-side") needs at least two NON-villain features to have
		// two columns to show.
		const nonVillain = PREVIEW_STATBLOCK_YAML.split(/^ {2}- type: feature$/m)
			.slice(1)
			.filter((block) => !block.includes('Villain Action'));
		expect(nonVillain.length).toBeGreaterThanOrEqual(2);
	});

	test('SC-193: the Feature subject is a standalone ability card carrying both of its page\'s rows', async () => {
		expect(PREVIEW_FEATURE_YAML).toContain('type: feature');
		expect(PREVIEW_FEATURE_YAML).toContain('keywords:');   // kwUsage
		expect(PREVIEW_FEATURE_YAML).toContain('distance:');   // distTarget
		expect(PREVIEW_FEATURE_YAML).toContain('target:');
		// It renders through the real pipeline with no error card.
		const { plugin } = await makeTab();
		const fw = plugin.frameworkV2!;
		const host = document.createElement('div');
		await fw.pipeline.run(fw.registry.get('feature')!, PREVIEW_FEATURE_YAML, {
			mode: 'reading',
			sourcePath: '',
			containerEl: host,
			canPersist: true,
			addChild: (child: never) => child,
			getBlockInfo: () => null,
			replaceSource: async () => false,
			blockKey: () => 'test',
		} as never);
		await flushAsync(3);
		expect(host.querySelector('.dse-error-card')).toBeNull();
		expect(host.querySelector('[data-dse-element="feature"]')).not.toBeNull();
	});

	test('the featureblock subject is untouched by the trim (SC-123 chose it deliberately)', () => {
		expect(PREVIEW_FEATUREBLOCK_YAML).toContain('featureblock_type: Fixture');
		expect(PREVIEW_FEATUREBLOCK_YAML).toContain('stats:');
	});
});
