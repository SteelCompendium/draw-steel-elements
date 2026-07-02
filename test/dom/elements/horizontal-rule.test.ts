// D1 Task 1 (Plan 03) — Horizontal Rule: the first real element on Framework v2 (F1 §6
// step 1 / D1 spec step 1). Static, zero-config: parse() ignores its input entirely, so
// this element's whole job is proving parse -> validate(skipped, no schema) -> createView
// -> mount end-to-end through the REAL ElementPipeline (same pattern as
// test/dom/framework/pipeline.test.ts's makeDeps()), and that HorizontalRuleView.onMount
// reuses the legacy Common/horizontalRuleProcessor DOM builder byte-for-byte (that file is
// NOT deleted by this migration — Statblock/Featureblock still call it directly).
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
import { HorizontalRuleProcessor } from '@drawSteelAdmonition/Common/horizontalRuleProcessor';

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

describe('D1 Task 1: horizontal-rule rendered through the REAL ElementPipeline', () => {
	test('golden render: matches the legacy HorizontalRuleProcessor.build() DOM byte-for-byte', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(horizontalRuleElement, '', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const golden = document.createElement('div');
		HorizontalRuleProcessor.build(golden);

		expect(root.innerHTML).toBe(golden.innerHTML);
	});

	test('exact structure: .ds-hr-container > .ds-hr-left-line + .ds-hr-center + .ds-hr-right-line', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(horizontalRuleElement, '', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const container = root.querySelector(':scope > .ds-hr-container');
		expect(container).not.toBeNull();
		const children = Array.from(container!.children).map((el) => el.className);
		expect(children).toEqual(['ds-hr-left-line', 'ds-hr-center', 'ds-hr-right-line']);
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
		expect(root.querySelector('.ds-hr-container')).not.toBeNull();
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
	});

	test('a garbage (syntactically-valid but meaningless) block body still renders the rule', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const host = makeHost();

		await pipeline.run(horizontalRuleElement, 'unexpected: keys\nnested: [1, 2, 3]\n', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelector('.ds-hr-container')).not.toBeNull();
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
				const container = root.querySelector('.ds-hr-container') as HTMLElement;
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
