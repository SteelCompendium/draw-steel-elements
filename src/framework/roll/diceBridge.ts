// Plan 14 Task 2 (D5 §6) — the OPTIONAL Dice Roller bridge. DSE delegates ONLY
// the raw dice (per-die 1dN formulas so faces — and nat-19–20 — stay exact);
// tier/crit/edge-bane resolution always stays in resolveRoll. No import of the
// other plugin, no package.json entry: capability detection over app.plugins at
// call time, null on ANY failure (missing, disabled, shape drift, throw). The
// service treats a null/throwing bridge as "use native" — the bridge can never
// break rolling (§6.1).
import type { App } from 'obsidian';

/** Async per-die source the service marries to the sync engine via face replay. */
export interface DiceBridge {
	/** Roll `count` × 1d`sides`; resolves the individual faces. */
	rollDice(count: number, sides: number): Promise<number[]>;
}

const DICE_ROLLER_ID = 'obsidian-dice-roller';

/** Untyped shape of Obsidian's private plugin registry (accessed dynamically). */
interface PluginsShape {
	enabledPlugins?: Set<string>;
	plugins?: Record<string, { api?: { roll?: (formula: string) => unknown } } | undefined>;
}

/**
 * Capability-based detection (never version-based): the plugin must be enabled
 * AND expose `api.roll(formula)`. A future API shift degrades to null → native.
 */
export function detectDiceRoller(app: App): DiceBridge | null {
	try {
		const plugins = (app as unknown as { plugins?: PluginsShape }).plugins;
		if (!plugins?.enabledPlugins?.has(DICE_ROLLER_ID)) return null;
		const api = plugins.plugins?.[DICE_ROLLER_ID]?.api;
		if (!api || typeof api.roll !== 'function') return null;
		// `.bind()` types as `(...) => any` under this project's `lib` (es5) --
		// cast back to `api.roll`'s real signature once, rather than threading
		// `any` through every `roll(...)` call below.
		const roll = api.roll.bind(api) as (formula: string) => unknown;
		return {
			async rollDice(count: number, sides: number): Promise<number[]> {
				const faces: number[] = [];
				for (let i = 0; i < count; i++) {
					// One die per call: some Dice Roller results only expose a total, and
					// DSE needs the individual faces (natural / nat-19–20, §6.2).
					const raw = await roll(`1d${sides}`);
					const value =
						typeof raw === 'number'
							? raw
							: typeof (raw as { result?: unknown } | null)?.result === 'number'
								? (raw as { result: number }).result
								: NaN;
					const face = Math.trunc(value);
					if (!Number.isFinite(face) || face < 1 || face > sides) {
						throw new Error(`Dice Roller bridge returned an unusable value: ${String(raw)}`);
					}
					faces.push(face);
				}
				return faces;
			},
		};
	} catch {
		return null;
	}
}
