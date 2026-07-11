// Plan 13 Task 5 (D4 §1.3/§1.4) — per-block `prefs:` overrides + behavioral
// collapse-default prefs. Scaffolding mirrors test/dom/elements/statblock.test.ts
// (real ElementPipeline + real framework services, no mocks of the seams under test).
//
// AMENDED DESIGN (task-5-report-d4.md "Continuation"): ComponentWrapper keeps
// materializing concrete `collapsible`/`collapse_default` booleans on the model
// (byte-compat, unchanged) — resolveCollapsePrefs instead consults a side channel
// (declaredCollapsePrefs, keyed by model instance) recorded at construction time to
// tell "the block declared this key" apart from "the constructor's own `?? true`/
// `?? false` default filled it in". Tests 8-11 below exercise that distinction
// directly; 1-7 exercise the presentation `prefs:` override map, which is unaffected
// by the amendment (a different mechanism entirely — pipeline-level pop, not a model
// constructor default).
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import { createRollService } from '../../../src/framework/roll/service';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { DSE_PREF_DESCRIPTORS } from '../../../src/prefs/catalog';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin } from '../../mocks/obsidian';
import { statblockElement } from '../../../src/elements/statblock/definition';
import { skillsElement } from '../../../src/elements/skills/definition';
import { staminaBarElement } from '../../../src/elements/stamina-bar/definition';
import { serialize as staminaBarSerialize } from '../../../src/elements/stamina-bar/model';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
// SkillsSchema.yaml/StaminaBarSchema.yaml $ref the shared component-wrapper dependency
// schema (F1 §5) — main.ts registers it once at plugin load; tests driving the REAL
// ValidationService need to do the same, same convention as skills.test.ts /
// stamina-bar.test.ts.
import { FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from 'main';

/** A statblock with no features/level/roles/ancestry/ev — same minimal shape as
 *  statblock.test.ts's NO_FEATURES, reused here only for the `prefs:` machinery, not
 *  the statblock render itself. */
const NO_FEATURES = `type: statblock
name: Bare Creature
stamina: "10"
`;

const WITH_DENSITY_OVERRIDE = `prefs:
  sbDensity: compact
${NO_FEATURES}`;

/** The minimal `ds-stam` body used by stamina-bar.test.ts's BASIC_YAML. */
const BASIC_STAM_YAML = ['max_stamina: 20', 'current_stamina: 15', 'temp_stamina: 5'].join('\n');

function makeHost(language: string, overrides: Partial<BlockHost> = {}) {
	const replaceSource = jest.fn(async (_newSource: string) => true);
	const containerEl = document.createElement('div');
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language, lineStart: 0, lineEnd: 4 }),
		replaceSource,
		blockKey: () => `Note.md::${language}::0`,
		...overrides,
	};
	return host as BlockHost & { containerEl: HTMLElement; replaceSource: typeof replaceSource };
}

/** Real service instances, same convention as statblock.test.ts's makeDeps(). */
function makeDeps(): ElementPipelineDeps {
	const app = new App();
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	prefs.describe(DSE_PREF_DESCRIPTORS);
	const theme = createThemeService(prefs, plugin as any);
	const refs = createReferenceService(app as any, DEFAULT_SETTINGS);
	const validation = createValidationService();
	for (const { id, schema } of FRAMEWORK_V2_DEPENDENCY_SCHEMAS) {
		validation.addDependencySchema(id, schema);
	}
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
		roll: createRollService(prefs),
	};
}

describe('per-block `prefs:` override map (D4 §1.3/§1.4, OD-D4-2/3a)', () => {
	test('a statblock block with prefs: {sbDensity: compact} pins data-dse-density="compact" on its root while a sibling block shows the global "comfortable"', async () => {
		const deps = makeDeps();
		const pipeline = new ElementPipeline(deps);

		const overriddenHost = makeHost('ds-sb');
		await pipeline.run(statblockElement, WITH_DENSITY_OVERRIDE, overriddenHost);
		const overriddenRoot = overriddenHost.containerEl.firstElementChild as HTMLElement;
		expect(overriddenRoot.getAttribute('data-dse-density')).toBe('compact');

		const siblingHost = makeHost('ds-sb');
		await pipeline.run(statblockElement, NO_FEATURES, siblingHost);
		const siblingRoot = siblingHost.containerEl.firstElementChild as HTMLElement;
		expect(siblingRoot.getAttribute('data-dse-density')).toBe('comfortable');
	});

	test('the pinned override survives a global prefs.set("sbDensity", …) (reflect stamps, pin re-stamps — override wins)', async () => {
		const deps = makeDeps();
		const pipeline = new ElementPipeline(deps);
		const host = makeHost('ds-sb');

		await pipeline.run(statblockElement, WITH_DENSITY_OVERRIDE, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-density')).toBe('compact');

		// Same value as the override, coincidentally — the point is the pin re-stamps
		// AFTER reflect on every subsequent change, so the override never actually
		// observes the global's intermediate values either.
		await deps.prefs.set('sbDensity', 'compact');
		expect(root.getAttribute('data-dse-density')).toBe('compact');

		await deps.prefs.set('sbDensity', 'comfortable');
		expect(root.getAttribute('data-dse-density')).toBe('compact'); // override still wins
	});

	test('non-overridden keys on the same root still track the global', async () => {
		const deps = makeDeps();
		const pipeline = new ElementPipeline(deps);
		const host = makeHost('ds-sb');

		await pipeline.run(statblockElement, WITH_DENSITY_OVERRIDE, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-sb-stats')).toBe('grid');

		await deps.prefs.set('sbStats', 'ledger');
		expect(root.getAttribute('data-dse-sb-stats')).toBe('ledger'); // tracks the global
		expect(root.getAttribute('data-dse-density')).toBe('compact'); // override still pinned
	});

	test('an unknown prefs: key warns (console.warn spy) and the block still renders (no .dse-error-card)', async () => {
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const deps = makeDeps();
			const pipeline = new ElementPipeline(deps);
			const host = makeHost('ds-sb');
			const yaml = `prefs:\n  notARealPref: yes\n${NO_FEATURES}`;

			await pipeline.run(statblockElement, yaml, host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			expect(root.querySelector('.dse-error-card')).toBeNull();
			expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown per-block pref "notARealPref"'));
		} finally {
			warn.mockRestore();
		}
	});

	test('a behavioral prefs: key (collapsibleDefault) warns and is ignored', async () => {
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const deps = makeDeps();
			const pipeline = new ElementPipeline(deps);
			const host = makeHost('ds-sb');
			const yaml = `prefs:\n  collapsibleDefault: false\n${NO_FEATURES}`;

			await pipeline.run(statblockElement, yaml, host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			expect(root.querySelector('.dse-error-card')).toBeNull();
			expect(warn).toHaveBeenCalledWith(
				expect.stringContaining('"collapsibleDefault" is not a presentation preference'),
			);
		} finally {
			warn.mockRestore();
		}
	});

	test('the prefs: key never reaches schema validation or the model — a schema-validated block (skills, unevaluatedProperties: false) renders with no error card even though its schema does not declare the key', async () => {
		const deps = makeDeps();
		const pipeline = new ElementPipeline(deps);
		const host = makeHost('ds-skills');
		const yaml = `prefs:\n  sbDensity: compact\nskills:\n  - climb\n`;

		await pipeline.run(skillsElement, yaml, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelector('.dse-error-card')).toBeNull();
		expect(root.querySelector('.dse-skills')).not.toBeNull();
	});

	test('a PERSISTED element (stamina-bar) with prefs: re-emits the map on write', async () => {
		jest.useFakeTimers();
		try {
			const deps = makeDeps();
			const pipeline = new ElementPipeline(deps);
			const host = makeHost('ds-stam');
			const yaml = `prefs:\n  reduceMotion: true\n${BASIC_STAM_YAML}`;

			await pipeline.run(staminaBarElement, yaml, host);

			const root = host.containerEl.firstElementChild as HTMLElement;
			// The override took effect (proof the pipeline actually parsed/applied it,
			// not just that it round-trips blindly).
			expect(root.getAttribute('data-dse-reduce-motion')).toBe('true');

			const bar = root.querySelector('.dse-stamina') as HTMLElement;
			bar.click();
			const modalEl = document.body.lastElementChild as HTMLElement;
			const fullHeal = modalEl.querySelector<HTMLButtonElement>('button[aria-label="Full Heal"]');
			if (!fullHeal) throw new Error('no button [aria-label="Full Heal"]');
			fullHeal.click();
			const apply = modalEl.querySelector<HTMLButtonElement>('.dse-modal__footer .dse-btn--accent');
			if (!apply) throw new Error('no footer accent action button');
			apply.click();

			await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

			expect(host.replaceSource).toHaveBeenCalledTimes(1);
			const written = host.replaceSource.mock.calls[0][0] as string;
			expect(written).toContain('prefs:');
			expect(written).toContain('reduceMotion: true');
			// The element's own fields are still there, byte-identical to the
			// non-prefs: byte-compat pin (stamina-bar.test.ts) apart from the
			// current_stamina/temp_stamina Full Heal mutation.
			expect(written).toContain('collapsible: true');
			expect(written).toContain('collapse_default: false');
			expect(written).toContain('max_stamina: 20');
			expect(written).toContain('current_stamina: 20');
			expect(written).toContain('temp_stamina: 0');
		} finally {
			jest.useRealTimers();
		}
	});
});

describe('behavioral collapse-default prefs (D4 §1.3, AMENDED — declared-ness side channel)', () => {
	test('skills: collapsibleDefault=false global renders the list bare when the block omits collapsible:; the block key beats the pref', async () => {
		const deps = makeDeps();
		await deps.prefs.set('collapsibleDefault', false);
		const pipeline = new ElementPipeline(deps);

		// Omits collapsible: entirely — undeclared, falls through to the (now false)
		// global pref, so the list renders bare (no whole-element wrapper).
		const bareHost = makeHost('ds-skills');
		await pipeline.run(skillsElement, 'skills:\n  - climb\n', bareHost);
		const bareRoot = bareHost.containerEl.firstElementChild as HTMLElement;
		expect(bareRoot.querySelector(':scope > .dse-collapse')).toBeNull();
		expect(bareRoot.querySelector(':scope > .dse-skills')).not.toBeNull();

		// Declares collapsible: true explicitly — the block key wins over the pref.
		const declaredHost = makeHost('ds-skills');
		await pipeline.run(skillsElement, 'collapsible: true\nskills:\n  - climb\n', declaredHost);
		const declaredRoot = declaredHost.containerEl.firstElementChild as HTMLElement;
		expect(declaredRoot.querySelector(':scope > .dse-collapse')).not.toBeNull();
	});

	test('stamina-bar: collapseDefault=true global seeds the wrapper closed when the block omits collapse_default:', async () => {
		const deps = makeDeps();
		await deps.prefs.set('collapseDefault', true);
		const pipeline = new ElementPipeline(deps);
		const host = makeHost('ds-stam');

		await pipeline.run(staminaBarElement, BASIC_STAM_YAML, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const header = root.querySelector(':scope > .dse-collapse > .dse-collapse__header') as HTMLButtonElement;
		expect(header.getAttribute('aria-expanded')).toBe('false');
	});

	// —— Amendment pins (task-5-report-d4.md "Continuation") ——————————————————————

	test('AMENDMENT: an undeclared-collapse block renders with the pref value while its serialized bytes stay untouched (the model still materializes the hard default)', async () => {
		const deps = makeDeps();
		await deps.prefs.set('collapseDefault', true);
		const pipeline = new ElementPipeline(deps);
		const host = makeHost('ds-stam');

		// BASIC_STAM_YAML never declares collapse_default: — undeclared.
		await pipeline.run(staminaBarElement, BASIC_STAM_YAML, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const header = root.querySelector(':scope > .dse-collapse > .dse-collapse__header') as HTMLButtonElement;
		// RENDER honors the pref: seeded closed.
		expect(header.getAttribute('aria-expanded')).toBe('false');

		// BYTES stay untouched: the model materializes the same hard default
		// (`collapse_default: false`) it always has — serialize() never sees the
		// pref, only resolveCollapsePrefs (render-time only) does.
		const model = staminaBarElement.parse({ max_stamina: 20, current_stamina: 15, temp_stamina: 5 }, BASIC_STAM_YAML);
		expect(staminaBarSerialize(model)).toBe(
			['collapsible: true', 'collapse_default: false', 'max_stamina: 20', 'current_stamina: 15', 'temp_stamina: 5', 'height: 1', 'style: default'].join('\n'),
		);
	});

	test('AMENDMENT: a declared block ignores the pref (author wins, exactly today\'s behavior) — render AND bytes both reflect the declared value', async () => {
		const deps = makeDeps();
		await deps.prefs.set('collapseDefault', true); // global says "start closed"
		const pipeline = new ElementPipeline(deps);
		const host = makeHost('ds-stam');
		const yaml = `${BASIC_STAM_YAML}\ncollapse_default: false`; // block explicitly disagrees

		await pipeline.run(staminaBarElement, yaml, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		const header = root.querySelector(':scope > .dse-collapse > .dse-collapse__header') as HTMLButtonElement;
		// RENDER: the declared value wins over the pref — starts OPEN despite the
		// global pref saying closed.
		expect(header.getAttribute('aria-expanded')).toBe('true');

		// BYTES: unaffected either way (declared or not, the model always materializes
		// a concrete value) — confirms the declared branch is just as byte-stable as
		// the undeclared one.
		const model = staminaBarElement.parse(
			{ max_stamina: 20, current_stamina: 15, temp_stamina: 5, collapse_default: false },
			yaml,
		);
		expect(staminaBarSerialize(model)).toBe(
			['collapsible: true', 'collapse_default: false', 'max_stamina: 20', 'current_stamina: 15', 'temp_stamina: 5', 'height: 1', 'style: default'].join('\n'),
		);
	});
});
