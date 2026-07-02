import { createRenderContext, type RenderContext, type RollService } from '../../../src/framework/context';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import type { ThemeService } from '../../../src/framework/seams/theme';
import type { PreferenceStore } from '../../../src/framework/seams/prefs';
import type { ReferenceService } from '../../../src/framework/seams/refs';
import type { SessionStore } from '../../../src/framework/session';
import { DEFAULT_SETTINGS, type DSESettings } from '../../../src/model/Settings';
import { App as MockApp, Plugin as MockPlugin } from '../../mocks/obsidian';

// F1 §3.2: RenderContext — per-block-instance context object the pipeline builds
// and passes to views. Contains no view reference and no DOM — views own DOM,
// context owns services.
describe('T-6 (Plan 02): RenderContext (F1 §3.2)', () => {
	let mockApp: MockApp;
	let mockPlugin: MockPlugin;
	let mockSettings: Readonly<DSESettings>;
	let mockHost: Partial<BlockHost>;
	let mockTheme: Partial<ThemeService>;
	let mockPrefs: Partial<PreferenceStore>;
	let mockRefs: Partial<ReferenceService>;
	let mockSession: Partial<SessionStore>;

	beforeEach(() => {
		mockApp = new MockApp();
		mockPlugin = new MockPlugin(mockApp);
		mockSettings = {
			compendiumDestinationDirectory: 'compendium',
			defaultImagePath: 'Media/test.png',
		};
		// Minimal mock HTMLElement for unit testing (no jsdom needed).
		const mockContainerEl = {} as HTMLElement;
		mockHost = {
			mode: 'reading' as RenderMode,
			sourcePath: '/notes/test.md',
			containerEl: mockContainerEl,
			canPersist: true,
			addChild: jest.fn((child) => child) as any,
			getBlockInfo: jest.fn(() => ({ language: 'ds-ft', lineStart: 10, lineEnd: 15 })),
			replaceSource: jest.fn(async () => true),
			blockKey: jest.fn(() => '/notes/test.md::ds-ft::10'),
		};
		mockTheme = { active: 'steel' };
		mockPrefs = { get: jest.fn(), set: jest.fn(), subscribe: jest.fn(), reflect: jest.fn(), describe: jest.fn() };
		mockRefs = { register: jest.fn(), resolve: jest.fn(), resolveDeep: jest.fn() };
		mockSession = { get: jest.fn(), set: jest.fn() };
	});

	test('factory creates a RenderContext with all required members', () => {
		const cx = createRenderContext({
			app: mockApp as any,
			plugin: mockPlugin as any,
			settings: mockSettings,
			host: mockHost as BlockHost,
			theme: mockTheme as ThemeService,
			prefs: mockPrefs as PreferenceStore,
			refs: mockRefs as ReferenceService,
			session: mockSession as SessionStore,
		});

		expect(cx).toBeDefined();
		expect(cx.app).toBe(mockApp);
		expect(cx.plugin).toBe(mockPlugin);
		expect(cx.settings).toBe(mockSettings);
		expect(cx.host).toBe(mockHost);
		expect(cx.theme).toBe(mockTheme);
		expect(cx.prefs).toBe(mockPrefs);
		expect(cx.refs).toBe(mockRefs);
		expect(cx.session).toBe(mockSession);
	});

	test('context.mode equals host.mode (convenience member)', () => {
		const cx = createRenderContext({
			app: mockApp as any,
			plugin: mockPlugin as any,
			settings: mockSettings,
			host: mockHost as BlockHost,
			theme: mockTheme as ThemeService,
			prefs: mockPrefs as PreferenceStore,
			refs: mockRefs as ReferenceService,
			session: mockSession as SessionStore,
		});

		expect(cx.mode).toBe(mockHost.mode);
		expect(cx.mode).toBe('reading');
	});

	test('context.mode stays in sync with different host modes', () => {
		const hostReading = { ...mockHost, mode: 'reading' as const };
		const cxReading = createRenderContext({
			app: mockApp as any,
			plugin: mockPlugin as any,
			settings: mockSettings,
			host: hostReading as BlockHost,
			theme: mockTheme as ThemeService,
			prefs: mockPrefs as PreferenceStore,
			refs: mockRefs as ReferenceService,
			session: mockSession as SessionStore,
		});
		expect(cxReading.mode).toBe('reading');

		const hostLp = { ...mockHost, mode: 'live-preview' as const };
		const cxLp = createRenderContext({
			app: mockApp as any,
			plugin: mockPlugin as any,
			settings: mockSettings,
			host: hostLp as BlockHost,
			theme: mockTheme as ThemeService,
			prefs: mockPrefs as PreferenceStore,
			refs: mockRefs as ReferenceService,
			session: mockSession as SessionStore,
		});
		expect(cxLp.mode).toBe('live-preview');
	});

	test('all context members are readonly', () => {
		const cx = createRenderContext({
			app: mockApp as any,
			plugin: mockPlugin as any,
			settings: mockSettings,
			host: mockHost as BlockHost,
			theme: mockTheme as ThemeService,
			prefs: mockPrefs as PreferenceStore,
			refs: mockRefs as ReferenceService,
			session: mockSession as SessionStore,
		});

		// Attempt to modify should fail in strict mode.
		expect(() => {
			(cx as any).app = {};
		}).toThrow();
	});

	test('context optionally carries roll service', () => {
		const mockRoll: RollService = {}; // Minimal empty interface

		const cxWithRoll = createRenderContext({
			app: mockApp as any,
			plugin: mockPlugin as any,
			settings: mockSettings,
			host: mockHost as BlockHost,
			theme: mockTheme as ThemeService,
			prefs: mockPrefs as PreferenceStore,
			refs: mockRefs as ReferenceService,
			session: mockSession as SessionStore,
			roll: mockRoll,
		});

		expect(cxWithRoll.roll).toBe(mockRoll);
	});

	test('context roll is optional', () => {
		const cxNoRoll = createRenderContext({
			app: mockApp as any,
			plugin: mockPlugin as any,
			settings: mockSettings,
			host: mockHost as BlockHost,
			theme: mockTheme as ThemeService,
			prefs: mockPrefs as PreferenceStore,
			refs: mockRefs as ReferenceService,
			session: mockSession as SessionStore,
		});

		expect(cxNoRoll.roll).toBeUndefined();
	});

	test('context members are accessible and functional', () => {
		const cx = createRenderContext({
			app: mockApp as any,
			plugin: mockPlugin as any,
			settings: mockSettings,
			host: mockHost as BlockHost,
			theme: mockTheme as ThemeService,
			prefs: mockPrefs as PreferenceStore,
			refs: mockRefs as ReferenceService,
			session: mockSession as SessionStore,
		});

		// Verify services work and methods are callable
		expect(cx.host.getBlockInfo()).toEqual({ language: 'ds-ft', lineStart: 10, lineEnd: 15 });
		expect(typeof cx.prefs.get).toBe('function');
		expect(typeof cx.refs.resolve).toBe('function');
		expect(typeof cx.session.get).toBe('function');
	});
});
