// SC-436 e2e driver: helpers for the ConditionsModal, composed from `dse` (the way driver/pool.ts is for the minion pool
// modal). Per-test setup lives here, not in a `beforeEach`. The modal is opened from the initiative tracker's
// "Add Condition" button, on a hero row (the first button) or the selected creature's detail row (the second).
import { dse } from './dse';

export const TRACKER = 'Initiative/tracker.md'; // hero Alice Alpha, three Ogres, no conditions
export const CONDITIONS = 'Initiative/conditions.md'; // hero: bleeding, dazed (eot, red, glow), hexed (custom), slowed (legacy effect text); Ogre #1: grabbed, prone (save ends)
export const TWO = 'Initiative/two-trackers.md'; // two trackers: Alice Alpha, then Bob Beta (grabbed, hexed to end of encounter)
export const INIT = 'ds-initiative';

type Scope = ReturnType<typeof dse.block>;
type Modal = Awaited<ReturnType<typeof dse.modal>>;

/** The tracker row whose "Add Condition" button opens the modal: the hero's, or the selected creature's detail row. */
export type Row = 'hero' | 'creature';
const ROW_NTH: Record<Row, number> = { hero: 0, creature: 1 };

/** Click the "Add Condition" button of `row` in the `block`-th tracker of the open note and wait for the window. */
export async function openFrom(root: Scope, row: Row = 'hero'): Promise<Modal> {
	await dse.click(root.control('init.cond.add', { nth: ROW_NTH[row] }));
	return dse.modal('conditions');
}

/** Open `note` in Reading view and open the Conditions window from `row`'s button (`block` picks the n-th tracker). */
export async function openConditionsModal(note: string, row: Row = 'hero', block = 0): Promise<{ root: Scope; modal: Modal }> {
	await dse.openNote(note);
	const root = dse.block(INIT, block);
	return { root, modal: await openFrom(root, row) };
}

/** Open the Add dropdown, type `text` and press Enter: the first match is added (a pick keeps the dropdown open). */
export async function addByKeyboard(modal: Modal, text: string): Promise<void> {
	await dse.click(modal.control('cond.add'));
	await dse.type(modal.control('cond.input'), text);
	await dse.press('Enter', modal.control('cond.input'));
}

export interface ModalRow {
	name: string;
	custom: boolean;
	badges: string[];
	editorOpen: boolean;
}

/** The active-condition rows the open window shows, top to bottom. A page-side read of the repeated row nodes. */
export const modalRows = (): Promise<ModalRow[]> =>
	dse.page<ModalRow[]>(`Array.from(document.querySelectorAll('.modal-container .dse-condal__row')).map((r) => ({
		name: r.querySelector('.dse-condal__name').textContent,
		custom: !!r.querySelector('.dse-condal__tag'),
		badges: Array.from(r.querySelectorAll('.dse-condal__dur')).map((b) => b.textContent),
		editorOpen: r.classList.contains('dse-condal__row--open'),
	}))`);

/** The names of the rows, top to bottom ("Bleeding", "Dazed"). */
export const modalNames = async (): Promise<string[]> => (await modalRows()).map((r) => r.name);

/** The dropdown's options, top to bottom, and which one is active. */
export const menuOptions = (): Promise<{ names: string[]; active: number }> =>
	dse.page<{ names: string[]; active: number }>(`(() => {
		const items = Array.from(document.querySelectorAll('.modal-container [data-dse-control="cond.option"]'));
		return { names: items.map((i) => i.textContent), active: items.findIndex((i) => i.getAttribute('aria-selected') === 'true') };
	})()`);

/** The pressed state of every option in the editor's group (`Duration`, `Color`, `Effect`, `Condition icon`), by aria-label. */
export const pressedIn = (group: string): Promise<string[]> =>
	dse.page<string[]>(`Array.from(document.querySelectorAll('.modal-container [role="group"][aria-label="${group}"] [aria-pressed="true"]')).map((b) => b.getAttribute('aria-label'))`);

/** The condition icons a tracker row shows (their "Remove condition: X" names), for the n-th "Add Condition" row (0 = hero, 1 = creature). Reading view only. */
export const trackerIcons = (row: Row, block = 0): Promise<string[]> =>
	dse.page<string[]>(`(() => {
		const root = document.querySelectorAll('.markdown-reading-view [data-dse-element="initiative"]')[${block}];
		const rows = Array.from(root.querySelectorAll('.dse-init__conditions'));
		return Array.from(rows[${ROW_NTH[row]}].querySelectorAll('.dse-cond')).map((i) => i.getAttribute('aria-label').replace('Remove condition: ', ''));
	})()`);

/** The icon picker's choices, top to bottom, by aria-label ("Use default condition icon", "Icon: flame", ...). */
export const iconChoices = (): Promise<string[]> =>
	dse.page<string[]>(`Array.from(document.querySelectorAll('.modal-container [data-dse-control="cond.icon"]')).map((b) => b.getAttribute('aria-label'))`);

/** What holds focus: its control id and aria-label ("Customize Hexed", "Save Ends", "Icon: flame"). */
export const focusedOption = (): Promise<{ ctl: string | null; label: string | null }> =>
	dse.page(`({ ctl: document.activeElement?.getAttribute('data-dse-control') ?? null, label: document.activeElement?.getAttribute('aria-label') ?? null })`);

/** One condition of the hero (or of Ogre #1, `creature`) as the note holds it: the parsed YAML entry at `index`. */
export async function noteCondition(note: string, row: Row, index: number): Promise<Record<string, unknown>> {
	const block = (await dse.expectNoteBlock(note, INIT).value()) as {
		heroes: Array<{ conditions?: Array<Record<string, unknown>> }>;
		enemy_groups: Array<{ creatures: Array<{ instances: Array<{ conditions?: Array<Record<string, unknown>> }> }> }>;
	};
	const list = row === 'hero' ? block.heroes[0].conditions : block.enemy_groups[0].creatures[0].instances[0].conditions;
	return list![index];
}
