// SC-343 (spec SC-340 §8 / §13 Q2): a write that cannot be placed is dropped with a
// visible Obsidian Notice — at most one per note per 5 s — plus a console.warn every time.
import {
	DROPPED_WRITE_NOTICE_INTERVAL_MS,
	droppedWriteMessage,
	notifyDroppedWrite,
	notifyUnsavableWrite,
	resetDroppedWriteNotices,
	unsavableWriteMessage,
} from '../../../src/framework/host/droppedWriteNotice';
import { Notice } from '../../mocks/obsidian';

describe('SC-343: dropped-write Notice', () => {
	let warn: jest.SpyInstance;
	beforeEach(() => {
		resetDroppedWriteNotices();
		Notice.notices.length = 0;
		warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
	});
	afterEach(() => warn.mockRestore());

	test('the message is the approved text, verbatim, naming the note', () => {
		expect(droppedWriteMessage('Session 3')).toBe(
			'Draw Steel Elements: a change to a block in Session 3 was not saved — the block changed on disk first.',
		);
	});

	test('first miss on a note shows the Notice and warns', () => {
		expect(notifyDroppedWrite('Notes/Session 3.md', 'Session 3', 1_000)).toBe(true);
		expect(Notice.notices).toEqual([droppedWriteMessage('Session 3')]);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(String(warn.mock.calls[0][0])).toContain('Notes/Session 3.md');
	});

	test('a second miss on the SAME note inside 5 s shows no second Notice but still warns', () => {
		notifyDroppedWrite('A.md', 'A', 1_000);
		expect(notifyDroppedWrite('A.md', 'A', 1_000 + DROPPED_WRITE_NOTICE_INTERVAL_MS - 1)).toBe(false);
		expect(Notice.notices).toHaveLength(1);
		expect(warn).toHaveBeenCalledTimes(2);
	});

	test('a miss on the same note at exactly 5 s later shows a new Notice', () => {
		notifyDroppedWrite('A.md', 'A', 1_000);
		expect(notifyDroppedWrite('A.md', 'A', 1_000 + DROPPED_WRITE_NOTICE_INTERVAL_MS)).toBe(true);
		expect(Notice.notices).toHaveLength(2);
	});

	test('a miss on a DIFFERENT note shows its own Notice immediately', () => {
		notifyDroppedWrite('A.md', 'A', 1_000);
		expect(notifyDroppedWrite('B.md', 'B', 1_001)).toBe(true);
		expect(Notice.notices).toEqual([droppedWriteMessage('A'), droppedWriteMessage('B')]);
	});
});

// SC-455: the second reason a write is lost - the block sits somewhere DSE cannot address.
describe('SC-455: unsavable-write Notice', () => {
	let warn: jest.SpyInstance;
	beforeEach(() => {
		resetDroppedWriteNotices();
		Notice.notices.length = 0;
		warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
	});
	afterEach(() => warn.mockRestore());

	test('says plainly that the change was not saved, names the note and the list case', () => {
		expect(unsavableWriteMessage('Session 3')).toBe(
			"Draw Steel Elements: a change to a block in Session 3 was not saved — the plugin can't tell where this block sits in the note (blocks inside lists can't be edited yet).",
		);
	});

	test('shows once per note per 5 s, always warns, and keeps its own clock apart from the dropped-write one', () => {
		expect(notifyUnsavableWrite('A.md', 'A', 1_000)).toBe(true);
		expect(notifyUnsavableWrite('A.md', 'A', 1_000 + DROPPED_WRITE_NOTICE_INTERVAL_MS - 1)).toBe(false);
		expect(notifyUnsavableWrite('A.md', 'A', 1_000 + DROPPED_WRITE_NOTICE_INTERVAL_MS)).toBe(true);
		// a dropped-write Notice moments after an unsavable one is a different message and still shows
		expect(notifyDroppedWrite('A.md', 'A', 1_000 + DROPPED_WRITE_NOTICE_INTERVAL_MS + 1)).toBe(true);
		expect(Notice.notices).toEqual([unsavableWriteMessage('A'), unsavableWriteMessage('A'), droppedWriteMessage('A')]);
		expect(warn).toHaveBeenCalledTimes(4);
	});
});
