// SC-443 e2e driver: the element table of the insert commands and the shared round trip the specs run per element.
import { expect } from '@wdio/globals';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
	drawn,
	editorState,
	installCompendium,
	leaveBlock,
	openEditor,
	palette,
	savedText,
	scaffoldOf,
	spliced,
	toReading,
	type EditMode,
	type Pos,
} from './authoring';

export interface AuthoringElement {
	/** The element id: the command is `insert-<id>`. */
	id: string;
	/** `src/elements/<dir>/example.yaml`: the data the scaffold is built from. */
	dir: string;
	/** The first alias: the fence the scaffold opens. */
	alias: string;
	/** The element's name: the palette entry is `Insert Draw Steel: <name>`, the `/ds` row's title is `<name>`. */
	name: string;
	/** The `data-dse-element` of the drawn block. */
	root: string;
	/** Shipped with the experimental gate off? (SC-406 defers eight, SC-190 hides ds-hero.) */
	shipped: boolean;
}

export const ELEMENTS: AuthoringElement[] = [
	{ id: 'horizontal-rule', dir: 'horizontal-rule', alias: 'ds-hr', name: 'Horizontal rule', root: 'horizontal-rule', shipped: true },
	{ id: 'skills', dir: 'skills', alias: 'ds-skills', name: 'Skills', root: 'skills', shipped: true },
	{ id: 'stamina-bar', dir: 'stamina-bar', alias: 'ds-stam', name: 'Stamina bar', root: 'stamina-bar', shipped: true },
	{ id: 'negotiation', dir: 'negotiation', alias: 'ds-nt', name: 'Negotiation tracker', root: 'negotiation', shipped: true },
	{ id: 'initiative', dir: 'initiative', alias: 'ds-it', name: 'Initiative tracker', root: 'initiative', shipped: true },
	{ id: 'feature', dir: 'feature', alias: 'ds-ft', name: 'Feature', root: 'feature', shipped: true },
	{ id: 'featureblock', dir: 'featureblock', alias: 'ds-fb', name: 'Featureblock', root: 'featureblock', shipped: true },
	{ id: 'statblock', dir: 'statblock', alias: 'ds-sb', name: 'Statblock', root: 'statblock', shipped: true },
	{ id: 'counter', dir: 'counter', alias: 'ds-ct', name: 'Counter', root: 'counter', shipped: true },
	{ id: 'values-row', dir: 'values-row', alias: 'ds-vr', name: 'Values row', root: 'values-row', shipped: true },
	{ id: 'characteristics', dir: 'characteristics', alias: 'ds-char', name: 'Characteristics', root: 'characteristics', shipped: true },
	{ id: 'roll', dir: 'roll', alias: 'ds-roll', name: 'Roll', root: 'roll', shipped: false },
	{ id: 'scc', dir: 'scc', alias: 'ds-scc', name: 'SCC reference', root: 'scc', shipped: true },
	{ id: 'encounter', dir: 'encounter', alias: 'ds-encounter', name: 'Encounter builder', root: 'encounter', shipped: false },
	{ id: 'montage', dir: 'montage', alias: 'ds-montage', name: 'Montage Test tracker', root: 'montage', shipped: true },
	{ id: 'project', dir: 'project', alias: 'ds-project', name: 'Project / Downtime tracker', root: 'project', shipped: false },
	{ id: 'party', dir: 'party', alias: 'ds-party', name: 'Party tracker', root: 'party', shipped: false },
	{ id: 'conditions', dir: 'conditions', alias: 'ds-conditions', name: 'Conditions', root: 'conditions', shipped: false },
	{ id: 'heroic-resource', dir: 'resource', alias: 'ds-resource', name: 'Heroic resource', root: 'heroic-resource', shipped: false },
	{ id: 'surges', dir: 'surges', alias: 'ds-surges', name: 'Surges', root: 'surges', shipped: false },
	{ id: 'hero-tokens', dir: 'tokens', alias: 'ds-tokens', name: 'Hero Tokens', root: 'hero-tokens', shipped: false },
];
export const el = (id: string): AuthoringElement => {
	const found = ELEMENTS.find((e) => e.id === id);
	if (!found) throw new Error(`no authoring element ${id}`);
	return found;
};
/** The elements `/ds` and the palette offer: the thirteen shipped ones with the gate off, all twenty-one with it on (never ds-hero). */
export const advertised = (gateOn: boolean): AuthoringElement[] => ELEMENTS.filter((e) => gateOn || e.shipped);

export const NOTE_BEFORE = 'Intro line above\n\n\nOutro line below\n';
export const CURSOR: Pos = { line: 2, ch: 0 };

/**
 * One insert-command round trip for `id`, in `mode`: open a seeded note with the cursor on its empty third line, run the command through the
 * palette, then assert (a) the exact text inserted (the element's example.yaml in its fence), (b) where (the cursor's line and column: the note
 * is the original with the scaffold spliced in there, nothing else touched), (c) the cursor after (line 3, column 0 = the first body line),
 * (d) every other byte of the note (the whole file equals the original minus nothing: the splice is all that changed), and the screen: the
 * block draws as a DSE element and not an error card, in Live Preview once the cursor leaves it and in Reading view for a Source-mode note.
 */
export async function commandTrip(id: string, mode: EditMode): Promise<void> {
	const e = el(id);
	const rel = `Authoring/${id}-${mode}.md`;
	if (id === 'scc') await installCompendium(); // the scaffold's example code (a kit) resolves only with its entry present
	await openEditor(rel, NOTE_BEFORE, mode, CURSOR);
	await palette(`insert-${id}`, `Insert Draw Steel: ${e.name}`);
	const inserted = scaffoldOf(e.dir, e.alias);
	const expected = spliced(NOTE_BEFORE, CURSOR, undefined, inserted);
	expect(await savedText(rel)).toBe(expected);
	const state = await editorState();
	expect(state.value).toBe(expected);
	expect(state.cursor).toEqual({ line: CURSOR.line + 1, ch: 0 });
	if (mode === 'live-preview') {
		await leaveBlock(1);
		expect(await drawn('live-preview')).toEqual({ roots: [e.root], errors: [] });
	} else {
		await toReading(rel);
		expect(await drawn('reading')).toEqual({ roots: [e.root], errors: [] });
	}
}

const goldenPath = (file: string): string => path.resolve(__dirname, '..', 'vaults', 'golden', file);
const bodyOf = (block: string): string => block.split('\n').slice(1, -2).join('\n');

/**
 * A golden snapshot: the plugin's own YAML for a fixture entry as REAL Obsidian writes it (`e2e/vaults/golden/snapshot-<name>.txt`, captured from a
 * run and reviewed), byte for byte. Obsidian's `stringifyYaml` wraps and indents differently from the jest mock, so a second file,
 * `jest-snapshot-<name>.txt` (written by the jest harness from the same fixture), is the independent check on the DATA: `sameDataAsJest`.
 */
export const goldenSnapshot = (name: string): string => fs.readFileSync(goldenPath(`snapshot-${name}.txt`), 'utf8');
export const sameDataAsJest = (name: string, block: string): boolean => {
	const jest = fs.readFileSync(goldenPath(`jest-snapshot-${name}.txt`), 'utf8');
	return JSON.stringify(yaml.load(bodyOf(block))) === JSON.stringify(yaml.load(bodyOf(jest)));
};
