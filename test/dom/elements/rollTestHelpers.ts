// Plan 14 Task 5 (D5) — shared roll-test helpers, extracted VERBATIM from
// feature-roll.test.ts (Task 4) so roll.test.ts and feature-roll.test.ts drive the
// same conventions: a seeded RollService stub (replays `faces` afresh on every
// roll()), real-service pipeline deps, and the minimal BlockHost.
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { DSE_PREF_DESCRIPTORS } from '../../../src/prefs/catalog';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { resolveRoll } from '../../../src/framework/roll/engine';
import type { RollService } from '../../../src/framework/roll/service';
import type { DiceSource, RollInput } from '../../../src/framework/roll/types';
import type { BlockHost } from '../../../src/framework/host/BlockHost';
import { migrateSettings } from '@model/Settings';
import { App, Component } from '../../mocks/obsidian';
import type { Plugin } from 'obsidian';

// ---- seeded RollService stub: replays `faces` afresh on every roll() ----
export function stubService(faces: number[]): RollService {
	const seeded = (): DiceSource => {
		let i = 0;
		return { rollDie: () => faces[i++] ?? 1 };
	};
	return {
		resolve: (input: RollInput, dice?: DiceSource) => resolveRoll(input, dice ?? seeded()),
		roll: async (input: RollInput) => resolveRoll(input, seeded()),
		dice: seeded(),
		delegate: 'native',
	};
}

/** Real-service ElementPipelineDeps (the dom-test makeDeps convention). */
export function makeDeps() {
	const app = new App() as never;
	const plugin = new Component() as unknown as Plugin;
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	prefs.describe(DSE_PREF_DESCRIPTORS);
	const settings = migrateSettings(undefined);
	const deps: ElementPipelineDeps = {
		app,
		plugin,
		settings,
		theme: createThemeService(prefs, plugin),
		prefs,
		refs: createReferenceService(app, settings),
		validation: createValidationService(),
		session: createSessionStore(),
		roll: stubService([5, 6]),
	};
	return { deps, prefs };
}

/** Minimal BlockHost over `containerEl`. `blockKey` defaults to Task 4's constant. */
export function makeHost(containerEl: HTMLElement, owner: any, blockKey = 'test-block'): BlockHost {
	return {
		mode: 'reading',
		sourcePath: '',
		containerEl,
		canPersist: true,
		addChild: (child) => { owner.addChild(child); return child; },
		getBlockInfo: () => null,
		replaceSource: async () => false,
		blockKey: () => blockKey,
	};
}
