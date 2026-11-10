// SC-437: an action that changes nothing writes nothing (the SC-340 rule). Initiative/tracker.md: Alice Alpha, three Ogres, Malice 3.
import { dse } from '../../driver/dse';

const NOTE = 'Initiative/tracker.md';
const INIT = 'ds-initiative';

describe('initiative: actions that change nothing', () => {
	it('[INIT-NOOP-E01] clicking the roster cell that is already selected writes nothing', async () => {
		await dse.openNote(NOTE);
		const root = dse.block(INIT);
		// the first click records the selection (a real change: the key was not in the note)
		await dse.waitForWrite(NOTE, () => dse.click(root.control('init.cell.stamina', { nth: 0 })));
		await dse.expectNoWrite(NOTE, () => dse.click(root.control('init.cell.stamina', { nth: 0 })));
	});

	it('[INIT-NOOP-E02] Reset turns on a tracker with no turn marked writes nothing', async () => {
		await dse.openNote(NOTE);
		const root = dse.block(INIT);
		await dse.hover(root.root);
		// The first press rewrites the fixture's hand-formatted YAML in the tracker's own (the quotes go): that is a change.
		await dse.waitForWrite(NOTE, () => dse.click(root.control('init.reset-turns')));
		await dse.hover(root.control('init.round.advance')); // the rebuild hid the panel; the pointer must move over the tracker again
		await dse.hover(root.root);
		await dse.expectNoWrite(NOTE, () => dse.click(root.control('init.reset-turns')));
	});
});
