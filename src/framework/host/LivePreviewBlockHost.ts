// F1 §3.4 / §9 — LivePreviewBlockHost: DEFERRED STUB.
//
// Live Preview implementation is explicitly out of F1 scope (spec §9 Non-goals: "F1
// only guarantees the seam (BlockHost, mode-blind views) so LP is a drop-in later
// effort. The 2024-08-18 reading-mode-only decision stands until that effort
// supersedes it."). This file exists only so the BlockHost seam is visibly two-sided
// from day one, and so the eventual CM6 work has a landing spot with the mapping
// already written down (§9 risk mitigation: "each with a known CM6 realization").
//
// Known CM6 realization of each BlockHost member:
//   - containerEl / mount     -> the ViewPlugin widget's own DOM node
//   - addChild (lifecycle)    -> the widget's destroy() hook
//   - getBlockInfo()          -> syntaxTree block ranges (language token + from/to
//                                positions resolved to line numbers)
//   - replaceSource()         -> a CM6 transaction (EditorView.dispatch) replacing the
//                                block body range
//   - blockKey()              -> derived from the same syntaxTree node identity used
//                                by getBlockInfo()
//
// Every member throws (rather than silently no-op'ing or returning inert defaults) so
// any accidental Live Preview wiring against this stub fails loudly during
// development instead of behaving like a broken, silently-read-only host. Do not
// implement against this file until the LP effort formally supersedes ADR
// 2024-08-18.
import type { Component } from 'obsidian';
import type { BlockHost, BlockInfo, RenderMode } from './BlockHost';

const NOT_IMPLEMENTED =
	'LivePreviewBlockHost is an unimplemented F1 stub (Live Preview is out of scope — ' +
	'see F1 element-framework-v2 spec §9 Non-goals). Do not construct it.';

export class LivePreviewBlockHost implements BlockHost {
	readonly mode: RenderMode = 'live-preview';

	constructor() {
		throw new Error(NOT_IMPLEMENTED);
	}

	get sourcePath(): string {
		throw new Error(NOT_IMPLEMENTED);
	}

	get containerEl(): HTMLElement {
		throw new Error(NOT_IMPLEMENTED);
	}

	get canPersist(): boolean {
		throw new Error(NOT_IMPLEMENTED);
	}

	addChild<T extends Component>(_child: T): T {
		throw new Error(NOT_IMPLEMENTED);
	}

	getBlockInfo(): BlockInfo | null {
		throw new Error(NOT_IMPLEMENTED);
	}

	async replaceSource(_newSource: string): Promise<boolean> {
		throw new Error(NOT_IMPLEMENTED);
	}

	blockKey(): string {
		throw new Error(NOT_IMPLEMENTED);
	}
}
