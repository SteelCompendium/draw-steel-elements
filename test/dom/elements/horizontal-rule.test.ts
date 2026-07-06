// Plan 09 Task 1 (D2 §3.1) — Horizontal Rule on the kit divider. Static, zero-config:
// parse() ignores its input entirely, so this element's whole job is proving parse ->
// validate(skipped, no schema) -> createView -> mount end-to-end through the REAL
// ElementPipeline (same pattern as test/dom/framework/pipeline.test.ts's makeDeps()),
// and that HorizontalRuleView.onMount renders the kit `divider` (`.dse-hr` + fade
// lines + ◆ diamond — Plan 08's DOM/CSS) instead of the legacy
// Common/horizontalRuleProcessor (retired in Plan 09 Task 10, once Task 6 moved its
// last consumers — Statblock/Featureblock — onto the kit grammar).
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin } from '../../mocks/obsidian';
import { horizontalRuleElement } from '../../../src/elements/horizontal-rule/definition';
import { HorizontalRuleView } from '../../../src/elements/horizontal-rule/view';
import { divider } from '../../../src/framework/kit';

function makeHost(): BlockHost & { containerEl: HTMLElement } {
	const containerEl = document.createElement('div');
	return {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child) => child,
		getBlockInfo: () => ({ language: 'ds-hr', lineStart: 0, lineEnd: 2 }),
		replaceSource: async () => true,
		blockKey: () => 'Note.md::ds-hr::0',
	};
}

/** Real service instances, same convention as pipeline.test.ts's makeDeps(). */
function makeDeps(): ElementPipelineDeps {
	const app = new App();
	const plugin = new Plugin(app);
	const theme = createThemeService();
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	const refs = createReferenceService(app as any, DEFAULT_SETTINGS);
	const validation = createValidationService();
	const session = createSessionStore();
	return {
		app: app as any,
		plugin: plugin as any,
		settings: DEFAULT_SETTINGS,
		theme,
		prefs,
		refs,
		validation,
		session,
	};
}

describe('D1 Task 1: horizontal-rule ElementDefinition (F1 §6 step 1)', () => {
	test('id/aliases/shape match the preserved ds-hr / ds-horizontal-rule contract', () => {
		expect(horizontalRuleElement.id).toBe('horizontal-rule');
		expect(horizontalRuleElement.aliases).toEqual(['ds-hr', 'ds-horizontal-rule']);
		expect(horizontalRuleElement.shape).toBe('static');
		expect(horizontalRuleElement.schema).toBeUndefined();
		expect(horizontalRuleElement.serialize).toBeUndefined();
	});

	test('createView returns a HorizontalRuleView', () => {
		const deps = makeDeps();
		const host = makeHost();
		const cx = {
			app: deps.app,
			plugin: deps.plugin,
			settings: deps.settings,
			host,
			mode: host.mode,
			theme: deps.theme,
			prefs: deps.prefs,
			refs: deps.refs,
			session: deps.session,
		};
		expect(horizontalRuleElement.createView(cx)).toBeInstanceOf(HorizontalRuleView);
	});
});

describe('Plan 09 Task 1: horizontal-rule rendered through the REAL ElementPipeline', () => {
	test('golden render: matches a direct kit divider(axis:"h", ornament:true) call byte-for-byte', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(horizontalRuleElement, '', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const golden = document.createElement('div');
		divider(golden, { axis: 'h', ornament: true });

		expect(root.innerHTML).toBe(golden.innerHTML);
	});

	test('exact structure: .dse-hr[role="separator"] > line--left + diamond + line--right; NO legacy .ds-hr-container', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(horizontalRuleElement, '', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const rule = root.querySelector(':scope > .dse-hr');
		expect(rule).not.toBeNull();
		expect(rule!.getAttribute('role')).toBe('separator');
		const children = Array.from(rule!.children).map((el) => el.className);
		expect(children).toEqual([
			'dse-hr__line dse-hr__line--left',
			'dse-hr__diamond',
			'dse-hr__line dse-hr__line--right',
		]);
		// The redesign moves this element's OWN view off the legacy builder entirely.
		expect(root.querySelector('.ds-hr-container')).toBeNull();
	});

	test('root carries data-dse-element="horizontal-rule" and data-dse-theme (F1 §3.5 contract)', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(horizontalRuleElement, '', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-element')).toBe('horizontal-rule');
		expect(root.getAttribute('data-dse-theme')).toBe('steel');
	});

	test('an empty block body still renders the rule (zero-config, source ignored)', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(horizontalRuleElement, '', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelector('.dse-hr')).not.toBeNull();
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
	});

	test('a garbage (syntactically-valid but meaningless) block body still renders the rule', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(horizontalRuleElement, 'unexpected: keys\nnested: [1, 2, 3]\n', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelector('.dse-hr')).not.toBeNull();
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
	});

	test('ties HorizontalRuleView to host.addChild (block lifecycle)', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		const addChild = jest.fn((child: unknown) => child);
		const hostWithSpy = { ...host, addChild };

		await pipeline.run(horizontalRuleElement, '', hostWithSpy as BlockHost);

		expect(addChild).toHaveBeenCalledTimes(1);
		expect(addChild.mock.calls[0][0]).toBeInstanceOf(HorizontalRuleView);
	});

	test('noClickShield: true — mousedown bubbles normally (legacy Vue HR never armed a click shield)', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();
		document.body.appendChild(host.containerEl);
		try {
			await pipeline.run(horizontalRuleElement, '', host);
			const root = host.containerEl.firstElementChild as HTMLElement;
			let bubbledToDocument = 0;
			const onDocMousedown = () => bubbledToDocument++;
			document.addEventListener('mousedown', onDocMousedown);
			try {
				const container = root.querySelector('.dse-hr') as HTMLElement;
				container.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
				expect(bubbledToDocument).toBe(1);
			} finally {
				document.removeEventListener('mousedown', onDocMousedown);
			}
		} finally {
			document.body.removeChild(host.containerEl);
		}
	});
});
